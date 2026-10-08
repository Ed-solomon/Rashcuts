(() => {
  const cfg = { apiBaseUrl: window.RASHCUTS_ADMIN_CONFIG?.apiBaseUrl || window.RashcutsPublicConfig?.apiBaseUrl || "" };
  const page = document.body.dataset.adminPage || "login";
  const apiUrl = (path) => `${String(cfg.apiBaseUrl || "").replace(/\/$/, "")}${path}`;
  const esc = (value = "") => String(value).replace(/[&<>"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const money = (value) => `₦${Number(value || 0).toLocaleString("en-NG")}`;
  const fmtDate = (value) => {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
  };
  const timeNow = () => new Intl.DateTimeFormat("en-NG", { hour: "numeric", minute: "2-digit" }).format(new Date());

  let user = null;
  let toastTimer = 0;
  let locationRow = null;
  let services = [];
  let workItems = [];
  let deletedWorkIds = new Set();
  let notificationSettings = { admin_email: "", client_email: "" };

  const CATEGORY_DESCRIPTIONS = {
    cuts: "Cuts — shape, fade & finish",
    texture: "Texture — braids, locs & treatments",
    grooming: "Grooming — beard & finishing care",
    fades: "Fades — clean blends & transitions",
    "finished work": "Finished work — polished final looks",
    inspiration: "Inspiration — looks worth saving"
  };

  function showToast(message, error = false) {
    const toast = document.querySelector("#toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle("error", error);
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3200);
  }

  async function request(path, options = {}) {
    const response = await fetch(apiUrl(path), {
      ...options,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(options.headers || {})
      }
    });
    const type = response.headers.get("content-type") || "";
    const payload = type.includes("application/json") ? await response.json().catch(() => ({})) : await response.text();
    if (!response.ok) {
      const message = typeof payload === "object" ? payload.error || payload.message : payload;
      const err = new Error(message || `Request failed (${response.status}).`);
      err.status = response.status;
      throw err;
    }
    return payload;
  }

  const icon = (name) => {
    const icons = {
      dashboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.7"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.7"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.7"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.7"/></svg>',
      bookings: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5.5" width="18" height="15" rx="3"/><path d="M7 3.5v4M17 3.5v4M3 10h18M7.5 14h3M13.5 14h3M7.5 17.5h3"/></svg>',
      studio: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.4 7-12A7 7 0 1 0 5 9c0 5.6 7 12 7 12Z"/><circle cx="12" cy="9" r="2.3"/></svg>',
      services: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h12a1.8 1.8 0 0 1 1.8 1.8v13.4a1.8 1.8 0 0 1-1.8 1.8H6a1.8 1.8 0 0 1-1.8-1.8V5.3A1.8 1.8 0 0 1 6 3.5Z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
      gallery: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9" r="1.6"/><path d="m4.8 18 4.8-5 3.2 3 2.5-2.4 3.9 4.4"/></svg>',
      settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.3a3.7 3.7 0 1 0 0 7.4 3.7 3.7 0 0 0 0-7.4Z"/><path d="m19 13.4 1.7 1-.1 2-2 .9-.7 1.8 1 1.6-1.4 1.4-1.7-1-1.8.7-.9 2h-2l-.9-2-1.8-.7-1.7 1-1.4-1.4 1-1.6-.7-1.8-2-.9-.1-2 1.7-1-.1-1.9-1.6-1.1.6-1.9 2.1-.2 1.2-1.6-.2-2.1 1.8-.9 1.4 1.5 2-.3 1.2-1.8 1.9.9-.2 2.1 1.2 1.6 2.1.2.6 1.9-1.6 1.1-.1 1.9Z"/></svg>',
      logout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H6.5A2.5 2.5 0 0 0 4 7.5v9A2.5 2.5 0 0 0 6.5 19H10M14 8l4 4-4 4M18 12H9"/></svg>',
      search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.2"/><path d="m16 16 4.2 4.2"/></svg>',
      bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 6-2.5 6.5-2.5 8h17C20.5 15.5 18 15 18 9ZM10 20h4"/></svg>',
      mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2.2"/><path d="m5.2 7 6.8 5 6.8-5"/></svg>',
      arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18 18 6M9 6h9v9"/></svg>',
      pencil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16.5-.8 4.3 4.3-.8L18.9 8.6a2.2 2.2 0 0 0 0-3.1l-.4-.4a2.2 2.2 0 0 0-3.1 0L4 16.5Z"/><path d="m13.9 6.1 4 4"/></svg>',
      check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4 4 10-10"/></svg>',
      plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
    };
    return icons[name] || "";
  };

  const nav = [
    ["dashboard", "Overview", "dashboard.html"],
    ["bookings", "Bookings", "bookings.html"],
    ["studio", "Studio", "studio.html"],
    ["services", "Services", "services.html"],
    ["gallery", "Gallery", "gallery.html"]
  ];

  function dashboardChrome(active) {
    const menuMarkup = nav.map(([key,label,url]) => `<a class="rail-item ${active===key?"is-active":""}" href="${url}" data-label="${label}" aria-label="${label}"${active===key?' aria-current="page"':""}>${icon(key)}<span class="rail-label">${label}</span></a>`).join("");
    return `<div class="spatial-shell">
      <header class="spatial-global-head">
        <div class="global-head__copy">
          <p class="topbar-kicker">RASHCUTS / PRIVATE CONTROL</p>
          <h1 id="pageTitle">ADMIN DASHBOARD</h1>
          <p id="pageSubtitle">Welcome back <strong id="welcomeName">Rasheed</strong></p>
        </div>
        <div class="global-head__actions">
          <button class="top-icon topbar-bell" id="notificationBell" type="button" aria-label="Booking activity" aria-expanded="false" aria-controls="notificationPopover">
            ${icon("bell")}<span class="notification-dot" id="notificationDot" aria-hidden="true"></span><span class="notification-count" id="notificationCount" aria-hidden="true"></span>
          </button>
          <div class="top-time" id="topTime">${timeNow()}</div>
          <a class="avatar" id="adminAvatar" href="settings.html" aria-label="Open settings">RC</a>
          <a class="mobile-top-action" href="settings.html" aria-label="Settings">${icon("settings")}</a>
          <button class="mobile-top-action" id="topLogout" type="button" aria-label="Log out">${icon("logout")}</button>
          <div class="notification-popover" id="notificationPopover" hidden>
            <div class="notification-popover__head"><div><span>BOOKING ACTIVITY</span><strong id="notificationPopoverTitle">No new activity</strong></div><a class="notification-view-all" href="bookings.html">View all <span aria-hidden="true">↗</span></a></div>
            <p id="notificationPopoverCopy">New public booking attempts will appear here.</p>
            <div class="notification-list" id="notificationList"></div>
          </div>
        </div>
      </header>
      <div class="spatial-app">
        <div class="spatial-workspace">
          <aside class="rail-stack" aria-label="Admin navigation">
            <div class="rail-card rail-brand">
              <a class="rail-logo" href="dashboard.html" aria-label="Rashcuts overview"><img src="../assets/loader/rc-logo-render.png" alt="Rashcuts RC logo"></a>
            </div>
            <nav class="rail-card rail-menu">${menuMarkup}</nav>
            <div class="rail-card rail-utilities">
              <a class="rail-item ${active==="settings"?"is-active":""}" href="settings.html" data-label="Settings" aria-label="Settings">${icon("settings")}</a>
              <button class="rail-item" id="railLogout" type="button" data-label="Log out" aria-label="Log out">${icon("logout")}</button>
            </div>
          </aside>
          <section class="main-panel">
            <main class="page-content" id="pageContent"></main>
          </section>
        </div>
        <nav class="mobile-nav" aria-label="Admin pages">${menuMarkup}</nav>
      </div>
    </div>`;
  }

  function setTopMeta() {
    const timeEl = document.querySelector("#topTime");
    if (timeEl) timeEl.textContent = timeNow();
  }

  function renderPageShell() {
    const root = document.querySelector("#adminRoot");
    if (!root) return;
    const active = page === "dashboard" ? "dashboard" : page;
    root.innerHTML = dashboardChrome(active);
    document.querySelector("#railLogout")?.addEventListener("click", performLogout);
    document.querySelector("#topLogout")?.addEventListener("click", performLogout);
    const bell = document.querySelector("#notificationBell");
    const popover = document.querySelector("#notificationPopover");
    bell?.addEventListener("click", (event) => {
      event.stopPropagation();
      const willOpen = Boolean(popover?.hidden);
      if (!popover) return;
      popover.hidden = !willOpen;
      bell.setAttribute("aria-expanded", String(willOpen));
      if (willOpen) refreshNotificationCenter();
    });
    document.addEventListener("pointerdown", (event) => {
      if (!popover || popover.hidden || bell?.contains(event.target) || popover.contains(event.target)) return;
      popover.hidden = true;
      bell?.setAttribute("aria-expanded", "false");
    });
  }

  async function refreshNotificationCenter() {
    try {
      const summary = await request("/api/admin/bookings/summary");
      const recent = Array.isArray(summary.recent) ? summary.recent : [];
      const latest = recent[0] || null;
      const seenAt = Number(localStorage.getItem("rashcuts.admin.bookingSeenAt") || 0);
      const newItems = seenAt ? recent.filter((item) => new Date(item.created_at).getTime() > seenAt) : recent;
      const needsAttention = Boolean(newItems.length);
      const bell = document.querySelector("#notificationBell");
      const dot = document.querySelector("#notificationDot");
      const count = document.querySelector("#notificationCount");
      const title = document.querySelector("#notificationPopoverTitle");
      const copy = document.querySelector("#notificationPopoverCopy");
      if (bell) bell.classList.toggle("has-attention", needsAttention);
      if (dot) dot.hidden = !needsAttention;
      if (count) {
        count.textContent = needsAttention ? String(Math.min(9, newItems.length)) : "";
        count.hidden = !needsAttention || newItems.length < 2;
      }
      if (bell) bell.setAttribute("aria-label", needsAttention ? `${newItems.length} booking item${newItems.length === 1 ? "" : "s"} need attention` : "No new booking activity");
      if (title) title.textContent = needsAttention ? `${newItems.length} new booking item${newItems.length === 1 ? "" : "s"}` : "No new activity";
      if (copy) copy.textContent = needsAttention
        ? `${newItems.length} recent public booking signal${newItems.length === 1 ? "" : "s"} since you last checked.`
        : latest ? `Last activity ${fmtDate(latest.created_at)}.` : "New public booking attempts will appear here.";
      const list = document.querySelector("#notificationList");
      if (list) {
        const items = (needsAttention ? newItems : recent).slice(0, 3);
        list.innerHTML = items.length ? items.map((item) => {
          const stage = item.stage === "contact" ? (item.channel || "contact") : "started";
          const service = item.service_summary || "General booking request";
          return `<a class="notification-row" href="bookings.html"><span class="notification-row__stage ${stage === "contact" ? "is-contact" : ""}">${esc(stage)}</span><span class="notification-row__main"><strong>${esc(service)}</strong><small>${esc(fmtDate(item.created_at))} · ${esc(item.appointment_time || "No time")}</small></span><span class="notification-row__arrow" aria-hidden="true">↗</span></a>`;
        }).join("") : `<div class="notification-empty">No booking activity to review.</div>`;
      }
      return summary;
    } catch (_) {
      const bell = document.querySelector("#notificationBell");
      bell?.classList.remove("has-attention");
      return null;
    }
  }

  function markBookingNotificationsSeen(summary) {
    const latest = Array.isArray(summary?.recent) ? summary.recent[0] : null;
    if (!latest) return;
    const timestamp = new Date(latest.created_at).getTime();
    if (Number.isFinite(timestamp)) localStorage.setItem("rashcuts.admin.bookingSeenAt", String(timestamp));
    const dot = document.querySelector("#notificationDot");
    const count = document.querySelector("#notificationCount");
    const bell = document.querySelector("#notificationBell");
    if (dot) dot.hidden = true;
    if (count) { count.hidden = true; count.textContent = ""; }
    bell?.classList.remove("has-attention");
    bell?.setAttribute("aria-label", "No new booking activity");
  }

  async function checkSession() {
    try {
      const session = await request("/api/admin/session");
      if (!session.authenticated) throw new Error("Not authenticated");
      user = session.user;
      const avatar = document.querySelector("#adminAvatar");
      if (avatar && user?.email) avatar.textContent = String(user.email).slice(0,2).toUpperCase();
      const isDeveloper = String(user?.email || "").trim().toLowerCase() === "edachesolomon2020@gmail.com";
      const welcome = document.querySelector("#welcomeName");
      if (welcome) welcome.textContent = isDeveloper ? "Noir_dev" : "Rasheed";
      return session;
    } catch (_) {
      window.location.replace("./");
      return null;
    }
  }

  function renderLogin() {
    const form = document.querySelector("#loginForm");
    const passwordToggle = document.querySelector("#passwordToggle");
    const passwordInput = document.querySelector("#loginPassword");
    const errorEl = document.querySelector("#loginError");
    const button = document.querySelector("#loginButton");
    passwordToggle?.addEventListener("click", () => {
      const showing = passwordInput.type === "text";
      passwordInput.type = showing ? "password" : "text";
      passwordToggle.textContent = showing ? "SHOW" : "HIDE";
      passwordToggle.setAttribute("aria-label", showing ? "Show password" : "Hide password");
      passwordToggle.setAttribute("aria-pressed", String(!showing));
      passwordInput.focus({ preventScroll: true });
    });
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      errorEl?.classList.add("hidden");
      button.disabled = true;
      try {
        const result = await request("/api/admin/login", { method:"POST", body:JSON.stringify({ email:form.elements.loginEmail.value.trim(), password:form.elements.loginPassword.value }) });
        user = result.user;
        window.location.replace("dashboard.html");
      } catch (error) {
        if (errorEl) { errorEl.textContent = error.message || "Login failed. Check the server and credentials."; errorEl.classList.remove("hidden"); }
      } finally { button.disabled = false; }
    });
  }

  async function loadSiteData() {
    const data = await request("/api/admin/site-data");
    locationRow = data.location || null;
    services = Array.isArray(data.services) ? data.services : [];
    workItems = Array.isArray(data.work) ? data.work : [];
    deletedWorkIds = new Set();
    return data;
  }

  async function loadNotificationSettings() {
    try { notificationSettings = await request("/api/admin/notification-settings"); }
    catch (_) { notificationSettings = { admin_email:"", client_email:"" }; }
    return notificationSettings;
  }

  function humanCategory(value) {
    const clean = String(value || "Finished work").trim().toLowerCase();
    return clean.split(/\s+/).map((word) => word.charAt(0).toUpperCase()+word.slice(1)).join(" ");
  }

  function categoryDescription(category) {
    const key = String(category || "Finished work").trim().toLowerCase();
    return CATEGORY_DESCRIPTIONS[key] || `${humanCategory(category)} — curated Rashcuts work`;
  }

  function serviceMatchForWork(item) {
    const wanted = String(item?.service || "").trim().toLowerCase();
    if (!wanted) return null;
    return services.find((service) => String(service.name || "").trim().toLowerCase() === wanted) ||
      services.find((service) => wanted.includes(String(service.name || "").trim().toLowerCase()) || String(service.name || "").trim().toLowerCase().includes(wanted)) || null;
  }

  function toPublicPath(raw) {
    const value = String(raw || "").trim();
    if (!value) return "";
    if (/^(https?:|data:|blob:)/i.test(value)) return value;
    return value.startsWith("/") ? value : `/${value}`;
  }

  function assetPath(folder, filename) {
    const clean = String(filename || "").trim().replace(/^\/+/, "");
    if (!clean) return "";
    return `/assets/${folder}/${clean.split("/").map(encodeURIComponent).join("/")}`;
  }

  function imageSources(item, kind) {
    const raw = toPublicPath(item?.image_url);
    const filename = String(item?.image_name || item?.image || "").trim();
    const list = [];
    if (raw) list.push(raw);
    if (filename) {
      list.push(assetPath(kind === "work" ? "our-work" : "services", filename));
      if (kind === "work") list.push(assetPath("services", filename));
    }
    if (kind === "work") {
      const match = serviceMatchForWork(item);
      if (match) {
        const sRaw = toPublicPath(match.image_url);
        if (sRaw) list.push(sRaw);
        if (match.image_name) list.push(assetPath("services", match.image_name));
      }
    }
    return [...new Set(list.filter(Boolean))];
  }

  function thumb(item, kind, label) {
    const sources = imageSources(item, kind);
    if (!sources.length) return `<div class="board-thumb" aria-label="No image available"></div>`;
    const sourceData = esc(JSON.stringify(sources));
    return `<div class="board-thumb"><img src="${esc(sources[0])}" alt="${esc(label)}" loading="eager" decoding="async" data-image-sources="${sourceData}"></div>`;
  }

  function bindImageFallbacks(scope = document) {
    scope.querySelectorAll?.("img[data-image-sources]").forEach((img) => {
      if (img.dataset.imageFallbackReady === "true") return;
      img.dataset.imageFallbackReady = "true";
      const sources = (() => { try { return JSON.parse(img.dataset.imageSources || "[]"); } catch (_) { return []; } })();
      let index = 0;
      const tryNext = () => {
        index += 1;
        if (index >= sources.length) { img.parentElement?.classList.add("image-missing"); return; }
        img.src = sources[index];
      };
      img.addEventListener("error", tryNext);
    });
  }

  function mediaName(item, kind) {
    const sources = imageSources(item, kind);
    if (!sources.length) return "No image yet";
    const last = sources[0].split("?")[0].split("/").pop();
    return last || "Managed image";
  }

  function setContent(html) { const target = document.querySelector("#pageContent"); if (target) { target.innerHTML = html; bindImageFallbacks(target); } }

  async function renderDashboard() {
    setTopMeta();
    await Promise.all([loadSiteData(), loadNotificationSettings()]);
    let booking = {today:0,last7:0,last30:0,total:0,started7:0,contact7:0,whatsapp7:0,recent:[]};
    try { booking = await request("/api/admin/bookings/summary"); } catch (_) {}
    const location = locationRow || {};
    const activeGallery = workItems.filter((item) => item.active !== 0 && item.active !== false).length;
    const recent = Array.isArray(booking.recent) ? booking.recent.slice(0,4) : [];
    const pct = Math.min(100, Math.max(6, Number(booking.last7 || 0) * 8));
    const emailReady = Boolean(notificationSettings.admin_email && notificationSettings.client_email);
    const readinessItems = [Boolean(location.name), Boolean(location.address), services.length > 0, activeGallery > 0, emailReady];
    const readyCount = readinessItems.filter(Boolean).length;
    const readiness = Math.round((readyCount / readinessItems.length) * 100);
    const studioAddress = [location.address, location.area, location.city].filter(Boolean).join(" · ") || "No address saved yet";
    setContent(`<div class="dash">
      <div class="dash-main">
        <div class="page-intro"><div><h2>Overview<span class="accent-dot">.</span></h2><p>Bookings, live site content and email routing — the things that need a look today.</p></div><span class="page-chip good"><i class="live-dot"></i>Live database</span></div>
        <article class="hero-card">
            <div class="hero-photo"></div><div class="hero-orb"></div>
            <div class="hero-copy"><span class="eyebrow">Rashcuts private control</span><h2>Keep the chair ready.<br>Keep the site sharp.</h2><p>Open the exact control you need from the side rail. The layout stays spacious, the important numbers stay visible, and nothing is buried in one giant page.</p></div>
            <div class="hero-bottom"><a class="hero-cta" href="bookings.html"><span>Open booking tracker</span>${icon("arrow")}</a><div class="hero-stat"><strong>${Number(booking.today || 0)}</strong><span>attempts today</span></div></div>
        </article>
        <div class="tile-grid">
          <a class="tile" href="bookings.html"><div class="tile-top"><span class="tile-icon">${icon("bookings")}</span><h3>Booking pulse</h3><p>People entering the booking flow.</p></div><div class="tile-foot"><span class="meter"><span style="width:${pct}%"></span></span><strong>${Number(booking.last7 || 0)}</strong><span>/ 7 days</span></div></a>
          <a class="tile" href="services.html"><div class="tile-top"><span class="tile-icon">${icon("gallery")}</span><h3>Live content</h3><p>Rows connected to the public site.</p></div><div class="tile-foot tile-foot--split"><span><strong>${services.length}</strong> services</span><span><strong>${activeGallery}</strong> gallery</span></div></a>
          <a class="tile" href="studio.html"><div class="tile-top"><span class="tile-icon">${icon("studio")}</span><h3>${esc(location.name || "RASHCUTS / STUDIO")}</h3><p>${esc(studioAddress)}</p></div><div class="tile-foot"><span>${esc(location.hours || "Hours not set")}</span></div></a>
          <a class="tile" href="studio.html"><div class="tile-top"><span class="tile-icon">${icon("mail")}</span><h3>Email routing</h3><p>${emailReady ? "Both recipients saved." : "Needs setup."}</p></div><div class="tile-lines"><div class="tile-line"><span>Admin</span><strong title="${esc(notificationSettings.admin_email || "Not set")}">${esc(notificationSettings.admin_email || "Not set")}</strong></div><div class="tile-line"><span>Client</span><strong title="${esc(notificationSettings.client_email || "Not set")}">${esc(notificationSettings.client_email || "Not set")}</strong></div></div></a>
        </div>
        <article class="spatial-card latest-card"><div class="card-head"><div><h3>Latest booking attempts</h3><p>${Number(booking.total || 0)} tracked attempt${Number(booking.total || 0)===1?"":"s"} all time.</p></div><span class="page-chip">${Number(booking.whatsapp7 || 0)} WhatsApp / 7d</span></div><div class="list-table"><div class="list-row list-head"><span></span><span>Attempt</span><span>Date</span><span>Stage</span></div>${recent.length ? recent.map(renderRecentBookingRow).join("") : `<div class="empty-state">No booking attempts yet. They will appear here as customers start the public booking journey.</div>`}</div></article>
      </div>
      <aside class="dash-side" aria-label="Statistics">
        <section class="side-block"><h3 class="side-title">Statistics</h3><div class="stat-ring" style="--p:${readiness}" role="img" aria-label="Site readiness ${readiness} percent"><div class="stat-ring__inner"><small>Site readiness</small><strong>${readiness}<sup>%</sup></strong><em>${readyCount} of ${readinessItems.length} areas live</em></div></div></section>
        <section class="side-block"><h3 class="side-title">Bookings</h3><div class="booking-summary"><div class="booking-stat"><span class="label">Today</span><strong>${Number(booking.today || 0)}</strong></div><div class="booking-stat"><span class="label">Last 7 days</span><strong>${Number(booking.last7 || 0)}</strong></div><div class="booking-stat"><span class="label">WhatsApp / 7d</span><strong>${Number(booking.whatsapp7 || 0)}</strong></div><div class="booking-stat"><span class="label">Total</span><strong>${Number(booking.total || 0)}</strong></div></div></section>
        <section class="side-block side-block--actions"><h3 class="side-title">Quick actions</h3><div class="quick-actions"><a class="dark-action" href="bookings.html"><span>Review bookings</span>${icon("arrow")}</a><a class="dark-action" href="services.html"><span>Edit services</span>${icon("arrow")}</a><a class="dark-action" href="gallery.html"><span>Manage gallery</span>${icon("arrow")}</a></div></section>
      </aside>
    </div>`);
  }

  function renderRecentBookingRow(item) {
    const summary = item.service_summary || "Booking started";
    const image = item.preview_image || (serviceMatchForWork({service:summary}) ? serviceMatchForWork({service:summary}).image_url : "");
    return `<div class="list-row"><div class="list-thumb">${image ? `<img src="${esc(toPublicPath(image))}" alt="" loading="lazy">` : ""}</div><div class="list-main"><strong>${esc(summary)}</strong><span>${esc(item.appointment_date || "No date")} · ${esc(item.appointment_time || "No time")}</span></div><div class="list-col"><strong>${esc(fmtDate(item.created_at))}</strong></div><div class="list-col"><span class="booking-badge">${esc(item.stage || "started")}</span></div></div>`;
  }

  async function renderBookings() {
    setTopMeta("Bookings", "See who starts a booking, who takes the WhatsApp handoff, and how often the public flow is being used.");
    const summary = await request("/api/admin/bookings/summary");
    markBookingNotificationsSeen(summary);
    const recent = await request("/api/admin/bookings?limit=80");
    setContent(`<div class="page-grid">
      <div class="page-intro"><div><h2>Booking tracker<span class="accent-dot">.</span></h2><p>Anonymous events from the public booking flow. Starting is an attempt; continuing to WhatsApp is the stronger handoff. Nothing here counts as a confirmed appointment.</p></div><span class="page-chip good">LIVE / ANONYMOUS</span></div>
      <section class="admin-dark-panel booking-focus"><div class="booking-focus__copy"><span class="dark-eyebrow">ATTENTION / BOOKING SIGNAL</span><h3>Review intent before it goes cold.</h3><p>A started booking is interest. A WhatsApp handoff is stronger intent.</p></div><div class="booking-focus__signals"><span><small>STARTED / 7D</small><strong>${Number(summary.started7||0)}</strong></span><span><small>WHATSAPP / 7D</small><strong>${Number(summary.whatsapp7||0)}</strong></span><span><small>TOTAL</small><strong>${Number(summary.total||0)}</strong></span></div></section>
      <div class="booking-summary"><div class="booking-stat"><span class="label">Today</span><strong>${Number(summary.today||0)}</strong><small>booking attempts</small></div><div class="booking-stat"><span class="label">Last 7 days</span><strong>${Number(summary.last7||0)}</strong><small>booking attempts</small></div><div class="booking-stat"><span class="label">Last 30 days</span><strong>${Number(summary.last30||0)}</strong><small>booking attempts</small></div><div class="booking-stat"><span class="label">WhatsApp / 7d</span><strong>${Number(summary.whatsapp7||0)}</strong><small>stronger booking intent</small></div></div>
      <article class="spatial-card booking-board"><div class="card-head"><div><h3>Recent attempts</h3><p class="booking-board__subcopy">Every attempt is shown here. WhatsApp handoffs are marked separately as stronger intent.</p></div><button class="btn" type="button" id="refreshBookings">Refresh</button></div>
        <div class="data-board"><div class="board-head"><span>Ref</span><span>Customer action</span><span>Preferred slot</span><span>Stage</span><span>Time</span></div>${recent.length ? recent.map(renderBookingRow).join("") : `<div class="empty-state">No booking attempts recorded yet.</div>`}</div>
      </article>
    </div>`);
    document.querySelector("#refreshBookings")?.addEventListener("click", renderBookings);
  }

  function renderBookingRow(item) {
    const service = item.service_summary || "General booking request";
    const stage = item.stage === "contact" ? (item.channel || "contact") : "started";
    return `<div class="board-row" data-searchable="${esc([service,item.appointment_date,item.appointment_time,stage].join(" "))}"><div class="booking-ref">#${String(item.id).padStart(4,"0")}</div><div class="board-title"><strong>${esc(service)}</strong><span>${item.private_session ? "Private session" : "Studio visit"} · ${item.service_count || 0} selected</span></div><div class="booking-slot">${esc(item.appointment_date || "—")} ${esc(item.appointment_time || "")}</div><div><span class="booking-stage">${esc(stage)}</span></div><div class="muted-cell">${esc(fmtDate(item.created_at))}</div></div>`;
  }

  function defaultLocation() {
    return {name:"RASHCUTS / STUDIO",address:"Hill-Top GRA",area:"Hill-Top GRA",lga:"Chanchaga",city:"Minna",state:"Niger State",country:"Nigeria",hours:"09:00 — 20:00",phone:"",latitude:9.61,longitude:6.55,place_id:"",directions_url:"",wallpaper_url:"",...(locationRow||{})};
  }

  async function renderStudio() {
    setTopMeta("Studio", "Address, hours & contact routing.");
    await Promise.all([loadSiteData(), loadNotificationSettings()]);
    const d = defaultLocation();
    setContent(`<div class="page-grid">
      <div class="page-intro"><div><h2>Studio<span class="accent-dot">.</span></h2><p>The first screen keeps the public address and notification routing visible together, without forcing a long scroll.</p></div><span class="page-chip">STUDIO CONTROL</span></div>
      <section class="admin-dark-panel studio-focus"><div><span class="dark-eyebrow">ATTENTION / PUBLIC DESTINATION</span><h3>${esc(d.name || "RASHCUTS / STUDIO")}</h3><p>${esc([d.address,d.area,d.city,d.state].filter(Boolean).join(" · ") || "No address saved yet")}</p></div><div class="studio-focus__status"><span><small>CONTACT</small><strong>${esc(d.phone || "Not set")}</strong></span><span><small>EMAIL ROUTING</small><strong>${notificationSettings.admin_email && notificationSettings.client_email ? "READY" : "NEEDS SETUP"}</strong></span><span><small>HOURS</small><strong>${esc(d.hours || "Not set")}</strong></span></div></section>
      <div class="studio-grid">
        <article class="spatial-card"><div class="card-head"><div><h3>Studio destination</h3><p>This is the location the public site uses for the studio.</p></div><span id="locationStatus" class="page-chip">READY</span></div><form id="locationForm"><div class="form-grid">
          ${field("Studio name","name",d.name)}${field("Address / building","address",d.address)}${field("Area","area",d.area)}${field("LGA","lga",d.lga)}${field("City","city",d.city)}${field("State","state",d.state)}${field("Country","country",d.country)}${field("Opening hours","hours",d.hours)}${field("Personal contact / WhatsApp","phone",d.phone,"tel","field-span-2")}
          ${field("Latitude","latitude",d.latitude,"number")}${field("Longitude","longitude",d.longitude,"number")}${field("Google Maps Place ID","place_id",d.place_id)}${field("Directions URL","directions_url",d.directions_url,"url","field-span-2")}${field("Location wallpaper URL","wallpaper_url",d.wallpaper_url,"url","field-wide")}
        </div><div class="form-actions"><button class="btn btn-primary" type="submit">Save studio</button></div></form></article>
        <div class="studio-side">
          <article class="spatial-card"><div class="card-head"><div><h3>Email routing</h3><p>Admin and client recipients are stored in MySQL.</p></div><span id="notificationSaveStatus" class="page-chip">READY</span></div><form id="notificationForm"><div class="email-grid"><label class="email-card"><span class="tag">ADMIN</span><h3>Admin email</h3><p>Receives admin-change summaries.</p><input class="field-card-input" name="admin_email" type="email" autocomplete="email" value="${esc(notificationSettings.admin_email)}" placeholder="admin@rashcuts.com" required></label><label class="email-card"><span class="tag">CLIENT</span><h3>Client email</h3><p>Receives the client-side copy.</p><input class="field-card-input" name="client_email" type="email" autocomplete="email" value="${esc(notificationSettings.client_email)}" placeholder="client@rashcuts.com" required></label></div><div class="form-actions"><button class="btn btn-primary" type="submit">Save routing</button></div></form></article>
          <article class="spatial-card"><div class="card-head"><div><h3>Address preview</h3><p>What the studio card currently points to.</p></div></div><div class="location-map"><span class="map-pin"></span></div><div class="snapshot-value" style="margin-top:12px">${esc([d.address,d.area,d.city,d.state].filter(Boolean).join(" · ") || "No location saved")}</div><div class="snapshot-sub">${esc(d.hours || "Hours not set")}</div></article>
        </div>
      </div>
    </div>`);
    document.querySelector("#locationForm")?.addEventListener("submit", saveLocation);
    document.querySelector("#notificationForm")?.addEventListener("submit", saveNotificationSettings);
  }

  function field(label,name,value,type="text",classes="") {
    const required = ["address","city","state"].includes(name) ? " required" : "";
    return `<label class="field-card ${classes}"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value ?? "")}"${required}></label>`;
  }

  async function saveLocation(event) {
    event.preventDefault();
    const status = document.querySelector("#locationStatus");
    try {
      if (status) status.textContent = "SAVING";
      const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
      payload.latitude = Number(payload.latitude || 0); payload.longitude = Number(payload.longitude || 0);
      locationRow = await request("/api/admin/location", {method:"PUT", body:JSON.stringify(payload)});
      if (status) status.textContent = "SAVED";
      showToast("Studio details saved.");
    } catch (error) { if(status)status.textContent="ERROR"; showToast(error.message,true); }
  }

  async function saveNotificationSettings(event) {
    event.preventDefault();
    const status = document.querySelector("#notificationSaveStatus");
    try {
      if(status)status.textContent="SAVING";
      notificationSettings = await request("/api/admin/notification-settings", {method:"PUT", body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries()))});
      if(status)status.textContent="SAVED";
      showToast("Email routing saved to the database.");
    } catch (error) { if(status)status.textContent="ERROR"; showToast(error.message,true); }
  }

  function serviceOptions(selected = "") {
    return services.map((service) => `<option value="${esc(service.name)}" ${String(service.name)===String(selected)?"selected":""}>${esc(service.name)}</option>`).join("");
  }

  function toggleRowEditing(row, editing = null) {
    const next = editing == null ? !row.classList.contains("is-editing") : editing;
    row.classList.toggle("is-editing", next);
    const button = row.querySelector("[data-edit-row]");
    if (button) {
      button.innerHTML = next ? icon("check") : icon("pencil");
      button.title = next ? "Done editing" : "Edit row";
      button.setAttribute("aria-label", next ? "Done editing" : "Edit row");
    }
  }

  function bindEditButtons(container = document) {
    container.querySelectorAll("[data-edit-row]").forEach((button) => {
      button.addEventListener("click", () => toggleRowEditing(button.closest(".board-row")));
    });
  }

  function editorField(label,name,value,type="text",classes="") {
    return `<label class="editor-field ${classes}"><span>${label}</span><input data-field="${name}" type="${type}" value="${esc(value ?? "")}"></label>`;
  }

  function editorText(label,name,value,classes="") {
    return `<label class="editor-field ${classes}"><span>${label}</span><textarea data-field="${name}">${esc(value ?? "")}</textarea></label>`;
  }

  async function renderServices() {
    setTopMeta("Services", "Pricing, service descriptions and media — clean rows first, edits on demand.");
    await loadSiteData();
    setContent(`<div class="page-grid"><div class="page-intro"><div><h2>Services<span class="accent-dot">.</span></h2><p>Each row follows the reference-dashboard rhythm: Image → service → description → price → media. Click the pencil to reveal editing controls.</p></div><span class="page-chip">${services.length} SERVICES</span></div><div class="admin-dark-panel board-toolbar"><span class="toolbar-text">Edit only what you need. Save once when you're done.</span><div class="toolbar-actions"><button class="btn btn-primary" type="button" id="saveServices">Save all changes</button></div></div><article class="data-board"><div class="board-head"><span>Image</span><span>Service</span><span>Description</span><span>Price</span><span>Media</span><span></span></div><div id="serviceRows"></div></article></div>`);
    renderServiceRows();
    document.querySelector("#saveServices")?.addEventListener("click", saveServices);
  }

  function renderServiceRows() {
    const rows = document.querySelector("#serviceRows");
    if (!rows) return;
    rows.innerHTML = services.map((service, index) => renderServiceRow(service, index)).join("");
    bindImageFallbacks(rows);
    bindServiceRows(rows);
  }

  function renderServiceRow(service,index) {
    const category = humanCategory(service.category || "Service");
    const categoryDesc = categoryDescription(service.category);
    return `<div class="board-row service-row" data-service-id="${esc(service.id)}" data-searchable="${esc([service.name,service.category,service.description].join(" "))}">
      <div>${thumb(service,"services",`${service.name} service image`)}</div>
      <div class="service-cell"><div class="board-title"><strong>${esc(service.name)}</strong><span>${String(index+1).padStart(2,"0")} · ${esc(category)}</span></div><span class="service-category">${esc(category)}</span><div class="category-desc">${esc(categoryDesc)}</div></div>
      <div class="description-cell">${esc(service.description || categoryDesc)}</div>
      <div class="price-cell">${money(service.price)}</div>
      <div class="media-cell"><div class="media-file"><strong>${esc(mediaName(service,"services"))}</strong><span>${service.image_url ? "Managed upload" : "Bundled image"}</span></div><label class="inline-upload" title="Replace service image">Replace<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" data-upload-service></label></div>
      <button class="edit-btn" type="button" data-edit-row title="Edit row" aria-label="Edit ${esc(service.name)}">${icon("pencil")}</button>
      <div class="row-editor"><div class="editor-grid">${editorField("Service name","name",service.name)}${editorField("Category","category",service.category)}${editorText("Description","description",service.description,"editor-wide")}${editorField("Price","price",service.price,"number")}${editorField("Image URL","image_url",service.image_url,"text","editor-wide")}${editorField("Alt text","image_alt",service.image_alt,"text","editor-wide")}</div><div class="editor-actions"><span class="toolbar-text">Changes are staged in the row until you hit Save all changes.</span></div></div>
    </div>`;
  }

  function bindServiceRows(container) {
    bindEditButtons(container);
    container.querySelectorAll("[data-upload-service]").forEach((input) => input.addEventListener("change", handleServiceUpload));
  }

  async function handleServiceUpload(event) {
    const input = event.currentTarget; const row = input.closest(".service-row"); const file = input.files?.[0];
    if (!file || !row) return;
    try {
      input.disabled = true;
      toggleRowEditing(row,true);
      const result = await uploadMedia(file,"services");
      row.querySelector('[data-field="image_url"]').value = result.url;
      row.querySelector(".media-file strong").textContent = result.filename;
      row.querySelector(".media-file span").textContent = "New upload / staged";
      showToast("Service image uploaded. Save all changes to publish it.");
    } catch (error) { showToast(error.message,true); }
    finally { input.disabled = false; }
  }

  async function saveServices() {
    const button = document.querySelector("#saveServices"); const rows = [...document.querySelectorAll(".service-row")];
    if(button)button.disabled=true;
    try {
      for (const row of rows) {
        const data = Object.fromEntries([...row.querySelectorAll("[data-field]")].map((el)=>[el.dataset.field,el.value]));
        data.price = Number(data.price || 0);
        await request(`/api/admin/services/${encodeURIComponent(row.dataset.serviceId)}`, {method:"PUT",body:JSON.stringify(data)});
      }
      await loadSiteData();
      renderServiceRows();
      showToast("Services saved.");
    } catch (error) { showToast(error.message,true); }
    finally { if(button)button.disabled=false; }
  }

  async function renderGallery() {
    setTopMeta("Gallery", "Our Work — visible images, linked services and clean metadata.");
    await loadSiteData();
    setContent(`<div class="page-grid"><div class="page-intro"><div><h2>Gallery<span class="accent-dot">.</span></h2><p>Every row is structured as Image → service → description → price → media. The description and price are pulled from the linked service; click the pencil when you need to edit the row.</p></div><span class="page-chip">${workItems.length} ROWS</span></div><div class="admin-dark-panel board-toolbar"><span class="toolbar-text" id="galleryToolbarText">${workItems.length} gallery rows</span><div class="toolbar-actions"><button class="btn" type="button" id="addGallery">${icon("plus")} Add image</button><button class="btn btn-primary" type="button" id="saveGallery">Save gallery</button></div></div><article class="data-board"><div class="board-head"><span>Image</span><span>Service</span><span>Description</span><span>Price</span><span>Media</span><span></span></div><div id="galleryRows"></div></article></div>`);
    renderGalleryRows();
    document.querySelector("#addGallery")?.addEventListener("click", addGalleryRow);
    document.querySelector("#saveGallery")?.addEventListener("click", saveGallery);
  }

  function renderGalleryRows() {
    const rows = document.querySelector("#galleryRows"); if (!rows) return;
    rows.innerHTML = workItems.map((item,index)=>renderGalleryRow(item,index)).join("");
    bindImageFallbacks(rows);
    bindGalleryRows(rows);
    const count = document.querySelector("#galleryToolbarText"); if(count) count.textContent = `${rows.querySelectorAll(".gallery-row").length} gallery rows`;
  }

  function renderGalleryRow(item,index) {
    const linkedService = serviceMatchForWork(item);
    const description = linkedService?.description || categoryDescription(item.category);
    const price = linkedService?.price ?? null;
    const category = humanCategory(item.category || linkedService?.category || "Finished work");
    const categoryDesc = categoryDescription(item.category || linkedService?.category);
    return `<div class="board-row gallery-row" data-work-id="${item.id ? esc(item.id) : ""}" data-new="${item.id?"0":"1"}" data-searchable="${esc([item.service,item.category,item.alt,description].join(" "))}">
      <div>${thumb(item,"work",item.alt || `${item.service || "Rashcuts"} gallery image`)}</div>
      <div class="service-cell"><div class="board-title"><strong>${esc(item.service || "New image")}</strong><span>${String(index+1).padStart(2,"0")} · ${esc(category)}</span></div><span class="service-category">${esc(category)}</span><div class="category-desc">${esc(categoryDesc)}</div></div>
      <div class="description-cell">${esc(description)}</div>
      <div class="price-cell">${price == null ? "—" : money(price)}</div>
      <div class="media-cell"><div class="media-file"><strong>${esc(mediaName(item,"work"))}</strong><span>${item.image_url ? "Managed upload" : "Bundled / fallback ready"}</span></div><label class="inline-upload" title="Replace gallery image">Replace<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" data-upload-gallery></label></div>
      <button class="edit-btn" type="button" data-edit-row title="Edit row" aria-label="Edit ${esc(item.service || "gallery image")}">${icon("pencil")}</button>
      <div class="row-editor"><div class="editor-grid">${editorField("Service","service",item.service || "Rashcuts")}${editorField("Category","category",item.category || linkedService?.category || "Finished work")}${editorText("Alt text","alt",item.alt || "Rashcuts finished work","editor-wide")}${editorField("Image URL","image_url",item.image_url,"text","editor-wide")}<label class="editor-field"><span>Visibility</span><select data-field="active"><option value="true" ${item.active!==0&&item.active!==false?"selected":""}>Visible</option><option value="false" ${item.active===0||item.active===false?"selected":""}>Hidden</option></select></label><label class="editor-field"><span>Linked service</span><select data-linked-service>${serviceOptions(item.service || linkedService?.name || "")}</select></label></div><div class="editor-actions"><span class="toolbar-text">The public site uses the row's service/category metadata. Save gallery when finished.</span><button type="button" class="btn btn-danger" data-remove-gallery>${item.id?"Remove":"Discard"}</button></div></div>
    </div>`;
  }

  function bindGalleryRows(container) {
    bindEditButtons(container);
    container.querySelectorAll("[data-upload-gallery]").forEach((input)=>input.addEventListener("change",handleGalleryUpload));
    container.querySelectorAll("[data-remove-gallery]").forEach((button)=>button.addEventListener("click",()=>{
      const row=button.closest(".gallery-row"); if(!row)return;
      if(row.dataset.new!=="1") deletedWorkIds.add(row.dataset.workId);
      row.remove();
      showToast("Gallery row removed from this edit. Save gallery to apply.");
    }));
    container.querySelectorAll("[data-linked-service]").forEach((select)=>select.addEventListener("change",()=>{
      const row=select.closest(".gallery-row"); const linked=services.find((service)=>service.name===select.value); if(!row||!linked)return;
      row.querySelector('[data-field="service"]').value=linked.name;
      row.querySelector('[data-field="category"]').value=linked.category || row.querySelector('[data-field="category"]').value;
      row.querySelector(".description-cell").textContent=linked.description || categoryDescription(linked.category);
      row.querySelector(".price-cell").textContent=money(linked.price);
      row.querySelector(".board-title strong").textContent=linked.name;
    }));
  }

  async function handleGalleryUpload(event) {
    const input=event.currentTarget; const row=input.closest(".gallery-row"); const file=input.files?.[0]; if(!file||!row)return;
    try {
      input.disabled=true;
      toggleRowEditing(row,true);
      const result=await uploadMedia(file,"work");
      row.querySelector('[data-field="image_url"]').value=result.url;
      row.querySelector(".media-file strong").textContent=result.filename;
      row.querySelector(".media-file span").textContent="New upload / staged";
      const img=row.querySelector(".board-thumb img"); if(img) { img.dataset.fallback=""; img.src=result.url; }
      showToast("Gallery image uploaded. Save gallery to publish it.");
    } catch(error) { showToast(error.message,true); }
    finally { input.disabled=false; }
  }

  function addGalleryRow() {
    const next={id:null,service:services[0]?.name||"Rashcuts",category:services[0]?.category||"Finished work",alt:"Rashcuts finished work",image_url:"",sort_order:document.querySelectorAll(".gallery-row").length,active:true};
    const container=document.querySelector("#galleryRows"); if(!container)return;
    const index=container.querySelectorAll(".gallery-row").length;
    container.insertAdjacentHTML("beforeend",renderGalleryRow(next,index));
    bindGalleryRows(container);
    const row=container.lastElementChild; if(row)toggleRowEditing(row,true);
  }

  async function saveGallery() {
    const button=document.querySelector("#saveGallery"); if(button)button.disabled=true;
    const rows=[...document.querySelectorAll(".gallery-row")];
    try {
      const items=rows.map((row,index)=>{
        const data={id:row.dataset.new==="1"?null:row.dataset.workId,sort_order:index};
        row.querySelectorAll("[data-field]").forEach((el)=>data[el.dataset.field]=el.value);
        const linkedSelect=row.querySelector("[data-linked-service]");
        if(linkedSelect && linkedSelect.value) data.service=linkedSelect.value;
        data.active=data.active!=="false";
        return data;
      });
      await request("/api/admin/work",{method:"PUT",body:JSON.stringify({items,delete_ids:[...deletedWorkIds]})});
      await loadSiteData(); deletedWorkIds=new Set(); renderGalleryRows(); showToast("Gallery saved.");
    } catch(error) { showToast(error.message,true); }
    finally { if(button)button.disabled=false; }
  }

  async function uploadMedia(file,kind){ const body=new FormData(); body.append("image",file); return request(`/api/admin/upload?kind=${encodeURIComponent(kind)}`,{method:"POST",body}); }

  async function renderSettings() {
    setTopMeta("Settings", "Session and system details — email editing lives with the studio controls.");
    await loadNotificationSettings();
    let status={configured:false,smtpConfigured:false}; try { status=await request("/api/admin/notification-status"); } catch(_) {}
    setContent(`<div class="page-grid"><div class="page-intro"><div><h2>Settings<span class="accent-dot">.</span></h2><p>System status stays quiet and useful. Actual email routing is edited from Studio, not hidden behind an awkward button.</p></div><span class="page-chip ${status.configured?"good":""}">${status.configured?"EMAIL READY":"EMAIL SETUP NEEDED"}</span></div>
      <article class="spatial-card"><div class="card-head"><div><h3>Email delivery</h3><p>Recipients are shown here for reference. Use Studio to edit them.</p></div><a class="edit-btn" href="studio.html" aria-label="Edit email routing" title="Edit email routing">${icon("pencil")}</a></div><div class="email-grid"><div class="email-card"><span class="tag">ADMIN</span><h3>${esc(notificationSettings.admin_email||"Not set")}</h3><p>Admin change-summary recipient.</p></div><div class="email-card"><span class="tag">CLIENT</span><h3>${esc(notificationSettings.client_email||"Not set")}</h3><p>Client-side copy recipient.</p></div></div></article>
      <article class="spatial-card admin-dark-panel"><div class="card-head"><div><h3>Current session</h3><p>Authenticated admin session details.</p></div><span class="page-chip good">ACTIVE</span></div><div class="status-grid"><div class="status-tile"><span class="tag">ADMIN ACCOUNT</span><strong>${esc(user?.email||"Authenticated")}</strong><p>Signed-in account.</p></div><div class="status-tile"><span class="tag">SMTP</span><strong>${status.smtpConfigured?"CONNECTED":"NOT CONFIGURED"}</strong><p>Transport used when update summaries are sent.</p></div></div></article>
    </div>`);
  }

  async function performLogout(){try{await request("/api/admin/logout",{method:"POST"});}catch(_){}window.location.replace("./");}

  async function bootApp(){
    renderPageShell();
    const session=await checkSession(); if(!session)return;
    refreshNotificationCenter();
    const notificationPoll = window.setInterval(refreshNotificationCenter, 45000);
    window.addEventListener("beforeunload", () => window.clearInterval(notificationPoll), { once: true });
    try {
      if(page==="dashboard") await renderDashboard();
      else if(page==="bookings") await renderBookings();
      else if(page==="studio") await renderStudio();
      else if(page==="services") await renderServices();
      else if(page==="gallery") await renderGallery();
      else if(page==="settings") await renderSettings();
      else await renderDashboard();
    } catch(error) { setContent(`<div class="empty-state">${esc(error.message||"The dashboard could not load.")}</div>`); showToast(error.message||"Dashboard error.",true); }
  }

  if(page==="login") renderLogin(); else bootApp();
})();
