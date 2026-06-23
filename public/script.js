const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
const DB_KEY = 'pickaBurgerPOS_v6_phase6';
const BUILD_BURGER_BASE_PRICE_KEY = 'pickaBuildBurgerBasePrice';
const SESSION_KEY = 'pickaBurgerCurrentUser';
const OLD_DB_KEY = 'pickaBurgerPOS';
const PREVIOUS_DB_KEYS = ['pickaBurgerPOS_v5_phase5', 'pickaBurgerPOS_v5_phase4', OLD_DB_KEY];
const USE_ANDROID_SQLITE = typeof AndroidDatabase !== 'undefined';
const IS_HOSTED_FROM_SERVER = location.protocol === 'http:' || location.protocol === 'https:';
let serverCache = null;
let rawPurchaseCart = [];

function getServerUrl() {
  if (IS_HOSTED_FROM_SERVER) return location.origin;
  const saved = localStorage.getItem('pickaBurgerServerUrl') || '';
  return saved.trim().replace(/\/$/, '');
}

function isServerSyncEnabled() {
  return !!getServerUrl();
}

let cart = [];
let selectedBurgerItems = [];
let pendingComboItem = null;
const DEFAULT_BUILD_BURGER_BASE_PRICE = 50;
const BUILD_BURGER_VEGETABLE_FREE_LIMIT = 2;
const BUILD_BURGER_BASE_INGREDIENTS = ['Buns', 'Patty'];
const BUILD_BURGER_PREMIUM_FREE_LIMIT = 1;
const DEFAULT_BUILD_BURGER_PREMIUM_ADDONS = ['egg', 'bacon', 'cheese', 'sliced cheese'];
let currentUser = null;

function uid() {
  return (crypto && crypto.randomUUID) ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isTodayDate(value) {
  if (!value) return true;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  return d.toDateString() === new Date().toDateString();
}

function keepOnlyTodayRawPurchaseRecords(data) {
  const before = Array.isArray(data.rawDeliveries) ? data.rawDeliveries.length : 0;
  data.rawDeliveries = (Array.isArray(data.rawDeliveries) ? data.rawDeliveries : []).filter(item => isTodayDate(item.date));
  return before !== data.rawDeliveries.length;
}

function keepOnlyTodayRawWasteRecords(data) {
  const before = Array.isArray(data.rawWasteRecords) ? data.rawWasteRecords.length : 0;
  data.rawWasteRecords = (Array.isArray(data.rawWasteRecords) ? data.rawWasteRecords : []).filter(item => isTodayDate(item.date));
  return before !== data.rawWasteRecords.length;
}

const defaultData = {
  inventory: [
    { id: uid(), name: 'Buns', qty: 0, unitCost: 0 },
    { id: uid(), name: 'Patty', qty: 0, unitCost: 0 },
    { id: uid(), name: 'Sliced Cheese', qty: 0, unitCost: 0 },
    { id: uid(), name: 'Pickles', qty: 0, unitCost: 0 },
    { id: uid(), name: 'Onion', qty: 0, unitCost: 0 },
    { id: uid(), name: 'Tomato', qty: 0, unitCost: 0 },
    { id: uid(), name: 'Bacon', qty: 0, unitCost: 0 },
    { id: uid(), name: 'Egg', qty: 0, unitCost: 0 }
  ],
  menu: [
    { id: uid(), name: 'Combo A', price: 149, cost: 72, category: 'combo' },
    { id: uid(), name: 'Combo B', price: 179, cost: 88, category: 'combo' },
    { id: uid(), name: 'Combo C', price: 209, cost: 105, category: 'combo' },
    { id: uid(), name: 'Pickles', price: 10, cost: 3, category: 'burger' },
    { id: uid(), name: 'Onion', price: 10, cost: 4, category: 'burger' },
    { id: uid(), name: 'Coleslaw', price: 20, cost: 8, category: 'burger' },
    { id: uid(), name: 'Tomato', price: 15, cost: 5, category: 'burger' },
    { id: uid(), name: 'Sliced Cheese', price: 25, cost: 10, category: 'burger' },
    { id: uid(), name: 'Bacon', price: 45, cost: 18, category: 'burger' },
    { id: uid(), name: 'Egg', price: 30, cost: 10, category: 'burger' },
    { id: uid(), name: 'Regular Burger', price: 99, cost: 48, category: 'alaCarte' },
    { id: uid(), name: 'Fries', price: 59, cost: 22, category: 'alaCarte' },
    { id: uid(), name: 'Iced Tea', price: 39, cost: 12, category: 'drink' }
  ],
  rawDeliveries: [
    { id: uid(), productName: 'Buns', qty: 100, unitPrice: 8, deliveryFee: 80, totalMaterialCost: 800, totalExpense: 880, date: new Date().toISOString() },
    { id: uid(), productName: 'Patty', qty: 80, unitPrice: 35, deliveryFee: 120, totalMaterialCost: 2800, totalExpense: 2920, date: new Date().toISOString() }
  ],
  rawWasteRecords: [],
  orders: [],
  users: [
    { id: uid(), fullName: 'Default Administrator', username: 'admin', password: 'admin123', role: 'admin', status: 'approved', createdAt: new Date().toISOString() },
    { id: uid(), fullName: 'Default Cashier', username: 'cashier', password: 'cashier123', role: 'cashier', status: 'approved', createdAt: new Date().toISOString() }
  ],
  monthlyInventoryCounts: [],
  settings: {
    buildBurgerBasePrice: DEFAULT_BUILD_BURGER_BASE_PRICE
  }
};

function normalizeData(data) {
  data = data || {};
  data.inventory = Array.isArray(data.inventory) ? data.inventory : [];
  data.menu = Array.isArray(data.menu) ? data.menu : [];
  data.rawDeliveries = Array.isArray(data.rawDeliveries) ? data.rawDeliveries : [];
  data.rawWasteRecords = Array.isArray(data.rawWasteRecords) ? data.rawWasteRecords : [];
  data.orders = Array.isArray(data.orders) ? data.orders : [];
  data.users = Array.isArray(data.users) ? data.users : [];
  if (!data.users.some(user => user.username === 'admin')) {
    data.users.unshift({ id: uid(), fullName: 'Default Administrator', username: 'admin', password: 'admin123', role: 'admin', status: 'approved', createdAt: new Date().toISOString() });
  }
  data.users = data.users.map(user => ({
    id: user.id || uid(),
    fullName: user.fullName || user.name || user.username || 'User',
    username: (user.username || '').trim(),
    password: user.password || '',
    role: user.role === 'admin' ? 'admin' : 'cashier',
    status: user.status || 'pending',
    createdAt: user.createdAt || new Date().toISOString(),
    approvedAt: user.approvedAt || ''
  })).filter(user => user.username);
  data.monthlyInventoryCounts = Array.isArray(data.monthlyInventoryCounts) ? data.monthlyInventoryCounts : [];
  data.settings = data.settings && typeof data.settings === 'object' ? data.settings : {};
  data.settings.buildBurgerBasePrice = Number(data.settings.buildBurgerBasePrice ?? DEFAULT_BUILD_BURGER_BASE_PRICE);
  if (Number.isNaN(data.settings.buildBurgerBasePrice) || data.settings.buildBurgerBasePrice < 0) data.settings.buildBurgerBasePrice = DEFAULT_BUILD_BURGER_BASE_PRICE;

  data.inventory = data.inventory.map(item => ({
    id: item.id || uid(),
    name: item.name || 'Unnamed',
    qty: Number(item.qty || 0),
    unitCost: Number(item.unitCost || item.cost || 0)
  }));

  data.menu = data.menu.map(item => {
    const name = item.name || 'Unnamed';
    let category = item.category || 'alaCarte';
    if ((!item.category || category === 'alaCarte') && /drink|tea|soda|coke|sprite|royal|water|juice/i.test(name)) category = 'drink';
    return {
      id: item.id || uid(),
      name,
      price: Number(item.price || 0),
      cost: Number(item.cost || 0),
      upsizeCharge: Number(item.upsizeCharge || item.extraCharge || item.comboExtraCharge || item.upsizeCost || 0),
      variants: Array.isArray(item.variants) ? item.variants.map(variant => ({
        id: variant.id || uid(),
        name: variant.name || variant.size || 'Regular',
        price: Number(variant.price || 0),
        cost: Number(variant.cost || 0),
        upsizeCharge: Number(variant.upsizeCharge || variant.extraCharge || 0)
      })) : [],
      category,
      isPremiumAddon: typeof item.isPremiumAddon === 'boolean'
        ? item.isPremiumAddon
        : (category === 'burger' && DEFAULT_BUILD_BURGER_PREMIUM_ADDONS.includes(String(name).trim().toLowerCase())),
      recipe: Array.isArray(item.recipe) ? item.recipe.map(ingredient => ({
        inventoryId: ingredient.inventoryId || ingredient.id || '',
        name: ingredient.name || ingredient.productName || '',
        qty: Number(ingredient.qty || ingredient.quantity || 0)
      })).filter(ingredient => ingredient.inventoryId && ingredient.qty > 0) : []
    };
  });



  const rawByName = name => data.inventory.find(inv => inv.name.toLowerCase() === name.toLowerCase());
  const defaultRecipeNames = {
    'Combo A': ['Buns', 'Patty'],
    'Combo B': ['Buns', 'Patty', 'Sliced Cheese'],
    'Combo C': ['Buns', 'Patty', 'Sliced Cheese', 'Bacon'],
    'Regular Burger': ['Buns', 'Patty'],
    'Pickles': ['Pickles'],
    'Onion': ['Onion'],
    'Tomato': ['Tomato'],
    'Sliced Cheese': ['Sliced Cheese'],
    'Cheese': ['Sliced Cheese'],
    'Bacon': ['Bacon'],
    'Egg': ['Egg']
  };
  data.menu.forEach(menuItem => {
    if ((menuItem.recipe || []).length) return;
    const names = defaultRecipeNames[menuItem.name];
    if (!names) return;
    menuItem.recipe = names.map(name => {
      const material = rawByName(name);
      return material ? { inventoryId: material.id, name: material.name, qty: 1 } : null;
    }).filter(Boolean);
  });

  data.menu.forEach(menuItem => {
    if ((menuItem.recipe || []).length) menuItem.cost = calculateRecipeCost(menuItem.recipe, data);
  });

  data.rawDeliveries = data.rawDeliveries.map(item => {
    const qty = Number(item.qty || item.inventoryQty || 0);
    const unitPrice = Number(item.unitPrice || item.rawMaterialPrice || item.price || 0);
    const deliveryFee = Number(item.deliveryFee || item.fee || 0);
    const purchaseUnit = item.purchaseUnit || item.unitType || 'piece';
    const packageQty = Number(item.packageQty || item.purchaseQty || qty || 0);
    const piecesPerPack = Number(item.piecesPerPack || item.piecesPerPackage || 1);
    const inventoryQty = Number(item.inventoryQty || qty || 0);
    const totalMaterialCost = Number(item.totalMaterialCost || (packageQty * unitPrice));
    return {
      id: item.id || uid(),
      purchaseId: item.purchaseId || '',
      productName: item.productName || item.name || 'Raw Material',
      qty,
      inventoryQty,
      purchaseUnit,
      packageQty,
      piecesPerPack,
      unitPrice,
      unitCost: Number(item.unitCost || (inventoryQty > 0 ? totalMaterialCost / inventoryQty : unitPrice)),
      deliveryFee,
      totalMaterialCost,
      totalExpense: Number(item.totalExpense || (totalMaterialCost + deliveryFee)),
      date: item.date || new Date().toISOString()
    };
  });

  data.rawWasteRecords = data.rawWasteRecords.map(item => {
    const qty = Number(item.qty || 0);
    const unitCost = Number(item.unitCost || 0);
    return {
      id: item.id || uid(),
      inventoryId: item.inventoryId || '',
      productName: item.productName || item.name || 'Raw Material',
      qty,
      unitCost,
      totalCost: Number(item.totalCost || (qty * unitCost)),
      reason: item.reason || '',
      date: item.date || new Date().toISOString()
    };
  });

  // Ensure every completed order has a daily customer number for receipts and reports.
  const orderCountersByDate = {};
  data.orders = data.orders.map((order, index) => {
    const key = orderDateKey(order.date || new Date());
    orderCountersByDate[key] = orderCountersByDate[key] || 0;
    const savedNumber = Number(order.customerNumber || order.customerNo || 0);
    const customerNumber = savedNumber > 0 ? savedNumber : (orderCountersByDate[key] + 1);
    orderCountersByDate[key] = Math.max(orderCountersByDate[key], customerNumber);
    return {
      ...order,
      id: order.id || uid(),
      customerNumber,
      customerNumberLabel: order.customerNumberLabel || formatCustomerNumber(customerNumber),
      date: order.date || new Date().toISOString(),
      items: Array.isArray(order.items) ? order.items : []
    };
  });

  ensurePhase5BurgerAddOns(data);
  keepOnlyTodayRawPurchaseRecords(data);
  keepOnlyTodayRawWasteRecords(data);
  return data;
}

function isPremiumBurgerAddOn(item) {
  return !!item?.isPremiumAddon;
}

function getBuildBurgerBasePrice(data = getData()) {
  const savedSetting = Number(data?.settings?.buildBurgerBasePrice);
  if (Number.isFinite(savedSetting) && savedSetting >= 0) return savedSetting;

  const localBackup = Number(localStorage.getItem(BUILD_BURGER_BASE_PRICE_KEY));
  if (Number.isFinite(localBackup) && localBackup >= 0) return localBackup;

  return DEFAULT_BUILD_BURGER_BASE_PRICE;
}

function saveBuildBurgerBasePrice(showAlert = true) {
  const input = document.getElementById('buildBurgerBasePriceInput');
  const status = document.getElementById('buildBurgerBasePriceStatus');
  const rawValue = (input?.value ?? '').toString().trim();
  const price = Number(rawValue);

  if (!rawValue || !Number.isFinite(price) || price < 0) {
    if (status) status.textContent = 'Please enter a valid price.';
    if (showAlert) alert("Please enter a valid Build'a Burger base price.");
    return false;
  }

  const roundedPrice = Math.round(price * 100) / 100;
  const data = getData();
  data.settings = data.settings && typeof data.settings === 'object' ? data.settings : {};
  data.settings.buildBurgerBasePrice = roundedPrice;

  // Save in every storage layer used by the app so the POS menu, server mode, Android mode, and local browser mode all use the same price.
  localStorage.setItem(BUILD_BURGER_BASE_PRICE_KEY, String(roundedPrice));
  saveData(data);

  const savedData = getData();
  const savedPrice = getBuildBurgerBasePrice(savedData);
  if (input) input.value = savedPrice.toFixed(2).replace(/\.00$/, '');
  if (status) status.textContent = `Saved: ${peso.format(savedPrice)}`;

  // Re-render the POS menu note and Build'a Burger card immediately after saving.
  renderMenu();
  renderCart();
  renderBuildBurgerSettings();

  if (showAlert) alert(`Build'a Burger base price updated to ${peso.format(savedPrice)}.`);
  return true;
}

function renderBuildBurgerSettings() {
  const input = document.getElementById('buildBurgerBasePriceInput');
  if (!input) return;
  const value = getBuildBurgerBasePrice();
  if (document.activeElement !== input) input.value = Number(value.toFixed(2));
}


function wireBuildBurgerBasePriceControls() {
  const input = document.getElementById('buildBurgerBasePriceInput');
  const button = document.getElementById('saveBuildBurgerBasePriceBtn');
  if (button && !button.dataset.bound) {
    button.dataset.bound = 'true';
    button.addEventListener('click', () => saveBuildBurgerBasePrice(true));
  }
  if (input && !input.dataset.bound) {
    input.dataset.bound = 'true';
    input.addEventListener('change', () => saveBuildBurgerBasePrice(false));
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') saveBuildBurgerBasePrice(true);
    });
  }
}

