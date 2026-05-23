import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import '../models/driver_model.dart';
import '../models/hospital_model.dart';
import '../models/rescue_request_model.dart';
import '../models/sos_request_model.dart';
import '../models/callback_request_model.dart';
import '../models/ambulance_type.dart';
import '../constants/firestore_paths.dart';
import 'backend_service.dart';
import 'location_service.dart';

class FirestoreService {
  final FirebaseFirestore _db = FirebaseFirestore.instance;
  final BackendService _backendService = BackendService();

  Future<void> _notifyWhatsappEventBestEffort(
    String requestId,
    String eventType,
  ) async {
    try {
      await _backendService.notifyWhatsappRequestEvent(
        requestId: requestId,
        eventType: eventType,
      );
    } catch (e) {
      debugPrint('WhatsApp notify failed for $eventType ($requestId): $e');
    }
  }

  // ─── Driver ───────────────────────────────────────────────────────────────

  Future<DriverModel?> getDriver(String uid) async {
    final doc = await _db.doc(FirestorePaths.driver(uid)).get();
    if (!doc.exists) return null;
    return DriverModel.fromFirestore(doc);
  }

  Stream<DriverModel> watchDriver(String uid) => _db
      .doc(FirestorePaths.driver(uid))
      .snapshots()
      .map(DriverModel.fromFirestore);

  Future<void> setDriverOnline(String uid, bool isOnline) async {
    final updates = <String, dynamic>{
      'isOnline': isOnline,
      'isAvailable': isOnline,
    };

    // When going online, capture current GPS position and write
    // location + geohash so Cloud Functions can find this driver.
    if (isOnline) {
      try {
        final position = await LocationService().getCurrentPosition();
        if (position != null) {
          updates['location'] = GeoPoint(position.latitude, position.longitude);
          updates['geohash'] = LocationService.encodeGeohash(
            position.latitude,
            position.longitude,
          );
          updates['lastLocationUpdate'] = FieldValue.serverTimestamp();
        }
      } catch (_) {
        // Best-effort: driver goes online even without location.
        // The backup Firestore listener in the app still works.
      }
    }

    await _db
        .doc(FirestorePaths.driver(uid))
        .set(updates, SetOptions(merge: true));
  }

  // ─── Hospital ─────────────────────────────────────────────────────────────

  Future<HospitalModel?> getHospital(String uid) async {
    final doc = await _db.doc(FirestorePaths.hospital(uid)).get();
    if (!doc.exists) return null;
    return HospitalModel.fromFirestore(doc);
  }

  Stream<HospitalModel> watchHospital(String uid) => _db
      .doc(FirestorePaths.hospital(uid))
      .snapshots()
      .map(HospitalModel.fromFirestore);

  Future<void> setHospitalActive(String uid, bool isActive) => _db
      .doc(FirestorePaths.hospital(uid))
      .set({'isActive': isActive}, SetOptions(merge: true));

  /// Update hospital bed availability counts
  Future<void> updateHospitalBeds(
    String hospitalId, {
    int? icuAvailable,
    int? advancedAvailable,
    int? normalAvailable,
    int? icuBeds,
    int? advancedBeds,
    int? normalBeds,
  }) async {
    final updates = <String, dynamic>{};
    if (icuAvailable != null) updates['icuAvailable'] = icuAvailable;
    if (advancedAvailable != null) {
      updates['advancedAvailable'] = advancedAvailable;
    }
    if (normalAvailable != null) updates['normalAvailable'] = normalAvailable;
    if (icuBeds != null) updates['icuBeds'] = icuBeds;
    if (advancedBeds != null) updates['advancedBeds'] = advancedBeds;
    if (normalBeds != null) updates['normalBeds'] = normalBeds;
    if (updates.isNotEmpty) {
      await _db
          .doc(FirestorePaths.hospital(hospitalId))
          .set(updates, SetOptions(merge: true));
    }
  }

