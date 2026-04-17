const appConfig = window.InventoryApp || {};
const apiBase =
  appConfig.apiBase ||
  (window.location.origin.includes("localhost")
    ? "http://localhost:4000/api"
    : "/api");

const state = {
  itemNames: [],
  itemNameSearchIndex: [],
  itemNameLookup: new Map(),
  currentItemReportRows: [],
  currentPurchaseRows: [],
  currentSalesRows: [],
  currentGstRows: [],
  currentExpenseRows: [],
  lowStockRows: [],
  reorderRows: [],
  slowMovingRows: [],
  ledgerMode: "empty",
  currentLedgerNumber: "",
  currentLedgerName: "",
  currentLedgerOutstanding: 0,
  currentLedgerEntryCount: 0,
  dueSummaryCustomerCount: 0,
  dueSummaryOutstanding: 0,
  supplierLedgerMode: "empty",
  currentSupplierId: null,
  currentPurchaseDetailId: null,
  currentPurchaseDetailSupplierId: null,
  currentPurchaseDetail: null,
  purchaseSearchRequestId: 0,
  charts: {
    businessTrend: null,
    last13Months: null,
    libraryPromise: null,
  },
  popupTimer: null,
  profitSaveRequestId: 0,
  profitSaveTimer: null,
  lastSavedProfitPercent: null,
  sessionUser: null,
  supportConversation: null,
  supportMessages: [],
  supportLoadRequestId: 0,
  supportPollTimer: null,
};

const STAFF_PERMISSION_OPTIONS = appConfig.staffPermissionOptions || [];
const DEFAULT_STAFF_PERMISSIONS = appConfig.defaultStaffPermissions || [
  "add_stock",
  "sale_invoice",
];
const STAFF_PERMISSION_KEYS =
  appConfig.staffPermissionKeys ||
  STAFF_PERMISSION_OPTIONS.map((option) => option.value);
const INVOICE_PAGE_PERMISSION =
  appConfig.invoicePagePermission || "sale_invoice";

const formatters = {
  whole: new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }),
  decimal: new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }),
  money: new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
  compactMoney: new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }),
};

const businessTrendHoverLinePlugin = {
  id: "businessTrendHoverLine",
  afterDatasetsDraw(chart) {
    const activeElements = chart.tooltip?.getActiveElements?.() || [];
    const activePoint = activeElements[0]?.element;

    if (!activePoint) {
      return;
    }

    const {
      ctx,
      chartArea: { top, bottom },
    } = chart;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(activePoint.x, top + 8);
    ctx.lineTo(activePoint.x, bottom);
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(39, 64, 107, 0.18)";
    ctx.stroke();
    ctx.restore();
  },
};

const dom = {};
let sidebarController = null;
const clearStoredSession =
  appConfig.clearStoredSession ||
  (() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  });

function hideElement(element) {
  if (element) {
    element.hidden = true;
  }
}

function showElement(element) {
  if (element) {
    element.hidden = false;
  }
}

function markDashboardReady() {
  document.body.classList.remove("app-loading");
}

function authHeaders(headers = {}) {
  return { ...headers };
}

function handleSessionExpiry() {
  clearStoredSession();
  window.location.replace("login.html");
}

function formatCount(value) {
  return formatters.whole.format(Number(value) || 0);
}

function formatNumber(value) {
  return formatters.decimal.format(Number(value) || 0);
}

function formatCurrency(value) {
  return `Rs. ${formatters.money.format(Number(value) || 0)}`;
}

function formatCompactCurrency(value) {
  return `Rs. ${formatters.compactMoney.format(Number(value) || 0)}`;
}

function formatCurrencyValue(value) {
  return formatters.money.format(Number(value) || 0);
}

function formatDate(value) {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
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

function formatPercent(value) {
  return `${formatters.money.format(Number(value) || 0)}%`;
}

function formatInputDate(value) {
  return value ? formatDate(new Date(`${value}T00:00:00`)) : "-";
}

function getMonthBucket(value) {
  const parts = new Intl.DateTimeFormat("en-IN", {
    year: "numeric",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
  }).formatToParts(new Date(value));
  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  return `${year}-${month}`;
}

function formatMonthBucket(bucket) {
  const [year, month] = String(bucket || "0000-01")
    .split("-")
    .map((part) => Number(part) || 0);

  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(Date.UTC(year, Math.max(month - 1, 0), 1)));
}

function getCurrentMonthKey() {
  return getMonthBucket(new Date());
}

