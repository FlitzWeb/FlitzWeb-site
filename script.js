/* =========================================================
   Flits Web — interactions + NL/EN language switch
   ========================================================= */
(function () {
  "use strict";
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
      title: "FlitzWeb — Websites met de snelheid van een flits",
      desc: "FlitzWeb is een webstudio die snelle, scherpe websites ontwerpt en bouwt voor ambitieuze merken. Strategie, design en code, met de hand gebouwd.",
      tz: "· Nederlandse tijd (Europe/Amsterdam)",
      required: "Dit veld is verplicht.",
      email: "Vul een geldig e-mailadres in.",
      at: " om ",
      whenFallback: "je gekozen moment",
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
      title: "FlitzWeb — Websites at the speed of a flash",
      desc: "FlitzWeb is a web studio that designs and builds fast, sharp websites for ambitious brands. Strategy, design and code, built by hand.",
      tz: "· Central European time (Europe/Amsterdam)",
      required: "This field is required.",
      email: "Enter a valid email address.",
      at: " at ",
      whenFallback: "your selected time",
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
  const bookings = []; // registered booking forms, so we can relabel on language change

  /* ---------- Language switch ---------- */
  function applyLang(next) {
    lang = next === "en" ? "en" : "nl";
    document.documentElement.lang = lang;

    // text nodes
    $$("[data-en]").forEach((el) => {
      if (el.dataset.nlText == null) el.dataset.nlText = el.textContent;
      el.textContent = lang === "en" ? el.getAttribute("data-en") : el.dataset.nlText;
    });
    // placeholders
    $$("[data-en-ph]").forEach((el) => {
      if (el.dataset.nlPh == null) el.dataset.nlPh = el.getAttribute("placeholder") || "";
      el.setAttribute("placeholder", lang === "en" ? el.getAttribute("data-en-ph") : el.dataset.nlPh);
    });
    // document meta
    document.title = STR[lang].title;
    const meta = $('meta[name="description"]');
    if (meta) meta.setAttribute("content", STR[lang].desc);
    // toggle state
    $$("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
    // relabel booking day/time widgets in place (keeps selection)
    bookings.forEach(relabelBooking);

    try { localStorage.setItem("flitz-lang", lang); } catch (e) { /* noop */ }
  }

  $$("[data-lang]").forEach((b) =>
    b.addEventListener("click", () => applyLang(b.dataset.lang))
  );

  /* ---------- Mobile menu ---------- */
  const burger = $("[data-burger]");
  const mobileMenu = $("[data-mobile-menu]");
  if (burger && mobileMenu) {
    const toggle = (open) => {
      const isOpen = open != null ? open : !mobileMenu.classList.contains("is-open");
      mobileMenu.classList.toggle("is-open", isOpen);
      mobileMenu.hidden = !isOpen;
      burger.setAttribute("aria-expanded", String(isOpen));
    };
    burger.addEventListener("click", () => toggle());
    $$("a", mobileMenu).forEach((a) => a.addEventListener("click", () => toggle(false)));
  }

  /* ---------- Services accordion ---------- */
  const accordion = $("[data-accordion]");
  if (accordion) {
    const items = $$(".acc__item", accordion);
    const setPanel = (item, open) => {
      const panel = $(".acc__panel", item);
      const head = $(".acc__head", item);
      item.classList.toggle("is-open", open);
      head.setAttribute("aria-expanded", String(open));
      panel.style.height = open ? panel.scrollHeight + "px" : "0px";
    };
    items.forEach((item) => {
      const head = $(".acc__head", item);
      setPanel(item, item.classList.contains("is-open"));
      head.addEventListener("click", () => {
        const willOpen = !item.classList.contains("is-open");
        items.forEach((it) => setPanel(it, false));
        if (willOpen) setPanel(item, true);
      });
    });
    window.addEventListener("resize", () => {
      const open = $(".acc__item.is-open", accordion);
      if (open) $(".acc__panel", open).style.height = $(".acc__panel", open).scrollHeight + "px";
    });
  }

  /* ---------- Booking: day + time controls ---------- */
  // Days are keyed/computed in BUSINESS_TZ (not the visitor's local timezone) so the
  // date strings sent to /api/availability always match what the backend considers
  // "today" and "a work day" — otherwise a visitor far from Europe/Amsterdam near
  // midnight could pick a day the backend then rejects.
  function todayKeyInBusinessTz() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: BUSINESS_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
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

  function formatDay(d) {
    return WEEKDAY[lang][d.dow] + " " + d.day + " " + MONTH[lang][d.month];
  }

  async function loadSlots(form) {
    const b = form.__booking;
    if (!b) return;
    const { slotWrap, state } = b;
    const submitBtn = $('button[type="submit"]', form);
    state.time = null;
    slotWrap.innerHTML = "";
    const loading = document.createElement("p");
    loading.className = "slots__msg";
    loading.textContent = STR[lang].loading;
    slotWrap.appendChild(loading);
    if (submitBtn) submitBtn.disabled = true;

    let slots = [];
    let failed = false;
    try {
      const res = await fetch("/api/availability?date=" + encodeURIComponent(state.day.key));
      if (!res.ok) throw new Error("bad status");
      const data = await res.json();
      slots = Array.isArray(data.slots) ? data.slots : [];
    } catch (e) {
      failed = true;
    }

    if (b.dayWrap.__lastRequestedKey && b.dayWrap.__lastRequestedKey !== state.day.key) return; // superseded by a newer day pick
    slotWrap.innerHTML = "";

    if (failed) {
      const err = document.createElement("p");
      err.className = "slots__msg slots__msg--error";
      err.textContent = STR[lang].loadError;
      slotWrap.appendChild(err);
      return;
    }
    if (!slots.length) {
      const empty = document.createElement("p");
      empty.className = "slots__msg";
      empty.textContent = STR[lang].noSlots;
      slotWrap.appendChild(empty);
      return;
    }

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
        '<span class="dp__dow">' + WEEKDAY[lang][d.dow] + '</span>' +
        '<span class="dp__num">' + d.day + '</span>' +
        '<span class="dp__mon">' + MONTH[lang][d.month] + '</span>';
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

  function relabelBooking(form) {
    const b = form.__booking;
    if (!b) return;
    $$("button", b.dayWrap).forEach((btn, i) => {
      const d = b.days[i];
      $(".dp__dow", btn).textContent = WEEKDAY[lang][d.dow];
      $(".dp__mon", btn).textContent = MONTH[lang][d.month];
    });
    if (b.tzEl) b.tzEl.textContent = STR[lang].tz;
  }

  /* ---------- Form validation + submit ---------- */
  function validate(form) {
    let ok = true;
    $$("input[required]", form).forEach((input) => {
      const err = input.closest(".field") && input.closest(".field").querySelector("[data-err]");
      let msg = "";
      if (!input.value.trim()) msg = STR[lang].required;
      else if (input.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value)) msg = STR[lang].email;
      input.classList.toggle("is-invalid", !!msg);
      if (err) err.textContent = msg;
      if (msg && ok) { input.focus(); ok = false; }
    });
    return ok;
  }

  function handleSubmit(form) {
    const errorEl = $("[data-error]", form);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!validate(form)) return;

      const st = (form.__booking && form.__booking.state) || {};
      if (!st.day || !st.time) return;

      const submitBtn = $('button[type="submit"]', form);
      if (errorEl) errorEl.hidden = true;
      if (submitBtn) submitBtn.disabled = true;

      const data = new FormData(form);
      const payload = {
        name: (data.get("name") || "").toString().trim(),
        email: (data.get("email") || "").toString().trim(),
        company: (data.get("company") || "").toString().trim(),
        type: (data.get("type") || "").toString().trim(),
        message: (data.get("message") || "").toString().trim(),
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
          if (errorEl) { errorEl.textContent = STR[lang].slotTaken; errorEl.hidden = false; }
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
        if (errorEl) { errorEl.textContent = STR[lang].submitError; errorEl.hidden = false; }
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

  /* ---------- Booking modal ---------- */
  const modal = $("[data-modal]");
  let lastFocus = null;
  function openModal() {
    if (!modal) return;
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add("modal-open");
    const first = modal.querySelector("input, button");
    if (first) first.focus();
    document.addEventListener("keydown", onKeydown);
  }
  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    document.removeEventListener("keydown", onKeydown);
    if (lastFocus) lastFocus.focus();
  }
  function onKeydown(e) {
    if (e.key === "Escape") closeModal();
    if (e.key === "Tab" && modal) {
      const f = $$('a[href], button:not([disabled]), input, select, textarea', modal)
        .filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  $$("[data-open-booking]").forEach((b) => b.addEventListener("click", openModal));
  $$("[data-close-booking]").forEach((b) => b.addEventListener("click", closeModal));

  /* ---------- Newsletter (footer) ---------- */
  const news = $("[data-news]");
  if (news) {
    news.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = $("input", news);
      if (!input.value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value)) {
        input.focus();
        return;
      }
      const note = $("[data-news-note]");
      if (note) note.hidden = false;
      if (window.track) window.track("newsletter_signup");
      news.reset();
    });
  }

  /* ---------- Scroll reveal ---------- */
  if (!reduceMotion && "IntersectionObserver" in window) {
    const targets = [".studio__copy", ".section-head", ".acc__item", ".step", ".work__soon", ".book__intro", ".book__form", ".foot__cta"];
    const els = [];
    targets.forEach((sel) => $$(sel).forEach((el) => els.push(el)));
    els.forEach((el, i) => {
      el.setAttribute("data-reveal", "");
      el.style.transitionDelay = Math.min((i % 4) * 60, 180) + "ms";
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    els.forEach((el) => io.observe(el));
  }

  /* ---------- Init language (saved or default nl) ---------- */
  let saved = "nl";
  try { saved = localStorage.getItem("flitz-lang") || "nl"; } catch (e) { /* noop */ }
  applyLang(saved);
})();
