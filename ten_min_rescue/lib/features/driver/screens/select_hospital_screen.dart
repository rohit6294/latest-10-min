import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:geolocator/geolocator.dart';
import '../../../core/services/firestore_service.dart';
import '../../../core/services/location_service.dart';
import '../../../core/models/hospital_model.dart';
import '../../../core/models/rescue_request_model.dart';
import '../../../core/models/ambulance_type.dart';
import '../../../core/constants/app_colors.dart';

class SelectHospitalScreen extends StatefulWidget {
  final String requestId;
  const SelectHospitalScreen({super.key, required this.requestId});

  @override
  State<SelectHospitalScreen> createState() => _SelectHospitalScreenState();
}

class _SelectHospitalScreenState extends State<SelectHospitalScreen> {
  final _fs = FirestoreService();
  bool _loading = true;
  bool _selecting = false;
  bool _showAll = false; // toggle to show all hospitals as fallback
  List<HospitalModel> _hospitalsWithBeds = [];
  List<HospitalModel> _allHospitals = [];
  RescueRequestModel? _request;
  Position? _driverPos;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadHospitals();
  }

  Future<void> _loadHospitals() async {
    try {
      final request = await _fs.getRequest(widget.requestId);
      if (request == null) {
        setState(() {
          _error = 'Request not found';
          _loading = false;
        });
        return;
      }

      try {
        _driverPos = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.high,
          ),
        );
      } catch (_) {}

      final searchLocation = _driverPos != null
          ? GeoPoint(_driverPos!.latitude, _driverPos!.longitude)
          : request.patientLocation;

      // Load both: hospitals with matching beds, AND all active hospitals
      final withBeds = await _fs.getNearbyHospitalsWithBeds(
        patientLocation: searchLocation,
        ambulanceType: request.ambulanceType,
        radiusKm: 50,
      );

      // Also fetch ALL active hospitals as fallback (no bed filter)
      final allActive = await _fs.getAllActiveHospitalsNearby(
        patientLocation: searchLocation,
        radiusKm: 50,
      );

      if (mounted) {
        setState(() {
          _request = request;
          _hospitalsWithBeds = withBeds;
          _allHospitals = allActive;
          // Auto-show all if no hospitals have matching beds
          _showAll = withBeds.isEmpty && allActive.isNotEmpty;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Failed to load hospitals: $e';
          _loading = false;
        });
      }
    }
  }

  List<HospitalModel> get _displayedHospitals =>
      _showAll ? _allHospitals : _hospitalsWithBeds;

  Future<void> _selectHospital(HospitalModel hospital) async {
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

    if (selectedType != null) {
      _confirmHospitalSelection(hospital, selectedType);
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

  Future<void> _confirmHospitalSelection(
    HospitalModel hospital,
    AmbulanceType bedType,
  ) async {
    if (_selecting) return;
    setState(() => _selecting = true);
    try {
      // 1. Update request's ambulanceType in Firestore
      await FirebaseFirestore.instance
          .collection('rescue_requests')
          .doc(widget.requestId)
          .update({'ambulanceType': bedType.value});

      // 2. Complete hospital selection
      await _fs.driverSelectHospital(widget.requestId, hospital.uid);

      if (!mounted) return;
      context.go('/driver/navigate-hospital/${widget.requestId}');
    } catch (_) {
      if (mounted) {
        setState(() => _selecting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Failed to select hospital/bed. Try again.'),
            backgroundColor: AppColors.brandRed,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.lightBg,
      appBar: AppBar(
        title: Text(
          'Select Hospital',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w700),
        ),
        automaticallyImplyLeading: false,
      ),
      body: _loading
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.brandRed),
            )
          : _error != null
          ? _buildError()
          : _displayedHospitals.isEmpty
          ? _buildEmptyState()
          : _buildHospitalList(),
    );
  }

  Widget _buildError() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.error_outline,
              color: AppColors.brandRed,
              size: 56,
            ),
            const SizedBox(height: 16),
            Text(
              _error!,
              textAlign: TextAlign.center,
              style: GoogleFonts.poppins(color: AppColors.navy),
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () {
                setState(() {
                  _error = null;
                  _loading = true;
                });
                _loadHospitals();
              },
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: AppColors.warningAmber.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.local_hospital_outlined,
                color: AppColors.warningAmber,
                size: 40,
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'No hospitals nearby',
              style: GoogleFonts.poppins(
                color: AppColors.navy,
                fontSize: 20,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'No active hospitals found within 50 km.\nCall dispatch for assistance.',
              textAlign: TextAlign.center,
              style: GoogleFonts.poppins(
                color: AppColors.textSecondary,
                fontSize: 13,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 24),
            OutlinedButton.icon(
              onPressed: _loadHospitals,
              icon: const Icon(Icons.refresh),
              label: const Text('Refresh'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHospitalList() {
    final type = _request!.ambulanceType;
    final showingAll = _showAll;
    final hasBedMatches = _hospitalsWithBeds.isNotEmpty;
    final hospitals = _displayedHospitals;

    return Column(
      children: [
        // Header banner
        Container(
          padding: const EdgeInsets.all(16),
          margin: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          decoration: BoxDecoration(
            color: AppColors.brandRed.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: AppColors.brandRed.withValues(alpha: 0.2),
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
                  Icons.medical_services_rounded,
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
                      'Patient Picked Up',
                      style: GoogleFonts.poppins(
                        color: AppColors.brandRed,
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      showingAll
                          ? (hasBedMatches
                                ? 'Showing ALL active hospitals'
                                : 'No ${type.label} beds — showing all hospitals')
                          : 'Hospitals with ${type.label} beds available',
                      style: GoogleFonts.poppins(
                        color: AppColors.textSecondary,
                        fontSize: 11.5,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),

        // Toggle switch (only shown if both lists have data)
        if (_allHospitals.isNotEmpty && hasBedMatches)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
            child: Row(
              children: [
                Expanded(
                  child: GestureDetector(
                    onTap: () => setState(() => _showAll = !_showAll),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: showingAll
                            ? AppColors.warningAmber.withValues(alpha: 0.12)
                            : AppColors.onlineGreen.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            showingAll
                                ? Icons.visibility_outlined
                                : Icons.filter_list_rounded,
                            size: 16,
                            color: showingAll
                                ? AppColors.warningAmber
                                : AppColors.onlineGreen,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              showingAll
                                  ? 'Tap to show only ${type.label} beds'
                                  : 'Tap to show all hospitals',
                              style: GoogleFonts.poppins(
                                color: showingAll
                                    ? AppColors.warningAmber
                                    : AppColors.onlineGreen,
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),

        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            itemCount: hospitals.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (_, i) => _hospitalCard(hospitals[i], type),
          ),
        ),
      ],
    );
  }

  Widget _hospitalCard(HospitalModel hospital, AmbulanceType type) {
    final dist = _driverPos != null && hospital.location != null
        ? LocationService.distanceKm(
            _driverPos!.latitude,
            _driverPos!.longitude,
            hospital.location!.latitude,
            hospital.location!.longitude,
          )
        : null;

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: _selecting ? null : () => _selectHospital(hospital),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFEEF2F6)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: AppColors.accentBlue.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(
                      Icons.local_hospital,
                      color: AppColors.accentBlue,
                      size: 22,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          hospital.name,
                          style: GoogleFonts.poppins(
                            color: AppColors.navy,
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (hospital.address.isNotEmpty)
                          Text(
                            hospital.address,
                            style: GoogleFonts.poppins(
                              color: AppColors.textSecondary,
                              fontSize: 11.5,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                      ],
                    ),
                  ),
                  Icon(
                    Icons.arrow_forward_ios,
                    color: AppColors.textLight,
                    size: 14,
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  _chip(
                    Icons.star,
                    hospital.rating > 0
                        ? hospital.rating.toStringAsFixed(1)
                        : 'N/A',
                    AppColors.warningAmber,
                  ),
                  if (dist != null) ...[
                    const SizedBox(width: 8),
                    _chip(
                      Icons.near_me_rounded,
                      '${dist.toStringAsFixed(1)} km',
                      AppColors.accentBlue,
                    ),
                  ],
                ],
              ),
              if (hospital.facilities.isNotEmpty) ...[
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: hospital.facilities
                      .map(
                        (f) => Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: AppColors.navy.withValues(alpha: 0.05),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            f,
                            style: GoogleFonts.poppins(
                              fontSize: 10,
                              color: AppColors.navy,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      )
                      .toList(),
                ),
              ],
              const SizedBox(height: 12),
              Row(
                children: [
                  Text(
                    'AVAILABLE BEDS',
                    style: GoogleFonts.poppins(
                      color: AppColors.textLight,
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.6,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    '· ${type.shortLabel} needed',
                    style: GoogleFonts.poppins(
                      color: AppColors.brandRed,
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              _bedBreakdown(hospital, type),
            ],
          ),
        ),
      ),
    );
  }

  /// Shows the live count of every bed type, highlighting the one the
  /// patient needs for the current ambulance type.
  Widget _bedBreakdown(HospitalModel hospital, AmbulanceType type) {
    return Row(
      children: [
        _bedCell(
          'ICU',
          hospital.icuAvailable,
          hospital.icuBeds,
          type == AmbulanceType.A,
        ),
        const SizedBox(width: 8),
        _bedCell(
          'Advanced',
          hospital.advancedAvailable,
          hospital.advancedBeds,
          type == AmbulanceType.B,
        ),
        const SizedBox(width: 8),
        _bedCell(
          'Normal',
          hospital.normalAvailable,
          hospital.normalBeds,
          type == AmbulanceType.C,
        ),
      ],
    );
  }

  Widget _bedCell(String label, int available, int total, bool highlight) {
    final hasBeds = available > 0;
    final accent = hasBeds ? AppColors.onlineGreen : AppColors.brandRed;
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
        decoration: BoxDecoration(
          color: highlight
              ? accent.withValues(alpha: 0.1)
              : const Color(0xFFF4F6F8),
          borderRadius: BorderRadius.circular(10),
          border: highlight
              ? Border.all(color: accent.withValues(alpha: 0.45))
              : null,
        ),
        child: Column(
          children: [
            Text(
              label,
              style: GoogleFonts.poppins(
                fontSize: 10,
                fontWeight: FontWeight.w600,
                color: AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              '$available',
              style: GoogleFonts.poppins(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: highlight
                    ? accent
                    : (hasBeds ? AppColors.navy : AppColors.brandRed),
              ),
            ),
            Text(
              'of $total beds',
              style: GoogleFonts.poppins(
                fontSize: 9,
                color: AppColors.textLight,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _chip(IconData icon, String text, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: color),
          const SizedBox(width: 4),
          Text(
            text,
            style: GoogleFonts.poppins(
              color: color,
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