function toInputDate(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

const isMobileLayout =
  appConfig.isMobileLayout ||
  (() => window.matchMedia("(max-width: 991px)").matches);

function sanitizeFileName(value) {
  return String(value || "download")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function normalizeSearchKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function buildStringSearchIndex(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .map((value) => ({
      value,
      searchKey: normalizeSearchKey(value),
    }));
}

function buildStringLookup(searchIndex) {
  const lookup = new Map();

  searchIndex.forEach((entry) => {
    if (!lookup.has(entry.searchKey)) {
      lookup.set(entry.searchKey, entry.value);
    }
  });

  return lookup;
}

function getSearchMatches(searchIndex, query, limit = 50) {
  const normalizedQuery = normalizeSearchKey(query);
  const matches = [];

  for (const entry of searchIndex) {
    if (normalizedQuery && !entry.searchKey.includes(normalizedQuery)) {
      continue;
    }

    matches.push(entry.value);

    if (matches.length >= limit) {
      break;
    }
  }

  return matches;
}

function findExactItemName(value) {
  return state.itemNameLookup.get(normalizeSearchKey(value)) || null;
}

function debounce(callback, delay = 180) {
  let timerId = 0;

  return (...args) => {
    if (timerId) {
      window.clearTimeout(timerId);
    }

    timerId = window.setTimeout(() => {
      callback(...args);
    }, delay);
  };
}

const escapeHtml =
  appConfig.escapeHtml ||
  ((value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;"));

function parseFormattedNumber(value) {
  return Number(String(value || "").replace(/[^0-9.]/g, "")) || 0;
}

function normalizeMobileNumber(value) {
  const digits = String(value || "").replace(/\D+/g, "");

  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }

  if (digits.length === 11 && digits.startsWith("0")) {
    return digits.slice(1);
  }

  return digits;
}

function formatPaymentMode(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  switch (normalized) {
    case "upi":
      return "UPI";
    case "bank":
      return "Bank";
    case "mixed":
      return "Mixed";
    case "credit":
      return "Credit";
    case "cash":
    default:
      return "Cash";
  }
}

function getStatusChipMarkup(status) {
  const normalized = String(status || "")
    .trim()
    .toLowerCase();
  const safeStatus = normalized || "paid";
  const labelMap = {
    paid: "Paid",
    partial: "Partial",
    due: "Due",
    return: "Return",
  };

  return `<span class="status-chip status-chip--${escapeHtml(safeStatus)}">${escapeHtml(labelMap[safeStatus] || "Paid")}</span>`;
}

function validateRange(fromDate, toDate, labels = {}) {
  if (!fromDate || !toDate) {
    showPopup(
      "error",
      "Missing date range",
      `Select both ${labels.from || "From"} and ${labels.to || "To"} dates first.`,
      { autoClose: false },
    );
    return false;
  }

  if (fromDate > toDate) {
    showPopup(
      "error",
      "Invalid date range",
      `${labels.from || "From"} date cannot be later than ${labels.to || "To"} date.`,
      { autoClose: false },
    );
    return false;
  }

  return true;
}

function isOwnerSession() {
  return typeof appConfig.isOwnerUser === "function"
    ? appConfig.isOwnerUser(state.sessionUser)
    : state.sessionUser?.role !== "staff";
}

function normalizeStaffPermissions(values) {
  return typeof appConfig.normalizePermissions === "function"
    ? appConfig.normalizePermissions(values)
    : [];
}

function getPermissionOption(permission) {
  return typeof appConfig.getPermissionOption === "function"
    ? appConfig.getPermissionOption(permission)
    : null;
}

function formatPermissionSummary(permissions, options = {}) {
  return typeof appConfig.formatPermissionSummary === "function"
    ? appConfig.formatPermissionSummary(permissions, options)
    : "No assigned pages";
}

function canAccessPermission(...permissions) {
  return typeof appConfig.canAccessPermission === "function"
    ? appConfig.canAccessPermission(state.sessionUser, ...permissions)
    : true;
}

function canAccessInvoicePage() {
  return canAccessPermission(INVOICE_PAGE_PERMISSION);
}

function canAccessSection(sectionId) {
  return typeof appConfig.canAccessSection === "function"
    ? appConfig.canAccessSection(state.sessionUser, sectionId)
    : true;
}

function getAccessibleSectionIds() {
  return (dom.sectionButtons || [])
    .map((button) => button.dataset.section)
    .filter((sectionId) => canAccessSection(sectionId));
}

function getFirstAccessibleSection() {
  return getAccessibleSectionIds()[0] || null;
}

function getActiveSectionId() {
  return document.querySelector(".form-section.active")?.id || "";
}

async function ensureChartLibrary() {
  if (typeof window.Chart !== "undefined") {
    return window.Chart;
  }

  if (state.charts.libraryPromise) {
    return state.charts.libraryPromise;
  }

  state.charts.libraryPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "js/chart.min.js";
    script.async = true;
    script.dataset.chartLoader = "true";

    script.addEventListener(
      "load",
      () => {
        resolve(window.Chart);
      },
      { once: true },
    );

    script.addEventListener(
      "error",
      () => {
        state.charts.libraryPromise = null;
        script.remove();
        reject(new Error("Could not load chart assets."));
      },
      { once: true },
    );

    document.body.appendChild(script);
  });

  return state.charts.libraryPromise;
}

async function ensureSalesWorkspaceReady(options = {}) {
  if (!canAccessPermission("sales_report")) {
    return;
  }

  initYearFilter();
  await Promise.allSettled([
    loadBusinessTrend(dom.yearFilter?.value || "all", options),
    loadLast13MonthsChart(options),
    Promise.resolve(loadSalesNetProfitCard(options)),
  ]);
}

function cacheElements() {
  Object.assign(dom, {
    sectionButtons: Array.from(
      document.querySelectorAll(".sidebar button[data-section]"),
    ),
    formSections: Array.from(document.querySelectorAll(".form-section")),
    invoiceBtn: document.getElementById("invoiceBtn"),
    overviewGrid: document.getElementById("overviewGrid"),
    currentDateLabel: document.getElementById("currentDateLabel"),
    sessionRoleChip: document.getElementById("sessionRoleChip"),
    welcomeUser: document.getElementById("welcomeUser"),
    heroSubtitle: document.getElementById("heroSubtitle"),
    statCatalogCount: document.getElementById("statCatalogCount"),
    statCatalogNote: document.getElementById("statCatalogNote"),
    statCatalogValue: document.getElementById("statCatalogValue"),
    statCatalogValueNote: document.getElementById("statCatalogValueNote"),
    statLowStock: document.getElementById("statLowStock"),
    statLowStockNote: document.getElementById("statLowStockNote"),
    statDueBalance: document.getElementById("statDueBalance"),
    statDueNote: document.getElementById("statDueNote"),
    statSupplierDue: document.getElementById("statSupplierDue"),
    statSupplierDueNote: document.getElementById("statSupplierDueNote"),
    statNetProfit: document.getElementById("statNetProfit"),
    statNetProfitNote: document.getElementById("statNetProfitNote"),
    newItemSearch: document.getElementById("newItemSearch"),
    newItemDropdownList: document.getElementById("newItemDropdownList"),
    newQuantity: document.getElementById("newQuantity"),
    profitPercent: document.getElementById("profitPercent"),
    buyingRate: document.getElementById("buyingRate"),
    sellingRate: document.getElementById("sellingRate"),
    addStockBtn: document.getElementById("addStockBtn"),
    previousBuyingRate: document.getElementById("previousBuyingRate"),
    profitPreviewValue: document.getElementById("profitPreviewValue"),
    profitPreviewNote: document.getElementById("profitPreviewNote"),
    supplierName: document.getElementById("supplierName"),
    supplierNumber: document.getElementById("supplierNumber"),
    supplierAddress: document.getElementById("supplierAddress"),
    supplierDropdown: document.getElementById("supplierDropdown"),
    purchaseBillNo: document.getElementById("purchaseBillNo"),
    purchaseDate: document.getElementById("purchaseDate"),
    purchasePaymentMode: document.getElementById("purchasePaymentMode"),
    purchaseAmountPaid: document.getElementById("purchaseAmountPaid"),
    purchaseNote: document.getElementById("purchaseNote"),
    purchaseItemsBody: document.getElementById("purchaseItemsBody"),
    addPurchaseItemBtn: document.getElementById("addPurchaseItemBtn"),
    resetPurchaseBtn: document.getElementById("resetPurchaseBtn"),
    submitPurchaseBtn: document.getElementById("submitPurchaseBtn"),
    purchaseSubtotal: document.getElementById("purchaseSubtotal"),
    purchaseAmountPaidDisplay: document.getElementById(
      "purchaseAmountPaidDisplay",
    ),
    purchaseAmountDueDisplay: document.getElementById(
      "purchaseAmountDueDisplay",
    ),
    purchasePaymentStatus: document.getElementById("purchasePaymentStatus"),
    purchaseActiveRows: document.getElementById("purchaseActiveRows"),
    purchaseFromDate: document.getElementById("purchaseFromDate"),
    purchaseToDate: document.getElementById("purchaseToDate"),
    purchaseSearchInput: document.getElementById("purchaseSearchInput"),
    purchaseSearchDropdown: document.getElementById("purchaseSearchDropdown"),
    loadPurchaseReportBtn: document.getElementById("loadPurchaseReportBtn"),
    purchaseReportBody: document.getElementById("purchaseReportBody"),
    purchaseHistoryView: document.getElementById("purchaseHistoryView"),
    supplierLedgerView: document.getElementById("supplierLedgerView"),
    showPurchaseBillsViewBtn: document.getElementById(
      "showPurchaseBillsViewBtn",
    ),
    showSupplierLedgerViewBtn: document.getElementById(
      "showSupplierLedgerViewBtn",
    ),
    supplierSearchInput: document.getElementById("supplierSearchInput"),
    supplierSearchDropdown: document.getElementById("supplierSearchDropdown"),
    searchSupplierLedgerBtn: document.getElementById("searchSupplierLedgerBtn"),
    showAllSupplierSummaryBtn: document.getElementById(
      "showAllSupplierSummaryBtn",
    ),
    supplierLedgerTable: document.getElementById("supplierLedgerTable"),
    purchaseDetailCard: document.getElementById("purchaseDetailCard"),
    purchaseDetailSummary: document.getElementById("purchaseDetailSummary"),
    purchaseDetailItems: document.getElementById("purchaseDetailItems"),
    purchaseDetailMeta: document.getElementById("purchaseDetailMeta"),
    purchaseDetailNote: document.getElementById("purchaseDetailNote"),
    purchaseRepayPanel: document.getElementById("purchaseRepayPanel"),
    purchaseRepayAmount: document.getElementById("purchaseRepayAmount"),
    purchaseRepayMode: document.getElementById("purchaseRepayMode"),
    purchaseRepayNote: document.getElementById("purchaseRepayNote"),
    submitPurchaseRepaymentBtn: document.getElementById(
      "submitPurchaseRepaymentBtn",
    ),
    itemReportSearch: document.getElementById("itemReportSearch"),
    itemReportDropdown: document.getElementById("itemReportDropdown"),
    loadItemReportBtn: document.getElementById("loadItemReportBtn"),
    itemReportPdfBtn: document.getElementById("itemReportPdfBtn"),
    itemReportBody: document.getElementById("itemReportBody"),
    lowStockCard: document.getElementById("lowStockCard"),
    lowStockCount: document.getElementById("lowStockCount"),
    lowStockBody: document.getElementById("lowStockBody"),
    reorderPlannerCard: document.getElementById("reorderPlannerCard"),
    reorderCandidateCount: document.getElementById("reorderCandidateCount"),
    reorderUrgentCount: document.getElementById("reorderUrgentCount"),
    reorderSuggestedUnits: document.getElementById("reorderSuggestedUnits"),
    reorderEstimatedCost: document.getElementById("reorderEstimatedCost"),
    reorderFastestItem: document.getElementById("reorderFastestItem"),
    reorderPlanBody: document.getElementById("reorderPlanBody"),
    slowMovingCard: document.getElementById("slowMovingCard"),
    slowMovingCount: document.getElementById("slowMovingCount"),
    slowMovingUnits: document.getElementById("slowMovingUnits"),
    slowMovingValue: document.getElementById("slowMovingValue"),
    slowMovingIdleCount: document.getElementById("slowMovingIdleCount"),
    slowMovingIdleCountInline: document.getElementById(
      "slowMovingIdleCountInline",
    ),
    slowMovingTopItem: document.getElementById("slowMovingTopItem"),
    slowMovingAverageCover: document.getElementById("slowMovingAverageCover"),
    slowMovingBody: document.getElementById("slowMovingBody"),
    fromDate: document.getElementById("fromDate"),
    toDate: document.getElementById("toDate"),
    loadSalesBtn: document.getElementById("loadSalesBtn"),
    pdfBtn: document.getElementById("pdfBtn"),
    excelBtn: document.getElementById("excelBtn"),
    salesReportBody: document.getElementById("salesReportBody"),
    salesGrandTotal: document.getElementById("salesGrandTotal"),
    salesGstTotal: document.getElementById("salesGstTotal"),
    salesSubtotalTotal: document.getElementById("salesSubtotalTotal"),
    salesNetProfitCard: document.getElementById("salesNetProfitCard"),
    salesNetProfitFromDate: document.getElementById("salesNetProfitFromDate"),
    salesNetProfitToDate: document.getElementById("salesNetProfitToDate"),
    loadSalesNetProfitBtn: document.getElementById("loadSalesNetProfitBtn"),
    salesNetProfitValue: document.getElementById("salesNetProfitValue"),
    salesNetProfitNote: document.getElementById("salesNetProfitNote"),
    gstFromDate: document.getElementById("gstFromDate"),
    gstToDate: document.getElementById("gstToDate"),
    loadGstBtn: document.getElementById("loadGstBtn"),
    gstPdfBtn: document.getElementById("gstPdfBtn"),
    gstExcelBtn: document.getElementById("gstExcelBtn"),
    gstReportBody: document.getElementById("gstReportBody"),
    gstInvoiceCount: document.getElementById("gstInvoiceCount"),
    gstTaxableTotal: document.getElementById("gstTaxableTotal"),
    gstCollectedTotal: document.getElementById("gstCollectedTotal"),
    gstReportGrandTotal: document.getElementById("gstReportGrandTotal"),
    gstAveragePerInvoice: document.getElementById("gstAveragePerInvoice"),
    gstEffectiveRate: document.getElementById("gstEffectiveRate"),
    gstFilingPeriod: document.getElementById("gstFilingPeriod"),
    gstTopCollectionMonth: document.getElementById("gstTopCollectionMonth"),
    gstZeroRatedInvoices: document.getElementById("gstZeroRatedInvoices"),
    gstDominantRate: document.getElementById("gstDominantRate"),
    gstMonthlySummaryBody: document.getElementById("gstMonthlySummaryBody"),
    gstRateSummaryBody: document.getElementById("gstRateSummaryBody"),
    yearFilter: document.getElementById("yearFilter"),
    growthLivePill: document.getElementById("growthLivePill"),
    growthRangeLabel: document.getElementById("growthRangeLabel"),
    growthRangeNote: document.getElementById("growthRangeNote"),
    growthLatestValue: document.getElementById("growthLatestValue"),
    growthLatestNote: document.getElementById("growthLatestNote"),
    growthPeakValue: document.getElementById("growthPeakValue"),
    growthPeakNote: document.getElementById("growthPeakNote"),
    businessTrendChart: document.getElementById("businessTrendChart"),
    growthBadge: document.getElementById("growthBadge"),
    last12MonthsChart: document.getElementById("last12MonthsChart"),
    cdName: document.getElementById("cdName"),
    cdNumber: document.getElementById("cdNumber"),
    cdNumberDropdown: document.getElementById("cdNumberDropdown"),
    cdTotal: document.getElementById("cdTotal"),
    cdCredit: document.getElementById("cdCredit"),
    cdRemark: document.getElementById("cdRemark"),
    cdEntryType: document.getElementById("cdEntryType"),
    cdEntryTypeMeta: document.getElementById("cdEntryTypeMeta"),
    cdImpactValue: document.getElementById("cdImpactValue"),
    cdImpactMeta: document.getElementById("cdImpactMeta"),
    cdWorkflowValue: document.getElementById("cdWorkflowValue"),
    cdWorkflowMeta: document.getElementById("cdWorkflowMeta"),
    submitDebtBtn: document.getElementById("submitDebtBtn"),
    clearDebtBtn: document.getElementById("clearDebtBtn"),
    cdSearchInput: document.getElementById("cdSearchInput"),
    cdSearchDropdown: document.getElementById("cdSearchDropdown"),
    searchLedgerBtn: document.getElementById("searchLedgerBtn"),
    showAllDuesBtn: document.getElementById("showAllDuesBtn"),
    refreshDueLedgerBtn: document.getElementById("refreshDueLedgerBtn"),
    dueLedgerViewPill: document.getElementById("dueLedgerViewPill"),
    dueLedgerFocusPill: document.getElementById("dueLedgerFocusPill"),
    dueLedgerStatPill: document.getElementById("dueLedgerStatPill"),
    dueLedgerHintPill: document.getElementById("dueLedgerHintPill"),
    ledgerTable: document.getElementById("ledgerTable"),
    expenseTitle: document.getElementById("expenseTitle"),
    expenseCategory: document.getElementById("expenseCategory"),
    expenseAmount: document.getElementById("expenseAmount"),
    expensePaymentMode: document.getElementById("expensePaymentMode"),
    expenseDate: document.getElementById("expenseDate"),
    expenseNote: document.getElementById("expenseNote"),
    submitExpenseBtn: document.getElementById("submitExpenseBtn"),
    expenseSummaryTotal: document.getElementById("expenseSummaryTotal"),
    expenseSummaryEntryCount: document.getElementById(
      "expenseSummaryEntryCount",
    ),
    expenseSummaryCategory: document.getElementById("expenseSummaryCategory"),
    expenseSummaryCategoryNote: document.getElementById(
      "expenseSummaryCategoryNote",
    ),
    expenseSummaryGrossProfit: document.getElementById(
      "expenseSummaryGrossProfit",
    ),
    expenseSummaryNetProfit: document.getElementById("expenseSummaryNetProfit"),
    expenseSummaryNetProfitNote: document.getElementById(
      "expenseSummaryNetProfitNote",
    ),
    expenseFromDate: document.getElementById("expenseFromDate"),
    expenseToDate: document.getElementById("expenseToDate"),
    expenseSearchInput: document.getElementById("expenseSearchInput"),
    expenseSearchDropdown: document.getElementById("expenseSearchDropdown"),
    loadExpenseReportBtn: document.getElementById("loadExpenseReportBtn"),
    expenseReportBody: document.getElementById("expenseReportBody"),
    supportRefreshBtn: document.getElementById("supportRefreshBtn"),
    supportStatusPill: document.getElementById("supportStatusPill"),
    supportThreadIdPill: document.getElementById("supportThreadIdPill"),
    supportLastUpdatedPill: document.getElementById("supportLastUpdatedPill"),
    supportThreadBody: document.getElementById("supportThreadBody"),
    supportMessageInput: document.getElementById("supportMessageInput"),
    supportComposerStatus: document.getElementById("supportComposerStatus"),
    supportSendBtn: document.getElementById("supportSendBtn"),
    staffName: document.getElementById("staffName"),
    staffUsername: document.getElementById("staffUsername"),
    staffPassword: document.getElementById("staffPassword"),
    staffPermissionGrid: document.getElementById("staffPermissionGrid"),
    selectAllStaffPagesBtn: document.getElementById("selectAllStaffPagesBtn"),
    clearAllStaffPagesBtn: document.getElementById("clearAllStaffPagesBtn"),
    createStaffBtn: document.getElementById("createStaffBtn"),
    staffList: document.getElementById("staffList"),
    staffLimitValue: document.getElementById("staffLimitValue"),
    staffRemainingValue: document.getElementById("staffRemainingValue"),
    commonPopup: document.getElementById("commonPopup"),
    popupOverlay: document.getElementById("popupOverlay"),
    popupBox: document.getElementById("popupBox"),
    popupIcon: document.getElementById("popupIcon"),
    popupTitle: document.getElementById("popupTitle"),
    popupMessage: document.getElementById("popupMessage"),
    popupClose: document.getElementById("popupClose"),
  });
}

async function fetchJSON(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const requestOptions = {
    ...options,
    credentials: "include",
    headers: authHeaders(headers),
  };

  if (String(path || "").startsWith("/support")) {
    requestOptions.cache = "no-store";
  }

  const response = await fetch(`${apiBase}${path}`, {
    ...requestOptions,
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch (error) {
    payload = {};
  }

  if (response.status === 401) {
    const authError = new Error(
      payload.error || payload.message || "Session expired",
    );
    authError.code = "SESSION_EXPIRED";
    handleSessionExpiry();
    throw authError;
  }

  if (!response.ok) {
    throw new Error(payload.error || payload.message || "Request failed");
  }

  return payload;
}

async function downloadAuthenticatedFile(path, fallbackName) {
  const response = await fetch(`${apiBase}${path}`, {
    credentials: "include",
    headers: authHeaders(),
  });

  let payload = {};
  if (!response.ok || response.status === 401) {
    try {
      payload = await response.json();
    } catch (error) {
      payload = {};
    }

    if (response.status === 401) {
      const authError = new Error(
        payload.error || payload.message || "Session expired",
      );
      authError.code = "SESSION_EXPIRED";
      handleSessionExpiry();
      throw authError;
    }

    throw new Error(payload.error || payload.message || "Download failed");
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/i);
  const filename = match?.[1] || fallbackName;
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    window.URL.revokeObjectURL(blobUrl);
  }, 1500);
}

async function logoutAndRedirect() {
  try {
    await fetchJSON("/auth/logout", { method: "POST" });
  } catch (error) {
    console.error("Logout request failed:", error);
  } finally {
    clearStoredSession();
    window.location.replace("login.html");
  }
}

async function withButtonState(button, loadingHtml, task) {
  if (!button) {
    await task();
    return;
  }

  const originalHtml = button.innerHTML;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.innerHTML = loadingHtml;

  try {
    await task();
  } finally {
    button.disabled = false;
    button.setAttribute("aria-busy", "false");
    button.innerHTML = originalHtml;
  }
}

function triggerButtonFeedback(button, duration = 280) {
  if (!button) {
    return;
  }

  button.classList.remove("is-click-animating");
  void button.offsetWidth;
  button.classList.add("is-click-animating");

  window.setTimeout(() => {
    button.classList.remove("is-click-animating");
  }, duration);
}

function showPopup(type, title, message, options = {}) {
  if (!dom.commonPopup) {
    return;
  }

  const iconMap = {
    success: '<i class="fa-solid fa-circle-check"></i>',
    error: '<i class="fa-solid fa-circle-xmark"></i>',
    info: '<i class="fa-solid fa-circle-info"></i>',
  };

  window.clearTimeout(state.popupTimer);
  state.popupTimer = null;

  dom.popupBox.classList.remove("success", "error");
  if (type === "success" || type === "error") {
    dom.popupBox.classList.add(type);
  }

  dom.popupIcon.innerHTML = iconMap[type] || iconMap.info;
  dom.popupTitle.textContent = title;
  dom.popupMessage.textContent = message;
  dom.commonPopup.classList.add("active");
  dom.commonPopup.setAttribute("aria-hidden", "false");

  if (options.autoClose !== false && type === "success") {
    state.popupTimer = window.setTimeout(() => {
      hidePopup();
    }, options.delay || 2200);
  }
}

function hidePopup() {
  if (!dom.commonPopup) {
    return;
  }

  window.clearTimeout(state.popupTimer);
  state.popupTimer = null;
  dom.commonPopup.classList.remove("active");
  dom.commonPopup.setAttribute("aria-hidden", "true");
}

function updateCurrentDateLabel() {
  dom.currentDateLabel.textContent = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function setCustomerNameLocked(locked) {
  dom.cdName.disabled = locked;
  dom.cdName.classList.toggle("bg-light", locked);
  updateCustomerDuePreview();
}

function resetCustomerDueForm(options = {}) {
  ["cdName", "cdNumber", "cdTotal", "cdCredit", "cdRemark"].forEach((id) => {
    const field = document.getElementById(id);
    if (field) {
      field.value = "";
    }
  });

  setCustomerNameLocked(false);
  hideElement(dom.cdNumberDropdown);

  if (options.focus && dom.cdName) {
    dom.cdName.focus();
  }
}

function getDueFormSnapshot() {
  const customerName = dom.cdName?.value.trim() || "";
  const customerNumber = dom.cdNumber?.value.trim() || "";
  const total = Number(dom.cdTotal?.value) || 0;
  const credit = Number(dom.cdCredit?.value) || 0;
  const balanceImpact = Number((total - credit).toFixed(2));
  const hasExactNumber = /^\d{10}$/.test(customerNumber);
  const isMatchedCustomer = Boolean(dom.cdName?.disabled && hasExactNumber);

  let entryType = "Waiting";
  let entryTypeMeta = "Start with customer and amount details.";
  let impactValue = formatCurrency(0);
  let impactMeta = "The live preview updates as you type.";
  let workflowValue = customerName ? "Manual entry" : "Ready";
  let workflowMeta = hasExactNumber
    ? "This customer number can be linked to a precise ledger."
    : "Invoice-linked settlement guidance will appear here.";

  if (total > 0 && credit > 0) {
    entryType = "Mixed update";
    entryTypeMeta =
      "An opening due and a same-entry credit will be recorded together.";
  } else if (total > 0) {
    entryType = "New due";
    entryTypeMeta = "A new outstanding balance will be added to the ledger.";
  } else if (credit > 0) {
    entryType = "Collection";
    entryTypeMeta = "A payment receipt will be saved for this customer.";
  }

  if (balanceImpact > 0.009) {
    impactValue = `+ ${formatCurrency(balanceImpact)}`;
    impactMeta = "This much balance will stay pending after the entry.";
  } else if (balanceImpact < -0.009) {
    impactValue = `- ${formatCurrency(Math.abs(balanceImpact))}`;
    impactMeta = "This entry reduces the running customer balance.";
  } else if (total > 0 || credit > 0) {
    impactMeta = "This entry balances total and credit with no net due change.";
  }

  if (credit > 0 && total === 0) {
    workflowValue = isMatchedCustomer
      ? "Invoice-aware collection"
      : "Credit collection";
    workflowMeta = hasExactNumber
      ? "Available unpaid invoice dues for this customer number will be settled first."
      : "Enter the exact 10-digit number to connect the collection to invoice dues.";
  } else if (total > 0 && credit > 0) {
    workflowValue = "Opening + collection";
    workflowMeta =
      "Useful when part of the amount is paid immediately and the rest remains due.";
  } else if (total > 0) {
    workflowValue = isMatchedCustomer ? "Matched ledger" : "New ledger";
    workflowMeta =
      "The remaining amount will stay available for later collection and search.";
  } else if (isMatchedCustomer) {
    workflowValue = "Matched customer";
    workflowMeta =
      "The customer name is locked from the saved ledger for cleaner tracking.";
  }

  if (total > 0 && credit > total) {
    impactMeta = "Credit is higher than total. Reduce it before saving.";
  }

  return {
    entryType,
    entryTypeMeta,
    impactAmount: balanceImpact,
    impactValue,
    impactMeta,
    workflowValue,
    workflowMeta,
  };
}

function updateCustomerDuePreview() {
  const snapshot = getDueFormSnapshot();

  if (dom.cdEntryType) {
    dom.cdEntryType.textContent = snapshot.entryType;
  }

  if (dom.cdEntryTypeMeta) {
    dom.cdEntryTypeMeta.textContent = snapshot.entryTypeMeta;
  }

  if (dom.cdImpactValue) {
    dom.cdImpactValue.className = getDueBalancePillClass(snapshot.impactAmount);
    dom.cdImpactValue.textContent = `Balance Impact: ${snapshot.impactValue}`;
  }

  if (dom.cdImpactMeta) {
    dom.cdImpactMeta.textContent = snapshot.impactMeta;
  }

  if (dom.cdWorkflowValue) {
    dom.cdWorkflowValue.textContent = snapshot.workflowValue;
  }

  if (dom.cdWorkflowMeta) {
    dom.cdWorkflowMeta.textContent = snapshot.workflowMeta;
  }
}

function getDueBalancePillClass(value) {
  const normalizedValue = Number(value) || 0;

  if (normalizedValue < -0.009) {
    return "due-balance-pill due-balance-pill--credit";
  }

  if (normalizedValue <= 0.009) {
    return "due-balance-pill due-balance-pill--neutral";
  }

  return "due-balance-pill due-balance-pill--positive";
}

function renderDueBalancePill(value) {
  return `<span class="${getDueBalancePillClass(value)}">${formatCurrency(value)}</span>`;
}

function updateDueWorkspaceMeta() {
  const summaryCount = Number(state.dueSummaryCustomerCount) || 0;
  const isLedgerView =
    state.ledgerMode === "ledger" && Boolean(state.currentLedgerNumber);
  let viewLabel = "Ready";
  let viewPillClass = "summary-pill summary-pill--success";
  let focusPillText = "No customer selected";
  let statPillText = "";
  let hintPillText = "Search a customer or load the full ledger summary.";

  if (isLedgerView) {
    viewLabel = "Customer Ledger";
    viewPillClass = "summary-pill summary-pill--warn";
    focusPillText = `${state.currentLedgerName || "Customer"} - ${state.currentLedgerNumber}`;
    statPillText = `Outstanding: ${formatCurrency(state.currentLedgerOutstanding)}`;
    hintPillText = `${formatCount(state.currentLedgerEntryCount)} timeline entr${state.currentLedgerEntryCount === 1 ? "y" : "ies"}`;
  } else if (state.ledgerMode === "summary") {
    viewLabel = "All Customers";
    focusPillText = `${formatCount(summaryCount)} customer${summaryCount === 1 ? "" : "s"} loaded`;
    statPillText = `Outstanding: ${formatCurrency(state.dueSummaryOutstanding)}`;
    hintPillText = "Click a row to open full ledger details.";
  }

  if (dom.dueLedgerViewPill) {
    dom.dueLedgerViewPill.className = viewPillClass;
    dom.dueLedgerViewPill.textContent = viewLabel;
  }

  if (dom.dueLedgerFocusPill) {
    dom.dueLedgerFocusPill.textContent = focusPillText;
  }

  if (dom.dueLedgerStatPill) {
    dom.dueLedgerStatPill.hidden = !statPillText;
    dom.dueLedgerStatPill.textContent = statPillText;
  }

  if (dom.dueLedgerHintPill) {
    dom.dueLedgerHintPill.textContent = hintPillText;
  }

  if (dom.showAllDuesBtn) {
    dom.showAllDuesBtn.innerHTML =
      '<i class="fas fa-list"></i> Search all Customers';
  }
}

function hidePreviousBuyingRate() {
  hideElement(dom.previousBuyingRate);
  dom.previousBuyingRate.textContent = "";
}

function normalizeProfitPercentValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Number(parsed.toFixed(2));
}

function updateProfitPreview() {
  const percent = Number(dom.profitPercent.value);
  const buyingRate = Number(dom.buyingRate.value);
  const sellingRate = Number(dom.sellingRate.value);

  dom.profitPreviewValue.textContent = `${formatNumber(percent || 0)}%`;

  if (buyingRate > 0 && sellingRate > 0) {
    dom.profitPreviewNote.textContent = `Buying ${formatCurrency(buyingRate)} suggests selling ${formatCurrency(sellingRate)}.`;
    return;
  }

  dom.profitPreviewNote.textContent =
    "Saved in business settings so future stock entries stay faster and more consistent.";
}

function updateSellingRate() {
  const buyingRate = Number(dom.buyingRate.value);
  const percent = Number(dom.profitPercent.value);

  if (Number.isFinite(buyingRate) && Number.isFinite(percent)) {
    const sellingRate = buyingRate * (1 + percent / 100);
    dom.sellingRate.value = sellingRate.toFixed(2);
  }

  updateProfitPreview();
}

function updateProfitPercent() {
  const buyingRate = Number(dom.buyingRate.value);
  const sellingRate = Number(dom.sellingRate.value);

  if (buyingRate > 0 && Number.isFinite(sellingRate)) {
    const percent = ((sellingRate - buyingRate) / buyingRate) * 100;
    const rounded = percent.toFixed(2);
    dom.profitPercent.value = rounded;
    queueProfitPercentSave();
  }

  updateProfitPreview();
}

function applySharedProfitPercent(value) {
  const normalized = normalizeProfitPercentValue(value);
  if (normalized === null) {
    return null;
  }

  dom.profitPercent.value = normalized.toFixed(2);
  updateSellingRate();
  return normalized;
}

async function saveProfitPercentDefault(value, options = {}) {
  const normalized = normalizeProfitPercentValue(value);
  if (normalized === null) {
    return false;
  }

  const requestId = ++state.profitSaveRequestId;

  try {
    const data = await fetchJSON("/stock-defaults", {
      method: "PUT",
      body: JSON.stringify({
        default_profit_percent: normalized,
      }),
    });

    const savedValue = normalizeProfitPercentValue(
      data?.settings?.default_profit_percent,
    );

    if (requestId === state.profitSaveRequestId) {
      state.lastSavedProfitPercent = savedValue ?? normalized;
      localStorage.removeItem("defaultProfitPercent");
    }

    return true;
  } catch (error) {
    console.error("Profit percent auto-save failed:", error);

    if (options.silent !== true) {
      showPopup(
        "error",
        "Save failed",
        "Default profit percent could not be saved right now.",
        { autoClose: false },
      );
    }

    return false;
  }
}

function queueProfitPercentSave(value = dom.profitPercent.value) {
  const normalized = normalizeProfitPercentValue(value);

  window.clearTimeout(state.profitSaveTimer);
  state.profitSaveTimer = null;

  if (normalized === null || normalized === state.lastSavedProfitPercent) {
    return;
  }

  state.profitSaveTimer = window.setTimeout(() => {
    state.profitSaveTimer = null;
    saveProfitPercentDefault(normalized, { silent: true });
  }, 450);
}

async function loadProfitPercentDefault() {
  const legacyValue = normalizeProfitPercentValue(
    localStorage.getItem("defaultProfitPercent"),
  );

  try {
    const data = await fetchJSON("/stock-defaults");
    const savedValue = normalizeProfitPercentValue(
      data?.settings?.default_profit_percent,
    );

    if (savedValue !== null) {
      state.lastSavedProfitPercent = savedValue;
      dom.profitPercent.value = savedValue.toFixed(2);
      updateSellingRate();
      localStorage.removeItem("defaultProfitPercent");
      return savedValue;
    }
  } catch (error) {
    console.error("Profit percent load failed:", error);
  }

  if (legacyValue !== null) {
    dom.profitPercent.value = legacyValue.toFixed(2);
    updateSellingRate();
    await saveProfitPercentDefault(legacyValue, { silent: true });
    return legacyValue;
  }

  state.lastSavedProfitPercent = normalizeProfitPercentValue(
    dom.profitPercent.value,
  );
  updateProfitPreview();
  return state.lastSavedProfitPercent;
}

function updateHeroSummary(metrics = {}) {
  const bits = [];
  const itemCount = Number(metrics.itemCount) || 0;
  const lowStockCount = Number(metrics.lowStockCount) || 0;
  const dueCustomerCount = Number(metrics.dueCustomerCount) || 0;

  if (itemCount > 0) {
    bits.push(`${formatCount(itemCount)} catalog items tracked`);
  }

  if (lowStockCount > 0) {
    bits.push(
      `${formatCount(lowStockCount)} item${lowStockCount === 1 ? "" : "s"} need stock attention`,
    );
  }

  if (dueCustomerCount > 0) {
    bits.push(
      `${formatCount(dueCustomerCount)} customer${dueCustomerCount === 1 ? "" : "s"} have pending dues`,
    );
  }

  dom.heroSubtitle.textContent = bits.length
    ? `Today: ${bits.join(" | ")}.`
    : "Your dashboard is ready to track stock, reports, invoices, and dues from one polished workspace.";
}

function applySessionAccess(user) {
  state.sessionUser = user;

  const isStaff = user?.role === "staff";
  const ownerName = (user?.ownerName || "").trim();
  const accessSummary = formatPermissionSummary(user?.permissions, {
    short: true,
  });

  if (dom.sessionRoleChip) {
    dom.sessionRoleChip.innerHTML = isStaff
      ? '<i class="fa-solid fa-user-lock"></i> Staff Workspace'
      : '<i class="fa-solid fa-shield-halved"></i> Owner Workspace';
  }

  if (dom.salesNetProfitCard) {
    dom.salesNetProfitCard.hidden = !canAccessPermission("expense_tracking");
  }

  if (dom.invoiceBtn) {
    dom.invoiceBtn.hidden = !canAccessInvoicePage();
  }

  dom.sectionButtons.forEach((button) => {
    const sectionId = button.dataset.section;
    button.hidden = !canAccessSection(sectionId);
  });

  dom.formSections.forEach((section) => {
    section.hidden = !canAccessSection(section.id);
  });

  const displayName = (user?.name || "").trim() || "Workspace User";
  dom.welcomeUser.textContent = `Welcome, ${displayName}`;
  dom.heroSubtitle.textContent = isStaff
    ? `${ownerName || "Your owner"} assigned access to ${accessSummary}.`
    : "Your dashboard is syncing the latest inventory and sales view.";

  updateOverviewVisibility();
}

function updateOverviewVisibility(sectionId = "") {
  if (!dom.overviewGrid) {
    return;
  }

  const activeSectionId =
    sectionId ||
    dom.formSections.find((section) => section.classList.contains("active"))
      ?.id ||
    localStorage.getItem("activeSection") ||
    "";

  const isStaff = state.sessionUser?.role === "staff";
  dom.overviewGrid.hidden =
    isStaff || activeSectionId === "supportChatSection";
}

function setActiveSection(sectionId) {
  if (!canAccessSection(sectionId)) {
    const fallbackSection = getFirstAccessibleSection();
    if (!fallbackSection) {
      if (canAccessInvoicePage()) {
        sidebarController?.close();
        window.location.replace("invoice.html");
      }
      return;
    }
    sectionId = fallbackSection;
  }

  const target = document.getElementById(sectionId);
  if (!target) {
    return;
  }

  dom.formSections.forEach((section) => {
    section.classList.toggle("active", section.id === sectionId);
  });

  dom.sectionButtons.forEach((button) => {
    const isActive = button.dataset.section === sectionId;
    button.classList.toggle("active", isActive);
  });

  localStorage.setItem("activeSection", sectionId);
  updateOverviewVisibility(sectionId);

  if (sectionId === "itemReportSection") {
    loadLowStock({ silent: true });
  }

  if (
    sectionId === "purchaseEntrySection" &&
    canAccessPermission("purchase_entry")
  ) {
    loadPurchaseReport({ silent: true });
    showAllSupplierSummary({ silent: true });
  }

  if (
    sectionId === "salesReportSection" &&
    canAccessPermission("sales_report")
  ) {
    void ensureSalesWorkspaceReady({ silent: true });
  }

  if (sectionId === "staffAccessSection" && isOwnerSession()) {
    loadStaffAccounts({ silent: true });
  }

  if (
    sectionId === "expenseTrackingSection" &&
    canAccessPermission("expense_tracking")
  ) {
    loadExpenseReport({ silent: true });
  }

  if (sectionId === "supportChatSection") {
    void loadSupportThread({ silent: true });
  }

  if (isMobileLayout()) {
    sidebarController?.close();
  }
}

function formatSupportMessageText(value) {
  return escapeHtml(value || "").replace(/\n/g, "<br />");
}

function setSupportComposerStatus(message, tone = "muted") {
  if (!dom.supportComposerStatus) {
    return;
  }

  dom.supportComposerStatus.textContent = message;
  dom.supportComposerStatus.dataset.tone = tone;
}

function renderSupportEmptyState(message, title = "Start your support thread") {
  if (!dom.supportThreadBody) {
    return;
  }

  dom.supportThreadBody.innerHTML = `
    <div class="support-thread-empty">
      <i class="fa-solid fa-comment-dots"></i>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function renderSupportThread() {
  if (!dom.supportThreadBody) {
    return;
  }

  const conversation = state.supportConversation;
  const messages = Array.isArray(state.supportMessages)
    ? state.supportMessages
    : [];

  if (dom.supportStatusPill) {
    const isClosed = conversation?.status === "closed";
    const toneClass = isClosed
      ? "summary-pill summary-pill--warn"
      : conversation
        ? "summary-pill summary-pill--success"
        : "summary-pill summary-pill--neutral";
    const label = isClosed
      ? "your complain is close"
      : conversation
        ? "Your Complain is open"
        : "Waiting to start";

    dom.supportStatusPill.className = toneClass;
    dom.supportStatusPill.innerHTML = `
      <i class="fa-solid fa-circle-nodes"></i>
      ${escapeHtml(label)}
    `;
  }

  if (dom.supportThreadIdPill) {
    dom.supportThreadIdPill.innerHTML = `
      <i class="fa-solid fa-lock"></i>
      Live chat Support with Customer care
    `;
  }

  if (dom.supportLastUpdatedPill) {
    dom.supportLastUpdatedPill.innerHTML = conversation?.lastMessageAt
      ? `
        <i class="fa-solid fa-clock"></i>
        Updated ${escapeHtml(formatDateTime(conversation.lastMessageAt))}
      `
      : `
        <i class="fa-solid fa-clock"></i>
        No messages yet
      `;
  }

  if (!conversation || !messages.length) {
    renderSupportEmptyState(
      "Send the first message with your issue, and customer care support replies will appear here in the same private timeline.",
    );
    return;
  }

  dom.supportThreadBody.innerHTML = messages
    .map((message) => {
      const isUser = message.senderType === "user";
      const roleClass = isUser
        ? "support-message support-message--user"
        : "support-message support-message--developer";
      const senderLabel = isUser
        ? "You"
        : message.senderName || "Developer Support";

      return `
        <article class="${roleClass}">
          <div class="support-message__meta">
            <strong>${escapeHtml(senderLabel)}</strong>
            <span>${escapeHtml(formatDateTime(message.createdAt))}</span>
          </div>
          <div class="support-message__bubble">
            <p>${formatSupportMessageText(message.text)}</p>
          </div>
        </article>
      `;
    })
    .join("");

  dom.supportThreadBody.scrollTop = dom.supportThreadBody.scrollHeight;
}

function setSupportRefreshLoading(isLoading) {
  if (!dom.supportRefreshBtn) {
    return;
  }

  dom.supportRefreshBtn.classList.toggle("is-loading", Boolean(isLoading));
  dom.supportRefreshBtn.disabled = Boolean(isLoading);
  dom.supportRefreshBtn.setAttribute("aria-busy", isLoading ? "true" : "false");
}

async function loadSupportThread(options = {}) {
  if (!dom.supportThreadBody || !state.sessionUser) {
    return null;
  }

  const requestId = ++state.supportLoadRequestId;
  const shouldAnimateRefresh = options.showRefreshAnimation === true;

  if (shouldAnimateRefresh) {
    setSupportRefreshLoading(true);
  }

  try {
    const data = await fetchJSON("/support/thread");
    if (requestId !== state.supportLoadRequestId) {
      return data;
    }

    state.supportConversation = data?.conversation || null;
    state.supportMessages = Array.isArray(data?.messages) ? data.messages : [];
    renderSupportThread();

    if (state.supportConversation) {
      setSupportComposerStatus(
        "This thread stays linked to your current login and customer care support.",
      );
    } else {
      setSupportComposerStatus(
        "Messages stay private to this login and the customer care support inbox.",
      );
    }

    return data;
  } catch (error) {
    console.error("Support thread load failed:", error);

    if (requestId !== state.supportLoadRequestId) {
      return null;
    }

    state.supportConversation = null;
    state.supportMessages = [];
    renderSupportEmptyState(
      "We could not load your support thread right now. Please try refreshing again.",
      "Support thread unavailable",
    );

    if (!options.silent) {
      setSupportComposerStatus(
        "Support messages could not be loaded right now.",
        "error",
      );
    }

    return null;
  } finally {
    if (shouldAnimateRefresh) {
      setSupportRefreshLoading(false);
    }
  }
}

async function submitSupportMessage() {
  if (!dom.supportMessageInput || !dom.supportSendBtn) {
    return;
  }

  const message = String(dom.supportMessageInput.value || "")
    .replace(/\r/g, "")
    .trim();

  if (!message) {
    setSupportComposerStatus(
      "Write a short message before sending it to customer care support.",
      "error",
    );
    dom.supportMessageInput.focus();
    return;
  }

  if (message.length > 2000) {
    setSupportComposerStatus(
      "Support messages can be up to 2000 characters long.",
      "error",
    );
    dom.supportMessageInput.focus();
    return;
  }

  setSupportComposerStatus("Sending your message to customer care support...");

  try {
    await withButtonState(
      dom.supportSendBtn,
      '<i class="fa-solid fa-spinner fa-spin"></i> Sending...',
      async () => {
        await fetchJSON("/support/messages", {
          method: "POST",
          body: JSON.stringify({ message }),
        });
      },
    );

    dom.supportMessageInput.value = "";
    await loadSupportThread({ silent: true });
    setSupportComposerStatus(
      "Your message was sent. Customer care support can reply in this same thread.",
      "success",
    );
  } catch (error) {
    console.error("Support message send failed:", error);
    setSupportComposerStatus(
      error.message || "We could not send the support message right now.",
      "error",
    );
  }
}

function bindSupportEvents() {
  if (!dom.supportSendBtn || !dom.supportMessageInput) {
    return;
  }

  dom.supportRefreshBtn?.addEventListener("click", () => {
    loadSupportThread({ showRefreshAnimation: true });
  });

  dom.supportSendBtn.addEventListener("click", submitSupportMessage);

  dom.supportMessageInput.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      submitSupportMessage();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && getActiveSectionId() === "supportChatSection") {
      void loadSupportThread({ silent: true });
    }
  });

  if (!state.supportPollTimer) {
    state.supportPollTimer = window.setInterval(() => {
      if (document.hidden || getActiveSectionId() !== "supportChatSection") {
        return;
      }

      void loadSupportThread({ silent: true });
    }, 5000);
  }
}

function renderDropdown(listEl, items, onSelect) {
  if (!items.length) {
    hideElement(listEl);
    listEl.innerHTML = "";
    listEl.onclick = null;
    return;
  }

  listEl.innerHTML = items
    .map((item) => {
      return `
        <div
          class="dropdown-item"
          data-value="${encodeURIComponent(item)}"
        >
          ${escapeHtml(item)}
        </div>
      `;
    })
    .join("");

  showElement(listEl);
  listEl.onclick = (event) => {
    const entry = event.target.closest(".dropdown-item");
    if (!entry || !listEl.contains(entry)) {
      return;
    }

    onSelect(decodeURIComponent(entry.dataset.value));
    hideElement(listEl);
  };
}

function setupFilterInput(input, listEl, onSelect) {
  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();

    if (!query) {
      renderDropdown(
        listEl,
        getSearchMatches(state.itemNameSearchIndex, "", 50),
        onSelect,
      );
      return;
    }

    const matches = getSearchMatches(state.itemNameSearchIndex, query, 50);

    renderDropdown(listEl, matches, onSelect);
  });

  input.addEventListener("focus", () => {
    renderDropdown(
      listEl,
      getSearchMatches(state.itemNameSearchIndex, "", 50),
      onSelect,
    );
  });

  document.addEventListener("click", (event) => {
    if (!input.contains(event.target) && !listEl.contains(event.target)) {
      hideElement(listEl);
    }
  });
}

async function checkAuth() {
  try {
    return await fetchJSON("/auth/me");
  } catch (error) {
    if (error?.code === "SESSION_EXPIRED") {
      return null;
    }

    console.error("Auth check failed:", error);
    clearStoredSession();
    showPopup("error", "Session expired", "Please log in again to continue.", {
      autoClose: false,
    });
    window.setTimeout(() => {
      window.location.replace("login.html");
    }, 1500);
    return null;
  } finally {
    markDashboardReady();
  }
}

async function loadItemNames(options = {}) {
  try {
    const rows = await fetchJSON("/items/names");
    state.itemNames = Array.isArray(rows) ? rows : [];
    state.itemNameSearchIndex = buildStringSearchIndex(state.itemNames);
    state.itemNameLookup = buildStringLookup(state.itemNameSearchIndex);
    return state.itemNames;
  } catch (error) {
    console.error("Item names load failed:", error);
    state.itemNames = [];
    state.itemNameSearchIndex = [];
    state.itemNameLookup = new Map();
    if (!options.silent) {
      showPopup("error", "Load failed", "Could not load item names.", {
        autoClose: false,
      });
    }
    return [];
  }
}

async function showPreviousBuyingRate(itemName) {
  const trimmedName = itemName.trim();
  if (!trimmedName) {
    hidePreviousBuyingRate();
    return;
  }

  try {
    const item = await fetchJSON(
      `/items/info?name=${encodeURIComponent(trimmedName)}`,
    );
    if (findExactItemName(dom.newItemSearch?.value.trim() || "") !== trimmedName) {
      return;
    }
    const previousRate = Number(item.buying_rate);

    if (!Number.isFinite(previousRate)) {
      hidePreviousBuyingRate();
      return;
    }

    dom.previousBuyingRate.textContent = `Previous buying rate: ${formatCurrency(previousRate)}`;
    showElement(dom.previousBuyingRate);
    dom.buyingRate.value = previousRate.toFixed(2);
    updateSellingRate();
  } catch (error) {
    hidePreviousBuyingRate();
  }
}

async function loadDashboardOverview(options = {}) {
  if (!isOwnerSession()) {
    return null;
  }

  try {
    const overview = await fetchJSON("/dashboard/overview");
    const itemCount = Number(overview.catalog?.item_count) || 0;
    const totalUnits = Number(overview.catalog?.total_units) || 0;
    const totalCostValue = Number(overview.catalog?.total_cost_value) || 0;
    const totalSellingValue =
      Number(overview.catalog?.total_selling_value) || 0;
    const lowStockCount = Number(overview.alerts?.low_stock_count) || 0;
    const shortestDaysLeft = Number(overview.alerts?.shortest_days_left);
    const mostUrgentItem = overview.alerts?.most_urgent_item || "";
    const dueCustomerCount = Number(overview.dues?.due_customer_count) || 0;
    const dueBalance = Number(overview.dues?.due_balance) || 0;
    const dueSupplierCount =
      Number(overview.purchases?.due_supplier_count) || 0;
    const supplierDue = Number(overview.purchases?.supplier_due) || 0;
    const totalExpense = Number(overview.finance?.total_expense) || 0;
    const netProfit = Number(overview.finance?.net_profit) || 0;

    dom.statCatalogCount.textContent = formatCount(itemCount);
    dom.statCatalogNote.textContent = itemCount
      ? `${formatNumber(totalUnits)} total units currently available in catalog.`
      : "Add your first item to start tracking inventory.";

    dom.statCatalogValue.textContent = formatCurrency(totalCostValue);
    dom.statCatalogValueNote.textContent = itemCount
      ? `Estimated selling value can reach ${formatCurrency(totalSellingValue)}.`
      : "Catalog value updates as soon as stock is saved.";

    dom.statLowStock.textContent = formatCount(lowStockCount);
    dom.statLowStockNote.textContent = lowStockCount
      ? `${mostUrgentItem || "One active item"} needs attention${Number.isFinite(shortestDaysLeft) ? ` in about ${formatNumber(shortestDaysLeft)} day(s)` : ""}.`
      : "No active low-stock alert right now.";

    dom.statDueBalance.textContent = formatCurrency(dueBalance);
    dom.statDueNote.textContent = dueCustomerCount
      ? `${formatCount(dueCustomerCount)} customer${dueCustomerCount === 1 ? "" : "s"} currently have pending balances.`
      : "No outstanding due balance at the moment.";
    state.dueSummaryCustomerCount = dueCustomerCount;
    updateDueWorkspaceMeta();

    if (dom.statSupplierDue) {
      dom.statSupplierDue.textContent = formatCurrency(supplierDue);
      dom.statSupplierDueNote.textContent = dueSupplierCount
        ? `${formatCount(dueSupplierCount)} supplier${dueSupplierCount === 1 ? "" : "s"} currently have unpaid purchase balance.`
        : "No pending supplier payable right now.";
    }

    if (dom.statNetProfit) {
      dom.statNetProfit.textContent = formatCurrency(netProfit);
      dom.statNetProfitNote.textContent = `Tracked expenses: ${formatCurrency(totalExpense)}. Net profit updates as expenses are added.`;
      dom.statNetProfit.classList.toggle("text-danger", netProfit < 0);
      dom.statNetProfit.classList.toggle("text-success", netProfit >= 0);
    }

    updateHeroSummary({ itemCount, lowStockCount, dueCustomerCount });
    return overview;
  } catch (error) {
    console.error("Overview load failed:", error);
    if (!options.silent) {
      showPopup(
        "error",
        "Overview unavailable",
        "Could not load the dashboard overview cards.",
        { autoClose: false },
      );
    }
    return null;
  }
}

async function addStock() {
  const item = dom.newItemSearch.value.trim();
  const quantity = Number(dom.newQuantity.value);
  const buyingRate = Number(dom.buyingRate.value);
  const sellingRate = Number(dom.sellingRate.value);

  if (!item) {
    showPopup("error", "Missing item", "Enter or select an item name.", {
      autoClose: false,
    });
    return;
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    showPopup(
      "error",
      "Invalid quantity",
      "Quantity must be greater than zero.",
      {
        autoClose: false,
      },
    );
    return;
  }

  if (!Number.isFinite(buyingRate) || buyingRate < 0) {
    showPopup(
      "error",
      "Invalid buying rate",
      "Buying rate must be zero or greater.",
      { autoClose: false },
    );
    return;
  }

  if (!Number.isFinite(sellingRate) || sellingRate < 0) {
    showPopup(
      "error",
      "Invalid selling rate",
      "Selling rate must be zero or greater.",
      { autoClose: false },
    );
    return;
  }

  await withButtonState(
    dom.addStockBtn,
    '<i class="fa-solid fa-spinner fa-spin"></i> Saving stock...',
    async () => {
      const data = await fetchJSON("/items", {
        method: "POST",
        body: JSON.stringify({
          name: item,
          quantity,
          buying_rate: buyingRate,
          selling_rate: sellingRate,
        }),
      });

      showPopup(
        "success",
        "Stock saved",
        data.message || "Inventory entry has been updated successfully.",
      );

      ["newItemSearch", "newQuantity", "buyingRate", "sellingRate"].forEach(
        (id) => {
          document.getElementById(id).value = "";
        },
      );

      hidePreviousBuyingRate();
      updateProfitPreview();

      await Promise.allSettled([
        loadItemNames({ silent: true }),
        loadDashboardOverview({ silent: true }),
      ]);

      if (
        document
          .getElementById("itemReportSection")
          .classList.contains("active")
      ) {
        await Promise.allSettled([
          loadItemReport({ silent: true }),
          loadLowStock({ silent: true }),
        ]);
      }
    },
  );
}

function purchaseRows() {
  return Array.from(
    dom.purchaseItemsBody?.querySelectorAll(".purchase-line-card") || [],
  );
}

function getPurchaseDefaultProfitPercent() {
  return (
    normalizeProfitPercentValue(dom.profitPercent?.value) ??
    state.lastSavedProfitPercent ??
    30
  );
}

function updatePurchaseLineLabels() {
  purchaseRows().forEach((row, index) => {
    const title = row.querySelector(".purchase-line-card__title");
    if (title) {
      title.textContent = `Purchase Row ${index + 1}`;
    }
  });
}

function refreshPurchaseAutoRates(options = {}) {
  purchaseRows().forEach((row) => {
    if (options.originRow && row === options.originRow) {
      return;
    }
    if (typeof row.__purchaseRefresh === "function") {
      row.__purchaseRefresh(options);
    }
  });
  updatePurchaseSummary();
}

function normalizePurchasePaidFieldValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : raw;
}

function isPurchaseAmountPaidEditing() {
  return (
    !!dom.purchaseAmountPaid &&
    (dom.purchaseAmountPaid.dataset.editing === "true" ||
      document.activeElement === dom.purchaseAmountPaid)
  );
}

function syncPurchaseAmountPaidAutofill(subtotal) {
  if (!dom.purchaseAmountPaid) {
    return;
  }

  const normalizedSubtotal = Number(subtotal) || 0;
  const autoValue = normalizedSubtotal > 0 ? normalizedSubtotal.toFixed(2) : "";
  const currentValue = normalizePurchasePaidFieldValue(
    dom.purchaseAmountPaid.value,
  );
  const previousAutoValue = normalizePurchasePaidFieldValue(
    dom.purchaseAmountPaid.dataset.autoValue,
  );
  const isManual = dom.purchaseAmountPaid.dataset.manual === "true";

  dom.purchaseAmountPaid.dataset.autoValue = autoValue;

  if (isPurchaseAmountPaidEditing()) {
    return;
  }

  if (!isManual || currentValue === "" || currentValue === previousAutoValue) {
    dom.purchaseAmountPaid.value = autoValue;
    dom.purchaseAmountPaid.dataset.manual = "false";
  }
}

function getPurchasePaymentSnapshot(subtotalValue = null) {
  const subtotal =
    subtotalValue === null
      ? purchaseRows().reduce((sum, row) => {
          return (
            sum +
            (Number(
              row.querySelector(".purchase-line-total")?.dataset.value || "0",
            ) || 0)
          );
        }, 0)
      : Number(subtotalValue) || 0;
  const paymentMode = String(dom.purchasePaymentMode?.value || "cash")
    .trim()
    .toLowerCase();
  const rawPaidInput = String(dom.purchaseAmountPaid?.value ?? "").trim();
  const parsedPaid = rawPaidInput === "" ? null : Number(rawPaidInput);

  let desiredPaid = subtotal;
  if (paymentMode === "credit" && rawPaidInput === "") {
    desiredPaid = 0;
  } else if (parsedPaid !== null && Number.isFinite(parsedPaid)) {
    desiredPaid = parsedPaid;
  }

  const amountPaid = Number(
    Math.min(Math.max(desiredPaid, 0), subtotal).toFixed(2),
  );
  const amountDue = Number((subtotal - amountPaid).toFixed(2));
  let paymentStatus = "paid";

  if (amountDue > 0 && amountPaid > 0) {
    paymentStatus = "partial";
  } else if (amountDue > 0) {
    paymentStatus = "due";
  }

  return {
    subtotal,
    rawPaidInput,
    amountPaid,
    amountDue,
    paymentMode,
    paymentStatus,
  };
}

function updatePurchaseSummary() {
  const rows = purchaseRows();
  const subtotal = rows.reduce((sum, row) => {
    return (
      sum +
      (Number(
        row.querySelector(".purchase-line-total")?.dataset.value || "0",
      ) || 0)
    );
  }, 0);

  const activeRows = rows.filter((row) =>
    row.querySelector(".purchase-item-input")?.value.trim(),
  ).length;
  syncPurchaseAmountPaidAutofill(subtotal);
  const payment = getPurchasePaymentSnapshot(subtotal);

  dom.purchaseSubtotal.textContent = formatCurrency(payment.subtotal);
  dom.purchaseAmountPaidDisplay.textContent = formatCurrency(
    payment.amountPaid,
  );
  dom.purchaseAmountDueDisplay.textContent = formatCurrency(payment.amountDue);
  dom.purchaseActiveRows.textContent = formatCount(activeRows);
  dom.purchasePaymentStatus.innerHTML = getStatusChipMarkup(
    payment.paymentStatus,
  );
  return {
    activeRows,
    ...payment,
  };
}

function addPurchaseItemRow(item = {}, options = {}) {
  if (!dom.purchaseItemsBody) {
    return;
  }

  const shouldAnimateIn = options.animateIn === true;

  const row = document.createElement("div");
  row.className = "purchase-line-card";
  row.innerHTML = `
    <div class="purchase-line-card__header">
      <div>
        <div class="purchase-line-card__title">Purchase Row</div>
        <div class="purchase-line-card__hint">
          Uses your saved default profit margin.
        </div>
      </div>
      <button class="btn btn-danger purchase-remove-btn" type="button">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
    <div class="purchase-line-card__grid">
      <div class="purchase-line-field purchase-line-field--item">
        <label>Item</label>
        <div class="position-relative">
          <input class="form-control purchase-item-input" placeholder="Search existing or type new item name" autocomplete="off" />
          <div class="dropdown-list purchase-item-dropdown" hidden></div>
        </div>
        <div class="purchase-previous-rate" hidden></div>
      </div>
      <div class="purchase-line-field">
        <label>Qty</label>
        <input class="form-control purchase-qty-input" type="number" min="0" step="0.01" placeholder="0.00" />
      </div>
      <div class="purchase-line-field">
        <label>Profit %</label>
        <input class="form-control purchase-profit-input" type="number" min="0" step="0.1" placeholder="0.0" />
      </div>
      <div class="purchase-line-field">
        <label>Buy Rate</label>
        <input class="form-control purchase-buy-input" type="number" min="0" step="0.01" placeholder="0.00" />
      </div>
      <div class="purchase-line-field">
        <label>Sell Rate</label>
        <input class="form-control purchase-sell-input" type="number" min="0" step="0.01" placeholder="0.00" />
      </div>
      <div class="purchase-line-field">
        <label>Line Total</label>
        <div class="purchase-line-total-box">
          <span>Total</span>
          <strong class="purchase-line-total">0.00</strong>
        </div>
      </div>
    </div>
  `;

  dom.purchaseItemsBody.appendChild(row);

  if (shouldAnimateIn) {
    row.classList.add("purchase-line-card--fresh");
    window.setTimeout(() => {
      row.classList.remove("purchase-line-card--fresh");
    }, 260);
  }

  const itemInput = row.querySelector(".purchase-item-input");
  const dropdown = row.querySelector(".purchase-item-dropdown");
  const previousRateNote = row.querySelector(".purchase-previous-rate");
  const qtyInput = row.querySelector(".purchase-qty-input");
  const profitInput = row.querySelector(".purchase-profit-input");
  const buyInput = row.querySelector(".purchase-buy-input");
  const sellInput = row.querySelector(".purchase-sell-input");
  const lineTotal = row.querySelector(".purchase-line-total");
  const removeBtn = row.querySelector(".purchase-remove-btn");

  itemInput.value = item.item_name || "";
  qtyInput.value = item.quantity ?? "";
  profitInput.value =
    item.profit_percent ?? Number(getPurchaseDefaultProfitPercent()).toFixed(2);
  buyInput.value = item.buying_rate ?? "";
  sellInput.value = item.selling_rate ?? "";
  row.dataset.manualProfit = item.profit_percent !== undefined ? "true" : "";

  const updateLineTotal = () => {
    const qty = Number(qtyInput.value) || 0;
    const buyRate = Number(buyInput.value) || 0;
    const total = Number((qty * buyRate).toFixed(2));
    lineTotal.dataset.value = total.toFixed(2);
    lineTotal.textContent = formatCurrencyValue(total);
    updatePurchaseSummary();
  };

  const showPreviousRate = (buyRate) => {
    if (!previousRateNote) {
      return;
    }

    if (!Number.isFinite(buyRate) || buyRate < 0) {
      previousRateNote.textContent = "";
      hideElement(previousRateNote);
      return;
    }

    previousRateNote.textContent = `Previous buying rate: ${formatCurrency(buyRate)}`;
    showElement(previousRateNote);
  };

  const hidePreviousRate = () => {
    if (!previousRateNote) {
      return;
    }

    previousRateNote.textContent = "";
    hideElement(previousRateNote);
  };

  const resolveExactItemName = (value) => findExactItemName(value);

  const syncProfitFromSell = () => {
    const buyRate = Number(buyInput.value);
    const sellRate = Number(sellInput.value);

    if (
      !Number.isFinite(buyRate) ||
      buyRate <= 0 ||
      !Number.isFinite(sellRate)
    ) {
      return;
    }

    const percent = ((sellRate - buyRate) / buyRate) * 100;
    if (Number.isFinite(percent)) {
      profitInput.value = percent.toFixed(2);
    }
  };

  const applySuggestedSellingRate = (force = false) => {
    const buyRate = Number(buyInput.value);
    const profitPercent = Number(profitInput.value);

    if (!Number.isFinite(buyRate) || buyRate <= 0) {
      if (force) {
        sellInput.value = "";
      }
      return;
    }

    if (force) {
      const safeProfit = Number.isFinite(profitPercent) ? profitPercent : 0;
      sellInput.value = (buyRate * (1 + safeProfit / 100)).toFixed(2);
    }
  };

  const refreshRow = (refreshOptions = {}) => {
    const followsSharedProfit = row.dataset.manualProfit !== "true";

    if (refreshOptions.overwriteProfit === true && followsSharedProfit) {
      profitInput.value = Number(getPurchaseDefaultProfitPercent()).toFixed(2);
    }

    if (refreshOptions.forceSell === true && followsSharedProfit) {
      applySuggestedSellingRate(true);
    }

    updateLineTotal();
  };

  row.__purchaseRefresh = refreshRow;

  const loadExistingItemInfo = async (name) => {
    try {
      const itemInfo = await fetchJSON(
        `/items/info?name=${encodeURIComponent(name)}`,
      );
      const previousRate = Number(itemInfo.buying_rate);

      if (Number.isFinite(previousRate) && previousRate >= 0) {
        buyInput.value = previousRate.toFixed(2);
        showPreviousRate(previousRate);
      } else {
        hidePreviousRate();
      }

      applySuggestedSellingRate(true);
      updateLineTotal();
    } catch (error) {
      hidePreviousRate();
      updateLineTotal();
    }
  };

  itemInput.addEventListener("input", () => {
    const query = itemInput.value.trim().toLowerCase();
    updatePurchaseSummary();
    hidePreviousRate();

    if (!query) {
      hideElement(dropdown);
      return;
    }

    renderDropdown(
      dropdown,
      getSearchMatches(state.itemNameSearchIndex, query, 20),
      async (value) => {
        itemInput.value = value;
        hideElement(dropdown);
        await loadExistingItemInfo(value);
      },
    );
  });

  itemInput.addEventListener("blur", () => {
    window.setTimeout(() => {
      hideElement(dropdown);
    }, 120);

    const exactMatch = resolveExactItemName(itemInput.value);
    if (exactMatch) {
      loadExistingItemInfo(exactMatch);
    } else {
      hidePreviousRate();
    }
  });

  qtyInput.addEventListener("input", updateLineTotal);

  profitInput.addEventListener("input", () => {
    const normalized = normalizeProfitPercentValue(profitInput.value);
    row.dataset.manualProfit = normalized === null ? "" : "true";
    applySuggestedSellingRate(true);
    const sharedProfit = applySharedProfitPercent(profitInput.value);
    if (sharedProfit !== null) {
      refreshPurchaseAutoRates({
        overwriteProfit: true,
        forceSell: true,
        originRow: row,
      });
      queueProfitPercentSave(sharedProfit);
    }
    updateLineTotal();
  });

  profitInput.addEventListener("blur", () => {
    const normalized = normalizeProfitPercentValue(profitInput.value);
    if (normalized === null) {
      row.dataset.manualProfit = "";
      profitInput.value = Number(getPurchaseDefaultProfitPercent()).toFixed(2);
    } else {
      profitInput.value = normalized.toFixed(2);
    }

    applySuggestedSellingRate(true);
    updateLineTotal();
  });

  buyInput.addEventListener("input", () => {
    applySuggestedSellingRate(true);
    updateLineTotal();
  });

  sellInput.addEventListener("input", () => {
    syncProfitFromSell();
    row.dataset.manualProfit = sellInput.value.trim()
      ? "true"
      : row.dataset.manualProfit;
    const sharedProfit = applySharedProfitPercent(profitInput.value);
    if (sharedProfit !== null) {
      refreshPurchaseAutoRates({
        overwriteProfit: true,
        forceSell: true,
        originRow: row,
      });
      queueProfitPercentSave(sharedProfit);
    }
    updateLineTotal();
  });

  sellInput.addEventListener("blur", () => {
    const sellRate = Number(sellInput.value);
    if (Number.isFinite(sellRate) && sellInput.value.trim()) {
      sellInput.value = sellRate.toFixed(2);
      syncProfitFromSell();
    }
    updateLineTotal();
  });

  removeBtn.addEventListener("click", () => {
    if (row.dataset.removing === "true") {
      return;
    }

    row.dataset.removing = "true";
    triggerButtonFeedback(removeBtn, 180);
    removeBtn.disabled = true;
    row.classList.add("purchase-line-card--removing");

    window.setTimeout(() => {
      row.remove();
      if (!purchaseRows().length) {
        addPurchaseItemRow();
      }
      updatePurchaseLineLabels();
      updatePurchaseSummary();
    }, 160);
  });

  updatePurchaseLineLabels();

  if (itemInput.value) {
    loadExistingItemInfo(itemInput.value);
  } else {
    hidePreviousRate();
    refreshRow({ forceSell: true });
  }
}

function resetPurchaseForm() {
  if (!dom.purchaseItemsBody) {
    return;
  }

  [
    "supplierName",
    "supplierNumber",
    "supplierAddress",
    "purchaseBillNo",
    "purchaseAmountPaid",
    "purchaseNote",
  ].forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.value = "";
    }
  });

  dom.purchasePaymentMode.value = "cash";
  dom.purchaseAmountPaid.dataset.manual = "false";
  dom.purchaseAmountPaid.dataset.autoValue = "";
  dom.purchaseAmountPaid.dataset.editing = "false";
  dom.purchaseItemsBody.innerHTML = "";
  addPurchaseItemRow(undefined, { animateIn: true });
  updatePurchaseLineLabels();
  updatePurchaseSummary();
}

async function loadSupplierSuggestions(query) {
  try {
    const rows = await fetchJSON(`/suppliers?q=${encodeURIComponent(query)}`);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.error("Supplier suggestion load failed:", error);
    return [];
  }
}

function renderSupplierDropdown(listEl, suppliers, onSelect) {
  if (!listEl) {
    return;
  }

  if (!suppliers.length) {
    hideElement(listEl);
    listEl.innerHTML = "";
    listEl.onclick = null;
    return;
  }

  listEl.innerHTML = suppliers
    .map(
      (supplier) => `
        <div
          class="dropdown-item"
          data-id="${supplier.id}"
          data-name="${encodeURIComponent(supplier.name || "")}"
          data-mobile="${encodeURIComponent(supplier.mobile_number || "")}"
          data-address="${encodeURIComponent(supplier.address || "")}"
        >
          ${escapeHtml(supplier.name || "Supplier")}
          ${supplier.mobile_number ? ` - ${escapeHtml(supplier.mobile_number)}` : ""}
        </div>
      `,
    )
    .join("");

  showElement(listEl);
  listEl.onclick = (event) => {
    const entry = event.target.closest(".dropdown-item");
    if (!entry || !listEl.contains(entry)) {
      return;
    }

    onSelect({
      id: Number(entry.dataset.id) || null,
      name: decodeURIComponent(entry.dataset.name),
      mobile_number: decodeURIComponent(entry.dataset.mobile),
      address: decodeURIComponent(entry.dataset.address),
    });
    hideElement(listEl);
  };
}

async function loadPurchaseSearchSuggestions(query = "") {
  const fromDate = dom.purchaseFromDate?.value;
  const toDate = dom.purchaseToDate?.value;

  if (!fromDate || !toDate || fromDate > toDate) {
    return [];
  }

  const requestId = ++state.purchaseSearchRequestId;

  try {
    const data = await fetchJSON(
      `/purchases/report?from=${fromDate}&to=${toDate}&q=${encodeURIComponent(query.trim())}`,
    );

    if (requestId !== state.purchaseSearchRequestId) {
      return [];
    }

    return Array.isArray(data.purchases) ? data.purchases.slice(0, 12) : [];
  } catch (error) {
    console.error("Purchase suggestion load failed:", error);
    return [];
  }
}

function renderPurchaseSearchDropdown(rows, onSelect) {
  if (!dom.purchaseSearchDropdown) {
    return;
  }

  if (!rows.length) {
    hideElement(dom.purchaseSearchDropdown);
    dom.purchaseSearchDropdown.innerHTML = "";
    dom.purchaseSearchDropdown.onclick = null;
    return;
  }

  dom.purchaseSearchDropdown.innerHTML = rows
    .map((row) => {
      const supplier = row.supplier_name || "Supplier";
      const bill = row.bill_no || `Purchase #${row.id}`;
      const mobile = row.supplier_number || "";

      return `
        <div
          class="dropdown-item"
          data-value="${encodeURIComponent(bill)}"
          data-purchase-id="${row.id || ""}"
        >
          <strong>${escapeHtml(bill)}</strong>
          <div class="small text-muted mt-1">
            ${escapeHtml(supplier)}${mobile ? ` | ${escapeHtml(mobile)}` : ""}
          </div>
        </div>
      `;
    })
    .join("");

  showElement(dom.purchaseSearchDropdown);
  dom.purchaseSearchDropdown.onclick = (event) => {
    const entry = event.target.closest(".dropdown-item");
    if (!entry || !dom.purchaseSearchDropdown.contains(entry)) {
      return;
    }

    onSelect({
      purchaseId: Number(entry.dataset.purchaseId || "0"),
      value: decodeURIComponent(entry.dataset.value || ""),
    });
    hideElement(dom.purchaseSearchDropdown);
  };
}

