// public/js/dashboard.js
/* ---------------------- Config --------------------- */
const apiBase = window.location.origin.includes("localhost")
  ? "http://localhost:4000/api"
  : "/api";

let itemNames = [];
let currentItemReportRows = [];

/* ---------------------- AUTH ----------------------- */
async function checkAuth() {
  const token = localStorage.getItem("token");
  if (!token) return (location.href = "login.html");

  try {
    const res = await fetch(`${apiBase}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("unauthorized");

    const user = await res.json();
    localStorage.setItem("user", JSON.stringify(user));
    // document.getElementById("welcomeUser").innerText = `Welcome, ${user.name}`;
    document.getElementById("welcomeUser").innerText = user.name
      ? user.name.trim()
      : "";
    document.body.style.visibility = "visible";
  } catch (err) {
    console.error("Auth fail:", err);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    alert("Session expired! Please log in again.");
    location.href = "login.html";
  }
}

/* ---------------------- UI / Sidebar --------------------- */
function setupSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const toggle = document.getElementById("sidebarToggle");

  toggle.addEventListener("click", () => {
    const open = sidebar.classList.toggle("sidebar--open");
    overlay.classList.toggle("visible", open);
  });

  overlay.addEventListener("click", () => {
    sidebar.classList.remove("sidebar--open");
    overlay.classList.remove("visible");
  });

  document.querySelectorAll(".sidebar button[data-section]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".form-section")
        .forEach((s) => s.classList.remove("active"));
      document.getElementById(btn.dataset.section).classList.add("active");
      // 🔴 LOW STOCK LOAD WHEN STOCK REPORT OPEN
      if (btn.dataset.section === "itemReportSection") {
        loadLowStock();
      }
      document
        .querySelectorAll(".sidebar button")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      localStorage.setItem("activeSection", btn.dataset.section);
      sidebar.classList.remove("sidebar--open");
      overlay.classList.remove("visible");
    });
  });

  document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    location.href = "login.html";
  });
}

/* ---------------------- Dropdown helpers --------------------- */
function renderDropdown(listEl, items, onSelect) {
  if (!items || items.length === 0) {
    listEl.style.display = "none";
    listEl.innerHTML = "";
    return;
  }
  listEl.innerHTML = items
    .map(
      (i) =>
        `<div class="dropdown-item" data-value="${escapeHtml(i)}">${escapeHtml(
          i,
        )}</div>`,
    )
    .join("");
  listEl.style.display = "block";
  listEl.querySelectorAll(".dropdown-item").forEach((el) =>
    el.addEventListener("click", () => {
      onSelect(el.dataset.value);
      listEl.style.display = "none";
    }),
  );
}

function escapeHtml(s) {
  return (s + "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setupFilterInput(inputId, listId, onSelectCallback) {
  const input = document.getElementById(inputId);
  const listEl = document.getElementById(listId);

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      renderDropdown(listEl, itemNames.slice(0, 50), (val) => {
        input.value = val;
        if (onSelectCallback) onSelectCallback(val);
      });
      return;
    }
    const filtered = itemNames
      .filter((i) => i.toLowerCase().includes(q))
      .slice(0, 50);
    renderDropdown(listEl, filtered, (val) => {
      input.value = val;
      if (onSelectCallback) onSelectCallback(val);
    });
  });

  document.addEventListener("click", (e) => {
    if (!input.contains(e.target) && !listEl.contains(e.target))
      listEl.style.display = "none";
  });

  input.addEventListener("focus", () => {
    renderDropdown(listEl, itemNames.slice(0, 50), (val) => {
      input.value = val;
      if (onSelectCallback) onSelectCallback(val);
    });
  });
}

/* ---------------------- Load Items --------------------- */
async function loadItemNames() {
  try {
    const res = await fetch(`${apiBase}/items/names`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    if (!res.ok) throw new Error("Failed to fetch items");
    itemNames = await res.json();
  } catch (err) {
    console.error("Error loading item names:", err);
    itemNames = [];
  }
}

/* ---------------------- Add Stock --------------------- */
async function addStock() {
  const item = document.getElementById("newItemSearch").value.trim();
  const quantity = parseFloat(document.getElementById("newQuantity").value);
  const buying_rate = parseFloat(document.getElementById("buyingRate").value);
  const selling_rate = parseFloat(document.getElementById("sellingRate").value);

  if (!item || isNaN(quantity) || isNaN(buying_rate) || isNaN(selling_rate)) {
    return alert("Fill all fields correctly");
  }

  try {
    const res = await fetch(`${apiBase}/items`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({
        name: item,
        quantity,
        buying_rate,
        selling_rate,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Add failed");
    alert(data.message || "Added");
    await loadItemNames();
    ["newItemSearch", "newQuantity", "buyingRate", "sellingRate"].forEach(
      (id) => (document.getElementById(id).value = ""),
    );
  } catch (err) {
    console.error("Add stock error:", err);
    alert(err.message || "Server error");
  }
}

// --- Add Stock rate inputs ---
const buyingRateInput = document.getElementById("buyingRate");
const sellingRateInput = document.getElementById("sellingRate");
const profitPercentInput = document.getElementById("profitPercent");
// 🔹 Save profit percent when user changes it
if (profitPercentInput) {
  profitPercentInput.addEventListener("change", () => {
    localStorage.setItem("defaultProfitPercent", profitPercentInput.value);
  });
}

function updateSellingRate() {
  const buyingRate = parseFloat(buyingRateInput.value);
  const percent = parseFloat(profitPercentInput.value);

  if (!isNaN(buyingRate) && !isNaN(percent)) {
    const selling = buyingRate * (1 + percent / 100);
    sellingRateInput.value = selling.toFixed(2);
  }
}

function updateProfitPercent() {
  const buyingRate = parseFloat(buyingRateInput.value);
  const sellingRate = parseFloat(sellingRateInput.value);

  if (!isNaN(buyingRate) && !isNaN(sellingRate) && buyingRate > 0) {
    const percent = ((sellingRate - buyingRate) / buyingRate) * 100;
    const formatted = percent.toFixed(2);

    profitPercentInput.value = formatted;

    // 🔥 SAVE automatically
    localStorage.setItem("defaultProfitPercent", formatted);
  }
}

if (buyingRateInput && sellingRateInput && profitPercentInput) {
  buyingRateInput.addEventListener("input", updateSellingRate);
  profitPercentInput.addEventListener("input", updateSellingRate);
  sellingRateInput.addEventListener("input", updateProfitPercent);
}

//---------- stock view and download ----------------//
async function loadItemReport() {
  const item = document.getElementById("itemReportSearch").value.trim();

  try {
    const url = item
      ? `${apiBase}/items/report?name=${encodeURIComponent(item)}`
      : `${apiBase}/items/report`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    });

    if (!res.ok) throw new Error("Failed to load item report");

    const rows = await res.json();
    currentItemReportRows = rows; // 🔒 for PDF
    renderItemReport(rows);
  } catch (err) {
    console.error("Item report error:", err);
    alert("Could not load item report");
  }
}
function renderItemReport(rows) {
  const tbody = document.getElementById("itemReportBody");
  tbody.innerHTML = "";

  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-muted">No records found</td></tr>`;
    return;
  }
  let totalCostValue = 0;
  let totalSellingValue = 0;

  rows.forEach((r, i) => {
    const qty = Number(r.available_qty);
    const buy = Number(r.buying_rate);
    const sell = Number(r.selling_rate);
    totalCostValue += qty * buy;
    totalSellingValue += qty * sell;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.item_name)}</td>
      <td>${Number(r.available_qty).toFixed(2)}</td>
      <td>${Number(r.buying_rate).toFixed(2)}</td>
      <td>${Number(r.selling_rate).toFixed(2)}</td>
      <td>${Number(r.sold_qty).toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });

  const profit = totalSellingValue - totalCostValue;

  const summaryHTML = `
  <tr>
    <td colspan="5" class="fw-bold bg-light text-end">
      <div>Total Items Value (Cost) : Rs. ${totalCostValue.toFixed(2)}</div>
      <div>Total Selling Value : Rs. ${totalSellingValue.toFixed(2)}</div>
      <div class="${profit >= 0 ? "text-success" : "text-danger"}">
        Estimated Profit : Rs. ${profit.toFixed(2)}
      </div>
    </td>
  </tr>
`;

  tbody.insertAdjacentHTML("beforeend", summaryHTML);
}

