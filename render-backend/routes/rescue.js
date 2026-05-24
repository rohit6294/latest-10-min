const express = require('express')
const crypto = require('crypto')
const { admin, db, FieldValue } = require('../lib/firebase')
const {
  findAndNotifyDrivers,
  scheduleDriverExpansion,
  findAndNotifyHospitals,
  scheduleHospitalExpansion,
} = require('../lib/matching')

const router = express.Router()

// Bigger limit on this router for base64 voice notes (~400 KB raw audio).
router.use(express.json({ limit: '1mb' }))

router.post('/match-driver', async (req, res) => {
  try {
    const { requestId } = req.body || {}
    if (!requestId) return res.status(400).json({ error: 'requestId required' })

    const snap = await db.collection('rescue_requests').doc(requestId).get()
    if (!snap.exists) return res.status(404).json({ error: 'request not found' })

    const request = snap.data()
    if (request.status && request.status !== 'pending_driver') {
      return res.json({ skipped: true, reason: 'not pending_driver' })
    }
    const loc = request.patientLocation
    if (!loc) return res.status(400).json({ error: 'request has no patientLocation' })

    const startRadius = Number(request.currentDriverSearchRadius) || 1
    const result = await findAndNotifyDrivers({
      requestId,
      lat: loc.latitude,
      lng: loc.longitude,
      searchRadius: startRadius,
      alreadyNotified: request.notifiedDriverIds || [],
    })

    scheduleDriverExpansion(requestId, startRadius)

    res.json({ ok: true, notified: result.notified, radiusKm: startRadius })
  } catch (e) {
    console.error('match-driver error:', e)
    res.status(500).json({ error: e.message })
  }
})

router.post('/match-hospital', async (req, res) => {
  try {
    const { requestId } = req.body || {}
    if (!requestId) return res.status(400).json({ error: 'requestId required' })

    const snap = await db.collection('rescue_requests').doc(requestId).get()
    if (!snap.exists) return res.status(404).json({ error: 'request not found' })

    const request = snap.data()
    if (request.assignedHospitalId) {
      return res.json({ skipped: true, reason: 'hospital already assigned' })
    }
    const loc = request.patientLocation
    if (!loc) return res.status(400).json({ error: 'request has no patientLocation' })

    const startRadius = Number(request.currentHospitalSearchRadius) || 1
    const result = await findAndNotifyHospitals({
      requestId,
      lat: loc.latitude,
      lng: loc.longitude,
      searchRadius: startRadius,
      alreadyNotified: request.notifiedHospitalIds || [],
    })

    scheduleHospitalExpansion(requestId, startRadius)

    res.json({ ok: true, notified: result.notified, radiusKm: startRadius })
  } catch (e) {
    console.error('match-hospital error:', e)
    res.status(500).json({ error: e.message })
  }
})

// ─── Rating — patient rates the driver after a completed ride ───────────────
//
// Body: { requestId, rating (1-5), comment? }
// Idempotent on the request: once patientRating is set, rejects re-submit.
// Recomputes running mean on the driver doc inside a transaction so concurrent
// rides cannot corrupt the average.
router.post('/rate', async (req, res) => {
  try {
    const { requestId, rating, comment } = req.body || {}
    const r = Number(rating)
    if (!requestId) return res.status(400).json({ error: 'requestId required' })
    if (!Number.isFinite(r) || r < 1 || r > 5) {
      return res.status(400).json({ error: 'rating must be 1-5' })
    }
    const requestRef = db.collection('rescue_requests').doc(requestId)

    let driverId = null
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(requestRef)
      if (!snap.exists) {
        const err = new Error('request not found')
        err.status = 404
        throw err
      }
      const data = snap.data()
      if (data.patientRating) {
        const err = new Error('Already rated')
        err.status = 409
        throw err
      }
      if (data.status !== 'completed') {
        const err = new Error('Request is not completed yet')
        err.status = 400
        throw err
      }
      driverId = data.assignedDriverId
      tx.update(requestRef, {
        patientRating: r,
        patientRatingComment: (comment || '').slice(0, 500),
        patientRatedAt: FieldValue.serverTimestamp(),
      })

      if (driverId) {
        const driverRef = db.collection('drivers').doc(driverId)
        const driverSnap = await tx.get(driverRef)
        const dd = driverSnap.data() || {}
        const prevTotal = Number(dd.totalRatings) || 0
        const prevAvg = Number(dd.rating) || 0
        const newTotal = prevTotal + 1
        const newAvg = (prevAvg * prevTotal + r) / newTotal
        // completedRides is incremented inside Flutter's completeRide() now,
        // so it does not depend on the patient remembering to rate. We only
        // touch the rating fields here.
        tx.set(
          driverRef,
          {
            rating: Number(newAvg.toFixed(2)),
            totalRatings: newTotal,
          },
          { merge: true }
        )
      }
    })

    res.json({ ok: true, driverId })
  } catch (e) {
    console.error('rate error:', e)
    res.status(e.status || 500).json({ error: e.message })
  }
})

