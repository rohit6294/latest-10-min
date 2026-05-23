import 'package:cloud_firestore/cloud_firestore.dart';
import 'ambulance_type.dart';

enum RequestStatus {
  pendingDriver,
  driverAssigned,
  patientPickedUp,
  awaitingHospitalChoice, // patient didn't pick → driver must select
  hospitalAssigned,
  inTransit,
  completed,
  cancelled,
}

extension RequestStatusX on RequestStatus {
  String get value {
    switch (this) {
      case RequestStatus.pendingDriver:
        return 'pending_driver';
      case RequestStatus.driverAssigned:
        return 'driver_assigned';
      case RequestStatus.patientPickedUp:
        return 'patient_picked_up';
      case RequestStatus.awaitingHospitalChoice:
        return 'awaiting_hospital_choice';
      case RequestStatus.hospitalAssigned:
        return 'hospital_assigned';
      case RequestStatus.inTransit:
        return 'in_transit';
      case RequestStatus.completed:
        return 'completed';
      case RequestStatus.cancelled:
        return 'cancelled';
    }
  }

  static RequestStatus fromString(String s) {
    switch (s) {
      case 'driver_assigned':
        return RequestStatus.driverAssigned;
      case 'patient_picked_up':
        return RequestStatus.patientPickedUp;
      case 'awaiting_hospital_choice':
        return RequestStatus.awaitingHospitalChoice;
      case 'pending_hospital': // legacy compatibility
      case 'hospital_assigned':
        return RequestStatus.hospitalAssigned;
      case 'in_transit':
        return RequestStatus.inTransit;
      case 'completed':
        return RequestStatus.completed;
      case 'cancelled':
        return RequestStatus.cancelled;
      default:
        return RequestStatus.pendingDriver;
    }
  }
}

enum UrgencyLevel { critical, serious, stable }

extension UrgencyLevelX on UrgencyLevel {
  String get value {
    switch (this) {
      case UrgencyLevel.critical:
        return 'critical';
      case UrgencyLevel.serious:
        return 'serious';
      case UrgencyLevel.stable:
        return 'stable';
    }
  }

  String get label {
    switch (this) {
      case UrgencyLevel.critical:
        return 'CRITICAL';
      case UrgencyLevel.serious:
        return 'SERIOUS';
      case UrgencyLevel.stable:
        return 'STABLE';
    }
  }

  static UrgencyLevel fromString(String? s) {
    switch (s) {
      case 'critical':
        return UrgencyLevel.critical;
      case 'serious':
        return UrgencyLevel.serious;
      case 'stable':
      default:
        return UrgencyLevel.stable;
    }
  }
}

class RescueRequestModel {
  final String requestId;
  final String patientName;
  final String patientPhone;
  final GeoPoint patientLocation;
  final String emergencyType;
  final RequestStatus status;
  final DateTime createdAt;

  // New fields
  final AmbulanceType ambulanceType;
  final UrgencyLevel urgencyLevel;
  final String emergencyDescription;
  final String? preferredHospitalId;
  final String hospitalChosenBy; // 'patient' | 'driver' | ''
  final String source; // 'sos_web' | 'callback' | 'app'

  // Driver phase
  final int currentDriverSearchRadius;
  final List<String> notifiedDriverIds;
  final List<String> declinedDriverIds;
  final String? assignedDriverId;

  // Hospital phase
  final int currentHospitalSearchRadius;
  final List<String> notifiedHospitalIds;
  final String? assignedHospitalId;

  const RescueRequestModel({
    required this.requestId,
    required this.patientName,
    required this.patientPhone,
    required this.patientLocation,
    this.emergencyType = 'general',
    required this.status,
    required this.createdAt,
    this.ambulanceType = AmbulanceType.C,
    this.urgencyLevel = UrgencyLevel.stable,
    this.emergencyDescription = '',
    this.preferredHospitalId,
    this.hospitalChosenBy = '',
    this.source = 'app',
    this.currentDriverSearchRadius = 1,
    this.notifiedDriverIds = const [],
    this.declinedDriverIds = const [],
    this.assignedDriverId,
    this.currentHospitalSearchRadius = 1,
    this.notifiedHospitalIds = const [],
    this.assignedHospitalId,
  });

  factory RescueRequestModel.fromFirestore(DocumentSnapshot doc) {
    final data = (doc.data() as Map<String, dynamic>?) ?? {};
    return RescueRequestModel(
      requestId: doc.id,
      patientName: data['patientName'] ?? 'Unknown Patient',
      patientPhone: data['patientPhone'] ?? '',
      patientLocation:
          data['patientLocation'] as GeoPoint? ?? const GeoPoint(0, 0),
      emergencyType: data['emergencyType'] ?? 'general',
      status: RequestStatusX.fromString(data['status'] ?? 'pending_driver'),
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      ambulanceType: AmbulanceTypeX.fromString(
        data['ambulanceType'] as String?,
      ),
      urgencyLevel: UrgencyLevelX.fromString(data['urgencyLevel'] as String?),
      emergencyDescription: data['emergencyDescription'] as String? ?? '',
      preferredHospitalId: data['preferredHospitalId'] as String?,
      hospitalChosenBy: data['hospitalChosenBy'] as String? ?? '',
      source: data['source'] as String? ?? 'app',
      currentDriverSearchRadius: data['currentDriverSearchRadius'] ?? 1,
      notifiedDriverIds: List<String>.from(data['notifiedDriverIds'] ?? []),
      declinedDriverIds: List<String>.from(data['declinedDriverIds'] ?? []),
      assignedDriverId: data['assignedDriverId'],
      currentHospitalSearchRadius: data['currentHospitalSearchRadius'] ?? 1,
      notifiedHospitalIds: List<String>.from(data['notifiedHospitalIds'] ?? []),
      assignedHospitalId: data['assignedHospitalId'],
    );
  }

  Map<String, dynamic> toFirestore() => {
    'patientName': patientName,
    'patientPhone': patientPhone,
    'patientLocation': patientLocation,
    'emergencyType': emergencyType,
    'status': status.value,
    'createdAt': FieldValue.serverTimestamp(),
    'ambulanceType': ambulanceType.value,
    'urgencyLevel': urgencyLevel.value,
    'emergencyDescription': emergencyDescription,
    'preferredHospitalId': preferredHospitalId,
    'hospitalChosenBy': hospitalChosenBy,
    'source': source,
    'currentDriverSearchRadius': currentDriverSearchRadius,
    'notifiedDriverIds': notifiedDriverIds,
    'declinedDriverIds': declinedDriverIds,
    'assignedDriverId': assignedDriverId,
    'currentHospitalSearchRadius': currentHospitalSearchRadius,
    'notifiedHospitalIds': notifiedHospitalIds,
    'assignedHospitalId': assignedHospitalId,
  };
}
