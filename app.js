// ==========================================
// GESTIÓN PRO - APP COMPLETA CON FIREBASE
// ==========================================

// Estado Global
let products = [];
let sales = [];
let history = [];
let clients = [];
let suppliers = [];
let expenses = [];
let insumos = [];
let recipes = [];
let currentUser = null;
let settings = {
    businessName: 'Mi Negocio',
    currency: 'COP',
    defaultTax: 19,
    defaultMargin: 30,
    theme: 'light',
    monthlyGoal: 0
};
let editingId = null;
let editingClientId = null;
let editingSupplierId = null;
let editingExpenseId = null;
let charts = {};


// ==========================================
// INICIALIZACIÓN CON FIREBASE AUTH
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Esperar a que Firebase Auth confirme el usuario
    auth.onAuthStateChanged((user) => {
        if (user) {
            currentUser = user;
            initApp();
        } else {
            // No hay sesión, redirigir al login
            window.location.href = 'login.html';
        }
    });
});

async function initApp() {
    showAppLoading(true);
    try {
        // Verificar si el usuario está bloqueado
        const userDocSnap = await db.collection('users').doc(currentUser.uid).get();
        if (userDocSnap.exists && userDocSnap.data().blocked === true) {
            showBlockedMessage();
            return;
        }
        await loadAllData();
        initNavigation();
        initTheme();
        initForms();
        initFilters();
        initSettings();
        initBackup();
        initCalculator();
        initClients();
        initSuppliers();
        initExpenses();
        initCashClose();
        initInsumos();
        initRecipes();
        initMesas();
        initPendingOrders();
        initRoles();
        initLogout();
        renderAll();
        renderGoalProgress();
        renderClients();
        renderSuppliers();
        renderExpenses();
        showDate();
        showUserInfo();
        loadCustomization();
        checkOnboarding();
        initPlanSystem();
    } catch (error) {
        console.error('Error inicializando app:', error);
        showToast('Error cargando datos. Intenta recargar.', 'error');
    } finally {
        showAppLoading(false);
    }
}


function showAppLoading(show) {
    const el = document.getElementById('app-loading');
    if (el) el.style.display = show ? 'flex' : 'none';
}