function validatePurchaseDates() {
  return validateRange(dom.purchaseFromDate.value, dom.purchaseToDate.value, {
    from: "From",
    to: "To",
  });
}

function setPurchaseWorkspaceView(view = "bills") {
  const normalized = view === "supplier" ? "supplier" : "bills";

  if (dom.purchaseHistoryView) {
    dom.purchaseHistoryView.hidden = normalized !== "bills";
  }

  if (dom.supplierLedgerView) {
    dom.supplierLedgerView.hidden = normalized !== "supplier";
  }

  if (dom.showPurchaseBillsViewBtn) {
    const active = normalized === "bills";
    dom.showPurchaseBillsViewBtn.classList.toggle("is-active", active);
    dom.showPurchaseBillsViewBtn.setAttribute("aria-pressed", String(active));
  }

  if (dom.showSupplierLedgerViewBtn) {
    const active = normalized === "supplier";
    dom.showSupplierLedgerViewBtn.classList.toggle("is-active", active);
    dom.showSupplierLedgerViewBtn.setAttribute("aria-pressed", String(active));
  }
}

function renderPurchaseReport(rows) {
  dom.purchaseReportBody.innerHTML = "";

  if (!rows.length) {
    dom.purchaseReportBody.innerHTML =
      '<tr><td colspan="8" class="text-muted">No purchase entries found for this selection.</td></tr>';
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.className = "interactive-row";
    tr.dataset.purchaseId = String(row.id || "");
    tr.innerHTML = `
      <td data-label="Date">${formatDate(row.purchase_date)}</td>
      <td data-label="Supplier">${escapeHtml(row.supplier_name || "-")}</td>
      <td data-label="Bill">
        <div class="table-primary-copy">${escapeHtml(row.bill_no || `Purchase #${row.id}`)}</div>
        <div class="table-row-hint">
          <i class="fa-solid fa-eye"></i>
          Open bill detail
        </div>
      </td>
      <td data-label="Items">${formatCount(row.item_count)}</td>
      <td data-label="Total">${formatCurrencyValue(row.subtotal)}</td>
      <td data-label="Paid">${formatCurrencyValue(row.amount_paid)}</td>
      <td data-label="Due">${formatCurrencyValue(row.amount_due)}</td>
      <td data-label="Status">${getStatusChipMarkup(row.payment_status)}</td>
    `;
    dom.purchaseReportBody.appendChild(tr);
  });

  dom.purchaseReportBody
    .querySelectorAll("[data-purchase-id]")
    .forEach((row) => {
      row.addEventListener("click", () => {
        openPurchaseDetail(Number(row.dataset.purchaseId));
      });
    });
}

async function loadPurchaseReport(options = {}) {
  setPurchaseWorkspaceView("bills");

  if (!validatePurchaseDates()) {
    return;
  }

  const query = `/purchases/report?from=${dom.purchaseFromDate.value}&to=${dom.purchaseToDate.value}&q=${encodeURIComponent(dom.purchaseSearchInput.value.trim())}`;

  const task = async () => {
    const data = await fetchJSON(query);
    state.currentPurchaseRows = Array.isArray(data.purchases)
      ? data.purchases
      : [];
    renderPurchaseReport(state.currentPurchaseRows);
  };

  if (options.silent) {
    try {
      await task();
    } catch (error) {
      console.error("Purchase report load failed:", error);
    }
    return;
  }

  await withButtonState(
    dom.loadPurchaseReportBtn,
    '<i class="fa-solid fa-spinner fa-spin"></i> Loading purchases...',
    async () => {
      try {
        await task();
      } catch (error) {
        console.error("Purchase report load failed:", error);
        showPopup(
          "error",
          "Purchase report unavailable",
          error.message || "Could not load purchase history right now.",
          { autoClose: false },
        );
      }
    },
  );
}

function renderSupplierLedgerSummary(rows) {
  if (!rows.length) {
    dom.supplierLedgerTable.innerHTML =
      '<div class="empty-ledger">No supplier ledger rows found for this selection.</div>';
    state.supplierLedgerMode = "empty";
    state.currentSupplierId = null;
    return;
  }

  state.supplierLedgerMode = "summary";
  state.currentSupplierId = null;

  dom.supplierLedgerTable.innerHTML = `
    <table class="table table-sm text-center align-middle dashboard-table dashboard-table--supplier-ledger">
      <thead>
        <tr>
          <th><span class="table-label-full">Supplier</span><span class="table-label-compact">Supplier</span></th>
          <th><span class="table-label-full">Mobile</span><span class="table-label-compact">Mobile</span></th>
          <th><span class="table-label-full">Bills</span><span class="table-label-compact">Bills</span></th>
          <th><span class="table-label-full">Total</span><span class="table-label-compact">Total</span></th>
          <th><span class="table-label-full">Paid</span><span class="table-label-compact">Paid</span></th>
          <th><span class="table-label-full">Due</span><span class="table-label-compact">Due</span></th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr class="interactive-row" data-supplier-id="${row.id}" data-supplier-name="${encodeURIComponent(row.name || "")}">
                <td data-label="Supplier">
                  <div class="table-primary-copy">${escapeHtml(row.name || "-")}</div>
                  <div class="table-row-hint">
                    <i class="fa-solid fa-book-open"></i>
                    Open supplier ledger
                  </div>
                </td>
                <td data-label="Mobile">${escapeHtml(row.mobile_number || "-")}</td>
                <td data-label="Bills">${formatCount(row.purchase_count)}</td>
                <td data-label="Total">${formatCurrencyValue(row.total_amount)}</td>
                <td data-label="Paid">${formatCurrencyValue(row.total_paid)}</td>
                <td data-label="Due">${formatCurrencyValue(row.total_due)}</td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;

  dom.supplierLedgerTable
    .querySelectorAll("[data-supplier-id]")
    .forEach((row) => {
      row.addEventListener("click", () => {
        const supplierId = Number(row.dataset.supplierId || "0");
        if (supplierId > 0) {
          dom.supplierSearchInput.value = decodeURIComponent(
            row.dataset.supplierName || "",
          );
          dom.supplierSearchInput.dataset.supplierId = String(supplierId);
          searchSupplierLedger({ supplierId });
        }
      });
    });
}

function renderSupplierLedgerDetail(supplier, rows) {
  if (!rows.length) {
    dom.supplierLedgerTable.innerHTML =
      '<div class="empty-ledger">No purchases found for this supplier.</div>';
    state.supplierLedgerMode = "empty";
    state.currentSupplierId = null;
    return;
  }

  state.supplierLedgerMode = "ledger";
  state.currentSupplierId = supplier.id;
  dom.supplierSearchInput.value = supplier.name || "";
  dom.supplierSearchInput.dataset.supplierId = String(supplier.id || "");
  const totalDue = rows.reduce(
    (sum, row) => sum + (Number(row.amount_due) || 0),
    0,
  );

  dom.supplierLedgerTable.innerHTML = `
    <div class="summary-strip mb-3">
      <span class="summary-pill">
        <i class="fa-solid fa-id-card"></i>
        ${escapeHtml(supplier.name || "Supplier")}
        ${supplier.mobile_number ? ` | ${escapeHtml(supplier.mobile_number)}` : ""}
      </span>
      <span class="summary-pill">
        <i class="fa-solid fa-hand-holding-dollar"></i>
        Outstanding: ${formatCurrency(totalDue)}
      </span>
    </div>
    <table class="table table-sm text-center align-middle dashboard-table dashboard-table--supplier-ledger">
      <thead>
        <tr>
          <th><span class="table-label-full">Date</span><span class="table-label-compact">Date</span></th>
          <th><span class="table-label-full">Bill</span><span class="table-label-compact">Bill</span></th>
          <th><span class="table-label-full">Total</span><span class="table-label-compact">Total</span></th>
          <th><span class="table-label-full">Paid</span><span class="table-label-compact">Paid</span></th>
          <th><span class="table-label-full">Due</span><span class="table-label-compact">Due</span></th>
          <th><span class="table-label-full">Status</span><span class="table-label-compact">Status</span></th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr class="interactive-row" data-purchase-id="${row.id}">
                <td data-label="Date">${formatDate(row.purchase_date)}</td>
                <td data-label="Bill">
                  <div class="table-primary-copy">${escapeHtml(row.bill_no || `Purchase #${row.id}`)}</div>
                  <div class="table-row-hint">
                    <i class="fa-solid fa-eye"></i>
                    Open bill detail
                  </div>
                </td>
                <td data-label="Total">${formatCurrencyValue(row.subtotal)}</td>
                <td data-label="Paid">${formatCurrencyValue(row.amount_paid)}</td>
                <td data-label="Due">${formatCurrencyValue(row.amount_due)}</td>
                <td data-label="Status">${getStatusChipMarkup(row.payment_status)}</td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;

  dom.supplierLedgerTable
    .querySelectorAll("[data-purchase-id]")
    .forEach((row) => {
      row.addEventListener("click", () => {
        openPurchaseDetail(Number(row.dataset.purchaseId));
      });
    });
}

function renderPurchaseDetailEmpty(message) {
  if (!dom.purchaseDetailCard) {
    return;
  }

  state.currentPurchaseDetailId = null;
  state.currentPurchaseDetailSupplierId = null;
  state.currentPurchaseDetail = null;
  dom.purchaseDetailCard.hidden = false;
  dom.purchaseDetailSummary.innerHTML = `
    <span class="summary-pill">
      <i class="fa-solid fa-circle-info"></i>
      Purchase detail unavailable
    </span>
  `;
  dom.purchaseDetailItems.innerHTML = `
    <div class="purchase-detail-empty">${escapeHtml(message)}</div>
  `;
  dom.purchaseDetailMeta.innerHTML = "";
  dom.purchaseRepayPanel.hidden = true;
  dom.purchaseDetailNote.hidden = true;
}

function renderPurchaseDetail(purchase) {
  if (!dom.purchaseDetailCard) {
    return;
  }

  const items = Array.isArray(purchase.items) ? purchase.items : [];
  const amountDue = Number(purchase.amount_due) || 0;
  const amountPaid = Number(purchase.amount_paid) || 0;
  const subtotal = Number(purchase.subtotal) || 0;

  state.currentPurchaseDetailId = purchase.id;
  state.currentPurchaseDetailSupplierId = purchase.supplier_id || null;
  state.currentPurchaseDetail = purchase;

  dom.purchaseDetailCard.hidden = false;
  dom.purchaseDetailSummary.innerHTML = `
    <span class="summary-pill">
      <i class="fa-solid fa-receipt"></i>
      ${escapeHtml(purchase.bill_no || `Purchase #${purchase.id}`)}
    </span>
    <span class="summary-pill">
      <i class="fa-solid fa-truck-field"></i>
      ${escapeHtml(purchase.supplier_name || "Supplier")}
    </span>
    <span class="summary-pill">
      <i class="fa-solid fa-calendar-days"></i>
      ${formatDate(purchase.purchase_date)}
    </span>
    <span class="summary-pill">
      ${getStatusChipMarkup(purchase.payment_status)}
    </span>
  `;

  dom.purchaseDetailMeta.innerHTML = `
    <div class="mini-kpi">
      <span class="mini-kpi__label">Supplier</span>
      <strong class="mini-kpi__value">${escapeHtml(purchase.supplier_name || "-")}</strong>
      <span class="mini-kpi__meta">${escapeHtml(purchase.supplier_number || "No mobile saved")}</span>
    </div>
    <div class="mini-kpi">
      <span class="mini-kpi__label">Payment Mode</span>
      <strong class="mini-kpi__value">${escapeHtml(formatPaymentMode(purchase.payment_mode))}</strong>
      <span class="mini-kpi__meta">${formatCount(items.length)} item row${items.length === 1 ? "" : "s"} in this bill</span>
    </div>
    <div class="mini-kpi">
      <span class="mini-kpi__label">Purchase Total</span>
      <strong class="mini-kpi__value">${formatCurrency(subtotal)}</strong>
      <span class="mini-kpi__meta">Saved supplier bill total</span>
    </div>
    <div class="mini-kpi">
      <span class="mini-kpi__label">Paid / Due</span>
      <strong class="mini-kpi__value">${formatCurrency(amountPaid)}</strong>
      <span class="mini-kpi__meta">Due remaining: ${formatCurrency(amountDue)}</span>
    </div>
  `;

  if (!items.length) {
    dom.purchaseDetailItems.innerHTML = `
      <div class="purchase-detail-empty">
        No purchase item rows were found for this bill.
      </div>
    `;
  } else {
    dom.purchaseDetailItems.innerHTML = `
      <table class="table table-sm text-center align-middle dashboard-table dashboard-table--purchase-detail">
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Buy Rate</th>
            <th>Sell Rate</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item) => `
                <tr>
                  <td class="text-start" data-label="Item">${escapeHtml(item.item_name || "-")}</td>
                  <td data-label="Qty">${formatNumber(item.quantity)}</td>
                  <td data-label="Buy Rate">${formatCurrencyValue(item.buying_rate)}</td>
                  <td data-label="Sell Rate">${formatCurrencyValue(item.selling_rate)}</td>
                  <td data-label="Total">${formatCurrencyValue(item.line_total)}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    `;
  }

  const noteText = String(purchase.note || "").trim();
  if (noteText) {
    dom.purchaseDetailNote.hidden = false;
    dom.purchaseDetailNote.querySelector("strong").textContent = noteText;
  } else {
    dom.purchaseDetailNote.hidden = true;
    dom.purchaseDetailNote.querySelector("strong").textContent = "-";
  }

  if (amountDue > 0) {
    dom.purchaseRepayPanel.hidden = false;
    dom.purchaseRepayAmount.max = amountDue.toFixed(2);
    dom.purchaseRepayAmount.value = amountDue.toFixed(2);
    dom.purchaseRepayMode.value =
      purchase.payment_mode === "credit" ? "cash" : "cash";
    dom.purchaseRepayNote.value = "";
  } else {
    dom.purchaseRepayPanel.hidden = true;
    dom.purchaseRepayAmount.value = "";
    dom.purchaseRepayNote.value = "";
  }
}

