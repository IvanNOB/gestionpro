// ==========================================
// MESERO - Tomar Pedidos por Mesa (Tablet/Celular)
// ==========================================

// Error handler para mesero
window.onerror = function(message, source, lineno, colno, error) {
    // Ignorar errores que NO vienen del código propio de la app
    // (extensiones del navegador, scripts externos, iframes, etc.)
    if (source && (
        source.includes('extension') ||
        source.includes('chrome-extension') ||
        source.includes('moz-extension') ||
        source.includes('safari-extension') ||
        source.includes('gstatic.com') ||
        source.includes('googleapis.com') ||
        source === '' ||
        source === 'undefined'
    )) {
        return false; // dejar que el navegador lo maneje normalmente
    }

    // Ignorar mensajes de error genéricos de scripts externos
    if (message === 'Script error.' || message === 'Script error') {
        return false;
    }

    console.error('Error en app:', { message, source, lineno, error });
    // Solo mostrar toast si el error es de un archivo del proyecto
    const isOwnCode = source && (
        source.includes('mesero.js') ||
        source.includes('tickets.js') ||
        source.includes('firebase-config.js') ||
        source.includes('app.js')
    );
    if (isOwnCode) {
        showToast('Error inesperado. Intenta de nuevo.', 'error');
    }
    return true;
};

window.addEventListener('unhandledrejection', function(event) {
    const reason = event.reason;
    console.error('Error async:', reason);

    // Errores de Firebase que indican sin conexión — no son errores reales
    const offlineCodes = ['unavailable', 'failed-precondition', 'cancelled'];
    if (reason?.code && offlineCodes.includes(reason.code)) {
        // Solo mostrar aviso de offline, no "error inesperado"
        return;
    }

    // Errores de permisos de Firebase (ej. reglas de seguridad)
    if (reason?.code === 'permission-denied') {
        showToast('Sin permiso. Verifica tu sesión.', 'error');
        event.preventDefault();
        return;
    }

    // Errores de red transitorios
    if (reason?.message && (
        reason.message.includes('network') ||
        reason.message.includes('fetch') ||
        reason.message.includes('NetworkError')
    )) {
        showToast('Sin conexión. Se guardará al reconectar.', 'warning');
        event.preventDefault();
        return;
    }

    // Para el resto, solo loguear — no mostrar toast genérico al usuario
    // (evita asustar al mesero con errores que no requieren acción)
    event.preventDefault();
});

let currentUser = null;
let products = [];
let mesas = [];
let orders = {};
let currentMesaId = null;
let insumos = [];
let recipes = [];
let employees = [];
let settings = { businessName: 'Mi Negocio', customization: {} };
let lastActionLog = 'Sesión iniciada';

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
            listenKitchenBadge();
        } else {
            window.location.href = 'login.html';
        }
    });
});

// ==========================================
// BADGE EN VIVO DEL BOTÓN COCINA (pedidos activos/en preparación)
// ==========================================
function listenKitchenBadge() {
    const hoy = new Date().toISOString().split('T')[0];
    userCollection('orders').onSnapshot((snapshot) => {
        const pendingCount = snapshot.docs.filter(doc => {
            const d = doc.data();
            const isToday = !d.createdAt || d.createdAt.substring(0, 10) === hoy;
            return isToday && (d.status === 'active' || d.status === 'preparing');
        }).length;
        const badge = document.getElementById('cocina-badge');
        if (badge) {
            if (pendingCount > 0) { badge.textContent = pendingCount; badge.style.display = 'flex'; }
            else { badge.style.display = 'none'; }
        }
    }, () => { /* silencioso si falla (ej. sin conexión) */ });
}

function userDoc() { return db.collection('users').doc(currentUser.uid); }
function userCollection(name) { return userDoc().collection(name); }

async function loadData() {
    const [productsSnap, mesasSnap, ordersSnap, insumosSnap, recipesSnap, employeesSnap, userDocSnap] = await Promise.all([
        userCollection('products').get(),
        userCollection('mesas').get(),
        userCollection('orders').get(),
        userCollection('insumos').get(),
        userCollection('recipes').get(),
        userCollection('employees').get(),
        userDoc().get()
    ]);
    products = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    mesas = mesasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    insumos = insumosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    recipes = recipesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    employees = employeesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    if (userDocSnap.exists && userDocSnap.data().settings) {
        settings = { ...settings, ...userDocSnap.data().settings };
    }
    
    // Cargar pedidos activos del DIA ACTUAL, agrupados por mesa en TANDAS
    // (cada tanda = una ronda enviada a cocina; varias tandas pueden pertenecer a la misma mesa)
    const hoy = new Date().toISOString().split('T')[0];
    orders = {};
    ordersSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.status && data.status !== 'completed') {
            // Solo cargar pedidos de hoy
            if (data.createdAt && data.createdAt.substring(0, 10) !== hoy) {
                // Pedido de otro dia — eliminarlo automaticamente
                userCollection('orders').doc(doc.id).delete().catch(() => {});
                return;
            }
            if (!orders[data.mesaId]) orders[data.mesaId] = { pending: [], tandas: [] };
            orders[data.mesaId].tandas.push({
                docId: doc.id,
                tandaNumber: data.tandaNumber || 1,
                items: data.items || [],
                status: data.status || 'active',
                createdAt: data.createdAt,
                unlocked: false
            });
        }
    });
    Object.values(orders).forEach(o => o.tandas.sort((a, b) => a.tandaNumber - b.tandaNumber));

    // Si no hay mesas, crear unas por defecto
    if (mesas.length === 0) {
        const defaultShapes = ['round', 'round', 'square', 'rect', 'round', 'rect'];
        const defaultCapacities = [4, 6, 4, 8, 4, 6];
        for (let i = 1; i <= 6; i++) {
            const mesa = { id: 'mesa_' + i, name: 'Mesa ' + i, capacity: defaultCapacities[i-1], shape: defaultShapes[i-1], status: 'libre' };
            mesas.push(mesa);
            await userCollection('mesas').doc(mesa.id).set(mesa);
        }
    }
}

// ==========================================
// HELPERS DE TANDAS
// ==========================================
function ensureMesaOrder(mesaId) {
    if (!orders[mesaId]) orders[mesaId] = { pending: [], tandas: [] };
    return orders[mesaId];
}

// Todos los items de la mesa (tandas enviadas + pendiente), para totales/badges
function getMesaAllItems(mesaId) {
    const o = orders[mesaId];
    if (!o) return [];
    const all = [...o.pending];
    o.tandas.forEach(t => { if (t.status !== 'completed') all.push(...t.items); });
    return all;
}

function getMesaTotal(mesaId) {
    return getMesaAllItems(mesaId).reduce((s, i) => s + (i.price * i.qty), 0);
}

function getMesaItemCount(mesaId) {
    return getMesaAllItems(mesaId).reduce((s, i) => s + i.qty, 0);
}

function getMesaTandaCount(mesaId) {
    const o = orders[mesaId];
    if (!o) return 0;
    return o.tandas.length + (o.pending.length > 0 ? 1 : 0);
}

const TANDA_STATUS_LABELS = {
    active: { label: 'Enviada a cocina', color: 'var(--accent-green)' },
    preparing: { label: 'En preparación', color: 'var(--accent-amber)' },
    ready: { label: 'Lista', color: '#3b82f6' },
    delivered: { label: 'Entregada', color: 'var(--accent-purple)' }
};


// ==========================================
// VISTA DE MESAS - FLOOR PLAN
// ==========================================

/**
 * Genera el SVG de una mesa según su capacidad y forma
 * Tipos: 'round' (redonda), 'square' (cuadrada), 'rect' (rectangular)
 */