function showBlockedMessage() {
    showAppLoading(false);
    document.querySelector('.app-layout').innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f1f5f9;padding:20px;">
            <div style="text-align:center;max-width:400px;background:white;padding:48px 32px;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,0.1);">
                <div style="font-size:4rem;margin-bottom:16px;">🚫</div>
                <h1 style="font-size:1.5rem;color:#1e293b;margin-bottom:12px;">Cuenta Suspendida</h1>
                <p style="color:#64748b;margin-bottom:24px;">Tu acceso ha sido deshabilitado. Contacta al administrador para más información.</p>
                <button onclick="auth.signOut().then(()=>window.location.href='login.html')" style="padding:12px 24px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:1rem;cursor:pointer;font-weight:600;">Cerrar Sesión</button>
            </div>
        </div>
    `;
}

function showUserInfo() {
    const el = document.getElementById('user-display');
    if (el && currentUser) {
        el.textContent = currentUser.displayName || currentUser.email;
    }
}

function initLogout() {
    const btn = document.getElementById('btn-logout');
    if (btn) {
        btn.addEventListener('click', async () => {
            if (confirm('¿Cerrar sesión?')) {
                await auth.signOut();
                window.location.href = 'login.html';
            }
        });
    }
}

// ==========================================
// FIRESTORE - GUARDAR Y CARGAR DATOS
// ==========================================
function userDoc() {
    return db.collection('users').doc(currentUser.uid);
}

function userCollection(name) {
    return userDoc().collection(name);
}


// Cargar todos los datos del usuario desde Firestore
async function loadAllData() {
    try {
        // Cargar settings del usuario
        const userDocSnap = await userDoc().get();
        if (userDocSnap.exists && userDocSnap.data().settings) {
            settings = { ...settings, ...userDocSnap.data().settings };
        }

        // Cargar colecciones
        const [productsSnap, salesSnap, historySnap, clientsSnap, suppliersSnap, expensesSnap, insumosSnap, recipesSnap] = await Promise.all([
            userCollection('products').get(),
            userCollection('sales').orderBy('date', 'desc').limit(500).get(),
            userCollection('history').orderBy('date', 'desc').limit(200).get(),
            userCollection('clients').get(),
            userCollection('suppliers').get(),
            userCollection('expenses').get(),
            userCollection('insumos').get(),
            userCollection('recipes').get()
        ]);

        products = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        sales = salesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        history = historySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        clients = clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        suppliers = suppliersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        expenses = expensesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        insumos = insumosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        recipes = recipesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('Error cargando datos:', error);
        throw error;
    }
}


// Funciones de guardado en Firestore
async function saveProduct(product) {
    try {
        await userCollection('products').doc(product.id).set(product);
    } catch (e) { console.error('Error guardando producto:', e); }
}

async function deleteProductFromDB(id) {
    try {
        await userCollection('products').doc(id).delete();
    } catch (e) { console.error('Error eliminando producto:', e); }
}

async function saveSale(sale) {
    try {
        await userCollection('sales').doc(sale.id).set(sale);
    } catch (e) { console.error('Error guardando venta:', e); }
}

async function saveHistoryItem(item) {
    try {
        await userCollection('history').doc(item.id).set(item);
    } catch (e) { console.error('Error guardando historial:', e); }
}

async function saveClient(client) {
    try {
        await userCollection('clients').doc(client.id).set(client);
    } catch (e) { console.error('Error guardando cliente:', e); }
}

async function deleteClientFromDB(id) {
    try {
        await userCollection('clients').doc(id).delete();
    } catch (e) { console.error('Error eliminando cliente:', e); }
}

async function saveSupplier(supplier) {
    try {
        await userCollection('suppliers').doc(supplier.id).set(supplier);
    } catch (e) { console.error('Error guardando proveedor:', e); }
}

async function deleteSupplierFromDB(id) {
    try {
        await userCollection('suppliers').doc(id).delete();
    } catch (e) { console.error('Error eliminando proveedor:', e); }
}


async function saveExpense(expense) {
    try {
        await userCollection('expenses').doc(expense.id).set(expense);
    } catch (e) { console.error('Error guardando gasto:', e); }
}

async function deleteExpenseFromDB(id) {
    try {
        await userCollection('expenses').doc(id).delete();
    } catch (e) { console.error('Error eliminando gasto:', e); }
}

async function saveSettings() {
    try {
        await userDoc().update({ settings: settings });
    } catch (e) { console.error('Error guardando settings:', e); }
}

async function clearHistoryFromDB() {
    try {
        const batch = db.batch();
        const snap = await userCollection('history').get();
        snap.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    } catch (e) { console.error('Error limpiando historial:', e); }
}

async function clearAllDataFromDB() {
    try {
        const collections = ['products', 'sales', 'history', 'clients', 'suppliers', 'expenses', 'insumos', 'recipes', 'mesas', 'orders'];
        for (const col of collections) {
            const snap = await userCollection(col).get();
            const batch = db.batch();
            snap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        }
    } catch (e) { console.error('Error borrando datos:', e); }
}


// ==========================================
// NAVEGACIÓN
// ==========================================
function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.dataset.section;
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.getElementById(`page-${section}`).classList.add('active');
            if (window.innerWidth <= 900) sidebar.classList.remove('open');
            if (section === 'dashboard') { renderCharts(); renderGoalProgress(); }
            if (section === 'reports') renderReports();
            if (section === 'alerts') renderAlerts();
            if (section === 'sales') updateSaleProductList();
            if (section === 'cashclose') renderCashClose();
            if (section === 'clients') renderClients();
            if (section === 'suppliers') renderSuppliers();
            if (section === 'expenses') renderExpenses();
            if (section === 'insumos') renderInsumos();
            if (section === 'recipes') { updateRecipeProductList(); renderRecipes(); }
            if (section === 'mesas') { loadMesas(); }
        });
    });

    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }
}


// ==========================================
// TEMA OSCURO/CLARO
// ==========================================
function initTheme() {
    const btnTheme = document.getElementById('btn-theme');
    applyTheme(settings.theme);
    btnTheme.addEventListener('click', () => {
        settings.theme = settings.theme === 'light' ? 'dark' : 'light';
        applyTheme(settings.theme);
        saveSettings();
    });
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = document.getElementById('btn-theme');
    btn.textContent = theme === 'light' ? '🌙 Modo Oscuro' : '☀️ Modo Claro';
}

function showDate() {
    const el = document.getElementById('current-date');
    if (el) {
        const now = new Date();
        el.textContent = now.toLocaleDateString('es-MX', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
    }
}


// ==========================================
// FORMULARIO DE PRODUCTOS
// ==========================================
function initForms() {
    const form = document.getElementById('product-form');
    const costInput = document.getElementById('product-cost');
    const marginInput = document.getElementById('profit-margin');
    const btnCancel = document.getElementById('btn-cancel');
    const btnUseSuggested = document.getElementById('btn-use-suggested');

    form.addEventListener('submit', handleProductSubmit);
    btnCancel.addEventListener('click', cancelEdit);
    btnUseSuggested.addEventListener('click', useSuggestedPrice);
    costInput.addEventListener('input', updateSuggestedPrice);
    marginInput.addEventListener('input', updateSuggestedPrice);

    // Ventas
    const saleForm = document.getElementById('sale-form');
    saleForm.addEventListener('submit', handleSaleSubmit);
    document.getElementById('sale-product').addEventListener('change', updateSalePreview);
    document.getElementById('sale-quantity').addEventListener('input', updateSalePreview);
    document.getElementById('sale-price').addEventListener('input', updateSalePreview);
    document.getElementById('sale-discount').addEventListener('input', updateSalePreview);

    // Export/Import
    document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
    document.getElementById('btn-import-csv').addEventListener('click', () => {
        document.getElementById('file-import').click();
    });
    document.getElementById('file-import').addEventListener('change', importCSV);
    document.getElementById('btn-export-sales').addEventListener('click', exportSalesCSV);
    document.getElementById('btn-export-report').addEventListener('click', exportReport);
    document.getElementById('btn-filter-sales').addEventListener('click', renderSalesTable);
    document.getElementById('btn-clear-history').addEventListener('click', clearHistory);
}


function calculateSuggestedPrice(cost, margin) {
    if (!cost || cost <= 0) return 0;
    return cost * (1 + (margin || 30) / 100);
}

function updateSuggestedPrice() {
    const cost = parseFloat(document.getElementById('product-cost').value);
    const margin = parseFloat(document.getElementById('profit-margin').value);
    const box = document.getElementById('suggested-price-box');
    const val = document.getElementById('suggested-price-value');

    if (cost > 0) {
        val.textContent = formatCurrency(calculateSuggestedPrice(cost, margin));
        box.style.display = 'flex';
    } else {
        box.style.display = 'none';
    }
}

function useSuggestedPrice() {
    const cost = parseFloat(document.getElementById('product-cost').value);
    const margin = parseFloat(document.getElementById('profit-margin').value);
    document.getElementById('product-price').value = calculateSuggestedPrice(cost, margin).toFixed(2);
}


function handleProductSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('product-name').value.trim();
    const category = document.getElementById('product-category').value;
    const quantity = parseInt(document.getElementById('product-quantity').value) || 0;
    const cost = parseFloat(document.getElementById('product-cost').value) || 0;
    const margin = parseFloat(document.getElementById('profit-margin').value) || 30;
    const minStock = parseInt(document.getElementById('product-min-stock').value) || 5;
    const supplier = document.getElementById('product-supplier').value.trim();
    let price = parseFloat(document.getElementById('product-price').value);

    if (!price || price <= 0) price = calculateSuggestedPrice(cost, margin);
    if (!name || !category || cost <= 0) {
        showToast('Completa nombre, categoría y costo.', 'error');
        return;
    }

    const product = {
        id: editingId || generateId(),
        name, category, quantity, cost, margin, price, minStock, supplier,
        createdAt: editingId ? getProduct(editingId)?.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    if (editingId) {
        const idx = products.findIndex(p => p.id === editingId);
        products[idx] = product;
        addHistory('edit', `Producto actualizado: ${name}`);
        showToast(`"${name}" actualizado`, 'success');
        editingId = null;
        document.getElementById('btn-submit').textContent = 'Agregar Producto';
        document.getElementById('btn-cancel').style.display = 'none';
        document.getElementById('form-title').textContent = '➕ Agregar Producto';
    } else {
        products.push(product);
        addHistory('add', `Producto agregado: ${name} (x${quantity})`);
        showToast(`"${name}" agregado al inventario`, 'success');
    }

    saveProduct(product);
    renderAll();
    e.target.reset();
    document.getElementById('profit-margin').value = settings.defaultMargin;
    document.getElementById('product-min-stock').value = '5';
    document.getElementById('suggested-price-box').style.display = 'none';
}


function cancelEdit() {
    editingId = null;
    document.getElementById('product-form').reset();
    document.getElementById('profit-margin').value = settings.defaultMargin;
    document.getElementById('btn-submit').textContent = 'Agregar Producto';
    document.getElementById('btn-cancel').style.display = 'none';
    document.getElementById('form-title').textContent = '➕ Agregar Producto';
    document.getElementById('suggested-price-box').style.display = 'none';
}

function editProduct(id) {
    const p = getProduct(id);
    if (!p) return;
    editingId = id;
    document.getElementById('product-name').value = p.name;
    document.getElementById('product-category').value = p.category;
    document.getElementById('product-quantity').value = p.quantity;
    document.getElementById('product-cost').value = p.cost;
    document.getElementById('profit-margin').value = p.margin;
    document.getElementById('product-price').value = p.price;
    document.getElementById('product-min-stock').value = p.minStock || 5;
    document.getElementById('product-supplier').value = p.supplier || '';
    document.getElementById('btn-submit').textContent = 'Actualizar Producto';
    document.getElementById('btn-cancel').style.display = 'inline-block';
    document.getElementById('form-title').textContent = '✏️ Editar Producto';
    updateSuggestedPrice();
    document.getElementById('product-form').scrollIntoView({ behavior: 'smooth' });
}

function deleteProduct(id) {
    const p = getProduct(id);
    if (!p) return;
    if (confirm(`¿Eliminar "${p.name}"?`)) {
        products = products.filter(pr => pr.id !== id);
        addHistory('delete', `Producto eliminado: ${p.name}`);
        deleteProductFromDB(id);
        renderAll();
        showToast(`"${p.name}" eliminado`, 'warning');
    }
}


// ==========================================
// SISTEMA DE VENTAS
// ==========================================
function updateSaleProductList() {
    const select = document.getElementById('sale-product');
    select.innerHTML = '<option value="">Seleccionar producto...</option>';
    products.filter(p => p.quantity > 0).forEach(p => {
        select.innerHTML += `<option value="${p.id}">${p.name} (Stock: ${p.quantity}) - ${formatCurrency(p.price)}</option>`;
    });
}

function updateSalePreview() {
    const productId = document.getElementById('sale-product').value;
    const qty = parseInt(document.getElementById('sale-quantity').value) || 0;
    const customPrice = parseFloat(document.getElementById('sale-price').value);
    const discount = parseFloat(document.getElementById('sale-discount').value) || 0;
    const summary = document.getElementById('sale-summary');

    if (!productId || qty <= 0) { summary.style.display = 'none'; return; }

    const product = getProduct(productId);
    if (!product) return;

    const price = customPrice > 0 ? customPrice : product.price;
    const bruto = price * qty;
    const descuentoMonto = bruto * (discount / 100);
    const subtotal = bruto - descuentoMonto;
    const profit = subtotal - (product.cost * qty);

    document.getElementById('sale-subtotal').textContent = formatCurrency(subtotal);
    document.getElementById('sale-discount-amount').textContent = '- ' + formatCurrency(descuentoMonto);
    document.getElementById('sale-discount-row').style.display = discount > 0 ? 'flex' : 'none';
    document.getElementById('sale-profit-preview').textContent = formatCurrency(profit);
    document.getElementById('sale-profit-preview').className = profit >= 0 ? 'profit-positive' : 'profit-negative';
    summary.style.display = 'block';
}


function handleSaleSubmit(e) {
    e.preventDefault();
    const productId = document.getElementById('sale-product').value;
    const qty = parseInt(document.getElementById('sale-quantity').value) || 0;
    const customPrice = parseFloat(document.getElementById('sale-price').value);
    const discount = parseFloat(document.getElementById('sale-discount').value) || 0;
    const client = document.getElementById('sale-client').value.trim();
    const method = document.getElementById('sale-method').value;
    const notes = document.getElementById('sale-notes').value.trim();

    if (!productId) { showToast('Selecciona un producto', 'error'); return; }
    const product = getProduct(productId);
    if (!product) return;
    if (qty <= 0) { showToast('La cantidad debe ser mayor a 0', 'error'); return; }
    if (qty > product.quantity) {
        showToast(`Solo hay ${product.quantity} unidades disponibles`, 'error'); return;
    }

    const price = customPrice > 0 ? customPrice : product.price;
    const bruto = price * qty;
    const descuentoMonto = bruto * (discount / 100);
    const total = bruto - descuentoMonto;
    const sale = {
        id: generateId(),
        productId, productName: product.name,
        quantity: qty, price, cost: product.cost,
        discount, discountAmount: descuentoMonto,
        total, profit: total - (product.cost * qty),
        client, method, notes,
        date: new Date().toISOString()
    };

    sales.push(sale);
    // Descontar stock
    const idx = products.findIndex(p => p.id === productId);
    products[idx].quantity -= qty;

    addHistory('sale', `Venta: ${qty}x ${product.name} por ${formatCurrency(sale.total)}`);
    saveSale(sale);
    saveProduct(products[idx]);
    deductInsumosFromSale(productId, qty);
    renderAll();
    renderGoalProgress();
    showToast(`Venta registrada: ${qty}x ${product.name}`, 'success');
    lastSale = sale;
    e.target.reset();
    document.getElementById('sale-summary').style.display = 'none';
    document.getElementById('sale-discount-row').style.display = 'none';
    updateSaleProductList();
    if (confirm('Venta registrada. ¿Quieres imprimir el ticket?')) {
        printSaleTicket(sale);
    }
}


// ==========================================
// RECIBO IMPRIMIBLE
// ==========================================
let lastSale = null;

function printReceipt(sale) {
    const fecha = new Date(sale.date).toLocaleString('es-CO');
    const win = window.open('', '_blank', 'width=380,height=600');
    if (!win) { showToast('Permite las ventanas emergentes para imprimir', 'warning'); return; }
    const bruto = sale.price * sale.quantity;
    win.document.write(`
        <html><head><title>Recibo</title><style>
            body { font-family: 'Courier New', monospace; padding: 16px; font-size: 13px; color: #000; }
            h2 { text-align: center; margin: 4px 0; }
            .center { text-align: center; }
            hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
            .row { display: flex; justify-content: space-between; margin: 3px 0; }
            .total { font-weight: bold; font-size: 15px; }
            .muted { color: #555; font-size: 11px; }
        </style></head><body>
            <h2>${esc(settings.businessName)}</h2>
            <div class="center muted">RECIBO DE VENTA</div>
            <div class="center muted">${fecha}</div>
            <hr>
            <div class="row"><span>Producto:</span><span>${esc(sale.productName)}</span></div>
            <div class="row"><span>Cantidad:</span><span>${sale.quantity}</span></div>
            <div class="row"><span>Precio unit.:</span><span>${formatCurrency(sale.price)}</span></div>
            <div class="row"><span>Subtotal:</span><span>${formatCurrency(bruto)}</span></div>
            ${sale.discount > 0 ? `<div class="row"><span>Descuento (${sale.discount}%):</span><span>- ${formatCurrency(sale.discountAmount)}</span></div>` : ''}
            <hr>
            <div class="row total"><span>TOTAL:</span><span>${formatCurrency(sale.total)}</span></div>
            <hr>
            <div class="row"><span>Pago:</span><span>${esc(sale.method)}</span></div>
            ${sale.client ? `<div class="row"><span>Cliente:</span><span>${esc(sale.client)}</span></div>` : ''}
            ${sale.notes ? `<div class="muted">Nota: ${esc(sale.notes)}</div>` : ''}
            <hr>
            <div class="center muted">¡Gracias por su compra!</div>
            <script>window.onload = function(){ window.print(); }<\/script>
        </body></html>
    `);
    win.document.close();
}


// ==========================================
// FILTROS
// ==========================================
function initFilters() {
    document.getElementById('search-input').addEventListener('input', renderInventoryTable);
    document.getElementById('filter-category').addEventListener('change', renderInventoryTable);
    document.getElementById('filter-stock').addEventListener('change', renderInventoryTable);
    document.getElementById('sort-by').addEventListener('change', renderInventoryTable);
    updateCategoryFilter();
}

function updateCategoryFilter() {
    const select = document.getElementById('filter-category');
    const cats = [...new Set(products.map(p => p.category))].sort();
    select.innerHTML = '<option value="">Todas las categorías</option>';
    cats.forEach(c => { select.innerHTML += `<option value="${c}">${c}</option>`; });
}

// ==========================================
// RENDERIZADO
// ==========================================
function renderAll() {
    renderInventoryTable();
    renderSalesTable();
    updateDashboardStats();
    updateCategoryFilter();
    checkAlerts();
}


function renderInventoryTable() {
    const search = document.getElementById('search-input').value.toLowerCase().trim();
    const catFilter = document.getElementById('filter-category').value;
    const stockFilter = document.getElementById('filter-stock').value;
    const sortBy = document.getElementById('sort-by').value;
    const tbody = document.getElementById('inventory-body');
    const emptyMsg = document.getElementById('empty-message');

    let filtered = [...products];

    if (search) filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(search) || p.category.toLowerCase().includes(search) ||
        (p.supplier && p.supplier.toLowerCase().includes(search))
    );
    if (catFilter) filtered = filtered.filter(p => p.category === catFilter);
    if (stockFilter === 'low') filtered = filtered.filter(p => p.quantity > 0 && p.quantity <= (p.minStock || 5));
    if (stockFilter === 'out') filtered = filtered.filter(p => p.quantity === 0);
    if (stockFilter === 'ok') filtered = filtered.filter(p => p.quantity > (p.minStock || 5));

    switch(sortBy) {
        case 'name': filtered.sort((a,b) => a.name.localeCompare(b.name)); break;
        case 'price-asc': filtered.sort((a,b) => a.price - b.price); break;
        case 'price-desc': filtered.sort((a,b) => b.price - a.price); break;
        case 'stock-asc': filtered.sort((a,b) => a.quantity - b.quantity); break;
        case 'margin-desc': filtered.sort((a,b) => ((b.price-b.cost)/b.cost) - ((a.price-a.cost)/a.cost)); break;
        case 'recent': filtered.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)); break;
    }

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        emptyMsg.style.display = 'block';
        return;
    }
    emptyMsg.style.display = 'none';

    tbody.innerHTML = filtered.map(p => {
        const profit = p.price - p.cost;
        const margin = ((profit / p.cost) * 100).toFixed(1);
        const suggested = calculateSuggestedPrice(p.cost, p.margin);
        let stockClass = '', stockText = p.quantity;
        if (p.quantity === 0) { stockClass = 'no-stock'; stockText = '0 ❌'; }
        else if (p.quantity <= (p.minStock || 5)) { stockClass = 'low-stock'; stockText = `${p.quantity} ⚠️`; }
        let mClass = margin < 20 ? 'margin-low' : margin >= 50 ? 'margin-high' : 'margin-medium';

        return `<tr>
            <td><strong>${esc(p.name)}</strong></td>
            <td>${esc(p.category)}</td>
            <td class="${stockClass}">${stockText}</td>
            <td>${formatCurrency(p.cost)}</td>
            <td><strong>${formatCurrency(p.price)}</strong></td>
            <td>${formatCurrency(suggested)}</td>
            <td class="${profit>=0?'profit-positive':'profit-negative'}">${formatCurrency(profit)}</td>
            <td><span class="margin-badge ${mClass}">${margin}%</span></td>
            <td>
                <button class="action-btn" onclick="editProduct('${p.id}')" title="Editar">✏️</button>
                <button class="action-btn" onclick="deleteProduct('${p.id}')" title="Eliminar">🗑️</button>
            </td>
        </tr>`;
    }).join('');
}


function renderSalesTable() {
    const tbody = document.getElementById('sales-body');
    const emptyMsg = document.getElementById('empty-sales');
    const from = document.getElementById('sales-date-from').value;
    const to = document.getElementById('sales-date-to').value;

    let filtered = [...sales].sort((a,b) => new Date(b.date) - new Date(a.date));
    if (from) filtered = filtered.filter(s => s.date >= from);
    if (to) filtered = filtered.filter(s => s.date <= to + 'T23:59:59');

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        emptyMsg.style.display = 'block';
        return;
    }
    emptyMsg.style.display = 'none';

    tbody.innerHTML = filtered.slice(0, 50).map(s => {
        const voided = s.voided === true;
        return `<tr style="${voided ? 'opacity:0.5;text-decoration:line-through;' : ''}">
        <td>${new Date(s.date).toLocaleDateString('es-MX', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</td>
        <td>${esc(s.productName)}${voided ? ' ❌' : ''}</td>
        <td>${s.quantity}</td>
        <td>${formatCurrency(s.price)}</td>
        <td><strong>${formatCurrency(s.total)}</strong></td>
        <td class="${s.profit>=0?'profit-positive':'profit-negative'}">${formatCurrency(s.profit)}</td>
        <td>${s.method}</td>
        <td>${esc(s.client || '-')}</td>
        <td>${!voided ? `<button class="action-btn" onclick="voidSale('${s.id}')" title="Anular venta">❌</button>` : '<span style="font-size:0.75rem;color:var(--danger);">Anulada</span>'}</td>
    </tr>`;
    }).join('');
}

// ==========================================
// DASHBOARD STATS
// ==========================================
function updateDashboardStats() {
    const totalProducts = products.length;
    const totalStock = products.reduce((s,p) => s + p.quantity, 0);
    const investment = products.reduce((s,p) => s + (p.cost * p.quantity), 0);
    const revenue = products.reduce((s,p) => s + (p.price * p.quantity), 0);
    const profit = revenue - investment;

    const today = new Date().toISOString().split('T')[0];
    const salesToday = sales.filter(s => s.date.startsWith(today));
    const salesTodayTotal = salesToday.reduce((s,v) => s + v.total, 0);

    const thisMonth = new Date().toISOString().slice(0,7);
    const salesMonth = sales.filter(s => s.date.startsWith(thisMonth));
    const salesMonthTotal = salesMonth.reduce((s,v) => s + v.total, 0);

    const profitMonth = salesMonth.reduce((s,v) => s + v.profit, 0);
    const expensesMonth = expenses.filter(e => e.date.startsWith(thisMonth)).reduce((s,e) => s + e.amount, 0);
    const netProfitMonth = profitMonth - expensesMonth;

    setText('dash-total-products', totalProducts);
    setText('dash-total-stock', totalStock);
    setText('dash-investment', formatCurrency(investment));
    setText('dash-profit', formatCurrency(profit));
    setText('dash-sales-today', formatCurrency(salesTodayTotal));
    setText('dash-sales-month', formatCurrency(salesMonthTotal));
    setText('dash-expenses-month', formatCurrency(expensesMonth));
    setText('dash-net-profit', formatCurrency(netProfitMonth));
    const netEl = document.getElementById('dash-net-profit');
    if (netEl) netEl.style.color = netProfitMonth >= 0 ? 'var(--success)' : 'var(--danger)';
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}


// ==========================================
// GRÁFICAS (Chart.js)
// ==========================================
function renderCharts() {
    if (typeof Chart === 'undefined') return;
    Object.values(charts).forEach(c => c.destroy && c.destroy());
    charts = {};
    renderSalesWeekChart();
    renderTopProductsChart();
    renderCategoriesChart();
    renderProfitCategoryChart();
}

function renderSalesWeekChart() {
    const ctx = document.getElementById('chart-sales-week');
    if (!ctx) return;
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        const label = d.toLocaleDateString('es-MX', {weekday:'short', day:'numeric'});
        const total = sales.filter(s => s.date.startsWith(key)).reduce((sum,s) => sum+s.total, 0);
        last7.push({label, total});
    }
    charts.salesWeek = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: last7.map(d => d.label),
            datasets: [{ label: 'Ventas ($)', data: last7.map(d => d.total), backgroundColor: 'rgba(37,99,235,0.6)', borderRadius: 6 }]
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
}

function renderTopProductsChart() {
    const ctx = document.getElementById('chart-top-products');
    if (!ctx) return;
    const productSales = {};
    sales.forEach(s => { productSales[s.productName] = (productSales[s.productName]||0) + s.quantity; });
    const sorted = Object.entries(productSales).sort((a,b) => b[1]-a[1]).slice(0,5);
    charts.topProducts = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: sorted.map(s => s[0]),
            datasets: [{ data: sorted.map(s => s[1]), backgroundColor: ['#2563eb','#16a34a','#f59e0b','#dc2626','#8b5cf6'] }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
}

function renderCategoriesChart() {
    const ctx = document.getElementById('chart-categories');
    if (!ctx) return;
    const cats = {};
    products.forEach(p => { cats[p.category] = (cats[p.category]||0) + p.quantity; });
    const entries = Object.entries(cats).sort((a,b) => b[1]-a[1]);
    charts.categories = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: entries.map(e => e[0]),
            datasets: [{ data: entries.map(e => e[1]), backgroundColor: ['#2563eb','#16a34a','#f59e0b','#dc2626','#8b5cf6','#ec4899','#14b8a6','#f97316'] }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
}

function renderProfitCategoryChart() {
    const ctx = document.getElementById('chart-profit-category');
    if (!ctx) return;
    const catProfit = {};
    sales.forEach(s => { catProfit[getProduct(s.productId)?.category || 'Otro'] = (catProfit[getProduct(s.productId)?.category || 'Otro']||0) + s.profit; });
    const entries = Object.entries(catProfit).sort((a,b) => b[1]-a[1]);
    charts.profitCat = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: entries.map(e => e[0]),
            datasets: [{ label: 'Ganancia ($)', data: entries.map(e => e[1]), backgroundColor: 'rgba(22,163,74,0.6)', borderRadius: 6 }]
        },
        options: { responsive: true, indexAxis: 'y', plugins: { legend: { display: false } } }
    });
}


// ==========================================
// CALCULADORA DE COSTOS
// ==========================================
function initCalculator() {
    document.getElementById('btn-calculate').addEventListener('click', calculate);
    document.getElementById('btn-simulate').addEventListener('click', simulate);
    document.getElementById('btn-breakeven').addEventListener('click', calcBreakEven);
    document.getElementById('btn-ice').addEventListener('click', calcIceCream);
    document.getElementById('btn-ice-save').addEventListener('click', saveIceProduct);
}

let lastIceCalc = null;

function calcIceCream() {
    const boxWeight = parseFloat(document.getElementById('ice-box-weight').value) || 0;
    const boxCost = parseFloat(document.getElementById('ice-box-cost').value) || 0;
    const scoopWeight = parseFloat(document.getElementById('ice-scoop-weight').value) || 0;
    const scoopPrice = parseFloat(document.getElementById('ice-scoop-price').value) || 0;
    const extraCost = parseFloat(document.getElementById('ice-extra-cost').value) || 0;
    const waste = parseFloat(document.getElementById('ice-waste').value) || 0;
    const results = document.getElementById('ice-results');

    if (boxWeight <= 0 || scoopWeight <= 0) {
        showToast('Ingresa el peso de la caja y de la bolita', 'error');
        return;
    }

    const usableWeight = boxWeight * (1 - waste / 100);
    const scoops = Math.floor(usableWeight / scoopWeight);
    const revenue = scoops * scoopPrice;
    const totalCost = boxCost + (extraCost * scoops);
    const profit = revenue - totalCost;
    const profitPerScoop = scoops > 0 ? profit / scoops : 0;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

    document.getElementById('ice-scoops').textContent = scoops.toLocaleString('es-CO') + ' bolitas';
    document.getElementById('ice-revenue').textContent = formatCurrency(revenue);
    document.getElementById('ice-total-cost').textContent = formatCurrency(totalCost);
    document.getElementById('ice-profit').textContent = formatCurrency(profit);
    document.getElementById('ice-profit-scoop').textContent = formatCurrency(profitPerScoop);
    document.getElementById('ice-margin').textContent = margin.toFixed(1) + '%';

    const profitEl = document.getElementById('ice-profit');
    profitEl.parentElement.className = 'calc-result-item ' + (profit >= 0 ? 'success' : '');
    profitEl.style.color = profit >= 0 ? 'var(--success)' : 'var(--danger)';

    const costPerScoop = scoops > 0 ? (boxCost / scoops) + extraCost : 0;
    lastIceCalc = { scoops, scoopPrice, costPerScoop };
    results.style.display = 'block';
}


function saveIceProduct() {
    if (!lastIceCalc || lastIceCalc.scoops <= 0) {
        showToast('Primero calcula la caja de helado', 'error');
        return;
    }
    const name = prompt('Nombre del producto (bolita de helado):', 'Helado - bolita');
    if (!name || !name.trim()) return;

    const cost = Math.round(lastIceCalc.costPerScoop * 100) / 100;
    const price = lastIceCalc.scoopPrice;
    const margin = cost > 0 ? Math.round(((price - cost) / cost) * 100) : settings.defaultMargin;

    const product = {
        id: generateId(),
        name: name.trim(),
        category: 'Alimentos',
        quantity: lastIceCalc.scoops,
        cost: cost,
        margin: margin,
        price: price,
        minStock: 5,
        supplier: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    products.push(product);
    saveProduct(product);
    renderAll();
    addHistory('add', `Producto creado desde calculadora de helado: ${product.name} (x${product.quantity} bolitas)`);
    showToast(`"${product.name}" agregado al inventario (${product.quantity} bolitas)`, 'success');
}

function calculate() {
    const cost = parseFloat(document.getElementById('calc-cost').value) || 0;
    const shipping = parseFloat(document.getElementById('calc-shipping').value) || 0;
    const packaging = parseFloat(document.getElementById('calc-packaging').value) || 0;
    const tax = parseFloat(document.getElementById('calc-tax').value) || 0;
    const commission = parseFloat(document.getElementById('calc-commission').value) || 0;
    const margin = parseFloat(document.getElementById('calc-margin').value) || 0;

    const baseCost = cost + shipping + packaging;
    const taxAmount = baseCost * (tax / 100);
    const totalWithTax = baseCost + taxAmount;
    const commissionAmount = totalWithTax * (commission / 100);
    const minPrice = totalWithTax + commissionAmount;
    const suggested = minPrice * (1 + margin / 100);
    const profitUnit = suggested - minPrice;

    document.getElementById('calc-total-cost').textContent = formatCurrency(baseCost);
    document.getElementById('calc-tax-amount').textContent = formatCurrency(taxAmount);
    document.getElementById('calc-commission-amount').textContent = formatCurrency(commissionAmount);
    document.getElementById('calc-min-price').textContent = formatCurrency(minPrice);
    document.getElementById('calc-suggested').textContent = formatCurrency(suggested);
    document.getElementById('calc-profit-unit').textContent = formatCurrency(profitUnit);
    document.getElementById('calc-results').style.display = 'block';
}


function simulate() {
    const price = parseFloat(document.getElementById('sim-price').value) || 0;
    const cost = parseFloat(document.getElementById('sim-cost').value) || 0;
    const units = parseInt(document.getElementById('sim-units').value) || 0;

    const revenue = price * units;
    const totalCost = cost * units;
    const profit = revenue - totalCost;
    const marginPct = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0;
    const roi = totalCost > 0 ? ((profit / totalCost) * 100).toFixed(1) : 0;

    document.getElementById('sim-revenue').textContent = formatCurrency(revenue);
    document.getElementById('sim-total-cost').textContent = formatCurrency(totalCost);
    document.getElementById('sim-profit').textContent = formatCurrency(profit);
    document.getElementById('sim-margin').textContent = marginPct + '%';
    document.getElementById('sim-roi').textContent = roi + '%';
    document.getElementById('sim-results').style.display = 'block';
}

// ==========================================
// ALERTAS INTELIGENTES
// ==========================================
function checkAlerts() {
    const alertsBar = document.getElementById('alerts-bar');
    const alerts = generateAlerts();
    if (alerts.length > 0) {
        alertsBar.style.display = 'flex';
        alertsBar.innerHTML = `⚠️ <strong>${alerts.length} alerta(s)</strong> requieren tu atención`;
    } else {
        alertsBar.style.display = 'none';
    }
}

function generateAlerts() {
    const alerts = [];
    products.forEach(p => {
        if (p.quantity === 0) {
            alerts.push({ type: 'danger', title: `Sin stock: ${p.name}`, msg: 'Este producto se agotó. Reabastece pronto.' });
        } else if (p.quantity <= (p.minStock || 5)) {
            alerts.push({ type: 'warning', title: `Stock bajo: ${p.name}`, msg: `Solo quedan ${p.quantity} unidades (mínimo: ${p.minStock || 5}).` });
        }
    });
    products.forEach(p => {
        const margin = ((p.price - p.cost) / p.cost) * 100;
        if (margin < 10 && margin >= 0) {
            alerts.push({ type: 'info', title: `Margen bajo: ${p.name}`, msg: `Solo ${margin.toFixed(1)}% de margen. Considera aumentar el precio.` });
        } else if (margin < 0) {
            alerts.push({ type: 'danger', title: `Vendiendo a pérdida: ${p.name}`, msg: `El precio es menor al costo. ¡Estás perdiendo dinero!` });
        }
    });
    const thirtyDaysAgo = new Date(Date.now() - 30*24*60*60*1000).toISOString();
    products.forEach(p => {
        const lastSaleItem = sales.filter(s => s.productId === p.id).sort((a,b) => b.date.localeCompare(a.date))[0];
        if (!lastSaleItem && new Date(p.createdAt) < new Date(thirtyDaysAgo)) {
            alerts.push({ type: 'info', title: `Sin movimiento: ${p.name}`, msg: 'No se ha vendido en los últimos 30 días.' });
        }
    });
    // Alertas de insumos bajos
    insumos.forEach(i => {
        if (i.minStock && i.currentStock <= i.minStock) {
            if (i.currentStock === 0) {
                alerts.push({ type: 'danger', title: `Sin insumo: ${i.name}`, msg: `Se agotó. No podrás preparar productos que lo usen.` });
            } else {
                alerts.push({ type: 'warning', title: `Insumo bajo: ${i.name}`, msg: `Quedan ${i.currentStock} ${i.unit} (mínimo: ${i.minStock}).` });
            }
        }
    });
    return alerts;
}

function renderAlerts() {
    const grid = document.getElementById('alerts-grid');
    const empty = document.getElementById('empty-alerts');
    const alerts = generateAlerts();
    if (alerts.length === 0) { grid.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    grid.innerHTML = alerts.map(a => `
        <div class="alert-card ${a.type}">
            <h4>${a.title}</h4>
            <p>${a.msg}</p>
        </div>
    `).join('');
}


// ==========================================
// REPORTES
// ==========================================
function renderReports() {
    renderTopProductsReport();
    renderCategoryReport();
    renderMonthlyReport();
}

function renderTopProductsReport() {
    const tbody = document.getElementById('report-top-products');
    const productStats = {};
    products.forEach(p => {
        const soldQty = sales.filter(s => s.productId === p.id).reduce((sum,s) => sum+s.quantity, 0);
        const totalProfit = sales.filter(s => s.productId === p.id).reduce((sum,s) => sum+s.profit, 0);
        const margin = ((p.price - p.cost) / p.cost * 100).toFixed(1);
        productStats[p.id] = { name: p.name, margin, profitUnit: p.price - p.cost, sold: soldQty, totalProfit };
    });
    const sorted = Object.values(productStats).sort((a,b) => b.totalProfit - a.totalProfit).slice(0,10);
    tbody.innerHTML = sorted.map((p, i) => `<tr>
        <td>${i+1}</td>
        <td><strong>${esc(p.name)}</strong></td>
        <td>${p.margin}%</td>
        <td>${formatCurrency(p.profitUnit)}</td>
        <td>${p.sold}</td>
        <td class="profit-positive">${formatCurrency(p.totalProfit)}</td>
    </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-light);">No hay datos</td></tr>';
}

function renderCategoryReport() {
    const tbody = document.getElementById('report-categories');
    const cats = {};
    products.forEach(p => {
        if (!cats[p.category]) cats[p.category] = { count: 0, investment: 0, sales: 0, profit: 0 };
        cats[p.category].count++;
        cats[p.category].investment += p.cost * p.quantity;
    });
    sales.forEach(s => {
        const p = getProduct(s.productId);
        const cat = p ? p.category : 'Otro';
        if (!cats[cat]) cats[cat] = { count: 0, investment: 0, sales: 0, profit: 0 };
        cats[cat].sales += s.total;
        cats[cat].profit += s.profit;
    });
    const entries = Object.entries(cats).sort((a,b) => b[1].profit - a[1].profit);
    tbody.innerHTML = entries.map(([cat, d]) => {
        const avgMargin = d.sales > 0 ? ((d.profit / (d.sales - d.profit)) * 100).toFixed(1) : '0';
        return `<tr>
            <td><strong>${esc(cat)}</strong></td>
            <td>${d.count}</td>
            <td>${formatCurrency(d.investment)}</td>
            <td>${formatCurrency(d.sales)}</td>
            <td class="profit-positive">${formatCurrency(d.profit)}</td>
            <td>${avgMargin}%</td>
        </tr>`;
    }).join('') || '<tr><td colspan="6" style="text-align:center;">No hay datos</td></tr>';
}


function renderMonthlyReport() {
    const tbody = document.getElementById('report-monthly');
    const months = {};
    sales.forEach(s => {
        const month = s.date.slice(0,7);
        if (!months[month]) months[month] = { count: 0, revenue: 0, costs: 0, profit: 0 };
        months[month].count += s.quantity;
        months[month].revenue += s.total;
        months[month].costs += s.cost * s.quantity;
        months[month].profit += s.profit;
    });
    const entries = Object.entries(months).sort((a,b) => b[0].localeCompare(a[0]));
    tbody.innerHTML = entries.map(([month, d]) => {
        const date = new Date(month + '-01');
        const label = date.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
        return `<tr>
            <td>${label}</td>
            <td>${d.count}</td>
            <td>${formatCurrency(d.revenue)}</td>
            <td>${formatCurrency(d.costs)}</td>
            <td class="profit-positive">${formatCurrency(d.profit)}</td>
        </tr>`;
    }).join('') || '<tr><td colspan="5" style="text-align:center;">No hay ventas</td></tr>';
}

// ==========================================
// HISTORIAL
// ==========================================
function addHistory(type, message) {
    const item = { id: generateId(), type, message, date: new Date().toISOString() };
    history.unshift(item);
    if (history.length > 200) history = history.slice(0, 200);
    saveHistoryItem(item);
    renderHistory();
}

function renderHistory() {
    const list = document.getElementById('history-list');
    const empty = document.getElementById('empty-history');
    if (history.length === 0) { list.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    list.innerHTML = history.slice(0, 50).map(h => {
        const time = new Date(h.date).toLocaleString('es-MX', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
        const badge = { sale: 'badge-sale', add: 'badge-add', edit: 'badge-edit', delete: 'badge-delete' }[h.type] || 'badge-add';
        const label = { sale: 'VENTA', add: 'NUEVO', edit: 'EDICIÓN', delete: 'BORRADO' }[h.type] || 'ACCIÓN';
        return `<div class="history-item">
            <span class="action"><span class="history-badge ${badge}">${label}</span>${esc(h.message)}</span>
            <span class="time">${time}</span>
        </div>`;
    }).join('');
}

function clearHistory() {
    if (confirm('¿Limpiar todo el historial?')) {
        history = [];
        clearHistoryFromDB();
        renderHistory();
        showToast('Historial limpiado', 'info');
    }
}


// ==========================================
// EXPORT / IMPORT
// ==========================================
function exportCSV() {
    const headers = ['Nombre','Categoría','Stock','Costo','Precio','Margen%','Proveedor','StockMínimo'];
    const rows = products.map(p => [p.name,p.category,p.quantity,p.cost,p.price,p.margin,p.supplier||'',p.minStock||5]);
    downloadCSV([headers,...rows], 'inventario.csv');
    showToast('Inventario exportado', 'success');
}

function exportSalesCSV() {
    const headers = ['Fecha','Producto','Cantidad','Precio','Total','Ganancia','Método','Cliente'];
    const rows = sales.map(s => [s.date,s.productName,s.quantity,s.price,s.total,s.profit,s.method,s.client||'']);
    downloadCSV([headers,...rows], 'ventas.csv');
    showToast('Ventas exportadas', 'success');
}

function exportReport() {
    const lines = ['=== REPORTE DE NEGOCIO ===', ''];
    lines.push(`Fecha: ${new Date().toLocaleDateString('es-MX')}`);
    lines.push(`Productos: ${products.length}`);
    lines.push(`Inversión Total: ${formatCurrency(products.reduce((s,p)=>s+p.cost*p.quantity,0))}`);
    lines.push(`Ventas Totales: ${sales.length}`);
    lines.push(`Ingresos: ${formatCurrency(sales.reduce((s,v)=>s+v.total,0))}`);
    lines.push(`Ganancias: ${formatCurrency(sales.reduce((s,v)=>s+v.profit,0))}`);
    lines.push('');
    lines.push('--- Productos ---');
    products.forEach(p => lines.push(`${p.name} | Stock:${p.quantity} | Costo:${p.cost} | Precio:${p.price}`));
    const blob = new Blob([lines.join('\n')], {type:'text/plain'});
    downloadBlob(blob, 'reporte-negocio.txt');
    showToast('Reporte exportado', 'success');
}

function importCSV(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
        const lines = ev.target.result.split('\n').filter(l => l.trim());
        if (lines.length < 2) { showToast('Archivo vacío o inválido', 'error'); return; }
        let imported = 0;
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g,''));
            if (cols.length >= 4) {
                const product = {
                    id: generateId(), name: cols[0], category: cols[1] || 'Otro',
                    quantity: parseInt(cols[2])||0, cost: parseFloat(cols[3])||0,
                    price: parseFloat(cols[4]) || calculateSuggestedPrice(parseFloat(cols[3])||0, 30),
                    margin: parseFloat(cols[5])||30, supplier: cols[6]||'', minStock: parseInt(cols[7])||5,
                    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
                };
                products.push(product);
                saveProduct(product);
                imported++;
            }
        }
        renderAll();
        addHistory('add', `Importados ${imported} productos desde CSV`);
        showToast(`${imported} productos importados`, 'success');
    };
    reader.readAsText(file);
    e.target.value = '';
}

function downloadCSV(rows, filename) {
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    downloadBlob(blob, filename);
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}


// ==========================================
// SETTINGS
// ==========================================
function initSettings() {
    document.getElementById('btn-save-settings').addEventListener('click', saveSettingsForm);
    document.getElementById('btn-clear-all').addEventListener('click', clearAllData);
    fillSettingsForm();
}

function saveSettingsForm() {
    settings.businessName = document.getElementById('setting-business-name').value || 'Mi Negocio';
    settings.currency = document.getElementById('setting-currency').value;
    settings.defaultTax = parseFloat(document.getElementById('setting-default-tax').value) || 19;
    settings.defaultMargin = parseFloat(document.getElementById('setting-default-margin').value) || 30;
    const goal = parseFloat(document.getElementById('setting-monthly-goal').value);
    settings.monthlyGoal = isNaN(goal) ? 0 : goal;
    saveSettings();
    applyCurrencyEverywhere();
    showToast('Ajustes guardados', 'success');
}

function applyCurrencyEverywhere() {
    renderAll();
    renderGoalProgress();
}

function clearAllData() {
    if (confirm('⚠️ ¿BORRAR TODOS los datos? Esta acción NO se puede deshacer.')) {
        if (confirm('¿Estás REALMENTE seguro?')) {
            products = []; sales = []; history = []; clients = []; suppliers = []; expenses = [];
            clearAllDataFromDB();
            renderAll(); renderHistory(); renderClients(); renderSuppliers(); renderExpenses();
            showToast('Todos los datos han sido borrados', 'warning');
        }
    }
}

function fillSettingsForm() {
    const el = (id) => document.getElementById(id);
    if (el('setting-business-name')) el('setting-business-name').value = settings.businessName;
    if (el('setting-currency')) el('setting-currency').value = settings.currency;
    if (el('setting-default-tax')) el('setting-default-tax').value = settings.defaultTax;
    if (el('setting-default-margin')) el('setting-default-margin').value = settings.defaultMargin;
    if (el('setting-monthly-goal')) el('setting-monthly-goal').value = settings.monthlyGoal || '';
    if (el('profit-margin')) el('profit-margin').value = settings.defaultMargin;
}


// ==========================================
// BACKUP Y RESTAURACIÓN
// ==========================================
function initBackup() {
    document.getElementById('btn-backup').addEventListener('click', createBackup);
    document.getElementById('btn-restore').addEventListener('click', () => {
        document.getElementById('file-restore').click();
    });
    document.getElementById('file-restore').addEventListener('change', restoreBackup);
}

function createBackup() {
    const backup = {
        version: '4.0-firebase',
        date: new Date().toISOString(),
        businessName: settings.businessName,
        products, sales, history, clients, suppliers, expenses, settings
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], {type:'application/json'});
    downloadBlob(blob, `backup-${settings.businessName.replace(/\s+/g,'-')}-${new Date().toISOString().split('T')[0]}.json`);
    showToast('Backup creado exitosamente', 'success');
}

