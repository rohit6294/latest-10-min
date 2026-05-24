package com.tenminrescue.ten_min_rescue

import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {

    private val channel = "com.tenminrescue.oem_setup"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channel)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "getOemInfo" -> result.success(
                        mapOf(
                            "manufacturer" to (Build.MANUFACTURER ?: "").lowercase(),
                            "brand" to (Build.BRAND ?: "").lowercase(),
                        )
                    )

                    "isBatteryOptimizationIgnored" -> {
                        val pm = getSystemService(POWER_SERVICE) as PowerManager
                        result.success(pm.isIgnoringBatteryOptimizations(packageName))
                    }

                    "openBatteryOptimization" -> {
                        result.success(openBatteryOptimization())
                    }

                    "openAutostart" -> {
                        result.success(openOemSetting(autostartIntents()))
                    }

                    "openBackgroundActivity" -> {
                        result.success(openOemSetting(backgroundActivityIntents()))
                    }

                    "openAppNotificationSettings" -> {
                        val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                            .putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        result.success(safeStart(intent))
                    }

                    else -> result.notImplemented()
                }
            }
    }

    private fun openBatteryOptimization(): Boolean {
        // Direct prompt to whitelist this app from Doze.
        val request = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
            .setData(Uri.parse("package:$packageName"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (safeStart(request)) return true
        // Fallback: the full battery-optimization list, user finds app manually.
        val list = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return safeStart(list)
    }

    private fun openOemSetting(candidates: List<Intent>): Boolean {
        for (intent in candidates) {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (safeStart(intent)) return true
        }
        // Fallback so the user lands somewhere useful.
        val appDetails = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            .setData(Uri.parse("package:$packageName"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return safeStart(appDetails)
    }

    private fun safeStart(intent: Intent): Boolean = try {
        startActivity(intent)
        true
    } catch (_: Throwable) {
        false
    }

    /**
     * OEM-specific Autostart / App-launch settings activities, in order of
     * preference. Each manufacturer has renamed these between OS versions, so
     * we try several before falling back.
     */
    private fun autostartIntents(): List<Intent> {
        val brand = (Build.MANUFACTURER ?: "").lowercase()
        val list = mutableListOf<Intent>()
        when {
            brand.contains("xiaomi") || brand.contains("redmi") || brand.contains("poco") -> {
                list += componentIntent(
                    "com.miui.securitycenter",
                    "com.miui.permcenter.autostart.AutoStartManagementActivity"
                )
            }
            brand.contains("oppo") -> {
                list += componentIntent(
                    "com.coloros.safecenter",
                    "com.coloros.safecenter.permission.startup.StartupAppListActivity"
                )
                list += componentIntent(
                    "com.coloros.safecenter",
                    "com.coloros.safecenter.startupapp.StartupAppListActivity"
                )
                list += componentIntent(
                    "com.oppo.safe",
                    "com.oppo.safe.permission.startup.StartupAppListActivity"
                )
            }
            brand.contains("realme") -> {
                list += componentIntent(
                    "com.coloros.safecenter",
                    "com.coloros.safecenter.permission.startup.StartupAppListActivity"
                )
                list += componentIntent(
                    "com.oplus.safecenter",
                    "com.oplus.safecenter.permission.startup.StartupAppListActivity"
                )
            }
            brand.contains("vivo") || brand.contains("iqoo") -> {
                list += componentIntent(
                    "com.vivo.permissionmanager",
                    "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"
                )
                list += componentIntent(
                    "com.iqoo.secure",
                    "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager"
                )
                list += componentIntent(
                    "com.iqoo.secure",
                    "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"
                )
            }
            brand.contains("oneplus") -> {
                list += componentIntent(
                    "com.oneplus.security",
                    "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity"
                )
            }
            brand.contains("huawei") || brand.contains("honor") -> {
                list += componentIntent(
                    "com.huawei.systemmanager",
                    "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"
                )
                list += componentIntent(
                    "com.huawei.systemmanager",
                    "com.huawei.systemmanager.optimize.process.ProtectActivity"
                )
            }
            brand.contains("asus") -> {
                list += componentIntent(
                    "com.asus.mobilemanager",
                    "com.asus.mobilemanager.entry.FunctionActivity"
                )
            }
            brand.contains("letv") -> {
                list += componentIntent(
                    "com.letv.android.letvsafe",
                    "com.letv.android.letvsafe.AutobootManageActivity"
                )
            }
        }
        return list
    }

    /**
     * OEM-specific "App background power consumption / Allow background
     * activity" pages. Different concept from Autostart on most OEMs.
     */
    private fun backgroundActivityIntents(): List<Intent> {
        val brand = (Build.MANUFACTURER ?: "").lowercase()
        val list = mutableListOf<Intent>()
        when {
            brand.contains("xiaomi") || brand.contains("redmi") || brand.contains("poco") -> {
                list += componentIntent(
                    "com.miui.powerkeeper",
                    "com.miui.powerkeeper.ui.HiddenAppsConfigActivity"
                )
            }
            brand.contains("vivo") || brand.contains("iqoo") -> {
                list += componentIntent(
                    "com.vivo.permissionmanager",
                    "com.vivo.permissionmanager.activity.PowerSavingManagerActivity"
                )
                list += componentIntent(
                    "com.iqoo.secure",
                    "com.iqoo.secure.ui.phoneoptimize.PowerSavingActivity"
                )
            }
            brand.contains("oppo") || brand.contains("realme") -> {
                list += componentIntent(
                    "com.coloros.oppoguardelf",
                    "com.coloros.powermanager.fuelgaue.PowerUsageModelActivity"
                )
                list += componentIntent(
                    "com.coloros.safecenter",
                    "com.coloros.safecenter.sysfloatwindow.FloatWindowListActivity"
                )
            }
            brand.contains("samsung") -> {
                list += componentIntent(
                    "com.samsung.android.lool",
                    "com.samsung.android.sm.ui.battery.BatteryActivity"
                )
            }
        }
        return list
    }

    private fun componentIntent(pkg: String, cls: String): Intent =
        Intent().setComponent(ComponentName(pkg, cls))
}
