const express = require('express')
const { db, FieldValue, GeoPoint } = require('../lib/firebase')
const {
  sendText: rawSendText,
  sendLocationRequest: rawSendLocationRequest,
  sendInteractiveButtons: rawSendInteractiveButtons,
} = require('../lib/gupshup')
const { logAudit } = require('../lib/whatsappAudit')
const { requireAuth } = require('../lib/authGuard')
const {
  findAndNotifyDrivers,
  scheduleDriverExpansion,
} = require('../lib/matching')
const {
  getSession,
  setSession,
  clearSession,
} = require('../lib/whatsappSession')

// Audit-wrapped outbound senders. Every outbound message is mirrored to the
// whatsapp_audit Firestore collection for compliance + debugging.
async function sendText(destination, text, auditMeta = {}) {
  await logAudit({
    direction: 'out',
    phone: destination,
    summary: text,
    payload: { type: 'text', text },
    ...auditMeta,
  })
  return rawSendText(destination, text)
}

async function sendLocationRequest(destination, bodyText, auditMeta = {}) {
  await logAudit({
    direction: 'out',
    phone: destination,
    summary: `[location-request] ${bodyText}`,
    payload: { type: 'location_request_message', body: bodyText },
    ...auditMeta,
  })
  return rawSendLocationRequest(destination, bodyText)
}

async function sendInteractiveButtons(destination, bodyText, buttons, auditMeta = {}) {
  await logAudit({
    direction: 'out',
    phone: destination,
    summary: `[buttons] ${bodyText}`,
    payload: { type: 'quick_reply', body: bodyText, buttons },
    ...auditMeta,
  })
  return rawSendInteractiveButtons(destination, bodyText, buttons)
}

const router = express.Router()

// Ambulance catalog (must match SosPage.jsx TYPES)
// A = ICU, B = Advanced, C = Normal
// Menu numbers are 1=Normal, 2=Advanced, 3=ICU.
const TYPES = {
  C: { code: 'C', label: 'Normal Ambulance', desc: 'Basic transport & first aid' },
  B: {
    code: 'B',
    label: 'Advanced Ambulance',
    desc: 'Oxygen, defibrillator, monitoring',
  },
  A: {
    code: 'A',
    label: 'ICU Ambulance',
    desc: 'Ventilator, cardiac monitor, life support',
  },
}
const MENU_TO_TYPE = { '1': 'C', '2': 'B', '3': 'A' }

const EMERGENCY_KEYWORDS = [
  'sos',
  'emergency',
  'ambulance',
  'accident',
  'help',
  'urgent',
  'bachao',
  'hi',
  'hello',
  'hey',
  'start',
  'menu',
]

const MENU_TEXT =
  '🚨 *Suraksha Kavach - Emergency Ambulance*\n\n' +
  'What type of ambulance do you need?\n\n' +
  '1️⃣  *Normal*  - basic transport & first aid\n' +
  '2️⃣  *Advanced* - oxygen, defibrillator\n' +
  '3️⃣  *ICU* - ventilator, life support\n\n' +
  'Reply with *1*, *2* or *3*.'

const LOCATION_PROMPT_PREFIX =
  '📍 *Now share your live location* so we can dispatch the nearest ambulance.\n\n' +
  'Tap 📎 -> Location -> *Send your current location*'

const HELPLINE = '+91 78660 67136'
const DEBUG_COLLECTION = 'whatsapp_webhook_events'
const PUBLIC_APP_URL = (
  process.env.PUBLIC_APP_URL ||
  'https://min-rescue.web.app'
).replace(/\/+$/, '')
const WHATSAPP_EVENT_TYPES = new Set([
  'driver_assigned',
  'ambulance_arrived',
  'hospital_selected',
  'hospital_arrived',
  'mission_completed',
])

function cleanForFirestore(value) {
  if (value === undefined || value === null) return null
  if (Array.isArray(value)) return value.map(cleanForFirestore)
  if (
    typeof value?.toDate === 'function' ||
    typeof value?.toProto === 'function' ||
    typeof value?.includeInDocumentTransform === 'function'
  ) {
    return value
  }
  if (typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = cleanForFirestore(v)
    }
    return out
  }
  return value
}

