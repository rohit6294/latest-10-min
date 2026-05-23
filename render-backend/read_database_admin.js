const admin = require('firebase-admin');
const serviceAccount = require('./min-rescue-firebase-adminsdk-fbsvc-32a002c3db.json');

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function run() {
  const driverId = '8PCU7pFExXNxXLl4RUf5EG54Fg72';
  console.log(`\n=== RAW DRIVER DATA FOR ${driverId} ===`);
  const doc = await db.collection('drivers').doc(driverId).get();
  if (doc.exists) {
    console.log(JSON.stringify(doc.data(), null, 2));
  } else {
    console.log("Driver not found in Firestore!");
  }
}

run().catch(console.error);
