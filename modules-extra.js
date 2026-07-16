// ==========================================
// MÓDULOS EXTRA - GestiónPro
// Funcionalidades adicionales que NO alteran el código existente
// ==========================================

// ==========================================
// #1 LECTOR DE CÓDIGO DE BARRAS
// ==========================================
let barcodeScanner = null;

function initBarcodeScanner() {
    const btn = document.getElementById('btn-scan-barcode');
    if (btn) btn.addEventListener('click', openBarcodeScanner);
}

function openBarcodeScanner() {
    const overlay = document.createElement('div');
    overlay.id = 'barcode-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
        <div style="color:white;text-align:center;margin-bottom:16px;">
            <h3>📷 Escanear Código de Barras</h3>
            <p style="color:#94a3b8;font-size:0.85rem;">Apunta la cámara al código</p>
        </div>
        <video id="barcode-video" style="width:100%;max-width:400px;border-radius:12px;border:3px solid #2563eb;"></video>
        <button onclick="closeBarcodeScanner()" style="margin-top:16px;padding:12px 24px;background:#dc2626;color:white;border:none;border-radius:10px;font-weight:700;cursor:pointer;">✕ Cerrar</button>
        <div id="barcode-result" style="color:#10b981;margin-top:12px;font-weight:700;font-size:1.1rem;"></div>
    `;
    document.body.appendChild(overlay);
    startCamera();
}

async function startCamera() {
    try {
        const video = document.getElementById('barcode-video');
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = stream;
        video.play();
        barcodeScanner = stream;
        detectBarcode(video);
    } catch (e) {
        document.getElementById('barcode-result').textContent = '❌ No se pudo acceder a la cámara';
    }
}


async function detectBarcode(video) {
    if (!('BarcodeDetector' in window)) {
        // Fallback: usar input manual
        document.getElementById('barcode-result').innerHTML = `
            <div style="margin-top:12px;">
                <input type="text" id="manual-barcode" placeholder="Escribe el código manualmente" style="padding:12px;border-radius:8px;border:none;width:250px;font-size:1rem;text-align:center;">
                <button onclick="processBarcode(document.getElementById('manual-barcode').value)" style="padding:12px 16px;background:#2563eb;color:white;border:none;border-radius:8px;margin-left:8px;font-weight:700;cursor:pointer;">Buscar</button>
            </div>`;
        return;
    }
    const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'] });
    const scan = async () => {
        try {
            const barcodes = await detector.detect(video);
            if (barcodes.length > 0) {
                processBarcode(barcodes[0].rawValue);
                return;
            }
        } catch (e) {}
        if (document.getElementById('barcode-overlay')) requestAnimationFrame(scan);
    };
    scan();
}

function processBarcode(code) {
    if (!code) return;
    const product = products.find(p => p.barcode === code);
    if (product) {
        document.getElementById('barcode-result').textContent = `✅ ${product.name} - ${formatCurrency(product.price)}`;
        if (navigator.vibrate) navigator.vibrate(100);
        setTimeout(() => { closeBarcodeScanner(); }, 1000);
    } else {
        document.getElementById('barcode-result').textContent = `⚠️ Código "${code}" no encontrado. Agrégalo como nuevo producto.`;
    }
}

function closeBarcodeScanner() {
    if (barcodeScanner) { barcodeScanner.getTracks().forEach(t => t.stop()); barcodeScanner = null; }
    const overlay = document.getElementById('barcode-overlay');
    if (overlay) overlay.remove();
}



// ==========================================
// #2 VENTA RÁPIDA POS
// ==========================================
let posCart = [];

function openPOS() {
    const section = document.getElementById('page-pos');
    if (section) { section.classList.add('active'); document.querySelectorAll('.page').forEach(p => { if (p.id !== 'page-pos') p.classList.remove('active'); }); }
}

function addToPOS(productId) {
    const product = products.find(p => p.id === productId);
    if (!product || product.quantity <= 0) { showToast('Sin stock', 'error'); return; }
    const existing = posCart.find(i => i.productId === productId);
    if (existing) { existing.qty++; } else { posCart.push({ productId, name: product.name, price: product.price, cost: product.cost, qty: 1 }); }
    if (navigator.vibrate) navigator.vibrate(50);
    renderPOSCart();
}

function removePOSItem(productId) {
    posCart = posCart.filter(i => i.productId !== productId);
    renderPOSCart();
}

function renderPOSCart() {
    const container = document.getElementById('pos-cart');
    const totalEl = document.getElementById('pos-total');
    if (!container) return;
    const total = posCart.reduce((s, i) => s + (i.price * i.qty), 0);
    totalEl.textContent = formatCurrency(total);
    container.innerHTML = posCart.length === 0 ? '<p style="color:var(--text-light);text-align:center;">Carrito vacío</p>' :
        posCart.map(i => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
            <span>${i.qty}x ${esc(i.name)}</span>
            <span>${formatCurrency(i.price * i.qty)} <button onclick="removePOSItem('${i.productId}')" style="background:none;border:none;cursor:pointer;">✕</button></span>
        </div>`).join('');
}

async function processPOSSale() {
    if (posCart.length === 0) { showToast('Carrito vacío', 'error'); return; }
    const method = document.getElementById('pos-method')?.value || 'Efectivo';
    for (const item of posCart) {
        const sale = { id: generateId(), productId: item.productId, productName: item.name, quantity: item.qty, price: item.price, cost: item.cost, discount: 0, discountAmount: 0, total: item.price * item.qty, profit: (item.price - item.cost) * item.qty, client: '', method, notes: 'Venta POS', date: new Date().toISOString(), soldBy: sessionStorage.getItem('activeEmployee') || 'Dueño' };
        sales.push(sale);
        await saveSale(sale);
        const product = products.find(p => p.id === item.productId);
        if (product) { product.quantity -= item.qty; await saveProduct(product); }
    }
    const total = posCart.reduce((s, i) => s + (i.price * i.qty), 0);
    showToast(`💰 Venta POS: ${formatCurrency(total)}`, 'success');
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    posCart = [];
    renderPOSCart();
    renderAll();
}



// ==========================================
// #3 AGENDA DE CITAS
// ==========================================
let appointments = [];

async function loadAppointments() {
    if (!currentUser) return;
    try {
        const snap = await userCollection('appointments').orderBy('date', 'asc').limit(100).get();
        appointments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderAppointments();
    } catch (e) {}
}

async function addAppointment() {
    const result = await showModal({
        title: '📅 Nueva Cita',
        fields: [
            { label: 'Nombre del cliente', placeholder: 'Ej: María López', type: 'text' },
            { label: 'Fecha y hora', placeholder: '', type: 'datetime-local', defaultValue: new Date().toISOString().slice(0, 16) },
            { label: 'Servicio', placeholder: 'Ej: Corte de cabello', type: 'text' }
        ],
        confirmText: 'Agendar'
    });
    if (!result) return;
    const [client, date, service] = result;
    if (!client || !date || !service) { showToast('Completa todos los campos', 'error'); return; }
    const apt = { id: generateId(), client, date, service, status: 'pendiente', createdAt: new Date().toISOString() };
    appointments.push(apt);
    await firestoreOperation(() => userCollection('appointments').doc(apt.id).set(apt));
    renderAppointments();
    showToast(`Cita agendada: ${client}`, 'success');
}

async function completeAppointment(id) {
    const apt = appointments.find(a => a.id === id);
    if (!apt) return;
    apt.status = 'completada';
    await firestoreOperation(() => userCollection('appointments').doc(id).update({ status: 'completada' }));
    renderAppointments();
    showToast('Cita completada', 'success');
}

