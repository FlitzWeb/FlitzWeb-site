/* =========================================================
   FlitzWeb — interactions (2026-11 redesign)
   NL/EN language switch, nav, and the booking form.
   Booking logic is carried over from the old script.js and talks to the
   same /api/availability and /api/book endpoints.
   ========================================================= */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- i18n data ---------- */
  const WEEKDAY = {
    nl: ["zo", "ma", "di", "wo", "do", "vr", "za"],
    en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  };
  const MONTH = {
    nl: ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"],
    en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  };
  const BUSINESS_TZ = "Europe/Amsterdam";
  const STR = {
    nl: {
      title: "FlitzWeb — Websites voor lokale ondernemers",
      desc: "FlitzWeb ontwerpt en bouwt snelle, scherpe websites voor lokale ondernemers. Vaste prijs vooraf, live in weken en goed vindbaar in Google. Stuur ons een bericht via WhatsApp of e-mail.",
      tz: "· Nederlandse tijd",
      required: "Dit veld is verplicht.",
      email: "Vul een geldig e-mailadres in.",
      at: " om ",
      success: (hi, when) => hi + ", we hebben je voorlopig ingepland voor " + when + ". Je ontvangt zo een bevestiging in je inbox.",
      thanks: "Bedankt",
      thanksName: (n) => "Bedankt " + n,
      loading: "Beschikbare tijden laden…",
      noSlots: "Geen tijden meer beschikbaar op deze dag.",
      loadError: "Kon tijden niet laden. Probeer het opnieuw.",
      slotTaken: "Deze tijd is net vergeven. Kies een andere.",
      submitError: "Er ging iets mis. Probeer het opnieuw of mail ons.",
    },
    en: {
      title: "FlitzWeb — Websites for local businesses",
      desc: "FlitzWeb designs and builds fast, sharp websites for local businesses. Fixed price upfront, live in weeks and easy to find on Google. Send us a message on WhatsApp or by email.",
      tz: "· Dutch time (Europe/Amsterdam)",
      required: "This field is required.",
      email: "Enter a valid email address.",
      at: " at ",
      success: (hi, when) => hi + ", we've pencilled you in for " + when + ". You'll get a confirmation in your inbox shortly.",
      thanks: "Thanks",
      thanksName: (n) => "Thanks " + n,
      loading: "Loading available times…",
      noSlots: "No times left on this day.",
      loadError: "Couldn't load times. Please try again.",
      slotTaken: "That time was just taken. Pick another.",
      submitError: "Something went wrong. Please try again or email us.",
    },
  };

  let lang = "nl";
  const bookings = []; // booking forms, relabelled when the language changes
  const nlHtml = new WeakMap(); // original Dutch markup per translated element

  // A status line whose text follows the language: remember which message it shows.
  function setMsg(el, key) {
    el.dataset.msg = key || "";
    el.textContent = key ? STR[lang][key] : "";
  }

  /* ---------- Language switch ---------- */
  function swapAttr(attr, dataName) {
    $$("[data-en-" + dataName + "]").forEach((el) => {
      const store = "nl" + dataName.charAt(0).toUpperCase() + dataName.slice(1);
      if (el.dataset[store] == null) el.dataset[store] = el.getAttribute(attr) || "";
      el.setAttribute(attr, lang === "en" ? el.getAttribute("data-en-" + dataName) : el.dataset[store]);
    });
  }

  function applyLang(next, save) {
    lang = next === "en" ? "en" : "nl";
    document.documentElement.lang = lang;

    // innerHTML, not textContent: the hero heading's English version carries
    // its own per-word spans for the reveal animation.
    $$("[data-en]").forEach((el) => {
      if (!nlHtml.has(el)) nlHtml.set(el, el.innerHTML);
      const html = lang === "en" ? el.getAttribute("data-en") : nlHtml.get(el);
      if (el.innerHTML !== html) el.innerHTML = html;
    });
    swapAttr("placeholder", "ph");
    swapAttr("alt", "alt");
    swapAttr("aria-label", "aria");
    swapAttr("href", "href"); // WhatsApp and mail links: prefilled text in the current language

    document.title = STR[lang].title;
    const meta = $('meta[name="description"]');
    if (meta) meta.setAttribute("content", STR[lang].desc);

    $$("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
    $$("[data-msg]").forEach((el) => { if (el.dataset.msg) el.textContent = STR[lang][el.dataset.msg]; });
    bookings.forEach(relabelBooking);

    if (save) {
      try { localStorage.setItem("flitz-lang", lang); } catch (e) { /* private mode */ }
      if (window.track) window.track("lang_switch", { to: lang });
    }
  }

  $$("[data-lang]").forEach((b) => b.addEventListener("click", () => applyLang(b.dataset.lang, true)));

  /* ---------- Nav: solid background once the page scrolls ---------- */
  const nav = $("[data-nav]");
  if (nav) {
    const onScroll = () => nav.classList.toggle("is-stuck", window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------- Mobile menu ---------- */
  const burger = $("[data-burger]");
  const menu = $("[data-menu]");
  if (burger && menu) {
    const toggle = (open) => {
      const isOpen = open != null ? open : menu.hidden;
      menu.hidden = !isOpen;
      burger.setAttribute("aria-expanded", String(isOpen));
      if (nav) nav.classList.toggle("is-stuck", isOpen || window.scrollY > 24);
    };
    burger.addEventListener("click", () => toggle());
    $$("a", menu).forEach((a) => a.addEventListener("click", () => toggle(false)));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !menu.hidden) { toggle(false); burger.focus(); }
    });
  }

  /* ---------- Booking: day + time controls ---------- */
  // Days are computed in BUSINESS_TZ (not the visitor's timezone) so the dates sent
  // to /api/availability always match what the backend considers a work day.
  function todayKeyInBusinessTz() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: BUSINESS_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
  }

  function nextWorkDays(count) {
    const [y0, m0, d0] = todayKeyInBusinessTz().split("-").map(Number);
    let cursor = new Date(Date.UTC(y0, m0 - 1, d0));
    const out = [];
    while (out.length < count) {
      cursor = new Date(cursor.getTime() + 86400000);
      const dow = cursor.getUTCDay();
      if (dow !== 0 && dow !== 6) {
        out.push({ key: cursor.toISOString().slice(0, 10), dow, day: cursor.getUTCDate(), month: cursor.getUTCMonth() });
      }
    }
    return out;
  }

  const formatDay = (d) => WEEKDAY[lang][d.dow] + " " + d.day + " " + MONTH[lang][d.month];

  function message(wrap, key, isError) {
    const p = document.createElement("p");
    p.className = "slots__msg" + (isError ? " slots__msg--error" : "");
    setMsg(p, key);
    wrap.appendChild(p);
  }

  async function loadSlots(form) {
    const b = form.__booking;
    if (!b) return;
    const { slotWrap, state } = b;
    const submitBtn = $('button[type="submit"]', form);
    // Remember which day this call is for, so a slow response can't render its
    // slots under a day the visitor has since switched away from.
    const requestedKey = state.day.key;
    state.time = null;
    slotWrap.innerHTML = "";
    message(slotWrap, "loading");
    if (submitBtn) submitBtn.disabled = true;

    let slots = [];
    let failed = false;
    try {
      const res = await fetch("/api/availability?date=" + encodeURIComponent(requestedKey));
      if (!res.ok) throw new Error("bad status");
      const data = await res.json();
      slots = Array.isArray(data.slots) ? data.slots : [];
    } catch (e) {
      failed = true;
    }

    if (b.dayWrap.__lastRequestedKey !== requestedKey) return; // superseded by a newer day pick
    slotWrap.innerHTML = "";
    if (failed) return message(slotWrap, "loadError", true);
    if (!slots.length) return message(slotWrap, "noSlots");

    slots.forEach((t, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = t;
      btn.setAttribute("aria-pressed", String(i === 0));
      btn.addEventListener("click", () => {
        $$("button", slotWrap).forEach((x) => x.setAttribute("aria-pressed", "false"));
        btn.setAttribute("aria-pressed", "true");
        state.time = t;
      });
      slotWrap.appendChild(btn);
    });
    state.time = slots[0];
    if (submitBtn) submitBtn.disabled = false;
  }

  function initBooking(form) {
    const dayWrap = $("[data-daypick]", form);
    const slotWrap = $("[data-slots]", form);
    const tzEl = $("[data-tz]", form);
    if (!dayWrap || !slotWrap) return;

    const days = nextWorkDays(5);
    const state = { day: days[0], time: null };

    days.forEach((d, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-pressed", String(i === 0));
      b.innerHTML =
        '<span class="dp__dow"></span>' +
        '<span class="dp__num">' + d.day + "</span>" +
        '<span class="dp__mon"></span>';
      b.addEventListener("click", () => {
        $$("button", dayWrap).forEach((x) => x.setAttribute("aria-pressed", "false"));
        b.setAttribute("aria-pressed", "true");
        state.day = d;
        dayWrap.__lastRequestedKey = d.key;
        loadSlots(form);
      });
      dayWrap.appendChild(b);
    });

    form.__booking = { state, days, dayWrap, slotWrap, tzEl };
    relabelBooking(form);
    dayWrap.__lastRequestedKey = state.day.key;
    loadSlots(form);
  }

  // Day names, month names and the timezone note, in the current language.
  function relabelBooking(form) {
    const b = form.__booking;
    if (!b) return;
    $$("button", b.dayWrap).forEach((btn, i) => {
      const d = b.days[i];
      $(".dp__dow", btn).textContent = WEEKDAY[lang][d.dow];
      $(".dp__mon", btn).textContent = MONTH[lang][d.month];
      btn.setAttribute("aria-label", formatDay(d));
    });
    if (b.tzEl) b.tzEl.textContent = STR[lang].tz;
  }

  /* ---------- Form validation + submit ---------- */
  function validate(form) {
    let ok = true;
    $$("input[required]", form).forEach((input) => {
      const field = input.closest(".field");
      const err = field && field.querySelector("[data-err]");
      let key = "";
      if (!input.value.trim()) key = "required";
      else if (input.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value)) key = "email";
      input.classList.toggle("is-invalid", !!key);
      input.setAttribute("aria-invalid", String(!!key));
      if (err) setMsg(err, key);
      if (key && ok) { input.focus(); ok = false; }
    });
    return ok;
  }

  function handleSubmit(form) {
    const errorEl = $("[data-error]", form);
    const showError = (key) => { if (errorEl) { setMsg(errorEl, key); errorEl.hidden = false; } };

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!validate(form)) return;

      const st = (form.__booking && form.__booking.state) || {};
      if (!st.day || !st.time) return;

      const submitBtn = $('button[type="submit"]', form);
      if (errorEl) errorEl.hidden = true;
      if (submitBtn) submitBtn.disabled = true;

      const data = new FormData(form);
      const text = (k) => (data.get(k) || "").toString().trim();
      const payload = {
        name: text("name"),
        email: text("email"),
        company: text("company"),
        type: text("type"),
        message: text("message"),
        website: (data.get("website") || "").toString(), // honeypot, should stay empty
        date: st.day.key,
        time: st.time,
      };

      try {
        const res = await fetch("/api/book", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res.status === 409) {
          if (window.track) window.track("booking_slot_taken");
          showError("slotTaken");
          loadSlots(form);
          return;
        }
        if (!res.ok) throw new Error("booking failed");

        const first = payload.name.split(" ")[0];
        const hi = first ? STR[lang].thanksName(first) : STR[lang].thanks;
        const when = formatDay(st.day) + STR[lang].at + st.time;

        const success = $("[data-success]", form);
        const msg = $("[data-success-msg]", form);
        if (msg) msg.textContent = STR[lang].success(hi, when);
        if (success) success.hidden = false;
        if (window.track) window.track("booking_success", { type: payload.type });
      } catch (err) {
        showError("submitError");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });

    $$("[data-reset]", form).forEach((btn) =>
      btn.addEventListener("click", () => {
        form.reset();
        const success = $("[data-success]", form);
        if (success) success.hidden = true;
        if (errorEl) errorEl.hidden = true;
        $$(".is-invalid", form).forEach((el) => el.classList.remove("is-invalid"));
        if (form.__booking) {
          const dayWrap = form.__booking.dayWrap;
          $$("button", dayWrap).forEach((b, i) => b.setAttribute("aria-pressed", String(i === 0)));
          form.__booking.state.day = form.__booking.days[0];
          dayWrap.__lastRequestedKey = form.__booking.state.day.key;
          loadSlots(form);
        }
      })
    );
  }

  $$("[data-booking-form]").forEach((form) => {
    initBooking(form);
    handleSubmit(form);
    bookings.push(form);
  });

  /* ---------- Film: plays muted while it is in view; nothing downloads before that ---------- */
  const film = $("[data-film]");
  if (film) {
    const video = $("video", film);
    const playBtn = $("[data-film-play]", film);
    const soundBtn = $("[data-film-sound]", film);
    // Visitors who asked their device for less motion press play themselves.
    let wantsPlay = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let inView = false;

    const show = (btn, state) => $$("[data-when]", btn).forEach((el) => { el.hidden = el.dataset.when !== state; });
    const sync = () => {
      show(playBtn, video.paused ? "paused" : "playing");
      show(soundBtn, video.muted ? "muted" : "unmuted");
    };
    const update = () => {
      if (inView && wantsPlay) video.play().catch(() => { /* autoplay refused: the play button still works */ });
      else video.pause();
    };

    playBtn.addEventListener("click", () => { wantsPlay = video.paused; update(); });
    video.addEventListener("click", () => playBtn.click());
    soundBtn.addEventListener("click", () => {
      video.muted = !video.muted;
      if (!video.muted && video.paused) { wantsPlay = true; update(); }
    });
    ["play", "pause", "volumechange"].forEach((type) => video.addEventListener(type, sync));

    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => { inView = entries[0].isIntersecting; update(); }, { threshold: 0.4 }).observe(video);
    } else {
      inView = true;
    }
    sync();
  }

  /* ---------- Footer year ---------- */
  $$("[data-year]").forEach((el) => { el.textContent = String(new Date().getFullYear()); });

  /* ---------- Start in the saved language (Dutch by default) ---------- */
  let saved = "nl";
  try { saved = localStorage.getItem("flitz-lang") || "nl"; } catch (e) { /* private mode */ }
  if (saved === "en") applyLang("en", false);
})();
