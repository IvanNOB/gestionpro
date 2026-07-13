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
    const client = prompt('Nombre del cliente:');
    if (!client) return;
    const date = prompt('Fecha y hora (YYYY-MM-DD HH:MM):', new Date().toISOString().slice(0, 16).replace('T', ' '));
    if (!date) return;
    const service = prompt('Servicio:');
    if (!service) return;
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
    if (!container) return;
    const pending = appointments.filter(a => a.status === 'pendiente');
    container.innerHTML = pending.length === 0 ? '<p style="color:var(--text-light);">No hay citas pendientes</p>' :
        pending.map(a => `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:10px;margin-bottom:8px;">
            <div><strong>${esc(a.client)}</strong><br><span style="font-size:0.8rem;color:var(--text-light);">${esc(a.service)} — ${a.date}</span></div>
            <div><button onclick="completeAppointment('${a.id}')" style="background:#10b981;color:white;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;margin-right:4px;">✓</button><button onclick="cancelAppointment('${a.id}')" style="background:#ef4444;color:white;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;">✕</button></div>
        </div>`).join('');
}



// ==========================================
// #4 CUENTAS POR COBRAR / FIADOS
// ==========================================
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
    const client = prompt('¿Quién debe?');
    if (!client) return;
    const amount = parseFloat(prompt('¿Cuánto debe? ($)'));
    if (!amount || amount <= 0) return;
    const concept = prompt('Concepto:', 'Fiado');
    const debt = { id: generateId(), client, amount, concept: concept || 'Fiado', paid: 0, date: new Date().toISOString(), status: 'pendiente' };
    debts.push(debt);
    await firestoreOperation(() => userCollection('debts').doc(debt.id).set(debt));
    renderDebts();
    showToast(`Fiado registrado: ${client} debe ${formatCurrency(amount)}`, 'info');
}

async function payDebt(id) {
    const debt = debts.find(d => d.id === id);
    if (!debt) return;
    const amount = parseFloat(prompt(`¿Cuánto abona ${debt.client}? (Debe: ${formatCurrency(debt.amount - debt.paid)})`, debt.amount - debt.paid));
    if (!amount || amount <= 0) return;
    debt.paid += amount;
    if (debt.paid >= debt.amount) debt.status = 'pagado';
    await firestoreOperation(() => userCollection('debts').doc(id).update({ paid: debt.paid, status: debt.status }));
    renderDebts();
    showToast(debt.status === 'pagado' ? `✅ ${debt.client} pagó todo` : `${debt.client} abonó ${formatCurrency(amount)}`, 'success');
}

function renderDebts() {
    const container = document.getElementById('debts-list');
    if (!container) return;
    const pending = debts.filter(d => d.status === 'pendiente');
    const totalDebt = pending.reduce((s, d) => s + (d.amount - d.paid), 0);
    const header = document.getElementById('debts-total');
    if (header) header.textContent = formatCurrency(totalDebt);
    container.innerHTML = pending.length === 0 ? '<p style="color:var(--text-light);">No hay fiados pendientes 🎉</p>' :
        pending.map(d => `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:10px;margin-bottom:8px;">
            <div><strong>${esc(d.client)}</strong><br><span style="font-size:0.8rem;color:var(--text-light);">${esc(d.concept)} — ${new Date(d.date).toLocaleDateString('es-CO')}</span></div>
            <div style="text-align:right;"><div style="font-weight:700;color:var(--danger);">${formatCurrency(d.amount - d.paid)}</div>
            <button onclick="payDebt('${d.id}')" style="background:#10b981;color:white;border:none;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:0.75rem;margin-top:4px;">💵 Abonar</button></div>
        </div>`).join('');
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
    const varName = prompt('Nombre de la variante (ej: Talla M, Color Rojo, Sabor Chocolate):');
    if (!varName) return;
    const varStock = parseInt(prompt('Stock de esta variante:', '10')) || 0;
    if (!product.variants) product.variants = [];
    product.variants.push({ name: varName.trim(), stock: varStock });
    saveProduct(product);
    renderAll();
    showToast(`Variante "${varName}" agregada a ${product.name}`, 'success');
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
    const name = prompt('Nombre de la promoción (ej: 2x1 Martes, 10% descuento):');
    if (!name) return;
    const discount = parseFloat(prompt('Porcentaje de descuento (%):', '10'));
    if (!discount) return;
    const validUntil = prompt('Válida hasta (YYYY-MM-DD):', new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0]);
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
    renderMonthComparison();
    renderStockPredictions();
    renderExpirationAlerts();
}

// Ejecutar cuando la app esté lista (después de initApp)
setTimeout(() => { if (typeof currentUser !== 'undefined' && currentUser) initModulesExtra(); }, 2000);