async function cancelAppointment(id) {
    appointments = appointments.filter(a => a.id !== id);
    await firestoreOperation(() => userCollection('appointments').doc(id).delete());
    renderAppointments();
    showToast('Cita cancelada', 'info');
}

function renderAppointments() {
    const container = document.getElementById('appointments-list');
    const containerPage = document.getElementById('appointments-list-page');
    const pending = appointments.filter(a => a.status === 'pendiente');
    const html = pending.length === 0 ? '<p style="color:var(--text-light);">No hay citas pendientes</p>' :
        pending.map(a => `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:10px;margin-bottom:8px;">
            <div><strong>${esc(a.client)}</strong><br><span style="font-size:0.8rem;color:var(--text-light);">${esc(a.service)} — ${a.date}</span></div>
            <div><button onclick="completeAppointment('${a.id}')" style="background:#10b981;color:white;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;margin-right:4px;">✓</button><button onclick="cancelAppointment('${a.id}')" style="background:#ef4444;color:white;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;">✕</button></div>
        </div>`).join('');
    if (container) container.innerHTML = html;
    if (containerPage) containerPage.innerHTML = html;
}
let debts = [];

async function loadDebts() {
    if (!currentUser) return;
    try {
        const snap = await userCollection('debts').get();
        debts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderDebts();
    } catch (e) {}
}

async function addDebt() {
    const result = await showModal({
        title: '📋 Nuevo Fiado',
        fields: [
            { label: '¿Quién debe?', placeholder: 'Nombre del cliente', type: 'text' },
            { label: 'Monto ($)', placeholder: '0', type: 'number', min: 1 },
            { label: 'Concepto', placeholder: 'Ej: Almuerzo', type: 'text', defaultValue: 'Fiado' }
        ],
        confirmText: 'Registrar'
    });
    if (!result) return;
    const [client, amount, concept] = result;
    if (!client || !amount || amount <= 0) { showToast('Completa nombre y monto', 'error'); return; }
    const debt = { id: generateId(), client, amount, concept: concept || 'Fiado', paid: 0, date: new Date().toISOString(), status: 'pendiente' };
    debts.push(debt);
    await firestoreOperation(() => userCollection('debts').doc(debt.id).set(debt));
    renderDebts();
    showToast(`Fiado registrado: ${client} debe ${formatCurrency(amount)}`, 'info');
}

async function payDebt(id) {
    const debt = debts.find(d => d.id === id);
    if (!debt) return;
    const remaining = debt.amount - debt.paid;
    const result = await showPrompt(`Abono de ${debt.client}`, `Debe: ${formatCurrency(remaining)}`, remaining, 'number');
    if (!result || parseFloat(result) <= 0) return;
    const amount = parseFloat(result);
    debt.paid += amount;
    if (debt.paid >= debt.amount) debt.status = 'pagado';
    await firestoreOperation(() => userCollection('debts').doc(id).update({ paid: debt.paid, status: debt.status }));
    renderDebts();
    showToast(debt.status === 'pagado' ? `✅ ${debt.client} pagó todo` : `${debt.client} abonó ${formatCurrency(amount)}`, 'success');
}

function renderDebts() {
    const container = document.getElementById('debts-list');
    const containerPage = document.getElementById('debts-list-page');
    const pending = debts.filter(d => d.status === 'pendiente');
    const totalDebt = pending.reduce((s, d) => s + (d.amount - d.paid), 0);
    
    const header = document.getElementById('debts-total');
    const headerPage = document.getElementById('debts-total-page');
    if (header) header.textContent = formatCurrency(totalDebt);
    if (headerPage) headerPage.textContent = formatCurrency(totalDebt);
    
    const html = pending.length === 0 ? '<p style="color:var(--text-light);">No hay fiados pendientes 🎉</p>' :
        pending.map(d => `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:10px;margin-bottom:8px;">
            <div><strong>${esc(d.client)}</strong><br><span style="font-size:0.8rem;color:var(--text-light);">${esc(d.concept)} — ${new Date(d.date).toLocaleDateString('es-CO')}</span></div>
            <div style="text-align:right;"><div style="font-weight:700;color:var(--danger);">${formatCurrency(d.amount - d.paid)}</div>
            <button onclick="payDebt('${d.id}')" style="background:#10b981;color:white;border:none;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:0.75rem;margin-top:4px;">💵 Abonar</button></div>
        </div>`).join('');
    
    if (container) container.innerHTML = html;
    if (containerPage) containerPage.innerHTML = html;
}



// ==========================================
// #5 NOTIFICACIÓN WHATSAPP AL COBRAR
// ==========================================
function sendWhatsAppReceipt(sale) {
    if (!sale.client) return; // No enviar si no hay cliente
    const clientData = clients?.find(c => c.name.toLowerCase() === sale.client.toLowerCase());
    if (!clientData || !clientData.phone) return;
    const phone = clientData.phone.replace(/\s/g, '').replace('+', '');
    const msg = `🧾 *${settings.businessName || 'GestiónPro'}*\n\nRecibo de venta:\n📦 ${sale.productName} x${sale.quantity}\n💰 Total: ${formatCurrency(sale.total)}\n💳 Pago: ${sale.method}\n📅 ${new Date(sale.date).toLocaleDateString('es-CO')}\n\n¡Gracias por tu compra! 🙏`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ==========================================
// #6 VARIANTES DE PRODUCTO (talla, color, sabor)
// ==========================================
// Las variantes se guardan como campo extra en el producto: product.variants = [{name: 'Talla M', stock: 10}, ...]
// No altera la estructura existente, solo agrega un campo opcional

function addVariantToProduct(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    showModal({
        title: '🏷️ Nueva Variante',
        fields: [
            { label: 'Nombre de la variante', placeholder: 'Ej: Talla M, Color Rojo', type: 'text' },
            { label: 'Stock', placeholder: '10', type: 'number', defaultValue: '10', min: 0 }
        ],
        confirmText: 'Agregar'
    }).then(result => {
        if (!result) return;
        const [varName, varStock] = result;
        if (!varName) return;
        if (!product.variants) product.variants = [];
        product.variants.push({ name: varName.trim(), stock: parseInt(varStock) || 0 });
        saveProduct(product);
        renderAll();
        showToast(`Variante "${varName}" agregada a ${product.name}`, 'success');
    });
}

// ==========================================
// #7 CONTROL DE VENCIMIENTOS
// ==========================================
function checkExpirations() {
    const today = new Date();
    const soon = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 días
    const expiring = products.filter(p => {
        if (!p.expirationDate) return false;
        const expDate = new Date(p.expirationDate);
        return expDate <= soon && expDate >= today;
    });
    const expired = products.filter(p => {
        if (!p.expirationDate) return false;
        return new Date(p.expirationDate) < today;
    });
    return { expiring, expired };
}

function renderExpirationAlerts() {
    const container = document.getElementById('expiration-alerts');
    if (!container) return;
    const { expiring, expired } = checkExpirations();
    let html = '';
    if (expired.length > 0) {
        html += expired.map(p => `<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:10px 14px;margin-bottom:6px;font-size:0.85rem;"><strong style="color:#dc2626;">⛔ VENCIDO:</strong> ${esc(p.name)} (venció ${new Date(p.expirationDate).toLocaleDateString('es-CO')})</div>`).join('');
    }
    if (expiring.length > 0) {
        html += expiring.map(p => `<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:10px 14px;margin-bottom:6px;font-size:0.85rem;"><strong style="color:#92400e;">⚠️ Por vencer:</strong> ${esc(p.name)} (vence ${new Date(p.expirationDate).toLocaleDateString('es-CO')})</div>`).join('');
    }
    container.innerHTML = html || '<p style="color:var(--text-light);">No hay productos por vencer 👍</p>';
}



// ==========================================
// #8 DESCUENTOS Y PROMOCIONES
// ==========================================
let promotions = [];

async function loadPromotions() {
    if (!currentUser) return;
    try {
        const snap = await userCollection('promotions').get();
        promotions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {}
}

async function addPromotion() {
    const result = await showModal({
        title: '🎉 Nueva Promoción',
        fields: [
            { label: 'Nombre', placeholder: 'Ej: 2x1 Martes, 10% descuento', type: 'text' },
            { label: 'Descuento (%)', placeholder: '10', type: 'number', defaultValue: '10', min: 1 },
            { label: 'Válida hasta', type: 'date', defaultValue: new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0] }
        ],
        confirmText: 'Crear Promoción'
    });
    if (!result) return;
    const [name, discount, validUntil] = result;
    if (!name || !discount) { showToast('Completa nombre y descuento', 'error'); return; }
    const promo = { id: generateId(), name: name.trim(), discount, validUntil: validUntil || '', active: true, createdAt: new Date().toISOString() };
    promotions.push(promo);
    await firestoreOperation(() => userCollection('promotions').doc(promo.id).set(promo));
    showToast(`Promoción "${name}" creada (${discount}% desc.)`, 'success');
}

function getActivePromotions() {
    const today = new Date().toISOString().split('T')[0];
    return promotions.filter(p => p.active && (!p.validUntil || p.validUntil >= today));
}

// ==========================================
// #9 COMPARATIVA MES A MES
// ==========================================
function getMonthComparison() {
    const now = new Date();
    const thisMonth = now.toISOString().slice(0, 7);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);

    const thisMonthSales = sales.filter(s => s.date.startsWith(thisMonth));
    const lastMonthSales = sales.filter(s => s.date.startsWith(lastMonth));

    const thisRevenue = thisMonthSales.reduce((s, v) => s + v.total, 0);
    const lastRevenue = lastMonthSales.reduce((s, v) => s + v.total, 0);
    const thisProfit = thisMonthSales.reduce((s, v) => s + v.profit, 0);
    const lastProfit = lastMonthSales.reduce((s, v) => s + v.profit, 0);

    const revenueChange = lastRevenue > 0 ? ((thisRevenue - lastRevenue) / lastRevenue * 100).toFixed(1) : 0;
    const profitChange = lastProfit > 0 ? ((thisProfit - lastProfit) / lastProfit * 100).toFixed(1) : 0;

    return { thisRevenue, lastRevenue, thisProfit, lastProfit, revenueChange, profitChange, thisCount: thisMonthSales.length, lastCount: lastMonthSales.length };
}

