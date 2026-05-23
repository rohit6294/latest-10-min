const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function run() {
  console.log("=== ALL DRIVERS ===");
  const snap = await db.collection('drivers').get();
  for (const doc of snap.docs) {
    const data = doc.data();
    console.log(`Driver ID: ${doc.id}`);
    console.log(`Name: ${data.displayName || data.name || 'N/A'}`);
    console.log(`isOnline: ${data.isOnline}`);
    console.log(`isAvailable: ${data.isAvailable}`);
    console.log(`Location: ${data.location ? `${data.location.latitude}, ${data.location.longitude}` : 'None'}`);
    console.log(`Geohash: ${data.geohash}`);
    console.log(`FCM Token: ${data.fcmToken ? 'Present' : 'None'}`);
    console.log("------------------------");
  }
}

run().catch(console.error);
