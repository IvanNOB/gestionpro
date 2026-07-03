// ==========================================
// MESERO - Tomar Pedidos por Mesa (Tablet/Celular)
// ==========================================

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
            currentUser = user;
            await loadData();
            document.getElementById('loading-screen').style.display = 'none';
            renderMesas();
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
    
    // Cargar pedidos activos
    ordersSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.status === 'active') {
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
}

function renderCategories() {
    const cats = [...new Set(products.map(p => p.category))].sort();
    const bar = document.getElementById('categories-bar');
    bar.innerHTML = `<button class="cat-btn active" onclick="filterCategory('')">Todos</button>` +
        cats.map(c => `<button class="cat-btn" onclick="filterCategory('${c}')">${esc(c)}</button>`).join('');
}

function filterCategory(cat) {
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    renderProducts(cat);
}

function renderProducts(category = '') {
    let filtered = products.filter(p => p.quantity > 0);
    if (category) filtered = filtered.filter(p => p.category === category);
    
    const grid = document.getElementById('products-grid');
    grid.innerHTML = filtered.map(p => `
        <div class="product-btn" onclick="addToOrder('${p.id}')">
            <div class="prod-name">${esc(p.name)}</div>
            <div class="prod-price">${formatCurrency(p.price)}</div>
            <div class="prod-stock">Stock: ${p.quantity}</div>
        </div>
    `).join('');
}

// ==========================================
// GESTIÓN DEL PEDIDO
// ==========================================
function addToOrder(productId) {
    if (!orders[currentMesaId]) orders[currentMesaId] = [];
    
    const existing = orders[currentMesaId].find(i => i.productId === productId);
    if (existing) {
        existing.qty++;
    } else {
        const product = products.find(p => p.id === productId);
        if (!product) return;
        orders[currentMesaId].push({
            productId: product.id,
            name: product.name,
            price: product.price,
            cost: product.cost,
            qty: 1
        });
    }
    renderOrderItems();
    showToast(`+ ${products.find(p => p.id === productId)?.name}`, 'info');
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
            <span class="order-item-name">${esc(i.name)}</span>
            <div class="order-item-qty">
                <button class="qty-btn minus" onclick="changeQty('${i.productId}', -1)">−</button>
                <span class="qty-num">${i.qty}</span>
                <button class="qty-btn plus" onclick="changeQty('${i.productId}', 1)">+</button>
            </div>
            <span class="order-item-price">${formatCurrency(subtotal)}</span>
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
    
    // Imprimir ticket de cocina
    if (confirm('Pedido enviado. ¿Imprimir ticket para cocina?')) {
        printKitchenTicket(mesa?.name || 'Mesa', items);
    }
    
    showToast('✅ Pedido enviado', 'success');
    showMesas();
}

async function payOrder() {
    const items = orders[currentMesaId];
    if (!items || items.length === 0) { showToast('No hay pedido para cobrar', 'error'); return; }
    
    const total = items.reduce((s, i) => s + (i.price * i.qty), 0);
    const mesa = mesas.find(m => m.id === currentMesaId);
    
    if (!confirm(`¿Cobrar ${formatCurrency(total)} de ${mesa?.name}?`)) return;
    
    // Preguntar método de pago
    const method = prompt('Método de pago:\n1 = Efectivo\n2 = Tarjeta\n3 = Transferencia', '1');
    const methods = { '1': 'Efectivo', '2': 'Tarjeta', '3': 'Transferencia' };
    const payMethod = methods[method] || 'Efectivo';
    
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
            date: new Date().toISOString()
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
    
    // Limpiar pedido
    delete orders[currentMesaId];
    await userCollection('orders').doc('order_' + currentMesaId).delete();
    
    showToast(`💰 Cobrado ${formatCurrency(total)}`, 'success');
    showMesas();
    renderProducts();
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
    if (confirm('¿Borrar este pedido?')) {
        delete orders[currentMesaId];
        userCollection('orders').doc('order_' + currentMesaId).delete();
        renderOrderItems();
        showToast('Pedido eliminado', 'info');
    }
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
