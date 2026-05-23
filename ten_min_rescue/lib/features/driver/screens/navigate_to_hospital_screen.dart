import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:go_router/go_router.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:wakelock_plus/wakelock_plus.dart';
import 'dart:async';
import '../../../core/services/firestore_service.dart';
import '../../../core/services/location_service.dart';
import '../../../core/services/routing_service.dart';
import '../../../core/models/rescue_request_model.dart';
import '../../../core/models/hospital_model.dart';
import '../../../core/models/ambulance_type.dart';
import '../../../core/constants/app_colors.dart';

class NavigateToHospitalScreen extends StatefulWidget {
  final String requestId;
  const NavigateToHospitalScreen({super.key, required this.requestId});

  @override
  State<NavigateToHospitalScreen> createState() =>
      _NavigateToHospitalScreenState();
}

class _NavigateToHospitalScreenState extends State<NavigateToHospitalScreen> {
  final _firestoreService = FirestoreService();
  final _locationService = LocationService();
  final _uid = FirebaseAuth.instance.currentUser!.uid;
  final _mapController = MapController();

  LatLng? _driverLocation;
  HospitalModel? _hospital;
  bool _completing = false;
  bool _markedInTransit = false;

  // Routing
  List<LatLng> _routePoints = [];
  double? _routeDistanceKm;
  double? _routeDurationMin;
  Timer? _routeRefreshTimer;
  LatLng? _lastRouteFromPoint;

  @override
  void initState() {
    super.initState();
    WakelockPlus.enable();
    _startTracking();
  }