// ─── Patient instructions — text or voice — appended while help is on the way
//
// Body: { requestId, type: 'text'|'audio', text?, audioBase64?, mimeType?, durationSec? }
// Audio is uploaded to Firebase Storage and only the public download URL is
// stored in Firestore (keeps subcollection docs small). Falls back to inline
// base64 storage if Storage isn't enabled on the project, so the feature
// works on a vanilla Spark plan with zero extra setup.
router.post('/instruction', async (req, res) => {
  try {
    const {
      requestId,
      type,
      text,
      audioBase64,
      mimeType,
      durationSec,
    } = req.body || {}
    if (!requestId) return res.status(400).json({ error: 'requestId required' })
    if (type !== 'text' && type !== 'audio') {
      return res.status(400).json({ error: 'type must be text or audio' })
    }

    const requestRef = db.collection('rescue_requests').doc(requestId)
    const reqSnap = await requestRef.get()
    if (!reqSnap.exists) return res.status(404).json({ error: 'request not found' })
    const reqData = reqSnap.data()
    if (['completed', 'cancelled'].includes(reqData.status)) {
      return res.status(400).json({ error: 'request is closed' })
    }

    const instructionRef = requestRef.collection('instructions').doc()
    const payload = {
      id: instructionRef.id,
      type,
      createdAt: FieldValue.serverTimestamp(),
    }

    if (type === 'text') {
      const t = String(text || '').trim()
      if (!t) return res.status(400).json({ error: 'text required' })
      payload.text = t.slice(0, 500)
    } else {
      if (!audioBase64) {
        return res.status(400).json({ error: 'audioBase64 required' })
      }
      // base64 without data URL prefix
      const cleanB64 = String(audioBase64).replace(/^data:[^;]+;base64,/, '')
      const buf = Buffer.from(cleanB64, 'base64')
      if (buf.length < 200) {
        return res.status(400).json({ error: 'audio too short' })
      }
      const mt = String(mimeType || 'audio/webm')
      const ext = mt.includes('mp4')
        ? 'm4a'
        : mt.includes('ogg')
        ? 'ogg'
        : mt.includes('mpeg')
        ? 'mp3'
        : 'webm'
      const fileName = `instructions/${requestId}/${instructionRef.id}.${ext}`

      let storedAudioUrl = null
      try {
        const bucket = admin.storage().bucket()
        const file = bucket.file(fileName)
        await file.save(buf, {
          contentType: mt,
          metadata: { cacheControl: 'public, max-age=86400' },
          public: true,
          resumable: false,
        })
        await file.makePublic().catch(() => {})
        storedAudioUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`
      } catch (storageErr) {
        // Storage not enabled or upload failed — fall back to inline base64.
        console.warn(
          'Storage upload failed; storing voice note inline in Firestore:',
          storageErr.message
        )
      }

      payload.mimeType = mt
      payload.durationSec = Math.max(
        0,
        Math.min(180, Number(durationSec) || 0)
      )
      if (storedAudioUrl) {
        payload.audioUrl = storedAudioUrl
      } else {
        if (buf.length > 700 * 1024) {
          return res.status(413).json({
            error:
              'Voice note too large for inline storage. Enable Firebase Storage to send longer clips.',
          })
        }
        payload.audioBase64 = cleanB64
      }
    }

    await instructionRef.set(payload)
    await requestRef.set(
      {
        lastInstructionAt: FieldValue.serverTimestamp(),
        instructionCount: FieldValue.increment(1),
      },
      { merge: true }
    )

    // Notify the driver via FCM if assigned, so they don't miss a new note.
    if (reqData.assignedDriverId) {
      try {
        const driverSnap = await db
          .collection('drivers')
          .doc(reqData.assignedDriverId)
          .get()
        const token = driverSnap.data()?.fcmToken
        if (token) {
          await admin.messaging().send({
            token,
            notification: {
              title: 'New patient instruction',
              body:
                type === 'text'
                  ? payload.text.slice(0, 80)
                  : '🎤 Voice note from patient',
            },
            data: {
              type: 'patient_instruction',
              requestId,
            },
          })
        }
      } catch (notifyErr) {
        console.warn('instruction FCM notify failed:', notifyErr.message)
      }
    }

    res.json({ ok: true, instructionId: instructionRef.id })
  } catch (e) {
    console.error('instruction error:', e)
    res.status(500).json({ error: e.message })
  }
})

// Patient may delete an instruction within 60 seconds of sending it.
// Tolerates typos / accidental sends. After the grace window, the note is
// permanent (since the driver / hospital may already have acted on it).
//
// Body: { requestId, instructionId }
router.post('/instruction/delete', async (req, res) => {
  try {
    const { requestId, instructionId } = req.body || {}
    if (!requestId || !instructionId) {
      return res
        .status(400)
        .json({ error: 'requestId and instructionId required' })
    }
    const ref = db
      .collection('rescue_requests')
      .doc(requestId)
      .collection('instructions')
      .doc(instructionId)
    const snap = await ref.get()
    if (!snap.exists) {
      return res.status(404).json({ error: 'instruction not found' })
    }
    const data = snap.data()
    const createdAtMs = data.createdAt?.toMillis?.() ?? 0
    if (!createdAtMs) {
      return res
        .status(400)
        .json({ error: 'instruction has no createdAt timestamp' })
    }
    const ageMs = Date.now() - createdAtMs
    const GRACE_MS = 60 * 1000
    if (ageMs > GRACE_MS) {
      return res
        .status(403)
        .json({ error: 'too late', ageMs, graceMs: GRACE_MS })
    }
    await ref.delete()
    await db
      .collection('rescue_requests')
      .doc(requestId)
      .set(
        {
          lastInstructionAt: FieldValue.serverTimestamp(),
          instructionCount: FieldValue.increment(-1),
        },
        { merge: true }
      )
    return res.json({ ok: true })
  } catch (e) {
    console.error('instruction delete error:', e)
    return res.status(500).json({ error: e.message })
  }
})

// Silence the unused crypto import (we'll use it for signed URLs later).
void crypto

module.exports = router
