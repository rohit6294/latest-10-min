import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../core/services/firestore_service.dart';
import '../../../core/services/fcm_service.dart';
import '../../../core/models/hospital_model.dart';
import '../../../core/models/rescue_request_model.dart';
import '../../../core/models/ambulance_type.dart';
import '../../../core/constants/app_colors.dart';
import '../../../shared/widgets/loading_overlay.dart';

class HospitalHomeScreen extends StatefulWidget {
  const HospitalHomeScreen({super.key});

  @override
  State<HospitalHomeScreen> createState() => _HospitalHomeScreenState();
}

class _HospitalHomeScreenState extends State<HospitalHomeScreen> {
  final _firestoreService = FirestoreService();
  final _uid = FirebaseAuth.instance.currentUser!.uid;
  bool _loading = false;
  bool _navigating = false;

  @override
  void initState() {
    super.initState();
    FcmService.initForHospital(_uid);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _navigating = false;
  }

  /// Auto-navigate to incoming notification when an ambulance is assigned
  void _handleIncomingAmbulance(QuerySnapshot snap) {
    if (_navigating || snap.docs.isEmpty) return;

    final docs = snap.docs;
    for (final doc in docs) {
      final req = RescueRequestModel.fromFirestore(doc);
      if (req.assignedHospitalId != _uid) continue;
      // Only auto-navigate when newly assigned (hospital_assigned status)
      if (req.status == RequestStatus.hospitalAssigned) {
        _navigating = true;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) {
            context.go('/hospital/incoming/${req.requestId}');
          }
        });
        return;
      }
    }
  }

  Future<void> _toggleActive(bool currentlyActive) async {
    setState(() => _loading = true);
    try {
      await _firestoreService.setHospitalActive(_uid, !currentlyActive);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _adjustBeds(
    HospitalModel hospital,
    AmbulanceType type,
    int delta,
  ) async {
    final current = hospital.availableBedsForType(type);
    final total = hospital.totalBedsForType(type);
    final newValue = (current + delta).clamp(0, total).toInt();
    if (newValue == current) return;

    final updates = <String, dynamic>{};
    switch (type) {
      case AmbulanceType.A:
        updates['icuAvailable'] = newValue;
        break;
      case AmbulanceType.B:
        updates['advancedAvailable'] = newValue;
        break;
      case AmbulanceType.C:
        updates['normalAvailable'] = newValue;
        break;
    }
    await _firestoreService.updateHospitalBeds(
      _uid,
      icuAvailable:
          type == AmbulanceType.A ? newValue : null,
      advancedAvailable:
          type == AmbulanceType.B ? newValue : null,
      normalAvailable:
          type == AmbulanceType.C ? newValue : null,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.lightBg,
      body: LoadingOverlay(
        isLoading: _loading,
        child: StreamBuilder<HospitalModel>(
          stream: _firestoreService.watchHospital(_uid),
          builder: (context, snapshot) {
            if (!snapshot.hasData) {
              return const Center(
                  child:
                      CircularProgressIndicator(color: AppColors.brandRed));
            }
            final hospital = snapshot.data!;

            return StreamBuilder<QuerySnapshot>(
              stream: _firestoreService
                  .watchActiveRequestForHospital(_uid),
              builder: (context, reqSnap) {
                if (reqSnap.hasData) {
                  _handleIncomingAmbulance(reqSnap.data!);
                }
                return _buildBody(hospital);
              },
            );
          },
        ),
      ),
    );
  }

  Widget _buildBody(HospitalModel hospital) {
    return SafeArea(
      child: Column(
        children: [
          _buildTopBar(hospital),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Column(
                children: [
                  const SizedBox(height: 16),
                  _buildStatusCard(hospital),
                  const SizedBox(height: 16),
                  _buildBedManagementCard(hospital),
                  const SizedBox(height: 16),
                  if (hospital.currentRequestId != null)
                    _buildActiveAmbulanceTile(hospital),
                  const SizedBox(height: 24),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTopBar(HospitalModel hospital) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
      decoration: const BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
              color: Color(0x0A000000),
              blurRadius: 8,
              offset: Offset(0, 2)),
        ],
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
            child: const Icon(Icons.emergency, color: Colors.white, size: 22),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  hospital.name.isEmpty ? 'Hospital' : hospital.name,
                  style: GoogleFonts.poppins(
                    color: AppColors.navy,
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  'Suraksha Kavach · Hospital',
                  style: GoogleFonts.poppins(
                    color: AppColors.textSecondary,
                    fontSize: 11.5,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.logout, size: 22),
            color: AppColors.textSecondary,
            onPressed: () async {
              await FirebaseAuth.instance.signOut();
              if (!context.mounted) return;
              context.go('/auth/login');
            },
          ),
        ],
      ),
    );
  }

  Widget _buildStatusCard(HospitalModel hospital) {
    final isActive = hospital.isActive;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: isActive
              ? [const Color(0xFF7C3AED), const Color(0xFF6D28D9)]
              : [AppColors.navy, AppColors.navyLight],
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: (isActive
                    ? const Color(0xFF7C3AED)
                    : AppColors.navy)
                .withValues(alpha: 0.25),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        children: [
          Icon(
            isActive
                ? Icons.local_hospital_rounded
                : Icons.local_hospital_outlined,
            color: Colors.white,
            size: 40,
          ),
          const SizedBox(height: 10),
          Text(
            isActive ? 'ACCEPTING PATIENTS' : 'NOT ACCEPTING',
            style: GoogleFonts.poppins(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w800,
              letterSpacing: 1,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            isActive
                ? 'You will be notified of incoming ambulances'
                : 'Toggle on to receive ambulance notifications',
            style: GoogleFonts.poppins(
                color: Colors.white70, fontSize: 12),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: GestureDetector(
              onTap: () => _toggleActive(isActive),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                  color: isActive
                      ? Colors.white.withValues(alpha: 0.2)
                      : AppColors.brandRed,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.3),
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      isActive
                          ? Icons.power_settings_new_rounded
                          : Icons.play_arrow_rounded,
                      color: Colors.white,
                      size: 18,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      isActive ? 'GO INACTIVE' : 'ACTIVATE',
                      style: GoogleFonts.poppins(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.5,
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

  Future<void> _showSetTotalsDialog(HospitalModel hospital) async {
    final icuCtrl =
        TextEditingController(text: hospital.icuBeds.toString());
    final advCtrl =
        TextEditingController(text: hospital.advancedBeds.toString());
    final normCtrl =
        TextEditingController(text: hospital.normalBeds.toString());

    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Set Total Beds',
            style: GoogleFonts.poppins(fontWeight: FontWeight.w700)),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: icuCtrl,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'ICU Beds (Type A)',
                  prefixIcon: Icon(Icons.medical_services_rounded,
                      color: AppColors.brandRed),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: advCtrl,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Advanced Beds (Type B)',
                  prefixIcon: Icon(Icons.local_hospital_rounded,
                      color: AppColors.warningAmber),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: normCtrl,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Normal Beds (Type C)',
                  prefixIcon: Icon(Icons.airport_shuttle_rounded,
                      color: AppColors.onlineGreen),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Save')),
        ],
      ),
    );

    if (saved == true) {
      final newIcu = int.tryParse(icuCtrl.text) ?? hospital.icuBeds;
      final newAdv = int.tryParse(advCtrl.text) ?? hospital.advancedBeds;
      final newNorm = int.tryParse(normCtrl.text) ?? hospital.normalBeds;
      await _firestoreService.updateHospitalBeds(
        _uid,
        icuBeds: newIcu,
        advancedBeds: newAdv,
        normalBeds: newNorm,
        // Clamp available to new total
        icuAvailable: hospital.icuAvailable.clamp(0, newIcu),
        advancedAvailable: hospital.advancedAvailable.clamp(0, newAdv),
        normalAvailable: hospital.normalAvailable.clamp(0, newNorm),
      );
    }
    icuCtrl.dispose();
    advCtrl.dispose();
    normCtrl.dispose();
  }

  Widget _buildBedManagementCard(HospitalModel hospital) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFEEF2F6)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.bed_rounded,
                  color: AppColors.brandRed, size: 20),
              const SizedBox(width: 8),
              Text(
                'Bed Availability',
                style: GoogleFonts.poppins(
                  color: AppColors.navy,
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const Spacer(),
              if (hospital.rating > 0) ...[
                const Icon(Icons.star_rounded,
                    color: AppColors.warningAmber, size: 16),
                const SizedBox(width: 2),
                Text(
                  hospital.rating.toStringAsFixed(1),
                  style: GoogleFonts.poppins(
                    color: AppColors.warningAmber,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(width: 8),
              ],
              TextButton(
                onPressed: () => _showSetTotalsDialog(hospital),
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 4),
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: Text(
                  'Set Totals',
                  style: GoogleFonts.poppins(
                    color: AppColors.navy,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'Update available beds in real-time. Patients see this on /sos.',
            style: GoogleFonts.poppins(
              color: AppColors.textSecondary,
              fontSize: 11.5,
            ),
          ),
          const SizedBox(height: 16),
          _bedRow(
            hospital,
            AmbulanceType.A,
            'ICU',
            AppColors.brandRed,
            Icons.medical_services_rounded,
          ),
          const SizedBox(height: 12),
          _bedRow(
            hospital,
            AmbulanceType.B,
            'Advanced',
            AppColors.warningAmber,
            Icons.local_hospital_rounded,
          ),
          const SizedBox(height: 12),
          _bedRow(
            hospital,
            AmbulanceType.C,
            'Normal',
            AppColors.onlineGreen,
            Icons.airport_shuttle_rounded,
          ),
        ],
      ),
    );
  }

  Widget _bedRow(
    HospitalModel hospital,
    AmbulanceType type,
    String label,
    Color color,
    IconData icon,
  ) {
    final available = hospital.availableBedsForType(type);
    final total = hospital.totalBedsForType(type);
    return Row(
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, color: color, size: 18),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: GoogleFonts.poppins(
                  color: AppColors.navy,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
              Text(
                'Type ${type.value}',
                style: GoogleFonts.poppins(
                  color: AppColors.textSecondary,
                  fontSize: 10.5,
                ),
              ),
            ],
          ),
        ),
        // Decrement
        _bedButton(
          icon: Icons.remove_rounded,
          color: color,
          enabled: available > 0,
          onTap: () => _adjustBeds(hospital, type, -1),
        ),
        const SizedBox(width: 12),
        // Counter
        Column(
          children: [
            Text(
              '$available',
              style: GoogleFonts.poppins(
                color: color,
                fontSize: 22,
                fontWeight: FontWeight.w800,
              ),
            ),
            Text(
              'of $total',
              style: GoogleFonts.poppins(
                color: AppColors.textSecondary,
                fontSize: 10,
              ),
            ),
          ],
        ),
        const SizedBox(width: 12),
        // Increment
        _bedButton(
          icon: Icons.add_rounded,
          color: color,
          enabled: available < total,
          onTap: () => _adjustBeds(hospital, type, 1),
        ),
      ],
    );
  }

  Widget _bedButton({
    required IconData icon,
    required Color color,
    required bool enabled,
    required VoidCallback onTap,
  }) {
    return Material(
      color: enabled ? color : color.withValues(alpha: 0.3),
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: enabled ? onTap : null,
        child: Container(
          width: 36,
          height: 36,
          alignment: Alignment.center,
          child: Icon(icon, color: Colors.white, size: 20),
        ),
      ),
    );
  }

  Widget _buildActiveAmbulanceTile(HospitalModel hospital) {
    return Material(
      color: const Color(0xFF7C3AED).withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () =>
            context.go('/hospital/track/${hospital.currentRequestId}'),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
                color: const Color(0xFF7C3AED).withValues(alpha: 0.3)),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: const Color(0xFF7C3AED),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.directions_car_rounded,
                    color: Colors.white, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Ambulance Incoming',
                      style: GoogleFonts.poppins(
                        color: const Color(0xFF7C3AED),
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      'Tap to track live',
                      style: GoogleFonts.poppins(
                        color: AppColors.textSecondary,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.arrow_forward_ios,
                  color: Color(0xFF7C3AED), size: 14),
            ],
          ),
        ),
      ),
    );
  }
}