function restoreBackup(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(ev) {
        try {
            const data = JSON.parse(ev.target.result);
            if (!data.products || !Array.isArray(data.products)) {
                showToast('Archivo de backup inválido', 'error'); return;
            }
            if (confirm(`Restaurar backup del ${new Date(data.date).toLocaleString('es-CO')}? Esto reemplazará todos tus datos actuales.`)) {
                showAppLoading(true);
                // Limpiar datos actuales
                await clearAllDataFromDB();

                // Restaurar datos
                products = data.products || [];
                sales = data.sales || [];
                history = data.history || [];
                clients = data.clients || [];
                suppliers = data.suppliers || [];
                expenses = data.expenses || [];
                if (data.settings) settings = { ...settings, ...data.settings };

                // Guardar todo en Firestore
                for (const p of products) { await saveProduct(p); }
                for (const s of sales) { await saveSale(s); }
                for (const h of history) { await saveHistoryItem(h); }
                for (const c of clients) { await saveClient(c); }
                for (const s of suppliers) { await saveSupplier(s); }
                for (const ex of expenses) { await saveExpense(ex); }
                await saveSettings();

                renderAll(); renderHistory(); renderClients(); renderSuppliers(); renderExpenses();
                addHistory('add', 'Datos restaurados desde backup');
                showToast('Backup restaurado exitosamente', 'success');
                showAppLoading(false);
            }
        } catch(err) {
            showToast('Error al leer el archivo', 'error');
            showAppLoading(false);
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}


// ==========================================
// PUNTO DE EQUILIBRIO
// ==========================================
function calcBreakEven() {
    const fixedCosts = parseFloat(document.getElementById('be-fixed').value) || 0;
    const price = parseFloat(document.getElementById('be-price').value) || 0;
    const varCost = parseFloat(document.getElementById('be-varcost').value) || 0;
    const results = document.getElementById('be-results');

    const contribution = price - varCost;
    if (contribution <= 0) {
        results.style.display = 'block';
        document.getElementById('be-units').textContent = '⚠️ Imposible';
        document.getElementById('be-revenue').textContent = 'El precio debe ser mayor al costo variable';
        document.getElementById('be-daily').textContent = '-';
        return;
    }
    const units = Math.ceil(fixedCosts / contribution);
    const revenue = units * price;
    const daily = Math.ceil(units / 30);

    document.getElementById('be-units').textContent = units.toLocaleString('es-CO') + ' unidades';
    document.getElementById('be-revenue').textContent = formatCurrency(revenue);
    document.getElementById('be-daily').textContent = '~' + daily.toLocaleString('es-CO') + ' por día (mes de 30 días)';
    results.style.display = 'block';
}

// ==========================================
// CIERRE DE CAJA DIARIO
// ==========================================
function renderCashClose() {
    const dateInput = document.getElementById('cash-date');
    const selectedDate = dateInput.value || new Date().toISOString().split('T')[0];
    const daySales = sales.filter(s => s.date.startsWith(selectedDate));

    const methods = { 'Efectivo': 0, 'Nequi': 0, 'Daviplata': 0, 'Tarjeta': 0, 'Transferencia': 0, 'Bold': 0, 'Rappi Pay': 0, 'Fiado': 0, 'Otro': 0 };
    let total = 0, profit = 0, units = 0;
    daySales.forEach(s => {
        methods[s.method] = (methods[s.method] || 0) + s.total;
        total += s.total;
        profit += s.profit;
        units += s.quantity;
    });

    setText('cash-total', formatCurrency(total));
    setText('cash-profit', formatCurrency(profit));
    setText('cash-count', daySales.length);
    setText('cash-units', units);
    setText('cash-efectivo', formatCurrency(methods['Efectivo']));
    setText('cash-nequi', formatCurrency(methods['Nequi']));
    setText('cash-daviplata', formatCurrency(methods['Daviplata']));
    setText('cash-tarjeta', formatCurrency(methods['Tarjeta']));
    setText('cash-transferencia', formatCurrency(methods['Transferencia']));
    setText('cash-bold', formatCurrency(methods['Bold']));
    setText('cash-fiado', formatCurrency(methods['Fiado']));
    setText('cash-otro', formatCurrency(methods['Otro'] + methods['Rappi Pay']));
}


// ==========================================
// METAS DE VENTAS MENSUALES
// ==========================================
function renderGoalProgress() {
    const container = document.getElementById('goal-progress-card');
    if (!container) return;
    const goal = settings.monthlyGoal || 0;
    if (goal <= 0) { container.style.display = 'none'; return; }
    container.style.display = 'block';
    const thisMonth = new Date().toISOString().slice(0, 7);
    const monthSales = sales.filter(s => s.date.startsWith(thisMonth)).reduce((sum, s) => sum + s.total, 0);
    const pct = Math.min(100, (monthSales / goal) * 100);

    setText('goal-current', formatCurrency(monthSales));
    setText('goal-target', formatCurrency(goal));
    setText('goal-pct', pct.toFixed(1) + '%');
    const bar = document.getElementById('goal-bar');
    if (bar) {
        bar.style.width = pct + '%';
        bar.style.background = pct >= 100 ? 'var(--success)' : pct >= 50 ? 'var(--primary)' : 'var(--warning)';
    }
    const msg = document.getElementById('goal-message');
    if (msg) {
        const falta = goal - monthSales;
        msg.textContent = pct >= 100
            ? '🎉 ¡Felicidades! Alcanzaste tu meta del mes.'
            : `Te faltan ${formatCurrency(falta)} para tu meta.`;
    }
}

// ==========================================
// INIT CIERRE DE CAJA
// ==========================================
function initCashClose() {
    const dateInput = document.getElementById('cash-date');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
        dateInput.addEventListener('change', renderCashClose);
    }
    const btnPrint = document.getElementById('btn-print-cash');
    if (btnPrint) btnPrint.addEventListener('click', printCashClose);
}


function printCashClose() {
    const date = document.getElementById('cash-date').value || new Date().toISOString().split('T')[0];
    const win = window.open('', '_blank', 'width=400,height=600');
    if (!win) { showToast('Permite las ventanas emergentes', 'warning'); return; }
    win.document.write(`
        <html><head><title>Cierre de Caja</title><style>
            body { font-family: 'Courier New', monospace; padding: 16px; font-size: 13px; }
            h2 { text-align: center; margin: 4px 0; }
            .center { text-align: center; }
            hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
            .row { display: flex; justify-content: space-between; margin: 4px 0; }
            .total { font-weight: bold; font-size: 15px; }
        </style></head><body>
            <h2>${esc(settings.businessName)}</h2>
            <div class="center">CIERRE DE CAJA</div>
            <div class="center">${new Date(date).toLocaleDateString('es-CO')}</div>
            <hr>
            <div class="row"><span>Ventas:</span><span>${document.getElementById('cash-count').textContent}</span></div>
            <div class="row"><span>Unidades:</span><span>${document.getElementById('cash-units').textContent}</span></div>
            <hr>
            <div class="row"><span>Efectivo:</span><span>${document.getElementById('cash-efectivo').textContent}</span></div>
            <div class="row"><span>Tarjeta:</span><span>${document.getElementById('cash-tarjeta').textContent}</span></div>
            <div class="row"><span>Transferencia:</span><span>${document.getElementById('cash-transferencia').textContent}</span></div>
            <div class="row"><span>Otro:</span><span>${document.getElementById('cash-otro').textContent}</span></div>
            <hr>
            <div class="row total"><span>TOTAL:</span><span>${document.getElementById('cash-total').textContent}</span></div>
            <div class="row"><span>Ganancia:</span><span>${document.getElementById('cash-profit').textContent}</span></div>
            <hr>
            <div class="center">Generado: ${new Date().toLocaleString('es-CO')}</div>
            <script>window.onload=function(){window.print();}<\/script>
        </body></html>
    `);
    win.document.close();
}


// ==========================================
// MÓDULO DE CLIENTES
// ==========================================
function initClients() {
    document.getElementById('client-form').addEventListener('submit', handleClientSubmit);
    document.getElementById('btn-cancel-client').addEventListener('click', cancelClientEdit);
    document.getElementById('client-search').addEventListener('input', renderClients);
}

function handleClientSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('client-name').value.trim();
    const phone = document.getElementById('client-phone').value.trim();
    const email = document.getElementById('client-email').value.trim();
    const notes = document.getElementById('client-notes').value.trim();
    if (!name) { showToast('El nombre es obligatorio', 'error'); return; }

    if (editingClientId) {
        const idx = clients.findIndex(c => c.id === editingClientId);
        clients[idx] = { ...clients[idx], name, phone, email, notes };
        saveClient(clients[idx]);
        showToast('Cliente actualizado', 'success');
        cancelClientEdit();
    } else {
        const client = { id: generateId(), name, phone, email, notes, createdAt: new Date().toISOString() };
        clients.push(client);
        saveClient(client);
        showToast(`Cliente "${name}" agregado`, 'success');
    }
    renderClients();
    e.target.reset();
}

