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
                ${!isAdminUser ? `<button class="btn-block" style="background:rgba(99,91,255,0.15);color:#93c5fd;border:1px solid rgba(99,91,255,0.3);margin-left:4px;" onclick="loadDemoForUser('${u.uid}', '${(u.businessName || '').replace(/'/g, '')}')">📦 Demo</button>` : ''}
                ${!isAdminUser ? `<button class="btn-block" style="background:rgba(223,27,65,0.1);color:#fca5a5;border:1px solid rgba(223,27,65,0.2);margin-left:4px;" onclick="deleteUserAccount('${u.uid}', '${(u.businessName || u.email || '').replace(/'/g, '')}')">🗑️</button>` : ''}
                ${!isAdminUser ? `<select onchange="changePlan('${u.uid}', this.value)" style="margin-left:6px;padding:4px 8px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:0.75rem;">
                    <option value="trial" ${plan==='trial'?'selected':''}>Prueba</option>
                    <option value="basic" ${plan==='basic'?'selected':''}>Básico</option>
                    <option value="restaurant" ${plan==='restaurant'?'selected':''}>Restaurante</option>
                    <option value="premium" ${plan==='premium'?'selected':''}>Premium</option>
                </select>` : ''}
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



// ==========================================
// CAMBIAR PLAN DE USUARIO
// ==========================================
async function changePlan(uid, newPlan) {
    const user = allUsers.find(u => u.uid === uid);
    if (!user) return;

    try {
        await db.collection('users').doc(uid).update({
            plan: newPlan,
            'settings.plan': newPlan,
            planChangedAt: new Date().toISOString()
        });
        user.plan = newPlan;
        renderUsersTable();
        showToast(`Plan de "${user.businessName || user.email}" cambiado a: ${newPlan.toUpperCase()}`, 'success');
    } catch (error) {
        showToast('Error al cambiar plan: ' + error.message, 'error');
    }
}



// ==========================================
// CARGAR DEMO REMOTA PARA UN USUARIO
// ==========================================
async function loadDemoForUser(uid, businessName) {
    const demoType = prompt('¿Qué demo cargar?\n1 = Cafetería\n2 = Tienda\n3 = Restaurante\n4 = Heladería', '1');
    if (!demoType) return;

    const demoNames = { '1': 'Cafetería', '2': 'Tienda', '3': 'Restaurante', '4': 'Heladería' };
    const demoName = demoNames[demoType] || 'Cafetería';

    showToast(`Cargando demo "${demoName}" para ${businessName || uid}...`, 'info');

    const userDoc = db.collection('users').doc(uid);

    try {
        const demos = getDemoData(demoType);

        // Cargar productos
        for (const p of demos.products) {
            await userDoc.collection('products').doc(p.id).set(p);
        }

        // Cargar insumos
        for (const i of demos.insumos) {
            await userDoc.collection('insumos').doc(i.id).set(i);
        }

        // Cargar recetas
        for (const r of demos.recipes) {
            await userDoc.collection('recipes').doc(r.id).set(r);
        }

        // Cargar mesas
        for (const m of demos.mesas) {
            await userDoc.collection('mesas').doc(m.id).set(m);
        }

        // Cargar ventas de ejemplo
        for (const s of demos.sales) {
            await userDoc.collection('sales').doc(s.id).set(s);
        }

        // Actualizar settings
        await userDoc.update({
            'settings.businessName': `${demoName} ${businessName || 'Demo'}`,
            'settings.monthlyGoal': 5000000
        });

        showToast(`✅ Demo "${demoName}" cargada exitosamente para ${businessName}`, 'success');
    } catch (e) {
        showToast('Error: ' + e.message, 'error');
    }
}

function generateId() { return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9); }