  void _startTracking() {
    _locationService.startTracking(
      driverId: _uid,
      requestId: widget.requestId,
      onPosition: (Position pos) {
        if (!mounted) return;
        final newLoc = LatLng(pos.latitude, pos.longitude);
        setState(() => _driverLocation = newLoc);
        if (!_markedInTransit) {
          _markedInTransit = true;
          _firestoreService.markInTransit(widget.requestId);
        }
        _maybeRefreshRoute();
      },
    );
    _routeRefreshTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      _maybeRefreshRoute(force: true);
    });
  }

  void _maybeRefreshRoute({bool force = false}) {
    if (_driverLocation == null || _hospital?.location == null) return;
    final hospLatLng = LatLng(
      _hospital!.location!.latitude,
      _hospital!.location!.longitude,
    );
    if (!force && _lastRouteFromPoint != null) {
      final moved = LocationService.distanceKm(
        _lastRouteFromPoint!.latitude,
        _lastRouteFromPoint!.longitude,
        _driverLocation!.latitude,
        _driverLocation!.longitude,
      );
      if (moved < 0.1) return;
    }
    _lastRouteFromPoint = _driverLocation;
    RoutingService.getRoute(_driverLocation!, hospLatLng).then((result) {
      if (!mounted || result == null) return;
      setState(() {
        _routePoints = result.points;
        _routeDistanceKm = result.distanceKm;
        _routeDurationMin = result.durationMinutes;
      });
    });
  }

  double? _distanceKm() {
    if (_routeDistanceKm != null) return _routeDistanceKm;
    if (_driverLocation == null || _hospital?.location == null) return null;
    return LocationService.distanceKm(
      _driverLocation!.latitude,
      _driverLocation!.longitude,
      _hospital!.location!.latitude,
      _hospital!.location!.longitude,
    );
  }

  double? _etaMinutes() {
    if (_routeDurationMin != null) return _routeDurationMin;
    final d = _distanceKm();
    if (d == null) return null;
    return d / 40 * 60;
  }

  Future<void> _openGoogleMaps() async {
    if (_hospital?.location == null) return;
    final uri = Uri.parse(
      'https://www.google.com/maps/dir/?api=1&destination=${_hospital!.location!.latitude},${_hospital!.location!.longitude}&travelmode=driving',
    );
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _callHospital(String phone) async {
    final uri = Uri.parse('tel:$phone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  Future<void> _completeRide() async {
    if (_completing) return;
    setState(() => _completing = true);
    try {
      _locationService.stopTracking();
      await _firestoreService.completeRide(widget.requestId, _uid);
      if (mounted) context.go('/driver/ride-complete');
    } catch (e) {
      if (mounted) {
        setState(() => _completing = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to complete: $e'),
            backgroundColor: AppColors.brandRed,
          ),
        );
      }
    }
  }

  Future<void> _confirmCancel() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(
          'Cancel Trip?',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w700),
        ),
        content: Text(
          'Patient is in your ambulance. Only cancel in true emergency. Dispatch will be notified.',
          style: GoogleFonts.poppins(fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Keep Trip'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: AppColors.brandRed),
            child: const Text('Yes, Cancel'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      _locationService.stopTracking();
      await _firestoreService.cancelDriverTrip(
        widget.requestId,
        _uid,
        reason: 'driver_cancelled_in_transit',
      );
      if (mounted) context.go('/driver/home');
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed: $e'),
            backgroundColor: AppColors.brandRed,
          ),
        );
      }
    }
  }

  Widget _bedTypePill(AmbulanceType type, HospitalModel hospital) {
    Color color = type == AmbulanceType.A
        ? AppColors.brandRed
        : type == AmbulanceType.B
        ? AppColors.warningAmber
        : AppColors.onlineGreen;
    return Align(
      alignment: Alignment.centerLeft,
      child: GestureDetector(
        onTap: () => _changeBedTypeDialog(hospital, type),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: color.withValues(alpha: 0.3)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.single_bed_rounded, color: color, size: 14),
              const SizedBox(width: 6),
              Text(
                'Bed: ${type.label}',
                style: GoogleFonts.poppins(
                  color: color,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(width: 6),
              Icon(Icons.edit, color: color, size: 12),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _changeBedTypeDialog(
    HospitalModel hospital,
    AmbulanceType currentType,
  ) async {
    final selectedType = await showDialog<AmbulanceType>(
      context: context,
      builder: (context) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text(
          'Select Bed Type Required',
          style: GoogleFonts.poppins(
            fontWeight: FontWeight.w700,
            fontSize: 18,
            color: AppColors.navy,
          ),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _bedTypeOption(
              context,
              type: AmbulanceType.A,
              label: 'ICU Bed (Type A)',
              color: AppColors.brandRed,
              available: hospital.icuAvailable,
              total: hospital.icuBeds,
            ),
            const SizedBox(height: 10),
            _bedTypeOption(
              context,
              type: AmbulanceType.B,
              label: 'Advanced Bed (Type B)',
              color: AppColors.warningAmber,
              available: hospital.advancedAvailable,
              total: hospital.advancedBeds,
            ),
            const SizedBox(height: 10),
            _bedTypeOption(
              context,
              type: AmbulanceType.C,
              label: 'Normal Bed (Type C)',
              color: AppColors.onlineGreen,
              available: hospital.normalAvailable,
              total: hospital.normalBeds,
            ),
          ],
        ),
      ),
    );

    if (selectedType != null && selectedType != currentType) {
      try {
        await FirebaseFirestore.instance
            .collection('rescue_requests')
            .doc(widget.requestId)
            .update({'ambulanceType': selectedType.value});
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Bed type updated to ${selectedType.label}!'),
            backgroundColor: AppColors.onlineGreen,
          ),
        );
      } catch (e) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Failed to update bed type.'),
            backgroundColor: AppColors.brandRed,
          ),
        );
      }
    }
  }

  Widget _bedTypeOption(
    BuildContext context, {
    required AmbulanceType type,
    required String label,
    required Color color,
    required int available,
    required int total,
  }) {
    final hasBeds = available > 0;
    return Material(
      color: hasBeds ? Colors.grey[50] : Colors.grey[100],
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: hasBeds ? () => Navigator.pop(context, type) : null,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            border: Border.all(
              color: hasBeds ? const Color(0xFFEEF2F6) : Colors.transparent,
            ),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.single_bed_rounded, color: color, size: 18),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: GoogleFonts.poppins(
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                        color: hasBeds ? AppColors.navy : AppColors.textLight,
                      ),
                    ),
                    Text(
                      '$available of $total beds available',
                      style: GoogleFonts.poppins(
                        fontSize: 11,
                        color: hasBeds
                            ? AppColors.textSecondary
                            : AppColors.textLight,
                      ),
                    ),
                  ],
                ),
              ),
              if (!hasBeds)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.brandRed.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    'FULL',
                    style: GoogleFonts.poppins(
                      color: AppColors.brandRed,
                      fontSize: 9,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                )
              else
                const Icon(
                  Icons.arrow_forward_ios,
                  size: 12,
                  color: AppColors.textLight,
                ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    WakelockPlus.disable();
    _routeRefreshTimer?.cancel();
    _locationService.stopTracking();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: StreamBuilder<RescueRequestModel>(
        stream: _firestoreService.watchRequest(widget.requestId),
        builder: (context, snapshot) {
          if (!snapshot.hasData) {
            return const Center(
              child: CircularProgressIndicator(color: AppColors.brandRed),
            );
          }
          final request = snapshot.data!;

          // Load hospital once when assignedHospitalId is available
          if (request.assignedHospitalId != null && _hospital == null) {
            _firestoreService.getHospital(request.assignedHospitalId!).then((
              h,
            ) {
              if (!mounted || h == null) return;
              setState(() => _hospital = h);
              if (h.location != null) {
                _mapController.move(
                  LatLng(h.location!.latitude, h.location!.longitude),
                  13,
                );
                // Trigger initial route fetch
                _maybeRefreshRoute(force: true);
              }
            });
          }

          final hospitalLatLng = _hospital?.location != null
              ? LatLng(
                  _hospital!.location!.latitude,
                  _hospital!.location!.longitude,
                )
              : null;
          final initialCenter =
              hospitalLatLng ??
              _driverLocation ??
              const LatLng(22.5726, 88.3639);
          final dist = _distanceKm();
          final etaMin = _etaMinutes()?.round();
          final isNearHospital = dist != null && dist <= 0.2;

          return Stack(
            children: [
              // ── Full-screen map ────────────────────────────────────────────
              FlutterMap(
                mapController: _mapController,
                options: MapOptions(
                  initialCenter: initialCenter,
                  initialZoom: 13,
                ),
                children: [
                  TileLayer(
                    urlTemplate:
                        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                    userAgentPackageName: 'com.tenminrescue.ten_min_res',
                  ),
                  if (_routePoints.isNotEmpty)
                    PolylineLayer(
                      polylines: [
                        Polyline(
                          points: _routePoints,
                          strokeWidth: 5,
                          color: AppColors.onlineGreen.withValues(alpha: 0.85),
                        ),
                      ],
                    )
                  else if (_driverLocation != null && hospitalLatLng != null)
                    PolylineLayer(
                      polylines: [
                        Polyline(
                          points: [_driverLocation!, hospitalLatLng],
                          strokeWidth: 3,
                          color: AppColors.onlineGreen.withValues(alpha: 0.4),
                        ),
                      ],
                    ),
                  MarkerLayer(
                    markers: [
                      if (hospitalLatLng != null)
                        Marker(
                          point: hospitalLatLng,
                          width: 56,
                          height: 56,
                          child: Container(
                            decoration: BoxDecoration(
                              color: AppColors.onlineGreen,
                              shape: BoxShape.circle,
                              border: Border.all(color: Colors.white, width: 3),
                              boxShadow: [
                                BoxShadow(
                                  color: AppColors.onlineGreen.withValues(
                                    alpha: 0.5,
                                  ),
                                  blurRadius: 12,
                                  spreadRadius: 4,
                                ),
                              ],
                            ),
                            child: const Icon(
                              Icons.local_hospital_rounded,
                              color: Colors.white,
                              size: 28,
                            ),
                          ),
                        ),
                      if (_driverLocation != null)
                        Marker(
                          point: _driverLocation!,
                          width: 44,
                          height: 44,
                          child: Container(
                            decoration: BoxDecoration(
                              color: AppColors.accentBlue,
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: Colors.white,
                                width: 2.5,
                              ),
                              boxShadow: [
                                BoxShadow(
                                  color: AppColors.accentBlue.withValues(
                                    alpha: 0.5,
                                  ),
                                  blurRadius: 8,
                                  spreadRadius: 2,
                                ),
                              ],
                            ),
                            child: const Icon(
                              Icons.directions_car_rounded,
                              color: Colors.white,
                              size: 22,
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
              ),

              // ── Top bar ────────────────────────────────────────────────────
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: Container(
                  padding: EdgeInsets.only(
                    top: MediaQuery.of(context).padding.top + 8,
                    bottom: 12,
                    left: 16,
                    right: 12,
                  ),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        AppColors.navy,
                        AppColors.navy.withValues(alpha: 0.92),
                      ],
                    ),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: AppColors.onlineGreen,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(
                          Icons.local_hospital_rounded,
                          color: Colors.white,
                          size: 20,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'EN ROUTE TO HOSPITAL',
                              style: GoogleFonts.poppins(
                                color: Colors.white,
                                fontSize: 11,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 1.5,
                              ),
                            ),
                            Text(
                              'Patient onboard',
                              style: GoogleFonts.poppins(
                                color: Colors.white70,
                                fontSize: 11,
                              ),
                            ),
                          ],
                        ),
                      ),
                      _circleBtn(
                        icon: Icons.my_location_rounded,
                        onTap: () {
                          if (hospitalLatLng != null) {
                            _mapController.move(hospitalLatLng, 14);
                          }
                        },
                      ),
                    ],
                  ),
                ),
              ),

              // ── Bottom sheet ───────────────────────────────────────────────
              Positioned(
                bottom: 0,
                left: 0,
                right: 0,
                child: Container(
                  padding: EdgeInsets.only(
                    top: 16,
                    left: 16,
                    right: 16,
                    bottom: MediaQuery.of(context).padding.bottom + 16,
                  ),
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.vertical(
                      top: Radius.circular(24),
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Color(0x33000000),
                        blurRadius: 20,
                        offset: Offset(0, -4),
                      ),
                    ],
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 40,
                        height: 4,
                        margin: const EdgeInsets.only(bottom: 12),
                        decoration: BoxDecoration(
                          color: Colors.grey[300],
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                      if (_hospital != null) ...[
                        Row(
                          children: [
                            Container(
                              width: 44,
                              height: 44,
                              decoration: BoxDecoration(
                                color: AppColors.onlineGreen.withValues(
                                  alpha: 0.12,
                                ),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Icon(
                                Icons.local_hospital,
                                color: AppColors.onlineGreen,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    _hospital!.name,
                                    style: GoogleFonts.poppins(
                                      color: AppColors.navy,
                                      fontWeight: FontWeight.w700,
                                      fontSize: 15,
                                    ),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  Text(
                                    _hospital!.address.isEmpty
                                        ? 'Address not set'
                                        : _hospital!.address,
                                    style: GoogleFonts.poppins(
                                      color: AppColors.textSecondary,
                                      fontSize: 12,
                                    ),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ],
                              ),
                            ),
                            if (_hospital!.phone.isNotEmpty)
                              _iconBtn(
                                icon: Icons.phone_rounded,
                                color: AppColors.onlineGreen,
                                onTap: () => _callHospital(_hospital!.phone),
                              ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        _bedTypePill(request.ambulanceType, _hospital!),
                      ] else
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: Text(
                            'Loading hospital...',
                            style: GoogleFonts.poppins(
                              color: AppColors.textSecondary,
                              fontSize: 13,
                            ),
                          ),
                        ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          _chip(
                            icon: Icons.straighten_rounded,
                            label: dist != null
                                ? '${dist.toStringAsFixed(1)} km'
                                : '— km',
                            color: AppColors.accentBlue,
                          ),
                          const SizedBox(width: 8),
                          _chip(
                            icon: Icons.access_time_rounded,
                            label: etaMin != null ? '~$etaMin min' : '— min',
                            color: AppColors.warningAmber,
                          ),
                          const SizedBox(width: 8),
                          _chip(
                            icon: Icons.location_on_rounded,
                            label: 'Live',
                            color: AppColors.onlineGreen,
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: _hospital != null
                                  ? _openGoogleMaps
                                  : null,
                              icon: const Icon(
                                Icons.navigation_rounded,
                                size: 18,
                              ),
                              label: const Text('Maps'),
                              style: OutlinedButton.styleFrom(
                                padding: const EdgeInsets.symmetric(
                                  vertical: 13,
                                ),
                                side: const BorderSide(
                                  color: AppColors.accentBlue,
                                ),
                                foregroundColor: AppColors.accentBlue,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            flex: 2,
                            child: ElevatedButton(
                              onPressed: _hospital == null || _completing
                                  ? null
                                  : _completeRide,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: isNearHospital
                                    ? AppColors.onlineGreen
                                    : AppColors.brandRed,
                                padding: const EdgeInsets.symmetric(
                                  vertical: 13,
                                ),
                              ),
                              child: _completing
                                  ? const SizedBox(
                                      width: 20,
                                      height: 20,
                                      child: CircularProgressIndicator(
                                        color: Colors.white,
                                        strokeWidth: 2,
                                      ),
                                    )
                                  : Text(
                                      isNearHospital
                                          ? '✓ Arrived at Hospital'
                                          : 'Mark Arrived',
                                      style: GoogleFonts.poppins(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w700,
                                        fontSize: 13,
                                      ),
                                    ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      TextButton.icon(
                        onPressed: _confirmCancel,
                        icon: const Icon(
                          Icons.cancel_outlined,
                          size: 16,
                          color: AppColors.brandRed,
                        ),
                        label: Text(
                          'Cancel Trip',
                          style: GoogleFonts.poppins(
                            color: AppColors.brandRed,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _circleBtn({required IconData icon, required VoidCallback onTap}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.2),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, color: Colors.white, size: 18),
      ),
    );
  }

  Widget _iconBtn({
    required IconData icon,
    required Color color,
    required VoidCallback onTap,
  }) {
    return Material(
      color: color,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Container(
          width: 44,
          height: 44,
          alignment: Alignment.center,
          child: Icon(icon, color: Colors.white, size: 22),
        ),
      ),
    );
  }

  Widget _chip({
    required IconData icon,
    required String label,
    required Color color,
  }) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 8),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: color.withValues(alpha: 0.2)),
        ),
        child: Column(
          children: [
            Icon(icon, color: color, size: 16),
            const SizedBox(height: 2),
            Text(
              label,
              style: GoogleFonts.poppins(
                color: color,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}
