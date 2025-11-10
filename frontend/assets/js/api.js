/* =====================================================================
   api.js
   Lightweight client for integrating the static frontend with the
   Django REST backend (JWT auth, auto refresh, generic fetch wrapper).
   ===================================================================== */

(function (global) {
  const DEFAULT_BASE_URL = (global.API_BASE_URL || "http://localhost:8000").replace(/\/+$/, "");

  const ACCESS_KEY = "htvb.accessToken";
  const REFRESH_KEY = "htvb.refreshToken";
  const USER_KEY = "htvb.authUser";
  const REMEMBER_KEY = "htvb.remember";

  const listeners = new Set();
  let baseUrl = DEFAULT_BASE_URL;
  let refreshPromise = null;

  function safeStorage(name) {
    try {
      return global[name];
    } catch (_) {
      return null;
    }
  }

  const session = safeStorage("sessionStorage");
  const local = safeStorage("localStorage");

  function bootstrapSession() {
    if (!session || !local) {
      return;
    }
    if (session.getItem(ACCESS_KEY)) {
      return;
    }
    if (local.getItem(ACCESS_KEY)) {
      session.setItem(ACCESS_KEY, local.getItem(ACCESS_KEY));
      session.setItem(REFRESH_KEY, local.getItem(REFRESH_KEY));
      session.setItem(USER_KEY, local.getItem(USER_KEY));
    }
  }

  bootstrapSession();

  function setBaseUrl(url) {
    if (typeof url !== "string") {
      return;
    }
    const trimmed = url.trim();
    if (!trimmed) {
      return;
    }
    baseUrl = trimmed.replace(/\/+$/, "");
  }

  function rememberPreference() {
    if (!local) {
      return false;
    }
    return local.getItem(REMEMBER_KEY) === "1";
  }

  function notifyAuth(state) {
    const detail = {
      isAuthenticated: Boolean(state && state.accessToken),
      accessToken: state ? state.accessToken || null : null,
      refreshToken: state ? state.refreshToken || null : null,
      user: state ? state.user || null : null,
    };
    try {
      global.dispatchEvent(new CustomEvent("auth:changed", { detail }));
    } catch (err) {
      console.warn("[api] Không thể phát sự kiện auth:changed:", err);
    }
    listeners.forEach((fn) => {
      try {
        fn(detail);
      } catch (err) {
        console.error("[api] Lỗi khi chạy listener auth:", err);
      }
    });
  }

  function serializeUser(user) {
    if (!user) {
      return null;
    }
    try {
      return JSON.stringify(user);
    } catch (err) {
      console.warn("[api] Không thể serialize user:", err);
      return null;
    }
  }

  function storeAuth({ access, refresh, user }, remember) {
    const userString = serializeUser(user);
    if (session) {
      if (access) {
        session.setItem(ACCESS_KEY, access);
      } else {
        session.removeItem(ACCESS_KEY);
      }
      if (refresh) {
        session.setItem(REFRESH_KEY, refresh);
      } else {
        session.removeItem(REFRESH_KEY);
      }
      if (userString) {
        session.setItem(USER_KEY, userString);
      } else {
        session.removeItem(USER_KEY);
      }
    }
    if (local) {
      if (remember) {
        if (access) {
          local.setItem(ACCESS_KEY, access);
        }
        if (refresh) {
          local.setItem(REFRESH_KEY, refresh);
        }
        if (userString) {
          local.setItem(USER_KEY, userString);
        }
        local.setItem(REMEMBER_KEY, "1");
      } else {
        local.removeItem(ACCESS_KEY);
        local.removeItem(REFRESH_KEY);
        local.removeItem(USER_KEY);
        local.removeItem(REMEMBER_KEY);
      }
    }
    notifyAuth({
      accessToken: access || null,
      refreshToken: refresh || null,
      user: user || null,
    });
  }

  function parseStoredUser(raw) {
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch (err) {
      console.warn("[api] Không thể parse user lưu trữ:", err);
      return null;
    }
  }

  function getAccessToken() {
    return (session && session.getItem(ACCESS_KEY)) || (local && local.getItem(ACCESS_KEY)) || null;
  }

  function getRefreshToken() {
    return (session && session.getItem(REFRESH_KEY)) || (local && local.getItem(REFRESH_KEY)) || null;
  }

  function getStoredUser() {
    const raw = (session && session.getItem(USER_KEY)) || (local && local.getItem(USER_KEY)) || null;
    return parseStoredUser(raw);
  }

  function buildUrl(path, params) {
    let url;

    if (!path) {
      url = baseUrl;
    } else if (/^https?:\/\//i.test(path)) {
      url = path;
    } else if (path.startsWith("/")) {
      url = `${baseUrl}${path}`;
    } else {
      url = `${baseUrl}/${path}`;
    }

    if (!params || typeof params !== "object") {
      return url;
    }
    const query = toQuery(params);
    if (!query) {
      return url;
    }
    return `${url.replace(/\?$/, "")}${query}`;
  }

  function prepareRequestOptions(options) {
    const opts = Object.assign({}, options || {});
    const headers = new Headers(opts.headers || {});
    if (!headers.has("Accept")) {
      headers.set("Accept", "application/json");
    }

    let body = opts.body;
    const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
    const isBlob =
      typeof Blob !== "undefined" &&
      (body instanceof Blob || body instanceof ArrayBuffer || ArrayBuffer.isView(body));

    if (
      body &&
      typeof body === "object" &&
      !isFormData &&
      !isBlob &&
      typeof body.pipe !== "function"
    ) {
      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      body = JSON.stringify(body);
    }

    const method = (opts.method || (body ? "POST" : "GET")).toUpperCase();

    const init = {
      method,
      headers,
      body: body || undefined,
      mode: opts.mode || "cors",
      cache: opts.cache || "no-cache",
      credentials: "omit",
    };

    const retryInit = () => {
      const newHeaders = new Headers(headers);
      const cloned = {
        method,
        headers: newHeaders,
        mode: init.mode,
        cache: init.cache,
        credentials: init.credentials,
      };
      if (body) {
        cloned.body = body;
      }
      return cloned;
    };

    return { init, retryInit };
  }

  async function parseResponse(response) {
    if (response.status === 204) {
      return null;
    }
    const contentType = response.headers.get("Content-Type") || "";
    if (!contentType) {
      try {
        const text = await response.text();
        return text || null;
      } catch (_) {
        return null;
      }
    }
    if (contentType.includes("application/json")) {
      try {
        return await response.json();
      } catch (err) {
        console.warn("[api] Không thể parse JSON:", err);
        return null;
      }
    }
    try {
      const text = await response.text();
      return text || null;
    } catch (err) {
      console.warn("[api] Không thể đọc response:", err);
      return null;
    }
  }

  async function refreshAccessToken() {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      return null;
    }

    if (!refreshPromise) {
      refreshPromise = (async () => {
        const url = buildUrl("/api/v1/auth/jwt/refresh/");
        let response;
        try {
          response = await fetch(url, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ refresh: refreshToken }),
            mode: "cors",
            credentials: "omit",
          });
        } catch (err) {
          console.error("[api] Lỗi khi gọi refresh token:", err);
          clearAuth();
          return null;
        }

        let data = null;
        try {
          data = await response.json();
        } catch (err) {
          data = null;
        }

        if (!response.ok || !data || !data.access) {
          clearAuth();
          return null;
        }

        const user = getStoredUser();
        const remember = rememberPreference();
        storeAuth(
          {
            access: data.access,
            refresh: refreshToken,
            user,
          },
          remember
        );
        return data.access;
      })().finally(() => {
        refreshPromise = null;
      });
    }

    try {
      return await refreshPromise;
    } catch (err) {
      console.error("[api] Refresh token thất bại:", err);
      return null;
    }
  }

  function clearAuth() {
    storeAuth({ access: null, refresh: null, user: null }, false);
  }

  function toQuery(params) {
    if (!params || typeof params !== "object") {
      return "";
    }
    const parts = [];
    Object.keys(params).forEach((key) => {
      const value = params[key];
      if (value === undefined || value === null || value === "") {
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (item === undefined || item === null || item === "") return;
          parts.push(
            `${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`
          );
        });
        return;
      }
      parts.push(
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
      );
    });
    if (!parts.length) {
      return "";
    }
    return `?${parts.join("&")}`;
  }


  function extractItems(payload) {
    if (!payload) {
      return [];
    }
    if (Array.isArray(payload.items)) {
      return payload.items;
    }
    if (Array.isArray(payload.results)) {
      return payload.results;
    }
    if (Array.isArray(payload)) {
      return payload;
    }
    return [];
  }

  function extractPageMeta(payload) {
    const items = extractItems(payload);
    const totalItems =
      typeof payload?.total_items === "number" ? payload.total_items : items.length;
    const pageSize =
      typeof payload?.page_size === "number" && payload.page_size > 0
        ? payload.page_size
        : items.length || 1;
    const page =
      typeof payload?.page === "number" && payload.page > 0 ? payload.page : 1;
    const totalPages =
      typeof payload?.total_pages === "number" && payload.total_pages > 0
        ? payload.total_pages
        : pageSize > 0
        ? Math.max(1, Math.ceil(totalItems / pageSize))
        : 1;
    return {
      totalItems,
      totalPages,
      page,
      pageSize,
    };
  }

  async function request(path, options) {
    const url = buildUrl(path);
    const opts = options || {};
    const { init, retryInit } = prepareRequestOptions(opts);
    const skipAuth = Boolean(opts && opts.skipAuth);

    if (!skipAuth) {
      const token = getAccessToken();
      if (token) {
        init.headers.set("Authorization", `Bearer ${token}`);
      }
    }

    let response;
    try {
      response = await fetch(url, init);
    } catch (err) {
      const networkError = new Error("Không thể kết nối tới máy chủ.");
      networkError.cause = err;
      throw networkError;
    }

    if (response.status === 401 && !skipAuth) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        const retryOptions = retryInit();
        retryOptions.headers.set("Authorization", `Bearer ${newToken}`);
        response = await fetch(url, retryOptions);
      }
    }

    const payload = await parseResponse(response);
    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && typeof payload.detail === "string"
          ? payload.detail
          : "Yêu cầu thất bại.";
      const error = new Error(message);
      error.status = response.status;
      error.data = payload;
      if (payload && typeof payload.code === "string") {
        error.code = payload.code;
      }
      if (payload && payload.field_errors && typeof payload.field_errors === "object") {
        error.fieldErrors = payload.field_errors;
      }
      throw error;
    }
    return payload;
  }

  async function login(username, password, remember) {
    const payload = {
      username: String(username || "").trim(),
      password: String(password || ""),
    };
    const data = await request("/api/v1/auth/jwt/create/", {
      method: "POST",
      body: payload,
      skipAuth: true,
    });

    if (!data || !data.access || !data.refresh) {
      throw new Error("Không nhận được token từ máy chủ.");
    }

    const user = data.user || null;
    storeAuth(
      {
        access: data.access,
        refresh: data.refresh,
        user,
      },
      Boolean(remember)
    );
    return {
      access: data.access,
      refresh: data.refresh,
      user,
    };
  }

  async function getMe() {
    const data = await request("/api/v1/auth/me/", { method: "GET" });
    if (!data) {
      return null;
    }
    const remember = rememberPreference();
    storeAuth(
      {
        access: getAccessToken(),
        refresh: getRefreshToken(),
        user: data,
      },
      remember
    );
    return data;
  }


  async function logout(options) {
    const cfg = options || {};
    const endpoint = cfg.endpoint === undefined ? "/auth/logout" : cfg.endpoint;

    if (endpoint) {
      try {
        await request(endpoint, { method: "POST" });
      } catch (err) {
        if (!err || (err.status !== 404 && err.status !== 405)) {
          console.warn("[api] Không thể gọi logout endpoint:", err);
        }
      }
    }

    clearAuth();
  }

  function onAuthChanged(callback) {
    if (typeof callback !== "function") {
      return function noop() {};
    }
    listeners.add(callback);
    return function unsubscribe() {
      listeners.delete(callback);
    };
  }

  async function ensureAuthenticated() {
    const token = getAccessToken();
    if (!token) {
      return false;
    }
    try {
      await getMe();
      return true;
    } catch (err) {
      console.warn("[api] Không thể xác thực người dùng hiện tại:", err);
      clearAuth();
      return false;
    }
  }

  const registerBookApi = {
    list(params) {
      return request(buildUrl("/api/v1/register-books/", params), {
        method: "GET",
      });
    },
    create(payload) {
      return request("/api/v1/register-books/", {
        method: "POST",
        body: payload,
      });
    },
    update(id, payload, method = "PATCH") {
      if (!id) throw new Error("Thiếu register_id");
      return request(`/api/v1/register-books/${id}/`, {
        method,
        body: payload,
      });
    },
    remove(id) {
      if (!id) throw new Error("Thiếu register_id");
      return request(`/api/v1/register-books/${id}/`, { method: "DELETE" });
    },
    import(formData) {
      return request("/api/v1/register-books/import/", {
        method: "POST",
        body: formData,
      });
    },
    export(params) {
      return request(buildUrl("/api/v1/register-books/export/", params), {
        method: "GET",
      });
    },
  };

  const numberingRuleApi = {
    list(params) {
      return request(buildUrl("/api/v1/numbering-rules/", params), {
        method: "GET",
      });
    },
    create(payload) {
      return request("/api/v1/numbering-rules/", {
        method: "POST",
        body: payload,
      });
    },
    update(id, payload, method = "PATCH") {
      if (!id) throw new Error("Thiếu rule_id");
      return request(`/api/v1/numbering-rules/${id}/`, {
        method,
        body: payload,
      });
    },
    remove(id) {
      if (!id) throw new Error("Thiếu rule_id");
      return request(`/api/v1/numbering-rules/${id}/`, { method: "DELETE" });
    },
  };

  const documentTemplateApi = {
    list(params) {
      return request(buildUrl("/api/v1/document-templates/", params), {
        method: "GET",
      });
    },
    create(payload) {
      return request("/api/v1/document-templates/", {
        method: "POST",
        body: payload,
      });
    },
    update(id, payload, method = "PATCH") {
      if (!id) throw new Error("Thiếu template_id");
      return request(`/api/v1/document-templates/${id}/`, {
        method,
        body: payload,
      });
    },
    remove(id) {
      if (!id) throw new Error("Thiếu template_id");
      return request(`/api/v1/document-templates/${id}/`, {
        method: "DELETE",
      });
    },
  };

  const workflowTransitionApi = {
    list(params) {
      return request(buildUrl("/api/v1/workflow-transitions/", params), {
        method: "GET",
      });
    },
    create(payload) {
      return request("/api/v1/workflow-transitions/", {
        method: "POST",
        body: payload,
      });
    },
    update(id, payload, method = "PATCH") {
      if (!id) throw new Error("Thiếu transition_id");
      return request(`/api/v1/workflow-transitions/${id}/`, {
        method,
        body: payload,
      });
    },
    remove(id) {
      if (!id) throw new Error("Thiếu transition_id");
      return request(`/api/v1/workflow-transitions/${id}/`, {
        method: "DELETE",
      });
    },
  };

  const api = {
    init(config) {
      const cfg = config || {};
      if (cfg.baseUrl) {
        setBaseUrl(cfg.baseUrl);
      }
      if (typeof cfg.onAuthChanged === "function") {
        onAuthChanged(cfg.onAuthChanged);
      }
      return {
        baseUrl,
        accessToken: getAccessToken(),
        refreshToken: getRefreshToken(),
        user: getStoredUser(),
      };
    },
    setBaseUrl,
    getBaseUrl: () => baseUrl,
    login,
    logout,
    request,
    getMe,
    ensureAuthenticated,
    getAccessToken,
    extractItems,
    extractPageMeta,
    getRefreshToken,
    getCurrentUser: getStoredUser,
    onAuthChanged,
    clearAuth,
    buildUrl,
    registerBooks: registerBookApi,
    numberingRules: numberingRuleApi,
    documentTemplates: documentTemplateApi,
    workflowTransitions: workflowTransitionApi,
  };

  global.ApiClient = api;
})(window);
