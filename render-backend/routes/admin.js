const express = require('express')
const { auth, db, FieldValue, GeoPoint } = require('../lib/firebase')
const { requireAdmin } = require('../lib/authGuard')

const router = express.Router()

router.post('/create-account', async (req, res) => {
  let callerUid
  try {
    const decoded = await requireAdmin(req)
    callerUid = decoded.uid
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message })
  }

  const {
    accountType,
    email,
    password,
    displayName,
    phone,
    address,
    latitude,
    longitude,
    icuBeds,
    advancedBeds,
    normalBeds,
    contactPerson,
    vehicleNumber,
    vehicleType,
    fleetId,
    fleetName,
  } = req.body || {}

  if (!accountType || !email || !password || !displayName) {
    return res.status(400).json({
      error: 'accountType, email, password, and displayName are required.',
    })
  }
  if (!['hospital', 'fleet', 'driver'].includes(accountType)) {
    return res.status(400).json({
      error: 'accountType must be hospital, fleet, or driver.',
    })
  }

  try {
    const userRecord = await auth.createUser({ email, password, displayName })
    const uid = userRecord.uid
    const now = FieldValue.serverTimestamp()

    const role = accountType === 'fleet' ? 'fleet' : accountType
    await db.doc(`users/${uid}`).set({
      email,
      role,
      createdAt: now,
      createdBy: callerUid,
    })

    if (accountType === 'hospital') {
      const hospitalData = {
        name: displayName,
        email,
        phone: phone || '',
        address: address || '',
        isActive: true,
        icuBeds: Number(icuBeds) || 0,
        icuAvailable: Number(icuBeds) || 0,
        advancedBeds: Number(advancedBeds) || 0,
        advancedAvailable: Number(advancedBeds) || 0,
        normalBeds: Number(normalBeds) || 0,
        normalAvailable: Number(normalBeds) || 0,
        rating: 0,
        createdAt: now,
        createdBy: callerUid,
      }
      if (latitude != null && longitude != null) {
        hospitalData.location = new GeoPoint(Number(latitude), Number(longitude))
      }
      await db.doc(`hospitals/${uid}`).set(hospitalData)
    } else if (accountType === 'fleet') {
      await db.doc(`ambulance_fleets/${uid}`).set({
        name: displayName,
        email,
        phone: phone || '',
        contactPerson: contactPerson || displayName,
        address: address || '',
        isActive: true,
        ownerUid: uid,
        createdAt: now,
        createdBy: callerUid,
      })
    } else if (accountType === 'driver') {
      await db.doc(`drivers/${uid}`).set({
        name: displayName,
        email,
        phone: phone || '',
        vehicleNumber: vehicleNumber || '',
        vehicleType: vehicleType || 'BLS',
        ambulanceType: vehicleType === 'ALS' ? 'A' : vehicleType === 'BLS' ? 'B' : 'C',
        verificationStatus: 'verified',
        isOnline: false,
        isAvailable: true,
        currentTripId: null,
        fleetId: fleetId || null,
        fleetName: fleetName || null,
        documents: {},
        createdAt: now,
        createdBy: callerUid,
      })
      // Link driver to fleet (bidirectional)
      if (fleetId) {
        await db.doc(`ambulance_fleets/${fleetId}`).set(
          { driverIds: FieldValue.arrayUnion(uid) },
          { merge: true }
        )
      }
    }

    res.json({
      success: true,
      uid,
      message: `${accountType} account created: ${displayName} (${email})`,
    })
  } catch (e) {
    if (e.code === 'auth/email-already-exists') {
      return res.status(409).json({
        error: 'An account with this email already exists.',
      })
    }
    console.error('create-account error:', e)
    res.status(500).json({ error: e.message || 'Failed to create account.' })
  }
})

module.exports = router
