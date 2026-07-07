// ==========================================
// MESERO - Tomar Pedidos por Mesa (Tablet/Celular)
// ==========================================

// Error handler para mesero
window.onerror = function(message, source, lineno, colno, error) {
    console.error('Error:', { message, source, lineno, error });
    showToast('Error inesperado. Intenta de nuevo.', 'error');
    return true;
};

window.addEventListener('unhandledrejection', function(event) {
    console.error('Error async:', event.reason);
    if (event.reason?.code !== 'unavailable') {
        showToast('Error de conexión. Se guardará al reconectar.', 'warning');
    }
});

let currentUser = null;
let products = [];
let mesas = [];
let orders = {};
let currentMesaId = null;
let insumos = [];
let recipes = [];
let settings = { businessName: 'Mi Negocio', customization: {} };

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            // Verificar que pasó por el sistema de turnos o es dueño
            const activeRole = sessionStorage.getItem('activeRole');
            if (!activeRole) {
                // No pasó por turno - redirigir a turno
                window.location.href = 'turno.html';
                return;
            }
            currentUser = user;
            await loadData();
            document.getElementById('loading-screen').style.display = 'none';
            renderMesas();
            // Aplicar restricciones según rol
            applyMeseroRoleRestrictions(activeRole);
        } else {
            window.location.href = 'login.html';
        }
    });
});

function userDoc() { return db.collection('users').doc(currentUser.uid); }
function userCollection(name) { return userDoc().collection(name); }

async function loadData() {
    const [productsSnap, mesasSnap, ordersSnap, insumosSnap, recipesSnap, userDocSnap] = await Promise.all([
        userCollection('products').get(),
        userCollection('mesas').get(),
        userCollection('orders').get(),
        userCollection('insumos').get(),
        userCollection('recipes').get(),
        userDoc().get()
    ]);
    products = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    mesas = mesasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    insumos = insumosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    recipes = recipesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    if (userDocSnap.exists && userDocSnap.data().settings) {
        settings = { ...settings, ...userDocSnap.data().settings };
    }
    
    // Cargar pedidos activos (cualquier estado excepto completed)
    ordersSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.status && data.status !== 'completed') {
            orders[data.mesaId] = data.items || [];
        }
    });

    // Si no hay mesas, crear unas por defecto
    if (mesas.length === 0) {
        for (let i = 1; i <= 6; i++) {
            const mesa = { id: 'mesa_' + i, name: 'Mesa ' + i, capacity: 4, status: 'libre' };
            mesas.push(mesa);
            await userCollection('mesas').doc(mesa.id).set(mesa);
        }
    }
}

// ==========================================
// VISTA DE MESAS
// ==========================================
function renderMesas() {
    const grid = document.getElementById('mesas-grid');
    grid.innerHTML = mesas.map(m => {
        const hasOrder = orders[m.id] && orders[m.id].length > 0;
        const total = hasOrder ? orders[m.id].reduce((s, i) => s + (i.price * i.qty), 0) : 0;
        const itemCount = hasOrder ? orders[m.id].reduce((s, i) => s + i.qty, 0) : 0;
        const statusClass = hasOrder ? 'ocupada' : 'libre';
        return `<div class="mesa-card ${statusClass}" onclick="openMesa('${m.id}')">
            ${hasOrder ? `<div class="mesa-items-count">${itemCount}</div>` : ''}
            <div class="mesa-icon">${hasOrder ? '🍽️' : '🪑'}</div>
            <div class="mesa-name">${esc(m.name)}</div>
            <div class="mesa-status">${hasOrder ? '● Ocupada' : '● Libre'}</div>
            ${hasOrder ? `<div class="mesa-total">${formatCurrency(total)}</div>` : ''}
        </div>`;
    }).join('');
}

function showMesas() {
    document.getElementById('mesas-view').style.display = 'block';
    document.getElementById('order-view').classList.remove('active');
    renderMesas();
}

// ==========================================
// VISTA DE PEDIDO
// ==========================================
function openMesa(mesaId) {
    currentMesaId = mesaId;
    const mesa = mesas.find(m => m.id === mesaId);
    document.getElementById('order-mesa-name').textContent = mesa ? mesa.name : 'Mesa';
    
    document.getElementById('mesas-view').style.display = 'none';
    document.getElementById('order-view').classList.add('active');
    
    renderCategories();
    renderProducts();
    renderOrderItems();
    initProductSearch();
}

function renderCategories() {
    const cats = [...new Set(products.map(p => p.category))].sort();
    const bar = document.getElementById('categories-bar');
    bar.innerHTML = `<button class="cat-btn active" onclick="filterCategory('')">Todos</button>` +
        cats.map(c => `<button class="cat-btn" onclick="filterCategory('${c}')">${esc(c)}</button>`).join('');
}