function editClient(id) {
    const c = clients.find(x => x.id === id);
    if (!c) return;
    editingClientId = id;
    document.getElementById('client-name').value = c.name;
    document.getElementById('client-phone').value = c.phone || '';
    document.getElementById('client-email').value = c.email || '';
    document.getElementById('client-notes').value = c.notes || '';
    document.getElementById('btn-client-submit').textContent = 'Actualizar Cliente';
    document.getElementById('btn-cancel-client').style.display = 'inline-block';
    document.getElementById('client-form').scrollIntoView({ behavior: 'smooth' });
}

function cancelClientEdit() {
    editingClientId = null;
    document.getElementById('client-form').reset();
    document.getElementById('btn-client-submit').textContent = 'Agregar Cliente';
    document.getElementById('btn-cancel-client').style.display = 'none';
}

function deleteClient(id) {
    const c = clients.find(x => x.id === id);
    if (!c) return;
    if (confirm(`¿Eliminar al cliente "${c.name}"?`)) {
        clients = clients.filter(x => x.id !== id);
        deleteClientFromDB(id);
        renderClients();
        showToast('Cliente eliminado', 'warning');
    }
}


function renderClients() {
    const tbody = document.getElementById('clients-body');
    const empty = document.getElementById('empty-clients');
    if (!tbody) return;
    const search = (document.getElementById('client-search').value || '').toLowerCase().trim();
    let list = [...clients];
    if (search) list = list.filter(c => c.name.toLowerCase().includes(search) || (c.phone||'').includes(search));

    if (list.length === 0) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';

    tbody.innerHTML = list.map(c => {
        const clientSales = sales.filter(s => (s.client||'').toLowerCase() === c.name.toLowerCase());
        const totalCompras = clientSales.reduce((sum, s) => sum + s.total, 0);
        const numCompras = clientSales.length;
        return `<tr>
            <td><strong>${esc(c.name)}</strong></td>
            <td>${esc(c.phone || '-')}</td>
            <td>${esc(c.email || '-')}</td>
            <td>${numCompras}</td>
            <td class="profit-positive">${formatCurrency(totalCompras)}</td>
            <td>
                <button class="action-btn" onclick="editClient('${c.id}')" title="Editar">✏️</button>
                <button class="action-btn" onclick="deleteClient('${c.id}')" title="Eliminar">🗑️</button>
            </td>
        </tr>`;
    }).join('');

    const dl = document.getElementById('clients-datalist');
    if (dl) dl.innerHTML = clients.map(c => `<option value="${esc(c.name)}">`).join('');
}

