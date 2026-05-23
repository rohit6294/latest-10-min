const express = require('express')
const { db, FieldValue, GeoPoint } = require('../lib/firebase')
const { sendText, sendLocationRequest } = require('../lib/gupshup')
const { findAndNotifyDrivers, scheduleDriverExpansion } = require('../lib/matching')
const { getSession, setSession, clearSession } = require('../lib/whatsappSession')

const router = express.Router()

// ─── Ambulance catalog (must match SosPage.jsx TYPES) ──────────────────────
//   A = ICU, B = Advanced, C = Normal
// Menu numbers are 1=Normal, 2=Advanced, 3=ICU (least → most critical, easiest UX)

const TYPES = {
  C: { code: 'C', label: 'Normal Ambulance',   desc: 'Basic transport & first aid' },
  B: { code: 'B', label: 'Advanced Ambulance', desc: 'Oxygen, defibrillator, monitoring' },
  A: { code: 'A', label: 'ICU Ambulance',      desc: 'Ventilator, cardiac monitor, life support' },
}
const MENU_TO_TYPE = { '1': 'C', '2': 'B', '3': 'A' }

const EMERGENCY_KEYWORDS = [
  'sos', 'emergency', 'ambulance', 'accident', 'help', 'urgent',
  'bachao', 'hi', 'hello', 'hey', 'start', 'menu',
]

const MENU_TEXT =
  '🚨 *Suraksha Kavach — Emergency Ambulance*\n\n' +
  'What type of ambulance do you need?\n\n' +
  '1️⃣  *Normal*  — basic transport & first aid\n' +
  '2️⃣  *Advanced* — oxygen, defibrillator\n' +
  '3️⃣  *ICU* — ventilator, life support\n\n' +
  'Reply with *1*, *2* or *3*.'

const LOCATION_PROMPT_PREFIX = '📍 *Now share your live location* so we can dispatch the nearest ambulance.\n\nTap 📎 → Location → *Send your current location*'

const HELPLINE = '+91 78660 67136'

function ackForType(typeCode) {
  const t = TYPES[typeCode]
  return `✅ *${t.label}* selected.\n\n${LOCATION_PROMPT_PREFIX}`
}

async function createRescueFromWhatsApp({ from, name, latitude, longitude, typeCode }) {
  const type = TYPES[typeCode] || TYPES.C
  const ref = db.collection('rescue_requests').doc()
  await ref.set({
    requestId: ref.id,
    patientName: name || '',
    patientPhone: from,
    patientLocation: new GeoPoint(latitude, longitude),
    accuracy: null,
    mapsLink: `https://maps.google.com/?q=${latitude},${longitude}`,
    emergencyType: `WhatsApp — ${type.label}`,
    emergencyDescription: 'Incoming WhatsApp emergency request',
    ambulanceType: type.code,
    urgencyLevel: type.code === 'A' ? 'critical' : type.code === 'B' ? 'serious' : 'moderate',
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
 *   { app, timestamp, version, type: 'message',
 *     payload: { id, source, type, payload: {...}, sender: {...} } }
 */
function parseGupshup(body) {
  if (!body || body.type !== 'message' || !body.payload) return null
  const p = body.payload
  const from = p.source || p.sender?.phone
  const senderName = p.sender?.name || ''
  const kind = p.type
  const inner = p.payload || {}

  if (kind === 'text') {
    return { kind: 'text', from, name: senderName, text: String(inner.text || '') }
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
  try {
    const evt = parseGupshup(req.body)
    if (!evt || !evt.from) return res.status(200).json({ status: 'ignored' })

    const session = await getSession(evt.from)

    // ─── Location handler ─────────────────────────────────────────────────
    if (evt.kind === 'location') {
      // Use selected type if any; otherwise default to Normal so the user
      // is never blocked from getting help.
      const typeCode = session?.selectedAmbulanceType || 'C'
      const requestId = await createRescueFromWhatsApp({
        from: evt.from,
        name: evt.name,
        latitude: evt.lat,
        longitude: evt.lng,
        typeCode,
      })
      await setSession(evt.from, {
        state: 'completed',
        selectedAmbulanceType: typeCode,
        lastRequestId: requestId,
      })
      const t = TYPES[typeCode]
      await sendText(
        evt.from,
        `🚑 *Emergency confirmed*\n\n` +
          `Type: *${t.label}*\n` +
          `Ref: *${requestId.slice(0, 8)}*\n\n` +
          `The nearest ambulance is being dispatched. You'll get updates here.\n\n` +
          `📞 Helpline: ${HELPLINE}`
      )
      return res.status(200).json({ status: 'ok', requestId })
    }

    // ─── Text handler ─────────────────────────────────────────────────────
    if (evt.kind === 'text') {
      const text = normaliseText(evt.text)

      // 1) Direct number reply → pick type (works whether or not we already
      //    showed the menu; user may type "2" first thing).
      if (MENU_TO_TYPE[text]) {
        const typeCode = MENU_TO_TYPE[text]
        await setSession(evt.from, {
          state: 'awaiting_location',
          selectedAmbulanceType: typeCode,
          lastRequestId: null,
        })
        await sendText(evt.from, ackForType(typeCode))
        await sendLocationRequest(evt.from, LOCATION_PROMPT_PREFIX)
        return res.status(200).json({ status: 'ok' })
      }

      // 2) Explicit restart
      if (text === 'restart' || text === 'reset' || text === 'menu') {
        await clearSession(evt.from)
        await sendText(evt.from, MENU_TEXT)
        return res.status(200).json({ status: 'ok' })
      }

      // 3) Already waiting for location → re-prompt
      if (session?.state === 'awaiting_location') {
        await sendText(
          evt.from,
          `📍 Please share your *live location* so we can dispatch the ambulance.\n\nTap 📎 → Location → *Send your current location*\n\n(Reply *menu* to change ambulance type.)`
        )
        await sendLocationRequest(evt.from, LOCATION_PROMPT_PREFIX)
        return res.status(200).json({ status: 'ok' })
      }

      // 4) Default for any other text: show menu.
      //    Covers emergency keywords, gibberish, "hi", "help", etc.
      const _isKeyword = EMERGENCY_KEYWORDS.some((k) => text.includes(k))
      await setSession(evt.from, { state: 'awaiting_type', selectedAmbulanceType: null })
      await sendText(evt.from, MENU_TEXT)
      return res.status(200).json({ status: 'ok' })
    }

    // ─── Other inbound types (image, audio, etc.) ─────────────────────────
    await sendText(
      evt.from,
      `🙏 Suraksha Kavach — emergency ambulance.\n\nReply *menu* to start, or share your location to request help.\n\n📞 ${HELPLINE}`
    )
    res.status(200).json({ status: 'ok' })
  } catch (e) {
    console.error('whatsapp webhook error:', e)
    res.status(200).json({ status: 'error', message: e.message })
  }
})

router.get('/webhook', (req, res) => res.status(200).send('OK'))

module.exports = router