async function openPurchaseDetail(purchaseId, options = {}) {
  if (!Number.isInteger(Number(purchaseId)) || Number(purchaseId) <= 0) {
    return;
  }

  const task = async () => {
    const data = await fetchJSON(
      `/purchases/${encodeURIComponent(purchaseId)}`,
    );
    renderPurchaseDetail(data.purchase || {});
    if (options.scroll !== false && dom.purchaseDetailCard) {
      dom.purchaseDetailCard.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  if (options.silent) {
    try {
      await task();
    } catch (error) {
      console.error("Purchase detail load failed:", error);
      renderPurchaseDetailEmpty(
        "Could not load this purchase detail right now.",
      );
    }
    return;
  }

  try {
    await task();
  } catch (error) {
    console.error("Purchase detail load failed:", error);
    showPopup(
      "error",
      "Purchase detail unavailable",
      error.message || "Could not load the selected purchase bill.",
      { autoClose: false },
    );
  }
}

async function submitPurchaseRepayment() {
  const purchaseId = Number(state.currentPurchaseDetailId || 0);
  const currentDue = Number(state.currentPurchaseDetail?.amount_due) || 0;
  const amount = Number(dom.purchaseRepayAmount.value || "0");

  if (!purchaseId) {
    showPopup(
      "error",
      "Select a bill first",
      "Open a purchase bill detail before recording supplier repayment.",
      { autoClose: false },
    );
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    showPopup(
      "error",
      "Invalid repayment amount",
      "Repayment amount must be greater than zero.",
      { autoClose: false },
    );
    return;
  }

  if (amount - currentDue > 0.001) {
    showPopup(
      "error",
      "Amount too high",
      `Repayment amount cannot be greater than the current due of ${formatCurrency(currentDue)}.`,
      { autoClose: false },
    );
    return;
  }

  await withButtonState(
    dom.submitPurchaseRepaymentBtn,
    '<i class="fa-solid fa-spinner fa-spin"></i> Saving repayment...',
    async () => {
      try {
        const data = await fetchJSON(
          `/purchases/${encodeURIComponent(purchaseId)}/repayment`,
          {
            method: "POST",
            body: JSON.stringify({
              amount,
              payment_mode: dom.purchaseRepayMode.value,
              note: dom.purchaseRepayNote.value.trim(),
            }),
          },
        );

        showPopup(
          "success",
          "Repayment saved",
          data.message || "Supplier repayment saved successfully.",
        );

        await Promise.allSettled([
          loadDashboardOverview({ silent: true }),
          loadPurchaseReport({ silent: true }),
          state.currentPurchaseDetailSupplierId
            ? searchSupplierLedger({
                supplierId: state.currentPurchaseDetailSupplierId,
                silent: true,
              })
            : showAllSupplierSummary({ silent: true }),
          openPurchaseDetail(purchaseId, { silent: true, scroll: false }),
        ]);
      } catch (error) {
        console.error("Purchase repayment failed:", error);
        showPopup(
          "error",
          "Repayment failed",
          error.message || "Could not record supplier repayment right now.",
          { autoClose: false },
        );
      }
    },
  );
}

async function searchSupplierLedger(options = {}) {
  setPurchaseWorkspaceView("supplier");

  const supplierId = Number(
    options.supplierId || dom.supplierSearchInput.dataset.supplierId || 0,
  );

  if (!supplierId) {
    if (!options.silent) {
      showPopup(
        "error",
        "Select a supplier",
        "Choose a supplier from the dropdown first to open the exact ledger.",
        { autoClose: false },
      );
    }
    return;
  }

  const task = async () => {
    const data = await fetchJSON(`/suppliers/${supplierId}/ledger`);
    renderSupplierLedgerDetail(
      data.supplier || {},
      Array.isArray(data.ledger) ? data.ledger : [],
    );
  };

  if (options.silent) {
    try {
      await task();
    } catch (error) {
      console.error("Supplier ledger load failed:", error);
    }
    return;
  }

  await withButtonState(
    dom.searchSupplierLedgerBtn,
    '<i class="fa-solid fa-spinner fa-spin"></i> Opening ledger...',
    async () => {
      try {
        await task();
      } catch (error) {
        console.error("Supplier ledger load failed:", error);
        showPopup(
          "error",
          "Ledger unavailable",
          error.message || "Could not load supplier ledger right now.",
          { autoClose: false },
        );
      }
    },
  );
}

async function showAllSupplierSummary(options = {}) {
  setPurchaseWorkspaceView("supplier");

  const query = dom.supplierSearchInput.value.trim();
  const path = query
    ? `/suppliers/summary?q=${encodeURIComponent(query)}`
    : "/suppliers/summary";

  const task = async () => {
    const data = await fetchJSON(path);
    renderSupplierLedgerSummary(
      Array.isArray(data.suppliers) ? data.suppliers : [],
    );
  };

  if (options.silent) {
    try {
      await task();
    } catch (error) {
      console.error("Supplier summary load failed:", error);
    }
    return;
  }

  await withButtonState(
    dom.showAllSupplierSummaryBtn,
    '<i class="fa-solid fa-spinner fa-spin"></i> Loading ledger...',
    async () => {
      try {
        await task();
      } catch (error) {
        console.error("Supplier summary load failed:", error);
        showPopup(
          "error",
          "Supplier summary unavailable",
          error.message || "Could not load supplier balances right now.",
          { autoClose: false },
        );
      }
    },
  );
}

async function submitPurchase() {
  const supplierName = dom.supplierName.value.trim();
  const supplierNumber = normalizeMobileNumber(dom.supplierNumber.value);
  const supplierAddress = dom.supplierAddress.value.trim();
  const billNo = dom.purchaseBillNo.value.trim();
  const note = dom.purchaseNote.value.trim();
  const paymentMode = dom.purchasePaymentMode.value;
  const payment = updatePurchaseSummary();
  const items = purchaseRows()
    .map((row) => ({
      item_name: row.querySelector(".purchase-item-input")?.value.trim() || "",
      quantity: Number(row.querySelector(".purchase-qty-input")?.value || "0"),
      profit_percent: Number(
        row.querySelector(".purchase-profit-input")?.value || "0",
      ),
      buying_rate: Number(
        row.querySelector(".purchase-buy-input")?.value || "0",
      ),
      selling_rate: Number(
        row.querySelector(".purchase-sell-input")?.value || "0",
      ),
    }))
    .filter(
      (item) =>
        item.item_name ||
        item.quantity ||
        item.buying_rate ||
        item.selling_rate,
    );

  if (!supplierName) {
    showPopup("error", "Missing supplier", "Supplier name is required.", {
      autoClose: false,
    });
    return;
  }

  if (supplierNumber && !/^\d{10}$/.test(supplierNumber)) {
    showPopup(
      "error",
      "Invalid supplier mobile",
      "Enter a valid 10-digit supplier mobile number or keep it blank.",
      { autoClose: false },
    );
    return;
  }

  if (!items.length) {
    showPopup("error", "Missing items", "Add at least one purchase row.", {
      autoClose: false,
    });
    return;
  }

  const invalidItem = items.find(
    (item) => !item.item_name || item.quantity <= 0 || item.buying_rate <= 0,
  );

  if (invalidItem) {
    showPopup(
      "error",
      "Invalid purchase line",
      "Every purchase row needs item name, quantity, and buying rate greater than zero.",
      { autoClose: false },
    );
    return;
  }

  await withButtonState(
    dom.submitPurchaseBtn,
    '<i class="fa-solid fa-spinner fa-spin"></i> Saving purchase...',
    async () => {
      try {
        const data = await fetchJSON("/purchases", {
          method: "POST",
          body: JSON.stringify({
            supplier_name: supplierName,
            supplier_number: supplierNumber,
            supplier_address: supplierAddress,
            bill_no: billNo,
            purchase_date: dom.purchaseDate.value,
            payment_mode: paymentMode,
            amount_paid:
              payment.rawPaidInput === "" && payment.paymentStatus === "paid"
                ? ""
                : payment.amountPaid,
            note,
            items,
          }),
        });

        showPopup(
          "success",
          "Purchase saved",
          data.message || "Purchase entry saved successfully.",
        );

        resetPurchaseForm();
        await Promise.allSettled([
          loadItemNames({ silent: true }),
          loadDashboardOverview({ silent: true }),
          loadPurchaseReport({ silent: true }),
          showAllSupplierSummary({ silent: true }),
        ]);
        if (data.purchase?.id) {
          await openPurchaseDetail(Number(data.purchase.id), { silent: true });
        }
      } catch (error) {
        console.error("Purchase submit failed:", error);
        showPopup(
          "error",
          "Save failed",
          error.message || "Could not save the purchase entry.",
          { autoClose: false },
        );
      }
    },
  );
}

function resetExpenseSummary() {
  dom.expenseSummaryTotal.textContent = "Rs. 0.00";
  dom.expenseSummaryEntryCount.textContent = "No expense entries loaded yet.";
  dom.expenseSummaryCategory.textContent = "No expenses";
  dom.expenseSummaryCategoryNote.textContent =
    "Category contribution will appear after loading the report.";
  dom.expenseSummaryGrossProfit.textContent = "Rs. 0.00";
  dom.expenseSummaryNetProfit.textContent = "Rs. 0.00";
  dom.expenseSummaryNetProfitNote.textContent =
    "Gross profit minus tracked business expenses.";
}

function validateExpenseDates() {
  return validateRange(dom.expenseFromDate.value, dom.expenseToDate.value, {
    from: "From",
    to: "To",
  });
}

function renderExpenseReport(data = {}) {
  const rows = Array.isArray(data.expenses) ? data.expenses : [];
  const summary = data.summary || {};

  dom.expenseReportBody.innerHTML = "";

  if (!rows.length) {
    dom.expenseReportBody.innerHTML =
      '<tr><td colspan="6" class="text-muted">No expense entries found for this range.</td></tr>';
    resetExpenseSummary();
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDate(row.expense_date)}</td>
      <td>${escapeHtml(row.title || "-")}</td>
      <td>${escapeHtml(row.category || "-")}</td>
      <td>${escapeHtml(formatPaymentMode(row.payment_mode))}</td>
      <td>${formatCurrencyValue(row.amount)}</td>
      <td>${escapeHtml(row.note || "-")}</td>
    `;
    dom.expenseReportBody.appendChild(tr);
  });

  const totalExpense = Number(summary.total_expense) || 0;
  const grossProfit = Number(summary.gross_profit) || 0;
  const netProfit = Number(summary.net_profit) || 0;

  dom.expenseSummaryTotal.textContent = formatCurrency(totalExpense);
  dom.expenseSummaryEntryCount.textContent = `${formatCount(summary.entry_count || 0)} expense entr${Number(summary.entry_count || 0) === 1 ? "y" : "ies"} in the selected range.`;
  dom.expenseSummaryCategory.textContent =
    summary.top_category || "No expenses";
  dom.expenseSummaryCategoryNote.textContent =
    summary.top_category && summary.top_category !== "No expenses"
      ? `${formatCurrency(Number(summary.top_category_total) || 0)} spent in the highest category.`
      : "Category contribution will appear after loading the report.";
  dom.expenseSummaryGrossProfit.textContent = formatCurrency(grossProfit);
  dom.expenseSummaryNetProfit.textContent = formatCurrency(netProfit);
  dom.expenseSummaryNetProfitNote.textContent =
    netProfit >= 0
      ? "After expenses, the selected period still remains profitable."
      : "Expenses are currently higher than gross profit in the selected period.";
  dom.expenseSummaryNetProfit.classList.toggle("text-danger", netProfit < 0);
  dom.expenseSummaryNetProfit.classList.toggle("text-success", netProfit >= 0);
}

async function loadExpenseReport(options = {}) {
  if (!validateExpenseDates()) {
    return;
  }

  const query = `/expenses/report?from=${dom.expenseFromDate.value}&to=${dom.expenseToDate.value}&q=${encodeURIComponent(dom.expenseSearchInput.value.trim())}`;

  const task = async () => {
    const data = await fetchJSON(query);
    state.currentExpenseRows = Array.isArray(data.expenses)
      ? data.expenses
      : [];
    renderExpenseReport(data);
  };

  if (options.silent) {
    try {
      await task();
    } catch (error) {
      console.error("Expense report load failed:", error);
    }
    return;
  }

  await withButtonState(
    dom.loadExpenseReportBtn,
    '<i class="fa-solid fa-spinner fa-spin"></i> Loading expenses...',
    async () => {
      try {
        await task();
      } catch (error) {
        console.error("Expense report load failed:", error);
        showPopup(
          "error",
          "Expense report unavailable",
          error.message || "Could not load expense entries right now.",
          { autoClose: false },
        );
      }
    },
  );
}

async function submitExpense() {
  const title = dom.expenseTitle.value.trim();
  const category = dom.expenseCategory.value.trim();
  const amount = Number(dom.expenseAmount.value || "0");
  const paymentMode = dom.expensePaymentMode.value;
  const expenseDate = dom.expenseDate.value;
  const note = dom.expenseNote.value.trim();

  if (!title) {
    showPopup("error", "Missing title", "Expense title is required.", {
      autoClose: false,
    });
    return;
  }

  if (!category) {
    showPopup("error", "Missing category", "Select an expense category.", {
      autoClose: false,
    });
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    showPopup(
      "error",
      "Invalid amount",
      "Expense amount must be greater than zero.",
      { autoClose: false },
    );
    return;
  }

  await withButtonState(
    dom.submitExpenseBtn,
    '<i class="fa-solid fa-spinner fa-spin"></i> Saving expense...',
    async () => {
      try {
        const data = await fetchJSON("/expenses", {
          method: "POST",
          body: JSON.stringify({
            title,
            category,
            amount,
            payment_mode: paymentMode,
            expense_date: expenseDate,
            note,
          }),
        });

        showPopup(
          "success",
          "Expense saved",
          data.message || "Expense entry saved successfully.",
        );

        ["expenseTitle", "expenseAmount", "expenseNote"].forEach((id) => {
          const element = document.getElementById(id);
          if (element) {
            element.value = "";
          }
        });
        dom.expenseCategory.value = "";
        dom.expensePaymentMode.value = "cash";

        await Promise.allSettled([
          loadDashboardOverview({ silent: true }),
          loadExpenseReport({ silent: true }),
        ]);
      } catch (error) {
        console.error("Expense submit failed:", error);
        showPopup(
          "error",
          "Save failed",
          error.message || "Could not save the expense entry.",
          { autoClose: false },
        );
      }
    },
  );
}

function renderItemReport(rows) {
  dom.itemReportBody.innerHTML = "";

  if (!rows.length) {
    dom.itemReportBody.innerHTML =
      '<tr><td colspan="5" class="text-muted">No stock records found for this selection.</td></tr>';
    return;
  }

  let totalCostValue = 0;
  let totalSellingValue = 0;
  let totalUnits = 0;

  rows.forEach((row) => {
    const availableQty = Number(row.available_qty) || 0;
    const buyingRate = Number(row.buying_rate) || 0;
    const sellingRate = Number(row.selling_rate) || 0;
    const soldQty = Number(row.sold_qty) || 0;

    totalUnits += availableQty;
    totalCostValue += availableQty * buyingRate;
    totalSellingValue += availableQty * sellingRate;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(row.item_name)}</td>
      <td>${formatNumber(availableQty)}</td>
      <td>${formatCurrencyValue(buyingRate)}</td>
      <td>${formatCurrencyValue(sellingRate)}</td>
      <td>${formatNumber(soldQty)}</td>
    `;
    dom.itemReportBody.appendChild(tr);
  });

  const estimatedProfit = totalSellingValue - totalCostValue;
  const summaryRow = document.createElement("tr");
  summaryRow.innerHTML = `
    <td colspan="5" class="text-end fw-bold bg-light-subtle">
      <div>Total Units: ${formatNumber(totalUnits)}</div>
      <div>Total Cost Value: ${formatCurrency(totalCostValue)}</div>
      <div>Total Selling Value: ${formatCurrency(totalSellingValue)}</div>
      <div class="${estimatedProfit >= 0 ? "text-success" : "text-danger"}">
        Estimated Profit: ${formatCurrency(estimatedProfit)}
      </div>
    </td>
  `;
  dom.itemReportBody.appendChild(summaryRow);
}

