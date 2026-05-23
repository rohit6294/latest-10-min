import 'package:flutter/material.dart';
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
import '../../../core/constants/app_colors.dart';

class NavigateToPatientScreen extends StatefulWidget {
  final String requestId;
  const NavigateToPatientScreen({super.key, required this.requestId});

  @override
  State<NavigateToPatientScreen> createState() =>
      _NavigateToPatientScreenState();
}

class _NavigateToPatientScreenState extends State<NavigateToPatientScreen> {
  final _firestoreService = FirestoreService();
  final _locationService = LocationService();
  final _uid = FirebaseAuth.instance.currentUser!.uid;
  final _mapController = MapController();

  LatLng? _driverLocation;
  LatLng? _patientLocation;
  bool _cancelling = false;

  // Routing
  List<LatLng> _routePoints = [];
  double? _routeDistanceKm;
  double? _routeDurationMin;
  Timer? _routeRefreshTimer;
  LatLng? _lastRouteFromPoint;

  @override
  void initState() {
    super.initState();
    WakelockPlus.enable(); // keep screen on during navigation
    _startLocationTracking();
  }

  void _startLocationTracking() {
    _locationService.startTracking(
      driverId: _uid,
      requestId: widget.requestId,
      onPosition: (Position pos) {
        if (!mounted) return;
        final newLoc = LatLng(pos.latitude, pos.longitude);
        setState(() => _driverLocation = newLoc);
        _maybeRefreshRoute();
      },
    );
    // Periodic route refresh as fallback (in case GPS doesn't trigger a moves)
    _routeRefreshTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      _maybeRefreshRoute(force: true);
    });
  }

  void _maybeRefreshRoute({bool force = false}) {
    if (_driverLocation == null || _patientLocation == null) return;
    // Only refetch route if moved >100m since last fetch, or forced
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
    RoutingService.getRoute(_driverLocation!, _patientLocation!).then((result) {
      if (!mounted || result == null) return;
      setState(() {
        _routePoints = result.points;
        _routeDistanceKm = result.distanceKm;
        _routeDurationMin = result.durationMinutes;
      });
    });
  }

  double? _distanceKm() {
    // Prefer OSRM road distance if available
    if (_routeDistanceKm != null) return _routeDistanceKm;
    if (_driverLocation == null || _patientLocation == null) return null;
    return LocationService.distanceKm(
      _driverLocation!.latitude,
      _driverLocation!.longitude,
      _patientLocation!.latitude,
      _patientLocation!.longitude,
    );
  }

  double? _etaMinutes() {
    // Prefer OSRM duration
    if (_routeDurationMin != null) return _routeDurationMin;
    final d = _distanceKm();
    if (d == null) return null;
    return d / 40 * 60; // 40 km/h fallback
  }

  bool _isNearPatient() {
    final d = _distanceKm();
    return d != null && d <= 0.15;
  }

  Future<void> _openGoogleMaps() async {
    if (_patientLocation == null) return;
    final uri = Uri.parse(
      'https://www.google.com/maps/dir/?api=1&destination=${_patientLocation!.latitude},${_patientLocation!.longitude}&travelmode=driving',
    );
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _callPatient(String phone) async {
    final uri = Uri.parse('tel:$phone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  Future<void> _confirmCancel() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Cancel Trip?',
            style: GoogleFonts.poppins(fontWeight: FontWeight.w700)),
        content: Text(
          'This will release the request back to the pool so another driver can pick it up. Only do this in genuine emergencies.',
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
    setState(() => _cancelling = true);
    try {
      _locationService.stopTracking();
      await _firestoreService.cancelDriverTrip(widget.requestId, _uid);
      if (mounted) context.go('/driver/home');
    } catch (e) {
      if (mounted) {
        setState(() => _cancelling = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to cancel: $e'),
            backgroundColor: AppColors.brandRed,
          ),
        );
      }
    }
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

          // Handle external cancellation (admin/patient cancelled)
          if (request.status == RequestStatus.cancelled) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Trip was cancelled'),
                    backgroundColor: AppColors.brandRed,
                  ),
                );
                context.go('/driver/home');
              }
            });
          }

          final newPatientLoc = LatLng(
            request.patientLocation.latitude,
            request.patientLocation.longitude,
          );
          if (_patientLocation != newPatientLoc) {
            _patientLocation = newPatientLoc;
            // Trigger initial route fetch
            WidgetsBinding.instance.addPostFrameCallback((_) {
              _maybeRefreshRoute(force: true);
            });
          }

          final dist = _distanceKm();
          final etaRaw = _etaMinutes();
          final etaMin = etaRaw?.round();

          return Stack(
            children: [
              // ── Full-screen map ────────────────────────────────────────────
              FlutterMap(
                mapController: _mapController,
                options: MapOptions(
                  initialCenter: _patientLocation!,
                  initialZoom: 14,
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
                          color: AppColors.accentBlue.withValues(alpha: 0.85),
                        ),
                      ],
                    )
                  else if (_driverLocation != null && _patientLocation != null)
                    // Fallback: dashed straight line while OSRM is loading
                    PolylineLayer(
                      polylines: [
                        Polyline(
                          points: [_driverLocation!, _patientLocation!],
                          strokeWidth: 3,
                          color: AppColors.accentBlue.withValues(alpha: 0.4),
                        ),
                      ],
                    ),
                  MarkerLayer(
                    markers: [
                      // Patient marker
                      Marker(
                        point: _patientLocation!,
                        width: 56,
                        height: 56,
                        child: Container(
                          decoration: BoxDecoration(
                            color: AppColors.brandRed,
                            shape: BoxShape.circle,
                            border:
                                Border.all(color: Colors.white, width: 3),
                            boxShadow: [
                              BoxShadow(
                                color: AppColors.brandRed
                                    .withValues(alpha: 0.5),
                                blurRadius: 12,
                                spreadRadius: 4,
                              ),
                            ],
                          ),
                          child: const Icon(Icons.person_pin_rounded,
                              color: Colors.white, size: 28),
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
                                  color: Colors.white, width: 2.5),
                              boxShadow: [
                                BoxShadow(
                                  color: AppColors.accentBlue
                                      .withValues(alpha: 0.5),
                                  blurRadius: 8,
                                  spreadRadius: 2,
                                ),
                              ],
                            ),
                            child: const Icon(
                                Icons.directions_car_rounded,
                                color: Colors.white,
                                size: 22),
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
                          color: AppColors.brandRed,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(Icons.emergency_rounded,
                            color: Colors.white, size: 20),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'NAVIGATING TO PATIENT',
                              style: GoogleFonts.poppins(
                                color: Colors.white,
                                fontSize: 11,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 1.5,
                              ),
                            ),
                            Text(
                              request.urgencyLevel.label,
                              style: GoogleFonts.poppins(
                                color: AppColors
                                    .urgencyColor(request.urgencyLevel.value),
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                      // Recenter button
                      _circleBtn(
                        icon: Icons.my_location_rounded,
                        onTap: () {
                          if (_patientLocation != null) {
                            _mapController.move(_patientLocation!, 15);
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
                    borderRadius:
                        BorderRadius.vertical(top: Radius.circular(24)),
                    boxShadow: [
                      BoxShadow(
                          color: Color(0x33000000),
                          blurRadius: 20,
                          offset: Offset(0, -4)),
                    ],
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Drag handle
                      Container(
                        width: 40,
                        height: 4,
                        margin: const EdgeInsets.only(bottom: 12),
                        decoration: BoxDecoration(
                          color: Colors.grey[300],
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                      // Patient row
                      Row(
                        children: [
                          Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(
                              color: AppColors.brandRed.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Icon(Icons.person_pin_circle,
                                color: AppColors.brandRed),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  request.patientName,
                                  style: GoogleFonts.poppins(
                                    color: AppColors.navy,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 15,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                Text(
                                  request.emergencyType,
                                  style: GoogleFonts.poppins(
                                      color: AppColors.textSecondary,
                                      fontSize: 12),
                                ),
                              ],
                            ),
                          ),
                          if (request.patientPhone.isNotEmpty)
                            _iconBtn(
                              icon: Icons.phone_rounded,
                              color: AppColors.onlineGreen,
                              onTap: () => _callPatient(request.patientPhone),
                            ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      // ETA + Distance chips
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
                      // Action buttons
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: _openGoogleMaps,
                              icon: const Icon(Icons.navigation_rounded,
                                  size: 18),
                              label: const Text('Maps'),
                              style: OutlinedButton.styleFrom(
                                padding: const EdgeInsets.symmetric(
                                    vertical: 13),
                                side: const BorderSide(
                                    color: AppColors.accentBlue),
                                foregroundColor: AppColors.accentBlue,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            flex: 2,
                            child: ElevatedButton(
                              onPressed: () => context.go(
                                  '/driver/pickup-confirm/${widget.requestId}'),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppColors.onlineGreen,
                                padding: const EdgeInsets.symmetric(
                                    vertical: 13),
                              ),
                              child: Text(
                                '✓ Confirm Pickup',
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
                      const SizedBox(height: 10),
                      // Cancel trip
                      TextButton.icon(
                        onPressed: _cancelling ? null : _confirmCancel,
                        icon: const Icon(Icons.cancel_outlined,
                            size: 16, color: AppColors.brandRed),
                        label: Text(
                          _cancelling ? 'Cancelling...' : 'Cancel Trip',
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
