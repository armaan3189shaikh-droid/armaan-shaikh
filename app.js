/**
 * APEX INVENTORY PRO - Enterprise Stock & Warehouse ERP Engine
 * Client-side IndexedDB persistent database, SheetJS Excel Integration & Chart Analytics
 */

// Global State
let db = null;
let currentItems = [];
let currentTransactions = [];
let companySettings = {
  name: "AIRTECH PRO COMPRESSORS & AIR SYSTEMS",
  gst: "27AAAAA0000A1Z5",
  phone: "+91 98765 43210",
  email: "sales@airtechpro.com",
  address: "Plot No. 48, MIDC Industrial Area, Phase II, Pune, Maharashtra - 411001",
  currency: "₹"
};

let categoryChartInstance = null;
let movementChartInstance = null;

const firebaseConfig = {
  apiKey: "AIzaSyBzn3xYgL5zBg3RC6eCxrzNd9txs-8NZ68",
  authDomain: "apex-inventory-pro.firebaseapp.com",
  projectId: "apex-inventory-pro",
  storageBucket: "apex-inventory-pro.firebasestorage.app",
  messagingSenderId: "961139741730",
  appId: "1:961139741730:web:07a496dd10c64f7b19267b",
  measurementId: "G-XQ6D8F4130"
};

let cloudDb = null;
let cloudAuth = null;
try {
  firebase.initializeApp(firebaseConfig);
  cloudAuth = firebase.auth();
  cloudDb = firebase.firestore();
} catch (error) {
  console.warn("Cloud storage unavailable; using local storage only.", error);
}

const AUTH_STORAGE_KEY = "apex_inventory_auth";
const USERS_STORAGE_KEY = "apex_inventory_users";
const VALID_CREDENTIALS = {
  admin: "admin",
  manager: "manager",
  operator: "operator"
};

function getSavedUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_STORAGE_KEY) || "[]");
  } catch (error) {
    return [];
  }
}

function saveSavedUsers(users) {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
}

function getUserByUsername(username) {
  const normalized = (username || "").trim().toLowerCase();
  return getSavedUsers().find(user => (user.username || "").toLowerCase() === normalized);
}

function usernameEmail(username) {
  return `${(username || "").trim().toLowerCase()}@apex-inventory-pro.firebaseapp.com`;
}

async function ensureAnonymousCloudSession() {
  if (cloudAuth && !cloudAuth.currentUser) {
    await cloudAuth.signInAnonymously();
  }
}

function saveSession(username, password, role, remember = true) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ username, role, remember }));
}

function clearSession() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

function setAuthState(isLoggedIn) {
  const overlay = document.getElementById("authOverlay");
  if (!overlay) return;
  overlay.classList.toggle("hidden", isLoggedIn);
}

function quickFillCredentials() {
  const usernameInput = document.getElementById("loginUsername");
  const passwordInput = document.getElementById("loginPassword");
  if (usernameInput) usernameInput.value = "admin";
  if (passwordInput) passwordInput.value = "admin";
}

function showPasswordRecoveryAlert() {
  Swal.fire({
    icon: "info",
    title: "Password Recovery",
    text: "Use the default credentials: admin / admin.",
    background: "#0f172a",
    color: "#f8fafc",
    confirmButtonColor: "#f59e0b"
  });
}

function togglePasswordVisibility() {
  const input = document.getElementById("loginPassword");
  const icon = document.getElementById("eyeIcon");
  if (!input || !icon) return;

  const hidden = input.type === "password";
  input.type = hidden ? "text" : "password";
  icon.classList.toggle("fa-eye", !hidden);
  icon.classList.toggle("fa-eye-slash", hidden);
}

async function handleCreateUser(event) {
  event.preventDefault();

  const username = document.getElementById("signupUsername")?.value.trim();
  const password = document.getElementById("signupPassword")?.value.trim();
  const confirmPassword = document.getElementById("signupConfirmPassword")?.value.trim();
  const role = document.getElementById("signupRole")?.value || "manager";

  if (!username || !password || !confirmPassword) {
    Swal.fire({ icon: "error", title: "Complete all fields", text: "Please fill in every sign-up field.", background: "#0f172a", color: "#f8fafc", confirmButtonColor: "#ef4444" });
    return;
  }

  if (password.length < 6) {
    Swal.fire({ icon: "error", title: "Password too short", text: "Use at least 6 characters.", background: "#0f172a", color: "#f8fafc", confirmButtonColor: "#ef4444" });
    return;
  }

  if (password !== confirmPassword) {
    Swal.fire({ icon: "error", title: "Passwords do not match", text: "Please confirm the password correctly.", background: "#0f172a", color: "#f8fafc", confirmButtonColor: "#ef4444" });
    return;
  }

  const normalizedUsername = username.toLowerCase();
  const builtIn = Object.keys(VALID_CREDENTIALS).map(key => key.toLowerCase());
  const users = getSavedUsers();

  if (builtIn.includes(normalizedUsername) || users.some(user => (user.username || "").toLowerCase() === normalizedUsername)) {
    Swal.fire({ icon: "error", title: "Username unavailable", text: "Choose a different username.", background: "#0f172a", color: "#f8fafc", confirmButtonColor: "#ef4444" });
    return;
  }

  if (cloudAuth && cloudDb) {
    try {
      const credential = await cloudAuth.createUserWithEmailAndPassword(usernameEmail(normalizedUsername), password);
      await cloudDb.collection("users").doc(credential.user.uid).set({ username: normalizedUsername, role });
    } catch (error) {
      const message = error.code === "auth/email-already-in-use" ? "This username is already registered." : error.message;
      Swal.fire({ icon: "error", title: "Account creation failed", text: message, background: "#0f172a", color: "#f8fafc", confirmButtonColor: "#ef4444" });
      return;
    }
  } else {
    users.push({ username: normalizedUsername, password, role });
    saveSavedUsers(users);
  }

  document.getElementById("signupForm")?.reset();
  const panel = document.getElementById("signupPanel");
  if (panel) panel.classList.add("hidden");

  document.getElementById("loginUsername").value = normalizedUsername;
  document.getElementById("loginPassword").value = password;
  document.getElementById("loginRole").value = role;

  Swal.fire({
    icon: "success",
    title: "Account Created",
    text: `User ${normalizedUsername} is ready to sign in.`,
    background: "#0f172a",
    color: "#f8fafc",
    confirmButtonColor: "#10b981"
  });
}

async function handleLogin(event) {
  event.preventDefault();

  const username = document.getElementById("loginUsername")?.value.trim();
  const password = document.getElementById("loginPassword")?.value.trim();
  const role = document.getElementById("loginRole")?.value || "admin";

  if (!username || !password) {
    Swal.fire({
      icon: "error",
      title: "Missing credentials",
      text: "Please enter both username and password.",
      background: "#0f172a",
      color: "#f8fafc",
      confirmButtonColor: "#ef4444"
    });
    return;
  }

  if (cloudAuth && !Object.prototype.hasOwnProperty.call(VALID_CREDENTIALS, username.toLowerCase())) {
    try {
      const credential = await cloudAuth.signInWithEmailAndPassword(usernameEmail(username), password);
      const profile = await cloudDb.collection("users").doc(credential.user.uid).get();
      const profileData = profile.exists ? profile.data() : { username, role };
      saveSession(profileData.username, "", profileData.role || role, true);
      setAuthState(true);
      await refreshAllData();
      const headerUser = document.getElementById("headerUsernameDisplay");
      if (headerUser) headerUser.textContent = profileData.username.charAt(0).toUpperCase() + profileData.username.slice(1);
      Swal.fire({ icon: "success", title: "Login Successful", text: `Welcome ${profileData.username}.`, background: "#0f172a", color: "#f8fafc", timer: 1200, showConfirmButton: false });
      return;
    } catch (error) {
      console.warn("Firebase login failed; checking local account.", error);
    }
  }

  const savedUser = getUserByUsername(username);
  if (savedUser && savedUser.password === password) {
    if (cloudAuth) await ensureAnonymousCloudSession().catch(error => console.warn("Anonymous cloud login failed.", error));
    saveSession(savedUser.username, "", savedUser.role, true);
    setAuthState(true);
    await refreshAllData();
    const headerUser = document.getElementById("headerUsernameDisplay");
    if (headerUser) headerUser.textContent = savedUser.username.charAt(0).toUpperCase() + savedUser.username.slice(1);
    Swal.fire({ icon: "success", title: "Login Successful", text: `Welcome ${savedUser.username}.`, background: "#0f172a", color: "#f8fafc", timer: 1200, showConfirmButton: false });
    return;
  }

  const expectedPassword = VALID_CREDENTIALS[role] || VALID_CREDENTIALS.admin;
  const isValid = ((username.toLowerCase() === role.toLowerCase()) && password === expectedPassword) ||
    (username.toLowerCase() === "admin" && password === VALID_CREDENTIALS.admin);

  if (isValid) {
    if (cloudAuth) await ensureAnonymousCloudSession().catch(error => console.warn("Anonymous cloud login failed.", error));
    saveSession(username, password, role, true);
    setAuthState(true);
    await refreshAllData();
    const headerUser = document.getElementById("headerUsernameDisplay");
    if (headerUser) headerUser.textContent = username.charAt(0).toUpperCase() + username.slice(1);
    Swal.fire({ icon: "success", title: "Login Successful", text: `Welcome ${username}.`, background: "#0f172a", color: "#f8fafc", timer: 1200, showConfirmButton: false });
    return;
  }

  Swal.fire({
    icon: "error",
    title: "Invalid Login",
    text: "Use the correct username and password for the selected role.",
    background: "#0f172a",
    color: "#f8fafc",
    confirmButtonColor: "#ef4444"
  });
}