function sessionSummary(session) {
  if (!session) return null
  return {
    state: session.state || null,
    selectedAmbulanceType: session.selectedAmbulanceType || null,
    lastRequestId: session.lastRequestId || null,
  }
}

async function updateDebugTrace(ref, patch) {
  try {
    await ref.set(cleanForFirestore(patch), { merge: true })
  } catch (e) {
    console.error('whatsapp debug trace write failed:', e)
  }
}

function ackForType(typeCode) {
  const type = TYPES[typeCode]
  return `✅ *${type.label}* selected.\n\n${LOCATION_PROMPT_PREFIX}`
}

function normalizePhoneForWhatsApp(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 10) return `91${digits}`
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`
  return digits
}

function trackUrl(requestId) {
  return `${PUBLIC_APP_URL}/track/${encodeURIComponent(requestId)}`
}

function ambulanceTypeLabel(typeCode) {
  return (TYPES[typeCode] || TYPES.C).label
}

async function loadRequestContext(requestId) {
  const requestRef = db.collection('rescue_requests').doc(requestId)
  const requestSnap = await requestRef.get()
  if (!requestSnap.exists) {
    const err = new Error('request not found')
    err.status = 404
    throw err
  }

  const request = requestSnap.data()
  const [driverSnap, hospitalSnap] = await Promise.all([
    request.assignedDriverId
      ? db.collection('drivers').doc(request.assignedDriverId).get()
      : null,
    request.assignedHospitalId
      ? db.collection('hospitals').doc(request.assignedHospitalId).get()
      : null,
  ])

  return {
    requestRef,
    request,
    driver: driverSnap?.exists ? driverSnap.data() : null,
    hospital: hospitalSnap?.exists ? hospitalSnap.data() : null,
  }
}

function assertCanSendRequestEvent({ eventType, callerUid, request }) {
  const driverEvents = new Set([
    'driver_assigned',
    'ambulance_arrived',
    'hospital_selected',
    'hospital_arrived',
  ])

  if (driverEvents.has(eventType)) {
    if (!request.assignedDriverId || request.assignedDriverId !== callerUid) {
      const err = new Error('Only the assigned driver can send this update.')
      err.status = 403
      throw err
    }
    return
  }

  if (eventType === 'mission_completed') {
    if (!request.assignedHospitalId || request.assignedHospitalId !== callerUid) {
      const err = new Error('Only the assigned hospital can send this update.')
      err.status = 403
      throw err
    }
  }
}

function buildRequestEventMessages({
  eventType,
  requestId,
  request,
  driver,
  hospital,
}) {
  const driverName = driver?.name || 'the ambulance driver'
  const driverPhone = driver?.phone
    ? `\n📞 *Call driver:* ${driver.phone}`
    : ''
  const vehicleNumber = driver?.vehicleNumber
    ? `\nVehicle: ${driver.vehicleNumber}`
    : ''
  const hospitalName =
    hospital?.name || request.hospitalName || request.preferredHospitalName || 'the selected hospital'
  const hospitalAddress = hospital?.address || request.hospitalAddress || request.preferredHospitalAddress || ''
  const hospitalAddressLine = hospitalAddress ? `\nAddress: ${hospitalAddress}` : ''
  const trackLine = `\nTrack live: ${trackUrl(requestId)}`
  const bedLabel = ambulanceTypeLabel(request.ambulanceType)

  switch (eventType) {
    case 'driver_assigned': {
      // Body is shorter than the text fallback because button labels carry the
      // CTAs. Buttons live in their own message bubble below the body.
      const body =
        `🚑 Driver accepted your emergency request.\n\n` +
        `Driver: ${driverName}${driverPhone}${vehicleNumber}${trackLine}\n\n` +
        `Please keep your phone reachable.\n📞 Helpline: ${HELPLINE}`
      return [
        {
          kind: 'buttons',
          body,
          buttons: [
            { id: `CALL_DRIVER:${requestId}`, title: 'Call driver' },
            { id: `ADD_NOTE:${requestId}`, title: 'Add note' },
            { id: `CANCEL_REQUEST:${requestId}`, title: 'Cancel' },
          ],
        },
      ]
    }
    case 'ambulance_arrived':
      return [
        {
          kind: 'text',
          text: `📍 Your ambulance has arrived at your location.\n\nDriver: ${driverName}${driverPhone}${trackLine}\n\nPlease meet the crew or answer their call.\n📞 Helpline: ${HELPLINE}`,
        },
      ]
    case 'hospital_selected':
      return [
        {
          kind: 'text',
          text: `🏥 Hospital selected for your transfer.\n\nHospital: ${hospitalName}${hospitalAddressLine}\nBed requested: ${bedLabel}${trackLine}\n\nThe ambulance is now proceeding to the hospital.\n📞 Helpline: ${HELPLINE}`,
        },
      ]
    case 'hospital_arrived':
      return [
        {
          kind: 'text',
          text: `🏥 The ambulance has arrived at ${hospitalName}.\n\nThe hospital team is receiving the patient now.${trackLine}\n📞 Helpline: ${HELPLINE}`,
        },
      ]
    case 'mission_completed': {
      const rateLink = `${trackUrl(requestId)}?rate=1`
      return [
        {
          kind: 'text',
          text:
            `✅ Mission complete.\n\n` +
            `The patient has been handed over at ${hospitalName}.\n` +
            `Thank you for using Suraksha Kavach.\n\n` +
            `⭐ *Rate your driver:* ${rateLink}\n` +
            `📞 Helpline: ${HELPLINE}`,
        },
      ]
    }
    default:
      return []
  }
}

// Once the ride is closed (mission_completed or cancelled), the instructions
// subcollection is no longer needed. Deleting it keeps inline-base64 voice
// notes from accumulating in Firestore on the Spark free tier.
async function deleteInstructionsSubcollection(requestId) {
  try {
    const ref = db
      .collection('rescue_requests')
      .doc(requestId)
      .collection('instructions')
    let totalDeleted = 0
    while (true) {
      const batch = await ref.limit(50).get()
      if (batch.empty) break
      const writeBatch = db.batch()
      batch.docs.forEach((doc) => writeBatch.delete(doc.ref))
      await writeBatch.commit()
      totalDeleted += batch.size
      if (batch.size < 50) break
    }
    return totalDeleted
  } catch (e) {
    console.warn(
      `instructions cleanup failed for ${requestId}: ${e.message}`
    )
    return 0
  }
}

async function applyHospitalProjection({
  requestRef,
  requestId,
  hospitalId,
  hospital,
}) {
  if (!hospitalId || !hospital) return

  await Promise.all([
    requestRef.set(
      {
        hospitalName: hospital.name || '',
        hospitalAddress: hospital.address || '',
        hospitalPhone: hospital.phone || '',
        hospitalLocation: hospital.location || null,
        hospitalNotifiedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    ),
    db.doc(`hospitals/${hospitalId}`).set(
      {
        currentRequestId: requestId,
      },
      { merge: true }
    ),
  ])
}

async function applyDriverProjection({
  requestRef,
  requestId,
  driverId,
  driver,
}) {
  if (!driverId || !driver) return

  await Promise.all([
    requestRef.set(
      {
        driverName: driver.name || '',
        driverPhone: driver.phone || '',
        driverVehicleNumber: driver.vehicleNumber || '',
        driverAmbulanceType: driver.ambulanceType || '',
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    ),
    db.doc(`drivers/${driverId}`).set(
      {
        currentRequestId: requestId,
      },
      { merge: true }
    ),
  ])
}

async function createRescueFromWhatsApp({
  from,
  name,
  latitude,
  longitude,
  typeCode,
}) {
  const type = TYPES[typeCode] || TYPES.C
  const ref = db.collection('rescue_requests').doc()

  await ref.set({
    requestId: ref.id,
    patientName: name || '',
    patientPhone: from,
    patientLocation: new GeoPoint(latitude, longitude),
    accuracy: null,
    mapsLink: `https://maps.google.com/?q=${latitude},${longitude}`,
    emergencyType: `WhatsApp - ${type.label}`,
    emergencyDescription: 'Incoming WhatsApp emergency request',
    ambulanceType: type.code,
    urgencyLevel:
      type.code === 'A' ? 'critical' : type.code === 'B' ? 'serious' : 'moderate',
    preferredHospitalId: '',
    preferredHospitalName: '',
    preferredHospitalAddress: '',
    hospitalChosenBy: '',
    source: 'whatsapp',
    status: 'pending_driver',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    currentDriverSearchRadius: 1,
    notifiedDriverIds: [],
    assignedDriverId: null,
    currentHospitalSearchRadius: 1,
    notifiedHospitalIds: [],
    assignedHospitalId: null,
  })

  await findAndNotifyDrivers({
    requestId: ref.id,
    lat: latitude,
    lng: longitude,
    searchRadius: 1,
    alreadyNotified: [],
  }).catch((e) => console.error('whatsapp findAndNotifyDrivers error:', e))

  scheduleDriverExpansion(ref.id, 1)

  return ref.id
}