// ----------------- LOW STOCK LOAD & RENDER -----------------
async function loadLowStock() {
  try {
    const res = await fetch(`${apiBase}/items/low-stock`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    });

    if (!res.ok) throw new Error("Failed to load low stock");

    const rows = await res.json();
    renderLowStock(rows);
  } catch (err) {
    console.error("Low stock load error:", err);
  }
}

function renderLowStock(rows) {
  const card = document.getElementById("lowStockCard");
  const tbody = document.getElementById("lowStockBody");
  const countEl = document.getElementById("lowStockCount");

  tbody.innerHTML = "";

  if (!rows || rows.length === 0) {
    card.style.display = "none";
    return;
  }

  card.style.display = "block";
  countEl.textContent = rows.length;

  rows.forEach((r) => {
    const tr = document.createElement("tr");

    const qty = Number(r.available_qty);
    const daysLeft = Number(r.days_left);

    let statusText = "";

    let rowClass = "";
    if (r.status === "LOW") {
      rowClass = "critical-stock-row";
    } else if (r.status === "MEDIUM") {
      rowClass = "warning-stock-row";
    }
    tr.classList.add(rowClass);

    tr.innerHTML = `
      <td>${escapeHtml(r.item_name)}</td>
      <td>${qty.toFixed(2)}</td>
      <td>${r.sold_30_days}</td>
      <td>${daysLeft.toFixed(2)} days</td>
      <td>
      <span class="${r.status === "LOW" ? "badge bg-danger" : "badge bg-warning text-dark"}">
        ${r.status}
      </span>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

/* ---------------------- sale report table --------------------- */
async function loadSalesReport() {
  const from = document.getElementById("fromDate").value;
  const to = document.getElementById("toDate").value;

  if (!from || !to) {
    return alert("Select both From and To date");
  }

  try {
    const res = await fetch(`${apiBase}/sales/report?from=${from}&to=${to}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    });

    if (!res.ok) throw new Error("Failed to load report");

    const rows = await res.json();
    renderSalesReport(rows);
  } catch (err) {
    console.error("Load sales report error:", err);
    alert("Could not load sales report");
  }
}

