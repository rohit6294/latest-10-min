import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:wakelock_plus/wakelock_plus.dart';
import 'package:audioplayers/audioplayers.dart';
import 'dart:async';
import 'dart:convert';
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

  final AudioPlayer _audioPlayer = AudioPlayer();
  String? _playingInstructionId;

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

  /// Play a voice note inline. Accepts either a hosted URL or inline base64
  /// (the Spark-plan fallback when Firebase Storage isn't enabled).
  Future<void> _playVoiceNote(Map<String, dynamic> instruction) async {
    final id = instruction['id'] as String?;
    final url = instruction['audioUrl'] as String?;
    final b64 = instruction['audioBase64'] as String?;
    final mime = instruction['mimeType'] as String? ?? 'audio/webm';
    try {
      if (_playingInstructionId == id) {
        await _audioPlayer.stop();
        if (mounted) setState(() => _playingInstructionId = null);
        return;
      }
      await _audioPlayer.stop();
      if (url != null && url.isNotEmpty) {
        await _audioPlayer.play(UrlSource(url));
      } else if (b64 != null && b64.isNotEmpty) {
        await _audioPlayer.play(BytesSource(base64Decode(b64), mimeType: mime));
      } else {
        return;
      }
      if (mounted) setState(() => _playingInstructionId = id);
      _audioPlayer.onPlayerComplete.first.then((_) {
        if (mounted) setState(() => _playingInstructionId = null);
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Could not play voice note: $e'),
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
    _audioPlayer.dispose();
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
                      // Patient instructions feed (text + voice notes)
                      _InstructionsStripe(
                        requestId: widget.requestId,
                        onPlayAudio: _playVoiceNote,
                        playingInstructionId: _playingInstructionId,
                      ),
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

/// Compact, real-time strip showing patient-sent instructions (text + voice).
/// Reused by the hospital incoming-ambulance screen too so both surfaces
/// share the same context the patient is providing while en route.
class _InstructionsStripe extends StatelessWidget {
  final String requestId;
  final Future<void> Function(Map<String, dynamic> instruction) onPlayAudio;
  final String? playingInstructionId;

  const _InstructionsStripe({
    required this.requestId,
    required this.onPlayAudio,
    this.playingInstructionId,
  });

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<Map<String, dynamic>>>(
      stream: FirestoreService().watchInstructions(requestId),
      builder: (context, snap) {
        final items = snap.data ?? const <Map<String, dynamic>>[];
        if (items.isEmpty) return const SizedBox.shrink();
        // Cap the list area at ~30% of the screen so a chatty patient cannot
        // push the action buttons off-screen. Long lists scroll inside the card.
        final maxListHeight = MediaQuery.of(context).size.height * 0.3;
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppColors.accentBlue.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: AppColors.accentBlue.withValues(alpha: 0.2),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    const Icon(
                      Icons.chat_bubble_outline_rounded,
                      size: 14,
                      color: AppColors.accentBlue,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      'PATIENT NOTES (${items.length})',
                      style: GoogleFonts.poppins(
                        color: AppColors.accentBlue,
                        fontSize: 10.5,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.6,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                ConstrainedBox(
                  constraints: BoxConstraints(maxHeight: maxListHeight),
                  child: SingleChildScrollView(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: items
                          .map(
                            (it) => Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: _instructionRow(it),
                            ),
                          )
                          .toList(),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _instructionRow(Map<String, dynamic> it) {
    final type = it['type'] as String? ?? 'text';
    final stamp = relativeTimeLabel(it['createdAt']);
    final stampWidget = stamp.isEmpty
        ? const SizedBox.shrink()
        : Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Align(
              alignment: Alignment.centerRight,
              child: Text(
                stamp,
                style: GoogleFonts.poppins(
                  color: AppColors.textLight,
                  fontSize: 10,
                ),
              ),
            ),
          );

    if (type == 'audio') {
      final id = it['id'] as String?;
      final url = it['audioUrl'] as String?;
      final b64 = it['audioBase64'] as String?;
      final dur = (it['durationSec'] as num?)?.toInt() ?? 0;
      final hasAudio =
          (url != null && url.isNotEmpty) || (b64 != null && b64.isNotEmpty);
      final isPlaying = id != null && id == playingInstructionId;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(
                Icons.mic_rounded,
                size: 16,
                color: AppColors.brandRed,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  'Voice note · ${dur}s',
                  style: GoogleFonts.poppins(
                    color: AppColors.navy,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              if (hasAudio)
                TextButton.icon(
                  onPressed: () => onPlayAudio(it),
                  icon: Icon(
                    isPlaying
                        ? Icons.stop_rounded
                        : Icons.play_arrow_rounded,
                    size: 18,
                  ),
                  label: Text(isPlaying ? 'Stop' : 'Play'),
                  style: TextButton.styleFrom(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    foregroundColor: AppColors.accentBlue,
                  ),
                ),
            ],
          ),
          stampWidget,
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(
              Icons.sticky_note_2_outlined,
              size: 16,
              color: AppColors.accentBlue,
            ),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                (it['text'] as String? ?? '').trim(),
                style: GoogleFonts.poppins(
                  color: AppColors.navy,
                  fontSize: 12,
                  height: 1.35,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ],
        ),
        stampWidget,
      ],
    );
  }
}

/// Compact "Xs/Xm/Xh ago" label for a Firestore Timestamp (or null).
String relativeTimeLabel(dynamic createdAt) {
  DateTime? when;
  if (createdAt is Timestamp) {
    when = createdAt.toDate();
  } else if (createdAt is DateTime) {
    when = createdAt;
  } else if (createdAt is Map && createdAt['seconds'] != null) {
    when = DateTime.fromMillisecondsSinceEpoch(
      (createdAt['seconds'] as num).toInt() * 1000,
    );
  }
  if (when == null) return '';
  final diff = DateTime.now().difference(when);
  if (diff.isNegative) return 'just now';
  if (diff.inSeconds < 60) return '${diff.inSeconds}s ago';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  return '${diff.inDays}d ago';
}
