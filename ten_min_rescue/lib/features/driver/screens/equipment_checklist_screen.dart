import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../core/services/firestore_service.dart';
import '../../../core/constants/app_colors.dart';

/// Pre-shift equipment checklist. Driver must verify every item before they
/// can go online. The list is intentionally short and physical — the goal is
/// "30 seconds, no missed defib", not paperwork.
class EquipmentChecklistScreen extends StatefulWidget {
  /// Called when the driver completes the checklist successfully — the
  /// caller (driver_home_screen) typically toggles the driver online after.
  final VoidCallback? onCompleted;

  const EquipmentChecklistScreen({super.key, this.onCompleted});

  @override
  State<EquipmentChecklistScreen> createState() =>
      _EquipmentChecklistScreenState();
}

class _ChecklistItem {
  final String id;
  final String label;
  final String detail;
  final IconData icon;
  bool checked;

  _ChecklistItem({
    required this.id,
    required this.label,
    required this.detail,
    required this.icon,
    this.checked = false,
  });
}

class _EquipmentChecklistScreenState extends State<EquipmentChecklistScreen> {
  final _fs = FirestoreService();
  bool _saving = false;

  final List<_ChecklistItem> _items = [
    _ChecklistItem(
      id: 'oxygen',
      label: 'Oxygen cylinder',
      detail: 'Full / above 80%, regulator working',
      icon: Icons.air_rounded,
    ),
    _ChecklistItem(
      id: 'defib',
      label: 'Defibrillator',
      detail: 'Charged, pads in date, self-test passed',
      icon: Icons.bolt_rounded,
    ),
    _ChecklistItem(
      id: 'suction',
      label: 'Suction unit',
      detail: 'Powered on, hose & catheters present',
      icon: Icons.water_drop_outlined,
    ),
    _ChecklistItem(
      id: 'stretcher',
      label: 'Stretcher & belts',
      detail: 'Wheels lock, 3 straps intact',
      icon: Icons.airline_seat_flat_rounded,
    ),
    _ChecklistItem(
      id: 'first_aid',
      label: 'First-aid kit',
      detail: 'Gauze, gloves, BP cuff, glucometer strips',
      icon: Icons.medical_services_rounded,
    ),
    _ChecklistItem(
      id: 'fuel',
      label: 'Fuel & vehicle',
      detail: 'Tank ≥ 1/4, tyres OK, lights & siren tested',
      icon: Icons.local_gas_station_rounded,
    ),
  ];

  bool get _allChecked => _items.every((i) => i.checked);

  Future<void> _submit() async {
    if (!_allChecked || _saving) return;
    setState(() => _saving = true);
    try {
      final uid = FirebaseAuth.instance.currentUser!.uid;
      await _fs.recordEquipmentCheck(uid);
      if (!mounted) return;
      Navigator.of(context).pop(true);
      widget.onCompleted?.call();
    } catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Could not save: $e'),
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
        backgroundColor: Colors.white,
        elevation: 0,
        title: Text(
          'Pre-shift check',
          style: GoogleFonts.poppins(
            color: AppColors.navy,
            fontWeight: FontWeight.w700,
          ),
        ),
        iconTheme: const IconThemeData(color: AppColors.navy),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 18),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [AppColors.brandRed, Color(0xFFB80010)],
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Verify your kit before you go live',
                    style: GoogleFonts.poppins(
                      color: Colors.white,
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    "30 seconds of checks now saves a life later. "
                    "All items must be confirmed.",
                    style: GoogleFonts.poppins(
                      color: Colors.white.withValues(alpha: 0.85),
                      fontSize: 12.5,
                      height: 1.45,
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                itemCount: _items.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (_, i) => _buildTile(_items[i]),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _allChecked && !_saving ? _submit : null,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.onlineGreen,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    disabledBackgroundColor: Colors.grey[300],
                  ),
                  child: Text(
                    _saving
                        ? 'Saving…'
                        : (_allChecked
                              ? 'All checked — Go Online'
                              : 'Complete all checks'),
                    style: GoogleFonts.poppins(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 15,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTile(_ChecklistItem item) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => setState(() => item.checked = !item.checked),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: item.checked
                  ? AppColors.onlineGreen.withValues(alpha: 0.55)
                  : const Color(0xFFEEF2F6),
              width: item.checked ? 2 : 1,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: AppColors.brandRed.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(item.icon, color: AppColors.brandRed, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.label,
                      style: GoogleFonts.poppins(
                        color: AppColors.navy,
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                      ),
                    ),
                    Text(
                      item.detail,
                      style: GoogleFonts.poppins(
                        color: AppColors.textSecondary,
                        fontSize: 11.5,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              AnimatedContainer(
                duration: const Duration(milliseconds: 150),
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  color: item.checked
                      ? AppColors.onlineGreen
                      : Colors.grey[100],
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: item.checked
                        ? AppColors.onlineGreen
                        : Colors.grey[300]!,
                  ),
                ),
                child: item.checked
                    ? const Icon(Icons.check, color: Colors.white, size: 18)
                    : null,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