// Búsqueda de productos
let searchTimeout = null;
function initProductSearch() {
    const searchEl = document.getElementById('product-search');
    if (searchEl) {
        searchEl.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                renderProducts('', e.target.value.trim().toLowerCase());
            }, 200);
        });
    }
}

function filterCategory(cat) {
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    if (event && event.target) event.target.classList.add('active');
    const searchEl = document.getElementById('product-search');
    const search = searchEl ? searchEl.value.trim().toLowerCase() : '';
    renderProducts(cat, search);
}

function renderProducts(category = '', search = '') {
    let filtered = products.filter(p => p.quantity > 0);
    if (category) filtered = filtered.filter(p => p.category === category);
    if (search) filtered = filtered.filter(p => p.name.toLowerCase().includes(search));
    
    const grid = document.getElementById('products-grid');
    if (filtered.length === 0) {
        grid.innerHTML = '<p style="text-align:center;color:var(--text-muted, #64748b);padding:20px;grid-column:1/-1;">No se encontraron productos</p>';
        return;
    }
    grid.innerHTML = filtered.map(p => {
        const hasImage = p.image && p.image.trim();
        const hasDesc = p.description && p.description.trim();
        const imgHtml = hasImage 
            ? `<img src="${esc(p.image)}" style="width:100%;height:80px;object-fit:cover;border-radius:10px;margin-bottom:8px;" loading="lazy" onerror="this.style.display='none'">`
            : '';
        const descHtml = hasDesc 
            ? `<div style="font-size:0.7rem;color:var(--text-secondary,#94a3b8);margin-top:4px;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${esc(p.description)}</div>` 
            : '';
        return `<div class="product-btn ${hasImage ? 'with-image' : ''}" onclick="addToOrder('${p.id}')">
            ${imgHtml}
            <div class="prod-name">${esc(p.name)}</div>
            <div class="prod-price">${formatCurrency(p.price)}</div>
            ${descHtml}
            <div class="prod-stock">${p.quantity > 5 ? 'Stock: ' + p.quantity : '⚠️ ' + p.quantity}</div>
        </div>`;
    }).join('');
}

// ==========================================
// GESTIÓN DEL PEDIDO
// ==========================================
function addToOrder(productId) {
    if (!orders[currentMesaId]) orders[currentMesaId] = [];
    
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    // Validar stock disponible
    const currentInOrder = orders[currentMesaId].find(i => i.productId === productId);
    const qtyInOrder = currentInOrder ? currentInOrder.qty : 0;
    if (qtyInOrder >= product.quantity) {
        showToast(`Sin stock de ${product.name}`, 'error');
        return;
    }
    
    if (currentInOrder) {
        currentInOrder.qty++;
    } else {
        orders[currentMesaId].push({
            productId: product.id,
            name: product.name,
            price: product.price,
            cost: product.cost,
            qty: 1
        });
    }
    renderOrderItems();
    showToast(`+ ${product.name}`, 'info');
}

function changeQty(productId, delta) {
    const item = orders[currentMesaId]?.find(i => i.productId === productId);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
        orders[currentMesaId] = orders[currentMesaId].filter(i => i.productId !== productId);
    }
    renderOrderItems();
}

function addItemNote(productId) {
    const item = orders[currentMesaId]?.find(i => i.productId === productId);
    if (!item) return;
    const note = prompt(`Nota para "${item.name}":`, item.notes || '');
    if (note !== null) {
        item.notes = note.trim();
        renderOrderItems();
    }
}

function renderOrderItems() {
    const items = orders[currentMesaId] || [];
    const list = document.getElementById('order-items-list');
    const totalEl = document.getElementById('order-total-value');
    const countEl = document.getElementById('order-count');
    
    const totalItems = items.reduce((s, i) => s + i.qty, 0);
    if (countEl) countEl.textContent = totalItems;
    
    if (items.length === 0) {
        list.innerHTML = '<p class="empty-order">Toca un producto para agregarlo</p>';
        totalEl.textContent = '$0';
        return;
    }
    
    let total = 0;
    list.innerHTML = items.map(i => {
        const subtotal = i.price * i.qty;
        total += subtotal;
        return `<div class="order-item">
            <div style="flex:1;min-width:0;">
                <span class="order-item-name">${esc(i.name)}</span>
                ${i.notes ? `<div style="font-size:0.7rem;color:var(--accent-amber,#f59e0b);margin-top:2px;">📝 ${esc(i.notes)}</div>` : ''}
            </div>
            <div class="order-item-qty">
                <button class="qty-btn minus" onclick="changeQty('${i.productId}', -1)">−</button>
                <span class="qty-num">${i.qty}</span>
                <button class="qty-btn plus" onclick="changeQty('${i.productId}', 1)">+</button>
            </div>
            <span class="order-item-price">${formatCurrency(subtotal)}</span>
            <button onclick="addItemNote('${i.productId}')" style="background:none;border:none;font-size:0.9rem;cursor:pointer;padding:4px;" title="Agregar nota">📝</button>
        </div>`;
    }).join('');
    
    totalEl.textContent = formatCurrency(total);
}

