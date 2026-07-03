// ==========================================
// PANEL DE ADMINISTRADOR - GestiónPro
// ==========================================

// IMPORTANTE: Cambia este correo por el tuyo (el del administrador)
const ADMIN_EMAILS = [
    'kalethcano0216@gmail.com'
    // Agrega más correos de admin si quieres:
    // 'otro-admin@correo.com'
];

let allUsers = [];
let currentAdmin = null;

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    auth.onAuthStateChanged((user) => {
        if (user) {
            if (isAdmin(user.email)) {
                currentAdmin = user;
                document.getElementById('admin-email').textContent = user.email;
                initAdminPanel();
            } else {
                showAccessDenied();
            }
        } else {
            window.location.href = 'admin-login.html';
        }
    });
});

function isAdmin(email) {
    return ADMIN_EMAILS.includes(email.toLowerCase());
}

function showAccessDenied() {
    document.getElementById('admin-loading').style.display = 'none';
    document.getElementById('access-denied').style.display = 'flex';
}

// ==========================================
// INICIALIZAR PANEL
// ==========================================
async function initAdminPanel() {
    document.getElementById('admin-loading').style.display = 'none';
    document.getElementById('admin-container').style.display = 'block';

    // Event listeners
    document.getElementById('btn-admin-logout').addEventListener('click', handleLogout);
    document.getElementById('btn-refresh').addEventListener('click', loadUsers);
    document.getElementById('search-users').addEventListener('input', renderUsersTable);
    document.getElementById('filter-status').addEventListener('change', renderUsersTable);

    await loadUsers();
}

// ==========================================
// CARGAR USUARIOS
// ==========================================
async function loadUsers() {
    try {
        const snapshot = await db.collection('users').get();
        allUsers = snapshot.docs.map(doc => ({
            uid: doc.id,
            ...doc.data()
        }));
        updateStats();
        renderUsersTable();
    } catch (error) {
        console.error('Error cargando usuarios:', error);
        showToast('Error cargando usuarios: ' + error.message, 'error');
    }
}

// ==========================================
// ESTADÍSTICAS
// ==========================================
function updateStats() {
    const total = allUsers.length;
    const blocked = allUsers.filter(u => u.blocked === true).length;
    const active = total - blocked;

    const today = new Date().toISOString().split('T')[0];
    const newToday = allUsers.filter(u => {
        if (!u.createdAt) return false;
        const created = u.createdAt.toDate ? u.createdAt.toDate().toISOString().split('T')[0] : '';
        return created === today;
    }).length;

    document.getElementById('stat-total-users').textContent = total;
    document.getElementById('stat-active-users').textContent = active;
    document.getElementById('stat-blocked-users').textContent = blocked;
    document.getElementById('stat-new-today').textContent = newToday;
}

// ==========================================
// RENDERIZAR TABLA
// ==========================================
function renderUsersTable() {
    const search = document.getElementById('search-users').value.toLowerCase().trim();
    const filter = document.getElementById('filter-status').value;
    const tbody = document.getElementById('users-body');
    const empty = document.getElementById('empty-users');

    let filtered = [...allUsers];

    // Filtro de búsqueda
    if (search) {
        filtered = filtered.filter(u =>
            (u.businessName || '').toLowerCase().includes(search) ||
            (u.email || '').toLowerCase().includes(search)
        );
    }

    // Filtro de estado
    if (filter === 'active') filtered = filtered.filter(u => !u.blocked);
    if (filter === 'blocked') filtered = filtered.filter(u => u.blocked === true);

    // Ordenar por fecha de registro (más reciente primero)
    filtered.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
        return dateB - dateA;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';

    tbody.innerHTML = filtered.map(u => {
        const isBlocked = u.blocked === true;
        const createdAt = u.createdAt?.toDate
            ? u.createdAt.toDate().toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
            : 'Desconocido';
        const plan = u.plan || 'free';
        const isAdminUser = isAdmin(u.email || '');

        return `<tr>
            <td class="user-name">${escapeHtml(u.businessName || 'Sin nombre')}${isAdminUser ? ' 🛡️' : ''}</td>
            <td class="user-email">${escapeHtml(u.email || 'Sin correo')}</td>
            <td>${escapeHtml(u.settings?.businessName || u.businessName || '-')}</td>
            <td>${createdAt}</td>
            <td><span class="plan-badge">${plan.toUpperCase()}</span></td>
            <td><span class="status-badge ${isBlocked ? 'status-blocked' : 'status-active'}">${isBlocked ? '🚫 Bloqueado' : '✅ Activo'}</span></td>
            <td>
                ${isAdminUser ? '<span style="color:#64748b;font-size:0.8rem;">Admin</span>' :
                    (isBlocked
                        ? `<button class="btn-block btn-unblock-user" onclick="unblockUser('${u.uid}')">✅ Desbloquear</button>`
                        : `<button class="btn-block btn-block-user" onclick="blockUser('${u.uid}')">🚫 Bloquear</button>`
                    )
                }
            </td>
        </tr>`;
    }).join('');
}

// ==========================================
// BLOQUEAR / DESBLOQUEAR USUARIO
// ==========================================
async function blockUser(uid) {
    const user = allUsers.find(u => u.uid === uid);
    if (!user) return;
    if (!confirm(`¿Bloquear a "${user.businessName || user.email}"?\n\nNo podrá acceder a la app hasta que lo desbloquees.`)) return;

    try {
        await db.collection('users').doc(uid).update({ blocked: true });
        // Actualizar localmente
        const idx = allUsers.findIndex(u => u.uid === uid);
        allUsers[idx].blocked = true;
        updateStats();
        renderUsersTable();
        showToast(`"${user.businessName || user.email}" bloqueado`, 'warning');
    } catch (error) {
        showToast('Error al bloquear: ' + error.message, 'error');
    }
}

async function unblockUser(uid) {
    const user = allUsers.find(u => u.uid === uid);
    if (!user) return;

    try {
        await db.collection('users').doc(uid).update({ blocked: false });
        const idx = allUsers.findIndex(u => u.uid === uid);
        allUsers[idx].blocked = false;
        updateStats();
        renderUsersTable();
        showToast(`"${user.businessName || user.email}" desbloqueado`, 'success');
    } catch (error) {
        showToast('Error al desbloquear: ' + error.message, 'error');
    }
}

// ==========================================
// LOGOUT
// ==========================================
async function handleLogout() {
    if (confirm('¿Cerrar sesión?')) {
        await auth.signOut();
        window.location.href = 'admin-login.html';
    }
}

// ==========================================
// UTILIDADES
// ==========================================
function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text || '';
    return d.innerHTML;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}
