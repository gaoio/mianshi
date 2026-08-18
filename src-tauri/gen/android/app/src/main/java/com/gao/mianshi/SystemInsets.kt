package com.gao.mianshi

import android.app.Activity
import android.content.res.Configuration
import android.graphics.Color
import android.view.View
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

internal fun Activity.installSafeSystemInsets() {
  updateSystemBarBackground()
  val content = findViewById<View>(android.R.id.content)
  ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
    val safeInsets = insets.getInsets(
      WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
    )
    view.setPadding(safeInsets.left, safeInsets.top, safeInsets.right, safeInsets.bottom)
    insets
  }
  ViewCompat.requestApplyInsets(content)
}

internal fun Activity.updateSystemBarBackground() {
  val nightMode = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
  val color = if (nightMode == Configuration.UI_MODE_NIGHT_YES) "#030912" else "#e7efeb"
  window.decorView.setBackgroundColor(Color.parseColor(color))
}