/**
 * Normalise a Gupshup inbound webhook payload.
 * Expected v2 shape:
 *   { app, timestamp, version, type: 'message',
 *     payload: { id, source, type, payload: {...}, sender: {...} } }
 */
function parseGupshup(body) {
  if (!body || body.type !== 'message' || !body.payload) return null

  const payload = body.payload
  const from = payload.source || payload.sender?.phone
  const senderName = payload.sender?.name || ''
  const kind = payload.type
  const inner = payload.payload || {}

  if (kind === 'text') {
    return {
      kind: 'text',
      from,
      name: senderName,
      text: String(inner.text || ''),
    }
  }

  if (kind === 'location') {
    const lat = Number(inner.latitude)
    const lng = Number(inner.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { kind: 'location', from, name: senderName, lat, lng }
  }

  // Gupshup quick replies expose the developer payload via `postbackText`.
  // Some accounts still emit Meta-style button/list wrappers, so normalize
  // both shapes into one internal button_reply event.
  if (kind === 'quick_reply' || kind === 'button_reply' || kind === 'list_reply') {
    const id = String(
      inner.postbackText || inner.id || inner.reply || inner.text || ''
    )
    const title = String(inner.title || inner.reply || inner.text || '')
    if (!id) return null
    return { kind: 'button_reply', from, name: senderName, id, title }
  }

  // Voice / audio note from the patient — used when they tap "Add note" and
  // record a voice clip in WhatsApp. Gupshup posts a downloadable URL.
  if (kind === 'audio' || kind === 'voice') {
    const url = String(inner.url || inner.audio?.url || '')
    if (!url) return null
    return {
      kind: 'audio',
      from,
      name: senderName,
      url,
      mimeType: String(inner.contentType || inner.mimeType || 'audio/ogg'),
    }
  }

  return { kind, from, name: senderName }
}

// Parse "ACTION:requestId" button ids back into structured parts.
function parseButtonId(id) {
  const m = String(id || '').match(/^([A-Z_]+):(.+)$/)
  if (!m) return { action: id || '', requestId: null }
  return { action: m[1], requestId: m[2] }
}

async function cancelRescueRequest({ requestId, cancelledBy }) {
  const ref = db.collection('rescue_requests').doc(requestId)
  const snap = await ref.get()
  if (!snap.exists) return { ok: false, reason: 'not_found' }
  const data = snap.data()
  if (['completed', 'cancelled'].includes(data.status)) {
    return { ok: false, reason: 'already_closed', status: data.status }
  }
  await ref.set(
    {
      status: 'cancelled',
      cancelReason: 'patient_whatsapp_cancel',
      cancelledBy: cancelledBy || 'patient_whatsapp',
      cancelledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )
  // Free the assigned driver if any.
  if (data.assignedDriverId) {
    await db
      .collection('drivers')
      .doc(data.assignedDriverId)
      .set({ currentRequestId: null }, { merge: true })
      .catch(() => {})
  }
  return { ok: true }
}

function normaliseText(raw) {
  return String(raw || '').trim().toLowerCase().replace(/[.!?]+$/, '')
}

router.post('/webhook', async (req, res) => {
  // Always 200 to Gupshup so they don't retry on app errors.
  const debugRef = db.collection(DEBUG_COLLECTION).doc()

  try {
    await updateDebugTrace(debugRef, {
      receivedAt: FieldValue.serverTimestamp(),
      receivedAtMs: Date.now(),
      status: 'received',
      headers: {
        userAgent: req.get('user-agent') || '',
        contentType: req.get('content-type') || '',
        xGupshupSignature: req.get('x-gupshup-signature') || '',
      },
      rawBody: req.body || null,
    })

    const evt = parseGupshup(req.body)
    await updateDebugTrace(debugRef, {
      status: evt && evt.from ? 'parsed' : 'ignored',
      parsedEvent: evt,
    })
    if (!evt || !evt.from) return res.status(200).json({ status: 'ignored' })

    // Mirror every inbound message to the audit collection.
    await logAudit({
      direction: 'in',
      phone: evt.from,
      summary:
        evt.kind === 'text'
          ? evt.text
          : evt.kind === 'location'
          ? `[location] ${evt.lat},${evt.lng}`
          : evt.kind === 'button_reply'
          ? `[button] ${evt.title} (${evt.id})`
          : `[${evt.kind}]`,
      payload: evt,
      meta: { senderName: evt.name || null },
    })

    const session = await getSession(evt.from)
    await updateDebugTrace(debugRef, {
      eventFrom: evt.from,
      eventKind: evt.kind,
      sessionBefore: sessionSummary(session),
    })

    if (evt.kind === 'button_reply') {
      const { action, requestId } = parseButtonId(evt.id)

      if (action === 'CALL_DRIVER' && requestId) {
        const reqSnap = await db
          .collection('rescue_requests')
          .doc(requestId)
          .get()
        const driverId = reqSnap.exists ? reqSnap.data().assignedDriverId : null
        const driverSnap = driverId
          ? await db.collection('drivers').doc(driverId).get()
          : null
        const phone = driverSnap?.exists ? driverSnap.data().phone : null
        if (phone) {
          await sendText(
            evt.from,
            `📞 Tap the driver's number to call:\n\n${phone}`,
            { requestId, eventType: 'button_call_driver' }
          )
        } else {
          await sendText(
            evt.from,
            `Driver phone not available yet. We'll send it as soon as a driver accepts.\n📞 Helpline: ${HELPLINE}`,
            { requestId, eventType: 'button_call_driver' }
          )
        }
        await updateDebugTrace(debugRef, {
          status: 'ok',
          action: 'button_call_driver',
          requestId,
        })
        return res.status(200).json({ status: 'ok' })
      }

      if (action === 'ADD_NOTE' && requestId) {
        await setSession(evt.from, {
          state: 'adding_note',
          noteForRequestId: requestId,
        })
        await sendText(
          evt.from,
          `📝 Send your note in the next message — text or voice — and we'll deliver it to the driver instantly.`,
          { requestId, eventType: 'button_add_note' }
        )
        await updateDebugTrace(debugRef, {
          status: 'ok',
          action: 'button_add_note',
          requestId,
        })
        return res.status(200).json({ status: 'ok' })
      }

      if (action === 'CANCEL_REQUEST' && requestId) {
        const result = await cancelRescueRequest({
          requestId,
          cancelledBy: `patient:${evt.from}`,
        })
        const reply = result.ok
          ? `✅ Your request has been cancelled. Stay safe.\nReply *menu* if you need help again.`
          : result.reason === 'already_closed'
          ? `This request is already ${result.status}.`
          : `We couldn't cancel that request. Please call ${HELPLINE} if this is urgent.`
        await sendText(evt.from, reply, {
          requestId,
          eventType: 'button_cancel_request',
        })
        await updateDebugTrace(debugRef, {
          status: 'ok',
          action: 'button_cancel_request',
          requestId,
          cancelResult: result,
        })
        return res.status(200).json({ status: 'ok' })
      }

      // Unknown button id — fall through to the default fallback below.
    }

    if (evt.kind === 'location') {
      const typeCode = session?.selectedAmbulanceType || 'C'
      const requestId = await createRescueFromWhatsApp({
        from: evt.from,
        name: evt.name,
        latitude: evt.lat,
        longitude: evt.lng,
        typeCode,
      })

      await updateDebugTrace(debugRef, {
        action: 'create_rescue_request',
        requestId,
        selectedAmbulanceType: typeCode,
      })

      await setSession(evt.from, {
        state: 'completed',
        selectedAmbulanceType: typeCode,
        lastRequestId: requestId,
      })

      const type = TYPES[typeCode]
      await sendText(
        evt.from,
        `🚑 *Emergency confirmed*\n\n` +
          `Type: *${type.label}*\n` +
          `Ref: *${requestId.slice(0, 8)}*\n\n` +
          `The nearest ambulance is being dispatched. You'll get updates here.\n\n` +
          `📞 Helpline: ${HELPLINE}`
      )

      await updateDebugTrace(debugRef, {
        status: 'ok',
        replyType: 'emergency_confirmed',
        sessionAfter: {
          state: 'completed',
          selectedAmbulanceType: typeCode,
          lastRequestId: requestId,
        },
      })

      return res.status(200).json({ status: 'ok', requestId })
    }

    // Voice note from WhatsApp during "Add note" flow → store as inline
    // base64 instruction so it shows up on both driver app & patient tracking.
    if (evt.kind === 'audio') {
      const noteRequestId = session?.noteForRequestId || session?.lastRequestId
      if (!noteRequestId) {
        await sendText(
          evt.from,
          `🎤 We received a voice note but couldn't find an active request to attach it to. Reply *menu* to start a new request.`
        )
        await updateDebugTrace(debugRef, {
          status: 'ok',
          action: 'audio_no_request',
        })
        return res.status(200).json({ status: 'ok' })
      }

      try {
        const resp = await fetch(evt.url)
        if (!resp.ok) throw new Error(`download ${resp.status}`)
        const buf = Buffer.from(await resp.arrayBuffer())
        // ~700 KB hard cap so we stay inside the Firestore 1 MB doc limit.
        if (buf.length > 700 * 1024) {
          await sendText(
            evt.from,
            `🎤 Voice note too long. Please send a shorter clip (under ~30 seconds).`
          )
          return res.status(200).json({ status: 'ok' })
        }
        const base64 = buf.toString('base64')
        const ref = db
          .collection('rescue_requests')
          .doc(noteRequestId)
          .collection('instructions')
          .doc()
        await ref.set({
          id: ref.id,
          type: 'audio',
          source: 'whatsapp',
          mimeType: evt.mimeType || 'audio/ogg',
          audioBase64: base64,
          durationSec: 0,
          createdAt: FieldValue.serverTimestamp(),
        })
        await db
          .collection('rescue_requests')
          .doc(noteRequestId)
          .set(
            {
              lastInstructionAt: FieldValue.serverTimestamp(),
              instructionCount: FieldValue.increment(1),
            },
            { merge: true }
          )
        await setSession(evt.from, {
          state: 'completed',
          noteForRequestId: null,
        })
        await sendText(
          evt.from,
          `🎤 Voice note delivered to the driver.`,
          { requestId: noteRequestId, eventType: 'voice_via_whatsapp' }
        )
        await updateDebugTrace(debugRef, {
          status: 'ok',
          action: 'voice_via_whatsapp',
          requestId: noteRequestId,
          bytes: buf.length,
        })
      } catch (err) {
        console.error('whatsapp audio handling failed:', err)
        await sendText(
          evt.from,
          `Couldn't process your voice note. Please type the message instead.`
        )
        await updateDebugTrace(debugRef, {
          status: 'error',
          action: 'voice_via_whatsapp',
          errorMessage: err.message,
        })
      }
      return res.status(200).json({ status: 'ok' })
    }

    if (evt.kind === 'text') {
      const text = normaliseText(evt.text)

      // Follow-through for the "Add note" button: persist the next text as a
      // patient instruction on the linked request, then clear the flag.
      if (session?.state === 'adding_note' && session?.noteForRequestId) {
        const noteRequestId = session.noteForRequestId
        const noteText = String(evt.text || '').trim().slice(0, 500)
        if (noteText) {
          const ref = db
            .collection('rescue_requests')
            .doc(noteRequestId)
            .collection('instructions')
            .doc()
          await ref.set({
            id: ref.id,
            type: 'text',
            text: noteText,
            source: 'whatsapp',
            createdAt: FieldValue.serverTimestamp(),
          })
          await db
            .collection('rescue_requests')
            .doc(noteRequestId)
            .set(
              {
                lastInstructionAt: FieldValue.serverTimestamp(),
                instructionCount: FieldValue.increment(1),
              },
              { merge: true }
            )
        }
        await setSession(evt.from, {
          state: 'completed',
          noteForRequestId: null,
        })
        await sendText(
          evt.from,
          noteText
            ? `✅ Note sent to the driver.`
            : `Note was empty — nothing sent. Reply *menu* if you need help.`,
          { requestId: noteRequestId, eventType: 'note_via_whatsapp' }
        )
        await updateDebugTrace(debugRef, {
          status: 'ok',
          action: 'note_via_whatsapp',
          requestId: noteRequestId,
        })
        return res.status(200).json({ status: 'ok' })
      }

      if (MENU_TO_TYPE[text]) {
        const typeCode = MENU_TO_TYPE[text]

        await setSession(evt.from, {
          state: 'awaiting_location',
          selectedAmbulanceType: typeCode,
          lastRequestId: null,
        })

        await updateDebugTrace(debugRef, {
          action: 'select_ambulance_type',
          normalizedText: text,
          selectedAmbulanceType: typeCode,
        })

        await sendText(evt.from, ackForType(typeCode))
        await sendLocationRequest(evt.from, LOCATION_PROMPT_PREFIX)

        await updateDebugTrace(debugRef, {
          status: 'ok',
          replyType: 'location_prompt_after_type_select',
          sessionAfter: {
            state: 'awaiting_location',
            selectedAmbulanceType: typeCode,
            lastRequestId: null,
          },
        })

        return res.status(200).json({ status: 'ok' })
      }

      if (text === 'restart' || text === 'reset' || text === 'menu') {
        await clearSession(evt.from)

        await updateDebugTrace(debugRef, {
          action: 'restart_menu',
          normalizedText: text,
        })

        await sendText(evt.from, MENU_TEXT)

        await updateDebugTrace(debugRef, {
          status: 'ok',
          replyType: 'menu',
          sessionAfter: { state: 'cleared' },
        })

        return res.status(200).json({ status: 'ok' })
      }

      if (session?.state === 'awaiting_location') {
        await updateDebugTrace(debugRef, {
          action: 'reprompt_location',
          normalizedText: text,
        })

        await sendText(
          evt.from,
          '📍 Please share your *live location* so we can dispatch the ambulance.\n\n' +
            'Tap 📎 -> Location -> *Send your current location*\n\n' +
            '(Reply *menu* to change ambulance type.)'
        )
        await sendLocationRequest(evt.from, LOCATION_PROMPT_PREFIX)

        await updateDebugTrace(debugRef, {
          status: 'ok',
          replyType: 'location_reprompt',
        })

        return res.status(200).json({ status: 'ok' })
      }

      const isKeyword = EMERGENCY_KEYWORDS.some((k) => text.includes(k))
      await setSession(evt.from, {
        state: 'awaiting_type',
        selectedAmbulanceType: null,
      })

      await updateDebugTrace(debugRef, {
        action: 'show_menu',
        normalizedText: text,
        matchedEmergencyKeyword: isKeyword,
      })

      await sendText(evt.from, MENU_TEXT)

      await updateDebugTrace(debugRef, {
        status: 'ok',
        replyType: 'menu',
        sessionAfter: {
          state: 'awaiting_type',
          selectedAmbulanceType: null,
          lastRequestId: null,
        },
      })

      return res.status(200).json({ status: 'ok' })
    }

    await updateDebugTrace(debugRef, {
      action: 'fallback_other_message_type',
    })

    await sendText(
      evt.from,
      '🙏 Suraksha Kavach - emergency ambulance.\n\n' +
        'Reply *menu* to start, or share your location to request help.\n\n' +
        `📞 ${HELPLINE}`
    )

    await updateDebugTrace(debugRef, {
      status: 'ok',
      replyType: 'fallback',
    })

    return res.status(200).json({ status: 'ok' })
  } catch (e) {
    console.error('whatsapp webhook error:', e)
    await updateDebugTrace(debugRef, {
      status: 'error',
      errorName: e.name || 'Error',
      errorMessage: e.message || 'Unknown error',
    })
    return res.status(200).json({ status: 'error', message: e.message })
  }
})

router.get('/webhook', (req, res) => res.status(200).send('OK'))

router.post('/request-event', async (req, res) => {
  let decoded
  try {
    decoded = await requireAuth(req)
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message })
  }

  const { requestId, eventType } = req.body || {}
  if (!requestId || !eventType) {
    return res
      .status(400)
      .json({ error: 'requestId and eventType are required.' })
  }
  if (!WHATSAPP_EVENT_TYPES.has(eventType)) {
    return res.status(400).json({ error: 'Unsupported eventType.' })
  }

  try {
    const ctx = await loadRequestContext(requestId)
    const { requestRef, request, driver, hospital } = ctx

    assertCanSendRequestEvent({
      eventType,
      callerUid: decoded.uid,
      request,
    })

    const alreadySent = Array.isArray(request.whatsappNotifiedEvents)
      ? request.whatsappNotifiedEvents.includes(eventType)
      : false
    if (alreadySent) {
      return res.json({ ok: true, skipped: true, reason: 'already_sent' })
    }

    const destination = normalizePhoneForWhatsApp(request.patientPhone)
    if (!destination) {
      return res.json({ ok: true, skipped: true, reason: 'no_patient_phone' })
    }

    if (request.assignedDriverId && driver) {
      await applyDriverProjection({
        requestRef,
        requestId,
        driverId: request.assignedDriverId,
        driver,
      })
    }

    if (eventType === 'hospital_selected' && request.assignedHospitalId && hospital) {
      await applyHospitalProjection({
        requestRef,
        requestId,
        hospitalId: request.assignedHospitalId,
        hospital,
      })
    }

    const messages = buildRequestEventMessages({
      eventType,
      requestId,
      request,
      driver,
      hospital,
    })

    if (messages.length === 0) {
      return res.json({ ok: true, skipped: true, reason: 'no_message' })
    }

    for (const message of messages) {
      const auditMeta = { requestId, eventType }
      if (message.kind === 'buttons') {
        await sendInteractiveButtons(
          destination,
          message.body,
          message.buttons,
          auditMeta
        )
      } else {
        await sendText(destination, message.text, auditMeta)
      }
    }

    await requestRef.set(
      {
        whatsappNotifiedEvents: FieldValue.arrayUnion(eventType),
        whatsappLastNotifiedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    // End-of-ride cleanup: drop the patient instructions subcollection so the
    // inline-base64 voice notes don't pile up in Firestore on the Spark plan.
    let cleanedInstructions = 0
    if (eventType === 'mission_completed') {
      cleanedInstructions = await deleteInstructionsSubcollection(requestId)
    }

    return res.json({
      ok: true,
      sent: messages.length,
      cleanedInstructions,
    })
  } catch (e) {
    console.error('whatsapp request-event error:', e)
    return res.status(e.status || 500).json({ error: e.message })
  }
})

module.exports = router