async function loadItemReport(options = {}) {
  const item = dom.itemReportSearch.value.trim();
  const query = item ? `?name=${encodeURIComponent(item)}` : "";

  const task = async () => {
    const rows = await fetchJSON(`/items/report${query}`);
    state.currentItemReportRows = Array.isArray(rows) ? rows : [];
    renderItemReport(state.currentItemReportRows);

    if (!item) {
      await loadDashboardOverview({ silent: true });
    }
  };

  if (options.silent) {
    try {
      await task();
    } catch (error) {
      console.error("Item report load failed:", error);
    }
    return;
  }

  await withButtonState(
    dom.loadItemReportBtn,
    '<i class="fa-solid fa-spinner fa-spin"></i> Loading report...',
    async () => {
      try {
        await task();
      } catch (error) {
        console.error("Item report load failed:", error);
        showPopup(
          "error",
          "Report unavailable",
          "Could not load the stock report right now.",
          { autoClose: false },
        );
      }
    },
  );
}

function updateLowStockOverview(rows) {
  const count = rows.length;
  dom.statLowStock.textContent = formatCount(count);

  if (!count) {
    dom.statLowStockNote.textContent = "No active low-stock alert right now.";
    return;
  }

  const urgentRow = rows[0];
  const daysLeft = Number(urgentRow.days_left);
  dom.statLowStockNote.textContent = `${urgentRow.item_name} is most urgent${Number.isFinite(daysLeft) ? ` with about ${formatNumber(daysLeft)} day(s) left` : ""}.`;

  updateHeroSummary({
    itemCount: parseFormattedNumber(dom.statCatalogCount.textContent),
    lowStockCount: count,
    dueCustomerCount: parseFormattedNumber(dom.statDueNote.textContent),
  });
}

function getReorderBadgeClass(priority) {
  switch (priority) {
    case "URGENT":
      return "status-badge-pill status-badge-pill--urgent";
    case "SOON":
      return "status-badge-pill status-badge-pill--soon";
    default:
      return "status-badge-pill status-badge-pill--buffer";
  }
}

function getSlowMovingBadgeClass(priority) {
  switch (priority) {
    case "NO SALE":
      return "status-badge-pill status-badge-pill--urgent";
    case "OVERSTOCK":
      return "status-badge-pill status-badge-pill--soon";
    default:
      return "status-badge-pill status-badge-pill--buffer";
  }
}

function resetReorderPlanner() {
  dom.reorderPlannerCard.hidden = true;
  dom.reorderCandidateCount.textContent = "0";
  dom.reorderUrgentCount.textContent = "0";
  dom.reorderSuggestedUnits.textContent = "0";
  dom.reorderEstimatedCost.textContent = "Rs. 0.00";
  dom.reorderFastestItem.textContent = "-";
  dom.reorderPlanBody.innerHTML =
    '<tr><td colspan="6" class="text-muted">Restock list will show here.</td></tr>';
}

function renderReorderPlanner(rows) {
  dom.reorderPlannerCard.hidden = false;
  dom.reorderPlanBody.innerHTML = "";

  if (!rows.length) {
    dom.reorderCandidateCount.textContent = "0";
    dom.reorderUrgentCount.textContent = "0";
    dom.reorderSuggestedUnits.textContent = "0";
    dom.reorderEstimatedCost.textContent = "Rs. 0.00";
    dom.reorderFastestItem.textContent = "Stock looks fine";
    dom.reorderPlanBody.innerHTML =
      '<tr><td colspan="6" class="text-muted">No restock needed right now.</td></tr>';
    return;
  }

  let suggestedUnits = 0;
  let estimatedCost = 0;
  let urgentCount = 0;
  let fastestMover = rows[0];

  rows.forEach((row) => {
    const availableQty = Number(row.available_qty) || 0;
    const dailyRunRate = Number(row.daily_run_rate) || 0;
    const soldLast30Days = Number(row.sold_30_days) || 0;
    const daysLeft = Number(row.days_left);
    const reorderQty = Number(row.recommended_reorder_qty) || 0;
    const reorderCost = Number(row.reorder_cost) || 0;
    const priority = row.priority || "BUFFER";
    const tr = document.createElement("tr");

    if (priority === "URGENT") {
      urgentCount += 1;
      tr.classList.add("reorder-row--urgent");
    } else if (priority === "SOON") {
      tr.classList.add("reorder-row--soon");
    }

    if ((Number(fastestMover?.sold_30_days) || 0) < soldLast30Days) {
      fastestMover = row;
    }

    suggestedUnits += reorderQty;
    estimatedCost += reorderCost;

    tr.innerHTML = `
      <td>
        <div class="table-primary-copy">${escapeHtml(row.item_name)}</div>
        <div class="table-secondary-copy">
          <span class="${getReorderBadgeClass(priority)}">${escapeHtml(priority)}</span>
        </div>
      </td>
      <td>${formatNumber(availableQty)}</td>
      <td>${formatNumber(dailyRunRate)}</td>
      <td>${Number.isFinite(daysLeft) ? `${formatNumber(daysLeft)} days` : "--"}</td>
      <td>${formatNumber(reorderQty)}</td>
      <td>${formatCurrencyValue(reorderCost)}</td>
    `;
    dom.reorderPlanBody.appendChild(tr);
  });

  dom.reorderCandidateCount.textContent = formatCount(rows.length);
  dom.reorderUrgentCount.textContent = formatCount(urgentCount);
  dom.reorderSuggestedUnits.textContent = formatCount(suggestedUnits);
  dom.reorderEstimatedCost.textContent = formatCurrency(estimatedCost);
  dom.reorderFastestItem.textContent = fastestMover
    ? `${fastestMover.item_name} (${formatNumber(fastestMover.sold_30_days)} sold / 30d)`
    : "-";
}

function resetSlowMovingPlanner() {
  dom.slowMovingCard.hidden = true;
  dom.slowMovingCount.textContent = "0";
  dom.slowMovingUnits.textContent = "0";
  dom.slowMovingValue.textContent = "Rs. 0.00";
  dom.slowMovingIdleCount.textContent = "0";
  dom.slowMovingIdleCountInline.textContent = "0";
  dom.slowMovingTopItem.textContent = "-";
  dom.slowMovingAverageCover.textContent = "0.00 days";
  dom.slowMovingBody.innerHTML =
    '<tr><td colspan="5" class="text-muted">Slow-moving stock suggestions will appear here.</td></tr>';
}

function renderSlowMovingPlanner(rows) {
  dom.slowMovingCard.hidden = false;
  dom.slowMovingBody.innerHTML = "";

  if (!rows.length) {
    dom.slowMovingCount.textContent = "0";
    dom.slowMovingUnits.textContent = "0";
    dom.slowMovingValue.textContent = "Rs. 0.00";
    dom.slowMovingIdleCount.textContent = "0";
    dom.slowMovingIdleCountInline.textContent = "0";
    dom.slowMovingTopItem.textContent = "No bulky slow mover right now";
    dom.slowMovingAverageCover.textContent = "--";
    dom.slowMovingBody.innerHTML =
      '<tr><td colspan="5" class="text-muted">Current stock is moving well. No slow-moving pile stands out right now.</td></tr>';
    return;
  }

  let totalUnits = 0;
  let totalValue = 0;
  let idleCount = 0;
  let totalCoverDays = 0;
  let coverCount = 0;
  let topItem = rows[0];

  rows.forEach((row) => {
    const availableQty = Number(row.available_qty) || 0;
    const soldLast30Days = Number(row.sold_30_days) || 0;
    const daysCover = row.days_cover == null ? null : Number(row.days_cover);
    const stockValue = Number(row.stock_value) || 0;
    const priority = row.priority || "SLOW";
    const focusNote =
      row.focus_note ||
      (soldLast30Days <= 0
        ? "No sale in the last 30 days."
        : "Recent sales are soft for current stock.");
    const tr = document.createElement("tr");

    totalUnits += availableQty;
    totalValue += stockValue;

    if (soldLast30Days <= 0) {
      idleCount += 1;
      tr.classList.add("slow-row--stalled");
    } else if (priority === "OVERSTOCK") {
      tr.classList.add("slow-row--slow");
    }

    if ((Number(topItem?.stock_value) || 0) < stockValue) {
      topItem = row;
    }

    if (Number.isFinite(daysCover)) {
      totalCoverDays += daysCover;
      coverCount += 1;
    }

    tr.innerHTML = `
      <td>
        <div class="table-primary-copy">${escapeHtml(row.item_name)}</div>
        <div class="table-secondary-copy">
          <span class="${getSlowMovingBadgeClass(priority)}">${escapeHtml(priority)}</span>
          ${escapeHtml(focusNote)}
        </div>
      </td>
      <td>${formatNumber(availableQty)}</td>
      <td>${formatNumber(soldLast30Days)}</td>
      <td>${Number.isFinite(daysCover) ? `${formatNumber(daysCover)} days` : "No sale in 30d"}</td>
      <td>${formatCurrencyValue(stockValue)}</td>
    `;
    dom.slowMovingBody.appendChild(tr);
  });

  const averageCover = coverCount ? totalCoverDays / coverCount : 0;

  dom.slowMovingCount.textContent = formatCount(rows.length);
  dom.slowMovingUnits.textContent = formatCount(totalUnits);
  dom.slowMovingValue.textContent = formatCurrency(totalValue);
  dom.slowMovingIdleCount.textContent = formatCount(idleCount);
  dom.slowMovingIdleCountInline.textContent = formatCount(idleCount);
  dom.slowMovingTopItem.textContent = topItem
    ? `${topItem.item_name} (${formatNumber(topItem.available_qty)} units)`
    : "-";
  dom.slowMovingAverageCover.textContent = coverCount
    ? `${formatNumber(averageCover)} days`
    : "No recent sale";
}

function renderLowStock(rows) {
  dom.lowStockBody.innerHTML = "";
  dom.lowStockCard.hidden = rows.length === 0;
  dom.lowStockCount.textContent = formatCount(rows.length);

  if (!rows.length) {
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const availableQty = Number(row.available_qty) || 0;
    const soldLast30Days = Number(row.sold_30_days) || 0;
    const daysLeft = Number(row.days_left);
    const status = row.status || "MEDIUM";
    const badgeClass =
      status === "LOW" ? "badge bg-danger" : "badge bg-warning text-dark";

    if (status === "LOW") {
      tr.classList.add("critical-stock-row");
    }

    if (status === "MEDIUM") {
      tr.classList.add("warning-stock-row");
    }

    tr.innerHTML = `
      <td>${escapeHtml(row.item_name)}</td>
      <td>${formatNumber(availableQty)}</td>
      <td>${formatNumber(soldLast30Days)}</td>
      <td>${Number.isFinite(daysLeft) ? `${formatNumber(daysLeft)} days` : "--"}</td>
      <td><span class="${badgeClass}">${status}</span></td>
    `;
    dom.lowStockBody.appendChild(tr);
  });
}

async function loadLowStock(options = {}) {
  const [lowStockResult, reorderResult, slowMovingResult] =
    await Promise.allSettled([
      fetchJSON("/items/low-stock"),
      fetchJSON("/items/reorder-suggestions"),
      fetchJSON("/items/slow-moving"),
    ]);

  const lowStockLoaded = lowStockResult.status === "fulfilled";
  const reorderLoaded = reorderResult.status === "fulfilled";
  const slowMovingLoaded = slowMovingResult.status === "fulfilled";

  if (lowStockLoaded) {
    state.lowStockRows = Array.isArray(lowStockResult.value)
      ? lowStockResult.value
      : [];
    renderLowStock(state.lowStockRows);
    updateLowStockOverview(state.lowStockRows);
  } else {
    console.error("Low stock load failed:", lowStockResult.reason);
    state.lowStockRows = [];
    renderLowStock([]);
    updateLowStockOverview([]);
  }

  if (reorderLoaded) {
    state.reorderRows = Array.isArray(reorderResult.value)
      ? reorderResult.value
      : [];
    renderReorderPlanner(state.reorderRows);
  } else {
    console.error("Reorder planner load failed:", reorderResult.reason);
    state.reorderRows = [];
    resetReorderPlanner();
  }

  if (slowMovingLoaded) {
    state.slowMovingRows = Array.isArray(slowMovingResult.value)
      ? slowMovingResult.value
      : [];
    renderSlowMovingPlanner(state.slowMovingRows);
  } else {
    console.error("Slow-moving stock load failed:", slowMovingResult.reason);
    state.slowMovingRows = [];
    resetSlowMovingPlanner();
  }

  if (
    !lowStockLoaded &&
    !reorderLoaded &&
    !slowMovingLoaded &&
    !options.silent
  ) {
    showPopup(
      "error",
      "Alerts unavailable",
      "Could not load the stock planning insights right now.",
      { autoClose: false },
    );
  }
}

function validateSalesDates() {
  const fromDate = dom.fromDate.value;
  const toDate = dom.toDate.value;

  if (!fromDate || !toDate) {
    showPopup(
      "error",
      "Missing date range",
      "Select both From and To dates before loading sales data.",
      { autoClose: false },
    );
    return false;
  }

  if (fromDate > toDate) {
    showPopup(
      "error",
      "Invalid date range",
      "From date cannot be later than To date.",
      { autoClose: false },
    );
    return false;
  }

  return true;
}

function validateSalesNetProfitDates() {
  return validateRange(
    dom.salesNetProfitFromDate?.value,
    dom.salesNetProfitToDate?.value,
    {
      from: "From",
      to: "To",
    },
  );
}

function renderSalesNetProfitSummary(summary = {}, meta = {}) {
  if (!dom.salesNetProfitValue || !dom.salesNetProfitNote) {
    return;
  }

  const totalExpense = Number(summary.total_expense) || 0;
  const grossProfit = Number(summary.gross_profit) || 0;
  const netProfit = Number(summary.net_profit) || 0;
  const fromDate = meta.fromDate || dom.salesNetProfitFromDate?.value || "";
  const toDate = meta.toDate || dom.salesNetProfitToDate?.value || "";

  dom.salesNetProfitValue.textContent = formatCurrency(netProfit);
  dom.salesNetProfitValue.classList.toggle("text-danger", netProfit < 0);
  dom.salesNetProfitValue.classList.toggle("text-success", netProfit >= 0);
  dom.salesNetProfitNote.textContent = `${formatInputDate(fromDate)} to ${formatInputDate(toDate)} | Gross ${formatCurrency(grossProfit)} | Expenses ${formatCurrency(totalExpense)}`;
}

function renderSalesNetProfitFallback(message) {
  if (!dom.salesNetProfitValue || !dom.salesNetProfitNote) {
    return;
  }

  dom.salesNetProfitValue.textContent = "Rs. 0.00";
  dom.salesNetProfitValue.classList.remove("text-danger", "text-success");
  dom.salesNetProfitNote.textContent = message;
}

async function loadSalesNetProfitCard(options = {}) {
  if (!dom.salesNetProfitCard || !canAccessPermission("expense_tracking")) {
    return;
  }

  if (options.silent) {
    const fromDate = dom.salesNetProfitFromDate?.value;
    const toDate = dom.salesNetProfitToDate?.value;
    if (!fromDate || !toDate || fromDate > toDate) {
      return;
    }
  } else if (!validateSalesNetProfitDates()) {
    return;
  }

  const fromDate = dom.salesNetProfitFromDate.value;
  const toDate = dom.salesNetProfitToDate.value;
  const query = `/expenses/report?from=${fromDate}&to=${toDate}&q=`;

  const task = async () => {
    const data = await fetchJSON(query);
    renderSalesNetProfitSummary(data.summary || {}, { fromDate, toDate });
  };

  if (options.silent) {
    try {
      await task();
    } catch (error) {
      console.error("Sales net profit load failed:", error);
      renderSalesNetProfitFallback(
        "Could not load net profit for this date range right now.",
      );
    }
    return;
  }

  await withButtonState(
    dom.loadSalesNetProfitBtn,
    '<i class="fa-solid fa-spinner fa-spin"></i> View',
    async () => {
      try {
        await task();
      } catch (error) {
        console.error("Sales net profit load failed:", error);
        renderSalesNetProfitFallback(
          "Could not load net profit for this date range right now.",
        );
        showPopup(
          "error",
          "Net profit unavailable",
          error.message || "Could not load net profit for the selected range.",
          { autoClose: false },
        );
      }
    },
  );
}