function getDemoData(type) {
    const now = new Date().toISOString();
    const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };

    // Productos base según tipo
    const productSets = {
        '1': [ // Cafetería
            { name: 'Café Americano', cost: 800, price: 3000, qty: 100 },
            { name: 'Café con Leche', cost: 1000, price: 3500, qty: 80 },
            { name: 'Cappuccino', cost: 1200, price: 4000, qty: 70 },
            { name: 'Latte', cost: 1300, price: 4000, qty: 60 },
            { name: 'Mocaccino', cost: 1500, price: 4500, qty: 50 },
            { name: 'Chocolate Caliente', cost: 1200, price: 3700, qty: 40 },
            { name: 'Croissant', cost: 1500, price: 4000, qty: 30 },
            { name: 'Muffin', cost: 1200, price: 3500, qty: 25 },
            { name: 'Brownie', cost: 1000, price: 3000, qty: 30 },
            { name: 'Sándwich de Pollo', cost: 3000, price: 7000, qty: 20 },
        ],
        '2': [ // Tienda
            { name: 'Arroz x Libra', cost: 2500, price: 3500, qty: 50 },
            { name: 'Aceite x Litro', cost: 8000, price: 11000, qty: 30 },
            { name: 'Panela', cost: 2000, price: 3000, qty: 40 },
            { name: 'Huevos x30', cost: 12000, price: 16000, qty: 20 },
            { name: 'Leche x Litro', cost: 3500, price: 5000, qty: 25 },
            { name: 'Pan Tajado', cost: 4000, price: 6000, qty: 20 },
            { name: 'Gaseosa 350ml', cost: 1200, price: 2500, qty: 48 },
            { name: 'Agua 600ml', cost: 800, price: 2000, qty: 48 },
            { name: 'Jabón', cost: 3000, price: 5000, qty: 15 },
            { name: 'Papel Higiénico x4', cost: 5000, price: 8000, qty: 20 },
        ],
        '3': [ // Restaurante
            { name: 'Almuerzo Corriente', cost: 6000, price: 12000, qty: 50 },
            { name: 'Bandeja Paisa', cost: 8000, price: 18000, qty: 30 },
            { name: 'Sancocho', cost: 5000, price: 14000, qty: 25 },
            { name: 'Arroz con Pollo', cost: 6500, price: 15000, qty: 30 },
            { name: 'Carne Asada', cost: 9000, price: 20000, qty: 20 },
            { name: 'Limonada', cost: 800, price: 3000, qty: 60 },
            { name: 'Jugo Natural', cost: 1500, price: 4000, qty: 40 },
            { name: 'Sopa del Día', cost: 2500, price: 6000, qty: 35 },
            { name: 'Postre del Día', cost: 2000, price: 5000, qty: 20 },
            { name: 'Agua Botella', cost: 800, price: 2000, qty: 48 },
        ],
        '4': [ // Heladería
            { name: 'Helado Chocolate (bolita)', cost: 800, price: 3000, qty: 120 },
            { name: 'Helado Vainilla (bolita)', cost: 750, price: 3000, qty: 100 },
            { name: 'Helado Fresa (bolita)', cost: 850, price: 3000, qty: 80 },
            { name: 'Helado Maracuyá (bolita)', cost: 900, price: 3000, qty: 60 },
            { name: 'Cono Sencillo', cost: 300, price: 600, qty: 200 },
            { name: 'Cono Doble', cost: 500, price: 1200, qty: 150 },
            { name: 'Malteada', cost: 2500, price: 5500, qty: 30 },
            { name: 'Sundae', cost: 3000, price: 7000, qty: 25 },
            { name: 'Banana Split', cost: 3500, price: 8500, qty: 20 },
            { name: 'Agua', cost: 800, price: 2000, qty: 48 },
        ]
    };

    const selectedProducts = productSets[type] || productSets['1'];
    const category = type === '2' ? 'Hogar' : 'Alimentos';

    // Generar productos
    const products = selectedProducts.map((p, i) => ({
        id: generateId() + '_' + i,
        name: p.name,
        category: category,
        quantity: p.qty,
        cost: p.cost,
        price: p.price,
        margin: Math.round(((p.price - p.cost) / p.cost) * 100),
        minStock: 5,
        supplier: '',
        createdAt: daysAgo(30),
        updatedAt: now
    }));

    // Generar insumos básicos
    const insumos = [
        { id: generateId() + '_ins1', name: 'Insumo Principal', unit: 'g', purchasePrice: 25000, purchaseQty: 500, currentStock: 500, minStock: 50, costPerUnit: 50, createdAt: now },
        { id: generateId() + '_ins2', name: 'Azúcar', unit: 'g', purchasePrice: 5000, purchaseQty: 1000, currentStock: 1000, minStock: 100, costPerUnit: 5, createdAt: now },
        { id: generateId() + '_ins3', name: 'Agua', unit: 'ml', purchasePrice: 3000, purchaseQty: 20000, currentStock: 20000, minStock: 2000, costPerUnit: 0.15, createdAt: now },
    ];

    // Recetas para primer producto
    const recipes = [{
        id: generateId() + '_rec1',
        productId: products[0].id,
        productName: products[0].name,
        ingredients: [
            { insumoId: insumos[0].id, insumoName: insumos[0].name, quantity: 5, unit: 'g', cost: 250 },
            { insumoId: insumos[1].id, insumoName: insumos[1].name, quantity: 3, unit: 'g', cost: 15 },
        ],
        totalCost: 265,
        createdAt: now, updatedAt: now
    }];

    // Mesas
    const mesas = [
        { id: 'mesa_1', name: 'Mesa 1', capacity: 4, status: 'libre', createdAt: now },
        { id: 'mesa_2', name: 'Mesa 2', capacity: 4, status: 'libre', createdAt: now },
        { id: 'mesa_3', name: 'Mesa 3', capacity: 2, status: 'libre', createdAt: now },
        { id: 'mesa_4', name: 'Mesa 4', capacity: 6, status: 'libre', createdAt: now },
    ];

    // Ventas de ejemplo (últimos 7 días)
    const sales = [];
    const methods = ['Efectivo', 'Nequi', 'Daviplata', 'Tarjeta'];
    for (let day = 0; day < 7; day++) {
        const numSales = Math.floor(Math.random() * 5) + 3;
        for (let s = 0; s < numSales; s++) {
            const prod = products[Math.floor(Math.random() * products.length)];
            const qty = Math.floor(Math.random() * 3) + 1;
            const saleDate = new Date(); saleDate.setDate(saleDate.getDate() - day);
            saleDate.setHours(Math.floor(Math.random() * 10) + 8, Math.floor(Math.random() * 60));
            sales.push({
                id: generateId() + '_s' + day + s,
                productId: prod.id, productName: prod.name,
                quantity: qty, price: prod.price, cost: prod.cost,
                discount: 0, discountAmount: 0,
                total: prod.price * qty,
                profit: (prod.price - prod.cost) * qty,
                client: '', method: methods[Math.floor(Math.random() * methods.length)],
                notes: '', date: saleDate.toISOString()
            });
        }
    }

    return { products, insumos, recipes, mesas, sales };
}



