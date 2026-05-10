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
      add_stock: {
        label: "Add New Stock",
        shortLabel: "Stock Entry",
        sectionId: "addStockSection",
      },
      purchase_entry: {
        label: "Purchase Entry",
        shortLabel: "Purchases",
        sectionId: "purchaseEntrySection",
      },
      sale_invoice: {
        label: "Sale and Invoice",
        shortLabel: "Invoice",
        sectionId: "invoicePage",
      },
      stock_report: {
        label: "Stock Report",
        shortLabel: "Stock Report",
        sectionId: "itemReportSection",
      },
      sales_report: {
        label: "Sales Report",
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
    const DEFAULT_STAFF_PERMISSIONS = ["add_stock", "sale_invoice"];
    const PERMISSION_ALIASES = Object.fromEntries(
      Object.entries(STAFF_PAGE_CONFIG).flatMap(([permission, config]) => [
        [permission, permission],
        [config.sectionId, permission],
        [config.label, permission],
        [config.shortLabel, permission],
      ]),
    );

    function normalizePermissionToken(value) {
      return String(value || "")
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
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
      const list = Array.isArray(values)
        ? values
        : String(values || "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);
      const normalized = list
        .map((value) => NORMALIZED_PERMISSION_ALIASES[normalizePermissionToken(value)])
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