// ==========================================
// MÓDULO DE PROVEEDORES
// ==========================================
function initSuppliers() {
    document.getElementById('supplier-form').addEventListener('submit', handleSupplierSubmit);
    document.getElementById('btn-cancel-supplier').addEventListener('click', cancelSupplierEdit);
    document.getElementById('supplier-search').addEventListener('input', renderSuppliers);
}

function handleSupplierSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('supplier-name').value.trim();
    const contact = document.getElementById('supplier-contact').value.trim();
    const phone = document.getElementById('supplier-phone').value.trim();
    const products_ = document.getElementById('supplier-products').value.trim();
    if (!name) { showToast('El nombre es obligatorio', 'error'); return; }

    if (editingSupplierId) {
        const idx = suppliers.findIndex(s => s.id === editingSupplierId);
        suppliers[idx] = { ...suppliers[idx], name, contact, phone, products: products_ };
        saveSupplier(suppliers[idx]);
        showToast('Proveedor actualizado', 'success');
        cancelSupplierEdit();
    } else {
        const supplier = { id: generateId(), name, contact, phone, products: products_, createdAt: new Date().toISOString() };
        suppliers.push(supplier);
        saveSupplier(supplier);
        showToast(`Proveedor "${name}" agregado`, 'success');
    }
    renderSuppliers();
    e.target.reset();
}


function editSupplier(id) {
    const s = suppliers.find(x => x.id === id);
    if (!s) return;
    editingSupplierId = id;
    document.getElementById('supplier-name').value = s.name;
    document.getElementById('supplier-contact').value = s.contact || '';
    document.getElementById('supplier-phone').value = s.phone || '';
    document.getElementById('supplier-products').value = s.products || '';
    document.getElementById('btn-supplier-submit').textContent = 'Actualizar Proveedor';
    document.getElementById('btn-cancel-supplier').style.display = 'inline-block';
    document.getElementById('supplier-form').scrollIntoView({ behavior: 'smooth' });
}

function cancelSupplierEdit() {
    editingSupplierId = null;
    document.getElementById('supplier-form').reset();
    document.getElementById('btn-supplier-submit').textContent = 'Agregar Proveedor';
    document.getElementById('btn-cancel-supplier').style.display = 'none';
}

function deleteSupplier(id) {
    const s = suppliers.find(x => x.id === id);
    if (!s) return;
    if (confirm(`¿Eliminar al proveedor "${s.name}"?`)) {
        suppliers = suppliers.filter(x => x.id !== id);
        deleteSupplierFromDB(id);
        renderSuppliers();
        showToast('Proveedor eliminado', 'warning');
    }
}

function renderSuppliers() {
    const tbody = document.getElementById('suppliers-body');
    const empty = document.getElementById('empty-suppliers');
    if (!tbody) return;
    const search = (document.getElementById('supplier-search').value || '').toLowerCase().trim();
    let list = [...suppliers];
    if (search) list = list.filter(s => s.name.toLowerCase().includes(search) || (s.products||'').toLowerCase().includes(search));

    if (list.length === 0) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';

    tbody.innerHTML = list.map(s => `<tr>
        <td><strong>${esc(s.name)}</strong></td>
        <td>${esc(s.contact || '-')}</td>
        <td>${esc(s.phone || '-')}</td>
        <td>${esc(s.products || '-')}</td>
        <td>
            <button class="action-btn" onclick="editSupplier('${s.id}')" title="Editar">✏️</button>
            <button class="action-btn" onclick="deleteSupplier('${s.id}')" title="Eliminar">🗑️</button>
        </td>
    </tr>`).join('');
}


// ==========================================
// MÓDULO DE GASTOS
// ==========================================
function initExpenses() {
    document.getElementById('expense-form').addEventListener('submit', handleExpenseSubmit);
    document.getElementById('btn-cancel-expense').addEventListener('click', cancelExpenseEdit);
    const dateField = document.getElementById('expense-date');
    if (dateField) dateField.value = new Date().toISOString().split('T')[0];
}

function handleExpenseSubmit(e) {
    e.preventDefault();
    const concept = document.getElementById('expense-concept').value.trim();
    const category = document.getElementById('expense-category').value;
    const amount = parseFloat(document.getElementById('expense-amount').value) || 0;
    const date = document.getElementById('expense-date').value || new Date().toISOString().split('T')[0];
    if (!concept || amount <= 0) { showToast('Completa concepto y monto', 'error'); return; }

    if (editingExpenseId) {
        const idx = expenses.findIndex(x => x.id === editingExpenseId);
        expenses[idx] = { ...expenses[idx], concept, category, amount, date };
        saveExpense(expenses[idx]);
        showToast('Gasto actualizado', 'success');
        cancelExpenseEdit();
    } else {
        const expense = { id: generateId(), concept, category, amount, date };
        expenses.push(expense);
        saveExpense(expense);
        addHistory('add', `Gasto registrado: ${concept} (${formatCurrency(amount)})`);
        showToast('Gasto registrado', 'success');
    }
    renderExpenses();
    updateDashboardStats();
    e.target.reset();
    document.getElementById('expense-date').value = new Date().toISOString().split('T')[0];
}

function editExpense(id) {
    const x = expenses.find(e => e.id === id);
    if (!x) return;
    editingExpenseId = id;
    document.getElementById('expense-concept').value = x.concept;
    document.getElementById('expense-category').value = x.category;
    document.getElementById('expense-amount').value = x.amount;
    document.getElementById('expense-date').value = x.date;
    document.getElementById('btn-expense-submit').textContent = 'Actualizar Gasto';
    document.getElementById('btn-cancel-expense').style.display = 'inline-block';
    document.getElementById('expense-form').scrollIntoView({ behavior: 'smooth' });
}

