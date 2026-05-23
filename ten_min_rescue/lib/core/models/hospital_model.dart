import 'package:cloud_firestore/cloud_firestore.dart';
import 'ambulance_type.dart';

class HospitalModel {
  final String uid;
  final String name;
  final String phone;
  final String address;
  final String fcmToken;
  final bool isActive;
  final GeoPoint? location;
  final String geohash;
  final List<String> specializations;
  final List<String> facilities;
  final String? currentRequestId;

  // Bed availability per ambulance type
  final int icuBeds;
  final int icuAvailable;
  final int advancedBeds;
  final int advancedAvailable;
  final int normalBeds;
  final int normalAvailable;
  final double rating; // 0.0 to 5.0

  const HospitalModel({
    required this.uid,
    required this.name,
    required this.phone,
    this.address = '',
    this.fcmToken = '',
    this.isActive = false,
    this.location,
    this.geohash = '',
    this.specializations = const [],
    this.facilities = const [],
    this.currentRequestId,
    this.icuBeds = 0,
    this.icuAvailable = 0,
    this.advancedBeds = 0,
    this.advancedAvailable = 0,
    this.normalBeds = 0,
    this.normalAvailable = 0,
    this.rating = 0.0,
  });

  factory HospitalModel.fromFirestore(DocumentSnapshot doc) {
    final data = (doc.data() as Map<String, dynamic>?) ?? {};
    return HospitalModel(
      uid: doc.id,
      name: data['name'] ?? '',
      phone: data['phone'] ?? '',
      address: data['address'] ?? '',
      fcmToken: data['fcmToken'] ?? '',
      isActive: data['isActive'] ?? false,
      location: data['location'] as GeoPoint?,
      geohash: data['geohash'] ?? '',
      specializations: List<String>.from(data['specializations'] ?? []),
      facilities: List<String>.from(data['facilities'] ?? []),
      currentRequestId: data['currentRequestId'],
      icuBeds: (data['icuBeds'] as num?)?.toInt() ?? 0,
      icuAvailable: (data['icuAvailable'] as num?)?.toInt() ?? 0,
      advancedBeds: (data['advancedBeds'] as num?)?.toInt() ?? 0,
      advancedAvailable: (data['advancedAvailable'] as num?)?.toInt() ?? 0,
      normalBeds: (data['normalBeds'] as num?)?.toInt() ?? 0,
      normalAvailable: (data['normalAvailable'] as num?)?.toInt() ?? 0,
      rating: (data['rating'] as num?)?.toDouble() ?? 0.0,
    );
  }

  Map<String, dynamic> toFirestore() => {
    'uid': uid,
    'name': name,
    'phone': phone,
    'address': address,
    'fcmToken': fcmToken,
    'isActive': isActive,
    if (location != null) 'location': location,
    'geohash': geohash,
    'specializations': specializations,
    'facilities': facilities,
    'currentRequestId': currentRequestId,
    'icuBeds': icuBeds,
    'icuAvailable': icuAvailable,
    'advancedBeds': advancedBeds,
    'advancedAvailable': advancedAvailable,
    'normalBeds': normalBeds,
    'normalAvailable': normalAvailable,
    'rating': rating,
  };

  /// Returns available beds for the given ambulance type
  int availableBedsForType(AmbulanceType type) {
    switch (type) {
      case AmbulanceType.A:
        return icuAvailable;
      case AmbulanceType.B:
        return advancedAvailable;
      case AmbulanceType.C:
        return normalAvailable;
    }
  }

  /// Conservative bed count shown to drivers — 30% less than the hospital's
  /// declared availability (floored, never negative). Hospitals tend to
  /// over-state capacity, so the driver app should plan against a buffered
  /// number.
  static int _driverDiscount(int v) =>
      v <= 0 ? 0 : (v * 0.7).floor();

  int get icuAvailableForDriver => _driverDiscount(icuAvailable);
  int get advancedAvailableForDriver => _driverDiscount(advancedAvailable);
  int get normalAvailableForDriver => _driverDiscount(normalAvailable);

  /// Driver-facing version of [availableBedsForType] — 30% lower than the
  /// hospital-reported number.
  int availableBedsForDriver(AmbulanceType type) {
    switch (type) {
      case AmbulanceType.A:
        return icuAvailableForDriver;
      case AmbulanceType.B:
        return advancedAvailableForDriver;
      case AmbulanceType.C:
        return normalAvailableForDriver;
    }
  }

  /// Returns total beds for the given ambulance type
  int totalBedsForType(AmbulanceType type) {
    switch (type) {
      case AmbulanceType.A:
        return icuBeds;
      case AmbulanceType.B:
        return advancedBeds;
      case AmbulanceType.C:
        return normalBeds;
    }
  }

  HospitalModel copyWith({
    bool? isActive,
    GeoPoint? location,
    String? geohash,
    String? currentRequestId,
    String? fcmToken,
    int? icuBeds,
    int? icuAvailable,
    int? advancedBeds,
    int? advancedAvailable,
    int? normalBeds,
    int? normalAvailable,
    double? rating,
    List<String>? facilities,
  }) => HospitalModel(
    uid: uid,
    name: name,
    phone: phone,
    address: address,
    fcmToken: fcmToken ?? this.fcmToken,
    isActive: isActive ?? this.isActive,
    location: location ?? this.location,
    geohash: geohash ?? this.geohash,
    specializations: specializations,
    currentRequestId: currentRequestId ?? this.currentRequestId,
    icuBeds: icuBeds ?? this.icuBeds,
    icuAvailable: icuAvailable ?? this.icuAvailable,
    advancedBeds: advancedBeds ?? this.advancedBeds,
    advancedAvailable: advancedAvailable ?? this.advancedAvailable,
    normalBeds: normalBeds ?? this.normalBeds,
    normalAvailable: normalAvailable ?? this.normalAvailable,
    rating: rating ?? this.rating,
    facilities: facilities ?? this.facilities,
  );
}
