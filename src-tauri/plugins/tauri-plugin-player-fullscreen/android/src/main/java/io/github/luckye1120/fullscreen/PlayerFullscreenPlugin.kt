package io.github.luckye1120.fullscreen

import android.app.Activity
import android.content.pm.ActivityInfo
import android.os.Build
import android.view.WindowManager
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@InvokeArg
class FullscreenArgs { var enabled: Boolean = false }

@TauriPlugin
class PlayerFullscreenPlugin(private val activity: Activity) : Plugin(activity) {
    private var webView: WebView? = null
    private var fullscreen = false
    private var previousOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
    private var previousCutout = 0
    private var keptScreenOn = false
    private val back = object : OnBackPressedCallback(false) {
        override fun handleOnBackPressed() {
            applyFullscreen(false)
            webView?.evaluateJavascript(
                "window.dispatchEvent(new Event('libretv:fullscreen-exit'))", null
            )
        }
    }

    override fun load(webView: WebView) {
        this.webView = webView
        val host = activity as AppCompatActivity
        host.onBackPressedDispatcher.addCallback(host, back)
    }

    @Command
    fun setFullscreen(invoke: Invoke) {
        val args = invoke.parseArgs(FullscreenArgs::class.java)
        activity.runOnUiThread {
            try {
                applyFullscreen(args.enabled)
                invoke.resolve()
            } catch (error: Exception) {
                invoke.reject(error.message ?: "Cannot change fullscreen")
            }
        }
    }

    private fun applyFullscreen(enabled: Boolean) {
        if (fullscreen == enabled) return
        val window = activity.window
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        if (enabled) {
            previousOrientation = activity.requestedOrientation
            keptScreenOn = window.attributes.flags and WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON != 0
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                previousCutout = window.attributes.layoutInDisplayCutoutMode
                window.attributes = window.attributes.apply {
                    layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
                }
            }
            activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            WindowCompat.setDecorFitsSystemWindows(window, false)
            controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            controller.hide(WindowInsetsCompat.Type.systemBars())
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            activity.requestedOrientation = previousOrientation
            WindowCompat.setDecorFitsSystemWindows(window, true)
            controller.show(WindowInsetsCompat.Type.systemBars())
            if (!keptScreenOn) window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                window.attributes = window.attributes.apply { layoutInDisplayCutoutMode = previousCutout }
            }
        }
        fullscreen = enabled
        back.isEnabled = enabled
    }
}
