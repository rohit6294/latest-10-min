/**
 * Persistent mirror of every inbound/outbound WhatsApp message.
 * Used for DPDP compliance (audit trail), legal defense, and analytics.
 *
 * Gupshup retains messages too, but on a rolling window and behind their
 * dashboard. This collection is our own, queryable from the admin UI.
 */

const { db, FieldValue } = require('./firebase')

const COLLECTION = 'whatsapp_audit'

function safeSummary(message) {
  if (message == null) return ''
  if (typeof message === 'string') return message.slice(0, 500)
  if (typeof message === 'object') {
    if (message.type === 'text' && message.text) {
      return String(message.text).slice(0, 500)
    }
    if (message.type === 'button' && message.body?.text) {
      return `[buttons] ${String(message.body.text).slice(0, 400)}`
    }
    if (message.type === 'location_request_message' && message.body?.text) {
      return `[location-request] ${String(message.body.text).slice(0, 400)}`
    }
    try {
      return JSON.stringify(message).slice(0, 500)
    } catch {
      return '[unserializable]'
    }
  }
  return String(message).slice(0, 500)
}

async function logAudit({
  direction,
  phone,
  summary,
  payload,
  requestId,
  eventType,
  meta,
}) {
  if (!direction || !phone) return
  try {
    await db.collection(COLLECTION).add({
      direction,
      phone: String(phone),
      summary: safeSummary(summary ?? payload),
      payload: payload ?? null,
      requestId: requestId || null,
      eventType: eventType || null,
      meta: meta || null,
      createdAt: FieldValue.serverTimestamp(),
      createdAtMs: Date.now(),
    })
  } catch (e) {
    console.warn('whatsapp audit write failed:', e.message)
  }
}

module.exports = { logAudit }
