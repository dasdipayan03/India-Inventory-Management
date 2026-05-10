(function initInventoryPermissionContract(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.InventoryPermissionContract = factory();
  }
})(
  typeof globalThis !== "undefined" ? globalThis : this,
  function createPermissionContract() {
    const STAFF_PAGE_CONFIG = {
      purchase_entry: {
        label: "Purchase Entry / Add Stock",
        shortLabel: "Purchases",
        sectionId: "purchaseEntrySection",
      },
      sale_invoice: {
        label: "Sale Entry / Invoice",
        shortLabel: "Invoice",
        sectionId: "invoicePage",
      },
      stock_report: {
        label: "Stock View / Report",
        shortLabel: "Stock Report",
        sectionId: "itemReportSection",
      },
      sales_report: {
        label: "Sales View / Report",
        shortLabel: "Sales Report",
        sectionId: "salesReportSection",
      },
      gst_report: {
        label: "GST Report",
        shortLabel: "GST Report",
        sectionId: "gstReportSection",
      },
      customer_due: {
        label: "Customer Due",
        shortLabel: "Customer Due",
        sectionId: "customerDebtSection",
      },
      expense_tracking: {
        label: "Expenses",
        shortLabel: "Expenses",
        sectionId: "expenseTrackingSection",
      },
    };

    const STAFF_PAGE_PERMISSIONS = Object.keys(STAFF_PAGE_CONFIG);
    const DEFAULT_STAFF_PERMISSIONS = ["purchase_entry", "sale_invoice"];
    const LEGACY_PERMISSION_ALIASES = {
      purchase: "purchase_entry",
      purchases: "purchase_entry",
      purchase_report: "purchase_entry",
      purchase_reports: "purchase_entry",
      purchaseEntrySection: "purchase_entry",
      invoice: "sale_invoice",
      invoices: "sale_invoice",
      sale: "sale_invoice",
      sales_invoice: "sale_invoice",
      saleInvoiceSection: "sale_invoice",
      item_report: "stock_report",
      item_reports: "stock_report",
      stock_reports: "stock_report",
      itemReportSection: "stock_report",
      sales: "sales_report",
      sale_report: "sales_report",
      sales_reports: "sales_report",
      salesReportSection: "sales_report",
      gst: "gst_report",
      gst_reports: "gst_report",
      gstReportSection: "gst_report",
      customer_dues: "customer_due",
      due: "customer_due",
      dues: "customer_due",
      customerDebtSection: "customer_due",
      expense: "expense_tracking",
      expenses: "expense_tracking",
      expense_report: "expense_tracking",
      expense_reports: "expense_tracking",
      expenseTrackingSection: "expense_tracking",
    };
    const PERMISSION_ALIASES = Object.fromEntries([
      ...Object.entries(LEGACY_PERMISSION_ALIASES),
      ...Object.entries(STAFF_PAGE_CONFIG).flatMap(([permission, config]) => [
        [permission, permission],
        [config.sectionId, permission],
        [config.label, permission],
        [config.shortLabel, permission],
      ]),
    ]);

    function normalizePermissionToken(value) {
      return String(value || "")
        .trim()
        .replace(/^[\s"'[\]{}]+|[\s"'[\]{}]+$/g, "")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .replace(/[^a-zA-Z0-9 ]+/g, " ")
        .replace(/\s+/g, " ")
        .toLowerCase();
    }

    const NORMALIZED_PERMISSION_ALIASES = Object.fromEntries(
      Object.entries(PERMISSION_ALIASES).map(([alias, permission]) => [
        normalizePermissionToken(alias),
        permission,
      ]),
    );

    function normalizePermissions(values) {
      const source = Array.isArray(values) ? values : [values];
      const list = source
        .flatMap((value) => String(value || "").split(","))
        .map((value) => value.trim())
        .filter(Boolean);
      const normalized = list
        .map(
          (value) =>
            NORMALIZED_PERMISSION_ALIASES[normalizePermissionToken(value)],
        )
        .filter((value) => STAFF_PAGE_PERMISSIONS.includes(value));

      return [...new Set(normalized)];
    }

    return {
      DEFAULT_STAFF_PERMISSIONS,
      STAFF_PAGE_CONFIG,
      STAFF_PAGE_PERMISSIONS,
      normalizePermissions,
    };
  },
);
