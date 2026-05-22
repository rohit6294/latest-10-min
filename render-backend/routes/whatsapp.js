const express = require('express')
const { db, FieldValue, GeoPoint } = require('../lib/firebase')
const { sendText, sendLocationRequest } = require('../lib/gupshup')
const { findAndNotifyDrivers, scheduleDriverExpansion } = require('../lib/matching')

const router = express.Router()

const EMERGENCY_KEYWORDS = [
  'sos',
  'emergency',
  'ambulance',
  'accident',
  'help',
  'urgent',
  'bachao',
]

const WELCOME_TEXT =
  '🙏 *Welcome to Suraksha Kavach!*\n\nReply with *SOS* in an emergency or share your location 👇'

const SOS_PROMPT =
  '📍 *Please share your current location* so we can dispatch the nearest ambulance to you immediately.'

/**
 * Create a rescue_requests doc from a WhatsApp message with location,
 * then kick off driver matching.
 */
async function createRescueFromWhatsApp({ from, name, latitude, longitude }) {
  const ref = db.collection('rescue_requests').doc()
  await ref.set({
    requestId: ref.id,
    patientName: name || '',
    patientPhone: from,
    patientLocation: new GeoPoint(latitude, longitude),
    accuracy: null,
    mapsLink: `https://maps.google.com/?q=${latitude},${longitude}`,
    emergencyType: 'WhatsApp SOS',
    emergencyDescription: 'Incoming WhatsApp emergency request',
    ambulanceType: 'BLS',
    urgencyLevel: 'serious',
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

  // Kick off matching immediately (Firestore trigger isn't available on Spark).
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
 * Gupshup posts a JSON envelope like:
 *   { app, timestamp, version, type: 'message', payload: { id, source, type, payload: {...}, sender: {...} } }
 *
 * Inside payload.type can be: 'text', 'location', 'image', 'audio', ...
 * For 'location': payload.payload = { longitude, latitude, name, address }
 * For 'text':     payload.payload = { text }
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

router.post('/webhook', async (req, res) => {
  // Always 200 to Gupshup so they don't retry on app errors.
  try {
    const evt = parseGupshup(req.body)
    if (!evt || !evt.from) return res.status(200).json({ status: 'ignored' })

    if (evt.kind === 'location') {
      const requestId = await createRescueFromWhatsApp({
        from: evt.from,
        name: evt.name,
        latitude: evt.lat,
        longitude: evt.lng,
      })
      await sendText(
        evt.from,
        `✅ *Location received!*\n\nThank you ${evt.name || ''}. The nearest ambulance is being dispatched.\n\n🚨 Keep your phone with you. Our team will call shortly.\n\n📞 Helpline: +91 78660 67136\n\nRef: ${requestId.slice(0, 8)}`
      )
      return res.status(200).json({ status: 'ok', requestId })
    }

    if (evt.kind === 'text') {
      const text = evt.text.toLowerCase()
      const isEmergency = EMERGENCY_KEYWORDS.some((k) => text.includes(k))
      if (isEmergency) {
        await sendText(
          evt.from,
          `🚨 *EMERGENCY RECEIVED!*\n\nHi ${evt.name || 'there'}, our team is being notified now.\n\nPlease share your exact location 👇`
        )
        await sendLocationRequest(evt.from, SOS_PROMPT)
      } else {
        await sendText(evt.from, WELCOME_TEXT)
        await sendLocationRequest(evt.from, SOS_PROMPT)
      }
      return res.status(200).json({ status: 'ok' })
    }

    // Other types: ask for location
    await sendText(
      evt.from,
      `🙏 Suraksha Kavach — rapid ambulance services.\n\nPlease share your location or type *SOS* for an emergency.\n\n📞 +91 78660 67136`
    )
    res.status(200).json({ status: 'ok' })
  } catch (e) {
    console.error('whatsapp webhook error:', e)
    res.status(200).json({ status: 'error', message: e.message })
  }
})

/**
 * Gupshup also calls this for delivery/read receipts under `type: 'message-event'`.
 * Accept silently so they show as healthy.
 */
router.get('/webhook', (req, res) => res.status(200).send('OK'))

module.exports = router