window.saveBuildBurgerBasePrice = saveBuildBurgerBasePrice;

function splitBurgerAddOnsByCharge(selectedAddOns) {
  const freeAddOns = [];
  const chargedAddOns = [];
  let freePremiumCount = 0;
  let freeVegetableCount = 0;

  selectedAddOns.forEach(item => {
    const premium = isPremiumBurgerAddOn(item);
    const premiumFreeAvailable = premium && freePremiumCount < BUILD_BURGER_PREMIUM_FREE_LIMIT;
    const vegetableFreeAvailable = !premium && freeVegetableCount < BUILD_BURGER_VEGETABLE_FREE_LIMIT;

    if (premiumFreeAvailable || vegetableFreeAvailable) {
      freeAddOns.push(item);
      if (premium) freePremiumCount += 1;
      else freeVegetableCount += 1;
    } else {
      chargedAddOns.push(item);
    }
  });

  return { freeAddOns, chargedAddOns, freePremiumCount, freeVegetableCount };
}

function getSelectedBurgerAddOns(data = getData()) {
  return selectedBurgerItems
    .map(id => data.menu.find(item => item.id === id))
    .filter(Boolean);
}

function getBurgerAddOnQty(id) {
  return selectedBurgerItems.filter(selectedId => selectedId === id).length;
}

function incrementBurgerItem(id) {
  selectedBurgerItems.push(id);
  renderMenu();
}

function decrementBurgerItem(id) {
  const index = selectedBurgerItems.lastIndexOf(id);
  if (index !== -1) selectedBurgerItems.splice(index, 1);
  renderMenu();
}

function ensurePhase5BurgerAddOns(data) {
  const cheeseExists = data.menu.some(item => item.category === 'burger' && /^(sliced\s+)?cheese$/i.test(item.name || ''));
  if (!cheeseExists) {
    const cheeseInventory = data.inventory.find(inv => /^(sliced\s+)?cheese$/i.test(inv.name || ''));
    data.menu.push({
      id: uid(),
      name: 'Sliced Cheese',
      price: 25,
      cost: cheeseInventory ? Number(cheeseInventory.unitCost || 0) : 0,
      upsizeCharge: 0,
      category: 'burger',
      recipe: cheeseInventory ? [{ inventoryId: cheeseInventory.id, name: cheeseInventory.name, qty: 1 }] : []
    });
  }
}

function serverRequest(method, url, body = null) {
  const xhr = new XMLHttpRequest();
  xhr.open(method, url, false);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.send(body ? JSON.stringify(body) : null);
  if (xhr.status >= 200 && xhr.status < 300) {
    return xhr.responseText ? JSON.parse(xhr.responseText) : null;
  }
  throw new Error(`Server request failed: ${xhr.status}`);
}

function getData() {
  if (isServerSyncEnabled()) {
    try {
      const response = serverRequest('GET', getServerUrl() + '/api/database');
      const originalRawDeliveryCount = Array.isArray((response.data || {}).rawDeliveries) ? response.data.rawDeliveries.length : 0;
      const originalDataText = JSON.stringify(response.data || defaultData);
      serverCache = normalizeData(response.data || defaultData);
      if (originalRawDeliveryCount !== serverCache.rawDeliveries.length || originalDataText !== JSON.stringify(serverCache)) {
        serverRequest('POST', getServerUrl() + '/api/database', { data: serverCache });
      }
      return serverCache;
    } catch (error) {
      alert('Cannot connect to laptop server database. Make sure the laptop server is running and both devices are on the same Wi-Fi.');
      return normalizeData(serverCache || defaultData);
    }
  }

  if (USE_ANDROID_SQLITE) {
    const raw = AndroidDatabase.getDatabase();
    if (!raw) {
      const startingData = JSON.parse(JSON.stringify(defaultData));
      AndroidDatabase.saveDatabase(JSON.stringify(startingData));
      return startingData;
    }
    const parsed = JSON.parse(raw);
    const originalDataText = JSON.stringify(parsed);
    const originalRawDeliveryCount = Array.isArray(parsed.rawDeliveries) ? parsed.rawDeliveries.length : 0;
    const normalized = normalizeData(parsed);
    if (originalRawDeliveryCount !== normalized.rawDeliveries.length || originalDataText !== JSON.stringify(normalized)) {
      AndroidDatabase.saveDatabase(JSON.stringify(normalized));
    }
    return normalized;
  }

  let raw = localStorage.getItem(DB_KEY);
  if (!raw) {
    for (const previousKey of PREVIOUS_DB_KEYS) {
      raw = localStorage.getItem(previousKey);
      if (raw) break;
    }
  }
  if (!raw) {
    const startingData = JSON.parse(JSON.stringify(defaultData));
    localStorage.setItem(DB_KEY, JSON.stringify(startingData));
    return startingData;
  }
  const parsed = JSON.parse(raw);
  const originalDataText = JSON.stringify(parsed);
  const originalRawDeliveryCount = Array.isArray(parsed.rawDeliveries) ? parsed.rawDeliveries.length : 0;
  const normalized = normalizeData(parsed);
  if (originalRawDeliveryCount !== normalized.rawDeliveries.length || originalDataText !== JSON.stringify(normalized)) {
    localStorage.setItem(DB_KEY, JSON.stringify(normalized));
  }
  return normalized;
}

function saveData(data) {
  const normalized = normalizeData(data);

  if (isServerSyncEnabled()) {
    serverRequest('POST', getServerUrl() + '/api/database', { data: normalized });
    serverCache = normalized;
    return;
  }

  if (USE_ANDROID_SQLITE) {
    AndroidDatabase.saveDatabase(JSON.stringify(normalized));
  } else {
    localStorage.setItem(DB_KEY, JSON.stringify(normalized));
  }
}

function userIsAdmin() { return currentUser && currentUser.role === 'admin'; }
function userIsCashier() { return currentUser && currentUser.role === 'cashier'; }

function requireLogin() {
  if (!currentUser) {
    showLoginScreen();
    return false;
  }
  return true;
}

function showScreen(id) {
  if (!requireLogin()) return;
  if (userIsCashier() && id !== 'homeScreen' && id !== 'posScreen') {
    alert('Cashier access is limited to the POS Menu only.');
    id = 'posScreen';
  }

  showProcessing('Loading...\nPlease wait');

  setTimeout(() => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
    renderAll();
    hideProcessing();
  }, 80);
}

function showLoginScreen() {
  const login = document.getElementById('loginScreen');
  const shell = document.getElementById('appShell');
  if (login) login.classList.remove('hidden');
  if (shell) shell.classList.add('hidden');
}

function showAppScreen() {
  const login = document.getElementById('loginScreen');
  const shell = document.getElementById('appShell');
  if (login) login.classList.add('hidden');
  if (shell) shell.classList.remove('hidden');
  showScreen(currentUser.role === 'cashier' ? 'posScreen' : 'homeScreen');
}

function showRegisterForm() {
  document.getElementById('loginForm').classList.add('hidden');
  document.getElementById('registerForm').classList.remove('hidden');
}

function showLoginForm() {
  document.getElementById('registerForm').classList.add('hidden');
  document.getElementById('loginForm').classList.remove('hidden');
}

function loginUser() {
  const username = (document.getElementById('loginUsername').value || '').trim();
  const password = document.getElementById('loginPassword').value || '';
  const data = getData();
  const user = data.users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);

  if (!user) {
    alert('Invalid username or password.');
    return;
  }

  if (user.status !== 'approved') {
    alert('This account is still pending admin approval.');
    return;
  }

  showProcessing('Logging in...\nPlease wait');

  setTimeout(() => {
    currentUser = { id: user.id, fullName: user.fullName, username: user.username, role: user.role };
    localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
    document.getElementById('loginPassword').value = '';
    showAppScreen();
    hideProcessing();
  }, 80);
}

function logoutUser() {
  currentUser = null;
  localStorage.removeItem(SESSION_KEY);
  cart = [];
  selectedBurgerItems = [];
  showLoginScreen();
}

function registerUser() {
  const fullName = (document.getElementById('registerFullName').value || '').trim();
  const username = (document.getElementById('registerUsername').value || '').trim();
  const password = document.getElementById('registerPassword').value || '';
  const role = document.getElementById('registerRole').value === 'admin' ? 'admin' : 'cashier';
  if (!fullName || !username || !password) return alert('Please complete full name, username, and password.');
  const data = getData();
  if (data.users.some(u => u.username.toLowerCase() === username.toLowerCase())) return alert('Username already exists.');
  data.users.push({ id: uid(), fullName, username, password, role, status: 'pending', createdAt: new Date().toISOString() });
  saveData(data);
  document.getElementById('registerFullName').value = '';
  document.getElementById('registerUsername').value = '';
  document.getElementById('registerPassword').value = '';
  showLoginForm();
  alert('Registration submitted. An admin must approve this user before login is allowed.');
}

function applyRoleAccess() {
  const label = document.getElementById('currentUserLabel');
  if (label) label.textContent = currentUser ? `${currentUser.fullName} · ${currentUser.role.toUpperCase()}` : 'Not logged in';
  document.querySelectorAll('.admin-only').forEach(el => { el.style.display = userIsAdmin() ? '' : 'none'; });
}

function bootAuth() {
  try { currentUser = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { currentUser = null; }
  getData();
  if (currentUser) showAppScreen(); else showLoginScreen();
}


function toggleMenuGroup(id) {
  document.getElementById(id).classList.toggle('open');
}


function renderServerSettings() {
  const input = document.getElementById('serverUrlInput');
  const mode = document.getElementById('serverModeText');
  if (!input || !mode) return;

  const url = getServerUrl();
  input.value = url;

  if (url) {
    mode.textContent = `Server Sync Enabled: ${url}`;
  } else {
    mode.textContent = USE_ANDROID_SQLITE ? 'Device SQLite Mode' : 'Browser Local Storage Mode';
  }
}

function saveServerUrl() {
  const input = document.getElementById('serverUrlInput');
  let url = (input.value || '').trim();

  if (!url) return alert('Please enter the laptop server URL.');

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'http://' + url;
  }

  url = url.replace(/\/$/, '');

  localStorage.setItem('pickaBurgerServerUrl', url);
  renderServerSettings();

  alert(`Server saved:\n${url}\n\nTesting connection is recommended.`);
}

function disableServerSync() {
  if (!confirm('Use this device only? This will disable laptop server sync on this device.')) return;
  localStorage.removeItem('pickaBurgerServerUrl');
  serverCache = null;
  renderServerSettings();
  renderAll();
  alert('Server sync disabled. This device will use its local database.');
}


function loadServerAppUi() {
  let url = getServerUrl();
  const input = document.getElementById('serverUrlInput');

  if (input && input.value.trim()) {
    url = input.value.trim();
  }

  if (!url) {
    return alert('Please enter and save the laptop server URL first.');
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'http://' + url;
  }

  url = url.replace(/\/$/, '');
  localStorage.setItem('pickaBurgerServerUrl', url);

  if (!confirm(`Open POS from laptop server?\n\n${url}\n\nThis allows future UI updates without rebuilding the APK as long as the laptop server files are updated.`)) {
    return;
  }

  location.href = url;
}

function testServerConnection() {
  const input = document.getElementById('serverUrlInput');
  let url = (input.value || '').trim();

  if (!url) url = getServerUrl();
  if (!url) return alert('Please enter a server URL first.');

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'http://' + url;
  }

  url = url.replace(/\/$/, '');

  try {
    const response = serverRequest('GET', url + '/api/database');
    localStorage.setItem('pickaBurgerServerUrl', url);
    serverCache = normalizeData(response.data || defaultData);
    renderServerSettings();
    renderAll();
    alert(`Connection successful.\nUsing server database:\n${url}`);
  } catch (error) {
    alert(`Cannot connect to server:\n${url}\n\nCheck:\n1. Laptop server.py is running.\n2. Android and laptop are on the same network.\n3. Windows Firewall allows port 8080.\n4. The IP address is correct.`);
  }
}

function renderAll() {
  renderDashboard();
  renderMonthlyInventory();
  renderRawWasteFinancial();
  renderInventory();
  renderMenu();
  renderCart();
  renderAdminSummaryCards();
  renderAdminMenu();
  renderMenuRecipeBuilder();
  renderBuildBurgerSettings();
  wireBuildBurgerBasePriceControls();
  renderRawMaterialDeliveryProducts();
  renderAdminCurrentInventory();
  renderRawMasterList();
  renderRawMaterialDeliveries();
  renderRawPurchaseCart();
  handleRawPurchaseUnitChange();
  renderUserAdmin();
  renderAdminDrinks();
  applyRoleAccess();
}

function inventoryValue(data) {
  return data.inventory.reduce((sum, item) => sum + (Number(item.qty) * Number(item.unitCost)), 0);
}

function todayOrders(data) {
  const now = new Date();
  return activeOrders(data.orders).filter(order => new Date(order.date).toDateString() === now.toDateString());
}

function isOrderVoided(order) {
  return order?.status === 'voided' || !!order?.voidedAt;
}

function activeOrders(orders) {
  return (Array.isArray(orders) ? orders : []).filter(order => !isOrderVoided(order));
}

