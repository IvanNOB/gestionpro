// ==========================================
// GESTIÓN PRO - COCINA APP (Vista Kanban)
// ==========================================

let currentUser = null;
let orders = [];
let soundEnabled = true;
let timerInterval = null;

// ==========================================
// UTILIDADES
// ==========================================
function esc(text) {
    const d = document.createElement('div');
    d.textContent = text || '';
    return d.innerHTML;
}

function userDoc() { return db.collection('users').doc(currentUser.uid); }
function userCollection(name) { return userDoc().collection(name); }

// ==========================================
// RELOJ
// ==========================================
function updateClock() {
    const el = document.getElementById('clock');
    if (el) {
        el.textContent = new Date().toLocaleTimeString('es-CO', {
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    }
}
setInterval(updateClock, 1000);
updateClock();

// ==========================================
// AUTH
// ==========================================
auth.onAuthStateChanged(async (user) => {
    if (user) {
        const activeRole = sessionStorage.getItem('activeRole');
        if (activeRole === 'waiter') {
            window.location.href = 'mesero.html';
            return;
        }
        currentUser = user;
        document.getElementById('loading').style.display = 'none';
        listenOrders();
        startTimers();
    } else {
        window.location.href = 'login.html';
    }
});

// ==========================================
// ESCUCHAR PEDIDOS EN TIEMPO REAL
// ==========================================
function listenOrders() {
    userCollection('orders').onSnapshot((snapshot) => {
        const prevNewCount = orders.filter(o => o.status === 'active').length;

        orders = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(o => o.status !== 'completed');

        orders.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

        const newCount = orders.filter(o => o.status === 'active').length;

        renderKanban();
        updateHeaderStats();

        // Sonido cuando llega un pedido nuevo
        if (newCount > prevNewCount && soundEnabled) {
            playNotification();
        }
    });
}

// ==========================================
// RENDERIZAR KANBAN
// ==========================================
function renderKanban() {
    const newOrders = orders.filter(o => o.status === 'active');
    const preparingOrders = orders.filter(o => o.status === 'preparing');
    const readyOrders = orders.filter(o => o.status === 'ready');

    const kanban = document.getElementById('kanban-container');
    const empty = document.getElementById('empty-kitchen');

    if (orders.length === 0) {
        kanban.style.display = 'none';
        empty.style.display = 'flex';
        return;
    }

    kanban.style.display = 'grid';
    empty.style.display = 'none';

    // Update counts
    document.getElementById('count-new').textContent = newOrders.length;
    document.getElementById('count-preparing').textContent = preparingOrders.length;
    document.getElementById('count-ready').textContent = readyOrders.length;

    // Render columns
    document.getElementById('body-new').innerHTML = newOrders.map(o => renderOrderCard(o, 'new')).join('');
    document.getElementById('body-preparing').innerHTML = preparingOrders.map(o => renderOrderCard(o, 'preparing')).join('');
    document.getElementById('body-ready').innerHTML = readyOrders.map(o => renderOrderCard(o, 'ready')).join('');
}

function renderOrderCard(order, status) {
    const items = order.items || [];
    const time = order.createdAt ? new Date(order.createdAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '';

    let actions = '';
    if (status === 'new') {
        actions = `<button class="btn-prepare" onclick="updateStatus('${order.id}', 'preparing')">
            <span>👨‍🍳</span> Preparar
        </button>`;
    } else if (status === 'preparing') {
        actions = `<button class="btn-ready" onclick="updateStatus('${order.id}', 'ready')">
            <span>✅</span> Listo!
        </button>`;
    } else {
        actions = `<button class="btn-done" onclick="updateStatus('${order.id}', 'completed')">
            <span>✓</span> Entregado
        </button>`;
    }

    return `<div class="order-card ${status === 'new' ? 'new' : status === 'preparing' ? 'preparing' : 'ready'}">
        <div class="order-card-header">
            <div class="order-mesa">🪑 ${esc(order.mesaName || 'Mesa')}</div>
            <div class="order-timer" data-created="${order.createdAt || ''}" id="timer-${order.id}">
                <span>⏱</span> ${time}
            </div>
        </div>
        <div class="order-items-list">
            ${items.map(i => `<div class="order-item-row">
                <span class="item-qty">${i.qty}</span>
                <div>
                    <div class="item-name">${esc(i.name)}</div>
                    ${i.notes ? `<div class="item-notes">📝 ${esc(i.notes)}</div>` : ''}
                </div>
            </div>`).join('')}
        </div>
        <div class="order-card-actions">${actions}</div>
    </div>`;
}

// ==========================================
// TEMPORIZADORES
// ==========================================
function startTimers() {
    timerInterval = setInterval(updateTimers, 10000); // Cada 10 seg
    setTimeout(updateTimers, 1000); // Primer update rápido
}

function updateTimers() {
    const timerElements = document.querySelectorAll('.order-timer[data-created]');
    const now = Date.now();

    timerElements.forEach(el => {
        const created = el.getAttribute('data-created');
        if (!created) return;

        const elapsed = Math.floor((now - new Date(created).getTime()) / 60000); // minutos
        let timerClass = 'timer-ok';
        let timerText = '';

        if (elapsed < 1) {
            timerText = 'Ahora';
        } else if (elapsed < 60) {
            timerText = `${elapsed} min`;
        } else {
            timerText = `${Math.floor(elapsed / 60)}h ${elapsed % 60}m`;
        }

        if (elapsed >= 15) {
            timerClass = 'timer-danger';
        } else if (elapsed >= 8) {
            timerClass = 'timer-warning';
        }

        el.className = `order-timer ${timerClass}`;
        el.innerHTML = `<span>⏱</span> ${timerText}`;
    });
}

// ==========================================
// HEADER STATS
// ==========================================
function updateHeaderStats() {
    const statsEl = document.getElementById('header-stats');
    const newCount = orders.filter(o => o.status === 'active').length;
    const prepCount = orders.filter(o => o.status === 'preparing').length;
    const readyCount = orders.filter(o => o.status === 'ready').length;

    statsEl.innerHTML = `
        ${newCount > 0 ? `<span class="stat-badge urgent">🔥 ${newCount} nuevo${newCount !== 1 ? 's' : ''}</span>` : ''}
        ${prepCount > 0 ? `<span class="stat-badge active">👨‍🍳 ${prepCount} preparando</span>` : ''}
        ${readyCount > 0 ? `<span class="stat-badge done">✅ ${readyCount} listo${readyCount !== 1 ? 's' : ''}</span>` : ''}
        ${orders.length === 0 ? `<span class="stat-badge">😌 Todo al día</span>` : ''}
    `;
}

// ==========================================
// ACTUALIZAR ESTADO DE PEDIDOS
// ==========================================
async function updateStatus(orderId, newStatus) {
    try {
        if (newStatus === 'completed') {
            await userCollection('orders').doc(orderId).delete();
            showNotification('✓ Pedido entregado', '#16a34a');
        } else {
            await userCollection('orders').doc(orderId).update({
                status: newStatus,
                updatedAt: new Date().toISOString()
            });
            if (newStatus === 'preparing') {
                showNotification('👨‍🍳 Preparando pedido...', '#2563eb');
            } else {
                showNotification('✅ ¡Listo para servir!', '#16a34a');
                playReadySound();
            }
        }
    } catch (e) {
        console.error('Error actualizando pedido:', e);
        try {
            if (newStatus !== 'completed') {
                await userCollection('orders').doc(orderId).set(
                    { status: newStatus, updatedAt: new Date().toISOString() },
                    { merge: true }
                );
                showNotification('Estado actualizado', '#2563eb');
            }
        } catch (e2) {
            showNotification('Error: ' + e2.message, '#dc2626');
        }
    }
}

// ==========================================
// NOTIFICACIONES
// ==========================================
function showNotification(msg, color) {
    const el = document.createElement('div');
    el.className = 'toast-notification';
    el.style.background = color || '#1e293b';
    el.style.color = 'white';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
}

// ==========================================
// SONIDO
// ==========================================
function toggleSound() {
    soundEnabled = !soundEnabled;
    const btn = document.getElementById('btn-sound');
    btn.textContent = soundEnabled ? '🔔 Sonido' : '🔕 Mute';
    btn.className = soundEnabled ? 'header-btn sound-btn' : 'header-btn sound-btn muted';
}

function playNotification() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.value = 0.4;

        // Alarma tipo "ding-ding"
        osc.frequency.value = 880;
        osc.type = 'sine';
        osc.start();
        setTimeout(() => { osc.frequency.value = 1100; }, 150);
        setTimeout(() => { osc.frequency.value = 880; }, 300);
        setTimeout(() => { osc.frequency.value = 1100; }, 450);
        setTimeout(() => { gain.gain.value = 0; osc.stop(); ctx.close(); }, 600);
    } catch (e) {}
}

function playReadySound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.value = 0.3;
        osc.frequency.value = 523;
        osc.type = 'sine';
        osc.start();
        setTimeout(() => { osc.frequency.value = 659; }, 100);
        setTimeout(() => { osc.frequency.value = 784; }, 200);
        setTimeout(() => { gain.gain.value = 0; osc.stop(); ctx.close(); }, 400);
    } catch (e) {}
}

// ==========================================
// PANTALLA COMPLETA
// ==========================================
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
    } else {
        document.exitFullscreen().catch(() => {});
    }
}