function renderSalesReport(rows) {
  const tbody = document.getElementById("salesReportBody");
  const totalEl = document.getElementById("salesGrandTotal");

  tbody.innerHTML = "";
  let grandTotal = 0;

  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-muted">No records found</td></tr>`;
    totalEl.textContent = "0.00";
    return;
  }

  rows.forEach((r) => {
    const date = new Date(r.created_at).toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
    });

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${date}</td>
      <td class="item-name">${escapeHtml(r.item_name)}</td>
      <td>${r.quantity}</td>
      <td>${Number(r.selling_price).toFixed(2)}</td>
      <td>${Number(r.total_price).toFixed(2)}</td>
    `;

    grandTotal += Number(r.total_price) || 0;
    tbody.appendChild(tr);
  });

  totalEl.textContent = grandTotal.toFixed(2);
}

function downloadItemReportPDF() {
  const item = document.getElementById("itemReportSearch").value.trim();

  const url = item
    ? `/api/items/report/pdf?name=${encodeURIComponent(item)}`
    : `/api/items/report/pdf`;

  window.location.href = url;
}

// ----------------- PDF REPORT --------------------------
function downloadSalesPDF() {
  const from = document.getElementById("fromDate").value;
  const to = document.getElementById("toDate").value;

  if (!from || !to) {
    alert("Please select date range");
    return;
  }

  window.location.href = `/api/sales/report/pdf?from=${from}&to=${to}`;
}

// -------------------- EXCELL REPORT ----------------------------
function downloadSalesExcel() {
  const from = document.getElementById("fromDate").value;
  const to = document.getElementById("toDate").value;

  if (!from || !to) {
    alert("Please select date range");
    return;
  }

  window.location.href = `/api/sales/report/excel?from=${from}&to=${to}`;
}

/* ---------------------- Debts --------------------- */
async function submitDebt() {
  const entry = {
    customer_name: document.getElementById("cdName").value.trim(),
    customer_number: document.getElementById("cdNumber").value.trim(),
    total: parseFloat(document.getElementById("cdTotal").value) || 0,
    credit: parseFloat(document.getElementById("cdCredit").value) || 0,
  };
  if (!entry.customer_name || !/^\d{10}$/.test(entry.customer_number))
    return alert("Invalid number");
  try {
    const res = await fetch(`${apiBase}/debts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify(entry),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Debt save failed");
    alert(data.message || "Debt entry added");
    ["cdName", "cdNumber", "cdTotal", "cdCredit"].forEach(
      (id) => (document.getElementById(id).value = ""),
    );
    // 🔓 Re-enable name field after submit
    const cdNameInput = document.getElementById("cdName");
    cdNameInput.disabled = false;
    cdNameInput.classList.remove("bg-light");
  } catch (err) {
    console.error("Submit debt error:", err);
    alert(err.message || "Server error");
  }
}
/* ---------------------- Debts End --------------------- */