  /// Get all active hospitals near a location (no bed filter).
  /// Used as fallback when no hospitals have matching beds available.
  Future<List<HospitalModel>> getAllActiveHospitalsNearby({
    required GeoPoint patientLocation,
    double radiusKm = 50,
  }) async {
    final snap = await _db
        .collection(FirestorePaths.hospitals)
        .where('isActive', isEqualTo: true)
        .get();

    final hospitals = snap.docs
        .map(HospitalModel.fromFirestore)
        .where((h) => h.location != null)
        .where((h) {
          final dist = LocationService.distanceKm(
            patientLocation.latitude,
            patientLocation.longitude,
            h.location!.latitude,
            h.location!.longitude,
          );
          return dist <= radiusKm;
        })
        .toList();

    hospitals.sort((a, b) {
      final dA = LocationService.distanceKm(
        patientLocation.latitude,
        patientLocation.longitude,
        a.location!.latitude,
        a.location!.longitude,
      );
      final dB = LocationService.distanceKm(
        patientLocation.latitude,
        patientLocation.longitude,
        b.location!.latitude,
        b.location!.longitude,
      );
      return dA.compareTo(dB);
    });

    return hospitals;
  }

  /// Get nearby hospitals with available beds for the given ambulance type.
  /// Sorted by rating DESC, then distance ASC.
  Future<List<HospitalModel>> getNearbyHospitalsWithBeds({
    required GeoPoint patientLocation,
    required AmbulanceType ambulanceType,
    double radiusKm = 50,
  }) async {
    final snap = await _db
        .collection(FirestorePaths.hospitals)
        .where('isActive', isEqualTo: true)
        .get();

    final hospitals = snap.docs
        .map(HospitalModel.fromFirestore)
        .where((h) => h.location != null)
        .where((h) => h.availableBedsForType(ambulanceType) > 0)
        .where((h) {
          final dist = LocationService.distanceKm(
            patientLocation.latitude,
            patientLocation.longitude,
            h.location!.latitude,
            h.location!.longitude,
          );
          return dist <= radiusKm;
        })
        .toList();

    hospitals.sort((a, b) {
      final ratingCompare = b.rating.compareTo(a.rating);
      if (ratingCompare != 0) return ratingCompare;
      final dA = LocationService.distanceKm(
        patientLocation.latitude,
        patientLocation.longitude,
        a.location!.latitude,
        a.location!.longitude,
      );
      final dB = LocationService.distanceKm(
        patientLocation.latitude,
        patientLocation.longitude,
        b.location!.latitude,
        b.location!.longitude,
      );
      return dA.compareTo(dB);
    });

    return hospitals;
  }

  // ─── Rescue Request ───────────────────────────────────────────────────────

  Future<RescueRequestModel?> getRequest(String requestId) async {
    final doc = await _db.doc(FirestorePaths.rescueRequest(requestId)).get();
    if (!doc.exists) return null;
    return RescueRequestModel.fromFirestore(doc);
  }

  Stream<RescueRequestModel> watchRequest(String requestId) => _db
      .doc(FirestorePaths.rescueRequest(requestId))
      .snapshots()
      .map(RescueRequestModel.fromFirestore);

  /// Driver accepts a request using a transaction to prevent race conditions.
  /// Returns true if this driver won, false if someone else already accepted.
  Future<bool> driverAcceptRequest(String requestId, String driverId) async {
    bool accepted = false;
    await _db.runTransaction((tx) async {
      final ref = _db.doc(FirestorePaths.rescueRequest(requestId));
      final snap = await tx.get(ref);
      final data = snap.data();
      if (data == null || data['assignedDriverId'] != null) return;

      tx.update(ref, {
        'assignedDriverId': driverId,
        'assignedDriverAcceptedAt': FieldValue.serverTimestamp(),
        'status': RequestStatus.driverAssigned.value,
      });
      accepted = true;
    });
    if (accepted) {
      await _db.doc(FirestorePaths.driver(driverId)).update({
        'isAvailable': false,
        'currentRequestId': requestId,
      });
      await _notifyWhatsappEventBestEffort(requestId, 'driver_assigned');
    }
    return accepted;
  }

  /// Driver selects a hospital after pickup
  Future<void> driverSelectHospital(String requestId, String hospitalId) async {
    await _db.doc(FirestorePaths.rescueRequest(requestId)).update({
      'assignedHospitalId': hospitalId,
      'hospitalChosenBy': 'driver',
      'status': RequestStatus.hospitalAssigned.value,
      'assignedHospitalAcceptedAt': FieldValue.serverTimestamp(),
    });
    await _notifyWhatsappEventBestEffort(requestId, 'hospital_selected');
  }

