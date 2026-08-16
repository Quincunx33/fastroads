(function () {
  "use strict";

  var STYLE_ID = "fr-custom-ui-style";
  var ABOUT_ID = "fr-custom-about-copy";

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      "#splash-feedback-prompt,.feedback-prompt,.feedback-main,.feedback-link,.feedback-send{display:none!important;}" +
      "#fr-mobile-controls.fr-about-hidden{display:none!important;}";
    (document.head || document.documentElement).appendChild(style);
  }

  function replaceAboutCopy() {
    var about = document.getElementById("about");
    if (!about || about.getAttribute("data-fr-customized") === "1") return;
    about.setAttribute("data-fr-customized", "1");
    about.innerHTML =
      '<div id="fr-custom-about-copy">' +
      '<h1>Fast Roads</h1>' +
      '<p>A calm endless-driving experience built for phones, tablets and desktop browsers.</p>' +
      '<p>Drive at your own pace, arrange the touch controls from <strong>Settings</strong>, and use <strong>RECOVER</strong> whenever the car leaves the road.</p>' +
      '<p>This custom edition focuses on a clean interface, comfortable controls and smooth cross-device play.</p>' +
      '<h2>Controls</h2>' +
      '<p>Open Settings to move, resize, show or hide each control independently. Your layout is saved automatically on this device.</p>' +
      '</div>';
  }

  function hideControlsOnAbout() {
    // Keep gameplay controls and Settings visible. The original visibility test
    // treated the hidden About container as visible on some Safari layouts.
    var overlay = document.getElementById("fr-mobile-controls");
    if (overlay) overlay.classList.remove("fr-about-hidden");
  }

  function apply() {
    installStyle();
    replaceAboutCopy();
    hideControlsOnAbout();
  }

  function start() {
    apply();
    var observer = new MutationObserver(apply);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
    window.setInterval(apply, 700);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();

// end ui-custom.js


