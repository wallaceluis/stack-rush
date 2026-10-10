package com.wallaceluis.stackrush

import android.app.Activity
import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import android.webkit.JavascriptInterface

/**
 * Métodos que o JavaScript do jogo chama como `window.Android.*` (veja assets/game/platform.js).
 * Rodam numa thread do WebView, então tudo que mexe em UI vai para a main thread.
 */
class GameBridge(
    private val activity: Activity,
    private val ads: AdsManager,
    private val billing: BillingManager,
) {
    private val vibrator: Vibrator? by lazy {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (activity.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            activity.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
    }

    @JavascriptInterface
    fun showBanner(visible: Boolean) = activity.runOnUiThread { ads.setBannerVisible(visible) }

    @JavascriptInterface
    fun showInterstitial() = activity.runOnUiThread { ads.showInterstitial() }

    @JavascriptInterface
    fun isRewardedReady(): Boolean = ads.isRewardedReady()

    @JavascriptInterface
    fun showRewarded(placement: String) = activity.runOnUiThread { ads.showRewarded(placement) }

    @JavascriptInterface
    fun isAdFree(): Boolean = billing.isAdFree()

    @JavascriptInterface
    fun purchase(sku: String) = activity.runOnUiThread { billing.purchase(sku) }

    @JavascriptInterface
    fun vibrate(ms: Int) {
        val v = vibrator ?: return
        if (ms <= 0 || !v.hasVibrator()) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            v.vibrate(VibrationEffect.createOneShot(ms.toLong(), VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION")
            v.vibrate(ms.toLong())
        }
    }

    // Ponto de integração para analytics (Firebase etc.). Por enquanto só loga.
    @JavascriptInterface
    fun logEvent(name: String, value: String) {
        Log.d("StackRush", "event $name=$value")
    }
}
