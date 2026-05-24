import 'dart:convert';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:audioplayers/audioplayers.dart';
import '../../../core/services/firestore_service.dart';
import '../../../core/models/rescue_request_model.dart';
import '../../../core/models/ambulance_type.dart';
import '../../../core/constants/app_colors.dart';

/// Incoming ambulance NOTIFICATION (no accept/decline).
/// The hospital was already auto-assigned. They just prepare the bed.
class IncomingAmbulanceScreen extends StatefulWidget {
  final String requestId;
  const IncomingAmbulanceScreen({super.key, required this.requestId});

  @override
  State<IncomingAmbulanceScreen> createState() =>
      _IncomingAmbulanceScreenState();
}

class _IncomingAmbulanceScreenState extends State<IncomingAmbulanceScreen>
    with SingleTickerProviderStateMixin {
  final _firestoreService = FirestoreService();
  late AnimationController _pulseController;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
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
            body: Center(
                child: CircularProgressIndicator(color: AppColors.brandRed)),
          );
        }
        final request = snapshot.data!;
        final urgencyColor =
            AppColors.urgencyColor(request.urgencyLevel.value);
        final gradient =
            AppColors.urgencyGradient(request.urgencyLevel.value);

        return Scaffold(
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
                    const SizedBox(height: 16),
                    // Banner
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 6),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        'AMBULANCE INCOMING',
                        style: GoogleFonts.poppins(
                          color: urgencyColor,
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 2,
                        ),
                      ),
                    ),
                    const Spacer(),
                    // Animated icon
                    AnimatedBuilder(
                      animation: _pulseController,
                      builder: (_, __) => Transform.scale(
                        scale: 1.0 + _pulseController.value * 0.12,
                        child: Container(
                          width: 130,
                          height: 130,
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.2),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(Icons.directions_car_rounded,
                              color: Colors.white, size: 70),
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),
                    Text(
                      'Patient en route',
                      style: GoogleFonts.poppins(
                        color: Colors.white,
                        fontSize: 24,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Type ${request.ambulanceType.value} · ${request.ambulanceType.shortLabel}',
                      style: GoogleFonts.poppins(
                        color: Colors.white70,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const Spacer(),
                    // Scrollable card so the pre-arrival handoff (patient +
                    // driver + instructions) all fits on a small phone screen.
                    Flexible(
                      child: SingleChildScrollView(
                        child: Column(
                          children: [
                            // Patient info
                            Container(
                              padding: const EdgeInsets.all(18),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.12),
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(
                                    color:
                                        Colors.white.withValues(alpha: 0.2)),
                              ),
                              child: Column(
                                children: [
                                  _infoRow(Icons.person_outline, 'Patient',
                                      request.patientName),
                                  _divider(),
                                  _infoRow(Icons.phone_outlined, 'Phone',
                                      request.patientPhone),
                                  _divider(),
                                  _infoRow(
                                    Icons.warning_rounded,
                                    'Urgency',
                                    request.urgencyLevel.label,
                                  ),
                                  if (request.emergencyDescription.isNotEmpty) ...[
                                    _divider(),
                                    _infoRow(
                                      Icons.info_outline,
                                      'Details',
                                      request.emergencyDescription,
                                      maxLines: 3,
                                    ),
                                  ],
                                  _divider(),
                                  _infoRow(
                                    Icons.person_pin_circle_outlined,
                                    'Selected by',
                                    request.hospitalChosenBy == 'patient'
                                        ? 'Patient (via SOS)'
                                        : 'Driver',
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 12),
                            // Driver handoff card — name, phone, vehicle
                            if (request.assignedDriverId != null &&
                                request.assignedDriverId!.isNotEmpty)
                              _DriverHandoffCard(
                                driverId: request.assignedDriverId!,
                              ),
                            const SizedBox(height: 12),
                            // Patient instructions / voice notes for ER prep
                            _HospitalInstructionsCard(
                              requestId: widget.requestId,
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    // Action buttons
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.info_outline,
                              color: Colors.white70, size: 18),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Prepare the bed and monitor patient progress.',
                              style: GoogleFonts.poppins(
                                  color: Colors.white,
                                  fontSize: 12,
                                  height: 1.4),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: () => context
                            .go('/hospital/track/${widget.requestId}'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: urgencyColor,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                        icon: const Icon(Icons.navigation_rounded),
                        label: Text(
                          'TRACK AMBULANCE LIVE',
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
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _infoRow(IconData icon, String label, String value,
      {int maxLines = 1}) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: Colors.white70, size: 16),
        const SizedBox(width: 10),
        SizedBox(
          width: 70,
          child: Text(
            label,
            style: GoogleFonts.poppins(
                color: Colors.white70, fontSize: 12),
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
}

/// Hospital-side handoff card: shows incoming driver name, phone, vehicle and
/// a tap-to-call button so the ER charge nurse can reach the crew directly
/// before arrival.
class _DriverHandoffCard extends StatelessWidget {
  final String driverId;
  const _DriverHandoffCard({required this.driverId});

  Future<void> _call(BuildContext context, String phone) async {
    final uri = Uri.parse('tel:$phone');
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<DocumentSnapshot>(
      stream: FirebaseFirestore.instance
          .collection('drivers')
          .doc(driverId)
          .snapshots(),
      builder: (context, snap) {
        if (!snap.hasData || !snap.data!.exists) {
          return const SizedBox.shrink();
        }
        final data = (snap.data!.data() as Map<String, dynamic>?) ?? {};
        final name = (data['name'] as String?)?.trim();
        final phone = (data['phone'] as String?)?.trim();
        final vehicle = (data['vehicleNumber'] as String?)?.trim();

        return Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
          ),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.local_shipping_rounded,
                  color: Colors.white,
                  size: 26,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'INBOUND DRIVER',
                      style: GoogleFonts.poppins(
                        color: Colors.white70,
                        fontSize: 10.5,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1.2,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      name?.isNotEmpty == true ? name! : 'Driver',
                      style: GoogleFonts.poppins(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (vehicle != null && vehicle.isNotEmpty)
                      Text(
                        vehicle,
                        style: GoogleFonts.poppins(
                          color: Colors.white70,
                          fontSize: 11.5,
                        ),
                      ),
                  ],
                ),
              ),
              if (phone != null && phone.isNotEmpty)
                Material(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: () => _call(context, phone),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                      child: const Icon(
                        Icons.phone_rounded,
                        color: AppColors.brandRed,
                        size: 22,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

/// Hospital-side display of the patient instruction feed (text + voice).
/// Critical for ER prep — eg "patient is diabetic" / "stroke onset 7:42".
class _HospitalInstructionsCard extends StatefulWidget {
  final String requestId;
  const _HospitalInstructionsCard({required this.requestId});

  @override
  State<_HospitalInstructionsCard> createState() =>
      _HospitalInstructionsCardState();
}

class _HospitalInstructionsCardState extends State<_HospitalInstructionsCard> {
  final AudioPlayer _audioPlayer = AudioPlayer();
  String? _playingId;

  @override
  void dispose() {
    _audioPlayer.dispose();
    super.dispose();
  }

  Future<void> _play(Map<String, dynamic> it) async {
    final id = it['id'] as String?;
    final url = it['audioUrl'] as String?;
    final b64 = it['audioBase64'] as String?;
    final mime = it['mimeType'] as String? ?? 'audio/webm';
    try {
      if (_playingId == id) {
        await _audioPlayer.stop();
        if (mounted) setState(() => _playingId = null);
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
      if (mounted) setState(() => _playingId = id);
      _audioPlayer.onPlayerComplete.first.then((_) {
        if (mounted) setState(() => _playingId = null);
      });
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not play voice note.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<Map<String, dynamic>>>(
      stream: FirestoreService().watchInstructions(widget.requestId),
      builder: (context, snap) {
        final items = snap.data ?? const <Map<String, dynamic>>[];
        if (items.isEmpty) return const SizedBox.shrink();
        return Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(
                    Icons.chat_bubble_outline_rounded,
                    size: 14,
                    color: Colors.white,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    'PATIENT NOTES (${items.length})',
                    style: GoogleFonts.poppins(
                      color: Colors.white,
                      fontSize: 10.5,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.8,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              ...items.map((it) {
                final type = it['type'] as String? ?? 'text';
                final stamp = hospitalRelativeTime(it['createdAt']);
                final stampWidget = stamp.isEmpty
                    ? const SizedBox.shrink()
                    : Padding(
                        padding: const EdgeInsets.only(top: 2, right: 2),
                        child: Align(
                          alignment: Alignment.centerRight,
                          child: Text(
                            stamp,
                            style: GoogleFonts.poppins(
                              color: Colors.white.withValues(alpha: 0.7),
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
                  final hasAudio = (url != null && url.isNotEmpty) ||
                      (b64 != null && b64.isNotEmpty);
                  final isPlaying = id != null && id == _playingId;
                  return Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.mic_rounded,
                                color: Colors.white, size: 16),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                'Voice note · ${dur}s',
                                style: GoogleFonts.poppins(
                                  color: Colors.white,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            if (hasAudio)
                              TextButton.icon(
                                onPressed: () => _play(it),
                                icon: Icon(
                                  isPlaying
                                      ? Icons.stop_rounded
                                      : Icons.play_arrow_rounded,
                                  size: 16,
                                  color: Colors.white,
                                ),
                                label: Text(
                                  isPlaying ? 'Stop' : 'Play',
                                  style: GoogleFonts.poppins(
                                    color: Colors.white,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                style: TextButton.styleFrom(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 4,
                                  ),
                                  minimumSize: Size.zero,
                                  tapTargetSize:
                                      MaterialTapTargetSize.shrinkWrap,
                                ),
                              )
                          ],
                        ),
                        stampWidget,
                      ],
                    ),
                  );
                }
                return Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(
                            Icons.sticky_note_2_outlined,
                            color: Colors.white,
                            size: 16,
                          ),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              (it['text'] as String? ?? '').trim(),
                              style: GoogleFonts.poppins(
                                color: Colors.white,
                                fontSize: 12.5,
                                fontWeight: FontWeight.w500,
                                height: 1.35,
                              ),
                            ),
                          ),
                        ],
                      ),
                      stampWidget,
                    ],
                  ),
                );
              }),
            ],
          ),
        );
      },
    );
  }
}

/// Compact "Xs/Xm/Xh ago" label for a Firestore Timestamp (or null).
String hospitalRelativeTime(dynamic createdAt) {
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
