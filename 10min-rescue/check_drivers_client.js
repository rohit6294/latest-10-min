import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyAJY7qQju0400c8_w8gc4PGE89VJJ9wfL0',
  authDomain: 'min-rescue.firebaseapp.com',
  projectId: 'min-rescue',
  storageBucket: 'min-rescue.firebasestorage.app',
  messagingSenderId: '120065917182',
  appId: '1:120065917182:web:0199e659f6ec78b132a5af',
  measurementId: 'G-0VKR1GJXQ3',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  console.log("=== ACTIVE RESCUE REQUESTS ===");
  try {
    const snap = await getDocs(collection(db, "rescue_requests"));
    if (snap.empty) {
      console.log("No rescue requests found in this collection!");
    } else {
      snap.forEach((doc) => {
        const data = doc.data();
        console.log(`- Request ID: ${doc.id}`);
        console.log(`  Patient Name: ${data.patientName}`);
        console.log(`  Status: ${data.status}`);
        console.log(`  Emergency Description: ${data.emergencyDescription}`);
        console.log("--------------------------------");
      });
    }
  } catch (e) {
    console.error("Error fetching rescue requests:", e);
  }
}

run().catch(console.error);
