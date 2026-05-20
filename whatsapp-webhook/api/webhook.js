// WhatsApp Cloud API Webhook — Suraksha Kavach
// Deployed on Vercel (free tier)

const VERIFY_TOKEN   = process.env.VERIFY_TOKEN   || 'tenminrescue2024'
const WA_TOKEN       = process.env.WA_TOKEN        // WhatsApp permanent access token
const PHONE_NUM_ID   = process.env.PHONE_NUM_ID    // Your real number's Phone Number ID

// ─── Send any WhatsApp message ───────────────────────────────────────────────
async function sendWA(payload) {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${PHONE_NUM_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    }
  )
  const json = await res.json()
  if (!res.ok) console.error('WA API error:', JSON.stringify(json))
  return json
}

// ─── Send plain text ─────────────────────────────────────────────────────────
async function sendText(to, text) {
  return sendWA({ to, type: 'text', text: { preview_url: false, body: text } })
}

// ─── Send "Share Location" interactive button ─────────────────────────────────
async function sendLocationRequest(to) {
  return sendWA({
    to,
    type: 'interactive',
    interactive: {
      type: 'location_request_message',
      body: {
        text: '📍 *Please share your current location* so we can dispatch the nearest ambulance to you immediately.',
      },
      action: { name: 'send_location' },
    },
  })
}

// ─── Mark message as read ────────────────────────────────────────────────────
async function markRead(messageId) {
  return sendWA({ status: 'read', message_id: messageId })
}

// ─── Handle one incoming message ─────────────────────────────────────────────
async function handleMessage(msg, contactName) {
  const from = msg.from
  const name = contactName || 'there'

  await markRead(msg.id)

  // ── Location received ──────────────────────────────────────────────────────
  if (msg.type === 'location') {
    const { latitude, longitude, name: placeName, address } = msg.location
    const mapsLink = `https://maps.google.com/?q=${latitude},${longitude}`

    console.log(`📍 Location from ${from}: ${latitude}, ${longitude}`)

    await sendText(
      from,
      `✅ *Location received!*\n\nThank you ${name}. Our team has been notified and the nearest ambulance is being dispatched to your location.\n\n📍 ${mapsLink}\n\n🚨 *Keep your phone with you. A team member will call you shortly.*\n\n📞 Helpline: +91 7866067136`
    )
    return
  }

  // ── SOS / Emergency keyword ────────────────────────────────────────────────
  if (msg.type === 'text') {
    const text = (msg.text?.body || '').toLowerCase()
    const isEmergency =
      text.includes('sos') ||
      text.includes('emergency') ||
      text.includes('ambulance') ||
      text.includes('accident') ||
      text.includes('help') ||
      text.includes('urgent')

    if (isEmergency) {
      await sendText(
        from,
        `🚨 *EMERGENCY RECEIVED!*\n\nHi ${name}, we have received your emergency alert. Our team is being notified *right now*.\n\nTo reach you faster, please share your exact location 👇`
      )
      await sendLocationRequest(from)
      return
    }

    // ── Normal greeting / any other text ───────────────────────────────────
    await sendText(
      from,
      `🙏 *Welcome to Suraksha Kavach!*\n\nHi ${name}! We provide rapid ambulance and emergency services.\n\nTo help you faster, please share your current location 👇`
    )
    await sendLocationRequest(from)
    return
  }

  // ── Other message types (image, audio, etc.) ───────────────────────────────
  await sendText(
    from,
    `🙏 Hi ${name}! We are Suraksha Kavach — rapid ambulance services.\n\nPlease type your concern or share your location and we'll respond immediately.\n\n📞 Helpline: +91 7866067136`
  )
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {

  // ── Webhook verification (Meta calls this once when you set up the webhook)
  if (req.method === 'GET') {
    const mode      = req.query['hub.mode']
    const token     = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ Webhook verified by Meta')
      return res.status(200).send(challenge)
    }
    console.warn('❌ Webhook verification failed')
    return res.status(403).json({ error: 'Forbidden' })
  }

  // ── Incoming messages (POST)
  if (req.method === 'POST') {
    try {
      const body = req.body

      if (body.object !== 'whatsapp_business_account') {
        return res.status(200).json({ status: 'ignored' })
      }

      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          const value = change.value
          if (change.field !== 'messages') continue

          const messages = value.messages || []
          const contacts = value.contacts || []

          for (const msg of messages) {
            const contact  = contacts.find(c => c.wa_id === msg.from)
            const name     = contact?.profile?.name || ''
            await handleMessage(msg, name)
          }
        }
      }
    } catch (err) {
      console.error('Webhook error:', err)
    }

    // Always return 200 — Meta will retry if we don't
    return res.status(200).json({ status: 'ok' })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
