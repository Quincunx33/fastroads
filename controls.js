/* mobile-touch-controls.js
 * fastroads mobile controls
 *
 * The game's input state (`input.key[code]`) lives inside a webpack
 * module closure and is not exposed globally, so instead of writing to
 * it directly we dispatch real KeyboardEvent instances on the game
 * canvas. The game's own keydown/keyup listener picks them up exactly
 * like physical keyboard events, so every game mode (normal cars,
 * lambo, supercar, autodrive, boost) reacts identically.
 *
 * Shown whenever the device has touch input (phones/tablets).
 * A mouse/keyboard does not disable them — on hybrid devices (e.g. iPad
 * with a mouse attached) the touch controls are still visible. To hide
 * the overlay, set window.__frNoTouchControls = true before this script
 * loads or remove it from index.html.
 */
(function () {
  "use strict";

  // Force-hide override (set window.__frNoTouchControls = true to disable)
  if (window.__frNoTouchControls) return;

  var isTouchDevice =
    ("ontouchstart" in window) || navigator.maxTouchPoints > 0;

  if (!isTouchDevice) {
    // fallback: only coarse-pointer touchless devices (very rare desktops
    // with touchscreens disabled); desktops with mouse+touch already
    // handled above via ontouchstart/maxTouchPoints
    if (!window.matchMedia("(pointer: coarse)").matches) return;
  }

  /* ---------- synthetic key events ---------- */

  function targetCanvas() {
    try {
      return document.querySelector("canvas");
    } catch (e) {
      return null;
    }
  }

  function keyDown(code) {
    var el = targetCanvas();
    if (!el) return;
    el.dispatchEvent(
      new KeyboardEvent("keydown", {
        code: code,
        key: code,
        bubbles: true,
        cancelable: true,
        composed: true,
      })
    );
  }

  function keyUp(code) {
    var el = targetCanvas();
    if (!el) return;
    el.dispatchEvent(
      new KeyboardEvent("keyup", {
        code: code,
        key: code,
        bubbles: true,
        cancelable: true,
        composed: true,
      })
    );
  }

  var DEFAULT_MAP = { left: "KeyA", right: "KeyD", gas: "KeyW", brake: "KeyS", boost: "ShiftLeft", handbrake: "Space", recover: "KeyR" };
  var MAP = {};
  try { MAP = Object.assign({}, DEFAULT_MAP, JSON.parse(localStorage.getItem("fr-control-map") || "{}")); } catch (_) { MAP = Object.assign({}, DEFAULT_MAP); }
  function saveMap() { try { localStorage.setItem("fr-control-map", JSON.stringify(MAP)); } catch (_) {} }
  var layoutMode = false;
  var LAYOUT_KEY = "fr-control-layout";
  var LAYOUT_IDS = ["fr-steer-left", "fr-steer-right", "fr-brake", "fr-gas", "fr-boost", "fr-handbrake", "fr-recover"];
  var LAYOUT = {};
  try { LAYOUT = JSON.parse(localStorage.getItem(LAYOUT_KEY) || "{}"); } catch (_) { LAYOUT = {}; }
  function saveLayout() { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(LAYOUT)); } catch (_) {} }

  /* ---------- overlay DOM ---------- */

  function onReady(cb) {
    if (document.readyState !== "loading") return cb();
    document.addEventListener("DOMContentLoaded", cb);
  }

  onReady(function () {
    if (!document.body) return; // safety
    try {
    (function buildOverlay() {
    var overlay = document.createElement("div");
    overlay.id = "fr-mobile-controls";
    overlay.innerHTML =
      '<div class="fr-steer-buttons" aria-label="Steering">' +
      '  <button class="fr-steer fr-steer-left" id="fr-steer-left" type="button" aria-label="Steer left">◀</button>' +
      '  <button class="fr-steer fr-steer-right" id="fr-steer-right" type="button" aria-label="Steer right">▶</button>' +
      "</div>" +
      '<div class="fr-pedals">' +
      '  <div class="fr-pedal fr-pedal-brake" id="fr-brake">' +
      '    <svg viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>' +
      "  </div>" +
      '  <div class="fr-pedal fr-pedal-gas" id="fr-gas">' +
      '    <svg viewBox="0 0 24 24"><path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>' +
      "  </div>" +
      "</div>" +
      '<button class="fr-settings" id="fr-settings" type="button" aria-label="Control settings">⚙</button>' +
      '<div class="fr-side-btns">' +
      '  <div class="fr-sidebtn fr-boost" id="fr-boost" title="Boost">BOOST</div>' +
      '  <div class="fr-sidebtn fr-hb" id="fr-handbrake" title="Handbrake">HB</div>' +
      '  <button class="fr-sidebtn fr-recover" id="fr-recover" type="button" title="Recover">RECOVER</button>' +
      "</div>" +
      '<div class="fr-settings-panel" id="fr-settings-panel" hidden>' +
      '<div class="fr-settings-title">CONTROL SETTINGS</div>' +
      '<div class="fr-setting-row"><span>Left</span><select data-action="left"><option value="KeyA">A</option><option value="ArrowLeft">←</option></select></div>' +
      '<div class="fr-setting-row"><span>Right</span><select data-action="right"><option value="KeyD">D</option><option value="ArrowRight">→</option></select></div>' +
      '<div class="fr-setting-row"><span>Gas</span><select data-action="gas"><option value="KeyW">W</option><option value="ArrowUp">↑</option></select></div>' +
      '<div class="fr-setting-row"><span>Brake</span><select data-action="brake"><option value="KeyS">S</option><option value="ArrowDown">↓</option></select></div>' +
      '<div class="fr-setting-row"><span>Boost</span><select data-action="boost"><option value="ShiftLeft">SHIFT</option><option value="Space">SPACE</option></select></div>' +
      '<div class="fr-setting-row"><span>HB</span><select data-action="handbrake"><option value="Space">SPACE</option><option value="ShiftLeft">SHIFT</option></select></div>' +
      '<div class="fr-setting-row"><span>Recover</span><select data-action="recover"><option value="KeyR">R</option><option value="Enter">ENTER</option></select></div>' +
      '<div class="fr-layout-tools"><button id="fr-layout-edit" type="button">EDIT LAYOUT</button><button id="fr-layout-reset" type="button">RESET</button></div>' +
      '<div class="fr-layout-options" hidden><label>Button <select id="fr-layout-target"><option value="fr-steer-left">Left</option><option value="fr-steer-right">Right</option><option value="fr-brake">Brake</option><option value="fr-gas">Gas</option><option value="fr-boost">Boost</option><option value="fr-handbrake">HB</option><option value="fr-recover">Recover</option></select></label><label>Size <input id="fr-layout-size" type="range" min="0.65" max="1.7" step="0.05" value="1"></label><label><input id="fr-layout-visible" type="checkbox" checked> Visible</label></div>' +
      '<button id="fr-settings-close" type="button">DONE</button></div>';

    var style = document.createElement("style");
    style.textContent = [
      "html,body{width:100%;height:100%;height:100dvh;min-height:100%;overflow:hidden;}",
      "button,#fr-mobile-controls,#fr-mobile-controls *{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-user-drag:none;}",
      "#fr-mobile-controls{height:100dvh;min-height:100%;overscroll-behavior:none;padding-bottom:env(safe-area-inset-bottom);box-sizing:border-box;}",
      "#fr-mobile-controls{",
      "  position:fixed;inset:0;z-index:9999;",
      "  display:block;pointer-events:none;touch-action:none;",
      "  -webkit-user-select:none;user-select:none;",
      "}",
      "#fr-mobile-controls.fr-hidden{display:none}",
      "#fr-mobile-controls > *{pointer-events:auto;}",
      ".fr-zone{position:absolute;}",
      ".fr-steer-buttons{position:absolute;left:max(12px,env(safe-area-inset-left));bottom:max(12px,env(safe-area-inset-bottom),4vh);display:flex;gap:clamp(6px,2vw,12px);touch-action:none;}",
      ".fr-steer{width:clamp(58px,12vw,92px);height:clamp(58px,12vw,92px);border-radius:clamp(12px,2vw,18px);background:rgba(255,255,255,.16);",
      "  border:2px solid rgba(255,255,255,.42);color:#fff;font:700 34px/1 system-ui,sans-serif;",
      "  text-align:center;touch-action:none;-webkit-tap-highlight-color:transparent;}",
      ".fr-steer:active,.fr-steer.fr-active{filter:brightness(1.7);background:rgba(255,255,255,.32);}",
      ".fr-pedals{position:absolute;right:max(12px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom),4vh);",
      "  display:flex;flex-direction:column;gap:clamp(6px,2vw,12px);touch-action:none;}",
      ".fr-pedal{width:clamp(58px,12vw,92px);height:clamp(58px,12vw,92px);border-radius:clamp(12px,2vw,18px);",
      "  background:rgba(255,255,255,.15);border:2px solid rgba(255,255,255,.35);",
      "  display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.9);}",
      ".fr-pedal-gas{background:rgba(80,200,120,.28);}",
      ".fr-pedal-brake{background:rgba(230,90,90,.28);}",
      ".fr-side-btns{position:absolute;right:calc(max(12px,env(safe-area-inset-right)) + clamp(70px,14vw,112px));bottom:max(12px,env(safe-area-inset-bottom),4vh);",
      "  display:flex;flex-direction:column;gap:clamp(6px,2vw,12px);}",
      ".fr-sidebtn{width:clamp(46px,9vw,68px);height:clamp(46px,9vw,68px);border-radius:50%;",
      "  background:rgba(255,255,255,.15);border:2px solid rgba(255,255,255,.35);",
      "  color:rgba(255,255,255,.9);font:700 clamp(10px,2vw,13px)/1 system-ui,sans-serif;",
      "  text-align:center;display:flex;align-items:center;justify-content:center;}",
      ".fr-boost{background:rgba(110,140,255,.3);}.fr-recover{background:rgba(255,120,90,.3);font-size:clamp(9px,1.8vw,12px);}",
      ".fr-hb{background:rgba(255,190,60,.3);}",
      ".fr-pedal.fr-active,.fr-sidebtn.fr-active{filter:brightness(1.6);}",
      ".fr-hide{display:none !important;}.fr-settings{position:absolute;top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));pointer-events:auto;width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.45);background:rgba(0,0,0,.35);color:#fff;font-size:22px;}.fr-settings-panel{position:absolute;top:max(62px,calc(env(safe-area-inset-top) + 54px));right:max(12px,env(safe-area-inset-right));width:min(270px,78vw);padding:14px;border-radius:14px;background:rgba(15,18,24,.94);color:#fff;pointer-events:auto;font:13px system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.45);}.fr-settings-panel[hidden]{display:none;}.fr-settings-title{font-weight:700;letter-spacing:1px;margin-bottom:8px}.fr-setting-row{display:flex;justify-content:space-between;align-items:center;gap:18px;margin:7px 0}.fr-setting-row select{min-width:92px;padding:5px;border-radius:6px}.fr-settings-panel button{margin-top:8px;width:100%;padding:7px;border-radius:7px;border:0;}.fr-layout-tools{display:flex;gap:6px}.fr-layout-tools button{font-size:10px}.fr-layout-options{margin-top:8px}.fr-layout-options label{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:7px 0}.fr-layout-options input[type=range]{width:120px}.fr-layout-mode .fr-layout-target{outline:2px dashed #ffe45b;outline-offset:3px;touch-action:none;cursor:move;}",
      "@media (max-height:700px){",
      "  .fr-steer-buttons,.fr-pedals,.fr-side-btns{bottom:max(12px,env(safe-area-inset-bottom),5vh);}",
      "  .fr-steer{width:68px;height:68px;font-size:28px;}",
      "  .fr-pedal{width:68px;height:68px;}",
      "  .fr-sidebtn{width:52px;height:52px;font-size:11px;}",
      "}",
    ].join("\n");
    document.head.appendChild(style);
    document.body.appendChild(overlay);

    /* Keep the overlay alive if the game re-renders the page (React root rebuild) */
    function ensureOverlay() {
      if (overlay.parentNode !== document.body) document.body.appendChild(overlay);
    }
    ensureOverlay();
    setInterval(ensureOverlay, 2000);
    if (window.MutationObserver) {
      new MutationObserver(ensureOverlay).observe(document.body, { childList: true });
    }
    })();
    } catch (err) {
      console.error("[fr-mobile-controls] failed to build overlay:", err);
      return;
    }

    /* ---------- steering buttons ---------- */
    function bindSteerButton(id, code) {
      var el = document.getElementById(id);
      if (!el) return;
      var held = false;
      function start(e) {
        if (layoutMode) return;
        if (e) e.preventDefault();
        if (held) return;
        held = true;
        keyDown(code);
        el.classList.add("fr-active");
      }
      function stop(e) {
        if (e) e.preventDefault();
        if (!held) return;
        held = false;
        keyUp(code);
        el.classList.remove("fr-active");
      }
      el.addEventListener("contextmenu", function (e) { e.preventDefault(); });
      el.addEventListener("selectstart", function (e) { e.preventDefault(); });
      if (window.PointerEvent) {
        el.addEventListener("pointerdown", function (e) {
          try { el.setPointerCapture(e.pointerId); } catch (_) {}
          start(e);
        }, { passive: false });
        el.addEventListener("pointerup", stop, { passive: false });
        el.addEventListener("pointercancel", stop, { passive: false });
        el.addEventListener("lostpointercapture", stop, { passive: false });
      } else {
        el.addEventListener("touchstart", start, { passive: false });
        el.addEventListener("touchend", stop, { passive: false });
        el.addEventListener("touchcancel", stop, { passive: false });
        el.addEventListener("mousedown", start, { passive: false });
        el.addEventListener("mouseup", stop, { passive: false });
      }
    }
    bindSteerButton("fr-steer-left", MAP.left);
    bindSteerButton("fr-steer-right", MAP.right);

    /* ---------- pedals & side buttons ---------- */

    function bindButton(id, code, activeClass) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("contextmenu", function (e) { e.preventDefault(); });
      el.addEventListener("selectstart", function (e) { e.preventDefault(); });
      var held = false;
      function start(e) {
        if (layoutMode) return;
        if (e) e.preventDefault();
        if (held) return;
        held = true;
        keyDown(code);
        el.classList.add(activeClass);
      }
      function stop(e) {
        if (e) e.preventDefault();
        if (!held) return;
        held = false;
        keyUp(code);
        el.classList.remove(activeClass);
      }
      if (window.PointerEvent) {
        el.addEventListener("pointerdown", function (e) {
          try { el.setPointerCapture(e.pointerId); } catch (_) {}
          start(e);
        }, { passive: false });
        el.addEventListener("pointerup", stop, { passive: false });
        el.addEventListener("pointercancel", stop, { passive: false });
        el.addEventListener("lostpointercapture", stop, { passive: false });
      } else {
        el.addEventListener("touchstart", start, { passive: false });
        el.addEventListener("touchend", stop, { passive: false });
        el.addEventListener("touchcancel", stop, { passive: false });
        el.addEventListener("mousedown", start, { passive: false });
        el.addEventListener("mouseup", stop, { passive: false });
        el.addEventListener("mouseleave", stop, { passive: false });
      }
    }

    bindButton("fr-gas", MAP.gas, "fr-active");
    bindButton("fr-brake", MAP.brake, "fr-active");
    bindButton("fr-boost", MAP.boost, "fr-active");
    bindButton("fr-handbrake", MAP.handbrake, "fr-active");

    var recover = document.getElementById("fr-recover");
    if (recover) {
      var recoverHandled = false;
      function doRecover(e) {
        if (layoutMode) return;
        if (e) e.preventDefault();
        if (e && e.type === "click" && recoverHandled) { recoverHandled = false; return; }
        if (e && e.type === "pointerdown") recoverHandled = true;
        try {
          if (window.__CARCTRL && window.__ROAD && window.__ROAD.vehicleNode) {
            window.__CARCTRL.resetToNode(window.__ROAD.vehicleNode);
          } else {
            keyDown(MAP.recover);
            setTimeout(function () { keyUp(MAP.recover); }, 80);
          }
        } catch (_) {
          keyDown(MAP.recover);
          setTimeout(function () { keyUp(MAP.recover); }, 80);
        }
      }
      recover.addEventListener("contextmenu", function (e) { e.preventDefault(); });
      recover.addEventListener("selectstart", function (e) { e.preventDefault(); });
      recover.addEventListener("pointerdown", doRecover, { passive: false });
      recover.addEventListener("click", doRecover, { passive: false });
    }

    function applyLayout() {
      LAYOUT_IDS.forEach(function (id) {
        var el = document.getElementById(id); if (!el) return;
        var item = LAYOUT[id];
        el.classList.toggle("fr-layout-target", layoutMode);
        if (!item) { el.style.position = ""; el.style.left = el.style.top = el.style.right = el.style.bottom = el.style.transform = el.style.transformOrigin = ""; el.classList.remove("fr-hide"); return; }
        el.style.position = "fixed"; el.style.left = (item.x * 100) + "vw"; el.style.top = (item.y * 100) + "vh"; el.style.right = "auto"; el.style.bottom = "auto"; el.style.transform = "scale(" + (item.scale || 1) + ")"; el.style.transformOrigin = "center center"; el.classList.toggle("fr-hide", item.visible === false);
      });
      var root = document.getElementById("fr-mobile-controls"); if (root) root.classList.toggle("fr-layout-mode", layoutMode);
    }
    function layoutInputSync() {
      var target = document.getElementById("fr-layout-target"), size = document.getElementById("fr-layout-size"), visible = document.getElementById("fr-layout-visible");
      if (!target || !size || !visible) return; var item = LAYOUT[target.value] || {}; size.value = item.scale || 1; visible.checked = item.visible !== false;
    }
    function bindLayoutDrag(el) {
      if (!el || el.__frLayoutBound) return; el.__frLayoutBound = true;
      el.addEventListener("pointerdown", function (e) {
        if (!layoutMode) return; e.preventDefault(); e.stopPropagation();
        var rect = el.getBoundingClientRect(), ox = e.clientX - rect.left, oy = e.clientY - rect.top;
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
        function move(ev) { var item = LAYOUT[el.id] || {scale:1,visible:true}; item.x = Math.max(0, Math.min(1, (ev.clientX - ox) / innerWidth)); item.y = Math.max(0, Math.min(1, (ev.clientY - oy) / innerHeight)); LAYOUT[el.id] = item; applyLayout(); }
        function up() { el.removeEventListener("pointermove", move); saveLayout(); }
        el.addEventListener("pointermove", move, {passive:false}); el.addEventListener("pointerup", up, {once:true});
      }, {passive:false});
    }
    LAYOUT_IDS.forEach(function (id) { bindLayoutDrag(document.getElementById(id)); });
    applyLayout();
    var settingsBtn = document.getElementById("fr-settings");
    var settingsPanel = document.getElementById("fr-settings-panel");
    if (settingsBtn && settingsPanel) {
      settingsPanel.querySelectorAll("select[data-action]").forEach(function (select) {
        var action = select.getAttribute("data-action");
        if (MAP[action]) select.value = MAP[action];
        select.addEventListener("change", function () {
          MAP[action] = select.value;
          saveMap();
        });
      });
      settingsBtn.addEventListener("click", function (e) {
        e.preventDefault();
        settingsPanel.hidden = !settingsPanel.hidden;
      });
      var layoutEdit = document.getElementById("fr-layout-edit"), layoutReset = document.getElementById("fr-layout-reset"), layoutOptions = document.querySelector(".fr-layout-options"), layoutTarget = document.getElementById("fr-layout-target"), layoutSize = document.getElementById("fr-layout-size"), layoutVisible = document.getElementById("fr-layout-visible");
      if (layoutEdit) layoutEdit.addEventListener("click", function (e) { e.preventDefault(); layoutMode = !layoutMode; layoutEdit.textContent = layoutMode ? "DONE LAYOUT" : "EDIT LAYOUT"; if (layoutOptions) layoutOptions.hidden = !layoutMode; applyLayout(); layoutInputSync(); });
      if (layoutReset) layoutReset.addEventListener("click", function (e) { e.preventDefault(); LAYOUT = {}; saveLayout(); applyLayout(); layoutInputSync(); });
      if (layoutTarget) layoutTarget.addEventListener("change", layoutInputSync);
      if (layoutSize) layoutSize.addEventListener("input", function () { if (!layoutTarget) return; var item = LAYOUT[layoutTarget.value] || {x:.1,y:.1,visible:true}; item.scale = Number(layoutSize.value); LAYOUT[layoutTarget.value] = item; saveLayout(); applyLayout(); });
      if (layoutVisible) layoutVisible.addEventListener("change", function () { if (!layoutTarget) return; var item = LAYOUT[layoutTarget.value] || {x:.1,y:.1,scale:1}; item.visible = layoutVisible.checked; LAYOUT[layoutTarget.value] = item; saveLayout(); applyLayout(); });
      var closeSettings = document.getElementById("fr-settings-close");
      if (closeSettings) closeSettings.addEventListener("click", function (e) {
        e.preventDefault();
        settingsPanel.hidden = true;
      });
    }

    /* ---------- camera: pinch zoom ---------- */

    var pinchTouch = null;
    var pinchStart = 0;

    document.addEventListener(
      "touchstart",
      function (e) {
        if (e.target.closest("#fr-mobile-controls")) return;
        if (e.touches.length === 2 && pinchTouch === null) {
          pinchTouch = "two";
          var dx = e.touches[0].clientX - e.touches[1].clientX;
          var dy = e.touches[0].clientY - e.touches[1].clientY;
          pinchStart = Math.hypot(dx, dy);
        }
      },
      { passive: true }
    );

    document.addEventListener(
      "touchmove",
      function (e) {
        if (pinchTouch === "two" && e.touches.length === 2) {
          var dx = e.touches[0].clientX - e.touches[1].clientX;
          var dy = e.touches[0].clientY - e.touches[1].clientY;
          var dist = Math.hypot(dx, dy);
          var delta = pinchStart - dist;
          pinchStart = dist;
          if (Math.abs(delta) > 6) {
            var wheel = new WheelEvent("wheel", {
              deltaY: delta > 0 ? 120 : -120,
              bubbles: true,
              cancelable: true,
            });
            var el = targetCanvas();
            if (el) el.dispatchEvent(wheel);
          }
        }
      },
      { passive: true }
    );

    function endAllTouch(e) {
      if (e.touches.length < 2) pinchTouch = null;
    }
    document.addEventListener("touchend", endAllTouch, { passive: true });
    document.addEventListener("touchcancel", endAllTouch, { passive: true });
  });
})();
