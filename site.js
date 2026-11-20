/* =========================================================
   FlitzWeb — interactions (2026-11 redesign)
   Booking logic is carried over from script.js and talks to the
   same /api/availability and /api/book endpoints.
   ========================================================= */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const WEEKDAY = ["zo", "ma", "di", "wo", "do", "vr", "za"];
  const MONTH = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  const BUSINESS_TZ = "Europe/Amsterdam";
  const STR = {
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
  };

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

  const formatDay = (d) => WEEKDAY[d.dow] + " " + d.day + " " + MONTH[d.month];

  function message(wrap, text, isError) {
    const p = document.createElement("p");
    p.className = "slots__msg" + (isError ? " slots__msg--error" : "");
    p.textContent = text;
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
    message(slotWrap, STR.loading);
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
    if (failed) return message(slotWrap, STR.loadError, true);
    if (!slots.length) return message(slotWrap, STR.noSlots);

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
      b.setAttribute("aria-label", formatDay(d));
      b.innerHTML =
        '<span class="dp__dow">' + WEEKDAY[d.dow] + "</span>" +
        '<span class="dp__num">' + d.day + "</span>" +
        '<span class="dp__mon">' + MONTH[d.month] + "</span>";
      b.addEventListener("click", () => {
        $$("button", dayWrap).forEach((x) => x.setAttribute("aria-pressed", "false"));
        b.setAttribute("aria-pressed", "true");
        state.day = d;
        dayWrap.__lastRequestedKey = d.key;
        loadSlots(form);
      });
      dayWrap.appendChild(b);
    });

    if (tzEl) tzEl.textContent = STR.tz;
    form.__booking = { state, days, dayWrap, slotWrap };
    dayWrap.__lastRequestedKey = state.day.key;
    loadSlots(form);
  }

  /* ---------- Form validation + submit ---------- */
  function validate(form) {
    let ok = true;
    $$("input[required]", form).forEach((input) => {
      const field = input.closest(".field");
      const err = field && field.querySelector("[data-err]");
      let msg = "";
      if (!input.value.trim()) msg = STR.required;
      else if (input.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value)) msg = STR.email;
      input.classList.toggle("is-invalid", !!msg);
      input.setAttribute("aria-invalid", String(!!msg));
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
          if (errorEl) { errorEl.textContent = STR.slotTaken; errorEl.hidden = false; }
          loadSlots(form);
          return;
        }
        if (!res.ok) throw new Error("booking failed");

        const first = payload.name.split(" ")[0];
        const hi = first ? STR.thanksName(first) : STR.thanks;
        const when = formatDay(st.day) + STR.at + st.time;

        const success = $("[data-success]", form);
        const msg = $("[data-success-msg]", form);
        if (msg) msg.textContent = STR.success(hi, when);
        if (success) success.hidden = false;
        if (window.track) window.track("booking_success", { type: payload.type });
      } catch (err) {
        if (errorEl) { errorEl.textContent = STR.submitError; errorEl.hidden = false; }
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
  });

  /* ---------- Footer year ---------- */
  $$("[data-year]").forEach((el) => { el.textContent = String(new Date().getFullYear()); });
})();