function renderMonthComparison() {
    const container = document.getElementById('month-comparison');
    if (!container) return;
    const data = getMonthComparison();
    const arrow = (val) => val > 0 ? '📈' : val < 0 ? '📉' : '➡️';
    const color = (val) => val > 0 ? 'color:#10b981' : val < 0 ? 'color:#ef4444' : '';
    container.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center;">
                <div style="font-size:0.8rem;color:var(--text-light);">Ventas este mes</div>
                <div style="font-size:1.2rem;font-weight:800;">${formatCurrency(data.thisRevenue)}</div>
                <div style="font-size:0.75rem;${color(data.revenueChange)}">${arrow(data.revenueChange)} ${data.revenueChange}% vs mes anterior</div>
            </div>
            <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center;">
                <div style="font-size:0.8rem;color:var(--text-light);">Ganancia este mes</div>
                <div style="font-size:1.2rem;font-weight:800;">${formatCurrency(data.thisProfit)}</div>
                <div style="font-size:0.75rem;${color(data.profitChange)}">${arrow(data.profitChange)} ${data.profitChange}% vs mes anterior</div>
            </div>
        </div>`;
}



// ==========================================
// #10 PREDICCIÓN DE STOCK
// ==========================================
function predictStock() {
    const predictions = [];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    products.forEach(p => {
        // Calcular ventas de los últimos 30 días para este producto
        const recentSales = sales.filter(s => s.productId === p.id && s.date >= thirtyDaysAgo);
        const totalSold = recentSales.reduce((sum, s) => sum + s.quantity, 0);
        const dailyAvg = totalSold / 30;

        if (dailyAvg > 0 && p.quantity > 0) {
            const daysLeft = Math.floor(p.quantity / dailyAvg);
            if (daysLeft <= 7) {
                predictions.push({ product: p.name, stock: p.quantity, dailyAvg: dailyAvg.toFixed(1), daysLeft, urgency: daysLeft <= 3 ? 'danger' : 'warning' });
            }
        }
    });

    return predictions.sort((a, b) => a.daysLeft - b.daysLeft);
}

function renderStockPredictions() {
    const container = document.getElementById('stock-predictions');
    if (!container) return;
    const predictions = predictStock();
    if (predictions.length === 0) {
        container.innerHTML = '<p style="color:var(--text-light);">Todos los productos tienen stock suficiente para los próximos 7 días 👍</p>';
        return;
    }
    container.innerHTML = predictions.map(p => {
        const bgColor = p.urgency === 'danger' ? '#fef2f2' : '#fef3c7';
        const borderColor = p.urgency === 'danger' ? '#fca5a5' : '#fcd34d';
        const icon = p.urgency === 'danger' ? '🚨' : '⚠️';
        return `<div style="background:${bgColor};border:1px solid ${borderColor};border-radius:10px;padding:12px 16px;margin-bottom:8px;">
            <div style="font-weight:700;">${icon} ${esc(p.product)}</div>
            <div style="font-size:0.8rem;color:#475569;margin-top:4px;">Stock: ${p.stock} | Venta diaria: ~${p.dailyAvg} | <strong>Se agota en ~${p.daysLeft} días</strong></div>
        </div>`;
    }).join('');
}

// ==========================================
// INICIALIZACIÓN DE MÓDULOS EXTRA
// ==========================================
function initModulesExtra() {
    initBarcodeScanner();
    loadAppointments();
    loadDebts();
    loadPromotions();
    loadBranches();
    loadCombos();
    loadQuotes();
    loadPurchaseLots();
    loadCashOpenings();
    loadReturns();
    loadDeliveryOrders();
    renderMonthComparison();
    renderStockPredictions();
    renderExpirationAlerts();
}

// Ejecutar cuando la app esté lista (después de initApp)
setTimeout(() => { if (typeof currentUser !== 'undefined' && currentUser) initModulesExtra(); }, 2000);



// ==========================================
// MÚLTIPLES SUCURSALES
// ==========================================
let branches = [];
let activeBranch = null;

async function loadBranches() {
    if (!currentUser) return;
    try {
        const snap = await userCollection('branches').get();
        branches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Cargar sucursal activa desde sessionStorage
        const savedBranch = sessionStorage.getItem('activeBranch');
        if (savedBranch) {
            activeBranch = branches.find(b => b.id === savedBranch) || null;
        }
        renderBranchSelector();
        renderBranchesAdmin();
    } catch (e) {}
}

async function addBranch() {
    const result = await showModal({
        title: '📍 Nueva Sucursal',
        fields: [
            { label: 'Nombre', placeholder: 'Ej: Local Centro, Sede Norte', type: 'text' },
            { label: 'Dirección (opcional)', placeholder: 'Dirección', type: 'text' },
            { label: 'Teléfono (opcional)', placeholder: 'Teléfono', type: 'text' }
        ],
        confirmText: 'Crear Sucursal'
    });
    if (!result) return;
    const [name, address, phone] = result;
    if (!name) { showToast('El nombre es obligatorio', 'error'); return; }
    const branch = {
        id: generateId(),
        name: name.trim(),
        address: address || '',
        phone: phone || '',
        active: true,
        createdAt: new Date().toISOString()
    };
    branches.push(branch);
    await firestoreOperation(() => userCollection('branches').doc(branch.id).set(branch));
    renderBranchSelector();
    renderBranchesAdmin();
    showToast(`Sucursal "${name}" creada`, 'success');
}

async function deleteBranch(id) {
    branches = branches.filter(b => b.id !== id);
    await firestoreOperation(() => userCollection('branches').doc(id).delete());
    if (activeBranch && activeBranch.id === id) {
        activeBranch = null;
        sessionStorage.removeItem('activeBranch');
    }
    renderBranchSelector();
    renderBranchesAdmin();
    showToast('Sucursal eliminada', 'warning');
}

function selectBranch(branchId) {
    if (branchId === 'all') {
        activeBranch = null;
        sessionStorage.removeItem('activeBranch');
        showToast('Viendo todas las sucursales', 'info');
    } else {
        activeBranch = branches.find(b => b.id === branchId);
        sessionStorage.setItem('activeBranch', branchId);
        showToast(`Sucursal: ${activeBranch?.name}`, 'info');
    }
    renderBranchSelector();
    // Recargar datos filtrados por sucursal
    renderAll();
}

function renderBranchSelector() {
    const container = document.getElementById('branch-selector');
    if (!container || branches.length === 0) {
        if (container) container.style.display = 'none';
        return;
    }
    container.style.display = 'block';
    container.innerHTML = `
        <select onchange="selectBranch(this.value)" style="padding:8px 14px;border:1px solid var(--border);border-radius:8px;background:var(--card-bg);color:var(--text);font-size:0.85rem;font-weight:600;">
            <option value="all" ${!activeBranch ? 'selected' : ''}>🏢 Todas las sucursales</option>
            ${branches.filter(b => b.active).map(b => `<option value="${b.id}" ${activeBranch?.id === b.id ? 'selected' : ''}>📍 ${esc(b.name)}</option>`).join('')}
        </select>
    `;
}

function renderBranchesAdmin() {
    const container = document.getElementById('branches-list');
    if (!container) return;
    if (branches.length === 0) {
        container.innerHTML = '<p style="color:var(--text-light);">No hay sucursales. Todos los datos van a un solo local.</p>';
        return;
    }
    container.innerHTML = branches.map(b => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:10px;margin-bottom:8px;">
            <div>
                <strong>📍 ${esc(b.name)}</strong>
                ${b.address ? `<br><span style="font-size:0.8rem;color:var(--text-light);">${esc(b.address)}</span>` : ''}
                ${b.phone ? `<br><span style="font-size:0.8rem;color:var(--text-light);">📞 ${esc(b.phone)}</span>` : ''}
            </div>
            <button onclick="deleteBranch('${b.id}')" style="background:var(--danger);color:white;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;">🗑️</button>
        </div>
    `).join('');
}

