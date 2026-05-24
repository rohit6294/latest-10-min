import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

import 'firestore_service.dart';
import 'notification_service.dart';

/// Top-level background push handler — runs in its own isolate when a push
/// arrives while the app is backgrounded or terminated.
///
/// On iOS the APNs `alert` payload is displayed by the system itself, so we
/// only build our own rich full-screen alert on Android (avoids a duplicate).
@pragma('vm:entry-point')
Future<void> fcmBackgroundHandler(RemoteMessage message) async {
  if (!Platform.isAndroid) return;
  await Firebase.initializeApp();
  await NotificationService.ensureInitialized();
  await NotificationService.handleMessage(message);
}

/// FCM Service — registers the device token so Cloud Functions can push
/// notifications, and routes incoming foreground pushes to the
/// [NotificationService] so they appear as loud, call-style alerts.
class FcmService {
  FcmService._();

  static final _messaging = FirebaseMessaging.instance;
  static final _firestore = FirestoreService();

  /// Register push listeners. Call once at app startup.
  ///
  /// - `onMessage` — push arrives while app is foregrounded
  /// - `onMessageOpenedApp` — user taps a system notification while the app
  ///    was in the background
  /// - `getInitialMessage` — user tapped a system notification that
  ///    cold-started the app from terminated state
  static void setupListeners() {
    FirebaseMessaging.onMessage.listen((message) {
      NotificationService.handleForegroundMessage(message);
    });
    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      NotificationService.handleNotificationTap(message);
    });
    _messaging.getInitialMessage().then((message) {
      if (message != null) {
        NotificationService.handleNotificationTap(message);
      }
    });
  }

  /// Request permission and save the FCM token on the driver's document.
  /// Call after the driver is logged in.
  static Future<void> initForDriver(String driverId) =>
      _registerToken((token) => _firestore.saveDriverFcmToken(driverId, token));

  /// Request permission and save the FCM token on the hospital's document.
  static Future<void> initForHospital(String hospitalId) => _registerToken(
    (token) => _firestore.saveHospitalFcmToken(hospitalId, token),
  );

  static Future<void> _registerToken(
    Future<void> Function(String token) save,
  ) async {
    try {
      await _messaging.requestPermission(alert: true, badge: true, sound: true);
      await NotificationService.requestPermission();

      // iOS: the APNs token must be ready before requesting the FCM token,
      // otherwise getToken() can return null.
      if (Platform.isIOS) {
        await _messaging.getAPNSToken();
      }

      final token = await _messaging.getToken();
      if (token != null) {
        await save(token);
      }
      _messaging.onTokenRefresh.listen(save);
    } catch (e) {
      // Best-effort — never crash the app over notification setup.
      // ignore: avoid_print
      print('FcmService: token registration failed — $e');
    }
  }
}
