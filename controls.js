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
      '<div class="fr-side-btns">' +
      '  <div class="fr-sidebtn fr-boost" id="fr-boost" title="Boost">BOOST</div>' +
      '  <div class="fr-sidebtn fr-hb" id="fr-handbrake" title="Handbrake">HB</div>' +
      "</div>";

    var style = document.createElement("style");
    style.textContent = [
      "#fr-mobile-controls{",
      "  position:fixed;inset:0;z-index:9999;",
      "  display:block;pointer-events:none;touch-action:none;",
      "  -webkit-user-select:none;user-select:none;",
      "}",
      "#fr-mobile-controls.fr-hidden{display:none}",
      "#fr-mobile-controls > *{pointer-events:auto;}",
      ".fr-zone{position:absolute;}",
      ".fr-steer-buttons{position:absolute;left:18px;bottom:24px;display:flex;gap:12px;touch-action:none;}",
      ".fr-steer{width:82px;height:82px;border-radius:18px;background:rgba(255,255,255,.16);",
      "  border:2px solid rgba(255,255,255,.42);color:#fff;font:700 34px/1 system-ui,sans-serif;",
      "  text-align:center;touch-action:none;-webkit-tap-highlight-color:transparent;}",
      ".fr-steer:active,.fr-steer.fr-active{filter:brightness(1.7);background:rgba(255,255,255,.32);}",
      ".fr-pedals{position:absolute;right:18px;bottom:24px;",
      "  display:flex;flex-direction:column;gap:12px;touch-action:none;}",
      ".fr-pedal{width:84px;height:84px;border-radius:18px;",
      "  background:rgba(255,255,255,.15);border:2px solid rgba(255,255,255,.35);",
      "  display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.9);}",
      ".fr-pedal-gas{background:rgba(80,200,120,.28);}",
      ".fr-pedal-brake{background:rgba(230,90,90,.28);}",
      ".fr-side-btns{position:absolute;right:120px;bottom:24px;",
      "  display:flex;flex-direction:column;gap:12px;}",
      ".fr-sidebtn{width:64px;height:64px;border-radius:50%;",
      "  background:rgba(255,255,255,.15);border:2px solid rgba(255,255,255,.35);",
      "  color:rgba(255,255,255,.9);font:700 13px/64px system-ui,sans-serif;",
      "  text-align:center;}",
      ".fr-boost{background:rgba(110,140,255,.3);}",
      ".fr-hb{background:rgba(255,190,60,.3);}",
      ".fr-pedal.fr-active,.fr-sidebtn.fr-active{filter:brightness(1.6);}",
      ".fr-hide{display:none !important;}",
      "@media (max-height:520px){",
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
      el.addEventListener("pointerdown", start, { passive: false });
      el.addEventListener("pointerup", stop, { passive: false });
      el.addEventListener("pointercancel", stop, { passive: false });
      el.addEventListener("pointerleave", stop, { passive: false });
      el.addEventListener("touchstart", start, { passive: false });
      el.addEventListener("touchend", stop, { passive: false });
      el.addEventListener("touchcancel", stop, { passive: false });
      el.addEventListener("mousedown", start, { passive: false });
      el.addEventListener("mouseup", stop, { passive: false });
      el.addEventListener("mouseleave", stop, { passive: false });
    }
    bindSteerButton("fr-steer-left", "KeyA");
    bindSteerButton("fr-steer-right", "KeyD");

    /* ---------- pedals & side buttons ---------- */

    function bindButton(id, code, activeClass) {
      var el = document.getElementById(id);
      if (!el) return;
      var touches = 0;
      el.addEventListener(
        "touchstart",
        function (e) {
          e.preventDefault();
          touches++;
          if (touches === 1) {
            keyDown(code);
            el.classList.add(activeClass);
          }
        },
        { passive: false }
      );
      el.addEventListener("touchend", function () {
        touches--;
        if (touches <= 0) {
          touches = 0;
          keyUp(code);
          el.classList.remove(activeClass);
        }
      });
      el.addEventListener("touchcancel", function () {
        touches = 0;
        keyUp(code);
        el.classList.remove(activeClass);
      });
    }

    bindButton("fr-gas", "KeyW", "fr-active");
    bindButton("fr-brake", "KeyS", "fr-active");
    bindButton("fr-boost", "ShiftLeft", "fr-active");
    bindButton("fr-handbrake", "Space", "fr-active");

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