function getTableShape(capacity, shapeOverride) {
    if (shapeOverride && shapeOverride !== 'auto') return shapeOverride;
    if (capacity <= 6) return 'round';
    return 'rect';
}

function generateTableSVG(capacity, isOccupied, shapeOverride) {
    const shape = getTableShape(capacity, shapeOverride);
    const chairColor = isOccupied ? '#f59e0b' : '#94a3b8';
    const tableColor = isOccupied ? '#fbbf24' : '#e2e8f0';
    const tableBorder = isOccupied ? '#d97706' : '#94a3b8';
    
    let svg = '';
    
    if (shape === 'round') {
        const size = capacity <= 4 ? 100 : (capacity <= 6 ? 120 : 140);
        const tableR = capacity <= 4 ? 20 : (capacity <= 6 ? 24 : 28);
        const cx = size / 2;
        const cy = size / 2;
        const chairR = 7;
        const chairDist = tableR + 14;
        
        svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">`;
        
        // Sillas distribuidas en círculo
        for (let i = 0; i < capacity; i++) {
            const angle = (2 * Math.PI * i) / capacity - Math.PI / 2;
            const chairX = cx + Math.cos(angle) * chairDist;
            const chairY = cy + Math.sin(angle) * chairDist;
            svg += `<rect x="${chairX - chairR}" y="${chairY - chairR}" width="${chairR * 2}" height="${chairR * 2}" rx="3" fill="${chairColor}" opacity="0.7" stroke="${tableBorder}" stroke-width="1.5"/>`;
        }
        
        // Mesa redonda
        svg += `<circle cx="${cx}" cy="${cy}" r="${tableR}" fill="${tableColor}" stroke="${tableBorder}" stroke-width="2"/>`;
        svg += `</svg>`;
        
    } else if (shape === 'square') {
        // Mesa cuadrada con sillas en los 4 lados
        const size = capacity <= 4 ? 100 : 120;
        const tableSize = capacity <= 4 ? 32 : 38;
        const cx = size / 2;
        const cy = size / 2;
        const chairSize = 13;
        const dist = tableSize / 2 + chairSize / 2 + 5;
        
        svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">`;
        
        // Distribuir sillas en 4 lados
        const sides = [
            { dx: 0, dy: -dist },   // arriba
            { dx: dist, dy: 0 },    // derecha
            { dx: 0, dy: dist },    // abajo
            { dx: -dist, dy: 0 }    // izquierda
        ];
        
        const chairsPerSide = Math.ceil(capacity / 4);
        let chairCount = 0;
        for (let side = 0; side < 4 && chairCount < capacity; side++) {
            const numOnThisSide = Math.min(chairsPerSide, capacity - chairCount);
            for (let i = 0; i < numOnThisSide && chairCount < capacity; i++) {
                let offsetX = 0, offsetY = 0;
                if (numOnThisSide > 1) {
                    if (sides[side].dx === 0) { // top or bottom
                        offsetX = (i - (numOnThisSide - 1) / 2) * (chairSize + 3);
                    } else { // left or right
                        offsetY = (i - (numOnThisSide - 1) / 2) * (chairSize + 3);
                    }
                }
                const chairX = cx + sides[side].dx + offsetX - chairSize / 2;
                const chairY = cy + sides[side].dy + offsetY - chairSize / 2;
                svg += `<rect x="${chairX}" y="${chairY}" width="${chairSize}" height="${chairSize}" rx="3" fill="${chairColor}" opacity="0.7" stroke="${tableBorder}" stroke-width="1.5"/>`;
                chairCount++;
            }
        }
        
        // Mesa cuadrada
        svg += `<rect x="${cx - tableSize/2}" y="${cy - tableSize/2}" width="${tableSize}" height="${tableSize}" rx="4" fill="${tableColor}" stroke="${tableBorder}" stroke-width="2"/>`;
        svg += `</svg>`;
        
    } else {
        // Mesa rectangular
        const numChairsPerSide = Math.ceil(capacity / 2);
        const tableW = Math.max(50, numChairsPerSide * 24);
        const tableH = 28;
        const padding = 30;
        const svgW = tableW + padding * 2;
        const svgH = tableH + padding * 2 + 10;
        const tx = padding;
        const ty = (svgH - tableH) / 2;
        const chairSize = 12;
        
        svg = `<svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" fill="none" xmlns="http://www.w3.org/2000/svg">`;
        
        // Sillas arriba
        const topChairs = Math.ceil(capacity / 2);
        const topSpacing = tableW / (topChairs + 1);
        for (let i = 0; i < topChairs; i++) {
            const chairX = tx + topSpacing * (i + 1) - chairSize / 2;
            const chairY = ty - chairSize - 5;
            svg += `<rect x="${chairX}" y="${chairY}" width="${chairSize}" height="${chairSize}" rx="3" fill="${chairColor}" opacity="0.7" stroke="${tableBorder}" stroke-width="1.5"/>`;
        }
        
        // Sillas abajo
        const botChairs = Math.floor(capacity / 2);
        const botSpacing = tableW / (botChairs + 1);
        for (let i = 0; i < botChairs; i++) {
            const chairX = tx + botSpacing * (i + 1) - chairSize / 2;
            const chairY = ty + tableH + 5;
            svg += `<rect x="${chairX}" y="${chairY}" width="${chairSize}" height="${chairSize}" rx="3" fill="${chairColor}" opacity="0.7" stroke="${tableBorder}" stroke-width="1.5"/>`;
        }
        
        // Mesa rectangular
        svg += `<rect x="${tx}" y="${ty}" width="${tableW}" height="${tableH}" rx="6" fill="${tableColor}" stroke="${tableBorder}" stroke-width="2"/>`;
        svg += `</svg>`;
    }
    
    return svg;
}

