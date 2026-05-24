import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:geolocator/geolocator.dart';
import 'dart:async';
import '../../../core/services/firestore_service.dart';
import '../../../core/services/location_service.dart';
import '../../../core/services/fcm_service.dart';
import '../../../core/models/driver_model.dart';
import 'equipment_checklist_screen.dart';
import '../../../core/models/rescue_request_model.dart';
import '../../../core/models/sos_request_model.dart';
import '../../../core/models/ambulance_type.dart';
import '../../../core/constants/app_colors.dart';
import '../../../shared/widgets/loading_overlay.dart';

class DriverHomeScreen extends StatefulWidget {
  const DriverHomeScreen({super.key});

  @override
  State<DriverHomeScreen> createState() => _DriverHomeScreenState();
}

class _DriverHomeScreenState extends State<DriverHomeScreen> {
  final _firestoreService = FirestoreService();
  final _locationService = LocationService();
  final _uid = FirebaseAuth.instance.currentUser!.uid;
  bool _loading = false;

  bool _navigating = false;

  Position? _currentPosition;
  StreamSubscription<Position>? _gpsSub;

  @override
  void initState() {
    super.initState();
    _gpsSub =
        Geolocator.getPositionStream(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.high,
            distanceFilter: 20,
          ),
        ).listen((pos) {
          if (mounted) setState(() => _currentPosition = pos);
        }, onError: (_) {});
    // Register FCM token (best-effort, won't fail if user denies)
    FcmService.initForDriver(_uid);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _navigating = false;
  }

  @override
  void dispose() {
    _gpsSub?.cancel();
    super.dispose();
  }

  void _handlePendingRequests(
    List<RescueRequestModel> requests,
    DriverModel driver,
  ) {
    if (_navigating) return;

    for (final req in requests) {
      if (!req.notifiedDriverIds.contains(_uid)) continue;
      // Filter by ambulance type
      if (req.ambulanceType != driver.ambulanceType) continue;
      if (req.declinedDriverIds.contains(_uid)) continue;

      if (_currentPosition != null) {
        final dist = LocationService.distanceKm(
          _currentPosition!.latitude,
          _currentPosition!.longitude,
          req.patientLocation.latitude,
          req.patientLocation.longitude,
        );
        if (dist > 10) continue;
      }

      _navigating = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) context.go('/driver/request/${req.requestId}');
      });
      return;
    }
  }

  Future<void> _toggleOnline(bool currentlyOnline, DriverModel driver) async {
    if (!currentlyOnline) {
      final granted = await _locationService.requestPermissions();
      if (!granted && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Location permission is required to go online.'),
            backgroundColor: AppColors.brandRed,
          ),
        );
        return;
      }

      // Force a pre-shift equipment check the first time today (or any time
      // it's been more than DriverModel.equipmentCheckFreshness). Drivers
      // CANNOT go online without confirming oxygen, defib, etc.
      if (!driver.hasFreshEquipmentCheck) {
        final ok = await Navigator.of(context).push<bool>(
          MaterialPageRoute(
            builder: (_) => EquipmentChecklistScreen(
              ambulanceType: driver.ambulanceType.value,
            ),
            fullscreenDialog: true,
          ),
        );
        if (ok != true) return; // Driver bailed out — stay offline.
      }
    }
    setState(() => _loading = true);
    try {
      await _firestoreService.setDriverOnline(_uid, !currentlyOnline);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.lightBg,
      drawer: _buildDrawer(),
      body: LoadingOverlay(
        isLoading: _loading,
        child: StreamBuilder<DriverModel>(
          stream: _firestoreService.watchDriver(_uid),
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              final err = snapshot.error.toString();
              final isPermission =
                  err.contains('permission-denied') ||
                  err.contains('PERMISSION_DENIED');
              return _buildErrorState(
                icon: isPermission
                    ? Icons.lock_outline_rounded
                    : Icons.cloud_off_rounded,
                title: isPermission
                    ? 'Database Access Denied'
                    : 'Database Not Set Up',
                message: isPermission
                    ? 'Firestore security rules are blocking access.'
                    : 'Firestore database is not created yet.',
              );
            }

            if (!snapshot.hasData) {
              return const Center(
                child: CircularProgressIndicator(color: AppColors.brandRed),
              );
            }

            final driver = snapshot.data!;

            if (driver.verificationStatus == 'rejected') {
              return _buildRejectedState(driver);
            }
            if (driver.verificationStatus == 'pending' &&
                driver.documents.isNotEmpty) {
              return _buildPendingState();
            }

            return StreamBuilder<List<SosRequestModel>>(
              stream: driver.isOnline
                  ? _firestoreService.watchPendingSosRequests()
                  : const Stream.empty(),
              builder: (context, sosSnap) {
                final allSos = sosSnap.data ?? [];
                // Filter SOS by driver's ambulance type
                final sosList = allSos
                    .where((s) => s.ambulanceType == driver.ambulanceType.value)
                    .toList();

                return StreamBuilder<List<RescueRequestModel>>(
                  stream: (driver.isOnline && driver.isAvailable)
                      ? _firestoreService.watchPendingDriverRequests()
                      : const Stream.empty(),
                  builder: (context, reqSnap) {
                    if (reqSnap.hasData && reqSnap.data!.isNotEmpty) {
                      _handlePendingRequests(reqSnap.data!, driver);
                    }
                    return _buildRapidoHome(driver, sosList);
                  },
                );
              },
            );
          },
        ),
      ),
    );
  }

  // ─── Main Rapido-style Home ──────────────────────────────────────────────

  Widget _buildRapidoHome(DriverModel driver, List<SosRequestModel> sosList) {
    return SafeArea(
      child: Column(
        children: [
          _buildTopBar(driver),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Column(
                children: [
                  const SizedBox(height: 16),
                  // SOS alert cards (priority)
                  if (sosList.isNotEmpty) ...[
                    ...sosList.map(
                      (sos) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: _SosAlertCard(
                          sos: sos,
                          driverPos: _currentPosition,
                          onAccept: () async {
                            await _firestoreService.acceptSosRequest(
                              sos.id,
                              _uid,
                            );
                            if (mounted) {
                              context.go('/driver/sos/${sos.id}');
                            }
                          },
                        ),
                      ),
                    ),
                  ],
                  // Hero status card
                  _buildStatusHero(driver),
                  const SizedBox(height: 16),
                  // Quick stats grid
                  _buildStatsRow(driver),
                  const SizedBox(height: 16),
                  // Active request tile
                  if (driver.isOnline && driver.currentRequestId != null)
                    _activeRequestTile(driver),
                  const SizedBox(height: 24),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTopBar(DriverModel driver) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
      decoration: const BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Color(0x0A000000),
            blurRadius: 8,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        children: [
          // Logo
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppColors.brandRed,
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.emergency, color: Colors.white, size: 22),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                RichText(
                  text: TextSpan(
                    style: GoogleFonts.poppins(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                    ),
                    children: const [
                      TextSpan(
                        text: '10Min',
                        style: TextStyle(color: AppColors.navy),
                      ),
                      TextSpan(
                        text: 'Rescue',
                        style: TextStyle(color: AppColors.brandRed),
                      ),
                    ],
                  ),
                ),
                Text(
                  'Hello, ${driver.name.isEmpty ? 'Driver' : driver.name}',
                  style: GoogleFonts.poppins(
                    color: AppColors.textSecondary,
                    fontSize: 11.5,
                  ),
                ),
              ],
            ),
          ),
          Builder(
            builder: (ctx) => IconButton(
              icon: const Icon(Icons.menu_rounded, size: 24),
              color: AppColors.navy,
              onPressed: () => Scaffold.of(ctx).openDrawer(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDrawer() {
    return Drawer(
      child: SafeArea(
        child: Column(
          children: [
            // Header
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [AppColors.navy, AppColors.navyLight],
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      color: AppColors.brandRed,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: const Icon(
                      Icons.emergency_rounded,
                      color: Colors.white,
                      size: 28,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Suraksha Kavach',
                    style: GoogleFonts.poppins(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  Text(
                    'Driver App',
                    style: GoogleFonts.poppins(
                      color: Colors.white60,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            _drawerItem(
              icon: Icons.person_outline,
              label: 'My Profile',
              onTap: () {
                Navigator.pop(context);
                context.push('/driver/profile');
              },
            ),
            _drawerItem(
              icon: Icons.history_rounded,
              label: 'Trip History',
              onTap: () {
                Navigator.pop(context);
                context.push('/driver/history');
              },
            ),
            _drawerItem(
              icon: Icons.upload_file_outlined,
              label: 'Documents',
              onTap: () {
                Navigator.pop(context);
                context.push('/driver/upload-docs');
              },
            ),
            const Spacer(),
            _drawerItem(
              icon: Icons.logout_rounded,
              label: 'Sign Out',
              color: AppColors.brandRed,
              onTap: () async {
                Navigator.pop(context);
                await FirebaseAuth.instance.signOut();
                if (!mounted) return;
                context.go('/auth/login');
              },
            ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }

  Widget _drawerItem({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
    Color? color,
  }) {
    return ListTile(
      leading: Icon(icon, color: color ?? AppColors.navy, size: 22),
      title: Text(
        label,
        style: GoogleFonts.poppins(
          color: color ?? AppColors.navy,
          fontWeight: FontWeight.w600,
          fontSize: 14,
        ),
      ),
      onTap: onTap,
    );
  }

  Widget _buildStatusHero(DriverModel driver) {
    final isOnline = driver.isOnline;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: isOnline
              ? [const Color(0xFF16A34A), const Color(0xFF15803D)]
              : [AppColors.navy, AppColors.navyLight],
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: (isOnline ? const Color(0xFF16A34A) : AppColors.navy)
                .withValues(alpha: 0.25),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  // Pulsing dot
                  if (isOnline)
                    _PulsingDot()
                  else
                    Container(
                      width: 10,
                      height: 10,
                      decoration: BoxDecoration(
                        color: Colors.white54,
                        shape: BoxShape.circle,
                      ),
                    ),
                  const SizedBox(width: 8),
                  Text(
                    isOnline ? 'YOU ARE ONLINE' : 'YOU ARE OFFLINE',
                    style: GoogleFonts.poppins(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.5,
                    ),
                  ),
                ],
              ),
              // Ambulance type badge
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  'TYPE ${driver.ambulanceType.value} · ${driver.ambulanceType.shortLabel}',
                  style: GoogleFonts.poppins(
                    color: Colors.white,
                    fontSize: 10.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          Text(
            isOnline
                ? 'Listening for emergencies...'
                : 'Tap below to start receiving requests',
            style: GoogleFonts.poppins(color: Colors.white70, fontSize: 13),
          ),
          const SizedBox(height: 16),
          // The big toggle button
          SizedBox(
            width: double.infinity,
            child: GestureDetector(
              onTap: () => _toggleOnline(isOnline, driver),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 14),
                decoration: BoxDecoration(
                  color: isOnline
                      ? Colors.white.withValues(alpha: 0.2)
                      : AppColors.brandRed,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.3),
                    width: 1.5,
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      isOnline
                          ? Icons.power_settings_new_rounded
                          : Icons.play_arrow_rounded,
                      color: Colors.white,
                      size: 20,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      isOnline ? 'GO OFFLINE' : 'GO ONLINE',
                      style: GoogleFonts.poppins(
                        color: Colors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatsRow(DriverModel driver) {
    final ratingDisplay = driver.totalRatings > 0
        ? driver.rating.toStringAsFixed(1)
        : '—';
    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: _statCard(
                icon: Icons.star_rounded,
                label: 'Rating',
                value: ratingDisplay,
                color: AppColors.warningAmber,
                trailing: driver.totalRatings > 0
                    ? '${driver.totalRatings} reviews'
                    : 'No reviews yet',
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _statCard(
                icon: Icons.flag_rounded,
                label: 'Rides',
                value: '${driver.completedRides}',
                color: AppColors.onlineGreen,
                trailing: 'completed',
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _statCard(
                icon: Icons.local_fire_department_rounded,
                label: 'Points',
                value: '${driver.points}',
                color: AppColors.brandRed,
                trailing: 'tier',
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: _statCard(
                icon: Icons.directions_car_rounded,
                label: 'Vehicle',
                value: driver.vehicleNumber.isEmpty
                    ? 'Not Set'
                    : driver.vehicleNumber,
                color: AppColors.accentBlue,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _statCard(
                icon: Icons.verified_rounded,
                label: 'Status',
                value: driver.verificationStatus == 'verified'
                    ? 'Verified'
                    : 'Pending',
                color: driver.verificationStatus == 'verified'
                    ? AppColors.onlineGreen
                    : AppColors.warningAmber,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _statCard({
    required IconData icon,
    required String label,
    required String value,
    required Color color,
    String? trailing,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFEEF2F6)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: color, size: 16),
          ),
          const SizedBox(height: 8),
          Text(
            label,
            style: GoogleFonts.poppins(
              color: AppColors.textSecondary,
              fontSize: 10.5,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: GoogleFonts.poppins(
              color: AppColors.navy,
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          if (trailing != null) ...[
            const SizedBox(height: 1),
            Text(
              trailing,
              style: GoogleFonts.poppins(
                color: AppColors.textLight,
                fontSize: 9.5,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ],
      ),
    );
  }

  Widget _activeRequestTile(DriverModel driver) {
    return Material(
      color: AppColors.brandRed.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () =>
            context.go('/driver/navigate-patient/${driver.currentRequestId}'),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: AppColors.brandRed.withValues(alpha: 0.3),
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: AppColors.brandRed,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(
                  Icons.emergency_rounded,
                  color: Colors.white,
                  size: 22,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Active Request',
                      style: GoogleFonts.poppins(
                        color: AppColors.brandRed,
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      'Tap to continue',
                      style: GoogleFonts.poppins(
                        color: AppColors.textSecondary,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(
                Icons.arrow_forward_ios,
                color: AppColors.brandRed,
                size: 14,
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ─── Verification states ─────────────────────────────────────────────────

  Widget _buildRejectedState(DriverModel driver) {
    return SafeArea(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  color: AppColors.brandRed.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.cancel_rounded,
                  color: AppColors.brandRed,
                  size: 44,
                ),
              ),
              const SizedBox(height: 20),
              Text(
                'Documents Rejected',
                style: GoogleFonts.poppins(
                  color: AppColors.navy,
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                ),
                textAlign: TextAlign.center,
              ),
              if (driver.rejectionReason.isNotEmpty) ...[
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.brandRed.withValues(alpha: 0.06),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: AppColors.brandRed.withValues(alpha: 0.2),
                    ),
                  ),
                  child: Text(
                    driver.rejectionReason,
                    style: GoogleFonts.poppins(
                      color: AppColors.brandRed,
                      fontSize: 14,
                      height: 1.5,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
              ],
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () => context.go('/driver/upload-docs'),
                  icon: const Icon(Icons.upload_file_rounded),
                  label: const Text('Re-upload Documents'),
                ),
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: () async {
                  await FirebaseAuth.instance.signOut();
                  if (mounted) context.go('/auth/login');
                },
                child: Text(
                  'Sign Out',
                  style: GoogleFonts.poppins(color: AppColors.textSecondary),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPendingState() {
    return SafeArea(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  color: AppColors.warningAmber.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.access_time_rounded,
                  color: AppColors.warningAmber,
                  size: 44,
                ),
              ),
              const SizedBox(height: 20),
              Text(
                'Verification Pending',
                style: GoogleFonts.poppins(
                  color: AppColors.navy,
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 10),
              Text(
                'Your documents are under review.\nYou\'ll be notified once verified.',
                style: GoogleFonts.poppins(
                  color: AppColors.textSecondary,
                  fontSize: 14,
                  height: 1.6,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              OutlinedButton(
                onPressed: () async {
                  await FirebaseAuth.instance.signOut();
                  if (mounted) context.go('/auth/login');
                },
                child: const Text('Sign Out'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildErrorState({
    required IconData icon,
    required String title,
    required String message,
  }) {
    return SafeArea(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: AppColors.brandRed, size: 56),
              const SizedBox(height: 16),
              Text(
                title,
                style: GoogleFonts.poppins(
                  color: AppColors.navy,
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                message,
                style: GoogleFonts.poppins(
                  color: AppColors.textSecondary,
                  fontSize: 14,
                  height: 1.6,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: () async {
                  await FirebaseAuth.instance.signOut();
                  if (mounted) context.go('/auth/login');
                },
                child: const Text('Sign Out'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Pulsing online indicator dot ───────────────────────────────────────────

class _PulsingDot extends StatefulWidget {
  @override
  State<_PulsingDot> createState() => _PulsingDotState();
}

class _PulsingDotState extends State<_PulsingDot>
    with SingleTickerProviderStateMixin {
  late AnimationController _ac;

  @override
  void initState() {
    super.initState();
    _ac = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _ac.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ac,
      builder: (_, __) => Container(
        width: 10,
        height: 10,
        decoration: BoxDecoration(
          color: Colors.white,
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
              color: Colors.white.withValues(alpha: 0.4 + _ac.value * 0.4),
              blurRadius: 6 + _ac.value * 8,
              spreadRadius: 1 + _ac.value * 4,
            ),
          ],
        ),
      ),
    );
  }
}

// ─── SOS Alert Card ──────────────────────────────────────────────────────────

class _SosAlertCard extends StatefulWidget {
  final SosRequestModel sos;
  final Position? driverPos;
  final VoidCallback onAccept;

  const _SosAlertCard({
    required this.sos,
    required this.driverPos,
    required this.onAccept,
  });

  @override
  State<_SosAlertCard> createState() => _SosAlertCardState();
}

class _SosAlertCardState extends State<_SosAlertCard>
    with SingleTickerProviderStateMixin {
  late AnimationController _pulse;
  bool _accepting = false;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  double? get _distKm {
    if (widget.driverPos == null) return null;
    return LocationService.distanceKm(
      widget.driverPos!.latitude,
      widget.driverPos!.longitude,
      widget.sos.latitude,
      widget.sos.longitude,
    );
  }

  @override
  Widget build(BuildContext context) {
    final dist = _distKm;
    final urgencyColor = AppColors.urgencyColor(widget.sos.urgencyLevel);
    final ambType = AmbulanceTypeX.fromString(widget.sos.ambulanceType);

    return AnimatedBuilder(
      animation: _pulse,
      builder: (_, child) => Container(
        decoration: BoxDecoration(
          color: Color.lerp(
            urgencyColor.withValues(alpha: 0.06),
            urgencyColor.withValues(alpha: 0.18),
            _pulse.value,
          ),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: urgencyColor.withValues(alpha: 0.5 + _pulse.value * 0.3),
            width: 2,
          ),
          boxShadow: [
            BoxShadow(
              color: urgencyColor.withValues(alpha: 0.15 + _pulse.value * 0.1),
              blurRadius: 16,
              spreadRadius: 2,
            ),
          ],
        ),
        child: child,
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppColors.urgencyColor(widget.sos.urgencyLevel),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(
                    Icons.emergency_rounded,
                    color: Colors.white,
                    size: 22,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            'EMERGENCY SOS',
                            style: GoogleFonts.poppins(
                              color: AppColors.urgencyColor(
                                widget.sos.urgencyLevel,
                              ),
                              fontWeight: FontWeight.w800,
                              fontSize: 13,
                              letterSpacing: 1,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.urgencyColor(
                                widget.sos.urgencyLevel,
                              ),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              ambType.shortLabel.toUpperCase(),
                              style: GoogleFonts.poppins(
                                color: Colors.white,
                                fontSize: 9,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ),
                      Text(
                        widget.sos.emergencyDescription.isEmpty
                            ? 'Customer needs immediate help!'
                            : widget.sos.emergencyDescription,
                        style: GoogleFonts.poppins(
                          color: AppColors.textSecondary,
                          fontSize: 11.5,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                if (dist != null)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.urgencyColor(
                        widget.sos.urgencyLevel,
                      ).withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      '${dist.toStringAsFixed(1)} km',
                      style: GoogleFonts.poppins(
                        color: AppColors.urgencyColor(widget.sos.urgencyLevel),
                        fontWeight: FontWeight.w700,
                        fontSize: 12,
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _accepting
                    ? null
                    : () async {
                        setState(() => _accepting = true);
                        widget.onAccept();
                      },
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.urgencyColor(
                    widget.sos.urgencyLevel,
                  ),
                ),
                icon: _accepting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          color: Colors.white,
                          strokeWidth: 2,
                        ),
                      )
                    : const Icon(Icons.check_rounded),
                label: Text(_accepting ? 'Accepting...' : 'Accept & Navigate'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
