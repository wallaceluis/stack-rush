# Mantém os métodos chamados pelo JavaScript do jogo.
-keepattributes JavascriptInterface
-keepclassmembers class com.wallaceluis.stackrush.GameBridge {
    @android.webkit.JavascriptInterface <methods>;
}
