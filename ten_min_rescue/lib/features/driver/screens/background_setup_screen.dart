import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/services/oem_setup_service.dart';

/// One-time onboarding shown to drivers that explains the OEM-specific
/// switches required for emergency alerts to ring reliably when the app
/// is backgrounded — and deep-links to each settings page.
///
/// Android does not expose Autostart / background-power-management toggles
/// to apps, so the user must flip them manually. Without this step, the
/// OEM will silently kill our process and FCM pushes will not ring.
class BackgroundSetupScreen extends StatefulWidget {
  const BackgroundSetupScreen({super.key, this.onDone});

  /// Called after the user finishes (or skips) setup.
  final VoidCallback? onDone;

  static const _seenKey = 'driver_background_setup_seen_v1';

  /// Returns true the first time this driver opens the app. Records that
  /// they've seen the screen so the next launch skips it.
  static Future<bool> shouldShow() async {
    final prefs = await SharedPreferences.getInstance();
    return !(prefs.getBool(_seenKey) ?? false);
  }

  static Future<void> markSeen() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_seenKey, true);
  }

  @override
  State<BackgroundSetupScreen> createState() => _BackgroundSetupScreenState();
}

class _BackgroundSetupScreenState extends State<BackgroundSetupScreen> {
  OemBrand _brand = OemBrand.other;
  bool _notificationsGranted = false;
  bool _batteryIgnored = false;
  bool _autostartOpened = false;
  bool _backgroundOpened = false;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    final brand = await OemSetupService.detectBrand();
    final notif = await Permission.notification.isGranted;
    final batt = await OemSetupService.isBatteryOptimizationIgnored();
    if (!mounted) return;
    setState(() {
      _brand = brand;
      _notificationsGranted = notif;
      _batteryIgnored = batt;
      _loaded = true;
    });
  }

  Future<void> _requestNotifications() async {
    await Permission.notification.request();
    await _refresh();
  }

  Future<void> _requestBattery() async {
    await OemSetupService.openBatteryOptimization();
    // Give the OS a moment to flip the flag before we re-check.
    await Future.delayed(const Duration(milliseconds: 600));
    await _refresh();
  }

  Future<void> _openAutostart() async {
    await OemSetupService.openAutostart();
    setState(() => _autostartOpened = true);
  }

  Future<void> _openBackgroundActivity() async {
    await OemSetupService.openBackgroundActivity();
    setState(() => _backgroundOpened = true);
  }

  Future<void> _finish() async {
    await BackgroundSetupScreen.markSeen();
    if (!mounted) return;
    widget.onDone?.call();
  }

  @override
  Widget build(BuildContext context) {
    if (!_loaded) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    final steps = <_Step>[
      _Step(
        title: 'Allow notifications',
        body:
            'Required for incoming-request alerts to ring on this device.',
        done: _notificationsGranted,
        actionLabel: _notificationsGranted ? 'Allowed' : 'Allow',
        onTap: _notificationsGranted ? null : _requestNotifications,
      ),
      _Step(
        title: 'Battery optimisation',
        body:
            'Without this, Android will pause the app after a few minutes '
            'and emergency alerts will not ring.',
        done: _batteryIgnored,
        actionLabel: _batteryIgnored ? 'Done' : 'Open settings',
        onTap: _batteryIgnored ? null : _requestBattery,
      ),
      if (_brand.hasAutostart)
        _Step(
          title: 'Autostart',
          body:
              '${_brand.label} kills apps in the background. Find '
              '"Suraksha Kavach" in the list and turn Autostart ON.',
          done: _autostartOpened,
          actionLabel: _autostartOpened ? 'Re-open' : 'Open Autostart',
          onTap: _openAutostart,
          manualConfirm: true,
        ),
      if (_brand.hasBackgroundActivity)
        _Step(
          title: 'Allow background activity',
          body:
              'On the next screen find "Suraksha Kavach" and set background '
              'activity / power usage to "Allowed" or "No restrictions".',
          done: _backgroundOpened,
          actionLabel: _backgroundOpened ? 'Re-open' : 'Open settings',
          onTap: _openBackgroundActivity,
          manualConfirm: true,
        ),
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Keep alerts ringing'),
        backgroundColor: AppColors.brandRed,
        foregroundColor: Colors.white,
        automaticallyImplyLeading: false,
      ),
      body: SafeArea(
        child: Column(
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              color: AppColors.brandRed.withValues(alpha: 0.08),
              child: Text(
                'Suraksha Kavach is an emergency dispatch app. For alerts '
                'to ring even when you are using another app or the phone '
                'is locked, please complete the steps below.',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ),
            Expanded(
              child: ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: steps.length,
                separatorBuilder: (_, _) => const SizedBox(height: 12),
                itemBuilder: (context, i) => _StepCard(step: steps[i]),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brandRed,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  onPressed: _finish,
                  child: const Text('Done — start using the app'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Step {
  _Step({
    required this.title,
    required this.body,
    required this.done,
    required this.actionLabel,
    required this.onTap,
    this.manualConfirm = false,
  });

  final String title;
  final String body;
  final bool done;
  final String actionLabel;
  final VoidCallback? onTap;

  /// True when the OS won't tell us whether the user actually flipped the
  /// switch (OEM autostart pages); we show a tick once they've opened it
  /// rather than once we've verified the state.
  final bool manualConfirm;
}

class _StepCard extends StatelessWidget {
  const _StepCard({required this.step});

  final _Step step;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: step.done
              ? Colors.green.withValues(alpha: 0.5)
              : Colors.grey.withValues(alpha: 0.3),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              step.done ? Icons.check_circle : Icons.radio_button_unchecked,
              color: step.done ? Colors.green : Colors.grey,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    step.title,
                    style: Theme.of(
                      context,
                    ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    step.body,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton(
                    onPressed: step.onTap,
                    child: Text(step.actionLabel),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
