/* ============================================================
   lanhdao.js
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
      if (normalized === 'dashboard-lanhdao') return 'dashboard';
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
    const $ = (s, r = document) => r.querySelector(s);

            // ===== Bar: văn bản theo tháng =====
            const barCtx = $("#barDocs");
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

            // ===== Pie: phân bố trạng thái công việc =====
            const pieCtx = $("#pieTasks");
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

            // ===== Line: xu hướng hiệu suất =====
            const lineCtx = $("#linePerf");
            new Chart(lineCtx, {
              type: "line",
              data: {
                labels: [
                  "Tuần 1",
                  "Tuần 2",
                  "Tuần 3",
                  "Tuần 4",
                  "Tuần 5",
                  "Tuần 6",
                ],
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
  };

  pageHandlers['danhmuc'] = function () {
    const $ = (s, r = document) => r.querySelector(s);
            const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

            // Switch tabs
            const pills = $$("[data-tab]");
            const panels = $$("[data-panel]");

            function show(tab) {
              panels.forEach((p) =>
                p.classList.toggle("hidden", p.dataset.panel !== tab)
              );
              pills.forEach((b) => {
                const active = b.dataset.tab === tab;
                b.classList.toggle("bg-slate-900", active);
                b.classList.toggle("text-white", active);
              });
              // reset search filter when switching panel
              applySearch();
            }

            pills.forEach((b) =>
              b.addEventListener("click", () => show(b.dataset.tab))
            );
            show("loai"); // default

            // Quick search over visible panel
            const q = $("#dm-search");
            function applySearch() {
              const kw = (q.value || "").toLowerCase().trim();
              const visible = panels.find((p) => !p.classList.contains("hidden"));
              if (!visible) return;
              $$("tbody tr", visible).forEach((tr) => {
                const text = tr.innerText.toLowerCase();
                tr.style.display = !kw || text.includes(kw) ? "" : "none";
              });
            }

            // debounce helper
            function debounce(fn, delay = 150) {
              let t;
              return (...args) => {
                clearTimeout(t);
                t = setTimeout(() => fn.apply(null, args), delay);
              };
            }

            q.addEventListener("input", debounce(applySearch, 120));
            // initial filter (shows all)
            applySearch();
  };

  pageHandlers['dashboard'] = function () {
    // Tính % tiến độ từ KPI Done/Total
            const done = Number(
              document.getElementById("kpiDone")?.textContent || 0
            );
            const total = Number(
              document.getElementById("kpiTotal")?.textContent || 1
            );
            const rate = Math.round((done / total) * 100);

            const rateEl = document.getElementById("kpiRate");
            const bar = document.getElementById("unitProgressBar");
            const unitDone = document.getElementById("unitDone");
            const unitTotal = document.getElementById("unitTotal");

            if (rateEl) rateEl.textContent = rate + "%";
            if (bar) bar.style.width = rate + "%";
            if (unitDone) unitDone.textContent = done;
            if (unitTotal) unitTotal.textContent = total;

            // Điều hướng nhanh tới danh sách văn bản cần duyệt (văn bản đi)
            const btnAll = document.getElementById("btnViewAllApprove");
            if (btnAll) {
              btnAll.addEventListener("click", () => {
                // Tùy routing thực tế; tạm thời trỏ về văn bản đi
                window.location.href = "vanbandi.html";
              });
            }
  };

  pageHandlers['hosocongviec-taomoi'] = function () {
    const $ = (s, r = document) => r.querySelector(s);
          const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

          // Sidebar toggle (mobile)
          (function setupSidebarToggle() {
            const sidebar = $("#sidebar");
            const btnSidebar = $("#btnSidebar") || $("#btn-sidebar");
            if (!sidebar || !btnSidebar) return;
            btnSidebar.addEventListener("click", () => {
              const open = sidebar.classList.toggle("is-open");
              sidebar.classList.toggle("hidden", !open);
              btnSidebar.setAttribute("aria-expanded", String(open));
            });
          })();

          // Defaults
          (function preset() {
            const today = new Date();
            const isoDate = (d) => d.toISOString().slice(0, 10);
            $("#caseCreatedAt").value = isoDate(today);
            $("#caseLeader").value = "Trần Thị Bình"; // mặc định theo tài khoản lãnh đạo
          })();

          // Members
          const memberTbody = $("#memberTable tbody");
          function renderMemberRow({ name, role, unit, join }, idx) {
            const tr = document.createElement("tr");
            tr.innerHTML = `
              <td class="px-5 py-3">${
                name || "-"
              }<div class="text-[12px] text-slate-500">${unit ? "" : ""}</div></td>
              <td class="px-5 py-3"><span class="chip ${
                role === "Chủ trì"
                  ? "chip--blue"
                  : role === "Người được giao"
                  ? "chip--green"
                  : "chip--default"
              }">${role}</span></td>
              <td class="px-5 py-3">${unit || "-"}</td>
              <td class="px-5 py-3">${join || "-"}</td>
              <td class="px-5 py-3 text-right">
                <button type="button" class="text-[13px] text-rose-600 hover:underline" data-remove-member="${idx}">Xoá</button>
              </td>
            `;
            return tr;
          }
          const members = [];

          // Add default leader as member (Chủ trì)
          (function addDefaultLeader() {
            const today = new Date().toISOString().slice(0, 10);
            members.push({
              name: "Trần Thị Bình",
              role: "Chủ trì",
              unit: "Văn phòng Chủ tịch",
              join: today,
            });
            syncMembers();
          })();

          function syncMembers() {
            memberTbody.innerHTML = "";
            members.forEach((m, i) =>
              memberTbody.appendChild(renderMemberRow(m, i))
            );
          }

          $("#btnAddMember").addEventListener("click", () => {
            const name = $("#memName").value.trim();
            const role = $("#memRole").value;
            const unit = $("#memUnit").value.trim();
            const join = $("#memJoin").value;
            if (!name)
              return showToast("Vui lòng nhập Họ tên thành viên.", "error");
            members.push({ name, role, unit, join });
            $("#memName").value = "";
            $("#memUnit").value = "";
            $("#memJoin").value = "";
            syncMembers();
            showToast("Đã thêm thành viên.");
          });

          memberTbody.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-remove-member]");
            if (!btn) return;
            const idx = +btn.dataset.removeMember;
            members.splice(idx, 1);
            syncMembers();
            showToast("Đã xoá thành viên.");
          });

          // Tasks
          const tasks = [];
          function taskChip(status) {
            if (status === "Hoàn thành") return "chip chip--green";
            if (status === "Đang làm") return "chip chip--amber";
            return "chip chip--default";
          }
          function renderTaskItem(t, idx) {
            const li = document.createElement("li");
            li.className = "rounded-lg border border-slate-100 p-3";
            li.innerHTML = `
              <div class="flex items-center justify-between gap-2">
                <div>
                  <div class="font-medium text-slate-700">${t.title}</div>
                  <div class="text-[12px] text-slate-500">Phụ trách: ${
                    t.assignee || "-"
                  } • Hạn: ${t.due || "-"}</div>
                </div>
                <div class="flex items-center gap-3">
                  <span class="${taskChip(t.status)}">${t.status}</span>
                  <button type="button" class="text-[13px] text-rose-600 hover:underline" data-remove-task="${idx}">Xoá</button>
                </div>
              </div>
            `;
            return li;
          }
          function syncTasks() {
            const list = $("#taskList");
            list.innerHTML = "";
            if (!tasks.length) {
              list.appendChild($("#taskEmpty").cloneNode(true));
              list.firstElementChild.id = "taskEmptyClone";
              updateKPI();
              return;
            }
            tasks.forEach((t, i) => list.appendChild(renderTaskItem(t, i)));
            updateKPI();
          }
          $("#btnAddTask").addEventListener("click", () => {
            const title = $("#taskTitle").value.trim();
            const assignee = $("#taskAssignee").value.trim();
            const due = $("#taskDue").value;
            const status = $("#taskStatus").value;
            if (!title) return showToast("Vui lòng nhập Tên nhiệm vụ.", "error");
            tasks.push({ title, assignee, due, status });
            $("#taskTitle").value = "";
            $("#taskAssignee").value = "";
            $("#taskDue").value = "";
            $("#taskStatus").value = "Chưa bắt đầu";
            syncTasks();
            showToast("Đã thêm nhiệm vụ.");
          });
          $("#taskList").addEventListener("click", (e) => {
            const btn = e.target.closest("[data-remove-task]");
            if (!btn) return;
            const idx = +btn.dataset.removeTask;
            tasks.splice(idx, 1);
            syncTasks();
            showToast("Đã xoá nhiệm vụ.");
          });

          // Logs
          const logs = [];
          function renderLogItem(l, idx) {
            const li = document.createElement("li");
            li.className = "rounded-lg border border-slate-100 p-3";
            li.innerHTML = `
              <div class="flex items-center justify-between">
                <span class="font-semibold text-slate-700">${
                  l.when || "—"
                } • NHẬT KÝ</span>
                <button type="button" class="text-[13px] text-rose-600 hover:underline" data-remove-log="${idx}">Xoá</button>
              </div>
              <p class="mt-1 text-[12.5px] text-slate-600">${l.content}</p>
            `;
            return li;
          }
          function syncLogs() {
            const list = $("#logList");
            list.innerHTML = "";
            if (!logs.length) {
              list.appendChild($("#logEmpty").cloneNode(true));
              list.firstElementChild.id = "logEmptyClone";
              return;
            }
            logs.forEach((l, i) => list.appendChild(renderLogItem(l, i)));
          }
          $("#btnAddLog").addEventListener("click", () => {
            const content = $("#logContent").value.trim();
            const when = $("#logWhen").value;
            if (!content)
              return showToast("Vui lòng nhập nội dung nhật ký.", "error");
            logs.push({ content, when });
            $("#logContent").value = "";
            $("#logWhen").value = "";
            syncLogs();
            showToast("Đã ghi nhật ký.");
          });
          $("#logList").addEventListener("click", (e) => {
            const btn = e.target.closest("[data-remove-log]");
            if (!btn) return;
            const idx = +btn.dataset.removeLog;
            logs.splice(idx, 1);
            syncLogs();
            showToast("Đã xoá nhật ký.");
          });

          // Files
          const files = [];
          $("#fileInput").addEventListener("change", (e) => {
            const list = Array.from(e.target.files || []);
            list.forEach((f) => files.push({ name: f.name, size: f.size }));
            syncFiles();
            e.target.value = "";
            showToast("Đã thêm tệp đính kèm.");
          });
          function renderFileItem(f, idx) {
            const li = document.createElement("li");
            li.className =
              "rounded-lg border border-slate-100 p-3 flex items-center justify-between gap-3";
            const sizeKB = Math.max(1, Math.round(f.size / 1024));
            li.innerHTML = `
              <div>
                <div class="font-medium text-slate-700">${f.name}</div>
                <div class="text-[12px] text-slate-500">${sizeKB} KB</div>
              </div>
              <div class="flex items-center gap-2">
                <button class="btn-icon" title="Tải xuống" aria-label="Tải xuống ${f.name}">⬇</button>
                <button class="text-[13px] text-rose-600 hover:underline" data-remove-file="${idx}">Xoá</button>
              </div>
            `;
            return li;
          }
          function syncFiles() {
            const list = $("#fileList");
            list.innerHTML = "";
            if (!files.length) {
              list.appendChild($("#fileEmpty").cloneNode(true));
              list.firstElementChild.id = "fileEmptyClone";
            } else {
              files.forEach((f, i) => list.appendChild(renderFileItem(f, i)));
            }
            updateKPI();
          }
          $("#fileList").addEventListener("click", (e) => {
            const btn = e.target.closest("[data-remove-file]");
            if (!btn) return;
            const idx = +btn.dataset.removeFile;
            files.splice(idx, 1);
            syncFiles();
            showToast("Đã xoá tệp.");
          });

          // Docs
          const docs = [];
          function renderDocItem(d, idx) {
            const li = document.createElement("li");
            li.className =
              "rounded-lg border border-slate-100 p-3 flex items-center justify-between gap-3";
            li.innerHTML = `
              <div>
                <div class="font-medium text-slate-700">${d.code || "—"} • ${
              d.type
            }</div>
                <div class="text-[12px] text-slate-500">Đã gắn vào hồ sơ</div>
              </div>
              <button class="text-[13px] text-rose-600 hover:underline" data-remove-doc="${idx}">Gỡ</button>
            `;
            return li;
          }
          function syncDocs() {
            const list = $("#docList");
            list.innerHTML = "";
            if (!docs.length) {
              list.appendChild($("#docEmpty").cloneNode(true));
              list.firstElementChild.id = "docEmptyClone";
            } else {
              docs.forEach((d, i) => list.appendChild(renderDocItem(d, i)));
            }
            updateKPI();
          }
          $("#btnAddDoc").addEventListener("click", () => {
            const code = $("#docCode").value.trim();
            const type = $("#docType").value;
            if (!code)
              return showToast("Vui lòng nhập Số/Ký hiệu văn bản.", "error");
            docs.push({ code, type });
            $("#docCode").value = "";
            syncDocs();
            showToast("Đã gắn văn bản.");
          });
          $("#docList").addEventListener("click", (e) => {
            const btn = e.target.closest("[data-remove-doc]");
            if (!btn) return;
            const idx = +btn.dataset.removeDoc;
            docs.splice(idx, 1);
            syncDocs();
            showToast("Đã gỡ văn bản.");
          });

          // KPI updater
          function updateKPI() {
            const total = tasks.length;
            const done = tasks.filter((t) => t.status === "Hoàn thành").length;
            const late = tasks.filter((t) => {
              if (!t.due || t.status === "Hoàn thành") return false;
              const d = new Date(t.due);
              const today = new Date();
              // so sánh theo ngày (bỏ giờ)
              d.setHours(0, 0, 0, 0);
              today.setHours(0, 0, 0, 0);
              return d < today;
            }).length;

            $("#kpiDone").textContent = `${done} / ${total}`;
            $("#kpiLate").textContent = late;
            $("#kpiDocs").textContent = docs.length;
            $("#kpiFiles").textContent = files.length;
          }

          // Toast
          function showToast(msg, type = "success") {
            const toast = $("#toast");
            if (!toast) {
              alert(msg);
              return;
            }
            toast.textContent = msg;
            toast.classList.remove("toast--error", "toast--show");
            if (type === "error") toast.classList.add("toast--error");
            setTimeout(() => toast.classList.add("toast--show"), 10);
            setTimeout(() => toast.classList.remove("toast--show"), 2400);
          }

          // Validate + submit
          function validateForm() {
            const title = $("#caseTitle").value.trim();
            const dept = $("#caseDept").value.trim();
            const due = $("#caseDue").value;
            const leader = $("#caseLeader").value.trim();
            if (!title) return { ok: false, msg: "Vui lòng nhập Tiêu đề hồ sơ." };
            if (!dept) return { ok: false, msg: "Vui lòng chọn Phòng phụ trách." };
            if (!due) return { ok: false, msg: "Vui lòng chọn Hạn hoàn thành." };
            if (!leader) return { ok: false, msg: "Vui lòng nhập Người chủ trì." };
            return { ok: true };
          }

          $("#btnSaveDraft").addEventListener("click", () => {
            const v = validateForm();
            if (!v.ok) return showToast(v.msg, "error");
            showToast("Đã lưu nháp hồ sơ.");
          });

          $("#btnCreateAssign").addEventListener("click", () => {
            const v = validateForm();
            if (!v.ok) return showToast(v.msg, "error");

            // (Giả lập) tạo hồ sơ + điều hướng / hoặc hiển thị thông báo
            showToast("Đã tạo hồ sơ & giao việc.");
            // Gợi ý: sau khi tạo thành công, có thể điều hướng:
            // window.location.href = "hosocongviec-detail.html";
          });

          // Đồng bộ KPI ban đầu
          syncMembers();
          syncTasks();
          syncLogs();
          syncFiles();
          syncDocs();

          // Nếu có nhập "Chuyên viên phụ trách", hỗ trợ thêm nhanh vào thành viên (Người được giao)
          $("#caseOwner").addEventListener("blur", (e) => {
            const name = e.target.value.trim();
            if (!name) return;
            const existed = members.some((m) => m.name === name);
            if (existed) return;
            const today = new Date().toISOString().slice(0, 10);
            members.push({
              name,
              role: "Người được giao",
              unit: $("#caseDept").value || "",
              join: today,
            });
            syncMembers();
          });
  };

  pageHandlers['hosocongviec'] = function () {
    // ---------- Dropdown helpers ----------
          function bindDropdown(btnId, menuId, labelId, stateKey) {
            const btn = document.getElementById(btnId);
            const menu = document.getElementById(menuId);
            const label = document.getElementById(labelId);

            function close() {
              menu?.classList.add("hidden");
              btn?.setAttribute("aria-expanded", "false");
            }
            function open() {
              menu?.classList.remove("hidden");
              btn?.setAttribute("aria-expanded", "true");
            }


  pageHandlers['vanbanden'] = function () {
    const api = window.ApiClient;
    const helpers = window.DocHelpers;
    if (!api || !helpers) {
      console.warn("[lanhdao] ApiClient hoặc DocHelpers chưa sẵn sàng; bỏ qua văn bản đến.");
      return;
    }

    const listContainer = document.getElementById('docList');
    const totalLabel = document.getElementById('totalDoc');
    const searchInput = document.getElementById('searchTitle');
    const statusButton = document.getElementById('btnStatusFilter');
    const statusMenu = document.getElementById('statusMenu');
    const statusLabel = document.getElementById('statusLabel');
    const levelButton = document.getElementById('btnLevelFilter');
    const levelMenu = document.getElementById('levelMenu');
    const levelLabel = document.getElementById('levelLabel');

    const kpiEls = {
      pending: document.getElementById('kpiPending'),
      approved: document.getElementById('kpiApproved'),
      processing: document.getElementById('kpiProcessing'),
      urgent: document.getElementById('kpiUrgent'),
    };

    if (!listContainer) {
      return;
    }

    const state = {
      keyword: '',
      status: 'all',
      level: 'all',
    };

    let docs = [];
    const debouncedApply = debounce(() => applyFilters(), 180);

    bindFilterDropdown(statusButton, statusMenu, statusLabel, 'status');
    bindFilterDropdown(levelButton, levelMenu, levelLabel, 'level');
    registerSearch(searchInput, 'keyword');

    const layout = window.Layout || {};
    const ready =
      layout.authPromise && typeof layout.authPromise.then === 'function'
        ? layout.authPromise
        : Promise.resolve();

    ready
      .then(loadDocuments)
      .catch(() => renderError('Không thể xác thực người dùng hiện tại.'));

    function loadDocuments() {
      renderLoading();
      return api
        .request('/api/v1/inbound-docs/?ordering=-created_at&page_size=50')
        .then((response) => {
          const payload = api.extractItems(response) || [];
          docs = payload.map((item) => helpers.normalizeInboundDoc(item));
          applyFilters();
        })
        .catch((error) => {
          const message = helpers.resolveErrorMessage(error);
          console.error('[lanhdao] Lỗi tải văn bản đến:', error);
          renderError(message);
        });
    }

    function applyFilters() {
      if (!Array.isArray(docs)) {
        renderEmpty();
        return;
      }
      const keyword = helpers.normalizeText(state.keyword || '');
      const filtered = docs.filter((doc) => {
        if (!doc) {
          return false;
        }
        if (state.status !== 'all' && mapStatusFilter(doc.statusKey) !== state.status) {
          return false;
        }
        if (state.level !== 'all' && mapLevelFilter(doc.urgencyKey) !== state.level) {
          return false;
        }
        if (keyword && !(doc.searchText || '').includes(keyword)) {
          return false;
        }
        return true;
      });
      renderList(filtered);
      updateKPIs(filtered);
    }

    function renderList(list) {
      if (!listContainer) {
        return;
      }
      if (!list.length) {
        renderEmpty();
        updateSummary(0);
        return;
      }
      listContainer.innerHTML = '';
      const fragment = document.createDocumentFragment();
      list.forEach((doc) => {
        fragment.appendChild(createDocCard(doc));
      });
      listContainer.appendChild(fragment);
      updateSummary(list.length);
    }

    function renderLoading() {
      if (!listContainer) return;
      listContainer.innerHTML =
        "<div class='px-4 py-8 text-center text-sm text-slate-500'>Đang tải văn bản...</div>";
    }

    function renderEmpty() {
      if (!listContainer) return;
      listContainer.innerHTML =
        "<div class='px-4 py-8 text-center text-sm text-slate-500'>Không có văn bản đến nào phù hợp.</div>";
    }

    function renderError(message) {
      if (!listContainer) return;
      listContainer.innerHTML = `<div class='px-4 py-8 text-center text-sm text-rose-600'>${helpers.escapeHtml(message)}</div>`;
      updateSummary(0);
    }

    function updateSummary(count) {
      if (!totalLabel) return;
      totalLabel.textContent = `(${count})`;
    }

    function updateKPIs(list) {
      const baseList = Array.isArray(docs) ? docs : [];
      const counts = Array.isArray(list)
        ? helpers.computeInboundKPIs(list)
        : helpers.computeInboundKPIs(baseList);
      if (kpiEls.pending) kpiEls.pending.textContent = String(counts.new || 0);
      if (kpiEls.processing) kpiEls.processing.textContent = String(counts.processing || 0);
      if (kpiEls.approved) kpiEls.approved.textContent = String(counts.approved || 0);
      if (kpiEls.urgent) kpiEls.urgent.textContent = String(counts.urgent || 0);
    }

    function createDocCard(doc) {
      const article = document.createElement('article');
      article.className = 'bg-white border border-slate-200 rounded-xl';
      article.dataset.docItem = '1';
      article.dataset.status = mapStatusFilter(doc.statusKey);
      article.dataset.level = mapLevelFilter(doc.urgencyKey);

      const statusBadge = `<span class='inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold ${statusBadgeClass(
        doc.statusKey
      )}'>${helpers.escapeHtml(doc.statusLabel || 'Chưa xử lý')}</span>`;
      const levelBadge = `<span class='inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold ${levelBadgeClass(
        doc.urgencyKey
      )}'>${helpers.escapeHtml(
        doc.urgencyLabel || helpers.mapUrgencyLabel(doc.urgencyKey, '')
      )}</span>`;
      const assigneeBadge = `<span class='inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[12px] font-semibold text-slate-600'><span class='opacity-70'>Đã giao:</span> ${helpers.escapeHtml(
        doc.creatorName || '—'
      )}</span>`;
      const number = helpers.escapeHtml(doc.number || '—');
      const received = helpers.escapeHtml(doc.receivedDate || doc.issuedDate || '');
      const sender = helpers.escapeHtml(doc.sender || doc.department || '—');
      const due = helpers.escapeHtml(doc.dueDate || '');
      const description = helpers.escapeHtml(
        doc.raw?.summary || doc.raw?.instruction || doc.raw?.goal || ''
      );
      const detailHref = `vanbanden-detail.html?id=${encodeURIComponent(doc.id || '')}`;

      const actions = [
        `  <a href='${detailHref}' class='inline-flex items-center gap-2 h-9 px-3 rounded-md border border-slate-200 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20'>Chi tiết</a>`,
      ];
      if (mapStatusFilter(doc.statusKey) === 'pending') {
        actions.push(
          "  <button type='button' class='inline-flex items-center gap-2 h-9 px-3 rounded-md bg-emerald-600 text-white text-sm font-medium transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20' title='Duyệt văn bản'><span class='text-base leading-none'>✔</span> Duyệt</button>",
          "  <button type='button' class='inline-flex items-center gap-2 h-9 px-3 rounded-md bg-slate-100 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20'>Giao việc</button>"
        );
      }

      const html = [
        '<div class="px-4 py-3">',
        `  <h3 class="font-semibold doc-title">${helpers.escapeHtml(doc.title || 'Văn bản đến')}</h3>`,
        '  <div class="mt-1 flex flex-wrap items-center gap-2 text-[12.5px]">',
        `    ${levelBadge}`,
        `    ${statusBadge}`,
        `    ${assigneeBadge}`,
        `    <span class="text-slate-500">Số văn bản: <b class="doc-number">${number}</b></span>`,
        `    <span class="text-slate-500">Ngày đến: <b>${received}</b></span>`,
        `    <span class="text-slate-500">Cơ quan gửi: <b>${sender}</b></span>`,
        `    <span class="text-slate-500">Hạn xử lý: <b>${due}</b></span>`,
        '  </div>',
        description
          ? `  <p class="text-[12.5px] text-slate-500 mt-2 line-clamp-2">${description}</p>`
          : '',
        '</div>',
        '<div class="px-4 pb-3 flex items-center justify-end gap-2">',
        ...actions,
        '</div>',
      ]
        .filter(Boolean)
        .join('
');

      article.innerHTML = html;
      return article;
    }

    function statusBadgeClass(statusKey) {
      switch (mapStatusFilter(statusKey)) {
        case 'processing':
          return 'bg-blue-50 text-blue-700 border border-blue-100';
        case 'approved':
          return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
        default:
          return 'bg-slate-100 text-slate-700 border border-slate-200';
      }
    }

    function levelBadgeClass(urgencyKey) {
      switch (mapLevelFilter(urgencyKey)) {
        case 'urgent':
          return 'bg-rose-50 text-rose-600';
        case 'high':
          return 'bg-amber-50 text-amber-700';
        default:
          return 'bg-slate-100 text-slate-600';
      }
    }

    function mapStatusFilter(key) {
      if (!key) return 'pending';
      if (key === 'processing') return 'processing';
      if (key === 'done') return 'new';
      if (key === 'approved') return 'approved';
      return 'pending';
    }

    function mapLevelFilter(key) {
      if (!key) return 'normal';
      if (key === 'ratkhan' || key === 'khan') return 'urgent';
      if (key === 'cao') return 'high';
      return 'normal';
    }

    function bindFilterDropdown(button, menu, label, key) {
      if (!button || !menu || !label) return;
      button.dataset[key] = 'all';
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const isOpen = !menu.classList.contains('hidden');
        menu.classList.toggle('hidden', isOpen);
        button.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      });
      menu.addEventListener('click', (event) => {
        const item = event.target.closest('.filter-item');
        if (!item) return;
        const value = item.getAttribute('data-' + key) || 'all';
        label.textContent = item.textContent.trim();
        button.dataset[key] = value;
        menu.classList.add('hidden');
        button.setAttribute('aria-expanded', 'false');
        state[key] = value;
        applyFilters();
      });
      document.addEventListener('click', (event) => {
        if (!menu.classList.contains('hidden') && !menu.contains(event.target) && event.target !== button) {
          menu.classList.add('hidden');
          button.setAttribute('aria-expanded', 'false');
        }
      });
    }

    function registerSearch(input, key) {
      if (!input) return;
      input.addEventListener('input', () => {
        state[key] = input.value || '';
        debouncedApply();
      });
    }
  };


  pageHandlers['vanbandi'] = function () {
    const api = window.ApiClient;
    const helpers = window.DocHelpers;
    const tableBody = document.getElementById("docTableBody");
    if (!tableBody) return;

    const searchTitle = document.getElementById("searchTitle");
    const searchGlobal = document.getElementById("globalSearch");
    const statusBtn = document.getElementById("btnStatusFilter");
    const statusMenu = document.getElementById("statusMenu");
    const statusLabel = document.getElementById("statusLabel");
    const levelBtn = document.getElementById("btnLevelFilter");
    const levelMenu = document.getElementById("levelMenu");
    const levelLabel = document.getElementById("levelLabel");

    const kpiEls = {
      approve: document.getElementById("kpiPendingApprove"),
      sign: document.getElementById("kpiPendingSign"),
      process: document.getElementById("kpiProcessing"),
      issued: document.getElementById("kpiIssued"),
    };

    const state = {
      keyword: "",
      globalKeyword: "",
      status: "all",
      level: "all",
    };

    let normalizedDocs = [];

    const debouncedFilter = debounce(applyFilters, 180);

    setupDropdown(statusBtn, statusMenu, statusLabel, "status");
    setupDropdown(levelBtn, levelMenu, levelLabel, "level");
    registerSearch(searchTitle, "keyword");
    registerSearch(searchGlobal, "globalKeyword");

    const detailView = createDetailView(
      "#cv-outgoing-list",
      "#cv-outgoing-detail",
      renderDocDetail
    );

    tableBody.addEventListener("click", (event) => {
      const detailBtn = event.target.closest("[data-open-detail]");
      if (detailBtn && detailView) {
        const row = detailBtn.closest("tr");
        if (row) {
          detailView.show(buildDocDataset(row));
        }
      }
    });

    if (!api || !helpers) {
      return;
    }

    runAfterDom(() => loadDocuments());

    function loadDocuments() {
      renderLoading();
      api
        .request("/api/v1/outbound-docs/?ordering=-created_at&page_size=50")
        .then((data) => {
          const payload = api.extractItems(data);
          normalizedDocs = payload.map((item) => helpers.normalizeOutboundDoc(item));
          renderRows(normalizedDocs);
          applyFilters();
        })
        .catch((error) => {
          console.error("[lanhdao] L?i t?i v�n b?n �i:", error);
          renderError(helpers.resolveErrorMessage(error));
        });
    }

    function renderRows(list) {
      tableBody.innerHTML = "";
      if (!list.length) {
        renderEmpty();
        return;
      }
      const fragment = document.createDocumentFragment();
      list.forEach((doc) => fragment.appendChild(createRow(doc)));
      tableBody.appendChild(fragment);
    }

    function createRow(doc) {
      const tr = document.createElement("tr");
      const levelValue = mapLevelFromUrgency(doc.urgencyKey);
      const statusValue = mapStatusForDataset(doc.statusKey);
      tr.dataset.row = "1";
      tr.dataset.status = statusValue;
      tr.dataset.level = levelValue;
      tr.dataset.docId = doc.id != null ? String(doc.id) : "";
      tr.dataset.docTitle = doc.title || "";
      tr.dataset.docNumber = doc.number || "";
      tr.dataset.docSigner = doc.signer || "";
      tr.dataset.docReceiver = doc.recipients || "";
      tr.dataset.docIssuedDate = doc.issuedDate || "";
      tr.dataset.docDispatchAt = doc.publishedDate || "";
      tr.dataset.docUrgency = doc.urgencyLabel || "";
      tr.dataset.docStatus = doc.statusLabel || "";
      tr.__docData = doc;

      const detailHref = `vanbandi-detail.html?id=${encodeURIComponent(
        tr.dataset.docId || ""
      )}`;

      const urgencyClass = urgencyBadgeClass(doc.urgencyKey);
      const statusClass = outboundStatusClass(doc.statusKey);

      const publishedInfo = doc.publishedDate
        ? `        <div class="text-[12px] text-slate-500">Ph�t h�nh: ${helpers.escapeHtml(helpers.formatDate(doc.publishedDate))}</div>`
        : "";

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
          ? `  <div>Ng�y k?: ${helpers.escapeHtml(helpers.formatDate(doc.issuedDate))}</div>`
          : "",
        publishedInfo,
        "</td>",
        `<td class="py-2 px-3">${helpers.escapeHtml(doc.recipients || "�")}</td>`,
        `<td class="py-2 px-3"><span class="inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold ${urgencyClass}">${helpers.escapeHtml(doc.urgencyLabel || "")}</span></td>`,
        `<td class="py-2 px-3"><span class="px-2.5 py-1 rounded-full text-xs font-semibold ${statusClass}">${helpers.escapeHtml(doc.statusLabel)}</span></td>`,
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
        .join("\n");

      return tr;
    }

    function applyFilters() {
      if (!normalizedDocs.length) {
        updateKPIs([]);
        tableBody.querySelectorAll("[data-row]").forEach((row) => {
          row.style.display = "none";
        });
        return;
      }

      const keyword = helpers.normalizeText(activeKeyword());
      const statusTargets = mapStatusTargets(state.status);
      const levelFilter = state.level;

      const filteredDocs = normalizedDocs.filter((doc) => matchesDoc(doc, statusTargets, levelFilter, keyword));
      updateKPIs(filteredDocs);

      tableBody.querySelectorAll("[data-row]").forEach((row) => {
        const doc = row.__docData;
        const show = doc ? matchesDoc(doc, statusTargets, levelFilter, keyword) : false;
        row.style.display = show ? "" : "none";
      });
    }

    function matchesDoc(doc, statusTargets, levelFilter, keyword) {
      if (statusTargets && statusTargets.length && !statusTargets.includes(doc.statusKey)) {
        return false;
      }
      if (levelFilter !== "all") {
        const levelValue = mapLevelFromUrgency(doc.urgencyKey);
        if (!levelMatches(levelValue, levelFilter)) {
          return false;
        }
      }
      if (keyword && doc.searchText && !doc.searchText.includes(keyword)) {
        return false;
      }
      return true;
    }

    function updateKPIs(docs) {
      const counts = Array.isArray(docs)
        ? helpers.computeOutboundKPIs(docs)
        : docs;
      if (kpiEls.approve) kpiEls.approve.textContent = String(counts.draft || 0);
      if (kpiEls.sign) kpiEls.sign.textContent = String(counts['pending-sign'] || 0);
      if (kpiEls.process) kpiEls.process.textContent = String(counts.approved || 0);
      if (kpiEls.issued) kpiEls.issued.textContent = String(counts.published || 0);
    }

    function registerSearch(input, key) {
      if (!input) return;
      input.addEventListener("input", (event) => {
        state[key] = event.target.value || "";
        debouncedFilter();
      });
    }

    function setupDropdown(button, menu, label, key) {
      if (!button || !menu || !label) return;
      button.dataset[key] = "all";
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const isOpen = !menu.classList.contains("hidden");
        menu.classList.toggle("hidden", isOpen);
        button.setAttribute("aria-expanded", isOpen ? "false" : "true");
      });
      menu.addEventListener("click", (event) => {
        const item = event.target.closest(".filter-item");
        if (!item) return;
        const value = item.getAttribute(`data-${key}`) || "all";
        label.textContent = item.textContent.trim();
        button.dataset[key] = value;
        menu.classList.add("hidden");
        button.setAttribute("aria-expanded", "false");
        state[key] = value;
        applyFilters();
      });
      document.addEventListener("click", (event) => {
        if (!menu.classList.contains("hidden") && !menu.contains(event.target) && event.target !== button) {
          menu.classList.add("hidden");
          button.setAttribute("aria-expanded", "false");
        }
      });
    }

    function mapStatusTargets(value) {
      switch (value) {
        case "cho_duyet":
          return ["draft"];
        case "cho_ky":
          return ["pending-sign"];
        case "dang_xu_ly":
          return ["approved"];
        case "da_phat_hanh":
          return ["published"];
        case "tra_lai":
          return ["draft"];
        default:
          return value === "all" ? null : [value];
      }
    }

    function mapStatusForDataset(status) {
      switch (status) {
        case "published":
          return "da_phat_hanh";
        case "pending-sign":
          return "cho_ky";
        case "approved":
          return "dang_xu_ly";
        case "draft":
        default:
          return "cho_duyet";
      }
    }

    function mapLevelFromUrgency(urgencyKey) {
      switch (urgencyKey) {
        case "ratkhan":
        case "khan":
          return "urgent";
        case "cao":
          return "high";
        default:
          return "normal";
      }
    }

    function levelMatches(levelValue, filter) {
      if (filter === "urgent") return levelValue === "urgent";
      if (filter === "high") return levelValue === "high";
      if (filter === "normal") return levelValue === "normal";
      return true;
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

    function urgencyBadgeClass(key) {
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

    function activeKeyword() {
      const local = (state.keyword || "").trim();
      if (local) return local;
      return (state.globalKeyword || "").trim();
    }

    function renderLoading() {
      tableBody.innerHTML =
        '<tr><td colspan="7" class="py-6 text-center text-[13px] text-slate-500">�ang t?i d? li?u...</td></tr>';
    }

    function renderEmpty() {
      tableBody.innerHTML =
        '<tr><td colspan="7" class="py-6 text-center text-[13px] text-slate-500">Kh�ng c� v�n b?n ph� h?p v?i b? l?c.</td></tr>';
      updateKPIs([]);
    }

    function renderError(message) {
      tableBody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-[13px] text-rose-600">${helpers.escapeHtml(
        message
      )}</td></tr>`;
      updateKPIs([]);
    }

    function debounce(fn, delay = 160) {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(null, args), delay);
      };
    }
  };

            btn?.addEventListener("click", (e) => {
              e.stopPropagation();
              const isOpen = !menu.classList.contains("hidden");
              isOpen ? close() : open();
            });

            menu?.addEventListener("click", (e) => {
              const item = e.target.closest(".filter-item");
              if (!item) return;
              const text = item.textContent.trim();
              label.textContent = text;
              btn.dataset[stateKey] = item.dataset[stateKey];
              close();
              applyFilters();
            });

            document.addEventListener("click", (e) => {
              if (!menu) return;
              if (!btn?.contains(e.target) && !menu.contains(e.target)) close();
            });
          }

          bindDropdown("btnStatusFilter", "statusMenu", "statusLabel", "status");
          bindDropdown("btnLevelFilter", "levelMenu", "levelLabel", "level");

          // default filter state
          document.getElementById("btnStatusFilter").dataset.status = "all";
          document.getElementById("btnLevelFilter").dataset.level = "all";

          // ---------- Filtering + KPI ----------
          const tbody = document.getElementById("docTableBody");
          const countShown = document.getElementById("countShown");
          const searchTitle = document.getElementById("searchTitle");
          const searchGlobal = document.getElementById("globalSearch");

          const kpi = {
            approve: document.getElementById("kpiPendingApprove"),
            sign: document.getElementById("kpiPendingSign"),
            process: document.getElementById("kpiProcessing"),
            issued: document.getElementById("kpiIssued"),
          };

          function normalize(s) {
            return (s || "")
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "");
          }

          function applyFilters() {
            const rows = Array.from(tbody.querySelectorAll("[data-row]"));
            const statusFilter =
              document.getElementById("btnStatusFilter").dataset.status || "all";
            const levelFilter =
              document.getElementById("btnLevelFilter").dataset.level || "all";
            const kw = normalize(
              (searchTitle?.value || searchGlobal?.value || "").trim()
            );

            let shown = 0;
            let sum = { cho_duyet: 0, cho_ky: 0, dang_xu_ly: 0, da_phat_hanh: 0 };

            rows.forEach((tr) => {
              const st = tr.dataset.status; // cho_duyet | cho_ky | dang_xu_ly | da_phat_hanh | tra_lai
              const lv = tr.dataset.level; // urgent | high | normal
              const title = normalize(tr.querySelector(".doc-title")?.textContent);
              const number = normalize(
                tr.querySelector(".doc-number")?.textContent
              );

              const matchKW = !kw || title.includes(kw) || number.includes(kw);
              const matchSt = statusFilter === "all" || st === statusFilter;
              const matchLv = levelFilter === "all" || lv === levelFilter;

              const show = matchKW && matchSt && matchLv;
              tr.style.display = show ? "" : "none";

              if (show) {
                shown++;
                if (st in sum) sum[st]++;
              }
            });

            countShown.textContent = shown;

            // KPI map: Chờ duyệt → cho_duyet, Chờ ký → cho_ky, Đang xử lý → dang_xu_ly, Đã phát hành → da_phat_hanh
            kpi.approve.textContent = sum.cho_duyet;
            kpi.sign.textContent = sum.cho_ky;
            kpi.process.textContent = sum.dang_xu_ly;
            kpi.issued.textContent = sum.da_phat_hanh;
          }

          ["input", "change"].forEach((ev) => {
            searchTitle?.addEventListener(ev, applyFilters);
            searchGlobal?.addEventListener(ev, applyFilters);
          });

          runAfterDom(applyFilters);
  };


  pageHandlers['vanbandi-detail'] = () => initDocumentDetailPage();
  pageHandlers['vanbanden-detail'] = () => initDocumentDetailPage();

  function initDocumentDetailPage() {
    const docId = getQueryParam('id');
    if (!docId) return;

    const api = window.ApiClient;
    const docApi = api?.documents;
    if (!docApi) {
      console.warn('[lanhdao] ApiClient.documents is not ready.');
      return;
    }

    const buttons = document.querySelectorAll('[data-doc-action]');
    if (!buttons.length) return;

    const actionMap = {
      submit: {
        method: docApi.submit,
        success: 'Document submitted for approval.',
        payload: () => ({ comment: 'Submitted from leadership view.' }),
      },
      approve: { method: docApi.approve, success: 'Document approved.' },
      sign: { method: docApi.sign, success: 'Document signed.' },
      publish: {
        method: docApi.publish,
        success: 'Document published.',
        payload: buildPublishPayload,
      },
      recall: {
        method: docApi.recall,
        success: 'Document recalled for revision.',
        payload: () => ({ comment: 'Request to rework document.' }),
      },
    };

    buttons.forEach((button) => {
      const action = button.dataset.docAction;
      const config = actionMap[action];
      if (!config) return;
      button.addEventListener('click', async () => {
        if (button.disabled) return;
        button.disabled = true;
        try {
          const payload = typeof config.payload === 'function' ? config.payload() : config.payload;
          await config.method(docId, payload);
          showDetailToast(config.success, 'success');
        } catch (error) {
          showDetailToast(resolveDetailError(error), 'error');
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  function getQueryParam(name) {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get(name);
    } catch (error) {
      return null;
    }
  }

  function buildPublishPayload() {
    return {
      prefix: 'UBND',
      postfix: '/VP',
      year: new Date().getFullYear(),
    };
  }

  function resolveDetailError(error) {
    const helpers = window.DocHelpers;
    if (helpers?.resolveErrorMessage) {
      return helpers.resolveErrorMessage(error);
    }
    if (!error) {
      return 'Unable to perform the operation.';
    }
    if (error.data) {
      if (typeof error.data === 'string') return error.data;
      if (error.data.detail) return String(error.data.detail);
    }
    if (error.message) return String(error.message);
    return 'Unable to perform the operation.';
  }

  function showDetailToast(message, type = 'info') {
    const toastEl = document.getElementById('toast');
    if (!toastEl) {
      console.log(message);
      return;
    }
    toastEl.textContent = message;
    toastEl.classList.remove('toast--show', 'toast--error', 'toast--success', 'toast--warn');
    if (type === 'error') toastEl.classList.add('toast--error');
    else if (type === 'success') toastEl.classList.add('toast--success');
    else if (type === 'warn') toastEl.classList.add('toast--warn');
    toastEl.classList.add('toast--show');
    setTimeout(() => toastEl.classList.remove('toast--show'), 2200);
  }

})();







