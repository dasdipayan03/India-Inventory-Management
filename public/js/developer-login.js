(function initDeveloperLoginPage() {
  const DEVELOPER_TOKEN_STORAGE_KEY = "developer_support_token";
  const apiBase = window.location.origin.includes("localhost")
    ? "http://localhost:4000/api"
    : "/api";

  const dom = {
    form: document.getElementById("developerLoginForm"),
    email: document.getElementById("developerEmail"),
    password: document.getElementById("developerPassword"),
    status: document.getElementById("developerStatus"),
    submit: document.getElementById("developerLoginBtn"),
    currentYear: document.getElementById("currentYear"),
  };

  function setStatus(message, tone = "info") {
    if (!dom.status) {
      return;
    }

    dom.status.textContent = message;
    dom.status.dataset.tone = tone;
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

  async function handleSubmit(event) {
    event.preventDefault();

    const email = String(dom.email?.value || "")
      .trim()
      .toLowerCase();
    const password = String(dom.password?.value || "");

    if (!email || !password) {
      setStatus("Enter the developer admin email and password.", "error");
      if (!email) {
        dom.email?.focus();
      } else {
        dom.password?.focus();
      }
      return;
    }

    const originalHtml = dom.submit?.innerHTML || "";

    try {
      if (dom.submit) {
        dom.submit.disabled = true;
        dom.submit.innerHTML =
          '<i class="fa-solid fa-spinner fa-spin"></i> Signing In...';
      }

      setStatus(
        "Checking developer credentials and opening the support inbox...",
      );

      await requestJSON("/developer-auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }).then((payload) => {
        storeDeveloperToken(payload?.token || "");
      });

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
      if (dom.submit) {
        dom.submit.disabled = false;
        dom.submit.innerHTML = originalHtml;
      }
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    if (dom.currentYear) {
      dom.currentYear.textContent = String(new Date().getFullYear());
    }

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

    dom.form?.addEventListener("submit", handleSubmit);
    checkExistingSession();
  });
})();
