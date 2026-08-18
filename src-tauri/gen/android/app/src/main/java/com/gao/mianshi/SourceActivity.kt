package com.gao.mianshi

import android.content.res.Configuration
import android.os.Bundle
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

class SourceActivity : TauriActivity() {
  override val handleBackNavigation: Boolean = true

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    installSafeSystemInsets()
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    updateSystemBarBackground()
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)

    // Remote documentation stays inside this one WebView. New windows and
    // downloads are deliberately disabled; top-level navigation is also
    // checked by Rust's trusted-source allowlist.
    webView.settings.javaScriptCanOpenWindowsAutomatically = false
    webView.settings.setSupportMultipleWindows(false)
    webView.settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
    webView.settings.allowFileAccess = false
    webView.settings.allowContentAccess = false
    webView.setDownloadListener { _, _, _, _, _ -> }
  }
}
