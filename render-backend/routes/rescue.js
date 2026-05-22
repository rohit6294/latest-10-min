const express = require('express')
const { db } = require('../lib/firebase')
const {
  findAndNotifyDrivers,
  scheduleDriverExpansion,
  findAndNotifyHospitals,
  scheduleHospitalExpansion,
} = require('../lib/matching')

const router = express.Router()

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

module.exports = router
