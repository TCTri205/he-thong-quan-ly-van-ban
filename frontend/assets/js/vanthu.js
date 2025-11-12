/* ============================================================
   vanthu.js
   Auto-generated from inline scripts to centralize logic per trang
   Không chỉnh sửa trực tiếp trong HTML nữa.
============================================================ */

(function () {
  const pageHandlers = {};

  onReady(() => {
    const page = detectPage();
    setupSidebar();
    const handler = pageHandlers[page];
    if (typeof handler === 'function') {
      handler();
    }
  });

  function onReady(callback) {
    if (typeof callback !== 'function') return;
    const run = () => {
      if (window.Layout?.isReady) {
        callback();
        return;
      }
      if (window.Layout) {
        window.addEventListener('layout:ready', callback, { once: true });
        return;
      }
      callback();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
      run();
    }
  }

  function runAfterDom(callback) {
    if (typeof callback !== 'function') return;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  }

  function detectPage() {
    const data = document.body?.dataset?.page;
    if (data) {
      const normalized = data.toLowerCase();
      if (normalized === 'dashboard-vanthu') return 'dashboard';
      return normalized;
    }
    const path = (location.pathname || '').split('/').pop() || '';
    return path.replace(/\.html$/i, '').toLowerCase();
  }

  function setupSidebar() {
    const btn = document.querySelector('#btnSidebar') || document.querySelector('#btn-sidebar');
    const sidebar = document.querySelector('#sidebar');
    if (!btn || !sidebar) return;
    btn.addEventListener('click', () => {
      const open = sidebar.classList.toggle('is-open');
      sidebar.classList.toggle('hidden', !open);
      btn.setAttribute('aria-expanded', String(open));
    });
  }

  pageHandlers['baocaothongke'] = function () {
    const qs = (s, r = document) => r.querySelector(s);

            // ====== Sidebar (mobile)
            document
              .getElementById("btn-sidebar")
              ?.addEventListener("click", () => {
                document.getElementById("sidebar")?.classList.toggle("hidden");
              });

            // ====== Toast helper
            function toast(msg) {
              const t = qs("#toast");
              if (!t) return;
              t.textContent = msg;
              t.classList.add("show");
              setTimeout(() => t.classList.remove("show"), 1800);
            }

            // ====== Demo data (có thể thay bằng API)
            // Dữ liệu theo tháng (yyyy-mm)
            const months = [
              "2023-10",
              "2023-11",
              "2023-12",
              "2024-01",
              "2024-02",
              "2024-03",
              "2024-04",
              "2024-05",
              "2024-06",
              "2024-07",
              "2024-08",
              "2024-09",
            ];
            const dataIn = [
              92, 88, 101, 120, 116, 124, 97, 110, 105, 112, 118, 121,
            ];
            const dataOut = [41, 44, 55, 62, 59, 64, 53, 57, 60, 63, 66, 69];

            // Trạng thái xử lý (tính trên văn bản đến)
            const statusBreakdown = { new: 32, processing: 73, done: 146 };
            // Phòng ban
            const deptData = [
              { dept: "Văn phòng UBND", in: 82, out: 41 },
              { dept: "Phòng Kinh tế", in: 56, out: 28 },
              { dept: "Phòng Tài chính", in: 49, out: 25 },
              { dept: "Phòng Quản lý đô thị", in: 38, out: 19 },
            ];
            // Ưu tiên
            const priorityData = { thuong: 188, cao: 48, khan: 22, ratkhan: 9 };

            // ====== Utilities
            const toLabel = (ym) => {
              const [y, m] = ym.split("-").map(Number);
              return `${("0" + m).slice(-2)}/${y}`;
            };
            const sum = (arr) => arr.reduce((a, b) => a + b, 0);

            function rangeSlice(arrMonths, from, to, arrData) {
              const s = from ? arrMonths.findIndex((m) => m >= from) : 0;
              const e = to ? arrMonths.findIndex((m) => m > to) : -1;
              if (s === -1) return [];
              if (e === -1) return arrData.slice(s);
              return arrData.slice(s, e);
            }

            function computeTrends(current, previous) {
              if (previous <= 0) return "—";
              const delta = ((current - previous) / previous) * 100;
              const sign = delta > 0 ? "+" : "";
              const color =
                delta > 0
                  ? "text-emerald-600"
                  : delta < 0
                  ? "text-rose-600"
                  : "text-slate-500";
              return `<span class="${color} font-medium">${sign}${delta.toFixed(
                0
              )}% so với kỳ trước</span>`;
            }

            // ====== Filters
            const dateFrom = qs("#dateFrom");
            const dateTo = qs("#dateTo");
            const selDept = qs("#selDept");

            // Mặc định: toàn kỳ của mảng (theo months)
            dateFrom.value = months[0] + "-01";
            dateTo.value = months[months.length - 1] + "-28";

            // ====== Charts
            let chartMonthly, chartStatus, chartDept, chartPriority;

            function buildMonthly(filteredMonths, filteredIn, filteredOut) {
              if (chartMonthly) chartMonthly.destroy();
              chartMonthly = new Chart(qs("#chartMonthly"), {
                type: "bar",
                data: {
                  labels: filteredMonths.map(toLabel),
                  datasets: [
                    { label: "Văn bản đến", data: filteredIn },
                    { label: "Văn bản đi", data: filteredOut },
                  ],
                },
                options: {
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: { y: { beginAtZero: true } },
                  plugins: {
                    legend: { position: "top" },
                    tooltip: { mode: "index", intersect: false },
                  },
                },
              });
            }

            function buildStatus(newV, procV, doneV) {
              if (chartStatus) chartStatus.destroy();
              chartStatus = new Chart(qs("#chartStatus"), {
                type: "doughnut",
                data: {
                  labels: ["Chưa xử lý", "Đang xử lý", "Đã xử lý"],
                  datasets: [{ data: [newV, procV, doneV] }],
                },
                options: {
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { position: "bottom" } },
                  cutout: "55%",
                },
              });
            }

            function buildDept(deptArr) {
              if (chartDept) chartDept.destroy();
              chartDept = new Chart(qs("#chartDept"), {
                type: "bar",
                data: {
                  labels: deptArr.map((d) => d.dept),
                  datasets: [
                    { label: "Văn bản đến", data: deptArr.map((d) => d.in) },
                    { label: "Văn bản đi", data: deptArr.map((d) => d.out) },
                  ],
                },
                options: {
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: { y: { beginAtZero: true } },
                  plugins: { legend: { position: "top" } },
                },
              });
            }

            function buildPriority(prio) {
              if (chartPriority) chartPriority.destroy();
              chartPriority = new Chart(qs("#chartPriority"), {
                type: "pie",
                data: {
                  labels: ["Thường", "Cao", "Khẩn", "Rất khẩn"],
                  datasets: [
                    { data: [prio.thuong, prio.cao, prio.khan, prio.ratkhan] },
                  ],
                },
                options: {
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { position: "bottom" } },
                },
              });
            }

            // ====== KPIs + Table
            function updateKPIs(inArr, outArr) {
              const totalIn = sum(inArr);
              const totalOut = sum(outArr);
              const totalAll = totalIn + totalOut;

              // Ước lượng đúng hạn: done / (new+proc+done)
              const totalStatus =
                statusBreakdown.new +
                statusBreakdown.processing +
                statusBreakdown.done;
              const ontimeRate = totalStatus
                ? Math.round((statusBreakdown.done / totalStatus) * 100)
                : 0;

              qs("#kpi-total").textContent = String(totalAll);
              qs("#kpi-in").textContent = String(totalIn);
              qs("#kpi-out").textContent = String(totalOut);
              qs("#kpi-ontime").textContent = ontimeRate + "%";

              // So sánh kỳ hiện tại với kỳ trước cùng độ dài
              const len = inArr.length;
              if (len > 1) {
                const half = Math.floor(len / 2);
                const currIn = sum(inArr.slice(-half));
                const prevIn = sum(inArr.slice(-(half * 2), -half));
                const currOut = sum(outArr.slice(-half));
                const prevOut = sum(outArr.slice(-(half * 2), -half));
                const currAll = currIn + currOut;
                const prevAll = prevIn + prevOut;

                qs("#kpi-total-trend").innerHTML = computeTrends(currAll, prevAll);
                qs("#kpi-in-trend").innerHTML = computeTrends(currIn, prevIn);
                qs("#kpi-out-trend").innerHTML = computeTrends(currOut, prevOut);
                qs("#kpi-ontime-trend").innerHTML =
                  '<span class="text-slate-500">—</span>';
              } else {
                qs("#kpi-total-trend").textContent = "—";
                qs("#kpi-in-trend").textContent = "—";
                qs("#kpi-out-trend").textContent = "—";
                qs("#kpi-ontime-trend").textContent = "—";
              }
            }

            function updateTable() {
              const tbody = qs("#reportTable");
              const rows = [
                {
                  stt: 1,
                  label: "Văn bản đến đã tiếp nhận",
                  qty: statusBreakdown.done,
                  rate: "—",
                  diff: "+6%",
                  diffClass: "text-emerald-600",
                },
                {
                  stt: 2,
                  label: "Văn bản đến chưa xử lý",
                  qty: statusBreakdown.new,
                  rate: "—",
                  diff: "-3%",
                  diffClass: "text-rose-600",
                },
                {
                  stt: 3,
                  label: "Văn bản đi phát hành",
                  qty: sum(dataOut),
                  rate: "—",
                  diff: "+4%",
                  diffClass: "text-emerald-600",
                },
                {
                  stt: 4,
                  label: "Số lượt nhắc việc gửi đi",
                  qty: 18,
                  rate: "—",
                  diff: "+2",
                  diffClass: "text-emerald-600",
                },
              ];
              tbody.innerHTML = rows
                .map(
                  (r) => `
              <tr class="hover:bg-slate-50">
                <td class="px-4 py-2">${r.stt}</td>
                <td class="px-4 py-2">${r.label}</td>
                <td class="px-4 py-2 text-center">${r.qty}</td>
                <td class="px-4 py-2 text-center">${r.rate}</td>
                <td class="px-4 py-2 text-center"><span class="${r.diffClass} font-medium">${r.diff}</span></td>
              </tr>
            `
                )
                .join("");
            }

            // ====== Apply filters and refresh
            function applyFilters() {
              // Lọc theo ngày: chuyển YYYY-MM-DD -> YYYY-MM
              const from = (dateFrom.value || "").slice(0, 7);
              const to = (dateTo.value || "").slice(0, 7);

              const fMonths = months.filter(
                (m) => (!from || m >= from) && (!to || m <= to)
              );
              const idxs = fMonths.map((m) => months.indexOf(m));
              const fIn = idxs.map((i) => dataIn[i]);
              const fOut = idxs.map((i) => dataOut[i]);

              // Lọc theo phòng ban (chỉ ảnh hưởng chartDept)
              const deptVal = selDept.value;
              const fDept = deptVal
                ? deptData.filter((d) => d.dept === deptVal)
                : deptData;

              // Render charts
              buildMonthly(fMonths, fIn, fOut);
              buildStatus(
                statusBreakdown.new,
                statusBreakdown.processing,
                statusBreakdown.done
              );
              buildDept(fDept);
              buildPriority(priorityData);

              // KPIs + table
              updateKPIs(fIn, fOut);
              updateTable();
            }

            // ====== Event bindings
            qs("#btnMakeReport")?.addEventListener("click", () => {
              applyFilters();
              toast("Đã tạo báo cáo theo bộ lọc.");
            });
            qs("#btnExportExcel")?.addEventListener("click", () => {
              toast("Xuất Excel (demo). Kết nối API để tải file.");
            });
            qs("#btnExportPDF")?.addEventListener("click", () => {
              toast("Xuất PDF (demo). Kết nối API để tải file.");
            });
            dateFrom.addEventListener("change", applyFilters);
            dateTo.addEventListener("change", applyFilters);
            selDept.addEventListener("change", applyFilters);

            // ====== Init
            applyFilters();
  };

  pageHandlers['danhmuc'] = function () {
    const qs = (s, r = document) => r.querySelector(s);
            const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));

            // Sidebar toggle (mobile)
            qs("#btn-sidebar")?.addEventListener("click", () => {
              qs("#sidebar")?.classList.toggle("hidden");
            });

            // Tabs handling
            const tabButtons = qsa("[data-tab]");
            const panels = qsa("[data-panel]");
            let activeTab = "loai";

            function setActiveTab(key) {
              activeTab = key;
              tabButtons.forEach((btn) => {
                const on = btn.getAttribute("data-tab") === key;
                btn.classList.toggle("bg-slate-900", on);
                btn.classList.toggle("text-white", on);
              });
              panels.forEach((p) =>
                p.classList.toggle("hidden", p.getAttribute("data-panel") !== key)
              );
              applySearchFilter();
            }

            tabButtons.forEach((btn) =>
              btn.addEventListener("click", () => {
                setActiveTab(btn.getAttribute("data-tab"));
              })
            );

            // Search filtering (per active panel)
            const searchInput = qs("#dm-search");
            const globalSearch = qs("#global-search");

            function rowMatches(row, term) {
              const text = row.textContent.toLowerCase();
              return text.includes(term);
            }

            function applySearchFilter() {
              const term = (searchInput.value || "").trim().toLowerCase();
              const panelEl = qs(`[data-panel="${activeTab}"]`);
              if (!panelEl) return;
              const rows = qsa("tbody tr", panelEl);
              rows.forEach((r) => r.classList.remove("hidden"));

              if (term) {
                rows.forEach((r) => {
                  if (!rowMatches(r, term)) r.classList.add("hidden");
                });
              }
            }

            searchInput.addEventListener("input", applySearchFilter);

            // Mirror global search to local
            globalSearch?.addEventListener("keydown", (e) => {
              if (e.key === "Enter") {
                searchInput.value = e.target.value;
                applySearchFilter();
              }
            });

            // Init
            setActiveTab("loai");
  };

  pageHandlers['dashboard'] = function () {
    // Các hook nhẹ để đảm bảo JS ngoài có đủ dữ liệu/ID để hoạt động an toàn
          (function () {
            // Tính lại % thanh tiến độ nếu cần (đảm bảo đồng bộ số & thanh)
            function syncProgress(idDone, idTotal, idBar, idPercent) {
              const doneEl = document.getElementById(idDone);
              const totalEl = document.getElementById(idTotal);
              const barEl = document.getElementById(idBar);
              const percentEl = document.getElementById(idPercent);
              if (!doneEl || !totalEl || !barEl || !percentEl) return;

              const done = Number(
                doneEl.dataset.progress || doneEl.textContent || 0
              );
              const total = Number(
                totalEl.dataset.total || totalEl.textContent || 0
              );
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;

              barEl.style.width = pct + "%";
              percentEl.textContent = String(pct);
            }

            // Khởi tạo KPI từ data-value (nếu có)
            function syncKpi(id) {
              const el = document.getElementById(id);
              if (!el) return;
              const val = el.dataset.value;
              if (val !== undefined) el.textContent = val;
            }

            runAfterDom(function () {
              // KPI
              [
                "kpi-den-chua-xuly",
                "kpi-di-chua-phathanh",
                "kpi-khan",
                "kpi-luutru",
              ].forEach(syncKpi);

              // Progress bars
              syncProgress(
                "vb-den-progress",
                "vb-den-total",
                "bar-vb-den",
                "vb-den-percent"
              );
              syncProgress(
                "vb-di-progress",
                "vb-di-total",
                "bar-vb-di",
                "vb-di-percent"
              );
            });
          })();
  };

  pageHandlers['hosocongviec'] = function () {
    const qs = (s, r = document) => r.querySelector(s);
            const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));

            // Sidebar (mobile)
            qs("#btn-sidebar")?.addEventListener("click", () => {
              qs("#sidebar")?.classList.toggle("hidden");
            });

            // Toast helper
            function showToast(msg) {
              const t = qs("#toast");
              if (!t) return;
              t.textContent = msg;
              t.classList.add("show");
              setTimeout(() => t.classList.remove("show"), 1800);
            }

            // Normalize for search
            const normalize = (s) =>
              (s || "")
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "");

            // KPIs compute
            function computeKPIs() {
              const items = qsa("#caseList > li");
              let total = 0,
                collect = 0,
                done = 0,
                docs = 0;
              items.forEach((li) => {
                if (li.style.display === "none") return; // tính theo danh sách sau lọc
                total++;
                const st = li.getAttribute("data-status");
                const d = Number(li.getAttribute("data-docs") || 0);
                docs += isNaN(d) ? 0 : d;
                if (st === "collecting") collect++;
                if (st === "done") done++;
              });
              qs("#kpi-total").textContent = String(total);
              qs("#kpi-collect").textContent = String(collect);
              qs("#kpi-done").textContent = String(done);
              qs("#kpi-docs").textContent = String(docs);
            }

            // Filters
            const txtSearch = qs("#txtSearch");
            const globalSearch = qs("#global-search");
            const selStatus = qs("#selStatus");
            const selCategory = qs("#selCategory");

            function applyFilters() {
              const kw = normalize(
                (txtSearch?.value || globalSearch?.value || "").trim()
              );
              const st = selStatus?.value || "";
              const cat = selCategory?.value || "";
              const items = qsa("#caseList > li");
              items.forEach((li) => {
                const stOK = !st || li.getAttribute("data-status") === st;
                const catOK = !cat || li.getAttribute("data-category") === cat;
                const key = normalize(
                  li.getAttribute("data-key") || li.textContent
                );
                const kwOK = !kw || key.includes(kw);
                li.style.display = stOK && catOK && kwOK ? "" : "none";
              });
              computeKPIs();
            }

            txtSearch?.addEventListener("input", applyFilters);
            globalSearch?.addEventListener("input", applyFilters);
            selStatus?.addEventListener("change", applyFilters);
            selCategory?.addEventListener("change", applyFilters);

            // Export / Create
            qs("#btnExport")?.addEventListener("click", () => {
              showToast("Đã xuất danh sách (demo). Kết nối API để tải file.");
            });
            qs("#btnCreate")?.addEventListener("click", () => {
              showToast("Tạo hồ sơ mới (demo). Kết nối biểu mẫu tạo hồ sơ.");
            });

            // Init
            applyFilters();
  };

  pageHandlers['hosocongviec-detail'] = function () {
    const api = window.ApiClient;
    if (!api) {
      console.warn("[vanthu] ApiClient không sẵn sàng; bỏ qua tính năng theo dõi hồ sơ.");
      return;
    }

    const body = document.body;
    const caseId = body?.dataset?.caseId;
    if (!caseId) {
      console.warn("[vanthu] Thiếu case_id trong trang chi tiết hồ sơ.");
      return;
    }

    const watchBtn = document.getElementById("btn-case-watch");
    const watchersList = document.getElementById("case-watchers-list");
    const watchersCount = document.getElementById("case-watchers-count");
    const toast = document.getElementById("toast");
    const storedUser = api.getCurrentUser ? api.getCurrentUser() : null;
    const currentUserId = storedUser?.id ?? storedUser?.user_id ?? storedUser?.userId;

    const state = { watching: false };

    function escapeHtml(value) {
      return (value || "")
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    async function refreshWatchers() {
      try {
        const participants = await api.cases.participants(caseId);
        const watchers = Array.isArray(participants)
          ? participants.filter((item) => item?.role_on_case === "watcher")
          : [];
        renderWatchers(watchers);
      } catch (error) {
        console.error("[vanthu] lỗi tải danh sách người theo dõi:", error);
      }
    }

    function renderWatchers(watchers) {
      const list = Array.isArray(watchers) ? watchers : [];
      if (watchersCount) {
        watchersCount.textContent = String(list.length);
      }
      if (watchersList) {
        if (!list.length) {
          watchersList.innerHTML =
            '<li class="text-[13px] text-slate-500">Chưa có người theo dõi hồ sơ.</li>';
        } else {
          watchersList.innerHTML = list
            .map((entry) => {
              const user = entry?.user;
              const name =
                user?.full_name || user?.username || user?.id || "Người dùng";
              return `<li class="flex items-center justify-between gap-2 text-[13px]">
                <span>${escapeHtml(name)}</span>
                <span class="chip chip--info">Đang theo dõi</span>
              </li>`;
            })
            .join("");
        }
      }
      state.watching = list.some(
        (entry) =>
          entry?.user &&
          (String(entry.user.id) === String(currentUserId) ||
            String(entry.user.user_id) === String(currentUserId))
      );
      updateWatchButton();
    }

    function updateWatchButton() {
      if (!watchBtn) return;
      watchBtn.textContent = state.watching ? "Bỏ theo dõi" : "Theo dõi hồ sơ";
      watchBtn.classList.toggle("bg-blue-600", !state.watching);
      watchBtn.classList.toggle("text-white", !state.watching);
      watchBtn.classList.toggle("bg-white", state.watching);
      watchBtn.classList.toggle("text-slate-900", state.watching);
    }

    async function toggleWatch() {
      if (!watchBtn) return;
      watchBtn.disabled = true;
      try {
        if (state.watching) {
          await api.cases.unwatch(caseId);
        } else {
          await api.cases.watch(caseId);
        }
        await refreshWatchers();
        showToast(
          state.watching ? "Bạn đang theo dõi hồ sơ." : "Đã bỏ theo dõi hồ sơ.",
          "success"
        );
      } catch (error) {
        console.error("[vanthu] lỗi thao tác theo dõi:", error);
        showToast(resolveErrorMessage(error), "error");
      } finally {
        watchBtn.disabled = false;
      }
    }

    function showToast(message, type = "info") {
      if (!toast) {
        console.log(message);
        return;
      }
      toast.textContent = message;
      toast.classList.remove("show", "toast--error", "toast--success", "toast--warn");
      if (type === "error") toast.classList.add("toast--error");
      else if (type === "success") toast.classList.add("toast--success");
      else if (type === "warn") toast.classList.add("toast--warn");
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 2200);
    }

    function resolveErrorMessage(error) {
      if (!error) return "Không thể thực hiện thao tác.";
      if (error.data) {
        if (typeof error.data === "string") return error.data;
        if (error.data.detail) return String(error.data.detail);
        if (error.data.message) return String(error.data.message);
      }
      if (error.message) return String(error.message);
      return "Không thể thực hiện thao tác.";
    }

    if (watchBtn) {
      watchBtn.addEventListener("click", toggleWatch);
    }

    refreshWatchers();
  };

  pageHandlers['taikhoan'] = function () {
    const qs = (s, r = document) => r.querySelector(s);
            const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));

            // Simple toast (fallback if shared one not present)
            function toast(msg, type = "info") {
              const t = qs("#toast");
              if (!t) return alert(msg);
              t.textContent = msg;
              t.classList.remove(
                "toast--show",
                "toast--success",
                "toast--error",
                "toast--warn"
              );
              t.classList.add("toast--show");
              if (type === "success") t.classList.add("toast--success");
              else if (type === "error") t.classList.add("toast--error");
              else if (type === "warn") t.classList.add("toast--warn");
              setTimeout(() => t.classList.remove("toast--show"), 2000);
            }

            // Sidebar toggle on small screens if header has a menu button (optional)
            qsa("#btn-sidebar").forEach((btn) => {
              btn.addEventListener("click", () =>
                qs("#sidebar")?.classList.toggle("hidden")
              );
            });

            // ---------- Profile edit / save ----------
            const btnEdit = qs("#btnEdit");
            const btnSave = qs("#btnSave");
            const btnCancel = qs("#btnCancel");

            const inputs = ["#inpName", "#inpEmail", "#inpPhone", "#inpDept"].map(
              (id) => qs(id)
            );
            const displayName = qs("#displayName");

            let snapshot = {};

            function setEditMode(on) {
              inputs.forEach((el) => (el.disabled = !on));
              btnEdit.classList.toggle("hidden", on);
              btnSave.classList.toggle("hidden", !on);
              btnCancel.classList.toggle("hidden", !on);
            }

            btnEdit?.addEventListener("click", () => {
              // take snapshot
              snapshot = Object.fromEntries(inputs.map((el) => [el.id, el.value]));
              setEditMode(true);
              inputs[0]?.focus();
            });

            btnCancel?.addEventListener("click", () => {
              // restore
              inputs.forEach((el) => {
                if (snapshot[el.id] != null) el.value = snapshot[el.id];
              });
              setEditMode(false);
              toast("Đã huỷ thay đổi.");
            });

            btnSave?.addEventListener("click", () => {
              // very light validation
              const email = qs("#inpEmail").value.trim();
              const name = qs("#inpName").value.trim();
              if (!name) return toast("Vui lòng nhập họ và tên.", "error");
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                return toast("Email không hợp lệ.", "error");

              displayName.textContent = name;
              setEditMode(false);
              toast("Đã lưu thông tin tài khoản.", "success");
            });

            // ---------- Password modal ----------
            const modal = qs("#pwdModal");
            const openPwd = qs("#btnOpenPwd");
            const closePwd = qs("#pwdClose");
            const cancelPwd = qs("#pwdCancel");
            const submitPwd = qs("#pwdSubmit");
            const curPwd = qs("#curPwd");
            const newPwd = qs("#newPwd");
            const cfmPwd = qs("#cfmPwd");
            const pwdLast = qs("#pwdLastChanged");

            function openModal() {
              modal.classList.remove("hidden");
              setTimeout(() => curPwd.focus(), 10);
            }
            function closeModal() {
              modal.classList.add("hidden");
              curPwd.value = newPwd.value = cfmPwd.value = "";
            }

            openPwd?.addEventListener("click", openModal);
            closePwd?.addEventListener("click", closeModal);
            cancelPwd?.addEventListener("click", closeModal);
            modal?.addEventListener("click", (e) => {
              if (e.target === modal) closeModal();
            });

            submitPwd?.addEventListener("click", () => {
              const c = curPwd.value.trim();
              const n = newPwd.value.trim();
              const k = cfmPwd.value.trim();

              if (!c || !n || !k)
                return toast("Vui lòng nhập đầy đủ thông tin.", "error");
              if (n.length < 8)
                return toast("Mật khẩu mới tối thiểu 8 ký tự.", "error");
              if (!/[a-z]/.test(n) || !/[A-Z]/.test(n) || !/[0-9]/.test(n)) {
                return toast(
                  "Mật khẩu mới cần có chữ hoa, chữ thường và số.",
                  "error"
                );
              }
              if (n !== k) return toast("Xác nhận mật khẩu chưa khớp.", "error");
              if (n === c)
                return toast(
                  "Mật khẩu mới không được trùng mật khẩu hiện tại.",
                  "error"
                );

              // Simulate success
              const today = new Date();
              const dd = String(today.getDate()).padStart(2, "0");
              const mm = String(today.getMonth() + 1).padStart(2, "0");
              const yyyy = today.getFullYear();
              pwdLast.textContent = `${dd}/${mm}/${yyyy}`;

              closeModal();
              toast("Đã cập nhật mật khẩu.", "success");
            });

            // ---------- Sign-in history (demo data) ----------
            const signinList = qs("#signinList");
            const sessions = [
              {
                time: "09:12 12/02/2024",
                ip: "10.1.23.45",
                device: "Chrome • Windows",
                ok: true,
              },
              {
                time: "08:01 11/02/2024",
                ip: "10.1.22.87",
                device: "Chrome • Windows",
                ok: true,
              },
              {
                time: "20:33 10/02/2024",
                ip: "10.1.20.16",
                device: "Mobile • Android",
                ok: true,
              },
              {
                time: "19:05 09/02/2024",
                ip: "10.1.19.77",
                device: "Safari • iOS",
                ok: true,
              },
            ];
            function renderSessions() {
              if (!signinList) return;
              signinList.innerHTML = sessions
                .map(
                  (s, i) => `
              <li class="px-4 py-3 flex items-center justify-between">
                <div>
                  <div class="font-medium text-[13.5px]">${s.device}</div>
                  <div class="text-[12.5px] text-slate-500">Đăng nhập lúc ${s.time} • IP ${s.ip}</div>
                </div>
                <span class="chip chip-success">Hợp lệ</span>
              </li>
            `
                )
                .join("");
            }
            renderSessions();

            const logoutBtn = qs("#btnLogout");
            if (logoutBtn) {
              logoutBtn.dataset.action = logoutBtn.dataset.action || "logout";
              logoutBtn.dataset.logoutConfirm =
                logoutBtn.dataset.logoutConfirm || "Bạn có chắc muốn đăng xuất?";
              window.Layout?.setupLogoutHandler?.();
            }
  };

  pageHandlers['thongbaonhacviec'] = function () {
    const qs = (s, r = document) => r.querySelector(s);
            const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));

            // Sidebar toggle (mobile)
            qs("#btn-sidebar")?.addEventListener("click", () => {
              qs("#sidebar")?.classList.toggle("hidden");
            });

            // Toast helper
            function toast(msg) {
              const t = qs("#toast");
              if (!t) return;
              t.textContent = msg;
              t.classList.add("show");
              setTimeout(() => t.classList.remove("show"), 1800);
            }

            // ===== Demo data (can be replaced by API) =====
            /** item fields:
             * id, kind: 'noti'|'remind', type: 'vbd'|'vbd-xuly'|'vbd-hethan'|'vbd-theodoi'|'vbd-khac'|'di-chua-phat-hanh'
             * priority: 'thuong'|'cao'|'khan'
             * title, detail, date (YYYY-MM-DD), unread (bool)
             */
            const items = [
              {
                id: "N001",
                kind: "noti",
                type: "vbd-xuly",
                priority: "khan",
                title: "VB008 sắp hết hạn xử lý",
                detail:
                  "Thông báo về việc kiểm tra an toàn thực phẩm — hạn 2024-02-05.",
                date: "2024-02-03",
                unread: true,
              },
              {
                id: "N002",
                kind: "noti",
                type: "vbd",
                priority: "thuong",
                title: "Có văn bản mới cần xử lý",
                detail: "Chỉ thị về công tác chuẩn bị bầu cử vừa được tiếp nhận.",
                date: "2024-02-07",
                unread: true,
              },
              {
                id: "N003",
                kind: "noti",
                type: "vbd-theodoi",
                priority: "cao",
                title: "Cập nhật sổ theo dõi",
                detail: "Hoàn tất ghi sổ VB đến tuần này.",
                date: "2024-02-08",
                unread: false,
              },
              {
                id: "N004",
                kind: "noti",
                type: "di-chua-phat-hanh",
                priority: "cao",
                title: "VB đi chờ phát hành",
                detail: "040/BC-UBND đã ký — cần cấp số & phát hành.",
                date: "2024-02-08",
                unread: true,
              },

              {
                id: "R101",
                kind: "remind",
                type: "vbd-hethan",
                priority: "khan",
                title: "Nhắc xử lý VB đến quá hạn",
                detail: "VB 018/TB-UBND đã quá hạn 2 ngày.",
                date: "2024-02-09",
                unread: false,
              },
              {
                id: "R102",
                kind: "remind",
                type: "vbd-xuly",
                priority: "cao",
                title: "Nhắc phân công xử lý",
                detail: "VB 031/CT-UBND chưa phân công người xử lý.",
                date: "2024-02-07",
                unread: false,
              },
              {
                id: "R103",
                kind: "remind",
                type: "di-chua-phat-hanh",
                priority: "thuong",
                title: "Nhắc phát hành",
                detail: "Báo cáo 006/TB-UBND cần gửi nơi nhận.",
                date: "2024-01-26",
                unread: false,
              },
              {
                id: "R104",
                kind: "remind",
                type: "vbd-khac",
                priority: "thuong",
                title: "Theo dõi phối hợp",
                detail: "Nhắc đôn đốc tổ dân phố nộp báo cáo.",
                date: "2024-02-06",
                unread: false,
              },
            ];

            // ===== Elements
            const tabNoti = qs("#tab-noti");
            const tabRemind = qs("#tab-remind");
            const blockNoti = qs("#block-noti");
            const blockRemind = qs("#block-remind");
            const listNoti = qs("#list-noti");
            const listRemind = qs("#list-remind");
            const emptyNoti = qs("#noti-empty");
            const emptyRemind = qs("#remind-empty");

            const searchBox = qs("#searchBox");
            const filterType = qs("#filterType");
            const filterPriority = qs("#filterPriority");

            // KPIs
            const kpiTotal = qs("#kpi-total");
            const kpiIncoming = qs("#kpi-incoming");
            const kpiOutgoing = qs("#kpi-outgoing");
            const kpiUnread = qs("#kpi-unread");

            // ===== State
            let currentTab = "noti"; // 'noti' | 'remind'

            // ===== Helpers
            function chipForType(type) {
              const map = {
                vbd: "Văn bản đến",
                "vbd-xuly": "VB đến • chưa xử lý",
                "vbd-hethan": "VB đến • sắp hết hạn",
                "vbd-theodoi": "Sổ theo dõi",
                "vbd-khac": "Khác",
                "di-chua-phat-hanh": "VB đi • chưa phát hành",
              };
              return map[type] || type;
            }

            function chipForPriority(priority) {
              const map = {
                thuong: { cls: "bg-slate-100 text-slate-700", text: "Thường" },
                cao: { cls: "bg-blue-50 text-blue-700", text: "Cao" },
                khan: { cls: "bg-rose-600 text-white", text: "Khẩn" },
              };
              return map[priority] || map["thuong"];
            }

            function renderItem(it) {
              const pr = chipForPriority(it.priority);
              const unreadDot = it.unread
                ? '<span class="w-2 h-2 rounded-full bg-amber-500 inline-block ml-2" title="Chưa đọc"></span>'
                : "";
              return `
              <li class="px-4 py-3 flex items-start justify-between gap-4 hover:bg-slate-50/60" data-id="${
                it.id
              }">
                <div class="min-w-0">
                  <p class="font-medium line-clamp-1">${it.title}${unreadDot}</p>
                  <p class="text-[12.5px] text-slate-500 mt-0.5 line-clamp-1">${
                    it.detail
                  }</p>
                  <div class="mt-1 flex flex-wrap items-center gap-2 text-[12px]">
                    <span class="rounded-full px-2.5 py-0.5 bg-amber-50 text-amber-700 font-medium">${chipForType(
                      it.type
                    )}</span>
                    <span class="rounded-full px-2.5 py-0.5 ${
                      pr.cls
                    } font-medium">${pr.text}</span>
                    <span class="text-slate-400">🗓 ${it.date}</span>
                  </div>
                </div>
                <div class="shrink-0 flex items-center gap-2">
                  <button class="btn-outline mark-read" type="button" title="Đánh dấu đã đọc">👁 Đã đọc</button>
                </div>
              </li>
            `;
            }

            function applyFiltersTo(arr) {
              const q = (searchBox.value || "").trim().toLowerCase();
              const t = filterType.value;
              const p = filterPriority.value;

              return arr.filter((it) => {
                const okText =
                  !q ||
                  it.title.toLowerCase().includes(q) ||
                  it.detail.toLowerCase().includes(q);
                const okType = t === "all" || it.type === t;
                const okPrio = p === "all" || it.priority === p;
                return okText && okType && okPrio;
              });
            }

            function refreshLists() {
              const notis = items.filter((i) => i.kind === "noti");
              const reminds = items.filter((i) => i.kind === "remind");

              const filteredNoti = applyFiltersTo(notis);
              const filteredRemind = applyFiltersTo(reminds);

              // Render
              listNoti.innerHTML = filteredNoti.map(renderItem).join("");
              listRemind.innerHTML = filteredRemind.map(renderItem).join("");

              emptyNoti.classList.toggle("hidden", filteredNoti.length > 0);
              emptyRemind.classList.toggle("hidden", filteredRemind.length > 0);

              // Bind "mark read"
              qsa(".mark-read", listNoti).forEach((btn) =>
                btn.addEventListener("click", onMarkRead)
              );
              qsa(".mark-read", listRemind).forEach((btn) =>
                btn.addEventListener("click", onMarkRead)
              );

              // KPIs
              const totalReminds = reminds.length;
              const countIncomingPending = items.filter(
                (i) => i.type === "vbd-xuly"
              ).length;
              const countOutPending = items.filter(
                (i) => i.type === "di-chua-phat-hanh"
              ).length;
              const unreadCount = items.filter((i) => i.unread).length;

              kpiTotal.textContent = String(totalReminds);
              kpiIncoming.textContent = String(countIncomingPending);
              kpiOutgoing.textContent = String(countOutPending);
              kpiUnread.textContent = String(unreadCount);

              // Toggle blocks per tab
              const isNoti = currentTab === "noti";
              blockNoti.classList.toggle("hidden", !isNoti);
              blockRemind.classList.toggle("hidden", isNoti);
            }

            function onMarkRead(ev) {
              const li = ev.currentTarget.closest("li[data-id]");
              if (!li) return;
              const id = li.getAttribute("data-id");
              const idx = items.findIndex((x) => x.id === id);
              if (idx >= 0) {
                items[idx].unread = false;
                refreshLists();
                toast("Đã đánh dấu đã đọc.");
              }
            }

            // Tab switching
            tabNoti.addEventListener("click", () => {
              currentTab = "noti";
              tabNoti.classList.add("bg-slate-900", "text-white");
              tabRemind.classList.remove("bg-slate-900", "text-white");
              refreshLists();
            });
            tabRemind.addEventListener("click", () => {
              currentTab = "remind";
              tabRemind.classList.add("bg-slate-900", "text-white");
              tabNoti.classList.remove("bg-slate-900", "text-white");
              refreshLists();
            });

            // Filters
            searchBox.addEventListener("input", () => refreshLists());
            filterType.addEventListener("change", () => refreshLists());
            filterPriority.addEventListener("change", () => refreshLists());

            // Global search (header) -> mirror into inner search
            qs("#globalSearch")?.addEventListener("keydown", (e) => {
              if (e.key === "Enter") {
                searchBox.value = e.target.value;
                refreshLists();
              }
            });

            // Init
            refreshLists();
  };

  pageHandlers['vanbanden-tiepnhan'] = function () {
    // Elements
          const req = {
            soKyHieu: document.getElementById("fldSoKyHieu"),
            ngayBanHanh: document.getElementById("fldNgayBanHanh"),
            coQuan: document.getElementById("fldCoQuan"),
            trichYeu: document.getElementById("fldTrichYeu"),
            soDangKy: document.getElementById("fldSoDangKy"),
            ngayDen: document.getElementById("fldNgayDen"),
          };
          const doKhan = document.getElementById("fldDoKhan");
          const doMat = document.getElementById("fldDoMat");
          const pv = {
            soDen: document.getElementById("pvSoDen"),
            ngayDen: document.getElementById("pvNgayDen"),
            soDangKy: document.getElementById("pvSoDangKy"),
            doKhan: document.getElementById("pvDoKhan"),
            doMat: document.getElementById("pvDoMat"),
            files: document.getElementById("pvFiles"),
          };
          const fldSoDen = document.getElementById("fldSoDen");
          const btnRegister = document.getElementById("btnRegister");
          const btnAssign = document.getElementById("btnAssign");
          const btnAddAssignee = document.getElementById("btnAddAssignee");
          const validList = document.getElementById("validList");
          const upload = document.getElementById("fldUpload");
          const lstFiles = document.getElementById("lstFiles");

          // Defaults
          (function initDefaults() {
            const today = new Date().toISOString().slice(0, 10);
            req.ngayDen.value = today;
            req.ngayBanHanh.value = today;
            updatePreview();
            renderFilesPlaceholder();
            checkValidity();
          })();

          // Helpers
          function markCheck(key, ok) {
            const li = validList.querySelector(`[data-check="${key}"]`);
            if (!li) return;
            const dot = li.querySelector(".status-dot");
            if (ok) {
              dot.textContent = "✅";
              li.classList.remove("text-rose-600");
              li.classList.add("text-emerald-700");
            } else {
              dot.textContent = "⛔";
              li.classList.add("text-rose-600");
              li.classList.remove("text-emerald-700");
            }
          }

          function checkValidity() {
            const checks = {
              so_ky_hieu: !!req.soKyHieu.value.trim(),
              ngay_ban_hanh: !!req.ngayBanHanh.value,
              co_quan: !!req.coQuan.value.trim(),
              trich_yeu: !!req.trichYeu.value.trim(),
              so_dang_ky: !!req.soDangKy.value,
              ngay_den: !!req.ngayDen.value,
            };
            Object.entries(checks).forEach(([k, v]) => markCheck(k, v));
            const allOk = Object.values(checks).every(Boolean);
            btnRegister.disabled = !allOk;
            return allOk;
          }

          function updatePreview() {
            pv.ngayDen.textContent = req.ngayDen.value || "—";
            pv.soDangKy.textContent =
              req.soDangKy.options[req.soDangKy.selectedIndex]?.text || "—";
            pv.doKhan.textContent =
              doKhan.options[doKhan.selectedIndex]?.text || "Thường";
            pv.doMat.textContent =
              doMat.options[doMat.selectedIndex]?.text || "Thường";
          }

          // File uploads (mock UI)
          function renderFilesPlaceholder() {
            if (!lstFiles.querySelector("[data-empty-hint]")) {
              const li = document.createElement("li");
              li.className =
                "rounded-lg border border-slate-100 p-3 flex items-center justify-between gap-3";
              li.dataset.emptyHint = "1";
              li.innerHTML =
                '<div class="text-slate-500">Chưa có tệp. Nhấn <span class="font-medium">Thêm tệp</span> để tải lên.</div>';
              lstFiles.appendChild(li);
            }
          }

          function refreshFilesCount() {
            const count = lstFiles.querySelectorAll("li[data-file]").length;
            pv.files.textContent = count;
            const hint = lstFiles.querySelector("li[data-empty-hint]");
            if (hint) hint.style.display = count ? "none" : "";
          }

          upload.addEventListener("change", () => {
            Array.from(upload.files || []).forEach((f) => {
              const li = document.createElement("li");
              li.dataset.file = "1";
              li.className =
                "rounded-lg border border-slate-100 p-3 flex items-center justify-between gap-3";
              li.innerHTML = `
                <div>
                  <div class="font-medium text-slate-700 break-all">${f.name}</div>
                  <div class="text-[12px] text-slate-500">${(f.size / 1024).toFixed(
                    0
                  )} KB • Sẽ tải lên khi lưu</div>
                </div>
                <button type="button" class="btn-icon" title="Gỡ tệp">⛔</button>
              `;
              li.querySelector("button").addEventListener("click", () => {
                li.remove();
                refreshFilesCount();
              });
              lstFiles.appendChild(li);
            });
            upload.value = "";
            refreshFilesCount();
          });

          // Assign table
          function addAssignRow() {
            const body = document.getElementById("assignBody");
            const empty = body.querySelector("[data-empty-row]");
            if (empty) empty.remove();

            const tr = document.createElement("tr");
            tr.innerHTML = `
              <td class="px-5 py-2">
                <input type="text" class="w-full border border-slate-200 rounded-md px-2 py-1.5 text-[13px]" placeholder="VD: Nguyễn Văn An / Phòng Y tế" />
              </td>
              <td class="px-5 py-2">
                <select class="w-full border border-slate-200 rounded-md px-2 py-1.5 text-[13px]">
                  <option>Chủ trì</option>
                  <option>Phối hợp</option>
                </select>
              </td>
              <td class="px-5 py-2">
                <input type="date" class="w-full border border-slate-200 rounded-md px-2 py-1.5 text-[13px]" />
              </td>
              <td class="px-5 py-2">
                <input type="text" class="w-full border border-slate-200 rounded-md px-2 py-1.5 text-[13px]" placeholder="Ghi chú…" />
              </td>
              <td class="px-5 py-2 text-right">
                <button type="button" class="btn-icon" title="Xóa dòng">⛔</button>
              </td>
            `;
            tr.querySelector("button").addEventListener("click", () => tr.remove());
            body.appendChild(tr);
          }

          btnAddAssignee.addEventListener("click", addAssignRow);

          // Register (mock): assign incoming number and unlock assign
          btnRegister.addEventListener("click", () => {
            if (!checkValidity()) return;

            // mock generate: 3-digit/in-year
            const year = (
              req.ngayDen.value || new Date().toISOString().slice(0, 10)
            ).slice(0, 4);
            const rand = Math.floor(50 + Math.random() * 50); // 50-99
            const soDen = String(rand).padStart(3, "0") + "/" + year;

            fldSoDen.value = soDen;
            pv.soDen.textContent = soDen;

            // Enable assignment & forward
            btnAssign.disabled = false;
            btnAddAssignee.disabled = false;

            // Lock key fields to avoid accidental edits post-register (UI only)
            [
              req.soKyHieu,
              req.ngayBanHanh,
              req.coQuan,
              req.trichYeu,
              req.ngayDen,
              req.soDangKy,
            ].forEach((el) => el.setAttribute("disabled", "disabled"));

            // Simple toast
            toast("Đã tiếp nhận & ghi số: " + soDen);
          });

          // Assign (mock)
          btnAssign.addEventListener("click", () => {
            toast("Đã lưu phân công và chuyển xử lý.");
          });

          // Save draft (mock)
          document.getElementById("btnSaveDraft").addEventListener("click", () => {
            toast("Đã lưu nháp thông tin tiếp nhận.");
          });

          // Bind change events
          [
            req.soKyHieu,
            req.ngayBanHanh,
            req.coQuan,
            req.trichYeu,
            req.soDangKy,
            req.ngayDen,
            doKhan,
            doMat,
          ].forEach((el) => {
            el.addEventListener("input", () => {
              checkValidity();
              updatePreview();
            });
            el.addEventListener("change", () => {
              checkValidity();
              updatePreview();
            });
          });

          // Tiny toast
          function toast(msg) {
            let el = document.getElementById("toast");
            if (!el) {
              el = document.createElement("div");
              el.id = "toast";
              el.className =
                "fixed bottom-4 right-4 z-[60] rounded-lg bg-slate-900 text-white text-sm px-3 py-2 shadow-lg";
              document.body.appendChild(el);
            }
            el.textContent = msg;
            el.style.opacity = "1";
            setTimeout(() => (el.style.opacity = "0"), 2200);
          }
  };

  pageHandlers['vanbanden'] = function () {
    const api = window.ApiClient;
    if (!api) {
      console.warn("[vanthu] ApiClient không sẵn sàng; bỏ qua tải văn bản đến.");
      return;
    }

    const layout = window.Layout || {};
    const listEl = document.getElementById("inbox-list");
    if (!listEl) {
      return;
    }

    const countEl = document.getElementById("total-count");
    const statusButton = document.getElementById("btn-status");
    const statusMenu = document.getElementById("menu-status");
    const statusLabel = document.getElementById("status-label");
    const levelButton = document.getElementById("btn-level");
    const levelMenu = document.getElementById("menu-level");
    const levelLabel = document.getElementById("level-label");
    const urgentBtn = document.getElementById("btn-filter-khan");
    const searchInput = document.getElementById("search-inbox");
    const importBtn = document.getElementById("btn-import-inbound");
    const exportBtn = document.getElementById("btn-export-inbound");
    const toast = document.getElementById("toast");

    const kpi = {
      new: document.getElementById("kpi-chua-xu-ly"),
      processing: document.getElementById("kpi-dang-xu-ly"),
      done: document.getElementById("kpi-da-xu-ly"),
      approved: document.getElementById("kpi-da-duyet"),
      urgent: document.getElementById("kpi-khan-cap"),
    };

    const state = { keyword: "", status: "all", level: "all" };
    let normalizedDocs = [];

    attachMenu(statusButton, statusMenu, statusLabel, (value) => {
      state.status = value;
      applyFilters();
    });

    attachMenu(levelButton, levelMenu, levelLabel, (value) => {
      state.level = value;
      applyFilters();
    });

    if (urgentBtn) {
      urgentBtn.addEventListener("click", () => {
        state.level = state.level === "khan" ? "all" : "khan";
        if (levelLabel) {
          levelLabel.textContent = state.level === "khan" ? "Khẩn" : "Tất cả mức độ";
        }
        applyFilters();
      });
    }

    if (searchInput) {
      searchInput.addEventListener(
        "input",
        debounce((event) => {
          state.keyword = event.target.value || "";
          applyFilters();
        }, 200)
      );
    }

    const authReady = layout.authPromise && typeof layout.authPromise.then === "function"
      ? layout.authPromise
      : Promise.resolve();

    authReady
      .then(() => loadDocuments())
      .catch(() => {
        renderError("Không thể xác thực người dùng hiện tại.");
      });

    function loadDocuments() {
      renderLoading();
      return api
        .request("/api/v1/inbound-docs/?ordering=-created_at&page_size=50")
        .then((data) => {
          const docs = api.extractItems(data);
          normalizedDocs = docs.map(normalizeDoc);
          updateKPIs();
          applyFilters();
        })
        .catch((error) => {
          console.error("[vanthu] Lỗi tải văn bản đến:", error);
          renderError(resolveErrorMessage(error));
        });
    }

    function normalizeDoc(raw) {
      const statusRaw = String(raw?.status_name || raw?.status?.name || raw?.status?.code || "");
      const statusKey = mapStatusKey(statusRaw);
      const urgencyRaw = String(raw?.urgency?.name || raw?.urgency?.code || "");
      const urgencyKey = mapUrgencyKey(urgencyRaw);
      const receivedDate = raw?.received_date || (raw?.created_at ? raw.created_at.slice(0, 10) : "");
      const number = raw?.incoming_number ? String(raw.incoming_number) : raw?.document_code || "";
      const sender = raw?.sender || "";
      const department = raw?.department?.name || "";
      const searchValue = normalizeText([raw?.title, number, sender, department].join(" "));
      return {
        raw,
        statusKey,
        statusLabel: mapStatusLabel(statusKey, statusRaw),
        urgencyKey,
        urgencyLabel: mapUrgencyLabel(urgencyKey, urgencyRaw),
        receivedDate,
        number,
        sender,
        department,
        searchValue,
      };
    }

    function applyFilters() {
      if (!normalizedDocs.length) {
        renderList([]);
        if (countEl) countEl.textContent = "0";
        return;
      }
      const keyword = normalizeText(state.keyword);
      const filtered = normalizedDocs.filter((doc) => {
        if (state.status !== "all" && doc.statusKey !== state.status) {
          return false;
        }
        if (state.level !== "all" && doc.urgencyKey !== state.level) {
          return false;
        }
        if (keyword && !doc.searchValue.includes(keyword)) {
          return false;
        }
        return true;
      });
      renderList(filtered);
      if (countEl) {
        countEl.textContent = String(filtered.length);
      }
    }

    function renderList(list) {
      listEl.innerHTML = "";
      if (!list.length) {
        renderEmpty();
        return;
      }
      const fragment = document.createDocumentFragment();
      list.forEach((doc) => {
        fragment.appendChild(createItem(doc));
      });
      listEl.appendChild(fragment);
    }

    function createItem(doc) {
      const li = document.createElement("li");
      li.className = "bg-white border border-slate-200 rounded-xl";
      if (doc.statusKey) li.dataset.status = doc.statusKey;
      if (doc.urgencyKey) li.dataset.level = doc.urgencyKey;
      li.dataset.key = doc.searchValue;

      const statusClass = mapStatusClass(doc.statusKey);
      const urgencyClass = mapUrgencyClass(doc.urgencyKey);
      const detailHref = "vanbanden-detail.html?id=" + encodeURIComponent(doc.raw?.id ?? "");

      li.innerHTML = [
        '<div class="p-4">',
        '  <div class="flex items-start justify-between gap-4">',
        '    <div class="min-w-0">',
        '      <h4 class="text-[15px] font-semibold truncate">' + escapeHtml(doc.raw?.title || "Văn bản") + '</h4>',
        '      <div class="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-slate-600">',
        doc.number ? '        <span class="inline-flex items-center gap-1 text-slate-500">' + escapeHtml(doc.number) + '</span>' : '',
        doc.receivedDate ? '        <span class="inline-flex items-center gap-1 text-slate-500">' + escapeHtml(formatDate(doc.receivedDate)) + '</span>' : '',
        doc.sender ? '        <span class="inline-flex items-center gap-1 text-slate-500">' + escapeHtml(doc.sender) + '</span>' : '',
        doc.department ? '        <span class="inline-flex items-center gap-1 text-slate-500">' + escapeHtml(doc.department) + '</span>' : '',
        '      </div>',
        '      <div class="mt-2 flex flex-wrap items-center gap-2">',
        '        <span class="' + statusClass + '">' + escapeHtml(doc.statusLabel) + '</span>',
        doc.urgencyLabel ? '        <span class="' + urgencyClass + '">' + escapeHtml(doc.urgencyLabel) + '</span>' : '',
        '      </div>',
        '    </div>',
        '    <div class="shrink-0">',
        '      <a href="' + detailHref + '" class="btn-outline"><span>🔍</span> Chi tiết</a>',
        '    </div>',
        '  </div>',
        '</div>',
      ]
        .filter(Boolean)
        .join("\n");
      return li;
    }

    function renderLoading() {
      listEl.innerHTML = '<li class="bg-white border border-slate-200 rounded-xl p-4 text-[13px] text-slate-500">Đang tải dữ liệu...</li>';
    }

    function renderEmpty() {
      listEl.innerHTML = '<li class="bg-white border border-slate-200 rounded-xl p-4 text-[13px] text-slate-500">Không có văn bản phù hợp với bộ lọc.</li>';
    }

    function renderError(message) {
      listEl.innerHTML = '<li class="bg-white border border-rose-200 rounded-xl p-4 text-[13px] text-rose-600">' + escapeHtml(message) + '</li>';
      if (toast) {
        toast.textContent = message;
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 2200);
      }
    }

    function updateKPIs() {
      const counts = { new: 0, processing: 0, done: 0, approved: 0, urgent: 0 };
      normalizedDocs.forEach((doc) => {
        counts[doc.statusKey] = (counts[doc.statusKey] || 0) + 1;
        if (doc.urgencyKey === "khan" || doc.urgencyKey === "ratkhan") {
          counts.urgent += 1;
        }
      });
      if (kpi.new) kpi.new.textContent = String(counts.new || 0);
      if (kpi.processing) kpi.processing.textContent = String(counts.processing || 0);
      if (kpi.done) kpi.done.textContent = String(counts.done || 0);
      if (kpi.approved) kpi.approved.textContent = String(counts.approved || 0);
      if (kpi.urgent) kpi.urgent.textContent = String(counts.urgent || 0);
      if (countEl) countEl.textContent = String(normalizedDocs.length);
    }

    function attachMenu(button, menu, label, onSelect) {
      if (!button || !menu || !label) {
        return;
      }
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        menu.classList.toggle("hidden");
        button.setAttribute("aria-expanded", menu.classList.contains("hidden") ? "false" : "true");
      });
      menu.addEventListener("click", (event) => {
        const target = event.target.closest(".menu-item");
        if (!target) return;
        const value = target.getAttribute("data-status") || target.getAttribute("data-level") || "all";
        label.textContent = target.textContent.trim();
        button.dataset.value = value;
        menu.classList.add("hidden");
        button.setAttribute("aria-expanded", "false");
        onSelect(value);
      });
      document.addEventListener("click", (event) => {
        if (menu.classList.contains("hidden")) return;
        if (!menu.contains(event.target) && event.target !== button) {
          menu.classList.add("hidden");
          button.setAttribute("aria-expanded", "false");
        }
      });
    }

    function mapStatusKey(raw) {
      const value = normalizeText(raw);
      if (!value) return "new";
      if (/duyet|approve|approved|phe_duyet/.test(value)) return "approved";
      if (/hoan_thanh|done|complete|completed/.test(value)) return "done";
      if (/dang_xu_ly|processing|process|assign|assigned/.test(value)) return "processing";
      return "new";
    }

    function mapStatusLabel(key, fallback) {
      switch (key) {
        case "processing":
          return "Đang xử lý";
        case "done":
          return "Đã xử lý";
        case "approved":
          return "Đã duyệt";
        default:
          return fallback || "Chưa xử lý";
      }
    }

    if (importBtn) {
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".xlsx,.xls,.csv,.json";
      fileInput.style.display = "none";
      document.body.appendChild(fileInput);

      importBtn.addEventListener("click", () => {
        fileInput.value = "";
        fileInput.click();
      });

      fileInput.addEventListener("change", async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        const formData = new FormData();
        formData.append("direction", "den");
        formData.append("file", file);
        try {
          await api.request("/api/v1/inbound-docs/import/", {
            method: "POST",
            body: formData,
          });
          showToast("Đã gửi yêu cầu nhập văn bản đến.", "success");
        } catch (error) {
          console.error("[vanthu] import inbound docs error", error);
          showToast(resolveErrorMessage(error), "error");
        }
      });
    }

    if (exportBtn) {
      exportBtn.addEventListener("click", async () => {
        const params = {
          direction: "den",
        };
        if (state.status && state.status !== "all") params.status = state.status;
        if (state.level && state.level !== "all") params.level = state.level;
        if (state.keyword) params.keyword = state.keyword;
        try {
          const resp = await api.request(api.buildUrl("/api/v1/inbound-docs/export/", params));
          showToast("Đã tạo bản xuất. Vui lòng tải xuống từ liên kết được cấp.", "success");
          if (resp?.download_url) {
            const url = /^https?:\/\//i.test(resp.download_url)
              ? resp.download_url
              : api.buildUrl(resp.download_url, null);
            window.open(url, "_blank");
          }
        } catch (error) {
          console.error("[vanthu] export inbound docs error", error);
          showToast(resolveErrorMessage(error), "error");
        }
      });
    }

    function mapStatusClass(key) {
      switch (key) {
        case "processing":
          return "chip chip-warn";
        case "done":
          return "chip chip-success";
        case "approved":
          return "chip chip-info";
        default:
          return "chip chip-muted";
      }
    }

    function mapUrgencyKey(raw) {
      const value = normalizeText(raw);
      if (/rat_khan|very_urgent/.test(value)) return "ratkhan";
      if (/khan|urgent/.test(value)) return "khan";
      if (/cao|high/.test(value)) return "cao";
      return "thuong";
    }

    function mapUrgencyLabel(key, fallback) {
      switch (key) {
        case "ratkhan":
          return "Rất khẩn";
        case "khan":
          return "Khẩn";
        case "cao":
          return "Cao";
        case "thuong":
          return fallback || "Thường";
        default:
          return fallback || "";
      }
    }

    function mapUrgencyClass(key) {
      switch (key) {
        case "ratkhan":
        case "khan":
          return "chip chip-danger";
        case "cao":
          return "chip chip-info";
        default:
          return "chip chip-muted";
      }
    }

    function debounce(fn, delay) {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(null, args), delay);
      };
    }

    function normalizeText(value) {
      return (value || "")
        .toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
    }

    function escapeHtml(value) {
      return (value || "")
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function formatDate(value) {
      if (!value) return "";
      const parts = value.split("-");
      if (parts.length === 3) {
        return parts[2] + "/" + parts[1] + "/" + parts[0];
      }
      return value;
    }

    function showToast(message, type = "info") {
      if (!toast) {
        console.log(message);
        return;
      }
      toast.textContent = message;
      toast.classList.remove("show", "toast--error", "toast--success", "toast--warn");
      if (type === "error") toast.classList.add("toast--error");
      else if (type === "success") toast.classList.add("toast--success");
      else if (type === "warn") toast.classList.add("toast--warn");
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 2200);
    }

    function resolveErrorMessage(error) {
      if (!error) return "Không thể tải dữ liệu từ máy chủ.";
      if (error.data) {
        if (typeof error.data === "string") return error.data;
        if (error.data.detail) return String(error.data.detail);
        if (error.data.message) return String(error.data.message);
      }
      if (error.message) return String(error.message);
      return "Không thể tải dữ liệu từ máy chủ.";
    }
  };

  pageHandlers['vanbandi'] = function () {
    const api = window.ApiClient;
    if (!api) {
      console.warn("[vanthu] ApiClient không sẵn sàng; bỏ qua tải văn bản đi.");
      return;
    }

    const layout = window.Layout || {};
    const listEl = document.getElementById("outbox-list");
    if (!listEl) {
      return;
    }

    const countEl = document.getElementById("total-count");
    const statusButton = document.getElementById("btn-status");
    const statusMenu = document.getElementById("menu-status");
    const statusLabel = document.getElementById("status-label");
    const levelButton = document.getElementById("btn-level");
    const levelMenu = document.getElementById("menu-level");
    const levelLabel = document.getElementById("level-label");
    const searchInput = document.getElementById("search-outbox");
    const composeBtn = document.getElementById("btn-compose");
    const toast = document.getElementById("toast");

    const kpi = {
      draft: document.getElementById("kpi-soanthao"),
      pending: document.getElementById("kpi-choky"),
      approved: document.getElementById("kpi-dakyduyet"),
      published: document.getElementById("kpi-daphathanh"),
    };

    const state = { keyword: "", status: "all", level: "all" };
    let normalizedDocs = [];

    attachMenu(statusButton, statusMenu, statusLabel, (value) => {
      state.status = value;
      applyFilters();
    });

    attachMenu(levelButton, levelMenu, levelLabel, (value) => {
      state.level = value;
      applyFilters();
    });

    if (searchInput) {
      searchInput.addEventListener(
        "input",
        debounce((event) => {
          state.keyword = event.target.value || "";
          applyFilters();
        }, 200)
      );
    }

    if (composeBtn) {
      composeBtn.addEventListener("click", () => {
        showToast("Chức năng soạn văn bản đang được kết nối API.");
      });
    }

    const authReady = layout.authPromise && typeof layout.authPromise.then === "function"
      ? layout.authPromise
      : Promise.resolve();

    authReady
      .then(() => loadDocuments())
      .catch(() => {
        renderError("Không thể xác thực người dùng hiện tại.");
      });

    function loadDocuments() {
      renderLoading();
      return api
        .request("/api/v1/outbound-docs/?ordering=-created_at&page_size=50")
        .then((data) => {
          const docs = api.extractItems(data);
          normalizedDocs = docs.map(normalizeDoc);
          updateKPIs();
          applyFilters();
        })
        .catch((error) => {
          console.error("[vanthu] Lỗi tải văn bản đi:", error);
          renderError(resolveErrorMessage(error));
        });
    }

    function normalizeDoc(raw) {
      const statusRaw = String(raw?.status_name || raw?.status?.name || raw?.status?.code || "");
      const statusKey = mapStatusKey(statusRaw);
      const urgencyRaw = String(raw?.urgency?.name || raw?.urgency?.code || "");
      const urgencyKey = mapUrgencyKey(urgencyRaw);
      const issuedDate = raw?.issued_date || (raw?.created_at ? raw.created_at.slice(0, 10) : "");
      const number = raw?.outgoing_number || raw?.document_code || "";
      const signer = raw?.creator?.full_name || raw?.creator?.username || "";
      const recipients = raw?.department?.name || "";
      const searchValue = normalizeText([raw?.title, number, signer, recipients].join(" "));
      return {
        raw,
        statusKey,
        statusLabel: mapStatusLabel(statusKey, statusRaw),
        urgencyKey,
        urgencyLabel: mapUrgencyLabel(urgencyKey, urgencyRaw),
        issuedDate,
        number,
        signer,
        recipients,
        searchValue,
      };
    }

    function applyFilters() {
      if (!normalizedDocs.length) {
        renderList([]);
        if (countEl) countEl.textContent = "0";
        return;
      }
      const keyword = normalizeText(state.keyword);
      const filtered = normalizedDocs.filter((doc) => {
        if (state.status !== "all" && doc.statusKey !== state.status) {
          return false;
        }
        if (state.level !== "all" && doc.urgencyKey !== state.level) {
          return false;
        }
        if (keyword && !doc.searchValue.includes(keyword)) {
          return false;
        }
        return true;
      });
      renderList(filtered);
      if (countEl) {
        countEl.textContent = String(filtered.length);
      }
    }

    function renderList(list) {
      listEl.innerHTML = "";
      if (!list.length) {
        renderEmpty();
        return;
      }
      const fragment = document.createDocumentFragment();
      list.forEach((doc) => {
        fragment.appendChild(createItem(doc));
      });
      listEl.appendChild(fragment);
    }

    function createItem(doc) {
      const li = document.createElement("li");
      li.className = "bg-white border border-slate-200 rounded-xl";
      if (doc.statusKey) li.dataset.status = doc.statusKey;
      if (doc.urgencyKey) li.dataset.level = doc.urgencyKey;
      li.dataset.key = doc.searchValue;

      const statusClass = mapStatusClass(doc.statusKey);
      const urgencyClass = mapUrgencyClass(doc.urgencyKey);
      const detailHref = "vanbandi-detail.html?id=" + encodeURIComponent(doc.raw?.id ?? "");

      li.innerHTML = [
        '<div class="p-4">',
        '  <div class="flex items-start justify-between gap-4">',
        '    <div class="min-w-0">',
        '      <h4 class="text-[15px] font-semibold truncate">' + escapeHtml(doc.raw?.title || "Văn bản") + '</h4>',
        '      <div class="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-slate-600">',
        doc.number ? '        <span class="inline-flex items-center gap-1 text-slate-500">' + escapeHtml(doc.number) + '</span>' : '',
        doc.issuedDate ? '        <span class="inline-flex items-center gap-1 text-slate-500">' + escapeHtml(formatDate(doc.issuedDate)) + '</span>' : '',
        doc.signer ? '        <span class="inline-flex items-center gap-1 text-slate-500">' + escapeHtml(doc.signer) + '</span>' : '',
        doc.recipients ? '        <span class="inline-flex items-center gap-1 text-slate-500">' + escapeHtml(doc.recipients) + '</span>' : '',
        '      </div>',
        '      <div class="mt-2 flex flex-wrap items-center gap-2">',
        '        <span class="' + statusClass + '">' + escapeHtml(doc.statusLabel) + '</span>',
        doc.urgencyLabel ? '        <span class="' + urgencyClass + '">' + escapeHtml(doc.urgencyLabel) + '</span>' : '',
        '      </div>',
        '    </div>',
        '    <div class="shrink-0 flex items-center gap-2">',
        '      <a href="' + detailHref + '" class="btn-outline"><span>🔍</span> Chi tiết</a>',
        '    </div>',
        '  </div>',
        '</div>',
      ]
        .filter(Boolean)
        .join("\n");
      return li;
    }

    function renderLoading() {
      listEl.innerHTML = '<li class="bg-white border border-slate-200 rounded-xl p-4 text-[13px] text-slate-500">Đang tải dữ liệu...</li>';
    }

    function renderEmpty() {
      listEl.innerHTML = '<li class="bg-white border border-slate-200 rounded-xl p-4 text-[13px] text-slate-500">Không có văn bản phù hợp với bộ lọc.</li>';
    }

    function renderError(message) {
      listEl.innerHTML = '<li class="bg-white border border-rose-200 rounded-xl p-4 text-[13px] text-rose-600">' + escapeHtml(message) + '</li>';
      showToast(message);
    }

    function showToast(message) {
      if (!toast) return;
      toast.textContent = message;
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 2200);
    }

    function updateKPIs() {
      const counts = { draft: 0, pending: 0, approved: 0, published: 0 };
      normalizedDocs.forEach((doc) => {
        counts[doc.statusKey] = (counts[doc.statusKey] || 0) + 1;
      });
      if (kpi.draft) kpi.draft.textContent = String(counts.draft || 0);
      if (kpi.pending) kpi.pending.textContent = String(counts['pending-sign'] || 0);
      if (kpi.approved) kpi.approved.textContent = String(counts.approved || 0);
      if (kpi.published) kpi.published.textContent = String(counts.published || 0);
      if (countEl) countEl.textContent = String(normalizedDocs.length);
    }

    function attachMenu(button, menu, label, onSelect) {
      if (!button || !menu || !label) {
        return;
      }
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        menu.classList.toggle("hidden");
        button.setAttribute("aria-expanded", menu.classList.contains("hidden") ? "false" : "true");
      });
      menu.addEventListener("click", (event) => {
        const target = event.target.closest(".menu-item");
        if (!target) return;
        const value = target.getAttribute("data-status") || target.getAttribute("data-level") || "all";
        label.textContent = target.textContent.trim();
        button.dataset.value = value;
        menu.classList.add("hidden");
        button.setAttribute("aria-expanded", "false");
        onSelect(value);
      });
      document.addEventListener("click", (event) => {
        if (menu.classList.contains("hidden")) return;
        if (!menu.contains(event.target) && event.target !== button) {
          menu.classList.add("hidden");
          button.setAttribute("aria-expanded", "false");
        }
      });
    }

    function mapStatusKey(raw) {
      const value = normalizeText(raw);
      if (!value) return "draft";
      if (/phat_hanh|publish|published/.test(value)) return "published";
      if (/duyet|approve|approved|ky_duyet|signed/.test(value)) return "approved";
      if (/cho_ky|pending|submit|waiting|trinh/.test(value)) return "pending-sign";
      return "draft";
    }

    function mapStatusLabel(key, fallback) {
      switch (key) {
        case "pending-sign":
          return "Chờ ký";
        case "approved":
          return "Đã ký duyệt";
        case "published":
          return "Đã phát hành";
        default:
          return fallback || "Soạn thảo";
      }
    }

    function mapStatusClass(key) {
      switch (key) {
        case "pending-sign":
          return "chip chip-warn";
        case "approved":
          return "chip chip-info";
        case "published":
          return "chip chip-success";
        default:
          return "chip chip-muted";
      }
    }

    function mapUrgencyKey(raw) {
      const value = normalizeText(raw);
      if (/rat_khan|very_urgent/.test(value)) return "ratkhan";
      if (/khan|urgent/.test(value)) return "khan";
      if (/cao|high/.test(value)) return "cao";
      return "thuong";
    }

    function mapUrgencyLabel(key, fallback) {
      switch (key) {
        case "ratkhan":
          return "Rất khẩn";
        case "khan":
          return "Khẩn";
        case "cao":
          return "Cao";
        case "thuong":
          return fallback || "Thường";
        default:
          return fallback || "";
      }
    }

    function mapUrgencyClass(key) {
      switch (key) {
        case "ratkhan":
        case "khan":
          return "chip chip-danger";
        case "cao":
          return "chip chip-info";
        default:
          return "chip chip-muted";
      }
    }

    function debounce(fn, delay) {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(null, args), delay);
      };
    }

    function normalizeText(value) {
      return (value || "")
        .toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
    }

    function escapeHtml(value) {
      return (value || "")
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function formatDate(value) {
      if (!value) return "";
      const parts = value.split("-");
      if (parts.length === 3) {
        return parts[2] + "/" + parts[1] + "/" + parts[0];
      }
      return value;
    }

    function resolveErrorMessage(error) {
      if (!error) return "Không thể tải dữ liệu từ máy chủ.";
      if (error.data) {
        if (typeof error.data === "string") return error.data;
        if (error.data.detail) return String(error.data.detail);
        if (error.data.message) return String(error.data.message);
      }
      if (error.message) return String(error.message);
      return "Không thể tải dữ liệu từ máy chủ.";
    }
  };

  pageHandlers["sodangky"] = function () {
    const qs = (sel, root = document) => root.querySelector(sel);
    const api = window.ApiClient;
    if (!api) {
      console.warn("[vanthu] ApiClient không sẵn sàng; bỏ qua trang sổ đăng ký.");
      return;
    }

    const role = (document.body?.dataset?.role || "").toLowerCase();
    const canManage = role === "vanthu" || role === "quantri";
    const toastEl = qs("#toast");

    const filterYear = qs("#register-filter-year");
    const filterDirection = qs("#register-filter-direction");
    const filterStatus = qs("#register-filter-status");
    const filterDept = qs("#register-filter-dept");
    const filterApplyBtn = qs("#register-filter-apply");
    const filterResetBtn = qs("#register-filter-reset");

    const registerBody = qs("#register-table-body");
    const registerSummary = qs("#register-summary");
    const registerPagination = qs("#register-pagination");
    const registerPrev = qs("#register-prev");
    const registerNext = qs("#register-next");
    const registerOpenBtn = qs("#btn-open-register-form");
    const registerFormPanel = qs("#register-form-panel");
    const registerForm = qs("#register-form");
    const registerFormFeedback = qs("#register-form-feedback");
    const registerFormClose = qs("#register-form-close");
    const registerFormReset = qs("#register-form-reset");
    const importBtn = qs("#btn-import-register");
    const exportBtn = qs("#btn-export-register");

    const numberingBody = qs("#numbering-table-body");
    const numberingOpenBtn = qs("#btn-open-numbering-form");
    const numberingPanel = qs("#numbering-form-panel");
    const numberingForm = qs("#numbering-form");
    const numberingFeedback = qs("#numbering-form-feedback");
    const numberingCloseBtn = qs("#numbering-form-close");
    const numberingResetBtn = qs("#numbering-form-reset");

    const state = {
      registers: {
        items: [],
        loading: false,
        page: 1,
        pageSize: 20,
        totalPages: 1,
        count: 0,
        filters: {
          year: "",
          direction: "",
          status: "",
          dept: "",
        },
      },
      numbering: {
        items: [],
        loading: false,
      },
    };

    const resetLabels = {
      yearly: "Hằng năm",
      quarterly: "Theo quý",
      monthly: "Hằng tháng",
      never: "Không reset",
    };

    const directionLabels = {
      den: "Văn bản đến",
      di: "Văn bản đi",
      incoming: "Văn bản đến",
      outgoing: "Văn bản đi",
    };

    function toast(message, type = "info") {
      if (!toastEl) {
        console.log(message);
        return;
      }
      toastEl.textContent = message;
      toastEl.classList.remove("toast--show", "toast--error", "toast--success", "toast--warn");
      if (type === "error") toastEl.classList.add("toast--error");
      else if (type === "success") toastEl.classList.add("toast--success");
      else if (type === "warn") toastEl.classList.add("toast--warn");
      toastEl.classList.add("toast--show");
      setTimeout(() => toastEl.classList.remove("toast--show"), 2200);
    }

    function escapeHtml(value) {
      return (value || "")
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function resolveErrorMessage(error) {
      if (!error) return "Không thể thực hiện thao tác.";
      if (error.data) {
        if (typeof error.data === "string") return error.data;
        if (error.data.detail) return String(error.data.detail);
        const first = Object.keys(error.data)[0];
        if (first && Array.isArray(error.data[first]) && error.data[first].length) {
          return String(error.data[first][0]);
        }
      }
      if (error.message) return String(error.message);
      return "Không thể thực hiện thao tác.";
    }

    // ===== Sổ đăng ký =====
    if (!canManage && registerOpenBtn) {
      registerOpenBtn.classList.add("hidden");
      registerOpenBtn.disabled = true;
    }
    if (!canManage && importBtn) {
      importBtn.disabled = true;
      importBtn.classList.add("opacity-60", "cursor-not-allowed");
    }

    function setRegisterLoading() {
      if (!registerBody) return;
      registerBody.innerHTML =
        '<tr><td colspan="8" class="px-4 py-6 text-center text-slate-400 text-sm">Đang tải dữ liệu...</td></tr>';
    }

    function updateRegisterPager() {
      const { page, totalPages, count } = state.registers;
      if (registerSummary) {
        registerSummary.textContent =
          count > 0 ? `${count} sổ theo bộ lọc hiện tại` : "Chưa có dữ liệu phù hợp.";
      }
      if (registerPagination) {
        registerPagination.textContent =
          count > 0 ? `Trang ${page}/${totalPages}` : "Không có dữ liệu.";
      }
      if (registerPrev) {
        registerPrev.disabled = page <= 1;
        registerPrev.classList.toggle("opacity-50", registerPrev.disabled);
      }
      if (registerNext) {
        registerNext.disabled = page >= totalPages;
        registerNext.classList.toggle("opacity-50", registerNext.disabled);
      }
    }

    function renderRegisters() {
      if (!registerBody) return;
      const deptKeyword = (state.registers.filters.dept || "").trim().toLowerCase();
      let items = state.registers.items || [];
      if (deptKeyword) {
        items = items.filter((item) => {
          const name = (item.department?.name || "").toLowerCase();
          return name.includes(deptKeyword);
        });
      }
      if (!items.length) {
        registerBody.innerHTML =
          '<tr><td colspan="8" class="px-4 py-6 text-center text-slate-400 text-sm">Không có sổ đăng ký nào.</td></tr>';
        updateRegisterPager();
        return;
      }
      registerBody.innerHTML = items
        .map((item) => {
          const id = item.register_id;
          const status = item.is_active ? "Đang hoạt động" : "Đã khóa";
          const statusClass = item.is_active ? "text-emerald-600" : "text-slate-500";
          const actionLabel = item.is_active ? "Khoá" : "Mở";
          const prefix = item.prefix || "—";
          const suffix = item.suffix || "—";
          const nextSequence = item.next_sequence ?? 0;
          const reset = resetLabels[item.reset_policy] || item.reset_policy || "—";
          const direction = directionLabels[item.direction] || item.direction;
          const deptName = item.department?.name || "—";
          const actionButtons = canManage
            ? `<div class="flex items-center justify-end gap-2">
                <button data-register-action="edit" data-id="${id}" class="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">Sửa</button>
                <button data-register-action="toggle" data-id="${id}" class="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">${actionLabel}</button>
              </div>`
            : '<span class="text-xs text-slate-400">Chỉ xem</span>';

          return `<tr>
            <td class="px-4 py-3">
              <div class="font-medium text-slate-900">${escapeHtml(item.name)}</div>
              <div class="text-xs text-slate-400">ID: ${id}</div>
            </td>
            <td class="px-4 py-3">${escapeHtml(direction)}</td>
            <td class="px-4 py-3">${item.year || "—"}</td>
            <td class="px-4 py-3">
              <div class="text-sm">Prefix: <span class="font-medium">${escapeHtml(prefix)}</span></div>
              <div class="text-sm">Suffix: <span class="font-medium">${escapeHtml(suffix)}</span></div>
              <div class="text-xs text-slate-400">Độ dài: ${item.padding || 0}</div>
            </td>
            <td class="px-4 py-3">${nextSequence}</td>
            <td class="px-4 py-3">${escapeHtml(reset)}</td>
            <td class="px-4 py-3">
              <span class="${statusClass} font-medium">${status}</span>
              <div class="text-xs text-slate-400">${escapeHtml(deptName)}</div>
            </td>
            <td class="px-4 py-3 text-right">${actionButtons}</td>
          </tr>`;
        })
        .join("");
      updateRegisterPager();
    }

    async function loadRegisters({ resetPage = false } = {}) {
      if (state.registers.loading) return;
      if (resetPage) state.registers.page = 1;
      state.registers.loading = true;
      setRegisterLoading();
      try {
        const params = {
          page: state.registers.page,
          page_size: state.registers.pageSize,
        };
        if (state.registers.filters.direction) params.direction = state.registers.filters.direction;
        if (state.registers.filters.year) params.year = state.registers.filters.year;
        if (state.registers.filters.status === "active") params.is_active = true;
        if (state.registers.filters.status === "inactive") params.is_active = false;
        const data = await api.registerBooks.list(params);
        const results = api.extractItems(data);
        state.registers.items = results;
        const meta = api.extractPageMeta(data);
        state.registers.count = meta.totalItems;
        state.registers.page = meta.page;
        state.registers.pageSize = meta.pageSize;
        state.registers.totalPages = meta.totalPages;
        renderRegisters();
      } catch (error) {
        console.error("[vanthu] loadRegisters error", error);
        if (registerBody) {
          registerBody.innerHTML = `<tr><td colspan="8" class="px-4 py-6 text-center text-rose-500 text-sm">${escapeHtml(
            resolveErrorMessage(error)
          )}</td></tr>`;
        }
        updateRegisterPager();
      } finally {
        state.registers.loading = false;
      }
    }

    function getRegisterPayload() {
      const id = qs("#register-id")?.value?.trim() || "";
      const name = qs("#register-name")?.value?.trim() || "";
      const direction = qs("#register-direction")?.value || "den";
      const year = Number(qs("#register-year")?.value || 0);
      const prefix = qs("#register-prefix")?.value?.trim() || null;
      const suffix = qs("#register-suffix")?.value?.trim() || null;
      const padding = Number(qs("#register-padding")?.value || 4);
      const resetPolicy = qs("#register-reset")?.value || "yearly";
      const description = qs("#register-description")?.value?.trim() || null;
      const isActive = !!qs("#register-active")?.checked;

      return {
        id,
        payload: {
          name,
          direction,
          year,
          prefix,
          suffix,
          padding,
          reset_policy: resetPolicy,
          description,
          is_active: isActive,
        },
      };
    }

    function fillRegisterForm(item) {
      qs("#register-id").value = item?.register_id || "";
      qs("#register-name").value = item?.name || "";
      qs("#register-direction").value = item?.direction || "den";
      qs("#register-year").value = item?.year || new Date().getFullYear();
      qs("#register-prefix").value = item?.prefix || "";
      qs("#register-suffix").value = item?.suffix || "";
      qs("#register-padding").value = item?.padding || 4;
      qs("#register-reset").value = item?.reset_policy || "yearly";
      qs("#register-description").value = item?.description || "";
      qs("#register-active").checked = item?.is_active ?? true;
      if (registerFormFeedback) registerFormFeedback.textContent = "";
    }

    function openRegisterForm(item = null) {
      if (!registerFormPanel) return;
      fillRegisterForm(item);
      registerFormPanel.classList.remove("hidden");
      registerFormPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function closeRegisterForm() {
      if (registerFormPanel) registerFormPanel.classList.add("hidden");
      if (registerForm) registerForm.reset();
      qs("#register-id").value = "";
      if (registerFormFeedback) registerFormFeedback.textContent = "";
    }

    async function submitRegisterForm(event) {
      event.preventDefault();
      if (!canManage) {
        toast("Bạn không có quyền chỉnh sửa sổ đăng ký.", "error");
        return;
      }
      const { id, payload } = getRegisterPayload();
      if (!payload.name) {
        registerFormFeedback.textContent = "Vui lòng nhập tên sổ.";
        return;
      }
      if (!payload.year || payload.year < 2010) {
        registerFormFeedback.textContent = "Năm áp dụng không hợp lệ.";
        return;
      }
      try {
        if (id) {
          await api.registerBooks.update(id, payload);
          toast("Đã cập nhật sổ đăng ký.", "success");
        } else {
          await api.registerBooks.create(payload);
          toast("Đã tạo sổ đăng ký.", "success");
        }
        closeRegisterForm();
        await loadRegisters({ resetPage: !id });
      } catch (error) {
        console.error("[vanthu] submitRegisterForm error", error);
        registerFormFeedback.textContent = resolveErrorMessage(error);
      }
    }

    async function toggleRegister(id) {
      if (!canManage) {
        toast("Bạn không có quyền thao tác.", "error");
        return;
      }
      const target = state.registers.items.find((item) => item.register_id === Number(id));
      if (!target) {
        toast("Không tìm thấy sổ đăng ký.", "error");
        return;
      }
      try {
        await api.registerBooks.update(id, { is_active: !target.is_active });
        toast(target.is_active ? "Đã khoá sổ đăng ký." : "Đã mở sổ đăng ký.", "success");
        await loadRegisters();
      } catch (error) {
        console.error("[vanthu] toggleRegister error", error);
        toast(resolveErrorMessage(error), "error");
      }
    }

    if (registerOpenBtn) {
      registerOpenBtn.addEventListener("click", () => {
        if (!canManage) {
          toast("Bạn không có quyền tạo sổ mới.", "error");
          return;
        }
        openRegisterForm({
          year: new Date().getFullYear(),
          direction: "den",
          padding: 4,
          reset_policy: "yearly",
          is_active: true,
        });
      });
    }
    if (registerForm) registerForm.addEventListener("submit", submitRegisterForm);
    if (registerFormClose) registerFormClose.addEventListener("click", () => closeRegisterForm());
    if (registerFormReset)
      registerFormReset.addEventListener("click", () => {
        if (registerForm) registerForm.reset();
        qs("#register-id").value = "";
        registerFormFeedback.textContent = "";
      });

    if (registerPrev)
      registerPrev.addEventListener("click", () => {
        if (state.registers.page <= 1) return;
        state.registers.page -= 1;
        loadRegisters();
      });
    if (registerNext)
      registerNext.addEventListener("click", () => {
        if (state.registers.page >= state.registers.totalPages) return;
        state.registers.page += 1;
        loadRegisters();
      });

    if (filterApplyBtn)
      filterApplyBtn.addEventListener("click", () => {
        state.registers.filters.year = (filterYear?.value || "").trim();
        state.registers.filters.direction = filterDirection?.value || "";
        state.registers.filters.status = filterStatus?.value || "";
        state.registers.filters.dept = (filterDept?.value || "").trim();
        loadRegisters({ resetPage: true });
      });
    if (filterResetBtn)
      filterResetBtn.addEventListener("click", () => {
        if (filterYear) filterYear.value = "";
        if (filterDirection) filterDirection.value = "";
        if (filterStatus) filterStatus.value = "";
        if (filterDept) filterDept.value = "";
        state.registers.filters = { year: "", direction: "", status: "", dept: "" };
        loadRegisters({ resetPage: true });
      });

    if (registerBody) {
      registerBody.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-register-action]");
        if (!btn) return;
        const id = btn.dataset.id;
        if (!id) return;
        if (btn.dataset.registerAction === "edit") {
          if (!canManage) {
            toast("Bạn không có quyền chỉnh sửa.", "error");
            return;
          }
          const item = state.registers.items.find((x) => x.register_id === Number(id));
          if (item) openRegisterForm(item);
        }
        if (btn.dataset.registerAction === "toggle") {
          toggleRegister(id);
        }
      });
    }

    if (importBtn) {
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".xlsx,.xls,.csv,.json";
      fileInput.style.display = "none";
      document.body.appendChild(fileInput);

      importBtn.addEventListener("click", () => {
        if (!canManage) {
          toast("Bạn không có quyền nhập sổ.", "error");
          return;
        }
        const registerId = window.prompt(
          "Nhập ID sổ cần nhập (register_id):",
          String(state.registers.items[0]?.register_id || "")
        );
        if (!registerId) return;
        fileInput.dataset.registerId = registerId;
        fileInput.value = "";
        fileInput.click();
      });

      fileInput.addEventListener("change", async () => {
        const registerId = fileInput.dataset.registerId;
        const file = fileInput.files?.[0];
        if (!registerId || !file) return;
        try {
          const formData = new FormData();
          formData.append("register_id", registerId);
          formData.append("file", file);
          await api.registerBooks.import(formData);
          toast("Đã gửi yêu cầu nhập sổ.", "success");
        } catch (error) {
          console.error("[vanthu] import register error", error);
          toast(resolveErrorMessage(error), "error");
        }
      });
    }

    if (exportBtn) {
      exportBtn.addEventListener("click", async () => {
        const registerId = window.prompt(
          "Nhập ID sổ cần xuất (để trống để xuất theo bộ lọc hiện tại):",
          ""
        );
        const params = {};
        if (registerId) params.register_id = registerId;
        if (state.registers.filters.year) params.year = state.registers.filters.year;
        if (state.registers.filters.direction) params.direction = state.registers.filters.direction;
        if (state.registers.filters.status === "active") params.is_active = true;
        if (state.registers.filters.status === "inactive") params.is_active = false;
        try {
          const data = await api.registerBooks.export(params);
          toast("Đã tạo bản xuất. Vui lòng tải xuống từ liên kết được cấp.", "success");
          if (data?.download_url) {
            const url = data.download_url.startsWith("http")
              ? data.download_url
              : api.buildUrl(data.download_url, null);
            window.open(url, "_blank");
          }
        } catch (error) {
          console.error("[vanthu] export register error", error);
          toast(resolveErrorMessage(error), "error");
        }
      });
    }

    // ===== Quy tắc đánh số =====
    function openNumberingForm(item = null) {
      if (!numberingPanel) return;
      qs("#numbering-id").value = item?.rule_id || "";
      qs("#numbering-code").value = item?.code || "";
      qs("#numbering-name").value = item?.name || "";
      qs("#numbering-target").value = item?.target || "outgoing";
      qs("#numbering-prefix").value = item?.prefix || "";
      qs("#numbering-suffix").value = item?.suffix || "";
      qs("#numbering-padding").value = item?.padding || 4;
      qs("#numbering-start").value = item?.start_sequence || 1;
      qs("#numbering-reset").value = item?.reset_policy || "yearly";
      qs("#numbering-description").value = item?.description || "";
      qs("#numbering-active").checked = item?.is_active ?? true;
      if (numberingFeedback) numberingFeedback.textContent = "";
      numberingPanel.classList.remove("hidden");
      numberingPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function closeNumberingForm() {
      if (!numberingPanel) return;
      numberingPanel.classList.add("hidden");
      if (numberingForm) numberingForm.reset();
      qs("#numbering-id").value = "";
      numberingFeedback.textContent = "";
    }

    function renderNumbering() {
      if (!numberingBody) return;
      const items = state.numbering.items || [];
      if (!items.length) {
        numberingBody.innerHTML =
          '<tr><td colspan="9" class="px-4 py-6 text-center text-slate-400 text-sm">Chưa có quy tắc đánh số.</td></tr>';
        return;
      }
      numberingBody.innerHTML = items
        .map((item) => {
          const id = item.rule_id;
          const status = item.is_active ? "Kích hoạt" : "Đã khóa";
          const statusClass = item.is_active ? "text-emerald-600" : "text-slate-500";
          const toggleLabel = item.is_active ? "Khoá" : "Mở";
          const prefix = item.prefix || "—";
          const suffix = item.suffix || "—";
          const nextValue = item.next_sequence ?? item.start_sequence ?? 0;
          const reset = resetLabels[item.reset_policy] || item.reset_policy || "—";
          const target = directionLabels[item.target] || item.target;
          const actions = canManage
            ? `<div class="flex items-center justify-end gap-2">
                <button data-numbering-action="edit" data-id="${id}" class="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">Sửa</button>
                <button data-numbering-action="toggle" data-id="${id}" class="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">${toggleLabel}</button>
                <button data-numbering-action="delete" data-id="${id}" class="rounded border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50">Xoá</button>
              </div>`
            : '<span class="text-xs text-slate-400">Chỉ xem</span>';
          return `<tr>
            <td class="px-4 py-3">
              <div class="font-medium text-slate-900">${escapeHtml(item.code)}</div>
              <div class="text-xs text-slate-400">ID: ${id}</div>
            </td>
            <td class="px-4 py-3">${escapeHtml(item.name)}</td>
            <td class="px-4 py-3">${escapeHtml(target)}</td>
            <td class="px-4 py-3">
              <div class="text-sm">Prefix: <span class="font-medium">${escapeHtml(prefix)}</span></div>
              <div class="text-sm">Suffix: <span class="font-medium">${escapeHtml(suffix)}</span></div>
            </td>
            <td class="px-4 py-3">${escapeHtml(reset)}</td>
            <td class="px-4 py-3">${nextValue}</td>
            <td class="px-4 py-3"><span class="${statusClass} font-medium">${status}</span></td>
            <td class="px-4 py-3 text-right">${actions}</td>
          </tr>`;
        })
        .join("");
    }

    async function loadNumbering() {
      if (state.numbering.loading) return;
      state.numbering.loading = true;
      if (numberingBody) {
        numberingBody.innerHTML =
          '<tr><td colspan="9" class="px-4 py-6 text-center text-slate-400 text-sm">Đang tải dữ liệu...</td></tr>';
      }
      try {
        const data = await api.numberingRules.list({ page_size: 100 });
        state.numbering.items = api.extractItems(data);
        renderNumbering();
      } catch (error) {
        console.error("[vanthu] loadNumbering error", error);
        if (numberingBody) {
          numberingBody.innerHTML = `<tr><td colspan="9" class="px-4 py-6 text-center text-rose-500 text-sm">${escapeHtml(
            resolveErrorMessage(error)
          )}</td></tr>`;
        }
      } finally {
        state.numbering.loading = false;
      }
    }

    async function submitNumbering(event) {
      event.preventDefault();
      if (!canManage) {
        toast("Bạn không có quyền chỉnh sửa quy tắc.", "error");
        return;
      }
      const id = qs("#numbering-id")?.value?.trim();
      const payload = {
        code: qs("#numbering-code")?.value?.trim() || "",
        name: qs("#numbering-name")?.value?.trim() || "",
        target: qs("#numbering-target")?.value || "outgoing",
        prefix: qs("#numbering-prefix")?.value?.trim() || null,
        suffix: qs("#numbering-suffix")?.value?.trim() || null,
        padding: Number(qs("#numbering-padding")?.value || 4),
        start_sequence: Number(qs("#numbering-start")?.value || 1),
        reset_policy: qs("#numbering-reset")?.value || "yearly",
        description: qs("#numbering-description")?.value?.trim() || null,
        is_active: !!qs("#numbering-active")?.checked,
      };
      if (!payload.code || !payload.name) {
        numberingFeedback.textContent = "Vui lòng nhập đầy đủ mã và tên quy tắc.";
        return;
      }
      try {
        if (id) {
          await api.numberingRules.update(id, payload);
          toast("Đã cập nhật quy tắc đánh số.", "success");
        } else {
          payload.next_sequence = payload.start_sequence;
          await api.numberingRules.create(payload);
          toast("Đã tạo quy tắc đánh số.", "success");
        }
        closeNumberingForm();
        await loadNumbering();
      } catch (error) {
        console.error("[vanthu] submitNumbering error", error);
        numberingFeedback.textContent = resolveErrorMessage(error);
      }
    }

    async function toggleNumbering(id) {
      if (!canManage) {
        toast("Bạn không có quyền thao tác.", "error");
        return;
      }
      const item = state.numbering.items.find((x) => x.rule_id === Number(id));
      if (!item) {
        toast("Không tìm thấy quy tắc.", "error");
        return;
      }
      try {
        await api.numberingRules.update(id, { is_active: !item.is_active });
        toast(item.is_active ? "Đã khoá quy tắc." : "Đã kích hoạt quy tắc.", "success");
        await loadNumbering();
      } catch (error) {
        console.error("[vanthu] toggleNumbering error", error);
        toast(resolveErrorMessage(error), "error");
      }
    }

    async function deleteNumbering(id) {
      if (!canManage) {
        toast("Bạn không có quyền xoá.", "error");
        return;
      }
      if (!window.confirm("Bạn chắc chắn muốn xoá quy tắc này?")) return;
      try {
        await api.numberingRules.remove(id);
        toast("Đã xoá quy tắc đánh số.", "success");
        await loadNumbering();
      } catch (error) {
        console.error("[vanthu] deleteNumbering error", error);
        toast(resolveErrorMessage(error), "error");
      }
    }

    if (numberingOpenBtn) {
      numberingOpenBtn.addEventListener("click", () => {
        if (!canManage) {
          toast("Bạn không có quyền tạo quy tắc.", "error");
          return;
        }
        openNumberingForm({
          target: "outgoing",
          padding: 4,
          start_sequence: 1,
          reset_policy: "yearly",
          is_active: true,
        });
      });
    }
    if (numberingForm) numberingForm.addEventListener("submit", submitNumbering);
    if (numberingCloseBtn) numberingCloseBtn.addEventListener("click", () => closeNumberingForm());
    if (numberingResetBtn)
      numberingResetBtn.addEventListener("click", () => {
        if (numberingForm) numberingForm.reset();
        qs("#numbering-id").value = "";
        numberingFeedback.textContent = "";
      });

    if (numberingBody) {
      numberingBody.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-numbering-action]");
        if (!btn) return;
        const id = btn.dataset.id;
        if (!id) return;
        if (btn.dataset.numberingAction === "edit") {
          if (!canManage) {
            toast("Bạn không có quyền chỉnh sửa.", "error");
            return;
          }
          const item = state.numbering.items.find((x) => x.rule_id === Number(id));
          if (item) openNumberingForm(item);
        }
        if (btn.dataset.numberingAction === "toggle") {
          toggleNumbering(id);
        }
        if (btn.dataset.numberingAction === "delete") {
          deleteNumbering(id);
        }
      });
    }

    loadRegisters({ resetPage: true });
    loadNumbering();
  };


})();