// Filtrar ventas por sucursal activa
function filterSalesByBranch(salesList) {
    if (!activeBranch) return salesList;
    return salesList.filter(s => s.branchId === activeBranch.id);
}

// Al registrar una venta, agregar el branchId automáticamente
// Se modifica el sale object antes de guardar (en el flujo de venta existente)
function attachBranchToSale(sale) {
    if (activeBranch) {
        sale.branchId = activeBranch.id;
        sale.branchName = activeBranch.name;
    }
    return sale;
}



// ==========================================
// COMBOS / PAQUETES
// ==========================================
let combos = [];

async function loadCombos() {
    if (!currentUser) return;
    try {
        const snap = await userCollection('combos').get();
        combos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderCombos();
    } catch (e) {}
}

async function addCombo() {
    const result = await showModal({
        title: '🎁 Nuevo Combo',
        fields: [
            { label: 'Nombre del combo', placeholder: 'Ej: Combo Hamburguesa + Bebida', type: 'text' },
            { label: 'Precio del combo ($)', placeholder: '0', type: 'number', min: 1 },
            { label: 'Productos (separados por coma)', placeholder: 'Ej: Hamburguesa, Papas, Gaseosa', type: 'text' }
        ],
        confirmText: 'Crear Combo'
    });
    if (!result) return;
    const [name, price, selectedNames] = result;
    if (!name || !price || price <= 0 || !selectedNames) { showToast('Completa todos los campos', 'error'); return; }

    const items = selectedNames.split(',').map(n => {
        const trimmed = n.trim();
        const product = products.find(p => p.name.toLowerCase().includes(trimmed.toLowerCase()));
        return product ? { productId: product.id, name: product.name, price: product.price, cost: product.cost } : { productId: null, name: trimmed, price: 0, cost: 0 };
    });

    const totalCost = items.reduce((s, i) => s + i.cost, 0);
    const combo = { id: generateId(), name: name.trim(), price, items, totalCost, profit: price - totalCost, active: true, createdAt: new Date().toISOString() };
    combos.push(combo);
    await firestoreOperation(() => userCollection('combos').doc(combo.id).set(combo));
    renderCombos();
    showToast(`Combo "${name}" creado ($${Math.round(price).toLocaleString('es-CO')})`, 'success');
}

async function sellCombo(id) {
    const combo = combos.find(c => c.id === id);
    if (!combo) return;
    const method = document.getElementById('pos-method')?.value || 'Efectivo';

    // Registrar como venta
    const sale = { id: generateId(), productId: 'combo_' + combo.id, productName: '🎁 ' + combo.name, quantity: 1, price: combo.price, cost: combo.totalCost, discount: 0, discountAmount: 0, total: combo.price, profit: combo.profit, client: '', method, notes: 'Combo', date: new Date().toISOString(), soldBy: sessionStorage.getItem('activeEmployee') || 'Dueño' };
    sales.push(sale);
    await saveSale(sale);

    // Descontar stock de cada producto del combo
    for (const item of combo.items) {
        if (item.productId) {
            const product = products.find(p => p.id === item.productId);
            if (product && product.quantity > 0) { product.quantity--; await saveProduct(product); }
        }
    }

    if (navigator.vibrate) navigator.vibrate(100);
    showToast(`💰 Combo "${combo.name}" vendido: ${formatCurrency(combo.price)}`, 'success');
    renderAll();
}

async function deleteCombo(id) {
    combos = combos.filter(c => c.id !== id);
    await firestoreOperation(() => userCollection('combos').doc(id).delete());
    renderCombos();
    showToast('Combo eliminado', 'warning');
}