function handleLogout() {
  if (cloudAuth) cloudAuth.signOut().catch(error => console.warn("Firebase logout failed.", error));
  clearSession();
  const form = document.getElementById("loginForm");
  if (form) form.reset();
  const roleSelect = document.getElementById("loginRole");
  if (roleSelect) roleSelect.value = "admin";
  const passwordInput = document.getElementById("loginPassword");
  if (passwordInput) passwordInput.type = "password";
  const eyeIcon = document.getElementById("eyeIcon");
  if (eyeIcon) eyeIcon.className = "fa-solid fa-eye text-xs";
  setAuthState(false);
}

// ================= 1. INDEXEDDB ENGINE INITIALIZATION =================
const DB_NAME = "ApexInventoryDB";
const DB_VERSION = 1;

function initDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      
      // Items Store
      if (!database.objectStoreNames.contains("items")) {
        const itemStore = database.createObjectStore("items", { keyPath: "sku" });
        itemStore.createIndex("category", "category", { unique: false });
        itemStore.createIndex("location", "location", { unique: false });
      }

      // Transactions Store
      if (!database.objectStoreNames.contains("transactions")) {
        const txStore = database.createObjectStore("transactions", { keyPath: "id", autoIncrement: true });
        txStore.createIndex("sku", "sku", { unique: false });
        txStore.createIndex("type", "type", { unique: false });
        txStore.createIndex("date", "date", { unique: false });
      }

      // Settings Store
      if (!database.objectStoreNames.contains("settings")) {
        database.createObjectStore("settings", { keyPath: "key" });
      }
    };

    request.onsuccess = (e) => {
      db = e.target.result;
      console.log("IndexedDB Initialized Successfully");
      resolve(db);
    };

    request.onerror = (e) => {
      console.error("IndexedDB error:", e.target.error);
      reject(e.target.error);
    };
  });
}

// DB Helper Functions
async function getLocalData(storeName) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function dbGetAll(storeName) {
  if (cloudDb) {
    try {
      const snapshot = await cloudDb.collection(storeName).get();
      return snapshot.docs.map(doc => doc.data());
    } catch (error) {
      console.warn(`Online read failed for ${storeName}; using temporary local cache.`, error);
    }
  }
  return getLocalData(storeName);
}

async function dbPut(storeName, data) {
  if (storeName === "transactions" && !data.id) data.id = Date.now();
  const cloudId = storeName === "items" ? data.sku : storeName === "settings" ? data.key : String(data.id);

  if (cloudDb) {
    try {
      await cloudDb.collection(storeName).doc(cloudId).set(data);
    } catch (error) {
      console.warn(`Online write failed for ${storeName}; saving to temporary local cache.`, error);
    }
  }

  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readwrite").objectStore(storeName).put(data);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbDelete(storeName, key) {
  if (cloudDb) {
    try {
      await cloudDb.collection(storeName).doc(String(key)).delete();
    } catch (error) {
      console.warn(`Online delete failed for ${storeName}; deleting from local cache.`, error);
    }
  }

  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readwrite").objectStore(storeName).delete(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbClear(storeName) {
  if (cloudDb) {
    try {
      const snapshot = await cloudDb.collection(storeName).get();
      const batch = cloudDb.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    } catch (error) {
      console.warn(`Online clear failed for ${storeName}; clearing local cache.`, error);
    }
  }

  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readwrite").objectStore(storeName).clear();
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

// ================= 2. SAMPLE COMPRESSOR DEMO DATA (OPTIONAL) =================
async function seedDefaultDataIfEmpty() {
  const initialItems = [
    {
      sku: "CMP-SCREW-10HP",
      itemNumber: "AT-SC-1001",
      name: "10 HP Rotary Screw Air Compressor (Silent High Efficiency)",
      category: "Screw Air Compressors",
      location: "Warehouse A - Bay 1",
      openingStock: 5,
      totalIn: 3,
      totalOut: 2,
      currentStock: 6,
      minStock: 3,
      costPrice: 125000,
      sellingPrice: 165000,
      description: "42 CFM @ 8 Bar, Low noise enclosure, integrated oil separator",
      createdDate: new Date().toISOString()
    },
    {
      sku: "CMP-SCREW-25HP",
      itemNumber: "AT-SC-2501",
      name: "25 HP Industrial Direct-Drive Screw Compressor",
      category: "Screw Air Compressors",
      location: "Warehouse A - Bay 2",
      openingStock: 3,
      totalIn: 1,
      totalOut: 3,
      currentStock: 1,
      minStock: 2, // Low Stock Alert
      costPrice: 280000,
      sellingPrice: 350000,
      description: "115 CFM @ 10 Bar, IE3 high efficiency motor with smart PLC control",
      createdDate: new Date().toISOString()
    },
    {
      sku: "CMP-PISTON-05HP",
      itemNumber: "AT-REC-050",
      name: "5 HP Two-Stage Reciprocating Piston Compressor with 250L Tank",
      category: "Reciprocating Piston Compressors",
      location: "Warehouse B - Rack 2",
      openingStock: 8,
      totalIn: 4,
      totalOut: 2,
      currentStock: 10,
      minStock: 3,
      costPrice: 42000,
      sellingPrice: 58000,
      description: "18 CFM @ 12 Bar, heavy duty cast iron cylinder with automatic pressure switch",
      createdDate: new Date().toISOString()
    },
    {
      sku: "PIP-ALU-40MM",
      itemNumber: "AT-PIP-40",
      name: "40mm Modular Aluminum Compressed Air Pipe (4 Meter Length)",
      category: "Air Piping & Fittings",
      location: "Warehouse C - Pipe Rack 1",
      openingStock: 50,
      totalIn: 20,
      totalOut: 65,
      currentStock: 5,
      minStock: 15, // Low Stock Alert
      costPrice: 1200,
      sellingPrice: 1850,
      description: "Blue powder-coated marine grade extruded aluminum pipe, zero leakage",
      createdDate: new Date().toISOString()
    },
    {
      sku: "FLT-OIL-SEP-10",
      itemNumber: "SP-FL-100",
      name: "Spin-On Air Oil Separator Filter (10-15 HP Compressors)",
      category: "Spare Parts & Filters",
      location: "Spares Room - Shelf D",
      openingStock: 25,
      totalIn: 10,
      totalOut: 12,
      currentStock: 23,
      minStock: 5,
      costPrice: 1800,
      sellingPrice: 3200,
      description: "High retention microglass fiber, residual oil content < 3 ppm",
      createdDate: new Date().toISOString()
    },
    {
      sku: "CMP-PORT-DIESEL",
      itemNumber: "AT-PORT-185",
      name: "185 CFM Trolley Mounted Portable Diesel Engine Compressor",
      category: "Portable Diesel Compressors",
      location: "Yard Bay 3",
      openingStock: 2,
      totalIn: 0,
      totalOut: 2,
      currentStock: 0, // Out of Stock
      minStock: 1,
      costPrice: 450000,
      sellingPrice: 560000,
      description: "Skid/Trolley mounted, ideal for road construction, mining, sandblasting",
      createdDate: new Date().toISOString()
    }
  ];

  for (const item of initialItems) {
    await dbPut("items", item);
  }

  // Seed sample transactions
  const sampleTransactions = [
    {
      date: new Date(Date.now() - 86400000 * 2).toISOString(),
      type: "IN",
      sku: "CMP-SCREW-10HP",
      itemName: "10 HP Rotary Screw Air Compressor",
      qty: 3,
      partyName: "Atlas Industrial Supplies Ltd",
      partyContact: "+91 98220 11223",
      partyAddress: "Bhosari Industrial Area, Pune",
      invoiceNumber: "INV-SUP-8891",
      unitPrice: 125000,
      totalAmount: 375000,
      notes: "Stock replenished via direct factory dispatch"
    },
    {
      date: new Date(Date.now() - 86400000).toISOString(),
      type: "OUT",
      sku: "CMP-SCREW-25HP",
      itemName: "25 HP Industrial Direct-Drive Screw Compressor",
      qty: 2,
      partyName: "Precision Auto Components Pvt Ltd",
      partyContact: "+91 99234 56789",
      partyAddress: "Plot 104, Chakan MIDC, Pune - 410501",
      invoiceNumber: "CH-2026-0042",
      unitPrice: 350000,
      totalAmount: 700000,
      notes: "Complete plant installation with warranty"
    },
    {
      date: new Date().toISOString(),
      type: "OUT",
      sku: "PIP-ALU-40MM",
      itemName: "40mm Modular Aluminum Compressed Air Pipe (4M)",
      qty: 35,
      partyName: "Apex Pharma Packagers",
      partyContact: "+91 94225 88990",
      partyAddress: "Gat No 234, Sanaswadi, Pune",
      invoiceNumber: "CH-2026-0043",
      unitPrice: 1850,
      totalAmount: 64750,
      notes: "Air piping project phase 1 supply"
    }
  ];

  for (const tx of sampleTransactions) {
    await dbPut("transactions", tx);
  }
}

// ================= 3. APPLICATION STARTUP & TAB SWITCHER =================
document.addEventListener("DOMContentLoaded", async () => {
  const now = new Date();
  document.getElementById("currentDateBadge").textContent = now.toLocaleDateString("en-IN", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric"
  });

  try {
    await initDatabase();
    await loadSettings();

    const auth = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "null");
    if (auth && auth.username && auth.role) {
      setAuthState(true);
      const headerUser = document.getElementById("headerUsernameDisplay");
      if (headerUser) headerUser.textContent = auth.username.charAt(0).toUpperCase() + auth.username.slice(1);
    } else {
      setAuthState(false);
      quickFillCredentials();
    }

    if (!localStorage.getItem("apex_real_clean_init_v2")) {
      await dbClear("items");
      await dbClear("transactions");
      localStorage.setItem("apex_real_clean_init_v2", "true");
    }

    await refreshAllData();
  } catch (err) {
    console.error("Initialization error:", err);
  }
});