// ----------------- SALES + PROFIT DUAL LINE -----------------

async function loadBusinessTrend(year = "all") {
  try {
    const res = await fetch(`${apiBase}/sales/monthly-trend?year=${year}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    });

    if (!res.ok) throw new Error("Failed to load trend");

    const data = await res.json();

    const labels = data.map((d) => d.month);
    const sales = data.map((d) => Number(d.total_sales));
    const profit = data.map((d) => Number(d.total_profit));

    renderBusinessTrend(labels, sales, profit);
    updateGrowthBadge(sales);
  } catch (err) {
    console.error(err);
  }
}

function renderBusinessTrend(labels, sales, profit) {
  const ctx = document.getElementById("businessTrendChart").getContext("2d");

  if (window.businessTrendInstance) {
    window.businessTrendInstance.destroy();
  }

  window.businessTrendInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Sales",
          data: sales,
          tension: 0.3,
          borderWidth: 3,
        },
        {
          label: "Profit",
          data: profit,
          tension: 0.3,
          borderWidth: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 1000,
      },
      plugins: {
        legend: {
          display: true,
          position: "top",
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              return (
                context.dataset.label +
                ": ₹" +
                context.parsed.y.toLocaleString()
              );
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => "₹" + value.toLocaleString(),
          },
        },
      },
    },
  });
}

function updateGrowthBadge(values) {
  const badge = document.getElementById("growthBadge");

  if (!values || values.length < 2) {
    badge.innerHTML = "";
    return;
  }

  const last = values[values.length - 1];
  const prev = values[values.length - 2];

  if (prev === 0) return;

  const growth = ((last - prev) / prev) * 100;
  const formatted = Math.abs(growth).toFixed(1);

  if (growth >= 0) {
    badge.innerHTML = `<span class="text-success">▲ ${formatted}% Growth (Sales)</span>`;
  } else {
    badge.innerHTML = `<span class="text-danger">▼ ${formatted}% Drop (Sales)</span>`;
  }
}

// ----------------- YEAR FILTER INIT -----------------

function initYearFilter() {
  const select = document.getElementById("yearFilter");
  const currentYear = new Date().getFullYear();

  for (let y = currentYear; y >= currentYear - 5; y--) {
    const option = document.createElement("option");
    option.value = y;
    option.textContent = y;
    select.appendChild(option);
  }

  select.addEventListener("change", () => {
    loadBusinessTrend(select.value);
  });
}
// ----------------- SALES + PROFIT DUAL LINE end -----------------

//-------------------- last 13 monts sale chart ------------------
let last12Chart;
async function loadLast12MonthsChart() {
  try {
    const res = await fetch(`${apiBase}/sales/last-13-months`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    });

    if (!res.ok) throw new Error("Chart load failed");

    const rows = await res.json();

    const labels = rows.map((r) => r.month);
    const data = rows.map((r) => parseFloat(r.total_sales));

    const ctx = document.getElementById("last12MonthsChart");

    if (!ctx) return;

    if (last12Chart) {
      last12Chart.destroy();
    }

    last12Chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Monthly Sales",
            data: data,
            backgroundColor: "rgba(245, 158, 11, 0.85)",
            borderColor: "rgba(245, 158, 11, 0.85)",
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: { beginAtZero: true },
        },
      },
    });
  } catch (err) {
    console.error("Chart error:", err);
  }
}
//-------------------- last 13 monts sale chart end ------------------

async function loadCustomerSuggestions(query) {
  try {
    const res = await fetch(
      `${apiBase}/debts/customers?q=${encodeURIComponent(query)}`,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      },
    );

    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error("Customer suggestion error:", err);
    return [];
  }
}

async function searchLedger() {
  const value = document.getElementById("cdSearchInput").value.trim();

  if (!value) return alert("Enter name or number");

  // If exactly 10 digit number → search ledger
  if (/^\d{10}$/.test(value)) {
    try {
      const res = await fetch(`${apiBase}/debts/${value}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await res.json();
      renderLedgerTable(data, "ledger");
    } catch (err) {
      console.error("Search ledger error:", err);
    }
  } else {
    alert("Please select a customer from dropdown");
  }
}

