import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// IDs de teste oficiais do Google AdMob (seguros para desenvolvimento).
val testIds = mapOf(
    "ADMOB_APP_ID" to "ca-app-pub-3940256099942544~3347511713",
    "ADMOB_BANNER_ID" to "ca-app-pub-3940256099942544/9214589741",
    "ADMOB_INTERSTITIAL_ID" to "ca-app-pub-3940256099942544/1033173712",
    "ADMOB_REWARDED_ID" to "ca-app-pub-3940256099942544/5224354917",
)

fun prop(name: String): String =
    (findProperty(name) as String?)?.takeIf { it.isNotBlank() }
        ?: System.getenv(name)?.takeIf { it.isNotBlank() }
        ?: testIds[name]
        ?: error("Propriedade $name não definida")

fun propOr(name: String, default: String): String =
    (findProperty(name) as String?)?.takeIf { it.isNotBlank() } ?: default

android {
    namespace = "com.wallaceluis.stackrush"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.wallaceluis.stackrush"
        minSdk = 24
        targetSdk = 36
        versionCode = propOr("VERSION_CODE", "1").toInt()
        versionName = propOr("VERSION_NAME", "1.0.0")

        manifestPlaceholders["admobAppId"] = prop("ADMOB_APP_ID")
        buildConfigField("String", "ADMOB_BANNER_ID", "\"${prop("ADMOB_BANNER_ID")}\"")
        buildConfigField("String", "ADMOB_INTERSTITIAL_ID", "\"${prop("ADMOB_INTERSTITIAL_ID")}\"")
        buildConfigField("String", "ADMOB_REWARDED_ID", "\"${prop("ADMOB_REWARDED_ID")}\"")
    }

    // Assinatura de release: só é usada se as variáveis de ambiente existirem
    // (no GitHub Actions vêm dos secrets; veja o README).
    val keystorePath = System.getenv("SIGNING_KEYSTORE_PATH")
    if (!keystorePath.isNullOrBlank()) {
        signingConfigs {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = System.getenv("SIGNING_STORE_PASSWORD")
                keyAlias = System.getenv("SIGNING_KEY_ALIAS")
                keyPassword = System.getenv("SIGNING_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("com.google.android.gms:play-services-ads:24.4.0")
    implementation("com.google.android.ump:user-messaging-platform:3.2.0")
    implementation("com.android.billingclient:billing-ktx:8.0.0")
}
