// ==========================================
// GESTIÓN PRO - APP COMPLETA
// ==========================================

// Estado Global
let products = [];
let sales = [];
let history = [];
let settings = {
    businessName: 'Mi Negocio',
    currency: '$',
    defaultTax: 16,
    defaultMargin: 30,
    theme: 'light'
};
let editingId = null;
let charts = {};

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    loadAllData();
    initNavigation();
    initTheme();
    initForms();
    initFilters();
    initSettings();
    initBackup();
    initCalculator();
    renderAll();
    showDate();
});


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
            if (section === 'dashboard') renderCharts();
            if (section === 'reports') renderReports();
            if (section === 'alerts') renderAlerts();
            if (section === 'sales') updateSaleProductList();
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

    saveProducts();
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
        saveProducts();
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
    const summary = document.getElementById('sale-summary');

    if (!productId || qty <= 0) { summary.style.display = 'none'; return; }

    const product = getProduct(productId);
    if (!product) return;

    const price = customPrice > 0 ? customPrice : product.price;
    const subtotal = price * qty;
    const profit = (price - product.cost) * qty;

    document.getElementById('sale-subtotal').textContent = formatCurrency(subtotal);
    document.getElementById('sale-profit-preview').textContent = formatCurrency(profit);
    document.getElementById('sale-profit-preview').className = profit >= 0 ? 'profit-positive' : 'profit-negative';
    summary.style.display = 'block';
}


function handleSaleSubmit(e) {
    e.preventDefault();
    const productId = document.getElementById('sale-product').value;
    const qty = parseInt(document.getElementById('sale-quantity').value) || 0;
    const customPrice = parseFloat(document.getElementById('sale-price').value);
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
    const sale = {
        id: generateId(),
        productId, productName: product.name,
        quantity: qty, price, cost: product.cost,
        total: price * qty, profit: (price - product.cost) * qty,
        client, method, notes,
        date: new Date().toISOString()
    };

    sales.push(sale);
    // Descontar stock
    const idx = products.findIndex(p => p.id === productId);
    products[idx].quantity -= qty;

    addHistory('sale', `Venta: ${qty}x ${product.name} por ${formatCurrency(sale.total)}`);
    saveSales();
    saveProducts();
    renderAll();
    showToast(`Venta registrada: ${qty}x ${product.name}`, 'success');
    e.target.reset();
    document.getElementById('sale-summary').style.display = 'none';
    updateSaleProductList();
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

    // Sorting
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

    tbody.innerHTML = filtered.slice(0, 50).map(s => `<tr>
        <td>${new Date(s.date).toLocaleDateString('es-MX', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</td>
        <td>${esc(s.productName)}</td>
        <td>${s.quantity}</td>
        <td>${formatCurrency(s.price)}</td>
        <td><strong>${formatCurrency(s.total)}</strong></td>
        <td class="${s.profit>=0?'profit-positive':'profit-negative'}">${formatCurrency(s.profit)}</td>
        <td>${s.method}</td>
        <td>${esc(s.client || '-')}</td>
    </tr>`).join('');
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

    setText('dash-total-products', totalProducts);
    setText('dash-total-stock', totalStock);
    setText('dash-investment', formatCurrency(investment));
    setText('dash-profit', formatCurrency(profit));
    setText('dash-sales-today', formatCurrency(salesTodayTotal));
    setText('dash-sales-month', formatCurrency(salesMonthTotal));
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

    // Destruir gráficas anteriores
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
            datasets: [{
                label: 'Ventas ($)',
                data: last7.map(d => d.total),
                backgroundColor: 'rgba(37,99,235,0.6)',
                borderRadius: 6
            }]
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
            datasets: [{
                data: sorted.map(s => s[1]),
                backgroundColor: ['#2563eb','#16a34a','#f59e0b','#dc2626','#8b5cf6']
            }]
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
            datasets: [{
                data: entries.map(e => e[1]),
                backgroundColor: ['#2563eb','#16a34a','#f59e0b','#dc2626','#8b5cf6','#ec4899','#14b8a6','#f97316']
            }]
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
            datasets: [{
                label: 'Ganancia ($)',
                data: entries.map(e => e[1]),
                backgroundColor: 'rgba(22,163,74,0.6)',
                borderRadius: 6
            }]
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
    // Stock bajo
    products.forEach(p => {
        if (p.quantity === 0) {
            alerts.push({ type: 'danger', title: `Sin stock: ${p.name}`, msg: 'Este producto se agotó. Reabastece pronto.' });
        } else if (p.quantity <= (p.minStock || 5)) {
            alerts.push({ type: 'warning', title: `Stock bajo: ${p.name}`, msg: `Solo quedan ${p.quantity} unidades (mínimo: ${p.minStock || 5}).` });
        }
    });
    // Márgenes bajos
    products.forEach(p => {
        const margin = ((p.price - p.cost) / p.cost) * 100;
        if (margin < 10 && margin >= 0) {
            alerts.push({ type: 'info', title: `Margen bajo: ${p.name}`, msg: `Solo ${margin.toFixed(1)}% de margen. Considera aumentar el precio.` });
        } else if (margin < 0) {
            alerts.push({ type: 'danger', title: `Vendiendo a pérdida: ${p.name}`, msg: `El precio es menor al costo. ¡Estás perdiendo dinero!` });
        }
    });
    // Productos sin movimiento (30 días sin venta)
    const thirtyDaysAgo = new Date(Date.now() - 30*24*60*60*1000).toISOString();
    products.forEach(p => {
        const lastSale = sales.filter(s => s.productId === p.id).sort((a,b) => b.date.localeCompare(a.date))[0];
        if (!lastSale && new Date(p.createdAt) < new Date(thirtyDaysAgo)) {
            alerts.push({ type: 'info', title: `Sin movimiento: ${p.name}`, msg: 'No se ha vendido en los últimos 30 días.' });
        }
    });
    return alerts;
}

