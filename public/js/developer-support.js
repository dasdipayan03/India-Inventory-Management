(function initDeveloperSupportPage() {
  const apiBase = window.location.origin.includes("localhost")
    ? "http://localhost:4000/api"
    : "/api";

  const state = {
    developer: null,
    conversations: [],
    activeConversation: null,
    messages: [],
    selectedConversationId: null,
    activeFilter: "needs_reply",
    pollTimer: null,
  };

  const dom = {
    developerIdentityChip: document.getElementById("developerIdentityChip"),
    refreshInboxBtn: document.getElementById("refreshInboxBtn"),
    developerLogoutBtn: document.getElementById("developerLogoutBtn"),
    pageStatus: document.getElementById("pageStatus"),
    statTotalThreads: document.getElementById("statTotalThreads"),
    statUnreadThreads: document.getElementById("statUnreadThreads"),
    statOpenThreads: document.getElementById("statOpenThreads"),
    conversationSearch: document.getElementById("conversationSearch"),
    conversationSearchDropdown: document.getElementById(
      "conversationSearchDropdown",
    ),
    filterRow: document.getElementById("filterRow"),
    conversationList: document.getElementById("conversationList"),
    detailList: document.getElementById("detailList"),
    threadTitle: document.getElementById("threadTitle"),
    threadLead: document.getElementById("threadLead"),
    threadStatusPill: document.getElementById("threadStatusPill"),
    threadOwnerPill: document.getElementById("threadOwnerPill"),
    threadUpdatedPill: document.getElementById("threadUpdatedPill"),
    markOpenBtn: document.getElementById("markOpenBtn"),
    markClosedBtn: document.getElementById("markClosedBtn"),
    threadMessages: document.getElementById("threadMessages"),
    replyInput: document.getElementById("replyInput"),
    composerStatus: document.getElementById("composerStatus"),
    replySendBtn: document.getElementById("replySendBtn"),
    currentYear: document.getElementById("currentYear"),
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDateTime(value) {
    if (!value) {
      return "-";
    }

    return new Date(value).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    });
  }

  function formatMessageText(value) {
    return escapeHtml(value || "").replace(/\n/g, "<br />");
  }

  function setPageStatus(message, tone = "info") {
    if (!dom.pageStatus) {
      return;
    }

    dom.pageStatus.textContent = message;
    dom.pageStatus.dataset.tone = tone;
  }

  function setComposerStatus(message, tone = "info") {
    if (!dom.composerStatus) {
      return;
    }

    dom.composerStatus.textContent = message;
    dom.composerStatus.dataset.tone = tone;
  }

  function setReplyEnabled(isEnabled) {
    if (dom.replyInput) {
      dom.replyInput.disabled = !isEnabled;
    }

    if (dom.replySendBtn) {
      dom.replySendBtn.disabled = !isEnabled;
    }

    if (dom.markOpenBtn) {
      dom.markOpenBtn.disabled = !isEnabled;
    }

    if (dom.markClosedBtn) {
      dom.markClosedBtn.disabled = !isEnabled;
    }
  }

  function setRefreshInboxLoading(isLoading) {
    if (!dom.refreshInboxBtn) {
      return;
    }

    dom.refreshInboxBtn.classList.toggle("is-loading", Boolean(isLoading));
    dom.refreshInboxBtn.disabled = Boolean(isLoading);
    dom.refreshInboxBtn.setAttribute("aria-busy", isLoading ? "true" : "false");
  }

  async function requestJSON(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const requestOptions = {
      ...options,
      credentials: "include",
      headers,
      cache: "no-store",
    };

    const response = await fetch(`${apiBase}${path}`, {
      ...requestOptions,
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch (_error) {
      payload = {};
    }

    if (response.status === 401) {
      window.location.replace("developer-login.html");
      throw new Error(
        payload.error || payload.message || "Developer login required",
      );
    }

    if (!response.ok) {
      throw new Error(payload.error || payload.message || "Request failed");
    }

    return payload;
  }

  function getConversationFilters() {
    return Array.from(dom.filterRow?.querySelectorAll("[data-filter]") || []);
  }

  function renderFilterState() {
    getConversationFilters().forEach((button) => {
      button.classList.toggle(
        "is-active",
        button.dataset.filter === state.activeFilter,
      );
    });
  }

  function getSearchQuery() {
    return String(dom.conversationSearch?.value || "")
      .trim()
      .toLowerCase();
  }

  function buildConversationSearchValue(conversation) {
    return [
      conversation?.requesterName,
      conversation?.requesterIdentifier,
      conversation?.ownerName,
    ]
      .map((entry) => String(entry || "").trim())
      .filter(Boolean)
      .join(" ");
  }

  function getConversationSearchMeta(conversation) {
    const requesterMeta =
      conversation?.requesterRole === "staff"
        ? `Staff login - ${conversation?.requesterIdentifier || "username unavailable"}`
        : `Owner login - ${conversation?.requesterIdentifier || "email unavailable"}`;

    return [
      requesterMeta,
      conversation?.ownerName ? `Owner: ${conversation.ownerName}` : "",
      conversation?.lastMessageAt
        ? `Updated ${formatDateTime(conversation.lastMessageAt)}`
        : "",
    ]
      .filter(Boolean)
      .join(" | ");
  }

  function hideConversationSearchDropdown() {
    if (!dom.conversationSearchDropdown) {
      return;
    }

    dom.conversationSearchDropdown.hidden = true;
    dom.conversationSearchDropdown.innerHTML = "";
  }

  function getFilteredConversations() {
    const query = getSearchQuery();

    return state.conversations.filter((conversation) => {
      if (
        state.activeFilter === "needs_reply" &&
        !(conversation.unreadForDeveloper > 0)
      ) {
        return false;
      }

      if (state.activeFilter === "open" && conversation.status !== "open") {
        return false;
      }

      if (state.activeFilter === "closed" && conversation.status !== "closed") {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        conversation.requesterName,
        conversation.requesterIdentifier,
        conversation.ownerName,
        conversation.ownerEmail,
        conversation.lastMessageText,
        conversation.lastMessageSenderName,
      ]
        .map((entry) => String(entry || "").toLowerCase())
        .join(" ");

      return haystack.includes(query);
    });
  }

  function renderConversationSearchDropdown() {
    if (!dom.conversationSearchDropdown || !dom.conversationSearch) {
      return;
    }

    const shouldShow = document.activeElement === dom.conversationSearch;
    if (!shouldShow) {
      hideConversationSearchDropdown();
      return;
    }

    const matches = getFilteredConversations().slice(0, 8);

    if (!matches.length) {
      dom.conversationSearchDropdown.innerHTML = `
        <div class="search-dropdown__empty">
          No matching support threads for this search.
        </div>
      `;
      dom.conversationSearchDropdown.hidden = false;
      return;
    }

    dom.conversationSearchDropdown.innerHTML = matches
      .map((conversation) => {
        const isActive = conversation.id === state.selectedConversationId;

        return `
          <button
            class="search-option${isActive ? " is-active" : ""}"
            type="button"
            data-conversation-id="${escapeHtml(conversation.id)}"
          >
            <span class="search-option__title">
              ${escapeHtml(conversation.requesterName || "Unknown requester")}
            </span>
            <span class="search-option__meta">
              ${escapeHtml(getConversationSearchMeta(conversation))}
            </span>
          </button>
        `;
      })
      .join("");

    dom.conversationSearchDropdown.hidden = false;
  }

  function updateHeroStats() {
    const totalThreads = state.conversations.length;
    const unreadThreads = state.conversations.filter(
      (conversation) => Number(conversation.unreadForDeveloper) > 0,
    ).length;
    const openThreads = state.conversations.filter(
      (conversation) => conversation.status === "open",
    ).length;

    if (dom.statTotalThreads) {
      dom.statTotalThreads.textContent = String(totalThreads);
    }

    if (dom.statUnreadThreads) {
      dom.statUnreadThreads.textContent = String(unreadThreads);
    }

    if (dom.statOpenThreads) {
      dom.statOpenThreads.textContent = String(openThreads);
    }
  }

  function renderConversationList() {
    if (!dom.conversationList) {
      return;
    }

    const conversations = getFilteredConversations();

    if (!conversations.length) {
      dom.conversationList.innerHTML = `
        <div class="queue-empty">
          <i class="fa-solid fa-inbox"></i>
          <strong>No matching conversations</strong>
          <p>Adjust the filter or search term to bring a support thread back into the queue.</p>
        </div>
      `;
      return;
    }

    dom.conversationList.innerHTML = conversations
      .map((conversation) => {
        const isActive = conversation.id === state.selectedConversationId;
        const requesterMeta =
          conversation.requesterRole === "staff"
            ? `Staff login • ${conversation.requesterIdentifier || "username unavailable"}`
            : `Owner login • ${conversation.requesterIdentifier || "email unavailable"}`;
        const preview = String(
          conversation.lastMessageText || "No messages yet",
        )
          .trim()
          .slice(0, 120);
        const statusClass =
          conversation.status === "closed"
            ? "queue-status queue-status--closed"
            : "queue-status queue-status--open";
        const statusLabel =
          conversation.status === "closed" ? "Closed" : "Open";
        const unreadBadge =
          conversation.unreadForDeveloper > 0
            ? `<span class="queue-badge">${escapeHtml(
                conversation.unreadForDeveloper,
              )}</span>`
            : `<span class="${statusClass}">${escapeHtml(statusLabel)}</span>`;

        return `
          <button
            class="queue-item${isActive ? " is-active" : ""}"
            type="button"
            data-conversation-id="${escapeHtml(conversation.id)}"
          >
            <div class="queue-item__top">
              <div class="queue-item__title">
                <strong>${escapeHtml(conversation.requesterName || "Unknown requester")}</strong>
                <span>${escapeHtml(requesterMeta)}</span>
              </div>
              ${unreadBadge}
            </div>
            <p class="queue-item__preview">${escapeHtml(preview || "No preview available")}</p>
            <div class="queue-item__bottom">
              <span>${escapeHtml(conversation.ownerName || "Owner unavailable")}</span>
              <span>${escapeHtml(formatDateTime(conversation.lastMessageAt || conversation.createdAt))}</span>
            </div>
          </button>
        `;
      })
      .join("");
  }

  function renderDetailCard() {
    if (!dom.detailList) {
      return;
    }

    const conversation = state.activeConversation;

    if (!conversation) {
      dom.detailList.innerHTML = `
        <div>
          <span>Requester</span>
          <strong>Select a conversation</strong>
        </div>
        <div>
          <span>Owner Account</span>
          <strong>Conversation details will appear here</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>Waiting for selection</strong>
        </div>
      `;
      return;
    }

    const requesterLabel =
      conversation.requesterRole === "staff"
        ? `Staff login • ${conversation.requesterIdentifier || "username unavailable"}`
        : `Owner login • ${conversation.requesterIdentifier || "email unavailable"}`;
    const statusLabel =
      conversation.status === "closed"
        ? "Closed until the next user message"
        : "Open for developer reply";

    dom.detailList.innerHTML = `
      <div>
        <span>Requester</span>
        <strong>${escapeHtml(conversation.requesterName || "Unknown requester")}</strong>
        <small>${escapeHtml(requesterLabel)}</small>
      </div>
      <div>
        <span>Owner Account</span>
        <strong>${escapeHtml(conversation.ownerName || "Owner unavailable")}</strong>
        <small>${escapeHtml(conversation.ownerEmail || "No owner email available")}</small>
      </div>
      <div>
        <span>Status</span>
        <strong>${escapeHtml(statusLabel)}</strong>
        <small>Last update ${escapeHtml(formatDateTime(conversation.lastMessageAt || conversation.createdAt))}</small>
      </div>
    `;
  }

  function renderThreadEmpty() {
    if (!dom.threadMessages) {
      return;
    }

    dom.threadMessages.innerHTML = `
      <div class="thread-empty">
        <i class="fa-solid fa-comments"></i>
        <strong>No support thread selected</strong>
        <p>Choose a conversation from the queue to open the full history here.</p>
      </div>
    `;
  }

  function renderThread() {
    const conversation = state.activeConversation;

    if (!conversation) {
      if (dom.threadTitle) {
        dom.threadTitle.textContent = "Select a support conversation";
      }

      if (dom.threadLead) {
        dom.threadLead.textContent =
          "Open a thread from the queue to read the full message history and send a reply.";
      }

      if (dom.threadStatusPill) {
        dom.threadStatusPill.innerHTML = `
          <i class="fa-solid fa-circle-nodes"></i>
          No thread selected
        `;
      }

      if (dom.threadOwnerPill) {
        dom.threadOwnerPill.innerHTML = `
          <i class="fa-solid fa-building"></i>
          Owner info pending
        `;
      }

      if (dom.threadUpdatedPill) {
        dom.threadUpdatedPill.innerHTML = `
          <i class="fa-solid fa-clock"></i>
          Waiting for activity
        `;
      }

      renderThreadEmpty();
      renderDetailCard();
      setReplyEnabled(false);
      return;
    }

    const requesterLabel =
      conversation.requesterRole === "staff"
        ? `Staff login using ${conversation.requesterIdentifier || "a staff username"}`
        : `Owner login using ${conversation.requesterIdentifier || "the registered email"}`;
    const statusLabel =
      conversation.status === "closed"
        ? "Closed until the user sends again"
        : "Open for reply";

    if (dom.threadTitle) {
      dom.threadTitle.textContent =
        conversation.requesterName || "Unknown requester";
    }

    if (dom.threadLead) {
      dom.threadLead.textContent = `${requesterLabel}. This thread is private to that same login.`;
    }

    if (dom.threadStatusPill) {
      dom.threadStatusPill.innerHTML = `
        <i class="fa-solid fa-circle-nodes"></i>
        ${escapeHtml(statusLabel)}
      `;
    }

    if (dom.threadOwnerPill) {
      dom.threadOwnerPill.innerHTML = `
        <i class="fa-solid fa-building"></i>
        ${escapeHtml(conversation.ownerName || "Owner unavailable")}
      `;
    }

    if (dom.threadUpdatedPill) {
      dom.threadUpdatedPill.innerHTML = `
        <i class="fa-solid fa-clock"></i>
        Updated ${escapeHtml(formatDateTime(conversation.lastMessageAt || conversation.createdAt))}
      `;
    }

    renderDetailCard();
    setReplyEnabled(true);

    if (!dom.threadMessages) {
      return;
    }

    if (!state.messages.length) {
      renderThreadEmpty();
      return;
    }

    dom.threadMessages.innerHTML = state.messages
      .map((message) => {
        const isDeveloper = message.senderType === "developer";
        const messageClass = isDeveloper
          ? "thread-message thread-message--developer"
          : "thread-message thread-message--user";
        const senderLabel = isDeveloper
          ? message.senderName || state.developer?.name || "Developer Support"
          : message.senderName || conversation.requesterName || "User";

        return `
          <article class="${messageClass}">
            <div class="thread-message__meta">
              <strong>${escapeHtml(senderLabel)}</strong>
              <span>${escapeHtml(formatDateTime(message.createdAt))}</span>
            </div>
            <div class="thread-message__bubble">
              <p>${formatMessageText(message.text)}</p>
            </div>
          </article>
        `;
      })
      .join("");

    dom.threadMessages.scrollTop = dom.threadMessages.scrollHeight;
  }

  async function loadConversations(options = {}) {
    const data = await requestJSON("/developer-support/conversations");
    state.conversations = Array.isArray(data?.conversations)
      ? data.conversations
      : [];

    updateHeroStats();

    const filtered = getFilteredConversations();
    if (!filtered.some((item) => item.id === state.selectedConversationId)) {
      state.selectedConversationId = filtered[0]?.id || null;
    }

    renderFilterState();
    renderConversationList();
    renderConversationSearchDropdown();

    if (state.selectedConversationId && options.skipDetailLoad !== true) {
      await loadConversation(state.selectedConversationId, { silent: true });
    } else if (!state.selectedConversationId) {
      state.activeConversation = null;
      state.messages = [];
      renderThread();
    }

    return state.conversations;
  }

  async function loadConversation(conversationId, options = {}) {
    if (!conversationId) {
      state.activeConversation = null;
      state.messages = [];
      renderThread();
      renderConversationList();
      return null;
    }

    try {
      const data = await requestJSON(
        `/developer-support/conversations/${conversationId}/messages`,
      );
      state.selectedConversationId = conversationId;
      state.activeConversation = data?.conversation || null;
      state.messages = Array.isArray(data?.messages) ? data.messages : [];
      renderConversationList();
      renderConversationSearchDropdown();
      renderThread();

      if (!options.silent) {
        setPageStatus("Support thread refreshed.");
      }

      return data;
    } catch (error) {
      if (!options.silent) {
        setPageStatus(
          error.message || "Support thread could not be loaded right now.",
          "error",
        );
      }
      throw error;
    }
  }

  async function refreshInbox(options = {}) {
    const shouldAnimate = options.showRefreshAnimation === true;

    if (shouldAnimate) {
      setRefreshInboxLoading(true);
    }

    try {
      setPageStatus("Refreshing the support inbox...");
      await loadConversations();
      setPageStatus("Support inbox is up to date.", "success");
    } catch (error) {
      setPageStatus(
        error.message || "Support inbox could not be refreshed right now.",
        "error",
      );
    } finally {
      if (shouldAnimate) {
        setRefreshInboxLoading(false);
      }
    }
  }

  async function updateConversationStatus(status) {
    if (!state.selectedConversationId) {
      setComposerStatus(
        "Select a conversation before updating its status.",
        "error",
      );
      return;
    }

    try {
      await requestJSON(
        `/developer-support/conversations/${state.selectedConversationId}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        },
      );

      await loadConversations({ skipDetailLoad: true });
      await loadConversation(state.selectedConversationId, { silent: true });
      setComposerStatus(
        status === "closed"
          ? "Conversation marked closed. It will reopen when the user sends again."
          : "Conversation marked open for continued support.",
        "success",
      );
    } catch (error) {
      setComposerStatus(
        error.message || "Conversation status could not be updated right now.",
        "error",
      );
    }
  }

  async function submitReply() {
    if (!state.selectedConversationId) {
      setComposerStatus(
        "Select a conversation before sending a reply.",
        "error",
      );
      return;
    }

    const message = String(dom.replyInput?.value || "")
      .replace(/\r/g, "")
      .trim();

    if (!message) {
      setComposerStatus(
        "Write a reply before sending it to the user.",
        "error",
      );
      dom.replyInput?.focus();
      return;
    }

    if (message.length > 2000) {
      setComposerStatus("Replies can be up to 2000 characters long.", "error");
      dom.replyInput?.focus();
      return;
    }

    const originalHtml = dom.replySendBtn?.innerHTML || "";

    try {
      if (dom.replySendBtn) {
        dom.replySendBtn.disabled = true;
        dom.replySendBtn.innerHTML =
          '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';
      }

      setComposerStatus("Sending your developer reply...");

      await requestJSON(
        `/developer-support/conversations/${state.selectedConversationId}/reply`,
        {
          method: "POST",
          body: JSON.stringify({ message }),
        },
      );

      if (dom.replyInput) {
        dom.replyInput.value = "";
      }

      await loadConversations({ skipDetailLoad: true });
      await loadConversation(state.selectedConversationId, { silent: true });
      setComposerStatus(
        "Developer reply sent. The user will see it inside their private thread.",
        "success",
      );
    } catch (error) {
      setComposerStatus(
        error.message || "Developer reply could not be sent right now.",
        "error",
      );
    } finally {
      if (dom.replySendBtn) {
        dom.replySendBtn.disabled = false;
        dom.replySendBtn.innerHTML = originalHtml;
      }
    }
  }

  async function logoutDeveloper() {
    try {
      await requestJSON("/developer-auth/logout", { method: "POST" });
    } catch (_error) {
      // Redirect to login either way so the developer can recover quickly.
    } finally {
      window.location.replace("developer-login.html");
    }
  }

  async function bootstrapPage() {
    const session = await requestJSON("/developer-auth/me");
    state.developer = session?.developer || null;

    if (dom.developerIdentityChip && state.developer) {
      dom.developerIdentityChip.innerHTML = `
        <i class="fa-solid fa-user-shield"></i>
        ${escapeHtml(state.developer.name || "Developer Support")}
      `;
    }

    await loadConversations();
    setPageStatus("Support inbox is ready.");
  }

  function handleQueueClick(event) {
    const item = event.target.closest("[data-conversation-id]");
    if (!item || !dom.conversationList?.contains(item)) {
      return;
    }

    const conversationId = Number(item.dataset.conversationId);
    if (!conversationId) {
      return;
    }

    loadConversation(conversationId).catch((error) => {
      setPageStatus(
        error.message || "Support thread could not be opened right now.",
        "error",
      );
    });
  }

  function bindEvents() {
    dom.refreshInboxBtn?.addEventListener("click", () =>
      refreshInbox({ showRefreshAnimation: true }),
    );
    dom.developerLogoutBtn?.addEventListener("click", logoutDeveloper);
    dom.conversationList?.addEventListener("click", handleQueueClick);
    dom.conversationSearchDropdown?.addEventListener("click", (event) => {
      const option = event.target.closest("[data-conversation-id]");
      if (!option || !dom.conversationSearchDropdown?.contains(option)) {
        return;
      }

      const conversationId = Number(option.dataset.conversationId);
      const conversation = state.conversations.find(
        (item) => item.id === conversationId,
      );

      if (!conversationId || !conversation) {
        return;
      }

      state.selectedConversationId = conversationId;
      dom.conversationSearch.value = buildConversationSearchValue(conversation);
      renderConversationList();
      hideConversationSearchDropdown();
      loadConversation(conversationId, { silent: true }).catch((error) => {
        setPageStatus(
          error.message || "Support thread could not be opened right now.",
          "error",
        );
      });
    });
    dom.replySendBtn?.addEventListener("click", submitReply);
    dom.markOpenBtn?.addEventListener("click", () =>
      updateConversationStatus("open"),
    );
    dom.markClosedBtn?.addEventListener("click", () =>
      updateConversationStatus("closed"),
    );

    dom.replyInput?.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        submitReply();
      }
    });

    dom.conversationSearch?.addEventListener("input", () => {
      const filtered = getFilteredConversations();
      if (!filtered.some((item) => item.id === state.selectedConversationId)) {
        state.selectedConversationId = filtered[0]?.id || null;
        if (state.selectedConversationId) {
          loadConversation(state.selectedConversationId, {
            silent: true,
          }).catch(() => {});
        } else {
          state.activeConversation = null;
          state.messages = [];
          renderThread();
        }
      }
      renderConversationList();
      renderConversationSearchDropdown();
    });

    dom.conversationSearch?.addEventListener("focus", () => {
      renderConversationSearchDropdown();
    });

    dom.conversationSearch?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        hideConversationSearchDropdown();
      }
    });

    getConversationFilters().forEach((button) => {
      button.addEventListener("click", () => {
        state.activeFilter = button.dataset.filter || "all";
        renderFilterState();

        const filtered = getFilteredConversations();
        if (
          !filtered.some((item) => item.id === state.selectedConversationId)
        ) {
          state.selectedConversationId = filtered[0]?.id || null;

          if (state.selectedConversationId) {
            loadConversation(state.selectedConversationId, {
              silent: true,
            }).catch(() => {});
          } else {
            state.activeConversation = null;
            state.messages = [];
            renderThread();
          }
        }

        renderConversationList();
        renderConversationSearchDropdown();
      });
    });

    document.addEventListener("click", (event) => {
      const target = event.target;
      const insideSearch =
        target instanceof Element && Boolean(target.closest(".search-shell"));

      if (!insideSearch) {
        hideConversationSearchDropdown();
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        refreshInbox();
      }
    });

    if (!state.pollTimer) {
      state.pollTimer = window.setInterval(async () => {
        if (document.hidden) {
          return;
        }

        try {
          await loadConversations({ skipDetailLoad: true });
          if (state.selectedConversationId) {
            await loadConversation(state.selectedConversationId, {
              silent: true,
            });
          }
        } catch (_error) {
          // Quiet polling keeps the current UI stable until a manual refresh.
        }
      }, 5000);
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    if (dom.currentYear) {
      dom.currentYear.textContent = String(new Date().getFullYear());
    }

    setReplyEnabled(false);
    bindEvents();
    bootstrapPage().catch((error) => {
      setPageStatus(
        error.message || "Developer support inbox could not be initialized.",
        "error",
      );
    });
  });
})();