// ==========================================
// ELIMINAR CUENTA DE USUARIO
// ==========================================
async function deleteUserAccount(uid, name) {
    if (!confirm(`⚠️ ¿Eliminar la cuenta de "${name}"?\n\nSe borrarán TODOS sus datos:\n- Productos\n- Ventas\n- Insumos\n- Recetas\n- Mesas\n- Clientes\n- Todo\n\n¡Esta acción NO se puede deshacer!`)) return;
    if (!confirm(`¿Estás SEGURO? Se eliminará "${name}" permanentemente.`)) return;

    showToast(`Eliminando cuenta de ${name}...`, 'info');

    try {
        const userRef = db.collection('users').doc(uid);
        
        // Borrar todas las subcolecciones
        const collections = ['products', 'sales', 'history', 'clients', 'suppliers', 'expenses', 'insumos', 'recipes', 'mesas', 'orders', 'employees'];
        for (const col of collections) {
            const snap = await userRef.collection(col).get();
            const batch = db.batch();
            snap.docs.forEach(doc => batch.delete(doc.ref));
            if (snap.docs.length > 0) await batch.commit();
        }

        // Borrar el documento del usuario
        await userRef.delete();

        // Quitar de la lista local
        allUsers = allUsers.filter(u => u.uid !== uid);
        updateStats();
        renderUsersTable();

        showToast(`✅ Cuenta de "${name}" eliminada completamente`, 'success');
    } catch (e) {
        showToast('Error eliminando: ' + e.message, 'error');
    }
}
