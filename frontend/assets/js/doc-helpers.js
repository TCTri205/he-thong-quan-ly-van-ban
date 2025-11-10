/* ===================================================================
   doc-helpers.js
   Shared helpers for document listings across roles (fetch adapters,
   normalization, status/urgency mapping, error formatting).
   =================================================================== */

(function (global) {
  const helpers = {
    normalizeText,
    escapeHtml,
    formatDate,
    resolveErrorMessage,

    mapInboundStatusKey,
    mapInboundStatusLabel,
    mapOutboundStatusKey,
    mapOutboundStatusLabel,

    mapUrgencyKey,
    mapUrgencyLabel,
    mapSecurityLabel,

    normalizeInboundDoc,
    normalizeOutboundDoc,
    computeInboundKPIs,
    computeOutboundKPIs,
  };

  global.DocHelpers = helpers;

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
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return [
        String(value.getDate()).padStart(2, "0"),
        String(value.getMonth() + 1).padStart(2, "0"),
        value.getFullYear(),
      ].join("/");
    }
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, d] = raw.split("-");
      return [d, m, y].join("/");
    }
    return raw;
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

  function mapInboundStatusKey(raw) {
    const value = normalizeText(raw);
    if (!value) return "new";
    if (/duyet|approve|approved|phe_duyet/.test(value)) return "approved";
    if (/hoan_thanh|done|complete|completed/.test(value)) return "done";
    if (/dang_xu_ly|processing|process|assign|assigned|chuyen_xu_ly/.test(value)) {
      return "processing";
    }
    return "new";
  }

  function mapInboundStatusLabel(key, fallback) {
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

  function mapOutboundStatusKey(raw) {
    const value = normalizeText(raw);
    if (!value) return "draft";
    if (/phat_hanh|publish|published|ban_hanh/.test(value)) return "published";
    if (/duyet|approve|approved|ky_duyet|signed/.test(value)) return "approved";
    if (/cho_ky|pending|submit|waiting|trinh|trinh_ky/.test(value)) return "pending-sign";
    return "draft";
  }

  function mapOutboundStatusLabel(key, fallback) {
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

  function mapUrgencyKey(raw) {
    const value = normalizeText(raw);
    if (/rat_khan|very_urgent|hoa_toc/.test(value)) return "ratkhan";
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

  function mapSecurityLabel(raw) {
    const value = normalizeText(raw);
    if (!value) return "";
    if (/tuyet|absolute/.test(value)) return "Tuyệt mật";
    if (/mat|secret/.test(value)) return "Mật";
    if (/mat|restricted/.test(value)) return "Mật";
    if (/khong|none|thuong/.test(value)) return "Không mật";
    return raw || "";
  }

  function normalizeInboundDoc(raw) {
    const statusKey = mapInboundStatusKey(
      raw?.status_name || raw?.status?.name || raw?.status?.code
    );
    const urgencyKey = mapUrgencyKey(raw?.urgency?.name || raw?.urgency?.code);
    const securityLabel = mapSecurityLabel(raw?.security?.name || raw?.security?.code);
    const incomingNumber = raw?.incoming_number || "";
    const number = incomingNumber || raw?.document_code || raw?.outgoing_number || "";
    const issuedDate = raw?.issued_date || "";
    const receivedDate =
      raw?.received_date ||
      (typeof raw?.created_at === "string" ? raw.created_at.slice(0, 10) : "");
    const sender = raw?.sender || "";
    const department = raw?.department?.name || "";
    const creatorName = raw?.creator?.full_name || raw?.creator?.username || "";
    const docType = raw?.document_type?.name || raw?.document_type?.code || "";
    const dueDate =
      raw?.due_date ||
      raw?.deadline ||
      (typeof raw?.expected_finish === "string" ? raw.expected_finish.slice(0, 10) : "");
    const hasAttachments = Boolean(raw?.has_attachments);
    const searchText = normalizeText(
      [
        raw?.title,
        number,
        incomingNumber,
        sender,
        department,
        creatorName,
        docType,
        securityLabel,
      ].join(" ")
    );

    return {
      raw,
      id: raw?.id ?? null,
      docDirection: raw?.doc_direction || raw?.direction || "den",
      title: raw?.title || "",
      number,
      incomingNumber,
      issuedDate,
      receivedDate,
      sender,
      department,
      docType,
      dueDate,
      creatorName,
      hasAttachments,
      assigneeCount: typeof raw?.assignee_count === "number" ? raw.assignee_count : 0,
      etag: raw?.etag || null,
      statusKey,
      statusLabel: mapInboundStatusLabel(statusKey, raw?.status_name),
      urgencyKey,
      urgencyLabel: mapUrgencyLabel(urgencyKey, raw?.urgency?.name || raw?.urgency?.code),
      securityLabel,
      searchText,
    };
  }

  function normalizeOutboundDoc(raw) {
    const statusKey = mapOutboundStatusKey(
      raw?.status_name || raw?.status?.name || raw?.status?.code
    );
    const urgencyKey = mapUrgencyKey(raw?.urgency?.name || raw?.urgency?.code);
    const securityLabel = mapSecurityLabel(raw?.security?.name || raw?.security?.code);
    const outgoingNumber = raw?.outgoing_number || raw?.document_code || "";
    const issuedDate =
      raw?.issued_date ||
      raw?.published_date ||
      (typeof raw?.created_at === "string" ? raw.created_at.slice(0, 10) : "");
    const publishedDate =
      raw?.published_date ||
      (typeof raw?.dispatched_at === "string" ? raw.dispatched_at.slice(0, 10) : "");
    const signer =
      raw?.signer?.full_name ||
      raw?.signer?.username ||
      raw?.creator?.full_name ||
      raw?.creator?.username ||
      "";
    const recipients = raw?.department?.name || raw?.receiver || "";
    const searchText = normalizeText(
      [
        raw?.title,
        outgoingNumber,
        issuedDate,
        signer,
        recipients,
        raw?.summary,
        securityLabel,
      ].join(" ")
    );

    return {
      raw,
      id: raw?.id ?? null,
      title: raw?.title || "",
      docDirection: raw?.doc_direction || raw?.direction || "di",
      number: outgoingNumber,
      issuedDate,
      publishedDate,
      signer,
      recipients,
      etag: raw?.etag || null,
      hasAttachments: Boolean(raw?.has_attachments),
      statusKey,
      statusLabel: mapOutboundStatusLabel(statusKey, raw?.status_name),
      urgencyKey,
      urgencyLabel: mapUrgencyLabel(urgencyKey, raw?.urgency?.name || raw?.urgency?.code),
      securityLabel,
      searchText,
    };
  }

  function computeInboundKPIs(list) {
    const result = {
      total: Array.isArray(list) ? list.length : 0,
      new: 0,
      processing: 0,
      done: 0,
      approved: 0,
      urgent: 0,
    };
    if (!Array.isArray(list)) {
      return result;
    }
    list.forEach((doc) => {
      if (!doc || typeof doc !== "object") return;
      if (Object.prototype.hasOwnProperty.call(result, doc.statusKey)) {
        result[doc.statusKey] += 1;
      }
      if (doc.urgencyKey === "khan" || doc.urgencyKey === "ratkhan") {
        result.urgent += 1;
      }
    });
    return result;
  }

  function computeOutboundKPIs(list) {
    const result = {
      total: Array.isArray(list) ? list.length : 0,
      draft: 0,
      "pending-sign": 0,
      approved: 0,
      published: 0,
      urgent: 0,
    };
    if (!Array.isArray(list)) {
      return result;
    }
    list.forEach((doc) => {
      if (!doc || typeof doc !== "object") return;
      if (Object.prototype.hasOwnProperty.call(result, doc.statusKey)) {
        result[doc.statusKey] += 1;
      }
      if (doc.urgencyKey === "khan" || doc.urgencyKey === "ratkhan") {
        result.urgent += 1;
      }
    });
    return result;
  }
})(window);