function renderAlerts() {
    const grid = document.getElementById('alerts-grid');
    const empty = document.getElementById('empty-alerts');
    const alerts = generateAlerts();

    if (alerts.length === 0) {
        grid.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
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
    history.unshift({ type, message, date: new Date().toISOString() });
    if (history.length > 200) history = history.slice(0, 200);
    saveHistory();
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
        saveHistory();
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
                products.push({
                    id: generateId(), name: cols[0], category: cols[1] || 'Otro',
                    quantity: parseInt(cols[2])||0, cost: parseFloat(cols[3])||0,
                    price: parseFloat(cols[4]) || calculateSuggestedPrice(parseFloat(cols[3])||0, 30),
                    margin: parseFloat(cols[5])||30, supplier: cols[6]||'', minStock: parseInt(cols[7])||5,
                    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
                });
                imported++;
            }
        }
        saveProducts(); renderAll();
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

    // Aplicar settings guardados
    document.getElementById('setting-business-name').value = settings.businessName;
    document.getElementById('setting-currency').value = settings.currency;
    document.getElementById('setting-default-tax').value = settings.defaultTax;
    document.getElementById('setting-default-margin').value = settings.defaultMargin;
    document.getElementById('profit-margin').value = settings.defaultMargin;
}

function saveSettingsForm() {
    settings.businessName = document.getElementById('setting-business-name').value || 'Mi Negocio';
    settings.currency = document.getElementById('setting-currency').value;
    settings.defaultTax = parseFloat(document.getElementById('setting-default-tax').value) || 16;
    settings.defaultMargin = parseFloat(document.getElementById('setting-default-margin').value) || 30;
    saveSettings();
    showToast('Ajustes guardados', 'success');
}

function clearAllData() {
    if (confirm('⚠️ ¿BORRAR TODOS los datos? Esta acción NO se puede deshacer.')) {
        if (confirm('¿Estás REALMENTE seguro?')) {
            products = []; sales = []; history = [];
            saveProducts(); saveSales(); saveHistory();
            renderAll(); renderHistory();
            showToast('Todos los datos han sido borrados', 'warning');
        }
    }
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

    const lastBackup = localStorage.getItem('gestion-last-backup');
    if (lastBackup) {
        document.getElementById('last-backup').textContent = new Date(lastBackup).toLocaleString('es-MX');
    }
}

function createBackup() {
    const backup = {
        version: '2.0',
        date: new Date().toISOString(),
        products, sales, history, settings
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], {type:'application/json'});
    downloadBlob(blob, `backup-negocio-${new Date().toISOString().split('T')[0]}.json`);
    localStorage.setItem('gestion-last-backup', new Date().toISOString());
    document.getElementById('last-backup').textContent = new Date().toLocaleString('es-MX');
    showToast('Backup creado exitosamente', 'success');
}

function restoreBackup(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
        try {
            const data = JSON.parse(ev.target.result);
            if (!data.products || !Array.isArray(data.products)) {
                showToast('Archivo de backup inválido', 'error'); return;
            }
            if (confirm(`Restaurar backup del ${new Date(data.date).toLocaleString('es-MX')}? Esto reemplazará todos tus datos actuales.`)) {
                products = data.products || [];
                sales = data.sales || [];
                history = data.history || [];
                if (data.settings) settings = { ...settings, ...data.settings };
                saveProducts(); saveSales(); saveHistory(); saveSettings();
                renderAll(); renderHistory();
                addHistory('add', 'Datos restaurados desde backup');
                showToast('Backup restaurado exitosamente', 'success');
            }
        } catch(err) {
            showToast('Error al leer el archivo', 'error');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}


// ==========================================
// ALMACENAMIENTO
// ==========================================
function saveProducts() { localStorage.setItem('gp-products', JSON.stringify(products)); }
function saveSales() { localStorage.setItem('gp-sales', JSON.stringify(sales)); }
function saveHistory() { localStorage.setItem('gp-history', JSON.stringify(history)); }
function saveSettings() { localStorage.setItem('gp-settings', JSON.stringify(settings)); }

function loadAllData() {
    try { products = JSON.parse(localStorage.getItem('gp-products')) || []; } catch(e) { products = []; }
    try { sales = JSON.parse(localStorage.getItem('gp-sales')) || []; } catch(e) { sales = []; }
    try { history = JSON.parse(localStorage.getItem('gp-history')) || []; } catch(e) { history = []; }
    try {
        const s = JSON.parse(localStorage.getItem('gp-settings'));
        if (s) settings = { ...settings, ...s };
    } catch(e) {}
}

// ==========================================
// UTILIDADES
// ==========================================
function generateId() { return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2,9); }
function getProduct(id) { return products.find(p => p.id === id); }
function formatCurrency(amount) {
    return settings.currency + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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
setTimeout(() => { renderCharts(); renderHistory(); }, 500);
