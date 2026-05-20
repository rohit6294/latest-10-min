import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'core/constants/app_colors.dart';
import 'core/router/app_router.dart';
import 'core/services/notification_service.dart';

/// Suraksha Kavach — Emergency Ambulance Service
class TenMinRescueApp extends ConsumerStatefulWidget {
  const TenMinRescueApp({super.key});

  @override
  ConsumerState<TenMinRescueApp> createState() => _TenMinRescueAppState();
}

class _TenMinRescueAppState extends ConsumerState<TenMinRescueApp> {
  @override
  void initState() {
    super.initState();
    // If the app was cold-started by tapping an emergency notification,
    // jump straight to that request once the first frame is rendered.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final route = NotificationService.consumeLaunchRoute();
      if (route != null && route.isNotEmpty) {
        AppRouter.router.go(route);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final baseTextTheme = GoogleFonts.poppinsTextTheme();

    return MaterialApp.router(
      title: 'Suraksha Kavach',
      debugShowCheckedModeBanner: false,
      routerConfig: AppRouter.router,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.brandRed,
          primary: AppColors.brandRed,
          secondary: AppColors.navy,
          error: AppColors.brandRed,
          brightness: Brightness.light,
        ),
        scaffoldBackgroundColor: AppColors.lightBg,
        textTheme: baseTextTheme.apply(
          bodyColor: AppColors.navy,
          displayColor: AppColors.navy,
        ),
        appBarTheme: AppBarTheme(
          backgroundColor: Colors.white,
          foregroundColor: AppColors.navy,
          elevation: 0,
          centerTitle: false,
          titleTextStyle: GoogleFonts.poppins(
            color: AppColors.navy,
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
          iconTheme: const IconThemeData(color: AppColors.navy),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.brandRed,
            foregroundColor: Colors.white,
            elevation: 0,
            padding:
                const EdgeInsets.symmetric(vertical: 16, horizontal: 24),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
            textStyle: GoogleFonts.poppins(
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.navy,
            side: const BorderSide(color: AppColors.navy, width: 1.5),
            padding:
                const EdgeInsets.symmetric(vertical: 14, horizontal: 24),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
            textStyle: GoogleFonts.poppins(
              fontSize: 15,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide:
                const BorderSide(color: AppColors.brandRed, width: 2),
          ),
          filled: true,
          fillColor: Colors.white,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          labelStyle: GoogleFonts.poppins(
            color: AppColors.textSecondary,
            fontSize: 14,
            fontWeight: FontWeight.w500,
          ),
          hintStyle: GoogleFonts.poppins(
            color: AppColors.textLight,
            fontSize: 14,
          ),
        ),
        cardTheme: CardThemeData(
          elevation: 0,
          shadowColor: Colors.black12,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: const BorderSide(color: Color(0xFFEEF2F6)),
          ),
          color: Colors.white,
        ),
      ),
    );
  }
}