function renderSalesReport(rows) {
  dom.salesReportBody.innerHTML = "";
  let subtotal = 0;
  let gstTotal = 0;
  let grandTotal = 0;

  if (!rows.length) {
    dom.salesReportBody.innerHTML =
      '<tr><td colspan="6" class="text-muted">No sales records found for this range.</td></tr>';
    dom.salesGrandTotal.textContent = "0.00";
    dom.salesGstTotal.textContent = "0.00";
    dom.salesSubtotalTotal.textContent = "0.00";
    return;
  }

  rows.forEach((row) => {
    const totalPrice = Number(row.total_price) || 0;
    const sellingPrice = Number(row.selling_price) || 0;
    const gstAmount = Number(row.gst_amount) || 0;
    const finalTotal = totalPrice + gstAmount;
    const quantity = Number(row.quantity) || 0;

    subtotal += totalPrice;
    gstTotal += gstAmount;
    grandTotal += finalTotal;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDate(row.created_at)}</td>
      <td>${escapeHtml(row.item_name)}</td>
      <td>${formatNumber(quantity)}</td>
      <td>${formatCurrencyValue(sellingPrice)}</td>
      <td>${formatCurrencyValue(gstAmount)}</td>
      <td>${formatCurrencyValue(finalTotal)}</td>
    `;
    dom.salesReportBody.appendChild(tr);
  });

  dom.salesGrandTotal.textContent = formatters.money.format(grandTotal);
  dom.salesGstTotal.textContent = formatters.money.format(gstTotal);
  dom.salesSubtotalTotal.textContent = formatters.money.format(subtotal);
}

function validateGstDates() {
  const fromDate = dom.gstFromDate.value;
  const toDate = dom.gstToDate.value;

  if (!fromDate || !toDate) {
    showPopup(
      "error",
      "Missing date range",
      "Select both From and To dates before loading the GST report.",
      { autoClose: false },
    );
    return false;
  }

  if (fromDate > toDate) {
    showPopup(
      "error",
      "Invalid date range",
      "From date cannot be later than To date.",
      { autoClose: false },
    );
    return false;
  }

  return true;
}

function resetGstAdvancedSummary() {
  dom.gstFilingPeriod.textContent =
    dom.gstFromDate.value && dom.gstToDate.value
      ? `${formatInputDate(dom.gstFromDate.value)} - ${formatInputDate(dom.gstToDate.value)}`
      : "-";
  dom.gstTopCollectionMonth.textContent = "-";
  dom.gstZeroRatedInvoices.textContent = "0";
  dom.gstDominantRate.textContent = "0.00%";
  dom.gstMonthlySummaryBody.innerHTML =
    '<tr><td colspan="5" class="text-muted">Load the GST report to view monthly summary.</td></tr>';
  dom.gstRateSummaryBody.innerHTML =
    '<tr><td colspan="5" class="text-muted">Load the GST report to view rate-wise breakup.</td></tr>';
}

function buildGstInsights(rows) {
  const monthlyMap = new Map();
  const rateMap = new Map();
  let taxableTotal = 0;
  let gstTotal = 0;
  let grandTotal = 0;
  let zeroRatedInvoices = 0;

  rows.forEach((row) => {
    const taxableAmount = Number(row.taxable_amount) || 0;
    const gstAmount = Number(row.gst_amount) || 0;
    const invoiceTotal = Number(row.invoice_total) || 0;
    const gstRate = Math.abs(Number(row.gst_rate) || 0);
    const monthBucket = getMonthBucket(row.created_at);
    const monthEntry = monthlyMap.get(monthBucket) || {
      bucket: monthBucket,
      label: formatMonthBucket(monthBucket),
      invoiceCount: 0,
      taxableTotal: 0,
      gstTotal: 0,
      invoiceTotal: 0,
    };
    const rateKey = gstRate.toFixed(2);
    const rateEntry = rateMap.get(rateKey) || {
      rate: gstRate,
      invoiceCount: 0,
      taxableTotal: 0,
      gstTotal: 0,
      invoiceTotal: 0,
    };

    taxableTotal += taxableAmount;
    gstTotal += gstAmount;
    grandTotal += invoiceTotal;

    if (Math.abs(gstAmount) < 0.005) {
      zeroRatedInvoices += 1;
    }

    monthEntry.invoiceCount += 1;
    monthEntry.taxableTotal += taxableAmount;
    monthEntry.gstTotal += gstAmount;
    monthEntry.invoiceTotal += invoiceTotal;
    monthlyMap.set(monthBucket, monthEntry);

    rateEntry.invoiceCount += 1;
    rateEntry.taxableTotal += taxableAmount;
    rateEntry.gstTotal += gstAmount;
    rateEntry.invoiceTotal += invoiceTotal;
    rateMap.set(rateKey, rateEntry);
  });

  const monthlyRows = Array.from(monthlyMap.values()).sort((left, right) =>
    left.bucket.localeCompare(right.bucket),
  );
  const rateRows = Array.from(rateMap.values()).sort(
    (left, right) =>
      left.rate - right.rate || right.taxableTotal - left.taxableTotal,
  );
  const invoiceCount = rows.length;
  const averageGst = invoiceCount ? gstTotal / invoiceCount : 0;
  const effectiveRate = taxableTotal ? (gstTotal / taxableTotal) * 100 : 0;
  const topCollectionMonth = monthlyRows.reduce(
    (best, row) => (!best || row.gstTotal > best.gstTotal ? row : best),
    null,
  );
  const dominantRate = rateRows.reduce(
    (best, row) => (!best || row.taxableTotal > best.taxableTotal ? row : best),
    null,
  );

  return {
    invoiceCount,
    taxableTotal,
    gstTotal,
    grandTotal,
    averageGst,
    effectiveRate,
    zeroRatedInvoices,
    monthlyRows,
    rateRows,
    topCollectionMonth,
    dominantRate,
  };
}

function renderGstAdvancedSummary(insights) {
  dom.gstFilingPeriod.textContent = `${formatInputDate(dom.gstFromDate.value)} - ${formatInputDate(dom.gstToDate.value)}`;
  dom.gstTopCollectionMonth.textContent =
    insights.topCollectionMonth?.label || "-";
  dom.gstZeroRatedInvoices.textContent = formatCount(
    insights.zeroRatedInvoices,
  );
  dom.gstDominantRate.textContent = insights.dominantRate
    ? formatPercent(insights.dominantRate.rate)
    : "0.00%";

  dom.gstMonthlySummaryBody.innerHTML = insights.monthlyRows.length
    ? insights.monthlyRows
        .map(
          (row) => `
            <tr>
              <td>${escapeHtml(row.label)}</td>
              <td>${formatCount(row.invoiceCount)}</td>
              <td>${formatCurrencyValue(row.taxableTotal)}</td>
              <td>${formatCurrencyValue(row.gstTotal)}</td>
              <td>${formatCurrencyValue(row.invoiceTotal)}</td>
            </tr>
          `,
        )
        .join("")
    : '<tr><td colspan="5" class="text-muted">No monthly GST summary found.</td></tr>';

  dom.gstRateSummaryBody.innerHTML = insights.rateRows.length
    ? insights.rateRows
        .map(
          (row) => `
            <tr>
              <td>${formatPercent(row.rate)}</td>
              <td>${formatCount(row.invoiceCount)}</td>
              <td>${formatCurrencyValue(row.taxableTotal)}</td>
              <td>${formatCurrencyValue(row.gstTotal)}</td>
              <td>${formatCurrencyValue(row.invoiceTotal)}</td>
            </tr>
          `,
        )
        .join("")
    : '<tr><td colspan="5" class="text-muted">No GST rate breakup found.</td></tr>';
}

function renderGstReport(rows) {
  dom.gstReportBody.innerHTML = "";

  if (!rows.length) {
    dom.gstReportBody.innerHTML =
      '<tr><td colspan="6" class="text-muted">No GST records found for this range.</td></tr>';
    dom.gstInvoiceCount.textContent = "0";
    dom.gstTaxableTotal.textContent = "Rs. 0.00";
    dom.gstCollectedTotal.textContent = "Rs. 0.00";
    dom.gstReportGrandTotal.textContent = "Rs. 0.00";
    dom.gstAveragePerInvoice.textContent = "0.00";
    dom.gstEffectiveRate.textContent = "0.00%";
    resetGstAdvancedSummary();
    return;
  }

  const insights = buildGstInsights(rows);

  rows.forEach((row) => {
    const taxableAmount = Number(row.taxable_amount) || 0;
    const gstAmount = Number(row.gst_amount) || 0;
    const invoiceTotal = Number(row.invoice_total) || 0;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDate(row.created_at)}</td>
      <td>${escapeHtml(row.invoice_no || "-")}</td>
      <td>${escapeHtml(row.customer_name || "Walk-in Customer")}</td>
      <td>${formatCurrencyValue(taxableAmount)}</td>
      <td>${formatCurrencyValue(gstAmount)}</td>
      <td>${formatCurrencyValue(invoiceTotal)}</td>
    `;
    dom.gstReportBody.appendChild(tr);
  });

  dom.gstInvoiceCount.textContent = formatCount(insights.invoiceCount);
  dom.gstTaxableTotal.textContent = formatCurrency(insights.taxableTotal);
  dom.gstCollectedTotal.textContent = formatCurrency(insights.gstTotal);
  dom.gstReportGrandTotal.textContent = formatCurrency(insights.grandTotal);
  dom.gstAveragePerInvoice.textContent = formatters.money.format(
    insights.averageGst,
  );
  dom.gstEffectiveRate.textContent = formatPercent(
    Math.abs(insights.effectiveRate),
  );
  renderGstAdvancedSummary(insights);
}

async function loadSalesReport(options = {}) {
  if (!validateSalesDates()) {
    return;
  }

  const fromDate = dom.fromDate.value;
  const toDate = dom.toDate.value;
  const query = `/sales/report?from=${fromDate}&to=${toDate}`;

  const task = async () => {
    const rows = await fetchJSON(query);
    state.currentSalesRows = Array.isArray(rows) ? rows : [];
    renderSalesReport(state.currentSalesRows);
  };

  if (options.silent) {
    try {
      await task();
    } catch (error) {
      console.error("Sales report load failed:", error);
    }
    return;
  }

  await withButtonState(
    dom.loadSalesBtn,
    '<i class="fa-solid fa-spinner fa-spin"></i> Loading sales...',
    async () => {
      try {
        await task();
      } catch (error) {
        console.error("Sales report load failed:", error);
        showPopup(
          "error",
          "Sales report unavailable",
          "Could not load sales data for the selected range.",
          { autoClose: false },
        );
      }
    },
  );
}

async function loadGstReport(options = {}) {
  if (!validateGstDates()) {
    return;
  }

  const fromDate = dom.gstFromDate.value;
  const toDate = dom.gstToDate.value;
  const query = `/gst/report?from=${fromDate}&to=${toDate}`;

  const task = async () => {
    const rows = await fetchJSON(query);
    state.currentGstRows = Array.isArray(rows) ? rows : [];
    renderGstReport(state.currentGstRows);
  };

  if (options.silent) {
    try {
      await task();
    } catch (error) {
      console.error("GST report load failed:", error);
    }
    return;
  }

  await withButtonState(
    dom.loadGstBtn,
    '<i class="fa-solid fa-spinner fa-spin"></i> Loading GST...',
    async () => {
      try {
        await task();
      } catch (error) {
        console.error("GST report load failed:", error);
        showPopup(
          "error",
          "GST report unavailable",
          "Could not load GST data for the selected range.",
          { autoClose: false },
        );
      }
    },
  );
}

async function downloadItemReportPDF() {
  const item = dom.itemReportSearch.value.trim();
  const query = item ? `?name=${encodeURIComponent(item)}` : "";
  const fallbackName = item
    ? `${sanitizeFileName(item)}-stock-report.pdf`
    : "stock-report.pdf";

  await withButtonState(
    dom.itemReportPdfBtn,
    '<i class="fa-solid fa-spinner fa-spin"></i> Preparing PDF...',
    async () => {
      try {
        await downloadAuthenticatedFile(
          `/items/report/pdf${query}`,
          fallbackName,
        );
        showPopup(
          "success",
          "Download complete",
          "The stock report PDF has been downloaded.",
        );
      } catch (error) {
        console.error("Stock PDF download failed:", error);
        showPopup(
          "error",
          "Download failed",
          error.message || "Could not download the stock report PDF.",
          { autoClose: false },
        );
      }
    },
  );
}

async function downloadSalesPDF() {
  if (!validateSalesDates()) {
    return;
  }

  const fromDate = dom.fromDate.value;
  const toDate = dom.toDate.value;

  await withButtonState(
    dom.pdfBtn,
    '<i class="fa-solid fa-spinner fa-spin"></i> Preparing PDF...',
    async () => {
      try {
        await downloadAuthenticatedFile(
          `/sales/report/pdf?from=${fromDate}&to=${toDate}`,
          `sales-report-${fromDate}-to-${toDate}.pdf`,
        );
        showPopup(
          "success",
          "Download complete",
          "The sales report PDF has been downloaded.",
        );
      } catch (error) {
        console.error("Sales PDF download failed:", error);
        showPopup(
          "error",
          "Download failed",
          error.message || "Could not download the sales PDF.",
          { autoClose: false },
        );
      }
    },
  );
}

async function downloadSalesExcel() {
  if (!validateSalesDates()) {
    return;
  }

  const fromDate = dom.fromDate.value;
  const toDate = dom.toDate.value;

  await withButtonState(
    dom.excelBtn,
    '<i class="fa-solid fa-spinner fa-spin"></i> Preparing Excel...',
    async () => {
      try {
        await downloadAuthenticatedFile(
          `/sales/report/excel?from=${fromDate}&to=${toDate}`,
          `sales-report-${fromDate}-to-${toDate}.xlsx`,
        );
        showPopup(
          "success",
          "Download complete",
          "The sales report Excel file has been downloaded.",
        );
      } catch (error) {
        console.error("Sales Excel download failed:", error);
        showPopup(
          "error",
          "Download failed",
          error.message || "Could not download the sales Excel file.",
          { autoClose: false },
        );
      }
    },
  );
}

async function downloadGstPDF() {
  if (!validateGstDates()) {
    return;
  }

  const fromDate = dom.gstFromDate.value;
  const toDate = dom.gstToDate.value;

  await withButtonState(
    dom.gstPdfBtn,
    '<i class="fa-solid fa-spinner fa-spin"></i> Preparing PDF...',
    async () => {
      try {
        await downloadAuthenticatedFile(
          `/gst/report/pdf?from=${fromDate}&to=${toDate}`,
          `gst-report-${fromDate}-to-${toDate}.pdf`,
        );
        showPopup(
          "success",
          "Download complete",
          "The GST report PDF has been downloaded.",
        );
      } catch (error) {
        console.error("GST PDF download failed:", error);
        showPopup(
          "error",
          "Download failed",
          error.message || "Could not download the GST PDF.",
          { autoClose: false },
        );
      }
    },
  );
}

async function downloadGstExcel() {
  if (!validateGstDates()) {
    return;
  }

  const fromDate = dom.gstFromDate.value;
  const toDate = dom.gstToDate.value;

  await withButtonState(
    dom.gstExcelBtn,
    '<i class="fa-solid fa-spinner fa-spin"></i> Preparing Excel...',
    async () => {
      try {
        await downloadAuthenticatedFile(
          `/gst/report/excel?from=${fromDate}&to=${toDate}`,
          `gst-report-${fromDate}-to-${toDate}.xlsx`,
        );
        showPopup(
          "success",
          "Download complete",
          "The GST report Excel file has been downloaded.",
        );
      } catch (error) {
        console.error("GST Excel download failed:", error);
        showPopup(
          "error",
          "Download failed",
          error.message || "Could not download the GST Excel file.",
          { autoClose: false },
        );
      }
    },
  );
}

async function submitDebt() {
  const customerName = dom.cdName.value.trim();
  const customerNumber = dom.cdNumber.value.trim();
  const total = Number(dom.cdTotal.value) || 0;
  const credit = Number(dom.cdCredit.value) || 0;
  const remark = dom.cdRemark.value.trim();

  if (!customerName) {
    showPopup(
      "error",
      "Missing customer name",
      "Customer name is required before saving a due entry.",
      { autoClose: false },
    );
    return;
  }

  if (!/^\d{10}$/.test(customerNumber)) {
    showPopup(
      "error",
      "Invalid mobile number",
      "Enter a valid 10-digit mobile number.",
      { autoClose: false },
    );
    return;
  }

  if (total < 0 || credit < 0) {
    showPopup(
      "error",
      "Invalid amount",
      "Amount and credit cannot be negative.",
      { autoClose: false },
    );
    return;
  }

  if (total === 0 && credit === 0) {
    showPopup(
      "error",
      "Missing amount",
      "Enter an amount or a credit value before submitting.",
      { autoClose: false },
    );
    return;
  }

  if (total > 0 && credit > total) {
    showPopup(
      "error",
      "Credit is too high",
      "Credit amount cannot be greater than the total amount.",
      { autoClose: false },
    );
    return;
  }

  await withButtonState(
    dom.submitDebtBtn,
    '<i class="fa-solid fa-spinner fa-spin"></i> Saving due...',
    async () => {
      try {
        const data = await fetchJSON("/debts", {
          method: "POST",
          body: JSON.stringify({
            customer_name: customerName,
            customer_number: customerNumber,
            total,
            credit,
            remark,
          }),
        });

        showPopup(
          "success",
          "Due saved",
          data.message || "Customer due entry added successfully.",
        );

        resetCustomerDueForm();
        await loadDashboardOverview({ silent: true });

        if (state.ledgerMode === "summary") {
          await showAllDues({ silent: true });
        }

        if (
          state.ledgerMode === "ledger" &&
          state.currentLedgerNumber === customerNumber
        ) {
          await searchLedger({ value: customerNumber, silent: true });
        }
      } catch (error) {
        console.error("Due submit failed:", error);
        showPopup(
          "error",
          "Save failed",
          error.message || "Could not save the due entry.",
          { autoClose: false },
        );
      }
    },
  );
}

async function loadBusinessTrend(year = "all", options = {}) {
  if (!canAccessPermission("sales_report") || !dom.businessTrendChart) {
    return;
  }

  try {
    const ChartLibrary = await ensureChartLibrary();
    const payload = await fetchJSON(`/sales/monthly-trend?year=${year}`);
    const rows = Array.isArray(payload)
      ? payload
      : Array.isArray(payload.timeline)
        ? payload.timeline
        : [];
    const mode = Array.isArray(payload)
      ? year === "all"
        ? "all"
        : "year"
      : payload.mode || (year === "all" ? "all" : "year");
    const selectedYear = Array.isArray(payload)
      ? year === "all"
        ? null
        : Number.parseInt(year, 10)
      : (payload.year ?? (year === "all" ? null : Number.parseInt(year, 10)));

    setTrendYearFilterOptions(
      Array.isArray(payload?.available_years) ? payload.available_years : [],
      year,
    );

    const trendContext = {
      mode,
      year: Number.isInteger(selectedYear) ? selectedYear : null,
    };
    const labels = rows.map(
      (row) => row.month_label || formatMonthBucket(row.month_key),
    );
    const sales = buildTrendChartSeries(rows, "total_sales", trendContext);
    const profit = buildTrendChartSeries(rows, "total_profit", trendContext);
    const referenceRow = resolveTrendReferenceRow(rows, trendContext);
    const referenceIndex = referenceRow
      ? rows.findIndex((row) => row.month_key === referenceRow.month_key)
      : -1;

    renderBusinessTrend(labels, sales, profit, ChartLibrary, {
      referenceIndex,
      denseTimeline: labels.length > 12,
    });
    updateGrowthOverviewMeta(rows, trendContext);
    updateGrowthBadge(rows, trendContext);
  } catch (error) {
    console.error("Business trend load failed:", error);
    if (!options.silent) {
      showPopup(
        "error",
        "Chart unavailable",
        "Could not load the monthly business trend chart.",
        { autoClose: false },
      );
    }
  }
}

function setTrendYearFilterOptions(availableYears = [], selectedValue = "all") {
  if (!dom.yearFilter) {
    return;
  }

  const normalizedSelected =
    selectedValue == null ? "all" : String(selectedValue);
  const years = Array.from(
    new Set(
      (Array.isArray(availableYears) ? availableYears : [])
        .map((year) => Number.parseInt(year, 10))
        .filter((year) => Number.isInteger(year) && year >= 2000),
    ),
  ).sort((a, b) => b - a);

  dom.yearFilter.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "All";
  dom.yearFilter.appendChild(allOption);

  years.forEach((year) => {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = String(year);
    dom.yearFilter.appendChild(option);
  });

  const selectedYearNumber = Number.parseInt(normalizedSelected, 10);
  const shouldKeepSelected =
    normalizedSelected === "all" || years.includes(selectedYearNumber);

  dom.yearFilter.value = shouldKeepSelected ? normalizedSelected : "all";
}

function isFutureTrendMonth(row, context = {}) {
  const selectedYear = Number.parseInt(context.year, 10);
  const currentMonthKey = getCurrentMonthKey();
  const currentYear = Number.parseInt(currentMonthKey.slice(0, 4), 10);

  return (
    context.mode === "year" &&
    Number.isInteger(selectedYear) &&
    selectedYear === currentYear &&
    String(row?.month_key || "") > currentMonthKey
  );
}

function buildTrendChartSeries(rows, fieldName, context = {}) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    if (isFutureTrendMonth(row, context)) {
      return null;
    }

    return Number(row?.[fieldName]) || 0;
  });
}

function resolveTrendReferenceRow(rows, context = {}) {
  if (!Array.isArray(rows) || !rows.length) {
    return null;
  }

  const currentMonthKey = getCurrentMonthKey();

  if (context.mode === "all") {
    return (
      rows.find((row) => row.month_key === currentMonthKey) ||
      rows[rows.length - 1]
    );
  }

  const selectedYear = Number.parseInt(context.year, 10);
  const currentYear = Number.parseInt(currentMonthKey.slice(0, 4), 10);

  if (Number.isInteger(selectedYear) && selectedYear === currentYear) {
    const currentRow = rows.find((row) => row.month_key === currentMonthKey);
    if (currentRow) {
      return currentRow;
    }

    const visibleRows = rows.filter((row) => !isFutureTrendMonth(row, context));
    return visibleRows[visibleRows.length - 1] || rows[0];
  }

  return rows[rows.length - 1];
}

function resolvePreviousTrendRow(rows, referenceRow) {
  if (!Array.isArray(rows) || !rows.length || !referenceRow) {
    return null;
  }

  const referenceIndex = rows.findIndex(
    (row) => row.month_key === referenceRow.month_key,
  );

  return referenceIndex > 0 ? rows[referenceIndex - 1] : null;
}

function resolveTrendAverageBaseline(rows, referenceRow, context = {}) {
  if (!Array.isArray(rows) || !rows.length || !referenceRow) {
    return {
      comparisonRows: [],
      averageSales: 0,
    };
  }

  const visibleRows = rows.filter((row) => !isFutureTrendMonth(row, context));
  const referenceIndex = visibleRows.findIndex(
    (row) => row.month_key === referenceRow.month_key,
  );
  const comparisonRows =
    referenceIndex > 0 ? visibleRows.slice(0, referenceIndex) : [];
  const totalSales = comparisonRows.reduce(
    (sum, row) => sum + (Number(row.total_sales) || 0),
    0,
  );

  return {
    comparisonRows,
    averageSales: comparisonRows.length
      ? totalSales / comparisonRows.length
      : 0,
  };
}

function updateGrowthOverviewMeta(rows, context = {}) {
  if (
    !dom.growthRangeLabel ||
    !dom.growthRangeNote ||
    !dom.growthLatestValue ||
    !dom.growthLatestNote ||
    !dom.growthPeakValue ||
    !dom.growthPeakNote ||
    !dom.growthLivePill
  ) {
    return;
  }

  if (!Array.isArray(rows) || !rows.length) {
    dom.growthRangeLabel.textContent = "No data";
    dom.growthRangeNote.textContent =
      "Monthly trend will appear after sales are recorded.";
    dom.growthLatestValue.textContent = "Rs. 0.00";
    dom.growthLatestNote.textContent =
      "Current month sales and profit snapshot will appear here.";
    dom.growthPeakValue.textContent = "Rs. 0.00";
    dom.growthPeakNote.textContent =
      "Peak revenue month inside the active timeline.";
    dom.growthLivePill.textContent = "Waiting for sales data";
    return;
  }

  const referenceRow =
    resolveTrendReferenceRow(rows, context) || rows[rows.length - 1];
  const visibleRows = rows.filter((row) => !isFutureTrendMonth(row, context));
  const peakRow = visibleRows.reduce(
    (bestRow, row) =>
      Number(row.total_sales || 0) > Number(bestRow.total_sales || 0)
        ? row
        : bestRow,
    visibleRows[0] || rows[0],
  );
  const zeroMonths = visibleRows.filter(
    (row) => Number(row.total_sales || 0) === 0,
  ).length;
  const currentYear = Number.parseInt(getCurrentMonthKey().slice(0, 4), 10);

  if (context.mode === "year" && Number.isInteger(context.year)) {
    dom.growthRangeLabel.textContent = `${context.year} | 12 months`;
    dom.growthRangeNote.textContent =
      context.year === currentYear
        ? "Jan to Dec stays visible. Future months will fill in as new sales happen."
        : `Full January to December snapshot for ${context.year}.`;
    dom.growthLivePill.textContent =
      context.year === currentYear
        ? `Updated through ${referenceRow.month_label}`
        : `Full ${context.year} snapshot`;
  } else {
    dom.growthRangeLabel.textContent = `${rows[0].month_label} - ${rows[rows.length - 1].month_label}`;
    dom.growthRangeNote.textContent = `Continuous month-by-month view with ${visibleRows.length} months in the active timeline.`;
    dom.growthLivePill.textContent = `Updated through ${referenceRow.month_label}`;
  }

  dom.growthLatestValue.textContent = formatCurrency(referenceRow.total_sales);
  dom.growthLatestNote.textContent = `${referenceRow.month_label} sales | Profit ${formatCurrency(referenceRow.total_profit)}`;
  dom.growthPeakValue.textContent = formatCurrency(peakRow.total_sales);
  dom.growthPeakNote.textContent = `${peakRow.month_label} peak revenue${
    zeroMonths > 0
      ? ` | ${zeroMonths} zero-sale month${zeroMonths === 1 ? "" : "s"} visible`
      : ""
  }.`;
}

