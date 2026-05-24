import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'dart:async';
import '../../../core/services/alarm_service.dart';
import '../../../core/services/firestore_service.dart';
import '../../../core/services/notification_service.dart';
import '../../../core/models/rescue_request_model.dart';
import '../../../core/models/hospital_model.dart';
import '../../../core/models/ambulance_type.dart';
import '../../../core/constants/app_colors.dart';

class IncomingRequestScreen extends StatefulWidget {
  final String requestId;
  const IncomingRequestScreen({super.key, required this.requestId});

  @override
  State<IncomingRequestScreen> createState() => _IncomingRequestScreenState();
}

class _IncomingRequestScreenState extends State<IncomingRequestScreen>
    with SingleTickerProviderStateMixin {
  final _firestoreService = FirestoreService();
  final _uid = FirebaseAuth.instance.currentUser!.uid;

  int _secondsLeft = 30;
  Timer? _countdownTimer;
  late AnimationController _pulseController;
  bool _accepting = false;
  bool _closing = false;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    )..repeat(reverse: true);
    _startCountdown();
    // Continuous siren + vibration loop until accept / decline / timeout.
    // The OS notification fires once; this keeps the alarm going while the
    // driver is looking at the in-app full-screen request.
    unawaited(AlarmService.start());
  }

  void _startCountdown() {
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (_secondsLeft <= 1) {
        t.cancel();
        unawaited(_ignoreAndExit(showFeedback: false));
      } else {
        setState(() => _secondsLeft--);
      }
    });
  }

  void _stopAttentionLoop() {
    unawaited(AlarmService.stop());
  }

  Future<void> _accept(RescueRequestModel request) async {
    if (_accepting || _closing) return;
    setState(() => _accepting = true);
    _countdownTimer?.cancel();
    _stopAttentionLoop();
    await NotificationService.dismissRequestNotification(widget.requestId);

    try {
      final won = await _firestoreService.driverAcceptRequest(
        widget.requestId,
        _uid,
      );
      if (!mounted) return;

      if (won) {
        context.go('/driver/navigate-patient/${widget.requestId}');
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Request already taken by another driver.'),
            backgroundColor: AppColors.brandRed,
          ),
        );
        context.go('/driver/home');
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _accepting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Network error. Please try again.'),
          backgroundColor: AppColors.brandRed,
        ),
      );
      _startCountdown();
    }
  }

  /// Auto-ignore (timer expired, system back, etc.). We don't prompt for a
  /// reason here because it's not a user-initiated refusal — it's silent
  /// timeout. Logged as 'timeout'.
  Future<void> _ignoreAndExit({
    required bool showFeedback,
    String reason = 'timeout',
    String? reasonText,
  }) async {
    if (_closing) return;
    _closing = true;
    _countdownTimer?.cancel();
    _stopAttentionLoop();
    await NotificationService.dismissRequestNotification(widget.requestId);

    try {
      await _firestoreService.ignorePendingRequest(
        widget.requestId,
        _uid,
        reason: reason,
        reasonText: reasonText,
      );
    } catch (e) {
      _closing = false;
      if (!mounted) return;
      if (showFeedback) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Failed to decline request. Try again.'),
            backgroundColor: AppColors.brandRed,
          ),
        );
      }
      return;
    }

    if (!mounted) return;
    if (showFeedback) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Request declined.'),
          backgroundColor: AppColors.onlineGreen,
        ),
      );
    }
    context.go('/driver/home');
  }

  /// User tapped "Decline" → ask why with 1-tap chips, then ignore with that
  /// reason. Required for ops analytics: we want to know where we're losing
  /// requests (too-far drivers = need more density in that area; wrong-type
  /// drivers = mismatch in dispatch logic; on-break = scheduling).
  Future<void> _decline() async {
    _countdownTimer?.cancel();
    _stopAttentionLoop();
    final picked = await _showRefusalReasonSheet();
    if (picked == null) {
      // User backed out of the sheet — resume countdown.
      if (mounted && !_closing) {
        _startCountdown();
        unawaited(AlarmService.start());
      }
      return;
    }
    await _ignoreAndExit(
      showFeedback: true,
      reason: picked.reason,
      reasonText: picked.reasonText,
    );
  }

  Future<_DeclineChoice?> _showRefusalReasonSheet() async {
    const reasons = <Map<String, dynamic>>[
      {'id': 'too_far', 'label': 'Too far', 'icon': Icons.straighten_rounded},
      {
        'id': 'wrong_type',
        'label': 'Wrong ambulance type',
        'icon': Icons.local_taxi_rounded,
      },
      {'id': 'on_break', 'label': 'On break', 'icon': Icons.coffee_rounded},
      {
        'id': 'vehicle_issue',
        'label': 'Vehicle issue',
        'icon': Icons.build_rounded,
      },
      {
        'id': 'patient_unreachable',
        'label': 'Patient unreachable',
        'icon': Icons.phone_disabled_rounded,
      },
      {'id': 'other', 'label': 'Other', 'icon': Icons.more_horiz_rounded},
    ];
    return showModalBottomSheet<_DeclineChoice>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      isDismissible: true,
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: Colors.grey[300],
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                Text(
                  'Why are you declining?',
                  style: GoogleFonts.poppins(
                    color: AppColors.navy,
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'One tap — your answer helps dispatch add capacity in the right places.',
                  style: GoogleFonts.poppins(
                    color: AppColors.textSecondary,
                    fontSize: 12,
                  ),
                ),
                const SizedBox(height: 14),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: reasons.map((r) {
                    final id = r['id'] as String;
                    return ActionChip(
                      onPressed: () async {
                        if (id == 'other') {
                          final detail = await _promptOtherReasonText();
                          if (!ctx.mounted) return;
                          Navigator.of(ctx).pop(
                            _DeclineChoice(reason: 'other', reasonText: detail),
                          );
                          return;
                        }
                        Navigator.of(ctx).pop(_DeclineChoice(reason: id));
                      },
                      avatar: Icon(
                        r['icon'] as IconData,
                        size: 16,
                        color: AppColors.brandRed,
                      ),
                      label: Text(
                        r['label'] as String,
                        style: GoogleFonts.poppins(
                          color: AppColors.navy,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      backgroundColor: AppColors.brandRed.withValues(
                        alpha: 0.06,
                      ),
                      side: BorderSide(
                        color: AppColors.brandRed.withValues(alpha: 0.2),
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 16),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () => Navigator.of(ctx).pop(),
                    child: Text(
                      'Keep this request',
                      style: GoogleFonts.poppins(
                        color: AppColors.textSecondary,
                        fontWeight: FontWeight.w600,
                      ),
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

  /// Follow-up text capture for the "Other" decline chip. Without this the
  /// "other" bucket is a black hole in ops analytics — the dispatcher cannot
  /// tell *why* drivers keep declining. Optional: a driver who taps "Send"
  /// without text still records the decline, just with no extra context.
  Future<String?> _promptOtherReasonText() async {
    final controller = TextEditingController();
    final detail = await showDialog<String>(
      context: context,
      barrierDismissible: true,
      builder: (dctx) {
        return AlertDialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
          title: Text(
            'What\'s the reason?',
            style: GoogleFonts.poppins(fontWeight: FontWeight.w700),
          ),
          content: TextField(
            controller: controller,
            autofocus: true,
            maxLength: 120,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              hintText: 'e.g. wrong address, no parking, vehicle in service',
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dctx).pop(''),
              child: const Text('Skip'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dctx).pop(controller.text.trim()),
              child: const Text('Decline'),
            ),
          ],
        );
      },
    );
    controller.dispose();
    return detail;
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    _stopAttentionLoop();
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<RescueRequestModel>(
      stream: _firestoreService.watchRequest(widget.requestId),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Scaffold(
            backgroundColor: AppColors.navy,
            body: Center(
              child: CircularProgressIndicator(color: AppColors.brandRed),
            ),
          );
        }
        final request = snapshot.data!;

        if ((request.assignedDriverId != null &&
                request.assignedDriverId != _uid) ||
            request.declinedDriverIds.contains(_uid) ||
            (request.status != RequestStatus.pendingDriver &&
                request.assignedDriverId == null)) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) context.go('/driver/home');
          });
        }

        final gradient = AppColors.urgencyGradient(request.urgencyLevel.value);
        final urgencyColor = gradient[0];

        return PopScope(
          canPop: false,
          onPopInvokedWithResult: (didPop, _) {
            if (!didPop) {
              unawaited(
                _ignoreAndExit(showFeedback: false, reason: 'back_dismissed'),
              );
            }
          },
          child: Scaffold(
            body: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: gradient,
                ),
              ),
              child: SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    children: [
                      const SizedBox(height: 8),
                      // Countdown timer
                      Stack(
                        alignment: Alignment.center,
                        children: [
                          SizedBox(
                            width: 90,
                            height: 90,
                            child: CircularProgressIndicator(
                              value: _secondsLeft / 30,
                              color: Colors.white,
                              backgroundColor: Colors.white.withValues(
                                alpha: 0.2,
                              ),
                              strokeWidth: 5,
                            ),
                          ),
                          Text(
                            '$_secondsLeft',
                            style: GoogleFonts.poppins(
                              color: Colors.white,
                              fontSize: 32,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _secondsLeft > 10
                            ? 'Respond within $_secondsLeft seconds'
                            : 'Hurry! Only $_secondsLeft seconds left',
                        style: GoogleFonts.poppins(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const Spacer(),
                      // Pulsing emergency icon
                      AnimatedBuilder(
                        animation: _pulseController,
                        builder: (_, __) => Transform.scale(
                          scale: 1.0 + _pulseController.value * 0.12,
                          child: Container(
                            width: 110,
                            height: 110,
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.2),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Icons.emergency_rounded,
                              color: Colors.white,
                              size: 60,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          request.urgencyLevel.label,
                          style: GoogleFonts.poppins(
                            color: urgencyColor,
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 2,
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'EMERGENCY REQUEST',
                        style: GoogleFonts.poppins(
                          color: Colors.white,
                          fontSize: 22,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1,
                        ),
                      ),
                      Text(
                        'Type ${request.ambulanceType.value} · ${request.ambulanceType.shortLabel}',
                        style: GoogleFonts.poppins(
                          color: Colors.white70,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const Spacer(),

                      // Info card
                      Container(
                        padding: const EdgeInsets.all(18),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: Colors.white.withValues(alpha: 0.2),
                          ),
                        ),
                        child: Column(
                          children: [
                            _infoRow(
                              Icons.person_outline,
                              'Patient',
                              request.patientName,
                            ),
                            _divider(),
                            _infoRow(
                              Icons.phone_outlined,
                              'Phone',
                              request.patientPhone,
                            ),
                            if (request.emergencyDescription.isNotEmpty) ...[
                              _divider(),
                              _infoRow(
                                Icons.info_outline,
                                'Details',
                                request.emergencyDescription,
                                maxLines: 2,
                              ),
                            ],
                            _divider(),
                            _hospitalRow(request.preferredHospitalId),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),

                      // Accept / Decline buttons
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: (_accepting || _closing)
                                  ? null
                                  : () => unawaited(_decline()),
                              style: OutlinedButton.styleFrom(
                                foregroundColor: Colors.white,
                                side: BorderSide(
                                  color: Colors.white.withValues(alpha: 0.4),
                                ),
                                padding: const EdgeInsets.symmetric(
                                  vertical: 16,
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(14),
                                ),
                              ),
                              child: Text(
                                _closing ? 'Declining...' : 'Decline',
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            flex: 2,
                            child: ElevatedButton(
                              onPressed: (_accepting || _closing)
                                  ? null
                                  : () => _accept(request),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: Colors.white,
                                foregroundColor: urgencyColor,
                                padding: const EdgeInsets.symmetric(
                                  vertical: 16,
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(14),
                                ),
                              ),
                              child: _accepting
                                  ? SizedBox(
                                      width: 22,
                                      height: 22,
                                      child: CircularProgressIndicator(
                                        color: urgencyColor,
                                        strokeWidth: 2.5,
                                      ),
                                    )
                                  : Text(
                                      'ACCEPT REQUEST',
                                      style: GoogleFonts.poppins(
                                        fontSize: 14,
                                        fontWeight: FontWeight.w800,
                                        letterSpacing: 0.5,
                                      ),
                                    ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _infoRow(
    IconData icon,
    String label,
    String value, {
    int maxLines = 1,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: Colors.white70, size: 16),
        const SizedBox(width: 10),
        SizedBox(
          width: 60,
          child: Text(
            label,
            style: GoogleFonts.poppins(color: Colors.white70, fontSize: 12),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: GoogleFonts.poppins(
              color: Colors.white,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
            maxLines: maxLines,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.right,
          ),
        ),
      ],
    );
  }

  Widget _divider() => Container(
    height: 1,
    margin: const EdgeInsets.symmetric(vertical: 10),
    color: Colors.white.withValues(alpha: 0.15),
  );

  Widget _hospitalRow(String? hospitalId) {
    if (hospitalId == null || hospitalId.isEmpty) {
      return _infoRow(
        Icons.local_hospital_outlined,
        'Hospital',
        'You will pick after pickup',
      );
    }
    return FutureBuilder<DocumentSnapshot>(
      future: FirebaseFirestore.instance
          .collection('hospitals')
          .doc(hospitalId)
          .get(),
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return _infoRow(
            Icons.local_hospital_outlined,
            'Hospital',
            'Loading...',
          );
        }
        if (!snap.hasData || !snap.data!.exists) {
          return _infoRow(
            Icons.local_hospital_outlined,
            'Hospital',
            'Pre-selected',
          );
        }
        final h = HospitalModel.fromFirestore(snap.data!);
        return _infoRow(Icons.local_hospital_outlined, 'Hospital', h.name);
      },
    );
  }
}

/// Result of the decline-reason flow. `reasonText` is only populated when the
/// driver picks "Other" and types a follow-up. Empty/null otherwise.
class _DeclineChoice {
  final String reason;
  final String? reasonText;
  const _DeclineChoice({required this.reason, this.reasonText});
}
