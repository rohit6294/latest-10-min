import 'dart:typed_data';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../router/app_router.dart';

/// Background-isolate tap handler. Required by the plugin. Routing for a
/// notification tapped while the app was terminated is handled on cold
/// start via [NotificationService.consumeLaunchRoute].
@pragma('vm:entry-point')
void notificationTapBackground(NotificationResponse response) {}

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

  /// Display — or, for a cancellation, dismiss — a notification built from
  /// an incoming FCM data message.
  static Future<void> handleMessage(RemoteMessage message) async {
    final data = message.data;
    final type = data['type'] ?? '';
    final requestId = data['requestId'] ?? '';
    if (requestId.isEmpty) return;

    if (type == 'request_cancelled') {
      await _plugin.cancel(_idFor(requestId));
      return;
    }

    final route = _routeFor(type, requestId);
    final title = (data['title'] ?? '').isNotEmpty
        ? data['title']!
        : 'Emergency request';
    final body = (data['body'] ?? '').isNotEmpty
        ? data['body']!
        : 'Tap to respond';

    final androidDetails = AndroidNotificationDetails(
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
      vibrationPattern: Int64List.fromList(<int>[0, 600, 300, 600, 300, 600]),
      audioAttributesUsage: AudioAttributesUsage.alarm,
      ticker: title,
      autoCancel: true,
    );

    const iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
      interruptionLevel: InterruptionLevel.timeSensitive,
    );

    await _plugin.show(
      _idFor(requestId),
      title,
      body,
      NotificationDetails(android: androidDetails, iOS: iosDetails),
      payload: route,
    );
  }

  static String _routeFor(String type, String requestId) {
    switch (type) {
      case 'incoming_ambulance':
        return '/hospital/incoming/$requestId';
      case 'incoming_request':
      default:
        return '/driver/request/$requestId';
    }
  }

  static void _onTap(NotificationResponse response) {
    final route = response.payload;
    if (route != null && route.isNotEmpty) {
      AppRouter.router.go(route);
    }
  }
}
