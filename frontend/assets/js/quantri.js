/* ============================================================
   quantri.js
   Admin module interactions for dashboard & management pages.
   Re-created after binary corruption detected on 2025-11-07.
============================================================ */

(function () {
  "use strict";

  const doc = document;
  const body = doc.body;
  const $ = (selector, root = doc) => (root ? root.querySelector(selector) : null);
  const $$ = (selector, root = doc) => (root ? Array.from(root.querySelectorAll(selector)) : []);
  const noop = () => {};

  const normalizeText = (value) =>
    (value || "")
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[^\w\s]+/g, " ")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const toNumber = (value, fallback = 0) => {
    const num = Number.parseFloat(String(value).replace(/[,.\s]/g, (ch) => (ch === "," ? "." : "")));
    return Number.isFinite(num) ? num : fallback;
  };

  const AdminRuntime = {
    debounce: window.TrisApp?.debounce || createDebounce(),
    toast: window.TrisApp?.showToast || createToast(),
  };

  exposeGlobals();
  onReady(() => {
    bootstrapLayout();
    const page = detectPage();
    const controllers = {
      dashboard: initDashboard,
      nguoidung: initNguoiDung,
      "nguoidung-detail": initNguoiDungDetail,
      phanquyen: initPhanQuyen,
      danhmuc: initDanhMuc,
      cauhinh: initCauHinh,
      hosoluutru: initHoSoLuuTru,
      thongbaonhacviec: initThongBao,
      thongkebaocao: initThongKe,
      taikhoan: initTaiKhoan,
      quanlyhethong: initQuanLyHeThong,
    };
    (controllers[page] || noop)();
  });

  function onReady(callback) {
    if (typeof callback !== "function") return;
    if (doc.readyState === "complete" || doc.readyState === "interactive") {
      queueMicrotask(callback);
      return;
    }
    doc.addEventListener("DOMContentLoaded", callback, { once: true });
  }

  function detectPage() {
    const explicit = body?.dataset?.page;
    if (explicit) {
      return explicit.toLowerCase();
    }
    const path = (location.pathname || "dashboard.html").split("/").pop() || "dashboard.html";
    const clean = path.split(/[?#]/)[0].replace(/\.html$/i, "").toLowerCase();
    if (!clean || clean === "index") return "dashboard";
    const aliases = {
      danhmucdetail: "danhmuc-detail",
      thongbao: "thongbaonhacviec",
    };
    return aliases[clean] || clean;
  }

  function bootstrapLayout() {
    const sidebar = $("#sidebar");
    const toggleBtn = $("#btnSidebar") || $("#btn-sidebar");
    if (sidebar && toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        const isOpen = !sidebar.classList.contains("-translate-x-full");
        sidebar.classList.toggle("-translate-x-full", isOpen);
        sidebar.classList.toggle("hidden", isOpen);
        toggleBtn.setAttribute("aria-expanded", String(!isOpen));
      });
    }

    doc.addEventListener("click", (event) => {
      const dropdown = event.target.closest("[data-dropdown]");
      if (dropdown) {
        toggleDropdown(dropdown);
        return;
      }
      if (!event.target.closest(".dropdown-menu")) {
        closeAllDropdowns();
      }
    });

    $$("[data-quick-toast]").forEach((btn) => {
      btn.addEventListener("click", () => AdminRuntime.toast(btn.dataset.quickToast));
    });
  }

  function exposeGlobals() {
    window.AdminApp = Object.assign({}, window.AdminApp, {
      showToast: AdminRuntime.toast,
      debounce: AdminRuntime.debounce,
      formatNumber,
      animateValue,
    });
  }

  /* --------------------------- Dashboard --------------------------- */
  function initDashboard() {
    animateDashboardMetrics();
    wireDashboardActions();
    hydrateAuditTimeline();
  }

  function animateDashboardMetrics() {
    const counters = $$('[data-kpi], [data-metric], [data-counter], #metricUsers, #metricDocs');
    counters.forEach((el) => {
      const target = toNumber(el.dataset.target || el.textContent, 0);
      animateValue(el, target, { duration: 600 });
    });

    $$('[data-progress-value]').forEach((bar) => {
      const target = Number(bar.dataset.progressValue) || 0;
      bar.style.width = '0%';
      requestAnimationFrame(() => {
        bar.style.transition = 'width .8s ease';
        bar.style.width = `${Math.min(100, Math.max(0, target))}%`;
      });
    });
  }

  function wireDashboardActions() {
    $$("[data-action]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        const action = btn.dataset.action;
        const target = event.currentTarget?.dataset?.target || "";
        const message = btn.dataset.message || `Thao tác '${action || "action"}' đã thực hiện.`;
        AdminRuntime.toast(message.replace("{target}", target || ""));
      });
    });
  }

  function hydrateAuditTimeline() {
    const list = $("#adminTimeline");
    if (!list) return;
    const items = $$("li", list);
    if (!items.length) return;
    const now = new Date();
    items.forEach((item, index) => {
      const badge = item.querySelector("time");
      if (badge && !badge.dataset.filled) {
        badge.dataset.filled = "true";
        badge.textContent = formatRelative(now, index * 37);
      }
    });
  }

  /* --------------------------- Người dùng --------------------------- */
  function initNguoiDung() {
    const table = $("#user-table");
    if (!table) return;
    const searchInput = $("#user-search");
    const countEls = [$("#userCount"), $("#userCountBottom")].filter(Boolean);
    const state = { keyword: "", role: "all", dept: "all", status: "all" };

    const applyFilters = () => {
      const rows = $$('tr', table);
      let visible = 0;
      rows.forEach((row) => {
        if (!row.dataset) return;
        const haystack = normalizeText(row.textContent);
        const role = row.dataset.role || "";
        const dept = row.dataset.dept || "";
        const status = row.dataset.status || "";
        const matchKeyword = !state.keyword || haystack.includes(state.keyword);
        const matchRole = state.role === "all" || role === state.role;
        const matchDept = state.dept === "all" || dept === state.dept;
        const matchStatus = state.status === "all" || status === state.status;
        const shouldShow = matchKeyword && matchRole && matchDept && matchStatus;
        row.classList.toggle("hidden", !shouldShow);
        if (shouldShow) visible++;
      });
      countEls.forEach((el) => {
        if (!el) return;
        if (el.id === "userCount") {
          el.textContent = `(${visible})`;
        } else {
          el.textContent = String(visible);
        }
      });
    };

    const debouncedFilter = AdminRuntime.debounce(() => applyFilters(), 160);
    searchInput?.addEventListener("input", (event) => {
      state.keyword = normalizeText(event.target.value);
      debouncedFilter();
    });

    setupFilterDropdown("filterRoleBtn", state, "role", applyFilters);
    setupFilterDropdown("filterDeptBtn", state, "dept", applyFilters);
    setupFilterDropdown("filterStatusBtn", state, "status", applyFilters);

    const addBtn = $("#btn-add-user");
    const modal = initModal("#addUserModal");
    addBtn?.addEventListener("click", () => modal.open());
    modal.form?.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const name = formData.get("fullName") || "Người dùng";
      AdminRuntime.toast(`Đã thêm ${name}. Bạn có thể đồng bộ với hệ thống IAM sau.`);
      event.currentTarget.reset();
      modal.close();
    });

    table.addEventListener("change", (event) => {
      if (!event.target.matches("[data-user-status]")) return;
      const label = event.target.closest("label")?.querySelector(".badge");
      if (label) {
        label.textContent = event.target.checked ? "Hoạt động" : "Tạm khóa";
        label.classList.toggle("badge--dark", event.target.checked);
        label.classList.toggle("badge--muted", !event.target.checked);
      }
      AdminRuntime.toast(event.target.checked ? "Đã mở khóa tài khoản." : "Đã tạm khóa tài khoản.");
    });

    table.addEventListener("click", (event) => {
      const btn = event.target.closest(".btn-icon");
      if (!btn || btn.tagName === "A") return;
      event.preventDefault();
      const row = btn.closest("tr");
      const name = row?.querySelector(".font-medium")?.textContent?.trim() || "tài khoản";
      AdminRuntime.toast(`Đang xử lý thao tác với ${name}.`);
    });

    applyFilters();
  }

  function setupFilterDropdown(buttonId, state, key, onChange) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    const menuSelector = btn.dataset.dropdown;
    const menu = menuSelector ? document.querySelector(menuSelector) : null;
    if (!menu) return;

    btn.addEventListener("click", (event) => {
      event.preventDefault();
      toggleDropdown(btn);
    });

    $$(".dropdown-item", menu).forEach((item) => {
      item.addEventListener("click", () => {
        const value = item.dataset[key] || "all";
        state[key] = value;
        btn.querySelector(".btn-label").textContent = item.textContent.trim();
        closeDropdown(menu);
        onChange?.();
      });
    });
  }

  function initNguoiDungDetail() {
    const logPanel = $("#userLogPanel");
    if (logPanel) {
      $$('[data-expand-log]')
        .filter(Boolean)
        .forEach((btn) =>
          btn.addEventListener("click", () => {
            logPanel.classList.toggle("max-h-60");
            logPanel.classList.toggle("overflow-hidden");
            btn.textContent = logPanel.classList.contains("max-h-60") ? "Xem thêm" : "Thu gọn";
          })
        );
    }

    $$("[data-copy]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.dataset.copy;
        navigator.clipboard?.writeText(value).then(() => AdminRuntime.toast("Đã sao chép."));
      });
    });

    const resetBtn = $("[data-reset-pass]");
    resetBtn?.addEventListener("click", () => {
      AdminRuntime.toast("Đã gửi liên kết đặt lại mật khẩu.");
    });
  }

  /* --------------------------- Phân quyền --------------------------- */
  function initPhanQuyen() {
    const tabs = $$('.tab-btn[data-tab]');
    if (tabs.length) {
      tabs.forEach((btn) =>
        btn.addEventListener("click", () => {
          tabs.forEach((b) => b.classList.toggle("is-active", b === btn));
          const target = btn.dataset.tab;
          $$('[id^="tab-"]', doc).forEach((panel) => {
            const id = panel.id.replace('tab-', '');
            panel.classList.toggle("hidden", panel.id !== `tab-${target}`);
          });
        })
      );
      tabs[0].click();
    }

    $$(".perm-checkall").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const col = checkbox.dataset.col;
        $$("#perm-table input[data-perm='" + col + "']").forEach((input) => {
          input.checked = checkbox.checked;
        });
      });
    });

    const search = $("#userperm-search");
    if (search) {
      const targetTable = $("#userperm-table");
      const rows = targetTable ? $$('tr', targetTable) : [];
      const applySearch = () => {
        const needle = normalizeText(search.value);
        let visible = 0;
        rows.forEach((row) => {
          const hit = !needle || normalizeText(row.textContent).includes(needle);
          row.classList.toggle("hidden", !hit);
          if (hit) visible++;
        });
        const counter = $("[data-userperm-count]");
        if (counter) counter.textContent = String(visible);
      };
      search.addEventListener("input", AdminRuntime.debounce(applySearch, 120));
      applySearch();
    }

    ["btn-export", "btn-import", "btn-create-group"].forEach((id) => {
      const btn = document.getElementById(id);
      btn?.addEventListener("click", () => AdminRuntime.toast("Tính năng sẽ kết nối API sau."));
    });
  }

  /* --------------------------- Danh mục hệ thống --------------------------- */
  function initDanhMuc() {
    const tabButtons = $$('.seg-btn[data-tab]');
    if (!tabButtons.length) return;
    const searchInput = $("#dm-search");
    let activeTab = tabButtons.find((btn) => btn.classList.contains("is-active"))?.dataset.tab || tabButtons[0].dataset.tab;

    const showTab = (tabName) => {
      activeTab = tabName;
      tabButtons.forEach((btn) => btn.classList.toggle("is-active", btn.dataset.tab === tabName));
      $$('[id^="tab-"]').forEach((panel) => {
        panel.classList.toggle("hidden", panel.id !== `tab-${tabName}`);
      });
      applySearch();
    };

    tabButtons.forEach((btn) => btn.addEventListener("click", () => showTab(btn.dataset.tab)));

    const applySearch = () => {
      if (!activeTab) return;
      const section = document.getElementById(`tab-${activeTab}`);
      if (!section) return;
      const keyword = normalizeText(searchInput?.value);
      const rows = $$('tbody tr', section);
      let visible = 0;
      rows.forEach((row) => {
        const hit = !keyword || normalizeText(row.textContent).includes(keyword);
        row.classList.toggle("hidden", !hit);
        if (hit) visible++;
      });
      const emptyNote = section.querySelector("[data-empty]");
      if (emptyNote) emptyNote.classList.toggle("hidden", Boolean(visible));
    };

    searchInput?.addEventListener("input", AdminRuntime.debounce(applySearch, 160));
    showTab(activeTab);
    loadRegisterBooks();
    loadNumberingSummary();
  }

  /* --------------------------- Cấu hình nâng cao --------------------------- */
  function initCauHinh() {
    const panels = [
      createConfigPanel({
        openBtn: "#qt-btn-open-numbering",
        panel: "#qt-numbering-panel",
        closeBtn: "#qt-numbering-close",
        form: "#qt-numbering-form",
        feedback: "#qt-numbering-feedback",
      }),
      createConfigPanel({
        openBtn: "#qt-btn-open-template",
        panel: "#qt-template-panel",
        closeBtn: "#qt-template-close",
        form: "#qt-template-form",
        feedback: "#qt-template-feedback",
      }),
      createConfigPanel({
        openBtn: "#qt-btn-open-transition",
        panel: "#qt-transition-panel",
        closeBtn: "#qt-transition-close",
        form: "#qt-transition-form",
        feedback: "#qt-transition-feedback",
      }),
    ];

    panels.forEach((panel) => panel?.init());

    $$('[data-sync-config]').forEach((btn) =>
      btn.addEventListener("click", () => AdminRuntime.toast("Đã lưu cấu hình, sẽ sync với server sau."))
    );
  }

  const REGISTER_RESET_LABELS = {
    yearly: 'Hằng năm',
    quarterly: 'Theo quý',
    monthly: 'Hằng tháng',
    never: 'Không reset',
  };

  async function loadRegisterBooks() {
    const body = document.getElementById('qt-register-body');
    const totalEl = document.getElementById('qt-register-total');
    if (!body) return;
    const api = window.ApiClient;
    if (!api?.registerBooks) {
      body.innerHTML =
        '<tr><td colspan="7" class="px-4 py-6 text-center text-slate-400 text-sm">Register book API not available.</td></tr>';
      if (totalEl) totalEl.textContent = '0';
      return;
    }
    body.innerHTML =
      '<tr><td colspan="7" class="px-4 py-6 text-center text-slate-400 text-sm">Đang tải dữ liệu sổ đăng ký...</td></tr>';
    try {
      const response = await api.registerBooks.list({ page_size: 32 });
      const books = api.extractItems(response);
      if (!books.length) {
        body.innerHTML =
          '<tr><td colspan="7" class="px-4 py-6 text-center text-slate-400 text-sm">Chưa có sổ đăng ký nào.</td></tr>';
        if (totalEl) totalEl.textContent = '0';
        return;
      }
      body.innerHTML = books
        .map((book) => {
          const direction =
            book.direction === 'di' ? 'Văn bản đi' : book.direction === 'den' ? 'Văn bản đến' : 'Khác';
          const reset = REGISTER_RESET_LABELS[book.reset_policy] || book.reset_policy || '—';
          const status = book.is_active ? 'Hoạt động' : 'Đã khóa';
          return `<tr class="hover:bg-slate-50/60">
            <td class="px-4 py-3 font-mono text-[12px] text-slate-600">${book.prefix || '—'}</td>
            <td class="px-4 py-3">${book.name || '—'}</td>
            <td class="px-4 py-3">${direction}</td>
            <td class="px-4 py-3">${book.year || '—'}</td>
            <td class="px-4 py-3">${book.next_sequence ?? '—'}</td>
            <td class="px-4 py-3">${reset}</td>
            <td class="px-4 py-3">
              <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[12px] ${
                book.is_active ? 'border-slate-300 text-slate-700' : 'border-rose-200 text-rose-600'
              }">${status}</span>
            </td>
          </tr>`;
        })
        .join('');
      if (totalEl) totalEl.textContent = String(books.length);
    } catch (error) {
      body.innerHTML = `<tr><td colspan="7" class="px-4 py-6 text-center text-rose-500 text-sm">${resolveApiError(
        error
      )}</td></tr>`;
      if (totalEl) totalEl.textContent = '0';
    }
  }

  async function loadNumberingSummary() {
    const countEl = document.getElementById('qt-numbering-count');
    const activeEl = document.getElementById('qt-numbering-active');
    const api = window.ApiClient;
    if (!api?.numberingRules) {
      if (countEl) countEl.textContent = '—';
      if (activeEl) activeEl.textContent = '—';
      return;
    }
    try {
      const response = await api.numberingRules.list({ page_size: 64 });
      const rules = api.extractItems(response);
      if (countEl) countEl.textContent = String(rules.length);
      if (activeEl) {
        const activeCount = rules.filter((rule) => rule.is_active).length;
        activeEl.textContent = String(activeCount);
      }
    } catch (error) {
      if (countEl) countEl.textContent = '—';
      if (activeEl) activeEl.textContent = '—';
      console.error('[quantri] loadNumberingSummary', error);
    }
  }

  function resolveApiError(error) {
    const helpers = window.DocHelpers;
    if (helpers?.resolveErrorMessage) {
      return helpers.resolveErrorMessage(error);
    }
    if (!error) return 'Không thể tải dữ liệu.';
    if (error.data) {
      if (typeof error.data === 'string') return error.data;
      if (error.data.detail) return String(error.data.detail);
    }
    if (error.message) return String(error.message);
    return 'Không thể tải dữ liệu.';
  }

  function createConfigPanel(options) {
    const openBtn = $(options.openBtn);
    const panel = $(options.panel);
    const closeBtn = $(options.closeBtn);
    const form = $(options.form);
    const feedback = $(options.feedback);
    if (!openBtn || !panel || !closeBtn || !form) return null;
    const open = () => panel.classList.remove("hidden");
    const close = () => panel.classList.add("hidden");
    openBtn.addEventListener("click", open);
    closeBtn.addEventListener("click", close);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      feedback.textContent = `Đã lưu bản nháp (${new Date().toLocaleTimeString("vi-VN")}).`;
      AdminRuntime.toast("Đã lưu cấu hình tạm.");
      console.info("[quantri] draft data", data);
      close();
    });
    form.querySelector(options.resetBtn || "[type='reset']")?.addEventListener("click", () => {
      feedback.textContent = "Đã xóa dữ liệu tạm.";
    });
    return { init: noop };
  }

  /* --------------------------- Hồ sơ lưu trữ --------------------------- */
  function initHoSoLuuTru() {
    const navButtons = $$('[data-archive-tab]');
    if (!navButtons.length) return;
    const show = (tab) => {
      navButtons.forEach((btn) => btn.classList.toggle("is-active", btn.dataset.archiveTab === tab));
      $$('[id^="tab-"]').forEach((panel) => panel.classList.toggle("hidden", panel.id !== tab));
    };
    navButtons.forEach((btn) => btn.addEventListener("click", () => show(btn.dataset.archiveTab)));
    show(navButtons[0].dataset.archiveTab);

    ["btn-restore", "btn-backup", "btn-archive"].forEach((id) => {
      const btn = document.getElementById(id);
      btn?.addEventListener("click", () => AdminRuntime.toast("Tính năng đang kết nối tới dịch vụ lưu trữ."));
    });
  }

  /* --------------------------- Thông báo & nhắc việc --------------------------- */
  function initThongBao() {
    const tabBtns = $$('[data-tab]');
    tabBtns.forEach((btn) =>
      btn.addEventListener("click", () => {
        tabBtns.forEach((b) => b.classList.toggle("is-active", b === btn));
        const tabId = btn.dataset.tab;
        $$('[id^="tab-"]').forEach((panel) => panel.classList.toggle("hidden", panel.id !== tabId));
      })
    );
    tabBtns[0]?.click();

    $$("[data-notify-toggle]").forEach((toggle) => {
      toggle.addEventListener("change", () => {
        const name = toggle.dataset.channel || "Kênh";
        AdminRuntime.toast(`${name}: ${toggle.checked ? "Bật" : "Tắt"} nhắc việc.`);
      });
    });
  }

  /* --------------------------- Báo cáo - thống kê --------------------------- */
    async function initThongKe() {
    animateDashboardMetrics();
    const filterBtn = $("#btnFilter");
    filterBtn?.addEventListener("click", () => AdminRuntime.toast("Applying filters, charts will refresh."));
    ["#btnExcel", "#btnPdf"].forEach((selector) => {
      $(selector)?.addEventListener("click", () => AdminRuntime.toast("Export is being prepared."));
    });
    await updateReportCharts();
  }
  function renderReportCharts(data = {}) {
    const lineData = data.accessLine || data.line || [];
    const weekBars = data.weekBars || data.bar || [];
    const priorityBars = data.priorityBars || [];
    const dayLine = data.dayLine || [];
    const perfBars = data.perfBars || [];
    const otherLine = data.accessLine2 || lineData;
    const weekBars2 = data.weekBars2 || weekBars;

    renderLineCanvas('chAccessDay', lineData);
    renderBarCanvas('chWeekBars', weekBars);
    renderBarCanvas('chPriority', priorityBars, ['#2563eb', '#0f172a', '#38bdf8']);
    renderLineCanvas('chDayLine', dayLine, '#0f172a');
    renderBarCanvas('chPerfDept', perfBars, ['#10b981', '#f97316']);
    renderLineCanvas('chAccessDay2', otherLine, '#a855f7');
    renderBarCanvas('chWeekBars2', weekBars2, ['#6d28d9', '#0ea5e9']);
  }

  function updateReportCharts() {
    const api = window.ApiClient;
    if (!api) {
      renderReportCharts();
      return Promise.resolve();
    }
    return Promise.all([
      api.documents.list({ ordering: '-created_at', page_size: 52 }),
      api.cases.list({ ordering: '-created_at', page_size: 32 }),
    ])
      .then(([docResp, caseResp]) => {
        const docs = api.extractItems(docResp);
        const cases = api.extractItems(caseResp);
        const docMeta = api.extractPageMeta(docResp);
        const caseMeta = api.extractPageMeta(caseResp);
        updateTopCards(docMeta, docs, caseMeta, cases);
        renderReportCharts({
          accessLine: buildDayCounts(docs, 8),
          weekBars: buildDayCounts(docs, 6),
          priorityBars: buildPriorityCounts(docs),
          dayLine: buildDayCounts(docs, 7),
          perfBars: buildCaseStatusCounts(cases),
          accessLine2: buildDayCounts(docs, 5),
          weekBars2: buildDayCounts(docs, 4),
        });
      })
      .catch((error) => {
        console.error('[quantri] updateReportCharts failed', error);
        renderReportCharts();
      });
  }

  function updateTopCards(docMeta, docs, caseMeta, cases) {
    const container = document.querySelector('section.grid.grid-cols-1.md\:grid-cols-4');
    if (!container) return;
    const cards = Array.from(container.querySelectorAll('article'));
    const stats = buildTopStats(docMeta, docs, caseMeta, cases);
    cards.forEach((card, index) => {
      const valueEl = card.querySelector('.text-2xl.font-bold');
      const textEl = card.querySelector('p');
      if (valueEl && stats[index]) valueEl.textContent = stats[index].value;
      if (textEl && stats[index]) textEl.textContent = stats[index].text;
    });
  }

  function buildTopStats(docMeta, docs, caseMeta, cases) {
    const totalDocs = docMeta?.totalItems ?? docs.length;
    const totalCases = caseMeta?.totalItems ?? cases.length;
    const finishedDocs = docs.filter(isDocFinished).length;
    const inProgressCount = Math.max(0, docs.length - finishedDocs);
    const processingRate = docs.length ? Math.round((inProgressCount / docs.length) * 100) : 0;
    const overdueCount = computeOverdueCases(cases);
    const overduePercent = cases.length ? Math.round((overdueCount / cases.length) * 100) : 0;
    return [
      { value: totalDocs.toLocaleString('vi-VN'), text: 'Live API data' },
      { value: `${totalCases.toLocaleString('vi-VN')}`, text: `${cases.length} recent cases` },
      { value: `${processingRate}%`, text: `${inProgressCount}/${docs.length || 1} processing` },
      { value: `${overduePercent}%`, text: `${overdueCount}/${cases.length || 1} overdue` },
    ];
  }

  function isDocFinished(doc) {
    const status = (doc.status?.code || doc.status?.name || doc.status || '').toString().toLowerCase();
    return ['done', 'completed', 'published', 'archived', 'closed'].some((value) => status.includes(value));
  }

  function computeOverdueCases(cases) {
    const now = Date.now();
    return cases.reduce((count, item) => {
      const raw = item.due_date || item.dueDate || item.due || item.deadline || item.deadline_at;
      if (!raw) return count;
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return count;
      const status = (item.status?.code || item.status?.name || '').toString().toLowerCase();
      if (['done', 'completed', 'closed'].some((value) => status.includes(value))) return count;
      if (date.getTime() < now) return count + 1;
      return count;
    }, 0);
  }

  function buildDayCounts(items, days = 7) {
    const now = new Date();
    const buckets = [];
    const indexByKey = {};
    for (let i = days - 1; i >= 0; i -= 1) {
      const date = new Date(now);
      date.setDate(now.getDate() - i);
      const key = date.toISOString().slice(0, 10);
      indexByKey[key] = buckets.length;
      buckets.push(0);
    }
    items.forEach((item) => {
      const raw = item.created_at || item.createdAt || item.published_date || item.updated_at;
      if (!raw) return;
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return;
      const key = date.toISOString().slice(0, 10);
      if (key in indexByKey) buckets[indexByKey[key]] += 1;
    });
    return buckets;
  }

  function buildPriorityCounts(docs) {
    const buckets = { urgent: 0, high: 0, normal: 0, other: 0 };
    docs.forEach((doc) => {
      const key = (doc.urgencyKey || doc.urgency?.name || '').toString().toLowerCase();
      if (key.includes('ratkhan') || key.includes('urgent')) buckets.urgent += 1;
      else if (key.includes('khan') || key.includes('high')) buckets.high += 1;
      else if (key.includes('cao')) buckets.normal += 1;
      else buckets.other += 1;
    });
    return [buckets.urgent, buckets.high, buckets.normal, buckets.other];
  }

  function buildCaseStatusCounts(cases) {
    const buckets = { open: 0, processing: 0, pending: 0, done: 0 };
    cases.forEach((item) => {
      const status = (item.status?.code || item.status?.name || '').toString().toLowerCase();
      if (status.includes('processing') || status.includes('handling')) buckets.processing += 1;
      else if (status.includes('pending')) buckets.pending += 1;
      else if (status.includes('done') || status.includes('completed')) buckets.done += 1;
      else buckets.open += 1;
    });
    return [buckets.open, buckets.processing, buckets.pending, buckets.done];
  }

  function renderLineCanvas(id, values, color = '#2563eb') {
    const canvas = document.getElementById(id);
    if (!canvas?.getContext) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width || canvas.clientWidth || 320;
    const height = canvas.height || canvas.clientHeight || 120;
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    if (!values.length) {
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(0, 0, width, height);
      return;
    }
    const max = Math.max(...values, 1);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach((value, index) => {
      const x = (index / (values.length - 1 || 1)) * width;
      const y = height - (value / max) * height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function renderBarCanvas(id, values, palette = ['#2563eb', '#0f172a']) {
    const canvas = document.getElementById(id);
    if (!canvas?.getContext) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width || canvas.clientWidth || 320;
    const height = canvas.height || canvas.clientHeight || 120;
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    if (!values.length) {
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(0, 0, width, height);
      return;
    }
    const max = Math.max(...values, 1);
    const gap = 8;
    const barWidth = (width - (values.length + 1) * gap) / values.length;
    values.forEach((value, index) => {
      const barHeight = (value / max) * height;
      ctx.fillStyle = palette[index % palette.length] || palette[0];
      ctx.fillRect(gap + index * (barWidth + gap), height - barHeight, barWidth, barHeight || 2);
    });
  }
function initTaiKhoan() {
    const modalChange = initModal("#modalChangePass");
    const modalLogout = initModal("#modalLogout");
    $("#btnChangePass")?.addEventListener("click", () => modalChange.open());
    $("#btnLogoutAll")?.addEventListener("click", () => modalLogout.open());

    modalChange.form?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const pass = form.querySelector('[name="newPassword"]').value;
      const confirm = form.querySelector('[name="confirmPassword"]').value;
      if (pass !== confirm) {
        AdminRuntime.toast("Mật khẩu không khớp.");
        return;
      }
      AdminRuntime.toast("Đã đổi mật khẩu. Vui lòng đăng nhập lại.");
      form.reset();
      modalChange.close();
    });

    modalLogout.form?.addEventListener("submit", (event) => {
      event.preventDefault();
      AdminRuntime.toast("Đã đăng xuất khỏi toàn bộ thiết bị.");
      modalLogout.close();
    });
  }

  /* --------------------------- Quản lý hệ thống --------------------------- */
  function initQuanLyHeThong() {
    $$("[data-health-check]").forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.disabled = true;
        AdminRuntime.toast("Đang kiểm tra tình trạng hệ thống...");
        setTimeout(() => {
          AdminRuntime.toast("Hệ thống hoạt động ổn định.");
          btn.disabled = false;
        }, 1200);
      });
    });
  }

  /* --------------------------- Helpers --------------------------- */
  function formatNumber(value) {
    return new Intl.NumberFormat("vi-VN").format(value);
  }

  function animateValue(el, target, options = {}) {
    if (!el) return;
    const duration = options.duration || 500;
    const start = performance.now();
    const from = toNumber(el.textContent, 0);
    const delta = target - from;
    const step = (timestamp) => {
      const progress = Math.min(1, (timestamp - start) / duration);
      const current = from + delta * progress;
      el.textContent = formatNumber(Math.round(current));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function formatRelative(now, minutesAgo) {
    const delta = minutesAgo || 0;
    if (delta < 60) return `${delta || 1} phút trước`;
    if (delta < 1440) return `${Math.round(delta / 60)} giờ trước`;
    return `${Math.round(delta / 1440)} ngày trước`;
  }

  function createToast() {
    let toastEl = null;
    let hideTimer = null;
    return function showToast(message = "Đã thực hiện") {
      if (!toastEl) {
        toastEl = doc.createElement("div");
        toastEl.className = "toast";
        doc.body.appendChild(toastEl);
      }
      toastEl.textContent = message;
      toastEl.classList.add("show");
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => toastEl.classList.remove("show"), 2000);
    };
  }

  function createDebounce() {
    return function debounce(fn, delay = 150) {
      let timer;
      return function debounced(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
      };
    };
  }

  function toggleDropdown(button) {
    const selector = button.dataset.dropdown;
    const menu = selector ? document.querySelector(selector) : null;
    if (!menu) return;
    const expanded = button.getAttribute("aria-expanded") === "true";
    closeAllDropdowns();
    button.setAttribute("aria-expanded", String(!expanded));
    menu.classList.toggle("hidden", expanded);
  }

  function closeAllDropdowns() {
    $$('[data-dropdown]').forEach((btn) => btn.setAttribute("aria-expanded", "false"));
    $$('.dropdown-menu').forEach((menu) => menu.classList.add("hidden"));
  }

  function closeDropdown(menu) {
    const btn = $$('[data-dropdown]').find((trigger) => trigger.dataset.dropdown === `#${menu.id}`);
    btn?.setAttribute("aria-expanded", "false");
    menu.classList.add("hidden");
  }

  function initModal(selector) {
    const modal = document.querySelector(selector);
    if (!modal) return { open: noop, close: noop, form: null };
    const form = modal.querySelector("form");
    const close = () => modal.classList.add("hidden");
    const open = () => modal.classList.remove("hidden");
    $$('[data-close-modal]', modal).forEach((btn) => btn.addEventListener("click", close));
    modal.addEventListener("click", (event) => {
      if (event.target === modal) close();
    });
    return { open, close, form };
  }
})();