function renderMesas() {
    const mesasGrid = document.getElementById('mesas-grid');
    const llevarGrid = document.getElementById('llevar-grid');
    const activeRole = sessionStorage.getItem('activeRole');
    
    // --- PARA LLEVAR (separado) ---
    if (llevarGrid && (activeRole === 'caja' || activeRole === 'owner')) {
        const llevarKeys = Object.keys(orders).filter(k => k.startsWith('llevar_'));
        let llevarHTML = '';
        llevarKeys.forEach(key => {
            const items = getMesaAllItems(key);
            if (!items || items.length === 0) return;
            const total = items.reduce((s, i) => s + (i.price * i.qty), 0);
            const count = items.reduce((s, i) => s + i.qty, 0);
            const clientName = key.replace('llevar_', '').replace(/_/g, ' ');
            llevarHTML += `<div class="mesa-fp-card ocupada" onclick="openMesa('${key}')">
                <div class="mesa-fp-badge">${count}</div>
                <div class="mesa-fp-icon">🛍️</div>
                <div class="mesa-fp-name">${esc(clientName)}</div>
                <div class="mesa-fp-status ocupada">Para Llevar</div>
                <div class="mesa-fp-total">${formatCurrency(total)}</div>
            </div>`;
        });
        llevarHTML += `<div class="mesa-fp-card add-new" onclick="newLlevarOrder()">
            <div class="mesa-fp-icon">➕</div>
            <div class="mesa-fp-name">Nuevo</div>
            <div class="mesa-fp-status">Para Llevar</div>
        </div>`;
        llevarGrid.innerHTML = llevarHTML;
        llevarGrid.parentElement.querySelector('.section-title').style.display = 'block';
    } else if (llevarGrid) {
        llevarGrid.innerHTML = '';
        llevarGrid.parentElement.querySelector('.section-title').style.display = 'none';
    }
    
    // --- MESAS (Floor Plan Visual) ---
    // Check if any mesa has position data — if so, use floor plan mode
    const hasPositions = mesas.some(m => m.posX != null && m.posY != null);
    
    if (hasPositions) {
        // Floor plan mode - absolute positioning
        mesasGrid.classList.add('floor-plan-mode');
        // Calculate max height needed
        const maxY = Math.max(...mesas.map(m => (m.posY || 0) + 130), 400);
        mesasGrid.style.minHeight = maxY + 'px';
        
        mesasGrid.innerHTML = mesas.map(m => {
            const mesaItems = getMesaAllItems(m.id);
            const hasOrder = mesaItems.length > 0;
            const total = hasOrder ? getMesaTotal(m.id) : 0;
            const itemCount = hasOrder ? getMesaItemCount(m.id) : 0;
            const tandaCount = hasOrder ? getMesaTandaCount(m.id) : 0;
            const statusClass = hasOrder ? 'ocupada' : 'libre';
            const capacity = m.capacity || 4;
            const tableSVG = generateTableSVG(capacity, hasOrder, m.shape);
            const posX = m.posX != null ? m.posX : 0;
            const posY = m.posY != null ? m.posY : 0;
            
            return `<div class="mesa-fp-card ${statusClass}" onclick="openMesa('${m.id}')" style="position:absolute;left:${posX}px;top:${posY}px;width:auto;min-width:100px;">
                ${hasOrder ? `<div class="mesa-fp-badge">${itemCount}</div>` : ''}
                <div class="mesa-fp-visual">${tableSVG}</div>
                <div class="mesa-fp-name">${esc(m.name)}</div>
                <div class="mesa-fp-status ${statusClass}">${hasOrder ? 'Ocupada' : 'Libre'}</div>
                ${hasOrder ? `<div class="mesa-fp-total">${formatCurrency(total)}</div>` : `<div class="mesa-fp-capacity">${capacity} personas</div>`}
            </div>`;
        }).join('');
    } else {
        // Grid mode fallback (no positions saved)
        mesasGrid.classList.remove('floor-plan-mode');
        mesasGrid.style.minHeight = '';
        
        mesasGrid.innerHTML = mesas.map(m => {
            const mesaItems = getMesaAllItems(m.id);
            const hasOrder = mesaItems.length > 0;
            const total = hasOrder ? getMesaTotal(m.id) : 0;
            const itemCount = hasOrder ? getMesaItemCount(m.id) : 0;
            const tandaCount = hasOrder ? getMesaTandaCount(m.id) : 0;
            const statusClass = hasOrder ? 'ocupada' : 'libre';
            const capacity = m.capacity || 4;
            const tableSVG = generateTableSVG(capacity, hasOrder, m.shape);
            
            return `<div class="mesa-fp-card ${statusClass}" onclick="openMesa('${m.id}')">
                ${hasOrder ? `<div class="mesa-fp-badge">${itemCount}</div>` : ''}
                <div class="mesa-fp-visual">${tableSVG}</div>
                <div class="mesa-fp-name">${esc(m.name)}</div>
                <div class="mesa-fp-status ${statusClass}">${hasOrder ? 'Ocupada' : 'Libre'}</div>
                ${hasOrder ? `<div class="mesa-fp-total">${formatCurrency(total)}</div>` : `<div class="mesa-fp-capacity">${capacity} personas</div>`}
            </div>`;
        }).join('');
    }
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
    let mesaName = mesa ? mesa.name : 'Mesa';
    if (mesaId === 'delivery_1') mesaName = '🏍️ Delivery';
    if (mesaId.startsWith('llevar_')) mesaName = '🛍️ ' + mesaId.replace('llevar_', '').replace(/_/g, ' ');
    document.getElementById('order-mesa-name').textContent = mesaName;
    setText('tandas-mesa-title', '🪑 ' + mesaName);
    ensureMesaOrder(mesaId);
    
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
        const imgHtml = hasImage 
            ? `<img src="${esc(p.image)}" style="width:100%;height:70px;object-fit:cover;border-radius:8px;margin-bottom:8px;" loading="lazy" onerror="this.style.display='none'">`
            : '';
        const stockClass = p.quantity <= 5 ? (p.quantity <= 0 ? 'out' : 'low') : '';
        const stockBadge = `<span style="font-size:0.6rem;font-weight:600;padding:2px 6px;border-radius:4px;${stockClass === 'out' ? 'background:rgba(239,68,68,0.15);color:#ef4444;' : stockClass === 'low' ? 'background:rgba(245,158,11,0.15);color:#f59e0b;' : 'background:rgba(255,255,255,0.06);color:var(--text-muted,#64748b);'}">${p.quantity} disp.</span>`;
        return `<div class="product-btn ${hasImage ? 'with-image' : ''}" onclick="addToOrder('${p.id}')">
            ${imgHtml}
            <div class="prod-name">${esc(p.name)}</div>
            <div style="font-size:0.65rem;color:var(--text-muted,#64748b);margin-bottom:6px;">${esc(p.category)}</div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:4px;">
                <span class="prod-price">${formatCurrency(p.price)}</span>
                ${stockBadge}
            </div>
        </div>`;
    }).join('');
}

// ==========================================
// GESTIÓN DEL PEDIDO
// ==========================================
// ==========================================
// GESTIÓN DEL PEDIDO (tanda pendiente = borrador local, aún no enviado)
// ==========================================
function addToOrder(productId) {
    const o = ensureMesaOrder(currentMesaId);
    const product = products.find(p => p.id === productId);
    if (!product) return;

    // Validar stock disponible contra TODO lo que ya está en la mesa (pendiente + tandas enviadas)
    const qtyInMesa = getMesaAllItems(currentMesaId).filter(i => i.productId === productId).reduce((s, i) => s + i.qty, 0);
    if (qtyInMesa >= product.quantity) {
        showToast(`Sin stock de ${product.name}`, 'error');
        return;
    }

    const currentInPending = o.pending.find(i => i.productId === productId);
    if (currentInPending) {
        currentInPending.qty++;
    } else {
        o.pending.push({ productId: product.id, name: product.name, price: product.price, cost: product.cost, qty: 1 });
    }
    renderOrderItems();
    showToast(`+ ${product.name}`, 'info');
}

function changeQty(productId, delta) {
    const o = ensureMesaOrder(currentMesaId);
    const item = o.pending.find(i => i.productId === productId);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
        o.pending = o.pending.filter(i => i.productId !== productId);
    }
    renderOrderItems();
}

function addItemNote(productId) {
    const o = ensureMesaOrder(currentMesaId);
    const item = o.pending.find(i => i.productId === productId);
    if (!item) return;
    const note = prompt(`Nota para "${item.name}":`, item.notes || '');
    if (note !== null) {
        item.notes = note.trim();
        renderOrderItems();
    }
}

