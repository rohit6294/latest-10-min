const admin = require('firebase-admin')

function loadServiceAccount() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64
  if (!b64) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_B64 env var is missing. ' +
        'Set it to a base64-encoded service account JSON.'
    )
  }
  const json = Buffer.from(b64, 'base64').toString('utf8')
  return JSON.parse(json)
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(loadServiceAccount()),
  })
}

const db = admin.firestore()
const auth = admin.auth()
const messaging = admin.messaging()
const FieldValue = admin.firestore.FieldValue
const GeoPoint = admin.firestore.GeoPoint

module.exports = { admin, db, auth, messaging, FieldValue, GeoPoint }
