/**
 * Minimal Gupshup WhatsApp API client.
 * Docs: https://docs.gupshup.io/docs/interactive-messages
 */

const GUPSHUP_BASE = 'https://api.gupshup.io/wa/api/v1'

function getCreds() {
  const apiKey = process.env.GUPSHUP_API_KEY
  const appName = process.env.GUPSHUP_APP_NAME
  const source = process.env.GUPSHUP_SOURCE_NUMBER
  if (!apiKey || !appName || !source) {
    throw new Error(
      'Missing Gupshup env vars: GUPSHUP_API_KEY, GUPSHUP_APP_NAME, GUPSHUP_SOURCE_NUMBER'
    )
  }
  return { apiKey, appName, source }
}

async function sendMessage(destination, message) {
  const { apiKey, appName, source } = getCreds()

  const params = new URLSearchParams({
    channel: 'whatsapp',
    source,
    destination,
    'src.name': appName,
    message: JSON.stringify(message),
  })

  const res = await fetch(`${GUPSHUP_BASE}/msg`, {
    method: 'POST',
    headers: {
      apikey: apiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  const text = await res.text()
  if (!res.ok) {
    console.error('Gupshup error:', res.status, text)
    throw new Error(`Gupshup ${res.status}: ${text}`)
  }
  return text
}

function sendText(destination, text) {
  return sendMessage(destination, { type: 'text', text })
}

function sendLocationRequest(destination, bodyText) {
  return sendMessage(destination, {
    type: 'location_request_message',
    body: { type: 'text', text: bodyText },
    action: { name: 'send_location' },
  })
}

// Interactive quick replies for Gupshup's WhatsApp API.
// `buttons` is an array of { id, title } (title max 20 chars).
function sendInteractiveButtons(destination, bodyText, buttons) {
  const trimmed = (buttons || []).slice(0, 3).map((b) => ({
    type: 'text',
    title: String(b.title).slice(0, 20),
    postbackText: String(b.id).slice(0, 256),
  }))
  return sendMessage(destination, {
    type: 'quick_reply',
    content: {
      type: 'text',
      text: bodyText,
    },
    options: trimmed,
  })
}

module.exports = {
  sendMessage,
  sendText,
  sendLocationRequest,
  sendInteractiveButtons,
}