// ==========================================
// RENDER PRINCIPAL: columna de Tandas + panel de tanda pendiente
// (misma función alimenta tanto la vista móvil como la de escritorio)
// ==========================================
function renderOrderItems() {
    const o = ensureMesaOrder(currentMesaId);
    const pending = o.pending;
    const tandas = o.tandas;
    const allItems = getMesaAllItems(currentMesaId);
    const grandTotal = allItems.reduce((s, i) => s + (i.price * i.qty), 0);
    const totalItems = allItems.reduce((s, i) => s + i.qty, 0);
    const pendingNumber = tandas.length + 1;

    setText('order-count', totalItems);
    setText('order-total-value', formatCurrency(grandTotal));
    setText('tandas-total-mesa', formatCurrency(grandTotal));

    // Resumen de mesa (columna central, escritorio)
    const tandaCount = tandas.length + (pending.length > 0 ? 1 : 0);
    const summaryEl = document.getElementById('mesa-tandas-summary');
    if (summaryEl) {
        summaryEl.innerHTML = `<span>🧾 ${tandaCount} tanda${tandaCount === 1 ? '' : 's'}</span><span>📦 ${totalItems} producto${totalItems === 1 ? '' : 's'}</span><span class="mesa-total-inline">Total mesa <b>${formatCurrency(grandTotal)}</b></span>`;
    }

    // Lista de tandas (columna central, escritorio): enviadas (bloqueadas) + la pendiente al final
    const tandasListEl = document.getElementById('tandas-list');
    if (tandasListEl) {
        let html = '';
        tandas.forEach(t => {
            const st = TANDA_STATUS_LABELS[t.status] || TANDA_STATUS_LABELS.active;
            const subtotal = t.items.reduce((s, i) => s + (i.price * i.qty), 0);
            const time = t.createdAt ? new Date(t.createdAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '';
            html += `<div class="tanda-card ${t.status === 'active' || t.status === 'preparing' ? 'sent' : 'sent'}">
                <div class="tanda-card-header">
                    <span class="tanda-title">TANDA #${String(t.tandaNumber).padStart(3, '0')} ${t.unlocked ? '🔓' : '🔒'}</span>
                    <span class="tanda-status-chip" style="background:${st.color}22;color:${st.color};">${st.label}</span>
                    <span class="tanda-time">${time}</span>
                </div>
                <div class="tanda-items">
                    ${t.items.map(i => t.unlocked ? `
                        <div class="tanda-item-row editable">
                            <span>${esc(i.name)}</span>
                            <div class="order-item-qty">
                                <button class="qty-btn minus" onclick="changeTandaQty('${t.docId}','${i.productId}',-1)">−</button>
                                <span class="qty-num">${i.qty}</span>
                                <button class="qty-btn plus" onclick="changeTandaQty('${t.docId}','${i.productId}',1)">+</button>
                            </div>
                            <span>${formatCurrency(i.price * i.qty)}</span>
                        </div>` : `
                        <div class="tanda-item-row"><span>${i.qty} × ${esc(i.name)}</span><span>${formatCurrency(i.price * i.qty)}</span></div>`
                    ).join('')}
                </div>
                <div class="tanda-subtotal"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
                ${t.unlocked ? `<button class="btn-save-tanda" onclick="saveTandaChanges('${t.docId}')">💾 Guardar cambios en esta tanda</button>` : ''}
            </div>`;
        });
        if (pending.length > 0) {
            const subtotalP = pending.reduce((s, i) => s + (i.price * i.qty), 0);
            html += `<div class="tanda-card pending">
                <div class="tanda-card-header">
                    <span class="tanda-title">TANDA #${String(pendingNumber).padStart(3, '0')} ⏳</span>
                    <span class="tanda-status-chip pending-chip">Pendiente</span>
                </div>
                <div class="tanda-items">
                    ${pending.map(i => `<div class="tanda-item-row"><span>${i.qty} × ${esc(i.name)}</span><span>${formatCurrency(i.price * i.qty)}</span></div>`).join('')}
                </div>
                <div class="tanda-subtotal"><span>Subtotal</span><span>${formatCurrency(subtotalP)}</span></div>
            </div>`;
        }
        tandasListEl.innerHTML = html || '<p class="empty-order">Toca un producto para iniciar el pedido</p>';
    }

    // Banner para solicitar autorización (si hay tandas ya enviadas y ninguna desbloqueada)
    const authBanner = document.getElementById('auth-banner');
    if (authBanner) {
        const anyLocked = tandas.some(t => !t.unlocked);
        authBanner.style.display = (tandas.length > 0 && anyLocked) ? 'flex' : 'none';
    }

    // Encabezado del panel de tanda pendiente (columna derecha / panel móvil)
    setText('pending-tanda-header', pending.length > 0
        ? `TANDA #${String(pendingNumber).padStart(3, '0')}`
        : (tandas.length > 0 ? 'Agrega productos para la siguiente tanda' : 'Nuevo pedido'));
    setText('pending-tanda-sub', pending.length > 0 ? 'Pendiente de enviar' : '');

    const list = document.getElementById('order-items-list');
    if (!list) return;
    if (pending.length === 0) {
        list.innerHTML = '<p class="empty-order">Toca un producto para agregarlo</p>';
        return;
    }

    list.innerHTML = pending.map(i => {
        const subtotal = i.price * i.qty;
        return `<div class="order-item">
            <div class="order-item-top">
                <div style="min-width:0;">
                    <span class="order-item-name">${esc(i.name)}</span>
                    ${i.notes ? `<div style="font-size:0.7rem;color:var(--accent-amber,#f59e0b);margin-top:2px;">📝 ${esc(i.notes)}</div>` : ''}
                </div>
                <button class="order-item-note-btn" onclick="addItemNote('${i.productId}')" title="Agregar nota">📝</button>
            </div>
            <div class="order-item-bottom">
                <div class="order-item-qty">
                    <button class="qty-btn minus" onclick="changeQty('${i.productId}', -1)">−</button>
                    <span class="qty-num">${i.qty}</span>
                    <button class="qty-btn plus" onclick="changeQty('${i.productId}', 1)">+</button>
                </div>
                <span class="order-item-price">${formatCurrency(subtotal)}</span>
                <button class="btn-charge-item" onclick="payIndividualItem('${i.productId}')" title="Cobrar solo este producto">💰 Cobrar</button>
            </div>
        </div>`;
    }).join('');
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

// ==========================================
// ACCIONES DE PEDIDO
// ==========================================
async function sendOrder() {
    const o = ensureMesaOrder(currentMesaId);
    const items = o.pending;
    if (!items || items.length === 0) { showToast('No hay productos para enviar', 'error'); return; }

    const btnSend = document.querySelector('.btn-send');
    if (btnSend) { btnSend.disabled = true; btnSend.textContent = '⏳ Enviando...'; }

    const mesa = mesas.find(m => m.id === currentMesaId);
    let mesaName = mesa?.name || 'Mesa';
    if (currentMesaId === 'delivery_1') mesaName = '🏍️ Delivery';
    if (currentMesaId.startsWith('llevar_')) mesaName = '🛍️ ' + currentMesaId.replace('llevar_', '').replace(/_/g, ' ');

    const tandaNumber = o.tandas.length + 1;
    const docId = generateId();

    try {
        const orderDoc = {
            id: docId,
            mesaId: currentMesaId,
            mesaName: mesaName,
            tandaNumber: tandaNumber,
            items: items,
            total: items.reduce((s, i) => s + (i.price * i.qty), 0),
            status: 'active',
            type: currentMesaId.startsWith('delivery') ? 'delivery' : currentMesaId.startsWith('llevar') ? 'para_llevar' : 'mesa',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await userCollection('orders').doc(docId).set(orderDoc);

        o.tandas.push({ docId, tandaNumber, items, status: 'active', createdAt: orderDoc.createdAt, unlocked: false });
        o.pending = [];

        printKitchenTicket(mesaName + ' · Tanda #' + String(tandaNumber).padStart(3, '0'), items);
        logLastAction(`Tanda #${tandaNumber} enviada a cocina por ${sessionStorage.getItem('activeEmployee') || '—'}`);

        showToast(`✅ Tanda #${tandaNumber} enviada a cocina`, 'success');
        renderOrderItems();
        renderMesas();
    } catch (error) {
        console.error('Error enviando pedido:', error);
        if (error?.code === 'unavailable' || error?.code === 'failed-precondition') {
            showToast('📡 Sin conexión. La tanda se enviará al reconectar.', 'warning');
        } else if (error?.code === 'permission-denied') {
            showToast('❌ Sin permisos. Verifica tu sesión.', 'error');
        } else {
            showToast('⚠️ Error enviando la tanda. Intenta de nuevo.', 'warning');
        }
    } finally {
        if (btnSend) { btnSend.disabled = false; btnSend.innerHTML = '🍳 Enviar nueva tanda a cocina'; }
    }
}

async function payOrder() {
    const o = ensureMesaOrder(currentMesaId);
    const allItems = getMesaAllItems(currentMesaId);
    if (allItems.length === 0) { showToast('No hay pedido para cobrar', 'error'); return; }

    const total = allItems.reduce((s, i) => s + (i.price * i.qty), 0);
    const mesa = mesas.find(m => m.id === currentMesaId);
    const payMethod = selectedPayMethod || 'Efectivo';

    const btnPay = document.getElementById('btn-cobrar');
    if (btnPay) { btnPay.disabled = true; btnPay.textContent = '⏳ Cobrando...'; }

    showToast('💳 Procesando cobro...', 'info');

    try {
        // Registrar cada item (de todas las tandas + lo pendiente) como venta
        for (const item of allItems) {
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

            const product = products.find(p => p.id === item.productId);
            if (product) {
                product.quantity = Math.max(0, product.quantity - item.qty);
                await userCollection('products').doc(product.id).set(product);
            }
            deductInsumos(item.productId, item.qty);
        }

        printTableBillTicket(mesa?.name || 'Mesa', allItems, total, payMethod);

        // Marcar todas las tandas enviadas como completadas (quedan en el historial, no se borran)
        for (const t of o.tandas) {
            await userCollection('orders').doc(t.docId).set({ status: 'completed', updatedAt: new Date().toISOString() }, { merge: true });
        }
        delete orders[currentMesaId];

        showToast(`💰 Cobrado ${formatCurrency(total)}`, 'success');
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        logLastAction(`Mesa cobrada: ${formatCurrency(total)} (${payMethod})`);
        showMesas();
        renderProducts();
    } catch (error) {
        console.error('Error al cobrar:', error);
        if (error?.code === 'unavailable' || error?.code === 'failed-precondition') {
            showToast('📡 Sin conexión. Verifica la red e intenta de nuevo.', 'warning');
        } else if (error?.code === 'permission-denied') {
            showToast('❌ Sin permisos para cobrar. Verifica tu sesión.', 'error');
        } else {
            showToast('⚠️ Error al cobrar. Intenta de nuevo.', 'error');
        }
    } finally {
        if (btnPay) { btnPay.disabled = false; btnPay.innerHTML = '💰 Cobrar'; }
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

// ==========================================
// VISOR DE RECETAS (solo lectura, desde la pantalla de Pedidos)
// ==========================================
function openRecipeViewer() {
    const existing = document.getElementById('recipe-viewer-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'recipe-viewer-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px);';
    overlay.innerHTML = `
        <div style="background:var(--bg-card);border:1px solid var(--border-glass-strong);border-radius:var(--radius-lg);padding:20px;max-width:440px;width:100%;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <h3 style="margin:0;font-size:1.02rem;color:var(--text-primary);">📝 Recetas</h3>
                <button onclick="closeRecipeViewer()" style="border:none;background:var(--bg-glass);color:var(--text-secondary);width:30px;height:30px;border-radius:50%;font-size:1rem;cursor:pointer;">✕</button>
            </div>
            <input type="text" id="recipe-viewer-search" placeholder="🔍 Buscar producto..." style="width:100%;padding:10px 13px;border:1px solid var(--border-glass-strong);border-radius:var(--radius-sm);font-size:0.88rem;background:var(--bg-glass);color:var(--text-primary);outline:none;margin-bottom:12px;box-sizing:border-box;" oninput="renderRecipeViewerList(this.value)">
            <div id="recipe-viewer-list" style="overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:8px;"></div>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeRecipeViewer(); });
    renderRecipeViewerList('');
    setTimeout(() => document.getElementById('recipe-viewer-search')?.focus(), 50);
}

function closeRecipeViewer() {
    document.getElementById('recipe-viewer-overlay')?.remove();
}

function renderRecipeViewerList(query) {
    const container = document.getElementById('recipe-viewer-list');
    if (!container) return;
    const q = (query || '').trim().toLowerCase();

    const matches = recipes
        .filter(r => !q || r.productName.toLowerCase().includes(q))
        .sort((a, b) => a.productName.localeCompare(b.productName));

    if (matches.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:20px 0;font-size:0.85rem;">${recipes.length === 0 ? 'Aún no hay recetas registradas.' : 'No se encontró ninguna receta con ese nombre.'}</p>`;
        return;
    }

    container.innerHTML = matches.map(r => {
        const ingredientsHtml = r.ingredients.length
            ? r.ingredients.map(i => `<li>${i.quantity} ${esc(i.unit)} — ${esc(i.insumoName)}</li>`).join('')
            : '<li style="color:var(--text-muted);">Sin ingredientes definidos</li>';
        return `
            <details style="border:1px solid var(--border-glass-strong);border-radius:var(--radius-sm);padding:10px 14px;background:var(--bg-glass);">
                <summary style="cursor:pointer;font-weight:600;color:var(--text-primary);font-size:0.9rem;">${esc(r.productName)}</summary>
                <ul style="margin:10px 0 0;padding-left:18px;color:var(--text-secondary);font-size:0.84rem;line-height:1.6;">${ingredientsHtml}</ul>
            </details>`;
    }).join('');
}

function clearCurrentOrder() {
    const o = orders[currentMesaId];
    if (!o || o.pending.length === 0) { showToast('No hay productos pendientes para quitar', 'info'); return; }
    o.pending = [];
    renderOrderItems();
    showToast('Productos pendientes eliminados', 'info');
}

// Dividir cuenta (por cantidad de personas)
function splitBill() {
    const allItems = getMesaAllItems(currentMesaId);
    if (allItems.length === 0) { showToast('No hay pedido para dividir', 'error'); return; }

    const total = allItems.reduce((s, i) => s + (i.price * i.qty), 0);
    const people = prompt('¿Entre cuántas personas dividir la cuenta?', '2');
    if (!people || parseInt(people) <= 0) return;

    const perPerson = total / parseInt(people);
    showToast(`💰 Cada persona paga: ${formatCurrency(perPerson)} (${people} personas)`, 'success');

    const list = document.getElementById('order-items-list');
    if (list) list.innerHTML += `<div style="margin-top:12px;padding:12px;background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.3);border-radius:10px;text-align:center;">
        <div style="font-size:0.85rem;color:#8b5cf6;font-weight:600;">➗ Cuenta dividida entre ${people} personas</div>
        <div style="font-size:1.3rem;font-weight:800;color:#8b5cf6;margin-top:4px;">${formatCurrency(perPerson)} c/u</div>
    </div>`;
}

// ==========================================
// COBRO INDIVIDUAL (pagar un item de la tanda pendiente)
// ==========================================
function payIndividualItem(productId) {
    const o = orders[currentMesaId];
    if (!o) return;
    const item = o.pending.find(i => i.productId === productId);
    if (!item) return;
    openChargeItemModal(item, productId);
}

function openChargeItemModal(item, productId) {
    const existing = document.getElementById('charge-item-overlay');
    if (existing) existing.remove();

    let qty = 1;
    const maxQty = item.qty;
    let method = selectedPayMethod || 'Efectivo';
    const methods = [
        { key: 'Efectivo', label: '💵 Efectivo' },
        { key: 'Tarjeta', label: '💳 Tarjeta' },
        { key: 'Transferencia', label: '🏦 Transf' }
    ];

    const overlay = document.createElement('div');
    overlay.id = 'charge-item-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px);';
    overlay.innerHTML = `
        <div style="background:var(--bg-card);border:1px solid var(--border-glass-strong);border-radius:var(--radius-lg);padding:22px;max-width:340px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <h3 style="margin:0;font-size:1rem;color:var(--text-primary);">💰 Cobrar producto</h3>
                <button id="charge-item-close" style="border:none;background:var(--bg-glass);color:var(--text-secondary);width:28px;height:28px;border-radius:50%;font-size:0.95rem;cursor:pointer;">✕</button>
            </div>
            <p style="color:var(--text-secondary);font-size:0.85rem;margin:6px 0 16px;">${esc(item.name)}</p>

            ${maxQty > 1 ? `
            <div style="margin-bottom:16px;">
                <label style="display:block;font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Cantidad a cobrar (de ${maxQty})</label>
                <div style="display:flex;align-items:center;gap:10px;">
                    <button id="charge-qty-minus" class="qty-btn minus" type="button">−</button>
                    <span id="charge-qty-display" style="font-weight:800;font-size:1.1rem;min-width:24px;text-align:center;color:var(--text-primary);">1</span>
                    <button id="charge-qty-plus" class="qty-btn plus" type="button">+</button>
                </div>
            </div>` : ''}

            <div style="margin-bottom:16px;">
                <label style="display:block;font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Método de pago</label>
                <div id="charge-methods" style="display:flex;gap:6px;">
                    ${methods.map(m => `<button type="button" class="pay-method-btn charge-method-btn${m.key === method ? ' active' : ''}" data-method="${m.key}">${m.label}</button>`).join('')}
                </div>
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;margin-bottom:16px;background:linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.06));border:1px solid rgba(16,185,129,0.25);border-radius:var(--radius-sm);">
                <span style="font-size:0.82rem;color:var(--text-secondary);">Total a cobrar</span>
                <span id="charge-total-display" style="font-family:'JetBrains Mono',monospace;font-size:1.15rem;font-weight:800;color:var(--accent-green);">${formatCurrency(item.price)}</span>
            </div>

            <div style="display:flex;gap:8px;">
                <button id="charge-item-cancel" type="button" style="flex:1;padding:12px;border-radius:var(--radius-sm);border:1px solid var(--border-glass-strong);background:var(--bg-glass);color:var(--text-secondary);font-weight:700;font-size:0.85rem;cursor:pointer;">Cancelar</button>
                <button id="charge-item-confirm" type="button" style="flex:1.4;padding:12px;border-radius:var(--radius-sm);border:none;background:var(--accent-green);color:white;font-weight:700;font-size:0.85rem;cursor:pointer;">✓ Confirmar Cobro</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const updateTotal = () => {
        document.getElementById('charge-total-display').textContent = formatCurrency(item.price * qty);
    };

    if (maxQty > 1) {
        document.getElementById('charge-qty-minus').addEventListener('click', () => {
            if (qty > 1) { qty--; document.getElementById('charge-qty-display').textContent = qty; updateTotal(); }
        });
        document.getElementById('charge-qty-plus').addEventListener('click', () => {
            if (qty < maxQty) { qty++; document.getElementById('charge-qty-display').textContent = qty; updateTotal(); }
        });
    }

    overlay.querySelectorAll('.charge-method-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            method = btn.dataset.method;
            overlay.querySelectorAll('.charge-method-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    const close = () => overlay.remove();
    document.getElementById('charge-item-close').addEventListener('click', close);
    document.getElementById('charge-item-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    document.getElementById('charge-item-confirm').addEventListener('click', () => {
        close();
        executeItemCharge(productId, qty, method);
    });
}

async function executeItemCharge(productId, qtyToPay, payMethod) {
    const o = orders[currentMesaId];
    if (!o) return;
    const item = o.pending.find(i => i.productId === productId);
    if (!item) return;

    const totalItem = item.price * qtyToPay;
    const mesa = mesas.find(m => m.id === currentMesaId);

    try {
        const sale = {
            id: generateId(),
            productId: item.productId,
            productName: item.name,
            quantity: qtyToPay,
            price: item.price,
            cost: item.cost || 0,
            discount: 0,
            discountAmount: 0,
            total: totalItem,
            profit: (item.price - (item.cost || 0)) * qtyToPay,
            client: mesa?.name || '',
            method: payMethod,
            notes: 'Cobro individual - ' + (mesa?.name || 'Mesa'),
            date: new Date().toISOString(),
            soldBy: sessionStorage.getItem('activeEmployee') || 'Dueño'
        };
        await userCollection('sales').doc(sale.id).set(sale);

        const product = products.find(p => p.id === item.productId);
        if (product) {
            product.quantity = Math.max(0, product.quantity - qtyToPay);
            await userCollection('products').doc(product.id).set(product);
        }
        deductInsumos(item.productId, qtyToPay);

        if (qtyToPay >= item.qty) {
            o.pending = o.pending.filter(i => i.productId !== productId);
        } else {
            item.qty -= qtyToPay;
        }

        showToast(`💰 Cobrado: ${item.name} x${qtyToPay} = ${formatCurrency(totalItem)} (${payMethod})`, 'success');
        if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
        logLastAction(`Cobro individual: ${item.name} x${qtyToPay}`);

        if (getMesaAllItems(currentMesaId).length === 0) {
            delete orders[currentMesaId];
            showMesas();
        } else {
            renderOrderItems();
        }
    } catch (error) {
        console.error('Error en cobro individual:', error);
        showToast('⚠️ Error al cobrar. Intenta de nuevo.', 'error');
    }
}

// ==========================================
// CAMBIAR DE MESA (Transferir SOLO la tanda pendiente, aún no enviada)
// ==========================================
function transferOrder() {
    const o = orders[currentMesaId];
    if (!o || o.pending.length === 0) { showToast('No hay productos pendientes para transferir', 'error'); return; }
    if (o.tandas.length > 0) { showToast('⚠️ Esta mesa ya tiene tandas enviadas a cocina — cóbrala o pide autorización antes de cambiarla de mesa.', 'warning'); return; }

    const items = o.pending;
    const availableMesas = mesas.filter(m => m.id !== currentMesaId);
    if (availableMesas.length === 0) { showToast('No hay otras mesas disponibles', 'error'); return; }

    const overlay = document.createElement('div');
    overlay.id = 'transfer-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';

    const mesasHTML = availableMesas.map(m => {
        const hasOrder = getMesaAllItems(m.id).length > 0;
        const statusLabel = hasOrder ? '⚠️ Ocupada' : '✅ Libre';
        const statusColor = hasOrder ? 'color:#f59e0b' : 'color:#10b981';
        return `<div class="transfer-mesa-option" onclick="confirmTransfer('${m.id}')" style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:var(--bg-card,#1a2332);border:1px solid var(--border-glass-strong,rgba(255,255,255,0.1));border-radius:12px;cursor:pointer;transition:all 0.2s;">
            <div style="font-size:1.5rem;">🪑</div>
            <div style="flex:1;">
                <div style="font-weight:700;color:var(--text-primary,#f1f5f9);font-size:0.95rem;">${esc(m.name)}</div>
                <div style="font-size:0.75rem;${statusColor};font-weight:600;">${statusLabel} • ${m.capacity || 4} personas</div>
            </div>
        </div>`;
    }).join('');

    const currentMesa = mesas.find(m => m.id === currentMesaId);
    overlay.innerHTML = `
        <div style="background:var(--bg-secondary,#131c31);border:1px solid var(--border-glass,rgba(255,255,255,0.06));border-radius:20px;padding:24px;max-width:420px;width:100%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
                <h3 style="color:var(--text-primary,#f1f5f9);font-size:1.15rem;font-weight:700;">🔄 Cambiar de Mesa</h3>
                <button onclick="document.getElementById('transfer-overlay').remove()" style="background:none;border:none;color:var(--text-secondary,#94a3b8);font-size:1.5rem;cursor:pointer;">✕</button>
            </div>
            <p style="color:var(--text-secondary,#94a3b8);font-size:0.85rem;margin-bottom:16px;">Mover pedido de <strong style="color:var(--text-primary,#f1f5f9);">${esc(currentMesa?.name || 'Mesa')}</strong> a:</p>
            <div style="display:flex;flex-direction:column;gap:8px;">
                ${mesasHTML}
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelectorAll('.transfer-mesa-option').forEach(opt => {
        opt.addEventListener('mouseenter', () => { opt.style.borderColor = 'var(--accent-blue,#635bff)'; opt.style.background = 'var(--bg-glass-hover,rgba(35,48,68,0.9))'; });
        opt.addEventListener('mouseleave', () => { opt.style.borderColor = 'var(--border-glass-strong,rgba(255,255,255,0.1))'; opt.style.background = 'var(--bg-card,#1a2332)'; });
    });
}

async function confirmTransfer(targetMesaId) {
    const o = orders[currentMesaId];
    const items = o?.pending;
    if (!items || items.length === 0) return;

    const targetMesa = mesas.find(m => m.id === targetMesaId);
    const targetOrder = ensureMesaOrder(targetMesaId);

    items.forEach(item => {
        const existing = targetOrder.pending.find(i => i.productId === item.productId);
        if (existing) existing.qty += item.qty;
        else targetOrder.pending.push({ ...item });
    });

    delete orders[currentMesaId];

    const overlay = document.getElementById('transfer-overlay');
    if (overlay) overlay.remove();

    showToast(`✅ Pedido movido a ${targetMesa?.name || 'otra mesa'}`, 'success');
    if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
    logLastAction(`Pedido transferido a ${targetMesa?.name || 'otra mesa'}`);
    showMesas();
}

// ==========================================
// AUTORIZACIÓN DEL DUEÑO (para editar tandas ya enviadas)
// ==========================================
function requestAuthorization() {
    const existing = document.getElementById('auth-pin-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'auth-pin-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px);';
    overlay.innerHTML = `
        <div style="background:var(--bg-card);border:1px solid var(--border-glass-strong);border-radius:var(--radius-lg);padding:24px;max-width:320px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.5);text-align:center;">
            <div style="font-size:2rem;margin-bottom:8px;">🔒</div>
            <h3 style="margin:0 0 6px;color:var(--text-primary);font-size:1rem;">Autorización del dueño</h3>
            <p style="color:var(--text-secondary);font-size:0.82rem;margin-bottom:16px;">Ingresa el PIN del dueño para modificar tandas ya enviadas.</p>
            <input type="password" id="auth-pin-input" inputmode="numeric" maxlength="6" placeholder="PIN" style="width:100%;padding:14px;text-align:center;font-size:1.3rem;letter-spacing:6px;border-radius:10px;border:1px solid var(--border-glass-strong);background:var(--bg-glass);color:var(--text-primary);outline:none;margin-bottom:14px;box-sizing:border-box;">
            <div id="auth-pin-error" style="color:var(--accent-red);font-size:0.78rem;margin-bottom:10px;display:none;">PIN incorrecto</div>
            <div style="display:flex;gap:8px;">
                <button onclick="document.getElementById('auth-pin-overlay').remove()" style="flex:1;padding:12px;border-radius:10px;border:1px solid var(--border-glass-strong);background:var(--bg-glass);color:var(--text-secondary);font-weight:700;cursor:pointer;">Cancelar</button>
                <button onclick="submitAuthPin()" style="flex:1.3;padding:12px;border-radius:10px;border:none;background:var(--accent-purple);color:white;font-weight:700;cursor:pointer;">Desbloquear</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    setTimeout(() => document.getElementById('auth-pin-input')?.focus(), 50);
    document.getElementById('auth-pin-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAuthPin(); });
}

async function hashPinMesero(pin) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin + '_gestionpro_salt');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function submitAuthPin() {
    const input = document.getElementById('auth-pin-input');
    const pin = input.value.trim();
    if (!pin) return;
    const hashed = await hashPinMesero(pin);
    const owner = employees.find(e => e.role === 'owner' && e.pin === hashed);
    if (!owner) {
        const err = document.getElementById('auth-pin-error');
        if (err) err.style.display = 'block';
        input.value = '';
        return;
    }
    document.getElementById('auth-pin-overlay').remove();
    const o = orders[currentMesaId];
    if (o) o.tandas.forEach(t => { t.unlocked = true; });
    showToast('🔓 Tandas desbloqueadas — ya puedes modificarlas', 'success');
    logLastAction('Autorización del dueño usada para modificar tandas enviadas');
    renderOrderItems();
}

function changeTandaQty(tandaDocId, productId, delta) {
    const o = orders[currentMesaId];
    if (!o) return;
    const t = o.tandas.find(t => t.docId === tandaDocId);
    if (!t || !t.unlocked) return;
    const item = t.items.find(i => i.productId === productId);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) t.items = t.items.filter(i => i.productId !== productId);
    renderOrderItems();
}

async function saveTandaChanges(tandaDocId) {
    const o = orders[currentMesaId];
    if (!o) return;
    const t = o.tandas.find(t => t.docId === tandaDocId);
    if (!t) return;
    try {
        if (t.items.length === 0) {
            await userCollection('orders').doc(t.docId).delete();
            o.tandas = o.tandas.filter(x => x.docId !== tandaDocId);
        } else {
            await userCollection('orders').doc(t.docId).set({
                items: t.items,
                total: t.items.reduce((s, i) => s + (i.price * i.qty), 0),
                updatedAt: new Date().toISOString()
            }, { merge: true });
            t.unlocked = false;
        }
        showToast('💾 Cambios guardados', 'success');
        logLastAction(`Tanda #${t.tandaNumber} modificada con autorización`);
        renderOrderItems();
        renderMesas();
    } catch (e) {
        console.error('Error guardando cambios de tanda:', e);
        showToast('⚠️ Error al guardar. Intenta de nuevo.', 'error');
    }
}

// ==========================================
// BITÁCORA DE ÚLTIMA ACCIÓN (barra inferior, escritorio)
// ==========================================
function logLastAction(text) {
    const time = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    lastActionLog = `${time} - ${text}`;
    setText('last-action-text', lastActionLog);
}


// ==========================================
// UTILIDADES
// ==========================================
// ==========================================
// ATAJOS DE TECLADO (solo dentro de una mesa abierta)
// ==========================================
document.addEventListener('keydown', (e) => {
    if (!document.getElementById('order-view')?.classList.contains('active')) return;
    // No interceptar si el foco está en un input/textarea (para no romper la escritura)
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key !== 'F2' && e.key !== 'F3' && e.key !== 'F4') return;
    }
    if (e.key === 'F2') { e.preventDefault(); document.getElementById('product-search')?.focus(); }
    else if (e.key === 'F3') { e.preventDefault(); sendOrder(); }
    else if (e.key === 'F4') { e.preventDefault(); payOrder(); }
});

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
    const items = getMesaAllItems(currentMesaId);
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

    // Caja y Dueño pueden ver la cocina y delivery
    if (role === 'caja' || role === 'owner') {
        const btnCocina = document.getElementById('btn-cocina-mesero');
        const btnDelivery = document.getElementById('btn-delivery-mesero');
        if (btnCocina) btnCocina.style.display = '';
        if (btnDelivery) btnDelivery.style.display = '';
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



// ==========================================
// DELIVERY DESDE CAJA
// ==========================================
function openDeliveryPanel() {
    const overlay = document.createElement('div');
    overlay.id = 'delivery-panel-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
        <div style="background:var(--bg-secondary,#1a1a2e);border-radius:16px;padding:24px;max-width:500px;width:100%;max-height:90vh;overflow-y:auto;border:1px solid var(--border-glass,#333);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <h3 style="color:var(--text-primary,white);font-size:1.2rem;">🏍️ Nuevo Pedido Delivery</h3>
                <button onclick="document.getElementById('delivery-panel-overlay').remove()" style="background:none;border:none;color:var(--text-secondary,#94a3b8);font-size:1.5rem;cursor:pointer;">✕</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:12px;">
                <input type="text" id="del-client" placeholder="Nombre del cliente" style="padding:12px;background:var(--bg-primary,#0f0f1a);border:1px solid var(--border-glass,#333);border-radius:10px;color:var(--text-primary,white);font-size:0.95rem;">
                <input type="tel" id="del-phone" placeholder="Teléfono" style="padding:12px;background:var(--bg-primary,#0f0f1a);border:1px solid var(--border-glass,#333);border-radius:10px;color:var(--text-primary,white);font-size:0.95rem;">
                <input type="text" id="del-address" placeholder="Dirección (vacío = para llevar)" style="padding:12px;background:var(--bg-primary,#0f0f1a);border:1px solid var(--border-glass,#333);border-radius:10px;color:var(--text-primary,white);font-size:0.95rem;">
                <input type="text" id="del-items" placeholder="Productos: Hamburguesa x2, Papas x1" style="padding:12px;background:var(--bg-primary,#0f0f1a);border:1px solid var(--border-glass,#333);border-radius:10px;color:var(--text-primary,white);font-size:0.95rem;">
                <input type="number" id="del-fee" placeholder="Costo envío ($) - 0 si es para llevar" value="0" style="padding:12px;background:var(--bg-primary,#0f0f1a);border:1px solid var(--border-glass,#333);border-radius:10px;color:var(--text-primary,white);font-size:0.95rem;">
                <button onclick="submitDeliveryFromCaja()" style="padding:14px;background:linear-gradient(135deg,#10b981,#059669);color:white;border:none;border-radius:10px;font-weight:700;font-size:1rem;cursor:pointer;">📦 Crear Pedido</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

async function submitDeliveryFromCaja() {
    const client = document.getElementById('del-client').value.trim();
    const phone = document.getElementById('del-phone').value.trim();
    const address = document.getElementById('del-address').value.trim();
    const itemsText = document.getElementById('del-items').value.trim();
    const deliveryFee = parseFloat(document.getElementById('del-fee').value) || 0;

    if (!client) { showToast('Ingresa el nombre del cliente', 'error'); return; }
    if (!itemsText) { showToast('Ingresa los productos', 'error'); return; }

    const type = address ? 'delivery' : 'para_llevar';
    const items = itemsText.split(',').map(text => {
        const match = text.trim().match(/(.+?)\s*x?\s*(\d+)?$/i);
        const name = match ? match[1].trim() : text.trim();
        const qty = match && match[2] ? parseInt(match[2]) : 1;
        const product = products.find(p => p.name.toLowerCase().includes(name.toLowerCase()));
        return { productId: product?.id || '', name: product?.name || name, price: product?.price || 0, cost: product?.cost || 0, qty };
    });

    const total = items.reduce((s, i) => s + (i.price * i.qty), 0);

    const order = {
        id: generateId(),
        client, phone, address, type, items,
        subtotal: total,
        deliveryFee,
        total: total + deliveryFee,
        status: 'pendiente',
        date: new Date().toISOString(),
        createdBy: sessionStorage.getItem('activeEmployee') || 'Caja'
    };

    await userCollection('deliveryOrders').doc(order.id).set(order);
    document.getElementById('delivery-panel-overlay').remove();
    showToast(`✅ Pedido ${type === 'delivery' ? 'domicilio' : 'para llevar'}: ${client} (${formatCurrency(order.total)})`, 'success');
    if (navigator.vibrate) navigator.vibrate(100);
}



// ==========================================
// NUEVO PEDIDO PARA LLEVAR (con nombre de cliente)
// ==========================================
function newLlevarOrder() {
    const overlay = document.createElement('div');
    overlay.id = 'llevar-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
        <div style="background:var(--bg-secondary,#1a1a2e);border:1px solid var(--border-glass,#333);border-radius:20px;padding:28px;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
            <div style="text-align:center;margin-bottom:20px;">
                <div style="font-size:2.5rem;margin-bottom:8px;">🛍️</div>
                <h3 style="color:var(--text-primary,white);font-size:1.2rem;">Nuevo Pedido Para Llevar</h3>
            </div>
            <div style="display:flex;flex-direction:column;gap:14px;">
                <div>
                    <label style="display:block;font-size:0.8rem;color:var(--text-secondary,#94a3b8);margin-bottom:6px;font-weight:600;">Nombre del cliente *</label>
                    <input type="text" id="llevar-nombre" placeholder="Ej: Juan Pérez" style="width:100%;padding:14px 16px;background:var(--bg-primary,#0f0f1a);border:1px solid var(--border-glass,#333);border-radius:12px;color:var(--text-primary,white);font-size:1rem;outline:none;" autofocus>
                </div>
                <div>
                    <label style="display:block;font-size:0.8rem;color:var(--text-secondary,#94a3b8);margin-bottom:6px;font-weight:600;">Teléfono (opcional)</label>
                    <input type="tel" id="llevar-telefono" placeholder="Ej: 315 123 4567" style="width:100%;padding:14px 16px;background:var(--bg-primary,#0f0f1a);border:1px solid var(--border-glass,#333);border-radius:12px;color:var(--text-primary,white);font-size:1rem;outline:none;">
                </div>
                <div>
                    <label style="display:block;font-size:0.8rem;color:var(--text-secondary,#94a3b8);margin-bottom:6px;font-weight:600;">Nota (opcional)</label>
                    <input type="text" id="llevar-nota" placeholder="Ej: Pasa en 20 min" style="width:100%;padding:14px 16px;background:var(--bg-primary,#0f0f1a);border:1px solid var(--border-glass,#333);border-radius:12px;color:var(--text-primary,white);font-size:1rem;outline:none;">
                </div>
            </div>
            <div style="display:flex;gap:10px;margin-top:24px;">
                <button onclick="document.getElementById('llevar-modal').remove()" style="flex:1;padding:14px;background:rgba(255,255,255,0.06);border:1px solid var(--border-glass,#333);border-radius:12px;color:var(--text-secondary,#94a3b8);font-size:0.95rem;font-weight:600;cursor:pointer;">Cancelar</button>
                <button onclick="confirmLlevarOrder()" style="flex:1;padding:14px;background:linear-gradient(135deg,#f59e0b,#d97706);border:none;border-radius:12px;color:white;font-size:0.95rem;font-weight:700;cursor:pointer;">🛍️ Crear Pedido</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    setTimeout(() => document.getElementById('llevar-nombre')?.focus(), 100);
}

function confirmLlevarOrder() {
    const nombre = document.getElementById('llevar-nombre').value.trim();
    const telefono = document.getElementById('llevar-telefono').value.trim();
    const nota = document.getElementById('llevar-nota').value.trim();
    
    if (!nombre) {
        document.getElementById('llevar-nombre').style.borderColor = '#ef4444';
        return;
    }
    
    const key = 'llevar_' + nombre.replace(/\s+/g, '_');
    if (!orders[key]) orders[key] = { pending: [], tandas: [] };
    
    // Guardar datos del cliente en sessionStorage para usarlos al cobrar
    sessionStorage.setItem('llevar_data_' + key, JSON.stringify({ nombre, telefono, nota }));
    
    document.getElementById('llevar-modal').remove();
    openMesa(key);
}