function updateGrowthBadge(rows, context = {}) {
  if (!dom.growthBadge) {
    return;
  }

  const referenceRow = resolveTrendReferenceRow(rows, context);
  const { comparisonRows, averageSales } = resolveTrendAverageBaseline(
    rows,
    referenceRow,
    context,
  );
  const visibleRowCount = Array.isArray(rows)
    ? rows.filter((row) => !isFutureTrendMonth(row, context)).length
    : 0;
  const currentYear = Number.parseInt(getCurrentMonthKey().slice(0, 4), 10);
  const futureHint =
    context.mode === "year" && Number(context.year) === currentYear
      ? "Future months stay on the axis and will fill in as sales happen."
      : `${visibleRowCount} months are visible in this view.`;

  if (!referenceRow || !comparisonRows.length) {
    dom.growthBadge.innerHTML = `
      <span class="growth-badge__signal growth-badge__signal--neutral">
        <i class="fa-solid fa-wave-square"></i>
        Need at least two visible months to compare against the earlier average.
      </span>
      <span class="growth-badge__detail">
        Once another earlier month is available in the active timeline, average-based growth will appear here.
      </span>
    `;
    return;
  }

  const latestSales = Number(referenceRow.total_sales) || 0;
  const baselineStart = comparisonRows[0]?.month_label || "";
  const baselineEnd =
    comparisonRows[comparisonRows.length - 1]?.month_label || baselineStart;
  const baselineLabel =
    comparisonRows.length === 1
      ? baselineStart
      : `${baselineStart} - ${baselineEnd}`;

  if (averageSales <= 0) {
    dom.growthBadge.innerHTML = `
      <span class="growth-badge__signal growth-badge__signal--neutral">
        <i class="fa-solid fa-chart-simple"></i>
        ${referenceRow.month_label} recorded ${formatCurrency(latestSales)} sales.
      </span>
      <span class="growth-badge__detail">
        The average of the earlier ${comparisonRows.length} month${comparisonRows.length === 1 ? "" : "s"} is not yet comparable. ${futureHint}
      </span>
    `;
    return;
  }

  const growth = ((latestSales - averageSales) / averageSales) * 100;
  const directionClass = growth >= 0 ? "positive" : "negative";
  const directionIcon =
    growth >= 0 ? "fa-arrow-trend-up" : "fa-arrow-trend-down";
  const directionText = growth >= 0 ? "growth" : "drop";

  dom.growthBadge.innerHTML = `
    <span class="growth-badge__signal growth-badge__signal--${directionClass}">
      <i class="fa-solid ${directionIcon}"></i>
      ${Math.abs(growth).toFixed(1)}% ${directionText} vs earlier monthly average
    </span>
    <span class="growth-badge__detail">
      Comparing ${referenceRow.month_label} with the average of ${comparisonRows.length} earlier month${comparisonRows.length === 1 ? "" : "s"} from ${baselineLabel}. ${futureHint}
    </span>
  `;
}

function renderBusinessTrend(
  labels,
  sales,
  profit,
  ChartLibrary = window.Chart,
  options = {},
) {
  const ctx = dom.businessTrendChart.getContext("2d");

  if (state.charts.businessTrend) {
    state.charts.businessTrend.destroy();
  }

  const salesGradient = ctx.createLinearGradient(0, 0, 0, 260);
  salesGradient.addColorStop(0, "rgba(14, 165, 233, 0.26)");
  salesGradient.addColorStop(1, "rgba(14, 165, 233, 0.02)");

  const profitGradient = ctx.createLinearGradient(0, 0, 0, 260);
  profitGradient.addColorStop(0, "rgba(20, 184, 166, 0.24)");
  profitGradient.addColorStop(1, "rgba(20, 184, 166, 0.02)");
  const highlightIndex =
    options.referenceIndex >= 0
      ? options.referenceIndex
      : sales.reduce(
          (lastIndex, value, index) => (value === null ? lastIndex : index),
          -1,
        );

  state.charts.businessTrend = new ChartLibrary(ctx, {
    type: "line",
    plugins: [businessTrendHoverLinePlugin],
    data: {
      labels,
      datasets: [
        {
          label: "Sales",
          data: sales,
          borderColor: "#0ea5e9",
          backgroundColor: salesGradient,
          fill: true,
          borderWidth: 3,
          tension: 0.36,
          pointRadius(context) {
            return context.dataIndex === highlightIndex ? 4 : 0;
          },
          pointHoverRadius: 6,
          pointHitRadius: 18,
          pointBackgroundColor: "#0ea5e9",
          pointBorderColor: "#ffffff",
          pointBorderWidth(context) {
            return context.dataIndex === highlightIndex ? 3 : 0;
          },
        },
        {
          label: "Profit",
          data: profit,
          borderColor: "#14b8a6",
          backgroundColor: profitGradient,
          fill: true,
          borderWidth: 3,
          tension: 0.36,
          pointRadius(context) {
            return context.dataIndex === highlightIndex ? 4 : 0;
          },
          pointHoverRadius: 6,
          pointHitRadius: 18,
          pointBackgroundColor: "#14b8a6",
          pointBorderColor: "#ffffff",
          pointBorderWidth(context) {
            return context.dataIndex === highlightIndex ? 3 : 0;
          },
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          position: "top",
          labels: {
            usePointStyle: true,
            boxWidth: 10,
            color: "#27406b",
            padding: 18,
          },
        },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.92)",
          titleColor: "#ffffff",
          bodyColor: "#e2e8f0",
          borderColor: "rgba(148, 163, 184, 0.22)",
          borderWidth: 1,
          padding: 12,
          displayColors: true,
          callbacks: {
            title(context) {
              return context[0]?.label || "";
            },
            label(context) {
              return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            color: "#5f7496",
            maxRotation: 0,
            autoSkip: Boolean(options.denseTimeline),
            maxTicksLimit: options.denseTimeline ? 10 : 12,
          },
        },
        y: {
          beginAtZero: true,
          grid: {
            color: "rgba(117, 142, 180, 0.14)",
            drawBorder: false,
          },
          ticks: {
            color: "#5f7496",
            callback(value) {
              return formatCompactCurrency(value);
            },
          },
        },
      },
    },
  });
}

function initYearFilter() {
  if (!dom.yearFilter || dom.yearFilter.dataset.initialized === "true") {
    return;
  }

  dom.yearFilter.addEventListener("change", () => {
    loadBusinessTrend(dom.yearFilter.value, { silent: true });
  });
  dom.yearFilter.dataset.initialized = "true";
}

async function loadLast13MonthsChart(options = {}) {
  if (!canAccessPermission("sales_report") || !dom.last12MonthsChart) {
    return;
  }

  try {
    const ChartLibrary = await ensureChartLibrary();
    const rows = await fetchJSON("/sales/last-13-months");
    const labels = rows.map((row) => row.month);
    const data = rows.map((row) => Number(row.total_sales) || 0);
    renderLast13MonthsChart(labels, data, ChartLibrary);
  } catch (error) {
    console.error("Last 13 months chart failed:", error);
    if (!options.silent) {
      showPopup(
        "error",
        "Chart unavailable",
        "Could not load the recent sales chart.",
        { autoClose: false },
      );
    }
  }
}

