package com.wallaceluis.stackrush

import android.annotation.SuppressLint
import android.net.Uri
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.view.updatePadding
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var ads: AdsManager
    private lateinit var billing: BillingManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        enterImmersive()

        webView = findViewById(R.id.webview)
        val bannerContainer = findViewById<FrameLayout>(R.id.banner_container)

        billing = BillingManager(this) { sku, ok -> callJs("__onPurchaseResult", sku, ok) }
        ads = AdsManager(this, bannerContainer, isAdFree = { billing.isAdFree() }) { placement, granted ->
            callJs("__onRewardResult", placement, granted)
        }

        setupWebView()
        ads.start()
        billing.start()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript("(window.onBackPressed && window.onBackPressed()) === true") { handled ->
                    if (handled != "true") finish()
                }
            }
        })
    }

    private fun enterImmersive() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
        // Mantém o jogo fora do recorte da câmera (notch).
        val root = findViewById<FrameLayout>(R.id.root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout())
            view.updatePadding(top = cutout.top, bottom = cutout.bottom)
            insets
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        // Serve os arquivos de assets/ por https para o localStorage funcionar normalmente.
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
        }
        webView.isVerticalScrollBarEnabled = false
        webView.isHorizontalScrollBarEnabled = false
        webView.overScrollMode = WebView.OVER_SCROLL_NEVER

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                assetLoader.shouldInterceptRequest(request.url)

            // O jogo nunca navega para fora dos próprios arquivos.
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                request.url.host != Uri.parse(GAME_URL).host
        }
        webView.addJavascriptInterface(GameBridge(this, ads, billing), "Android")
        webView.loadUrl(GAME_URL)
    }

    private fun callJs(function: String, arg: String, flag: Boolean) {
        runOnUiThread {
            webView.evaluateJavascript("window.$function && window.$function(${JSONObject.quote(arg)}, $flag)", null)
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            WindowInsetsControllerCompat(window, window.decorView).hide(WindowInsetsCompat.Type.systemBars())
        }
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        ads.onResume()
    }

    override fun onPause() {
        ads.onPause()
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        ads.onDestroy()
        billing.onDestroy()
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val GAME_URL = "https://appassets.androidplatform.net/assets/game/index.html"
    }
}
