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
  const TIMES = ["09:00", "10:30", "13:00", "14:30", "16:00", "17:30"];
  const STR = {
    nl: {
      title: "FlitzWeb — Websites met de snelheid van een flits",
      desc: "FlitzWeb is een webstudio die snelle, scherpe websites ontwerpt en bouwt voor ambitieuze merken. Strategie, design en code. Versneld met AI, verfijnd door mensen.",
      tz: (z) => "· jouw tijd (" + z + ")",
      required: "Dit veld is verplicht.",
      email: "Vul een geldig e-mailadres in.",
      at: " om ",
      whenFallback: "je gekozen moment",
      success: (hi, when) => hi + ", we hebben je voorlopig ingepland voor " + when + ". Je ontvangt zo een bevestiging in je inbox.",
      thanks: "Bedankt",
      thanksName: (n) => "Bedankt " + n,
    },
    en: {
      title: "FlitzWeb — Websites at the speed of a flash",
      desc: "FlitzWeb is a web studio that designs and builds fast, sharp websites for ambitious brands. Strategy, design and code. Accelerated by AI, refined by humans.",
      tz: (z) => "· your time (" + z + ")",
      required: "This field is required.",
      email: "Enter a valid email address.",
      at: " at ",
      whenFallback: "your selected time",
      success: (hi, when) => hi + ", we've pencilled you in for " + when + ". You'll get a confirmation in your inbox shortly.",
      thanks: "Thanks",
      thanksName: (n) => "Thanks " + n,
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
  function nextDays(count) {
    const out = [];
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    while (out.length < count) {
      d.setDate(d.getDate() + 1);
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) out.push(new Date(d));
    }
    return out;
  }

  function formatDay(date) {
    return WEEKDAY[lang][date.getDay()] + " " + date.getDate() + " " + MONTH[lang][date.getMonth()];
  }

  function initBooking(form) {
    const dayWrap = $("[data-daypick]", form);
    const slotWrap = $("[data-slots]", form);
    const tzEl = $("[data-tz]", form);
    if (!dayWrap || !slotWrap) return;

    const days = nextDays(5);
    const state = { day: days[0], time: TIMES[2] };

    days.forEach((date, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-pressed", String(i === 0));
      b.innerHTML =
        '<span class="dp__dow">' + WEEKDAY[lang][date.getDay()] + '</span>' +
        '<span class="dp__num">' + date.getDate() + '</span>' +
        '<span class="dp__mon">' + MONTH[lang][date.getMonth()] + '</span>';
      b.addEventListener("click", () => {
        $$("button", dayWrap).forEach((x) => x.setAttribute("aria-pressed", "false"));
        b.setAttribute("aria-pressed", "true");
        state.day = date;
      });
      dayWrap.appendChild(b);
    });

    TIMES.forEach((t, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = t;
      b.setAttribute("aria-pressed", String(i === 2));
      b.addEventListener("click", () => {
        $$("button", slotWrap).forEach((x) => x.setAttribute("aria-pressed", "false"));
        b.setAttribute("aria-pressed", "true");
        state.time = t;
      });
      slotWrap.appendChild(b);
    });

    form.__booking = { state, days, dayWrap, tzEl };
    relabelBooking(form);
  }

  function relabelBooking(form) {
    const b = form.__booking;
    if (!b) return;
    $$("button", b.dayWrap).forEach((btn, i) => {
      const d = b.days[i];
      $(".dp__dow", btn).textContent = WEEKDAY[lang][d.getDay()];
      $(".dp__mon", btn).textContent = MONTH[lang][d.getMonth()];
    });
    if (b.tzEl) {
      try {
        const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
        b.tzEl.textContent = STR[lang].tz(z);
      } catch (e) { /* noop */ }
    }
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
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!validate(form)) return;

      const data = new FormData(form);
      const name = (data.get("name") || "").toString().trim().split(" ")[0];
      const hi = name ? STR[lang].thanksName(name) : STR[lang].thanks;
      const st = (form.__booking && form.__booking.state) || {};
      const when = st.day && st.time ? formatDay(st.day) + STR[lang].at + st.time : STR[lang].whenFallback;

      const success = $("[data-success]", form);
      const msg = $("[data-success-msg]", form);
      if (msg) msg.textContent = STR[lang].success(hi, when);
      if (success) success.hidden = false;
    });

    $$("[data-reset]", form).forEach((btn) =>
      btn.addEventListener("click", () => {
        form.reset();
        const success = $("[data-success]", form);
        if (success) success.hidden = true;
        $$(".is-invalid", form).forEach((el) => el.classList.remove("is-invalid"));
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
