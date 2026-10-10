package com.wallaceluis.stackrush

import android.app.Activity
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.widget.FrameLayout
import com.google.android.gms.ads.AdError
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.AdSize
import com.google.android.gms.ads.AdView
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback
import com.google.android.ump.ConsentInformation
import com.google.android.ump.ConsentRequestParameters
import com.google.android.ump.UserMessagingPlatform
import java.util.concurrent.atomic.AtomicBoolean

/**
 * AdMob: consentimento (UMP/GDPR), banner adaptativo, intersticial e premiado.
 * Os IDs vêm do BuildConfig (gradle.properties); sem IDs reais, usa os de teste do Google.
 */
class AdsManager(
    private val activity: Activity,
    private val bannerContainer: FrameLayout,
    private val isAdFree: () -> Boolean,
    private val onRewardResult: (placement: String, granted: Boolean) -> Unit,
) {
    private val handler = Handler(Looper.getMainLooper())
    private val initialized = AtomicBoolean(false)
    private lateinit var consentInfo: ConsentInformation

    private var banner: AdView? = null
    private var bannerWanted = false

    private var interstitial: InterstitialAd? = null
    private var interstitialLoading = false

    @Volatile private var rewarded: RewardedAd? = null
    private var rewardedLoading = false

    fun start() {
        consentInfo = UserMessagingPlatform.getConsentInformation(activity)
        val params = ConsentRequestParameters.Builder().build()
        consentInfo.requestConsentInfoUpdate(
            activity,
            params,
            {
                UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity) { error ->
                    if (error != null) Log.w(TAG, "Consent form: ${error.message}")
                    if (consentInfo.canRequestAds()) initAds()
                }
            },
            { error ->
                Log.w(TAG, "Consent update: ${error.message}")
                if (consentInfo.canRequestAds()) initAds()
            },
        )
        // Consentimento de sessões anteriores já permite iniciar em paralelo.
        if (consentInfo.canRequestAds()) initAds()
    }

    private fun initAds() {
        if (!initialized.compareAndSet(false, true)) return
        MobileAds.initialize(activity) {
            loadInterstitial()
            loadRewarded()
            if (bannerWanted) setBannerVisible(true)
        }
    }

    // ---------- Banner ----------

    fun setBannerVisible(visible: Boolean) {
        bannerWanted = visible && !isAdFree()
        if (!initialized.get()) return
        if (bannerWanted) {
            ensureBanner()
            bannerContainer.visibility = View.VISIBLE
        } else {
            bannerContainer.visibility = View.GONE
        }
    }

    private fun ensureBanner() {
        if (banner != null) return
        val metrics = activity.resources.displayMetrics
        val widthDp = (metrics.widthPixels / metrics.density).toInt()
        banner = AdView(activity).apply {
            adUnitId = BuildConfig.ADMOB_BANNER_ID
            setAdSize(AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(activity, widthDp))
            bannerContainer.addView(this)
            loadAd(AdRequest.Builder().build())
        }
    }

    // ---------- Intersticial ----------

    private fun loadInterstitial() {
        if (interstitial != null || interstitialLoading || isAdFree()) return
        interstitialLoading = true
        InterstitialAd.load(
            activity,
            BuildConfig.ADMOB_INTERSTITIAL_ID,
            AdRequest.Builder().build(),
            object : InterstitialAdLoadCallback() {
                override fun onAdLoaded(ad: InterstitialAd) {
                    interstitialLoading = false
                    interstitial = ad
                }

                override fun onAdFailedToLoad(error: LoadAdError) {
                    interstitialLoading = false
                    Log.w(TAG, "Interstitial failed: ${error.message}")
                    handler.postDelayed({ loadInterstitial() }, RETRY_MS)
                }
            },
        )
    }

    fun showInterstitial() {
        if (isAdFree()) return
        val ad = interstitial ?: run { loadInterstitial(); return }
        interstitial = null
        ad.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdDismissedFullScreenContent() = loadInterstitial()
            override fun onAdFailedToShowFullScreenContent(error: AdError) = loadInterstitial()
        }
        ad.show(activity)
    }

    // ---------- Premiado ----------

    fun isRewardedReady(): Boolean = rewarded != null

    private fun loadRewarded() {
        if (rewarded != null || rewardedLoading) return
        rewardedLoading = true
        RewardedAd.load(
            activity,
            BuildConfig.ADMOB_REWARDED_ID,
            AdRequest.Builder().build(),
            object : RewardedAdLoadCallback() {
                override fun onAdLoaded(ad: RewardedAd) {
                    rewardedLoading = false
                    rewarded = ad
                }

                override fun onAdFailedToLoad(error: LoadAdError) {
                    rewardedLoading = false
                    Log.w(TAG, "Rewarded failed: ${error.message}")
                    handler.postDelayed({ loadRewarded() }, RETRY_MS)
                }
            },
        )
    }

    fun showRewarded(placement: String) {
        val ad = rewarded ?: run {
            onRewardResult(placement, false)
            loadRewarded()
            return
        }
        rewarded = null
        var earned = false
        ad.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdDismissedFullScreenContent() {
                onRewardResult(placement, earned)
                loadRewarded()
            }

            override fun onAdFailedToShowFullScreenContent(error: AdError) {
                onRewardResult(placement, false)
                loadRewarded()
            }
        }
        ad.show(activity) { earned = true }
    }

    // ---------- Ciclo de vida ----------

    fun onResume() = banner?.resume()

    fun onPause() = banner?.pause()

    fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        banner?.destroy()
    }

    companion object {
        private const val TAG = "StackRushAds"
        private const val RETRY_MS = 30_000L
    }
}
