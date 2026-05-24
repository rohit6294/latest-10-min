import 'dart:typed_data';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../router/app_router.dart';

/// Background-isolate tap handler. Required by the plugin. Routing for a
/// notification tapped while the app was terminated is handled on cold
/// start via [NotificationService.consumeLaunchRoute].
@pragma('vm:entry-point')
void notificationTapBackground(NotificationResponse response) {}

enum _NotificationKind { emergency, update }

class _NotificationConfig {
  final _NotificationKind kind;
  final String? route;
  final bool autoOpenInForeground;

  const _NotificationConfig({
    required this.kind,
    this.route,
    this.autoOpenInForeground = false,
  });
}

/// Builds and displays local notifications — including the loud, call-style
/// full-screen alert shown for a new ambulance/patient request.
class NotificationService {
  NotificationService._();

  static final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();

  static const String emergencyChannelId = 'emergency_requests';
  static const String _channelName = 'Emergency Requests';
  static const String _channelDesc =
      'Loud, full-screen alerts for new ambulance and patient requests';
  static const String _updatesChannelId = 'request_updates';
  static const String _updatesChannelName = 'Request Updates';
  static const String _updatesChannelDesc =
      'Patient instructions and trip updates';

  static bool _initialized = false;
  static String? _launchRoute;

  /// Initialise the plugin and create the emergency channel.
  /// Safe to call from both the main and background isolates; idempotent.
  static Future<void> ensureInitialized() async {
    if (_initialized) return;
    _initialized = true;

    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosInit = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );

    await _plugin.initialize(
      const InitializationSettings(android: androidInit, iOS: iosInit),
      onDidReceiveNotificationResponse: _onTap,
      onDidReceiveBackgroundNotificationResponse: notificationTapBackground,
    );

    final android = _plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    await android?.createNotificationChannel(
      const AndroidNotificationChannel(
        emergencyChannelId,
        _channelName,
        description: _channelDesc,
        importance: Importance.max,
        playSound: true,
        enableVibration: true,
        enableLights: true,
        audioAttributesUsage: AudioAttributesUsage.alarm,
      ),
    );
    await android?.createNotificationChannel(
      const AndroidNotificationChannel(
        _updatesChannelId,
        _updatesChannelName,
        description: _updatesChannelDesc,
        importance: Importance.high,
        playSound: true,
        enableVibration: true,
      ),
    );