// ==========================================
// ACCIONES DE PEDIDO
// ==========================================
async function sendOrder() {
    const items = orders[currentMesaId];
    if (!items || items.length === 0) { showToast('El pedido está vacío', 'error'); return; }
    
    const mesa = mesas.find(m => m.id === currentMesaId);
    
    try {
        // Guardar pedido en Firestore
        const orderDoc = {
            id: 'order_' + currentMesaId,
            mesaId: currentMesaId,
            mesaName: mesa?.name || '',
            items: items,
            total: items.reduce((s, i) => s + (i.price * i.qty), 0),
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        await userCollection('orders').doc(orderDoc.id).set(orderDoc);
        
        // Imprimir ticket de cocina automáticamente
        printKitchenTicket(mesa?.name || 'Mesa', items);
        
        showToast('✅ Pedido enviado a cocina', 'success');
        showMesas();
    } catch (error) {
        console.error('Error enviando pedido:', error);
        showToast('⚠️ Error enviando pedido. Se guardará al reconectar.', 'warning');
    }
}

async function payOrder() {
    const items = orders[currentMesaId];
    if (!items || items.length === 0) { showToast('No hay pedido para cobrar', 'error'); return; }
    
    const total = items.reduce((s, i) => s + (i.price * i.qty), 0);
    const mesa = mesas.find(m => m.id === currentMesaId);
    const payMethod = selectedPayMethod || 'Efectivo';
    
    // Mostrar indicador de procesando
    showToast('💳 Procesando cobro...', 'info');
    
    try {
        // Registrar cada item como venta
        for (const item of items) {
            const sale = {
                id: generateId(),
                productId: item.productId,
                productName: item.name,
                quantity: item.qty,
                price: item.price,
                cost: item.cost || 0,
                discount: 0,
                discountAmount: 0,
                total: item.price * item.qty,
                profit: (item.price - (item.cost || 0)) * item.qty,
                client: mesa?.name || '',
                method: payMethod,
                notes: 'Pedido de mesa',
                date: new Date().toISOString(),
                soldBy: sessionStorage.getItem('activeEmployee') || 'Dueño'
            };
            await userCollection('sales').doc(sale.id).set(sale);
            
            // Descontar stock del producto
            const product = products.find(p => p.id === item.productId);
            if (product) {
                product.quantity = Math.max(0, product.quantity - item.qty);
                await userCollection('products').doc(product.id).set(product);
            }
            
            // Descontar insumos
            deductInsumos(item.productId, item.qty);
        }
        
        // Imprimir ticket de venta
        printTableBillTicket(mesa?.name || 'Mesa', items, total, payMethod);
        
        // Limpiar pedido (solo si todo lo anterior fue exitoso)
        delete orders[currentMesaId];
        await userCollection('orders').doc('order_' + currentMesaId).delete();
        
        showToast(`💰 Cobrado ${formatCurrency(total)}`, 'success');
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        showMesas();
        renderProducts();
    } catch (error) {
        console.error('Error al cobrar:', error);
        showToast('⚠️ Error al cobrar. Verifica la conexión e intenta de nuevo.', 'error');
        // No limpiar el pedido si falló — para que pueda reintentar
    }
}

function deductInsumos(productId, qty) {
    const recipe = recipes.find(r => r.productId === productId);
    if (!recipe) return;
    recipe.ingredients.forEach(ing => {
        const insumo = insumos.find(i => i.id === ing.insumoId);
        if (insumo) {
            insumo.currentStock = Math.max(0, insumo.currentStock - (ing.quantity * qty));
            userCollection('insumos').doc(insumo.id).set(insumo);
        }
    });
}

function clearCurrentOrder() {
    if (!orders[currentMesaId] || orders[currentMesaId].length === 0) return;
    delete orders[currentMesaId];
    userCollection('orders').doc('order_' + currentMesaId).delete();
    renderOrderItems();
    showToast('Pedido eliminado', 'info');
}

// Dividir cuenta (por cantidad de personas)
function splitBill() {
    const items = orders[currentMesaId];
    if (!items || items.length === 0) { showToast('No hay pedido para dividir', 'error'); return; }

    const total = items.reduce((s, i) => s + (i.price * i.qty), 0);
    const people = prompt('¿Entre cuántas personas dividir la cuenta?', '2');
    if (!people || parseInt(people) <= 0) return;

    const perPerson = total / parseInt(people);
    showToast(`💰 Cada persona paga: ${formatCurrency(perPerson)} (${people} personas)`, 'success');

    // Mostrar en la lista como referencia
    const list = document.getElementById('order-items-list');
    list.innerHTML += `<div style="margin-top:12px;padding:12px;background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.3);border-radius:10px;text-align:center;">
        <div style="font-size:0.85rem;color:#8b5cf6;font-weight:600;">➗ Cuenta dividida entre ${people} personas</div>
        <div style="font-size:1.3rem;font-weight:800;color:#8b5cf6;margin-top:4px;">${formatCurrency(perPerson)} c/u</div>
    </div>`;
}

// ==========================================
// UTILIDADES
// ==========================================
function generateId() { return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9); }
function formatCurrency(amount) {
    return '$' + Math.round(amount || 0).toLocaleString('es-CO');
}
function esc(text) { const d = document.createElement('div'); d.textContent = text || ''; return d.innerHTML; }
function showToast(msg, type) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 2000);
}



