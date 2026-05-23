const admin = require('firebase-admin')
const serviceAccount = require('../min-rescue-firebase-adminsdk-fbsvc-32a002c3db.json')

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  })
}

const db = admin.firestore()

async function run() {
  const snap = await db
    .collection('whatsapp_webhook_events')
    .orderBy('receivedAt', 'desc')
    .limit(10)
    .get()

  if (snap.empty) {
    console.log('No whatsapp_webhook_events found.')
    return
  }

  snap.forEach((doc) => {
    const data = doc.data()
    console.log('============================================================')
    console.log(`Doc ID: ${doc.id}`)
    console.log(`Status: ${data.status || 'N/A'}`)
    console.log(`Received At: ${data.receivedAt ? data.receivedAt.toDate().toLocaleString() : 'N/A'}`)
    console.log(`From: ${data.eventFrom || data.parsedEvent?.from || 'N/A'}`)
    console.log(`Kind: ${data.eventKind || data.parsedEvent?.kind || 'N/A'}`)
    console.log(`Action: ${data.action || 'N/A'}`)
    console.log(`Reply Type: ${data.replyType || 'N/A'}`)
    console.log(`Error: ${data.errorMessage || 'None'}`)
    console.log('Parsed Event:')
    console.log(JSON.stringify(data.parsedEvent || null, null, 2))
    console.log('Session Before:')
    console.log(JSON.stringify(data.sessionBefore || null, null, 2))
    console.log('Session After:')
    console.log(JSON.stringify(data.sessionAfter || null, null, 2))
    console.log('Raw Body:')
    console.log(JSON.stringify(data.rawBody || null, null, 2))
  })
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