function cancelExpenseEdit() {
    editingExpenseId = null;
    document.getElementById('expense-form').reset();
    document.getElementById('expense-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('btn-expense-submit').textContent = 'Registrar Gasto';
    document.getElementById('btn-cancel-expense').style.display = 'none';
}

function deleteExpense(id) {
    const x = expenses.find(e => e.id === id);
    if (!x) return;
    if (confirm(`¿Eliminar el gasto "${x.concept}"?`)) {
        expenses = expenses.filter(e => e.id !== id);
        deleteExpenseFromDB(id);
        renderExpenses();
        updateDashboardStats();
        showToast('Gasto eliminado', 'warning');
    }
}


function renderExpenses() {
    const tbody = document.getElementById('expenses-body');
    const empty = document.getElementById('empty-expenses');
    if (!tbody) return;

    const thisMonth = new Date().toISOString().slice(0, 7);
    const monthTotal = expenses.filter(e => e.date.startsWith(thisMonth)).reduce((s, e) => s + e.amount, 0);
    const allTotal = expenses.reduce((s, e) => s + e.amount, 0);
    setText('expenses-month-total', formatCurrency(monthTotal));
    setText('expenses-all-total', formatCurrency(allTotal));

    const list = [...expenses].sort((a, b) => b.date.localeCompare(a.date));
    if (list.length === 0) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';

    const catIcons = { 'Arriendo':'🏠','Servicios':'💡','Sueldos':'👷','Transporte':'🚗','Marketing':'📣','Insumos':'📦','Impuestos':'🏛️','Otro':'📋' };
    tbody.innerHTML = list.map(x => `<tr>
        <td>${new Date(x.date + 'T12:00:00').toLocaleDateString('es-CO')}</td>
        <td><strong>${esc(x.concept)}</strong></td>
        <td>${catIcons[x.category] || ''} ${esc(x.category)}</td>
        <td class="profit-negative">${formatCurrency(x.amount)}</td>
        <td>
            <button class="action-btn" onclick="editExpense('${x.id}')" title="Editar">✏️</button>
            <button class="action-btn" onclick="deleteExpense('${x.id}')" title="Eliminar">🗑️</button>
        </td>
    </tr>`).join('');
}

// ==========================================
// UTILIDADES
// ==========================================
function generateId() { return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2,9); }
function getProduct(id) { return products.find(p => p.id === id); }
function formatCurrency(amount) {
    amount = amount || 0;
    if (settings.currency === 'COP') {
        return '$' + Math.round(amount).toLocaleString('es-CO');
    }
    if (settings.currency === '€') {
        return amount.toLocaleString('es-ES', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' €';
    }
    if (settings.currency === '£') {
        return '£' + amount.toLocaleString('en-GB', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    }
    return '$' + amount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}
function esc(text) {
    const d = document.createElement('div');
    d.textContent = text || '';
    return d.innerHTML;
}

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// Renderizar gráficas al cargar si estamos en dashboard
setTimeout(() => { if (currentUser) { renderCharts(); renderHistory(); } }, 1000);



// ==========================================
// MÓDULO DE INSUMOS (Materias Primas)
// ==========================================
let editingInsumoId = null;

function initInsumos() {
    document.getElementById('insumo-form').addEventListener('submit', handleInsumoSubmit);
    document.getElementById('btn-cancel-insumo').addEventListener('click', cancelInsumoEdit);
    document.getElementById('insumo-search').addEventListener('input', renderInsumos);
    renderInsumos();
}

function handleInsumoSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('insumo-name').value.trim();
    const unit = document.getElementById('insumo-unit').value;
    const purchasePrice = parseFloat(document.getElementById('insumo-purchase-price').value) || 0;
    const purchaseQty = parseFloat(document.getElementById('insumo-purchase-qty').value) || 0;
    const currentStock = parseFloat(document.getElementById('insumo-stock').value) || 0;
    const minStock = parseFloat(document.getElementById('insumo-min-stock').value) || 0;

    if (!name || purchasePrice <= 0 || purchaseQty <= 0) {
        showToast('Completa nombre, precio y cantidad de compra', 'error');
        return;
    }

    const costPerUnit = purchasePrice / purchaseQty;

    if (editingInsumoId) {
        const idx = insumos.findIndex(i => i.id === editingInsumoId);
        insumos[idx] = { ...insumos[idx], name, unit, purchasePrice, purchaseQty, currentStock, minStock, costPerUnit };
        saveInsumo(insumos[idx]);
        showToast('Insumo actualizado', 'success');
        cancelInsumoEdit();
    } else {
        const insumo = { id: generateId(), name, unit, purchasePrice, purchaseQty, currentStock, minStock, costPerUnit, createdAt: new Date().toISOString() };
        insumos.push(insumo);
        saveInsumo(insumo);
        showToast(`Insumo "${name}" agregado`, 'success');
    }
    renderInsumos();
    e.target.reset();
}

function editInsumo(id) {
    const i = insumos.find(x => x.id === id);
    if (!i) return;
    editingInsumoId = id;
    document.getElementById('insumo-name').value = i.name;
    document.getElementById('insumo-unit').value = i.unit;
    document.getElementById('insumo-purchase-price').value = i.purchasePrice;
    document.getElementById('insumo-purchase-qty').value = i.purchaseQty;
    document.getElementById('insumo-stock').value = i.currentStock;
    document.getElementById('insumo-min-stock').value = i.minStock || 0;
    document.getElementById('btn-insumo-submit').textContent = 'Actualizar Insumo';
    document.getElementById('btn-cancel-insumo').style.display = 'inline-block';
    document.getElementById('insumo-form').scrollIntoView({ behavior: 'smooth' });
}

function cancelInsumoEdit() {
    editingInsumoId = null;
    document.getElementById('insumo-form').reset();
    document.getElementById('btn-insumo-submit').textContent = 'Agregar Insumo';
    document.getElementById('btn-cancel-insumo').style.display = 'none';
}

function deleteInsumo(id) {
    const i = insumos.find(x => x.id === id);
    if (!i) return;
    if (confirm(`¿Eliminar insumo "${i.name}"?`)) {
        insumos = insumos.filter(x => x.id !== id);
        deleteInsumoFromDB(id);
        renderInsumos();
        showToast('Insumo eliminado', 'warning');
    }
}

function restockInsumo(id) {
    const i = insumos.find(x => x.id === id);
    if (!i) return;
    const qty = prompt(`¿Cuántas ${i.unit} de "${i.name}" compraste?`, i.purchaseQty);
    if (!qty || parseFloat(qty) <= 0) return;
    i.currentStock += parseFloat(qty);
    saveInsumo(i);
    renderInsumos();
    showToast(`Stock de "${i.name}" actualizado: ${i.currentStock} ${i.unit}`, 'success');
}

function renderInsumos() {
    const tbody = document.getElementById('insumos-body');
    const empty = document.getElementById('empty-insumos');
    if (!tbody) return;
    const search = (document.getElementById('insumo-search').value || '').toLowerCase().trim();
    let list = [...insumos];
    if (search) list = list.filter(i => i.name.toLowerCase().includes(search));

    if (list.length === 0) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';

    tbody.innerHTML = list.map(i => {
        const costPerUnit = i.costPerUnit || (i.purchasePrice / i.purchaseQty);
        const lowStock = i.currentStock <= (i.minStock || 0);
        return `<tr>
            <td><strong>${esc(i.name)}</strong></td>
            <td>${esc(i.unit)}</td>
            <td>${formatCurrency(i.purchasePrice)}</td>
            <td>${i.purchaseQty} ${i.unit}</td>
            <td><strong>${formatCurrency(costPerUnit)}</strong>/${i.unit}</td>
            <td class="${lowStock ? 'profit-negative' : ''}">${i.currentStock} ${i.unit} ${lowStock ? '⚠️' : ''}</td>
            <td>
                <button class="action-btn" onclick="restockInsumo('${i.id}')" title="Reabastecer">📦</button>
                <button class="action-btn" onclick="editInsumo('${i.id}')" title="Editar">✏️</button>
                <button class="action-btn" onclick="deleteInsumo('${i.id}')" title="Eliminar">🗑️</button>
            </td>
        </tr>`;
    }).join('');
}

async function saveInsumo(insumo) {
    try { await userCollection('insumos').doc(insumo.id).set(insumo); }
    catch (e) { console.error('Error guardando insumo:', e); }
}

async function deleteInsumoFromDB(id) {
    try { await userCollection('insumos').doc(id).delete(); }
    catch (e) { console.error('Error eliminando insumo:', e); }
}

// ==========================================
// MÓDULO DE RECETAS (Ingredientes por Producto)
// ==========================================
let editingRecipeId = null;

function initRecipes() {
    document.getElementById('recipe-form').addEventListener('submit', handleRecipeSubmit);
    document.getElementById('btn-cancel-recipe').addEventListener('click', cancelRecipeEdit);
    document.getElementById('recipe-product').addEventListener('change', renderRecipeIngredients);
    document.getElementById('btn-add-ingredient').addEventListener('click', addIngredientRow);
    updateRecipeProductList();
    renderRecipes();
}

function updateRecipeProductList() {
    const select = document.getElementById('recipe-product');
    if (!select) return;
    select.innerHTML = '<option value="">Seleccionar producto...</option>';
    products.forEach(p => {
        select.innerHTML += `<option value="${p.id}">${esc(p.name)}</option>`;
    });
}

function addIngredientRow() {
    const container = document.getElementById('ingredients-list');
    const row = document.createElement('div');
    row.className = 'ingredient-row';
    row.innerHTML = `
        <select class="ing-insumo" required>
            <option value="">Insumo...</option>
            ${insumos.map(i => `<option value="${i.id}">${esc(i.name)} (${i.unit})</option>`).join('')}
        </select>
        <input type="number" class="ing-qty" placeholder="Cantidad" step="0.01" min="0.01" required>
        <span class="ing-cost">$0</span>
        <button type="button" class="btn-remove-ing" onclick="this.parentElement.remove(); calcRecipeCost();">✖</button>
    `;
    container.appendChild(row);

    // Calcular costo cuando cambie
    row.querySelector('.ing-insumo').addEventListener('change', calcRecipeCost);
    row.querySelector('.ing-qty').addEventListener('input', calcRecipeCost);
}

function calcRecipeCost() {
    const rows = document.querySelectorAll('.ingredient-row');
    let totalCost = 0;

    rows.forEach(row => {
        const insumoId = row.querySelector('.ing-insumo').value;
        const qty = parseFloat(row.querySelector('.ing-qty').value) || 0;
        const costSpan = row.querySelector('.ing-cost');

        if (insumoId && qty > 0) {
            const insumo = insumos.find(i => i.id === insumoId);
            if (insumo) {
                const cost = (insumo.purchasePrice / insumo.purchaseQty) * qty;
                costSpan.textContent = formatCurrency(cost);
                totalCost += cost;
            }
        } else {
            costSpan.textContent = '$0';
        }
    });

    document.getElementById('recipe-total-cost').textContent = formatCurrency(totalCost);
}

function handleRecipeSubmit(e) {
    e.preventDefault();
    const productId = document.getElementById('recipe-product').value;
    if (!productId) { showToast('Selecciona un producto', 'error'); return; }

    const rows = document.querySelectorAll('.ingredient-row');
    const ingredients = [];
    let totalCost = 0;

    rows.forEach(row => {
        const insumoId = row.querySelector('.ing-insumo').value;
        const qty = parseFloat(row.querySelector('.ing-qty').value) || 0;
        if (insumoId && qty > 0) {
            const insumo = insumos.find(i => i.id === insumoId);
            const cost = insumo ? (insumo.purchasePrice / insumo.purchaseQty) * qty : 0;
            ingredients.push({ insumoId, insumoName: insumo?.name || '', quantity: qty, unit: insumo?.unit || '', cost });
            totalCost += cost;
        }
    });

    if (ingredients.length === 0) { showToast('Agrega al menos un ingrediente', 'error'); return; }

    const product = getProduct(productId);
    const recipe = {
        id: editingRecipeId || generateId(),
        productId,
        productName: product?.name || '',
        ingredients,
        totalCost,
        createdAt: editingRecipeId ? recipes.find(r => r.id === editingRecipeId)?.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    if (editingRecipeId) {
        const idx = recipes.findIndex(r => r.id === editingRecipeId);
        recipes[idx] = recipe;
        showToast('Receta actualizada', 'success');
        cancelRecipeEdit();
    } else {
        // Verificar si ya existe receta para este producto
        const existing = recipes.findIndex(r => r.productId === productId);
        if (existing >= 0) {
            recipes[existing] = recipe;
            recipe.id = recipes[existing].id;
            showToast('Receta actualizada', 'success');
        } else {
            recipes.push(recipe);
            showToast(`Receta para "${product?.name}" creada`, 'success');
        }
    }

    saveRecipe(recipe);
    renderRecipes();
    // Limpiar
    document.getElementById('ingredients-list').innerHTML = '';
    document.getElementById('recipe-product').value = '';
    document.getElementById('recipe-total-cost').textContent = '$0';
    editingRecipeId = null;
}

function editRecipe(id) {
    const r = recipes.find(x => x.id === id);
    if (!r) return;
    editingRecipeId = id;
    document.getElementById('recipe-product').value = r.productId;
    document.getElementById('ingredients-list').innerHTML = '';

    r.ingredients.forEach(ing => {
        addIngredientRow();
        const rows = document.querySelectorAll('.ingredient-row');
        const lastRow = rows[rows.length - 1];
        lastRow.querySelector('.ing-insumo').value = ing.insumoId;
        lastRow.querySelector('.ing-qty').value = ing.quantity;
    });
    calcRecipeCost();
    document.getElementById('btn-recipe-submit').textContent = 'Actualizar Receta';
    document.getElementById('btn-cancel-recipe').style.display = 'inline-block';
    document.getElementById('recipe-form').scrollIntoView({ behavior: 'smooth' });
}

function cancelRecipeEdit() {
    editingRecipeId = null;
    document.getElementById('ingredients-list').innerHTML = '';
    document.getElementById('recipe-product').value = '';
    document.getElementById('recipe-total-cost').textContent = '$0';
    document.getElementById('btn-recipe-submit').textContent = 'Guardar Receta';
    document.getElementById('btn-cancel-recipe').style.display = 'none';
}

function deleteRecipe(id) {
    const r = recipes.find(x => x.id === id);
    if (!r) return;
    if (confirm(`¿Eliminar receta de "${r.productName}"?`)) {
        recipes = recipes.filter(x => x.id !== id);
        deleteRecipeFromDB(id);
        renderRecipes();
        showToast('Receta eliminada', 'warning');
    }
}

function renderRecipeIngredients() {
    // Cuando seleccionan un producto, cargar su receta si ya existe
    const productId = document.getElementById('recipe-product').value;
    const existing = recipes.find(r => r.productId === productId);
    if (existing) {
        editingRecipeId = existing.id;
        document.getElementById('ingredients-list').innerHTML = '';
        existing.ingredients.forEach(ing => {
            addIngredientRow();
            const rows = document.querySelectorAll('.ingredient-row');
            const lastRow = rows[rows.length - 1];
            lastRow.querySelector('.ing-insumo').value = ing.insumoId;
            lastRow.querySelector('.ing-qty').value = ing.quantity;
        });
        calcRecipeCost();
        document.getElementById('btn-recipe-submit').textContent = 'Actualizar Receta';
        document.getElementById('btn-cancel-recipe').style.display = 'inline-block';
    }
}

function renderRecipes() {
    const tbody = document.getElementById('recipes-body');
    const empty = document.getElementById('empty-recipes');
    if (!tbody) return;

    if (recipes.length === 0) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';

    tbody.innerHTML = recipes.map(r => {
        const ingredientsList = r.ingredients.map(i => `${i.quantity} ${i.unit} ${esc(i.insumoName)}`).join(', ');
        const product = getProduct(r.productId);
        const salePrice = product ? product.price : 0;
        const profit = salePrice - r.totalCost;
        return `<tr>
            <td><strong>${esc(r.productName)}</strong></td>
            <td class="recipe-ingredients">${ingredientsList}</td>
            <td>${formatCurrency(r.totalCost)}</td>
            <td>${formatCurrency(salePrice)}</td>
            <td class="${profit >= 0 ? 'profit-positive' : 'profit-negative'}">${formatCurrency(profit)}</td>
            <td>
                <button class="action-btn" onclick="editRecipe('${r.id}')" title="Editar">✏️</button>
                <button class="action-btn" onclick="deleteRecipe('${r.id}')" title="Eliminar">🗑️</button>
            </td>
        </tr>`;
    }).join('');
}

async function saveRecipe(recipe) {
    try { await userCollection('recipes').doc(recipe.id).set(recipe); }
    catch (e) { console.error('Error guardando receta:', e); }
}

async function deleteRecipeFromDB(id) {
    try { await userCollection('recipes').doc(id).delete(); }
    catch (e) { console.error('Error eliminando receta:', e); }
}

// ==========================================
// DESCONTAR INSUMOS AL VENDER
// ==========================================
function deductInsumosFromSale(productId, qty) {
    const recipe = recipes.find(r => r.productId === productId);
    if (!recipe) return; // No tiene receta, no descontar

    recipe.ingredients.forEach(ing => {
        const insumo = insumos.find(i => i.id === ing.insumoId);
        if (insumo) {
            const totalToDeduct = ing.quantity * qty;
            insumo.currentStock = Math.max(0, insumo.currentStock - totalToDeduct);
            saveInsumo(insumo);
        }
    });
}



// ==========================================
// MÓDULO DE MESAS
// ==========================================
let mesasList = [];
let editingMesaId = null;

function initMesas() {
    document.getElementById('mesa-form').addEventListener('submit', handleMesaSubmit);
    document.getElementById('btn-cancel-mesa').addEventListener('click', cancelMesaEdit);
    // Mostrar link de mesero
    const linkInput = document.getElementById('mesero-link');
    if (linkInput) linkInput.value = window.location.origin + '/mesero.html';
    loadMesas();
}

async function loadMesas() {
    try {
        const snap = await userCollection('mesas').get();
        mesasList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderMesasAdmin();
        // Generate menu link and QR
        const menuUrl = window.location.origin + '/menu.html?u=' + currentUser.uid;
        const menuLinkEl = document.getElementById('menu-link');
        if (menuLinkEl) menuLinkEl.value = menuUrl;
        const qrEl = document.getElementById('menu-qr');
        if (qrEl) qrEl.src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(menuUrl);
    } catch (e) { console.error('Error cargando mesas:', e); }
}

function handleMesaSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('mesa-name').value.trim();
    const capacity = parseInt(document.getElementById('mesa-capacity').value) || 4;
    if (!name) { showToast('Ponle nombre a la mesa', 'error'); return; }

    if (editingMesaId) {
        const idx = mesasList.findIndex(m => m.id === editingMesaId);
        mesasList[idx] = { ...mesasList[idx], name, capacity };
        saveMesa(mesasList[idx]);
        showToast('Mesa actualizada', 'success');
        cancelMesaEdit();
    } else {
        const mesa = { id: generateId(), name, capacity, status: 'libre', createdAt: new Date().toISOString() };
        mesasList.push(mesa);
        saveMesa(mesa);
        showToast(`"${name}" agregada`, 'success');
    }
    renderMesasAdmin();
    e.target.reset();
}

function editMesa(id) {
    const m = mesasList.find(x => x.id === id);
    if (!m) return;
    editingMesaId = id;
    document.getElementById('mesa-name').value = m.name;
    document.getElementById('mesa-capacity').value = m.capacity || 4;
    document.getElementById('btn-mesa-submit').textContent = 'Actualizar Mesa';
    document.getElementById('btn-cancel-mesa').style.display = 'inline-block';
}

function cancelMesaEdit() {
    editingMesaId = null;
    document.getElementById('mesa-form').reset();
    document.getElementById('btn-mesa-submit').textContent = 'Agregar Mesa';
    document.getElementById('btn-cancel-mesa').style.display = 'none';
}

function deleteMesa(id) {
    const m = mesasList.find(x => x.id === id);
    if (!m) return;
    if (confirm(`¿Eliminar "${m.name}"?`)) {
        mesasList = mesasList.filter(x => x.id !== id);
        userCollection('mesas').doc(id).delete();
        renderMesasAdmin();
        showToast('Mesa eliminada', 'warning');
    }
}

async function saveMesa(mesa) {
    try { await userCollection('mesas').doc(mesa.id).set(mesa); }
    catch (e) { console.error('Error guardando mesa:', e); }
}

function renderMesasAdmin() {
    const grid = document.getElementById('mesas-admin-grid');
    const empty = document.getElementById('empty-mesas');
    if (!grid) return;

    if (mesasList.length === 0) { grid.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';

    grid.innerHTML = mesasList.map(m => `
        <div class="mesa-admin-card">
            <div class="mesa-admin-icon">🪑</div>
            <div class="mesa-admin-info">
                <strong>${esc(m.name)}</strong>
                <span>${m.capacity || 4} personas</span>
            </div>
            <div class="mesa-admin-actions">
                <button class="action-btn" onclick="editMesa('${m.id}')" title="Editar">✏️</button>
                <button class="action-btn" onclick="deleteMesa('${m.id}')" title="Eliminar">🗑️</button>
            </div>
        </div>
    `).join('');
}

function copyMeseroLink() {
    const input = document.getElementById('mesero-link');
    input.select();
    navigator.clipboard.writeText(input.value);
    showToast('Link copiado', 'success');
}

function copyMenuLink() {
    const input = document.getElementById('menu-link');
    input.select();
    navigator.clipboard.writeText(input.value);
    showToast('Link del menú copiado', 'success');
}

function printQR() {
    const qrSrc = document.getElementById('menu-qr').src;
    const win = window.open('', '_blank', 'width=350,height=500');
    if (!win) { showToast('Permite ventanas emergentes', 'warning'); return; }
    win.document.write(`<!DOCTYPE html><html><head><style>
        body { font-family: sans-serif; text-align: center; padding: 40px 20px; }
        img { width: 250px; height: 250px; margin: 20px 0; }
        h2 { font-size: 1.5rem; margin-bottom: 8px; }
        p { color: #64748b; font-size: 0.9rem; }
    </style></head><body>
        <h2>${esc(settings.businessName || 'Mi Negocio')}</h2>
        <p>Escanea para ver nuestro menú</p>
        <img src="${qrSrc}">
        <p style="font-size:0.8rem;margin-top:12px;">Menú digital • GestiónPro</p>
        <script>window.onload=function(){window.print();}<\/script>
    </body></html>`);
    win.document.close();
}



// ==========================================
// PEDIDOS PENDIENTES (Dashboard + Tiempo Real)
// ==========================================
function initPendingOrders() {
    // Escuchar pedidos en tiempo real
    userCollection('orders').onSnapshot((snapshot) => {
        const pendingOrders = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(o => o.status === 'active' || o.status === 'preparing' || o.status === 'ready');
        renderPendingOrders(pendingOrders);
    });
}

function renderPendingOrders(orders) {
    const container = document.getElementById('pending-orders-list');
    if (!container) return;

    if (orders.length === 0) {
        container.innerHTML = '<p class="empty-message" style="display:block;">No hay pedidos pendientes. ¡Todo al día! ✅</p>';
        return;
    }

    container.innerHTML = orders.map(o => {
        const items = o.items || [];
        const total = items.reduce((s, i) => s + (i.price * i.qty), 0);
        const time = o.createdAt ? new Date(o.createdAt).toLocaleTimeString('es-CO', {hour:'2-digit', minute:'2-digit'}) : '';
        const statusColors = { active: '#f59e0b', preparing: '#3b82f6', ready: '#16a34a' };
        const statusLabels = { active: '🆕 Nuevo', preparing: '👨‍🍳 Preparando', ready: '✅ Listo' };
        const itemsList = items.map(i => `${i.qty}x ${i.name}`).join(', ');

        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg);border-radius:12px;margin-bottom:8px;border-left:4px solid ${statusColors[o.status] || '#64748b'};">
            <div style="flex:1;">
                <div style="font-weight:700;font-size:0.95rem;color:var(--text);margin-bottom:4px;">🪑 ${esc(o.mesaName || 'Mesa')}</div>
                <div style="font-size:0.8rem;color:var(--text-light);">${itemsList}</div>
            </div>
            <div style="text-align:right;">
                <div style="font-weight:700;font-size:0.95rem;color:var(--text);">${formatCurrency(total)}</div>
                <div style="font-size:0.75rem;color:${statusColors[o.status]};font-weight:600;">${statusLabels[o.status] || o.status} · ${time}</div>
            </div>
        </div>`;
    }).join('');
}



// ==========================================
// PERSONALIZACIÓN DEL LOBBY
// ==========================================
let customization = {
    logo: '',
    slogan: '',
    color: '#2563eb',
    sidebarStyle: 'default',
    borderStyle: 'rounded',
    bgStyle: 'light'
};

function loadCustomization() {
    if (settings.customization) {
        customization = { ...customization, ...settings.customization };
    }
    applyCustomization();
    fillCustomizationForm();
}

function fillCustomizationForm() {
    const el = (id) => document.getElementById(id);
    if (el('setting-logo')) el('setting-logo').value = customization.logo || '';
    if (el('setting-slogan')) el('setting-slogan').value = customization.slogan || '';
    if (el('setting-color')) el('setting-color').value = customization.color || '#2563eb';
    if (el('setting-sidebar-style')) el('setting-sidebar-style').value = customization.sidebarStyle || 'default';
    if (el('setting-border-style')) el('setting-border-style').value = customization.borderStyle || 'rounded';
    if (el('setting-bg-style')) el('setting-bg-style').value = customization.bgStyle || 'light';

    // Logo preview
    if (customization.logo) {
        document.getElementById('logo-preview').style.display = 'block';
        document.getElementById('logo-preview-img').src = customization.logo;
    }

    // Logo preview on change
    const logoInput = document.getElementById('setting-logo');
    if (logoInput) {
        logoInput.addEventListener('input', () => {
            const url = logoInput.value.trim();
            if (url) {
                document.getElementById('logo-preview').style.display = 'block';
                document.getElementById('logo-preview-img').src = url;
            } else {
                document.getElementById('logo-preview').style.display = 'none';
            }
        });
    }
}

async function saveCustomization() {
    customization.logo = document.getElementById('setting-logo').value.trim();
    customization.slogan = document.getElementById('setting-slogan').value.trim();
    customization.color = document.getElementById('setting-color').value;
    customization.sidebarStyle = document.getElementById('setting-sidebar-style').value;
    customization.borderStyle = document.getElementById('setting-border-style').value;
    customization.bgStyle = document.getElementById('setting-bg-style').value;

    settings.customization = customization;
    await saveSettings();
    applyCustomization();
    showToast('¡Personalización guardada!', 'success');
}

function applyCustomization() {
    const root = document.documentElement;

    // Color principal
    if (customization.color) {
        root.style.setProperty('--primary', customization.color);
        root.style.setProperty('--primary-dark', adjustColor(customization.color, -20));
        root.style.setProperty('--primary-light', adjustColor(customization.color, 80) + '20');
    }

    // Sidebar style
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        const styles = {
            'default': 'linear-gradient(180deg, #0f172a, #1e293b)',
            'gradient-blue': 'linear-gradient(180deg, #1e3a5f, #0f172a)',
            'gradient-purple': 'linear-gradient(180deg, #4c1d95, #1e1b4b)',
            'gradient-green': 'linear-gradient(180deg, #064e3b, #0f172a)',
            'gradient-dark': 'linear-gradient(180deg, #000000, #1e293b)',
            'solid-primary': customization.color || '#2563eb'
        };
        const bg = styles[customization.sidebarStyle] || styles['default'];
        sidebar.style.background = bg;
    }

    // Border style
    const radiusMap = { 'rounded': '16px', 'sharp': '4px', 'pill': '24px' };
    root.style.setProperty('--radius', radiusMap[customization.borderStyle] || '16px');
    root.style.setProperty('--radius-sm', customization.borderStyle === 'sharp' ? '2px' : customization.borderStyle === 'pill' ? '16px' : '10px');

    // Background style
    const bgMap = {
        'light': '#f1f5f9',
        'white': '#ffffff',
        'warm': '#fef7ed',
        'cool': '#f0f4f8'
    };
    if (document.documentElement.getAttribute('data-theme') !== 'dark') {
        root.style.setProperty('--bg', bgMap[customization.bgStyle] || '#f1f5f9');
    } else {
        root.style.setProperty('--bg', '#0f172a');
    }

    // Logo in sidebar
    const sidebarHeader = document.querySelector('.sidebar-header h1');
    if (sidebarHeader) {
        if (customization.logo) {
            sidebarHeader.innerHTML = `<img src="${customization.logo}" style="width:28px;height:28px;border-radius:6px;margin-right:8px;vertical-align:middle;"> ${esc(settings.businessName)}`;
        } else {
            sidebarHeader.textContent = '📦 ' + (settings.businessName || 'GestiónPro');
        }
    }

    // Slogan
    const userDisplay = document.getElementById('user-display');
    if (userDisplay && customization.slogan) {
        userDisplay.textContent = customization.slogan;
    }
}

function adjustColor(hex, amount) {
    hex = hex.replace('#', '');
    const r = Math.min(255, Math.max(0, parseInt(hex.substr(0, 2), 16) + amount));
    const g = Math.min(255, Math.max(0, parseInt(hex.substr(2, 2), 16) + amount));
    const b = Math.min(255, Math.max(0, parseInt(hex.substr(4, 2), 16) + amount));
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}



// ==========================================
// ANULAR VENTAS
// ==========================================
async function voidSale(saleId) {
    const sale = sales.find(s => s.id === saleId);
    if (!sale) return;
    if (sale.voided) { showToast('Esta venta ya fue anulada', 'info'); return; }

    if (!confirm(`¿Anular la venta de ${sale.quantity}x "${sale.productName}" por ${formatCurrency(sale.total)}?\n\nSe devolverá el stock al inventario.`)) return;

    // Marcar como anulada
    sale.voided = true;
    sale.voidedAt = new Date().toISOString();
    await saveSale(sale);

    // Devolver stock al producto
    const product = getProduct(sale.productId);
    if (product) {
        product.quantity += sale.quantity;
        await saveProduct(product);
    }

    // Devolver insumos si tiene receta
    const recipe = recipes.find(r => r.productId === sale.productId);
    if (recipe) {
        for (const ing of recipe.ingredients) {
            const insumo = insumos.find(i => i.id === ing.insumoId);
            if (insumo) {
                insumo.currentStock += ing.quantity * sale.quantity;
                await saveInsumo(insumo);
            }
        }
    }

    addHistory('delete', `Venta anulada: ${sale.quantity}x ${sale.productName} (${formatCurrency(sale.total)})`);
    renderAll();
    showToast('Venta anulada. Stock restaurado.', 'warning');
}



// ==========================================
// SISTEMA DE ROLES
// ==========================================
// Roles: 'owner' (todo), 'cashier' (ventas, inventario, caja), 'waiter' (solo mesero)
let currentRole = 'owner';
let employees = [];

function initRoles() {
    // Cargar empleados
    loadEmployees();
    // Form
    const form = document.getElementById('employee-form');
    if (form) form.addEventListener('submit', handleEmployeeSubmit);
}

async function loadEmployees() {
    try {
        const snap = await userCollection('employees').get();
        employees = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderEmployees();
    } catch (e) { console.error('Error cargando empleados:', e); }
}

function handleEmployeeSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('employee-name').value.trim();
    const email = document.getElementById('employee-email').value.trim();
    const role = document.getElementById('employee-role').value;
    const pin = document.getElementById('employee-pin').value.trim();

    if (!name || !role) { showToast('Completa nombre y rol', 'error'); return; }

    const employee = { id: generateId(), name, email, role, pin, active: true, createdAt: new Date().toISOString() };
    employees.push(employee);
    saveEmployee(employee);
    renderEmployees();
    showToast(`Empleado "${name}" agregado como ${getRoleName(role)}`, 'success');
    e.target.reset();
}

function deleteEmployee(id) {
    const emp = employees.find(e => e.id === id);
    if (!emp) return;
    if (confirm(`¿Eliminar a "${emp.name}"?`)) {
        employees = employees.filter(e => e.id !== id);
        userCollection('employees').doc(id).delete();
        renderEmployees();
        showToast('Empleado eliminado', 'warning');
    }
}

function toggleEmployeeActive(id) {
    const emp = employees.find(e => e.id === id);
    if (!emp) return;
    emp.active = !emp.active;
    saveEmployee(emp);
    renderEmployees();
    showToast(`${emp.name}: ${emp.active ? 'Activado' : 'Desactivado'}`, 'info');
}

function getRoleName(role) {
    const names = { owner: '👑 Dueño', cashier: '💰 Cajero', waiter: '📋 Mesero' };
    return names[role] || role;
}

function renderEmployees() {
    const tbody = document.getElementById('employees-body');
    if (!tbody) return;
    const empty = document.getElementById('empty-employees');

    if (employees.length === 0) { tbody.innerHTML = ''; if (empty) empty.style.display = 'block'; return; }
    if (empty) empty.style.display = 'none';

    tbody.innerHTML = employees.map(emp => `<tr style="${!emp.active ? 'opacity:0.5;' : ''}">
        <td><strong>${esc(emp.name)}</strong></td>
        <td>${esc(emp.email || '-')}</td>
        <td>${getRoleName(emp.role)}</td>
        <td>${emp.pin ? '••••' : '-'}</td>
        <td><span style="color:${emp.active ? 'var(--success)' : 'var(--danger)'};">${emp.active ? '✅ Activo' : '❌ Inactivo'}</span></td>
        <td>
            <button class="action-btn" onclick="toggleEmployeeActive('${emp.id}')" title="${emp.active ? 'Desactivar' : 'Activar'}">${emp.active ? '🚫' : '✅'}</button>
            <button class="action-btn" onclick="deleteEmployee('${emp.id}')" title="Eliminar">🗑️</button>
        </td>
    </tr>`).join('');
}

async function saveEmployee(emp) {
    try { await userCollection('employees').doc(emp.id).set(emp); }
    catch (e) { console.error('Error guardando empleado:', e); }
}

// Aplicar restricciones de rol al menú
function applyRoleRestrictions(role) {
    currentRole = role;
    const hiddenForCashier = ['page-reports', 'page-settings'];
    const hiddenForWaiter = ['page-inventory', 'page-reports', 'page-settings', 'page-expenses', 'page-insumos', 'page-recipes', 'page-clients', 'page-suppliers'];

    const allNavLinks = document.querySelectorAll('.nav-link');
    allNavLinks.forEach(link => {
        const section = link.dataset.section;
        link.style.display = '';
        if (role === 'cashier' && hiddenForCashier.includes('page-' + section)) {
            link.style.display = 'none';
        }
        if (role === 'waiter' && hiddenForWaiter.includes('page-' + section)) {
            link.style.display = 'none';
        }
    });
}



// ==========================================
// TUTORIAL / ONBOARDING
// ==========================================
function checkOnboarding() {
    if (settings.onboardingDone) return;
    showOnboarding();
}

function showOnboarding() {
    const overlay = document.createElement('div');
    overlay.id = 'onboarding-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px);';

    const steps = [
        { icon: '👋', title: '¡Bienvenido a GestiónPro!', text: 'Tu negocio completo en la nube. Te mostramos cómo empezar.' },
        { icon: '📦', title: '1. Agrega tus productos', text: 'Ve a Inventario y agrega tus productos con costo, precio y stock.' },
        { icon: '🧂', title: '2. Registra tus insumos', text: 'Si vendes preparaciones (café, comida), agrega las materias primas en Insumos.' },
        { icon: '📝', title: '3. Crea recetas', text: 'Define qué insumos lleva cada producto. Así se descuentan automáticamente al vender.' },
        { icon: '🪑', title: '4. Configura tus mesas', text: 'Ve a Mesas, agrégalas y comparte el link de mesero con tu equipo.' },
        { icon: '💰', title: '5. ¡Empieza a vender!', text: 'Registra ventas directamente o toma pedidos por mesa. Los tickets se imprimen automáticamente.' },
        { icon: '🎨', title: '6. Personaliza tu app', text: 'En Ajustes puedes cambiar colores, agregar tu logo y configurar tu negocio.' },
        { icon: '🚀', title: '¡Listo!', text: 'Ya tienes todo para empezar. Si necesitas ayuda, revisa cada sección. ¡Éxito con tu negocio!' },
    ];

    let currentStep = 0;

    function renderStep() {
        const step = steps[currentStep];
        const isLast = currentStep === steps.length - 1;
        const isFirst = currentStep === 0;
        overlay.innerHTML = `
            <div style="background:white;border-radius:20px;padding:40px 32px;max-width:420px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);animation:fadeIn 0.3s ease;">
                <div style="font-size:3.5rem;margin-bottom:16px;">${step.icon}</div>
                <h2 style="font-size:1.4rem;color:#1e293b;margin-bottom:12px;">${step.title}</h2>
                <p style="color:#64748b;font-size:1rem;margin-bottom:28px;line-height:1.5;">${step.text}</p>
                <div style="display:flex;gap:8px;justify-content:center;margin-bottom:20px;">
                    ${steps.map((_, i) => `<div style="width:8px;height:8px;border-radius:50%;background:${i === currentStep ? '#2563eb' : '#e2e8f0'};transition:background 0.2s;"></div>`).join('')}
                </div>
                <div style="display:flex;gap:12px;justify-content:center;">
                    ${!isFirst ? '<button onclick="onboardingPrev()" style="padding:12px 24px;border:2px solid #e2e8f0;background:white;border-radius:10px;font-size:0.95rem;cursor:pointer;font-weight:600;color:#64748b;">← Anterior</button>' : ''}
                    <button onclick="${isLast ? 'finishOnboarding()' : 'onboardingNext()'}" style="padding:12px 24px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:white;border:none;border-radius:10px;font-size:0.95rem;cursor:pointer;font-weight:600;box-shadow:0 4px 12px rgba(37,99,235,0.3);">${isLast ? '✅ ¡Empezar!' : 'Siguiente →'}</button>
                </div>
                ${isFirst ? '<p style="margin-top:16px;font-size:0.8rem;color:#94a3b8;cursor:pointer;" onclick="finishOnboarding()">Saltar tutorial</p>' : ''}
            </div>
        `;
    }

    window.onboardingNext = () => { currentStep = Math.min(currentStep + 1, steps.length - 1); renderStep(); };
    window.onboardingPrev = () => { currentStep = Math.max(currentStep - 1, 0); renderStep(); };
    window.finishOnboarding = async () => {
        overlay.remove();
        settings.onboardingDone = true;
        await saveSettings();
    };

    renderStep();
    document.body.appendChild(overlay);
}



// ==========================================
// SISTEMA DE PLANES Y RESTRICCIONES
// ==========================================
const PLANS = {
    trial: {
        name: 'Prueba Gratis',
        days: 3,
        features: ['inventory', 'sales', 'cashclose', 'clients', 'suppliers', 'expenses', 'insumos', 'recipes', 'calculator', 'reports', 'alerts', 'history', 'settings', 'mesas', 'dashboard']
    },
    basic: {
        name: 'Básico',
        price: 25000,
        features: ['inventory', 'sales', 'cashclose', 'clients', 'suppliers', 'expenses', 'calculator', 'reports', 'alerts', 'history', 'settings', 'dashboard']
    },
    restaurant: {
        name: 'Restaurante',
        price: 45000,
        features: ['inventory', 'sales', 'cashclose', 'clients', 'suppliers', 'expenses', 'insumos', 'recipes', 'calculator', 'reports', 'alerts', 'history', 'settings', 'mesas', 'dashboard']
    },
    premium: {
        name: 'Premium',
        price: 65000,
        features: ['inventory', 'sales', 'cashclose', 'clients', 'suppliers', 'expenses', 'insumos', 'recipes', 'calculator', 'reports', 'alerts', 'history', 'settings', 'mesas', 'dashboard']
    }
};

let currentPlan = 'trial';
let trialExpired = false;

function initPlanSystem() {
    const userPlan = settings.plan || 'trial';
    const registeredAt = settings.registeredAt || new Date().toISOString();

    // Si es trial, verificar si expiró (3 días)
    if (userPlan === 'trial') {
        const daysSinceRegister = Math.floor((Date.now() - new Date(registeredAt).getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceRegister >= 3) {
            trialExpired = true;
            showTrialExpiredMessage();
            return;
        } else {
            const daysLeft = 3 - daysSinceRegister;
            showTrialBanner(daysLeft);
        }
    }

    currentPlan = userPlan;
    applyPlanRestrictions(currentPlan);

    // Guardar fecha de registro si no existe
    if (!settings.registeredAt) {
        settings.registeredAt = new Date().toISOString();
        saveSettings();
    }
}

function applyPlanRestrictions(plan) {
    const planData = PLANS[plan];
    if (!planData) return;

    const allNavLinks = document.querySelectorAll('.nav-link');
    allNavLinks.forEach(link => {
        const section = link.dataset.section;
        if (!section) return;

        if (planData.features.includes(section)) {
            link.parentElement.style.display = '';
        } else {
            link.parentElement.style.display = 'none';
        }
    });
}

function getPlanNameForFeature(feature) {
    if (['insumos', 'recipes', 'mesas'].includes(feature)) return 'Restaurante ($45.000/mes)';
    return 'Premium ($65.000/mes)';
}

function showTrialBanner(daysLeft) {
    const banner = document.createElement('div');
    banner.id = 'trial-banner';
    banner.style.cssText = 'position:fixed;top:0;left:260px;right:0;background:linear-gradient(135deg,#f59e0b,#d97706);color:white;padding:10px 20px;text-align:center;font-size:0.85rem;font-weight:600;z-index:999;display:flex;align-items:center;justify-content:center;gap:12px;';
    banner.innerHTML = `
        <span>⏳ Prueba gratis: te quedan <strong>${daysLeft} día${daysLeft !== 1 ? 's' : ''}</strong></span>
        <a href="pagar.html" target="_blank" style="background:white;color:#d97706;padding:6px 14px;border-radius:8px;text-decoration:none;font-weight:700;font-size:0.8rem;">Activar Plan</a>
    `;
    document.body.appendChild(banner);
    // Mover contenido principal
    document.querySelector('.main-content').style.paddingTop = '70px';
}

function showTrialExpiredMessage() {
    showAppLoading(false);
    document.querySelector('.app-layout').innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:linear-gradient(135deg,#0f172a,#1e293b);padding:20px;">
            <div style="text-align:center;max-width:450px;background:white;padding:48px 32px;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
                <div style="font-size:4rem;margin-bottom:16px;">⏰</div>
                <h1 style="font-size:1.6rem;color:#1e293b;margin-bottom:12px;">Tu prueba gratis terminó</h1>
                <p style="color:#64748b;margin-bottom:8px;line-height:1.5;">Tu período de 3 días gratuitos ha expirado. Para seguir usando GestiónPro, activa un plan.</p>
                <div style="background:#f8fafc;border-radius:12px;padding:20px;margin:20px 0;text-align:left;">
                    <p style="font-weight:700;color:#1e293b;margin-bottom:12px;">Planes disponibles:</p>
                    <p style="margin-bottom:8px;">☕ <strong>Básico:</strong> $25.000/mes (Inventario + Ventas)</p>
                    <p style="margin-bottom:8px;">🍽️ <strong>Restaurante:</strong> $45.000/mes (+ Mesas + Cocina)</p>
                    <p style="margin-bottom:0;">👑 <strong>Premium:</strong> $65.000/mes (Todo incluido)</p>
                </div>
                <a href="pagar.html" style="display:block;padding:16px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:white;border-radius:12px;font-size:1.1rem;font-weight:700;text-decoration:none;margin-bottom:12px;box-shadow:0 4px 12px rgba(37,99,235,0.3);">💳 Ver Métodos de Pago</a>
                <a href="https://wa.me/573159756975?text=Hola%2C%20quiero%20activar%20mi%20plan%20de%20GestiónPro.%20Mi%20correo%20es%3A%20${encodeURIComponent(currentUser?.email || '')}" target="_blank" style="display:block;padding:14px;background:linear-gradient(135deg,#25d366,#128c7e);color:white;border-radius:12px;font-size:1rem;font-weight:700;text-decoration:none;margin-bottom:12px;">💬 Hablar por WhatsApp</a>
                <button onclick="auth.signOut().then(()=>window.location.href='login.html')" style="padding:12px 24px;background:#f1f5f9;color:#64748b;border:none;border-radius:10px;font-size:0.9rem;cursor:pointer;font-weight:600;">Cerrar Sesión</button>
            </div>
        </div>
    `;
}
