(function initDeveloperLoginPage() {
  const DEVELOPER_TOKEN_STORAGE_KEY = "developer_support_token";
  const apiBase = window.location.origin.includes("localhost")
    ? "http://localhost:4000/api"
    : "/api";
  const modeCopy = {
    login: {
      title: "Developer support login",
      lead: "Sign in with the developer admin email and password stored in the database. Successful login will open the support inbox.",
      note: "If you already have an active developer session, this page will send you directly to the support inbox.",
      status:
        "Use the developer admin email and password configured for support.",
    },
    register: {
      title: "Create developer account",
      lead: "Create a new developer admin account from this page using the private setup key. After the account is created, sign in with the same email and password.",
      note: "A valid private developer setup key is required before a new developer account can be created.",
      status:
        "Enter developer details and the private setup key to create the account.",
    },
  };

  const state = {
    mode: "login",
  };

  const dom = {
    accessTitle: document.getElementById("developerAccessTitle"),
    accessLead: document.getElementById("developerAccessLead"),
    supportNote: document.getElementById("developerSupportNote"),
    status: document.getElementById("developerStatus"),
    loginModeBtn: document.getElementById("developerLoginModeBtn"),
    registerModeBtn: document.getElementById("developerRegisterModeBtn"),
    loginForm: document.getElementById("developerLoginForm"),
    loginEmail: document.getElementById("developerEmail"),
    loginPassword: document.getElementById("developerPassword"),
    loginSubmit: document.getElementById("developerLoginBtn"),
    registerForm: document.getElementById("developerRegisterForm"),
    registerName: document.getElementById("developerRegisterName"),
    registerEmail: document.getElementById("developerRegisterEmail"),
    registerPassword: document.getElementById("developerRegisterPassword"),
    registerConfirmPassword: document.getElementById(
      "developerRegisterConfirmPassword",
    ),
    registerKey: document.getElementById("developerRegisterKey"),
    registerSubmit: document.getElementById("developerRegisterBtn"),
    currentYear: document.getElementById("currentYear"),
  };

  function setStatus(message, tone = "info") {
    if (!dom.status) {
      return;
    }

    dom.status.textContent = message;
    dom.status.dataset.tone = tone;
  }

  function normalizeName(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeEmail(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function getStoredDeveloperToken() {
    try {
      return String(
        window.sessionStorage.getItem(DEVELOPER_TOKEN_STORAGE_KEY) || "",
      ).trim();
    } catch (_error) {
      return "";
    }
  }

  function storeDeveloperToken(token) {
    try {
      if (token) {
        window.sessionStorage.setItem(DEVELOPER_TOKEN_STORAGE_KEY, token);
      } else {
        window.sessionStorage.removeItem(DEVELOPER_TOKEN_STORAGE_KEY);
      }
    } catch (_error) {
      // Ignore storage failures and continue with cookie-based auth only.
    }
  }

  function clearRegisterAccessKey() {
    if (dom.registerKey) {
      dom.registerKey.value = "";
    }
  }

  function setMode(mode, options = {}) {
    const normalizedMode = mode === "register" ? "register" : "login";
    const copy = modeCopy[normalizedMode];

    state.mode = normalizedMode;

    if (dom.loginForm) {
      dom.loginForm.hidden = normalizedMode !== "login";
    }

    if (dom.registerForm) {
      dom.registerForm.hidden = normalizedMode !== "register";
    }

    if (dom.loginModeBtn) {
      const isActive = normalizedMode === "login";
      dom.loginModeBtn.classList.toggle("is-active", isActive);
      dom.loginModeBtn.setAttribute("aria-pressed", isActive ? "true" : "false");
    }

    if (dom.registerModeBtn) {
      const isActive = normalizedMode === "register";
      dom.registerModeBtn.classList.toggle("is-active", isActive);
      dom.registerModeBtn.setAttribute(
        "aria-pressed",
        isActive ? "true" : "false",
      );
    }

    if (dom.accessTitle) {
      dom.accessTitle.textContent = copy.title;
    }

    if (dom.accessLead) {
      dom.accessLead.textContent = copy.lead;
    }

    if (dom.supportNote) {
      dom.supportNote.textContent = copy.note;
    }

    if (!options.preserveStatus) {
      setStatus(copy.status);
    }

    if (normalizedMode !== "register") {
      clearRegisterAccessKey();
    }

    if (options.focusTarget && typeof options.focusTarget.focus === "function") {
      options.focusTarget.focus();
    }
  }

  async function requestJSON(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const storedToken = getStoredDeveloperToken();

    if (storedToken && !headers.Authorization) {
      headers.Authorization = `Bearer ${storedToken}`;
    }

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
      storeDeveloperToken("");
    }

    if (!response.ok) {
      throw new Error(payload.error || payload.message || "Request failed");
    }

    return payload;
  }

  async function checkExistingSession() {
    try {
      const data = await requestJSON("/developer-auth/me");
      if (data?.developer) {
        window.location.replace("developer-support.html");
      }
    } catch (_error) {
      // Stay on the login form when there is no active developer session.
    }
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();

    const email = normalizeEmail(dom.loginEmail?.value || "");
    const password = String(dom.loginPassword?.value || "");

    if (!email || !password) {
      setStatus("Enter the developer admin email and password.", "error");
      if (!email) {
        dom.loginEmail?.focus();
      } else {
        dom.loginPassword?.focus();
      }
      return;
    }

    const originalHtml = dom.loginSubmit?.innerHTML || "";

    try {
      if (dom.loginSubmit) {
        dom.loginSubmit.disabled = true;
        dom.loginSubmit.innerHTML =
          '<i class="fa-solid fa-spinner fa-spin"></i> Signing In...';
      }

      setStatus(
        "Checking developer credentials and opening the support inbox...",
      );

      const payload = await requestJSON("/developer-auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      storeDeveloperToken(payload?.token || "");
      await requestJSON("/developer-auth/me");

      setStatus(
        "Developer login successful. Redirecting to the inbox...",
        "success",
      );
      window.setTimeout(() => {
        window.location.replace("developer-support.html");
      }, 250);
    } catch (error) {
      if (
        String(error?.message || "")
          .trim()
          .toLowerCase()
          .includes("invalid developer credentials")
      ) {
        storeDeveloperToken("");
      }

      setStatus(
        error.message || "Developer login could not be completed right now.",
        "error",
      );
    } finally {
      if (dom.loginSubmit) {
        dom.loginSubmit.disabled = false;
        dom.loginSubmit.innerHTML = originalHtml;
      }
    }
  }

  async function handleRegisterSubmit(event) {
    event.preventDefault();

    const name = normalizeName(dom.registerName?.value || "");
    const email = normalizeEmail(dom.registerEmail?.value || "");
    const password = String(dom.registerPassword?.value || "");
    const confirmPassword = String(dom.registerConfirmPassword?.value || "");
    const accessKey = String(dom.registerKey?.value || "").trim();

    if (dom.registerName) {
      dom.registerName.value = name;
    }

    if (!name || !email || !password || !confirmPassword || !accessKey) {
      setStatus(
        "Enter name, email, password, confirm password, and the developer key.",
        "error",
      );

      if (!name) {
        dom.registerName?.focus();
      } else if (!email) {
        dom.registerEmail?.focus();
      } else if (!password) {
        dom.registerPassword?.focus();
      } else if (!confirmPassword) {
        dom.registerConfirmPassword?.focus();
      } else {
        dom.registerKey?.focus();
      }

      return;
    }

    if (name.length < 2) {
      setStatus("Developer name must be at least 2 characters long.", "error");
      dom.registerName?.focus();
      return;
    }

    if (password.length < 6) {
      setStatus("Password must be at least 6 characters long.", "error");
      dom.registerPassword?.focus();
      return;
    }

    if (password !== confirmPassword) {
      setStatus("Confirm password must match the password above.", "error");
      dom.registerConfirmPassword?.focus();
      return;
    }

    const originalHtml = dom.registerSubmit?.innerHTML || "";

    try {
      if (dom.registerSubmit) {
        dom.registerSubmit.disabled = true;
        dom.registerSubmit.innerHTML =
          '<i class="fa-solid fa-spinner fa-spin"></i> Creating...';
      }

      setStatus(
        "Checking the developer key and creating the account...",
      );

      const payload = await requestJSON("/developer-auth/register", {
        method: "POST",
        body: JSON.stringify({
          name,
          email,
          password,
          confirmPassword,
          accessKey,
        }),
      });

      dom.registerForm?.reset();
      clearRegisterAccessKey();

      if (dom.loginEmail) {
        dom.loginEmail.value = email;
      }

      setMode("login", {
        preserveStatus: true,
      });
      setStatus(
        payload?.message ||
          "Developer account created. Sign in with the same email and password.",
        "success",
      );
      dom.loginPassword?.focus();
    } catch (error) {
      setStatus(
        error.message ||
          "Developer account could not be created right now.",
        "error",
      );
    } finally {
      clearRegisterAccessKey();

      if (dom.registerSubmit) {
        dom.registerSubmit.disabled = false;
        dom.registerSubmit.innerHTML = originalHtml;
      }
    }
  }

  function bindPasswordToggles() {
    document.querySelectorAll("[data-toggle-password]").forEach((toggle) => {
      const targetInput = document.getElementById(toggle.dataset.togglePassword);
      const icon = toggle.querySelector("i");

      if (!targetInput || !icon) {
        return;
      }

      const syncToggleState = () => {
        const isHidden = targetInput.type === "password";
        icon.classList.toggle("fa-eye", isHidden);
        icon.classList.toggle("fa-eye-slash", !isHidden);
        toggle.classList.toggle("active", !isHidden);
        toggle.setAttribute(
          "aria-label",
          isHidden ? "Show password" : "Hide password",
        );
      };

      syncToggleState();
      toggle.addEventListener("click", () => {
        targetInput.type = targetInput.type === "password" ? "text" : "password";
        syncToggleState();
      });
    });
  }

  function bindModeSwitch() {
    dom.loginModeBtn?.addEventListener("click", () => {
      setMode("login", { focusTarget: dom.loginEmail || dom.loginPassword });
    });

    dom.registerModeBtn?.addEventListener("click", () => {
      setMode("register", {
        focusTarget: dom.registerName || dom.registerEmail,
      });
    });
  }

  window.addEventListener("DOMContentLoaded", () => {
    if (dom.currentYear) {
      dom.currentYear.textContent = String(new Date().getFullYear());
    }

    bindPasswordToggles();
    bindModeSwitch();
    setMode("login", { preserveStatus: false });

    dom.loginForm?.addEventListener("submit", handleLoginSubmit);
    dom.registerForm?.addEventListener("submit", handleRegisterSubmit);

    checkExistingSession();
  });
})();