function renderCombos() {
    const container = document.getElementById('combos-list');
    if (!container) return;
    if (combos.length === 0) { container.innerHTML = '<p style="color:var(--text-light);">No hay combos creados</p>'; return; }
    container.innerHTML = combos.filter(c => c.active).map(c => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:14px;background:var(--bg);border:1px solid var(--border);border-radius:12px;margin-bottom:8px;">
            <div>
                <strong>🎁 ${esc(c.name)}</strong>
                <div style="font-size:0.8rem;color:var(--text-light);margin-top:4px;">${c.items.map(i => i.name).join(' + ')}</div>
                <div style="font-size:0.8rem;color:var(--success);margin-top:2px;">Ganancia: ${formatCurrency(c.profit)}</div>
            </div>
            <div style="text-align:right;">
                <div style="font-weight:800;font-size:1.1rem;">${formatCurrency(c.price)}</div>
                <div style="display:flex;gap:6px;margin-top:6px;">
                    <button onclick="sellCombo('${c.id}')" style="background:var(--success);color:white;border:none;padding:6px 12px;border-radius:8px;cursor:pointer;font-weight:700;font-size:0.8rem;">💰 Vender</button>
                    <button onclick="deleteCombo('${c.id}')" style="background:var(--danger);color:white;border:none;padding:6px 8px;border-radius:8px;cursor:pointer;font-size:0.8rem;">🗑️</button>
                </div>
            </div>
        </div>`).join('');
}



// ==========================================
// COTIZACIONES
// ==========================================
let quotes = [];

async function loadQuotes() {
    if (!currentUser) return;
    try {
        const snap = await userCollection('quotes').orderBy('date', 'desc').limit(50).get();
        quotes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderQuotes();
    } catch (e) {}
}

async function addQuote() {
    const result = await showModal({
        title: '📋 Nueva Cotización',
        fields: [
            { label: 'Cliente', placeholder: 'Nombre del cliente', type: 'text' },
            { label: 'Productos (separados por coma)', placeholder: 'Ej: Hamburguesa x2, Papas x1', type: 'text' }
        ],
        confirmText: 'Crear Cotización'
    });
    if (!result) return;
    const [client, itemsText] = result;
    if (!client || !itemsText) { showToast('Completa cliente y productos', 'error'); return; }

    const items = itemsText.split(',').map(text => {
        const match = text.trim().match(/(.+?)\s*x?\s*(\d+)?$/i);
        const name = match ? match[1].trim() : text.trim();
        const qty = match && match[2] ? parseInt(match[2]) : 1;
        const product = products.find(p => p.name.toLowerCase().includes(name.toLowerCase()));
        return { name: product ? product.name : name, price: product ? product.price : 0, qty };
    });

    const total = items.reduce((s, i) => s + (i.price * i.qty), 0);
    const quote = { id: generateId(), client: client.trim(), items, total, status: 'pendiente', date: new Date().toISOString(), validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] };
    quotes.push(quote);
    await firestoreOperation(() => userCollection('quotes').doc(quote.id).set(quote));
    renderQuotes();
    showToast(`Cotización para "${client}" creada: ${formatCurrency(total)}`, 'success');
}

async function convertQuoteToSale(id) {
    const quote = quotes.find(q => q.id === id);
    if (!quote) return;
    const methodResult = await showModal({
        title: '💰 Convertir Cotización en Venta',
        fields: [{ label: 'Método de pago', type: 'select', defaultValue: 'Efectivo', options: [
            { value: 'Efectivo', label: '💵 Efectivo' },
            { value: 'Tarjeta', label: '💳 Tarjeta' },
            { value: 'Transferencia', label: '🏦 Transferencia' }
        ]}],
        confirmText: '💰 Cobrar'
    });
    if (!methodResult) return;
    const method = methodResult[0];

    for (const item of quote.items) {
        const product = products.find(p => p.name === item.name);
        const sale = { id: generateId(), productId: product?.id || '', productName: item.name, quantity: item.qty, price: item.price, cost: product?.cost || 0, discount: 0, discountAmount: 0, total: item.price * item.qty, profit: (item.price - (product?.cost || 0)) * item.qty, client: quote.client, method, notes: 'Desde cotización', date: new Date().toISOString(), soldBy: sessionStorage.getItem('activeEmployee') || 'Dueño' };
        sales.push(sale);
        await saveSale(sale);
        if (product) { product.quantity = Math.max(0, product.quantity - item.qty); await saveProduct(product); }
    }

    quote.status = 'convertida';
    await firestoreOperation(() => userCollection('quotes').doc(id).update({ status: 'convertida' }));
    renderQuotes();
    renderAll();
    showToast(`Cotización convertida en venta: ${formatCurrency(quote.total)}`, 'success');
}

function printQuote(id) {
    const quote = quotes.find(q => q.id === id);
    if (!quote) return;
    const html = `<!DOCTYPE html><html><head><style>body{font-family:sans-serif;padding:20px;max-width:600px;margin:auto;}h2{text-align:center;}table{width:100%;border-collapse:collapse;margin:20px 0;}th,td{border:1px solid #ddd;padding:10px;text-align:left;}th{background:#f5f5f5;}.total{font-size:1.3rem;font-weight:bold;text-align:right;margin-top:20px;}</style></head><body>
        <h2>${esc(settings.businessName || 'GestiónPro')}</h2>
        <p style="text-align:center;color:#666;">COTIZACIÓN</p>
        <p><strong>Cliente:</strong> ${esc(quote.client)}</p>
        <p><strong>Fecha:</strong> ${new Date(quote.date).toLocaleDateString('es-CO')}</p>
        <p><strong>Válida hasta:</strong> ${quote.validUntil}</p>
        <table><thead><tr><th>Producto</th><th>Cant</th><th>Precio</th><th>Subtotal</th></tr></thead>
        <tbody>${quote.items.map(i => `<tr><td>${esc(i.name)}</td><td>${i.qty}</td><td>$${Math.round(i.price).toLocaleString('es-CO')}</td><td>$${Math.round(i.price * i.qty).toLocaleString('es-CO')}</td></tr>`).join('')}</tbody></table>
        <p class="total">TOTAL: $${Math.round(quote.total).toLocaleString('es-CO')}</p>
        <p style="text-align:center;color:#999;margin-top:40px;">Esta cotización no es una factura</p>
        <script>window.onload=function(){window.print();}<\/script></body></html>`;
    const win = window.open('', '_blank', 'width=700,height=500');
    if (win) { win.document.write(html); win.document.close(); }
}

function renderQuotes() {
    const container = document.getElementById('quotes-list');
    if (!container) return;
    const pending = quotes.filter(q => q.status === 'pendiente');
    if (pending.length === 0) { container.innerHTML = '<p style="color:var(--text-light);">No hay cotizaciones pendientes</p>'; return; }
    container.innerHTML = pending.map(q => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:14px;background:var(--bg);border:1px solid var(--border);border-radius:12px;margin-bottom:8px;">
            <div>
                <strong>${esc(q.client)}</strong>
                <div style="font-size:0.8rem;color:var(--text-light);">${q.items.map(i => i.qty + 'x ' + i.name).join(', ')}</div>
                <div style="font-size:0.75rem;color:var(--text-light);">Válida hasta: ${q.validUntil}</div>
            </div>
            <div style="text-align:right;">
                <div style="font-weight:800;">${formatCurrency(q.total)}</div>
                <div style="display:flex;gap:4px;margin-top:6px;">
                    <button onclick="convertQuoteToSale('${q.id}')" style="background:var(--success);color:white;border:none;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:0.75rem;">💰 Vender</button>
                    <button onclick="printQuote('${q.id}')" style="background:var(--primary);color:white;border:none;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:0.75rem;">🖨️</button>
                </div>
            </div>
        </div>`).join('');
}



// ==========================================
// VUELTO / CAMBIO AL COBRAR
// ==========================================
function calculateChange() {
    const totalEl = document.getElementById('pos-total') || document.getElementById('order-total-value');
    if (!totalEl) return;
    const totalText = totalEl.textContent.replace(/[^0-9]/g, '');
    const total = parseInt(totalText) || 0;
    showPrompt(`💵 Calcular Vuelto (Total: ${formatCurrency(total)})`, '¿Con cuánto paga el cliente?', '', 'number').then(paid => {
        if (!paid || parseFloat(paid) <= 0) return;
        const change = parseFloat(paid) - total;
        if (change < 0) {
            showToast(`⚠️ Faltan ${formatCurrency(Math.abs(change))}`, 'error');
        } else if (change === 0) {
            showToast('✅ Pago exacto', 'success');
        } else {
            showToast(`💵 Vuelto: ${formatCurrency(change)}`, 'success');
        }
    });
}

// ==========================================
// LOTES DE COMPRA (Historial de reabastecimiento)
// ==========================================
let purchaseLots = [];

async function loadPurchaseLots() {
    if (!currentUser) return;
    try {
        const snap = await userCollection('purchaseLots').orderBy('date', 'desc').limit(50).get();
        purchaseLots = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderPurchaseLots();
    } catch (e) {}
}

async function addPurchaseLot() {
    const result = await showModal({
        title: '📦 Registrar Compra',
        fields: [
            { label: 'Producto comprado', placeholder: 'Nombre del producto', type: 'text' },
            { label: 'Unidades compradas', placeholder: '0', type: 'number', min: 1 },
            { label: 'Total pagado ($)', placeholder: '0', type: 'number', min: 1 },
            { label: 'Proveedor (opcional)', placeholder: 'Nombre del proveedor', type: 'text' }
        ],
        confirmText: 'Registrar Compra'
    });
    if (!result) return;
    const [productName, qty, totalCost, supplier] = result;
    if (!productName || !qty || qty <= 0 || !totalCost || totalCost <= 0) { showToast('Completa producto, cantidad y costo', 'error'); return; }
    const product = products.find(p => p.name.toLowerCase().includes(productName.toLowerCase()));

    const costPerUnit = totalCost / qty;
    const lot = { id: generateId(), productId: product?.id || '', productName: product?.name || productName, quantity: qty, totalCost, costPerUnit: Math.round(costPerUnit * 100) / 100, supplier, date: new Date().toISOString() };

    purchaseLots.push(lot);
    await firestoreOperation(() => userCollection('purchaseLots').doc(lot.id).set(lot));

    // Actualizar stock del producto si existe
    if (product) {
        product.quantity += qty;
        product.cost = Math.round(costPerUnit * 100) / 100; // Actualizar costo unitario
        await saveProduct(product);
        renderAll();
    }

    renderPurchaseLots();
    showToast(`📦 Compra registrada: ${qty}x ${product?.name || productName} por ${formatCurrency(totalCost)}`, 'success');
}

function renderPurchaseLots() {
    const container = document.getElementById('purchase-lots-list');
    if (!container) return;
    if (purchaseLots.length === 0) { container.innerHTML = '<p style="color:var(--text-light);">No hay compras registradas</p>'; return; }
    container.innerHTML = purchaseLots.slice(0, 20).map(l => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:10px;margin-bottom:6px;">
            <div>
                <strong>📦 ${esc(l.productName)}</strong>
                <div style="font-size:0.8rem;color:var(--text-light);">${l.quantity} uds × ${formatCurrency(l.costPerUnit)} = ${formatCurrency(l.totalCost)}${l.supplier ? ' | ' + esc(l.supplier) : ''}</div>
            </div>
            <span style="font-size:0.75rem;color:var(--text-light);">${new Date(l.date).toLocaleDateString('es-CO', {day:'2-digit', month:'short'})}</span>
        </div>`).join('');
}



// ==========================================
// REPORTES POR WHATSAPP (Enviar resumen del día al dueño)
// ==========================================
function sendDailyReportWhatsApp() {
    const today = new Date().toISOString().split('T')[0];
    const todaySales = sales.filter(s => s.date && s.date.startsWith(today));
    const totalRevenue = todaySales.reduce((s, v) => s + (v.total || 0), 0);
    const totalProfit = todaySales.reduce((s, v) => s + (v.profit || 0), 0);
    const totalCount = todaySales.length;
    const totalUnits = todaySales.reduce((s, v) => s + (v.quantity || 0), 0);

    // Desglose por método de pago
    const methods = {};
    todaySales.forEach(s => {
        methods[s.method] = (methods[s.method] || 0) + s.total;
    });
    const methodsText = Object.entries(methods).map(([m, t]) => `• ${m}: ${formatCurrency(t)}`).join('\n');

    // Top 3 productos vendidos hoy
    const productCount = {};
    todaySales.forEach(s => {
        productCount[s.productName] = (productCount[s.productName] || 0) + s.quantity;
    });
    const top3 = Object.entries(productCount).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const top3Text = top3.map((p, i) => `${i + 1}. ${p[0]} (${p[1]} uds)`).join('\n');

    // Comparativa con ayer
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const yesterdaySales = sales.filter(s => s.date && s.date.startsWith(yesterday));
    const yesterdayRevenue = yesterdaySales.reduce((s, v) => s + (v.total || 0), 0);
    const change = yesterdayRevenue > 0 ? (((totalRevenue - yesterdayRevenue) / yesterdayRevenue) * 100).toFixed(1) : '0';
    const changeEmoji = change > 0 ? '📈' : change < 0 ? '📉' : '➡️';

    // Alertas de stock bajo
    const lowStock = products.filter(p => p.quantity > 0 && p.quantity <= (p.minStock || 5));
    const outStock = products.filter(p => p.quantity === 0);
    let stockAlert = '';
    if (outStock.length > 0) stockAlert += `\n\n🚨 *SIN STOCK (${outStock.length}):*\n${outStock.slice(0, 5).map(p => '• ' + p.name).join('\n')}`;
    if (lowStock.length > 0) stockAlert += `\n\n⚠️ *Stock bajo (${lowStock.length}):*\n${lowStock.slice(0, 5).map(p => `• ${p.name} (${p.quantity} uds)`).join('\n')}`;

    const businessName = settings.businessName || 'Mi Negocio';
    const date = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const msg = `📊 *REPORTE DEL DÍA*
━━━━━━━━━━━━━━━━
🏪 *${businessName}*
📅 ${date}
━━━━━━━━━━━━━━━━

💰 *VENTAS:* ${formatCurrency(totalRevenue)}
📈 *Ganancia:* ${formatCurrency(totalProfit)}
🧾 *Transacciones:* ${totalCount}
📦 *Unidades vendidas:* ${totalUnits}

${changeEmoji} *vs Ayer:* ${change}% (${formatCurrency(yesterdayRevenue)} ayer)

💳 *POR MÉTODO DE PAGO:*
${methodsText || '• Sin ventas hoy'}

🏆 *TOP 3 PRODUCTOS:*
${top3Text || '• Sin ventas hoy'}${stockAlert}

━━━━━━━━━━━━━━━━
_Generado por GestiónPro_`;

    // Abrir WhatsApp con el mensaje
    showPrompt('📲 Enviar reporte por WhatsApp', 'Número con código de país (ej: 573001234567)', '57', 'text').then(phone => {
        if (!phone) return;
        window.open(`https://wa.me/${phone.replace(/\s/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
        showToast('Reporte enviado por WhatsApp', 'success');
    });
}

