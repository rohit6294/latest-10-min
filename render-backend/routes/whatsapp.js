const express = require('express')
const { db, FieldValue, GeoPoint } = require('../lib/firebase')
const { sendText, sendLocationRequest } = require('../lib/gupshup')
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

module.exports = router
