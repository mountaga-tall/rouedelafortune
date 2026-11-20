const loginPanel = document.getElementById("loginPanel");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("loginForm");
const loginButton = document.getElementById("loginButton");
const loginStatus = document.getElementById("loginStatus");
const adminPassword = document.getElementById("adminPassword");
const dashboardStatus = document.getElementById("dashboardStatus");
const customersTable = document.getElementById("customersTable");
const spinsTable = document.getElementById("spinsTable");
const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
let latestCustomers = [];

function showStatus(target, message) {
  target.textContent = message || "";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("fr-FR");
}

function cell(row, value, className) {
  const td = document.createElement("td");
  if (className) td.className = className;
  td.textContent = value == null || value === "" ? "—" : String(value);
  row.appendChild(td);
  return td;
}

function emptyRow(target, colspan, message) {
  const row = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = colspan;
  td.className = "empty-cell";
  td.textContent = message;
  row.appendChild(td);
  target.replaceChildren(row);
}

function renderCustomers(customers) {
  customersTable.replaceChildren();
  if (!customers.length) return emptyRow(customersTable, 7, "Aucun participant trouvé.");

  for (const customer of customers) {
    const row = document.createElement("tr");
    const name = document.createElement("td");
    name.textContent = customer.first_name + " " + customer.last_name;
    row.appendChild(name);
    cell(row, customer.phone);
    cell(row, customer.email);
    cell(row, customer.total_spins);
    cell(row, customer.total_wins);
    cell(row, customer.marketing_consent ? "Oui" : "Non");
    cell(row, formatDate(customer.created_at));
    customersTable.appendChild(row);
  }
}

function renderSpins(spins) {
  spinsTable.replaceChildren();
  if (!spins.length) return emptyRow(spinsTable, 6, "Aucune participation pour le moment.");

  for (const spin of spins) {
    const row = document.createElement("tr");
    cell(row, formatDate(spin.played_at));
    cell(row, spin.spin_number);
    cell(row, spin.first_name + " " + spin.last_name);
    cell(row, spin.phone);
    const result = document.createElement("td");
    const pill = document.createElement("span");
    pill.className = spin.is_win ? "win-pill" : "lose-pill";
    pill.textContent = spin.is_win ? "GAGNÉ · " + spin.prize_label : "PAS DE GAIN";
    result.appendChild(pill);
    row.appendChild(result);
    cell(row, spin.validation_code);
    spinsTable.appendChild(row);
  }
}

async function loadDashboard() {
  showStatus(dashboardStatus, "Chargement des données…");
  try {
    const query = new URLSearchParams();
    if (searchInput.value.trim()) query.set("search", searchInput.value.trim());
    const response = await fetch("/api/admin/data?" + query.toString(), {
      credentials: "same-origin",
      cache: "no-store"
    });
    const data = await response.json();
    if (response.status === 401) {
      dashboard.hidden = true;
      loginPanel.hidden = false;
      showStatus(loginStatus, "Votre session a expiré. Reconnectez-vous.");
      return;
    }
    if (!response.ok) throw new Error(data.error || "Chargement impossible.");

    latestCustomers = data.customers || [];
    document.getElementById("totalCustomers").textContent = data.totals?.customers ?? 0;
    document.getElementById("totalSpins").textContent = data.game?.totalSpins ?? data.totals?.spins ?? 0;
    document.getElementById("totalWins").textContent = data.totals?.wins ?? 0;
    document.getElementById("spinsUntilNextPrize").textContent = data.game?.prizePending
      ? "Lot réservé"
      : `${data.game?.spinsUntilNextPrize ?? 50} tours`;
    renderCustomers(latestCustomers);
    renderSpins(data.recentSpins || []);
    document.getElementById("truncatedNotice").hidden = !data.truncated;
    showStatus(dashboardStatus, "");
  } catch (error) {
    showStatus(dashboardStatus, error.message || "Erreur réseau.");
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showStatus(loginStatus, "");
  loginButton.disabled = true;
  loginButton.textContent = "Connexion…";
  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ password: adminPassword.value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Connexion refusée.");
    adminPassword.value = "";
    loginPanel.hidden = true;
    dashboard.hidden = false;
    await loadDashboard();
  } catch (error) {
    showStatus(loginStatus, error.message || "Connexion impossible.");
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Se connecter";
  }
});

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loadDashboard();
});

document.getElementById("refreshButton").addEventListener("click", loadDashboard);

document.getElementById("logoutButton").addEventListener("click", async () => {
  try {
    await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" });
  } finally {
    dashboard.hidden = true;
    loginPanel.hidden = false;
    showStatus(loginStatus, "Vous êtes déconnecté.");
  }
});

function csvValue(value) {
  let text = value == null ? "" : String(value);
  // Empêche l'exécution de formules lors de l'ouverture du CSV dans un tableur.
  if (/^[\\s\\t\\r]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

document.getElementById("exportButton").addEventListener("click", () => {
  const columns = [
    ["Prénom", "first_name"], ["Nom", "last_name"], ["Téléphone", "phone"],
    ["E-mail", "email"], ["Participations", "total_spins"], ["Gains", "total_wins"],
    ["Consentement offres", "marketing_consent"], ["Inscription", "created_at"]
  ];
  const lines = [
    columns.map(([label]) => csvValue(label)).join(";"),
    ...latestCustomers.map(customer => columns.map(([, key]) => {
      let value = customer[key];
      if (key === "marketing_consent") value = value ? "Oui" : "Non";
      if (key === "created_at") value = formatDate(value);
      return csvValue(value);
    }).join(";"))
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "contacts-el-patron.csv";
  link.click();
  URL.revokeObjectURL(url);
});

// Retrouve une session administrateur encore active après rechargement.
loadDashboard();
