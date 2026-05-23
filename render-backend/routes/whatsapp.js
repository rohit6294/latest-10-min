const express = require('express')
const { db, FieldValue, GeoPoint } = require('../lib/firebase')
const { sendText, sendLocationRequest } = require('../lib/gupshup')
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
    case 'driver_assigned':
      return [
        `🚑 Driver accepted your emergency request.\n\nDriver: ${driverName}${driverPhone}${vehicleNumber}${trackLine}\n\nPlease keep your phone reachable.\n📞 Helpline: ${HELPLINE}`,
      ]
    case 'ambulance_arrived':
      return [
        `📍 Your ambulance has arrived at your location.\n\nDriver: ${driverName}${driverPhone}${trackLine}\n\nPlease meet the crew or answer their call.\n📞 Helpline: ${HELPLINE}`,
      ]
    case 'hospital_selected':
      return [
        `🏥 Hospital selected for your transfer.\n\nHospital: ${hospitalName}${hospitalAddressLine}\nBed requested: ${bedLabel}${trackLine}\n\nThe ambulance is now proceeding to the hospital.\n📞 Helpline: ${HELPLINE}`,
      ]
    case 'hospital_arrived':
      return [
        `🏥 The ambulance has arrived at ${hospitalName}.\n\nThe hospital team is receiving the patient now.${trackLine}\n📞 Helpline: ${HELPLINE}`,
      ]
    case 'mission_completed':
      return [
        `✅ Mission complete.\n\nThe patient has been handed over at ${hospitalName}.\nThank you for using Suraksha Kavach.\n📞 Helpline: ${HELPLINE}`,
      ]
    default:
      return []
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

  return { kind, from, name: senderName }
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

    const session = await getSession(evt.from)
    await updateDebugTrace(debugRef, {
      eventFrom: evt.from,
      eventKind: evt.kind,
      sessionBefore: sessionSummary(session),
    })

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

    if (evt.kind === 'text') {
      const text = normaliseText(evt.text)

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
      await sendText(destination, message)
    }

    await requestRef.set(
      {
        whatsappNotifiedEvents: FieldValue.arrayUnion(eventType),
        whatsappLastNotifiedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    return res.json({ ok: true, sent: messages.length })
  } catch (e) {
    console.error('whatsapp request-event error:', e)
    return res.status(e.status || 500).json({ error: e.message })
  }
})

module.exports = router
