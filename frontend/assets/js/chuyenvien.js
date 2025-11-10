/* ============================================================
   chuyenvien.js
   Common helpers + page specific interactions for giao diện chuyên viên
   - Header demo toasts
   - Dashboard progress animation
   - Văn bản đến: tìm kiếm, lọc, tiếp nhận (demo localStorage)
   - Văn bản đi: tìm kiếm, lọc, toasts thao tác nhanh
   - Hồ sơ công việc: tìm kiếm, lọc mức độ/ trạng thái (demo)
   - Toast helper + debounce, xuất ra window.TrisApp cho trang con dùng chung
============================================================ */

(function () {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const PAGE_ALIASES = {
    "dashboard-chuyenvien": "dashboard",
  };

  const STORAGE_KEYS = {
    incomingAccepted: "vb_accepted",
  };

  const storage = getSafeStorage();

  exposeGlobals();

  onReady(() => {
    const page = detectPageId();

    setupHeaderInteractions();

    const handlers = {
      dashboard: animateDashboardProgress,
      vanbanden: initVanBanDen,
      vanbandi: initVanBanDi,
      "vanbandi-taomoi": initVanBanDiCreate,
      hosocongviec: initHoSoCongViec,
      danhmuc: initDanhMuc,
      baocaothongke: initBaoCaoThongKe,
      taikhoan: initTaiKhoan,
      thongbaonhacviec: initThongBao,
    };

    (handlers[page] || noop)();
  });

  function onReady(callback) {
    if (typeof callback !== "function") return;
    const run = () => {
      if (window.Layout?.isReady) {
        callback();
        return;
      }
      if (window.Layout) {
        window.addEventListener("layout:ready", callback, { once: true });
        return;
      }
      callback();
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
      run();
    }
  }

  /* ============== COMMON ============== */

  function detectPageId() {
    const bodyAttr = document.body?.dataset?.page;
    if (bodyAttr) {
      const normalized = bodyAttr.toLowerCase();
      return PAGE_ALIASES[normalized] || normalized;
    }
    const fragment = (location.pathname || "").split("/").pop() || "";
    const clean = fragment.split(/[?#]/)[0];
    return clean.replace(/\.html$/i, "").toLowerCase() || "dashboard";
  }

  function setupHeaderInteractions() {
    const sidebar = $("#sidebar");
    const btnSidebar = $("#btnSidebar") || $("#btn-sidebar");
    if (btnSidebar && sidebar) {
      btnSidebar.addEventListener("click", () => {
        const open = sidebar.classList.toggle("is-open");
        sidebar.classList.toggle("hidden", !open);
        btnSidebar.setAttribute("aria-expanded", String(open));
      });
    }

    $("#notifBtn")?.addEventListener("click", () => {
      showToast("Bạn có 3 thông báo mới.");
    });
    $("#msgBtn")?.addEventListener("click", () => {
      showToast("Bạn có 1 tin nhắn nội bộ mới.");
    });
  }

  function animateDashboardProgress() {
    const bars = $$("[data-progress-value]");
    if (bars.length) {
      bars.forEach((bar) => {
        const raw = Number.parseFloat(bar.dataset.progressValue);
        const target = Number.isFinite(raw) ? raw : calculatePercentWidth(bar);
        animateBar(bar, target);
      });
      return;
    }

    const fallback = $$(".h-full.w-\\[17%\\].bg-blue-600, .progress-bar-dashboard");
    fallback.forEach((bar) => animateBar(bar, calculatePercentWidth(bar)));
  }

  function animateBar(bar, targetPercent) {
    if (!bar || targetPercent <= 0) return;
    bar.style.width = "0%";
    bar.style.transition = "width .8s ease";
    requestAnimationFrame(() => {
      bar.style.width = `${targetPercent}%`;
    });
  }

  function calculatePercentWidth(bar) {
    const parent = bar?.parentElement;
    if (!parent) return 0;
    const parentWidth = parent.getBoundingClientRect().width;
    if (!parentWidth) return 0;
    const barWidth = bar.getBoundingClientRect().width;
    return parentWidth ? (barWidth / parentWidth) * 100 : 0;
  }

  function getFilterControls() {
    const heading = $$("section h3").find((el) =>
      /tìm kiếm và lọc/i.test(el.textContent || "")
    );
    const section = heading?.closest("section") || null;
    if (!section) {
      return {
        section: null,
        searchInput: null,
        selects: [],
        advBtn: null,
      };
    }
    return {
      section,
      searchInput: section.querySelector('input[type="text"]'),
      selects: Array.from(section.querySelectorAll("select")),
      advBtn: section.querySelector("button"),
    };
  }

  function attachIconActions(tbody, options = {}) {
    if (!tbody) return;
    const { getLabel = () => "", actionTexts = {} } = options;
    const textMap = {
      view: "Xem",
      log: "Nhật ký xử lý",
      dl: "Tải xuống",
      ...actionTexts,
    };
    tbody.addEventListener("click", (event) => {
      const btn = event.target.closest("button.btn-icon");
      if (!btn) return;
      const action = btn.dataset.action || "view";
      const row = btn.closest("tr");
      const label = getLabel(row) || "";
      const prefix = textMap[action] || "Thao tác";
      const message = label ? `${prefix} — ${label}` : prefix;
      showToast(message);
    });
  }

  function updateSummaryCount(summaryEl, count) {
    if (!summaryEl) return;
    if (!summaryEl.dataset.template) {
      summaryEl.dataset.template = summaryEl.textContent.replace(/\d+/g, "{count}");
    }
    const tpl = summaryEl.dataset.template;
    summaryEl.textContent = tpl.includes("{count}")
      ? tpl.replace("{count}", count)
      : `Hiển thị ${count}`;
  }

  /* ============== VĂN BẢN ĐẾN ============== */

  function initVanBanDen() {
    const api = window.ApiClient;
    const helpers = window.DocHelpers;
    if (!api || !helpers) {
      console.warn("[chuyenvien] ApiClient ho?c DocHelpers ch�a s?n s�ng; b? qua t?i v�n b?n �?n.");
      return;
    }

    const tableBody =
      document.getElementById("vbDenBody") ||
      document.querySelector("#cv-incoming-list tbody");
    if (!tableBody) return;

    const detailView = createDetailView(
      "#cv-incoming-list",
      "#cv-incoming-detail",
      renderDocDetail
    );

    const { searchInput, selects, advBtn } = getFilterControls();
    const statusSel =
      document.getElementById("statusFilter") || selects?.[0] || null;
    const urgencySel =
      document.getElementById("urgencyFilter") || selects?.[1] || null;
    const summary =
      document.querySelector("[data-summary='incoming']") ||
      document
        .querySelector("#cv-incoming-list")
        ?.closest("section")
        ?.querySelector("h2 + p") ||
      null;
    const globalSearch = document.getElementById("globalSearch");
    const pageSearch =
      document.getElementById("pageSearch") || searchInput || null;
    const rowCounter = document.querySelector("[data-count='rows']");

    const state = {
      keyword: "",
      globalKeyword: "",
      status: "all",
      urgency: "all",
    };

    let normalizedDocs = [];
    let currentDocs = [];

    const acceptedDocs = new Set(loadAccepted());

    const debouncedFilter = debounce(applyFilters, 160);

    registerSearch(pageSearch, "keyword");
    if (searchInput && searchInput !== pageSearch) {
      registerSearch(searchInput, "keyword");
    }
    registerSearch(globalSearch, "globalKeyword");

    statusSel?.addEventListener("change", (event) => {
      state.status = mapStatusFilter(event.target.value);
      applyFilters();
    });

    urgencySel?.addEventListener("change", (event) => {
      state.urgency = mapUrgencyFilter(event.target.value);
      applyFilters();
    });

    advBtn?.addEventListener("click", () =>
      showToast("B? l?c n�ng cao s? ��?c k�ch ho?t khi tri?n khai �?y �? API.")
    );

    tableBody.addEventListener("click", (event) => {
      const detailBtn = event.target.closest("[data-open-detail]");
      if (detailBtn && detailView) {
        event.preventDefault();
        const row = detailBtn.closest("tr");
        if (row) {
          detailView.show(buildDocDataset(row));
        }
        return;
      }

      const acceptBtn = event.target.closest("[data-action='accept']");
      if (acceptBtn) {
        const row = acceptBtn.closest("tr");
        if (row) {
          handleAcceptRow(row);
          persistAcceptedRow(row);
        }
      }
    });

    attachIconActions(tableBody, {
      getLabel(row) {
        return row?.dataset?.docTitle || row?.dataset?.docId || "v�n b?n";
      },
      actionTexts: {
        log: "Nh?t k? v�n b?n",
        download: "T?i t?p",
      },
    });

    const layout = window.Layout || {};
    const authReady =
      layout.authPromise && typeof layout.authPromise.then === "function"
        ? layout.authPromise
        : Promise.resolve();

    authReady
      .then(loadDocuments)
      .catch(() =>
        renderErrorRow("Kh�ng th? x�c th?c ng�?i d�ng hi?n t?i.")
      );

    function registerSearch(input, key) {
      if (!input) return;
      input.addEventListener("input", (event) => {
        state[key] = event.target.value || "";
        debouncedFilter();
      });
    }

    function loadDocuments() {
      renderLoading();
      return api
        .request("/api/v1/inbound-docs/?ordering=-created_at&page_size=50")
        .then((data) => {
          const payload = api.extractItems(data);
          normalizedDocs = payload.map((item) =>
            helpers.normalizeInboundDoc(item)
          );
          applyFilters();
        })
        .catch((error) => {
          console.error("[chuyenvien] L?i t?i v�n b?n �?n:", error);
          renderErrorRow(helpers.resolveErrorMessage(error));
        });
    }

    function applyFilters() {
      if (!normalizedDocs.length) {
        renderEmptyRow();
        updateSummaryCount(summary, 0);
        if (rowCounter) rowCounter.textContent = "0";
        return;
      }

      const keyword = activeKeyword();
      const normalizedKeyword = helpers.normalizeText(keyword);
      currentDocs = normalizedDocs.filter((doc) => {
        if (state.status !== "all" && doc.statusKey !== state.status) {
          return false;
        }
        if (state.urgency !== "all" && doc.urgencyKey !== state.urgency) {
          return false;
        }
        if (normalizedKeyword && !doc.searchText.includes(normalizedKeyword)) {
          return false;
        }
        return true;
      });

      renderRows(currentDocs);
      updateSummaryCount(summary, currentDocs.length);
      if (rowCounter) {
        rowCounter.textContent = String(currentDocs.length);
      }
    }

    function activeKeyword() {
      const local = (state.keyword || "").trim();
      if (local) return local;
      return (state.globalKeyword || "").trim();
    }

    function renderRows(list) {
      tableBody.innerHTML = "";
      if (!list.length) {
        renderEmptyRow();
        return;
      }
      const fragment = document.createDocumentFragment();
      list.forEach((doc) => {
        fragment.appendChild(createRow(doc));
      });
      tableBody.appendChild(fragment);
      applyAcceptedState();
    }

    function createRow(doc) {
      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-50/60";
      tr.dataset.docId = doc.id != null ? String(doc.id) : "";
      tr.dataset.docDirection = doc.docDirection || "den";
      tr.dataset.docTitle = doc.title || "";
      tr.dataset.docCode = doc.number || "";
      tr.dataset.docReceivedNumber = doc.incomingNumber || "";
      tr.dataset.docIssuedDate = doc.issuedDate || "";
      tr.dataset.docReceivedDate = doc.receivedDate || "";
      tr.dataset.docSender = doc.sender || "";
      tr.dataset.docReceiver = doc.department || "";
      tr.dataset.docField = doc.docType || "";
      tr.dataset.docType = doc.docType || "";
      tr.dataset.docUrgency = doc.urgencyLabel || "";
      tr.dataset.docSecurity = doc.securityLabel || "";
      tr.dataset.docStatus = doc.statusLabel || "";
      tr.dataset.docDepartment = doc.department || "";
      tr.dataset.docDue = doc.dueDate || "";
      tr.__docData = doc;
      const statusClass = inboundStatusClass(doc.statusKey);
      const urgencyClass = urgencyChipClass(doc.urgencyKey);
      const securityClass = securityChipClass(doc.securityLabel);
      const detailHref = `vanbanden-detail.html?id=${encodeURIComponent(
        tr.dataset.docId || ""
      )}`;
      const attachmentText = doc.hasAttachments ? "C�" : "Kh�ng";

      tr.innerHTML = [
        '<td class="py-3 pl-6 pr-3">',
        `  <div class="font-medium text-slate-800 truncate">${helpers.escapeHtml(
          doc.title || "V�n b?n"
        )}</div>`,
        doc.department
          ? `  <div class="text-[12.5px] text-slate-500">��n v? x? l?: ${helpers.escapeHtml(
              doc.department
            )}</div>`
          : "",
        "</td>",
        '<td class="px-3 py-3 text-[13px] text-slate-600">',
        doc.number
          ? `  <div class="doc-number">${helpers.escapeHtml(doc.number)}</div>`
          : "",
        doc.incomingNumber && doc.incomingNumber !== doc.number
          ? `  <div class="text-[12px] text-slate-500">S? �?n: ${helpers.escapeHtml(
              doc.incomingNumber
            )}</div>`
          : "",
        "</td>",
        '<td class="px-3 py-3 text-[13px]">',
        doc.issuedDate
          ? `  <div>Ban h�nh: ${helpers.escapeHtml(
              helpers.formatDate(doc.issuedDate)
            )}</div>`
          : "",
        doc.receivedDate
          ? `  <div class="text-[12px] text-slate-500">�?n: ${helpers.escapeHtml(
              helpers.formatDate(doc.receivedDate)
            )}</div>`
          : "",
        "</td>",
        '<td class="px-3 py-3 text-[13px]">',
        doc.docType
          ? `  <div>Lo?i: ${helpers.escapeHtml(doc.docType)}</div>`
          : "",
        doc.assigneeCount
          ? `  <div class="text-[12px] text-slate-500">Ph�n c�ng: ${helpers.escapeHtml(
              String(doc.assigneeCount)
            )}</div>`
          : "",
        "</td>",
        '<td class="px-3 py-3 text-[13px]">',
        doc.urgencyLabel
          ? `  <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold ${urgencyClass}">${helpers.escapeHtml(
              doc.urgencyLabel
            )}</span>`
          : "",
        doc.securityLabel
          ? `  <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold ml-1 ${securityClass}">${helpers.escapeHtml(
              doc.securityLabel
            )}</span>`
          : "",
        "</td>",
        '<td class="px-3 py-3 text-[13px]">',
        doc.sender
          ? `  <div>${helpers.escapeHtml(doc.sender)}</div>`
          : "",
        doc.creatorName
          ? `  <div class="text-[12px] text-slate-500">Ti?p nh?n: ${helpers.escapeHtml(
              doc.creatorName
            )}</div>`
          : "",
        "</td>",
        '<td class="px-3 py-3 text-[13px]">',
        doc.department
          ? `  <div>Ch? tr?: ${helpers.escapeHtml(doc.department)}</div>`
          : "",
        doc.dueDate
          ? `  <div class="text-[12px] text-slate-500">H?n x? l?: ${helpers.escapeHtml(
              helpers.formatDate(doc.dueDate)
            )}</div>`
          : "",
        "</td>",
        `<td class="px-3 py-3 text-slate-500 whitespace-nowrap">${helpers.escapeHtml(
          attachmentText
        )}</td>`,
        `<td class="px-3 py-3"><span class="px-2.5 py-1 rounded-full text-xs font-semibold ${statusClass}">${helpers.escapeHtml(
          doc.statusLabel
        )}</span></td>`,
        '<td class="px-3 py-3">',
        '  <div class="flex items-center justify-end gap-2 pr-3">',
        `    <a href="${detailHref}" class="w-8 h-8 grid place-items-center rounded-full border border-slate-200 hover:bg-slate-100" title="Xem chi ti?t" data-open-detail="1">`,
        '      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">',
        '        <circle cx="11" cy="11" r="7"></circle>',
        '        <line x1="16.65" y1="16.65" x2="21" y2="21"></line>',
        "      </svg>",
        "    </a>",
        '    <button type="button" class="btn-icon" data-action="log" title="Nh?t k? x? l?">',
        '      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">',
        '        <path d="M4 4h16v16H4z"></path>',
        '        <path d="M8 4v4h8V4"></path>',
        "      </svg>",
        "    </button>",
        '    <button type="button" class="btn-icon" data-action="dl" title="T?i xu?ng">',
        '      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">',
        '        <path d="M12 5v14"></path>',
        '        <path d="m19 12-7 7-7-7"></path>',
        "      </svg>",
        "    </button>",
        '    <button type="button" class="px-3 py-1.5 rounded-lg border border-blue-200 text-[12.5px] font-semibold text-blue-600 hover:bg-blue-50 transition" data-action="accept">',
        "      Ti?p nh?n",
        "    </button>",
        "  </div>",
        "</td>",
      ]
        .filter(Boolean)
        .join("");
      return tr;
    }

    function renderLoading() {
      tableBody.innerHTML =
        '<tr><td colspan="10" class="py-6 text-center text-[13px] text-slate-500">�ang t?i d? li?u...</td></tr>';
    }

    function renderEmptyRow() {
      tableBody.innerHTML =
        '<tr><td colspan="10" class="py-6 text-center text-[13px] text-slate-500">Kh�ng c� v�n b?n ph� h?p v?i b? l?c.</td></tr>';
    }

    function renderErrorRow(message) {
      tableBody.innerHTML = `<tr><td colspan="10" class="py-6 text-center text-[13px] text-rose-600">${helpers.escapeHtml(
        message
      )}</td></tr>`;
    }

    function mapStatusFilter(raw) {
      const value = helpers.normalizeText(raw);
      if (!value || value.includes("tat")) return "all";
      if (value.includes("duyet")) return "approved";
      if (value.includes("dang")) return "processing";
      if (value.includes("da")) return "done";
      if (value.includes("chua")) return "new";
      return "all";
    }

    function mapUrgencyFilter(raw) {
      const value = helpers.normalizeText(raw);
      if (!value || value.includes("tat")) return "all";
      if (value.includes("rat") || value.includes("hoa")) return "ratkhan";
      if (value.includes("khan")) return "khan";
      if (value.includes("cao")) return "cao";
      if (value.includes("thuong")) return "thuong";
      return "all";
    }

    function inboundStatusClass(key) {
      switch (key) {
        case "processing":
          return "bg-amber-100 text-amber-700";
        case "done":
          return "bg-emerald-50 text-emerald-700";
        case "approved":
          return "bg-blue-100 text-blue-700";
        default:
          return "bg-slate-900 text-white";
      }
    }

    function urgencyChipClass(key) {
      switch (key) {
        case "ratkhan":
          return "bg-rose-100 text-rose-700";
        case "khan":
          return "bg-amber-100 text-amber-700";
        case "cao":
          return "bg-orange-100 text-orange-700";
        default:
          return "bg-slate-100 text-slate-700";
      }
    }

    function securityChipClass(label) {
      const value = helpers.normalizeText(label);
      if (!value) return "bg-slate-200 text-slate-700";
      if (value.includes("tuyet")) return "bg-rose-100 text-rose-700";
      if (value.includes("mat")) return "bg-red-100 text-red-700";
      return "bg-slate-200 text-slate-700";
    }

    function handleAcceptRow(row, options = {}) {
      if (!row || row.dataset.accepted === "true") return;
      const { silent = false } = options;
      const doc = row.__docData;
      const statusCell = row.children?.[8];
      if (statusCell) {
        statusCell.innerHTML =
          '<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">?ang x? l?</span>';
      }
      const button = row.querySelector("[data-action='accept']");
      if (button) {
        button.textContent = "?? ti?p nh?n";
        button.classList.add("opacity-60", "cursor-not-allowed");
        button.setAttribute("disabled", "true");
      }
      row.dataset.accepted = "true";
      row.dataset.docStatus = "?ang x? l?";
      if (doc) {
        doc.statusKey = "processing";
        doc.statusLabel = "?ang x? l?";
      }
      if (!silent) {
        showToast(
          doc?.number
            ? `?? ti?p nh?n v?n b?n ${doc.number}`
            : "?? ti?p nh?n v?n b?n."
        );
      }
    }

    function persistAcceptedRow(row) {
      const id =
        row?.dataset?.docId ||
        row?.dataset?.docCode ||
        getDocIdFromRow(row);
      if (!id) return;
      acceptedDocs.add(id);
      saveAccepted(Array.from(acceptedDocs));
    }

    function applyAcceptedState() {
      if (!acceptedDocs.size) return;
      const rows = $$("tr", tableBody);
      rows.forEach((row) => {
        const id =
          row?.dataset?.docId ||
          row?.dataset?.docCode ||
          getDocIdFromRow(row);
        if (id && acceptedDocs.has(id)) {
          handleAcceptRow(row, { silent: true });
        }
      });
    }

    applyAcceptedState();


    attachIconActions(tableBody, {
      getLabel(row) {
        const id = getDocIdFromRow(row);
        if (id) return `văn bản ${id}`;
        const title =
          row?.dataset?.docTitle || safeText(row?.querySelector(".font-medium"));
        return title || "văn bản";
      },
    });

    document
      .querySelector("[data-action='assign']")
      ?.addEventListener("click", () =>
        showToast("Phân công: CV được phép trong phạm vi tổ/nhóm.")
      );
    document
      .querySelector("[data-action='open-logs']")
      ?.addEventListener("click", () =>
        showToast("Mở nhật ký văn bản (chỉ xem/ghi chú theo phân quyền).")
      );
    document
      .querySelector("[data-action='export']")
      ?.addEventListener("click", () =>
        showToast("Xuất hồ sơ (Excel/PDF) — kết nối API để tải về.")
      );

    const noteBtn = document.querySelector("[data-action='add-note']");
    if (noteBtn) {
      noteBtn.addEventListener("click", () => {
        const input = document.getElementById("noteInput");
        const list = document.getElementById("cvDocNotes");
        if (!input || !list) return;
        const text = (input.value || "").trim();
        if (!text) return;
        const li = document.createElement("li");
        li.className = "rounded-lg border border-slate-100 p-3";
        const now = new Date()
          .toISOString()
          .slice(0, 16)
          .replace("T", " ");
        li.innerHTML = `
          <div class="flex items-center justify-between text-[13px]">
            <span class="font-medium text-slate-700">Nguyễn Văn An</span>
            <span class="text-[12px] text-slate-400">${now}</span>
          </div>
          <p class="mt-1 text-[12.5px] text-slate-600"></p>
        `;
        li.querySelector("p").textContent = text;
        list.prepend(li);
        input.value = "";
        showToast("Đã thêm ghi chú nội bộ.");
      });
    }

    const searchInputs = [searchInput, pageSearch, globalSearch].filter(Boolean);
    const normalize = (value) =>
      (value || "")
        .toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    const rows = $$("tr", tableBody);

    const applyLegacyFilters = () => {
      const kwSource =
        searchInputs.map((input) => input.value?.trim()).find(Boolean) || "";
      const keyword = normalize(kwSource);
      const statusValue = (statusSel?.value || "").trim();
      const urgencyValue = (urgencySel?.value || "").trim();

      let visible = 0;
      rows.forEach((row) => {
        const data = {
          status: row.dataset.docStatus || safeText(row.children?.[6]),
          urgency: row.dataset.docUrgency || safeText(row.children?.[5]),
        };

        const haystack = normalize(
          [
            row.dataset.docTitle,
            row.dataset.docCode,
            row.dataset.docSender,
            row.dataset.docReceiver,
            safeText(row),
          ]
            .filter(Boolean)
            .join(" ")
        );
        const okKw = !keyword || haystack.includes(keyword);
        const okStatus =
          !statusValue || normalize(data.status) === normalize(statusValue);
        const okUrgency =
          !urgencyValue || normalize(data.urgency) === normalize(urgencyValue);

        const show = okKw && okStatus && okUrgency;
        row.style.display = show ? "" : "none";
        if (show) visible++;
      });

      updateSummaryCount(summary, visible);
      if (rowCounter) {
        rowCounter.textContent = String(visible);
      }
    };

    searchInputs.forEach((input) =>
      input.addEventListener("input", debounce(applyFilters, 120))
    );
    statusSel?.addEventListener("change", applyFilters);
    urgencySel?.addEventListener("change", applyFilters);
    advBtn?.addEventListener("click", () =>
      showToast("Bộ lọc nâng cao đang demo, sẽ kết nối back-end sau.")
    );

    applyFilters();
  }

  /* ============== VĂN BẢN ĐI ============== */

  function initVanBanDi() {
    const api = window.ApiClient;
    const helpers = window.DocHelpers;
    if (!api || !helpers) {
      console.warn("[chuyenvien] ApiClient ho?c DocHelpers ch�a s?n s�ng; b? qua t?i v�n b?n �i.");
      return;
    }

    const tableBody =
      document.querySelector("#vbDiTable tbody") ||
      document.querySelector("#cv-outgoing-list tbody");
    if (!tableBody) return;

    const detailView = createDetailView(
      "#cv-outgoing-list",
      "#cv-outgoing-detail",
      renderDocDetail
    );

    const { searchInput, selects, advBtn } = getFilterControls();
    const statusSel = selects?.[0] || null;
    const summary = tableBody
      .closest("section")
      ?.querySelector("h2 + p") || null;
    const globalSearch = document.getElementById("globalSearch");
    const rowCounter = document.querySelector("[data-count='rows']");

    const state = {
      keyword: "",
      globalKeyword: "",
      status: "all",
    };

    let normalizedDocs = [];
    let currentDocs = [];

    const debouncedFilter = debounce(applyFilters, 160);

    registerSearch(searchInput, "keyword");
    if (globalSearch) {
      registerSearch(globalSearch, "globalKeyword");
    }

    statusSel?.addEventListener("change", (event) => {
      state.status = mapStatusFilter(event.target.value);
      applyFilters();
    });

    advBtn?.addEventListener("click", () =>
      showToast("B? l?c n�ng cao s? ��?c b? sung khi k?t n?i �?y �? API.")
    );

    tableBody.addEventListener("click", (event) => {
      const detailBtn = event.target.closest("[data-open-detail]");
      if (detailBtn && detailView) {
        event.preventDefault();
        const row = detailBtn.closest("tr");
        if (row) {
          detailView.show(buildDocDataset(row));
        }
        return;
      }
    });

    attachIconActions(tableBody, {
      getLabel(row) {
        return row?.dataset?.docTitle || row?.dataset?.docId || "v�n b?n";
      },
      actionTexts: {
        log: "Nh?t k? ph�t h�nh",
        download: "T?i t?p",
      },
    });

    const layout = window.Layout || {};
    const authReady =
      layout.authPromise && typeof layout.authPromise.then === "function"
        ? layout.authPromise
        : Promise.resolve();

    authReady
      .then(loadDocuments)
      .catch(() =>
        renderErrorRow("Kh�ng th? x�c th?c ng�?i d�ng hi?n t?i.")
      );

    function registerSearch(input, key) {
      if (!input) return;
      input.addEventListener("input", (event) => {
        state[key] = event.target.value || "";
        debouncedFilter();
      });
    }

    function loadDocuments() {
      renderLoading();
      return api
        .request("/api/v1/outbound-docs/?ordering=-created_at&page_size=50")
        .then((data) => {
          const payload = api.extractItems(data);
          normalizedDocs = payload.map((item) =>
            helpers.normalizeOutboundDoc(item)
          );
          applyFilters();
        })
        .catch((error) => {
          console.error("[chuyenvien] L?i t?i v�n b?n �i:", error);
          renderErrorRow(helpers.resolveErrorMessage(error));
        });
    }

    function applyFilters() {
      if (!normalizedDocs.length) {
        renderEmptyRow();
        updateSummaryCount(summary, 0);
        if (rowCounter) rowCounter.textContent = "0";
        return;
      }

      const keyword = activeKeyword();
      const normalizedKeyword = helpers.normalizeText(keyword);
      currentDocs = normalizedDocs.filter((doc) => {
        if (state.status !== "all" && doc.statusKey !== state.status) {
          return false;
        }
        if (normalizedKeyword && !doc.searchText.includes(normalizedKeyword)) {
          return false;
        }
        return true;
      });

      renderRows(currentDocs);
      updateSummaryCount(summary, currentDocs.length);
      if (rowCounter) {
        rowCounter.textContent = String(currentDocs.length);
      }
    }

    function activeKeyword() {
      const local = (state.keyword || "").trim();
      if (local) return local;
      return (state.globalKeyword || "").trim();
    }

    function renderRows(list) {
      tableBody.innerHTML = "";
      if (!list.length) {
        renderEmptyRow();
        return;
      }
      const fragment = document.createDocumentFragment();
      list.forEach((doc) => {
        fragment.appendChild(createRow(doc));
      });
      tableBody.appendChild(fragment);
    }

    function createRow(doc) {
      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-50/60";
      tr.dataset.docId = doc.id != null ? String(doc.id) : "";
      tr.dataset.docDirection = doc.docDirection || "di";
      tr.dataset.docTitle = doc.title || "";
      tr.dataset.docCode = doc.number || "";
      tr.dataset.docIssuedDate = doc.issuedDate || "";
      tr.dataset.docDispatchAt = doc.publishedDate || "";
      tr.dataset.docSigner = doc.signer || "";
      tr.dataset.docReceiver = doc.recipients || "";
      tr.dataset.docUrgency = doc.urgencyLabel || "";
      tr.dataset.docStatus = doc.statusLabel || "";
      tr.__docData = doc;
      const urgencyClass = urgencyChipClass(doc.urgencyKey);
      const statusClass = outboundStatusClass(doc.statusKey);
      const detailHref = `vanbandi-detail.html?id=${encodeURIComponent(
        tr.dataset.docId || ""
      )}`;

      tr.innerHTML = [
        '<td class="py-2 pr-3">',
        `  <a href="${detailHref}" class="text-blue-700 hover:underline inline-flex items-center gap-2" data-open-detail="1">`,
        '    <span class="badge-dot bg-blue-600"></span>',
        `    ${helpers.escapeHtml(doc.title || "V�n b?n")}`,
        "  </a>",
        "</td>",
        `<td class="py-2 px-3">${helpers.escapeHtml(doc.number || "�")}</td>`,
        '<td class="py-2 px-3">',
        doc.issuedDate
          ? `  <div>Ng�y k?: ${helpers.escapeHtml(
              helpers.formatDate(doc.issuedDate)
            )}</div>`
          : "",
        doc.publishedDate
          ? `  <div class="text-[12px] text-slate-500">Ph�t h�nh: ${helpers.escapeHtml(
              helpers.formatDate(doc.publishedDate)
            )}</div>`
          : "",
        "</td>",
        `<td class="py-2 px-3">${helpers.escapeHtml(
          doc.recipients || "�"
        )}</td>`,
        '<td class="py-2 px-3">',
        doc.urgencyLabel
          ? `  <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold ${urgencyClass}">${helpers.escapeHtml(
              doc.urgencyLabel
            )}</span>`
          : "",
        "</td>",
        `<td class="py-2 px-3"><span class="px-2.5 py-1 rounded-full text-xs font-semibold ${statusClass}">${helpers.escapeHtml(
          doc.statusLabel
        )}</span></td>`,
        '<td class="py-2 pl-3 pr-0">',
        '  <div class="flex items-center justify-end gap-2">',
        '    <button class="btn-icon" title="Xem" data-open-detail="1" type="button">',
        '      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">',
        '        <circle cx="11" cy="11" r="7"></circle>',
        '        <line x1="16.65" y1="16.65" x2="21" y2="21"></line>',
        "      </svg>",
        "    </button>",
        '    <button class="btn-icon" title="Nh?t k?" data-action="log" type="button">',
        '      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">',
        '        <path d="M4 4h16v16H4z"></path>',
        '        <path d="M8 4v4h8V4"></path>',
        "      </svg>",
        "    </button>",
        '    <button class="btn-icon" title="T?i xu?ng" data-action="dl" type="button">',
        '      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">',
        '        <path d="M12 5v14"></path>',
        '        <path d="m19 12-7 7-7-7"></path>',
        "      </svg>",
        "    </button>",
        "  </div>",
        "</td>",
      ]
        .filter(Boolean)
        .join("");
      return tr;
    }

    function renderLoading() {
      tableBody.innerHTML =
        '<tr><td colspan="7" class="py-6 text-center text-[13px] text-slate-500">�ang t?i d? li?u...</td></tr>';
    }

    function renderEmptyRow() {
      tableBody.innerHTML =
        '<tr><td colspan="7" class="py-6 text-center text-[13px] text-slate-500">Kh�ng c� v�n b?n ph� h?p v?i b? l?c.</td></tr>';
    }

    function renderErrorRow(message) {
      tableBody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-[13px] text-rose-600">${helpers.escapeHtml(
        message
      )}</td></tr>`;
    }

    function mapStatusFilter(raw) {
      const value = helpers.normalizeText(raw);
      if (!value || value.includes("tat")) return "all";
      if (value.includes("phat")) return "published";
      if (value.includes("cho")) return "pending-sign";
      if (value.includes("duyet")) return "approved";
      if (value.includes("dang")) return "draft";
      return "all";
    }

    function outboundStatusClass(key) {
      switch (key) {
        case "published":
          return "bg-emerald-50 text-emerald-700";
        case "approved":
          return "bg-blue-100 text-blue-700";
        case "pending-sign":
          return "bg-amber-100 text-amber-700";
        default:
          return "bg-slate-100 text-slate-700";
      }
    }

    function urgencyChipClass(key) {
      switch (key) {
        case "ratkhan":
          return "bg-rose-100 text-rose-700";
        case "khan":
          return "bg-amber-100 text-amber-700";
        case "cao":
          return "bg-orange-100 text-orange-700";
        default:
          return "bg-slate-100 text-slate-700";
      }
    }
  }

  /* ============== HỒ SƠ CÔNG VIỆC ============== */

  function initHoSoCongViec() {
    const table = document.querySelector("table");
    const tbody = table?.tBodies?.[0];
    if (!tbody) return;

    const { searchInput, selects, advBtn } = getFilterControls();
    const statusSel = selects?.[0] || null;
    const prioritySel = selects?.[1] || null;
    const summary = table.closest("section")?.querySelector("h2 + p") || null;

    const applyFilter = () => {
      const kw = toLower(searchInput?.value);
      const st = toLower(statusSel?.value);
      const pr = toLower(prioritySel?.value);

      let visible = 0;
      $$("tr", tbody).forEach((row) => {
        const title = safeText(row?.children?.[0]);
        const assigner = safeText(row?.children?.[1]);
        const statusText = toLower(row?.children?.[6]?.textContent);
        const priorityText = toLower(row?.children?.[5]?.textContent);

        const haystack = `${title} ${assigner} ${statusText}`.toLowerCase();
        const okKw = !kw || haystack.includes(kw);
        const okStatus = !st || statusText.includes(st);
        const okPriority = matchTaskPriority(priorityText, pr);
        const show = okKw && okStatus && okPriority;

        row.style.display = show ? "" : "none";
        if (show) visible++;
      });

      updateSummaryCount(summary, visible);
    };

    if (searchInput) searchInput.addEventListener("input", debounce(applyFilter, 120));
    statusSel?.addEventListener("change", applyFilter);
    prioritySel?.addEventListener("change", applyFilter);
    advBtn?.addEventListener("click", () =>
      showToast("Chức năng lọc nâng cao đang demo, sẽ bổ sung khi kết nối back-end.")
    );

    attachIconActions(tbody, {
      getLabel(row) {
        const title = safeText(row?.querySelector("a"));
        return title ? `công việc "${title}"` : "công việc";
      },
    });

    applyFilter();
  }

  function initVanBanDiCreate() {
    if (!document.body) return;
    if (!document.body.dataset.role) {
      document.body.dataset.role = "CV";
    }
    document.body.dataset.feature = "outgoing-create";
    if (document.body.dataset.cvDraftShortcut === "true") return;

    const handleShortcut = (event) => {
      const key = (event.key || "").toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "s") {
        event.preventDefault();
        document
          .querySelector('[data-action="save-draft"]')
          ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
    };

    document.addEventListener("keydown", handleShortcut);
    document.body.dataset.cvDraftShortcut = "true";
  }

  function initDanhMuc() {
    const pills = $$("[data-tab]");
    const panels = $$("[data-panel]");
    if (!pills.length || !panels.length) return;

    const searchInput = document.getElementById("dm-search");
    const normalize = (value) =>
      (value || "")
        .toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    const applySearch = () => {
      const kw = normalize(searchInput?.value?.trim());
      const activePanel = panels.find(
        (panel) => !panel.classList.contains("hidden")
      );
      if (!activePanel) return;
      $$("tbody tr", activePanel).forEach((row) => {
        const text = normalize(row.innerText);
        row.style.display = !kw || text.includes(kw) ? "" : "none";
      });
    };

    const show = (tab) => {
      panels.forEach((panel) => {
        const active = panel.dataset.panel === tab;
        panel.classList.toggle("hidden", !active);
      });
      pills.forEach((pill) => {
        const active = pill.dataset.tab === tab;
        pill.classList.toggle("bg-slate-900", active);
        pill.classList.toggle("text-white", active);
        pill.classList.toggle("bg-slate-100", !active);
        pill.classList.toggle("text-slate-600", !active);
        pill.setAttribute("aria-pressed", String(active));
      });
      applySearch();
    };

    pills.forEach((pill) => {
      pill.addEventListener("click", () => show(pill.dataset.tab));
    });

    const defaultTab =
      pills[0]?.dataset.tab || panels[0]?.dataset.panel || "loai";
    show(defaultTab);

    if (searchInput) {
      searchInput.addEventListener("input", debounce(applySearch, 150));
    }
  }

  function initBaoCaoThongKe() {
    if (typeof Chart === "undefined") return;

    const barCtx = document.getElementById("barDocs");
    const pieCtx = document.getElementById("pieTasks");
    const lineCtx = document.getElementById("linePerf");

    if (barCtx) {
      new Chart(barCtx, {
        type: "bar",
        data: {
          labels: ["T1", "T2", "T3", "T4", "T5", "T6"],
          datasets: [
            { label: "Đến", data: [5, 8, 6, 9, 4, 10] },
            { label: "Đi", data: [4, 5, 3, 6, 7, 8] },
            { label: "Đã xử lý", data: [3, 7, 6, 7, 5, 8] },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom" } },
          scales: {
            y: { beginAtZero: true, ticks: { stepSize: 3 } },
            x: { grid: { display: false } },
          },
        },
      });
    }

    if (pieCtx) {
      new Chart(pieCtx, {
        type: "pie",
        data: {
          labels: [
            "Chưa bắt đầu (30%)",
            "Đang thực hiện (10%)",
            "Đã hoàn thành (0%)",
            "Trễ hạn (60%)",
          ],
          datasets: [{ data: [30, 10, 0, 60] }],
        },
        options: {
          plugins: { legend: { position: "right" } },
        },
      });
    }

    if (lineCtx) {
      new Chart(lineCtx, {
        type: "line",
        data: {
          labels: ["Tuần 1", "Tuần 2", "Tuần 3", "Tuần 4", "Tuần 5", "Tuần 6"],
          datasets: [
            {
              label: "Đúng hạn (%)",
              data: [90, 92, 86, 93, 88, 92],
              tension: 0.3,
            },
            {
              label: "Chất lượng (%)",
              data: [88, 90, 85, 91, 87, 90],
              tension: 0.3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom" } },
          scales: {
            y: { min: 0, max: 100, ticks: { stepSize: 25 } },
            x: { grid: { drawOnChartArea: false } },
          },
        },
      });
    }
  }

  function initTaiKhoan() {
    const fields = ["inpName", "inpEmail", "inpPhone", "inpDept"]
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    if (!fields.length) return;

    const btnEdit = document.getElementById("btnEdit");
    const btnSave = document.getElementById("btnSave");
    const btnCancel = document.getElementById("btnCancel");
    const displayName = document.getElementById("displayName");
    const displayUsername = document.getElementById("displayUsername");
    const displayRole = document.getElementById("displayRole");
    const displaySince = document.getElementById("displaySince");
    const avatar = document.querySelector("[data-avatar-initials]") || document.querySelector("[aria-label=\"Ảnh đại diện\"]");

    const layout = window.Layout || {};
    const api = window.ApiClient || null;

    let backup = {};

    const setEditable = (enabled) => {
      fields.forEach((field) => (field.disabled = !enabled));
      btnEdit?.classList.toggle("hidden", enabled);
      btnSave?.classList.toggle("hidden", !enabled);
      btnCancel?.classList.toggle("hidden", !enabled);
    };

    const applyUserProfile = (user) => {
      if (!user) return;
      const fullName = (user.full_name || user.name || "").trim();
      const username = (user.username || "").trim();
      const email = (user.email || "").trim();
      const phone = (user.phone || "").trim();
      const department =
        user.department_name ||
        user.department ||
        (layout.roleConfig?.user?.department || "").trim();
      const roleLabel =
        user.role_name ||
        user.roleName ||
        layout.roleConfig?.user?.roleName ||
        displayRole?.textContent ||
        "";

      if (displayName) {
        displayName.textContent = fullName || username || "--";
      }
      if (displayUsername) {
        displayUsername.textContent = username ? `@${username}` : "@--";
      }
      if (displayRole) {
        displayRole.textContent = roleLabel || "--";
      }
      if (displaySince && displaySince.textContent?.includes("chưa có")) {
        const createdAt = user.created_at || user.createdAt || "";
        if (createdAt) {
          try {
            const date = new Date(createdAt);
            if (!Number.isNaN(date.getTime())) {
              displaySince.textContent = `Tài khoản tạo ngày ${date.toLocaleDateString("vi-VN")}`;
            }
          } catch (err) {
            // ignore parsing error
          }
        }
      }

      const nameInput = document.getElementById("inpName");
      const emailInput = document.getElementById("inpEmail");
      const phoneInput = document.getElementById("inpPhone");
      const deptInput = document.getElementById("inpDept");

      if (nameInput) nameInput.value = fullName || "";
      if (emailInput) emailInput.value = email || "";
      if (phoneInput) phoneInput.value = phone || "";
      if (deptInput) deptInput.value = department || "";

      const initials =
        user.initials ||
        layout.userDisplay?.initials ||
        deriveInitials(fullName || username);
      if (avatar) {
        avatar.textContent = initials || "--";
      }
    };

    const deriveInitials = (value) => {
      const raw = (value || "").trim();
      if (!raw) return "--";
      const parts = raw.split(/\s+/).filter(Boolean);
      if (!parts.length) return raw.slice(0, 2).toUpperCase();
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      const first = parts[0][0] || "";
      const last = parts[parts.length - 1][0] || "";
      return (first + last).toUpperCase();
    };

    btnEdit?.addEventListener("click", () => {
      backup = Object.fromEntries(fields.map((el) => [el.id, el.value]));
      setEditable(true);
    });

    btnCancel?.addEventListener("click", () => {
      fields.forEach((field) => {
        field.value = backup[field.id] ?? field.value;
      });
      setEditable(false);
      showToast("Đã huỷ chỉnh sửa");
    });

    btnSave?.addEventListener("click", () => {
      const name = document.getElementById("inpName")?.value?.trim();
      const email = document.getElementById("inpEmail")?.value?.trim();
      const phone = document.getElementById("inpPhone")?.value?.trim();

      if (!/^\S+@\S+\.\S+$/.test(email || "")) {
        showToast("Email không hợp lệ");
        return;
      }
      if (!/^[0-9]{9,11}$/.test(phone || "")) {
        showToast("Số điện thoại không hợp lệ");
        return;
      }
      if (displayName) {
        displayName.textContent = name || "Không tên";
      }
      if (displayUsername && name) {
        const current = (displayUsername.textContent || "").replace(/^@/, "");
        if (!current) {
          displayUsername.textContent = username ? `@${username}` : "@--";
        }
      }
      setEditable(false);
      showToast("Đã lưu thông tin tài khoản");
    });

    const signin = [
      {
        agent: "Chrome • Windows 11",
        time: "18/01/2024 16:20",
        ip: "10.2.15.42",
      },
      {
        agent: "Edge • Windows",
        time: "17/01/2024 08:05",
        ip: "10.2.15.23",
      },
      {
        agent: "Mobile • Android",
        time: "15/01/2024 19:45",
        ip: "10.5.8.11",
      },
    ];
    const signinList = document.getElementById("signinList");
    if (signinList) {
      signinList.innerHTML = signin
        .map(
          (item) => `
        <li class="px-4 py-3 flex items-center justify-between">
          <div class="min-w-0">
            <div class="font-medium text-[14px] truncate">${item.agent}</div>
            <div class="text-[12.5px] text-slate-500">IP: ${item.ip}</div>
          </div>
          <div class="text-[13px] text-slate-500">${item.time}</div>
        </li>`
        )
        .join("");
    }

    const modal = document.getElementById("pwdModal");
    const openPwd = document.getElementById("btnOpenPwd");
    const closePwd = document.getElementById("pwdClose");
    const cancelPwd = document.getElementById("pwdCancel");
    const submitPwd = document.getElementById("pwdSubmit");

    const showModal = () => modal?.classList.remove("hidden");
    const hideModal = () => modal?.classList.add("hidden");

    openPwd?.addEventListener("click", showModal);
    closePwd?.addEventListener("click", hideModal);
    cancelPwd?.addEventListener("click", hideModal);
    modal?.addEventListener("click", (event) => {
      if (event.target === modal) hideModal();
    });

    submitPwd?.addEventListener("click", () => {
      const cur = document.getElementById("curPwd")?.value?.trim();
      const newPwd = document.getElementById("newPwd")?.value?.trim();
      const cfm = document.getElementById("cfmPwd")?.value?.trim();

      if (!cur || !newPwd || !cfm) {
        showToast("Vui lòng nhập đầy đủ thông tin");
        return;
      }
      if (newPwd.length < 8) {
        showToast("Mật khẩu mới tối thiểu 8 ký tự");
        return;
      }
      if (newPwd !== cfm) {
        showToast("Xác nhận mật khẩu không khớp");
        return;
      }
      const lastChanged = document.getElementById("pwdLastChanged");
      if (lastChanged) {
        lastChanged.textContent = new Date().toLocaleDateString("vi-VN");
      }
      ["curPwd", "newPwd", "cfmPwd"].forEach((id) => {
        const input = document.getElementById(id);
        if (input) input.value = "";
      });
      hideModal();
      showToast("Đã cập nhật mật khẩu");
    });

    const currentUser = layout.user || (api && typeof api.getCurrentUser === "function" ? api.getCurrentUser() : null);
    applyUserProfile(currentUser);
    if (typeof layout.ensureUser === "function") {
      layout
        .ensureUser()
        .then((user) => {
          if (user) applyUserProfile(user);
        })
        .catch(() => {});
    }

    setEditable(false);
    layout.setupLogoutHandler?.();
  }

  function initThongBao() {
    const list = document.getElementById("notifList");
    if (!list) return;

    const searchInput = document.getElementById("q");
    const typeSelect = document.getElementById("type");
    const statusSelect = document.getElementById("status");
    const counter = document.getElementById("count");

    const apply = () => {
      const keyword = (searchInput?.value || "").toLowerCase().trim();
      const typeValue = typeSelect?.value || "";
      const statusValue = statusSelect?.value || "";
      let shown = 0;

      $$(".notif-item", list).forEach((item) => {
        const text = item.innerText.toLowerCase();
        const matchKeyword = !keyword || text.includes(keyword);
        const matchType = !typeValue || item.dataset.type === typeValue;
        const matchStatus =
          !statusValue || item.dataset.status === statusValue;

        const visible = matchKeyword && matchType && matchStatus;
        item.style.display = visible ? "" : "none";
        if (visible) shown++;
      });

      if (counter) counter.textContent = String(shown);
    };

    const debounced = debounce(apply, 120);
    searchInput?.addEventListener("input", debounced);
    typeSelect?.addEventListener("change", apply);
    statusSelect?.addEventListener("change", apply);

    list.addEventListener("click", (event) => {
      const btn = event.target.closest("button.btn-icon");
      if (!btn) return;
      const item = event.target.closest(".notif-item");
      if (!item) return;
      const action = btn.dataset.action;

      if (action === "mark") {
        item.dataset.status = "read";
        item.classList.remove("is-unread");
        item
          .querySelector(".notif-card")
          ?.classList.remove("bg-blue-50/70", "border-blue-200", "border-l-4");
        apply();
        showToast("Đã đánh dấu đã đọc.");
        return;
      }

      if (action === "pin") {
        item.dataset.status =
          item.dataset.status === "pinned" ? "read" : "pinned";
        item.classList.remove("is-unread");
        apply();
        showToast("Đã cập nhật trạng thái ghim.");
        return;
      }

      if (action === "del") {
        item.remove();
        apply();
        showToast("Đã xoá thông báo.");
      }
    });

    apply();
  }

  /* ============== HELPERS ============== */

  function noop() {}

  function createDetailView(listSelector, detailSelector, onShow) {
    const listEl = document.querySelector(listSelector);
    const detailEl = document.querySelector(detailSelector);
    if (!listEl || !detailEl) return null;

    const scrollToEl = (el) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const top = Math.max(0, rect.top + window.scrollY - 72);
      window.scrollTo({ top, behavior: "smooth" });
    };

    const hide = () => {
      detailEl.classList.add("hidden");
      listEl.classList.remove("hidden");
      scrollToEl(listEl);
    };

    detailEl
      .querySelectorAll("[data-action='back-to-list']")
      .forEach((btn) => btn.addEventListener("click", hide));

    return {
      show(payload = {}) {
        if (typeof onShow === "function") {
          onShow(payload);
        }
        listEl.classList.add("hidden");
        detailEl.classList.remove("hidden");
        scrollToEl(detailEl);
      },
      hide,
    };
  }

  function renderDocDetail(doc = {}) {
    const id = doc.id || doc.code || doc.title || "Chi tiết";
    setTextById("cvDocBreadcrumb", `Văn bản • ${id}`);
    applyDirectionChip(document.getElementById("cvDocDirection"), doc.direction);
    applyStatusChip(document.getElementById("cvDocStatus"), doc.status);
    applyUrgencyChip(document.getElementById("cvDocUrgency"), doc.urgency);
    applySecurityChip(document.getElementById("cvDocSecurity"), doc.security);

    setTextById("cvDocTitle", doc.title);
    setTextById("cvDocCode", doc.code);
    setTextById("cvDocReceivedNumber", doc.receivedNumber || doc.issueNumber);
    setTextById("cvDocIssuedDate", doc.issuedDate);
    setTextById("cvDocReceivedDate", doc.receivedDate);
    setTextById("cvDocSender", doc.sender);
    setTextById("cvDocReceiver", doc.receiver);
    setTextById("cvDocField", doc.field);
    setTextById("cvDocType", doc.type);
    setTextById("cvDocDepartment", doc.department);
    setTextById("cvDocDue", doc.due);
    setTextById("cvDocIssueNumber", doc.issueNumber);
    setTextById("cvDocSigner", doc.signer);
    setTextById("cvDocSigningMethod", doc.signingMethod);
    setTextById("cvDocIssuedBy", doc.issuedBy);
    setTextById("cvDocDispatchMethod", doc.dispatchMethod);
    setTextById("cvDocDispatchStatus", doc.dispatchStatus);
    setTextById("cvDocDispatchAt", doc.dispatchAt);
  }

  function renderCaseDetail(caseData = {}) {
    const id =
      caseData.id || caseData.code || caseData.title || "Hồ sơ công việc";
    setTextById("cvCaseBreadcrumb", `Hồ sơ công việc • ${id}`);
    setTextById("cvCaseTitle", caseData.title);
    setTextById("cvCaseCode", caseData.code);
    setTextById("cvCaseType", caseData.type);
    setTextById("cvCaseDepartment", caseData.department);
    setTextById("cvCaseLeader", caseData.leader);
    setTextById("cvCaseOwner", caseData.owner);
    setTextById("cvCaseDue", caseData.dueDate);
    setTextById("cvCaseCreatedAt", caseData.createdAt);
    setTextById("cvCaseStatusText", caseData.status);
    setTextById("cvCaseTaskCount", caseData.taskCount);

    applyCaseStatusChip(
      document.getElementById("cvCaseStatus"),
      caseData.status
    );
    applyCasePriorityChip(
      document.getElementById("cvCasePriority"),
      caseData.priority
    );
  }

  function buildDocDataset(row) {
    if (!row) return {};
    const urgencySpan = row.children?.[4]?.querySelectorAll("span") || [];
    const statusChip = row.children?.[8]?.querySelector("span");

    return {
      id: row.dataset.docId || getDocIdFromRow(row),
      direction: row.dataset.docDirection || "den",
      title:
        row.dataset.docTitle ||
        safeText(row.querySelector(".font-medium")) ||
        safeText(row.querySelector("a")),
      code:
        row.dataset.docCode ||
        safeText(row.children?.[1]?.firstElementChild) ||
        safeText(row.children?.[1]),
      receivedNumber:
        row.dataset.docReceivedNumber ||
        stripLabel(safeText(row.children?.[1]?.lastElementChild)),
      issuedDate:
        row.dataset.docIssuedDate ||
        stripLabel(safeText(row.children?.[2]?.firstElementChild)),
      receivedDate:
        row.dataset.docReceivedDate ||
        stripLabel(safeText(row.children?.[2]?.lastElementChild)),
      sender:
        row.dataset.docSender || safeText(row.children?.[5]?.firstElementChild),
      receiver:
        row.dataset.docReceiver ||
        stripLabel(safeText(row.children?.[5]?.lastElementChild)),
      field:
        row.dataset.docField ||
        safeText(row.children?.[3]?.firstElementChild),
      type:
        row.dataset.docType ||
        stripLabel(safeText(row.children?.[3]?.lastElementChild)),
      urgency:
        row.dataset.docUrgency || safeText(urgencySpan?.[0]) || safeText(row.children?.[4]),
      security:
        row.dataset.docSecurity || safeText(urgencySpan?.[1]) || "",
      status:
        row.dataset.docStatus || safeText(statusChip) || safeText(row.children?.[8]),
      department:
        row.dataset.docDepartment ||
        safeText(row.children?.[6]?.firstElementChild),
      due:
        row.dataset.docDue ||
        stripLabel(safeText(row.children?.[6]?.lastElementChild)) ||
        safeText(row.children?.[7]),
      issueNumber:
        row.dataset.docIssueNumber ||
        row.dataset.docReceivedNumber ||
        stripLabel(safeText(row.children?.[1]?.lastElementChild)),
      signer: row.dataset.docSigner || "",
      signingMethod: row.dataset.docSigningMethod || "",
      issuedBy: row.dataset.docIssuedBy || "",
      dispatchMethod: row.dataset.docDispatchMethod || "",
      dispatchStatus: row.dataset.docDispatchStatus || "",
      dispatchAt: row.dataset.docDispatchAt || "",
    };
  }

  function buildCaseDataset(row) {
    if (!row) return {};
    const dataset = row.dataset || {};
    return {
      id: dataset.caseId || dataset.docId || getDocIdFromRow(row),
      code:
        dataset.caseCode ||
        safeText(row.children?.[0]?.querySelector("strong")) ||
        safeText(row.children?.[0]),
      title:
        dataset.caseTitle ||
        safeText(row.children?.[0]?.querySelector("a")) ||
        safeText(row.children?.[0]),
      type: dataset.caseType || "",
      status: dataset.caseStatus || safeText(row.children?.[6]),
      priority: dataset.casePriority || safeText(row.children?.[5]),
      department: dataset.caseDepartment || "",
      leader: dataset.caseLeader || safeText(row.children?.[1]),
      owner: dataset.caseOwner || "",
      dueDate:
        dataset.caseDue ||
        stripLabel(safeText(row.children?.[3])) ||
        safeText(row.children?.[3]),
      createdAt:
        dataset.caseCreatedAt ||
        stripLabel(safeText(row.children?.[2])) ||
        safeText(row.children?.[2]),
      taskCount: dataset.caseTaskCount || "",
    };
  }

  function setTextById(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = value && value.trim ? value.trim() || "—" : value || "—";
  }

  function applyDirectionChip(el, direction) {
    if (!el) return;
    const map = {
      den: {
        text: "Văn bản đến",
        classes: "bg-blue-50 text-blue-700",
      },
      di: {
        text: "Văn bản đi",
        classes: "bg-emerald-50 text-emerald-700",
      },
      "du_thao": {
        text: "Văn bản dự thảo",
        classes: "bg-violet-50 text-violet-700",
      },
    };
    const key = toLower(direction);
    const entry = map[key] || map.den;
    setChip(el, entry.classes, entry.text);
  }

  function applyStatusChip(el, status) {
    if (!el) return;
    const map = {
      "chưa xử lý": "bg-slate-900 text-white",
      "đang xử lý": "bg-amber-100 text-amber-700",
      "đã xử lý": "bg-emerald-50 text-emerald-700",
      "đã phát hành": "bg-blue-100 text-blue-700",
      "bị từ chối": "bg-rose-100 text-rose-700",
    };
    const key = toLower(status);
    const classes = map[key] || "bg-slate-200 text-slate-700";
    setChip(el, classes, status || "Chưa xác định");
  }

  function applyUrgencyChip(el, urgency) {
    if (!el) return;
    const map = {
      "hỏa tốc": "bg-rose-100 text-rose-700",
      khẩn: "bg-amber-100 text-amber-700",
      cao: "bg-orange-100 text-orange-700",
      thường: "bg-slate-100 text-slate-700",
    };
    const key = toLower(urgency);
    const classes = map[key] || "bg-slate-100 text-slate-700";
    setChip(el, classes, urgency || "—");
  }

  function applySecurityChip(el, security) {
    if (!el) return;
    const map = {
      mật: "bg-rose-100 text-rose-700",
      "tuyệt mật": "bg-red-200 text-red-800",
      "không mật": "bg-slate-100 text-slate-600",
      thường: "bg-slate-200 text-slate-700",
    };
    const key = toLower(security);
    const classes = map[key] || "bg-slate-200 text-slate-700";
    setChip(el, classes, security || "—");
  }

  function setChip(el, classes, text) {
    el.className = `px-2.5 py-1 rounded-full text-xs font-semibold ${classes}`;
    el.textContent = text;
  }

  function applyCaseStatusChip(el, status) {
    if (!el) return;
    const map = {
      "đang thực hiện": "bg-blue-50 text-blue-700",
      "chờ xử lý": "bg-slate-200 text-slate-700",
      "hoàn thành": "bg-emerald-50 text-emerald-700",
      "đóng hồ sơ": "bg-slate-900 text-white",
      "tạm dừng": "bg-amber-100 text-amber-700",
      "trễ hạn": "bg-rose-100 text-rose-700",
    };
    const key = toLower(status);
    const classes = map[key] || "bg-slate-200 text-slate-700";
    setChip(el, classes, status || "Chưa xác định");
  }

  function applyCasePriorityChip(el, priority) {
    if (!el) return;
    const map = {
      cao: "bg-rose-100 text-rose-700",
      khẩn: "bg-rose-100 text-rose-700",
      "trung bình": "bg-amber-100 text-amber-700",
      thấp: "bg-slate-100 text-slate-700",
      thường: "bg-slate-100 text-slate-700",
    };
    const key = toLower(priority);
    const classes = map[key] || "bg-slate-100 text-slate-700";
    setChip(el, classes, priority || "—");
  }

  function stripLabel(text) {
    if (!text) return "";
    return text.replace(/^[^:]+:\s*/i, "").trim();
  }

  function matchTaskPriority(priorityText, selected) {
    if (!selected) return true;
    const text = priorityText || "";
    switch (selected) {
      case "cao":
        return /cao|khẩn/.test(text);
      case "trung bình":
        return /trung bình|thường/.test(text);
      case "thấp":
        return /thấp/.test(text);
      default:
        return text.includes(selected);
    }
  }

  function getDocIdFromRow(row) {
    if (!row) return "";
    const id = safeText(row.children?.[1]);
    if (id) return id;
    const tbody = row.parentElement;
    if (!tbody) return "";
    const index = Array.from(tbody.children).indexOf(row);
    return `ROW_${index}`;
  }

  function setRowAccepted(row) {
    if (!row || row.dataset.accepted === "true") return;
    row.dataset.accepted = "true";

    const statusCell = row.children?.[6];
    if (statusCell) {
      statusCell.innerHTML = '<span class="chip chip--blue">Đang xử lý</span>';
    }

    const btn = $$("button", row).find((b) => /tiếp nhận/i.test(b.textContent || ""));
    if (btn) {
      btn.textContent = "Đã tiếp nhận";
      btn.classList.add("is-done");
      btn.setAttribute("disabled", "true");
    }
  }

  function loadAccepted() {
    if (!storage) return [];
    try {
      const raw = storage.getItem(STORAGE_KEYS.incomingAccepted);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveAccepted(list) {
    if (!storage) return;
    try {
      storage.setItem(STORAGE_KEYS.incomingAccepted, JSON.stringify(list));
    } catch {
      /* ignore quota errors */
    }
  }

  function getSafeStorage() {
    try {
      const ls = window.localStorage;
      if (!ls) return null;
      const probe = "__cv_probe__";
      ls.setItem(probe, "1");
      ls.removeItem(probe);
      return ls;
    } catch {
      return null;
    }
  }

  function safeText(node) {
    return (node && node.textContent ? node.textContent : "").trim();
  }

  function toLower(value) {
    return (value || "").toString().trim().toLowerCase();
  }

  function showToast(message = "Đã thực hiện") {
    if (!document.body) return;
    let el = document.querySelector(".toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.remove("show");
    void el.offsetWidth; // restart animation
    el.classList.add("show");
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => {
      el.classList.remove("show");
    }, 1800);
  }

  function debounce(fn, delay = 150) {
    let timer;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function exposeGlobals() {
    window.TrisApp = Object.assign({}, window.TrisApp, {
      showToast,
      debounce,
    });
  }
})();



