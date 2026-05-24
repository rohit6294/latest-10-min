const { db, FieldValue } = require('./firebase')
const { geohashQueryBounds, distanceBetween } = require('geofire-common')
const { sendAlert } = require('./fcm')

const MAX_DRIVER_RADIUS_KM = 10
const MAX_HOSPITAL_RADIUS_KM = 20
const TIMEOUT_MS = 30_000

function buildDriverAlertText(request) {
  const urgency = (request && request.urgencyLevel) || ''
  const type =
    (request && (request.emergencyType || request.emergencyDescription)) ||
    'Emergency'
  const urgencyLabel =
    urgency === 'critical' ? 'CRITICAL' : urgency === 'serious' ? 'SERIOUS' : 'New'
  return {
    title: `${urgencyLabel} ambulance request`,
    body: `${type} — tap to respond`,
  }
}

async function findAndNotifyDrivers({ requestId, lat, lng, searchRadius, alreadyNotified }) {
  const requestSnap = await db.collection('rescue_requests').doc(requestId).get()
  const request = requestSnap.data() || {}
  const declinedDriverIds = new Set(request.declinedDriverIds || [])
  const requiredAmbulanceType = request.ambulanceType || null
  const seenDriverIds = new Set(alreadyNotified || [])
  const seenTokens = new Set()

  const bounds = geohashQueryBounds([lat, lng], searchRadius * 1000)
  const snapshots = await Promise.all(
    bounds.map((b) =>
      db
        .collection('drivers')
        .where('geohash', '>=', b[0])
        .where('geohash', '<=', b[1])
        .where('isOnline', '==', true)
        .where('isAvailable', '==', true)
        .get()
    )
  )

  const newDriverIds = []
  const fcmTokens = []

  for (const snap of snapshots) {
    for (const doc of snap.docs) {
      const driver = doc.data()
      const driverLoc = driver.location
      if (!driverLoc) continue
      if (requiredAmbulanceType && driver.ambulanceType !== requiredAmbulanceType) {
        continue
      }
      const dist = distanceBetween(
        [driverLoc.latitude, driverLoc.longitude],
        [lat, lng]
      )
      if (
        dist <= searchRadius &&
        !seenDriverIds.has(doc.id) &&
        !declinedDriverIds.has(doc.id)
      ) {
        seenDriverIds.add(doc.id)
        newDriverIds.push(doc.id)
        if (driver.fcmToken && !seenTokens.has(driver.fcmToken)) {
          seenTokens.add(driver.fcmToken)
          fcmTokens.push(driver.fcmToken)
        }
      }
    }
  }

  if (newDriverIds.length > 0) {
    await db
      .collection('rescue_requests')
      .doc(requestId)
      .update({
        notifiedDriverIds: FieldValue.arrayUnion(...newDriverIds),
      })

    const { title, body } = buildDriverAlertText(request)

    await sendAlert(fcmTokens, {
      type: 'incoming_request',
      requestId,
      title,
      body,
    })
  }

  return { notified: newDriverIds.length }
}

async function expandDriverRadius(requestId, currentRadius) {
  const ref = db.collection('rescue_requests').doc(requestId)
  const snap = await ref.get()
  if (!snap.exists) return

  const request = snap.data()
  if (request.assignedDriverId || request.status !== 'pending_driver') return

  const newRadius = currentRadius + 1
  if (newRadius > MAX_DRIVER_RADIUS_KM) {
    await ref.update({
      status: 'cancelled',
      cancelReason: 'no_driver_available',
    })
    return
  }

  await ref.update({ currentDriverSearchRadius: newRadius })

  const loc = request.patientLocation
  await findAndNotifyDrivers({
    requestId,
    lat: loc.latitude,
    lng: loc.longitude,
    searchRadius: newRadius,
    alreadyNotified: request.notifiedDriverIds || [],
  })

  scheduleDriverExpansion(requestId, newRadius)
}

function scheduleDriverExpansion(requestId, currentRadius) {
  setTimeout(() => {
    expandDriverRadius(requestId, currentRadius).catch((e) =>
      console.error(`expandDriverRadius failed (${requestId}, r=${currentRadius}):`, e)
    )
  }, TIMEOUT_MS).unref()
}

async function findAndNotifyHospitals({ requestId, lat, lng, searchRadius, alreadyNotified }) {
  const bounds = geohashQueryBounds([lat, lng], searchRadius * 1000)
  const snapshots = await Promise.all(
    bounds.map((b) =>
      db
        .collection('hospitals')
        .where('geohash', '>=', b[0])
        .where('geohash', '<=', b[1])
        .where('isActive', '==', true)
        .get()
    )
  )

  const newHospitalIds = []
  const fcmTokens = []

  for (const snap of snapshots) {
    for (const doc of snap.docs) {
      const hospital = doc.data()
      const hLoc = hospital.location
      if (!hLoc) continue
      const dist = distanceBetween(
        [hLoc.latitude, hLoc.longitude],
        [lat, lng]
      )
      if (dist <= searchRadius && !alreadyNotified.includes(doc.id)) {
        newHospitalIds.push(doc.id)
        if (hospital.fcmToken) fcmTokens.push(hospital.fcmToken)
      }
    }
  }

  if (newHospitalIds.length > 0) {
    await db
      .collection('rescue_requests')
      .doc(requestId)
      .update({
        notifiedHospitalIds: FieldValue.arrayUnion(...newHospitalIds),
      })

    await sendAlert(fcmTokens, {
      type: 'incoming_ambulance',
      requestId,
      title: 'Incoming ambulance',
      body: 'A patient is being routed to your hospital. Tap to prepare.',
    })
  }

  return { notified: newHospitalIds.length }
}

async function expandHospitalRadius(requestId, currentRadius) {
  const ref = db.collection('rescue_requests').doc(requestId)
  const snap = await ref.get()
  if (!snap.exists) return

  const request = snap.data()
  if (
    request.assignedHospitalId ||
    (request.status !== 'pending_hospital' && request.status !== 'driver_assigned')
  ) {
    return
  }

  const newRadius = currentRadius + 1
  if (newRadius > MAX_HOSPITAL_RADIUS_KM) {
    await ref.update({ hospitalSearchStatus: 'no_hospital_found' })
    return
  }

  await ref.update({ currentHospitalSearchRadius: newRadius })

  const loc = request.patientLocation
  await findAndNotifyHospitals({
    requestId,
    lat: loc.latitude,
    lng: loc.longitude,
    searchRadius: newRadius,
    alreadyNotified: request.notifiedHospitalIds || [],
  })

  scheduleHospitalExpansion(requestId, newRadius)
}

function scheduleHospitalExpansion(requestId, currentRadius) {
  setTimeout(() => {
    expandHospitalRadius(requestId, currentRadius).catch((e) =>
      console.error(`expandHospitalRadius failed (${requestId}, r=${currentRadius}):`, e)
    )
  }, TIMEOUT_MS).unref()
}

module.exports = {
  findAndNotifyDrivers,
  scheduleDriverExpansion,
  findAndNotifyHospitals,
  scheduleHospitalExpansion,
}
