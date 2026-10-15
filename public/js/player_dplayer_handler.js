// DPlayer Handler Logic

// Assumes dp, currentHls, adFilteringEnabled, autoplayEnabled, currentVideoUrl, 
// currentVideoTitle, currentEpisodeIndex, currentEpisodes,
// isUserSeeking, videoHasEnded, userClickedPosition are global (from player_vars.js)
// Assumes showError, showPositionRestoreHint, setupProgressBarPreciseClicks, saveToHistory, 
// startProgressSaveInterval, setupLongPressSpeedControl, playNextEpisode are global or imported.

function initPlayer(videoUrl, sourceCode) {
    if (!videoUrl) return;

    let dplayerErrorTimeout = null;
    let hlsPlaybackStarted = false; 
    let errorDisplayedGlobal = false;

    hlsPlaybackStarted = false; errorDisplayedGlobal = false;
    document.getElementById('error').style.display = 'none';
    const loadingDivInit = document.getElementById('loading');
    if(loadingDivInit) {
        loadingDivInit.style.display = 'flex';
        // Ensure only spinner is shown initially
        loadingDivInit.innerHTML = `<div class="loading-spinner"></div>`; 
    }

    const hlsConfig = {
        debug: false,
        loader: adFilteringEnabled ? CustomHlsJsLoader : Hls.DefaultConfig.loader,
        enableWorker: true, lowLatencyMode: false, backBufferLength: 90,
        maxBufferLength: 30, maxMaxBufferLength: 60, maxBufferSize: 30 * 1000 * 1000,
        maxBufferHole: 0.5, fragLoadingMaxRetry: 6, fragLoadingMaxRetryTimeout: 64000,
        fragLoadingRetryDelay: 1000, manifestLoadingMaxRetry: 3, manifestLoadingRetryDelay: 1000,
        levelLoadingMaxRetry: 4, levelLoadingRetryDelay: 1000, startLevel: -1,
        abrEwmaDefaultEstimate: 500000, abrBandWidthFactor: 0.95, abrBandWidthUpFactor: 0.7,
        abrMaxWithRealBitrate: true, stretchShortVideoTrack: true, appendErrorMaxRetry: 5,
        liveSyncDurationCount: 3, liveDurationInfinity: false
    };
    
    dp = new DPlayer({
        container: document.getElementById('player'),
        autoplay: true, theme: '#00ccff', preload: 'auto', loop: false, lang: 'zh-cn', 
        hotkey: true, mutex: true, volume: 0.7, screenshot: true, 
        preventClickToggle: false, airplay: true, chromecast: true,
        contextmenu: [
            { text: '关于 LibreTV', link: 'https://github.com/LibreSpark/LibreTV' },
            { text: '问题反馈', click: () => window.open('https://github.com/LibreSpark/LibreTV/issues', '_blank') }
        ],
        video: {
            url: videoUrl,
            type: 'hls',
            pic: 'image/nomedia.png',
            customType: {
                hls: function(videoElement, playerInstance) { // Corrected parameters for DPlayer customType
                    if (currentHls && currentHls.destroy) { 
                        try { currentHls.destroy(); } catch (e) { console.warn('销毁旧HLS实例出错:', e); }
                    }
                    const hls = new Hls(hlsConfig); 
                    currentHls = hls;
                    let errorCount = 0;
                    let bufferAppendErrorCount = 0;
                    
                    videoElement.addEventListener('playing', function() {
                        hlsPlaybackStarted = true; 
                        errorDisplayedGlobal = false;
                        document.getElementById('loading').style.display = 'none';
                        document.getElementById('error').style.display = 'none';
                        if (dplayerErrorTimeout) { clearTimeout(dplayerErrorTimeout); dplayerErrorTimeout = null; }
                    });
                    videoElement.addEventListener('timeupdate', function() { 
                        if (videoElement.currentTime > 1) {
                            document.getElementById('error').style.display = 'none';
                        } 
                    });

                    hls.loadSource(videoElement.src); // Use videoElement.src
                    hls.attachMedia(videoElement);
                    
                    const sourceElementForAirplay = document.createElement('source'); 
                    sourceElementForAirplay.src = videoUrl; 
                    videoElement.appendChild(sourceElementForAirplay); 
                    videoElement.disableRemotePlayback = false;
                    
                    hls.on(Hls.Events.MANIFEST_PARSED, function() { 
                        if (autoplayEnabled) {
                           videoElement.play().catch(e => console.warn('自动播放被阻止:', e));
                        }
                    });
                    
                    hls.on(Hls.Events.ERROR, function(event, data) { 
                        console.log('HLS事件:', event, '数据:', data);
                        errorCount++;
                        if (data.details === 'bufferAppendError') {
                            bufferAppendErrorCount++;
                            console.warn(`bufferAppendError 发生 ${bufferAppendErrorCount} 次`);
                            if (hlsPlaybackStarted) {
                                console.log('视频已在播放中，忽略bufferAppendError');
                                return;
                            }
                            if (bufferAppendErrorCount >= 3) {
                                hls.recoverMediaError();
                            }
                        }
                        if (data.fatal && !hlsPlaybackStarted) {
                            console.error('致命HLS错误:', data);
                            switch(data.type) {
                                case Hls.ErrorTypes.NETWORK_ERROR:
                                    console.log("尝试恢复网络错误");
                                    hls.startLoad(); 
                                    break;
                                case Hls.ErrorTypes.MEDIA_ERROR:
                                    console.log("尝试恢复媒体错误");
                                    hls.recoverMediaError(); 
                                    break;
                                default:
                                    if (errorCount > 3 && !errorDisplayedGlobal) {
                                        showError('视频加载失败，可能是格式不兼容或源不可用 (HLS error)');
                                    }
                                    break;
                            }
                        }
                    });
                    hls.on(Hls.Events.FRAG_LOADED, () => { document.getElementById('loading').style.display = 'none'; });
                    hls.on(Hls.Events.LEVEL_LOADED, () => { document.getElementById('loading').style.display = 'none'; });
                }
            } // Explicitly no comma after customType if it's the last property of video
        } // Explicitly no comma after video if it's the last property of DPlayer options
    });

    dp.on('fullscreen', async () => { /* ... Tauri fullscreen logic ... */ });
    dp.on('fullscreen_cancel', async () => { /* ... Tauri fullscreen_cancel logic ... */ });
    
    dp.on('loadedmetadata', function() {
        hlsPlaybackStarted = true; errorDisplayedGlobal = false;
        if (dplayerErrorTimeout) { clearTimeout(dplayerErrorTimeout); dplayerErrorTimeout = null; }
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error').style.display = 'none';
        videoHasEnded = false;

        const urlParams = new URLSearchParams(window.location.search);
        const savedPosition = parseInt(urlParams.get('position') || '0');
        if (savedPosition > 10 && dp && dp.video && dp.video.duration > 0 && savedPosition < dp.video.duration - 2) {
            dp.seek(savedPosition); 
            if(typeof showPositionRestoreHint === 'function') showPositionRestoreHint(savedPosition);
        } else {
            try {
                const progressKey = 'videoProgress_' + currentVideoUrl;
                const progressStr = localStorage.getItem(progressKey);
                if (progressStr && dp && dp.video && dp.video.duration > 0) {
                    const progress = JSON.parse(progressStr);
                    if (progress && typeof progress.position === 'number' && progress.position > 10 && progress.position < dp.video.duration - 2) {
                        dp.seek(progress.position); 
                        if(typeof showPositionRestoreHint === 'function') showPositionRestoreHint(progress.position);
                    }
                }
            } catch (e) { /* ignore */ }
        }
        
        // Enhanced autoplay logic
        if (autoplayEnabled && dp && dp.video && dp.video.paused) {
            console.log('[PlayerJS] loadedmetadata: Attempting dp.play() due to autoplayEnabled.');
            dp.play().catch(e => {
                console.warn("Autoplay attempt on loadedmetadata failed. This might be due to browser policy requiring user interaction.", e);
                // Optionally, you could show a "Click to play" button if autoplay is blocked.
            });
        }

        if(typeof setupProgressBarPreciseClicks === 'function') setupProgressBarPreciseClicks();
        setTimeout(saveToHistory, 3000);
        startProgressSaveInterval();
    });

    dp.on('error', function() { /* ... DPlayer error handling ... */ });
    setupLongPressSpeedControl();
    dp.on('seeking', function() { /* ... seeking logic ... */ });
    dp.on('seeked', function() { /* ... seeked logic ... */ });
    dp.on('ended', function() { /* ... ended logic ... */ });
    dp.on('timeupdate', function() { if (dp.video && dp.duration > 0 && isUserSeeking && dp.video.currentTime > dp.video.duration * 0.95) videoHasEnded = false; });
    dp.on('playing', () => { if(dp.video) dp.video.addEventListener('dblclick', () => dp.fullScreen.toggle()); });

    // Function to add custom video view mode settings
    function addCustomVideoViewSettings(playerInstance) {
        if (!playerInstance || !playerInstance.template || !playerInstance.template.settingBox) {
            console.warn('DPlayer instance or template not ready for custom settings.');
            return;
        }

        const originPanel = playerInstance.template.settingBox.querySelector('.dplayer-setting-origin-panel');
        if (!originPanel) {
            console.warn('DPlayer setting origin panel not found.');
            return;
        }

        const videoElement = playerInstance.video;
        let currentVideoMode = localStorage.getItem('dplayer-video-mode') || 'contain';
        let currentVideoOffsetY = localStorage.getItem('dplayer-video-offset-y') || '0%';
        let isInOffsetSubmenu = false; // State to track if offset submenu is active

        const applyVideoStyles = () => {
            videoElement.style.objectFit = currentVideoMode;
            videoElement.style.objectPosition = (currentVideoMode === 'cover') ? `50% calc(50% + ${currentVideoOffsetY})` : '50% 50%';
            videoElement.style.width = '100%';
            videoElement.style.height = '100%';
        };

        const videoModeSettingItems = [];
        const videoOffsetYSettingItems = [];
        let backButtonFromOffsetMenu;

        const createSettingItem = (label, actionOrMode, type, value = null) => {
            const item = document.createElement('div');
            item.classList.add('dplayer-setting-item');
            
            const labelSpan = document.createElement('span');
            labelSpan.classList.add('dplayer-label');
            labelSpan.textContent = label;
            item.appendChild(labelSpan);

            const toggleDiv = document.createElement('div');
            toggleDiv.classList.add('dplayer-toggle');
            item.appendChild(toggleDiv);

            switch (type) {
                case 'mode':
                    item.classList.add(`dplayer-setting-video-mode-${actionOrMode}`);
                    item.addEventListener('click', () => {
                        currentVideoMode = actionOrMode;
                        localStorage.setItem('dplayer-video-mode', currentVideoMode);
                        if (currentVideoMode !== 'cover') {
                            currentVideoOffsetY = '0%'; // Reset offset if not cover
                            localStorage.setItem('dplayer-video-offset-y', currentVideoOffsetY);
                        }
                        applyVideoStyles();
                        updateActiveStates();
                        if (playerInstance.setting && typeof playerInstance.setting.hide === 'function') {
                            playerInstance.setting.hide();
                        }
                    });
                    break;
                case 'mode-with-submenu': // For "画面裁剪"
                    item.classList.add(`dplayer-setting-video-mode-${actionOrMode}`);
                    item.addEventListener('click', () => {
                        currentVideoMode = actionOrMode; // Set mode to cover
                        localStorage.setItem('dplayer-video-mode', currentVideoMode);
                        applyVideoStyles(); // Apply style immediately
                        isInOffsetSubmenu = true;
                        updateActiveStates(); // This will now show submenu items
                    });
                    break;
                case 'offset':
                    item.classList.add('dplayer-setting-video-offset-y');
                    item.dataset.offsetValue = value;
                    item.addEventListener('click', () => {
                        currentVideoOffsetY = value;
                        localStorage.setItem('dplayer-video-offset-y', currentVideoOffsetY);
                        applyVideoStyles();
                        updateActiveStates();
                        // No hiding of panel, allow multiple offset selections
                    });
                    break;
                case 'back':
                    item.classList.add('dplayer-setting-back-button');
                    item.addEventListener('click', () => {
                        isInOffsetSubmenu = false;
                        updateActiveStates();
                    });
                    // No toggle for back button, but keep div for layout consistency
                    toggleDiv.style.display = 'none'; 
                    // Add an arrow or "Back" text to labelSpan for clarity if needed
                    labelSpan.innerHTML = `← ${label}`;
                    break;
            }
            return item;
        };
        
        // Create main mode items
        const mainModeOptions = [
            { label: playerInstance.tran('默认模式') || '默认模式', mode: 'contain', type: 'mode' },
            { label: playerInstance.tran('画面裁剪') || '画面裁剪', mode: 'cover', type: 'mode-with-submenu' },
            { label: playerInstance.tran('画面拉伸') || '画面拉伸', mode: 'fill', type: 'mode' }
        ];

        mainModeOptions.forEach(opt => {
            const newItem = createSettingItem(opt.label, opt.mode, opt.type);
            originPanel.appendChild(newItem);
            videoModeSettingItems.push(newItem);
        });

        // Create Back button for offset submenu (initially hidden)
        backButtonFromOffsetMenu = createSettingItem(playerInstance.tran('返回') || '返回', null, 'back');
        backButtonFromOffsetMenu.style.display = 'none';
        originPanel.appendChild(backButtonFromOffsetMenu);

        // Create Vertical Offset Label (initially hidden, part of submenu)
        const offsetYLabel = createSettingItem(playerInstance.tran('垂直偏移') || '垂直偏移', null, 'offset-label');
        offsetYLabel.style.display = 'none';
        // For label, we don't want click events or toggle
        offsetYLabel.classList.add('dplayer-setting-offset-label'); // For specific styling
        offsetYLabel.querySelector('.dplayer-toggle').style.display = 'none';
        offsetYLabel.replaceWith(offsetYLabel.cloneNode(true)); // Break event listener
        originPanel.appendChild(offsetYLabel);
        videoOffsetYSettingItems.push(offsetYLabel);


        const offsets = [
            { label: '+50%', value: '50%' }, { label: '+40%', value: '40%' },
            { label: '+30%', value: '30%' }, { label: '+20%', value: '20%' },
            { label: '+10%', value: '10%' }, { label: '0%', value: '0%' },
            { label: '-10%', value: '-10%' }, { label: '-20%', value: '-20%' },
            { label: '-30%', value: '-30%' }, { label: '-40%', value: '-40%' },
            { label: '-50%', value: '-50%' }
        ];

        offsets.forEach(offset => {
            const newItem = createSettingItem(offset.label, null, 'offset', offset.value);
            newItem.style.display = 'none'; // Initially hidden, part of submenu
            originPanel.appendChild(newItem);
            videoOffsetYSettingItems.push(newItem);
        });
        
        function updateActiveStates() {
            if (isInOffsetSubmenu) {
                // In offset submenu: hide main modes, show back button and offset items
                videoModeSettingItems.forEach(item => item.style.display = 'none');
                backButtonFromOffsetMenu.style.display = 'flex';
                videoOffsetYSettingItems.forEach(item => {
                    item.style.display = item.classList.contains('dplayer-setting-offset-label') ? 'block' : 'flex';
                    if (item.classList.contains('dplayer-setting-video-offset-y')) {
                        const itemOffsetValue = item.dataset.offsetValue;
                        const toggleDiv = item.querySelector('.dplayer-toggle');
                        if (itemOffsetValue === currentVideoOffsetY) {
                            item.classList.add('dplayer-setting-item-active');
                            if (toggleDiv) { toggleDiv.innerHTML = '✓'; toggleDiv.style.color = playerInstance.options.theme || '#fff'; }
                        } else {
                            item.classList.remove('dplayer-setting-item-active');
                            if (toggleDiv) toggleDiv.innerHTML = '';
                        }
                    }
                });
            } else {
                // In main settings menu: show main modes, hide back button and offset items
                videoModeSettingItems.forEach(item => {
                    item.style.display = 'flex';
                    const itemMode = item.classList.contains('dplayer-setting-video-mode-contain') ? 'contain' :
                                     item.classList.contains('dplayer-setting-video-mode-cover') ? 'cover' : 
                                     item.classList.contains('dplayer-setting-video-mode-fill') ? 'fill' : null;
                    const toggleDiv = item.querySelector('.dplayer-toggle');
                    if (itemMode === currentVideoMode) {
                        item.classList.add('dplayer-setting-item-active');
                        if (toggleDiv) { toggleDiv.innerHTML = '✓'; toggleDiv.style.color = playerInstance.options.theme || '#fff'; }
                    } else {
                        item.classList.remove('dplayer-setting-item-active');
                        if (toggleDiv) toggleDiv.innerHTML = '';
                    }
                    // Add arrow for submenu indication on "画面裁剪"
                    if (itemMode === 'cover' && toggleDiv) {
                        toggleDiv.innerHTML = item.classList.contains('dplayer-setting-item-active') ? '✓ >' : '>';
                    }
                });
                backButtonFromOffsetMenu.style.display = 'none';
                videoOffsetYSettingItems.forEach(item => item.style.display = 'none');
            }
        }
        
        applyVideoStyles(); 
        updateActiveStates();

        const translations = {
            'zh-cn': { '默认模式': '默认模式', '画面裁剪': '画面裁剪', '画面拉伸': '画面拉伸', '垂直偏移': '垂直偏移', '返回': '返回' },
            'zh-tw': { '默认模式': '默認模式', '画面裁剪': '畫面裁剪', '画面拉伸': '畫面拉伸', '垂直偏移': '垂直偏移', '返回': '返回' }
        };
        const lang = playerInstance.options.lang;
        if (translations[lang]) {
            for (const key in translations[lang]) {
                if (!c[lang][key]) { 
                    c[lang][key] = translations[lang][key];
                }
            }
        }
    }

    dp.on('loadedmetadata', function() { 
        setTimeout(() => {
            addCustomVideoViewSettings(dp);
        }, 100); 
    });

    setTimeout(function() {
        if (dp && dp.video && dp.video.currentTime > 0) return;
        const loadingDiv = document.getElementById('loading');
        if (loadingDiv && loadingDiv.style.display !== 'none') {
            loadingDiv.innerHTML = `
                <div class="loading-spinner"></div>
                <div style="font-size: 12px; color: #aaa; margin-top: 10px;">如长时间无响应，请尝试其他视频源</div>
            `; // Ensured "视频加载时间较长..." is removed
        }
    }, 10000);
    // Tauri fullscreen binding - this was a self-invoking function, ensure it's correctly placed or called if needed.
    // For now, assuming its internal logic is self-contained and correct as per original file.
    // If it was (function(){ ... })(); then it's fine.
    // If it was just a function definition, it needs to be called: initTauriFullscreen();
    // Based on previous full file, it was a self-invoking function.
    (function(){ 
        const fsContainer = document.getElementById('playerContainer');
        if (!dp || !fsContainer) return; // Guard against dp or container not being ready
        dp.on('fullscreen', async () => { 
            try {
                let success = false;
                if (window.__TAURI__ && window.__TAURI__.window) {
                    if (window.__TAURI__.window.appWindow) { 
                        await window.__TAURI__.window.appWindow.setFullscreen(true);
                        success = true;
                    } else if (window.__TAURI__.window.getCurrent) { 
                        const { getCurrent } = window.__TAURI__.window;
                        await getCurrent().setFullscreen(true);
                        success = true;
                    }
                }
                // For web/PWA, try to fullscreen the entire document element for better immersive experience
                const elementToFullscreen = document.documentElement;
                if (!success && elementToFullscreen && typeof elementToFullscreen.requestFullscreen === 'function') {
                    // 尝试请求带有隐藏导航栏选项的全屏
                    elementToFullscreen.requestFullscreen({ navigationUI: "hide" }).catch(err => {
                        console.warn('Document fullscreen with navigationUI: "hide" failed, trying without:', err);
                        // 如果带选项的请求失败 (例如浏览器不支持此选项)，则回退到不带选项的请求
                        elementToFullscreen.requestFullscreen().catch(e => console.warn('Fallback document fullscreen failed:', e));
                    });
                } else if (!success && fsContainer.requestFullscreen) { // Fallback to fsContainer if documentElement somehow fails
                    fsContainer.requestFullscreen({ navigationUI: "hide" }).catch(err => {
                        console.warn('Element fullscreen with navigationUI: "hide" failed, trying without:', err);
                        fsContainer.requestFullscreen().catch(e => console.warn('Fallback element fullscreen failed:', e));
                    });
                }
                document.body.classList.add('dplayer-custom-fullscreen-mode');
                const playerHeaderOnEnter = document.querySelector('.player-header');
                if (playerHeaderOnEnter) {
                    playerHeaderOnEnter.style.display = 'none';
                }
            } catch (err) {
                console.error('Error setting Tauri window to fullscreen or web fullscreen:', err);
                const elementToFullscreenCatch = document.documentElement;
                // 确保在顶层 catch 中也有回退
                if (elementToFullscreenCatch && typeof elementToFullscreenCatch.requestFullscreen === 'function') {
                     elementToFullscreenCatch.requestFullscreen({ navigationUI: "hide" }).catch(err_fallback => {
                        console.warn('Fallback document fullscreen with navigationUI: "hide" in catch failed, trying without:', err_fallback);
                        elementToFullscreenCatch.requestFullscreen().catch(e => console.warn('Fallback document fullscreen in catch failed:', e));
                    });
                } else if (fsContainer.requestFullscreen) { // Fallback to fsContainer if documentElement somehow fails in catch
                    fsContainer.requestFullscreen({ navigationUI: "hide" }).catch(err_fallback => {
                        console.warn('Fallback element fullscreen with navigationUI: "hide" in catch failed, trying without:', err_fallback);
                        fsContainer.requestFullscreen().catch(e => console.warn('Fallback element fullscreen in catch failed:', e));
                    });
                }
            }
        });
        dp.on('fullscreen_cancel', async () => { 
            try {
                let success = false;
                if (window.__TAURI__ && window.__TAURI__.window) {
                    if (window.__TAURI__.window.appWindow) {
                        await window.__TAURI__.window.appWindow.setFullscreen(false);
                        success = true;
                    } else if (window.__TAURI__.window.getCurrent) {
                        const { getCurrent } = window.__TAURI__.window;
                        await getCurrent().setFullscreen(false);
                        success = true;
                    }
                }
                if (!success && document.exitFullscreen) {
                   document.exitFullscreen().catch(err => console.warn('Document exit fullscreen failed:', err));
                }
                document.body.classList.remove('dplayer-custom-fullscreen-mode');
                const playerHeaderOnExit = document.querySelector('.player-header');
                if (playerHeaderOnExit) {
                    playerHeaderOnExit.style.display = ''; // 恢复默认或CSS类控制的显示
                }
            } catch (err) {
                console.error('Error exiting Tauri window fullscreen:', err);
                if (document.exitFullscreen) {
                    document.exitFullscreen().catch(e => console.warn('Fallback document exit fullscreen failed:', e));
                }
            }
        });
    })();
}

class CustomHlsJsLoader extends Hls.DefaultConfig.loader {
    constructor(config) {
        super(config);
        const load = this.load.bind(this);
        this.load = function(context, config, callbacks) {
            if (context.type === 'manifest' || context.type === 'level') {
                const onSuccess = callbacks.onSuccess;
                callbacks.onSuccess = function(response, stats, context) {
                    if (response.data && typeof response.data === 'string') {
                        response.data = filterAdsFromM3U8(response.data, true);
                    }
                    return onSuccess(response, stats, context);
                };
            }
            load(context, config, callbacks);
        };
    }
}

function filterAdsFromM3U8(m3u8Content, strictMode = false) {
    if (!m3u8Content) return '';
    const lines = m3u8Content.split('\n');
    const filteredLines = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.includes('#EXT-X-DISCONTINUITY')) {
            filteredLines.push(line);
        }
    }
    return filteredLines.join('\n');
}
