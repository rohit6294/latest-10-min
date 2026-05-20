import 'package:flutter/material.dart';

/// Suraksha Kavach brand colors
class AppColors {
  AppColors._();

  // ─── Brand colors ────────────────────────────────────────────────────
  static const Color brandRed = Color(0xFFE60012);   // Primary red
  static const Color brandRedDark = Color(0xFFB8000E);
  static const Color navy = Color(0xFF0B1320);       // Deep navy
  static const Color navyLight = Color(0xFF1A2332);
  static const Color navyExtraLight = Color(0xFF2A3344);
  static const Color brandGray = Color(0xFF6B7280);
  static const Color white = Colors.white;

  // Aliases for backward compatibility
  static const Color emergency = brandRed;
  static const Color emergencyDark = brandRedDark;

  // ─── Accent + Status ─────────────────────────────────────────────────
  static const Color whatsapp = Color(0xFF25D366);
  static const Color accentBlue = Color(0xFF2563EB);
  static const Color lightBg = Color(0xFFF8FAFC);

  static const Color onlineGreen = Color(0xFF22C55E);
  static const Color offlineGrey = Color(0xFF94A3B8);
  static const Color warningAmber = Color(0xFFF59E0B);

  // Countdown timer states
  static const Color timerNormal = Color(0xFF2563EB);
  static const Color timerWarning = Color(0xFFF59E0B);
  static const Color timerCritical = brandRed;

  // ─── Text ────────────────────────────────────────────────────────────
  static const Color textPrimary = navy;
  static const Color textSecondary = Color(0xFF64748B);
  static const Color textLight = Color(0xFF94A3B8);

  // ─── Urgency level colors ────────────────────────────────────────────
  static const Color urgencyCritical = brandRed;
  static const Color urgencyCriticalDark = brandRedDark;
  static const Color urgencySerious = Color(0xFFF59E0B);
  static const Color urgencySeriousDark = Color(0xFFD97706);
  static const Color urgencyStable = Color(0xFF16A34A);
  static const Color urgencyStableDark = Color(0xFF15803D);

  /// Get urgency color from string
  static Color urgencyColor(String urgency) {
    switch (urgency) {
      case 'critical':
        return urgencyCritical;
      case 'serious':
        return urgencySerious;
      case 'stable':
      default:
        return urgencyStable;
    }
  }

  /// Get gradient by urgency for popups
  static List<Color> urgencyGradient(String urgency) {
    switch (urgency) {
      case 'critical':
        return const [urgencyCritical, urgencyCriticalDark];
      case 'serious':
        return const [urgencySerious, urgencySeriousDark];
      case 'stable':
      default:
        return const [urgencyStable, urgencyStableDark];
    }
  }
}
