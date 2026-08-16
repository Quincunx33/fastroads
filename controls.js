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
 * Shown only on touch-capable devices. Desktop keeps the original UI.
 */
(function () {
  "use strict";

  var isTouchDevice =
    ("ontouchstart" in window) ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia("(pointer: coarse)").matches;

  if (!isTouchDevice) return;

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
    var overlay = document.createElement("div");
    overlay.id = "fr-mobile-controls";
    overlay.innerHTML =
      '<div class="fr-zone fr-joystick" id="fr-joystick">' +
      '  <div class="fr-joystick-thumb" id="fr-joystick-thumb"></div>' +
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
      "  display:none;pointer-events:none;touch-action:none;",
      "  -webkit-user-select:none;user-select:none;",
      "}",
      "@media (pointer:coarse){ #fr-mobile-controls{display:block} }",
      "#fr-mobile-controls > *{pointer-events:auto;}",
      ".fr-zone{position:absolute;}",
      "#fr-joystick{left:18px;bottom:24px;width:150px;height:150px;",
      "  border-radius:50%;background:rgba(255,255,255,.12);",
      "  border:2px solid rgba(255,255,255,.35);",
      "  display:flex;align-items:center;justify-content:center;touch-action:none;}",
      ".fr-joystick-thumb{width:64px;height:64px;border-radius:50%;",
      "  background:rgba(255,255,255,.45);transition:transform .05s linear;}",
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
      "  #fr-joystick{width:120px;height:120px;bottom:14px;}",
      "  .fr-joystick-thumb{width:50px;height:50px;}",
      "  .fr-pedal{width:68px;height:68px;}",
      "  .fr-sidebtn{width:52px;height:52px;font-size:11px;}",
      "}";
    ].join("\n");
    document.head.appendChild(style);
    document.body.appendChild(overlay);

    /* ---------- joystick (steering) ---------- */

    var joy = document.getElementById("fr-joystick");
    var joyThumb = document.getElementById("fr-joystick-thumb");
    var joyTouch = null;
    var steerX = 0;

    function setSteer(x) {
      steerX = Math.max(-1, Math.min(1, x));
      joyThumb.style.transform = "translateX(" + (steerX * 40) + "px)";
      // Left/Right = A/D (game treats held keys as continuous steering)
      keyDown("KeyA");
      keyDown("KeyD");
      if (steerX < -0.25) keyUp("KeyD");
      if (steerX > 0.25) keyUp("KeyA");
      if (steerX >= -0.25 && steerX <= 0.25) {
        keyUp("KeyA");
        keyUp("KeyD");
      }
    }

    joy.addEventListener(
      "touchstart",
      function (e) {
        if (joyTouch !== null) return;
        e.preventDefault();
        joyTouch = e.changedTouches[0].identifier;
        handleJoyMove(e);
      },
      { passive: false }
    );

    function handleJoyMove(e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier !== joyTouch) continue;
        var r = joy.getBoundingClientRect();
        var x = (t.clientX - r.left - r.width / 2) / (r.width / 2);
        setSteer(x);
      }
    }

    function endJoy(e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === joyTouch) {
          joyTouch = null;
          setSteer(0);
        }
      }
    }

    joy.addEventListener("touchmove", handleJoyMove, { passive: false });
    joy.addEventListener("touchend", endJoy);
    joy.addEventListener("touchcancel", endJoy);

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