function monthOrders(data) {
  const now = new Date();
  return activeOrders(data.orders).filter(order => {
    const d = new Date(order.date);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
}

function orderCost(order) {
  return Number(order.cost || 0);
}

function orderProfit(order) {
  return Number(order.profit || (Number(order.total || 0) - orderCost(order)));
}

function rawDeliveriesForRange(data, range) {
  const now = new Date();
  return (data.rawDeliveries || []).filter(item => {
    const d = new Date(item.date);
    if (Number.isNaN(d.getTime())) return false;
    if (range === 'today') return d.toDateString() === now.toDateString();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
}

function rawWasteForRange(data, range) {
  const now = new Date();
  return (data.rawWasteRecords || []).filter(item => {
    const d = new Date(item.date);
    if (Number.isNaN(d.getTime())) return false;
    if (range === 'today') return d.toDateString() === now.toDateString();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
}

function dashboardTotals(orders, data, range = 'today') {
  const rawRecords = rawDeliveriesForRange(data, range);
  const wasteRecords = rawWasteForRange(data, range);
  const sales = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const foodCost = orders.reduce((sum, order) => sum + orderCost(order), 0);
  const materialExpenses = rawRecords.reduce((sum, item) => sum + Number(item.totalMaterialCost || 0), 0);
  const deliveryFeeExpenses = rawRecords.reduce((sum, item) => sum + Number(item.deliveryFee || 0), 0);
  const rawPurchaseExpenses = rawRecords.reduce((sum, item) => sum + Number(item.totalExpense || 0), 0);
  const wasteExpenses = wasteRecords.reduce((sum, item) => sum + Number(item.totalCost || 0), 0);
  const totalExpenses = foodCost + rawPurchaseExpenses + wasteExpenses;
  const profit = sales - totalExpenses;
  return { sales, foodCost, materialExpenses, deliveryFeeExpenses, rawPurchaseExpenses, wasteExpenses, totalExpenses, profit, ordersCount: orders.length, rawRecordsCount: rawRecords.length, wasteRecordsCount: wasteRecords.length };
}

function dashboardHtml(orders, data, range = 'today') {
  const totals = dashboardTotals(orders, data, range);
  return `
    <div class="dash-card"><small>Orders</small><strong>${totals.ordersCount}</strong></div>
    <div class="dash-card"><small>Sales</small><strong>${peso.format(totals.sales)}</strong></div>
    <div class="dash-card"><small>Food Cost</small><strong>${peso.format(totals.foodCost)}</strong></div>
    <div class="dash-card"><small>Raw Material Expenses</small><strong>${peso.format(totals.materialExpenses)}</strong></div>
    <div class="dash-card"><small>Delivery Fee Expenses</small><strong>${peso.format(totals.deliveryFeeExpenses)}</strong></div>
    <div class="dash-card"><small>Total Expenses</small><strong>${peso.format(totals.totalExpenses)}</strong></div>
    <div class="dash-card"><small>Estimated Profit</small><strong>${peso.format(totals.profit)}</strong></div>
    <div class="dash-card"><small>Inventory Value</small><strong>${peso.format(inventoryValue(data))}</strong></div>
  `;
}

function renderDashboardExpenseList(data) {
  const el = document.getElementById('dashboardExpenseList');
  if (!el) return;
  const today = dashboardTotals(todayOrders(data), data, 'today');
  const month = dashboardTotals(monthOrders(data), data, 'month');
  el.innerHTML = `
    <div class="list-row expense-breakdown-row"><div><strong>Today</strong><br><small>Food Cost: ${peso.format(today.foodCost)} · Raw Materials: ${peso.format(today.materialExpenses)} · Delivery Fee: ${peso.format(today.deliveryFeeExpenses)} · Waste: ${peso.format(today.wasteExpenses)} · Total Expenses: ${peso.format(today.totalExpenses)}</small></div></div>
    <div class="list-row expense-breakdown-row"><div><strong>This Month</strong><br><small>Food Cost: ${peso.format(month.foodCost)} · Raw Materials: ${peso.format(month.materialExpenses)} · Delivery Fee: ${peso.format(month.deliveryFeeExpenses)} · Waste: ${peso.format(month.wasteExpenses)} · Total Expenses: ${peso.format(month.totalExpenses)}</small></div></div>
  `;
}

function renderDashboard() {
  const data = getData();
  const home = document.getElementById('dashboardCards');
  const financial = document.getElementById('financialCards');
  const todayFull = document.getElementById('todayDashboardCards');
  const monthFull = document.getElementById('monthDashboardCards');
  if (home) home.innerHTML = dashboardHtml(todayOrders(data), data, 'today');
  if (financial) financial.innerHTML = dashboardHtml(monthOrders(data), data, 'month');
  if (todayFull) todayFull.innerHTML = dashboardHtml(todayOrders(data), data, 'today');
  if (monthFull) monthFull.innerHTML = dashboardHtml(monthOrders(data), data, 'month');
  renderDashboardExpenseList(data);
}




function currentDayKey() {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function countKey(type) {
  return currentMonthKey();
}

function countLabel(type) {
  return 'Monthly';
}

function getPhysicalInventoryRecord(type = 'month') {
  const data = getData();
  const key = countKey(type);
  return data.monthlyInventoryCounts.find(record => record.type === type && record.key === key) ||
         data.monthlyInventoryCounts.find(record => !record.type && type === 'month' && record.monthKey === key) ||
         null;
}


function renderRawWasteFinancial() {
  const data = getData();
  const select = document.getElementById('wasteRawMaterial');
  const list = document.getElementById('rawWasteList');
  const totalEl = document.getElementById('rawWasteTotal');
  if (select) {
    const current = select.value;
    select.innerHTML = '<option value="">Select raw material</option>' + data.inventory.map(item => `<option value="${item.id}">${escapeHtml(item.name)} — Stock: ${Number(item.qty || 0)}</option>`).join('');
    if (current && data.inventory.some(item => item.id === current)) select.value = current;
  }
  const records = (data.rawWasteRecords || []).filter(item => isTodayDate(item.date));
  const total = records.reduce((sum, item) => sum + Number(item.totalCost || 0), 0);
  if (totalEl) totalEl.textContent = peso.format(total);
  if (list) {
    list.innerHTML = records.length ? records.slice().reverse().map(item => `
      <div class="list-row raw-waste-row">
        <div>
          <strong>${escapeHtml(item.productName)}</strong><br>
          <small>Waste Qty: ${Number(item.qty || 0)} · Unit Cost: ${peso.format(item.unitCost || 0)} · Waste Cost: ${peso.format(item.totalCost || 0)} · ${new Date(item.date).toLocaleString()}${item.reason ? ` · Reason: ${escapeHtml(item.reason)}` : ''}</small>
        </div>
        <div class="row-actions"><button class="danger-btn" onclick="deleteRawWasteRecord('${item.id}')">Delete</button></div>
      </div>
    `).join('') : '<p>No raw material waste recorded for today.</p>';
  }
}

function saveRawWasteRecord() {
  const inventoryId = document.getElementById('wasteRawMaterial')?.value || '';
  const qty = Number(document.getElementById('wasteQty')?.value || 0);
  const reason = (document.getElementById('wasteReason')?.value || '').trim();

  if (!inventoryId) return alert('Please select a raw material.');
  if (!qty || qty <= 0 || Number.isNaN(qty)) return alert('Please enter a valid waste quantity.');

  runWithProcessing('Processing Waste Record...\nPlease wait while we save the waste entry.', () => {
    const data = getData();
    const material = data.inventory.find(item => item.id === inventoryId);
    if (!material) throw new Error('Selected raw material was not found.');
    if (qty > Number(material.qty || 0) && !confirm(`Waste quantity is greater than the current stock (${Number(material.qty || 0)}). Continue and set stock to 0?`)) return;

    const unitCost = Number(material.unitCost || 0);
    const deductedQty = Math.min(qty, Number(material.qty || 0));
    material.qty = Math.max(0, Number(material.qty || 0) - qty);

    data.rawWasteRecords.push({
      id: uid(),
      inventoryId: material.id,
      productName: material.name,
      qty,
      deductedQty,
      unitCost,
      totalCost: qty * unitCost,
      reason,
      date: new Date().toISOString()
    });

    saveData(data);
    const qtyInput = document.getElementById('wasteQty');
    const reasonInput = document.getElementById('wasteReason');
    if (qtyInput) qtyInput.value = '';
    if (reasonInput) reasonInput.value = '';
    renderAll();
    alert(`Raw material waste saved.\nMaterial: ${material.name}\nQty: ${qty}\nWaste Cost: ${peso.format(qty * unitCost)}`);
  });
}

function deleteRawWasteRecord(id) {
  const data = getData();
  const record = (data.rawWasteRecords || []).find(item => item.id === id);
  if (!record) return;
  if (!confirm('Delete this waste record? This will return the deducted quantity to inventory.')) return;
  const material = data.inventory.find(item => item.id === record.inventoryId);
  if (material) material.qty = Number(material.qty || 0) + Number(record.deductedQty || record.qty || 0);
  data.rawWasteRecords = (data.rawWasteRecords || []).filter(item => item.id !== id);
  saveData(data);
  renderAll();
}

function getMonthlyInventoryRecord() {
  return getPhysicalInventoryRecord('month');
}

function renderMonthlyInventory() {
  renderPhysicalInventory('month');
}

function renderPhysicalInventory(type) {
  const data = getData();
  const el = document.getElementById('monthlyInventorySummary');
  if (!el) return;

  const key = countKey(type);
  const existing = getPhysicalInventoryRecord(type);
  const countMap = {};
  if (existing && Array.isArray(existing.items)) {
    existing.items.forEach(item => countMap[item.inventoryId] = item.actualQty);
  }

  const rows = data.inventory.map(item => {
    const actualValue = countMap[item.id] ?? '';
    return `
      <div class="list-row monthly-count-row">
        <div>
          <strong>${item.name}</strong><br>
          <small>System Qty: ${item.qty} · Unit Cost: ${peso.format(item.unitCost || 0)}</small>
        </div>
        <input class="actual-count-input" data-count-type="${type}" data-inventory-id="${item.id}" type="number" min="0" step="1" placeholder="Actual Qty" value="${actualValue}">
      </div>
    `;
  }).join('');

  let status = '';
  if (existing) {
    const lossSummary = calculateInventoryLoss(existing);
    status = `
      <div class="monthly-total-box">
        <strong>Saved ${countLabel(type)} Count for ${key}</strong>
        <span>Loss Amount: ${peso.format(lossSummary.lossAmount)}</span>
      </div>
    `;
  } else {
    status = `
      <div class="monthly-warning-box">
        <strong>No ${countLabel(type).toLowerCase()} inventory count saved for ${key}.</strong>
        <span>Please complete this before generating the End of Month Report.</span>
      </div>
    `;
  }

  el.innerHTML = status + (rows || '<p>No raw materials listed.</p>');
}

function savePhysicalInventoryCount(type) {
  type = 'month';
  const data = getData();
  const key = countKey(type);
  const inputs = Array.from(document.querySelectorAll(`.actual-count-input[data-count-type="${type}"]`));

  if (!inputs.length) {
    return alert('No raw materials available for inventory count.');
  }

  try {
    const items = inputs.map(input => {
      const inventoryId = input.dataset.inventoryId;
      const inventoryItem = data.inventory.find(item => item.id === inventoryId);
      const actualQty = Number(input.value);

      if (input.value === '' || actualQty < 0 || Number.isNaN(actualQty)) {
        throw new Error(`Please enter a valid actual quantity for ${inventoryItem ? inventoryItem.name : 'all items'}.`);
      }

      const systemQty = Number(inventoryItem.qty || 0);
      const unitCost = Number(inventoryItem.unitCost || 0);
      const varianceQty = actualQty - systemQty;
      const varianceValue = varianceQty * unitCost;

      return {
        inventoryId,
        name: inventoryItem.name,
        systemQty,
        actualQty,
        unitCost,
        varianceQty,
        varianceValue,
        lossAmount: varianceQty < 0 ? Math.abs(varianceValue) : 0,
        gainAmount: varianceQty > 0 ? varianceValue : 0
      };
    });

    const record = {
      id: uid(),
      type,
      key,
      monthKey: type === 'month' ? key : currentMonthKey(),
      dateKey: currentDayKey(),
      date: new Date().toISOString(),
      items
    };

    data.monthlyInventoryCounts = data.monthlyInventoryCounts.filter(item => !(item.type === type && item.key === key));
    data.monthlyInventoryCounts.push(record);

    saveData(data);
    renderAll();

    const lossSummary = calculateInventoryLoss(record);
    alert(`${countLabel(type)} inventory count saved for ${key}.
Loss Qty: ${lossSummary.lossQty}
Loss Amount: ${peso.format(lossSummary.lossAmount)}
Gain Qty: ${lossSummary.gainQty}
Gain Amount: ${peso.format(lossSummary.gainAmount)}`);
  } catch (error) {
    alert(error.message);
  }
}

function saveMonthlyInventoryCount() {
  savePhysicalInventoryCount('month');
}

function calculateInventoryLoss(record) {
  const result = {
    lossAmount: 0,
    gainAmount: 0,
    netVarianceAmount: 0,
    lossQty: 0,
    gainQty: 0,
    lossItems: [],
    gainItems: []
  };

  if (!record || !Array.isArray(record.items)) return result;

  record.items.forEach(item => {
    const varianceQty = Number(item.varianceQty || 0);
    const unitCost = Number(item.unitCost || 0);
    const varianceValue = Number(item.varianceValue || (varianceQty * unitCost));

    if (varianceQty < 0) {
      const qtyLoss = Math.abs(varianceQty);
      const amount = Math.abs(varianceValue);
      result.lossQty += qtyLoss;
      result.lossAmount += amount;
      result.lossItems.push({ ...item, lossQty: qtyLoss, lossAmount: amount });
    } else if (varianceQty > 0) {
      result.gainQty += varianceQty;
      result.gainAmount += varianceValue;
      result.gainItems.push({ ...item, gainQty: varianceQty, gainAmount: varianceValue });
    }
  });

  result.netVarianceAmount = result.gainAmount - result.lossAmount;
  return result;
}

function calculateMonthlyInventoryLoss(record) {
  return calculateInventoryLoss(record);
}


function renderInventory() {
  const data = getData();
  const box = document.getElementById('inventoryList');
  if (!box) return;
  box.innerHTML = data.inventory.map(item => `
    <div class="list-row">
      <div>
        <strong>${item.name}</strong><br>
        <small>Qty: ${item.qty} · Unit Cost: ${peso.format(item.unitCost)} · Value: ${peso.format(Number(item.qty) * Number(item.unitCost))}</small>
      </div>
      <div class="row-actions">
        <button onclick="changeInventory('${item.id}', 1)">+1</button>
        <button onclick="changeInventory('${item.id}', -1)">-1</button>
        <button onclick="editInventoryCost('${item.id}')">Edit Cost</button>
        <button onclick="deleteInventory('${item.id}')">Delete</button>
      </div>
    </div>`).join('');
}

function addInventoryItem() {
  const name = document.getElementById('inventoryName').value.trim();
  const qty = Number(document.getElementById('inventoryQty').value);
  const unitCost = Number(document.getElementById('inventoryUnitCost').value);
  if (!name || qty < 0 || unitCost < 0) return alert('Please enter a valid raw material, quantity, and unit cost.');
  const data = getData();
  const existing = data.inventory.find(x => x.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.qty += qty;
    existing.unitCost = unitCost;
  } else {
    data.inventory.push({ id: uid(), name, qty, unitCost });
  }
  saveData(data);
  document.getElementById('inventoryName').value = '';
  document.getElementById('inventoryQty').value = '';
  document.getElementById('inventoryUnitCost').value = '';
  renderAll();
}

function changeInventory(id, amount) {
  const data = getData();
  const item = data.inventory.find(x => x.id === id);
  if (!item) return;
  item.qty = Math.max(0, Number(item.qty) + amount);
  saveData(data);
  renderAll();
}

function editInventoryCost(id) {
  const data = getData();
  const item = data.inventory.find(x => x.id === id);
  if (!item) return;
  const value = prompt(`Enter new unit cost for ${item.name}:`, item.unitCost);
  if (value === null) return;
  const newCost = Number(value);
  if (newCost < 0 || Number.isNaN(newCost)) return alert('Invalid cost.');
  item.unitCost = newCost;
  saveData(data);
  renderAll();
}

function deleteInventory(id) {
  const data = getData();
  data.inventory = data.inventory.filter(x => x.id !== id);
  data.menu.forEach(menuItem => {
    menuItem.recipe = (menuItem.recipe || []).filter(ingredient => ingredient.inventoryId !== id);
  });
  saveData(data);
  renderAll();
}

function renderMenu() {
  const data = getData();
  const byCat = cat => data.menu.filter(i => i.category === cat);
  document.getElementById('comboGroup').innerHTML = byCat('combo').map(itemButton).join('');
  const selectedBurgerAddOns = getSelectedBurgerAddOns(data);
  const { freeAddOns: previewFreeAddOns, chargedAddOns: chargedBurgerAddOns, freePremiumCount, freeVegetableCount } = splitBurgerAddOnsByCharge(selectedBurgerAddOns);
  const buildBurgerBasePrice = getBuildBurgerBasePrice(data);
  const posBaseNote = document.getElementById('buildBurgerPosBaseNote');
  if (posBaseNote) posBaseNote.textContent = `Base price: ${peso.format(buildBurgerBasePrice)} — includes bun and patty. Add-ons follow the free slot rules below.`;
  const builtBurgerTotal = chargedBurgerAddOns.reduce((sum, item) => sum + Number(item.price || 0), buildBurgerBasePrice);
  const freeVegetablesLeft = Math.max(0, BUILD_BURGER_VEGETABLE_FREE_LIMIT - freeVegetableCount);
  const premiumFreeLeft = Math.max(0, BUILD_BURGER_PREMIUM_FREE_LIMIT - freePremiumCount);
  document.getElementById('burgerGroup').innerHTML = `
    <div class="build-burger-note">
      <strong>Build'a Burger Base Price: ${peso.format(buildBurgerBasePrice)}</strong>
      <p>Base price is ${peso.format(buildBurgerBasePrice)} and includes bun and patty. Includes ${BUILD_BURGER_PREMIUM_FREE_LIMIT} premium add-on and ${BUILD_BURGER_VEGETABLE_FREE_LIMIT} vegetable add-ons for free. Extra premium or vegetable add-ons are charged at regular price.</p>
      <div class="build-burger-status">
        <span>Free Vegetables Left: ${freeVegetablesLeft}</span>
        <span>Premium Free Left: ${premiumFreeLeft}</span>
        <span class="total">Current Total: ${peso.format(builtBurgerTotal)}</span>
      </div>
    </div>` + byCat('burger').map(item => {
      const qty = getBurgerAddOnQty(item.id);
      const isSelected = qty > 0;
      const freeQty = previewFreeAddOns.filter(selected => selected.id === item.id).length;
      const chargedQty = chargedBurgerAddOns.filter(selected => selected.id === item.id).length;
      const premiumLabel = isPremiumBurgerAddOn(item) ? ' · PREMIUM' : '';
      const qtyLabel = qty > 0 ? ` x${qty}` : '';
      const tagParts = [];
      if (freeQty) tagParts.push(`${freeQty} FREE`);
      if (chargedQty) tagParts.push(`${chargedQty} CHARGED`);
      const tag = tagParts.length ? tagParts.join(' / ') : 'ADD-ON';
      return `
    <div class="item-btn ${isSelected ? 'selected' : ''} burger-addon-row">
      <button class="addon-main" onclick="incrementBurgerItem('${item.id}')">
        ${item.name}${qtyLabel}<span>${tag}${premiumLabel} · ${peso.format(item.price)}</span>
      </button>
      <button class="addon-qty-btn" onclick="decrementBurgerItem('${item.id}')" ${qty <= 0 ? 'disabled' : ''}>−</button>
      <button class="addon-qty-btn" onclick="incrementBurgerItem('${item.id}')">+</button>
    </div>`;
    }).join('') + '<button class="item-btn add-built" onclick="addBuiltBurger()">Add Built Burger</button>';
  document.getElementById('alaCarteGroup').innerHTML = byCat('alaCarte').map(itemButton).join('');
  const drinkGroup = document.getElementById('drinkGroup');
  if (drinkGroup) drinkGroup.innerHTML = getUniqueDrinkItems(byCat('drink')).map(drinkCardButton).join('');
}

function itemButton(item) {
  const categoryLabels = { combo: 'Combo', alaCarte: 'Ala Carte', drink: 'Drink', burger: 'Add-on' };
  const categoryLabel = categoryLabels[item.category] || 'Item';
  return `<button class="item-btn friendly-menu-item" onclick="addToCart('${item.id}')">
    <small>${categoryLabel}</small>
    <strong>${escapeHtml(item.name)}</strong>
    <span>${peso.format(item.price)}</span>
  </button>`;
}

function addToCart(id) {
  const item = getData().menu.find(x => x.id === id);
  if (!item) return;
  if (item.category === 'combo') {
    openDrinkChoiceModal(item);
    return;
  }
  addMenuItemToCart(item);
}

function addMenuItemToCart(item, drinkName = '', drinkCharge = 0) {
  const cleanDrinkCharge = item.category === 'combo' ? Number(drinkCharge || 0) : 0;
  const drinkLine = drinkName
    ? `${drinkName}${cleanDrinkCharge > 0 ? ' +' + peso.format(cleanDrinkCharge) : ''}`
    : 'No drink selected';
  const detailLines = item.category === 'combo'
    ? ['Regular Burger', 'Reg. Fries', drinkLine]
    : [];
  cart.push({
    id: uid(),
    menuId: item.id,
    name: item.name,
    price: Number(item.price) + cleanDrinkCharge,
    cost: Number(item.cost || 0),
    recipe: item.recipe || [],
    details: detailLines.join(', '),
    drinkName,
    drinkCharge: cleanDrinkCharge
  });
  renderCart();
}


function cleanDrinkBaseName(name = '') {
  return String(name || '')
    .replace(/\s+(regular|grande|small|medium|large|xl|extra large|\d+\s*oz)$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function inferDrinkVariantName(name = '') {
  const value = String(name || '').trim();
  const match = value.match(/\s(regular|grande|small|medium|large|xl|extra large|\d+\s*oz)$/i);
  if (!match) return 'Regular';
  return match[1].replace(/\s+/g, ' ').replace(/\boz\b/i, 'oz').replace(/\b\w/g, c => c.toUpperCase());
}

function getDrinkDisplayName(drink) {
  return cleanDrinkBaseName(drink && drink.name ? drink.name : 'Drink') || 'Drink';
}

function normalizeDrinkVariant(variant, fallback = {}) {
  const name = String((variant && variant.name) || fallback.name || 'Regular').trim() || 'Regular';
  return {
    name,
    price: Number((variant && variant.price) ?? fallback.price ?? 0),
    cost: Number((variant && variant.cost) ?? fallback.cost ?? 0),
    upsizeCharge: Number((variant && variant.upsizeCharge) ?? fallback.upsizeCharge ?? 0)
  };
}

function getDrinkVariants(drink) {
  if (!drink) return [normalizeDrinkVariant(null)];

  if (Array.isArray(drink.variants) && drink.variants.length) {
    return drink.variants.map(v => normalizeDrinkVariant(v, drink)).filter(v => v.name && !Number.isNaN(v.price));
  }

  const data = getData();
  const base = getDrinkDisplayName(drink).toLowerCase();
  const matches = (data.menu || []).filter(item =>
    item.category === 'drink' && getDrinkDisplayName(item).toLowerCase() === base
  );

  const seen = new Set();
  const variants = [];
  matches.forEach(item => {
    const variantName = inferDrinkVariantName(item.name);
    const key = variantName.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    variants.push(normalizeDrinkVariant(null, {
      name: variantName,
      price: item.price,
      cost: item.cost,
      upsizeCharge: item.upsizeCharge
    }));
  });

  if (!variants.length) {
    variants.push(normalizeDrinkVariant(null, {
      name: inferDrinkVariantName(drink.name),
      price: drink.price,
      cost: drink.cost,
      upsizeCharge: drink.upsizeCharge
    }));
  }

  return variants;
}

function getUniqueDrinkItems(drinks) {
  const map = new Map();
  (drinks || []).forEach(drink => {
    const key = getDrinkDisplayName(drink).toLowerCase();
    if (!map.has(key) || (Array.isArray(drink.variants) && drink.variants.length)) {
      map.set(key, drink);
    }
  });
  return Array.from(map.values());
}

function drinkCardButton(item) {
  const name = getDrinkDisplayName(item);
  const variants = getDrinkVariants(item);
  const variantButtons = variants.map(variant => {
    const label = escapeHtml(variant.name);
    const price = peso.format(Number(variant.price || 0));
    const itemId = escapeHtml(String(item.id)).replace(/'/g, '&#39;');
    const variantName = escapeHtml(String(variant.name)).replace(/'/g, '&#39;');
    return `<button class="drink-size-chip" onclick="addDrinkVariantToCart('${itemId}', '${variantName}')"><strong>${label}</strong><span>${price}</span></button>`;
  }).join('');

  return `<div class="item-btn friendly-menu-item drink-variant-card">
    <small>Drink</small>
    <strong>${escapeHtml(name)}</strong>
    <div class="drink-card-size-row">${variantButtons}</div>
  </div>`;
}

function addDrinkVariantToCart(id, variantName = '') {
  const source = getData().menu.find(x => x.id === id);
  if (!source) return;
  const variants = getDrinkVariants(source);
  const selected = variants.find(v => v.name === variantName) || variants[0];
  const cartItem = {
    ...source,
    id: `${source.id}-${selected.name}`,
    name: `${getDrinkDisplayName(source)} ${selected.name}`,
    price: Number(selected.price || 0),
    cost: Number(selected.cost || 0),
    upsizeCharge: Number(selected.upsizeCharge || 0),
    category: 'drink'
  };
  addMenuItemToCart(cartItem);
}

function getDrinkOptions() {
  return getData().menu.filter(item => item.category === 'drink');
}

function getDrinkTotalCharge(drink, variantName = '') {
  const variants = getDrinkVariants(drink);
  const variant = variantName ? variants.find(v => v.name === variantName) : variants[0];
  return Number((variant && variant.upsizeCharge) || drink.upsizeCharge || 0);
}

function getDrinkChargeLabel(drink, variantName = '') {
  const comboCharge = getDrinkTotalCharge(drink, variantName);
  if (comboCharge <= 0) return 'No extra charge';
  return '+' + peso.format(comboCharge) + ' upsize/extra';
}

function openDrinkChoiceModal(comboItem) {
  pendingComboItem = comboItem;
  const title = document.getElementById('drinkChoiceTitle');
  const list = document.getElementById('drinkChoiceList');
  if (title) title.textContent = `Choose Drink for ${comboItem.name}`;
  if (list) {
    const drinks = getDrinkOptions();
    list.innerHTML = drinks.length ? drinks.map(drink => `
      <div class="drink-choice-card">
        <strong>${escapeHtml(getDrinkDisplayName(drink))}</strong>
        <div class="drink-choice-size-row">
          ${getDrinkVariants(drink).map(variant => `<button class="drink-choice-btn" onclick="confirmComboDrink('${drink.id}', '${escapeHtml(String(variant.name)).replace(/'/g, '&#39;')}')">
            <span class="drink-name">${escapeHtml(variant.name)}</span>
            <small class="drink-price">${getDrinkChargeLabel(drink, variant.name)}</small>
          </button>`).join('')}
        </div>
      </div>`).join('') : '<p class="muted">No drink items have been added yet. Please ask an admin to add drinks from Admin → Add Drinks.</p>';
  }
  document.getElementById('drinkChoiceModal').classList.remove('hidden');
}

function closeDrinkChoiceModal() {
  pendingComboItem = null;
  const modal = document.getElementById('drinkChoiceModal');
  if (modal) modal.classList.add('hidden');
}

function confirmComboDrink(drinkId, variantName = '') {
  if (!pendingComboItem) return alert('Please select a combo first.');
  const drink = getDrinkOptions().find(item => item.id === drinkId);
  if (!drink) return alert('Drink option not found.');
  const variant = getDrinkVariants(drink).find(v => v.name === variantName) || getDrinkVariants(drink)[0];
  const drinkLabel = variant ? `${getDrinkDisplayName(drink)} ${variant.name}` : getDrinkDisplayName(drink);
  addMenuItemToCart(pendingComboItem, drinkLabel, getDrinkTotalCharge(drink, variant ? variant.name : ''));
  closeDrinkChoiceModal();
}

function toggleBurgerItem(id) {
  incrementBurgerItem(id);
}


function summarizeAddOns(items) {
  const summary = {};
  items.forEach(item => {
    const key = item.id || item.name;
    if (!summary[key]) summary[key] = { name: item.name, qty: 0, price: Number(item.price || 0) };
    summary[key].qty += 1;
  });
  return Object.values(summary);
}

function formatAddOnSummary(items) {
  return summarizeAddOns(items).map(item => `${item.name}${item.qty > 1 ? ' x' + item.qty : ''}`).join(', ');
}

function formatChargedAddOnSummary(items) {
  return summarizeAddOns(items).map(item => `${item.name}${item.qty > 1 ? ' x' + item.qty : ''} ${peso.format(Number(item.price || 0) * item.qty)}`).join(', ');
}

function addBuiltBurger() {
  const data = getData();
  const selected = getSelectedBurgerAddOns(data);
  const { freeAddOns, chargedAddOns } = splitBurgerAddOnsByCharge(selected);
  const buildBurgerBasePrice = getBuildBurgerBasePrice(data);
  const total = chargedAddOns.reduce((sum, item) => sum + Number(item.price || 0), buildBurgerBasePrice);

  const recipeMap = {};
  const addRecipeIngredient = ingredient => {
    if (!ingredient || !ingredient.inventoryId) return;
    recipeMap[ingredient.inventoryId] = (recipeMap[ingredient.inventoryId] || 0) + Number(ingredient.qty || 0);
  };

  BUILD_BURGER_BASE_INGREDIENTS.forEach(name => {
    const material = data.inventory.find(inv => inv.name.toLowerCase() === name.toLowerCase());
    if (material) addRecipeIngredient({ inventoryId: material.id, qty: 1 });
  });

  selected.forEach(item => (item.recipe || []).forEach(addRecipeIngredient));

  const recipe = Object.entries(recipeMap).map(([inventoryId, qty]) => {
    const inv = data.inventory.find(x => x.id === inventoryId);
    return { inventoryId, name: inv ? inv.name : '', qty };
  });
  const cost = calculateRecipeCost(recipe, data);
  const details = [
    `Base Burger with Bun and Patty (${peso.format(buildBurgerBasePrice)})`,
    freeAddOns.length ? `Free add-ons: ${formatAddOnSummary(freeAddOns)} (max 1 premium + 2 vegetables free)` : 'No add-ons selected',
    chargedAddOns.length ? `Charged add-ons: ${formatChargedAddOnSummary(chargedAddOns)}` : 'No extra add-on charge'
  ];

  cart.push({
    id: uid(),
    name: 'Build\'a Burger',
    price: total,
    cost: cost,
    recipe,
    details: details.join(', '),
    freeAddOns: summarizeAddOns(freeAddOns),
    chargedAddOns: chargedAddOns.map(x => ({ name: x.name, price: Number(x.price || 0) }))
  });
  selectedBurgerItems = [];
  renderMenu();
  renderCart();
}


function receiptDetailLines(item) {
  if (item && item.details) {
    return String(item.details).split(',').map(x => x.trim()).filter(Boolean);
  }
  const comboDetails = {
    'Combo A': ['Regular Burger', 'Reg. Fries', 'Drink not selected'],
    'Combo B': ['Regular Burger', 'Reg. Fries', 'Drink not selected'],
    'Combo C': ['Regular Burger', 'Reg. Fries', 'Drink not selected']
  };
  return comboDetails[item && item.name] || [];
}

function renderReceiptDetails(item) {
  const lines = receiptDetailLines(item);
  if (!lines.length) return '';
  return `<div class="receipt-detail-lines">${lines.map(line => `<div>${escapeHtml(line)}</div>`).join('')}</div>`;
}

function cartItemGroupKey(item) {
  return [
    item && item.name ? item.name : '',
    Number(item && item.price || 0).toFixed(2),
    item && item.details ? item.details : ''
  ].join('||');
}

function groupedCartItems(items = cart) {
  const groups = [];
  const groupMap = {};
  (Array.isArray(items) ? items : []).forEach(item => {
    const key = cartItemGroupKey(item);
    if (!groupMap[key]) {
      groupMap[key] = {
        key,
        firstId: item.id,
        name: item.name,
        unitPrice: Number(item.price || 0),
        unitCost: Number(item.cost || 0),
        qty: 0,
        total: 0,
        costTotal: 0,
        sample: item
      };
      groups.push(groupMap[key]);
    }
    groupMap[key].qty += 1;
    groupMap[key].total += Number(item.price || 0);
    groupMap[key].costTotal += Number(item.cost || 0);
  });
  return groups;
}

function renderCart() {
  const box = document.getElementById('cartItems');
  const groups = groupedCartItems(cart);
  box.innerHTML = groups.length ? groups.map((group, index) => `
    <div class="cart-row friendly-cart-row grouped-cart-row">
      <div class="cart-item-main"><span class="cart-item-number">${index + 1}</span><div><strong>${escapeHtml(group.name)} x${group.qty}</strong>${renderReceiptDetails(group.sample)}</div></div>
      <div class="cart-line-unit">${peso.format(group.unitPrice)}</div>
      <div class="cart-item-price">${peso.format(group.total)} <button title="Remove one item" onclick="removeCartItem('${group.firstId}')">×</button></div>
    </div>`).join('') : '<p class="empty-cart-message">No items yet. Tap a menu item to start the order.</p>';
  document.getElementById('cartTotal').textContent = peso.format(cartTotal());
  const countBadge = document.getElementById('cartCountBadge');
  if (countBadge) countBadge.textContent = cart.length;
}

function removeCartItem(id) {
  cart = cart.filter(x => x.id !== id);
  renderCart();
}

function cartTotal() {
  return cart.reduce((sum, item) => sum + Number(item.price), 0);
}

function cartCost() {
  return cart.reduce((sum, item) => sum + Number(item.cost || 0), 0);
}


function orderDateKey(dateValue) {
  const date = dateValue ? new Date(dateValue) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toDateString();
  return date.toDateString();
}

function getNextCustomerNumber(data) {
  const todayKey = orderDateKey(new Date());
  const todaysOrders = Array.isArray(data.orders) ? data.orders.filter(order => orderDateKey(order.date) === todayKey) : [];
  const highestExisting = todaysOrders.reduce((max, order, index) => {
    const savedNumber = Number(order.customerNumber || order.customerNo || 0);
    return Math.max(max, savedNumber || (index + 1));
  }, 0);
  return highestExisting + 1;
}

function formatCustomerNumber(number) {
  return `Customer No. ${String(Number(number || 0)).padStart(3, '0')}`;
}

function orderDisplayTotal(order) {
  return peso.format(Number(order?.total || 0));
}

function openVoidOrderModal() {
  const modal = document.getElementById('voidOrderModal');
  const input = document.getElementById('voidOrderNumberInput');
  const result = document.getElementById('voidOrderLookupResult');
  if (input) input.value = '';
  if (result) result.innerHTML = '';
  if (modal) modal.classList.remove('hidden');
  setTimeout(() => { if (input) input.focus(); }, 100);
}

function closeVoidOrderModal() {
  const modal = document.getElementById('voidOrderModal');
  if (modal) modal.classList.add('hidden');
}

function normalizeOrderNumber(value) {
  return String(value || '').trim().replace(/^0+/, '') || '0';
}

function orderMatchesEnteredNumber(order, enteredNumber) {
  const normalizedEntry = normalizeOrderNumber(enteredNumber);
  const customerNumber = normalizeOrderNumber(order.customerNumber || order.customerNo || '');
  const labelDigits = String(order.customerNumberLabel || '').replace(/\D/g, '');
  const labelNumber = normalizeOrderNumber(labelDigits);
  return normalizedEntry === customerNumber || normalizedEntry === labelNumber;
}

function findTodayOrderByNumber(data, enteredNumber) {
  const todayKey = orderDateKey(new Date());
  return (Array.isArray(data.orders) ? data.orders : []).find(order => {
    if (isOrderVoided(order)) return false;
    if (orderDateKey(order.date) !== todayKey) return false;
    return orderMatchesEnteredNumber(order, enteredNumber);
  });
}

function handleVoidOrderNumberKey(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    submitVoidOrderNumber();
  }
}

function submitVoidOrderNumber() {
  const input = document.getElementById('voidOrderNumberInput');
  const result = document.getElementById('voidOrderLookupResult');
  const enteredNumber = input ? input.value.trim() : '';
  if (!enteredNumber) {
    alert('Please enter the order number to void.');
    if (input) input.focus();
    return;
  }

  const data = getData();
  const order = findTodayOrderByNumber(data, enteredNumber);
  if (!order) {
    if (result) result.innerHTML = '<p class="danger-text"><strong>Order not found.</strong> Please check the order number. Only today’s active completed orders can be voided.</p>';
    if (input) input.focus();
    return;
  }

  const customer = order.customerNumberLabel || formatCustomerNumber(order.customerNumber);
  const items = (order.items || []).map(item => item.name).join(', ') || 'No item details';
  const paidBy = order.paymentMethod || 'Unknown payment';
  const time = new Date(order.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (result) {
    result.innerHTML = `
      <div class="void-order-found-card">
        <strong>${escapeHtml(customer)} · ${escapeHtml(orderDisplayTotal(order))}</strong><br>
        <small>${escapeHtml(time)} · ${escapeHtml(paidBy)} · ${escapeHtml(items)}</small>
      </div>`;
  }

  voidTodayOrder(order.id);
}

function restoreVoidedOrderInventory(data, order) {
  const used = Array.isArray(order.rawMaterialsUsed) ? order.rawMaterialsUsed : [];
  used.forEach(item => {
    const material = data.inventory.find(inv => inv.id === item.inventoryId);
    if (material) material.qty = Number(material.qty || 0) + Number(item.qty || 0);
  });
}

function voidTodayOrder(orderId) {
  const data = getData();
  const order = data.orders.find(item => item.id === orderId);
  if (!order) return alert('Order was not found.');
  if (isOrderVoided(order)) return alert('This order is already voided.');
  if (orderDateKey(order.date) !== orderDateKey(new Date())) {
    return alert('Only orders completed today can be voided.');
  }

  const customer = order.customerNumberLabel || formatCustomerNumber(order.customerNumber);
  if (!confirm(`Void ${customer} for ${orderDisplayTotal(order)}?\n\nThis will cancel today’s sale and add the deducted raw materials back to inventory.`)) return;

  restoreVoidedOrderInventory(data, order);
  order.status = 'voided';
  order.voidedAt = new Date().toISOString();
  order.voidedBy = currentUser ? currentUser.username : '';
  order.voidReason = 'Canceled from POS menu void system';

  saveData(data);
  renderAll();
  const input = document.getElementById('voidOrderNumberInput');
  const result = document.getElementById('voidOrderLookupResult');
  if (input) input.value = '';
  if (result) result.innerHTML = '';
  alert(`${customer} has been voided. Sales totals were updated and raw materials were restored.`);
}

function completeOrder() {
  if (!cart.length) return alert('Cart is empty.');
  const data = getData();
  const nextCustomerNumber = getNextCustomerNumber(data);
  const customerNumberBadge = document.getElementById('checkoutCustomerNumber');
  if (customerNumberBadge) customerNumberBadge.textContent = formatCustomerNumber(nextCustomerNumber);
  const checkoutGroups = groupedCartItems(cart);
  document.getElementById('modalOrderItems').innerHTML = `
    <div class="receipt-table receipt-table-header">
      <div>Item</div>
      <div>Unit</div>
      <div>Total</div>
    </div>
    ${checkoutGroups.map(group => `
      <div class="receipt-table receipt-row">
        <div><strong>${escapeHtml(group.name)} x${group.qty}</strong>${renderReceiptDetails(group.sample)}</div>
        <div>${peso.format(group.unitPrice)}</div>
        <div>${peso.format(group.total)}</div>
      </div>`).join('')}`;
  renderCheckoutTotals();
  document.getElementById('checkoutModal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('checkoutModal').classList.add('hidden');
}

function renderCheckoutTotals() {
  const subtotal = cartTotal();
  document.getElementById('modalSubtotal').textContent = peso.format(subtotal);
  document.getElementById('modalTotal').textContent = peso.format(subtotal);
}


function calculateCartRawUsage(data) {
  const usage = {};
  cart.forEach(cartItem => {
    let recipe = Array.isArray(cartItem.recipe) ? cartItem.recipe : [];
    if (!recipe.length && cartItem.menuId) {
      const menuItem = data.menu.find(item => item.id === cartItem.menuId);
      recipe = menuItem && Array.isArray(menuItem.recipe) ? menuItem.recipe : [];
    }
    recipe.forEach(ingredient => {
      const qty = Number(ingredient.qty || 0);
      if (!ingredient.inventoryId || qty <= 0) return;
      usage[ingredient.inventoryId] = (usage[ingredient.inventoryId] || 0) + qty;
    });
  });
  return usage;
}

function cartRawUsageList(data, usage) {
  return Object.entries(usage).map(([inventoryId, qty]) => {
    const material = data.inventory.find(item => item.id === inventoryId);
    return {
      inventoryId,
      name: material ? material.name : 'Deleted Raw Material',
      qty,
      available: material ? Number(material.qty || 0) : 0,
      unitCost: material ? Number(material.unitCost || 0) : 0
    };
  });
}

function validateAndDeductRawMaterials(data) {
  const usage = calculateCartRawUsage(data);
  const usageList = cartRawUsageList(data, usage);
  const missing = usageList.filter(item => item.qty > item.available);

  if (missing.length) {
    const details = missing.map(item => `${item.name}: need ${item.qty}, available ${item.available}`).join('\n');
    alert(`Cannot complete order. Not enough raw materials in inventory:\n\n${details}\n\nPlease add raw-material purchases or adjust the menu item recipe.`);
    return null;
  }

  usageList.forEach(item => {
    const material = data.inventory.find(inv => inv.id === item.inventoryId);
    if (material) material.qty = Math.max(0, Number(material.qty || 0) - Number(item.qty || 0));
  });

  return usageList;
}


let processingActionActive = false;

function showProcessing(message = 'Processing Payment...\nPlease wait') {
  const overlay = document.getElementById('processingOverlay');
  const label = document.getElementById('processingMessage');
  if (label) label.innerHTML = String(message).replace(/\n/g, '<br>');
  if (overlay) overlay.classList.remove('hidden');
  document.body.classList.add('processing-active');
}

function hideProcessing() {
  const overlay = document.getElementById('processingOverlay');
  if (overlay) overlay.classList.add('hidden');
  document.body.classList.remove('processing-active');
  processingActionActive = false;
}

function runWithProcessing(message, action) {
  if (processingActionActive) return;
  processingActionActive = true;
  showProcessing(message);

  // Allow the loading animation to paint before running synchronous database work.
  setTimeout(() => {
    try {
      action();
    } catch (error) {
      console.error(error);
      alert(error && error.message ? error.message : 'Something went wrong while processing this action.');
    } finally {
      hideProcessing();
    }
  }, 80);
}

let pendingReferencePaymentMethod = '';

function requestReferencePayment(paymentMethod) {
  pendingReferencePaymentMethod = paymentMethod;
  const title = document.getElementById('referenceModalTitle');
  const input = document.getElementById('paymentReferenceInput');
  if (title) title.textContent = `${paymentMethod} Reference Number`;
  if (input) {
    input.value = '';
    setTimeout(() => input.focus(), 100);
  }
  document.getElementById('referenceModal').classList.remove('hidden');
}

function closeReferenceModal() {
  pendingReferencePaymentMethod = '';
  const modal = document.getElementById('referenceModal');
  if (modal) modal.classList.add('hidden');
}

function confirmReferencePayment() {
  const input = document.getElementById('paymentReferenceInput');
  const referenceNumber = input ? input.value.trim() : '';
  if (!pendingReferencePaymentMethod) return alert('Please select a payment method first.');
  if (!referenceNumber) {
    alert('Please enter the reference number before saving this payment.');
    if (input) input.focus();
    return;
  }
  checkout(pendingReferencePaymentMethod, referenceNumber);
}

function checkout(paymentMethod, paymentReference = '') {
  runWithProcessing('Saving payment and completing order...', () => completeCheckout(paymentMethod, paymentReference));
}

function completeCheckout(paymentMethod, paymentReference = '') {
  const data = getData();
  const customerNumber = getNextCustomerNumber(data);
  const rawMaterialsUsed = validateAndDeductRawMaterials(data);
  if (rawMaterialsUsed === null) return;

  const subtotal = cartTotal();
  const foodCost = cartCost();
  const total = subtotal;
  const profit = total - foodCost;

  data.orders.push({
    id: uid(),
    customerNumber,
    customerNumberLabel: formatCustomerNumber(customerNumber),
    date: new Date().toISOString(),
    items: cart,
    subtotal,
    total,
    cost: foodCost,
    profit,
    paymentMethod,
    paymentReference,
    rawMaterialsUsed
  });

  saveData(data);
  cart = [];
  selectedBurgerItems = [];
  pendingComboItem = null;
  closeDrinkChoiceModal();
  closeReferenceModal();
  closeModal();
  renderAll();
  const referenceLine = paymentReference ? `
Reference Number: ${paymentReference}` : '';

  hideProcessing();
  alert(`${formatCustomerNumber(customerNumber)}
Payment saved via ${paymentMethod}.${referenceLine}
Order completed.
Raw materials were deducted from inventory.
Total: ${peso.format(total)}`);
}

function calculateRecipeCost(recipe, data = getData()) {
  if (!Array.isArray(recipe)) return 0;
  return recipe.reduce((sum, ingredient) => {
    const material = data.inventory.find(item => item.id === ingredient.inventoryId);
    const qty = Number(ingredient.qty || 0);
    const unitCost = material ? Number(material.unitCost || 0) : Number(ingredient.unitCost || 0);
    return sum + (qty * unitCost);
  }, 0);
}

function updateMenuCostFromRecipe() {
  const costInput = document.getElementById('menuCost');
  if (!costInput) return;
  const recipe = getMenuRecipeFromForm();
  const cost = calculateRecipeCost(recipe);
  costInput.value = cost ? Number(cost.toFixed(2)) : '';
}

function getMenuRecipeFromForm() {
  const data = getData();
  return Array.from(document.querySelectorAll('.menu-recipe-input')).map(input => {
    const qty = Number(input.value || 0);
    const inventoryId = input.dataset.inventoryId;
    const material = data.inventory.find(item => item.id === inventoryId);
    return { inventoryId, name: material ? material.name : '', qty, unitCost: material ? Number(material.unitCost || 0) : 0 };
  }).filter(item => item.inventoryId && item.qty > 0);
}

function saveMenuItem() {
  const name = document.getElementById('menuName').value.trim();
  const price = Number(document.getElementById('menuPrice').value);
  const category = document.getElementById('menuCategory').value;
  const premiumInput = document.getElementById('menuPremiumAddon');
  const isPremiumAddon = category === 'burger' && !!premiumInput?.checked;
  const recipe = getMenuRecipeFromForm();
  const cost = calculateRecipeCost(recipe, getData());
  if (!name || price < 0 || cost < 0) return alert('Enter a valid menu name and selling price. Item cost is calculated automatically from the recipe.');
  const data = getData();
  const existing = data.menu.find(x => x.name.toLowerCase() === name.toLowerCase() && x.category === category);
  if (existing) {
    existing.price = price;
    existing.cost = cost;
    existing.recipe = recipe;
    existing.category = category;
    existing.isPremiumAddon = isPremiumAddon;
  } else {
    data.menu.push({ id: uid(), name, price, cost, category, recipe, isPremiumAddon });
  }
  saveData(data);
  document.getElementById('menuName').value = '';
  document.getElementById('menuPrice').value = '';
  document.getElementById('menuCost').value = '';
  if (document.getElementById('menuPremiumAddon')) document.getElementById('menuPremiumAddon').checked = false;
  clearMenuRecipeInputs();
  renderAll();
}

function clearMenuRecipeInputs() {
  document.querySelectorAll('.menu-recipe-input').forEach(input => input.value = '');
}

function renderMenuRecipeBuilder(recipe = null) {
  const data = getData();
  const el = document.getElementById('menuRecipeBuilder');
  if (!el) return;
  const recipeMap = {};
  if (Array.isArray(recipe)) recipe.forEach(item => recipeMap[item.inventoryId] = item.qty);

  el.innerHTML = data.inventory.length ? data.inventory.map(item => `
    <label class="recipe-row">
      <span>${item.name}<small> Available: ${item.qty}</small></span>
      <input class="menu-recipe-input" data-inventory-id="${item.id}" type="number" min="0" step="0.01" placeholder="Qty used per order" value="${recipeMap[item.id] || ''}" oninput="updateMenuCostFromRecipe()">
    </label>
  `).join('') : '<p class="muted">Add raw materials first before creating recipes.</p>';
  updateMenuCostFromRecipe();
}



let activeAdminPanelId = null;

function openAdminPopout(panelId) {
  if (!userIsAdmin()) return alert('Admin access only.');
  const modal = document.getElementById('adminCenterModal');
  const body = document.getElementById('adminCenterModalBody');
  const panel = document.getElementById(panelId);
  if (!modal || !body || !panel) return;

  closeAdminPopout(false);
  activeAdminPanelId = panelId;
  body.appendChild(panel);
  panel.classList.add('in-admin-modal');
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');

  if (panelId === 'menuAdminPanel') renderMenuRecipeBuilder();
  if (panelId === 'drinkAdminPanel') { ensureDrinkVariantRows(); renderAdminDrinks(); }
  if (panelId === 'userAdminPanel') renderUserAdmin();
  if (panelId === 'rawPurchasePanel') {
    renderRawMaterialDeliveryProducts();
    renderRawPurchaseCart();
    renderAdminCurrentInventory();
    renderRawMaterialDeliveries();
  }
}

function closeAdminPopout(clearActive = true) {
  const modal = document.getElementById('adminCenterModal');
  const body = document.getElementById('adminCenterModalBody');
  const hiddenPanels = document.getElementById('adminHiddenPanels');
  if (body && hiddenPanels && body.firstElementChild) {
    const panel = body.firstElementChild;
    panel.classList.remove('in-admin-modal');
    hiddenPanels.appendChild(panel);
  }
  if (modal) modal.classList.add('hidden');
  document.body.classList.remove('modal-open');
  if (clearActive) activeAdminPanelId = null;
}


function adminCreateUser() {
  if (!userIsAdmin()) return alert('Admin access only.');
  const fullName = (document.getElementById('adminNewFullName').value || '').trim();
  const username = (document.getElementById('adminNewUsername').value || '').trim();
  const password = document.getElementById('adminNewPassword').value || '';
  const role = document.getElementById('adminNewRole').value === 'admin' ? 'admin' : 'cashier';
  if (!fullName || !username || !password) return alert('Please complete full name, username, and password.');
  const data = getData();
  if (data.users.some(u => u.username.toLowerCase() === username.toLowerCase())) return alert('Username already exists.');
  data.users.push({ id: uid(), fullName, username, password, role, status: 'approved', createdAt: new Date().toISOString(), approvedAt: new Date().toISOString() });
  saveData(data);
  ['adminNewFullName','adminNewUsername','adminNewPassword'].forEach(id => document.getElementById(id).value = '');
  renderUserAdmin();
  alert('User created and approved.');
}

function approveUser(id) {
  if (!userIsAdmin()) return alert('Admin access only.');
  const data = getData();
  const user = data.users.find(u => u.id === id);
  if (!user) return;
  user.status = 'approved';
  user.approvedAt = new Date().toISOString();
  saveData(data);
  renderUserAdmin();
}

function rejectUser(id) {
  if (!userIsAdmin()) return alert('Admin access only.');
  if (!confirm('Reject and remove this pending registration?')) return;
  const data = getData();
  data.users = data.users.filter(u => u.id !== id);
  saveData(data);
  renderUserAdmin();
}

function changeUserRole(id, role) {
  if (!userIsAdmin()) return alert('Admin access only.');
  const data = getData();
  const user = data.users.find(u => u.id === id);
  if (!user) return;
  user.role = role === 'admin' ? 'admin' : 'cashier';
  saveData(data);
  renderUserAdmin();
}

function toggleUserCredentialEditor(id) {
  if (!userIsAdmin()) return alert('Admin access only.');
  const editor = document.getElementById(`credentialEditor_${id}`);
  if (!editor) return;
  const willOpen = editor.classList.contains('hidden');
  editor.classList.toggle('hidden', !willOpen);
  const button = document.getElementById(`credentialToggle_${id}`);
  if (button) button.textContent = willOpen ? 'Cancel Edit' : 'Edit Login';
}

function updateUserCredentials(id) {
  if (!userIsAdmin()) return alert('Admin access only.');
  const usernameInput = document.getElementById(`editUsername_${id}`);
  const passwordInput = document.getElementById(`editPassword_${id}`);
  if (!usernameInput || !passwordInput) return;
  const username = (usernameInput.value || '').trim();
  const password = passwordInput.value || '';
  if (!username || !password) return alert('Username and password cannot be blank.');

  const data = getData();
  const user = data.users.find(u => u.id === id);
  if (!user || user.status !== 'approved') return alert('Approved user not found.');
  if (data.users.some(u => u.id !== id && u.username.toLowerCase() === username.toLowerCase())) return alert('Username already exists.');

  user.username = username;
  user.password = password;
  user.updatedAt = new Date().toISOString();
  saveData(data);

  if (currentUser && currentUser.id === id) {
    currentUser = { ...currentUser, username: user.username };
    localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
    const label = document.getElementById('currentUserLabel');
    if (label) label.textContent = `${currentUser.fullName} · ${currentUser.role.toUpperCase()}`;
  }

  renderUserAdmin();
  alert('Login credentials updated.');
}

function deleteUser(id) {
  if (!userIsAdmin()) return alert('Admin access only.');
  const data = getData();
  const user = data.users.find(u => u.id === id);
  if (!user) return;
  if (currentUser && currentUser.id === id) return alert('You cannot delete the account currently logged in.');
  if (user.username === 'admin') return alert('The default admin account cannot be deleted.');
  if (!confirm(`Delete user ${user.username}?`)) return;
  data.users = data.users.filter(u => u.id !== id);
  saveData(data);
  renderUserAdmin();
}

function renderUserAdmin() {
  const pendingEl = document.getElementById('pendingUsersList');
  const approvedEl = document.getElementById('approvedUsersList');
  if (!pendingEl && !approvedEl) return;
  const data = getData();
  const pending = data.users.filter(u => u.status !== 'approved');
  const approved = data.users.filter(u => u.status === 'approved');
  if (pendingEl) pendingEl.innerHTML = pending.length ? pending.map(user => `
    <div class="list-row">
      <div><strong>${escapeHtml(user.fullName)}</strong><br><small>${escapeHtml(user.username)} · Requested: ${escapeHtml(user.role)}</small></div>
      <div class="row-actions"><button onclick="approveUser('${user.id}')">Approve</button><button onclick="rejectUser('${user.id}')">Reject</button></div>
    </div>`).join('') : '<p class="muted">No pending registrations.</p>';
  if (approvedEl) approvedEl.innerHTML = userIsAdmin() ? approved.map(user => `
    <div class="list-row user-card-row">
      <div class="user-card-main">
        <strong>${escapeHtml(user.fullName)}</strong><br><small>Current login: ${escapeHtml(user.username)} · ${escapeHtml(user.role)}</small>
        <div id="credentialEditor_${user.id}" class="user-credential-editor hidden">
          <p class="muted mini-help">Admin-only credential edit</p>
          <div class="user-credential-grid">
            <label>Username<input id="editUsername_${user.id}" value="${escapeHtml(user.username)}" placeholder="Username"></label>
            <label>Password<input id="editPassword_${user.id}" type="text" value="${escapeHtml(user.password || '')}" placeholder="Password"></label>
          </div>
          <button class="secondary save-login-btn" onclick="updateUserCredentials('${user.id}')">Save Login Credentials</button>
        </div>
      </div>
      <div class="row-actions user-card-actions">
        <label>Role<select onchange="changeUserRole('${user.id}', this.value)"><option value="cashier" ${user.role === 'cashier' ? 'selected' : ''}>Cashier</option><option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option></select></label>
        <button id="credentialToggle_${user.id}" class="secondary" onclick="toggleUserCredentialEditor('${user.id}')">Edit Login</button>
        <button onclick="deleteUser('${user.id}')">Delete</button>
      </div>
    </div>`).join('') : '<p class="muted">Admin access only.</p>';
}

function todaysRawPurchaseRecords(data) {
  return (data.rawDeliveries || []).filter(item => isTodayDate(item.date));
}

function renderAdminSummaryCards() {
  const data = getData();
  const el = document.getElementById('adminSummaryCards');
  if (!el) return;

  const todayPurchases = todaysRawPurchaseRecords(data);
  const rawItemCount = data.inventory.length;
  const menuItemCount = data.menu.length;
  const purchaseExpense = todayPurchases.reduce((sum, item) => sum + Number(item.totalExpense || 0), 0);
  const lowStock = data.inventory.filter(item => Number(item.qty || 0) <= 5).length;
  const pendingUsers = (data.users || []).filter(user => user.status !== 'approved').length;
  const approvedUsers = (data.users || []).filter(user => user.status === 'approved').length;

  el.innerHTML = `
    <div class="dash-card admin-dash-card"><small>Menu Items</small><strong>${menuItemCount}</strong></div>
    <div class="dash-card admin-dash-card"><small>Raw Materials</small><strong>${rawItemCount}</strong></div>
    <div class="dash-card admin-dash-card"><small>Today's Purchase Records</small><strong>${todayPurchases.length}</strong></div>
    <div class="dash-card admin-dash-card"><small>Today's Raw Expenses</small><strong>${peso.format(purchaseExpense)}</strong></div>
    <div class="dash-card admin-dash-card"><small>Low Stock Items</small><strong>${lowStock}</strong></div>
    <div class="dash-card admin-dash-card"><small>Approved Users</small><strong>${approvedUsers}</strong></div>
    <div class="dash-card admin-dash-card"><small>Pending Users</small><strong>${pendingUsers}</strong></div>
  `;
}

function drinkVariantRowHtml(name = '', price = '', cost = '', upsizeCharge = '') {
  const rowId = uid();
  const safeName = escapeHtml(String(name || ''));
  return `
    <div class="drink-variant-row" data-drink-variant-row="true">
      <label>Size / Variant Name<input class="drinkVariantName" placeholder="Regular, Grande, 12oz, 16oz" value="${safeName}" /></label>
      <label>Selling Price<input class="drinkVariantPrice" type="number" step="0.01" min="0" placeholder="₱0.00" value="${price !== '' && price !== undefined ? Number(price) : ''}" /></label>
      <label>Cost<input class="drinkVariantCost" type="number" step="0.01" min="0" placeholder="₱0.00" value="${cost !== '' && cost !== undefined ? Number(cost) : ''}" /></label>
      <label>Combo Extra / Upsize<input class="drinkVariantExtra" type="number" step="0.01" min="0" placeholder="₱0.00" value="${upsizeCharge !== '' && upsizeCharge !== undefined ? Number(upsizeCharge) : ''}" /></label>
      <button type="button" class="danger-btn variant-remove-btn" onclick="removeDrinkVariantRow(this)">Remove</button>
    </div>`;
}

function ensureDrinkVariantRows() {
  const box = document.getElementById('drinkVariantRows');
  if (!box) return;
  if (!box.querySelector('[data-drink-variant-row="true"]')) {
    box.innerHTML = drinkVariantRowHtml('Regular', '', '', 0) + drinkVariantRowHtml('Grande', '', '', 0);
  }
}

function addDrinkVariantRow(name = '', price = '', cost = '', upsizeCharge = '') {
  const box = document.getElementById('drinkVariantRows');
  if (!box) return;
  box.insertAdjacentHTML('beforeend', drinkVariantRowHtml(name, price, cost, upsizeCharge));
}

function removeDrinkVariantRow(button) {
  const row = button && button.closest ? button.closest('[data-drink-variant-row="true"]') : null;
  if (row) row.remove();
  ensureDrinkVariantRows();
}

function getDrinkFormVariants() {
  ensureDrinkVariantRows();
  const rows = Array.from(document.querySelectorAll('#drinkVariantRows [data-drink-variant-row="true"]'));
  return rows.map(row => {
    const name = (row.querySelector('.drinkVariantName')?.value || '').trim();
    const price = Number(row.querySelector('.drinkVariantPrice')?.value || 0);
    const cost = Number(row.querySelector('.drinkVariantCost')?.value || 0);
    const upsizeCharge = Number(row.querySelector('.drinkVariantExtra')?.value || 0);
    return { id: uid(), name, price, cost, upsizeCharge };
  }).filter(v => v.name && (v.price > 0 || v.cost > 0 || v.upsizeCharge > 0));
}

function clearDrinkForm() {
  const nameEl = document.getElementById('drinkName');
  if (nameEl) nameEl.value = '';
  const box = document.getElementById('drinkVariantRows');
  if (box) box.innerHTML = drinkVariantRowHtml('Regular', '', '', 0) + drinkVariantRowHtml('Grande', '', '', 0);
}

function saveAdminDrink() {
  if (!userIsAdmin()) return alert('Admin access only.');
  const nameEl = document.getElementById('drinkName');
  const name = nameEl ? nameEl.value.trim() : '';
  const variants = getDrinkFormVariants();

  if (!name || !variants.length || variants.some(v => v.price < 0 || v.cost < 0 || v.upsizeCharge < 0 || Number.isNaN(v.price) || Number.isNaN(v.cost) || Number.isNaN(v.upsizeCharge))) {
    return alert('Please enter a drink name and at least one valid size price.');
  }

  const data = getData();
  const existing = data.menu.find(item => item.category === 'drink' && cleanDrinkBaseName(item.name).toLowerCase() === cleanDrinkBaseName(name).toLowerCase());
  const regular = variants.find(v => v.name === 'Regular') || variants[0];

  if (existing) {
    existing.name = cleanDrinkBaseName(name);
    existing.price = regular.price;
    existing.cost = regular.cost;
    existing.upsizeCharge = 0;
    existing.variants = variants;
    existing.recipe = existing.recipe || [];
  } else {
    data.menu.push({ id: uid(), name: cleanDrinkBaseName(name), price: regular.price, cost: regular.cost, upsizeCharge: 0, variants, category: 'drink', recipe: [] });
  }

  saveData(data);
  clearDrinkForm();
  renderAll();
}

function editAdminDrink(id) {
  if (!userIsAdmin()) return alert('Admin access only.');
  const data = getData();
  const drink = data.menu.find(item => item.id === id && item.category === 'drink');
  if (!drink) return alert('Drink not found.');
  document.getElementById('drinkName').value = getDrinkDisplayName(drink);
  const variants = getDrinkVariants(drink);
  const box = document.getElementById('drinkVariantRows');
  if (box) {
    box.innerHTML = variants.map(v => drinkVariantRowHtml(v.name, v.price, v.cost, v.upsizeCharge)).join('');
  }
  ensureDrinkVariantRows();
  openAdminPopout('drinkAdminPanel');
}

function deleteAdminDrink(id) {
  if (!userIsAdmin()) return alert('Admin access only.');
  const data = getData();
  const drink = data.menu.find(item => item.id === id && item.category === 'drink');
  if (!drink) return;
  if (!confirm(`Delete drink option ${drink.name}?`)) return;
  data.menu = data.menu.filter(item => item.id !== id);
  saveData(data);
  renderAll();
}

function renderAdminDrinks() {
  const el = document.getElementById('adminDrinkList');
  if (!el) return;
  const data = getData();
  const drinks = data.menu.filter(item => item.category === 'drink');
  el.innerHTML = drinks.length ? drinks.map(drink => `
    <div class="list-row drink-admin-row">
      <div>
        <strong>${escapeHtml(getDrinkDisplayName(drink))}</strong><br>
        <small>${getDrinkVariants(drink).map(v => `${escapeHtml(v.name)}: ${peso.format(v.price)}${v.upsizeCharge > 0 ? ' · Combo +' + peso.format(v.upsizeCharge) : ''}`).join(' · ')}</small>
      </div>
      <div class="row-actions">
        <button onclick="editAdminDrink('${drink.id}')">Edit</button>
        <button onclick="deleteAdminDrink('${drink.id}')">Delete</button>
      </div>
    </div>`).join('') : '<p class="muted">No drinks added yet.</p>';
}

function renderAdminMenu() {
  const data = getData();
  const el = document.getElementById('adminMenuList');
  if (!el) return;
  el.innerHTML = data.menu.map(item => `
    <div class="list-row">
      <div>
        <strong>${item.name}</strong><br>
        <small>${item.category}${item.category === 'burger' && item.isPremiumAddon ? ' · Premium add-on' : ''} · Price: ${peso.format(item.price)} · Cost: ${peso.format(item.cost || 0)} · Profit: ${peso.format(Number(item.price) - Number(item.cost || 0))}${(item.recipe || []).length ? ' · Recipe: ' + item.recipe.map(r => `${r.name || (data.inventory.find(inv => inv.id === r.inventoryId) || {}).name || 'Raw'} (${r.qty})`).join(', ') : ' · No raw-material recipe set'}</small>
      </div>
      <div class="row-actions">
        <button onclick="quickEditMenu('${item.id}')">Edit</button>
        <button onclick="deleteMenuItem('${item.id}')">Delete</button>
      </div>
    </div>`).join('');
}

function quickEditMenu(id) {
  const data = getData();
  const item = data.menu.find(x => x.id === id);
  if (!item) return;
  document.getElementById('menuName').value = item.name;
  document.getElementById('menuPrice').value = item.price;
  document.getElementById('menuCost').value = Number(calculateRecipeCost(item.recipe || [], data).toFixed(2)) || '';
  document.getElementById('menuCategory').value = item.category;
  if (document.getElementById('menuPremiumAddon')) document.getElementById('menuPremiumAddon').checked = !!item.isPremiumAddon;
  renderMenuRecipeBuilder(item.recipe || []);
  openAdminPopout('menuAdminPanel');
}

function deleteMenuItem(id) {
  const data = getData();
  data.menu = data.menu.filter(x => x.id !== id);
  saveData(data);
  renderAll();
}


function addRawMaterialMaster() {
  const name = document.getElementById('rawMasterName').value.trim();
  const qty = Number(document.getElementById('rawMasterQty').value || 0);
  const unitCost = Number(document.getElementById('rawMasterUnitCost')?.value || 0);

  if (!name || qty < 0 || unitCost < 0 || Number.isNaN(qty) || Number.isNaN(unitCost)) {
    return alert('Please enter a valid raw material name, starting quantity, and unit cost/price.');
  }

  const data = getData();
  const existing = data.inventory.find(item => item.name.toLowerCase() === name.toLowerCase());

  if (existing) {
    return alert('This raw material already exists in the master list.');
  }

  data.inventory.push({
    id: uid(),
    name,
    qty,
    unitCost
  });

  saveData(data);

  document.getElementById('rawMasterName').value = '';
  document.getElementById('rawMasterQty').value = '';
  const rawMasterUnitCost = document.getElementById('rawMasterUnitCost');
  if (rawMasterUnitCost) rawMasterUnitCost.value = '';

  renderAll();
  alert(`${name} added to Raw Material Master List and is now available in the purchase dropdown.`);
}

function renderRawMasterList() {
  const data = getData();
  const el = document.getElementById('rawMasterList');
  if (!el) return;

  el.innerHTML = data.inventory.map(item => `
    <div class="list-row">
      <div>
        <strong>${item.name}</strong><br>
        <small>Current Qty: ${item.qty} · Unit Cost / Price: ${peso.format(Number(item.unitCost || 0))}</small>
      </div>
      <div class="row-actions">
        <button onclick="renameRawMaterial('${item.id}')">Rename</button>
        <button onclick="editRawMaterialQty('${item.id}')">Edit Qty</button>
        <button onclick="editRawMaterialCost('${item.id}')">Edit Price</button>
        <button onclick="deleteRawMaterialMaster('${item.id}')">Delete</button>
      </div>
    </div>
  `).join('') || '<p>No raw materials listed.</p>';
}

function renameRawMaterial(id) {
  const data = getData();
  const item = data.inventory.find(x => x.id === id);
  if (!item) return;

  const newName = prompt('Enter new raw material name:', item.name);
  if (newName === null) return;

  const cleanName = newName.trim();
  if (!cleanName) return alert('Raw material name cannot be empty.');

  const duplicate = data.inventory.find(x => x.id !== id && x.name.toLowerCase() === cleanName.toLowerCase());
  if (duplicate) return alert('Another raw material already uses this name.');

  const oldName = item.name;
  item.name = cleanName;

  data.rawDeliveries.forEach(record => {
    if (record.productName === oldName) record.productName = cleanName;
  });

  saveData(data);
  renderAll();
}

function editRawMaterialQty(id) {
  const data = getData();
  const item = data.inventory.find(x => x.id === id);
  if (!item) return;

  const value = prompt(`Enter new quantity for ${item.name}:`, item.qty);
  if (value === null) return;

  const newQty = Number(value);
  if (newQty < 0 || Number.isNaN(newQty)) return alert('Invalid quantity.');

  item.qty = newQty;
  saveData(data);
  renderAll();
}

function editRawMaterialCost(id) {
  const data = getData();
  const item = data.inventory.find(x => x.id === id);
  if (!item) return;

  const value = prompt(`Enter new unit cost / price for ${item.name}:`, item.unitCost || 0);
  if (value === null) return;

  const newCost = Number(value);
  if (newCost < 0 || Number.isNaN(newCost)) return alert('Invalid unit cost / price.');

  item.unitCost = newCost;
  data.menu.forEach(menuItem => {
    if ((menuItem.recipe || []).some(ingredient => ingredient.inventoryId === id)) {
      menuItem.cost = calculateRecipeCost(menuItem.recipe || [], data);
    }
  });
  saveData(data);
  renderAll();
}

function deleteRawMaterialMaster(id) {
  const data = getData();
  const item = data.inventory.find(x => x.id === id);
  if (!item) return;

  if (!confirm(`Delete ${item.name} from the raw material master list?\n\nThis will remove it from the purchase dropdown but will not delete old purchase records.`)) {
    return;
  }

  data.inventory = data.inventory.filter(x => x.id !== id);
  data.menu.forEach(menuItem => {
    menuItem.recipe = (menuItem.recipe || []).filter(ingredient => ingredient.inventoryId !== id);
  });
  saveData(data);
  renderAll();
}

function renderRawMaterialDeliveryProducts() {
  const data = getData();
  const select = document.getElementById('rawDeliveryProduct');
  if (!select) return;
  select.innerHTML = data.inventory.map(item => 
    `<option value="${item.id}">${item.name}</option>`
  ).join('');
}


function renderAdminCurrentInventory() {
  const data = getData();
  const el = document.getElementById('adminCurrentInventory');
  if (!el) return;
  el.innerHTML = data.inventory.map(item => `
    <div class="list-row readonly-row">
      <div>
        <strong>${item.name}</strong><br>
        <small>Current Qty: ${item.qty} · Unit Cost / Price: ${peso.format(Number(item.unitCost || 0))}</small>
      </div>
      <div class="row-actions">
        <button onclick="editRawMaterialQty('${item.id}')">Edit Qty</button>
        <button onclick="editRawMaterialCost('${item.id}')">Edit Price</button>
      </div>
    </div>
  `).join('') || '<p>No raw materials listed.</p>';
}

function rawPurchaseUnitLabel(unit) {
  if (unit === 'kg') return 'kg';
  if (unit === 'ml') return 'mL';
  if (unit === 'bottle') return 'bottle';
  if (unit === 'pack') return 'pack';
  if (unit === 'tray') return 'tray';
  return 'piece';
}

function handleRawPurchaseUnitChange() {
  const unit = document.getElementById('rawDeliveryUnitType')?.value || 'pack';
  const piecesInput = document.getElementById('rawDeliveryPiecesPerPack');
  const helper = document.getElementById('rawPurchaseHelper');
  const qtyInput = document.getElementById('rawDeliveryPackageQty');
  const priceInput = document.getElementById('rawDeliveryUnitPrice');

  if (!piecesInput || !helper) return;

  if (unit === 'pack') {
    piecesInput.disabled = false;
    piecesInput.placeholder = 'Pieces per pack e.g. 6';
    if (qtyInput) qtyInput.placeholder = 'No. of packs';
    if (priceInput) priceInput.placeholder = 'Price per pack ₱';
    helper.textContent = 'Example: Buns → 1 pack = ₱35, 1 pack has 6 pieces. Inventory adds 6 pieces and unit cost becomes ₱5.83 per piece.';
  } else {
    piecesInput.value = '';
    piecesInput.disabled = true;
    piecesInput.placeholder = 'Not needed for kg, mL, bottle, piece, or tray';
    if (qtyInput) qtyInput.placeholder = `Quantity in ${rawPurchaseUnitLabel(unit)}`;
    if (priceInput) priceInput.placeholder = `Price per ${rawPurchaseUnitLabel(unit)} ₱`;
    helper.textContent = `Example: Sauce → 2 ${rawPurchaseUnitLabel(unit)} at ₱120 each. Inventory adds 2 ${rawPurchaseUnitLabel(unit)} and unit cost is ₱120.`;
  }
}

function addRawPurchaseToCart() {
  const inventoryId = document.getElementById('rawDeliveryProduct').value;
  const purchaseUnit = document.getElementById('rawDeliveryUnitType')?.value || 'pack';
  const packageQty = Number(document.getElementById('rawDeliveryPackageQty').value);
  const piecesPerPackRaw = document.getElementById('rawDeliveryPiecesPerPack').value;
  const piecesPerPack = purchaseUnit === 'pack' ? Number(piecesPerPackRaw) : 1;
  const unitPrice = Number(document.getElementById('rawDeliveryUnitPrice').value);

  if (!inventoryId || packageQty <= 0 || unitPrice < 0 || Number.isNaN(unitPrice)) {
    return alert('Please select a raw material and enter valid purchase quantity and price.');
  }

  if (purchaseUnit === 'pack' && (piecesPerPack <= 0 || Number.isNaN(piecesPerPack))) {
    return alert('For pack purchases, please enter how many pieces are inside each pack.');
  }

  const data = getData();
  const material = data.inventory.find(x => x.id === inventoryId);
  if (!material) return alert('Raw material not found.');

  const bottleMl = Number(document.getElementById('rawDeliveryBottleMl')?.value || 0);
  let inventoryQty = purchaseUnit === 'pack' ? packageQty * piecesPerPack : packageQty;
  const totalMaterialCost = packageQty * unitPrice;
  let unitCost = inventoryQty > 0 ? totalMaterialCost / inventoryQty : 0;

  if (purchaseUnit === 'bottle' && bottleMl > 0) {
    inventoryQty = packageQty * bottleMl;
    unitCost = totalMaterialCost / inventoryQty;
  }

  rawPurchaseCart.push({
    id: uid(),
    inventoryId,
    productName: material.name,
    purchaseUnit,
    packageQty,
    piecesPerPack,
    qty: inventoryQty,
    inventoryQty,
    unitPrice,
    unitCost,
    totalMaterialCost,
    bottleMl
  });

  document.getElementById('rawDeliveryPackageQty').value = '';
  document.getElementById('rawDeliveryPiecesPerPack').value = '';
  document.getElementById('rawDeliveryUnitPrice').value = '';
  renderRawPurchaseCart();
}

function renderRawPurchaseCart() {
  const list = document.getElementById('rawPurchaseCartList');
  const totalBox = document.getElementById('rawPurchaseCartTotal');
  if (!list || !totalBox) return;

  const subtotal = rawPurchaseCart.reduce((sum, item) => sum + Number(item.totalMaterialCost || 0), 0);
  totalBox.textContent = peso.format(subtotal);

  list.innerHTML = rawPurchaseCart.length ? rawPurchaseCart.map(item => `
    <div class="list-row">
      <div>
        <strong>${item.productName}</strong><br>
        <small>${item.purchaseUnit === 'pack' ? `${item.packageQty} pack(s) × ${item.piecesPerPack} pcs = ${item.inventoryQty} pcs` : `${item.packageQty} ${rawPurchaseUnitLabel(item.purchaseUnit)} received`} · Price: ${peso.format(item.unitPrice)} / ${rawPurchaseUnitLabel(item.purchaseUnit)} · Unit Cost in Inventory: ${peso.format(item.unitCost)} · Amount: ${peso.format(item.totalMaterialCost)}</small>
      </div>
      <div class="row-actions">
        <button onclick="removeRawPurchaseCartItem('${item.id}')">Remove</button>
      </div>
    </div>
  `).join('') : '<p>No raw materials added yet.</p>';
}

function removeRawPurchaseCartItem(id) {
  rawPurchaseCart = rawPurchaseCart.filter(item => item.id !== id);
  renderRawPurchaseCart();
}

function completeRawPurchaseOrder() {
  if (!rawPurchaseCart.length) {
    return alert('Purchase cart is empty.');
  }

  const deliveryFeeInput = prompt('Enter delivery fee for all items:', '0');
  if (deliveryFeeInput === null) return;

  const deliveryFee = Number(deliveryFeeInput);
  if (deliveryFee < 0 || Number.isNaN(deliveryFee)) {
    return alert('Invalid delivery fee.');
  }

  const data = getData();
  const subtotal = rawPurchaseCart.reduce((sum, item) => sum + Number(item.totalMaterialCost || 0), 0);
  const totalExpense = subtotal + deliveryFee;

  const purchaseId = uid();
  const date = new Date().toISOString();

  rawPurchaseCart.forEach(cartItem => {
    const material = data.inventory.find(x => x.id === cartItem.inventoryId);
    if (material) {
      material.qty = Number(material.qty || 0) + Number(cartItem.inventoryQty || cartItem.qty || 0);
      material.unitCost = Number(cartItem.unitCost || cartItem.unitPrice || 0);
    }

    data.rawDeliveries.push({
      id: uid(),
      purchaseId,
      productName: cartItem.productName,
      qty: cartItem.inventoryQty || cartItem.qty,
      inventoryQty: cartItem.inventoryQty || cartItem.qty,
      purchaseUnit: cartItem.purchaseUnit || 'piece',
      packageQty: cartItem.packageQty || cartItem.qty,
      piecesPerPack: cartItem.piecesPerPack || 1,
      unitPrice: cartItem.unitPrice,
      unitCost: cartItem.unitCost || cartItem.unitPrice,
      deliveryFee: 0,
      totalMaterialCost: cartItem.totalMaterialCost,
      totalExpense: cartItem.totalMaterialCost,
      date
    });
  });

  data.rawDeliveries.push({
    id: uid(),
    purchaseId,
    productName: 'DELIVERY FEE - Raw Material Purchase',
    qty: 0,
    inventoryQty: 0,
    purchaseUnit: 'fee',
    packageQty: 1,
    piecesPerPack: 1,
    unitPrice: deliveryFee,
    unitCost: 0,
    deliveryFee,
    totalMaterialCost: 0,
    totalExpense: deliveryFee,
    date
  });

  saveData(data);
  rawPurchaseCart = [];
  renderAll();

  alert(`Raw material purchase saved.\nSubtotal: ${peso.format(subtotal)}\nDelivery Fee: ${peso.format(deliveryFee)}\nTotal Expense: ${peso.format(totalExpense)}`);
}


function resetTodayRawPurchaseRecords() {
  const data = getData();
  const todayRecords = todaysRawPurchaseRecords(data);

  if (!todayRecords.length) {
    return alert('There are no raw material purchase records saved for today. Current inventory quantities are unchanged.');
  }

  const todayExpense = todayRecords.reduce((sum, item) => sum + Number(item.totalExpense || 0), 0);
  const message = `Reset today's raw material purchase records?\n\nRecords to clear: ${todayRecords.length}\nDaily purchase expense to clear from records: ${peso.format(todayExpense)}\n\nThis will NOT subtract or change the current raw material quantities that were already added to inventory.`;

  if (!confirm(message)) return;

  data.rawDeliveries = (data.rawDeliveries || []).filter(item => !isTodayDate(item.date));
  saveData(data);
  renderAll();
  alert('Today’s raw material purchase records were reset. Current raw material quantities were not changed.');
}

function renderRawMaterialDeliveries() {
  const data = getData();
  const el = document.getElementById('deliveryList');
  if (!el) return;
  const records = data.rawDeliveries.filter(item => isTodayDate(item.date));
  el.innerHTML = records.length ? "<p class='muted'>Showing today's raw material purchase records only. This daily history automatically clears on the next day; saved raw material inventory remains.</p>" + records.slice().reverse().map(item => `
    <div class="list-row">
      <div>
        <strong>${item.productName}</strong><br>
        <small>
          Date: ${new Date(item.date).toLocaleString()} · 
          ${item.purchaseUnit === 'fee' ? 'Delivery fee for this purchase' : (item.purchaseUnit === 'pack' ? `Purchased: ${item.packageQty} pack(s) × ${item.piecesPerPack} pcs = ${item.inventoryQty || item.qty} pcs` : `Purchased: ${item.packageQty || item.qty} ${rawPurchaseUnitLabel(item.purchaseUnit)}`)} · 
          Raw Material Price: ${item.purchaseUnit === 'fee' ? peso.format(item.unitPrice) : `${peso.format(item.unitPrice)} / ${rawPurchaseUnitLabel(item.purchaseUnit)}`} · 
          Inventory Unit Cost: ${item.purchaseUnit === 'fee' ? peso.format(0) : peso.format(item.unitCost || item.unitPrice)} · 
          Material Cost: ${peso.format(item.totalMaterialCost)} · 
          Delivery Fee: ${peso.format(item.deliveryFee)} · 
          Total Expense: ${peso.format(item.totalExpense)}
        </small>
      </div>
      <div class="row-actions">
        <button onclick="deleteRawMaterialDelivery('${item.id}')">Delete Record</button>
      </div>
    </div>`).join('') : '<p>No raw material purchase records for today. Saved raw materials and inventory quantities are still kept.</p>';
}

function deleteRawMaterialDelivery(id) {
  const data = getData();
  data.rawDeliveries = data.rawDeliveries.filter(x => x.id !== id);
  saveData(data);
  renderAll();
}

function ordersForReport(type) {
  const data = getData();
  const now = new Date();
  return activeOrders(data.orders).filter(order => {
    const d = new Date(order.date);
    if (type === 'eod') return d.toDateString() === now.toDateString();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
}


function rawDeliveriesForReport(type) {
  const data = getData();
  const now = new Date();
  return data.rawDeliveries.filter(item => {
    const d = new Date(item.date);
    if (type === 'eod') return d.toDateString() === now.toDateString();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
}

function rawWasteForReport(type) {
  const data = getData();
  const now = new Date();
  return (data.rawWasteRecords || []).filter(item => {
    const d = new Date(item.date);
    if (type === 'eod') return d.toDateString() === now.toDateString();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
}

function generateReport(type) {
  const data = getData();

  let physicalInventoryRecord = null;
  let inventoryLossSummary = calculateInventoryLoss(null);

  if (type === 'month') {
    physicalInventoryRecord = getPhysicalInventoryRecord('month');
    if (!physicalInventoryRecord) {
      alert('Please complete and save the Monthly Physical Inventory Count first before generating the End of Month Report.');
      return;
    }

    inventoryLossSummary = calculateInventoryLoss(physicalInventoryRecord);
  }
  const now = new Date();
  const orders = ordersForReport(type);
  const totalSales = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const totalFoodCost = orders.reduce((sum, order) => sum + orderCost(order), 0);
  const rawDeliveryExpenses = rawDeliveriesForReport(type).reduce((sum, item) => sum + Number(item.totalExpense || 0), 0);
  const rawWasteExpenses = rawWasteForReport(type).reduce((sum, item) => sum + Number(item.totalCost || 0), 0);
  const inventoryLossAmount = inventoryLossSummary.lossAmount;
  const rawRecordsForCurrentReport = rawDeliveriesForReport(type);
  const deliveryFeeExpenses = rawRecordsForCurrentReport.reduce((sum, item) => sum + Number(item.deliveryFee || 0), 0);
  const materialPurchaseExpenses = rawRecordsForCurrentReport.reduce((sum, item) => sum + Number(item.totalMaterialCost || 0), 0);
  const totalCost = totalFoodCost + rawDeliveryExpenses + rawWasteExpenses + inventoryLossAmount;
  const totalProfit = totalSales - totalCost;

  const payments = orders.reduce((acc, order) => {
    acc[order.paymentMethod] = (acc[order.paymentMethod] || 0) + Number(order.total || 0);
    return acc;
  }, {});

  const bestSellers = {};
  orders.forEach(order => order.items.forEach(item => {
    bestSellers[item.name] = (bestSellers[item.name] || 0) + 1;
  }));

  const topItems = Object.entries(bestSellers).sort((a,b) => b[1]-a[1]).slice(0,5);

  const lines = [];
  lines.push(type === 'eod' ? 'END OF DAY PROFIT REPORT' : 'END OF MONTH PROFIT REPORT');
  lines.push(`Generated: ${now.toLocaleString()}`);
  lines.push('');
  lines.push(`Total Orders: ${orders.length}`);
  lines.push(`Gross Sales: ${peso.format(totalSales)}`);
  lines.push(`Food Cost from Sold Items: ${peso.format(totalFoodCost)}`);
  lines.push(`Raw Material Purchase Expenses: ${peso.format(materialPurchaseExpenses)}`);
  lines.push(`Delivery Fee Expenses: ${peso.format(deliveryFeeExpenses)}`);
  lines.push(`Raw Material + Delivery Total: ${peso.format(rawDeliveryExpenses)}`);
  lines.push(`Raw Material Waste Expense: ${peso.format(rawWasteExpenses)}`);
  lines.push(`Inventory Loss from Physical Count: ${peso.format(inventoryLossAmount)}`);
  lines.push(`Total Business Expenses Recorded: ${peso.format(totalCost)}`);
  lines.push(`Estimated Profit After All Recorded Expenses: ${peso.format(totalProfit)}`);
  lines.push(`Profit Margin: ${totalSales ? ((totalProfit / totalSales) * 100).toFixed(2) : '0.00'}%`);
  lines.push('');
  lines.push('Payment Breakdown:');
  Object.keys(payments).forEach(key => lines.push(`- ${key}: ${peso.format(payments[key])}`));
  if (!Object.keys(payments).length) lines.push('- No sales recorded.');

  const rawDeliveries = rawDeliveriesForReport(type);
  lines.push('');
  lines.push('Raw Material Delivery / Purchase Records:');
  rawDeliveries.forEach(item => {
    lines.push(`- ${item.productName}: Qty ${item.qty} · Unit Price ${peso.format(item.unitPrice)} · Material Cost ${peso.format(item.totalMaterialCost)} · Delivery Fee ${peso.format(item.deliveryFee)} · Total Expense ${peso.format(item.totalExpense)} · ${new Date(item.date).toLocaleString()}`);
  });
  if (!rawDeliveries.length) lines.push('- No raw material deliveries recorded.');

  const rawWasteRecords = rawWasteForReport(type);
  lines.push('');
  lines.push('Raw Material Waste Records:');
  rawWasteRecords.forEach(item => {
    lines.push(`- ${item.productName}: Waste Qty ${item.qty} · Unit Cost ${peso.format(item.unitCost)} · Waste Cost ${peso.format(item.totalCost)} · ${new Date(item.date).toLocaleString()}${item.reason ? ` · Reason: ${item.reason}` : ''}`);
  });
  if (!rawWasteRecords.length) lines.push('- No raw material waste recorded.');

  lines.push('');
  lines.push('Top Items:');
  topItems.forEach(([name, qty], index) => lines.push(`${index + 1}. ${name}: ${qty} sold`));
  if (!topItems.length) lines.push('- No items sold.');

  lines.push('');
  if (physicalInventoryRecord) {
    lines.push('');
    lines.push('Monthly Physical Inventory Count:');
    physicalInventoryRecord.items.forEach(item => {
      const varianceLabel = item.varianceQty < 0 ? 'LOSS' : item.varianceQty > 0 ? 'GAIN' : 'MATCH';
      const lossAmount = item.varianceQty < 0 ? Math.abs(item.varianceValue || 0) : 0;
      const gainAmount = item.varianceQty > 0 ? Math.abs(item.varianceValue || 0) : 0;
      lines.push(`- ${item.name}: System Qty ${item.systemQty} · Actual Qty ${item.actualQty} · Variance Qty ${item.varianceQty} · Unit Cost ${peso.format(item.unitCost)} · ${varianceLabel} Amount ${peso.format(Math.abs(item.varianceValue || 0))}`);
      if (lossAmount > 0) lines.push(`  Loss Computation: ${Math.abs(item.varianceQty)} missing × ${peso.format(item.unitCost)} = ${peso.format(lossAmount)}`);
      if (gainAmount > 0) lines.push(`  Gain Computation: ${item.varianceQty} extra × ${peso.format(item.unitCost)} = ${peso.format(gainAmount)}`);
    });
    lines.push(`Total Loss Qty: ${inventoryLossSummary.lossQty}`);
    lines.push(`Total Inventory Loss Amount: ${peso.format(inventoryLossSummary.lossAmount)}`);
    lines.push(`Total Gain Qty: ${inventoryLossSummary.gainQty}`);
    lines.push(`Total Inventory Gain Amount: ${peso.format(inventoryLossSummary.gainAmount)}`);
    lines.push(`Net Inventory Variance Amount: ${peso.format(inventoryLossSummary.netVarianceAmount)}`);
  }

  lines.push('');
  lines.push('Inventory Value Snapshot:');
  data.inventory.forEach(item => lines.push(`- ${item.name}: Qty ${item.qty} · Unit Cost ${peso.format(item.unitCost)} · Value ${peso.format(Number(item.qty) * Number(item.unitCost))}`));
  lines.push(`Total Inventory Value: ${peso.format(inventoryValue(data))}`);

  lines.push('');
  lines.push('Orders:');
  orders.forEach(order => {
    const referenceText = order.paymentReference ? ` | Ref ${order.paymentReference}` : '';
    const customerNumberText = order.customerNumber ? `${formatCustomerNumber(order.customerNumber)} | ` : '';
    lines.push(`${customerNumberText}Order ${order.id.slice(0, 8)} | ${new Date(order.date).toLocaleString()} | ${order.paymentMethod}${referenceText} | Sales ${peso.format(order.total || 0)} | Cost ${peso.format(orderCost(order))} | Profit ${peso.format(orderProfit(order))}`);
    groupedCartItems(order.items).forEach(item => lines.push(`  • ${item.name} x${item.qty}${item.sample && item.sample.details ? ` (${item.sample.details})` : ''}: Unit ${peso.format(item.unitPrice)} | Total ${peso.format(item.total)} | Cost ${peso.format(item.costTotal || 0)}`));
  });

  document.getElementById('reportOutput').textContent = lines.join('\n');
}

function exportDatabase() {
  const data = JSON.stringify(getData(), null, 2);

  if (USE_ANDROID_SQLITE) {
    AndroidDatabase.exportDatabase(data);
    alert('Database exported from Android SQLite.');
    return;
  }

  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'picka-burger-local-database.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function clearOnlyCart() {
  if (!confirm('Clear current unsaved cart only? Saved orders and database will remain.')) return;
  cart = [];
  selectedBurgerItems = [];
  renderAll();
}

bootAuth();

window.incrementBurgerItem = incrementBurgerItem;
window.decrementBurgerItem = decrementBurgerItem;