function renderLast13MonthsChart(labels, values, ChartLibrary = window.Chart) {
  const ctx = dom.last12MonthsChart.getContext("2d");

  if (state.charts.last13Months) {
    state.charts.last13Months.destroy();
  }

  const barGradient = ctx.createLinearGradient(0, 0, 0, 260);
  barGradient.addColorStop(0, "rgba(37, 99, 235, 0.95)");
  barGradient.addColorStop(1, "rgba(14, 165, 233, 0.52)");

  state.charts.last13Months = new ChartLibrary(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: barGradient,
          borderRadius: 10,
          maxBarThickness: 28,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label(context) {
              return `Sales: ${formatCurrency(context.parsed.y)}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
        },
        y: {
          beginAtZero: true,
          ticks: {
            callback(value) {
              return formatCurrency(value);
            },
          },
        },
      },
    },
  });
}

async function loadCustomerSuggestions(query) {
  try {
    const rows = await fetchJSON(
      `/debts/customers?q=${encodeURIComponent(query)}`,
    );
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.error("Customer suggestions failed:", error);
    return [];
  }
}

async function loadExpenseSuggestions(query) {
  try {
    const rows = await fetchJSON(
      `/expenses/suggestions?q=${encodeURIComponent(query)}`,
    );
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.error("Expense suggestions failed:", error);
    return [];
  }
}

function renderCustomerDropdown(listEl, customers, onSelect) {
  if (!customers.length) {
    hideElement(listEl);
    listEl.innerHTML = "";
    listEl.onclick = null;
    return;
  }

  listEl.innerHTML = customers
    .map((customer) => {
      const customerName = escapeHtml(customer.customer_name);
      const customerNumber = escapeHtml(customer.customer_number);

      return `
        <div
          class="dropdown-item dropdown-item--customer"
          data-name="${encodeURIComponent(customer.customer_name)}"
          data-number="${encodeURIComponent(customer.customer_number)}"
        >
          <span class="dropdown-item__title">${customerName}</span>
          <span class="dropdown-item__meta">${customerNumber} - Existing ledger match</span>
        </div>
      `;
    })
    .join("");

  showElement(listEl);
  listEl.onclick = (event) => {
    const item = event.target.closest(".dropdown-item");
    if (!item || !listEl.contains(item)) {
      return;
    }

    onSelect({
      name: decodeURIComponent(item.dataset.name),
      number: decodeURIComponent(item.dataset.number),
    });
    hideElement(listEl);
  };
}

function renderExpenseDropdown(listEl, entries, onSelect) {
  if (!entries.length) {
    hideElement(listEl);
    listEl.innerHTML = "";
    listEl.onclick = null;
    return;
  }

  listEl.innerHTML = entries
    .map((entry) => {
      const value = escapeHtml(entry.value || "");
      const type = escapeHtml(entry.type || "Match");

      return `
        <div
          class="dropdown-item dropdown-item--customer"
          data-value="${encodeURIComponent(entry.value || "")}"
        >
          <span class="dropdown-item__title">${value}</span>
          <span class="dropdown-item__meta">${type} match</span>
        </div>
      `;
    })
    .join("");

  showElement(listEl);
  listEl.onclick = (event) => {
    const item = event.target.closest(".dropdown-item");
    if (!item || !listEl.contains(item)) {
      return;
    }

    onSelect({
      value: decodeURIComponent(item.dataset.value),
    });
    hideElement(listEl);
  };
}

function renderEmptyLedger(message) {
  const normalizedMessage = String(message || "").trim();
  const title = /^Could not/i.test(normalizedMessage)
    ? "Customer ledger is unavailable"
    : /^No records/i.test(normalizedMessage)
      ? "No ledger rows found"
      : "Ledger workspace is ready";

  dom.ledgerTable.innerHTML = `
    <div class="due-empty-state">
      <div class="due-empty-state__icon">
        <i class="fa-solid fa-address-book"></i>
      </div>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(normalizedMessage)}</p>
    </div>
  `;
  state.ledgerMode = "empty";
  state.currentLedgerNumber = "";
  state.currentLedgerName = "";
  state.currentLedgerOutstanding = 0;
  state.currentLedgerEntryCount = 0;
  updateDueWorkspaceMeta();
}

function updateDueOverviewFromRows(rows) {
  const totalBalance = rows.reduce((sum, row) => {
    return sum + (Number(row.balance) || 0);
  }, 0);
  state.dueSummaryCustomerCount = rows.length;
  state.dueSummaryOutstanding = totalBalance;
  dom.statDueBalance.textContent = formatCurrency(totalBalance);
  dom.statDueNote.textContent = rows.length
    ? `${formatCount(rows.length)} customer${rows.length === 1 ? "" : "s"} currently have pending balances.`
    : "No outstanding due balance at the moment.";

  updateHeroSummary({
    itemCount: parseFormattedNumber(dom.statCatalogCount.textContent),
    lowStockCount: parseFormattedNumber(dom.statLowStock.textContent),
    dueCustomerCount: rows.length,
  });
  updateDueWorkspaceMeta();
}

function renderLedgerTable(rows, mode = "summary") {
  if (!rows.length) {
    renderEmptyLedger("No records found for this customer selection.");
    return;
  }

  let totalOutstanding = 0;
  let tableHead = "";
  let tableBody = "";
  let ledgerActionHtml = "";

  if (mode === "summary") {
    state.ledgerMode = "summary";
    state.currentLedgerNumber = "";
    state.currentLedgerName = "";
    state.currentLedgerOutstanding = 0;
    state.currentLedgerEntryCount = 0;

    tableHead = `
      <thead>
        <tr>
          <th>
            <span class="table-label-full">Name</span>
            <span class="table-label-compact">Name</span>
          </th>
          <th>
            <span class="table-label-full">Number</span>
            <span class="table-label-compact">No.</span>
          </th>
          <th>
            <span class="table-label-full">Total</span>
            <span class="table-label-compact">Total</span>
          </th>
          <th>
            <span class="table-label-full">Credit</span>
            <span class="table-label-compact">Credit</span>
          </th>
          <th>
            <span class="table-label-full">Balance</span>
            <span class="table-label-compact">Bal.</span>
          </th>
        </tr>
      </thead>
    `;

    rows.forEach((row) => {
      const total = Number(row.total) || 0;
      const credit = Number(row.credit) || 0;
      const balance = Number(row.balance) || 0;
      const customerName = escapeHtml(row.customer_name);
      const customerNumber = escapeHtml(row.customer_number);

      totalOutstanding += balance;
      tableBody += `
        <tr
          class="interactive-row"
          data-number="${customerNumber}"
          tabindex="0"
          role="button"
          aria-label="Open ledger for ${customerName}"
        >
          <td data-label="Name">
            <div class="due-row-title">
              <strong>${customerName}</strong>
              <span class="table-row-hint">
                <i class="fa-solid fa-arrow-up-right-from-square"></i>
                Open full ledger
              </span>
            </div>
          </td>
          <td data-label="Number">${customerNumber}</td>
          <td data-label="Total">${formatCurrencyValue(total)}</td>
          <td data-label="Credit">${formatCurrencyValue(credit)}</td>
          <td data-label="Balance">${renderDueBalancePill(balance)}</td>
        </tr>
      `;
    });

    updateDueOverviewFromRows(rows);
  } else {
    const ledgerNumber = rows[0]?.customer_number || "";
    const customerName = rows[0]?.customer_name || "Selected customer";

    state.ledgerMode = "ledger";
    state.currentLedgerNumber = ledgerNumber;
    state.currentLedgerName = customerName;

    tableHead = `
      <thead>
        <tr>
          <th>
            <span class="table-label-full">Date</span>
            <span class="table-label-compact">Date</span>
          </th>
          <th>
            <span class="table-label-full">Total</span>
            <span class="table-label-compact">Total</span>
          </th>
          <th>
            <span class="table-label-full">Credit</span>
            <span class="table-label-compact">Credit</span>
          </th>
          <th>
            <span class="table-label-full">Balance</span>
            <span class="table-label-compact">Bal.</span>
          </th>
          <th>
            <span class="table-label-full">Remarks</span>
            <span class="table-label-compact">Note</span>
          </th>
        </tr>
      </thead>
    `;

    rows.forEach((row) => {
      totalOutstanding += (Number(row.total) || 0) - (Number(row.credit) || 0);
      totalOutstanding = Number(totalOutstanding.toFixed(2));

      tableBody += `
        <tr>
          <td data-label="Date">${formatDate(row.created_at)}</td>
          <td data-label="Total">${formatCurrencyValue(row.total)}</td>
          <td data-label="Credit">${formatCurrencyValue(row.credit)}</td>
          <td data-label="Balance">${renderDueBalancePill(totalOutstanding)}</td>
          <td data-label="Remarks">${escapeHtml(row.remark || "-")}</td>
        </tr>
      `;
    });

    state.currentLedgerOutstanding = totalOutstanding;
    state.currentLedgerEntryCount = rows.length;
    ledgerActionHtml = `
      <div class="due-ledger-table__action-row">
        <button
          class="btn btn-primary due-ledger-download-btn"
          type="button"
          data-ledger-number="${escapeHtml(ledgerNumber)}"
        >
          <i class="fas fa-file-pdf"></i>
          Download Txn Pdf
        </button>
      </div>
    `;
  }

  dom.ledgerTable.innerHTML = `
    ${ledgerActionHtml}
    <table class="table table-sm text-center align-middle dashboard-table dashboard-table--ledger">
      ${tableHead}
      <tbody>${tableBody}</tbody>
    </table>
  `;

  if (mode === "summary") {
    dom.ledgerTable.querySelectorAll(".interactive-row").forEach((row) => {
      const openLedger = () => {
        const number = row.dataset.number || "";
        if (!number) {
          return;
        }

        dom.cdSearchInput.value = number;
        searchLedger({ value: number });
      };

      row.addEventListener("click", openLedger);
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openLedger();
        }
      });
    });
  } else {
    const downloadButton = dom.ledgerTable.querySelector(
      ".due-ledger-download-btn",
    );

    downloadButton?.addEventListener("click", () =>
      downloadCurrentDueLedgerPDF(downloadButton),
    );
  }

  updateDueWorkspaceMeta();
}

async function searchLedger(options = {}) {
  const value = (options.value || dom.cdSearchInput.value).trim();

  if (!value) {
    if (!options.silent) {
      showPopup(
        "error",
        "Missing search input",
        "Enter a customer name or 10-digit number to search ledger entries.",
        { autoClose: false },
      );
    }
    return;
  }

  if (!/^\d{10}$/.test(value)) {
    if (!options.silent) {
      showPopup(
        "error",
        "Select a customer",
        "Choose a customer from the dropdown to open the exact ledger.",
        { autoClose: false },
      );
    }
    return;
  }

  const task = async () => {
    const rows = await fetchJSON(`/debts/${value}`);
    renderLedgerTable(Array.isArray(rows) ? rows : [], "ledger");
  };

  if (options.silent) {
    try {
      await task();
    } catch (error) {
      console.error("Ledger search failed:", error);
      renderEmptyLedger("Could not load the selected customer ledger.");
    }
    return;
  }

  await withButtonState(
    dom.searchLedgerBtn,
    '<i class="fa-solid fa-spinner fa-spin"></i> Searching...',
    async () => {
      try {
        await task();
      } catch (error) {
        console.error("Ledger search failed:", error);
        showPopup(
          "error",
          "Search failed",
          error.message || "Could not load the customer ledger.",
          { autoClose: false },
        );
      }
    },
  );

  updateDueWorkspaceMeta();
}

async function showAllDues(options = {}) {
  const task = async () => {
    const rows = await fetchJSON("/debts");
    renderLedgerTable(Array.isArray(rows) ? rows : [], "summary");
  };

  if (options.silent) {
    try {
      await task();
    } catch (error) {
      console.error("All dues load failed:", error);
      renderEmptyLedger("Could not load customer due balances right now.");
    }
    return;
  }

  await withButtonState(
    dom.showAllDuesBtn,
    '<i class="fa-solid fa-spinner fa-spin"></i> Loading...',
    async () => {
      try {
        await task();
      } catch (error) {
        console.error("All dues load failed:", error);
        showPopup(
          "error",
          "Load failed",
          error.message || "Could not load customer due balances.",
          { autoClose: false },
        );
      }
    },
  );

  updateDueWorkspaceMeta();
}

async function refreshCurrentDueView() {
  const task = async () => {
    if (state.ledgerMode === "ledger" && state.currentLedgerNumber) {
      await searchLedger({ value: state.currentLedgerNumber, silent: true });
      return;
    }

    if (state.ledgerMode === "summary") {
      await showAllDues({ silent: true });
      return;
    }

    const searchValue = dom.cdSearchInput.value.trim();

    if (/^\d{10}$/.test(searchValue)) {
      await searchLedger({ value: searchValue, silent: true });
      return;
    }

    await showAllDues({ silent: true });
  };

  await withButtonState(
    dom.refreshDueLedgerBtn,
    '<i class="fa-solid fa-spinner fa-spin"></i> Refreshing...',
    async () => {
      try {
        await task();
      } catch (error) {
        console.error("Due ledger refresh failed:", error);
        showPopup(
          "error",
          "Refresh failed",
          error.message || "Could not refresh the customer due workspace.",
          { autoClose: false },
        );
      }
    },
  );

  updateDueWorkspaceMeta();
}

async function downloadCurrentDueLedgerPDF(button = null) {
  const ledgerNumber = String(state.currentLedgerNumber || "").trim();

  if (state.ledgerMode !== "ledger" || !/^\d{10}$/.test(ledgerNumber)) {
    showPopup(
      "error",
      "Open a customer ledger",
      "Select an exact customer ledger first, then download the PDF timeline.",
      { autoClose: false },
    );
    return;
  }

  const customerLabel =
    sanitizeFileName(state.currentLedgerName || ledgerNumber) || ledgerNumber;
  const fallbackName = `${customerLabel}-ledger-${ledgerNumber}.pdf`;

  await withButtonState(
    button,
    '<i class="fa-solid fa-spinner fa-spin"></i> Preparing PDF...',
    async () => {
      try {
        await downloadAuthenticatedFile(`/debts/${ledgerNumber}/pdf`, fallbackName);
        showPopup(
          "success",
          "Download complete",
          "The customer ledger PDF has been downloaded.",
        );
      } catch (error) {
        console.error("Customer ledger PDF download failed:", error);
        showPopup(
          "error",
          "Download failed",
          error.message || "Could not download the customer ledger PDF.",
          { autoClose: false },
        );
      }
    },
  );
}

function normalizeStaffUsername(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function renderStaffPermissionGrid(container, permissions = [], options = {}) {
  if (!container) {
    return;
  }

  const compact = Boolean(options.compact);
  const inputName = options.inputName || "staffPermissions";
  const idPrefix = options.idPrefix || inputName;
  const selected = new Set(normalizeStaffPermissions(permissions));

  container.innerHTML = STAFF_PERMISSION_OPTIONS.map((option, index) => {
    const inputId = `${idPrefix}-${index}`;
    const isChecked = selected.has(option.value);

    return `
      <label class="staff-permission-chip${isChecked ? " is-selected" : ""}" for="${inputId}">
        <input
          id="${inputId}"
          type="checkbox"
          name="${inputName}"
          value="${option.value}"
          ${isChecked ? "checked" : ""}
        />
        <div>
          <strong>${escapeHtml(option.label)}</strong>
          <span>${escapeHtml(option.description)}</span>
        </div>
      </label>
    `;
  }).join("");

  if (compact) {
    container.classList.add("staff-permission-grid--compact");
  } else {
    container.classList.remove("staff-permission-grid--compact");
  }

  const syncSelectionState = () => {
    container.querySelectorAll(".staff-permission-chip").forEach((chip) => {
      const input = chip.querySelector('input[type="checkbox"]');
      chip.classList.toggle("is-selected", Boolean(input?.checked));
    });
  };

  container
    .querySelectorAll('input[type="checkbox"]')
    .forEach((input) => input.addEventListener("change", syncSelectionState));

  syncSelectionState();
}

function readStaffPermissionSelection(container) {
  if (!container) {
    return [];
  }

  return normalizeStaffPermissions(
    Array.from(
      container.querySelectorAll('input[type="checkbox"]:checked'),
      (input) => input.value,
    ),
  );
}

function setStaffPermissionSelection(container, permissions) {
  if (!container) {
    return;
  }

  const selected = new Set(normalizeStaffPermissions(permissions));
  container.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.checked = selected.has(input.value);
    input
      .closest(".staff-permission-chip")
      ?.classList.toggle("is-selected", input.checked);
  });
}

function renderStaffPermissionBadges(permissions) {
  const normalized = normalizeStaffPermissions(permissions);

  if (!normalized.length) {
    return '<span class="staff-access-badge">No page access</span>';
  }

  return normalized
    .map((permission) => {
      const option = getPermissionOption(permission);
      return `<span class="staff-access-badge">${escapeHtml(option?.shortLabel || permission)}</span>`;
    })
    .join("");
}

function resetStaffForm() {
  if (!dom.staffName || !dom.staffUsername || !dom.staffPassword) {
    return;
  }

  dom.staffName.value = "";
  dom.staffUsername.value = "";
  dom.staffPassword.value = "";
  setStaffPermissionSelection(
    dom.staffPermissionGrid,
    DEFAULT_STAFF_PERMISSIONS,
  );
}

function renderStaffList(data = {}) {
  if (!dom.staffList) {
    return;
  }

  const staff = Array.isArray(data.staff) ? data.staff : [];
  const limit = Number(data.limit) || 2;
  const remaining = Math.max(Number(data.remaining) || 0, 0);

  if (dom.staffLimitValue) {
    dom.staffLimitValue.textContent = formatCount(limit);
  }

  if (dom.staffRemainingValue) {
    dom.staffRemainingValue.textContent = formatCount(remaining);
  }

  if (dom.createStaffBtn) {
    dom.createStaffBtn.disabled = remaining <= 0;
  }

  if (dom.selectAllStaffPagesBtn) {
    dom.selectAllStaffPagesBtn.disabled = remaining <= 0;
  }

  if (dom.clearAllStaffPagesBtn) {
    dom.clearAllStaffPagesBtn.disabled = remaining <= 0;
  }

  if (!staff.length) {
    dom.staffList.innerHTML = `
      <div class="empty-ledger">
        No staff accounts yet. Create the first staff login to get started.
      </div>
    `;
    return;
  }

  dom.staffList.innerHTML = `
    <div class="staff-card-list">
      ${staff
        .map((member) => {
          const permissions = normalizeStaffPermissions(
            member.permissions || DEFAULT_STAFF_PERMISSIONS,
          );

          return `
            <article class="staff-card" data-staff-id="${member.id}">
              <div class="staff-card__header">
                <div class="staff-card__meta">
                  <strong>${escapeHtml(member.name || "-")}</strong>
                  <span>@${escapeHtml(member.username || "-")} | Created ${formatDate(member.created_at)}</span>
                </div>
                <span class="summary-pill">
                  <i class="fa-solid fa-shield"></i>
                  ${member.is_active ? "Active" : "Inactive"}
                </span>
              </div>

              <div
                class="staff-access-badges"
                data-staff-badges="${member.id}"
              >
                ${renderStaffPermissionBadges(permissions)}
              </div>

              <div
                class="staff-permission-grid"
                data-permission-editor="${member.id}"
              ></div>

              <p class="staff-helper-text mt-3">
                Owner can revise this staff account access at any time. Staff management always stays owner only.
              </p>

              <div class="staff-card__actions mt-3">
                <button
                  type="button"
                  class="btn btn-info btn-sm staff-save-btn"
                  data-staff-id="${member.id}"
                >
                  <i class="fa-solid fa-floppy-disk"></i>
                  Save Access
                </button>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm staff-delete-btn"
                  data-staff-id="${member.id}"
                >
                  <i class="fa-solid fa-trash"></i>
                  Remove
                </button>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;

  staff.forEach((member) => {
    const permissions = normalizeStaffPermissions(
      member.permissions || DEFAULT_STAFF_PERMISSIONS,
    );
    const editor = dom.staffList.querySelector(
      `[data-permission-editor="${member.id}"]`,
    );
    const badgeContainer = dom.staffList.querySelector(
      `[data-staff-badges="${member.id}"]`,
    );

    renderStaffPermissionGrid(editor, permissions, {
      compact: true,
      inputName: `staffPermission-${member.id}`,
      idPrefix: `staffPermission-${member.id}`,
    });

    editor?.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.addEventListener("change", () => {
        if (badgeContainer) {
          badgeContainer.innerHTML = renderStaffPermissionBadges(
            readStaffPermissionSelection(editor),
          );
        }
      });
    });
  });

  dom.staffList.querySelectorAll(".staff-save-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const staffId = button.dataset.staffId;
      const editor = dom.staffList.querySelector(
        `[data-permission-editor="${staffId}"]`,
      );
      const permissions = readStaffPermissionSelection(editor);

      if (!permissions.length) {
        showPopup(
          "error",
          "Select page access",
          "Choose at least one page before saving staff access.",
          { autoClose: false },
        );
        return;
      }

      await withButtonState(
        button,
        '<i class="fa-solid fa-spinner fa-spin"></i> Saving...',
        async () => {
          try {
            await fetchJSON(`/auth/staff/${staffId}/permissions`, {
              method: "PATCH",
              body: JSON.stringify({ permissions }),
            });
            await loadStaffAccounts({ silent: true });
            showPopup(
              "success",
              "Access updated",
              "Staff page access has been updated successfully.",
            );
          } catch (error) {
            showPopup(
              "error",
              "Update failed",
              error.message || "Could not update staff page access.",
              { autoClose: false },
            );
          }
        },
      );
    });
  });

  dom.staffList.querySelectorAll(".staff-delete-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const staffId = button.dataset.staffId;
      await withButtonState(
        button,
        '<i class="fa-solid fa-spinner fa-spin"></i>',
        async () => {
          try {
            await fetchJSON(`/auth/staff/${staffId}`, { method: "DELETE" });
            await loadStaffAccounts({ silent: true });
            showPopup(
              "success",
              "Staff removed",
              "The staff account has been removed successfully.",
            );
          } catch (error) {
            showPopup(
              "error",
              "Delete failed",
              error.message || "Could not remove the staff account.",
              { autoClose: false },
            );
          }
        },
      );
    });
  });
}

async function loadStaffAccounts(options = {}) {
  if (!isOwnerSession() || !dom.staffList) {
    return;
  }

  try {
    const data = await fetchJSON("/auth/staff");
    renderStaffList(data);
  } catch (error) {
    console.error("Staff list load failed:", error);
    if (!options.silent) {
      showPopup(
        "error",
        "Load failed",
        error.message || "Could not load staff accounts.",
        { autoClose: false },
      );
    }
  }
}

async function createStaffAccount() {
  const name = String(dom.staffName?.value || "")
    .replace(/\s+/g, " ")
    .trim();
  const username = normalizeStaffUsername(dom.staffUsername?.value);
  const password = String(dom.staffPassword?.value || "");
  const permissions = readStaffPermissionSelection(dom.staffPermissionGrid);

  dom.staffUsername.value = username;

  if (!name || !username || !password) {
    showPopup(
      "error",
      "Missing details",
      "Enter staff name, username, and password before creating the account.",
      { autoClose: false },
    );
    return;
  }

  if (!permissions.length) {
    showPopup(
      "error",
      "Select page access",
      "Choose at least one page permission before creating the staff account.",
      { autoClose: false },
    );
    return;
  }

  if (!/^[a-zA-Z0-9._-]{3,30}$/.test(username)) {
    showPopup(
      "error",
      "Invalid username",
      "Username must be 3-30 characters and can use letters, numbers, dot, underscore, or hyphen.",
      { autoClose: false },
    );
    return;
  }

  if (password.length < 6) {
    showPopup(
      "error",
      "Weak password",
      "Staff password must be at least 6 characters long.",
      { autoClose: false },
    );
    return;
  }

  await withButtonState(
    dom.createStaffBtn,
    '<i class="fa-solid fa-spinner fa-spin"></i> Creating...',
    async () => {
      try {
        await fetchJSON("/auth/staff", {
          method: "POST",
          body: JSON.stringify({ name, username, password, permissions }),
        });
        resetStaffForm();
        await loadStaffAccounts({ silent: true });
        showPopup(
          "success",
          "Staff account created",
          "New staff login is ready to use.",
        );
      } catch (error) {
        showPopup(
          "error",
          "Create failed",
          error.message || "Could not create the staff account.",
          { autoClose: false },
        );
      }
    },
  );
}

function restrictToDigits(input) {
  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "").slice(0, 10);
  });
}

function setDefaultSalesDates() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const todayInput = toInputDate(today);
  const firstDayInput = toInputDate(firstDay);

  dom.fromDate.value = firstDayInput;
  dom.toDate.value = todayInput;
  dom.gstFromDate.value = firstDayInput;
  dom.gstToDate.value = todayInput;

  if (dom.salesNetProfitFromDate) {
    dom.salesNetProfitFromDate.value = firstDayInput;
  }

  if (dom.salesNetProfitToDate) {
    dom.salesNetProfitToDate.value = todayInput;
  }

  if (dom.purchaseFromDate) {
    dom.purchaseFromDate.value = firstDayInput;
  }

  if (dom.purchaseToDate) {
    dom.purchaseToDate.value = todayInput;
  }

  if (dom.purchaseDate) {
    dom.purchaseDate.value = todayInput;
  }

  if (dom.expenseFromDate) {
    dom.expenseFromDate.value = firstDayInput;
  }

  if (dom.expenseToDate) {
    dom.expenseToDate.value = todayInput;
  }

  if (dom.expenseDate) {
    dom.expenseDate.value = todayInput;
  }
}

function bindPopupEvents() {
  dom.popupOverlay.addEventListener("click", hidePopup);
  dom.popupClose.addEventListener("click", hidePopup);
  dom.popupBox.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hidePopup();
      sidebarController?.close();
    }
  });
}

function bindInventoryEvents() {
  dom.profitPercent.addEventListener("input", () => {
    updateSellingRate();
    refreshPurchaseAutoRates({ overwriteProfit: true, forceSell: true });
    queueProfitPercentSave();
  });

  dom.buyingRate.addEventListener("input", updateSellingRate);
  dom.sellingRate.addEventListener("input", updateProfitPercent);

  dom.newItemSearch.addEventListener("input", () => {
    if (!dom.newItemSearch.value.trim()) {
      hidePreviousBuyingRate();
      return;
    }

    const exactItemName = findExactItemName(dom.newItemSearch.value.trim());
    if (!exactItemName) {
      hidePreviousBuyingRate();
      return;
    }

    showPreviousBuyingRate(exactItemName);
  });

  dom.newItemSearch.addEventListener("blur", () => {
    const itemName = dom.newItemSearch.value.trim();
    const exactItemName = findExactItemName(itemName);
    if (exactItemName) {
      showPreviousBuyingRate(exactItemName);
    }
  });

  [
    dom.newItemSearch,
    dom.newQuantity,
    dom.profitPercent,
    dom.buyingRate,
    dom.sellingRate,
  ].forEach((input) => {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addStock();
      }
    });
  });

  dom.addStockBtn.addEventListener("click", addStock);

  setupFilterInput(dom.newItemSearch, dom.newItemDropdownList, (value) => {
    dom.newItemSearch.value = value;
    showPreviousBuyingRate(value);
  });
}

function bindPurchaseEvents() {
  if (!dom.submitPurchaseBtn) {
    return;
  }

  const runPurchaseSearchSuggestions = async () => {
    const query = dom.purchaseSearchInput.value.trim();
    const suggestions = await loadPurchaseSearchSuggestions(query);

    if (dom.purchaseSearchInput.value.trim() !== query) {
      return;
    }

    renderPurchaseSearchDropdown(suggestions, async ({ purchaseId, value }) => {
      dom.purchaseSearchInput.value = value;
      await loadPurchaseReport();
      if (purchaseId > 0) {
        await openPurchaseDetail(purchaseId, { silent: true });
      }
    });
  };

  const debouncedPurchaseSearchSuggestions = debounce(() => {
    void runPurchaseSearchSuggestions();
  }, 180);

  const runSupplierSearchSuggestions = debounce(async () => {
    const query = dom.supplierSearchInput.value.trim();

    if (!query) {
      hideElement(dom.supplierSearchDropdown);
      return;
    }

    const suppliers = await loadSupplierSuggestions(query);
    if (dom.supplierSearchInput.value.trim() !== query) {
      return;
    }

    renderSupplierDropdown(
      dom.supplierSearchDropdown,
      suppliers,
      (supplier) => {
        dom.supplierSearchInput.value = supplier.name || "";
        dom.supplierSearchInput.dataset.supplierId = String(supplier.id || "");
        searchSupplierLedger({ supplierId: supplier.id });
      },
    );
  }, 180);

  const runSupplierNameSuggestions = debounce(async () => {
    const query = dom.supplierName.value.trim();
    if (!query) {
      hideElement(dom.supplierDropdown);
      return;
    }

    const suppliers = await loadSupplierSuggestions(query);
    if (dom.supplierName.value.trim() !== query) {
      return;
    }

    renderSupplierDropdown(dom.supplierDropdown, suppliers, (supplier) => {
      dom.supplierName.value = supplier.name || "";
      dom.supplierNumber.value = supplier.mobile_number || "";
      dom.supplierAddress.value = supplier.address || "";
      updatePurchaseSummary();
    });
  }, 180);

  restrictToDigits(dom.supplierNumber);
  dom.showPurchaseBillsViewBtn?.addEventListener("click", () =>
    setPurchaseWorkspaceView("bills"),
  );
  dom.showSupplierLedgerViewBtn?.addEventListener("click", () =>
    setPurchaseWorkspaceView("supplier"),
  );

  dom.supplierName.addEventListener("input", () => {
    updatePurchaseSupplierSnapshot();
    runSupplierNameSuggestions();
  });

  document.addEventListener("click", (event) => {
    if (
      !dom.supplierName.contains(event.target) &&
      !dom.supplierDropdown.contains(event.target)
    ) {
      hideElement(dom.supplierDropdown);
    }
  });

  [dom.supplierNumber, dom.supplierAddress].forEach((input) =>
    input.addEventListener("input", updatePurchaseSummary),
  );

  dom.purchasePaymentMode.addEventListener("change", updatePurchaseSummary);
  dom.purchaseAmountPaid.addEventListener("focus", () => {
    dom.purchaseAmountPaid.dataset.editing = "true";
  });
  dom.purchaseAmountPaid.addEventListener("input", () => {
    const rawValue = normalizePurchasePaidFieldValue(
      dom.purchaseAmountPaid.value,
    );
    const autoValue = normalizePurchasePaidFieldValue(
      dom.purchaseAmountPaid.dataset.autoValue,
    );
    dom.purchaseAmountPaid.dataset.manual =
      rawValue === "" || (rawValue && rawValue !== autoValue)
        ? "true"
        : "false";
    updatePurchaseSummary();
  });
  dom.purchaseAmountPaid.addEventListener("blur", () => {
    dom.purchaseAmountPaid.dataset.editing = "false";

    const rawValue = normalizePurchasePaidFieldValue(
      dom.purchaseAmountPaid.value,
    );
    const autoValue = normalizePurchasePaidFieldValue(
      dom.purchaseAmountPaid.dataset.autoValue,
    );
    const paymentMode = String(dom.purchasePaymentMode?.value || "cash")
      .trim()
      .toLowerCase();

    if (!rawValue) {
      if (paymentMode === "credit") {
        dom.purchaseAmountPaid.dataset.manual = "true";
        updatePurchaseSummary();
        return;
      }

      dom.purchaseAmountPaid.dataset.manual = "false";
      updatePurchaseSummary();
      return;
    }

    if (rawValue === autoValue) {
      dom.purchaseAmountPaid.dataset.manual = "false";
      dom.purchaseAmountPaid.value = autoValue;
    } else {
      dom.purchaseAmountPaid.dataset.manual = "true";
      dom.purchaseAmountPaid.value = rawValue;
    }

    updatePurchaseSummary();
  });

  [dom.purchaseFromDate, dom.purchaseToDate].forEach((input) =>
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        loadPurchaseReport();
      }
    }),
  );

  dom.purchaseSearchInput.addEventListener("focus", async () => {
    await runPurchaseSearchSuggestions();
  });

  dom.purchaseSearchInput.addEventListener("input", () => {
    debouncedPurchaseSearchSuggestions();
  });

  dom.purchaseSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      hideElement(dom.purchaseSearchDropdown);
      setPurchaseWorkspaceView("bills");
      loadPurchaseReport();
    }
  });

  document.addEventListener("click", (event) => {
    if (
      !dom.purchaseSearchInput.contains(event.target) &&
      !dom.purchaseSearchDropdown.contains(event.target)
    ) {
      hideElement(dom.purchaseSearchDropdown);
    }
  });

  dom.loadPurchaseReportBtn.addEventListener("click", () => {
    setPurchaseWorkspaceView("bills");
    loadPurchaseReport();
  });
  dom.addPurchaseItemBtn.addEventListener("click", () => {
    triggerButtonFeedback(dom.addPurchaseItemBtn);
    addPurchaseItemRow(undefined, { animateIn: true });
  });
  dom.resetPurchaseBtn.addEventListener("click", () => {
    triggerButtonFeedback(dom.resetPurchaseBtn);
    resetPurchaseForm();
  });
  dom.submitPurchaseBtn.addEventListener("click", submitPurchase);
  dom.submitPurchaseRepaymentBtn?.addEventListener(
    "click",
    submitPurchaseRepayment,
  );

  dom.supplierSearchInput.addEventListener("input", () => {
    setPurchaseWorkspaceView("supplier");
    dom.supplierSearchInput.dataset.supplierId = "";
    runSupplierSearchSuggestions();
  });

  dom.supplierSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      setPurchaseWorkspaceView("supplier");
      searchSupplierLedger();
    }
  });

  document.addEventListener("click", (event) => {
    if (
      !dom.supplierSearchInput.contains(event.target) &&
      !dom.supplierSearchDropdown.contains(event.target)
    ) {
      hideElement(dom.supplierSearchDropdown);
    }
  });

  dom.searchSupplierLedgerBtn.addEventListener("click", () => {
    setPurchaseWorkspaceView("supplier");
    searchSupplierLedger();
  });
  dom.showAllSupplierSummaryBtn.addEventListener("click", () => {
    setPurchaseWorkspaceView("supplier");
    showAllSupplierSummary();
  });
}

function bindReportEvents() {
  setupFilterInput(dom.itemReportSearch, dom.itemReportDropdown, (value) => {
    dom.itemReportSearch.value = value;
  });

  dom.itemReportSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      loadItemReport();
    }
  });

  dom.loadItemReportBtn.addEventListener("click", () => loadItemReport());
  dom.itemReportPdfBtn.addEventListener("click", downloadItemReportPDF);

  dom.fromDate.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      loadSalesReport();
    }
  });

  dom.toDate.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      loadSalesReport();
    }
  });

  dom.loadSalesBtn.addEventListener("click", () => loadSalesReport());
  dom.pdfBtn.addEventListener("click", downloadSalesPDF);
  dom.excelBtn.addEventListener("click", downloadSalesExcel);

  [dom.salesNetProfitFromDate, dom.salesNetProfitToDate].forEach((input) =>
    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        loadSalesNetProfitCard();
      }
    }),
  );

  dom.loadSalesNetProfitBtn?.addEventListener("click", () =>
    loadSalesNetProfitCard(),
  );

  dom.gstFromDate.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      loadGstReport();
    }
  });

  dom.gstToDate.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      loadGstReport();
    }
  });

  dom.loadGstBtn.addEventListener("click", () => loadGstReport());
  dom.gstPdfBtn.addEventListener("click", downloadGstPDF);
  dom.gstExcelBtn.addEventListener("click", downloadGstExcel);
}

function bindCustomerDueEvents() {
  const runCustomerNumberSuggestions = debounce(async () => {
    const query = dom.cdNumber.value.trim();

    if (!query) {
      hideElement(dom.cdNumberDropdown);
      return;
    }

    const customers = await loadCustomerSuggestions(query);
    if (dom.cdNumber.value.trim() !== query) {
      return;
    }

    renderCustomerDropdown(
      dom.cdNumberDropdown,
      customers,
      ({ name, number }) => {
        dom.cdName.value = name;
        dom.cdNumber.value = number;
        setCustomerNameLocked(true);
        updateCustomerDuePreview();
      },
    );
  }, 180);

  const runLedgerSearchSuggestions = debounce(async () => {
    const query = dom.cdSearchInput.value.trim();

    if (!query) {
      hideElement(dom.cdSearchDropdown);
      return;
    }

    const customers = await loadCustomerSuggestions(query);
    if (dom.cdSearchInput.value.trim() !== query) {
      return;
    }

    renderCustomerDropdown(dom.cdSearchDropdown, customers, ({ number }) => {
      dom.cdSearchInput.value = number;
      searchLedger({ value: number });
    });
  }, 180);

  restrictToDigits(dom.cdNumber);
  [dom.cdName, dom.cdTotal, dom.cdCredit, dom.cdRemark].forEach((input) => {
    input?.addEventListener("input", updateCustomerDuePreview);
  });

  dom.cdNumber.addEventListener("input", () => {
    setCustomerNameLocked(false);
    updateCustomerDuePreview();
    runCustomerNumberSuggestions();
  });

  document.addEventListener("click", (event) => {
    if (
      !dom.cdNumber.contains(event.target) &&
      !dom.cdNumberDropdown.contains(event.target)
    ) {
      hideElement(dom.cdNumberDropdown);
    }
  });

  dom.submitDebtBtn.addEventListener("click", submitDebt);
  dom.clearDebtBtn?.addEventListener("click", () => {
    resetCustomerDueForm({ focus: true });
  });

  dom.cdSearchInput.addEventListener("input", () => {
    runLedgerSearchSuggestions();
  });

  dom.cdSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchLedger();
    }
  });

  document.addEventListener("click", (event) => {
    if (
      !dom.cdSearchInput.contains(event.target) &&
      !dom.cdSearchDropdown.contains(event.target)
    ) {
      hideElement(dom.cdSearchDropdown);
    }
  });

  dom.searchLedgerBtn.addEventListener("click", () => searchLedger());
  dom.showAllDuesBtn.addEventListener("click", () => showAllDues());
  dom.refreshDueLedgerBtn?.addEventListener("click", () =>
    refreshCurrentDueView(),
  );
}

function bindExpenseEvents() {
  if (!dom.submitExpenseBtn) {
    return;
  }

  const runExpenseSearchSuggestions = debounce(async () => {
    const query = dom.expenseSearchInput.value.trim();

    if (!query) {
      hideElement(dom.expenseSearchDropdown);
      return;
    }

    const entries = await loadExpenseSuggestions(query);
    if (dom.expenseSearchInput.value.trim() !== query) {
      return;
    }

    renderExpenseDropdown(dom.expenseSearchDropdown, entries, ({ value }) => {
      dom.expenseSearchInput.value = value;
    });
  }, 180);

  [dom.expenseFromDate, dom.expenseToDate].forEach((input) =>
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        loadExpenseReport();
      }
    }),
  );

  dom.expenseSearchInput.addEventListener("input", () => {
    runExpenseSearchSuggestions();
  });

  dom.expenseSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      hideElement(dom.expenseSearchDropdown);
      loadExpenseReport();
    }
  });

  document.addEventListener("click", (event) => {
    if (
      !dom.expenseSearchInput.contains(event.target) &&
      !dom.expenseSearchDropdown.contains(event.target)
    ) {
      hideElement(dom.expenseSearchDropdown);
    }
  });

  dom.submitExpenseBtn.addEventListener("click", submitExpense);
  dom.loadExpenseReportBtn.addEventListener("click", () => loadExpenseReport());
}

function bindStaffEvents() {
  if (!dom.createStaffBtn) {
    return;
  }

  renderStaffPermissionGrid(
    dom.staffPermissionGrid,
    DEFAULT_STAFF_PERMISSIONS,
    {
      inputName: "staffCreatePermission",
      idPrefix: "staffCreatePermission",
    },
  );

  [dom.staffName, dom.staffUsername, dom.staffPassword].forEach((input) => {
    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        createStaffAccount();
      }
    });
  });

  dom.staffUsername?.addEventListener("blur", () => {
    dom.staffUsername.value = normalizeStaffUsername(dom.staffUsername.value);
  });

  dom.selectAllStaffPagesBtn?.addEventListener("click", () => {
    setStaffPermissionSelection(dom.staffPermissionGrid, STAFF_PERMISSION_KEYS);
  });

  dom.clearAllStaffPagesBtn?.addEventListener("click", () => {
    setStaffPermissionSelection(dom.staffPermissionGrid, []);
  });

  dom.createStaffBtn.addEventListener("click", createStaffAccount);
}

window.addEventListener("DOMContentLoaded", async () => {
  sidebarController =
    window.InventoryAppShell?.setupSidebar("dashboard", {
      onSectionSelect: setActiveSection,
      onInvoiceSelect: () => {
        window.location.href = "invoice.html";
      },
      onLogout: logoutAndRedirect,
    }) || null;
  cacheElements();
  bindPopupEvents();
  bindInventoryEvents();
  bindPurchaseEvents();
  bindReportEvents();
  bindCustomerDueEvents();
  bindExpenseEvents();
  bindSupportEvents();
  bindStaffEvents();
  updateCurrentDateLabel();
  hidePreviousBuyingRate();
  if (dom.purchaseItemsBody) {
    dom.purchaseItemsBody.innerHTML = "";
    addPurchaseItemRow(undefined, { animateIn: false });
    updatePurchaseSummary();
  }
  setPurchaseWorkspaceView("bills");
  renderEmptyLedger(
    "Search a customer or load all due balances to view the ledger.",
  );
  updateCustomerDuePreview();
  updateDueWorkspaceMeta();
  if (dom.supplierLedgerTable) {
    dom.supplierLedgerTable.innerHTML =
      '<div class="empty-ledger">Search a supplier or load all supplier balances to view the ledger.</div>';
  }
  resetExpenseSummary();
  setDefaultSalesDates();
  updateProfitPreview();

  const user = await checkAuth();
  if (!user) {
    return;
  }

  applySessionAccess(user);

  if (canAccessPermission("add_stock", "purchase_entry")) {
    await loadProfitPercentDefault();
    refreshPurchaseAutoRates({ overwriteProfit: true, forceSell: true });
  }

  const savedSection = localStorage.getItem("activeSection");
  const visibleButtons = dom.sectionButtons.filter((button) => !button.hidden);
  const validSection = visibleButtons.some(
    (button) => button.dataset.section === savedSection,
  )
    ? savedSection
    : visibleButtons[0]?.dataset.section;

  if (validSection) {
    setActiveSection(validSection);
  } else if (canAccessInvoicePage()) {
    window.location.replace("invoice.html");
    return;
  } else {
    showPopup(
      "error",
      "No workspace access",
      "This staff account does not have any dashboard page assigned yet.",
      { autoClose: false },
    );
    return;
  }

  if (
    canAccessPermission(
      "add_stock",
      "purchase_entry",
      "sale_invoice",
      "stock_report",
    )
  ) {
    await loadItemNames({ silent: true });
  }

  const initialTasks = [];

  if (isOwnerSession()) {
    initialTasks.push(loadDashboardOverview({ silent: true }));
  }

  if (initialTasks.length) {
    await Promise.allSettled(initialTasks);
  }
});

window.setTimeout(() => {
  if (document.body.classList.contains("app-loading")) {
    markDashboardReady();
  }
}, 5000);
