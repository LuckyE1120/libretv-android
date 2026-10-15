const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

function setup({ android = true, nativeFailure = false } = {}) {
    const handlers = {}, listeners = {}, calls = [], classes = new Set();
    let active = false, destroyed = false;
    const window = { navigator: { userAgent: android ? 'Android WebView' : 'Desktop' },
        __TAURI__: { core: { invoke: async (command, payload) => {
            calls.push([command, payload.enabled]);
            if (nativeFailure) throw new Error('native rejected');
        } } },
        addEventListener: (event, fn) => { listeners[event] = fn; },
        removeEventListener: (event) => { delete listeners[event]; }
    };
    const document = { body: { classList: { add: x => classes.add(x), remove: x => classes.delete(x) } } };
    const player = { on: (event, fn) => { (handlers[event] ||= []).push(fn); },
        fullScreen: {
            request(type = 'browser') { if (type === 'browser') throw new Error('WebView fullscreen unsupported'); active = true; emit('webfullscreen'); },
            cancel(type = 'browser') { if (type === 'browser') throw new Error('WebView fullscreen unsupported'); active = false; emit('webfullscreen_cancel'); },
            isFullScreen: () => active,
            toggle(type = 'browser') { this.isFullScreen(type) ? this.cancel(type) : this.request(type); }
        }
    };
    function emit(event) { for (const fn of handlers[event] || []) fn(); }
    const context = vm.createContext({ window, document, navigator: window.navigator, console });
    vm.runInContext(readFileSync('public/js/player_fullscreen.js', 'utf8'), context);
    context.window.bindPlayerFullscreen(player);
    return { player, calls, classes, listeners, emit, active: () => active };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
test('Android default fullscreen button enters web layout and native landscape, then exits', async () => {
    const s = setup();
    s.player.fullScreen.toggle(); await flush();
    assert.equal(s.active(), true);
    assert.equal(s.classes.has('dplayer-custom-fullscreen-mode'), true);
    assert.deepEqual(s.calls, [['plugin:player-fullscreen|set_fullscreen', true]]);
    s.player.fullScreen.toggle(); await flush();
    assert.equal(s.active(), false);
    assert.equal(s.classes.has('dplayer-custom-fullscreen-mode'), false);
    assert.equal(s.calls.at(-1)[1], false);
});
test('Android system back event exits layout and native fullscreen', async () => {
    const s = setup(); s.player.fullScreen.request(); await flush();
    s.listeners['libretv:fullscreen-exit'](); await flush();
    assert.equal(s.active(), false);
    assert.equal(s.calls.at(-1)[1], false);
});
test('Native bridge failure keeps usable page fullscreen and exit control', async () => {
    const s = setup({ nativeFailure: true });
    s.player.fullScreen.toggle(); await flush();
    assert.equal(s.active(), true);
    s.player.fullScreen.toggle(); await flush();
    assert.equal(s.active(), false);
});
test('Destroy exits native fullscreen and removes page listeners', async () => {
    const s = setup(); s.player.fullScreen.request(); await flush();
    s.emit('destroy'); await flush();
    assert.equal(s.calls.at(-1)[1], false);
    assert.deepEqual(Object.keys(s.listeners), []);
});
test('Desktop browser fullscreen is not remapped', () => {
    const s = setup({ android: false });
    assert.throws(() => s.player.fullScreen.request(), /WebView fullscreen unsupported/);
    assert.equal(s.calls.length, 0);
});
