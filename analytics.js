/* FlitzWeb — Vercel Web Analytics
   Meet de belangrijkste conversies van de studio: het openen van de
   boeking, e-mailkliks en taalwissels via delegatie hieronder — en een
   geslaagde boeking / nieuwsbrief-aanmelding via window.track() in script.js.
   Werkt op Vercel met Web Analytics aan (custom events vragen een Pro-plan).
*/
(function () {
  "use strict";

  // Veilige wrapper rond Vercel's window.va (de queue-stub staat in index.html)
  function track(name, data) {
    if (typeof window.va === "function") {
      window.va("event", data ? { name: name, data: data } : { name: name });
    }
  }
  window.track = track;

  // Dichtstbijzijnde sectie, voor context bij een klik (hero, contact, modal, …)
  function locationOf(el) {
    var sec = el.closest("section, header, footer, [data-modal]");
    if (!sec) return "overig";
    return sec.id || (sec.className || "").toString().split(" ")[0] || sec.tagName.toLowerCase();
  }

  document.addEventListener("click", function (e) {
    var el = e.target.closest("a, button");
    if (!el) return;

    if (el.hasAttribute("data-open-booking")) {
      track("booking_open", { location: locationOf(el) });
      return;
    }
    if (el.hasAttribute("data-lang")) {
      track("lang_switch", { to: el.getAttribute("data-lang") });
      return;
    }
    var href = el.getAttribute("href") || "";
    if (/^mailto:/i.test(href)) { track("email_click"); return; }
  }, true); // capture
})();