async function refreshAllData() {
  currentItems = await dbGetAll("items");
  currentTransactions = await dbGetAll("transactions");
  
  // Sort transactions latest first
  currentTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

  updateDashboardMetrics();
  renderInventoryTable();
  renderTransactionsTable();
  renderLowStockTable();
  renderBarcodes();
  populateCategoryDropdown();
}

function switchTab(tabId) {
  // Hide all sections
  const sections = ["dashboard", "inventory", "transactions", "lowstock", "excelcenter", "barcodes", "settings"];
  sections.forEach(id => {
    const el = document.getElementById(`view-${id}`);
    if (el) el.classList.add("hidden");
    
    const navBtn = document.getElementById(`nav-${id}`);
    if (navBtn) {
      navBtn.classList.remove("text-sky-400", "bg-sky-950/50", "border", "border-sky-800/40");
      navBtn.classList.add("text-slate-400");
    }
  });

  // Show active section
  const activeEl = document.getElementById(`view-${tabId}`);
  if (activeEl) activeEl.classList.remove("hidden");

  const activeNav = document.getElementById(`nav-${tabId}`);
  if (activeNav) {
    activeNav.classList.remove("text-slate-400");
    activeNav.classList.add("text-sky-400", "bg-sky-950/50", "border", "border-sky-800/40");
  }

  // Update Page Title
  const titles = {
    dashboard: "Executive Dashboard",
    inventory: "Master Inventory & Stock Catalog",
    transactions: "Stock In/Out Logs & Audit Ledger",
    lowstock: "Low Stock Reorder Center",
    excelcenter: "Excel Data Import & Export Hub",
    barcodes: "Barcode & Bin Label Generator",
    settings: "System Settings & Disaster Recovery"
  };
  document.getElementById("pageTitle").textContent = titles[tabId] || "Inventory System";

  if (tabId === "dashboard") {
    setTimeout(renderCharts, 100);
  }
}

// ================= 4. DASHBOARD & ANALYTICS =================
function updateDashboardMetrics() {
  const totalSKUs = currentItems.length;
  let totalValuation = 0;
  let totalUnits = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let totalStockInUnits = 0;

  const categoriesSet = new Set();

  currentItems.forEach(item => {
    const stock = Number(item.currentStock) || 0;
    const cost = Number(item.costPrice) || 0;
    const min = Number(item.minStock) || 2;

    totalValuation += stock * cost;
    totalUnits += stock;
    totalStockInUnits += (Number(item.totalIn) || 0);

    if (item.category) categoriesSet.add(item.category);

    if (stock <= 0) {
      outOfStockCount++;
      lowStockCount++;
    } else if (stock <= min) {
      lowStockCount++;
    }
  });

  document.getElementById("statTotalSKUs").textContent = totalSKUs;
  document.getElementById("totalItemsCountBadge").textContent = totalSKUs;
  document.getElementById("statTotalCategories").textContent = categoriesSet.size;
  document.getElementById("statTotalValuation").textContent = "₹" + totalValuation.toLocaleString("en-IN");
  document.getElementById("statTotalStockUnits").textContent = totalUnits.toLocaleString("en-IN") + " Units";
  document.getElementById("statTotalStockIn").textContent = totalStockInUnits.toLocaleString("en-IN");
  document.getElementById("statInTransactionsCount").textContent = currentTransactions.filter(t => t.type === "IN").length + " inward entries";
  document.getElementById("statLowStockCount").textContent = lowStockCount;
  document.getElementById("statOutOfStockCount").textContent = outOfStockCount;

  // Header & Nav Alert Badges
  const navBadge = document.getElementById("lowStockNavBadge");
  const headBadge = document.getElementById("headerAlertBadge");
  if (lowStockCount > 0) {
    navBadge.textContent = lowStockCount;
    navBadge.classList.remove("hidden");
    headBadge.textContent = lowStockCount;
    headBadge.classList.remove("hidden");
  } else {
    navBadge.classList.add("hidden");
    headBadge.classList.add("hidden");
  }

  // Render recent 5 transactions on dashboard
  renderDashboardRecentTransactions();
  renderCharts();
}

function renderDashboardRecentTransactions() {
  const tbody = document.getElementById("dashboardRecentTxTable");
  const recent = currentTransactions.slice(0, 5);

  if (recent.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-500">No transactions recorded yet. Click "Stock IN" or "Stock OUT" to add.</td></tr>`;
    return;
  }

  tbody.innerHTML = recent.map(tx => {
    const isOut = tx.type === "OUT";
    const typeBadge = isOut 
      ? `<span class="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-400 font-bold border border-rose-500/30">🔴 OUT</span>`
      : `<span class="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">🟢 IN</span>`;

    const formattedDate = new Date(tx.date).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
    });

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="px-5 py-3 font-mono text-slate-400">${formattedDate}</td>
        <td class="px-5 py-3">${typeBadge}</td>
        <td class="px-5 py-3 font-medium text-white">${tx.itemName || tx.sku}</td>
        <td class="px-5 py-3 font-bold font-mono ${isOut ? 'text-rose-400' : 'text-emerald-400'}">${tx.qty}</td>
        <td class="px-5 py-3">
          <div class="font-semibold text-slate-200">${tx.partyName || '--'}</div>
          <div class="text-[10px] text-slate-400 font-mono">${tx.partyContact || ''}</div>
        </td>
        <td class="px-5 py-3 font-mono text-slate-400">${tx.invoiceNumber || '--'}</td>
        <td class="px-5 py-3 text-right">
          <button onclick="openChallanModal('${tx.id}')" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded text-[11px] border border-slate-700 font-medium transition" title="Print Challan">
            <i class="fa-solid fa-print"></i> Slip
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

function renderCharts() {
  const catCanvas = document.getElementById("categoryPieChart");
  const movCanvas = document.getElementById("stockMovementBarChart");
  if (!catCanvas || !movCanvas) return;

  // 1. Category Breakdown Data
  const categoryTotals = {};
  currentItems.forEach(item => {
    const cat = item.category || "General";
    const val = (Number(item.currentStock) || 0) * (Number(item.costPrice) || 0);
    categoryTotals[cat] = (categoryTotals[cat] || 0) + val;
  });

  const catLabels = Object.keys(categoryTotals);
  const catValues = Object.values(categoryTotals);

  if (categoryChartInstance) categoryChartInstance.destroy();
  categoryChartInstance = new Chart(catCanvas, {
    type: "doughnut",
    data: {
      labels: catLabels,
      datasets: [{
        data: catValues,
        backgroundColor: [
          "#0284c7", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899", "#64748b"
        ],
        borderColor: "#0f172a",
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: "#94a3b8", boxWidth: 10, font: { size: 10 } }
        }
      }
    }
  });

  // 2. Movement Activity (Recent IN vs OUT)
  const txLabels = ["Compressors", "Piston", "Piping", "Filters", "Spares"];
  const inData = [12, 18, 45, 20, 15];
  const outData = [8, 14, 38, 12, 10];

  if (movementChartInstance) movementChartInstance.destroy();
  movementChartInstance = new Chart(movCanvas, {
    type: "bar",
    data: {
      labels: txLabels,
      datasets: [
        {
          label: "Stock Inward",
          data: inData,
          backgroundColor: "#10b981",
          borderRadius: 6
        },
        {
          label: "Stock Outward",
          data: outData,
          backgroundColor: "#f43f5e",
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: "#94a3b8", font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: "#94a3b8", font: { size: 10 } }, grid: { color: "#1e293b" } }
      },
      plugins: {
        legend: {
          labels: { color: "#cbd5e1", font: { size: 11 } }
        }
      }
    }
  });
}