async function showAllDues() {
  try {
    const res = await fetch(`${apiBase}/debts`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    const data = await res.json();
    renderLedgerTable(data, "summary");
  } catch (err) {
    console.error("Show dues error:", err);
  }
}

function renderLedgerTable(rows, mode = "summary") {
  const ledgerDiv = document.getElementById("ledgerTable");
  if (!rows || !rows.length) {
    ledgerDiv.innerHTML = "<p>No records.</p>";
    return;
  }

  let html = '<table class="table table-bordered table-sm text-center">';
  let totalOutstanding = 0;

  if (mode === "summary") {
    html +=
      "<tr><th>Name</th><th>Number</th><th>Total</th><th>Credit</th><th>Balance</th></tr>";
    rows.forEach((r) => {
      const balance = parseFloat(r.balance) || 0;
      totalOutstanding += balance;
      html += `<tr>
        <td>${escapeHtml(r.customer_name)}</td>
        <td>${r.customer_number}</td>
        <td>${r.total}</td>
        <td>${r.credit}</td>
        <td>${balance.toFixed(2)}</td>
      </tr>`;
    });
  } else {
    html +=
      "<tr><th>Date</th><th>Total</th><th>Credit</th><th>Balance</th></tr>";
    let balance = 0;
    rows.forEach((r) => {
      balance += r.total - r.credit;
      html += `<tr>
        <td>${new Date(r.created_at).toLocaleDateString()}</td>
        <td>${r.total}</td>
        <td>${r.credit}</td>
        <td>${balance.toFixed(2)}</td>
      </tr>`;
    });
    totalOutstanding = balance;
  }

  html += `</table>
    <div class="text-end mt-2 fw-bold text-primary">
      Total Outstanding Balance: ₹${totalOutstanding.toFixed(2)}
    </div>`;

  ledgerDiv.innerHTML = html;
}

/* ---------------------- Init --------------------- */
window.addEventListener("DOMContentLoaded", async () => {
  await checkAuth();
  // 🔹 Load saved profit percent from localStorage
  const savedPercent = parseFloat(localStorage.getItem("defaultProfitPercent"));
  if (!isNaN(savedPercent)) {
    document.getElementById("profitPercent").value = savedPercent;
  }

  setupSidebar();
  document.getElementById("addStockBtn").addEventListener("click", addStock);
  document
    .getElementById("loadItemReportBtn")
    .addEventListener("click", loadItemReport);
  document
    .getElementById("itemReportPdfBtn")
    .addEventListener("click", downloadItemReportPDF);
  document
    .getElementById("loadSalesBtn")
    .addEventListener("click", loadSalesReport);
  document.getElementById("pdfBtn").addEventListener("click", downloadSalesPDF);
  document
    .getElementById("excelBtn")
    .addEventListener("click", downloadSalesExcel);

  document
    .getElementById("submitDebtBtn")
    .addEventListener("click", submitDebt);
  // 🔹 Existing customer dropdown while entering number
  const cdNumberInput = document.getElementById("cdNumber");
  const cdNameInput = document.getElementById("cdName");
  const cdNumberDropdown = document.getElementById("cdNumberDropdown");

  cdNumberInput.addEventListener("input", async () => {
    const q = cdNumberInput.value.trim();

    if (!q) {
      cdNumberDropdown.style.display = "none";
      return;
    }

    const customers = await loadCustomerSuggestions(q);

    if (!customers.length) {
      cdNumberDropdown.style.display = "none";
      return;
    }

    cdNumberDropdown.innerHTML = customers
      .map(
        (c) => `
      <div class="dropdown-item"
           data-number="${c.customer_number}"
           data-name="${escapeHtml(c.customer_name)}">
        ${escapeHtml(c.customer_name)} - ${c.customer_number}
      </div>
    `,
      )
      .join("");

    cdNumberDropdown.style.display = "block";

    cdNumberDropdown.querySelectorAll(".dropdown-item").forEach((item) => {
      item.addEventListener("click", () => {
        cdNumberInput.value = item.dataset.number;
        cdNameInput.value = item.dataset.name;

        // 🔥 Disable name field (existing customer)
        cdNameInput.disabled = true;
        cdNameInput.classList.add("bg-light");

        cdNumberDropdown.style.display = "none";
      });
    });
  });

  // Hide dropdown on outside click
  document.addEventListener("click", (e) => {
    if (
      !cdNumberInput.contains(e.target) &&
      !cdNumberDropdown.contains(e.target)
    ) {
      cdNumberDropdown.style.display = "none";
    }
  });

  document
    .getElementById("searchLedgerBtn")
    .addEventListener("click", searchLedger);
  document
    .getElementById("showAllDuesBtn")
    .addEventListener("click", showAllDues);

  // 🔹 Customer Search Dropdown Logic
  const cdInput = document.getElementById("cdSearchInput");
  const cdDropdown = document.getElementById("cdSearchDropdown");

  cdInput.addEventListener("input", async () => {
    const q = cdInput.value.trim();

    if (!q) {
      cdDropdown.style.display = "none";
      return;
    }

    const customers = await loadCustomerSuggestions(q);

    if (!customers.length) {
      cdDropdown.style.display = "none";
      return;
    }

    cdDropdown.innerHTML = customers
      .map(
        (c) => `
      <div class="dropdown-item" data-number="${c.customer_number}">
        ${escapeHtml(c.customer_name)} - ${c.customer_number}
      </div>
    `,
      )
      .join("");

    cdDropdown.style.display = "block";

    cdDropdown.querySelectorAll(".dropdown-item").forEach((item) => {
      item.addEventListener("click", () => {
        cdInput.value = item.dataset.number;
        cdDropdown.style.display = "none";
        searchLedger();
      });
    });
  });

  // Hide dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!cdInput.contains(e.target) && !cdDropdown.contains(e.target)) {
      cdDropdown.style.display = "none";
    }
  });

  document.getElementById("invoiceBtn").addEventListener("click", () => {
    window.location.href = "invoice.html";
  });

  setupFilterInput("newItemSearch", "newItemDropdownList");

  // Item Report search dropdown
  setupFilterInput("itemReportSearch", "itemReportDropdown", () => {});

  //-------------- AFTER REFRESH ALWASE LOAD IN SAME PAGE ---------------------
  const lastSection = localStorage.getItem("activeSection");

  if (lastSection && document.getElementById(lastSection)) {
    document
      .querySelectorAll(".form-section")
      .forEach((s) => s.classList.remove("active"));

    document
      .querySelectorAll(".sidebar button")
      .forEach((b) => b.classList.remove("active"));

    document.getElementById(lastSection).classList.add("active");

    const btn = document.querySelector(
      `.sidebar button[data-section="${lastSection}"]`,
    );
    if (btn) btn.classList.add("active");

    // 🔴 LOW STOCK LOAD ON REFRESH
    if (lastSection === "itemReportSection") {
      loadLowStock();
    }
  }

  await loadItemNames();
  initYearFilter();
  await loadBusinessTrend();
  await loadLast12MonthsChart();
});

// Allow only digits in number fields
// function restrictToDigits(id) {
//   const input = document.getElementById(id);

//   // Prevent typing letters
//   input.addEventListener("keypress", (e) => {
//     if (!/[0-9]/.test(e.key)) e.preventDefault();
//   });

//   // Prevent pasting letters
//   input.addEventListener("input", () => {
//     input.value = input.value.replace(/[^0-9]/g, "").slice(0, 10);
//   });
// }

function restrictToDigits(id) {
  const input = document.getElementById(id);
  if (!input) return;

  input.addEventListener("keypress", (e) => {
    if (!/[0-9]/.test(e.key)) e.preventDefault();
  });

  input.addEventListener("input", () => {
    input.value = input.value.replace(/[^0-9]/g, "").slice(0, 10);
  });
}

// Apply to both fields
restrictToDigits("cdNumber");

setTimeout(() => {
  if (document.body.style.visibility === "hidden") {
    document.body.style.visibility = "visible";
  }
}, 5000);
