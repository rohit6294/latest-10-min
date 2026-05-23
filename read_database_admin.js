const admin = require('firebase-admin');
const serviceAccount = require('./min-rescue-firebase-adminsdk-fbsvc-32a002c3db.json');

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function run() {
  console.log("\n=================== ONLINE DRIVERS ===================");
  const driverSnap = await db.collection('drivers').get();
  let onlineCount = 0;
  driverSnap.forEach(doc => {
    const data = doc.data();
    if (data.isOnline) {
      onlineCount++;
      console.log(`Driver ID: ${doc.id}`);
      console.log(`  Name: ${data.name || 'N/A'}`);
      console.log(`  AmbulanceType: ${data.ambulanceType}`);
      console.log(`  isAvailable: ${data.isAvailable}`);
      console.log(`  Location: ${data.location ? `${data.location.latitude}, ${data.location.longitude}` : 'None'}`);
      console.log(`  Geohash: ${data.geohash}`);
      console.log(`  FCM Token: ${data.fcmToken ? 'Present' : 'None'}`);
      console.log("---------------------------------------------------");
    }
  });
  if (onlineCount === 0) {
    console.log("No online drivers found in the database!");
  }

  console.log("\n=================== ACTIVE RESCUE REQUESTS ===================");
  const rescueSnap = await db.collection('rescue_requests').get();
  if (rescueSnap.empty) {
    console.log("No rescue requests found in the database!");
  } else {
    // Sort by createdAt descending
    const sortedDocs = rescueSnap.docs.map(doc => ({ id: doc.id, data: doc.data() }))
      .sort((a, b) => {
        const tA = a.data.createdAt ? a.data.createdAt.toMillis() : 0;
        const tB = b.data.createdAt ? b.data.createdAt.toMillis() : 0;
        return tB - tA;
      });

    sortedDocs.forEach(item => {
      console.log(`Request ID: ${item.id}`);
      console.log(`  Patient Name: ${item.data.patientName}`);
      console.log(`  Phone: ${item.data.patientPhone}`);
      console.log(`  Status: ${item.data.status}`);
      console.log(`  AmbulanceType: ${item.data.ambulanceType}`);
      console.log(`  Created At: ${item.data.createdAt ? item.data.createdAt.toDate().toLocaleString() : 'N/A'}`);
      console.log(`  Description: ${item.data.emergencyDescription}`);
      console.log("---------------------------------------------------");
    });
  }
}

run().catch(console.error);
