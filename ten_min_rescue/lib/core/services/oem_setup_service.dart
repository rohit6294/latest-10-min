import 'package:flutter/services.dart';

/// Reliability isn't possible without exempting the app from OEM battery
/// killers (MIUI Autostart, Vivo Background Power, etc.). These settings
/// can't be flipped programmatically — only deep-linked — so this service
/// surfaces them via the [OemBrand] enum and a native MethodChannel that
/// opens each manufacturer's settings activity.
class OemSetupService {
  OemSetupService._();

  static const _channel = MethodChannel('com.tenminrescue.oem_setup');

  static OemBrand? _cachedBrand;

  static Future<OemBrand> detectBrand() async {
    if (_cachedBrand != null) return _cachedBrand!;
    try {
      final raw = await _channel.invokeMapMethod<String, String>('getOemInfo');
      final manufacturer = (raw?['manufacturer'] ?? '').toLowerCase();
      final brand = (raw?['brand'] ?? '').toLowerCase();
      _cachedBrand = OemBrand.fromIds(manufacturer, brand);
    } catch (_) {
      _cachedBrand = OemBrand.other;
    }
    return _cachedBrand!;
  }

  static Future<bool> isBatteryOptimizationIgnored() async {
    try {
      final v = await _channel.invokeMethod<bool>('isBatteryOptimizationIgnored');
      return v ?? false;
    } catch (_) {
      return false;
    }
  }

  static Future<void> openBatteryOptimization() =>
      _invoke('openBatteryOptimization');

  static Future<void> openAutostart() => _invoke('openAutostart');

  static Future<void> openBackgroundActivity() =>
      _invoke('openBackgroundActivity');

  static Future<void> openAppNotificationSettings() =>
      _invoke('openAppNotificationSettings');

  static Future<void> _invoke(String method) async {
    try {
      await _channel.invokeMethod<bool>(method);
    } catch (_) {
      // Best-effort — never crash the app over a settings deep-link.
    }
  }
}

enum OemBrand {
  xiaomi,
  vivo,
  oppo,
  realme,
  oneplus,
  samsung,
  huawei,
  asus,
  other;

  static OemBrand fromIds(String manufacturer, String brand) {
    final m = manufacturer.isNotEmpty ? manufacturer : brand;
    if (m.contains('xiaomi') || m.contains('redmi') || m.contains('poco')) {
      return OemBrand.xiaomi;
    }
    if (m.contains('vivo') || m.contains('iqoo')) return OemBrand.vivo;
    if (m.contains('oppo')) return OemBrand.oppo;
    if (m.contains('realme')) return OemBrand.realme;
    if (m.contains('oneplus')) return OemBrand.oneplus;
    if (m.contains('samsung')) return OemBrand.samsung;
    if (m.contains('huawei') || m.contains('honor')) return OemBrand.huawei;
    if (m.contains('asus')) return OemBrand.asus;
    return OemBrand.other;
  }

  /// True when this OEM has a proprietary Autostart toggle separate from
  /// stock Android's battery optimisation.
  bool get hasAutostart => switch (this) {
    OemBrand.xiaomi ||
    OemBrand.vivo ||
    OemBrand.oppo ||
    OemBrand.realme ||
    OemBrand.oneplus ||
    OemBrand.huawei => true,
    _ => false,
  };

  /// True when this OEM has a separate "Allow background activity / power
  /// consumption" page.
  bool get hasBackgroundActivity => switch (this) {
    OemBrand.xiaomi ||
    OemBrand.vivo ||
    OemBrand.oppo ||
    OemBrand.realme => true,
    _ => false,
  };

  String get label => switch (this) {
    OemBrand.xiaomi => 'Xiaomi / Redmi / POCO',
    OemBrand.vivo => 'Vivo / iQOO',
    OemBrand.oppo => 'Oppo',
    OemBrand.realme => 'Realme',
    OemBrand.oneplus => 'OnePlus',
    OemBrand.samsung => 'Samsung',
    OemBrand.huawei => 'Huawei / Honor',
    OemBrand.asus => 'Asus',
    OemBrand.other => 'your phone',
  };
}
