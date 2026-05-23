const fs = require('fs');
const path = require('path');
const os = require('os');

function run() {
  const downloadsDir = path.join(os.homedir(), 'Downloads');
  console.log(`Scanning Downloads directory: ${downloadsDir}...`);

  if (!fs.existsSync(downloadsDir)) {
    console.error("Downloads folder not found!");
    return;
  }

  const files = fs.readdirSync(downloadsDir)
    .filter(file => file.endsWith('.json') && file.includes('firebase-adminsdk'))
    .map(file => {
      const filePath = path.join(downloadsDir, file);
      return {
        name: file,
        path: filePath,
        time: fs.statSync(filePath).mtime.getTime()
      };
    })
    .sort((a, b) => b.time - a.time);

  if (files.length === 0) {
    console.log("\n❌ No Firebase Service Account JSON files found in your Downloads folder yet.");
    console.log("Please follow Step 1 to download the new private key, then run this script again.");
    return;
  }

  const newestFile = files[0];
  console.log(`\n🎉 Found Firebase Private Key: ${newestFile.name}`);
  
  const fileBuffer = fs.readFileSync(newestFile.path);
  const base64String = fileBuffer.toString('base64');
  
  console.log("\n================================== COPY THE KEY BELOW ==================================");
  console.log(base64String);
  console.log("========================================================================================");
  console.log("\n✅ Copy the complete text above (from start to finish) and paste it into the");
  console.log("   FIREBASE_SERVICE_ACCOUNT_B64 environment variable on your Render Dashboard.");
}

run();