// Reporte semanal
function sendWeeklyReportWhatsApp() {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const weekSales = sales.filter(s => s.date >= weekAgo);
    const totalRevenue = weekSales.reduce((s, v) => s + (v.total || 0), 0);
    const totalProfit = weekSales.reduce((s, v) => s + (v.profit || 0), 0);
    const totalCount = weekSales.length;
    const avgDaily = totalRevenue / 7;

    // Mejor día de la semana
    const dayTotals = {};
    weekSales.forEach(s => {
        const day = s.date.split('T')[0];
        dayTotals[day] = (dayTotals[day] || 0) + s.total;
    });
    const bestDay = Object.entries(dayTotals).sort((a, b) => b[1] - a[1])[0];

    // Gastos de la semana
    const weekExpenses = expenses ? expenses.filter(e => e.date >= weekAgo.split('T')[0]).reduce((s, e) => s + (e.amount || 0), 0) : 0;
    const netProfit = totalProfit - weekExpenses;

    const businessName = settings.businessName || 'Mi Negocio';

    const msg = `📊 *REPORTE SEMANAL*
━━━━━━━━━━━━━━━━
🏪 *${businessName}*
📅 Últimos 7 días
━━━━━━━━━━━━━━━━

💰 *Ingresos:* ${formatCurrency(totalRevenue)}
📈 *Ganancia bruta:* ${formatCurrency(totalProfit)}
💸 *Gastos:* ${formatCurrency(weekExpenses)}
🏦 *Ganancia neta:* ${formatCurrency(netProfit)}

📊 *PROMEDIOS:*
• Venta diaria: ${formatCurrency(avgDaily)}
• Transacciones: ${totalCount} (${Math.round(totalCount / 7)}/día)

🏆 *Mejor día:* ${bestDay ? new Date(bestDay[0]).toLocaleDateString('es-CO', {weekday:'long', day:'numeric', month:'short'}) + ' (' + formatCurrency(bestDay[1]) + ')' : 'N/A'}

━━━━━━━━━━━━━━━━
_Generado por GestiónPro_`;

    showPrompt('📲 Enviar reporte semanal', 'Número con código de país (ej: 573001234567)', '57', 'text').then(phone => {
        if (!phone) return;
        window.open(`https://wa.me/${phone.replace(/\s/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
        showToast('Reporte semanal enviado', 'success');
    });
}



// ==========================================
// DEVOLUCIONES PARCIALES
// ==========================================
async function partialReturn() {
    const saleIdResult = await showPrompt('↩️ Devolución', 'Nombre del producto vendido a devolver', '', 'text');
    if (!saleIdResult) return;

    // Buscar la venta por nombre de producto
    const matchingSales = sales.filter(s => s.productName && s.productName.toLowerCase().includes(saleIdResult.toLowerCase()) && !s.voided);
    if (matchingSales.length === 0) { showToast('No se encontró la venta', 'error'); return; }

    const sale = matchingSales[0]; // La más reciente
    const maxQty = sale.quantity;
    const returnResult = await showModal({
        title: `↩️ Devolver: ${sale.productName}`,
        fields: [
            { label: `Unidades a devolver (máx: ${maxQty})`, placeholder: '1', type: 'number', defaultValue: '1', min: 1 },
            { label: 'Motivo', placeholder: 'Ej: Producto defectuoso', type: 'text', defaultValue: 'Devolución del cliente' }
        ],
        confirmText: 'Procesar'
    });
    if (!returnResult) return;
    const returnQty = parseInt(returnResult[0]);
    if (!returnQty || returnQty <= 0 || returnQty > maxQty) { showToast('Cantidad inválida', 'error'); return; }

    const returnAmount = (sale.price * returnQty) - (sale.discountAmount ? (sale.discountAmount / sale.quantity) * returnQty : 0);
    const reason = returnResult[1] || 'Devolución';

    // Crear registro de devolución
    const returnDoc = {
        id: generateId(),
        saleId: sale.id,
        productId: sale.productId,
        productName: sale.productName,
        quantity: returnQty,
        amount: Math.round(returnAmount * 100) / 100,
        reason,
        originalSaleDate: sale.date,
        date: new Date().toISOString(),
        processedBy: sessionStorage.getItem('activeEmployee') || 'Dueño'
    };

    await firestoreOperation(() => userCollection('returns').doc(returnDoc.id).set(returnDoc));

    // Devolver stock al producto
    const product = products.find(p => p.id === sale.productId);
    if (product) {
        product.quantity += returnQty;
        await saveProduct(product);
    }

    // Si devolvió todo, marcar venta como anulada
    if (returnQty === maxQty) {
        sale.voided = true;
        sale.voidedAt = new Date().toISOString();
        await firestoreOperation(() => userCollection('sales').doc(sale.id).update({ voided: true, voidedAt: sale.voidedAt }));
    } else {
        // Actualizar la venta con la cantidad reducida
        sale.quantity -= returnQty;
        sale.total = sale.price * sale.quantity;
        sale.profit = (sale.price - sale.cost) * sale.quantity;
        await firestoreOperation(() => userCollection('sales').doc(sale.id).update({ quantity: sale.quantity, total: sale.total, profit: sale.profit }));
    }

    renderAll();
    loadReturns();
    showToast(`✅ Devolución: ${returnQty}x ${sale.productName} (${formatCurrency(returnAmount)})`, 'success');
}

let returns = [];

async function loadReturns() {
    if (!currentUser) return;
    try {
        const snap = await userCollection('returns').orderBy('date', 'desc').limit(20).get();
        returns = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderReturns();
    } catch (e) {}
}

function renderReturns() {
    const container = document.getElementById('returns-list');
    if (!container) return;
    if (returns.length === 0) { container.innerHTML = '<p style="color:var(--text-light);">No hay devoluciones registradas</p>'; return; }
    container.innerHTML = returns.map(r => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:10px;margin-bottom:6px;">
            <div>
                <strong>↩️ ${r.quantity}x ${esc(r.productName)}</strong>
                <div style="font-size:0.75rem;color:var(--text-light);">${esc(r.reason)} — ${new Date(r.date).toLocaleDateString('es-CO', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
            </div>
            <span style="font-weight:700;color:var(--danger);">-${formatCurrency(r.amount)}</span>
        </div>`).join('');
}



// ==========================================
// APERTURA DE CAJA
// ==========================================
let cashOpenings = [];

async function openCashRegister() {
    const result = await showModal({
        title: '🔓 Abrir Caja',
        fields: [
            { label: 'Monto base inicial ($)', placeholder: '0', type: 'number', defaultValue: '0', min: 0 },
            { label: 'Turno', type: 'select', defaultValue: 'mañana', options: [
                { value: 'mañana', label: '☀️ Mañana' },
                { value: 'noche', label: '🌙 Noche' },
                { value: 'todo', label: '📊 Todo el día' }
            ]}
        ],
        confirmText: '🔓 Abrir Caja'
    });
    if (!result) return;
    const [amount, shift] = result;
    if (isNaN(amount)) return;

    const opening = {
        id: generateId(),
        amount,
        shift,
        openedBy: sessionStorage.getItem('activeEmployee') || 'Dueño',
        date: new Date().toISOString().split('T')[0],
        time: new Date().toISOString()
    };

    cashOpenings.push(opening);
    await firestoreOperation(() => userCollection('cashOpenings').doc(opening.id).set(opening));
    renderCashOpening();
    showToast(`✅ Caja abierta con ${formatCurrency(amount)} (${shift})`, 'success');
}

async function loadCashOpenings() {
    if (!currentUser) return;
    try {
        const today = new Date().toISOString().split('T')[0];
        const snap = await userCollection('cashOpenings').orderBy('time', 'desc').limit(5).get();
        cashOpenings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderCashOpening();
    } catch (e) {}
}

function renderCashOpening() {
    const container = document.getElementById('cash-opening-info');
    if (!container) return;
    const today = new Date().toISOString().split('T')[0];
    const todayOpenings = cashOpenings.filter(o => o.date === today);

    if (todayOpenings.length === 0) {
        container.innerHTML = `
            <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center;">
                <p style="color:var(--text-light);margin-bottom:10px;">⚠️ No se ha abierto caja hoy</p>
                <button class="btn btn-sm btn-primary" onclick="openCashRegister()">🔓 Abrir Caja</button>
            </div>`;
        return;
    }

    container.innerHTML = todayOpenings.map(o => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:10px;margin-bottom:6px;">
            <div>
                <strong>🔓 Caja abierta</strong>
                <div style="font-size:0.8rem;color:var(--text-light);">${esc(o.shift)} — ${esc(o.openedBy)} — ${new Date(o.time).toLocaleTimeString('es-CO', {hour:'2-digit',minute:'2-digit'})}</div>
            </div>
            <span style="font-weight:700;color:var(--success);">${formatCurrency(o.amount)}</span>
        </div>`).join('');
}



// ==========================================
// PEDIDOS PARA LLEVAR / DELIVERY
// ==========================================
let deliveryOrders = [];

async function newDeliveryOrder() {
    const result = await showModal({
        title: '🛍️ Nuevo Pedido Para Llevar',
        fields: [
            { label: 'Nombre del cliente', placeholder: 'Ej: Juan Pérez', type: 'text' },
            { label: 'Teléfono', placeholder: 'Ej: 300 123 4567', type: 'text' },
            { label: 'Dirección (vacío = para llevar)', placeholder: 'Dirección de entrega', type: 'text' },
            { label: 'Productos (separados por coma)', placeholder: 'Ej: Hamburguesa x2, Papas x1', type: 'text' }
        ],
        confirmText: 'Crear Pedido'
    });
    if (!result) return;
    const [client, phone, address, itemsText] = result;
    if (!client || !itemsText) { showToast('Necesitas nombre y productos', 'error'); return; }
    const type = address ? 'delivery' : 'para_llevar';

    const items = itemsText.split(',').map(text => {
        const match = text.trim().match(/(.+?)\s*x?\s*(\d+)?$/i);
        const name = match ? match[1].trim() : text.trim();
        const qty = match && match[2] ? parseInt(match[2]) : 1;
        const product = products.find(p => p.name.toLowerCase().includes(name.toLowerCase()));
        return { productId: product?.id || '', name: product?.name || name, price: product?.price || 0, cost: product?.cost || 0, qty };
    });

    const total = items.reduce((s, i) => s + (i.price * i.qty), 0);
    let deliveryFee = 0;
    if (type === 'delivery') {
        const feeResult = await showPrompt('🏍️ Costo del domicilio ($)', '0', '0', 'number');
        deliveryFee = feeResult ? parseFloat(feeResult) || 0 : 0;
    }

    const order = {
        id: generateId(),
        client,
        phone,
        address,
        type, // 'delivery' o 'para_llevar'
        items,
        subtotal: total,
        deliveryFee,
        total: total + deliveryFee,
        status: 'pendiente', // pendiente → preparando → listo → entregado
        date: new Date().toISOString(),
        createdBy: sessionStorage.getItem('activeEmployee') || 'Dueño'
    };

    deliveryOrders.push(order);
    await firestoreOperation(() => userCollection('deliveryOrders').doc(order.id).set(order));
    renderDeliveryOrders();
    showToast(`📦 Pedido ${type === 'delivery' ? 'domicilio' : 'para llevar'}: ${client} (${formatCurrency(order.total)})`, 'success');
}

async function updateDeliveryStatus(id, newStatus) {
    const order = deliveryOrders.find(o => o.id === id);
    if (!order) return;
    order.status = newStatus;
    await firestoreOperation(() => userCollection('deliveryOrders').doc(id).update({ status: newStatus, updatedAt: new Date().toISOString() }));

    // Si se entrega, registrar como venta
    if (newStatus === 'entregado') {
        const methodResult = await showModal({
            title: '💰 Cobrar Pedido',
            fields: [{ label: 'Método de pago', type: 'select', defaultValue: 'Efectivo', options: [
                { value: 'Efectivo', label: '💵 Efectivo' },
                { value: 'Tarjeta', label: '💳 Tarjeta' },
                { value: 'Transferencia', label: '🏦 Transferencia' }
            ]}],
            confirmText: '💰 Cobrar'
        });
        const method = methodResult ? methodResult[0] : 'Efectivo';
        for (const item of order.items) {
            const sale = { id: generateId(), productId: item.productId, productName: item.name, quantity: item.qty, price: item.price, cost: item.cost, discount: 0, discountAmount: 0, total: item.price * item.qty, profit: (item.price - item.cost) * item.qty, client: order.client, method, notes: order.type === 'delivery' ? 'Domicilio' : 'Para llevar', date: new Date().toISOString(), soldBy: sessionStorage.getItem('activeEmployee') || 'Dueño' };
            sales.push(sale);
            await saveSale(sale);
            const product = products.find(p => p.id === item.productId);
            if (product) { product.quantity = Math.max(0, product.quantity - item.qty); await saveProduct(product); }
        }
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        showToast(`✅ Pedido entregado y cobrado: ${formatCurrency(order.total)}`, 'success');
        renderAll();
    } else {
        const labels = { preparando: '👨‍🍳 Preparando', listo: '✅ Listo para entregar' };
        showToast(labels[newStatus] || newStatus, 'info');
    }
    renderDeliveryOrders();
}

async function loadDeliveryOrders() {
    if (!currentUser) return;
    try {
        const snap = await userCollection('deliveryOrders').orderBy('date', 'desc').limit(20).get();
        deliveryOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderDeliveryOrders();
    } catch (e) {}
}

function renderDeliveryOrders() {
    const container = document.getElementById('delivery-orders-list');
    const containerPage = document.getElementById('delivery-orders-page');
    const active = deliveryOrders.filter(o => o.status !== 'entregado');

    const html = generateDeliveryHTML(active);
    if (container) container.innerHTML = html;
    if (containerPage) containerPage.innerHTML = html;
}

function generateDeliveryHTML(active) {
    if (active.length === 0) return '<p style="color:var(--text-light);">No hay pedidos para llevar/delivery activos</p>';

    const statusColors = { pendiente: '#f59e0b', preparando: '#3b82f6', listo: '#10b981' };
    const statusLabels = { pendiente: '🆕 Pendiente', preparando: '👨‍🍳 Preparando', listo: '✅ Listo' };
    const typeLabels = { delivery: '🏍️ Domicilio', para_llevar: '🛍️ Para llevar' };

    return active.map(o => {
        let actionBtn = '';
        if (o.status === 'pendiente') actionBtn = `<button onclick="updateDeliveryStatus('${o.id}','preparando')" style="background:#3b82f6;color:white;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:0.75rem;">👨‍🍳 Preparar</button>`;
        else if (o.status === 'preparando') actionBtn = `<button onclick="updateDeliveryStatus('${o.id}','listo')" style="background:#10b981;color:white;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:0.75rem;">✅ Listo</button>`;
        else if (o.status === 'listo') actionBtn = `<button onclick="updateDeliveryStatus('${o.id}','entregado')" style="background:#8b5cf6;color:white;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:0.75rem;">💰 Entregar y Cobrar</button>`;

        return `<div style="background:var(--bg);border:1px solid var(--border);border-left:4px solid ${statusColors[o.status]};border-radius:10px;padding:14px;margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
                <div>
                    <strong>${esc(o.client)}</strong> <span style="font-size:0.75rem;background:rgba(255,255,255,0.08);padding:2px 8px;border-radius:4px;">${typeLabels[o.type] || ''}</span>
                    ${o.phone ? `<div style="font-size:0.8rem;color:var(--text-light);">📞 ${esc(o.phone)}</div>` : ''}
                    ${o.address ? `<div style="font-size:0.8rem;color:var(--text-light);">📍 ${esc(o.address)}</div>` : ''}
                </div>
                <span style="font-size:0.75rem;color:${statusColors[o.status]};font-weight:700;">${statusLabels[o.status] || ''}</span>
            </div>
            <div style="font-size:0.85rem;margin-bottom:8px;">${o.items.map(i => `${i.qty}x ${esc(i.name)}`).join(', ')}</div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <strong>${formatCurrency(o.total)}${o.deliveryFee > 0 ? ` (envío: ${formatCurrency(o.deliveryFee)})` : ''}</strong>
                ${actionBtn}
            </div>
        </div>`;
    }).join('');
}


