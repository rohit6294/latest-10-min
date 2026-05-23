import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../features/auth/screens/splash_screen.dart';
import '../../features/auth/screens/login_screen.dart';
import '../../features/auth/screens/register_screen.dart';
import '../../features/driver/screens/driver_home_screen.dart';
import '../../features/driver/screens/document_upload_screen.dart';
import '../../features/driver/screens/incoming_request_screen.dart';
import '../../features/driver/screens/navigate_to_patient_screen.dart';
import '../../features/driver/screens/patient_picked_up_screen.dart';
import '../../features/driver/screens/navigate_to_hospital_screen.dart';
import '../../features/driver/screens/ride_complete_screen.dart';
import '../../features/driver/screens/sos_active_screen.dart';
import '../../features/driver/screens/select_hospital_screen.dart';
import '../../features/driver/screens/profile_screen.dart';
import '../../features/driver/screens/trip_history_screen.dart';
import '../../features/hospital/screens/hospital_home_screen.dart';
import '../../features/hospital/screens/incoming_ambulance_screen.dart';
import '../../features/hospital/screens/track_ambulance_screen.dart';
import '../../features/hospital/screens/intake_checklist_screen.dart';
import '../../features/hospital/screens/patient_received_screen.dart';

class AppRouter {
  static final GoRouter router = GoRouter(
    initialLocation: '/splash',
    refreshListenable: GoRouterRefreshStream(
      FirebaseAuth.instance.authStateChanges(),
    ),
    redirect: (context, state) {
      final isLoggedIn = FirebaseAuth.instance.currentUser != null;
      final loc = state.matchedLocation;
      final isAuthRoute =
          loc == '/splash' ||
          loc.startsWith('/auth/') ||
          loc == '/driver/upload-docs' ||
          loc.startsWith('/driver/sos/') ||
          loc.startsWith('/hospital/');
      if (!isLoggedIn && !isAuthRoute) return '/auth/login';
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, __) => const SplashScreen()),

      // ── Auth ──────────────────────────────────────────────────────────────
      GoRoute(path: '/auth/login', builder: (_, __) => const LoginScreen()),
      GoRoute(
        path: '/auth/register',
        builder: (_, __) => const RegisterScreen(),
      ),

      // ── Driver ────────────────────────────────────────────────────────────
      GoRoute(
        path: '/driver/upload-docs',
        builder: (_, __) => const DocumentUploadScreen(),
      ),
      GoRoute(
        path: '/driver/home',
        builder: (_, __) => const DriverHomeScreen(),
      ),
      GoRoute(
        path: '/driver/request/:requestId',
        builder: (_, state) => IncomingRequestScreen(
          requestId: state.pathParameters['requestId']!,
        ),
      ),
      GoRoute(
        path: '/driver/navigate-patient/:requestId',
        builder: (_, state) => NavigateToPatientScreen(
          requestId: state.pathParameters['requestId']!,
        ),
      ),
      GoRoute(
        path: '/driver/pickup-confirm/:requestId',
        builder: (_, state) => PatientPickedUpScreen(
          requestId: state.pathParameters['requestId']!,
        ),
      ),
      GoRoute(
        path: '/driver/select-hospital/:requestId',
        builder: (_, state) =>
            SelectHospitalScreen(requestId: state.pathParameters['requestId']!),
      ),
      GoRoute(
        path: '/driver/navigate-hospital/:requestId',
        builder: (_, state) => NavigateToHospitalScreen(
          requestId: state.pathParameters['requestId']!,
        ),
      ),
      GoRoute(
        path: '/driver/ride-complete',
        builder: (_, __) => const RideCompleteScreen(),
      ),
      GoRoute(
        path: '/driver/sos/:sosId',
        builder: (_, state) =>
            SosActiveScreen(sosId: state.pathParameters['sosId']!),
      ),
      GoRoute(
        path: '/driver/profile',
        builder: (_, __) => const ProfileScreen(),
      ),
      GoRoute(
        path: '/driver/history',
        builder: (_, __) => const TripHistoryScreen(),
      ),

      // ── Hospital ──────────────────────────────────────────────────────────
      GoRoute(
        path: '/hospital/home',
        builder: (_, __) => const HospitalHomeScreen(),
      ),
      GoRoute(
        path: '/hospital/incoming/:requestId',
        builder: (_, state) => IncomingAmbulanceScreen(
          requestId: state.pathParameters['requestId']!,
        ),
      ),
      GoRoute(
        path: '/hospital/track/:requestId',
        builder: (_, state) =>
            TrackAmbulanceScreen(requestId: state.pathParameters['requestId']!),
      ),
      GoRoute(
        path: '/hospital/checklist/:requestId',
        builder: (_, state) => IntakeChecklistScreen(
          requestId: state.pathParameters['requestId']!,
        ),
      ),
      GoRoute(
        path: '/hospital/received/:requestId',
        builder: (_, state) => PatientReceivedScreen(
          requestId: state.pathParameters['requestId']!,
        ),
      ),
    ],
    errorBuilder: (context, state) =>
        Scaffold(body: Center(child: Text('Page not found: ${state.error}'))),
  );
}

class GoRouterRefreshStream extends ChangeNotifier {
  GoRouterRefreshStream(Stream<dynamic> stream) {
    notifyListeners();
    _subscription = stream.listen((_) => notifyListeners());
  }
  late final dynamic _subscription;

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }
}
