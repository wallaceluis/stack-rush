package com.wallaceluis.stackrush

import android.app.Activity
import android.content.Context
import android.util.Log
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClient.BillingResponseCode
import com.android.billingclient.api.BillingClient.ProductType
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams

/**
 * Compra única "remove_ads" pelo Google Play Billing.
 * Funciona assim que o produto for criado no Play Console com o ID [SKU_REMOVE_ADS].
 * Antes disso, a compra responde "indisponível" e o jogo mostra "Em breve".
 */
class BillingManager(
    private val activity: Activity,
    private val onResult: (sku: String, ok: Boolean) -> Unit,
) : PurchasesUpdatedListener {

    private val prefs = activity.getSharedPreferences("stackrush", Context.MODE_PRIVATE)
    private val products = mutableMapOf<String, ProductDetails>()
    private var pendingSku: String? = null

    private val client: BillingClient = BillingClient.newBuilder(activity)
        .setListener(this)
        .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
        .build()

    fun isAdFree(): Boolean = prefs.getBoolean(KEY_AD_FREE, false)

    fun start() {
        if (client.isReady) return
        client.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                if (result.responseCode != BillingResponseCode.OK) {
                    Log.w(TAG, "Billing setup: ${result.debugMessage}")
                    return
                }
                queryProducts()
                restorePurchases()
            }

            override fun onBillingServiceDisconnected() = Unit
        })
    }

    private fun queryProducts() {
        val product = QueryProductDetailsParams.Product.newBuilder()
            .setProductId(SKU_REMOVE_ADS)
            .setProductType(ProductType.INAPP)
            .build()
        val params = QueryProductDetailsParams.newBuilder().setProductList(listOf(product)).build()
        client.queryProductDetailsAsync(params) { _, result ->
            result.productDetailsList.forEach { products[it.productId] = it }
        }
    }

    private fun restorePurchases() {
        val params = QueryPurchasesParams.newBuilder().setProductType(ProductType.INAPP).build()
        client.queryPurchasesAsync(params) { result, purchases ->
            if (result.responseCode == BillingResponseCode.OK) purchases.forEach { handlePurchase(it, notify = false) }
        }
    }

    fun purchase(sku: String) {
        val details = products[sku]
        if (!client.isReady || details == null) {
            start()
            onResult(sku, false)
            return
        }
        pendingSku = sku
        val params = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(
                listOf(BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(details).build()),
            )
            .build()
        client.launchBillingFlow(activity, params)
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: MutableList<Purchase>?) {
        val sku = pendingSku ?: SKU_REMOVE_ADS
        pendingSku = null
        when (result.responseCode) {
            BillingResponseCode.OK -> purchases?.forEach { handlePurchase(it, notify = true) }
            BillingResponseCode.ITEM_ALREADY_OWNED -> {
                grant(sku)
                onResult(sku, true)
            }
            else -> onResult(sku, false)
        }
    }

    private fun handlePurchase(purchase: Purchase, notify: Boolean) {
        if (purchase.purchaseState != Purchase.PurchaseState.PURCHASED) return
        purchase.products.forEach { sku ->
            grant(sku)
            if (notify) onResult(sku, true)
        }
        if (!purchase.isAcknowledged) {
            val params = AcknowledgePurchaseParams.newBuilder().setPurchaseToken(purchase.purchaseToken).build()
            client.acknowledgePurchase(params) { r ->
                if (r.responseCode != BillingResponseCode.OK) Log.w(TAG, "Acknowledge: ${r.debugMessage}")
            }
        }
    }

    private fun grant(sku: String) {
        if (sku == SKU_REMOVE_ADS) prefs.edit().putBoolean(KEY_AD_FREE, true).apply()
    }

    fun onDestroy() = client.endConnection()

    companion object {
        const val SKU_REMOVE_ADS = "remove_ads"
        private const val KEY_AD_FREE = "ad_free"
        private const val TAG = "StackRushBilling"
    }
}