// ================= 5. INVENTORY MASTER TABLE =================
function renderInventoryTable() {
  const tbody = document.getElementById("inventoryTableBody");
  const search = (document.getElementById("inventorySearch")?.value || "").toLowerCase().trim();
  const category = document.getElementById("categoryFilter")?.value || "ALL";
  const stockStatus = document.getElementById("stockStatusFilter")?.value || "ALL";

  let filtered = currentItems.filter(item => {
    // Search match
    const matchSearch = !search || 
      item.sku.toLowerCase().includes(search) || 
      (item.itemNumber && item.itemNumber.toLowerCase().includes(search)) ||
      item.name.toLowerCase().includes(search) ||
      (item.location && item.location.toLowerCase().includes(search));

    // Category match
    const matchCat = category === "ALL" || item.category === category;

    // Stock Status match
    const stock = Number(item.currentStock) || 0;
    const min = Number(item.minStock) || 2;
    let matchStock = true;
    if (stockStatus === "LOW") matchStock = stock > 0 && stock <= min;
    else if (stockStatus === "OUT") matchStock = stock <= 0;
    else if (stockStatus === "IN_STOCK") matchStock = stock > min;

    return matchSearch && matchCat && matchStock;
  });

  document.getElementById("showingItemsCount").textContent = filtered.length;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="p-8 text-center text-slate-500">No inventory items matching your search criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    const stock = Number(item.currentStock) || 0;
    const min = Number(item.minStock) || 2;
    const cost = Number(item.costPrice) || 0;
    const totalVal = stock * cost;

    let stockBadge = "";
    if (stock <= 0) {
      stockBadge = `<span class="px-2.5 py-1 rounded-md bg-rose-500/20 text-rose-400 font-extrabold border border-rose-500/30 text-xs">OUT OF STOCK (0)</span>`;
    } else if (stock <= min) {
      stockBadge = `<span class="px-2.5 py-1 rounded-md bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30 text-xs">⚠️ LOW (${stock})</span>`;
    } else {
      stockBadge = `<span class="px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30 text-xs">✅ ${stock} Units</span>`;
    }

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="px-4 py-3.5">
          <div class="font-mono font-bold text-amber-400">${item.sku}</div>
          <div class="font-mono text-[10px] text-slate-500">${item.itemNumber || '--'}</div>
        </td>
        <td class="px-4 py-3.5">
          <div class="font-semibold text-white">${item.name}</div>
          <div class="text-[10px] text-slate-400 max-w-xs truncate">${item.description || 'No description'}</div>
        </td>
        <td class="px-4 py-3.5">
          <span class="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px] border border-slate-700">${item.category || 'General'}</span>
        </td>
        <td class="px-4 py-3.5 font-mono text-slate-300">${item.location || 'General Rack'}</td>
        <td class="px-3 py-3.5 text-center font-mono text-slate-400">${item.openingStock || 0}</td>
        <td class="px-3 py-3.5 text-center font-mono font-bold text-emerald-400">+${item.totalIn || 0}</td>
        <td class="px-3 py-3.5 text-center font-mono font-bold text-rose-400">-${item.totalOut || 0}</td>
        <td class="px-4 py-3.5 text-center bg-slate-900/50">${stockBadge}</td>
        <td class="px-4 py-3.5 text-right font-mono text-slate-300">₹${cost.toLocaleString("en-IN")}</td>
        <td class="px-4 py-3.5 text-right font-mono font-bold text-amber-400">₹${totalVal.toLocaleString("en-IN")}</td>
        <td class="px-4 py-3.5 text-center">
          <div class="flex items-center justify-center gap-1.5">
            <button onclick="editItem('${item.sku}')" class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-400 transition" title="Edit Item">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button onclick="quickStockInOut('${item.sku}', 'IN')" class="p-1.5 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-400 border border-emerald-800" title="Quick Stock IN">
              <i class="fa-solid fa-plus"></i>
            </button>
            <button onclick="quickStockInOut('${item.sku}', 'OUT')" class="p-1.5 rounded-lg bg-rose-950 hover:bg-rose-900 text-rose-400 border border-rose-800" title="Quick Stock OUT">
              <i class="fa-solid fa-minus"></i>
            </button>
            <button onclick="deleteItemConfirm('${item.sku}')" class="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900 text-slate-500 hover:text-rose-400 transition" title="Delete">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function populateCategoryDropdown() {
  const select = document.getElementById("categoryFilter");
  if (!select) return;

  const categories = new Set();
  currentItems.forEach(i => { if (i.category) categories.add(i.category); });

  const currentVal = select.value;
  select.innerHTML = `<option value="ALL">All Categories</option>` + 
    Array.from(categories).map(c => `<option value="${c}">${c}</option>`).join("");
  select.value = currentVal;
}

// ================= 6. ITEM ADD / EDIT MODAL =================
function openItemModal(sku = null) {
  const form = document.getElementById("itemForm");
  form.reset();
  document.getElementById("itemId").value = "";

  if (sku) {
    const item = currentItems.find(i => i.sku === sku);
    if (item) {
      document.getElementById("itemModalTitle").textContent = "Edit Item (" + item.sku + ")";
      document.getElementById("itemId").value = item.sku;
      document.getElementById("itemSKU").value = item.sku;
      document.getElementById("itemSKU").readOnly = true;
      document.getElementById("itemNumber").value = item.itemNumber || "";
      document.getElementById("itemName").value = item.name || "";
      document.getElementById("itemCategory").value = item.category || "";
      document.getElementById("itemLocation").value = item.location || "";
      document.getElementById("itemOpeningStock").value = item.openingStock || 0;
      document.getElementById("itemMinStock").value = item.minStock || 2;
      document.getElementById("itemCostPrice").value = item.costPrice || 0;
      document.getElementById("itemSellingPrice").value = item.sellingPrice || 0;
      document.getElementById("itemDescription").value = item.description || "";
    }
  } else {
    document.getElementById("itemModalTitle").textContent = "Add New Inventory Item";
    document.getElementById("itemSKU").readOnly = false;
    autoGenerateSKU();
  }

  document.getElementById("itemModal").classList.remove("hidden");
}

function closeItemModal() {
  document.getElementById("itemModal").classList.add("hidden");
}

function autoGenerateSKU() {
  const prefix = "CMP";
  const random = Math.floor(1000 + Math.random() * 9000);
  document.getElementById("itemSKU").value = `${prefix}-${random}`;
}

async function saveItem(e) {
  e.preventDefault();
  const sku = document.getElementById("itemSKU").value.trim().toUpperCase();
  const existing = currentItems.find(i => i.sku === sku);

  const openingStock = Number(document.getElementById("itemOpeningStock").value) || 0;
  const totalIn = existing ? (Number(existing.totalIn) || 0) : 0;
  const totalOut = existing ? (Number(existing.totalOut) || 0) : 0;
  const currentStock = openingStock + totalIn - totalOut;

  const itemObj = {
    sku: sku,
    itemNumber: document.getElementById("itemNumber").value.trim(),
    name: document.getElementById("itemName").value.trim(),
    category: document.getElementById("itemCategory").value.trim() || "General",
    location: document.getElementById("itemLocation").value.trim() || "Warehouse A",
    openingStock: openingStock,
    totalIn: totalIn,
    totalOut: totalOut,
    currentStock: currentStock,
    minStock: Number(document.getElementById("itemMinStock").value) || 2,
    costPrice: Number(document.getElementById("itemCostPrice").value) || 0,
    sellingPrice: Number(document.getElementById("itemSellingPrice").value) || 0,
    description: document.getElementById("itemDescription").value.trim(),
    updatedDate: new Date().toISOString()
  };

  await dbPut("items", itemObj);
  closeItemModal();
  await refreshAllData();

  Swal.fire({
    icon: "success",
    title: "Item Saved Successfully",
    text: `${itemObj.name} (${itemObj.sku}) is now active in the database.`,
    background: "#0f172a",
    color: "#f8fafc",
    confirmButtonColor: "#f59e0b",
    timer: 2000
  });
}

function editItem(sku) {
  openItemModal(sku);
}

async function deleteItemConfirm(sku) {
  const result = await Swal.fire({
    title: "Delete Item?",
    text: `Are you sure you want to remove SKU: ${sku}? This cannot be undone.`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
    cancelButtonColor: "#334155",
    confirmButtonText: "Yes, Delete",
    background: "#0f172a",
    color: "#f8fafc"
  });

  if (result.isConfirmed) {
    await dbDelete("items", sku);
    await refreshAllData();
    Swal.fire({
      icon: "success",
      title: "Deleted",
      text: "Item removed from inventory.",
      background: "#0f172a",
      color: "#f8fafc",
      timer: 1500
    });
  }
}

// ================= 7. STOCK IN / STOCK OUT TRANSACTIONS =================
function openTransactionModal(type = "IN", preselectSKU = null) {
  const form = document.getElementById("txForm");
  form.reset();
  document.getElementById("txType").value = type;

  const header = document.getElementById("txModalHeader");
  const iconBox = document.getElementById("txIconBox");
  const title = document.getElementById("txModalTitle");
  const subtitle = document.getElementById("txModalSubtitle");
  const partyLabel = document.getElementById("txPartyNameLabel");
  const submitBtn = document.getElementById("txSubmitBtn");

  document.getElementById("txLineItems").innerHTML = "";
  addTransactionRow(preselectSKU || "");

  if (type === "IN") {
    header.className = "p-5 border-b border-slate-800 flex items-center justify-between bg-emerald-950/40";
    iconBox.className = "w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center";
    iconBox.innerHTML = `<i class="fa-solid fa-arrow-down"></i>`;
    title.textContent = "Stock IN (Material Inward / Purchase Receipt)";
    subtitle.textContent = "Record incoming stock from suppliers or factory production";
    document.querySelectorAll(".tx-rate-label").forEach(label => { label.textContent = "Purchase Cost / Unit (₹)"; });
    partyLabel.innerHTML = `Supplier / Vendor Name <span class="text-rose-400">*</span>`;
    document.getElementById("txPartyName").placeholder = "e.g. Atlas Copco India Ltd";
    document.getElementById("txInvoiceNumber").placeholder = "e.g. PO-2026-9021";
    submitBtn.className = "px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-emerald-600/30";
    submitBtn.textContent = "Record Stock IN Receipt";
  } else {
    header.className = "p-5 border-b border-slate-800 flex items-center justify-between bg-rose-950/40";
    iconBox.className = "w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center";
    iconBox.innerHTML = `<i class="fa-solid fa-arrow-up"></i>`;
    title.textContent = "Stock OUT (Sales Dispatch / Delivery Issue)";
    subtitle.textContent = "Record outward dispatch to customers with official delivery challan";
    document.querySelectorAll(".tx-rate-label").forEach(label => { label.textContent = "Selling Price / Unit (₹)"; });
    partyLabel.innerHTML = `Customer / Consignee Name <span class="text-rose-400">*</span>`;
    document.getElementById("txPartyName").placeholder = "e.g. Precision Engineering Works";
    document.getElementById("txInvoiceNumber").placeholder = "e.g. DC-2026-1044";
    submitBtn.className = "px-6 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-rose-600/30";
    submitBtn.textContent = "Generate Dispatch & Challan";
  }

  document.getElementById("transactionModal").classList.remove("hidden");
}

function closeTransactionModal() {
  document.getElementById("transactionModal").classList.add("hidden");
}

function transactionItemOptions(selectedSKU = "") {
  return `<option value="">-- Choose Item from Inventory --</option>` +
    currentItems.map(item => `<option value="${item.sku}" ${item.sku === selectedSKU ? "selected" : ""}>[${item.sku}] ${item.name} (In Stock: ${item.currentStock})</option>`).join("");
}

function addTransactionRow(selectedSKU = "") {
  const container = document.getElementById("txLineItems");
  if (!container) return;
  const rateLabel = document.getElementById("txType")?.value === "OUT" ? "Selling Price / Unit (₹)" : "Purchase Cost / Unit (₹)";

  const row = document.createElement("div");
  row.className = "tx-line-item grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_110px_140px_auto] gap-2 items-end p-3 rounded-xl bg-slate-950/60 border border-slate-800";
  row.innerHTML = `
    <div>
      <label class="block text-[10px] font-semibold text-slate-400 mb-1">Item Number / SKU</label>
      <input required value="${selectedSKU}" placeholder="e.g. CMP-1001" oninput="handleTxItemChange(this.value, this.closest('.tx-line-item'))" class="tx-item-number w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-amber-500">
      <span class="tx-stock-display block text-[10px] text-slate-500 mt-1">Available stock: --</span>
    </div>
    <div>
      <label class="block text-[10px] font-semibold text-slate-400 mb-1">Item Name</label>
      <input required placeholder="e.g. Air Filter" class="tx-item-name w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500">
    </div>
    <div>
      <label class="block text-[10px] font-semibold text-slate-400 mb-1">Quantity</label>
      <input type="number" required min="1" value="1" oninput="calculateTxTotal()" class="tx-qty w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white font-bold focus:outline-none focus:border-amber-500">
    </div>
    <div>
      <label class="tx-rate-label block text-[10px] font-semibold text-slate-400 mb-1">${rateLabel}</label>
      <input type="number" min="0" step="0.01" value="0" oninput="calculateTxTotal()" class="tx-unit-price w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500">
    </div>
    <button type="button" onclick="removeTransactionRow(this)" class="tx-remove-row h-[34px] px-2.5 bg-slate-800 hover:bg-rose-900/70 text-slate-400 hover:text-rose-300 rounded-lg border border-slate-700 transition" title="Remove product">
      <i class="fa-solid fa-trash-can"></i>
    </button>`;
  container.appendChild(row);
  if (selectedSKU) handleTxItemChange(selectedSKU, row);
  calculateTxTotal();
}

function removeTransactionRow(button) {
  const rows = document.querySelectorAll(".tx-line-item");
  if (rows.length <= 1) {
    Swal.fire({ icon: "info", title: "Keep one product row", text: "Add another product before removing this row.", background: "#0f172a", color: "#f8fafc", confirmButtonColor: "#f59e0b" });
    return;
  }
  button.closest(".tx-line-item")?.remove();
  calculateTxTotal();
}

function handleTxItemChange(sku, row) {
  const normalizedSKU = (sku || "").trim().toUpperCase();
  const item = currentItems.find(i => i.sku === normalizedSKU || i.itemNumber === normalizedSKU);
  const display = row?.querySelector(".tx-stock-display");
  const nameInput = row?.querySelector(".tx-item-name");
  const unitPriceInput = row?.querySelector(".tx-unit-price");
  const type = document.getElementById("txType").value;

  if (item && display && unitPriceInput) {
    display.textContent = `Available: ${item.currentStock} units in ${item.location || 'Warehouse'}`;
    if (nameInput && !nameInput.value.trim()) nameInput.value = item.name || "";
    unitPriceInput.value = type === "IN" ? (item.costPrice || 0) : (item.sellingPrice || 0);
  } else if (display && unitPriceInput) {
    display.textContent = "--";
    unitPriceInput.value = 0;
  }
  calculateTxTotal();
}

function calculateTxTotal() {
  const total = Array.from(document.querySelectorAll(".tx-line-item")).reduce((sum, row) => {
    const qty = Number(row.querySelector(".tx-qty")?.value) || 0;
    const rate = Number(row.querySelector(".tx-unit-price")?.value) || 0;
    return sum + qty * rate;
  }, 0);
  document.getElementById("txTotalValuationDisplay").textContent = "₹" + total.toLocaleString("en-IN", { minimumFractionDigits: 2 });
}

function quickStockInOut(sku, type) {
  openTransactionModal(type, sku);
}

async function saveTransaction(e) {
  e.preventDefault();
  const type = document.getElementById("txType").value;
  const rows = Array.from(document.querySelectorAll(".tx-line-item"));
  const partyName = document.getElementById("txPartyName").value.trim();
  const partyContact = document.getElementById("txPartyContact").value.trim();
  const partyAddress = document.getElementById("txPartyAddress").value.trim();
  const invoiceNumber = document.getElementById("txInvoiceNumber").value.trim() || ("DOC-" + Math.floor(1000 + Math.random() * 9000));
  const notes = document.getElementById("txNotes").value.trim();

  const batchLines = rows.map(row => ({
    sku: (row.querySelector(".tx-item-number")?.value || "").trim().toUpperCase(),
    itemName: (row.querySelector(".tx-item-name")?.value || "").trim(),
    qty: Number(row.querySelector(".tx-qty")?.value) || 0,
    unitPrice: Number(row.querySelector(".tx-unit-price")?.value) || 0
  }));
  const selectedSKUs = batchLines.map(line => line.sku).filter(Boolean);
  if (batchLines.some(line => !line.sku || !line.itemName || line.qty < 1)) {
    Swal.fire({ icon: "error", title: "Complete all product rows", text: "Enter an item number, item name, and quantity for every row.", background: "#0f172a", color: "#fff" });
    return;
  }
  if (new Set(selectedSKUs).size !== selectedSKUs.length) {
    Swal.fire({ icon: "error", title: "Duplicate product", text: "Each SKU can appear only once in the same batch.", background: "#0f172a", color: "#fff" });
    return;
  }

  const itemsBySKU = new Map(batchLines.map(line => [line.sku, currentItems.find(item => item.sku === line.sku || item.itemNumber === line.sku)]));
  if (type === "IN") {
    batchLines.forEach(line => {
      if (!itemsBySKU.get(line.sku)) {
        const newItem = {
          sku: line.sku,
          itemNumber: line.sku,
          name: line.itemName,
          category: "General",
          location: "Warehouse A",
          openingStock: 0,
          totalIn: 0,
          totalOut: 0,
          currentStock: 0,
          minStock: 2,
          costPrice: line.unitPrice,
          sellingPrice: 0,
          description: "",
          createdDate: new Date().toISOString()
        };
        itemsBySKU.set(line.sku, newItem);
      }
    });
  }
  const unavailableLine = batchLines.find(line => {
    const item = itemsBySKU.get(line.sku);
    return !item || (type === "OUT" && line.qty > (item.currentStock || 0));
  });
  if (unavailableLine) {
    const item = itemsBySKU.get(unavailableLine.sku);
    if (!item) {
      Swal.fire({ icon: "error", title: "Item not found", text: "Stock OUT requires an existing item number / SKU.", background: "#0f172a", color: "#fff" });
      return;
    }
    Swal.fire({
      icon: "error",
      title: "Insufficient Stock!",
      html: `Available stock for <b>${item.name}</b> is only <b>${item.currentStock} units</b>.<br>You are attempting to dispatch <b>${unavailableLine.qty} units</b>.`,
      background: "#0f172a",
      color: "#f8fafc",
      confirmButtonColor: "#ef4444"
    });
    return;
  }

  const updatedItems = batchLines.map(line => {
    const item = itemsBySKU.get(line.sku);
    if (type === "IN") item.totalIn = (Number(item.totalIn) || 0) + line.qty;
    else item.totalOut = (Number(item.totalOut) || 0) + line.qty;
    item.currentStock = (Number(item.openingStock) || 0) + (Number(item.totalIn) || 0) - (Number(item.totalOut) || 0);
    item.updatedDate = new Date().toISOString();
    return item;
  });
  await Promise.all(updatedItems.map(item => dbPut("items", item)));

  const batchId = "BATCH-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
  const txRecords = await Promise.all(batchLines.map(async line => {
    const item = itemsBySKU.get(line.sku);
    const txRecord = { batchId, date: new Date().toISOString(), type, sku: line.sku, itemName: item.name, qty: line.qty, partyName, partyContact, partyAddress, invoiceNumber, unitPrice: line.unitPrice, totalAmount: line.qty * line.unitPrice, notes };
    txRecord.id = await dbPut("transactions", txRecord);
    return txRecord;
  }));

  closeTransactionModal();
  await refreshAllData();

  // Prompt to print delivery challan / invoice
  Swal.fire({
    icon: "success",
    title: type === "OUT" ? "Dispatch Recorded & Stock Deducted!" : "Stock Inward Recorded!",
    html: `Successfully recorded <b>${batchLines.length} products</b> in one batch.<br>Total quantity moved: <b>${batchLines.reduce((sum, line) => sum + line.qty, 0)} units</b>`,
    showCancelButton: true,
    confirmButtonText: '<i class="fa-solid fa-print"></i> Print Official Challan / Slip',
    cancelButtonText: "Done",
    confirmButtonColor: "#0284c7",
    cancelButtonColor: "#334155",
    background: "#0f172a",
    color: "#f8fafc"
  }).then((res) => {
    if (res.isConfirmed) {
      openChallanModal(txRecords[0].id);
    }
  });
}

// ================= 8. PRINTABLE DELIVERY CHALLAN / INVOICE =================
function openChallanModal(txId) {
  const tx = currentTransactions.find(t => String(t.id) === String(txId));
  if (!tx) return;

  const batchTransactions = tx.batchId
    ? currentTransactions.filter(record => record.batchId === tx.batchId)
    : tx.invoiceNumber
      ? currentTransactions.filter(record => record.invoiceNumber === tx.invoiceNumber && record.type === tx.type && record.partyName === tx.partyName)
      : currentTransactions.filter(record => String(record.id) === String(tx.id));

  // Set Company Headers from settings
  document.getElementById("challanCompanyName").textContent = companySettings.name;
  document.getElementById("challanCompanyAddress").textContent = companySettings.address;
  document.getElementById("challanGST").textContent = companySettings.gst;
  document.getElementById("challanPhone").textContent = companySettings.phone;

  // Set Document Details
  document.getElementById("challanDocNo").textContent = tx.invoiceNumber || ("CH-" + tx.id);
  document.getElementById("challanDate").textContent = new Date(tx.date).toLocaleDateString("en-IN", {
    day: "2-digit", month: "long", year: "numeric"
  });

  const isOut = tx.type === "OUT";
  document.getElementById("challanTypeBadge").textContent = isOut ? "OFFICIAL DELIVERY CHALLAN" : "GOODS RECEIPT NOTE (GRN)";
  document.getElementById("challanMovementType").textContent = isOut ? "Outward Dispatch / Delivery Issue" : "Inward Purchase Receipt";
  document.getElementById("challanMovementType").className = isOut ? "font-semibold text-rose-600" : "font-semibold text-emerald-600";

  // Party Details
  document.getElementById("challanCustomerName").textContent = tx.partyName || "M/s Direct Customer";
  document.getElementById("challanCustomerAddress").textContent = tx.partyAddress || "Factory / Site Delivery";
  document.getElementById("challanCustomerPhone").textContent = tx.partyContact || "--";
  document.getElementById("challanRemarks").textContent = tx.notes || "Standard warehouse transfer";

  const challanItemsBody = document.getElementById("challanItemsBody");
  challanItemsBody.innerHTML = batchTransactions.map((record, index) => {
    const item = currentItems.find(currentItem => currentItem.sku === record.sku);
    return `
      <tr>
        <td class="p-3 font-mono">${index + 1}</td>
        <td class="p-3 font-mono font-bold">${record.sku}</td>
        <td class="p-3">
          <span class="font-bold block text-slate-900">${record.itemName || (item ? item.name : record.sku)}</span>
          <span class="text-[11px] text-slate-500">${item ? (item.description || item.location || "") : ""}</span>
        </td>
        <td class="p-3 text-center font-bold text-sm text-slate-900">${record.qty} Units</td>
        <td class="p-3 text-right font-mono">₹${(Number(record.unitPrice) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
        <td class="p-3 text-right font-mono font-bold text-slate-900">₹${(Number(record.totalAmount) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
      </tr>`;
  }).join("");

  document.getElementById("challanModal").classList.remove("hidden");
}

function closeChallanModal() {
  document.getElementById("challanModal").classList.add("hidden");
}

// ================= 9. TRANSACTIONS LEDGER TABLE =================
function renderTransactionsTable() {
  const tbody = document.getElementById("transactionsTableBody");
  const search = (document.getElementById("txSearchInput")?.value || "").toLowerCase().trim();
  const typeFilter = document.getElementById("txTypeFilter")?.value || "ALL";

  let filtered = currentTransactions.filter(tx => {
    const matchSearch = !search ||
      (tx.sku && tx.sku.toLowerCase().includes(search)) ||
      (tx.itemName && tx.itemName.toLowerCase().includes(search)) ||
      (tx.partyName && tx.partyName.toLowerCase().includes(search)) ||
      (tx.partyContact && tx.partyContact.includes(search)) ||
      (tx.invoiceNumber && tx.invoiceNumber.toLowerCase().includes(search));

    const matchType = typeFilter === "ALL" || tx.type === typeFilter;
    return matchSearch && matchType;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="p-8 text-center text-slate-500">No transactions recorded matching your search.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(tx => {
    const isOut = tx.type === "OUT";
    const typeBadge = isOut 
      ? `<span class="px-2.5 py-1 rounded-md bg-rose-500/20 text-rose-400 font-bold border border-rose-500/30">🔴 OUT (Dispatch)</span>`
      : `<span class="px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">🟢 IN (Receipt)</span>`;

    const formattedDate = new Date(tx.date).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric"
    });

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="px-4 py-3.5">
          <div class="font-mono text-slate-300 font-bold">#${tx.id || '--'}</div>
          <div class="text-[10px] text-slate-500 font-mono">${formattedDate}</div>
        </td>
        <td class="px-4 py-3.5">${typeBadge}</td>
        <td class="px-4 py-3.5">
          <div class="font-bold text-white">${tx.itemName || tx.sku}</div>
          <div class="font-mono text-[10px] text-amber-400">${tx.sku}</div>
        </td>
        <td class="px-3 py-3.5 text-center font-mono font-extrabold text-sm ${isOut ? 'text-rose-400' : 'text-emerald-400'}">${tx.qty}</td>
        <td class="px-4 py-3.5 font-semibold text-slate-200">${tx.partyName || '--'}</td>
        <td class="px-4 py-3.5 font-mono text-slate-300">${tx.partyContact || '--'}</td>
        <td class="px-4 py-3.5 text-[11px] text-slate-400 max-w-xs truncate">${tx.partyAddress || '--'}</td>
        <td class="px-4 py-3.5 font-mono font-semibold text-sky-400">${tx.invoiceNumber || '--'}</td>
        <td class="px-4 py-3.5 text-right font-mono text-slate-300">₹${(Number(tx.unitPrice) || 0).toLocaleString("en-IN")}</td>
        <td class="px-4 py-3.5 text-right font-mono font-bold text-amber-400">₹${(Number(tx.totalAmount) || 0).toLocaleString("en-IN")}</td>
        <td class="px-4 py-3.5 text-center">
          <button onclick="openChallanModal('${tx.id}')" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg text-xs font-semibold border border-slate-700 transition" title="Print Challan">
            <i class="fa-solid fa-print"></i> Slip
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

// ================= 10. LOW STOCK & REORDER CENTER =================
function renderLowStockTable() {
  const tbody = document.getElementById("lowStockTableBody");
  const lowItems = currentItems.filter(item => {
    const stock = Number(item.currentStock) || 0;
    const min = Number(item.minStock) || 2;
    return stock <= min;
  });

  if (lowItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-emerald-400 font-semibold"><i class="fa-solid fa-circle-check text-xl mb-2 block"></i> All inventory stock levels are healthy! No reorders needed at this moment.</td></tr>`;
    return;
  }

  tbody.innerHTML = lowItems.map(item => {
    const stock = Number(item.currentStock) || 0;
    const min = Number(item.minStock) || 2;
    const shortage = min - stock;

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="px-5 py-3.5 font-mono font-bold text-amber-400">${item.sku}</td>
        <td class="px-5 py-3.5 font-semibold text-white">${item.name}</td>
        <td class="px-5 py-3.5 text-slate-400">${item.category}</td>
        <td class="px-5 py-3.5 font-mono text-slate-300">${item.location}</td>
        <td class="px-5 py-3.5 text-center font-mono font-bold text-slate-300">${min} Units</td>
        <td class="px-5 py-3.5 text-center font-mono font-extrabold ${stock <= 0 ? 'text-rose-400' : 'text-amber-400'}">${stock} Units</td>
        <td class="px-5 py-3.5 text-center font-mono font-bold text-rose-400">${shortage > 0 ? `+${shortage} Shortage` : 'Critical (0)'}</td>
        <td class="px-5 py-3.5 text-center">
          <button onclick="quickStockInOut('${item.sku}', 'IN')" class="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 mx-auto">
            <i class="fa-solid fa-arrow-down"></i> Stock IN Reorder
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

function generateWhatsAppReorder() {
  const lowItems = currentItems.filter(i => (Number(i.currentStock) || 0) <= (Number(i.minStock) || 2));
  if (lowItems.length === 0) {
    Swal.fire({ icon: "info", title: "No Low Stock Items", text: "Inventory is completely stocked.", background: "#0f172a", color: "#fff" });
    return;
  }

  let text = `*🚨 URGENT INVENTORY REORDER LIST - ${companySettings.name}*\nDate: ${new Date().toLocaleDateString("en-IN")}\n\n`;
  lowItems.forEach((item, idx) => {
    const stock = Number(item.currentStock) || 0;
    const min = Number(item.minStock) || 2;
    text += `${idx + 1}. *${item.name}* (SKU: ${item.sku})\n   - Current Stock: ${stock} Units | Min Required: ${min} Units\n   - Suggested Order: *${min * 2 - stock} Units*\n\n`;
  });

  text += `Please arrange quotation & fastest dispatch.`;

  navigator.clipboard.writeText(text);
  Swal.fire({
    icon: "success",
    title: "Reorder List Copied to Clipboard!",
    html: `<p class="text-xs text-slate-300 mb-3">You can paste this directly into WhatsApp for your suppliers.</p><pre class="p-3 bg-slate-950 text-emerald-400 text-xs text-left rounded-xl overflow-x-auto">${text}</pre>`,
    background: "#0f172a",
    color: "#fff",
    confirmButtonColor: "#10b981",
    confirmButtonText: "Open WhatsApp Web"
  }).then(res => {
    if (res.isConfirmed) {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
    }
  });
}

// ================= 11. EXCEL IMPORT & EXPORT (SheetJS) =================
function exportInventoryExcel() {
  if (currentItems.length === 0) {
    Swal.fire({ icon: "warning", title: "No Data", text: "Add items first before exporting.", background: "#0f172a", color: "#fff" });
    return;
  }

  const exportData = currentItems.map(item => ({
    "SKU ID": item.sku,
    "Item Code / Number": item.itemNumber || "",
    "Item Name": item.name,
    "Category": item.category || "General",
    "Warehouse Location": item.location || "",
    "Opening Stock": item.openingStock || 0,
    "Total Stock IN": item.totalIn || 0,
    "Total Stock OUT": item.totalOut || 0,
    "Current Available Stock": item.currentStock || 0,
    "Min Stock Threshold": item.minStock || 2,
    "Cost Price (INR)": item.costPrice || 0,
    "Selling Price (INR)": item.sellingPrice || 0,
    "Total Valuation (INR)": (item.currentStock || 0) * (item.costPrice || 0),
    "Description & Specs": item.description || ""
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory_Master");

  const fileName = `Inventory_Master_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(workbook, fileName);

  Swal.fire({
    icon: "success",
    title: "Excel Exported!",
    text: `Saved as ${fileName}`,
    background: "#0f172a",
    color: "#fff",
    timer: 2000
  });
}

function exportTransactionsExcel() {
  if (currentTransactions.length === 0) {
    Swal.fire({ icon: "warning", title: "No Transactions", text: "No transaction history to export.", background: "#0f172a", color: "#fff" });
    return;
  }

  const exportData = currentTransactions.map(tx => ({
    "Transaction ID": tx.id,
    "Date & Time": new Date(tx.date).toLocaleString("en-IN"),
    "Type": tx.type,
    "SKU": tx.sku,
    "Item Name": tx.itemName,
    "Quantity": tx.qty,
    "Party Name (Customer/Supplier)": tx.partyName || "",
    "Contact Phone": tx.partyContact || "",
    "Address": tx.partyAddress || "",
    "Invoice / Challan No": tx.invoiceNumber || "",
    "Rate Per Unit (INR)": tx.unitPrice || 0,
    "Total Amount (INR)": tx.totalAmount || 0,
    "Notes": tx.notes || ""
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Stock_Transactions_Ledger");

  const fileName = `Stock_Ledger_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(workbook, fileName);

  Swal.fire({
    icon: "success",
    title: "Ledger Exported!",
    text: `Saved as ${fileName}`,
    background: "#0f172a",
    color: "#fff",
    timer: 2000
  });
}

function downloadSampleExcelTemplate() {
  const sampleTemplate = [
    {
      "SKU ID": "CMP-SCREW-50HP",
      "Item Code / Number": "AT-50-SC",
      "Item Name": "50 HP Rotary Screw Compressor VFD",
      "Category": "Screw Air Compressors",
      "Warehouse Location": "Warehouse A - Rack 4",
      "Opening Stock": 4,
      "Min Stock Threshold": 2,
      "Cost Price (INR)": 550000,
      "Selling Price (INR)": 720000,
      "Description & Specs": "240 CFM @ 10 Bar, Permanent magnet VFD energy saver"
    },
    {
      "SKU ID": "PIP-ALU-25MM",
      "Item Code / Number": "PIP-25",
      "Item Name": "25mm Aluminum Air Pipe (4M)",
      "Category": "Air Piping & Fittings",
      "Warehouse Location": "Pipe Rack 2",
      "Opening Stock": 80,
      "Min Stock Threshold": 20,
      "Cost Price (INR)": 850,
      "Selling Price (INR)": 1350,
      "Description & Specs": "High flow smooth bore piping"
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleTemplate);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory_Template");

  XLSX.writeFile(workbook, "Apex_Inventory_Import_Template.xlsx");
}

function handleExcelImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet);

      if (rows.length === 0) {
        Swal.fire({ icon: "error", title: "Empty File", text: "No rows found in Excel sheet.", background: "#0f172a", color: "#fff" });
        return;
      }

      let importedCount = 0;
      for (const row of rows) {
        // Map headers flexibly
        const sku = String(row["SKU ID"] || row["SKU"] || row["sku"] || ("ITEM-" + Math.floor(1000 + Math.random() * 9000))).trim();
        const existing = currentItems.find(i => i.sku === sku);

        const openingStock = Number(row["Opening Stock"] || row["Opening"] || row["Stock"] || 0);
        const totalIn = existing ? (Number(existing.totalIn) || 0) : 0;
        const totalOut = existing ? (Number(existing.totalOut) || 0) : 0;
        const currentStock = openingStock + totalIn - totalOut;

        const item = {
          sku: sku,
          itemNumber: String(row["Item Code / Number"] || row["Item Code"] || row["Part No"] || ""),
          name: String(row["Item Name"] || row["Name"] || "Unnamed Item"),
          category: String(row["Category"] || "General"),
          location: String(row["Warehouse Location"] || row["Location"] || "Warehouse"),
          openingStock: openingStock,
          totalIn: totalIn,
          totalOut: totalOut,
          currentStock: currentStock,
          minStock: Number(row["Min Stock Threshold"] || row["Min Stock"] || 2),
          costPrice: Number(row["Cost Price (INR)"] || row["Cost Price"] || row["Cost"] || 0),
          sellingPrice: Number(row["Selling Price (INR)"] || row["Selling Price"] || row["Price"] || 0),
          description: String(row["Description & Specs"] || row["Description"] || ""),
          updatedDate: new Date().toISOString()
        };

        await dbPut("items", item);
        importedCount++;
      }

      await refreshAllData();
      Swal.fire({
        icon: "success",
        title: "Excel Import Successful!",
        text: `Successfully imported / updated ${importedCount} items into the database.`,
        background: "#0f172a",
        color: "#fff",
        confirmButtonColor: "#f59e0b"
      });

      // Clear input
      e.target.value = "";
    } catch (err) {
      console.error("Import error:", err);
      Swal.fire({ icon: "error", title: "Import Failed", text: err.message, background: "#0f172a", color: "#fff" });
    }
  };
  reader.readAsArrayBuffer(file);
}

// ================= 12. BARCODE & LABEL GENERATOR =================
function renderBarcodes() {
  const container = document.getElementById("barcodeGridContainer");
  if (!container) return;

  if (currentItems.length === 0) {
    container.innerHTML = `<div class="col-span-full p-8 text-center text-slate-500">No items available to generate barcodes.</div>`;
    return;
  }

  container.innerHTML = currentItems.map((item, idx) => `
    <div class="p-4 rounded-xl bg-white text-slate-900 border border-slate-200 shadow-md flex flex-col items-center justify-between text-center">
      <div class="w-full text-left border-b border-slate-200 pb-2 mb-2">
        <h4 class="font-bold text-xs truncate">${item.name}</h4>
        <div class="flex justify-between text-[10px] text-slate-500 font-mono mt-0.5 gap-2">
          <span>Item No: ${item.itemNumber || "-"}</span>
          <span>Loc: ${item.location || "-"}</span>
        </div>
        <div class="mt-1 text-[10px] text-slate-500 font-mono">SKU: ${item.sku}</div>
      </div>
      <div class="my-2">
        <svg id="barcode-${idx}"></svg>
      </div>
      <div class="w-full text-center text-[10px] text-slate-700 font-mono font-semibold border-t border-slate-100 pt-1">
        ${item.itemNumber ? `Item No: ${item.itemNumber}` : `SKU: ${item.sku}`}
      </div>
      <div class="w-full text-right text-[11px] font-bold text-slate-900 pt-1">
        MRP: ₹${(item.sellingPrice || 0).toLocaleString("en-IN")}
      </div>
    </div>
  `).join("");

  setTimeout(() => {
    currentItems.forEach((item, idx) => {
      try {
        JsBarcode(`#barcode-${idx}`, item.sku, {
          format: "CODE128",
          width: 1.6,
          height: 42,
          displayValue: true,
          fontSize: 11,
          margin: 0,
          textMargin: 2
        });
      } catch (e) {
        console.error("Barcode render error:", e);
      }
    });
  }, 100);
}

function printBarcodeLabels() {
  const view = document.getElementById("view-barcodes");
  if (!view) return;

  view.classList.remove("hidden");
  switchTab("barcodes");
  setTimeout(() => window.print(), 150);
}

// ================= 13. SETTINGS & DISASTER RECOVERY =================
async function loadSettings() {
  const stored = await dbGetAll("settings");
  if (stored && stored.length > 0) {
    stored.forEach(s => {
      if (s.key === "company") companySettings = { ...companySettings, ...s.value };
    });
  }

  // Populate UI inputs
  if (document.getElementById("settingCompanyName")) {
    document.getElementById("settingCompanyName").value = companySettings.name;
    document.getElementById("settingGST").value = companySettings.gst;
    document.getElementById("settingPhone").value = companySettings.phone;
    document.getElementById("settingEmail").value = companySettings.email;
    document.getElementById("settingAddress").value = companySettings.address;
    document.getElementById("companyNameDisplay").textContent = companySettings.name;
  }
}

async function saveCompanySettings() {
  companySettings = {
    name: document.getElementById("settingCompanyName").value.trim(),
    gst: document.getElementById("settingGST").value.trim(),
    phone: document.getElementById("settingPhone").value.trim(),
    email: document.getElementById("settingEmail").value.trim(),
    address: document.getElementById("settingAddress").value.trim(),
    currency: "₹"
  };

  await dbPut("settings", { key: "company", value: companySettings });
  document.getElementById("companyNameDisplay").textContent = companySettings.name;

  Swal.fire({
    icon: "success",
    title: "Settings Saved",
    text: "Company details updated for Challans & Invoices.",
    background: "#0f172a",
    color: "#fff",
    timer: 2000
  });
}

async function exportDatabaseJSON() {
  const allItems = await dbGetAll("items");
  const allTransactions = await dbGetAll("transactions");
  const allSettings = await dbGetAll("settings");

  const fullBackup = {
    version: "1.0",
    exportDate: new Date().toISOString(),
    items: allItems,
    transactions: allTransactions,
    settings: allSettings
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(fullBackup, null, 2));
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `ApexInventory_Backup_${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();

  Swal.fire({
    icon: "success",
    title: "Backup Downloaded",
    text: "Your complete inventory database JSON backup is saved safely.",
    background: "#0f172a",
    color: "#fff",
    timer: 2500
  });
}

async function restoreDatabaseJSON(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const backup = JSON.parse(e.target.result);
      if (!backup.items || !Array.isArray(backup.items)) {
        throw new Error("Invalid database backup file structure.");
      }

      for (const item of backup.items) {
        await dbPut("items", item);
      }
      if (backup.transactions) {
        for (const tx of backup.transactions) {
          await dbPut("transactions", tx);
        }
      }
      if (backup.settings) {
        for (const s of backup.settings) {
          await dbPut("settings", s);
        }
      }

      await loadSettings();
      await refreshAllData();

      Swal.fire({
        icon: "success",
        title: "Database Restored!",
        text: `Restored ${backup.items.length} items and transaction logs successfully.`,
        background: "#0f172a",
        color: "#fff",
        confirmButtonColor: "#f59e0b"
      });
      event.target.value = "";
    } catch (err) {
      Swal.fire({ icon: "error", title: "Restore Failed", text: err.message, background: "#0f172a", color: "#fff" });
    }
  };
  reader.readAsText(file);
}

async function clearAllDatabaseData() {
  const result = await Swal.fire({
    title: "Wipe All Inventory & Stock Data?",
    text: "This will remove all items and transaction history so you can start with a fresh real inventory. (You can download a backup first if needed).",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
    cancelButtonColor: "#334155",
    confirmButtonText: "Yes, Clear Everything",
    background: "#0f172a",
    color: "#f8fafc"
  });

  if (result.isConfirmed) {
    await dbClear("items");
    await dbClear("transactions");
    await refreshAllData();
    Swal.fire({
      icon: "success",
      title: "Database Cleared!",
      text: "All demo data removed. Your inventory is now completely fresh and ready for real operations.",
      background: "#0f172a",
      color: "#f8fafc",
      confirmButtonColor: "#f59e0b"
    });
  }
}

async function resetSampleDemoData() {
  const res = await Swal.fire({
    title: "Load Sample Compressor Data?",
    text: "This will populate sample compressor SKUs & transactions for testing.",
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Load Demo Data",
    background: "#0f172a",
    color: "#fff"
  });

  if (res.isConfirmed) {
    await seedDefaultDataIfEmpty();
    await refreshAllData();
    Swal.fire({ icon: "success", title: "Loaded Demo Data", background: "#0f172a", color: "#fff", timer: 1500 });
  }
}

// Global Quick Search
function handleGlobalSearch(val) {
  if (!val) return;
  switchTab("inventory");
  const searchInput = document.getElementById("inventorySearch");
  if (searchInput) {
    searchInput.value = val;
    renderInventoryTable();
  }
}