// Imprimir pre-cuenta de la mesa actual
function printPreBill() {
    const items = orders[currentMesaId];
    if (!items || items.length === 0) { showToast('No hay pedido', 'error'); return; }
    const mesa = mesas.find(m => m.id === currentMesaId);
    const total = items.reduce((s, i) => s + (i.price * i.qty), 0);
    printPreBillTicket(mesa?.name || 'Mesa', items, total);
}



// Método de pago seleccionado
let selectedPayMethod = 'Efectivo';

function selectPayMethod(btn, method) {
    selectedPayMethod = method;
    document.querySelectorAll('.pay-method-btn').forEach(b => {
        b.style.background = 'var(--bg-glass, #222)';
        b.style.color = 'var(--text-secondary, #aaa)';
    });
    btn.style.background = 'var(--accent-green, #10b981)';
    btn.style.color = 'white';
}


// ==========================================
// RESTRICCIONES POR ROL EN MESERO
// ==========================================
function applyMeseroRoleRestrictions(role) {
    // Mesero: solo puede tomar pedidos y enviar, NO puede cobrar ni dividir
    if (role === 'waiter') {
        const btnCobrar = document.getElementById('btn-cobrar');
        const btnPrebill = document.getElementById('btn-prebill');
        const btnDividir = document.getElementById('btn-dividir');
        const payMethods = document.querySelectorAll('.pay-method-btn');
        
        if (btnCobrar) btnCobrar.style.display = 'none';
        if (btnPrebill) btnPrebill.style.display = 'none';
        if (btnDividir) btnDividir.style.display = 'none';
        payMethods.forEach(btn => btn.style.display = 'none');
    }

    // Caja y Dueño pueden ver la cocina
    if (role === 'caja' || role === 'owner') {
        const btnCocina = document.getElementById('btn-cocina-mesero');
        if (btnCocina) btnCocina.style.display = '';
    }

    // Solo el dueño puede ver el botón de ir al panel principal
    if (role === 'owner') {
        const btnHome = document.getElementById('btn-home-mesero');
        if (btnHome) btnHome.style.display = '';
    }
}



// ==========================================
// INDICADOR OFFLINE/ONLINE
// ==========================================
window.addEventListener('offline', () => {
    let el = document.getElementById('offline-indicator');
    if (!el) {
        el = document.createElement('div');
        el.id = 'offline-indicator';
        el.style.cssText = 'position:fixed;bottom:16px;left:16px;padding:10px 18px;border-radius:10px;font-size:0.85rem;font-weight:700;z-index:9999;display:flex;align-items:center;gap:8px;';
        document.body.appendChild(el);
    }
    el.style.background = '#fef2f2';
    el.style.color = '#dc2626';
    el.style.border = '1px solid #fca5a5';
    el.innerHTML = '📡 Sin conexión — Los pedidos se guardan local';
    el.style.display = 'flex';
});

window.addEventListener('online', () => {
    let el = document.getElementById('offline-indicator');
    if (!el) return;
    el.style.background = '#f0fdf4';
    el.style.color = '#16a34a';
    el.style.border = '1px solid #86efac';
    el.innerHTML = '✅ Conectado — Sincronizando...';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
});
