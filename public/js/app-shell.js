(function bootstrapInventoryShell(global) {
  const app = global.InventoryApp || {};
  const doc = global.document;
  const escapeHtml = app.escapeHtml || ((value) => String(value ?? ""));
  const styleId = "inventory-sidebar-style";
  const defaultFooterText =
    app.copyrightText ||
    "Copyright 2026 India Inventory Management - All rights reserved.";
  const brandDescription = String(app.sidebarBrandDescription || "").trim();
  const cspNonce = doc?.documentElement?.dataset?.cspNonce || "";
  const isMobileLayout =
    app.isMobileLayout ||
    (() => global.matchMedia("(max-width: 991px)").matches);

  function syncAndroidSidebarGestureLock(isLocked) {
    const androidShell = global.AndroidAppShell;
    if (
      !androidShell ||
      typeof androidShell.setSidebarGesturesLocked !== "function"
    ) {
      return;
    }

    try {
      androidShell.setSidebarGesturesLocked(Boolean(isLocked));
    } catch (_error) {
      // Ignore bridge errors outside the Android wrapper.
    }
  }

  let activeController = null;

  const sidebarStyles = `
    html.body-scroll-lock-root,
    body.body-scroll-lock {
      overflow: hidden;
      overscroll-behavior: none;
      overscroll-behavior-y: none;
    }

    body.body-scroll-lock {
      height: 100vh;
    }

    #sidebarToggle {
      position: fixed;
      top: 18px;
      left: 18px;
      z-index: 1200;
      display: none;
      width: 48px;
      height: 48px;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.92);
      box-shadow: var(--shadow-md, 0 12px 24px rgba(17, 29, 58, 0.12));
      color: var(--navy, #17315d);
      font-size: 18px;
      cursor: pointer;
      transition:
        opacity 0.2s ease,
        transform 0.2s ease;
    }

    body.body-scroll-lock #sidebarToggle {
      opacity: 0;
      pointer-events: none;
      transform: translateY(-8px);
    }

    .sidebar-overlay {
      position: fixed;
      inset: 0;
      z-index: 1050;
      background: rgba(10, 18, 37, 0.42);
      opacity: 0;
      visibility: hidden;
      transition:
        opacity 0.25s ease,
        visibility 0.25s ease;
      backdrop-filter: blur(4px);
    }

    .sidebar-overlay.visible {
      opacity: 1;
      visibility: visible;
    }

    .sidebar {
      position: fixed;
      inset: 18px auto 18px 18px;
      width: 286px;
      z-index: 1100;
      display: flex;
      flex-direction: column;
      padding: 20px 16px;
      border-radius: 30px;
      overflow: hidden;
      color: #eff6ff;
      background:
        linear-gradient(
          180deg,
          rgba(31, 58, 108, 0.98),
          rgba(11, 29, 58, 0.97)
        ),
        radial-gradient(
          circle at top right,
          rgba(45, 212, 191, 0.2),
          transparent 28%
        );
      box-shadow: var(--shadow-xl, 0 32px 70px rgba(17, 29, 58, 0.16));
      overscroll-behavior: contain;
    }

    .sidebar__brand,
    .sidebar__footer {
      flex-shrink: 0;
    }

    .sidebar__brand {
      padding: 10px 10px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      margin-bottom: 12px;
    }

    .sidebar__brand-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }

    .sidebar__brand h2 {
      margin: 0;
      font-size: 21px;
      line-height: 1.05;
      font-weight: 800;
      letter-spacing: -0.03em;
    }

    .sidebar button.sidebar__refresh-button {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      padding: 0;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.06);
      color: rgba(239, 246, 255, 0.92);
      box-shadow: inset 0 0 0 1px rgba(191, 235, 255, 0.16);
    }

    .sidebar button.sidebar__refresh-button i {
      width: auto;
      font-size: 14px;
    }

    .sidebar button.sidebar__refresh-button:hover {
      transform: none;
      background: rgba(14, 165, 233, 0.18);
      color: #ffffff;
      box-shadow: inset 0 0 0 1px rgba(125, 211, 252, 0.28);
    }

    .sidebar__brand p {
      margin: 10px 0 0;
      font-size: 12px;
      line-height: 1.6;
      color: rgba(226, 232, 240, 0.76);
    }

    .sidebar__nav {
      display: grid;
      gap: 2px;
      align-content: start;
      grid-auto-rows: max-content;
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      overscroll-behavior-y: contain;
      -webkit-overflow-scrolling: touch;
      touch-action: pan-y;
      padding-right: 6px;
      margin-right: -6px;
      scrollbar-width: thin;
      scrollbar-color: rgba(226, 232, 240, 0.32) transparent;
    }

    .sidebar__nav::-webkit-scrollbar {
      width: 8px;
    }

    .sidebar__nav::-webkit-scrollbar-track {
      background: transparent;
    }

    .sidebar__nav::-webkit-scrollbar-thumb {
      border-radius: 999px;
      background: rgba(226, 232, 240, 0.28);
    }

    .sidebar__nav::-webkit-scrollbar-thumb:hover {
      background: rgba(226, 232, 240, 0.42);
    }

    .sidebar button {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      border: 0;
      border-radius: 18px;
      padding: 9px 14px;
      background: transparent;
      color: rgba(239, 246, 255, 0.9);
      font-size: 14px;
      font-weight: 600;
      text-align: left;
      transition:
        transform 0.2s ease,
        background-color 0.2s ease,
        color 0.2s ease,
        box-shadow 0.2s ease;
    }

    .sidebar button i {
      width: 18px;
      text-align: center;
    }

    .sidebar button:hover,
    .sidebar button.active {
      transform: translateX(2px);
      background: linear-gradient(
        135deg,
        rgba(14, 165, 233, 0.18),
        rgba(45, 212, 191, 0.12)
      );
      color: #ffffff;
      box-shadow: inset 0 0 0 1px rgba(125, 211, 252, 0.18);
    }

    .sidebar button:focus-visible,
    #sidebarToggle:focus-visible {
      outline: 3px solid rgba(14, 165, 233, 0.22);
      outline-offset: 3px;
    }

    .sidebar__footer {
      margin-top: auto;
      padding: 14px 10px 0;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }

    .sidebar__footer p {
      margin: 0;
      font-size: 12px;
      line-height: 1.6;
      color: rgba(226, 232, 240, 0.7);
    }

    .sidebar__legal {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 10px;
      margin-top: 10px;
    }

    .sidebar__legal a {
      color: rgba(191, 235, 255, 0.88);
      font-size: 11px;
      font-weight: 700;
      text-decoration: none;
    }

    .sidebar__legal a:hover {
      color: #ffffff;
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    @media (max-width: 991px) {
      #sidebarToggle {
        display: inline-flex;
      }

      .sidebar {
        inset: 0 auto 0 0;
        width: min(88vw, 320px);
        border-radius: 0 28px 28px 0;
        transform: translateX(-100%);
        transition: transform 0.25s ease;
      }

      .sidebar.sidebar--open {
        transform: translateX(0);
      }
    }

    @media (max-width: 560px) {
      #sidebarToggle {
        top: 12px;
        left: 12px;
      }
    }
  `;

  function ensureStyles() {
    if (!doc?.head || doc.getElementById(styleId)) {
      return;
    }

    const style = doc.createElement("style");
    style.id = styleId;
    if (cspNonce) {
      style.setAttribute("nonce", cspNonce);
    }
    style.textContent = sidebarStyles;
    doc.head.appendChild(style);
  }

  function ensureShell() {
    if (!doc?.body) {
      return null;
    }

    ensureStyles();

    let sidebar = doc.getElementById("sidebar");
    if (sidebar) {
      syncFooterText();
      return sidebar;
    }

    doc.body.insertAdjacentHTML(
      "afterbegin",
      `
        <button
          id="sidebarToggle"
          type="button"
          aria-label="Open dashboard menu"
          aria-controls="sidebar"
          aria-expanded="false"
        >
          <i class="fa-solid fa-bars"></i>
        </button>
        <div id="sidebarOverlay" class="sidebar-overlay"></div>
        <aside class="sidebar" id="sidebar" aria-label="Dashboard Navigation">
          <div class="sidebar__brand">
            <div class="sidebar__brand-header">
              <h2>India Inventory Management</h2>
              <button
                id="sidebarRefreshBtn"
                class="sidebar__refresh-button"
                type="button"
                title="Refresh current page"
                aria-label="Refresh current page"
              >
                <i class="fa-solid fa-arrows-rotate"></i>
              </button>
            </div>
            ${brandDescription ? `<p>${escapeHtml(brandDescription)}</p>` : ""}
          </div>
          <div class="sidebar__nav" id="sidebarNav"></div>
          <div class="sidebar__footer">
            <p id="sidebarFooterText"></p>
            <div class="sidebar__legal" aria-label="Legal links">
              <a href="/privacy-policy.html">Privacy Policy</a>
              <a href="/account-deletion.html">Account Deletion</a>
            </div>
          </div>
        </aside>
      `,
    );

    syncFooterText();
    return doc.getElementById("sidebar");
  }

  function syncFooterText() {
    const footer =
      doc.getElementById("sidebarFooterText") ||
      doc.querySelector(".sidebar__footer p");

    if (footer) {
      footer.textContent = app.copyrightText || defaultFooterText;
    }
  }

  function buildDashboardButton(item) {
    if (item.kind === "invoice") {
      return `
        <button id="invoiceBtn" type="button">
          <i class="${escapeHtml(item.iconClass)}"></i>
          <span>${escapeHtml(item.label)}</span>
        </button>
      `;
    }

    const classes =
      item.sectionId === "addStockSection" ? ' class="active"' : "";
    return `
      <button
        data-section="${escapeHtml(item.sectionId)}"
        ${classes}
        type="button"
      >
        <i class="${escapeHtml(item.iconClass)}"></i>
        <span>${escapeHtml(item.label)}</span>
      </button>
    `;
  }

  function buildInvoiceButton(item) {
    if (item.kind === "invoice") {
      return `
        <button
          id="invoiceNavBtn"
          class="active"
          type="button"
          aria-current="page"
        >
          <i class="${escapeHtml(item.iconClass)}"></i>
          <span>${escapeHtml(item.label)}</span>
        </button>
      `;
    }

    return `
      <button
        data-nav-section="${escapeHtml(item.sectionId)}"
        type="button"
      >
        <i class="${escapeHtml(item.iconClass)}"></i>
        <span>${escapeHtml(item.label)}</span>
      </button>
    `;
  }

  function getElements() {
    return {
      sidebar: doc.getElementById("sidebar"),
      sidebarNav: doc.getElementById("sidebarNav"),
      sidebarOverlay: doc.getElementById("sidebarOverlay"),
      sidebarToggle: doc.getElementById("sidebarToggle"),
      sidebarRefreshBtn: doc.getElementById("sidebarRefreshBtn"),
      invoiceBtn: doc.getElementById("invoiceBtn"),
      invoiceNavBtn: doc.getElementById("invoiceNavBtn"),
      logoutBtn: doc.getElementById("logoutBtn"),
      sectionButtons: Array.from(
        doc.querySelectorAll(".sidebar button[data-section]"),
      ),
      navSectionButtons: Array.from(
        doc.querySelectorAll(".sidebar button[data-nav-section]"),
      ),
    };
  }

  function renderSidebar(pageType) {
    ensureShell();

    const elements = getElements();
    if (!elements.sidebarNav || !Array.isArray(app.sidebarItems)) {
      return elements;
    }

    const buttonMarkup = app.sidebarItems
      .map((item) =>
        pageType === "invoice"
          ? buildInvoiceButton(item)
          : buildDashboardButton(item),
      )
      .join("");

    elements.sidebarNav.innerHTML = `
      ${buttonMarkup}
      <button id="logoutBtn" type="button">
        <i class="fas fa-sign-out-alt"></i>
        <span>Logout</span>
      </button>
    `;

    syncFooterText();
    return getElements();
  }

  function setupSidebar(pageType, options = {}) {
    if (activeController?.destroy) {
      activeController.destroy();
      activeController = null;
    }

    if (options.render !== false) {
      renderSidebar(pageType);
    } else {
      ensureShell();
      syncFooterText();
    }

    const elements = getElements();
    const cleanups = [];
    let sidebarScrollY = 0;
    const root = doc.documentElement;
    const lockRootClass = "body-scroll-lock-root";

    const listen = (target, eventName, handler, options) => {
      if (!target || typeof target.addEventListener !== "function") {
        return;
      }

      target.addEventListener(eventName, handler, options);
      cleanups.push(() =>
        target.removeEventListener(eventName, handler, options),
      );
    };

    const isSidebarTarget = (target) =>
      target instanceof Element && Boolean(target.closest(".sidebar"));

    const unlockBodyScroll = () => {
      if (!doc.body.classList.contains("body-scroll-lock")) {
        return;
      }

      const scrollY = sidebarScrollY || 0;
      root?.classList.remove(lockRootClass);
      doc.body.classList.remove("body-scroll-lock");
      global.scrollTo(0, scrollY);
      sidebarScrollY = 0;
    };

    const lockBodyScroll = () => {
      if (
        !isMobileLayout() ||
        doc.body.classList.contains("body-scroll-lock")
      ) {
        return;
      }

      sidebarScrollY = global.scrollY || global.pageYOffset || 0;
      root?.classList.add(lockRootClass);
      doc.body.classList.add("body-scroll-lock");
    };

    const controller = {
      elements,
      close() {
        if (
          !elements.sidebar ||
          !elements.sidebarOverlay ||
          !elements.sidebarToggle
        ) {
          return;
        }

        elements.sidebar.classList.remove("sidebar--open");
        elements.sidebarOverlay.classList.remove("visible");
        elements.sidebarToggle.setAttribute("aria-expanded", "false");
        unlockBodyScroll();
        syncAndroidSidebarGestureLock(false);
      },
      open() {
        if (
          !elements.sidebar ||
          !elements.sidebarOverlay ||
          !elements.sidebarToggle
        ) {
          return;
        }

        elements.sidebar.classList.add("sidebar--open");
        elements.sidebarOverlay.classList.add("visible");
        elements.sidebarToggle.setAttribute("aria-expanded", "true");
        lockBodyScroll();
        syncAndroidSidebarGestureLock(true);
      },
      toggle() {
        if (controller.isOpen()) {
          controller.close();
        } else {
          controller.open();
        }
      },
      isOpen() {
        return Boolean(elements.sidebar?.classList.contains("sidebar--open"));
      },
      destroy() {
        controller.close();
        while (cleanups.length) {
          cleanups.pop()();
        }
      },
    };

    let touchStartY = 0;

    const handleSidebarTouchStart = (event) => {
      const touchY = event.touches?.[0]?.clientY;
      touchStartY = Number.isFinite(touchY) ? touchY : 0;
    };

    const handleSidebarTouchMove = (event) => {
      if (!controller.isOpen() || !isMobileLayout()) {
        return;
      }

      const touchY = event.touches?.[0]?.clientY;
      if (!Number.isFinite(touchY)) {
        return;
      }

      const target = event.target;
      const nav =
        target instanceof Element ? target.closest("#sidebarNav") : null;

      if (!nav) {
        event.preventDefault();
        return;
      }

      const maxScrollTop = Math.max(nav.scrollHeight - nav.clientHeight, 0);
      if (maxScrollTop === 0) {
        event.preventDefault();
        return;
      }

      const deltaY = touchY - touchStartY;
      const isPullingDownFromTop = deltaY > 0 && nav.scrollTop <= 0;
      const isPushingUpFromBottom = deltaY < 0 && nav.scrollTop >= maxScrollTop;

      if (isPullingDownFromTop || isPushingUpFromBottom) {
        event.preventDefault();
      }
    };

    const handleLockedScroll = (event) => {
      if (!controller.isOpen() || !isMobileLayout()) {
        return;
      }

      if (isSidebarTarget(event.target)) {
        return;
      }

      event.preventDefault();
    };

    listen(elements.sidebarToggle, "click", controller.toggle);
    listen(elements.sidebarOverlay, "click", controller.close);
    listen(doc, "wheel", handleLockedScroll, {
      passive: false,
    });
    listen(doc, "touchmove", handleLockedScroll, {
      passive: false,
    });
    listen(elements.sidebar, "touchstart", handleSidebarTouchStart, {
      passive: true,
    });
    listen(elements.sidebar, "touchmove", handleSidebarTouchMove, {
      passive: false,
    });
    listen(elements.sidebarOverlay, "touchmove", handleSidebarTouchMove, {
      passive: false,
    });

    const handleInvoiceSelect = () => {
      options.onInvoiceSelect?.();
      if (options.closeOnSelect !== false) {
        controller.close();
      }
    };

    const refreshCurrentPage = () => {
      const activeSectionId =
        doc.querySelector(".form-section.active")?.id ||
        global.localStorage?.getItem("activeSection") ||
        "";

      if (pageType !== "invoice" && activeSectionId) {
        global.localStorage?.setItem("activeSection", activeSectionId);
      }

      controller.close();
      global.location.reload();
    };

    listen(elements.sidebarNav, "click", (event) => {
      const button =
        event.target instanceof Element ? event.target.closest("button") : null;

      if (!button || !elements.sidebarNav?.contains(button)) {
        return;
      }

      if (button.id === "invoiceBtn" || button.id === "invoiceNavBtn") {
        handleInvoiceSelect();
        return;
      }

      if (button.id === "logoutBtn") {
        options.onLogout?.();
        return;
      }

      if (button.dataset.section) {
        options.onSectionSelect?.(button.dataset.section);
        if (options.closeOnSelect !== false) {
          controller.close();
        }
        return;
      }

      if (button.dataset.navSection) {
        options.onNavSectionSelect?.(button.dataset.navSection);
        if (options.closeOnSelect !== false) {
          controller.close();
        }
      }
    });

    listen(elements.sidebarRefreshBtn, "click", refreshCurrentPage);

    listen(global, "resize", () => {
      if (!isMobileLayout()) {
        controller.close();
      }
    });

    activeController = controller;
    syncAndroidSidebarGestureLock(false);
    return controller;
  }

  global.InventoryAppShell = {
    ensureShell,
    getElements,
    renderSidebar,
    setupSidebar,
  };
})(window);