  /// Mark a pending request as ignored/declined by this driver so it does not
  /// reopen on the same device after navigation or app restart.
  Future<void> ignorePendingRequest(String requestId, String driverId) async {
    await _db.doc(FirestorePaths.rescueRequest(requestId)).set({
      'declinedDriverIds': FieldValue.arrayUnion([driverId]),
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }

  /// Confirm patient pickup. Auto-assigns hospital if patient pre-selected,
  /// otherwise transitions to awaitingHospitalChoice.
  Future<void> confirmPatientPickup(String requestId) async {
    final doc = await _db.doc(FirestorePaths.rescueRequest(requestId)).get();
    final data = doc.data();
    final preferredHospitalId = data?['preferredHospitalId'] as String?;
    final hasPreferredHospital =
        preferredHospitalId != null && preferredHospitalId.isNotEmpty;

    if (hasPreferredHospital) {
      await _db.doc(FirestorePaths.rescueRequest(requestId)).update({
        'status': RequestStatus.hospitalAssigned.value,
        'patientPickedUpAt': FieldValue.serverTimestamp(),
        'assignedHospitalId': preferredHospitalId,
        'hospitalChosenBy': 'patient',
        'assignedHospitalAcceptedAt': FieldValue.serverTimestamp(),
      });
    } else {
      await _db.doc(FirestorePaths.rescueRequest(requestId)).update({
        'status': RequestStatus.awaitingHospitalChoice.value,
        'patientPickedUpAt': FieldValue.serverTimestamp(),
      });
    }

    await _notifyWhatsappEventBestEffort(requestId, 'ambulance_arrived');
    if (hasPreferredHospital) {
      await _notifyWhatsappEventBestEffort(requestId, 'hospital_selected');
    }
  }

  Future<void> markInTransit(String requestId) => _db
      .doc(FirestorePaths.rescueRequest(requestId))
      .update({'status': RequestStatus.inTransit.value});

  /// Driver cancels mid-trip (releases the request back to pool).
  /// Reason: emergency, vehicle breakdown, etc.
  Future<void> cancelDriverTrip(
    String requestId,
    String driverId, {
    String reason = 'driver_cancelled',
  }) async {
    await _db.doc(FirestorePaths.rescueRequest(requestId)).update({
      'status': RequestStatus.pendingDriver.value,
      'assignedDriverId': null,
      'assignedDriverAcceptedAt': null,
      'declinedDriverIds': FieldValue.arrayUnion([driverId]),
      'driverCancellationReason': reason,
      'driverCancelledAt': FieldValue.serverTimestamp(),
    });
    await _db.doc(FirestorePaths.driver(driverId)).update({
      'isAvailable': true,
      'currentRequestId': null,
    });
  }

  /// Save FCM token on the driver's document
  Future<void> saveDriverFcmToken(String driverId, String token) async {
    await _db.doc(FirestorePaths.driver(driverId)).set({
      'fcmToken': token,
    }, SetOptions(merge: true));
  }

  /// Save FCM token on the hospital's document
  Future<void> saveHospitalFcmToken(String hospitalId, String token) async {
    await _db.doc(FirestorePaths.hospital(hospitalId)).set({
      'fcmToken': token,
    }, SetOptions(merge: true));
  }

  /// Update driver profile fields (excludes things they shouldn't change like uid, verificationStatus)
  Future<void> updateDriverProfile(
    String uid, {
    String? name,
    String? phone,
    String? vehicleNumber,
    String? licenseNumber,
  }) async {
    final updates = <String, dynamic>{};
    if (name != null) updates['name'] = name;
    if (phone != null) updates['phone'] = phone;
    if (vehicleNumber != null) updates['vehicleNumber'] = vehicleNumber;
    if (licenseNumber != null) updates['licenseNumber'] = licenseNumber;
    if (updates.isNotEmpty) {
      await _db
          .doc(FirestorePaths.driver(uid))
          .set(updates, SetOptions(merge: true));
    }
  }

  /// Get past completed/cancelled trips for the driver (for trip history).
  /// No composite index required — uses single equality filter + client-side
  /// filter and sort. Caps at 50 most recent.
  Stream<List<RescueRequestModel>> watchDriverTripHistory(String driverId) =>
      _db
          .collection(FirestorePaths.rescueRequests)
          .where('assignedDriverId', isEqualTo: driverId)
          .snapshots()
          .map((snap) {
            final all = snap.docs
                .map(RescueRequestModel.fromFirestore)
                .toList();
            // Client-side filter: only completed/cancelled
            final past = all
                .where(
                  (r) =>
                      r.status == RequestStatus.completed ||
                      r.status == RequestStatus.cancelled,
                )
                .toList();
            // Sort newest-first by createdAt
            past.sort((a, b) => b.createdAt.compareTo(a.createdAt));
            return past.take(50).toList();
          });

  Future<void> completeRide(String requestId, String driverId) async {
    // Freeing a hospital bed is handled server-side by the
    // onRequestCompleted Cloud Function (drivers cannot write hospital docs).
    await _db.doc(FirestorePaths.rescueRequest(requestId)).update({
      'status': RequestStatus.completed.value,
      'completedAt': FieldValue.serverTimestamp(),
    });
    await _db.doc(FirestorePaths.driver(driverId)).update({
      'isAvailable': true,
      'currentRequestId': null,
    });
    await _notifyWhatsappEventBestEffort(requestId, 'hospital_arrived');
  }

  Future<void> completeHospitalReceive(
    String requestId,
    String hospitalId,
  ) async {
    await _db.doc(FirestorePaths.hospital(hospitalId)).update({
      'isActive': true,
      'currentRequestId': null,
    });
    if (requestId.isNotEmpty) {
      await _db.doc(FirestorePaths.rescueRequest(requestId)).update({
        'patientReceivedAt': FieldValue.serverTimestamp(),
        'hospitalAckAt': FieldValue.serverTimestamp(),
        'hospitalAckBy': hospitalId,
        'updatedAt': FieldValue.serverTimestamp(),
      });
      await _notifyWhatsappEventBestEffort(requestId, 'mission_completed');
    }
  }

  // ─── Location Updates ─────────────────────────────────────────────────────

  Stream<Map<String, dynamic>?> watchDriverLocation(String driverId) => _db
      .doc(FirestorePaths.locationUpdate(driverId))
      .snapshots()
      .map((snap) => snap.exists ? snap.data() as Map<String, dynamic> : null);

  // ─── Active request for driver ────────────────────────────────────────────

  Stream<QuerySnapshot> watchActiveRequestForDriver(String driverId) => _db
      .collection(FirestorePaths.rescueRequests)
      .where('assignedDriverId', isEqualTo: driverId)
      .where(
        'status',
        whereIn: [
          RequestStatus.driverAssigned.value,
          RequestStatus.patientPickedUp.value,
          RequestStatus.awaitingHospitalChoice.value,
          RequestStatus.hospitalAssigned.value,
          RequestStatus.inTransit.value,
        ],
      )
      .snapshots();

  // ─── Active request for hospital ─────────────────────────────────────────

  Stream<QuerySnapshot> watchActiveRequestForHospital(String hospitalId) => _db
      .collection(FirestorePaths.rescueRequests)
      .where('assignedHospitalId', isEqualTo: hospitalId)
      .where(
        'status',
        whereIn: [
          RequestStatus.hospitalAssigned.value,
          RequestStatus.inTransit.value,
        ],
      )
      .snapshots();

  // ─── Pending requests ────────────────────────────────────────────────────

  /// Stream of all unassigned pending driver requests.
  /// Filter by ambulance type happens client-side.
  Stream<List<RescueRequestModel>> watchPendingDriverRequests() => _db
      .collection(FirestorePaths.rescueRequests)
      .where('status', isEqualTo: RequestStatus.pendingDriver.value)
      .snapshots()
      .map((snap) => snap.docs.map(RescueRequestModel.fromFirestore).toList());

  // ─── SOS Requests ────────────────────────────────────────────────────────

  Stream<List<SosRequestModel>> watchPendingSosRequests() => _db
      .collection('sos_requests')
      .where('status', isEqualTo: 'pending')
      .snapshots()
      .map((snap) => snap.docs.map(SosRequestModel.fromFirestore).toList());

  Future<void> acceptSosRequest(String sosId, String driverId) async {
    await _db.collection('sos_requests').doc(sosId).update({
      'status': 'assigned',
      'driverId': driverId,
      'assignedAt': FieldValue.serverTimestamp(),
    });
    await _db.doc(FirestorePaths.driver(driverId)).set({
      'isAvailable': false,
    }, SetOptions(merge: true));
  }

  Future<void> completeSosRequest(String sosId, String driverId) async {
    await _db.collection('sos_requests').doc(sosId).update({
      'status': 'resolved',
      'resolvedAt': FieldValue.serverTimestamp(),
    });
    await _db.doc(FirestorePaths.driver(driverId)).set({
      'isAvailable': true,
    }, SetOptions(merge: true));
  }

  Stream<SosRequestModel?> watchAssignedSos(String driverId) => _db
      .collection('sos_requests')
      .where('driverId', isEqualTo: driverId)
      .snapshots()
      .map((snap) {
        final active = snap.docs
            .map(SosRequestModel.fromFirestore)
            .where((s) => s.status == 'assigned')
            .toList();
        return active.isEmpty ? null : active.first;
      });

  // ─── Callback Requests ───────────────────────────────────────────────────

  Stream<List<CallbackRequestModel>> watchCallbackRequests() => _db
      .collection('callback_requests')
      .orderBy('createdAt', descending: true)
      .snapshots()
      .map(
        (snap) => snap.docs.map(CallbackRequestModel.fromFirestore).toList(),
      );

  Future<String> createCallbackRequest({
    required String patientName,
    required String patientPhone,
    String emergencyDescription = '',
    String ambulanceType = 'C',
    String urgencyLevel = 'stable',
  }) async {
    final ref = _db.collection('callback_requests').doc();
    await ref.set({
      'patientName': patientName,
      'patientPhone': patientPhone,
      'emergencyDescription': emergencyDescription,
      'ambulanceType': ambulanceType,
      'urgencyLevel': urgencyLevel,
      'status': 'pending_call',
      'adminNote': '',
      'createdAt': FieldValue.serverTimestamp(),
    });
    return ref.id;
  }

  Future<void> updateCallbackStatus(
    String id,
    String status, {
    String? adminNote,
    String? convertedRequestId,
  }) async {
    final updates = <String, dynamic>{'status': status};
    if (status == 'called') {
      updates['calledAt'] = FieldValue.serverTimestamp();
    }
    if (adminNote != null) updates['adminNote'] = adminNote;
    if (convertedRequestId != null) {
      updates['convertedRequestId'] = convertedRequestId;
    }
    await _db.collection('callback_requests').doc(id).update(updates);
  }

  // ─── Create Rescue Request ───────────────────────────────────────────────

  Future<String> createRescueRequest({
    required String patientName,
    required String patientPhone,
    required GeoPoint patientLocation,
    required String emergencyType,
    AmbulanceType ambulanceType = AmbulanceType.C,
    UrgencyLevel urgencyLevel = UrgencyLevel.stable,
    String emergencyDescription = '',
    String? preferredHospitalId,
    String source = 'app',
  }) async {
    final ref = _db.collection(FirestorePaths.rescueRequests).doc();
    await ref.set({
      'requestId': ref.id,
      'patientName': patientName,
      'patientPhone': patientPhone,
      'patientLocation': patientLocation,
      'emergencyType': emergencyType,
      'ambulanceType': ambulanceType.value,
      'urgencyLevel': urgencyLevel.value,
      'emergencyDescription': emergencyDescription,
      'preferredHospitalId': preferredHospitalId,
      'hospitalChosenBy': preferredHospitalId != null ? 'patient' : '',
      'source': source,
      'status': RequestStatus.pendingDriver.value,
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
      'currentDriverSearchRadius': 1,
      'notifiedDriverIds': [],
      'declinedDriverIds': [],
      'assignedDriverId': null,
      'currentHospitalSearchRadius': 1,
      'notifiedHospitalIds': [],
      'assignedHospitalId': null,
    });
    return ref.id;
  }
}