    // Capture a notification tap that cold-started the app.
    final launch = await _plugin.getNotificationAppLaunchDetails();
    if (launch?.didNotificationLaunchApp ?? false) {
      _launchRoute = launch?.notificationResponse?.payload;
    }
  }

  /// The route the app was launched into via a notification tap, or null.
  /// Returns it once, then clears it.
  static String? consumeLaunchRoute() {
    final route = _launchRoute;
    _launchRoute = null;
    return route;
  }

  /// Ask the OS for notification permission (Android 13+ and iOS).
  static Future<void> requestPermission() async {
    await _plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >()
        ?.requestNotificationsPermission();
    await _plugin
        .resolvePlatformSpecificImplementation<
          IOSFlutterLocalNotificationsPlugin
        >()
        ?.requestPermissions(alert: true, badge: true, sound: true);
  }

  static int _idFor(String requestId) => requestId.hashCode & 0x7fffffff;

  static Future<void> dismissRequestNotification(String requestId) async {
    if (requestId.isEmpty) return;
    await _plugin.cancel(_idFor(requestId));
  }

  /// Foreground pushes can open the in-app full-screen request screen
  /// immediately instead of waiting for a notification tap.
  static Future<void> handleForegroundMessage(RemoteMessage message) =>
      _handleMessage(message, allowAutoOpen: true, isBackground: false);

  /// Display — or, for a cancellation, dismiss — a notification built from
  /// an incoming FCM data message.
  static Future<void> handleMessage(RemoteMessage message) =>
      _handleMessage(message, allowAutoOpen: false, isBackground: true);

  /// Routes to the in-app request screen when the user taps a system-shown
  /// notification (background or terminated state). Defers routing until
  /// after the first frame so [AppRouter] is ready.
  static void handleNotificationTap(RemoteMessage message) {
    final data = message.data;
    final type = data['type'] ?? '';
    final requestId = data['requestId'] ?? '';
    if (requestId.isEmpty) return;
    final config = _configFor(type, requestId);
    final route = config?.route;
    if (route == null || route.isEmpty) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      AppRouter.router.go(route);
    });
  }

  static Future<void> _handleMessage(
    RemoteMessage message, {
    required bool allowAutoOpen,
    required bool isBackground,
  }) async {
    final data = message.data;
    final type = data['type'] ?? '';
    final requestId = data['requestId'] ?? '';
    if (requestId.isEmpty) return;

    if (type == 'request_cancelled') {
      await _plugin.cancel(_idFor(requestId));
      return;
    }

    final config = _configFor(type, requestId);
    if (config == null) return;

    final fallbackTitle = config.kind == _NotificationKind.emergency
        ? 'Emergency request'
        : 'Request update';
    final fallbackBody = config.kind == _NotificationKind.emergency
        ? 'Tap to respond'
        : 'Open the app to review the update';
    final title = (data['title'] ?? '').isNotEmpty
        ? data['title']!
        : ((message.notification?.title ?? '').isNotEmpty
              ? message.notification!.title!
              : fallbackTitle);
    final body = (data['body'] ?? '').isNotEmpty
        ? data['body']!
        : ((message.notification?.body ?? '').isNotEmpty
              ? message.notification!.body!
              : fallbackBody);

    // In background, the FCM `notification` block makes Android render the
    // system notification itself (rings even if our isolate was frozen).
    // Skip our local notification in that case to avoid a duplicate.
    final systemAlreadyShowed = isBackground && message.notification != null;
    if (!systemAlreadyShowed) {
      await _plugin.show(
        _idFor(requestId),
        title,
        body,
        _detailsFor(config.kind, title),
        payload: config.route,
      );
    }

    if (allowAutoOpen &&
        config.autoOpenInForeground &&
        config.route != null &&
        config.route!.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final currentLocation = AppRouter
            .router
            .routeInformationProvider
            .value
            .uri
            .toString();
        if (currentLocation != config.route) {
          AppRouter.router.go(config.route!);
        }
      });
    }
  }

  static NotificationDetails _detailsFor(_NotificationKind kind, String title) {
    final androidDetails = kind == _NotificationKind.emergency
        ? AndroidNotificationDetails(
            emergencyChannelId,
            _channelName,
            channelDescription: _channelDesc,
            importance: Importance.max,
            priority: Priority.max,
            category: AndroidNotificationCategory.call,
            fullScreenIntent: true,
            visibility: NotificationVisibility.public,
            playSound: true,
            enableVibration: true,
            vibrationPattern: Int64List.fromList(<int>[
              0,
              600,
              300,
              600,
              300,
              600,
            ]),
            audioAttributesUsage: AudioAttributesUsage.alarm,
            ticker: title,
            autoCancel: true,
          )
        : AndroidNotificationDetails(
            _updatesChannelId,
            _updatesChannelName,
            channelDescription: _updatesChannelDesc,
            importance: Importance.high,
            priority: Priority.high,
            category: AndroidNotificationCategory.message,
            visibility: NotificationVisibility.private,
            playSound: true,
            enableVibration: true,
            ticker: title,
            autoCancel: true,
          );

    final iosDetails = kind == _NotificationKind.emergency
        ? const DarwinNotificationDetails(
            presentAlert: true,
            presentBadge: true,
            presentSound: true,
            interruptionLevel: InterruptionLevel.timeSensitive,
          )
        : const DarwinNotificationDetails(
            presentAlert: true,
            presentBadge: true,
            presentSound: true,
            interruptionLevel: InterruptionLevel.active,
          );

    return NotificationDetails(android: androidDetails, iOS: iosDetails);
  }

  static _NotificationConfig? _configFor(String type, String requestId) {
    switch (type) {
      case 'incoming_ambulance':
        return _NotificationConfig(
          kind: _NotificationKind.emergency,
          route: '/hospital/incoming/$requestId',
          autoOpenInForeground: true,
        );
      case 'incoming_request':
        return _NotificationConfig(
          kind: _NotificationKind.emergency,
          route: '/driver/request/$requestId',
          autoOpenInForeground: true,
        );
      case 'patient_instruction':
        return const _NotificationConfig(kind: _NotificationKind.update);
      default:
        return null;
    }
  }

  static void _onTap(NotificationResponse response) {
    final route = response.payload;
    if (route != null && route.isNotEmpty) {
      AppRouter.router.go(route);
    }
  }
}
