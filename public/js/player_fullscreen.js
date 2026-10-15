// Android WebView does not reliably implement the browser Fullscreen API.
// Keep DPlayer's controls/layout via web fullscreen and let Kotlin manage the window.
(function () {
    window.bindPlayerFullscreen = function (player) {
        const android = /Android/i.test(navigator.userAgent) && !!window.__TAURI__;
        const fullScreen = player.fullScreen;
        const originalRequest = fullScreen.request.bind(fullScreen);
        const originalCancel = fullScreen.cancel.bind(fullScreen);
        const originalIsFullScreen = fullScreen.isFullScreen.bind(fullScreen);
        let pending = Promise.resolve();
        let disposed = false;
        const nativeFullscreen = (enabled) => {
            if (!android) return;
            // Preserve enter/exit order even when a user taps twice quickly.
            pending = pending.then(() => window.__TAURI__.core.invoke(
                'plugin:player-fullscreen|set_fullscreen', { enabled }
            )).catch(error => console.warn('Android fullscreen:', error));
        };
        if (android) {
            const mode = type => !type || type === 'browser' ? 'web' : type;
            fullScreen.request = type => originalRequest(mode(type));
            fullScreen.cancel = type => originalCancel(mode(type));
            fullScreen.isFullScreen = type => originalIsFullScreen(mode(type));
        }
        const enter = () => {
            if (disposed) return;
            document.body.classList.add('dplayer-custom-fullscreen-mode');
            nativeFullscreen(true);
        };
        const exit = () => {
            document.body.classList.remove('dplayer-custom-fullscreen-mode');
            nativeFullscreen(false);
        };
        const systemExit = () => {
            if (fullScreen.isFullScreen('web')) fullScreen.cancel('web');
        };
        const cleanup = () => {
            if (disposed) return;
            disposed = true;
            exit();
            window.removeEventListener('libretv:fullscreen-exit', systemExit);
            window.removeEventListener('pagehide', cleanup);
        };
        player.on('webfullscreen', enter);
        player.on('webfullscreen_cancel', exit);
        player.on('fullscreen', enter);
        player.on('fullscreen_cancel', exit);
        player.on('destroy', cleanup);
        window.addEventListener('libretv:fullscreen-exit', systemExit);
        window.addEventListener('pagehide', cleanup);
    };
})();
