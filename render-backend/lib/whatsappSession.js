/**
 * Per-phone WhatsApp conversation state, persisted in Firestore so the
 * stateless Render webhook can remember what each user picked.
 *
 * Collection: whatsapp_sessions/{phone}
 *   - phone:                 E.164 without '+' (matches Gupshup `source`)
 *   - state:                 'awaiting_type' | 'awaiting_location' | 'completed'
 *   - selectedAmbulanceType: 'A' | 'B' | 'C' | null   (site uses A=ICU, B=Advanced, C=Normal)
 *   - lastRequestId:         string | null            (set after a rescue is created)
 *   - updatedAt:             server timestamp
 */

const { db, FieldValue } = require('./firebase')

const COLLECTION = 'whatsapp_sessions'
const SESSION_TTL_MS = 30 * 60 * 1000 // 30 minutes

function ref(phone) {
  return db.collection(COLLECTION).doc(String(phone))
}

async function getSession(phone) {
  if (!phone) return null
  const snap = await ref(phone).get()
  if (!snap.exists) return null
  const data = snap.data()
  const updatedAt = data.updatedAt?.toMillis?.() ?? 0
  if (updatedAt && Date.now() - updatedAt > SESSION_TTL_MS) return null
  return data
}

async function setSession(phone, patch) {
  if (!phone) return
  await ref(phone).set(
    { phone: String(phone), ...patch, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  )
}

async function clearSession(phone) {
  if (!phone) return
  await ref(phone).delete().catch(() => {})
}

module.exports = { getSession, setSession, clearSession, SESSION_TTL_MS }
