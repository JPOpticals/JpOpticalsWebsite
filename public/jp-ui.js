(() => {
  const ICONS = {
    search:
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>',
    close:
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>',
    eye:
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
    eyeOff:
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 3 18 18"></path><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"></path><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17.7 17.7 0 0 1-3.2 4.2"></path><path d="M6.2 6.2C3.6 7.8 2 12 2 12s3.5 7 10 7a10.7 10.7 0 0 0 4.1-.8"></path></svg>',
  };

  const ACCOUNT_KEY = "jp_local_accounts_v1";
  const SESSION_KEY = "jp_local_session_v1";

  const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (character) => {
      const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return map[character];
    });

  const normalize = (value) =>
    String(value ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const categoryText = (value) =>
    String(value ?? "").trim().replace(/^Eyeglasses$/i, "Optical");

  const transitionsLabel = "Transitions (Photochromic)";
  let activeProductVariant = null;

  const transitionsHref = (href) => {
    const [pathname, query = ""] = String(href || "/shop").split("?");
    const params = new URLSearchParams(query);
    params.set("lens", "Transitions");
    return `${pathname}?${params.toString()}`;
  };

  const productHasTransitions = (product) =>
    Array.isArray(product?.subcategoryIds)
      ? product.subcategoryIds.includes("transitions")
      : product?.transitions === true;

  const readAccounts = () => {
    try {
      const accounts = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || "[]");
      return Array.isArray(accounts) ? accounts : [];
    } catch {
      return [];
    }
  };

  const writeAccounts = (accounts) => {
    try {
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(accounts));
    } catch {
      return;
    }
  };

  const readSession = () => {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch {
      return null;
    }
  };

  const writeSession = (session) => {
    try {
      if (session) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      } else {
        localStorage.removeItem(SESSION_KEY);
      }
    } catch {
      return;
    }
  };

  const apiRequest = async (url, options = {}) => {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      const error = new Error(payload.error || `Request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return payload;
  };

  const withTimeout = (promise, milliseconds, message) =>
    new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error(message)), milliseconds);
      Promise.resolve(promise).then(
        (value) => {
          window.clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          window.clearTimeout(timer);
          reject(error);
        },
      );
    });

  let contentPromise = null;
  const loadContent = () => {
    if (!contentPromise) {
      contentPromise = apiRequest("/api/content").catch((error) => {
        console.warn("[jp-ui] content unavailable", error);
        return null;
      });
    }
    return contentPromise;
  };

  const ensureButtons = (buttons, count) => {
    if (!buttons.length || count <= 0) return buttons;
    const container = buttons[0].parentElement;
    if (!container) return buttons;
    while (buttons.length < count) {
      const clone = buttons[0].cloneNode(true);
      delete clone.dataset.jpBound;
      clone.removeAttribute("aria-current");
      const span = clone.querySelector("span");
      if (span) span.style.width = "0%";
      container.appendChild(clone);
      buttons.push(clone);
    }
    buttons.forEach((button, index) => {
      button.hidden = index >= count;
    });
    return buttons;
  };

  const moveNavigation = () => {
    const header = document.querySelector("header");
    if (!header) return;

    const nav = header.querySelector("nav");
    if (nav && !nav.classList.contains("jp-nav-relocated")) {
      header.appendChild(nav);
      nav.classList.add("jp-nav-relocated");
    }

    if (nav && !nav.querySelector('a[href="/customize"]')) {
      const template = nav.querySelector("a");
      if (template) {
        const customizeLink = template.cloneNode(false);
        customizeLink.href = "/customize";
        customizeLink.dataset.jpCustomizerNav = "true";
        customizeLink.textContent = "Customize";
        const underline = document.createElement("span");
        underline.className = "absolute inset-x-0 bottom-0 h-[2px] origin-center bg-current transition-transform duration-500 ease-luxe scale-x-0";
        customizeLink.appendChild(underline);
        const helpLink = Array.from(nav.querySelectorAll("a")).find((link) =>
          link.textContent.trim().toLowerCase() === "help",
        );
        nav.insertBefore(customizeLink, helpLink || null);
      }
    }

    header.querySelectorAll('a[href="/"]').forEach((link) => {
      if (link.textContent.trim() !== "JP") return;
      const isMobileLogo = (link.className || "").includes("lg:hidden");
      link.style.fontSize = isMobileLogo ? "24px" : "30px";
    });
  };

  const accountOverlay = document.createElement("div");
  accountOverlay.className = "jp-overlay jp-account-overlay";
  accountOverlay.setAttribute("data-jp-overlay", "account");
  accountOverlay.hidden = true;
  accountOverlay.innerHTML = `
    <div class="jp-modal jp-account-modal" role="dialog" aria-modal="true" aria-labelledby="jp-account-title">
      <div class="jp-modal-head">
        <h2 class="jp-modal-title" id="jp-account-title">Account</h2>
        <button class="jp-close" type="button" data-jp-close aria-label="Close account window">${ICONS.close}</button>
      </div>
      <div class="jp-tabs" role="tablist" aria-label="Account options">
        <button class="jp-tab is-active" type="button" role="tab" aria-selected="true" aria-controls="jp-panel-signin" id="jp-tab-signin" data-jp-tab="signin">Sign in</button>
        <button class="jp-tab" type="button" role="tab" aria-selected="false" aria-controls="jp-panel-register" id="jp-tab-register" data-jp-tab="register">Create account</button>
      </div>
      <div class="jp-modal-body">
        <div class="jp-panel" id="jp-panel-signin" role="tabpanel" aria-labelledby="jp-tab-signin" data-jp-panel="signin">
          <form data-jp-form="signin">
            <label class="jp-field">
              <span class="jp-field-label">Email</span>
              <input class="jp-input" type="email" name="email" autocomplete="email" placeholder="you@example.com" required>
            </label>
            <label class="jp-field">
              <span class="jp-field-label">Password</span>
              <span class="jp-input-wrap">
                <input class="jp-input" type="password" name="password" autocomplete="current-password" placeholder="••••••••" minlength="6" required>
                <button class="jp-eye" type="button" aria-label="Show password" data-jp-eye>${ICONS.eye}</button>
              </span>
            </label>
            <p class="jp-message" role="status" data-jp-message></p>
            <button class="jp-submit" type="submit">Sign in</button>
            <button class="jp-link" type="button" data-jp-forgot>Forgot your password?</button>
          </form>
        </div>
        <div class="jp-panel" id="jp-panel-register" role="tabpanel" aria-labelledby="jp-tab-register" data-jp-panel="register" hidden>
          <form data-jp-form="register">
            <label class="jp-field">
              <span class="jp-field-label">Full name</span>
              <input class="jp-input" type="text" name="name" autocomplete="name" placeholder="Your name" minlength="2" required>
            </label>
            <label class="jp-field">
              <span class="jp-field-label">Email</span>
              <input class="jp-input" type="email" name="email" autocomplete="email" placeholder="you@example.com" required>
            </label>
            <label class="jp-field">
              <span class="jp-field-label">Password</span>
              <span class="jp-input-wrap">
                <input class="jp-input" type="password" name="password" autocomplete="new-password" placeholder="At least 6 characters" minlength="6" required>
                <button class="jp-eye" type="button" aria-label="Show password" data-jp-eye>${ICONS.eye}</button>
              </span>
            </label>
            <p class="jp-message" role="status" data-jp-message></p>
            <button class="jp-submit" type="submit">Create account</button>
            <p class="jp-register-note">Your account is secured by JP.</p>
          </form>
        </div>
      </div>
    </div>
  `;

  const searchOverlay = document.createElement("div");
  searchOverlay.className = "jp-overlay jp-search-overlay";
  searchOverlay.setAttribute("data-jp-overlay", "search");
  searchOverlay.hidden = true;
  searchOverlay.innerHTML = `
    <div class="jp-modal jp-search-modal" role="dialog" aria-modal="true" aria-labelledby="jp-search-title">
      <form class="jp-search-head" data-jp-search-form>
        ${ICONS.search}
        <input class="jp-search-input" id="jp-search-title" type="search" placeholder="Search sunglasses, optical, brands..." autocomplete="off" aria-label="Search products and brands">
        <button class="jp-close" type="button" data-jp-close aria-label="Close search">${ICONS.close}</button>
      </form>
      <div class="jp-search-body">
        <p class="jp-search-kicker" data-jp-search-kicker>Popular searches</p>
        <div class="jp-search-results" data-jp-search-results></div>
      </div>
      <div class="jp-search-foot">Enter to open top result &middot; Esc to close</div>
    </div>
  `;

  const menuArticles = Array.from(
    document.querySelectorAll("header nav a"),
  ).flatMap((link) => {
    const href = link.getAttribute("href") || "/";
    const label = categoryText(link.textContent);
    if (href === "/shop" || href.startsWith("/lenses/")) return [];
    const item = `<a class="jp-menu-link" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
    if (!/^(Sunglasses|Optical)$/i.test(label)) return [item];
    return [
      item,
      `<a class="jp-menu-link jp-menu-sub" href="${escapeHtml(transitionsHref(href))}">${transitionsLabel}</a>`,
    ];
  });

  const menuOverlay = document.createElement("div");
  menuOverlay.className = "jp-overlay jp-menu-overlay";
  menuOverlay.setAttribute("data-jp-overlay", "menu");
  menuOverlay.hidden = true;
  menuOverlay.innerHTML = `
    <div class="jp-menu-panel" role="dialog" aria-modal="true" aria-labelledby="jp-menu-title">
      <div class="jp-menu-head">
        <span class="jp-menu-brand" id="jp-menu-title">JP</span>
        <button class="jp-close" type="button" data-jp-close aria-label="Close menu">${ICONS.close}</button>
      </div>
      <nav class="jp-menu-nav" aria-label="Mobile navigation">
        ${menuArticles.join("")}
      </nav>
      <div class="jp-menu-foot">
        <button class="jp-menu-account" type="button" data-jp-menu-account>Account</button>
        <a class="jp-menu-account" href="/cart">Shopping bag</a>
      </div>
    </div>
  `;

  document.body.appendChild(accountOverlay);
  document.body.appendChild(searchOverlay);
  document.body.appendChild(menuOverlay);

  const accountButton = document.querySelector('button[aria-label="Login"]');
  const searchButton = document.querySelector('button[aria-label="Search"]');
  const menuButton = document.querySelector('button[aria-label="Open menu"]');
  const searchInput = searchOverlay.querySelector(".jp-search-input");
  const searchResults = searchOverlay.querySelector(
    "[data-jp-search-results]",
  );
  const searchKicker = searchOverlay.querySelector(
    "[data-jp-search-kicker]",
  );

  let indexPromise = null;
  let searchIndex = null;
  let visibleResults = [];
  let activeOverlay = null;
  let previousFocus = null;
  let searchTimer = null;
  let pdpOverlay = null;
  let pdpModalCleanup = null;

  const lockPage = () => {
    document.documentElement.classList.add("jp-lock");
    document.body.classList.add("jp-lock");
  };

  const unlockPage = () => {
    if (
      accountOverlay.hidden &&
      searchOverlay.hidden &&
      menuOverlay.hidden &&
      (!pdpOverlay || pdpOverlay.hidden)
    ) {
      document.documentElement.classList.remove("jp-lock");
      document.body.classList.remove("jp-lock");
    }
  };

  const openOverlay = (overlay) => {
    previousFocus = document.activeElement;
    activeOverlay = overlay;
    overlay.hidden = false;
    lockPage();
  };

  const closeOverlay = (overlay) => {
    overlay.hidden = true;
    if (overlay === pdpOverlay) {
      pdpModalCleanup?.();
      pdpModalCleanup = null;
    }
    if (overlay === searchOverlay && searchButton) {
      searchButton.setAttribute("aria-expanded", "false");
    }
    if (overlay === menuOverlay && menuButton) {
      menuButton.setAttribute("aria-expanded", "false");
    }
    if (activeOverlay === overlay) activeOverlay = null;
    unlockPage();
    if (previousFocus instanceof HTMLElement) {
      previousFocus.focus({ preventScroll: true });
      previousFocus = null;
    }
  };

  const setTab = (name) => {
    accountOverlay.querySelectorAll("[data-jp-tab]").forEach((tab) => {
      const active = tab.dataset.jpTab === name;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    accountOverlay.querySelectorAll("[data-jp-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.jpPanel !== name;
    });
  };

  const setMessage = (formName, message, tone = "") => {
    const messageElement = accountOverlay.querySelector(
      `[data-jp-form="${formName}"] [data-jp-message]`,
    );
    if (!messageElement) return;
    messageElement.textContent = message;
    messageElement.classList.remove("is-success", "is-error");
    if (tone) messageElement.classList.add(`is-${tone}`);
  };

  const updateAccountButton = () => {
    if (!accountButton) return;
    const session = readSession();
    accountButton.setAttribute(
      "aria-label",
      session?.name ? `Account: ${session.name}` : "Login",
    );
  };

  const openAccount = () => {
    if (!searchOverlay.hidden) closeOverlay(searchOverlay);
    if (!menuOverlay.hidden) closeOverlay(menuOverlay);
    setTab("signin");
    openOverlay(accountOverlay);
    setMessage("signin", "");
    setMessage("register", "");
    const session = readSession();
    if (session?.email) {
      const emailInput = accountOverlay.querySelector(
        '[data-jp-form="signin"] input[name="email"]',
      );
      if (emailInput && !emailInput.value) emailInput.value = session.email;
    }
    window.setTimeout(() => {
      accountOverlay
        .querySelector(
          '[data-jp-panel="signin"]:not([hidden]) input, [data-jp-panel="register"]:not([hidden]) input',
        )
        ?.focus({ preventScroll: true });
    }, 40);
  };

  const openSearch = () => {
    if (!accountOverlay.hidden) closeOverlay(accountOverlay);
    if (!menuOverlay.hidden) closeOverlay(menuOverlay);
    openOverlay(searchOverlay);
    window.setTimeout(() => searchInput.focus({ preventScroll: true }), 40);
    loadIndex().then(() => {
      if (!searchOverlay.hidden) runSearch(searchInput.value);
    });
  };

  const openMenu = () => {
    if (!accountOverlay.hidden) closeOverlay(accountOverlay);
    if (!searchOverlay.hidden) closeOverlay(searchOverlay);
    openOverlay(menuOverlay);
    window.setTimeout(() => {
      menuOverlay
        .querySelector('[data-jp-close]')
        ?.focus({ preventScroll: true });
    }, 40);
  };

  const formatMoney = (value) => value || "";

  const resultHtml = (item) =>
    `<a class="jp-search-result" href="${escapeHtml(item.url)}">
      <img class="jp-search-thumb" src="${escapeHtml(item.image || "/mirror-assets/placeholder.svg")}" alt="" loading="eager" decoding="async">
      <span class="jp-search-copy">
        <span class="jp-search-name">${escapeHtml(item.name)}</span>
        <span class="jp-search-meta">${escapeHtml(item.brand)}${item.brand && item.type ? " &middot; " : ""}${escapeHtml(item.type)}</span>
      </span>
      <span class="jp-search-price">${escapeHtml(formatMoney(item.price))}</span>
    </a>`;

  const popularHtml = () => `
    <div class="jp-chips">
      ${["Sunglasses", "Optical", transitionsLabel, "Cartier"]
        .map(
          (label) =>
            `<button class="jp-chip" type="button" data-jp-chip="${escapeHtml(label)}">${escapeHtml(label)}</button>`,
        )
        .join("")}
    </div>
  `;

  const loadIndex = () => {
    if (!indexPromise) {
      indexPromise = withTimeout(
        apiRequest("/api/catalog", { cache: "no-store" }),
        2200,
        "Catalog request timed out",
      )
        .then((data) => {
          if (!Array.isArray(data.products)) throw new Error("Catalog unavailable");
          searchIndex = data;
          return data;
        })
        .catch(() =>
          withTimeout(
            fetch("/search-index.json", { cache: "no-store" }).then((response) => {
              if (!response.ok) throw new Error("Search index unavailable");
              return response.json();
            }),
            1200,
            "Search index request timed out",
          ).then((data) => {
            searchIndex = data;
            return data;
          }),
        )
        .catch(() => {
          searchIndex = { products: [], collections: [] };
          return searchIndex;
        });
    }
    return indexPromise;
  };

  const runSearch = (query) => {
    const value = query.trim();
    if (!value) {
      visibleResults = [];
      searchKicker.textContent = "Popular searches";
      searchResults.innerHTML = popularHtml();
      return;
    }

    if (!searchIndex) {
      searchKicker.textContent = "Search";
      searchResults.innerHTML =
        '<p class="jp-search-empty">Loading the local catalog...</p>';
      return;
    }

    const normalizedQuery = normalize(value);
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    const items = [
      ...(searchIndex.products || []),
      ...(searchIndex.collections || []),
    ];
    const scored = [];

    for (const item of items) {
      const name = normalize(item.name);
      const haystack = normalize(item.search);
      let score = 0;

      if (name === normalizedQuery) score += 100;
      else if (name.startsWith(normalizedQuery)) score += 65;
      else if (name.includes(normalizedQuery)) score += 40;

      for (const token of tokens) {
        if (!haystack.includes(token)) {
          score = -1;
          break;
        }
        score += haystack.startsWith(token) ? 12 : 6;
      }

      if (score > 0) scored.push({ item, score });
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.item.name.localeCompare(b.item.name);
    });

    visibleResults = scored.slice(0, 8).map((entry) => entry.item);
    searchKicker.textContent = visibleResults.length
      ? `${visibleResults.length} result${visibleResults.length === 1 ? "" : "s"}`
      : "Search";

    if (!visibleResults.length) {
      searchResults.innerHTML = `<p class="jp-search-empty">No matches for &ldquo;${escapeHtml(value)}&rdquo;. Try a brand, model, or frame type.</p>`;
      return;
    }

    searchResults.innerHTML = visibleResults.map(resultHtml).join("");
  };

  const submitAccountForm = async (form) => {
    const formName = form.dataset.jpForm;
    const data = new FormData(form);
    const email = String(data.get("email") || "").trim().toLowerCase();
    const password = String(data.get("password") || "");
    const name =
      String(data.get("name") || "").trim() ||
      email.split("@")[0] ||
      "Account";

    if (formName === "register") {
      setMessage("register", "Creating your account…");
      try {
        const result = await apiRequest("/api/accounts/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });
        writeSession({
          id: result.user.id,
          name: result.user.fullName,
          email: result.user.email,
          role: result.user.role,
        });
        updateAccountButton();
        setMessage("register", `Account created for ${email}.`, "success");
        window.setTimeout(() => {
          if (!accountOverlay.hidden) closeOverlay(accountOverlay);
        }, 1100);
      } catch (error) {
        if (error.status !== 503) {
          setMessage("register", error.message || "Could not create the account.", "error");
          return;
        }
        const accounts = readAccounts();
        const existing = accounts.find((account) => account.email === email);
        if (existing) existing.name = name;
        else accounts.push({ name, email });
        writeAccounts(accounts);
        writeSession({ name, email });
        updateAccountButton();
        setMessage("register", `Account created for ${email}.`, "success");
        window.setTimeout(() => {
          if (!accountOverlay.hidden) closeOverlay(accountOverlay);
        }, 1100);
      }
      return;
    }

    setMessage("signin", "Signing in…");
    try {
      const result = await apiRequest("/api/accounts/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      writeSession({
        id: result.user.id,
        name: result.user.fullName,
        email: result.user.email,
        role: result.user.role,
      });
      updateAccountButton();
      setMessage("signin", `Signed in as ${result.user.fullName}.`, "success");
      window.setTimeout(() => {
        if (!accountOverlay.hidden) closeOverlay(accountOverlay);
      }, 1100);
    } catch (error) {
      if (error.status !== 503) {
        setMessage("signin", error.message || "Email or password is incorrect.", "error");
        return;
      }
      const account = readAccounts().find((entry) => entry.email === email);
      const sessionName = account?.name || name;
      writeSession({ name: sessionName, email });
      updateAccountButton();
      setMessage("signin", `Signed in locally as ${sessionName}.`, "success");
      window.setTimeout(() => {
        if (!accountOverlay.hidden) closeOverlay(accountOverlay);
      }, 1100);
    }
  };

  moveNavigation();

  if (accountButton) {
    accountButton.classList.add("jp-account-button");
    accountButton.addEventListener("click", openAccount);
  }

  if (searchButton) {
    searchButton.setAttribute("aria-haspopup", "dialog");
    searchButton.setAttribute("aria-expanded", "false");
    searchButton.addEventListener("click", () => {
      searchButton.setAttribute("aria-expanded", "true");
      openSearch();
    });
  }

  if (menuButton) {
    menuButton.setAttribute("aria-haspopup", "dialog");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.addEventListener("click", () => {
      menuButton.setAttribute("aria-expanded", "true");
      openMenu();
    });
  }

  updateAccountButton();

  apiRequest("/api/accounts/me")
    .then((result) => {
      if (result.user) {
        writeSession({
          id: result.user.id,
          name: result.user.fullName,
          email: result.user.email,
          role: result.user.role,
        });
      } else if (result.configured) {
        writeSession(null);
      }
      updateAccountButton();
    })
    .catch(() => {});

  accountOverlay
    .querySelectorAll("[data-jp-tab]")
    .forEach((tab) =>
      tab.addEventListener("click", () => setTab(tab.dataset.jpTab)),
    );

  accountOverlay.querySelectorAll("[data-jp-close]").forEach((button) => {
    button.addEventListener("click", () => closeOverlay(accountOverlay));
  });

  accountOverlay.querySelectorAll("[data-jp-eye]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = button
        .closest(".jp-input-wrap")
        ?.querySelector('input[type="password"], input[type="text"]');
      if (!input) return;
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      button.setAttribute("aria-label", showing ? "Show password" : "Hide password");
      button.innerHTML = showing ? ICONS.eye : ICONS.eyeOff;
    });
  });

  accountOverlay
    .querySelectorAll("[data-jp-form]")
    .forEach((form) =>
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        submitAccountForm(form);
      }),
    );

  accountOverlay
    .querySelector("[data-jp-forgot]")
    ?.addEventListener("click", () => {
      setMessage(
        "signin",
        "Password recovery is not available yet. Please contact customer care.",
        "error",
      );
    });

  searchOverlay.querySelectorAll("[data-jp-close]").forEach((button) => {
    button.addEventListener("click", () => closeOverlay(searchOverlay));
  });

  menuOverlay.querySelectorAll("[data-jp-close]").forEach((button) => {
    button.addEventListener("click", () => closeOverlay(menuOverlay));
  });

  menuOverlay.querySelectorAll(".jp-menu-link").forEach((link) => {
    link.addEventListener("click", () => closeOverlay(menuOverlay));
  });

  menuOverlay
    .querySelector("[data-jp-menu-account]")
    ?.addEventListener("click", openAccount);

  searchInput.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => runSearch(searchInput.value), 80);
  });

  searchOverlay
    .querySelector("[data-jp-search-form]")
    .addEventListener("submit", (event) => {
      event.preventDefault();
      if (visibleResults.length) {
        window.location.href = visibleResults[0].url;
      } else if (searchInput.value.trim()) {
        runSearch(searchInput.value);
      }
    });

  searchResults.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-jp-chip]");
    if (!chip) return;
    searchInput.value = chip.dataset.jpChip || "";
    runSearch(searchInput.value);
    searchInput.focus({ preventScroll: true });
  });

  [accountOverlay, searchOverlay, menuOverlay].forEach((overlay) => {
    overlay.addEventListener("mousedown", (event) => {
      if (event.target === overlay) closeOverlay(overlay);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && activeOverlay) {
      if (activeOverlay === searchOverlay && searchButton) {
        searchButton.setAttribute("aria-expanded", "false");
      }
      closeOverlay(activeOverlay);
      return;
    }

    if (event.key !== "Tab" || !activeOverlay) return;
    const focusable = Array.from(
      activeOverlay.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  const showToast = (message) => {
    let toast = document.querySelector(".jp-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "jp-toast";
      toast.setAttribute("role", "status");
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(Number(toast.dataset.timeout || 0));
    toast.dataset.timeout = String(
      window.setTimeout(() => {
        toast.hidden = true;
      }, 2600),
    );
  };

  const readCart = () => {
    try {
      const cart = JSON.parse(localStorage.getItem("jp_local_cart_v1") || "[]");
      return Array.isArray(cart) ? cart : [];
    } catch {
      return [];
    }
  };

  const writeCart = (cart) => {
    try {
      localStorage.setItem("jp_local_cart_v1", JSON.stringify(cart));
    } catch {
      return;
    }
  };

  const updateCartBadge = () => {
    const count = readCart().reduce((total, item) => total + Number(item.quantity || 0), 0);
    document.querySelectorAll('a[aria-label="Cart"]').forEach((link) => {
      let badge = link.querySelector(".jp-cart-count");
      if (count === 0) {
        badge?.remove();
        return;
      }
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "jp-cart-count";
        link.appendChild(badge);
      }
      badge.textContent = String(count);
    });
  };

  const customizerMoney = (value, currency = "USD") => {
    const amount = Number(value || 0);
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency || "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Number.isFinite(amount) ? amount : 0);
    } catch {
      return `$${Number.isFinite(amount) ? amount.toFixed(2) : "0.00"}`;
    }
  };

  const customizerColor = (value, fallback = "#d6d1ca") => {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{3,8}$/i.test(color) || /^[a-z]+$/i.test(color) ? color : fallback;
  };

  const customizerStyle = (value) => {
    const normalized = normalize(value);
    if (normalized.includes("round") || normalized.includes("cat eye")) return "round";
    if (normalized.includes("aviator")) return "aviator";
    return "square";
  };

  const customizerAssetUrl = (value) => {
    const url = String(value || "").trim();
    return /^(?:https?:\/\/|\/)(?!\/)/i.test(url) ? url : "";
  };

  const customizerNumber = (value, fallback, minimum, maximum) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(maximum, Math.max(minimum, number));
  };

  const customizerPreviewGeometry = (frame) => {
    const metadata = frame?.metadata && typeof frame.metadata === "object" ? frame.metadata : null;
    const preview = metadata?.preview && typeof metadata.preview === "object" ? metadata.preview : null;
    const geometry = preview?.lensGeometry || metadata?.lensGeometry;
    if (!geometry || typeof geometry !== "object") return null;

    const pane = (value, fallback) => {
      const source = value && typeof value === "object" ? value : {};
      return {
        x: customizerNumber(source.x, fallback.x, 0, 100),
        y: customizerNumber(source.y, fallback.y, 0, 100),
        width: customizerNumber(source.width, fallback.width, 1, 100),
        height: customizerNumber(source.height, fallback.height, 1, 100),
        rotate: customizerNumber(source.rotate, fallback.rotate, -45, 45),
      };
    };

    return {
      left: pane(geometry.left, { x: 17, y: 39, width: 31, height: 25, rotate: 0 }),
      right: pane(geometry.right, { x: 52, y: 39, width: 31, height: 25, rotate: 0 }),
    };
  };

  const customizerUuid = (value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));

  const customizerPreview = (frame, lens, compact = false) => {
    const frameImageUrl = customizerAssetUrl(frame?.imageUrl) || "/mirror-assets/placeholder.svg";
    const frameImage = escapeHtml(frameImageUrl);
    const frameName = escapeHtml(frame?.name || "JP frame");
    const lensColor = customizerColor(lens?.colorCode);
    const opacity = Math.min(0.82, Math.max(0.12, Number(lens?.tintOpacity) || 0.2));
    const maskUrl = customizerAssetUrl(frame?.lensMaskUrl);
    const geometry = customizerPreviewGeometry(frame);
    const previewLayer = maskUrl
      ? `<div class="jp-customizer__lens-mask" data-jp-lens-mask-url="${escapeHtml(maskUrl)}" aria-hidden="true"></div>`
      : geometry
        ? `<div class="jp-customizer__lens-layer jp-customizer__lens-layer--${customizerStyle(frame?.style)}" aria-hidden="true">
            <span style="--pane-x:${geometry.left.x}%;--pane-y:${geometry.left.y}%;--pane-width:${geometry.left.width}%;--pane-height:${geometry.left.height}%;--pane-rotate:${geometry.left.rotate}deg"></span>
            <span style="--pane-x:${geometry.right.x}%;--pane-y:${geometry.right.y}%;--pane-width:${geometry.right.width}%;--pane-height:${geometry.right.height}%;--pane-rotate:${geometry.right.rotate}deg"></span>
          </div>`
        : `<div class="jp-customizer__image-tint" data-jp-frame-image-url="${escapeHtml(frameImageUrl)}" aria-hidden="true"></div>`;
    return `<div class="jp-customizer__stage${compact ? " is-compact" : ""}" style="--lens-color:${lensColor};--lens-opacity:${opacity}">
      <div class="jp-customizer__artboard">${previewLayer}<img src="${frameImage}" alt="${frameName} with ${escapeHtml(lens?.name || "selected lens")}" loading="${compact ? "lazy" : "eager"}"></div>
    </div>`;
  };

  const applyCustomizerPreviewMasks = (root) => {
    root.querySelectorAll("[data-jp-lens-mask-url], [data-jp-frame-image-url]").forEach((element) => {
      const url = customizerAssetUrl(element.dataset.jpLensMaskUrl || element.dataset.jpFrameImageUrl);
      if (!url) return;
      const safeUrl = url.replace(/["\\\r\n]/g, "");
      const mask = `url("${safeUrl}")`;
      element.style.maskImage = mask;
      element.style.webkitMaskImage = mask;
    });
  };

  const customizerCartPreview = (item) => {
    const customization = item?.customizer;
    if (!customization || typeof customization !== "object") {
      return `<img src="${escapeHtml(item?.image || "/mirror-assets/placeholder.svg")}" alt="${escapeHtml(item?.name || "Product")}">`;
    }
    const legacyLensColors = {
      amber: "#c28b55",
      graphite: "#53616b",
      ice: "#9ed5e7",
      "ice blue": "#9ed5e7",
      olive: "#65715d",
      smoke: "#6e777b",
    };
    const legacyLensColor = normalize(customization.lensColor);
    const frame = {
      id: customization.frameId || customization.frameName || "selected-frame",
      name: customization.frameName || item.name || "Selected frame",
      imageUrl: customization.frameImageUrl || item.image || null,
      lensMaskUrl: customization.frameLensMaskUrl || null,
      style: customization.frameStyle || "Classic",
      frameType: customization.frameType || "Eyewear",
      material: customization.frameMaterial || "",
      color: customization.frameColor || "",
      colorCode: customization.frameColorCode || "",
      metadata: customization.frameMetadata || null,
    };
    const lens = {
      name: customization.lensName || "Selected lens",
      color: customization.lensColor || "Clear",
      colorCode: customization.lensColorCode || legacyLensColors[legacyLensColor] || "#e8eef1",
      tintOpacity: customization.lensOpacity || (legacyLensColor === "amber" ? 0.52 : 0.2),
      style: customization.lensStyle || "Classic",
    };
    return customizerPreviewPro(frame, lens, customization, true);
  };

  const setupProductCustomizer = () => {
    const isStandalone = window.location.pathname === "/customize";
    if (!isStandalone || document.querySelector(".jp-customizer")) return;
    const productId = Number(new URLSearchParams(window.location.search).get("productId") || 0);
    const host = document.querySelector("[data-jp-customizer-page]");
    if (!host) return;

    const customizer = document.createElement("section");
    customizer.className = "jp-customizer jp-customizer--standalone";
    customizer.setAttribute("aria-labelledby", "jp-customizer-title");
    customizer.innerHTML = '<div class="jp-customizer__loading">Loading frame and lens options…</div>';
    host.appendChild(customizer);

    const state = {
      frameId: "",
      lensId: "",
      frameType: "All",
      frameStyle: "All",
      showAllFrames: false,
      comparisons: [],
    };
    let customizerData = null;

    const render = (data) => {
      const frames = Array.isArray(data.frames) ? data.frames : [];
      const allLenses = Array.isArray(data.lenses) ? data.lenses : [];
      if (!frames.length || !allLenses.length) {
        customizer.innerHTML = '<p class="jp-customizer__error">Customization options are not available right now. Please try again shortly.</p>';
        return;
      }

      if (!state.frameId || !frames.some((frame) => String(frame.id) === state.frameId)) {
        state.frameId = String(frames.find((frame) => Number(frame.productId) === productId)?.id || frames[0].id);
      }
      const frame = frames.find((item) => String(item.id) === state.frameId) || frames[0];
      const compatibleIds = Array.isArray(data.compatibility?.[frame.id]) ? data.compatibility[frame.id] : [];
      const lenses = compatibleIds.length
        ? allLenses.filter((lens) => compatibleIds.includes(String(lens.id)))
        : allLenses;
      if (!lenses.length) {
        customizer.innerHTML = '<p class="jp-customizer__error">This frame has no compatible lenses yet.</p>';
        return;
      }
      if (!state.lensId || !lenses.some((lens) => String(lens.id) === state.lensId)) state.lensId = String(lenses[0].id);
      const lens = lenses.find((item) => String(item.id) === state.lensId) || lenses[0];
      const frameTypes = ["All", ...new Set(frames.map((item) => String(item.frameType || "Eyewear")))];
      const frameStyles = ["All", ...new Set(frames.map((item) => String(item.style || "Classic")))];
      if (!frameTypes.includes(state.frameType)) state.frameType = "All";
      if (!frameStyles.includes(state.frameStyle)) state.frameStyle = "All";
      const visibleFrames = frames
        .filter((item) => state.frameType === "All" || String(item.frameType) === state.frameType)
        .filter((item) => state.frameStyle === "All" || String(item.style) === state.frameStyle);
      const cards = (state.showAllFrames ? visibleFrames : visibleFrames.slice(0, 8))
        .map((item) => {
          const selected = String(item.id) === String(frame.id);
          const color = customizerColor(item.colorCode);
          return `<button type="button" class="jp-customizer__option${selected ? " is-selected" : ""}" data-jp-customizer-frame="${escapeHtml(item.id)}" aria-pressed="${selected}">
            <span class="jp-customizer__option-image"><img src="${escapeHtml(item.imageUrl || "/mirror-assets/placeholder.svg")}" alt="" loading="lazy"></span>
            <span class="jp-customizer__option-name">${escapeHtml(item.name)}</span>
            <span class="jp-customizer__option-meta">${escapeHtml(item.style || "Classic")} · ${escapeHtml(item.frameType || "Eyewear")}</span>
            <span class="jp-customizer__swatch" style="--swatch:${color}" aria-label="${escapeHtml(item.color || "Frame color")}"></span>
          </button>`;
        })
        .join("");
      const lensCards = lenses
        .map((item) => {
          const selected = String(item.id) === String(lens.id);
          const color = customizerColor(item.colorCode);
          return `<button type="button" class="jp-customizer__lens-option${selected ? " is-selected" : ""}" data-jp-customizer-lens="${escapeHtml(item.id)}" aria-pressed="${selected}">
            <span class="jp-customizer__lens-swatch" style="--swatch:${color};--lens-opacity:${Math.min(0.82, Math.max(0.12, Number(item.tintOpacity) || 0.2))}" aria-hidden="true"></span>
            <span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.lensType)} · ${escapeHtml(item.style)}</small></span>
            <span class="jp-customizer__lens-price">${item.price ? `+${escapeHtml(customizerMoney(item.price, item.currency))}` : "Included"}</span>
          </button>`;
        })
        .join("");
      const total = Number(frame.price || 0) + Number(lens.price || 0);
      const headingTag = isStandalone ? "h1" : "h2";
      const comparisonMarkup = state.comparisons.length
        ? `<div class="jp-customizer__comparison" aria-label="Saved combinations"><div class="jp-customizer__subhead"><span>Compare combinations</span><small>${state.comparisons.length}/3 saved</small></div><div class="jp-customizer__comparison-grid">${state.comparisons
            .map(
              (item, index) => `<article class="jp-customizer__comparison-card"><button type="button" class="jp-customizer__remove" data-jp-customizer-remove="${index}" aria-label="Remove comparison">Remove</button>${customizerPreview(item.frame, item.lens, true)}<strong>${escapeHtml(item.frame.name)}</strong><small>${escapeHtml(item.lens.name)} · ${escapeHtml(customizerMoney(item.total, item.frame.currency || "USD"))}</small></article>`,
            )
            .join("")}</div></div>`
        : "";

      customizer.innerHTML = `<div class="jp-customizer__head"><div><${headingTag} id="jp-customizer-title">Build your pair</${headingTag}><p>Choose a frame, then make it yours with a lens that changes the look.</p></div><span class="jp-customizer__live">Live preview</span></div>
        <div class="jp-customizer__layout">
          <div class="jp-customizer__visual"><div class="jp-customizer__visual-label"><span>Now viewing</span><strong>${escapeHtml(frame.name)}</strong></div>${customizerPreview(frame, lens)}<div class="jp-customizer__visual-foot"><span>${escapeHtml(lens.name)}</span><strong>${escapeHtml(customizerMoney(total, frame.currency || lens.currency || "USD"))}</strong></div></div>
          <div class="jp-customizer__controls">
            <div class="jp-customizer__section"><div class="jp-customizer__subhead"><span>1 / Frame</span><small>${visibleFrames.length} available</small></div><div class="jp-customizer__filters"><label>Type<select data-jp-customizer-frame-type>${frameTypes.map((value) => `<option value="${escapeHtml(value)}"${value === state.frameType ? " selected" : ""}>${escapeHtml(value)}</option>`).join("")}</select></label><label>Style<select data-jp-customizer-frame-style>${frameStyles.map((value) => `<option value="${escapeHtml(value)}"${value === state.frameStyle ? " selected" : ""}>${escapeHtml(value)}</option>`).join("")}</select></label></div><div class="jp-customizer__options">${cards || '<p class="jp-customizer__empty">No frames match these filters.</p>'}</div>${visibleFrames.length > 8 ? `<button type="button" class="jp-customizer__show-more" data-jp-customizer-show-all>${state.showAllFrames ? "Show fewer frames" : `View all ${visibleFrames.length} frames`}</button>` : ""}</div>
            <div class="jp-customizer__section"><div class="jp-customizer__subhead"><span>2 / Lens</span><small>${lenses.length} compatible</small></div><div class="jp-customizer__lens-options">${lensCards}</div></div>
            <div class="jp-customizer__actions"><button type="button" class="jp-customizer__compare" data-jp-customizer-compare${state.comparisons.length >= 3 ? " disabled" : ""}>${state.comparisons.length >= 3 ? "Comparison saved" : "Save to compare"}</button><button type="button" class="jp-customizer__add" data-jp-customizer-add>Add pair to bag <span>${escapeHtml(customizerMoney(total, frame.currency || lens.currency || "USD"))}</span></button></div>
            ${comparisonMarkup}
          </div>
        </div>`;
      applyCustomizerPreviewMasks(customizer);
    };

    customizer.addEventListener("click", (event) => {
      const target = event.target.closest("[data-jp-customizer-frame], [data-jp-customizer-lens], [data-jp-customizer-show-all], [data-jp-customizer-compare], [data-jp-customizer-remove], [data-jp-customizer-add]");
      if (!target) return;
      if (target.dataset.jpCustomizerFrame) state.frameId = target.dataset.jpCustomizerFrame;
      if (target.dataset.jpCustomizerLens) state.lensId = target.dataset.jpCustomizerLens;
      if (target.hasAttribute("data-jp-customizer-show-all")) state.showAllFrames = !state.showAllFrames;
      if (target.dataset.jpCustomizerRemove !== undefined) state.comparisons.splice(Number(target.dataset.jpCustomizerRemove), 1);
      if (target.hasAttribute("data-jp-customizer-compare")) {
        const frame = customizerData?.frames.find((item) => String(item.id) === state.frameId);
        const lens = customizerData?.lenses.find((item) => String(item.id) === state.lensId);
        if (frame && lens && state.comparisons.length < 3) {
          state.comparisons.push({ frame, lens, total: Number(frame.price || 0) + Number(lens.price || 0) });
          showToast("Combination saved for comparison");
        }
      }
      if (target.hasAttribute("data-jp-customizer-add")) {
        const frame = customizerData?.frames.find((item) => String(item.id) === state.frameId);
        const lens = customizerData?.lenses.find((item) => String(item.id) === state.lensId);
        if (!frame || !lens) return;
        const total = Number(frame.price || 0) + Number(lens.price || 0);
        const url = frame.productUrl || (productId ? `/product/${productId}` : "/shop");
        const cart = readCart();
        const existing = cart.find((item) => item.url === url && item.customizer?.frameId === frame.id && item.customizer?.lensId === lens.id);
        if (existing) existing.quantity = Number(existing.quantity || 0) + 1;
        else cart.push({
          name: `${frame.name} / ${lens.name}`,
          url,
          quantity: 1,
          image: frame.imageUrl || "",
          price: customizerMoney(total, frame.currency || lens.currency || "USD"),
          priceValue: total,
          customizer: {
            frameId: frame.id,
            frameName: frame.name,
            frameImageUrl: frame.imageUrl || "",
            frameLensMaskUrl: frame.lensMaskUrl || "",
            frameStyle: frame.style || "Classic",
            frameMetadata: frame.metadata || null,
            lensId: lens.id,
            lensName: lens.name,
            lensType: lens.lensType,
            lensColor: lens.color,
            lensColorCode: lens.colorCode,
            lensOpacity: lens.tintOpacity,
            lensStyle: lens.style,
          },
        });
        writeCart(cart);
        updateCartBadge();
        showToast(`${frame.name} with ${lens.name} added to your bag`);
      }
      if (customizerData) render(customizerData);
    });

    customizer.addEventListener("change", (event) => {
      const target = event.target;
      if (target.matches("[data-jp-customizer-frame-type]")) state.frameType = target.value;
      if (target.matches("[data-jp-customizer-frame-style]")) state.frameStyle = target.value;
      state.showAllFrames = false;
      if (customizerData) render(customizerData);
    });

    fetch("/api/customizer", { credentials: "same-origin" })
      .then((response) => {
        if (!response.ok) throw new Error("Customizer unavailable");
        return response.json();
      })
      .then((data) => {
        customizerData = data;
        render(data);
      })
      .catch(() => {
        customizer.innerHTML = '<p class="jp-customizer__error">We could not load customization options. Refresh to try again.</p>';
      });
  };

  const customizerSlug = (value) =>
    normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "default";

  let customizerStudioPreviewSeq = 0;

  const customizerStudioClamp = (value, minimum, maximum) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return minimum;
    return Math.min(maximum, Math.max(minimum, number));
  };

  const customizerStudioFrameColors = {
    black: "#232220",
    jet: "#1b1a18",
    grey: "#6f7377",
    gray: "#6f7377",
    graphite: "#44484b",
    silver: "#b9bdc1",
    chrome: "#c8ccd0",
    gold: "#c7a44c",
    rose: "#c78f80",
    "rose gold": "#c78f80",
    brown: "#6b4a32",
    tortoise: "#6b4a32",
    havana: "#7a5335",
    amber: "#b9834f",
    blue: "#30496b",
    navy: "#25344d",
    green: "#4b6350",
    olive: "#65715d",
    red: "#8c3434",
    burgundy: "#6b2b35",
    violet: "#6d3a72",
    purple: "#5d3a6e",
    pink: "#c08a94",
    crystal: "#d8d2c6",
    clear: "#d8d2c6",
    transparent: "#d8d2c6",
    white: "#e8e4dc",
    cream: "#e3dccd",
    beige: "#cbbda4",
    orange: "#b86a3c",
  };

  const customizerStudioHex = (value, fallback = "#2a2723") => {
    const raw = String(value || "").trim();
    if (/^#[0-9a-f]{3,8}$/i.test(raw)) return raw;
    const key = normalize(raw).replace(/[^a-z0-9]+/g, " ").trim();
    if (customizerStudioFrameColors[key]) return customizerStudioFrameColors[key];
    for (const [name, hex] of Object.entries(customizerStudioFrameColors)) {
      if (name.includes(" ") ? key.includes(name) : key === name) return hex;
    }
    for (const [name, hex] of Object.entries(customizerStudioFrameColors)) {
      if (key.includes(name)) return hex;
    }
    return fallback;
  };

  const customizerStudioRgb = (value) => {
    const raw = String(value || "").trim();
    const short = raw.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
    const full = raw.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
    const match = short || full;
    if (!match) return null;
    if (short) {
      return [1, 2, 3].map((index) => parseInt(match[index] + match[index], 16));
    }
    return [1, 2, 3].map((index) => parseInt(match[index], 16));
  };

  const customizerStudioMix = (value, target, amount) => {
    const source = customizerStudioRgb(value);
    const destination = customizerStudioRgb(target);
    if (!source || !destination) return value;
    const ratio = customizerStudioClamp(amount, 0, 1);
    return `#${source
      .map((channel, index) =>
        Math.round(channel + (destination[index] - channel) * ratio)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;
  };

  const customizerStudioHash = (value) => {
    let hash = 2166136261;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash);
  };

  const customizerStudioShapePresets = {
    "soft-square": { n: 3, width: 216, height: 158 },
    round: { n: 2, width: 198, height: 158 },
    oval: { n: 2, width: 220, height: 142 },
    rectangle: { n: 6.4, width: 222, height: 142 },
    "cat-eye": { n: 2.8, width: 224, height: 160, catEye: true },
    aviator: { n: 2.6, width: 212, height: 170, aviator: true },
    butterfly: { n: 2.5, width: 230, height: 166, butterfly: true },
    wayfarer: { n: 4.2, width: 222, height: 150, wayfarer: true },
    hexagon: { n: 3.4, width: 212, height: 160, hexagon: true },
    geometric: { n: 2.7, width: 218, height: 160, geometric: true },
    shield: { n: 3.6, width: 238, height: 164, shield: true },
    diamond: { n: 1.42, width: 208, height: 166 },
  };

  const customizerStudioCornerPresets = {
    soft: { softness: 1, edge: 1 },
    rounded: { softness: 0.78, edge: 0.95 },
    crisp: { softness: 1.45, edge: 1.05 },
    chiseled: { softness: 1.8, edge: 1.09 },
    micro: { softness: 2.2, edge: 1.12 },
    exaggerated: { softness: 0.6, edge: 0.92 },
    sculpted: { softness: 1.12, edge: 1.02 },
    crown: { softness: 0.86, edge: 0.98, crown: true },
  };

  const customizerStudioSmoothPath = (points) => {
    if (!Array.isArray(points) || points.length < 3) return "";
    const total = points.length;
    let path = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
    for (let index = 0; index < total; index += 1) {
      const previous = points[(index - 1 + total) % total];
      const current = points[index];
      const next = points[(index + 1) % total];
      const following = points[(index + 2) % total];
      const controlOneX = current[0] + (next[0] - previous[0]) / 6;
      const controlOneY = current[1] + (next[1] - previous[1]) / 6;
      const controlTwoX = next[0] - (following[0] - current[0]) / 6;
      const controlTwoY = next[1] - (following[1] - current[1]) / 6;
      path += ` C ${controlOneX.toFixed(2)} ${controlOneY.toFixed(2)}, ${controlTwoX.toFixed(2)} ${controlTwoY.toFixed(2)}, ${next[0].toFixed(2)} ${next[1].toFixed(2)}`;
    }
    return `${path} Z`;
  };

  const customizerStudioLensGeometry = (shape, corner) => {
    const preset = customizerStudioShapePresets[shape] || customizerStudioShapePresets["soft-square"];
    const cornerPreset = customizerStudioCornerPresets[corner] || customizerStudioCornerPresets.soft;
    const exponent = customizerStudioClamp(2 + (preset.n - 2) * cornerPreset.softness, 1.2, 9);
    const edge = customizerStudioClamp(cornerPreset.edge, 0.82, 1.24);
    const total = 76;
    const points = [];
    for (let index = 0; index < total; index += 1) {
      const angle = (index / total) * Math.PI * 2;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      let x = Math.sign(cosine) * Math.pow(Math.abs(cosine), 2 / exponent);
      let y = Math.sign(sine) * Math.pow(Math.abs(sine), 2 / exponent);
      x = Math.sign(x) * Math.pow(Math.abs(x), edge);
      y = Math.sign(y) * Math.pow(Math.abs(y), edge);
      if (preset.catEye) {
        y -= 0.2 * Math.max(0, x) * Math.max(0, -y);
        x *= 1 + 0.035 * Math.max(0, -y);
      }
      if (preset.aviator) {
        x *= 1 - 0.17 * Math.max(0, y);
        y += 0.035 * Math.max(0, -y);
      }
      if (preset.butterfly) {
        y -= 0.24 * Math.max(0, x) * Math.max(0, -y);
        x *= 1 + 0.05 * Math.max(0, -y);
      }
      if (preset.wayfarer) {
        x *= 1 - 0.2 * Math.max(0, y);
        x *= 1 + 0.035 * Math.max(0, -y);
      }
      if (preset.hexagon) {
        y = Math.sign(y) * Math.min(1, Math.abs(y) * 1.12);
      }
      if (preset.geometric) {
        y += 0.07 * x * Math.sign(y || 1);
      }
      if (preset.shield) {
        x *= 1 - 0.24 * Math.max(0, y);
        y += 0.025 * Math.max(0, -y);
      }
      if (cornerPreset.crown) {
        y -= 0.06 * Math.max(0, 1 - Math.abs(x) / 0.45) * Math.max(0, -y);
      }
      points.push([x * preset.width * 0.5, y * preset.height * 0.5]);
    }
    return {
      d: customizerStudioSmoothPath(points),
      points,
      width: preset.width,
      height: preset.height,
    };
  };

  const customizerStudioDiamondFacetMarkup = (points, palette = {}) => {
    if (!Array.isArray(points) || points.length < 8) return "";
    const highlight = palette.highlight || "rgba(255,255,255,.2)";
    const shadow = palette.shadow || "rgba(0,0,0,.16)";
    const edge = palette.edge || "rgba(255,255,255,.38)";
    const step = Math.max(3, Math.round(points.length / 24));
    const span = Math.min(step, 3);
    const point = (value) => `${value[0].toFixed(2)} ${value[1].toFixed(2)}`;
    const scaled = (value, factor) => [value[0] * factor, value[1] * factor];
    return Array.from({ length: Math.ceil(points.length / step) }, (_, index) => {
      const start = points[(index * step) % points.length];
      const end = points[(index * step + span) % points.length];
      const midpoint = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
      const innerStart = scaled(start, 0.84);
      const innerEnd = scaled(end, 0.84);
      const innerPoint = scaled(midpoint, 0.7);
      return `<path class="jp-studio-diamond-facet jp-studio-diamond-facet--highlight" d="M ${point(start)} L ${point(end)} L ${point(innerPoint)} Z" fill="${highlight}"/><path class="jp-studio-diamond-facet jp-studio-diamond-facet--shadow" d="M ${point(innerPoint)} L ${point(innerEnd)} L ${point(innerStart)} Z" fill="${shadow}"/><path class="jp-studio-diamond-facet__edge" d="M ${point(start)} L ${point(innerPoint)} L ${point(end)}" fill="none" stroke="${edge}" stroke-width="1.1" stroke-linejoin="round"/>`;
    }).join("");
  };

  const customizerStudioFrameLook = (frame, finishId) => {
    const hash = customizerStudioHash(frame?.id || frame?.name || "jp-frame");
    const code = String(frame?.colorCode || "").trim();
    const base = /^#[0-9a-f]{3,8}$/i.test(code)
      ? code
      : customizerStudioHex(frame?.color, "#2a2723");
    const finishes = {
      silver: "#c9cdd0",
      gold: "#c8a64b",
      gunmetal: "#4d5153",
      "rose-gold": "#c58f82",
      crystal: "#d9d4c9",
    };
    const color = finishes[finishId] || base;
    const material = normalize(frame?.material);
    const metal = /metal|titanium|steel|aluminum|alloy|gold|silver/.test(material);
    const acetate = /acetate|plastic|bio|nylon/.test(material);
    const sunglasses = /sunglass/.test(normalize(frame?.frameType));
    return {
      color,
      light: customizerStudioMix(color, "#ffffff", metal ? 0.42 : 0.3),
      dark: customizerStudioMix(color, "#000000", metal ? 0.34 : 0.42),
      rim: metal ? 5.4 : acetate ? 12.5 : 8.5,
      temple: metal ? 5.2 : acetate ? 11 : 7.5,
      templeStyle: hash % 3,
      bridgeStyle: Math.floor(hash / 7) % 3,
      scale: 0.972 + (hash % 5) * 0.011,
      metal,
      sunglasses,
    };
  };

  const customizerStudioSvg = (frame, lens, settings = {}) => {
    const uid = `jpcs${++customizerStudioPreviewSeq}`;
    const shape = customizerSlug(settings.lensShape || customizerStyle(frame?.style));
    const corner = customizerSlug(settings.cornerStyle || "soft");
    const design = customizerSlug(settings.lensDesign || "regular");
    const cut = customizerSlug(settings.lensCut || "classic");
    const rawProtection = Array.isArray(settings.protectionIds)
      ? settings.protectionIds
      : Array.isArray(settings.protections)
        ? settings.protections
        : [];
    const protectionIds = rawProtection.map((value) => {
      const slug = customizerSlug(value);
      if (slug === "uv-protection") return "uv";
      if (slug === "blue-light-filter") return "blue-light";
      if (slug === "scratch-resistant") return "scratch-resistant";
      return slug;
    });
    const hasProtection = (id) => protectionIds.includes(id);
    const finishId = customizerSlug(settings.frameFinishId || settings.frameFinish || "original");
    const look = customizerStudioFrameLook(frame, finishId);
    const geometry = customizerStudioLensGeometry(shape, corner);
    const lensColor = customizerStudioHex(settings.lensColorCode || lens?.colorCode, "#8fa6a2");
    const lensOpacity = customizerStudioClamp(
      Number(settings.lensOpacity || lens?.tintOpacity) || 0.2,
      0.12,
      0.82,
    );
    const fillOpacity = customizerStudioClamp(lensOpacity * 0.95 + 0.08, 0.18, 0.9);
    const { d, width, height } = geometry;
    const gap = 34;
    const cxLeft = 450 - gap / 2 - width / 2;
    const cxRight = 450 + gap / 2 + width / 2;
    const cy = 296;
    const outerLeft = cxLeft - width / 2;
    const outerRight = cxRight + width / 2;
    const innerLeft = cxLeft + width / 2;
    const innerRight = cxRight - width / 2;
    const middle = (innerLeft + innerRight) / 2;
    const templeStart = cy - height * 0.34;
    const templeEndY = cy - height * 0.27;
    const templeEndX = (side) => (side === "left" ? outerLeft + width * 0.5 : outerRight - width * 0.5);
    const templeLiftX = (side) => {
      const outer = side === "left" ? outerLeft : outerRight;
      const inward = side === "left" ? 1 : -1;
      return outer + inward * width * 0.22;
    };
    const templePeakY = cy - height * 0.7;
    const templeThickness = Math.max(look.temple * 2.2, 12);
    const templeTipThickness = templeThickness * 0.72;
    const bridgeY = cy - height * 0.4;
    const bridgeDip = look.bridgeStyle === 0 ? -8 : look.bridgeStyle === 1 ? 10 : 0;
    const engraving = String(settings.engraving || "").trim().slice(0, 16);
    const engravingPosition = customizerSlug(settings.engravingPosition || "temple");
    const lensType = customizerSlug(settings.lensType || "non-prescription");
    const badge = lensType === "prescription" ? "Rx" : lensType === "readers" ? "R" : "";
    const shapeName = settings.lensShapeName || shape;
    const colorName = settings.lensColorName || lens?.color || "tinted";
    const aria = `${frame?.name || "JP frame"} with ${lens?.name || "selected lenses"}, ${shapeName} shape and ${colorName} lenses`;

    const templeGeometry = (side) => {
      const outer = side === "left" ? outerLeft : outerRight;
      const inward = side === "left" ? 1 : -1;
      return { outer, inward, liftX: templeLiftX(side), endX: templeEndX(side) };
    };

    const templePoint = (side, progress) => {
      const { outer, inward, liftX, endX } = templeGeometry(side);
      const firstSegment = 0.42;
      const segmentProgress = progress <= firstSegment ? progress / firstSegment : (progress - firstSegment) / (1 - firstSegment);
      const start = { x: outer, y: templeStart };
      const lift = { x: liftX, y: templePeakY };
      const end = { x: endX, y: templeEndY };
      const controls = progress <= firstSegment
        ? [
            start,
            { x: outer + inward * 18, y: templeStart - height * 0.22 },
            { x: liftX - inward * 16, y: templePeakY },
            lift,
          ]
        : [
            lift,
            { x: liftX + inward * 22, y: templePeakY },
            { x: endX - inward * 26, y: templeEndY - height * 0.18 },
            end,
          ];
      const inverse = 1 - segmentProgress;
      return {
        x: inverse ** 3 * controls[0].x + 3 * inverse ** 2 * segmentProgress * controls[1].x + 3 * inverse * segmentProgress ** 2 * controls[2].x + segmentProgress ** 3 * controls[3].x,
        y: inverse ** 3 * controls[0].y + 3 * inverse ** 2 * segmentProgress * controls[1].y + 3 * inverse * segmentProgress ** 2 * controls[2].y + segmentProgress ** 3 * controls[3].y,
      };
    };

    const templePath = (side) => {
      const { outer, inward, liftX, endX } = templeGeometry(side);
      const topStart = templeStart - templeThickness / 2;
      const bottomStart = templeStart + templeThickness / 2;
      const topPeak = templePeakY - templeThickness / 2;
      const bottomPeak = templePeakY + templeThickness / 2;
      const topTip = templeEndY - templeTipThickness / 2;
      const bottomTip = templeEndY + templeTipThickness / 2;
      return `M ${outer.toFixed(1)} ${topStart.toFixed(1)} C ${(outer + inward * 18).toFixed(1)} ${(templeStart - height * 0.22 - templeThickness * 0.45).toFixed(1)}, ${(liftX - inward * 16).toFixed(1)} ${(topPeak - templeThickness * 0.12).toFixed(1)}, ${liftX.toFixed(1)} ${topPeak.toFixed(1)} C ${(liftX + inward * 22).toFixed(1)} ${topPeak.toFixed(1)}, ${(endX - inward * 26).toFixed(1)} ${(templeEndY - height * 0.18 - templeTipThickness * 0.2).toFixed(1)}, ${endX.toFixed(1)} ${topTip.toFixed(1)} L ${endX.toFixed(1)} ${bottomTip.toFixed(1)} C ${(endX - inward * 26).toFixed(1)} ${(templeEndY - height * 0.18 + templeTipThickness * 0.2).toFixed(1)}, ${(liftX + inward * 22).toFixed(1)} ${bottomPeak.toFixed(1)}, ${liftX.toFixed(1)} ${bottomPeak.toFixed(1)} C ${(liftX - inward * 16).toFixed(1)} ${(bottomPeak + templeThickness * 0.12).toFixed(1)}, ${(outer + inward * 18).toFixed(1)} ${(templeStart - height * 0.22 + templeThickness * 0.45).toFixed(1)}, ${outer.toFixed(1)} ${bottomStart.toFixed(1)} Z`;
    };

    const templeDetail = (side) => {
      if (look.templeStyle === 1) {
        return Array.from({ length: 7 }, (_, index) => {
          const t = (index + 1) / 8;
          const { x, y } = templePoint(side, t);
          return `<line x1="${x.toFixed(1)}" y1="${(y - 5).toFixed(1)}" x2="${x.toFixed(1)}" y2="${(y + 5).toFixed(1)}" stroke="${look.dark}" stroke-width="1.6" opacity=".55"/>`;
        }).join("");
      }
      if (look.templeStyle === 2) {
        return Array.from({ length: 5 }, (_, index) => {
          const t = (index + 1) / 6;
          const { x, y } = templePoint(side, t);
          return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.4" fill="none" stroke="${look.light}" stroke-width="1.2" opacity=".7"/>`;
        }).join("");
      }
      return "";
    };

    const templeHinge = (side) => {
      const outer = side === "left" ? outerLeft : outerRight;
      const hingeLength = Math.max(look.rim * 1.6, 15);
      const x = side === "left" ? outer - 3 : outer - hingeLength + 3;
      return `<rect x="${x.toFixed(1)}" y="${(templeStart - templeThickness * 0.62).toFixed(1)}" width="${hingeLength.toFixed(1)}" height="${(templeThickness * 1.24).toFixed(1)}" rx="${(templeThickness * 0.22).toFixed(1)}" fill="${look.dark}" opacity=".94"/>`;
    };

    const lensMarkup = (side) => {
      const cx = side === "left" ? cxLeft : cxRight;
      const transform = side === "left" ? `translate(${cx.toFixed(2)} ${cy})` : `translate(${cx.toFixed(2)} ${cy}) scale(-1 1)`;
      const clipId = `${uid}-${side}`;
      const designMarkup =
        design === "diamond"
          ? `<g fill="none" stroke="rgba(255,255,255,.62)" stroke-width="1.2">
              <path d="M 0 ${-height / 2} L ${width / 2} 0 L 0 ${height / 2} L ${-width / 2} 0 Z"/>
              <path d="M 0 ${-height / 2} L 0 ${height / 2} M ${-width / 2} 0 L ${width / 2} 0"/>
              <path d="M ${-width / 4} ${-height / 4} L ${width / 4} ${height / 4} M ${width / 4} ${-height / 4} L ${-width / 4} ${height / 4}" opacity=".55"/>
            </g>`
          : "";
      const inset = (scale, opacity, strokeWidth) =>
        `<path d="${d}" transform="scale(${scale})" fill="none" stroke="rgba(255,255,255,${opacity})" stroke-width="${strokeWidth}"/>`;
      let cutMarkup = "";
      if (cut === "bevel") cutMarkup = inset(0.92, 0.6, 2.2);
      if (cut === "step") cutMarkup = inset(0.92, 0.55, 2) + inset(0.84, 0.35, 1.5);
      if (cut === "faceted") {
        cutMarkup =
          inset(0.9, 0.5, 1.8) +
          `<path d="M 0 ${-height / 2} L ${width / 2} ${height / 6} L 0 ${height / 2} L ${-width / 2} ${height / 6} Z" fill="none" stroke="rgba(255,255,255,.42)" stroke-width="1.2"/>`;
      }
      if (cut === "contour") {
        cutMarkup =
          inset(0.88, 0.45, 3) +
          `<path d="${d}" transform="scale(.84)" fill="none" stroke="rgba(0,0,0,.2)" stroke-width="4"/>`;
      }
      if (cut === "diamond") {
        cutMarkup = customizerStudioDiamondFacetMarkup(geometry.points, {
          highlight: "rgba(255,255,255,.28)",
          shadow: "rgba(0,0,0,.2)",
          edge: "rgba(255,255,255,.5)",
        });
      }
      let protectionMarkup = "";
      if (hasProtection("polarized")) {
        protectionMarkup += `<rect x="${-width / 2}" y="${-height / 2}" width="${width}" height="${height}" fill="url(#${uid}-polarized)" opacity=".3"/>`;
      }
      if (hasProtection("blue-light")) {
        protectionMarkup += `<rect x="${-width / 2}" y="${-height / 2}" width="${width}" height="${height}" fill="url(#${uid}-blue)" opacity=".6"/>`;
      }
      if (hasProtection("anti-reflective")) {
        protectionMarkup += `<rect x="${-width / 2}" y="${-height / 2}" width="${width}" height="${height}" fill="url(#${uid}-ar)" opacity=".45"/>`;
      }
      return `<g transform="${transform}">
        <clipPath id="${clipId}"><path d="${d}"/></clipPath>
        <path d="${d}" fill="url(#${uid}-lens)" opacity="${fillOpacity.toFixed(3)}"/>
        <g clip-path="url(#${clipId})">
          <path class="jp-studio-lens-sheen" d="${d}" fill="url(#${uid}-sheen)" opacity=".62"/>
          ${protectionMarkup}
          ${designMarkup}
          ${cutMarkup}
        </g>
        <path d="${d}" fill="none" stroke="${look.dark}" stroke-width="${(look.rim * 2 + 2).toFixed(1)}" opacity=".42"/>
        <path d="${d}" fill="none" stroke="url(#${uid}-frame)" stroke-width="${(look.rim * 2).toFixed(1)}"/>
        <path d="${d}" fill="none" stroke="${look.light}" stroke-width="1.1" opacity=".55"/>
      </g>`;
    };

    const bridgePath = `M ${innerLeft.toFixed(1)} ${bridgeY.toFixed(1)} C ${(innerLeft + 10).toFixed(1)} ${(bridgeY - 14).toFixed(1)}, ${(middle - 8).toFixed(1)} ${(bridgeY + bridgeDip).toFixed(1)}, ${middle.toFixed(1)} ${(bridgeY + bridgeDip).toFixed(1)} C ${(middle + 8).toFixed(1)} ${(bridgeY + bridgeDip).toFixed(1)}, ${(innerRight - 10).toFixed(1)} ${(bridgeY - 14).toFixed(1)}, ${innerRight.toFixed(1)} ${bridgeY.toFixed(1)}`;
    const browPath = look.sunglasses
      ? `<path d="M ${(outerLeft - 2).toFixed(1)} ${(cy - height * 0.52).toFixed(1)} Q 450 ${(cy - height * 0.68).toFixed(1)}, ${(outerRight + 2).toFixed(1)} ${(cy - height * 0.52).toFixed(1)}" fill="none" stroke="url(#${uid}-frame)" stroke-width="${(look.rim * 1.25).toFixed(1)}" stroke-linecap="round" opacity=".95"/>`
      : "";
    const nosePads = look.metal
      ? `<ellipse cx="${(middle - 14).toFixed(1)}" cy="${(bridgeY + 18).toFixed(1)}" rx="4" ry="7" fill="${look.light}" opacity=".72"/><ellipse cx="${(middle + 14).toFixed(1)}" cy="${(bridgeY + 18).toFixed(1)}" rx="4" ry="7" fill="${look.light}" opacity=".72"/>`
      : "";
    const badgeMarkup = badge
      ? `<text x="${(cxRight + width / 2 - 24).toFixed(1)}" y="${(cy + height / 2 - 14).toFixed(1)}" text-anchor="middle" fill="#f7efe0" opacity=".85" font-size="10" font-family="Georgia, serif" letter-spacing="1">${badge}</text>`
      : "";
    const engravingAnchor =
      engravingPosition === "bridge"
        ? { x: 450, y: cy - height * 0.52, rotate: 0, size: 9, anchor: "middle" }
        : engravingPosition === "inner-rim"
          ? { x: 450, y: cy + height * 0.52, rotate: 0, size: 9, anchor: "middle" }
          : { x: 782, y: cy - 58, rotate: 9, size: 10, anchor: "middle" };
    const engravingMarkup = `<text data-jp-engraving-svg x="${engravingAnchor.x.toFixed(1)}" y="${engravingAnchor.y.toFixed(1)}" text-anchor="${engravingAnchor.anchor}" transform="rotate(${engravingAnchor.rotate} ${engravingAnchor.x.toFixed(1)} ${engravingAnchor.y.toFixed(1)})" fill="#f6ead6" stroke="rgba(0,0,0,.5)" stroke-width=".5" paint-order="stroke" font-size="${engravingAnchor.size}" font-family="Georgia, serif" letter-spacing="1.6" opacity="${engraving ? 1 : 0}">${escapeHtml(engraving)}</text>`;

    return `<svg class="jp-studio-svg" viewBox="0 0 900 560" role="img" aria-label="${escapeHtml(aria)}" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="${uid}-frame" x1="0" y1="0" x2="0.2" y2="1">
          <stop offset="0" stop-color="${look.light}"/>
          <stop offset=".45" stop-color="${look.color}"/>
          <stop offset="1" stop-color="${look.dark}"/>
        </linearGradient>
        <radialGradient id="${uid}-lens" cx="38%" cy="26%" r="82%">
          <stop offset="0" stop-color="${customizerStudioMix(lensColor, "#ffffff", 0.4)}"/>
          <stop offset=".55" stop-color="${lensColor}"/>
          <stop offset="1" stop-color="${customizerStudioMix(lensColor, "#000000", 0.34)}"/>
        </radialGradient>
        <linearGradient id="${uid}-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ffffff" stop-opacity=".55"/>
          <stop offset=".28" stop-color="#ffffff" stop-opacity=".04"/>
          <stop offset=".62" stop-color="#ffffff" stop-opacity=".2"/>
          <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
        </linearGradient>
        <pattern id="${uid}-polarized" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <rect width="10" height="10" fill="transparent"/>
          <line x1="0" y1="0" x2="0" y2="10" stroke="#ffffff" stroke-width="1.4" opacity=".55"/>
        </pattern>
        <radialGradient id="${uid}-blue" cx="30%" cy="18%" r="70%">
          <stop offset="0" stop-color="#c8ecff" stop-opacity=".9"/>
          <stop offset=".5" stop-color="#7fc7ea" stop-opacity=".32"/>
          <stop offset="1" stop-color="#3c6f88" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="${uid}-ar" cx="24%" cy="20%" r="80%">
          <stop offset="0" stop-color="#dbffe9" stop-opacity=".7"/>
          <stop offset=".6" stop-color="#8fd9b6" stop-opacity=".16"/>
          <stop offset="1" stop-color="#1d3b2c" stop-opacity="0"/>
        </radialGradient>
        <filter id="${uid}-shadow" x="-25%" y="-25%" width="150%" height="160%">
          <feDropShadow dx="0" dy="14" stdDeviation="12" flood-color="#2b2114" flood-opacity=".24"/>
        </filter>
        <filter id="${uid}-blur"><feGaussianBlur stdDeviation="12"/></filter>
      </defs>
      <ellipse cx="450" cy="512" rx="300" ry="24" fill="#2b2114" opacity=".16" filter="url(#${uid}-blur)"/>
      <g transform="translate(450 296) scale(${look.scale.toFixed(3)}) translate(-450 -296)" filter="url(#${uid}-shadow)">
        <g class="jp-studio-arms" aria-hidden="true">
          <path d="${templePath("left")}" fill="url(#${uid}-frame)" stroke="${look.dark}" stroke-width="1.8" stroke-linejoin="round" opacity=".96"/>
          <path d="${templePath("right")}" fill="url(#${uid}-frame)" stroke="${look.dark}" stroke-width="1.8" stroke-linejoin="round" opacity=".96"/>
          ${templeDetail("left")}
          ${templeDetail("right")}
          ${templeHinge("left")}
          ${templeHinge("right")}
        </g>
        ${lensMarkup("left")}
        ${lensMarkup("right")}
        <path d="${bridgePath}" fill="none" stroke="${look.dark}" stroke-width="${(look.rim * 0.9 + 2).toFixed(1)}" stroke-linecap="round" opacity=".7"/>
        <path d="${bridgePath}" fill="none" stroke="url(#${uid}-frame)" stroke-width="${(look.rim * 0.9).toFixed(1)}" stroke-linecap="round"/>
        ${nosePads}
        ${browPath}
        ${badgeMarkup}
        ${engravingMarkup}
      </g>
    </svg>`;
  };

  const customizerPreviewPro = (frame, lens, settings = {}, compact = false) => {
    const lensColor = customizerStudioHex(settings.lensColorCode || lens?.colorCode, "#8fa6a2");
    const lensOpacity = customizerStudioClamp(
      Number(settings.lensOpacity || lens?.tintOpacity) || 0.2,
      0.12,
      0.82,
    );
    const viewRotation = Number(settings.viewRotation || 0);
    const viewTilt = Number(settings.viewTilt || 0);
    const viewZoom = Number(settings.viewZoom || 1);
    return `<div class="jp-customizer__stage jp-studio-stage${compact ? " is-compact" : ""}" data-jp-preview-stage style="--lens-color:${lensColor};--lens-opacity:${lensOpacity.toFixed(3)}">
      <div class="jp-studio-stage__wash" aria-hidden="true"></div>
      <div class="jp-studio-scene" data-jp-preview-scene style="--preview-rotate:${viewRotation}deg;--preview-tilt:${viewTilt}deg;--preview-scale:${viewZoom}"><div class="jp-studio-object">${customizerStudioSvg(frame, lens, settings)}</div></div>
      ${
        compact
          ? ""
          : `<div class="jp-studio-tools" aria-label="Preview controls">
              <button type="button" data-jp-preview-action="reset" aria-label="Reset preview angle"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2-5.3"/><path d="M4 4v4h4"/></svg></button>
              <button type="button" data-jp-preview-action="zoom-out" aria-label="Zoom out"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M8 11h6M16 16l4 4"/></svg></button>
              <button type="button" data-jp-preview-action="zoom-in" aria-label="Zoom in"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M8 11h6M11 8v6M16 16l4 4"/></svg></button>
              <button type="button" data-jp-preview-action="fullscreen" aria-label="Open preview fullscreen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H4v4M16 4h4v4M4 16v4h4M20 16v4h-4"/></svg></button>
            </div>
            <div class="jp-studio-stage__hint"><span>Drag to rotate</span><span>Scroll or use + / - to zoom</span></div>`
      }
    </div>`;
  };

  const setupProductCustomizerPro = () => {
    if (window.location.pathname !== "/customize" || document.querySelector(".jp-customizer")) return;
    const productId = Number(new URLSearchParams(window.location.search).get("productId") || 0);
    const host = document.querySelector("[data-jp-customizer-page]");
    if (!host) return;

    const customizer = document.createElement("section");
    customizer.className = "jp-customizer jp-customizer--standalone jp-customizer--pro jp-studio";
    customizer.setAttribute("aria-labelledby", "jp-customizer-title");
    customizer.innerHTML = '<div class="jp-studio-loading"><span></span><p>Preparing the atelier…</p></div>';
    host.appendChild(customizer);

    const FALLBACK_OPTIONS = {
      finishes: [
        { id: "original", name: "Original", color: "#282725", price: 0, visual: true },
        { id: "silver", name: "Silver", color: "#c9cdd0", price: 45, visual: true },
        { id: "gold", name: "Gold", color: "#c8a64b", price: 75, visual: true },
        { id: "gunmetal", name: "Gunmetal", color: "#4d5153", price: 30, visual: true },
        { id: "rose-gold", name: "Rose gold", color: "#c58f82", price: 65, visual: true },
        { id: "crystal", name: "Crystal", color: "#d9d4c9", price: 25, visual: true },
      ],
      shapes: [
        { id: "soft-square", name: "Soft square", price: 0, visual: true },
        { id: "round", name: "Round", price: 0, visual: true },
        { id: "oval", name: "Oval", price: 0, visual: true },
        { id: "rectangle", name: "Rectangle", price: 0, visual: true },
        { id: "cat-eye", name: "Cat eye", price: 0, visual: true },
        { id: "aviator", name: "Aviator", price: 0, visual: true },
        { id: "butterfly", name: "Butterfly", price: 0, visual: true },
        { id: "wayfarer", name: "Wayfarer", price: 0, visual: true },
        { id: "hexagon", name: "Hexagon", price: 0, visual: true },
        { id: "geometric", name: "Geometric", price: 0, visual: true },
        { id: "shield", name: "Shield", price: 0, visual: true },
        { id: "diamond", name: "Diamond", price: 0, visual: true },
      ],
      designs: [
        { id: "regular", name: "Regular cut", meta: "Clean, classic edge", price: 0, visual: true },
        { id: "diamond", name: "Diamond cut", meta: "Hand-faceted edge", price: 95, visual: true },
      ],
      cuts: [
        { id: "classic", name: "Classic", meta: "Balanced profile", price: 0, visual: true },
        { id: "bevel", name: "Bevel", meta: "Fine angled edge", price: 35, visual: true },
        { id: "step", name: "Stepped", meta: "Architectural layers", price: 55, visual: true },
        { id: "faceted", name: "Faceted", meta: "Light-catching planes", price: 70, visual: true },
        { id: "contour", name: "Contour", meta: "Sculpted outer edge", price: 85, visual: true },
        { id: "diamond", name: "Diamond Cut", meta: "Precision-faceted edge", price: 120, visual: true },
      ],
      corners: [
        { id: "soft", name: "Soft", price: 0, visual: true },
        { id: "crisp", name: "Crisp", price: 0, visual: true },
        { id: "chiseled", name: "Chiseled", price: 0, visual: true },
        { id: "rounded", name: "Rounded", price: 0, visual: true },
        { id: "micro", name: "Micro", price: 0, visual: true },
        { id: "exaggerated", name: "Exaggerated", price: 0, visual: true },
        { id: "sculpted", name: "Sculpted", price: 0, visual: true },
        { id: "crown", name: "Crown", price: 0, visual: true },
      ],
      colors: [
        { id: "clear", name: "Clear", color: "#eef2f0", price: 0, visual: true },
        { id: "blue", name: "Blue", color: "#5d8fa7", price: 20, visual: true },
        { id: "green", name: "Green", color: "#667e6a", price: 20, visual: true },
        { id: "gold", name: "Gold", color: "#b79a58", price: 25, visual: true },
        { id: "white", name: "White", color: "#f5f3ed", price: 0, visual: true },
        { id: "grey", name: "Grey", color: "#6d7476", price: 15, visual: true },
        { id: "smoke", name: "Smoke", color: "#3f4a50", price: 25, visual: true },
        { id: "rose", name: "Rose", color: "#a97578", price: 25, visual: true },
        { id: "amber", name: "Amber", color: "#b97e4d", price: 25, visual: true },
      ],
      lensTypes: [
        { id: "non-prescription", name: "Non-prescription", meta: "Fashion tint or clear", price: 0, visual: true },
        { id: "prescription", name: "Prescription", meta: "Made to your power", price: 85, visual: true },
        { id: "readers", name: "Readers", meta: "Everyday near vision", price: 45, visual: true },
      ],
      protections: [
        { id: "uv", name: "UV protection", meta: "Blocks UVA + UVB rays", price: 0, visual: false },
        { id: "blue-light", name: "Blue-light filter", meta: "Softens screen glare", price: 35, visual: true },
        { id: "polarized", name: "Polarized", meta: "Cuts reflective glare", price: 45, visual: true },
        { id: "anti-reflective", name: "Anti-reflective", meta: "Clearer, cleaner optics", price: 25, visual: true },
        { id: "scratch-resistant", name: "Scratch resistant", meta: "Adds daily durability", price: 0, visual: false },
      ],
      afterWear: [
        { id: "fit-check", name: "Complimentary fit check", meta: "A final fit review before dispatch", price: 0, visual: false },
        { id: "travel-case", name: "Signature travel case", meta: "Protective case in soft leather", price: 35, visual: false },
        { id: "care-kit", name: "Lens care kit", meta: "Cloth, spray and storage pouch", price: 18, visual: false },
      ],
      engravingPrice: 35,
    };

    const STEPS = [
      { id: "frame", label: "Frame", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l1-3h8l1 3h4"/><path d="M4 12v3a3 3 0 0 0 6 0v-3M14 12v3a3 3 0 0 0 6 0v-3"/></svg>' },
      { id: "lens", label: "Lens", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8c2.5-2 13.5-2 16 0v7c-2.5 2-13.5 2-16 0Z"/></svg>' },
      { id: "design", label: "Design", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 8-8 10-8-10 8-8Z"/><path d="m4 11 8 2 8-2"/></svg>' },
      { id: "cuts", label: "Cuts", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 8 8-4 8 4-8 4-8-4Z"/><path d="m4 12 8 4 8-4M4 16l8 4 8-4"/></svg>' },
      { id: "corners", label: "Corners", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V8a3 3 0 0 1 3-3h11"/></svg>' },
      { id: "color", label: "Color", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a8 8 0 1 0 8 8c0-1.7-1.3-3-3-3h-1a2 2 0 0 1-2-2V6a2 2 0 0 0-2-2Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="14" cy="7.5" r="1"/></svg>' },
      { id: "protection", label: "Protection", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/></svg>' },
      { id: "engraving", label: "Engraving", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 5 5M4 20l3.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z"/></svg>' },
    ];

    const STATE_KEY = "jp_customizer_state_v2";
    const resetState = () => ({
      frameId: "",
      lensId: "",
      frameType: "All",
      frameStyle: "All",
      showAllFrames: false,
      frameFinish: "original",
      lensShape: "soft-square",
      lensDesign: "regular",
      lensCut: "classic",
      cornerStyle: "soft",
      lensColor: "clear",
      lensColorTouched: false,
      lensType: "non-prescription",
      protectionIds: ["uv"],
      prescriptionLeft: "",
      prescriptionRight: "",
      engraving: "",
      engravingPosition: "temple",
      afterWearIds: ["fit-check"],
      viewRotation: 0,
      viewTilt: 0,
      viewZoom: 1,
      comparisons: [],
    });

    const restoreState = () => {
      try {
        const raw = sessionStorage.getItem(STATE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        const base = resetState();
        const restored = { ...base };
        for (const key of Object.keys(base)) {
          if (key === "comparisons") continue;
          if (parsed[key] !== undefined && parsed[key] !== null) restored[key] = parsed[key];
        }
        restored.protectionIds = Array.isArray(parsed.protectionIds)
          ? parsed.protectionIds.map(String)
          : base.protectionIds;
        restored.afterWearIds = Array.isArray(parsed.afterWearIds)
          ? parsed.afterWearIds.map(String)
          : base.afterWearIds;
        restored.comparisons = Array.isArray(parsed.comparisons)
          ? parsed.comparisons
              .filter((item) => item && item.frameId && item.lensId && item.settings)
              .slice(0, 3)
          : [];
        restored.viewRotation = Number(parsed.viewRotation) || 0;
        restored.viewTilt = Number(parsed.viewTilt) || 0;
        restored.viewZoom = Number(parsed.viewZoom) || 1;
        restored.engraving = String(parsed.engraving || "").slice(0, 16);
        restored.prescriptionLeft = String(parsed.prescriptionLeft || "");
        restored.prescriptionRight = String(parsed.prescriptionRight || "");
        return restored;
      } catch {
        return null;
      }
    };

    let state = restoreState() || resetState();
    let activeStep = "frame";
    let customizerData = null;
    let options = FALLBACK_OPTIONS;
    let lastLensType = "";

    const mergeOptions = (incoming) => {
      const merged = {};
      for (const key of Object.keys(FALLBACK_OPTIONS)) {
        if (key === "engravingPrice") {
          merged[key] = Number(incoming?.[key] ?? FALLBACK_OPTIONS[key]);
          continue;
        }
        const base = FALLBACK_OPTIONS[key];
        const list = Array.isArray(incoming?.[key]) && incoming[key].length ? incoming[key] : base;
        merged[key] = list
          .map((item) => {
            const fallback = base.find((candidate) => candidate.id === item.id) || {};
            return {
              ...fallback,
              ...item,
              id: String(item.id || fallback.id || ""),
              name: String(item.name || fallback.name || ""),
              price: Number(item.price ?? fallback.price ?? 0),
              visual: item.visual ?? fallback.visual ?? true,
            };
          })
          .filter((item) => item.id);
      }
      return merged;
    };

    const persist = () => {
      try {
        sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
      } catch {
        return;
      }
    };

    const optionById = (list, id) => list.find((item) => String(item.id) === String(id)) || list[0];
    const getFrame = () =>
      customizerData?.frames?.find((item) => String(item.id) === String(state.frameId));
    const getLenses = (frame = getFrame()) => {
      if (!frame || !customizerData) return [];
      const ids = Array.isArray(customizerData.compatibility?.[frame.id])
        ? customizerData.compatibility[frame.id]
        : [];
      return ids.length
        ? customizerData.lenses.filter((item) => ids.includes(String(item.id)))
        : customizerData.lenses;
    };
    const getLens = () =>
      getLenses().find((item) => String(item.id) === String(state.lensId)) || getLenses()[0];
    const currentCurrency = () => {
      const frame = getFrame();
      const lens = getLens();
      return frame?.currency || lens?.currency || "USD";
    };
    const mapLensColor = (lens) => {
      const map = {
        clear: "clear",
        "ice blue": "blue",
        smoke: "smoke",
        amber: "amber",
        olive: "green",
        graphite: "grey",
      };
      return map[normalize(lens?.color)] || "clear";
    };

    const ensureSelection = () => {
      if (!customizerData) return;
      const frames = customizerData.frames || [];
      if (!frames.length) return;
      if (!state.frameId || !frames.some((item) => String(item.id) === String(state.frameId))) {
        const preferred = frames.find((item) => Number(item.productId) === productId);
        state.frameId = String(preferred?.id || frames[0].id);
      }
      const lenses = getLenses();
      if (!lenses.length) {
        state.lensId = "";
        return;
      }
      if (!state.lensId || !lenses.some((item) => String(item.id) === String(state.lensId))) {
        state.lensId = String(lenses[0].id);
      }
      const ensureOption = (list, value, fallback) =>
        list.some((item) => String(item.id) === String(value))
          ? String(value)
          : list.some((item) => String(item.id) === String(fallback))
            ? String(fallback)
            : String(list[0]?.id || "");
      state.frameFinish = ensureOption(options.finishes, state.frameFinish, "original");
      state.lensShape = ensureOption(options.shapes, state.lensShape, "soft-square");
      state.lensDesign = ensureOption(options.designs, state.lensDesign, "regular");
      state.lensCut = ensureOption(options.cuts, state.lensCut, "classic");
      state.cornerStyle = ensureOption(options.corners, state.cornerStyle, "soft");
      state.lensColor = ensureOption(options.colors, state.lensColor, "clear");
      state.lensType = ensureOption(options.lensTypes, state.lensType, "non-prescription");
      state.protectionIds = (Array.isArray(state.protectionIds) ? state.protectionIds : [])
        .map(String)
        .filter((id) => options.protections.some((item) => String(item.id) === id));
      if (!state.protectionIds.length) state.protectionIds = ["uv"];
      state.afterWearIds = (Array.isArray(state.afterWearIds) ? state.afterWearIds : [])
        .map(String)
        .filter((id) => options.afterWear.some((item) => String(item.id) === id));
      if (!state.afterWearIds.length) state.afterWearIds = ["fit-check"];
      if (!state.lensColorTouched) state.lensColor = mapLensColor(getLens());
      state.comparisons = state.comparisons.filter(
        (item) =>
          frames.some((frame) => String(frame.id) === String(item.frameId)) &&
          (customizerData.lenses || []).some((lens) => String(lens.id) === String(item.lensId)),
      );
    };

    const moneyWithSign = (value, currency = currentCurrency()) => {
      const amount = Number(value || 0);
      return amount > 0 ? `+${customizerMoney(amount, currency)}` : "Included";
    };

    const selection = () => {
      const frame = getFrame();
      const lens = getLens();
      const finish = optionById(options.finishes, state.frameFinish);
      const shape = optionById(options.shapes, state.lensShape);
      const design = optionById(options.designs, state.lensDesign);
      const cut = optionById(options.cuts, state.lensCut);
      const corner = optionById(options.corners, state.cornerStyle);
      const color = optionById(options.colors, state.lensColor);
      const lensType = optionById(options.lensTypes, state.lensType);
      const protection = options.protections.filter((item) =>
        state.protectionIds.includes(String(item.id)),
      );
      const extras = options.afterWear.filter((item) =>
        state.afterWearIds.includes(String(item.id)),
      );
      const lineItems = [
        { label: frame?.name || "Selected frame", amount: Number(frame?.price || 0), base: true },
        { label: lens?.name || "Base lens", amount: Number(lens?.price || 0), base: true },
        { label: `${finish.name} finish`, amount: Number(finish.price || 0) },
        { label: `${shape.name} lens shape`, amount: Number(shape.price || 0) },
        { label: design.name, amount: Number(design.price || 0) },
        { label: `${cut.name} lens cut`, amount: Number(cut.price || 0) },
        { label: `${corner.name} corners`, amount: Number(corner.price || 0) },
        { label: `${color.name} lens color`, amount: Number(color.price || 0) },
        { label: lensType.name, amount: Number(lensType.price || 0) },
        ...protection.map((item) => ({ label: item.name, amount: Number(item.price || 0) })),
        ...(state.engraving.trim()
          ? [{ label: "Personal engraving", amount: Number(options.engravingPrice || 0) }]
          : []),
        ...extras.map((item) => ({ label: item.name, amount: Number(item.price || 0) })),
      ];
      return {
        frame,
        lens,
        finish,
        shape,
        design,
        cut,
        corner,
        color,
        lensType,
        protection,
        extras,
        lineItems,
        total: lineItems.reduce((sum, item) => sum + item.amount, 0),
      };
    };

    const visibleFrames = () => {
      const frames = customizerData?.frames || [];
      return frames
        .filter((item) => state.frameType === "All" || String(item.frameType) === state.frameType)
        .filter((item) => state.frameStyle === "All" || String(item.style) === state.frameStyle);
    };

    const shapeGlyph = (shapeId) => {
      const geometry = customizerStudioLensGeometry(shapeId, state.cornerStyle);
      return `<svg viewBox="-132 -98 264 196" aria-hidden="true"><path d="${geometry.d}" fill="rgba(28,26,23,.07)" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>`;
    };
    const cornerGlyph = (cornerId) => {
      const geometry = customizerStudioLensGeometry(state.lensShape, cornerId);
      return `<svg viewBox="-132 -98 264 196" aria-hidden="true"><path d="${geometry.d}" fill="rgba(28,26,23,.07)" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>`;
    };
    const cutGlyph = (cutId) => {
      const geometry = customizerStudioLensGeometry(state.lensShape, state.cornerStyle);
      const inset = (scale, opacity, width) =>
        `<path d="${geometry.d}" transform="scale(${scale})" fill="none" stroke="currentColor" stroke-width="${width}" opacity="${opacity}"/>`;
      let detail = "";
      if (cutId === "bevel") detail = inset(0.9, 0.55, 3);
      if (cutId === "step") detail = inset(0.9, 0.5, 2.5) + inset(0.8, 0.35, 2);
      if (cutId === "faceted") {
        detail =
          inset(0.88, 0.45, 2.5) +
          `<path d="M 0 ${-geometry.height / 2} L ${geometry.width / 2} ${geometry.height / 6} L 0 ${geometry.height / 2} L ${-geometry.width / 2} ${geometry.height / 6} Z" fill="none" stroke="currentColor" stroke-width="2" opacity=".45"/>`;
      }
      if (cutId === "contour") detail = inset(0.86, 0.5, 6);
      if (cutId === "diamond") {
        detail = customizerStudioDiamondFacetMarkup(geometry.points, {
          highlight: "rgba(28,26,23,.16)",
          shadow: "rgba(28,26,23,.08)",
          edge: "rgba(28,26,23,.42)",
        });
      }
      return `<svg viewBox="-132 -98 264 196" aria-hidden="true"><path d="${geometry.d}" fill="rgba(28,26,23,.07)" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>${detail}</svg>`;
    };
    const designGlyph = (designId) => {
      const geometry = customizerStudioLensGeometry(state.lensShape, state.cornerStyle);
      const facets =
        designId === "diamond"
          ? `<path d="M 0 ${-geometry.height / 2} L ${geometry.width / 2} 0 L 0 ${geometry.height / 2} L ${-geometry.width / 2} 0 Z" fill="none" stroke="currentColor" stroke-width="2" opacity=".55"/><path d="M 0 ${-geometry.height / 2} L 0 ${geometry.height / 2} M ${-geometry.width / 2} 0 L ${geometry.width / 2} 0" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".4"/>`
          : "";
      return `<svg viewBox="-132 -98 264 196" aria-hidden="true"><path d="${geometry.d}" fill="rgba(28,26,23,.07)" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>${facets}</svg>`;
    };
    const lensTypeGlyph = (id) =>
      id === "prescription"
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h6l2 10H7L5 7Zm8 0h6l-2 10h-6l2-10Z"/><path d="M11 7h2"/></svg>'
        : id === "readers"
          ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="12" r="3.2"/><circle cx="16" cy="12" r="3.2"/><path d="M11.2 12h1.6"/></svg>'
          : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9c2.5-1.8 13.5-1.8 16 0v6c-2.5 1.8-13.5 1.8-16 0Z"/></svg>';

    const frameGridMarkup = () => {
      const frames = visibleFrames();
      const shown = state.showAllFrames ? frames : frames.slice(0, 8);
      if (!shown.length) {
        return '<p class="jp-studio-empty">No frames match these filters. Try another style.</p>';
      }
      return shown
        .map((item) => {
          const selected = String(item.id) === String(state.frameId);
          const swatch = customizerStudioHex(
            /^#/.test(String(item.colorCode || "")) ? item.colorCode : item.color,
            "#2a2723",
          );
          return `<button type="button" class="jp-studio-frame${selected ? " is-selected" : ""}" data-jp-frame="${escapeHtml(item.id)}" aria-pressed="${selected}">
            <span class="jp-studio-frame__media"><img src="${escapeHtml(item.imageUrl || "/mirror-assets/placeholder.svg")}" alt="" loading="lazy"></span>
            <span class="jp-studio-frame__body">
              <span class="jp-studio-frame__name">${escapeHtml(item.name)}</span>
              <span class="jp-studio-frame__meta">${escapeHtml(item.style || "Classic")} · ${escapeHtml(item.frameType || "Eyewear")}</span>
              <span class="jp-studio-frame__price">${escapeHtml(customizerMoney(item.price, item.currency))}</span>
            </span>
            <span class="jp-studio-frame__swatch" style="--swatch:${swatch}" aria-hidden="true"></span>
            <span class="jp-studio-check" aria-hidden="true">✓</span>
          </button>`;
        })
        .join("");
    };

    const lensGridMarkup = () => {
      const lenses = getLenses();
      if (!lenses.length) {
        return '<p class="jp-studio-empty">This frame has no compatible lenses yet.</p>';
      }
      return lenses
        .map((item) => {
          const selected = String(item.id) === String(state.lensId);
          const swatch = customizerStudioHex(item.colorCode, "#9fb3ad");
          const opacity = customizerStudioClamp(Number(item.tintOpacity) || 0.2, 0.12, 0.82);
          return `<button type="button" class="jp-studio-lens${selected ? " is-selected" : ""}" data-jp-lens="${escapeHtml(item.id)}" aria-pressed="${selected}">
            <span class="jp-studio-lens__swatch" style="--swatch:${swatch};--swatch-opacity:${opacity.toFixed(2)}" aria-hidden="true"></span>
            <span class="jp-studio-lens__copy">
              <strong>${escapeHtml(item.name)}</strong>
              <small>${escapeHtml(item.lensType || "Lens")} · ${escapeHtml(item.style || "Classic")}</small>
              <em>${escapeHtml(item.description || "A considered everyday lens")}</em>
            </span>
            <span class="jp-studio-lens__price">${item.price ? `+${escapeHtml(customizerMoney(item.price, item.currency))}` : "Included"}</span>
            <span class="jp-studio-check" aria-hidden="true">✓</span>
          </button>`;
        })
        .join("");
    };

    const choiceMarkup = (item, group, selected, kind) => {
      const glyph =
        kind === "shape"
          ? shapeGlyph(item.id)
          : kind === "corner"
            ? cornerGlyph(item.id)
            : kind === "cut"
              ? cutGlyph(item.id)
              : kind === "lensType"
                ? lensTypeGlyph(item.id)
                : designGlyph(item.id);
      return `<button type="button" class="jp-studio-choice jp-studio-choice--${kind}${selected ? " is-selected" : ""}" data-jp-choice="${group}" data-jp-choice-value="${escapeHtml(item.id)}" aria-pressed="${selected}">
        <span class="jp-studio-choice__glyph" aria-hidden="true">${glyph}</span>
        <span class="jp-studio-choice__copy">
          <strong>${escapeHtml(item.name)}</strong>
          ${item.meta ? `<small>${escapeHtml(item.meta)}</small>` : ""}
        </span>
        ${item.price ? `<span class="jp-studio-choice__price">${escapeHtml(moneyWithSign(item.price))}</span>` : ""}
        <span class="jp-studio-check" aria-hidden="true">✓</span>
      </button>`;
    };

    const swatchMarkup = (item, group, selected, kind) => {
      const color = customizerStudioHex(item.color, "#d6d1ca");
      const light = customizerStudioMix(color, "#ffffff", 0.45);
      return `<button type="button" class="jp-studio-swatch${selected ? " is-selected" : ""}${kind === "finish" ? " jp-studio-swatch--finish" : ""}" data-jp-choice="${group}" data-jp-choice-value="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.name)}${item.price ? `, ${escapeHtml(moneyWithSign(item.price))}` : ", included"}" aria-pressed="${selected}">
        <span class="jp-studio-swatch__dot" style="--swatch:${color};--swatch-light:${light}" aria-hidden="true"></span>
        <span class="jp-studio-swatch__copy"><strong>${escapeHtml(item.name)}</strong>${item.price ? `<small>${escapeHtml(moneyWithSign(item.price))}</small>` : ""}</span>
        <span class="jp-studio-check" aria-hidden="true">✓</span>
      </button>`;
    };

    const toggleMarkup = (item, group, selected) => {
      const visual = item.visual !== false;
      return `<button type="button" class="jp-studio-toggle${selected ? " is-selected" : ""}" data-jp-choice="${group}" data-jp-choice-value="${escapeHtml(item.id)}" aria-pressed="${selected}">
        <span class="jp-studio-toggle__check" aria-hidden="true">✓</span>
        <span class="jp-studio-toggle__copy">
          <strong>${escapeHtml(item.name)}</strong>
          <small>${escapeHtml(item.meta || "")}</small>
          ${visual ? "" : '<em class="jp-studio-no-visual">No visual change</em>'}
        </span>
        <span class="jp-studio-toggle__price">${item.price ? escapeHtml(moneyWithSign(item.price)) : "Included"}</span>
      </button>`;
    };

    const stepNavMarkup = () =>
      STEPS.map(
        (step, index) =>
          `<button type="button" class="jp-studio-step${index === 0 ? " is-active" : ""}" data-jp-step="${step.id}" aria-current="${index === 0 ? "step" : "false"}">
            <span class="jp-studio-step__icon" aria-hidden="true">${step.icon}</span>
            <span class="jp-studio-step__label">${step.label}</span>
            <i class="jp-studio-step__dot" aria-hidden="true"></i>
          </button>`,
      ).join("");

    const chipMarkup = (current) => {
      const chips = [
        { step: "frame", label: current.frame.name, meta: "Frame" },
        { step: "lens", label: current.lens.name, meta: "Lens" },
        { step: "design", label: current.shape.name, meta: "Shape" },
        { step: "cuts", label: current.cut.name, meta: "Cut" },
        { step: "corners", label: current.corner.name, meta: "Corners" },
        { step: "color", label: current.color.name, meta: "Color" },
      ];
      if (current.protection.length) {
        chips.push({
          step: "protection",
          label: `${current.protection.length} protection`,
          meta: "Protection",
        });
      }
      if (state.engraving.trim()) {
        chips.push({
          step: "engraving",
          label: `“${state.engraving.trim()}”`,
          meta: "Engraving",
        });
      }
      return chips
        .map(
          (chip) =>
            `<button type="button" class="jp-studio-chip" data-jp-chip-step="${chip.step}"><span>${escapeHtml(chip.meta)}</span><strong>${escapeHtml(chip.label)}</strong></button>`,
        )
        .join("");
    };

    const orderLineMarkup = (current, currency) =>
      current.lineItems
        .filter((item) => item.base || item.amount > 0)
        .map(
          (item) =>
            `<div><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(
              item.base ? customizerMoney(item.amount, currency) : moneyWithSign(item.amount, currency),
            )}</strong></div>`,
        )
        .join("");

    const renderShell = () => {
      const current = selection();
      if (!current.frame || !current.lens) {
        customizer.innerHTML =
          '<p class="jp-customizer__error">This frame has no compatible lenses yet. Please choose another frame.</p>';
        return;
      }
      const frameTypes = ["All", ...new Set((customizerData.frames || []).map((item) => String(item.frameType || "Eyewear")))];
      const frameStyles = ["All", ...new Set((customizerData.frames || []).map((item) => String(item.style || "Classic")))];
      const currency = current.frame.currency || current.lens.currency || "USD";
      const previewSettings = {
        ...state,
        lensColorCode: current.color.color,
        lensOpacity: current.lens.tintOpacity,
        lensColorName: current.color.name,
        lensShapeName: current.shape.name,
      };

      customizer.innerHTML = `
        <div class="jp-studio-head">
          <div class="jp-studio-head__copy">
            <span class="jp-studio-eyebrow">JP Atelier · Made to order</span>
            <h1 id="jp-customizer-title">Build your pair</h1>
            <p>Start with a frame. Shape every detail until it feels unmistakably yours.</p>
          </div>
          <div class="jp-studio-head__meta">
            <span class="jp-studio-live"><i aria-hidden="true"></i> Live preview</span>
            <span class="jp-studio-saved" data-jp-saved>Selections saved automatically</span>
          </div>
        </div>
        <div class="jp-studio-layout">
          <div class="jp-studio-visual">
            <div class="jp-studio-visual__top">
              <div class="jp-studio-visual__label"><span>Now viewing</span><strong data-jp-frame-name>${escapeHtml(current.frame.name)}</strong></div>
              <span class="jp-studio-visual__meta" data-jp-frame-meta>${escapeHtml(current.frame.style || "Classic")} · ${escapeHtml(current.frame.frameType || "Eyewear")}</span>
            </div>
            <div class="jp-studio-mount" data-jp-preview-mount>${customizerPreviewPro(current.frame, current.lens, previewSettings)}</div>
            <div class="jp-studio-visual__under">
              <div class="jp-studio-view">
                <button type="button" data-jp-preview-action="zoom-out" aria-label="Zoom out">−</button>
                <span data-jp-zoom-label>${Math.round(state.viewZoom * 100)}%</span>
                <button type="button" data-jp-preview-action="zoom-in" aria-label="Zoom in">+</button>
                <button type="button" class="jp-studio-view__reset" data-jp-preview-action="reset">Reset view</button>
              </div>
              <div class="jp-studio-chips" data-jp-chips>${chipMarkup(current)}</div>
            </div>
            <div class="jp-studio-visual__foot">
              <div class="jp-studio-visual__detail">
                <span data-jp-lens-summary>${escapeHtml(`${current.color.name} lens · ${current.shape.name} · ${current.cut.name} cut`)}</span>
                <small data-jp-live-note>${liveNote(current)}</small>
              </div>
              <strong data-jp-live-total>${escapeHtml(customizerMoney(current.total, currency))}</strong>
            </div>
          </div>
          <div class="jp-studio-controls">
            <div class="jp-studio-steps-wrap">
              <nav class="jp-studio-steps" aria-label="Customization steps">${stepNavMarkup()}</nav>
            </div>
            <div class="jp-studio-panels">
              <section class="jp-studio-panel" data-jp-panel="frame">
                <header class="jp-studio-panel__head"><div><span>01</span><h2>Frame</h2></div><small data-jp-frame-count>${visibleFrames().length} frames</small></header>
                <p class="jp-studio-panel__lede">Choose the silhouette that starts it all.</p>
                <div class="jp-studio-filters">
                  <label>Type<select data-jp-filter-type>${frameTypes.map((value) => `<option value="${escapeHtml(value)}"${value === state.frameType ? " selected" : ""}>${escapeHtml(value)}</option>`).join("")}</select></label>
                  <label>Style<select data-jp-filter-style>${frameStyles.map((value) => `<option value="${escapeHtml(value)}"${value === state.frameStyle ? " selected" : ""}>${escapeHtml(value)}</option>`).join("")}</select></label>
                </div>
                <div class="jp-studio-frame-grid" data-jp-frame-grid>${frameGridMarkup()}</div>
                <button type="button" class="jp-studio-more" data-jp-show-all${visibleFrames().length <= 8 ? " hidden" : ""}>${state.showAllFrames ? "Show fewer frames" : `View all ${visibleFrames().length} frames`}</button>
                <div class="jp-studio-subhead"><span>Frame finish</span><small>Metal tone</small></div>
                <div class="jp-studio-swatches">${options.finishes.map((item) => swatchMarkup(item, "frameFinish", item.id === state.frameFinish, "finish")).join("")}</div>
              </section>
              <section class="jp-studio-panel" data-jp-panel="lens">
                <header class="jp-studio-panel__head"><div><span>02</span><h2>Lens</h2></div><small data-jp-lens-count>${getLenses().length} compatible</small></header>
                <p class="jp-studio-panel__lede">Start with the lens technology that fits your days.</p>
                <div class="jp-studio-lens-grid" data-jp-lens-grid>${lensGridMarkup()}</div>
                <div class="jp-studio-subhead"><span>Lens type</span><small>Optical or sun</small></div>
                <div class="jp-studio-choice-grid jp-studio-choice-grid--three">${options.lensTypes.map((item) => choiceMarkup(item, "lensType", item.id === state.lensType, "lensType")).join("")}</div>
                <div class="jp-studio-prescription" data-jp-prescription></div>
              </section>
              <section class="jp-studio-panel" data-jp-panel="design">
                <header class="jp-studio-panel__head"><div><span>03</span><h2>Design</h2></div><small>${options.shapes.length} shapes</small></header>
                <p class="jp-studio-panel__lede">Sculpt the outline, then choose the edge character.</p>
                <div class="jp-studio-subhead"><span>Lens shape</span><small>Silhouette</small></div>
                <div class="jp-studio-shape-grid">${options.shapes.map((item) => choiceMarkup(item, "lensShape", item.id === state.lensShape, "shape")).join("")}</div>
                <div class="jp-studio-subhead"><span>Edge character</span><small>Design</small></div>
                <div class="jp-studio-choice-grid jp-studio-choice-grid--two">${options.designs.map((item) => choiceMarkup(item, "lensDesign", item.id === state.lensDesign, "design")).join("")}</div>
              </section>
              <section class="jp-studio-panel" data-jp-panel="cuts">
                <header class="jp-studio-panel__head"><div><span>04</span><h2>Lens cuts</h2></div><small>${options.cuts.length} finishes</small></header>
                <p class="jp-studio-panel__lede">A fine edge changes how light travels across the lens.</p>
                <div class="jp-studio-choice-grid">${options.cuts.map((item) => choiceMarkup(item, "lensCut", item.id === state.lensCut, "cut")).join("")}</div>
              </section>
              <section class="jp-studio-panel" data-jp-panel="corners">
                <header class="jp-studio-panel__head"><div><span>05</span><h2>Corners</h2></div><small>${options.corners.length} signatures</small></header>
                <p class="jp-studio-panel__lede">Soft, sharp or sculpted — the corners set the temperament.</p>
                <div class="jp-studio-corner-grid">${options.corners.map((item) => choiceMarkup(item, "cornerStyle", item.id === state.cornerStyle, "corner")).join("")}</div>
              </section>
              <section class="jp-studio-panel" data-jp-panel="color">
                <header class="jp-studio-panel__head"><div><span>06</span><h2>Lens color</h2></div><small>Instantly visualized</small></header>
                <p class="jp-studio-panel__lede">Every tint is applied to the live preview as you choose.</p>
                <div class="jp-studio-swatches jp-studio-swatches--lens">${options.colors.map((item) => swatchMarkup(item, "lensColor", item.id === state.lensColor, "color")).join("")}</div>
              </section>
              <section class="jp-studio-panel" data-jp-panel="protection">
                <header class="jp-studio-panel__head"><div><span>07</span><h2>Protection</h2></div><small>Choose one or more</small></header>
                <p class="jp-studio-panel__lede">Optical properties that change how the lens performs.</p>
                <div class="jp-studio-toggle-list">${options.protections.map((item) => toggleMarkup(item, "protectionIds", state.protectionIds.includes(String(item.id)))).join("")}</div>
                <p class="jp-studio-note">Options marked “No visual change” are optical or durability upgrades — they do not alter the frame’s appearance.</p>
              </section>
              <section class="jp-studio-panel" data-jp-panel="engraving">
                <header class="jp-studio-panel__head"><div><span>08</span><h2>Engraving</h2></div><small>Make it yours</small></header>
                <p class="jp-studio-panel__lede">A quiet signature, etched into the frame.</p>
                <label class="jp-studio-field">Engraving text <span>Up to 16 characters · ${escapeHtml(moneyWithSign(options.engravingPrice, currency))}</span><input type="text" maxlength="16" value="${escapeHtml(state.engraving)}" data-jp-engraving placeholder="Your initials or a quiet signature"></label>
                <label class="jp-studio-field">Position<select data-jp-engraving-position><option value="temple"${state.engravingPosition === "temple" ? " selected" : ""}>Outer temple</option><option value="bridge"${state.engravingPosition === "bridge" ? " selected" : ""}>Bridge</option><option value="inner-rim"${state.engravingPosition === "inner-rim" ? " selected" : ""}>Inner rim</option></select></label>
                <div class="jp-studio-subhead"><span>After-wear</span><small>Complimentary + upgrades</small></div>
                <div class="jp-studio-toggle-list">${options.afterWear.map((item) => toggleMarkup(item, "afterWearIds", state.afterWearIds.includes(String(item.id)))).join("")}</div>
              </section>
            </div>
            <div class="jp-studio-actions">
              <button type="button" class="jp-studio-reset" data-jp-reset>Reset customization</button>
              <button type="button" class="jp-studio-compare" data-jp-compare${state.comparisons.length >= 3 ? " disabled" : ""}>${state.comparisons.length >= 3 ? "Comparison saved" : "Save to compare"}</button>
              <button type="button" class="jp-studio-add" data-jp-add>Add pair to bag <span data-jp-live-total>${escapeHtml(customizerMoney(current.total, currency))}</span></button>
            </div>
            <div data-jp-comparisons></div>
            <aside class="jp-studio-order">
              <div class="jp-studio-order__head">
                <div><span>Made to order</span><h2>Good things take a little intention.</h2></div>
                <strong data-jp-live-total>${escapeHtml(customizerMoney(current.total, currency))}</strong>
              </div>
              <div class="jp-studio-order__lines" data-jp-lines>${orderLineMarkup(current, currency)}</div>
              <p class="jp-studio-order__note" data-jp-live-note>${liveNote(current)}</p>
            </aside>
          </div>
        </div>
        <div class="jp-studio-announcer" aria-live="polite" data-jp-announcer></div>
      `;
      bindPreview();
      renderPrescription();
      renderComparisons();
      syncPanels();
      syncUI();
    };

    const renderPreview = () => {
      const scene = customizer.querySelector("[data-jp-preview-scene]");
      const current = selection();
      if (!scene || !current.frame || !current.lens) return;
      scene.innerHTML = customizerStudioSvg(current.frame, current.lens, {
        ...state,
        lensColorCode: current.color.color,
        lensOpacity: current.lens.tintOpacity,
        lensColorName: current.color.name,
        lensShapeName: current.shape.name,
      });
      applyView();
    };

    const applyView = () => {
      const scene = customizer.querySelector("[data-jp-preview-scene]");
      if (!scene) return;
      scene.style.setProperty("--preview-rotate", `${state.viewRotation}deg`);
      scene.style.setProperty("--preview-tilt", `${state.viewTilt}deg`);
      scene.style.setProperty("--preview-scale", String(state.viewZoom));
      const label = customizer.querySelector("[data-jp-zoom-label]");
      if (label) label.textContent = `${Math.round(state.viewZoom * 100)}%`;
    };

    const updateEngraving = () => {
      const text = state.engraving.trim().slice(0, 16);
      const element = customizer.querySelector("[data-jp-preview-mount] [data-jp-engraving-svg]");
      if (!element) return;
      element.textContent = text;
      element.setAttribute("opacity", text ? "1" : "0");
    };

    const liveNote = (current) => {
      const paid = current.lineItems.filter((item) => !item.base && item.amount > 0).length;
      const included = current.lineItems.filter((item) => !item.base && item.amount === 0).length;
      return `${paid} paid upgrade${paid === 1 ? "" : "s"} · ${included} included`;
    };

    const syncPanels = () => {
      customizer.querySelectorAll("[data-jp-panel]").forEach((panel) => {
        const isActive = panel.dataset.jpPanel === activeStep;
        panel.hidden = !isActive;
        panel.classList.toggle("is-active", isActive);
      });
      customizer.querySelectorAll("[data-jp-step]").forEach((step) => {
        const isActive = step.dataset.jpStep === activeStep;
        step.classList.toggle("is-active", isActive);
        step.setAttribute("aria-current", isActive ? "step" : "false");
      });
    };

    const renderFrameGrid = () => {
      const grid = customizer.querySelector("[data-jp-frame-grid]");
      if (grid) grid.innerHTML = frameGridMarkup();
      const count = customizer.querySelector("[data-jp-frame-count]");
      if (count) count.textContent = `${visibleFrames().length} frames`;
      const more = customizer.querySelector("[data-jp-show-all]");
      if (more) {
        more.hidden = visibleFrames().length <= 8;
        more.textContent = state.showAllFrames
          ? "Show fewer frames"
          : `View all ${visibleFrames().length} frames`;
      }
    };

    const renderLensGrid = () => {
      const grid = customizer.querySelector("[data-jp-lens-grid]");
      if (grid) grid.innerHTML = lensGridMarkup();
      const count = customizer.querySelector("[data-jp-lens-count]");
      if (count) count.textContent = `${getLenses().length} compatible`;
    };

    const renderPrescription = () => {
      const container = customizer.querySelector("[data-jp-prescription]");
      if (!container) return;
      if (container.dataset.jpLensType === state.lensType) return;
      container.dataset.jpLensType = state.lensType;
      container.innerHTML =
        state.lensType === "prescription"
          ? `<div class="jp-studio-rx">
              <label>Left eye<input type="number" min="-20" max="20" step="0.25" value="${escapeHtml(state.prescriptionLeft)}" data-jp-prescription="left" placeholder="−2.00"></label>
              <label>Right eye<input type="number" min="-20" max="20" step="0.25" value="${escapeHtml(state.prescriptionRight)}" data-jp-prescription="right" placeholder="−2.00"></label>
              <p>Enter a simple sphere power. We’ll confirm your full prescription after checkout.</p>
            </div>`
          : "";
    };

    const renderComparisons = () => {
      const container = customizer.querySelector("[data-jp-comparisons]");
      if (!container) return;
      const frame = getFrame();
      const lens = getLens();
      const currency = frame?.currency || lens?.currency || "USD";
      if (!state.comparisons.length) {
        container.innerHTML = "";
        return;
      }
      container.innerHTML = `<div class="jp-studio-compare-list">
        <div class="jp-studio-subhead"><span>Compare combinations</span><small>${state.comparisons.length}/3 saved</small></div>
        <div class="jp-studio-compare-grid">
          ${state.comparisons
            .map((item, index) => {
              const compareFrame = customizerData?.frames?.find((candidate) => String(candidate.id) === String(item.frameId));
              const compareLens = customizerData?.lenses?.find((candidate) => String(candidate.id) === String(item.lensId));
              if (!compareFrame || !compareLens) return "";
              const settings = item.settings || {};
              return `<article class="jp-studio-compare-card">
                <button type="button" class="jp-studio-compare-remove" data-jp-compare-remove="${index}" aria-label="Remove comparison">Remove</button>
                <div class="jp-studio-compare-visual">${customizerPreviewPro(compareFrame, compareLens, settings, true)}</div>
                <strong>${escapeHtml(compareFrame.name)}</strong>
                <small>${escapeHtml(settings.lensColorName || compareLens.name)} · ${escapeHtml(customizerMoney(item.total, currency))}</small>
              </article>`;
            })
            .join("")}
        </div>
      </div>`;
    };

    const syncUI = () => {
      const current = selection();
      if (!current.frame || !current.lens) return;
      const currency = current.frame.currency || current.lens.currency || "USD";
      customizer.querySelectorAll("[data-jp-live-total]").forEach((element) => {
        element.textContent = customizerMoney(current.total, currency);
      });
      customizer.querySelectorAll("[data-jp-live-note]").forEach((element) => {
        element.textContent = liveNote(current);
      });
      const frameName = customizer.querySelector("[data-jp-frame-name]");
      if (frameName) frameName.textContent = current.frame.name;
      const frameMeta = customizer.querySelector("[data-jp-frame-meta]");
      if (frameMeta) {
        frameMeta.textContent = `${current.frame.style || "Classic"} · ${current.frame.frameType || "Eyewear"}`;
      }
      const lensSummary = customizer.querySelector("[data-jp-lens-summary]");
      if (lensSummary) {
        lensSummary.textContent = `${current.color.name} lens · ${current.shape.name} · ${current.cut.name} cut`;
      }
      const chips = customizer.querySelector("[data-jp-chips]");
      if (chips) chips.innerHTML = chipMarkup(current);
      const lines = customizer.querySelector("[data-jp-lines]");
      if (lines) lines.innerHTML = orderLineMarkup(current, currency);
      const compare = customizer.querySelector("[data-jp-compare]");
      if (compare) {
        compare.disabled = state.comparisons.length >= 3;
        compare.textContent = state.comparisons.length >= 3 ? "Comparison saved" : "Save to compare";
      }
      const frameCount = customizer.querySelector("[data-jp-frame-count]");
      if (frameCount) frameCount.textContent = `${visibleFrames().length} frames`;
      const lensCount = customizer.querySelector("[data-jp-lens-count]");
      if (lensCount) lensCount.textContent = `${getLenses().length} compatible`;
      customizer.querySelectorAll("[data-jp-choice]").forEach((button) => {
        const group = button.dataset.jpChoice;
        const value = button.dataset.jpChoiceValue;
        const selected = Array.isArray(state[group])
          ? state[group].map(String).includes(String(value))
          : String(state[group]) === String(value);
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
      customizer.querySelectorAll("[data-jp-frame]").forEach((button) => {
        const selected = String(button.dataset.jpFrame) === String(state.frameId);
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
      customizer.querySelectorAll("[data-jp-lens]").forEach((button) => {
        const selected = String(button.dataset.jpLens) === String(state.lensId);
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
      const customized = {
        frame: state.frameFinish !== "original",
        lens: state.lensType !== "non-prescription",
        design: state.lensShape !== "soft-square" || state.lensDesign !== "regular",
        cuts: state.lensCut !== "classic",
        corners: state.cornerStyle !== "soft",
        color: state.lensColor !== "clear" || state.lensColorTouched,
        protection: state.protectionIds.length > 1,
        engraving: Boolean(state.engraving.trim()) || state.afterWearIds.length > 1,
      };
      customizer.querySelectorAll("[data-jp-step]").forEach((step) => {
        step.classList.toggle("has-selection", Boolean(customized[step.dataset.jpStep]));
      });
      if (lastLensType !== state.lensType) {
        lastLensType = state.lensType;
        renderPrescription();
      }
    };

    const commit = ({ preview = true, frameGrid = false, lensGrid = false, comparisons = false } = {}) => {
      if (frameGrid) renderFrameGrid();
      if (lensGrid) renderLensGrid();
      if (comparisons) renderComparisons();
      if (preview) renderPreview();
      syncUI();
      persist();
      const announcer = customizer.querySelector("[data-jp-announcer]");
      if (announcer) {
        const current = selection();
        if (current.frame && current.lens) {
          announcer.textContent = `Preview updated. ${current.frame.name}, ${current.shape.name} shape, ${current.cut.name} cut, ${current.corner.name} corners, ${current.color.name} lens.`;
        }
      }
    };

    const goToStep = (step, scroll = false) => {
      if (!step) return;
      activeStep = step;
      syncPanels();
      if (!scroll) return;
      const controls = customizer.querySelector(".jp-studio-controls");
      if (!controls) return;
      if (window.matchMedia("(max-width: 1180px)").matches) {
        controls.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        controls.scrollTo({ top: 0, behavior: "smooth" });
      }
    };

    const bindPreview = () => {
      const stage = customizer.querySelector("[data-jp-preview-stage]");
      if (!stage) return;
      stage.setAttribute("tabindex", "0");
      let dragging = false;
      let startX = 0;
      let startY = 0;
      let startRotation = 0;
      let startTilt = 0;
      stage.addEventListener("pointerdown", (event) => {
        if (event.target.closest("[data-jp-preview-action]")) return;
        dragging = true;
        startX = event.clientX;
        startY = event.clientY;
        startRotation = state.viewRotation;
        startTilt = state.viewTilt;
        stage.setPointerCapture?.(event.pointerId);
        stage.classList.add("is-dragging");
      });
      stage.addEventListener("pointermove", (event) => {
        if (!dragging) return;
        state.viewRotation = startRotation + (event.clientX - startX) * 0.45;
        state.viewTilt = customizerStudioClamp(startTilt - (event.clientY - startY) * 0.22, -18, 18);
        applyView();
      });
      const stop = (event) => {
        if (!dragging) return;
        dragging = false;
        stage.releasePointerCapture?.(event.pointerId);
        stage.classList.remove("is-dragging");
        persist();
      };
      stage.addEventListener("pointerup", stop);
      stage.addEventListener("pointercancel", stop);
      stage.addEventListener(
        "wheel",
        (event) => {
          event.preventDefault();
          state.viewZoom = customizerStudioClamp(
            state.viewZoom + (event.deltaY > 0 ? -0.05 : 0.05),
            0.78,
            1.55,
          );
          applyView();
          persist();
        },
        { passive: false },
      );
      stage.addEventListener("keydown", (event) => {
        if (event.key === "ArrowLeft") state.viewRotation -= 6;
        else if (event.key === "ArrowRight") state.viewRotation += 6;
        else if (event.key === "ArrowUp") state.viewTilt = customizerStudioClamp(state.viewTilt - 4, -18, 18);
        else if (event.key === "ArrowDown") state.viewTilt = customizerStudioClamp(state.viewTilt + 4, -18, 18);
        else if (event.key === "+" || event.key === "=") state.viewZoom = customizerStudioClamp(state.viewZoom + 0.06, 0.78, 1.55);
        else if (event.key === "-" || event.key === "_") state.viewZoom = customizerStudioClamp(state.viewZoom - 0.06, 0.78, 1.55);
        else if (event.key === "0") Object.assign(state, { viewRotation: 0, viewTilt: 0, viewZoom: 1 });
        else return;
        event.preventDefault();
        applyView();
        persist();
      });
    };

    customizer.addEventListener("click", (event) => {
      const step = event.target.closest("[data-jp-step]");
      if (step) {
        goToStep(step.dataset.jpStep, true);
        return;
      }
      const chip = event.target.closest("[data-jp-chip-step]");
      if (chip) {
        goToStep(chip.dataset.jpChipStep, true);
        return;
      }
      const action = event.target.closest("[data-jp-preview-action]");
      if (action) {
        const value = action.dataset.jpPreviewAction;
        if (value === "zoom-in") state.viewZoom = customizerStudioClamp(state.viewZoom + 0.08, 0.78, 1.55);
        if (value === "zoom-out") state.viewZoom = customizerStudioClamp(state.viewZoom - 0.08, 0.78, 1.55);
        if (value === "reset") Object.assign(state, { viewRotation: 0, viewTilt: 0, viewZoom: 1 });
        if (value === "fullscreen") {
          const stage = customizer.querySelector("[data-jp-preview-stage]");
          if (document.fullscreenElement) document.exitFullscreen?.();
          else stage?.requestFullscreen?.();
        }
        applyView();
        persist();
        return;
      }
      const frameCard = event.target.closest("[data-jp-frame]");
      if (frameCard) {
        state.frameId = String(frameCard.dataset.jpFrame);
        ensureSelection();
        if (!state.lensColorTouched) state.lensColor = mapLensColor(getLens());
        commit({ preview: true, frameGrid: true, lensGrid: true });
        return;
      }
      const lensCard = event.target.closest("[data-jp-lens]");
      if (lensCard) {
        state.lensId = String(lensCard.dataset.jpLens);
        if (!state.lensColorTouched) state.lensColor = mapLensColor(getLens());
        commit({ preview: true, lensGrid: true });
        return;
      }
      const choice = event.target.closest("[data-jp-choice]");
      if (choice) {
        const group = choice.dataset.jpChoice;
        const value = choice.dataset.jpChoiceValue;
        if (group === "protectionIds" || group === "afterWearIds") {
          const list = Array.isArray(state[group]) ? [...state[group]] : [];
          const index = list.indexOf(value);
          if (index >= 0) {
            if (list.length > 1) list.splice(index, 1);
          } else {
            list.push(value);
          }
          state[group] = list;
        } else {
          state[group] = value;
          if (group === "lensColor") state.lensColorTouched = true;
        }
        commit({ preview: true });
        return;
      }
      if (event.target.closest("[data-jp-show-all]")) {
        state.showAllFrames = !state.showAllFrames;
        renderFrameGrid();
        syncUI();
        persist();
        return;
      }
      if (event.target.closest("[data-jp-reset]")) {
        const frameId = state.frameId;
        const lensId = state.lensId;
        state = resetState();
        state.frameId = frameId;
        state.lensId = lensId;
        ensureSelection();
        commit({ preview: true, frameGrid: true, lensGrid: true, comparisons: true });
        showToast("Customization reset");
        return;
      }
      if (event.target.closest("[data-jp-compare]")) {
        const current = selection();
        if (current.frame && current.lens && state.comparisons.length < 3) {
          state.comparisons.push({
            frameId: current.frame.id,
            lensId: current.lens.id,
            total: current.total,
            settings: {
              ...state,
              comparisons: [],
              lensColorCode: current.color.color,
              lensOpacity: current.lens.tintOpacity,
              lensColorName: current.color.name,
              lensShapeName: current.shape.name,
            },
          });
          renderComparisons();
          syncUI();
          persist();
          showToast("Combination saved for comparison");
        }
        return;
      }
      const remove = event.target.closest("[data-jp-compare-remove]");
      if (remove) {
        state.comparisons.splice(Number(remove.dataset.jpCompareRemove), 1);
        renderComparisons();
        syncUI();
        persist();
        return;
      }
      if (event.target.closest("[data-jp-add]")) {
        const current = selection();
        if (!current.frame || !current.lens) return;
        const currency = current.frame.currency || current.lens.currency || "USD";
        const frameProductId = Number(current.frame.productId || productId || 0);
        if (!frameProductId) {
          showToast("This frame is not linked to a product yet.");
          return;
        }
        const prescription =
          current.lensType.id === "prescription"
            ? { left: state.prescriptionLeft, right: state.prescriptionRight }
            : null;
        const customization = {
          frameId: current.frame.id,
          frameName: current.frame.name,
          frameImageUrl: current.frame.imageUrl || "",
          frameLensMaskUrl: current.frame.lensMaskUrl || "",
          frameStyle: current.frame.style || "Classic",
          frameType: current.frame.frameType || "Eyewear",
          frameMaterial: current.frame.material || "",
          frameColor: current.frame.color || "",
          frameColorCode: current.frame.colorCode || "",
          frameMetadata: current.frame.metadata || null,
          frameFinishId: current.finish.id,
          frameFinish: current.finish.name,
          lensId: current.lens.id,
          lensName: current.lens.name,
          lensType: current.lensType.name,
          lensTypeId: current.lensType.id,
          lensColor: current.color.name,
          lensColorId: current.color.id,
          lensColorCode: current.color.color,
          lensOpacity: current.lens.tintOpacity,
          lensStyle: current.lens.style,
          lensShape: current.shape.id,
          lensShapeName: current.shape.name,
          lensDesign: current.design.id,
          lensDesignName: current.design.name,
          lensCut: current.cut.id,
          lensCutName: current.cut.name,
          cornerStyle: current.corner.id,
          cornerName: current.corner.name,
          protectionIds: [...state.protectionIds],
          protections: current.protection.map((item) => item.name),
          prescription,
          engraving: state.engraving.trim(),
          engravingPosition: state.engravingPosition,
          afterWearIds: [...state.afterWearIds],
          afterWear: current.extras.map((item) => item.name),
          breakdown: current.lineItems.map(({ label, amount, base }) => ({ label, amount, base })),
          total: current.total,
          currency,
          view: {
            rotation: state.viewRotation,
            tilt: state.viewTilt,
            zoom: state.viewZoom,
          },
        };
        const requirements = [
          `Frame: ${current.frame.name}`,
          `Finish: ${current.finish.name}`,
          `Lens: ${current.lens.name}`,
          `Type: ${current.lensType.name}`,
          prescription ? `Prescription L ${state.prescriptionLeft || "—"} / R ${state.prescriptionRight || "—"}` : "",
          `Shape: ${current.shape.name}`,
          `Design: ${current.design.name}`,
          `Cut: ${current.cut.name}`,
          `Corners: ${current.corner.name}`,
          `Color: ${current.color.name}`,
          `Protection: ${current.protection.map((item) => item.name).join(", ")}`,
          state.engraving.trim()
            ? `Engraving: “${state.engraving.trim()}” on ${state.engravingPosition}`
            : "",
          `After-wear: ${current.extras.map((item) => item.name).join(", ")}`,
        ]
          .filter(Boolean)
          .join(" · ");
        const url = current.frame.productUrl || `/product/${frameProductId}`;
        const signature = JSON.stringify(customization);
        const cart = readCart();
        const existing = cart.find((item) => item.customizer?.signature === signature);
        if (existing) {
          existing.quantity = Number(existing.quantity || 0) + 1;
        } else {
          cart.push({
            name: `${current.frame.name} / ${current.color.name} ${current.shape.name}`,
            url,
            quantity: 1,
            image: current.frame.imageUrl || "",
            price: customizerMoney(current.total, currency),
            priceValue: current.total,
            requirements,
            customizer: { ...customization, signature },
          });
        }
        writeCart(cart);
        updateCartBadge();
        showToast(`${current.frame.name} added to your bag`);
        return;
      }
    });

    customizer.addEventListener("change", (event) => {
      const target = event.target;
      if (target.matches("[data-jp-filter-type]")) state.frameType = target.value;
      if (target.matches("[data-jp-filter-style]")) state.frameStyle = target.value;
      if (target.matches("[data-jp-engraving-position]")) {
        state.engravingPosition = target.value;
        commit({ preview: true });
        return;
      }
      if (target.matches("[data-jp-prescription]")) {
        state[target.dataset.jpPrescription === "left" ? "prescriptionLeft" : "prescriptionRight"] =
          target.value;
        persist();
        return;
      }
      if (target.matches("[data-jp-filter-type], [data-jp-filter-style]")) {
        state.showAllFrames = false;
        renderFrameGrid();
        syncUI();
        persist();
      }
    });

    customizer.addEventListener("input", (event) => {
      const target = event.target;
      if (target.matches("[data-jp-engraving]")) {
        state.engraving = target.value.slice(0, 16);
        updateEngraving();
        syncUI();
        persist();
      }
      if (target.matches("[data-jp-prescription]")) {
        state[target.dataset.jpPrescription === "left" ? "prescriptionLeft" : "prescriptionRight"] =
          target.value;
        persist();
      }
    });

    fetch("/api/customizer", { credentials: "same-origin" })
      .then((response) => {
        if (!response.ok) throw new Error("Customizer unavailable");
        return response.json();
      })
      .then((payload) => {
        customizerData = {
          frames: Array.isArray(payload.frames) ? payload.frames : [],
          lenses: Array.isArray(payload.lenses) ? payload.lenses : [],
          compatibility:
            payload.compatibility && typeof payload.compatibility === "object"
              ? payload.compatibility
              : {},
        };
        options = mergeOptions(payload.options);
        ensureSelection();
        if (!customizerData.frames.length || !customizerData.lenses.length) {
          customizer.innerHTML =
            '<p class="jp-customizer__error">Customization options are not available right now. Please try again shortly.</p>';
          return;
        }
        renderShell();
        persist();
      })
      .catch(() => {
        customizer.innerHTML =
          '<p class="jp-customizer__error">We could not load customization options. Refresh to try again.</p>';
      });
  };

  const setupCustomizerNavigation = () => {
    const productMatch = window.location.pathname.match(/^\/product\/(\d+)\/?$/);
    if (productMatch) {
      const productId = Number(productMatch[1]);
      const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
        /add prescription lenses/i.test(candidate.textContent.trim()),
      );
      if (button && !button.dataset.jpCustomizerEntry) {
        button.dataset.jpCustomizerEntry = "true";
        button.type = "button";
        button.textContent = "Customize frame & lenses";
        button.addEventListener("click", (event) => {
          event.preventDefault();
          window.location.href = `/customize?productId=${productId}`;
        });
      }
    }

    if (window.location.pathname !== "/customize") return;
    const back = document.querySelector("[data-jp-customizer-back]");
    if (!back) return;
    const productId = Number(new URLSearchParams(window.location.search).get("productId") || 0);
    back.setAttribute("href", productId ? `/product/${productId}` : "/shop");
    const label = back.querySelector("span");
    if (label) label.textContent = productId ? "Back to product" : "Back to eyewear";
  };

  const setupProductActions = () => {
    const productButtons = Array.from(document.querySelectorAll('button[aria-label^="Add "][aria-label$=" to bag"]'));
    if (window.location.pathname.startsWith("/product/")) {
      productButtons.push(...Array.from(document.querySelectorAll("button")).filter((button) => button.textContent.trim().toLowerCase() === "add to cart"));
    }
    productButtons.forEach((button) => {
      if (button.dataset.jpBound) return;
      button.dataset.jpBound = "true";
      button.type = "button";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const isDetailButton = button.textContent.trim().toLowerCase() === "add to cart";
        const variant = isDetailButton ? activeProductVariant : null;
        if (variant && Number.isInteger(Number(variant.stock)) && Number(variant.stock) <= 0) {
          showToast("That colourway is currently out of stock.");
          return;
        }
        const name = isDetailButton
          ? document.querySelector("main h1")?.textContent.trim() || "Item"
          : button.getAttribute("aria-label")?.replace(/^Add | to bag$/g, "") || "Item";
        const link = button.closest("a[href]");
        let url = link?.getAttribute("href") || `${window.location.pathname}${window.location.search}` || "/shop";
        if (variant?.id) {
          const parsed = new URL(url, window.location.origin);
          parsed.searchParams.set("variant_id", String(variant.id));
          url = parsed.pathname + (parsed.search ? parsed.search : "");
        }
        const image =
          variant?.image ||
          link?.querySelector("img")?.getAttribute("src") ||
          document.querySelector("main img[alt]")?.getAttribute("src") ||
          "";
        const price =
          variant?.price ||
          link?.querySelector("p:last-child span")?.textContent.trim() ||
          document.querySelector('main span[class*="text-[19px]"]')?.textContent.trim() ||
          "";
        const variantLabel = variant ? variantSummary(variant) : "";
        const requirements = isDetailButton
          ? String(document.querySelector("[data-jp-pdp-requirements]")?.value || "")
              .trim()
              .slice(0, 1000)
          : "";
        const cart = readCart();
        const existing = cart.find(
          (item) =>
            item.name === name &&
            item.url === url &&
            Number(item.variantId || 0) === Number(variant?.id || 0) &&
            String(item.requirements || "") === requirements,
        );
        if (existing) existing.quantity += 1;
        else
          cart.push({
            name,
            url,
            quantity: 1,
            image,
            price,
            ...(variant?.id ? { variantId: variant.id, sku: variant.sku || "" } : {}),
            ...(variantLabel ? { variantLabel } : {}),
            ...(requirements ? { requirements } : {}),
          });
        writeCart(cart);
        updateCartBadge();
        showToast(
          variantLabel ? `${name} — ${variantLabel} added to your bag` : `${name} added to your bag`,
        );
      });
    });
    updateCartBadge();
  };

  const parseMoney = (value) => {
    const amount = Number(String(value || "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(amount) ? amount : 0;
  };

  const money = (value) =>
    `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const setupCartPage = () => {
    if (window.location.pathname !== "/cart") return;
    const main = document.querySelector("main");
    const hero = document.querySelector("body > section") || document.querySelector("section");
    if (!main) return;
    main.classList.add("jp-cart-page");
    hero?.classList.add("jp-cart-hero");
    const heading = hero?.querySelector("h1");
    if (heading) heading.textContent = "Shopping bag";
    if (main.dataset.jpCartBound) return;
    main.dataset.jpCartBound = "true";
    let content = null;

    const render = (catalog = []) => {
      const cart = readCart().map((item) => {
        const product = catalog.find((candidate) => candidate.url === item.url || new URL(candidate.url, window.location.origin).pathname === new URL(item.url, window.location.origin).pathname);
        return {
          ...item,
          name: item.name || product?.name || "Product",
          image: item.image || product?.image || "/mirror-assets/placeholder.svg",
          price: item.price || product?.price || "$0.00",
          quantity: Math.max(1, Number(item.quantity) || 1),
        };
      });
      writeCart(cart);
      updateCartBadge();
      const count = cart.reduce((total, item) => total + item.quantity, 0);
      const subtotal = cart.reduce((total, item) => total + parseMoney(item.price) * item.quantity, 0);
      const delivery = content?.delivery;
      const freeShipping =
        delivery?.freeShippingThreshold !== null &&
        delivery?.freeShippingThreshold !== undefined &&
        subtotal >= Number(delivery.freeShippingThreshold);
      const shippingPrice = freeShipping
        ? 0
        : delivery
          ? Number(delivery.standardPrice || 0)
          : 0;
      const shippingLabel = delivery
        ? `${delivery.standardLabel || "Standard shipping"} (${delivery.standardDaysMin}-${delivery.standardDaysMax} business days)`
        : "Standard shipping (3-5 business days)";
      const taxNote = delivery?.taxNote || "Tax is calculated after payment";
      const total = subtotal + shippingPrice;
      const countLabel = `${count} ${count === 1 ? "item" : "items"}`;
      let heroCount = hero?.querySelector("[data-jp-cart-count]");
      if (!heroCount && heading) {
        heroCount = document.createElement("p");
        heroCount.className = "jp-cart-hero-count";
        heroCount.dataset.jpCartCount = "true";
        hero.appendChild(heroCount);
      }
      if (heroCount) heroCount.textContent = countLabel;

      if (!cart.length) {
        main.innerHTML = `<div class="jp-cart-empty"><p>Your bag is empty</p><a href="/shop">Continue shopping</a></div>`;
        return;
      }

      main.innerHTML = `
        <div class="jp-cart-layout">
          <section class="jp-cart-items" aria-label="Shopping bag items">
            ${cart.map((item, index) => {
              const customization = item.customizer && typeof item.customizer === "object" ? item.customizer : null;
              const meta = customization
                ? `${customization.frameName || "Selected frame"} · ${customization.lensName || "Selected lens"}`
                : item.variantLabel || "COLOR / STANDARD";
              const customizationDetails = customization
                ? `<div class="jp-cart-customization"><span>Frame</span><strong>${escapeHtml(customization.frameName || "Selected frame")}</strong><span>Lens</span><strong>${escapeHtml(customization.lensName || "Selected lens")}</strong>${item.requirements ? `<span>Requirements</span><strong class="jp-cart-requirements">${escapeHtml(item.requirements)}</strong>` : ""}</div>`
                : item.variantLabel || item.sku
                  ? `<div class="jp-cart-customization">${item.variantLabel ? `<span>Variant</span><strong>${escapeHtml(item.variantLabel)}</strong>` : ""}${item.sku ? `<span>SKU</span><strong>${escapeHtml(item.sku)}</strong>` : ""}${item.requirements ? `<span>Requirements</span><strong class="jp-cart-requirements">${escapeHtml(item.requirements)}</strong>` : ""}</div>`
                  : "";
              const requirementsDetails = !customization && item.requirements && !item.variantLabel && !item.sku
                ? `<div class="jp-cart-customization"><span>Requirements</span><strong class="jp-cart-requirements">${escapeHtml(item.requirements)}</strong></div>`
                : "";
              return `<article class="jp-cart-item${customization ? " jp-cart-item--customized" : ""}" data-jp-cart-index="${index}">
              <a class="jp-cart-image" href="${escapeHtml(item.url)}">${customizerCartPreview(item)}</a>
              <div class="jp-cart-info">
                <a class="jp-cart-name" href="${escapeHtml(item.url)}">${escapeHtml(item.name)}</a>
                <p class="jp-cart-meta">${escapeHtml(meta)}</p>
                ${customizationDetails}
                ${requirementsDetails}
                <div class="jp-cart-controls">
                  <div class="jp-cart-quantity" aria-label="Quantity for ${escapeHtml(item.name)}">
                    <button type="button" data-jp-cart-decrease aria-label="Decrease quantity">−</button>
                    <span>${item.quantity}</span>
                    <button type="button" data-jp-cart-increase aria-label="Increase quantity">+</button>
                  </div>
                  <button class="jp-cart-remove" type="button" data-jp-cart-remove>Remove</button>
                </div>
              </div>
              <p class="jp-cart-price">${escapeHtml(item.price)}</p>
            </article>`;
            }).join("")}
            <div class="jp-cart-actions"><button type="button" data-jp-cart-clear>Clear bag</button><a href="/lenses/19">Add prescription</a><a href="/shop">Continue shopping</a></div>
          </section>
          <aside class="jp-cart-summary" aria-label="Order summary">
            <h2>Order summary</h2>
            <div class="jp-cart-summary-row"><span>Subtotal</span><strong>${money(subtotal)}</strong></div>
            <div class="jp-cart-summary-row jp-cart-shipping"><span>Shipping<small>${escapeHtml(shippingLabel)}</small></span><strong>${money(shippingPrice)}</strong></div>
            <div class="jp-cart-total"><span>Total</span><strong>${money(total)}</strong></div>
            <button class="jp-cart-checkout" type="button" data-jp-cart-checkout>Proceed to checkout</button>
            <p class="jp-cart-tax">${escapeHtml(taxNote)}</p>
          </aside>
        </div>`;
      applyCustomizerPreviewMasks(main);
    };

    main.addEventListener("click", (event) => {
      const target = event.target.closest("[data-jp-cart-increase], [data-jp-cart-decrease], [data-jp-cart-remove], [data-jp-cart-clear], [data-jp-cart-checkout]");
      if (!target) return;
      event.preventDefault();
      const index = Number(target.closest("[data-jp-cart-index]")?.dataset.jpCartIndex);
      const cart = readCart();
      if (target.hasAttribute("data-jp-cart-increase") && cart[index]) cart[index].quantity = Number(cart[index].quantity || 0) + 1;
      if (target.hasAttribute("data-jp-cart-decrease") && cart[index]) cart[index].quantity = Number(cart[index].quantity || 0) - 1;
      if (target.hasAttribute("data-jp-cart-remove")) cart.splice(index, 1);
      if (target.hasAttribute("data-jp-cart-clear")) cart.length = 0;
      if (target.hasAttribute("data-jp-cart-checkout")) {
        const session = readSession();
        if (!session?.email) {
          showToast("Please sign in to place your order.");
          openAccount();
          return;
        }
        const items = cart
          .map((item) => {
            const match = String(item.url || "").match(/\/product\/(\d+)/);
            const customization = item.customizer && typeof item.customizer === "object" ? item.customizer : null;
            if (!match) return null;
            const customizerPayload = customization
              ? {
                  frameFinishId: customization.frameFinishId,
                  frameFinish: customization.frameFinish,
                  lensShape: customization.lensShape,
                  lensShapeName: customization.lensShapeName,
                  lensDesign: customization.lensDesign,
                  lensDesignName: customization.lensDesignName,
                  lensCut: customization.lensCut,
                  lensCutName: customization.lensCutName,
                  cornerStyle: customization.cornerStyle,
                  cornerName: customization.cornerName,
                  lensColorId: customization.lensColorId,
                  lensColor: customization.lensColor,
                  lensColorCode: customization.lensColorCode,
                  lensOpacity: customization.lensOpacity,
                  lensTypeId: customization.lensTypeId,
                  lensType: customization.lensType,
                  protectionIds: customization.protectionIds,
                  afterWearIds: customization.afterWearIds,
                  engraving: customization.engraving,
                  engravingPosition: customization.engravingPosition,
                  prescription: customization.prescription,
                  view: customization.view,
                  currency: customization.currency,
                }
              : null;
            return {
              productId: Number(match[1]),
              quantity: Math.max(1, Number(item.quantity) || 1),
              ...(Number(item.variantId) > 0 ? { variantId: Number(item.variantId) } : {}),
              ...(customizerUuid(customization?.frameId) && customizerUuid(customization?.lensId)
                ? {
                    customizerFrameId: customization.frameId,
                    customizerLensId: customization.lensId,
                  }
                : {}),
              ...(customizerPayload ? { customizer: customizerPayload } : {}),
              ...(item.requirements ? { requirements: String(item.requirements).slice(0, 1000) } : {}),
            };
          })
          .filter(Boolean);
        if (!items.length) {
          showToast("Your bag could not be matched to the catalog.");
          return;
        }
        target.disabled = true;
        target.textContent = "Placing order…";
        apiRequest("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: session.email, items }),
        })
          .then((result) => {
            writeCart([]);
            showToast(
              result.order?.orderNumber
                ? `Order ${result.order.orderNumber} placed. Thank you.`
                : "Order placed. Thank you.",
            );
            loadIndex().then((data) => render(data.products || []));
          })
          .catch((error) => {
            target.disabled = false;
            target.textContent = "Proceed to checkout";
            showToast(
              error.status === 503
                ? "Checkout is not connected in this preview."
                : error.message || "Could not place the order.",
            );
          });
        return;
      }
      writeCart(cart.filter((item) => Number(item.quantity || 0) > 0));
      loadIndex().then((data) => render(data.products || []));
    });

    loadIndex().then((data) => render(data.products || [])).catch(() => render());
    loadContent().then((loaded) => {
      if (!loaded?.delivery) return;
      content = loaded;
      loadIndex().then((data) => render(data.products || [])).catch(() => render());
    });
  };

  const setupCarousels = () => {
    document.querySelectorAll('[role="region"][aria-roledescription="carousel"]').forEach((region) => {
      if (region.dataset.jpBound) return;
      const viewport = region.querySelector(":scope > .overflow-hidden");
      const track = viewport?.firstElementChild;
      let slides = track ? Array.from(track.children) : [];
      if (!viewport || !track || !slides.length) return;
      region.dataset.jpBound = "true";
      region.tabIndex = 0;
      let offset = 0;
      let maxOffset = 0;
      let slideWidth = 0;
      let dragging = false;
      let pointerId = null;
      let startX = 0;
      let startY = 0;
      let startOffset = 0;
      let suppressClick = false;

      const measure = () => {
        slides = Array.from(track.children);
        slideWidth = slides[0].getBoundingClientRect().width || viewport.clientWidth;
        maxOffset = Math.max(0, track.scrollWidth - viewport.clientWidth);
        offset = Math.min(offset, maxOffset);
      };
      const apply = (animate) => {
        track.style.transition = animate ? "" : "none";
        track.style.transform = `translate3d(${-offset}px, 0, 0)`;
        if (!animate) requestAnimationFrame(() => { track.style.transition = ""; });
        region.querySelectorAll('button').forEach((button) => {
          const label = `${button.textContent} ${button.getAttribute("aria-label") || ""}`.toLowerCase();
          if (label.includes("previous")) button.disabled = offset <= 1;
          if (label.includes("next")) button.disabled = offset >= maxOffset - 1;
        });
      };
      const move = (direction) => {
        measure();
        const visible = Math.max(1, Math.round(viewport.clientWidth / slideWidth));
        offset = Math.max(0, Math.min(maxOffset, offset + direction * slideWidth * visible));
        apply(true);
      };
      const finishPointer = () => {
        if (pointerId !== null) {
          try { viewport.releasePointerCapture(pointerId); } catch {}
        }
        pointerId = null;
        if (dragging) {
          const snap = Math.round(offset / slideWidth) * slideWidth;
          offset = Math.max(0, Math.min(maxOffset, snap));
          apply(true);
          suppressClick = true;
          window.setTimeout(() => { suppressClick = false; }, 0);
        }
        dragging = false;
        region.classList.remove("jp-carousel-dragging");
      };

      region.querySelectorAll("button").forEach((button) => {
        const label = `${button.textContent} ${button.getAttribute("aria-label") || ""}`.toLowerCase();
        button.type = "button";
        if (label.includes("previous")) button.addEventListener("click", () => move(-1));
        if (label.includes("next")) button.addEventListener("click", () => move(1));
      });
      region.addEventListener("keydown", (event) => {
        if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
        if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
      });
      viewport.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        pointerId = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        startOffset = offset;
        dragging = false;
      });
      viewport.addEventListener("pointermove", (event) => {
        if (event.pointerId !== pointerId) return;
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        if (!dragging && Math.abs(dx) < 8) return;
        if (!dragging && Math.abs(dy) > Math.abs(dx)) { finishPointer(); return; }
        if (!dragging) {
          dragging = true;
          viewport.setPointerCapture?.(pointerId);
        }
        region.classList.add("jp-carousel-dragging");
        event.preventDefault();
        offset = Math.max(0, Math.min(maxOffset, startOffset - dx));
        apply(false);
      });
      viewport.addEventListener("pointerup", finishPointer);
      viewport.addEventListener("pointercancel", finishPointer);
      viewport.addEventListener("lostpointercapture", finishPointer);
      viewport.addEventListener("click", (event) => {
        if (suppressClick) { event.preventDefault(); event.stopPropagation(); }
      }, true);
      window.addEventListener("resize", () => { measure(); apply(false); }, { passive: true });
      region.addEventListener("jp-carousel-reset", () => { offset = 0; measure(); apply(false); });
      measure();
      apply(false);
    });
  };

  const setupBestSellerTabs = () => {
    const section = Array.from(document.querySelectorAll("section")).find(
      (candidate) => candidate.querySelector("p")?.textContent.trim().toLowerCase() === "our best sellers",
    );
    const buttons = section ? Array.from(section.querySelectorAll("button")).filter(
      (button) => ["sunglasses", "optical"].includes(button.textContent.trim().toLowerCase()),
    ) : [];
    const region = section?.querySelector('[role="region"][aria-roledescription="carousel"]');
    const track = region?.querySelector(":scope > .overflow-hidden > .flex");
    const allProducts = section?.querySelector('a[href*="type_frame=Sunglasses"]');
    const sunglassesButton = buttons.find((button) => button.textContent.trim().toLowerCase() === "sunglasses");
    const opticalButton = buttons.find((button) => button.textContent.trim().toLowerCase() === "optical");
    if (!section || buttons.length !== 2 || !region || !track || !allProducts || !sunglassesButton || !opticalButton) return;

    const sunglassesSlides = Array.from(track.children);
    const opticalSlidesPromise = loadIndex().then((data) => {
      const slideClass = sunglassesSlides[0]?.className || "min-w-0 shrink-0 grow-0 basis-1/2 pl-4 md:basis-1/3 lg:basis-1/4 lg:pl-8";
      return (data.products || [])
        .filter((product) => product.type === "Optical")
        .slice(0, sunglassesSlides.length)
        .map((product) => {
          const slide = document.createElement("div");
          slide.setAttribute("role", "group");
          slide.setAttribute("aria-roledescription", "slide");
          slide.className = slideClass;
          slide.innerHTML = productCardMarkup(product);
          return slide;
        });
    });

    const setActive = (activeButton) => {
      buttons.forEach((button) => {
        const active = button === activeButton;
        button.classList.toggle("text-black", active);
        button.classList.toggle("text-neutral-400", !active);
        button.setAttribute("aria-pressed", String(active));
        button.querySelector("span")?.classList.toggle("scale-x-100", active);
        button.querySelector("span")?.classList.toggle("scale-x-0", !active);
      });
    };

    const showCategory = (categoryButton, slides, label, href) => {
      track.replaceChildren(...slides);
      allProducts.href = href;
      allProducts.textContent = label;
      region.dispatchEvent(new Event("jp-carousel-reset"));
      setupProductActions();
      setActive(categoryButton);
    };

    buttons.forEach((button) => {
      button.type = "button";
      button.dataset.jpBound = "true";
      button.setAttribute("aria-pressed", String(button === buttons[0]));
    });
    sunglassesButton.addEventListener("click", () => {
      showCategory(
        sunglassesButton,
        sunglassesSlides,
        "All sunglasses",
        "/shop?type_frame=Sunglasses&page=1",
      );
    });
    opticalButton.addEventListener("click", () => {
      opticalSlidesPromise.then((opticalSlides) => {
        showCategory(
          opticalButton,
          opticalSlides,
          "All optical",
          "/shop?type_frame=Optical&page=1",
        );
      });
    });
  };

  const setupEditorialCarousels = async () => {
    const fallbackLooks = [
      {
        brand: "Cartier",
        name: "Cartier CT0543S",
        price: "$2,245.00",
        image: "/media/v0/b/site-bucket/o/banner_photos/home_cartier_ct0543s_003_w1200.webp",
        productImage: "/mirror-assets/e6d9444482466b57.png",
        href: "/product/4454?variant_id=20452",
        alt: "Cartier CT0543S",
        aspect: "1200 / 1600",
      },
      {
        brand: "Dita",
        name: "Dita Hyperlux-3000",
        price: "$1,205.00",
        image: "/mirror-assets/140a5b0f54b49566.webp",
        productImage: "/mirror-assets/15ab2d66f0c638c1.jpg",
        href: "/product/6009?variant_id=24432",
        alt: "Dita Hyperlux-3000",
        aspect: "1200 / 1501",
      },
    ];
    const fallbackReels = [
      {
        brand: "Cartier",
        name: "Cartier CT0092O",
        price: "$1,345.00",
        video: "/mirror-assets/419a3f9ee6acc6c3.mp4",
        cover: "/mirror-assets/8dd76334e801449c.webp",
        productImage: "/mirror-assets/8cdb21822a262de3.png",
        href: "/product/171?variant_id=6035",
        instagram: "https://www.instagram.com/reel/De-n6B6RAGo/",
        alt: "Cartier CT0092O in gold with custom tan lenses",
      },
      {
        brand: "Cartier",
        name: "Cartier CT0344O",
        price: "$1,345.00",
        video: "/mirror-assets/d806be0e530cddc1.mp4",
        cover: "/mirror-assets/b06d709ea1e0c591.webp",
        productImage: "/mirror-assets/76c6d021109e9fc3.png",
        href: "/product/195?variant_id=4236",
        instagram: "https://www.instagram.com/reel/DfCbXWvRp59/",
        alt: "Cartier CT0344O with warm tint and faceted edges",
      },
    ];
    const content = await loadContent();
    const looks = content?.looks?.length ? content.looks : fallbackLooks;
    const reels = content?.reels?.length ? content.reels : fallbackReels;
    const volumeOff =
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4" aria-hidden="true"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"></path><line x1="22" x2="16" y1="9" y2="15"></line><line x1="16" x2="22" y1="9" y2="15"></line></svg>';
    const volumeOn =
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4" aria-hidden="true"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"></path><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>';

    const findSection = (heading) =>
      Array.from(document.querySelectorAll("section")).find(
        (candidate) =>
          candidate.querySelector("h2")?.textContent.trim().toLowerCase() === heading.toLowerCase(),
      );

    const setActiveDot = (dots, index) => {
      dots.forEach((dot, dotIndex) => {
        const active = dotIndex === index;
        dot.classList.toggle("w-6", active);
        dot.classList.toggle("bg-black", active);
        dot.classList.toggle("w-1.5", !active);
        dot.classList.toggle("bg-black/25", !active);
        dot.setAttribute("aria-current", String(active));
      });
    };

    const bindControls = (section, prev, next, dots, render, getIndex) => {
      prev.type = "button";
      next.type = "button";
      prev.addEventListener("click", () => render(getIndex() - 1));
      next.addEventListener("click", () => render(getIndex() + 1));
      dots.forEach((dot, dotIndex) => {
        dot.type = "button";
        dot.addEventListener("click", () => render(dotIndex));
      });
      setActiveDot(dots, getIndex());
    };

    const setupLooks = () => {
      const section = findSection("Our looks");
      if (!section || section.dataset.jpLooksBound) return;
      const model = section.querySelector("img.absolute.inset-0");
      const media = model?.parentElement;
      const stage = media?.parentElement;
      const panel = stage?.children[1]?.querySelector(":scope > div");
      const paragraphs = panel ? Array.from(panel.querySelectorAll(":scope > p")) : [];
      const brand = paragraphs[0];
      const name = paragraphs[1];
      const price = paragraphs[2]?.querySelector("span") || paragraphs[2];
      const productImage = panel?.querySelector("img");
      const productLink = panel?.querySelector('a[href^="/product/"]');
      const prev = section.querySelector('button[aria-label="Previous look"]');
      const next = section.querySelector('button[aria-label="Next look"]');
      const dots = Array.from(section.querySelectorAll('button[aria-label^="Look "]'));
      ensureButtons(dots, looks.length);
      if (
        !model ||
        !media ||
        !panel ||
        !brand ||
        !name ||
        !price ||
        !productImage ||
        !productLink ||
        !prev ||
        !next ||
        dots.length !== looks.length
      ) {
        return;
      }
      section.dataset.jpLooksBound = "true";
      let index = 0;
      const render = (nextIndex) => {
        index = (nextIndex + looks.length) % looks.length;
        const look = looks[index];
        model.src = look.image;
        model.alt = look.alt;
        media.style.aspectRatio = look.aspect || "1200 / 1600";
        brand.textContent = look.brand;
        name.textContent = look.name;
        price.textContent = look.price;
        productImage.src = look.productImage;
        productImage.alt = look.name;
        productLink.href = look.href;
        setActiveDot(dots, index);
      };
      bindControls(section, prev, next, dots, render, () => index);
    };

    const setupReels = () => {
      const section = findSection("As seen on Instagram");
      if (!section || section.dataset.jpReelsBound) return;
      const video = section.querySelector("video");
      const media = video?.parentElement;
      const stage = media?.parentElement;
      const panel = stage?.children[1]?.querySelector(":scope > div");
      const paragraphs = panel ? Array.from(panel.querySelectorAll(":scope > p")) : [];
      const brand = paragraphs[0];
      const name = paragraphs[1];
      const price = paragraphs[2]?.querySelector("span") || paragraphs[2];
      const productImage = panel?.querySelector("img");
      const productLink = panel?.querySelector('a[href^="/product/"]');
      const instagramLink = Array.from(panel?.querySelectorAll("a") || []).find((link) =>
        /instagram/i.test(link.textContent),
      );
      const muteButton = section.querySelector('button[aria-label="Unmute"], button[aria-label="Mute"]');
      const prev = section.querySelector('button[aria-label="Previous look"]');
      const next = section.querySelector('button[aria-label="Next look"]');
      const dots = Array.from(section.querySelectorAll('button[aria-label^="Reel "]'));
      ensureButtons(dots, reels.length);
      if (
        !video ||
        !media ||
        !panel ||
        !brand ||
        !name ||
        !price ||
        !productImage ||
        !productLink ||
        !instagramLink ||
        !prev ||
        !next ||
        dots.length !== reels.length
      ) {
        return;
      }
      section.dataset.jpReelsBound = "true";
      let index = 0;
      let inView = false;
      video.muted = true;
      const syncMute = () => {
        if (!muteButton) return;
        muteButton.setAttribute("aria-label", video.muted ? "Unmute" : "Mute");
        muteButton.innerHTML = video.muted ? volumeOff : volumeOn;
      };
      const render = (nextIndex) => {
        index = (nextIndex + reels.length) % reels.length;
        const reel = reels[index];
        video.src = reel.video;
        video.poster = reel.cover;
        video.setAttribute("aria-label", reel.alt);
        video.load();
        if (inView) video.play().catch(() => {});
        brand.textContent = reel.brand;
        name.textContent = reel.name;
        price.textContent = reel.price;
        productImage.src = reel.productImage;
        productImage.alt = reel.name;
        productLink.href = reel.href;
        instagramLink.href = reel.instagram;
        syncMute();
        setActiveDot(dots, index);
      };
      if (muteButton) {
        muteButton.type = "button";
        muteButton.addEventListener("click", () => {
          video.muted = !video.muted;
          if (!video.muted) video.play().catch(() => {});
          syncMute();
        });
      }
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(
          (entries) => {
            inView = entries[0].isIntersecting;
            if (inView) video.play().catch(() => {});
            else video.pause();
          },
          { threshold: 0.3 },
        ).observe(section);
      } else {
        inView = true;
      }
      bindControls(section, prev, next, dots, render, () => index);
      render(0);
    };

    setupLooks();
    setupReels();
  };

  const setupHeroControls = async () => {
    const buttons = Array.from(document.querySelectorAll('button[aria-label^="Go to "]'));
    const hero = buttons[0]?.closest("section");
    const title = hero?.querySelector("h1");
    const content = title?.parentElement;
    const subtitle = content?.querySelector("p");
    const cta = content?.querySelector("a");
    const initialMedia = hero?.querySelector("video, picture");
    const mediaLayer = initialMedia?.parentElement;
    if (!hero || !title || !content || !subtitle || !cta || !mediaLayer || buttons.length < 3) return;
    if (hero.dataset.jpHeroBound) return;
    hero.dataset.jpHeroBound = "true";

    const localCartierDesktop = "/media/v0/b/site-bucket/o/banner_photos/home_cartier_precious_sunglasses_desktop.webp";
    const localCartierMobile = "/media/v0/b/site-bucket/o/banner_photos/home_cartier_precious_sunglasses_mobile.webp";
    const localDitaFallback = "/media/v0/b/site-bucket/o/banner_photos/brandshowcase_akoni.webp";
    const fallbackSlides = [
      {
        name: "Cartier",
        subtitle: "Precious sunglasses",
        cta: "Shop Cartier",
        href: "/collection/14",
        desktop: localCartierDesktop,
        mobile: localCartierMobile,
        duration: 8000,
      },
      {
        name: "Dita",
        subtitle: "Explore best-sellers",
        cta: "Shop Dita",
        href: "/collection/4",
        desktop: localDitaFallback,
        mobile: localDitaFallback,
        duration: 8000,
      },
      {
        name: "Maybach",
        subtitle: "Crafted without compromise",
        cta: "Shop Maybach",
        href: "/collection/10",
        video: "/mirror-assets/5f6caed4c6b06e08.mp4",
        duration: 20000,
      },
    ];
    const contentData = await loadContent();
    const slides = contentData?.heroSlides?.length ? contentData.heroSlides : fallbackSlides;
    ensureButtons(buttons, slides.length);
    slides.forEach((slide) => {
      slide.duration = Number(slide.duration) || 8000;
      slide.mobile = slide.mobile || slide.desktop;
    });
    const progress = buttons.map((button) => button.querySelector("span"));
    const scrim = Array.from(mediaLayer.children).find((child) => child.classList.contains("bg-gradient-to-b"));
    let currentIndex = Math.max(0, slides.findIndex((slide) => slide.name === title.textContent?.trim()));
    let autoplayTimer;
    let mediaSwapTimer;
    let interactionPaused = false;
    let transitionId = 0;

    const clearAutoplay = () => {
      if (autoplayTimer) window.clearTimeout(autoplayTimer);
      autoplayTimer = undefined;
    };

    const scheduleAutoplay = () => {
      clearAutoplay();
      if (interactionPaused || document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      autoplayTimer = window.setTimeout(() => {
        render((currentIndex + 1) % slides.length);
      }, slides[currentIndex].duration);
    };

    const createMedia = (slide) => {
      if (slide.video) {
        const video = document.createElement("video");
        video.src = slide.video;
        video.autoplay = true;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = "auto";
        video.className = "h-full w-full object-cover";
        video.setAttribute("aria-label", `${slide.name} campaign video`);
        video.play().catch(() => {});
        return video;
      }

      const picture = document.createElement("picture");
      picture.className = "absolute inset-0 h-full w-full";
      const source = document.createElement("source");
      source.media = "(max-width: 767px)";
      source.srcset = slide.mobile;
      const image = document.createElement("img");
      image.src = slide.desktop;
      image.alt = `${slide.name} eyewear campaign`;
      image.loading = "eager";
      image.decoding = "async";
      image.className = "h-full w-full object-cover";
      image.addEventListener("error", () => {
        if (image.dataset.jpFallback) return;
        image.dataset.jpFallback = "true";
        source.srcset = localCartierMobile;
        image.src = slide.name === "Cartier" ? localCartierDesktop : localDitaFallback;
      });
      picture.append(source, image);
      return picture;
    };

    const updateProgress = (index) => {
      progress.forEach((bar, barIndex) => {
        if (!bar) return;
        bar.style.transition = "none";
        bar.style.width = "0%";
        buttons[barIndex].setAttribute("aria-current", barIndex === index ? "true" : "false");
      });
      window.requestAnimationFrame(() => {
        const bar = progress[index];
        if (!bar) return;
        bar.style.transition = `width ${slides[index].duration}ms linear`;
        bar.style.width = "100%";
      });
    };

    function render(index) {
      const slide = slides[index];
      currentIndex = index;
      title.textContent = slide.name;
      subtitle.textContent = slide.subtitle;
      cta.textContent = slide.cta;
      cta.href = slide.href;
      updateProgress(index);

      const nextTransitionId = ++transitionId;
      if (mediaSwapTimer) window.clearTimeout(mediaSwapTimer);
      mediaLayer.style.transition = "opacity 650ms ease";
      mediaLayer.style.opacity = "0";
      mediaSwapTimer = window.setTimeout(() => {
        if (nextTransitionId !== transitionId) return;
        const nextMedia = createMedia(slide);
        if (scrim) {
          mediaLayer.replaceChildren(nextMedia, scrim.cloneNode(true));
        } else {
          mediaLayer.replaceChildren(nextMedia);
        }
        window.requestAnimationFrame(() => { mediaLayer.style.opacity = "1"; });
      }, 300);
      scheduleAutoplay();
    }

    buttons.forEach((button, index) => {
      button.dataset.jpBound = "true";
      button.type = "button";
      button.addEventListener("click", () => {
        interactionPaused = false;
        render(index);
      });
    });
    hero.addEventListener("mouseenter", () => { interactionPaused = true; clearAutoplay(); });
    hero.addEventListener("mouseleave", () => { interactionPaused = false; scheduleAutoplay(); });
    hero.addEventListener("focusin", () => { interactionPaused = true; clearAutoplay(); });
    hero.addEventListener("focusout", () => {
      window.setTimeout(() => {
        if (!hero.contains(document.activeElement)) {
          interactionPaused = false;
          scheduleAutoplay();
        }
      }, 0);
    });
    document.addEventListener("visibilitychange", scheduleAutoplay);
    updateProgress(currentIndex);
    scheduleAutoplay();
  };

  const setupProductGallery = () => {
    document.querySelectorAll('button[aria-label^="Photo "]').forEach((button) => {
      if (button.dataset.jpBound) return;
      button.dataset.jpBound = "true";
      button.type = "button";
      button.addEventListener("click", () => {
        const source = button.querySelector("img")?.getAttribute("src");
        const candidates = Array.from(document.images).filter((image) => image.getAttribute("src") === source && image !== button.querySelector("img"));
        const target = candidates.find((image) => image.className.includes("p-10") || image.className.includes("p-6"));
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
        button.parentElement?.querySelectorAll('button[aria-label^="Photo "]').forEach((item) => item.classList.remove("ring-1", "ring-black"));
        button.classList.add("ring-1", "ring-black");
      });
    });
  };

  const setupLensCompare = () => {
    const handle = document.querySelector('button[aria-label="Drag to compare lenses"]');
    const surface = handle?.closest("div.relative");
    if (!handle || !surface || surface.dataset.jpBound) return;
    surface.dataset.jpBound = "true";
    surface.style.touchAction = "none";
    const overlay = surface.querySelector("img[style]");
    const divider = handle.parentElement;
    if (!overlay || !divider) return;
    const setValue = (clientX) => {
      const rect = surface.getBoundingClientRect();
      const value = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
      overlay.style.clipPath = `inset(0 ${100 - value}% 0 0)`;
      divider.style.left = `${value}%`;
    };
    let active = false;
    surface.addEventListener("pointerdown", (event) => { active = true; surface.setPointerCapture?.(event.pointerId); setValue(event.clientX); });
    surface.addEventListener("pointermove", (event) => { if (active) { event.preventDefault(); setValue(event.clientX); } });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((name) => surface.addEventListener(name, () => { active = false; }));
    handle.addEventListener("keydown", (event) => {
      const current = parseFloat(divider.style.left || "50");
      if (event.key === "ArrowLeft") { event.preventDefault(); setValue(surface.getBoundingClientRect().left + surface.getBoundingClientRect().width * ((current - 4) / 100)); }
      if (event.key === "ArrowRight") { event.preventDefault(); setValue(surface.getBoundingClientRect().left + surface.getBoundingClientRect().width * ((current + 4) / 100)); }
    });
  };

  const setupCategoryLabels = () => {
    document.querySelectorAll('a[href*="type_frame=Optical"]').forEach((link) => {
      link.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() === "Eyeglasses") {
          node.textContent = node.textContent.replace("Eyeglasses", "Optical");
        }
      });
    });
    document.querySelectorAll("h1, h2").forEach((heading) => {
      if (heading.textContent.trim() === "Eyeglasses") heading.textContent = "Optical";
    });
    const searchInput = document.querySelector("#jp-search-title");
    if (searchInput) {
      searchInput.placeholder = searchInput.placeholder.replace(/eyeglasses/i, "optical");
    }
    if (/eyeglasses/i.test(document.title)) {
      document.title = document.title.replace(/eyeglasses/gi, "Optical");
    }
  };

  const setupCategoryMenus = () => {
    document
      .querySelectorAll('header nav a[href="/shop"], header nav a[href^="/lenses/"]')
      .forEach((link) => link.remove());
    document.querySelectorAll('header nav a[href*="type_frame="]').forEach((link) => {
      if (link.dataset.jpCategoryMenu) return;
      const label = categoryText(link.textContent);
      if (!/^(Sunglasses|Optical)$/i.test(label)) return;
      const category = /^Sunglasses$/i.test(label) ? "Sunglasses" : "Optical";
      const href = link.getAttribute("href") || `/shop?type_frame=${category}`;
      const wrapper = document.createElement("div");
      wrapper.className = "jp-nav-item";
      link.parentElement.insertBefore(wrapper, link);
      wrapper.appendChild(link);
      const menu = document.createElement("div");
      menu.className = "jp-nav-menu";
      menu.innerHTML = `<a href="${escapeHtml(href)}">All ${category.toLowerCase()}</a><a href="${escapeHtml(transitionsHref(href))}">${transitionsLabel}</a>`;
      wrapper.appendChild(menu);
      link.dataset.jpCategoryMenu = "true";
      link.setAttribute("aria-haspopup", "true");
      link.setAttribute("aria-expanded", "false");
      const sync = () => {
        link.setAttribute("aria-expanded", wrapper.matches(":hover, :focus-within") ? "true" : "false");
      };
      wrapper.addEventListener("mouseenter", sync);
      wrapper.addEventListener("mouseleave", sync);
      wrapper.addEventListener("focusin", sync);
      wrapper.addEventListener("focusout", (event) => {
        if (!wrapper.contains(event.relatedTarget)) sync();
      });
    });
  };

  const SHOP_PAGE_SIZE = 20;

  const shopPageState = () => {
    const params = new URLSearchParams(window.location.search);
    const type = (params.get("type_frame") || "").toLowerCase();
    const lens = (params.get("lens") || "").toLowerCase();
    const gender = (params.get("gender") || "").toLowerCase();
    const page = Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1);
    return {
      type: type === "sunglasses" ? "Sunglasses" : type === "optical" ? "Optical" : "",
      transitions: lens === "transitions",
      gender,
      page,
    };
  };

  const shopProductOrder = (products) =>
    products
      .map((product, index) => {
        const raw = product?.sortOrder;
        const sortOrder =
          raw !== null && raw !== undefined && Number.isFinite(Number(raw))
            ? Number(raw)
            : index;
        return { product, index, sortOrder };
      })
      .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.index - b.index;
      })
      .map((entry) => entry.product);

  const shopHref = (targetPage) => {
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(targetPage));
    return `/shop?${params.toString()}`;
  };

  const shopPaginationMarkup = (page, totalPages) => {
    const baseClass =
      "flex h-9 w-9 items-center justify-center text-neutral-500 transition-colors duration-300 hover:text-black no-underline";
    const disabledClass = `${baseClass} pointer-events-none opacity-30`;
    const chevronLeft =
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="m15 18-6-6 6-6"></path></svg>';
    const chevronRight =
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="m9 18 6-6-6-6"></path></svg>';
    const prev =
      page > 1
        ? `<a class="${baseClass}" aria-label="Previous page" href="${escapeHtml(shopHref(page - 1))}">${chevronLeft}</a>`
        : `<button disabled aria-label="Previous page" class="${disabledClass}">${chevronLeft}</button>`;
    const pages = new Set([1, totalPages, page - 1, page, page + 1]);
    const ordered = [...pages]
      .filter((number) => number >= 1 && number <= totalPages)
      .sort((a, b) => a - b);
    let last = 0;
    const numbers = ordered
      .map((number) => {
        const gap = number - last > 1 && last > 0;
        last = number;
        const ellipsis = gap
          ? '<span class="px-1 text-[13px] text-neutral-400">…</span>'
          : "";
        const className =
          number === page
            ? "h-9 min-w-9 px-2 text-[13px] border-b border-black text-black no-underline"
            : "h-9 min-w-9 px-2 text-[13px] transition-colors duration-300 text-neutral-500 hover:text-black no-underline";
        const current = number === page ? ' aria-current="page"' : "";
        return `${ellipsis}<a class="${className}"${current} href="${escapeHtml(shopHref(number))}">${number}</a>`;
      })
      .join("");
    const next =
      page < totalPages
        ? `<a class="${baseClass}" aria-label="Next page" href="${escapeHtml(shopHref(page + 1))}">${chevronRight}</a>`
        : `<button disabled aria-label="Next page" class="${disabledClass}">${chevronRight}</button>`;
    return `${prev}${numbers}${next}`;
  };

  const renderShopPagination = (page, totalPages) => {
    const grid = document.querySelector("main > .grid");
    const nav = grid?.parentElement?.querySelector(":scope > nav.mt-16");
    if (!nav) return;
    nav.innerHTML = shopPaginationMarkup(page, totalPages);
  };

  const renderShopSubnav = (activeType, transitions) => {
    const main = document.querySelector("main");
    const row = main?.previousElementSibling;
    if (!main || !row) return;
    const makeGroup = (category) => {
      const href = `/shop?type_frame=${category}`;
      const allActive = activeType === category && !transitions;
      const transitionsActive = activeType === category && transitions;
      return `<div class="jp-shop-subnav-group"><span class="jp-shop-subnav-label">${category}</span><a class="jp-shop-subnav-link${allActive ? " is-active" : ""}" href="${href}"${allActive ? ' aria-current="page"' : ""}>All</a><a class="jp-shop-subnav-link${transitionsActive ? " is-active" : ""}" href="${transitionsHref(href)}"${transitionsActive ? ' aria-current="page"' : ""}>${transitionsLabel}</a></div>`;
    };
    const groups = activeType
      ? makeGroup(activeType)
      : `${makeGroup("Sunglasses")}<span class="jp-shop-subnav-sep" aria-hidden="true"></span>${makeGroup("Optical")}`;
    let subnavRow = main.parentElement?.querySelector(":scope > .jp-shop-subnav-row");
    if (!subnavRow) {
      subnavRow = document.createElement("div");
      subnavRow.className = "jp-shop-subnav-row border-b border-neutral-200 bg-white px-5 py-3 font-nav";
      row.before(subnavRow);
    }
    subnavRow.innerHTML = `<div class="jp-shop-subnav">${groups}${transitions ? '<span class="jp-transitions-note">Photochromic lenses</span>' : ""}</div>`;
  };

  const productCardMarkup = (product) => {
    const name = escapeHtml(product.name);
    const image = escapeHtml(product.image || "/mirror-assets/placeholder.svg");
    const price = escapeHtml(product.price || "");
    return `<a class="group block bg-[#f0efed] font-nav" href="${escapeHtml(product.url)}">
      <div class="relative aspect-square overflow-hidden">
        <img src="${image}" sizes="(min-width: 640px) 33vw, 50vw" alt="${name}" loading="lazy" decoding="async" class="h-full w-full object-contain p-2 mix-blend-multiply sm:p-5">
        <button aria-label="Add ${name} to bag" class="absolute bottom-0 right-0 flex h-11 w-11 items-center justify-center bg-white text-black transition-all duration-400 ease-luxe hover:bg-black hover:text-white lg:translate-y-full lg:opacity-0 lg:group-hover:translate-y-0 lg:group-hover:opacity-100"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4" aria-hidden="true"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg></button>
      </div>
      <div class="px-4 pb-7 pt-2">
        <p class="text-center uppercase leading-relaxed tracking-[0.12em] text-black text-[13px]">${name}</p>
        <p class="mt-2.5 text-center text-[13px]"><span class="text-neutral-500">${price}</span></p>
      </div>
    </a>`;
  };

  const setupShopCatalog = () => {
    if (window.location.pathname !== "/shop") return;
    const grid = document.querySelector("main > .grid");
    if (!grid || grid.dataset.jpCatalogBound) return;
    grid.dataset.jpCatalogBound = "true";
    const { type: activeType, transitions, gender, page: requestedPage } = shopPageState();
    grid.classList.toggle("jp-transitions-grid", transitions);
    renderShopSubnav(activeType, transitions);
    if (grid.dataset.jpShopSsr === "true") return;
    loadIndex()
      .then((data) => {
        const allProducts = Array.isArray(data.products) ? data.products : [];
        const genderAvailable = allProducts.some((product) =>
          String(product.gender || "").trim(),
        );
        const wantedGenders =
          gender === "male"
            ? ["male", "unisex"]
            : gender === "female"
              ? ["female", "unisex"]
              : gender
                ? [gender]
                : [];
        const products = shopProductOrder(
          allProducts.filter((product) => {
            if (activeType && product.type !== activeType) return false;
            if (transitions && !productHasTransitions(product)) return false;
            if (
              genderAvailable &&
              wantedGenders.length &&
              !wantedGenders.includes(String(product.gender || "").toLowerCase())
            ) {
              return false;
            }
            return true;
          }),
        );
        const totalPages = Math.max(1, Math.ceil(products.length / SHOP_PAGE_SIZE));
        const page = Math.min(requestedPage, totalPages);
        const visible = products.slice(
          (page - 1) * SHOP_PAGE_SIZE,
          page * SHOP_PAGE_SIZE,
        );
        const count = Array.from(document.querySelectorAll(".sticky p")).find((item) =>
          /products?$/i.test(item.textContent.trim()),
        );
        if (count) count.textContent = `${products.length} products`;
        grid.innerHTML = visible.length
          ? visible.map(productCardMarkup).join("")
          : '<p class="col-span-full py-16 text-center font-nav text-[13px] uppercase tracking-[0.12em] text-neutral-500">No products found</p>';
        renderShopPagination(page, totalPages);
        setupProductActions();
        grid.dispatchEvent(new Event("jp-catalog-rendered"));
      })
      .catch((error) => {
        console.error(error);
        showToast("The product catalog could not be loaded. Please refresh.");
      });
  };

  const setupGridControls = () => {
    const grid = document.querySelector("main > .grid");
    if (!grid || grid.dataset.jpBound) return;
    grid.dataset.jpBound = "true";
    const setMode = (mode) => {
      grid.classList.toggle("jp-grid-five", mode === "five");
      grid.classList.toggle("jp-grid-list", mode === "list");
      grid.querySelectorAll("a").forEach((link) => link.classList.toggle("jp-list-card", mode === "list"));
    };
    document.querySelector('button[aria-label="Three per row"]')?.addEventListener("click", () => setMode("three"));
    document.querySelector('button[aria-label="Five per row"]')?.addEventListener("click", () => setMode("five"));
    document.querySelector('button[aria-label="List"]')?.addEventListener("click", () => setMode("list"));
    const filterButton = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent.trim().toLowerCase().startsWith("filter"),
    );
    if (!filterButton) return;
    const toolbar = filterButton.parentElement?.parentElement;
    if (!toolbar) return;
    const panel = document.createElement("div");
    panel.className = "jp-filter-panel";
    panel.hidden = true;
    panel.innerHTML = '<input type="search" placeholder="Filter visible products" aria-label="Filter visible products">';
    toolbar.appendChild(panel);
    const input = panel.querySelector("input");
    const applyFilter = () => {
      const query = normalize(input.value);
      grid.querySelectorAll(":scope > a").forEach((card) => {
        card.hidden = Boolean(query) && !normalize(card.textContent).includes(query);
      });
    };
    filterButton.type = "button";
    filterButton.setAttribute("aria-expanded", "false");
    filterButton.addEventListener("click", () => { panel.hidden = !panel.hidden; filterButton.setAttribute("aria-expanded", String(!panel.hidden)); if (!panel.hidden) input.focus(); });
    input.addEventListener("input", applyFilter);
    grid.addEventListener("jp-catalog-rendered", applyFilter);
  };

  const setupComboboxes = () => {
    document.querySelectorAll('button[role="combobox"]').forEach((button) => {
      if (button.dataset.jpBound) return;
      const select = button.parentElement?.querySelector("select");
      if (!select) return;
      button.dataset.jpBound = "true";
      button.type = "button";
      const parent = button.parentElement;
      parent.style.position = "relative";
      const options = document.createElement("div");
      options.className = "jp-combobox-options";
      options.hidden = true;
      Array.from(select.options).forEach((option) => {
        const item = document.createElement("button");
        item.type = "button";
        item.textContent = option.textContent;
        item.addEventListener("click", () => { select.value = option.value; button.querySelector("span").textContent = option.textContent; options.hidden = true; button.setAttribute("aria-expanded", "false"); });
        options.appendChild(item);
      });
      parent.appendChild(options);
      button.addEventListener("click", () => { options.hidden = !options.hidden; button.setAttribute("aria-expanded", String(!options.hidden)); });
    });
  };

  const setupFaq = () => {
    document.querySelectorAll("button").forEach((button) => {
      if (button.dataset.jpBound || !button.textContent.trim() || button.getAttribute("aria-label")) return;
      const answer = button.nextElementSibling;
      if (!answer || answer.tagName !== "DIV" || !answer.querySelector(":scope > p") || !answer.textContent.trim()) return;
      button.dataset.jpBound = "true";
      button.type = "button";
      answer.hidden = true;
      answer.style.maxHeight = "0px";
      button.setAttribute("aria-expanded", "false");
      button.addEventListener("click", () => {
        answer.hidden = !answer.hidden;
        answer.style.maxHeight = answer.hidden ? "0px" : "none";
        button.setAttribute("aria-expanded", String(!answer.hidden));
      });
    });
  };

  const setupHomepageProductLinks = () => {
    if (window.location.pathname !== "/") return;
    document.querySelectorAll('section a[href^="/product/"]').forEach((link) => {
      if (link.dataset.jpProductLink) return;
      link.dataset.jpProductLink = "true";
      link.classList.add("jp-product-link");
      link.addEventListener("click", (event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          link.target === "_blank"
        ) {
          return;
        }
        const href = link.getAttribute("href");
        if (!href) return;
        event.preventDefault();
        window.location.assign(href);
      });
    });
  };

  const setupReviewCarousel = (section, container) => {
    if (!section || !container || container.dataset.jpReviewsBound) return;
    const previous = section.querySelector('button[aria-label="Previous reviews"]');
    const next = section.querySelector('button[aria-label="Next reviews"]');
    if (!previous || !next) return;

    container.dataset.jpReviewsBound = "true";
    container.classList.add("jp-reviews-track");
    const updateControls = () => {
      const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
      previous.disabled = container.scrollLeft <= 2;
      next.disabled = container.scrollLeft >= maxScroll - 2;
    };
    const scrollReviews = (direction) => {
      container.scrollBy({
        left: direction * Math.max(container.clientWidth * 0.85, 320),
        behavior: "smooth",
      });
    };

    previous.type = "button";
    next.type = "button";
    previous.addEventListener("click", () => scrollReviews(-1));
    next.addEventListener("click", () => scrollReviews(1));
    container.addEventListener("scroll", updateControls, { passive: true });
    window.addEventListener("resize", updateControls, { passive: true });
    updateControls();
  };

  const setupForms = () => {
    document.querySelectorAll("form").forEach((form) => {
      if (form.dataset.jpForm || form.dataset.jpSearchForm || form.dataset.jpBound) return;
      form.dataset.jpBound = "true";
      form.addEventListener("submit", async (event) => {
        const contactForm = Boolean(
          form.querySelector("input[name=first_name], textarea[name=message]"),
        );
        if (contactForm) {
          event.preventDefault();
          const data = new FormData(form);
          const email = String(data.get("email") || "").trim().toLowerCase();
          const message = String(data.get("message") || "").trim();
          if (!email || !message) {
            showToast("Add your email and a message.");
            return;
          }
          const submit = form.querySelector('button[type="submit"]');
          if (submit) submit.disabled = true;
          showToast("Sending your message…");
          try {
            await apiRequest("/api/inquiries", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: [data.get("first_name"), data.get("last_name")]
                  .filter(Boolean)
                  .join(" ")
                  .trim(),
                email,
                phone: data.get("phone"),
                subject: data.get("subject"),
                message,
                source: window.location.pathname.startsWith("/product/")
                  ? "product"
                  : "contact",
              }),
            });
            showToast("Thanks — your message was sent.");
            form.reset();
          } catch (error) {
            showToast(error.message || "Could not send your message.");
          } finally {
            if (submit) submit.disabled = false;
          }
          return;
        }

        if (form.querySelector('input[type="email"]')) {
          event.preventDefault();
          const data = new FormData(form);
          const email = String(data.get("email") || "").trim().toLowerCase();
          if (!email) return;
          const submit = form.querySelector('button[type="submit"]');
          if (submit) submit.disabled = true;
          showToast("Joining the list…");
          try {
            await apiRequest("/api/newsletter", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email, source: "footer" }),
            });
            showToast("You are on the list. Welcome.");
            form.reset();
          } catch (error) {
            showToast(error.message || "Could not subscribe right now.");
          } finally {
            if (submit) submit.disabled = false;
          }
        }
      });
    });
  };

  const setupFaqContent = async () => {
    if (!window.location.pathname.includes("/help/faq")) return;
    const content = await loadContent();
    if (!content?.faqs?.length) return;
    const heading = Array.from(document.querySelectorAll("h1")).find((item) =>
      /frequently asked questions/i.test(item.textContent || ""),
    );
    const list = heading?.nextElementSibling;
    if (!list) return;
    const plus =
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus h-5 w-5 flex-shrink-0"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg>';
    list.innerHTML = content.faqs
      .map(
        (faq, index) => `<div class="jp-faq-item border border-gray-200 rounded-lg overflow-hidden">
          <button class="flex justify-between items-center w-full p-5 text-left font-medium focus:outline-none" type="button" aria-controls="jp-faq-answer-${index}" aria-expanded="false">
            <span>${escapeHtml(faq.question)}</span>${plus}
          </button>
          <div id="jp-faq-answer-${index}" class="jp-faq-answer overflow-hidden transition-all duration-300 max-h-0"><p class="text-gray-700">${escapeHtml(faq.answer)}</p></div>
        </div>`,
      )
      .join("");
    setupFaq();
  };

  const setupHomepageReviews = async () => {
    if (window.location.pathname !== "/") return;
    const content = await loadContent();
    if (!content?.reviews?.length) return;
    const section = Array.from(document.querySelectorAll("section")).find(
      (item) =>
        item.querySelector("h2")?.textContent.trim().toLowerCase() ===
        "what our clients say",
    );
    const firstCard = section?.querySelector('article[data-card="true"]');
    const container = firstCard?.parentElement;
    if (!container) return;
    const star =
      '<svg viewBox="0 0 20 20" class="h-[13px] w-[13px] fill-black" aria-hidden="true"><path d="M10 1.6l2.47 5.2 5.53.74-4.05 3.94.99 5.62L10 14.42 5.06 17.1l.99-5.62L2 7.54l5.53-.74L10 1.6z"></path></svg>';
    container.innerHTML = content.reviews
      .slice(0, 12)
      .map((review) => {
        const rating = Math.max(1, Math.min(5, Number(review.rating) || 5));
        return `<article data-card="true" class="flex w-[280px] shrink-0 flex-col border border-neutral-200 p-6 sm:w-[340px] lg:w-[380px]">
          <span class="inline-flex gap-[3px]" aria-label="${rating} out of 5 stars">${star.repeat(rating)}</span>
          <p class="mt-5 text-[13px] leading-relaxed text-neutral-700">${escapeHtml(review.body)}</p>
          <footer class="mt-6 border-t border-neutral-100 pt-4">
            <p class="text-[12px] uppercase tracking-[0.14em] text-black">${escapeHtml(review.authorName || "JP client")}</p>
            <p class="mt-1 text-[11px] uppercase tracking-[0.12em] text-neutral-400">${escapeHtml(review.relativeDate || "Recently")}</p>
          </footer>
        </article>`;
      })
      .join("");
    setupReviewCarousel(section, container);
  };

  const setupAnnouncements = async () => {
    const content = await loadContent();
    const announcements = Array.isArray(content?.announcements)
      ? content.announcements.filter((announcement) => String(announcement?.message || "").trim())
      : [];
    const validHref = (value) => {
      const href = String(value || "").trim();
      if (!href) return "";
      if (href.startsWith("/") && !href.startsWith("//")) return href;
      try {
        const url = new URL(href, window.location.origin);
        return ["http:", "https:"].includes(url.protocol) ? url.href : "";
      } catch {
        return "";
      }
    };
    const render = (mount, items, modifier) => {
      if (!items.length) {
        mount?.remove();
        return;
      }
      mount.className = `jp-announcements ${modifier}`;
      mount.replaceChildren(
        ...items.map((announcement) => {
          const row = document.createElement("div");
          row.className = "jp-announcement";
          const message = document.createElement("span");
          message.textContent = announcement.message;
          row.appendChild(message);
          const href = validHref(announcement.linkHref);
          if (href && announcement.linkLabel) {
            const link = document.createElement("a");
            link.href = href;
            link.textContent = announcement.linkLabel;
            if (/^https?:\/\//i.test(href) && !href.startsWith(window.location.origin)) {
              link.target = "_blank";
              link.rel = "noopener noreferrer";
            }
            row.appendChild(link);
          }
          return row;
        }),
      );
      if (modifier === "jp-announcements--modal") {
        const close = document.createElement("button");
        close.type = "button";
        close.className = "jp-announcement-modal__close";
        close.setAttribute("aria-label", "Dismiss announcement");
        close.textContent = "×";
        close.addEventListener("click", () => mount.remove());
        mount.appendChild(close);
      }
    };
    const mountFor = (placement, create) => {
      let mount = document.querySelector(`[data-jp-announcements="${placement}"]`);
      if (mount || !create) return mount;
      mount = document.createElement("aside");
      mount.dataset.jpAnnouncements = placement;
      create(mount);
      return mount;
    };

    const topbarItems = announcements.filter((announcement) => announcement.placement === "topbar");
    const header = document.querySelector("header");
    const topbar = mountFor("topbar", (mount) => header?.parentElement?.appendChild(mount));
    if (topbar && topbarItems.length) render(topbar, topbarItems, "jp-announcements--topbar");
    else topbar?.remove();

    const homepageItems = announcements.filter((announcement) => announcement.placement === "homepage");
    const hero = document.querySelector('button[aria-label^="Go to "]')?.closest("section");
    const homepage = mountFor("homepage", (mount) => hero?.after(mount));
    if (homepage && homepageItems.length) render(homepage, homepageItems, "jp-announcements--homepage");
    else homepage?.remove();

    const footerItems = announcements.filter((announcement) => announcement.placement === "footer");
    const footer = document.querySelector("footer");
    const footerMount = mountFor("footer", (mount) => footer?.before(mount));
    if (footerMount && footerItems.length) render(footerMount, footerItems, "jp-announcements--footer");
    else footerMount?.remove();

    const modalItems = announcements.filter((announcement) => announcement.placement === "modal");
    const modal = mountFor("modal", (mount) => document.body.appendChild(mount));
    if (modal && modalItems.length) {
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-label", "Announcement");
      render(modal, modalItems, "jp-announcements--modal");
    } else {
      modal?.remove();
    }
  };

  const setupProductMedia = () => {
    const match = window.location.pathname.match(/^\/product\/(\d+)\/?$/);
    if (!match) return;
    const productId = Number(match[1]);
    loadIndex()
      .then((data) => {
        const product = (data.products || []).find(
          (item) => Number(item.id) === productId || item.url === window.location.pathname,
        );
        const images = Array.isArray(product?.images) ? [...product.images] : [];
        const urls = images
          .sort((a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)))
          .map((image) => image.url)
          .filter(Boolean);
        if (!urls.length) return;
        const alt =
          product?.name || document.querySelector("main h1")?.textContent.trim() || "";
        const thumbs = Array.from(document.querySelectorAll('button[aria-label^="Photo "]'));
        const mains = Array.from(document.querySelectorAll("img.p-10"));
        const mobiles = Array.from(document.querySelectorAll("img.p-6"));

        const thumbHost = thumbs[0]?.parentElement;
        if (thumbHost) {
          while (thumbs.length < urls.length) {
            const clone = thumbs[thumbs.length - 1].cloneNode(true);
            delete clone.dataset.jpBound;
            thumbHost.appendChild(clone);
            thumbs.push(clone);
          }
          thumbs.forEach((button, index) => {
            if (index >= urls.length) {
              button.remove();
              return;
            }
            const image = button.querySelector("img");
            if (image) image.src = urls[index];
            button.setAttribute("aria-label", `Photo ${index + 1}`);
            button.classList.toggle("ring-1", index === 0);
            button.classList.toggle("ring-black", index === 0);
            button.classList.toggle("opacity-70", index !== 0);
          });
        }

        const mainHost = mains[0]?.closest(".aspect-square")?.parentElement;
        if (mainHost) {
          while (mains.length < urls.length && mains.length) {
            const container = mains[mains.length - 1].closest(".aspect-square");
            if (!container) break;
            const clone = container.cloneNode(true);
            mainHost.appendChild(clone);
            mains.push(clone.querySelector("img"));
          }
          mains.forEach((image, index) => {
            if (index >= urls.length) {
              image.closest(".aspect-square")?.remove();
              return;
            }
            image.src = urls[index];
            image.alt = alt;
            image.removeAttribute("srcset");
          });
        }

        const mobileHost = mobiles[0]?.closest(".w-full.shrink-0.snap-center")?.parentElement;
        if (mobileHost) {
          while (mobiles.length < urls.length && mobiles.length) {
            const container = mobiles[mobiles.length - 1].closest(
              ".w-full.shrink-0.snap-center",
            );
            if (!container) break;
            const clone = container.cloneNode(true);
            mobileHost.appendChild(clone);
            mobiles.push(clone.querySelector("img"));
          }
          mobiles.forEach((image, index) => {
            if (index >= urls.length) {
              image.closest(".w-full.shrink-0.snap-center")?.remove();
              return;
            }
            image.src = urls[index];
            image.alt = alt;
          });
        }

        setupProductGallery();
      })
      .catch(() => {});
  };

  const variantMoney = (value, currency = "USD") => {
    const amount = Number(value ?? 0);
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency || "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Number.isFinite(amount) ? amount : 0);
    } catch {
      return `$${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`;
    }
  };

  const variantSummary = (variant) =>
    [variant?.color, variant?.shape, variant?.design, variant?.size]
      .filter(Boolean)
      .join(" · ");

  const splitVariantShape = (value) => {
    const raw = String(value ?? "").trim();
    const match = raw.match(/^(.*?)\s+(Full Frame|Half Rimless|Rimless)$/i);
    if (match) return { shape: match[1].trim(), design: match[2] };
    if (/^rimless$/i.test(raw)) return { shape: "Rimless", design: "Rimless" };
    return { shape: raw, design: "Full Frame" };
  };

  const SWATCH_COLORS = {
    black: "#111111",
    brown: "#6b4a32",
    gold: "#c7a35b",
    silver: "#c9ccd0",
    havana: "#8d5a33",
    transparent: "#e9e4dc",
    blue: "#2d5d8a",
    "vivid blue": "#1d4ed8",
    "sky blue": "#7db8dd",
    purple: "#6a4c93",
    violet: "#7c5cbf",
    "cotton candy": "#eab8cd",
    "grey-light": "#b9b9b4",
    gunmetal: "#4b4f55",
    "light brown": "#b08a63",
    green: "#3f6b4b",
    ivory: "#eee7d7",
    "rose gold": "#c98d72",
    burgundy: "#6d2434",
    magneta: "#c03a80",
    magenta: "#c03a80",
    yellow: "#d8b63d",
    pink: "#dfa0b1",
    grey: "#8a8d90",
    "light-blue": "#9ec9e2",
    "champagne gold": "#d8c49b",
    "white gold": "#ded6c3",
    "yellow gold": "#d4af37",
    white: "#f7f5f1",
    clear: "#e8eef1",
  };

  const swatchColor = (variant) => {
    const code = String(variant?.colorCode || "").trim();
    if (/^(#|rgb|hsl)/i.test(code)) return code;
    const key = normalize(variant?.color || "");
    return SWATCH_COLORS[key] || "#d8d3cc";
  };

  const PDP_ARROW_LEFT =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg>';
  const PDP_ARROW_RIGHT =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>';

  const pdpSpecValue = (main, label) => {
    const span = Array.from(main.querySelectorAll("span.text-neutral-500")).find(
      (node) => node.textContent.trim() === label,
    );
    return span?.nextElementSibling?.textContent.trim() || "";
  };

  const PDP_DETAIL_ICONS = {
    story:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"></path><path d="M4 5.5v16"></path><path d="M8 7h8M8 11h7"></path></svg>',
    materials:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5z"></path><path d="m3 13 9 5 9-5"></path><path d="m3 17 9 5 9-5"></path></svg>',
    specs:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16v16H4z"></path><path d="M8 8h8M8 12h8M8 16h5"></path></svg>',
    shipping:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h11v11H3z"></path><path d="M14 10h3l4 4v3h-7z"></path><circle cx="7" cy="19" r="1.5"></circle><circle cx="18" cy="19" r="1.5"></circle></svg>',
    warranty:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 20 6v5c0 5-3.3 8.2-8 10-4.7-1.8-8-5-8-10V6z"></path><path d="m8.5 12 2.2 2.2 4.8-5"></path></svg>',
  };

  const pdpDetailRows = (product, variant) => {
    const selected = variant || {};
    return [
      ["Brand", product.brand],
      ["Model", product.model],
      ["Frame type", product.type],
      ["Gender", product.gender],
      ["Shape", selected.shape || product.shape],
      ["Design", selected.design],
      ["Material", product.material],
      ["Size", selected.size || product.size],
      ["Color code", selected.colorCode || product.colorCode],
      ["SKU", selected.sku],
    ].filter(([, value]) => value);
  };

  const setupPdpAccordions = (host) => {
    if (!host) return;
    host.querySelectorAll("[data-jp-pdp-detail]").forEach((button, index) => {
      const answer = button.nextElementSibling;
      if (!answer || button.dataset.jpBound) return;
      button.dataset.jpBound = "true";
      button.type = "button";
      button.setAttribute("aria-expanded", index === 0 ? "true" : "false");
      answer.hidden = index !== 0;
      answer.style.maxHeight = index === 0 ? `${answer.scrollHeight}px` : "0px";
      button.addEventListener("click", () => {
        const expanded = button.getAttribute("aria-expanded") === "true";
        button.setAttribute("aria-expanded", expanded ? "false" : "true");
        if (expanded) {
          answer.style.maxHeight = "0px";
          window.setTimeout(() => {
            if (button.getAttribute("aria-expanded") === "false") answer.hidden = true;
          }, 280);
          return;
        }
        answer.hidden = false;
        answer.style.maxHeight = `${answer.scrollHeight}px`;
      });
    });
  };

  const renderPdpDetails = (host, product, variant, delivery) => {
    if (!host || !product) return;
    const selected = variant || {};
    const description = product.description || product.shortDescription || "";
    const standardLabel = delivery?.standardLabel || "Standard shipping";
    const standardDays =
      delivery?.standardDaysMin && delivery?.standardDaysMax
        ? `${delivery.standardDaysMin}–${delivery.standardDaysMax} business days`
        : "Delivery timing is confirmed at checkout";
    const shipsTo = Array.isArray(delivery?.shipsTo) && delivery.shipsTo.length
      ? `Ships to ${delivery.shipsTo.join(", ")}`
      : "Shipping availability is confirmed at checkout";
    const returnsNote =
      delivery?.returnsNote || "Review the JP returns policy before ordering.";
    const rows = pdpDetailRows(product, selected);
    const detail = (key, title, icon, body, open = false) => `<div class="jp-pdp-detail${open ? " is-open" : ""}">
      <button class="jp-pdp-detail__trigger" type="button" data-jp-pdp-detail aria-expanded="${open ? "true" : "false"}" aria-controls="jp-pdp-detail-${key}">
        <span class="jp-pdp-detail__title"><span class="jp-pdp-detail__icon">${icon}</span>${title}</span>
        <span class="jp-pdp-detail__plus" aria-hidden="true"></span>
      </button>
      <div class="jp-pdp-detail__body" id="jp-pdp-detail-${key}">${body}</div>
    </div>`;

    host.classList.add("jp-pdp-details");
    host.innerHTML = [
      detail(
        "story",
        "The frame",
        PDP_DETAIL_ICONS.story,
        `<p class="jp-pdp-detail__copy">${escapeHtml(description || "A considered frame from the JP catalog.")}</p>`,
        true,
      ),
      detail(
        "materials",
        "Materials & care",
        PDP_DETAIL_ICONS.materials,
        `<p class="jp-pdp-detail__copy">${escapeHtml(product.material || "Material details are listed with the frame specifications.")}</p>
         <p class="jp-pdp-detail__note">Keep the frame in its case when not in use and clean it with a soft, dry cloth.</p>`,
      ),
      detail(
        "specifications",
        "Specifications",
        PDP_DETAIL_ICONS.specs,
        `<dl class="jp-pdp-detail__specs">${rows
          .map(
            ([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd data-jp-pdp-value="${escapeHtml(label.toLowerCase().replace(/\s+/g, "-"))}">${escapeHtml(value)}</dd></div>`,
          )
          .join("")}</dl>`,
      ),
      detail(
        "shipping",
        "Shipping & returns",
        PDP_DETAIL_ICONS.shipping,
        `<p class="jp-pdp-detail__copy" data-jp-pdp-shipping-copy><strong>${escapeHtml(standardLabel)}</strong><br>${escapeHtml(standardDays)}<br>${escapeHtml(shipsTo)}</p>
         <p class="jp-pdp-detail__note" data-jp-pdp-returns-note>${escapeHtml(returnsNote)}</p>
         <a class="jp-pdp-detail__link" href="/shipping-policy">View shipping policy</a>`,
      ),
      detail(
        "warranty",
        "Warranty",
        PDP_DETAIL_ICONS.warranty,
        `<p class="jp-pdp-detail__copy">Warranty coverage follows the maker's terms for this frame. Keep your order details for support.</p>
         <a class="jp-pdp-detail__link" href="/contact-us">Contact JP support</a>`,
      ),
    ].join("");
    setupPdpAccordions(host);
  };

  const updatePdpDeliveryDetails = (host, delivery) => {
    if (!host || !delivery) return;
    const standardLabel = delivery.standardLabel || "Standard shipping";
    const standardDays =
      delivery.standardDaysMin && delivery.standardDaysMax
        ? `${delivery.standardDaysMin}â€“${delivery.standardDaysMax} business days`
        : "Delivery timing is confirmed at checkout";
    const shipsTo = Array.isArray(delivery.shipsTo) && delivery.shipsTo.length
      ? `Ships to ${delivery.shipsTo.join(", ")}`
      : "Shipping availability is confirmed at checkout";
    const shippingCopy = host.querySelector("[data-jp-pdp-shipping-copy]");
    if (shippingCopy) {
      shippingCopy.innerHTML = `<strong>${escapeHtml(standardLabel)}</strong><br>${escapeHtml(standardDays)}<br>${escapeHtml(shipsTo)}`;
    }
    const returnsNote = host.querySelector("[data-jp-pdp-returns-note]");
    if (returnsNote) returnsNote.textContent = delivery.returnsNote || "Review the JP returns policy before ordering.";
  };

  const updatePdpDetails = (host, product, variant) => {
    if (!host || !product) return;
    const selected = variant || {};
    const values = {
      brand: product.brand,
      model: product.model,
      "frame-type": product.type,
      gender: product.gender,
      shape: selected.shape || product.shape,
      design: selected.design,
      material: product.material,
      size: selected.size || product.size,
      "color-code": selected.colorCode || product.colorCode,
      sku: selected.sku,
    };
    Object.entries(values).forEach(([key, value]) => {
      const node = host.querySelector(`[data-jp-pdp-value="${key}"]`);
      if (node && value) node.textContent = String(value);
    });
  };

  const ensurePdpOverlay = () => {
    if (pdpOverlay) return pdpOverlay;
    pdpOverlay = document.createElement("div");
    pdpOverlay.className = "jp-overlay jp-pdp-overlay";
    pdpOverlay.dataset.jpPdpModal = "true";
    pdpOverlay.hidden = true;
    pdpOverlay.innerHTML = `<div class="jp-modal jp-pdp-modal" role="dialog" aria-modal="true" aria-labelledby="jp-pdp-modal-title">
      <div class="jp-modal-head">
        <h2 class="jp-modal-title" id="jp-pdp-modal-title"></h2>
        <button class="jp-close" type="button" data-jp-close aria-label="Close window">${ICONS.close}</button>
      </div>
      <div class="jp-modal-body" data-jp-pdp-modal-body></div>
    </div>`;
    document.body.appendChild(pdpOverlay);
    pdpOverlay.querySelectorAll("[data-jp-close]").forEach((button) => {
      button.addEventListener("click", () => closeOverlay(pdpOverlay));
    });
    pdpOverlay.addEventListener("mousedown", (event) => {
      if (event.target === pdpOverlay) closeOverlay(pdpOverlay);
    });
    return pdpOverlay;
  };

  const openPdpModal = (title, body) => {
    const overlay = ensurePdpOverlay();
    pdpModalCleanup?.();
    pdpModalCleanup = null;
    overlay.querySelector(".jp-modal-title").textContent = title;
    overlay.querySelector("[data-jp-pdp-modal-body]").innerHTML = body;
    openOverlay(overlay);
    window.setTimeout(() => {
      overlay.querySelector("[data-jp-close]")?.focus({ preventScroll: true });
    }, 40);
    return overlay;
  };

  const openPdpSizeChart = (main, productName) => {
    const size = pdpSpecValue(main, "Size");
    const current = size.trim().toUpperCase();
    const rows = [
      ["XS", "Extra small", "44–47 mm"],
      ["S", "Small", "48–50 mm"],
      ["M", "Medium", "51–53 mm"],
      ["L", "Large", "54–57 mm"],
    ];
    const body = `<div class="jp-pdp-size-guide">
      <p class="jp-pdp-sheet-lead">${escapeHtml(productName)} is a <strong>${escapeHtml(size || "standard")}</strong> fit. Compare typical lens widths below before choosing your frame.</p>
      <table class="jp-pdp-size-table">
        <thead><tr><th scope="col">Size</th><th scope="col">Fit</th><th scope="col">Typical lens width</th></tr></thead>
        <tbody>${rows
          .map(
            ([code, fit, width]) =>
              `<tr${code === current ? ' class="is-current"' : ""}><th scope="row">${code}</th><td>${fit}</td><td>${width}</td></tr>`,
          )
          .join("")}</tbody>
      </table>
      <p class="jp-pdp-sheet-note">Fit varies with frame shape and bridge width. Our opticians can confirm the exact measurements for this frame before dispatch.</p>
      <a class="jp-pdp-sheet-link" href="/contact-us">Talk to an optician</a>
    </div>`;
    openPdpModal("Size guide", body);
  };

  const openPdpTryOn = (imageUrl, alt) => {
    if (!imageUrl) return;
    const overlay = openPdpModal(
      "Try on",
      `<div class="jp-tryon" data-jp-tryon>
        <div class="jp-tryon-stage" data-jp-tryon-stage>
          <video class="jp-tryon-video" playsinline muted hidden></video>
          <img class="jp-tryon-photo" alt="" hidden>
          <img class="jp-tryon-frame" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(alt || "Eyewear preview")}">
          <span class="jp-tryon-hint">Drag the frame to position it over your eyes.</span>
        </div>
        <div class="jp-tryon-controls">
          <label class="jp-tryon-range"><span>Frame size</span><input type="range" min="30" max="110" value="68" data-jp-tryon-size></label>
          <div class="jp-tryon-actions">
            <button type="button" data-jp-tryon-camera>Use camera</button>
            <label class="jp-tryon-upload">Upload photo<input type="file" accept="image/*" data-jp-tryon-upload></label>
            <button type="button" data-jp-tryon-reset>Reset</button>
          </div>
          <p class="jp-tryon-status" aria-live="polite">Allow camera access or upload a portrait to preview this frame.</p>
        </div>
      </div>`,
    );

    const stage = overlay.querySelector("[data-jp-tryon-stage]");
    const video = overlay.querySelector(".jp-tryon-video");
    const photo = overlay.querySelector(".jp-tryon-photo");
    const frame = overlay.querySelector(".jp-tryon-frame");
    const size = overlay.querySelector("[data-jp-tryon-size]");
    const status = overlay.querySelector(".jp-tryon-status");
    const cameraButton = overlay.querySelector("[data-jp-tryon-camera]");
    const upload = overlay.querySelector("[data-jp-tryon-upload]");
    const resetButton = overlay.querySelector("[data-jp-tryon-reset]");
    let stream = null;
    let drag = null;

    const stopStream = () => {
      stream?.getTracks?.().forEach((track) => track.stop());
      stream = null;
      video.srcObject = null;
      video.hidden = true;
      stage.classList.remove("has-video");
      if (cameraButton) cameraButton.textContent = "Use camera";
    };
    pdpModalCleanup = stopStream;

    const setFramePosition = (left, top) => {
      frame.style.left = `${left}%`;
      frame.style.top = `${top}%`;
      frame.style.transform = "translate(-50%, -50%)";
    };

    size?.addEventListener("input", () => {
      frame.style.width = `${size.value}%`;
    });
    frame.style.width = `${size?.value || 68}%`;
    setFramePosition(50, 44);

    cameraButton?.addEventListener("click", async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (status) status.textContent = "This browser does not support a live camera. Upload a portrait instead.";
        return;
      }
      if (stream) {
        stopStream();
        if (status) status.textContent = "Camera stopped. Upload a portrait or start the camera again.";
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
        video.srcObject = stream;
        video.hidden = false;
        photo.hidden = true;
        stage.classList.add("has-video");
        await video.play().catch(() => {});
        if (cameraButton) cameraButton.textContent = "Stop camera";
        if (status) status.textContent = "Camera ready. Drag and resize the frame to line it up.";
      } catch {
        if (status) status.textContent = "Camera access was not available. Upload a portrait instead.";
      }
    });

    upload?.addEventListener("change", () => {
      const file = upload.files?.[0];
      if (!file) return;
      stopStream();
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        photo.src = String(reader.result || "");
        photo.hidden = false;
        stage.classList.add("has-photo");
        if (status) status.textContent = "Portrait ready. Drag and resize the frame to line it up.";
      });
      reader.readAsDataURL(file);
    });

    resetButton?.addEventListener("click", () => {
      if (size) size.value = "68";
      frame.style.width = "68%";
      setFramePosition(50, 44);
      if (status) status.textContent = "Frame position reset.";
    });

    stage?.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button, input, label")) return;
      const stageRect = stage.getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();
      drag = {
        startX: event.clientX,
        startY: event.clientY,
        centerX: frameRect.left + frameRect.width / 2 - stageRect.left,
        centerY: frameRect.top + frameRect.height / 2 - stageRect.top,
        width: stageRect.width,
        height: stageRect.height,
      };
      frame.setPointerCapture?.(event.pointerId);
    });
    stage?.addEventListener("pointermove", (event) => {
      if (!drag) return;
      const x = Math.max(0, Math.min(drag.width, drag.centerX + event.clientX - drag.startX));
      const y = Math.max(0, Math.min(drag.height, drag.centerY + event.clientY - drag.startY));
      frame.style.left = `${(x / drag.width) * 100}%`;
      frame.style.top = `${(y / drag.height) * 100}%`;
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((name) => {
      stage?.addEventListener(name, () => {
        drag = null;
      });
    });
  };

  const renderPdpGallery = (host, urls, alt) => {
    if (!host) return;
    const unique = [...new Set((urls || []).filter(Boolean))];
    if (!unique.length) {
      host.dataset.jpPdpCount = "0";
      host.classList.add("is-empty");
      host.innerHTML = '<div class="jp-pdp-gallery-empty" role="status">Product image unavailable</div>';
      return;
    }
    host.classList.remove("is-empty");
    host.dataset.jpPdpCount = String(unique.length);
    host.classList.toggle("is-single", unique.length < 2);
    host.innerHTML = `<div class="jp-pdp-thumbs" role="tablist" aria-label="Product images">
      ${unique
        .map(
          (url, index) =>
            `<button class="jp-pdp-thumb${index === 0 ? " is-active" : ""}" type="button" role="tab" aria-selected="${index === 0 ? "true" : "false"}" aria-label="View image ${index + 1}" data-jp-pdp-thumb="${index}"><img src="${escapeHtml(url)}" alt="" loading="lazy"></button>`,
        )
        .join("")}
    </div>
    <div class="jp-pdp-stage" data-jp-pdp-stage>
      <div class="jp-pdp-slides">${unique
        .map(
          (url, index) =>
            `<figure class="jp-pdp-slide${index === 0 ? " is-active" : ""}" data-jp-pdp-slide="${index}"><img src="${escapeHtml(url)}" alt="${escapeHtml(alt || "Product image")}" loading="${index === 0 ? "eager" : "lazy"}"></figure>`,
        )
        .join("")}</div>
      <button class="jp-pdp-arrow jp-pdp-arrow--prev" type="button" aria-label="Previous image">${PDP_ARROW_LEFT}</button>
      <button class="jp-pdp-arrow jp-pdp-arrow--next" type="button" aria-label="Next image">${PDP_ARROW_RIGHT}</button>
      <button class="jp-pdp-tryon" type="button" data-jp-tryon>Try on</button>
    </div>`;

    const slides = host.querySelector(".jp-pdp-slides");
    const thumbs = Array.from(host.querySelectorAll("[data-jp-pdp-thumb]"));
    const stage = host.querySelector("[data-jp-pdp-stage]");
    host.querySelectorAll("img").forEach((image) => {
      image.addEventListener("error", () => {
        if (image.dataset.jpFallback) return;
        image.dataset.jpFallback = "true";
        image.src = "/mirror-assets/placeholder.svg";
      });
    });
    let index = 0;
    let start = null;

    const show = (next) => {
      index = (next + unique.length) % unique.length;
      if (slides) slides.style.transform = `translateX(-${index * 100}%)`;
      host.dataset.jpPdpIndex = String(index);
      thumbs.forEach((thumb, thumbIndex) => {
        const active = thumbIndex === index;
        thumb.classList.toggle("is-active", active);
        thumb.setAttribute("aria-selected", active ? "true" : "false");
      });
      host.querySelectorAll("[data-jp-pdp-slide]").forEach((slide, slideIndex) => {
        slide.classList.toggle("is-active", slideIndex === index);
      });
    };

    thumbs.forEach((thumb) => {
      thumb.addEventListener("click", () => show(Number(thumb.dataset.jpPdpThumb) || 0));
    });
    host.querySelector(".jp-pdp-arrow--prev")?.addEventListener("click", () => show(index - 1));
    host.querySelector(".jp-pdp-arrow--next")?.addEventListener("click", () => show(index + 1));
    host.querySelector("[data-jp-tryon]")?.addEventListener("click", () => {
      openPdpTryOn(unique[index], alt);
    });

    stage?.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" || event.target.closest("button")) return;
      start = { x: event.clientX, y: event.clientY };
    });
    stage?.addEventListener("pointerup", (event) => {
      if (!start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.abs(dx) > 38 && Math.abs(dx) > Math.abs(dy)) show(index + (dx < 0 ? 1 : -1));
      start = null;
    });
    ["pointercancel", "lostpointercapture"].forEach((name) => {
      stage?.addEventListener(name, () => {
        start = null;
      });
    });
  };

  const setupProductPage = () => {
    if (!/^\/product\/\d+\/?$/.test(window.location.pathname)) return;
    const main = document.querySelector("main");
    const grid = main?.querySelector("section > div.mx-auto.mt-6.grid");
    if (!main || !grid || grid.dataset.jpPdpReady) return;
    const galleryWrap = grid.children[0];
    const info = grid.children[1];
    const accordions = grid.children[2];
    const title = info?.querySelector("h1");
    if (!galleryWrap || !info || !title) return;

    grid.dataset.jpPdpReady = "true";
    grid.classList.add("jp-pdp-layout");
    galleryWrap.classList.add("jp-pdp-gallery-wrap");
    info.classList.add("jp-pdp-info");
    accordions?.classList.add("jp-pdp-accordions");
    document.body.classList.add("jp-pdp-page");

    const breadcrumb = main.querySelector("section > div.mx-auto.pt-6");
    breadcrumb?.classList.add("jp-pdp-breadcrumb");

    const imageUrls = [
      ...new Set(
        Array.from(galleryWrap.querySelectorAll("img"))
          .map((image) => image.getAttribute("src"))
          .filter(Boolean),
      ),
    ];
    const productName = title.textContent.trim();
    const gallery = document.createElement("div");
    gallery.className = "jp-pdp-gallery";
    gallery.dataset.jpPdpGallery = "true";
    galleryWrap.replaceChildren(gallery);
    renderPdpGallery(gallery, imageUrls, productName);

    const content = info.querySelector(".font-nav") || info;
    const brandNode = title.previousElementSibling;
    const brand = brandNode?.textContent.trim() || "";
    brandNode?.classList.add("jp-pdp-brand");
    const type = pdpSpecValue(main, "Frame type");
    const material = pdpSpecValue(main, "Material");
    const subtitle = document.createElement("p");
    subtitle.className = "jp-pdp-subtitle";
    subtitle.textContent =
      [type, material].filter(Boolean).join(" · ") || brand || "JP Eyewear";
    title.classList.add("jp-pdp-title");
    title.insertAdjacentElement("afterend", subtitle);

    const priceSpan = main.querySelector('span[class*="text-[19px]"]');
    const priceRow = priceSpan?.parentElement;
    const finance = priceRow?.nextElementSibling;
    const rule = finance?.nextElementSibling;
    const colorParagraph = Array.from(content.querySelectorAll("p")).find((paragraph) =>
      /^Color:\s*/i.test(paragraph.textContent.trim()),
    );
    const colorRow = colorParagraph?.nextElementSibling;
    const actions = content.querySelector("div.mt-8.grid.grid-cols-2.gap-3");
    const trust = actions?.nextElementSibling;
    const tags = trust?.nextElementSibling;

    priceRow?.classList.add("jp-pdp-price-row");
    priceSpan?.classList.add("jp-pdp-price");
    if (finance?.tagName === "BUTTON") finance.classList.add("jp-pdp-finance");
    rule?.classList.add("jp-pdp-rule");
    colorParagraph?.classList.add("jp-pdp-color");
    colorRow?.classList.add("jp-pdp-colors");
    actions?.classList.add("jp-pdp-actions");
    if (trust?.tagName === "UL") trust.classList.add("jp-pdp-trust");
    tags?.classList.add("jp-pdp-tags");
    if (colorParagraph) {
      const label = Array.from(colorParagraph.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE,
      );
      if (label) label.textContent = "Lens color ";
    }

    const sourceDescription = Array.from(accordions?.querySelectorAll("p") || []).find(
      (paragraph) => paragraph.textContent.trim().length > 90,
    );
    if (actions && sourceDescription) {
      const description = document.createElement("p");
      description.className = "jp-pdp-description";
      description.textContent = sourceDescription.textContent.trim();
      actions.insertAdjacentElement("afterend", description);
      sourceDescription.remove();
    }

    const tools = document.createElement("div");
    tools.className = "jp-pdp-tools";
    tools.dataset.jpPdpTools = "true";
    tools.innerHTML =
      '<button type="button" data-jp-size-chart>Size chart</button><button type="button" data-jp-try-on>Try on</button>';
    if (actions) actions.parentElement.insertBefore(tools, actions);
    tools.querySelector("[data-jp-size-chart]")?.addEventListener("click", () => {
      openPdpSizeChart(main, productName);
    });
    tools.querySelector("[data-jp-try-on]")?.addEventListener("click", () => {
      const current = gallery.querySelector(".jp-pdp-slide.is-active img")?.getAttribute("src");
      openPdpTryOn(current || imageUrls[0], productName);
    });

    const addButton = actions
      ? Array.from(actions.querySelectorAll("button")).find((button) =>
          /^add to cart$/i.test(button.textContent.trim()),
        )
      : null;
    const sticky = document.createElement("div");
    sticky.className = "jp-pdp-sticky";
    sticky.dataset.jpPdpSticky = "true";
    sticky.innerHTML = `<div class="jp-pdp-sticky__meta">
      <span class="jp-pdp-sticky__price" data-jp-pdp-sticky-price>${escapeHtml(priceSpan?.textContent.trim() || "")}</span>
      <span class="jp-pdp-sticky__variant" data-jp-pdp-sticky-variant>${escapeHtml(colorRow?.textContent.trim() || "")}</span>
    </div>
    <button class="jp-pdp-sticky__button" type="button" data-jp-pdp-sticky-add${addButton?.disabled ? " disabled" : ""}>Add to cart</button>`;
    document.body.appendChild(sticky);
    sticky.querySelector("[data-jp-pdp-sticky-add]")?.addEventListener("click", () => {
      if (addButton && !addButton.disabled) addButton.click();
    });
  };

  const renderProductImageSet = (urls, alt) => {
    const unique = [...new Set(urls.filter(Boolean))];
    if (!unique.length) return;
    const pdpGallery = document.querySelector("[data-jp-pdp-gallery]");
    if (pdpGallery) {
      renderPdpGallery(pdpGallery, unique, alt);
      return;
    }
    const thumbs = Array.from(document.querySelectorAll('button[aria-label^="Photo "]'));
    const mains = Array.from(document.querySelectorAll("img.p-10"));
    const mobiles = Array.from(document.querySelectorAll("img.p-6"));

    const thumbHost = thumbs[0]?.parentElement;
    if (thumbHost) {
      while (thumbs.length < unique.length && thumbs.length) {
        const clone = thumbs[thumbs.length - 1].cloneNode(true);
        delete clone.dataset.jpBound;
        thumbHost.appendChild(clone);
        thumbs.push(clone);
      }
      thumbs.forEach((button, index) => {
        if (index >= unique.length) {
          button.remove();
          return;
        }
        const image = button.querySelector("img");
        if (image) image.src = unique[index];
        button.setAttribute("aria-label", `Photo ${index + 1}`);
        button.classList.toggle("ring-1", index === 0);
        button.classList.toggle("ring-black", index === 0);
        button.classList.toggle("opacity-70", index !== 0);
      });
    }

    const mainHost = mains[0]?.closest(".aspect-square")?.parentElement;
    if (mainHost) {
      while (mains.length < unique.length && mains.length) {
        const container = mains[mains.length - 1].closest(".aspect-square");
        if (!container) break;
        const clone = container.cloneNode(true);
        mainHost.appendChild(clone);
        mains.push(clone.querySelector("img"));
      }
      mains.forEach((image, index) => {
        if (index >= unique.length) {
          image.closest(".aspect-square")?.remove();
          return;
        }
        image.src = unique[index];
        image.alt = alt;
        image.removeAttribute("srcset");
      });
    }

    const mobileHost = mobiles[0]?.closest(".w-full.shrink-0.snap-center")?.parentElement;
    if (mobileHost) {
      while (mobiles.length < unique.length && mobiles.length) {
        const container = mobiles[mobiles.length - 1].closest(".w-full.shrink-0.snap-center");
        if (!container) break;
        const clone = container.cloneNode(true);
        mobileHost.appendChild(clone);
        mobiles.push(clone.querySelector("img"));
      }
      mobiles.forEach((image, index) => {
        if (index >= unique.length) {
          image.closest(".w-full.shrink-0.snap-center")?.remove();
          return;
        }
        image.src = unique[index];
        image.alt = alt;
      });
    }

    const dots = document.querySelector(".mt-5.flex.justify-center.gap-2");
    if (dots) {
      dots.innerHTML = unique
        .map(
          (_, index) =>
            `<span class="h-1.5 w-1.5 rounded-full transition-colors duration-300 ${index === 0 ? "bg-black" : "bg-black/25"}"></span>`,
        )
        .join("");
    }

    setupProductGallery();
  };

  const renderPdpRecommendations = (currentProduct, data) => {
    if (!currentProduct || !Array.isArray(data?.products)) return;
    const heading = Array.from(document.querySelectorAll("main h2")).find(
      (node) => node.textContent.trim().toLowerCase() === "recommended",
    );
    const section = heading?.closest("section");
    const carousel = section?.querySelector('[role="region"][aria-roledescription="carousel"]');
    if (!section || !carousel) return;

    const isUsable = (product) =>
      product &&
      Number(product.id) !== Number(currentProduct.id) &&
      product.url &&
      product.name &&
      product.price &&
      product.image &&
      !/placeholder/i.test(String(product.image));
    const available = data.products.filter(isUsable);
    const sameCollection = available.filter(
      (product) =>
        currentProduct.collectionId &&
        String(product.collectionId || "") === String(currentProduct.collectionId),
    );
    const sameBrand = available.filter(
      (product) => normalize(product.brand) === normalize(currentProduct.brand),
    );
    const recommendations = [...sameCollection, ...sameBrand, ...available].filter(
      (product, index, list) => list.findIndex((candidate) => Number(candidate.id) === Number(product.id)) === index,
    ).slice(0, 4);
    if (!recommendations.length) return;

    section.classList.add("jp-pdp-recommendations");
    const grid = document.createElement("div");
    grid.className = "jp-pdp-recommendations-grid";
    grid.setAttribute("aria-label", "Recommended products");
    grid.innerHTML = recommendations
      .map(
        (product) => `<a class="jp-pdp-recommendation-card" href="${escapeHtml(product.url)}">
          <span class="jp-pdp-recommendation-card__image"><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" decoding="async"></span>
          <span class="jp-pdp-recommendation-card__meta">
            <span class="jp-pdp-recommendation-card__brand">${escapeHtml(product.brand || "JP")}</span>
            <span class="jp-pdp-recommendation-card__name">${escapeHtml(product.name)}</span>
            <span class="jp-pdp-recommendation-card__price">${escapeHtml(product.price)}</span>
          </span>
        </a>`,
      )
      .join("");
    carousel.replaceWith(grid);
  };

  const setupProductVariants = () => {
    const match = window.location.pathname.match(/^\/product\/(\d+)\/?$/);
    if (!match) return Promise.resolve();
    const productId = Number(match[1]);

    const findSpecLabel = (label) =>
      Array.from(document.querySelectorAll("main span.text-neutral-500")).find(
        (span) => span.textContent.trim() === label,
      );

    const updateSpec = (label, value) => {
      if (!value) return;
      const span = findSpecLabel(label);
      const target = span?.nextElementSibling;
      if (target) target.textContent = String(value);
    };

    const ensureSpec = (label, value, afterLabel) => {
      if (!value) return;
      const current = findSpecLabel(label);
      if (current) {
        const target = current.nextElementSibling;
        if (target) target.textContent = String(value);
        return;
      }
      const anchor = findSpecLabel(afterLabel);
      const row = anchor?.parentElement;
      if (!row || !row.parentElement) return;
      const clone = row.cloneNode(true);
      const cloneLabel = clone.querySelector("span.text-neutral-500");
      const cloneValue = cloneLabel?.nextElementSibling;
      if (!cloneLabel || !cloneValue) return;
      cloneLabel.textContent = label;
      cloneValue.textContent = String(value);
      row.after(clone);
    };

    return loadIndex()
      .then((data) => {
        const product = (data.products || []).find(
          (item) => Number(item.id) === productId || item.url === window.location.pathname,
        );
        if (!product) return;
        const variants = (Array.isArray(product.variants) ? product.variants : []).filter(
          (variant) => variant && variant.isActive !== false,
        );
        if (!variants.length) return;
        renderPdpRecommendations(product, data);

        document.querySelector("[data-jp-variants]")?.remove();
        document.querySelector("[data-jp-pdp-requirements-wrap]")?.remove();

        const main = document.querySelector("main");
        const actionGrid = document.querySelector("main div.mt-8.grid.grid-cols-2.gap-3");
        if (!main || !actionGrid) return;

        const detailsHost = main.querySelector(".jp-pdp-accordions");
        renderPdpDetails(detailsHost, product, variants[0], null);
        loadContent().then((content) => {
          if (!detailsHost || !content?.delivery) return;
          updatePdpDeliveryDetails(detailsHost, content.delivery);
        });

        const allImages = Array.isArray(product.images) ? product.images : [];
        const baseImages = allImages
          .filter((image) => !image?.variantId)
          .map((image) => image?.url)
          .filter(Boolean);
        const productImage =
          baseImages[0] || product.image || "/mirror-assets/placeholder.svg";
        const galleryFor = (variant) => {
          const dedicated = [
            ...(Array.isArray(variant.images) ? variant.images : []),
            ...allImages.filter(
              (image) => Number(image?.variantId) === Number(variant?.id) && Number(variant?.id) > 0,
            ),
          ]
            .map((image) => image?.url)
            .filter(Boolean);
          if (dedicated.length) {
            return [...new Set([variant.image, ...dedicated].filter(Boolean))];
          }
          return [...new Set([variant.image, ...baseImages, productImage].filter(Boolean))];
        };
        const thumbFor = (variant) =>
          variant?.image ||
          variant?.images?.find?.((image) => image?.url)?.url ||
          galleryFor(variant)[0] ||
          productImage;

        const uniqueValues = (key) => {
          const seen = new Set();
          const values = [];
          variants.forEach((variant) => {
            const value = variant[key];
            if (!value || seen.has(String(value))) return;
            seen.add(String(value));
            values.push(String(value));
          });
          return values;
        };

        const shapes = uniqueValues("shape");
        const sizes = uniqueValues("size");
        const colors = [];
        const seenColors = new Set();
        variants.forEach((variant) => {
          if (!variant.color) return;
          const key = `${variant.color}|${variant.colorCode || ""}`;
          if (seenColors.has(key)) return;
          seenColors.add(key);
          colors.push(variant);
        });

        if (!shapes.length && !colors.length && !sizes.length) return;

        const variantFor = (key, value) =>
          variants.find((variant) => String(variant[key] ?? "") === String(value));

        const groupMarkup = (name, label, options, kind) => {
          if (!options.length) return "";
          const buttons = options
            .map((option) => {
              if (kind === "swatch") {
                const variant = option;
                const swatchImage = thumbFor(variant);
                return `<button type="button" class="jp-swatch" role="radio" aria-checked="false" data-value="${escapeHtml(variant.color)}" title="${escapeHtml(variantSummary(variant))}">
                  <span class="jp-swatch__chip" style="background-color:${escapeHtml(swatchColor(variant))};${swatchImage ? `background-image:url('${escapeHtml(swatchImage)}');` : ""}"></span>
                  <span class="jp-swatch__label">${escapeHtml(variant.color)}</span>
                  ${variant.colorCode ? `<span class="jp-swatch__code">${escapeHtml(variant.colorCode)}</span>` : ""}
                </button>`;
              }
              if (kind === "thumb") {
                const value = option;
                const variant = variantFor(name, value);
                return `<button type="button" class="jp-variant-thumb" role="radio" aria-checked="false" data-value="${escapeHtml(value)}" title="${escapeHtml(value)}">
                  <span class="jp-variant-thumb__img"><img src="${escapeHtml(thumbFor(variant))}" alt="" loading="lazy"></span>
                  <span class="jp-variant-thumb__label">${escapeHtml(value)}</span>
                </button>`;
              }
              return `<button type="button" class="jp-size" role="radio" aria-checked="false" data-value="${escapeHtml(option)}" title="${escapeHtml(option)}">${escapeHtml(option)}</button>`;
            })
            .join("");
          const kindClass = kind === "swatch" ? "swatches" : kind === "thumb" ? "thumbs" : "sizes";
          return `<div class="jp-variant-group" data-jp-group="${name}">
            <div class="jp-variant-group__head"><span>${label}</span><em data-jp-value="${name}"></em></div>
            <div class="jp-variant-options jp-variant-options--${kindClass}" role="radiogroup" aria-label="${label}">${buttons}</div>
          </div>`;
        };

        const panel = document.createElement("section");
        panel.className = "jp-variants";
        panel.dataset.jpVariants = "true";
        panel.setAttribute("aria-label", "Choose your eyewear");
        panel.innerHTML = `
          <div class="jp-variants__head">
            <div>
              <p class="jp-variants__eyebrow">Configure your pair</p>
              <p class="jp-variants__summary" data-jp-variant-summary></p>
            </div>
            <span class="jp-variants__stock" data-jp-variant-stock></span>
          </div>
          <div class="jp-variants__meta">
            <span>SKU <strong data-jp-variant-sku></strong></span>
            <span>Availability <strong data-jp-variant-availability></strong></span>
          </div>
          ${groupMarkup("color", "Frame color", colors, "swatch")}
          ${groupMarkup("shape", "Shape", shapes, "thumb")}
          ${groupMarkup("size", "Size", sizes, "size")}
        `;

        const colorParagraph = Array.from(main.querySelectorAll("p")).find((paragraph) =>
          /^(?:Color|Lens color)\b/i.test(paragraph.textContent.trim()),
        );
        const colorRow = colorParagraph?.nextElementSibling;
        if (colorParagraph) colorParagraph.style.display = "none";
        if (colorRow && colorRow.classList.contains("flex")) colorRow.style.display = "none";

        const tools = actionGrid.parentElement.querySelector("[data-jp-pdp-tools]");
        actionGrid.parentElement.insertBefore(panel, tools || actionGrid);

        const requirementsWrap = document.createElement("div");
        requirementsWrap.className = "jp-pdp-requirements";
        requirementsWrap.dataset.jpPdpRequirementsWrap = "true";
        requirementsWrap.innerHTML = `<label for="jp-pdp-requirements-field">Customer requirements <span>Optional</span></label>
          <textarea id="jp-pdp-requirements-field" data-jp-pdp-requirements maxlength="1000" rows="3" placeholder="Share fit notes, preferences, or customization instructions before adding to your bag."></textarea>
          <p>These notes stay with this item through checkout.</p>`;
        actionGrid.parentElement.insertBefore(requirementsWrap, tools || actionGrid);

        const summaryNode = panel.querySelector("[data-jp-variant-summary]");
        const skuNode = panel.querySelector("[data-jp-variant-sku]");
        const stockNode = panel.querySelector("[data-jp-variant-stock]");
        const availabilityNode = panel.querySelector("[data-jp-variant-availability]");

        const markGroup = (name, value) => {
          panel.querySelectorAll(`[data-jp-group="${name}"] [data-value]`).forEach((button) => {
            const active = String(button.getAttribute("data-value")) === String(value ?? "");
            button.classList.toggle("is-selected", active);
            button.setAttribute("aria-checked", active ? "true" : "false");
          });
          const label = panel.querySelector(`[data-jp-value="${name}"]`);
          if (label) label.textContent = value || "—";
        };

        const sync = (variant) => {
          activeProductVariant = variant;
          markGroup("shape", variant.shape);
          markGroup("color", variant.color);
          markGroup("size", variant.size);

          if (summaryNode) summaryNode.textContent = variantSummary(variant);
          updatePdpDetails(detailsHost, product, variant);
          if (skuNode) skuNode.textContent = variant.sku || "—";
          const stock = variant.stock;
          const hasStock = stock !== null && stock !== undefined && Number.isFinite(Number(stock));
          const stockValue = hasStock ? Number(stock) : null;
          const stockLabel =
            stockValue === null
              ? "In stock"
              : stockValue <= 0
                ? "Out of stock"
                : stockValue <= 3
                  ? `Only ${stockValue} left`
                  : "In stock";
          if (stockNode) {
            stockNode.textContent = stockLabel;
            stockNode.classList.toggle("is-out", stockValue !== null && stockValue <= 0);
            stockNode.classList.toggle("is-low", stockValue !== null && stockValue > 0 && stockValue <= 3);
          }
          if (availabilityNode) availabilityNode.textContent = stockLabel;

          const price = variant.price || variantMoney(variant.priceValue, variant.currency);
          document.querySelectorAll('main span[class*="text-[19px]"]').forEach((span) => {
            if (span.closest("[data-jp-variants]")) return;
            span.textContent = price;
          });
          if (colorParagraph) {
            const value = colorParagraph.querySelector("span");
            if (value) value.textContent = variant.color || "";
          }

          const split = splitVariantShape(variant.shape || product.shape);
          updateSpec("Shape", variant.shape || product.shape);
          ensureSpec("Design", variant.design || split.design, "Shape");
          updateSpec("Frame type", product.type);
          updateSpec("Gender", product.gender);
          updateSpec("Material", product.material);
          updateSpec("Size", variant.size || product.size);
          updateSpec("Color code", variant.colorCode || product.colorCode);
          updateSpec("Model", product.model);

          renderProductImageSet(galleryFor(variant), variant.imageAlt || product.name);

          const soldOut = stockValue !== null && stockValue <= 0;
          Array.from(actionGrid.querySelectorAll("button")).forEach((button) => {
            if (!/^(add to cart|buy it now)$/i.test(button.textContent.trim())) return;
            button.disabled = soldOut;
            button.setAttribute("aria-disabled", soldOut ? "true" : "false");
          });

          const stickyPrice = document.querySelector("[data-jp-pdp-sticky-price]");
          if (stickyPrice) stickyPrice.textContent = price;
          const stickyVariant = document.querySelector("[data-jp-pdp-sticky-variant]");
          if (stickyVariant) stickyVariant.textContent = variantSummary(variant);
          const stickyAdd = document.querySelector("[data-jp-pdp-sticky-add]");
          if (stickyAdd) {
            stickyAdd.disabled = soldOut;
            stickyAdd.textContent = soldOut ? "Sold out" : "Add to cart";
          }

          if (variant.id) {
            const url = new URL(window.location.href);
            url.searchParams.set("variant_id", String(variant.id));
            window.history.replaceState({}, "", url.pathname + url.search + url.hash);
          }
        };

        const choose = (key, value) => {
          const candidates = variants.filter(
            (variant) => String(variant[key] ?? "") === String(value ?? ""),
          );
          if (!candidates.length) return;
          const current = activeProductVariant;
          const best =
            candidates.find((candidate) =>
              ["shape", "color", "size"].every(
                (dimension) =>
                  dimension === key ||
                  !current ||
                  String(candidate[dimension] ?? "") === String(current[dimension] ?? ""),
              ),
            ) || candidates[0];
          sync(best);
        };

        panel.addEventListener("click", (event) => {
          const button = event.target.closest("[data-jp-group] [data-value]");
          if (!button) return;
          const group = button.closest("[data-jp-group]");
          choose(group.dataset.jpGroup, button.getAttribute("data-value"));
        });

        const buyButton = Array.from(actionGrid.querySelectorAll("button")).find((button) =>
          /^buy it now$/i.test(button.textContent.trim()),
        );
        if (buyButton && !buyButton.dataset.jpBuyBound) {
          buyButton.dataset.jpBuyBound = "true";
          buyButton.type = "button";
          buyButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (buyButton.disabled) return;
            Array.from(actionGrid.querySelectorAll("button"))
              .find((button) => /^add to cart$/i.test(button.textContent.trim()))
              ?.click();
            window.setTimeout(() => {
              window.location.href = "/cart";
            }, 120);
          });
        }

        const requested = Number(new URLSearchParams(window.location.search).get("variant_id") || 0);
        const initial =
          variants.find((variant) => Number(variant.id) === requested) || variants[0];
        sync(initial);
      })
      .catch(() => {});
  };

  const setupProfilePage = () => {
    if (window.location.pathname !== "/profile") return;
    const main = document.querySelector("main");
    if (!main || main.dataset.jpProfileBound) return;
    main.dataset.jpProfileBound = "true";

    const signOut = Array.from(main.querySelectorAll("button")).find((button) =>
      /sign out/i.test(button.textContent || ""),
    );
    signOut?.addEventListener("click", async () => {
      try {
        await apiRequest("/api/accounts/logout", { method: "POST" });
      } catch {
        // Local fallback still clears the browser session.
      }
      writeSession(null);
      window.location.reload();
    });

    const section = Array.from(main.querySelectorAll("section")).find(
      (item) => item.querySelector("h2")?.textContent.trim().toLowerCase() === "orders",
    );
    const empty = section?.querySelector(":scope > div.flex.flex-col");
    if (!section || !empty) return;

    const session = readSession();
    if (!session?.email) {
      empty.innerHTML = `<span class="flex h-12 w-12 items-center justify-center rounded-full border border-neutral-300 text-neutral-400">${ICONS.search}</span>
        <p class="mt-6 text-[12px] uppercase tracking-[0.16em] text-black">Sign in to view orders</p>
        <p class="mt-3 max-w-[320px] text-[12px] leading-relaxed text-neutral-500">Your order history appears here after you sign in.</p>
        <div class="mt-7"><button class="inline-flex items-center justify-center gap-2 bg-black px-9 py-3.5 text-[12px] uppercase tracking-[0.16em] text-white transition-opacity duration-300 hover:opacity-85" type="button" data-jp-profile-signin>Sign in</button></div>`;
      empty
        .querySelector("[data-jp-profile-signin]")
        ?.addEventListener("click", openAccount);
      return;
    }

    apiRequest("/api/orders")
      .then((result) => {
        const orders = Array.isArray(result.orders) ? result.orders : [];
        if (!orders.length) return;
        empty.outerHTML = `<div class="divide-y divide-neutral-200">${orders
          .map((order) => {
            const items = Array.isArray(order.order_items) ? order.order_items : [];
            const count = items.reduce(
              (total, item) => total + Number(item.quantity || 0),
              0,
            );
            const placed = order.placed_at
              ? new Date(order.placed_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })
              : "";
            return `<article class="px-6 py-5 lg:px-8">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p class="text-[12px] uppercase tracking-[0.14em] text-black">Order ${escapeHtml(order.order_number || "")}</p>
                  <p class="mt-1 text-[12px] text-neutral-500">${escapeHtml(placed)} &middot; ${count} ${count === 1 ? "item" : "items"}</p>
                </div>
                <div class="text-right">
                  <p class="text-[12px] uppercase tracking-[0.14em] text-black">${escapeHtml(String(order.status || "").replace(/_/g, " "))}</p>
                  <p class="mt-1 text-[12px] text-neutral-500">${money(Number(order.total || 0))}</p>
                </div>
              </div>
              <div class="mt-4 flex flex-wrap gap-4">${items
                .map(
                  (item) => `<a class="flex items-center gap-3 text-[12px] text-neutral-500 transition-colors duration-300 hover:text-black" href="/product/${Number(item.product_id) || ""}">
                    <img src="${escapeHtml(item.image_url || "/mirror-assets/placeholder.svg")}" alt="" class="h-12 w-12 border border-neutral-200 object-contain p-1">
                    <span>${escapeHtml(item.name || "Product")} &times; ${Number(item.quantity) || 1}</span>
                  </a>`,
                )
                .join("")}</div>
            </article>`;
          })
          .join("")}</div>`;
      })
      .catch(() => {});
  };

  const setupCallButton = () => {
    const button = Array.from(document.querySelectorAll("button")).find((item) => item.querySelector('svg path[d^="M22 16.92"]'));
    if (!button || button.dataset.jpBound) return;
    button.dataset.jpBound = "true";
    button.type = "button";
    button.setAttribute("aria-label", "Call JP");
    button.addEventListener("click", () => { window.location.href = "tel:+13475445139"; });
  };

  const setupLiveUpdates = () => {
    if (!("EventSource" in window)) return;
    const catalogTopics = new Set([
      "products",
      "product_images",
      "product_variants",
      "categories",
      "subcategories",
      "collections",
      "customizer_frames",
      "customizer_lenses",
      "customizer_frame_lenses",
    ]);
    const contentTopics = new Set([
      "hero_slides",
      "editorial_looks",
      "announcements",
      "delivery_settings",
      "faqs",
      "reviews",
    ]);
    let timer = null;
    let reloadTimer = null;
    let pending = new Set();

    const reload = () => {
      if (reloadTimer) return;
      reloadTimer = window.setTimeout(() => window.location.reload(), 1200);
    };

    const refresh = () => {
      const topics = pending;
      pending = new Set();
      if (!topics.size) return;

      if ([...topics].some((topic) => catalogTopics.has(topic))) {
        indexPromise = null;
        searchIndex = null;
        const path = window.location.pathname;
        if (path === "/shop") {
          const grid = document.querySelector("main > .grid");
          if (grid) {
            delete grid.dataset.jpCatalogBound;
            delete grid.dataset.jpShopSsr;
          }
          setupShopCatalog();
        } else if (path === "/customize" && [...topics].some((topic) => topic.startsWith("customizer_"))) {
          reload();
        } else if (/^\/product\/\d+\/?$/.test(path)) {
          if ([...topics].some((topic) => topic.startsWith("customizer_"))) window.location.reload();
          else setupProductVariants();
        }
      }

      if ([...topics].some((topic) => contentTopics.has(topic))) {
        contentPromise = null;
        setupFaqContent();
        setupHomepageReviews();
        setupAnnouncements();
        const path = window.location.pathname;
        const needsReload =
          (path === "/" &&
            [...topics].some((topic) =>
              ["hero_slides", "editorial_looks", "announcements"].includes(topic),
            )) ||
          (path === "/cart" && topics.has("delivery_settings"));
        if (needsReload) reload();
      }

      if (topics.has("orders") && /\/(profile|account)/.test(window.location.pathname)) {
        reload();
      }
    };

    try {
      const source = new EventSource("/api/realtime");
      source.addEventListener("change", (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (!payload?.topic) return;
          pending.add(payload.topic);
          if (timer) window.clearTimeout(timer);
          timer = window.setTimeout(refresh, 450);
        } catch {
          // Ignore malformed events.
        }
      });
      window.addEventListener("pagehide", () => source.close(), { once: true });
    } catch {
      // Live updates are optional.
    }
  };

  setupProductActions();
  setupProductPage();
  const productBoot = setupProductVariants();
  setupCustomizerNavigation();
  setupProductCustomizerPro();
  setupCartPage();
  setupCarousels();
  setupBestSellerTabs();
  setupEditorialCarousels();
  setupHeroControls();
  setupProductGallery();
  setupLensCompare();
  setupCategoryLabels();
  setupCategoryMenus();
  setupShopCatalog();
  setupGridControls();
  setupComboboxes();
  setupFaq();
  setupForms();
  setupFaqContent();
  setupHomepageReviews();
  setupAnnouncements();
  setupHomepageProductLinks();
  setupProfilePage();
  setupCallButton();
  setupLiveUpdates();

  if (productBoot && typeof productBoot.finally === "function") {
    productBoot.finally(() => document.documentElement.classList.add("jp-ui-ready"));
  } else {
    document.documentElement.classList.add("jp-ui-ready");
  }
})();
