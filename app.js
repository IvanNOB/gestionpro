// ==========================================
// GESTIÓN PRO - APP COMPLETA CON FIREBASE
// ==========================================
// Versión optimizada con caché en memoria y mejoras de rendimiento

// ==========================================
// MANEJO DE ERRORES GLOBAL
// ==========================================
window.onerror = function(message, source, lineno, colno, error) {
    console.error('Error global:', { message, source, lineno, error });
    showToast('Ocurrió un error inesperado. Intenta de nuevo.', 'error');
    return true;
};

window.addEventListener('unhandledrejection', function(event) {
    console.warn('Promise rechazada:', event.reason);
    // No mostrar toast - Firestore offline maneja la sincronización automáticamente
});

// Wrapper para operaciones de Firestore con retry automático
async function firestoreOperation(operation, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            return await operation();
        } catch (error) {
            if (i === retries) {
                // Con persistencia offline, los datos se guardan localmente aunque falle la red
                if (error.code === 'unavailable' || error.code === 'deadline-exceeded') {
                    // No mostrar error - se sincronizará cuando vuelva internet
                    console.warn('Operación guardada offline, se sincronizará después');
                    return;
                }
                if (error.code === 'permission-denied') {
                    showToast('Sin permisos. Verifica las reglas de Firestore.', 'error');
                }
                // Para otros errores, no mostrar toast (Firestore offline los maneja)
                console.error('Error Firestore:', error.code, error.message);
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
        }
    }
}

// Loading state para botones
function setButtonLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
        btn.dataset.originalText = btn.textContent;
        btn.textContent = '⏳...';
        btn.disabled = true;
        btn.style.opacity = '0.7';
    } else {
        btn.textContent = btn.dataset.originalText || btn.textContent;
        btn.disabled = false;
        btn.style.opacity = '1';
    }
}

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
// SISTEMA DE CACHÉ EN MEMORIA (AVANZADO)
// ==========================================
const AppCache = {
    _store: new Map(),
    _ttl: new Map(),
    _hits: 0,
    _misses: 0,
    _defaultTTL: 60000, // 1 minuto por defecto

    /**
     * Almacena un valor en caché con TTL opcional
     * @param {string} key - Clave única
     * @param {*} value - Valor a cachear
     * @param {number} ttl - Tiempo de vida en ms (default: 60000)
     */
    set(key, value, ttl) {
        this._store.set(key, value);
        this._ttl.set(key, Date.now() + (ttl || this._defaultTTL));
        // Limitar tamaño del caché a 500 entradas
        if (this._store.size > 500) this._evictOldest();
    },

    /**
     * Obtiene un valor del caché si existe y no ha expirado
     * @param {string} key - Clave a buscar
     * @returns {*|null} Valor cacheado o null
     */
    get(key) {
        if (!this._store.has(key)) {
            this._misses++;
            return null;
        }
        if (Date.now() > this._ttl.get(key)) {
            this._store.delete(key);
            this._ttl.delete(key);
            this._misses++;
            return null;
        }
        this._hits++;
        return this._store.get(key);
    },

    /**
     * Obtiene valor del caché o ejecuta la función y cachea el resultado
     * @param {string} key - Clave de caché
     * @param {Function} fn - Función que genera el valor si no está en caché
     * @param {number} ttl - TTL en ms
     * @returns {*} Valor cacheado o recién generado
     */
    getOrSet(key, fn, ttl) {
        const cached = this.get(key);
        if (cached !== null) return cached;
        const value = fn();
        this.set(key, value, ttl);
        return value;
    },

    invalidate(key) {
        this._store.delete(key);
        this._ttl.delete(key);
    },

    invalidatePrefix(prefix) {
        for (const key of this._store.keys()) {
            if (key.startsWith(prefix)) {
                this._store.delete(key);
                this._ttl.delete(key);
            }
        }
    },

    /**
     * Invalida todas las cachés relacionadas con datos de negocio
     * Llamar después de cada operación que modifica datos
     */
    invalidateBusinessData() {
        this.invalidatePrefix('stats_');
        this.invalidatePrefix('report_');
        this.invalidatePrefix('chart_');
        this.invalidatePrefix('sales_');
    },

    clear() {
        this._store.clear();
        this._ttl.clear();
        this._hits = 0;
        this._misses = 0;
    },

    /** Elimina las entradas más antiguas cuando el caché excede el límite */
    _evictOldest() {
        const entries = [...this._ttl.entries()].sort((a, b) => a[1] - b[1]);
        const toRemove = entries.slice(0, Math.floor(entries.length * 0.2)); // Eliminar 20%
        toRemove.forEach(([key]) => {
            this._store.delete(key);
            this._ttl.delete(key);
        });
    },

    /** Estadísticas de rendimiento del caché */
    getStats() {
        const total = this._hits + this._misses;
        return {
            size: this._store.size,
            hits: this._hits,
            misses: this._misses,
            hitRate: total > 0 ? ((this._hits / total) * 100).toFixed(1) + '%' : '0%'
        };
    }
};

// ==========================================
// UTILIDADES DE RENDIMIENTO
// ==========================================
function debounce(fn, delay = 300) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

function throttle(fn, limit = 200) {
    let inThrottle = false;
    let lastArgs = null;
    return function(...args) {
        if (!inThrottle) {
            fn.apply(this, args);
            inThrottle = true;
            setTimeout(() => {
                inThrottle = false;
                if (lastArgs) {
                    fn.apply(this, lastArgs);
                    lastArgs = null;
                }
            }, limit);
        } else {
            lastArgs = args;
        }
    };
}

// Mapa indexado de productos por ID para búsquedas O(1)
const productsIndex = new Map();

function rebuildProductsIndex() {
    productsIndex.clear();
    products.forEach(p => productsIndex.set(p.id, p));
    // Invalidar cachés dependientes de productos
    AppCache.invalidatePrefix('stats_');
    AppCache.invalidatePrefix('filtered_');
}


// ==========================================
// INICIALIZACIÓN CON FIREBASE AUTH
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Esperar a que Firebase Auth confirme el usuario
    auth.onAuthStateChanged((user) => {
        if (user) {
            // Verificar que pasó por turno (tiene rol asignado)
            const activeRole = sessionStorage.getItem('activeRole');
            if (!activeRole) {
                window.location.href = 'turno.html';
                return;
            }
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
        
        // Si no existe el documento, crearlo
        if (!userDocSnap.exists) {
            await db.collection('users').doc(currentUser.uid).set({
                businessName: currentUser.displayName || 'Mi Negocio',
                email: currentUser.email,
                createdAt: new Date().toISOString(),
                plan: 'free',
                settings: {
                    businessName: currentUser.displayName || 'Mi Negocio',
                    currency: 'COP',
                    defaultTax: 19,
                    defaultMargin: 30,
                    theme: 'light',
                    monthlyGoal: 0
                }
            });
        } else if (userDocSnap.data().blocked === true) {
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
        checkActiveRole();
        loadCustomization();
        // Tutorial desactivado
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
        const activeEmployee = sessionStorage.getItem('activeEmployee');
        const activeRole = sessionStorage.getItem('activeRole');
        if (activeEmployee && activeRole && activeRole !== 'owner') {
            const roleNames = { caja: '💰 Caja', waiter: '📋 Mesero' };
            el.textContent = `${activeEmployee} (${roleNames[activeRole] || activeRole})`;
        } else {
            el.textContent = currentUser.displayName || currentUser.email;
        }
    }
    // Mostrar badge de turno activo
    const shiftBadge = document.getElementById('active-shift-badge');
    if (shiftBadge) {
        const role = sessionStorage.getItem('activeRole') || 'owner';
        const roleLabels = { owner: '👑 Dueño', caja: '💰 Caja', waiter: '📋 Mesero' };
        shiftBadge.textContent = roleLabels[role] || role;
        shiftBadge.style.display = 'inline-block';
    }
}

function checkActiveRole() {
    const activeRole = sessionStorage.getItem('activeRole');
    if (activeRole === 'waiter') {
        // Meseros NO tienen acceso al panel principal, redirigir
        window.location.href = 'mesero.html';
        return;
    }
    if (activeRole && activeRole !== 'owner') {
        applyRoleRestrictions(activeRole);
    }
}

function applyRoleRestrictions(role) {
    currentRole = role;
    const hiddenForCaja = ['reports', 'settings', 'insumos', 'recipes'];
    const hiddenForWaiter = ['inventory', 'reports', 'settings', 'expenses', 'insumos', 'recipes', 'clients', 'suppliers', 'cashclose', 'calculator', 'history'];

    const allNavLinks = document.querySelectorAll('.nav-link');
    allNavLinks.forEach(link => {
        const section = link.dataset.section;
        if (!section) return;
        if (role === 'caja' && hiddenForCaja.includes(section)) {
            link.parentElement.style.display = 'none';
        }
        if (role === 'waiter' && hiddenForWaiter.includes(section)) {
            link.parentElement.style.display = 'none';
        }
    });

    // Caja: ocultar botones de editar/eliminar productos y configuraciones
    if (role === 'caja') {
        document.querySelectorAll('#product-form, #client-form, #supplier-form, #expense-form, #insumo-form, #recipe-form, #mesa-form, #employee-form').forEach(el => {
            if (el) el.style.display = 'none';
        });
        document.querySelectorAll('#btn-export-csv, #btn-import-csv, #btn-export-sales, #btn-export-report, #btn-clear-history, #btn-clear-all, #btn-save-settings, #btn-backup, #btn-restore').forEach(el => {
            if (el) el.style.display = 'none';
        });
        setTimeout(() => {
            document.querySelectorAll('.action-btn').forEach(btn => {
                btn.style.display = 'none';
            });
        }, 500);
    }
}

function initLogout() {
    const btn = document.getElementById('btn-logout');
    if (btn) {
        btn.addEventListener('click', async () => {
            await auth.signOut();
            window.location.href = 'login.html';
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

        // Reconstruir índice de productos para búsquedas O(1)
        rebuildProductsIndex();
    } catch (error) {
        console.error('Error cargando datos:', error);
        throw error;
    }
}


// Funciones de guardado en Firestore (con retry automático)
async function saveProduct(product) {
    await firestoreOperation(() => userCollection('products').doc(product.id).set(product));
}

async function deleteProductFromDB(id) {
    await firestoreOperation(() => userCollection('products').doc(id).delete());
}

async function saveSale(sale) {
    await firestoreOperation(() => userCollection('sales').doc(sale.id).set(sale));
}

async function saveHistoryItem(item) {
    await firestoreOperation(() => userCollection('history').doc(item.id).set(item));
}

async function saveClient(client) {
    await firestoreOperation(() => userCollection('clients').doc(client.id).set(client));
}

async function deleteClientFromDB(id) {
    await firestoreOperation(() => userCollection('clients').doc(id).delete());
}

async function saveSupplier(supplier) {
    await firestoreOperation(() => userCollection('suppliers').doc(supplier.id).set(supplier));
}

async function deleteSupplierFromDB(id) {
    await firestoreOperation(() => userCollection('suppliers').doc(id).delete());
}


async function saveExpense(expense) {
    await firestoreOperation(() => userCollection('expenses').doc(expense.id).set(expense));
}

async function deleteExpenseFromDB(id) {
    await firestoreOperation(() => userCollection('expenses').doc(id).delete());
}

async function saveSettings() {
    await firestoreOperation(() => userDoc().update({ settings: settings }));
}

async function clearHistoryFromDB() {
    try {
        const batch = db.batch();
        const snap = await userCollection('history').get();
        snap.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    } catch (e) { showToast('Error limpiando historial', 'error'); }
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
    } catch (e) { showToast('Error borrando datos', 'error'); }
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
            if (window.innerWidth <= 900) { sidebar.classList.remove('open'); toggleSidebarOverlay(false); }
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
            toggleSidebarOverlay(sidebar.classList.contains('open'));
        });
    }
}

// Overlay para cerrar sidebar en mobile
function toggleSidebarOverlay(show) {
    let overlay = document.getElementById('sidebar-overlay');
    if (show) {
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'sidebar-overlay';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:999;';
            overlay.addEventListener('click', () => {
                document.getElementById('sidebar').classList.remove('open');
                toggleSidebarOverlay(false);
            });
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'block';
    } else {
        if (overlay) overlay.style.display = 'none';
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
    // Remove any inline style overrides so CSS variables take effect
    document.documentElement.style.removeProperty('--bg');
    document.documentElement.style.removeProperty('--card-bg');
    document.documentElement.style.removeProperty('--text');
    document.documentElement.style.removeProperty('--border');
    const btn = document.getElementById('btn-theme');
    btn.textContent = theme === 'light' ? '🌙 Modo Oscuro' : '☀️ Modo Claro';
    // Re-apply customization for the new theme
    if (typeof applyCustomization === 'function') applyCustomization();
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

    // Subida de imagen de producto
    document.getElementById('product-image-file').addEventListener('change', handleProductImageUpload);

    // Categoría personalizada
    document.getElementById('product-category').addEventListener('change', (e) => {
        const customInput = document.getElementById('product-category-custom');
        if (e.target.value === '__custom__') {
            customInput.style.display = 'block';
            customInput.focus();
        } else {
            customInput.style.display = 'none';
            customInput.value = '';
        }
    });

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
    const btn = document.getElementById('btn-submit');
    setButtonLoading(btn, true);
    const name = document.getElementById('product-name').value.trim();
    const categorySelect = document.getElementById('product-category').value;
    const categoryCustom = document.getElementById('product-category-custom').value.trim();
    const category = categorySelect === '__custom__' ? categoryCustom : categorySelect;
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
        description: document.getElementById('product-description').value.trim(),
        image: document.getElementById('product-image').value.trim(),
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
    setButtonLoading(btn, false);
}


function cancelEdit() {
    editingId = null;
    document.getElementById('product-form').reset();
    document.getElementById('profit-margin').value = settings.defaultMargin;
    document.getElementById('btn-submit').textContent = 'Agregar Producto';
    document.getElementById('btn-cancel').style.display = 'none';
    document.getElementById('form-title').textContent = '➕ Agregar Producto';
    document.getElementById('suggested-price-box').style.display = 'none';
    removeProductImage();
}

// ==========================================
// SUBIDA DE IMÁGENES DE PRODUCTOS
// ==========================================
async function handleProductImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Validar tipo y tamaño
    if (!file.type.startsWith('image/')) {
        showToast('Solo se permiten imágenes', 'error');
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        showToast('La imagen debe pesar menos de 10MB', 'error');
        return;
    }

    document.getElementById('product-image-filename').textContent = '⏳ Procesando...';

    try {
        // Comprimir y convertir a Base64 (sin necesidad de Firebase Storage)
        const base64 = await imageToBase64(file, 400, 0.6);

        // Guardar en el campo oculto
        document.getElementById('product-image').value = base64;
        document.getElementById('product-image-filename').textContent = '✅ ' + file.name;

        // Mostrar preview
        document.getElementById('product-image-preview').style.display = 'flex';
        document.getElementById('product-image-preview-img').src = base64;

        showToast('Foto lista', 'success');
    } catch (err) {
        console.error('Error procesando imagen:', err);
        document.getElementById('product-image-filename').textContent = '❌ Error';
        showToast('Error al procesar la imagen', 'error');
    }
}

function removeProductImage() {
    document.getElementById('product-image').value = '';
    document.getElementById('product-image-file').value = '';
    document.getElementById('product-image-filename').textContent = 'Sin imagen';
    document.getElementById('product-image-preview').style.display = 'none';
    document.getElementById('product-image-preview-img').src = '';
}

function imageToBase64(file, maxWidth, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const base64 = canvas.toDataURL('image/jpeg', quality);
                resolve(base64);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function editProduct(id) {
    const p = getProduct(id);
    if (!p) return;
    editingId = id;
    document.getElementById('product-name').value = p.name;
    document.getElementById('product-category').value = p.category;
    // Si la categoría no está en el select, mostrar campo personalizado
    const catSelect = document.getElementById('product-category');
    if (catSelect.value !== p.category) {
        catSelect.value = '__custom__';
        document.getElementById('product-category-custom').style.display = 'block';
        document.getElementById('product-category-custom').value = p.category;
    } else {
        document.getElementById('product-category-custom').style.display = 'none';
    }
    document.getElementById('product-quantity').value = p.quantity;
    document.getElementById('product-cost').value = p.cost;
    document.getElementById('profit-margin').value = p.margin;
    document.getElementById('product-price').value = p.price;
    document.getElementById('product-min-stock').value = p.minStock || 5;
    document.getElementById('product-supplier').value = p.supplier || '';
    document.getElementById('product-description').value = p.description || '';
    document.getElementById('product-image').value = p.image || '';
    // Mostrar preview si tiene imagen
    if (p.image) {
        document.getElementById('product-image-preview').style.display = 'flex';
        document.getElementById('product-image-preview-img').src = p.image;
        document.getElementById('product-image-filename').textContent = '✅ Imagen actual';
    } else {
        removeProductImage();
    }
    document.getElementById('btn-submit').textContent = 'Actualizar Producto';
    document.getElementById('btn-cancel').style.display = 'inline-block';
    document.getElementById('form-title').textContent = '✏️ Editar Producto';
    updateSuggestedPrice();
    document.getElementById('product-form').scrollIntoView({ behavior: 'smooth' });
}

function deleteProduct(id) {
    const p = getProduct(id);
    if (!p) return;
    const deletedProduct = { ...p };
    products = products.filter(pr => pr.id !== id);
    deleteProductFromDB(id);
    renderAll();
    showUndoToast(`"${p.name}" eliminado`, () => {
        products.push(deletedProduct);
        saveProduct(deletedProduct);
        rebuildProductsIndex();
        renderAll();
    });
    addHistory('delete', `Producto eliminado: ${p.name}`);
}


// ==========================================
// SISTEMA DE VENTAS
// ==========================================
function updateSaleProductList() {
    const select = document.getElementById('sale-product');
    select.innerHTML = '<option value="">Seleccionar producto...</option>';
    products.filter(p => p.quantity > 0).forEach(p => {
        select.innerHTML += `<option value="${p.id}">${esc(p.name)} (Stock: ${p.quantity}) - ${formatCurrency(p.price)}</option>`;
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


async function handleSaleSubmit(e) {
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
        date: new Date().toISOString(),
        soldBy: sessionStorage.getItem('activeEmployee') || 'Dueño'
    };

    sales.push(sale);
    // Descontar stock
    const idx = products.findIndex(p => p.id === productId);
    products[idx].quantity -= qty;

    try {
        await saveSale(sale);
        await saveProduct(products[idx]);
        deductInsumosFromSale(productId, qty);
        addHistory('sale', `Venta: ${qty}x ${product.name} por ${formatCurrency(sale.total)}`);
        // Invalidar caché de datos de negocio tras nueva venta
        AppCache.invalidateBusinessData();
        renderAll();
        renderGoalProgress();
        showToast(`Venta registrada: ${qty}x ${product.name}`, 'success');
        // Vibración haptic en celular al confirmar venta
        if (navigator.vibrate) navigator.vibrate(100);
        lastSale = sale;
        e.target.reset();
        document.getElementById('sale-summary').style.display = 'none';
        document.getElementById('sale-discount-row').style.display = 'none';
        updateSaleProductList();
        printSaleTicket(sale);
    } catch (error) {
        // Revertir cambios locales si falla
        sales = sales.filter(s => s.id !== sale.id);
        products[idx].quantity += qty;
        renderAll();
        showToast('⚠️ Error registrando venta. Intenta de nuevo.', 'error');
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
    // Debounce en búsqueda para evitar renders excesivos
    const debouncedRender = debounce(renderInventoryTable, 250);
    document.getElementById('search-input').addEventListener('input', debouncedRender);
    document.getElementById('filter-category').addEventListener('change', renderInventoryTable);
    document.getElementById('filter-stock').addEventListener('change', renderInventoryTable);
    document.getElementById('sort-by').addEventListener('change', renderInventoryTable);
    updateCategoryFilter();
}

function updateCategoryFilter() {
    const select = document.getElementById('filter-category');
    const cats = [...new Set(products.map(p => p.category))].sort();
    select.innerHTML = '<option value="">Todas las categorías</option>';
    cats.forEach(c => { select.innerHTML += `<option value="${esc(c)}">${esc(c)}</option>`; });
}

// ==========================================
// RENDERIZADO
// ==========================================
function renderAll() {
    // Invalidar caché de estadísticas al re-renderizar
    AppCache.invalidatePrefix('stats_');
    rebuildProductsIndex();
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

    let filtered = products;

    // Filtrado optimizado: aplicar filtros en un solo pass cuando sea posible
    if (search || catFilter || stockFilter) {
        filtered = products.filter(p => {
            if (search && !(p.name.toLowerCase().includes(search) || p.category.toLowerCase().includes(search) ||
                (p.supplier && p.supplier.toLowerCase().includes(search)))) return false;
            if (catFilter && p.category !== catFilter) return false;
            if (stockFilter === 'low' && !(p.quantity > 0 && p.quantity <= (p.minStock || 5))) return false;
            if (stockFilter === 'out' && p.quantity !== 0) return false;
            if (stockFilter === 'ok' && !(p.quantity > (p.minStock || 5))) return false;
            return true;
        });
    } else {
        filtered = [...products];
    }

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

    // Usar DocumentFragment para batch DOM update
    const fragment = document.createDocumentFragment();
    const tempContainer = document.createElement('tbody');

    tempContainer.innerHTML = filtered.map(p => {
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

    tbody.innerHTML = tempContainer.innerHTML;
}


function renderSalesTable() {
    const tbody = document.getElementById('sales-body');
    const emptyMsg = document.getElementById('empty-sales');
    const from = document.getElementById('sales-date-from').value;
    const to = document.getElementById('sales-date-to').value;
    const searchEl = document.getElementById('sales-search');
    const search = searchEl ? searchEl.value.toLowerCase().trim() : '';

    let filtered = [...sales].sort((a,b) => new Date(b.date) - new Date(a.date));
    if (from) filtered = filtered.filter(s => s.date >= from);
    if (to) filtered = filtered.filter(s => s.date <= to + 'T23:59:59');
    if (search) filtered = filtered.filter(s => 
        s.productName.toLowerCase().includes(search) || 
        (s.client || '').toLowerCase().includes(search)
    );

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        emptyMsg.style.display = 'block';
        return;
    }
    emptyMsg.style.display = 'none';

    tbody.innerHTML = filtered.slice(0, 100).map(s => {
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
        <td style="font-size:0.75rem;color:var(--text-light);">${esc(s.soldBy || '-')}</td>
        <td>${!voided ? `<button class="action-btn" onclick="voidSale('${s.id}')" title="Anular venta">❌</button>` : '<span style="font-size:0.75rem;color:var(--danger);">Anulada</span>'}</td>
    </tr>`;
    }).join('');
}

// ==========================================
// DASHBOARD STATS (con caché)
// ==========================================
function updateDashboardStats() {
    const cacheKey = 'stats_dashboard';
    const cached = AppCache.get(cacheKey);

    const today = new Date().toISOString().split('T')[0];
    const thisMonth = new Date().toISOString().slice(0,7);

    // Usar caché si está disponible y los datos no han cambiado
    let stats;
    if (cached && cached.productCount === products.length && cached.salesCount === sales.length && cached.expenseCount === expenses.length) {
        stats = cached;
    } else {
        const totalProducts = products.length;
        const totalStock = products.reduce((s,p) => s + p.quantity, 0);
        const investment = products.reduce((s,p) => s + (p.cost * p.quantity), 0);
        const revenue = products.reduce((s,p) => s + (p.price * p.quantity), 0);
        const profit = revenue - investment;

        const salesToday = sales.filter(s => s.date.startsWith(today));
        const salesTodayTotal = salesToday.reduce((s,v) => s + v.total, 0);

        const salesMonth = sales.filter(s => s.date.startsWith(thisMonth));
        const salesMonthTotal = salesMonth.reduce((s,v) => s + v.total, 0);

        const profitMonth = salesMonth.reduce((s,v) => s + v.profit, 0);
        const expensesMonth = expenses.filter(e => e.date.startsWith(thisMonth)).reduce((s,e) => s + e.amount, 0);
        const netProfitMonth = profitMonth - expensesMonth;

        stats = {
            totalProducts, totalStock, investment, profit,
            salesTodayTotal, salesMonthTotal, expensesMonth, netProfitMonth,
            productCount: products.length, salesCount: sales.length, expenseCount: expenses.length
        };

        // Cachear por 30 segundos
        AppCache.set(cacheKey, stats, 30000);
    }

    setText('dash-total-products', stats.totalProducts);
    setText('dash-total-stock', stats.totalStock);
    setText('dash-investment', formatCurrency(stats.investment));
    setText('dash-profit', formatCurrency(stats.profit));
    setText('dash-sales-today', formatCurrency(stats.salesTodayTotal));
    setText('dash-sales-month', formatCurrency(stats.salesMonthTotal));
    setText('dash-expenses-month', formatCurrency(stats.expensesMonth));
    setText('dash-net-profit', formatCurrency(stats.netProfitMonth));
    const netEl = document.getElementById('dash-net-profit');
    if (netEl) netEl.style.color = stats.netProfitMonth >= 0 ? 'var(--success)' : 'var(--danger)';
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

    // Cachear datos de ventas por día (se recalcula cada 60s)
    const last7 = AppCache.getOrSet('chart_sales_week', () => {
        const data = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const key = d.toISOString().split('T')[0];
            const label = d.toLocaleDateString('es-MX', {weekday:'short', day:'numeric'});
            const total = sales.filter(s => s.date.startsWith(key)).reduce((sum,s) => sum+s.total, 0);
            data.push({label, total});
        }
        return data;
    }, 60000);

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
    sales.forEach(s => {
        const product = productsIndex.get(s.productId);
        const category = product?.category || 'Otro';
        catProfit[category] = (catProfit[category] || 0) + s.profit;
    });
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
    document.getElementById('btn-gram-calc').addEventListener('click', calcPricePerGram);
    document.getElementById('btn-gram-save').addEventListener('click', saveGramResult);
    document.getElementById('btn-clear-gram-history').addEventListener('click', clearGramHistory);
    loadGramHistory();
}

// Tabs de calculadora
function switchCalcTab(tab) {
    document.querySelectorAll('.calc-panel').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.calc-tab').forEach(t => t.classList.remove('active'));
    const panel = document.getElementById('panel-' + tab);
    const tabBtn = document.getElementById('tab-' + tab);
    if (panel) panel.style.display = 'block';
    if (tabBtn) tabBtn.classList.add('active');
}

// ==========================================
// CALCULADORA DE PRECIO POR GRAMOS
// ==========================================
let gramHistory = [];
let lastGramCalc = null;

function calcPricePerGram() {
    const name = document.getElementById('gram-product-name').value.trim() || 'Producto';
    const totalWeight = parseFloat(document.getElementById('gram-total-weight').value) || 0;
    const totalCost = parseFloat(document.getElementById('gram-total-cost').value) || 0;
    const margin = parseFloat(document.getElementById('gram-margin').value) || 0;
    const sellWeight = parseFloat(document.getElementById('gram-sell-weight').value) || 0;
    const results = document.getElementById('gram-results');

    if (totalWeight <= 0 || totalCost <= 0) {
        showToast('Ingresa el peso total y el costo del paquete', 'error');
        return;
    }
    if (sellWeight <= 0) {
        showToast('Ingresa la cantidad de gramos que quieres vender', 'error');
        return;
    }

    const costPerGram = totalCost / totalWeight;
    const pricePerGram = costPerGram * (1 + margin / 100);
    const sellPrice = pricePerGram * sellWeight;
    const sellCost = costPerGram * sellWeight;
    const sellProfit = sellPrice - sellCost;
    const portions = Math.floor(totalWeight / sellWeight);

    document.getElementById('gram-cost-per-g').textContent = formatCurrency(costPerGram);
    document.getElementById('gram-price-per-g').textContent = formatCurrency(pricePerGram);
    document.getElementById('gram-sell-price').textContent = formatCurrency(sellPrice);
    document.getElementById('gram-sell-cost').textContent = formatCurrency(sellCost);
    document.getElementById('gram-sell-profit').textContent = formatCurrency(sellProfit);
    document.getElementById('gram-portions').textContent = portions + ' porciones';

    lastGramCalc = { name, totalWeight, totalCost, margin, sellWeight, costPerGram, pricePerGram, sellPrice, sellCost, sellProfit, portions };
    results.style.display = 'block';
}

function saveGramResult() {
    if (!lastGramCalc) {
        showToast('Primero calcula el precio por gramos', 'error');
        return;
    }

    const entry = {
        id: generateId(),
        ...lastGramCalc,
        date: new Date().toISOString()
    };

    gramHistory.unshift(entry);
    if (gramHistory.length > 20) gramHistory = gramHistory.slice(0, 20);

    // Guardar en Firestore
    saveGramHistoryToDB();
    renderGramHistory();
    showToast(`Resultado de "${lastGramCalc.name}" guardado`, 'success');
}

function loadGramHistory() {
    // Cargar del localStorage como fallback rápido, luego de Firestore
    try {
        const local = localStorage.getItem('gramHistory');
        if (local) gramHistory = JSON.parse(local);
        renderGramHistory();
    } catch(e) {}

    // Si hay usuario, intentar cargar de Firestore
    if (currentUser) {
        userCollection('gramHistory').orderBy('date', 'desc').limit(20).get().then(snap => {
            if (!snap.empty) {
                gramHistory = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                renderGramHistory();
            }
        }).catch(() => {});
    }
}

async function saveGramHistoryToDB() {
    try {
        localStorage.setItem('gramHistory', JSON.stringify(gramHistory));
        if (currentUser && gramHistory.length > 0) {
            const latest = gramHistory[0];
            await userCollection('gramHistory').doc(latest.id).set(latest);
        }
    } catch(e) { console.error('Error guardando historial de gramos:', e); }
}

function clearGramHistory() {
    gramHistory = [];
    localStorage.removeItem('gramHistory');
    if (currentUser) {
        userCollection('gramHistory').get().then(snap => {
            const batch = db.batch();
            snap.docs.forEach(doc => batch.delete(doc.ref));
            batch.commit();
        }).catch(() => {});
    }
    renderGramHistory();
    showToast('Historial limpiado', 'info');
}

function renderGramHistory() {
    const container = document.getElementById('gram-history-list');
    const empty = document.getElementById('empty-gram-history');
    const btnClear = document.getElementById('btn-clear-gram-history');

    if (gramHistory.length === 0) {
        container.innerHTML = '';
        container.appendChild(empty);
        empty.style.display = 'block';
        btnClear.style.display = 'none';
        return;
    }

    empty.style.display = 'none';
    btnClear.style.display = 'inline-block';

    container.innerHTML = gramHistory.map(item => {
        const date = new Date(item.date).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        return `<div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
            <div style="flex:1;">
                <div style="font-weight:700;color:var(--text);font-size:0.95rem;">⚖️ ${esc(item.name)}</div>
                <div style="font-size:0.8rem;color:var(--text-light);margin-top:4px;">
                    ${item.sellWeight}g → <strong style="color:var(--success);">${formatCurrency(item.sellPrice)}</strong> | 
                    Costo/g: ${formatCurrency(item.costPerGram)} | 
                    Ganancia: ${formatCurrency(item.sellProfit)}
                </div>
                <div style="font-size:0.7rem;color:var(--text-light);margin-top:2px;">${date} • ${item.portions} porciones del paquete</div>
            </div>
            <button class="action-btn" onclick="deleteGramHistoryItem('${item.id}')" title="Eliminar" style="opacity:0.6;">🗑️</button>
        </div>`;
    }).join('');
}

function deleteGramHistoryItem(id) {
    gramHistory = gramHistory.filter(h => h.id !== id);
    localStorage.setItem('gramHistory', JSON.stringify(gramHistory));
    if (currentUser) {
        userCollection('gramHistory').doc(id).delete().catch(() => {});
    }
    renderGramHistory();
    showToast('Cálculo eliminado', 'info');
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
    // Usar caché para alertas (se recalcula cada 30s o al cambiar datos)
    const cacheKey = 'stats_alerts';
    const cached = AppCache.get(cacheKey);
    if (cached && cached.productCount === products.length && cached.insumoCount === insumos.length) {
        return cached.alerts;
    }

    const alerts = [];
    const thirtyDaysAgo = new Date(Date.now() - 30*24*60*60*1000).toISOString();

    // Pre-calcular ventas por producto una sola vez
    const salesByProduct = new Map();
    sales.forEach(s => {
        if (!salesByProduct.has(s.productId)) salesByProduct.set(s.productId, []);
        salesByProduct.get(s.productId).push(s);
    });

    products.forEach(p => {
        if (p.quantity === 0) {
            alerts.push({ type: 'danger', title: `Sin stock: ${p.name}`, msg: 'Este producto se agotó. Reabastece pronto.' });
        } else if (p.quantity <= (p.minStock || 5)) {
            alerts.push({ type: 'warning', title: `Stock bajo: ${p.name}`, msg: `Solo quedan ${p.quantity} unidades (mínimo: ${p.minStock || 5}).` });
        }

        const margin = ((p.price - p.cost) / p.cost) * 100;
        if (margin < 10 && margin >= 0) {
            alerts.push({ type: 'info', title: `Margen bajo: ${p.name}`, msg: `Solo ${margin.toFixed(1)}% de margen. Considera aumentar el precio.` });
        } else if (margin < 0) {
            alerts.push({ type: 'danger', title: `Vendiendo a pérdida: ${p.name}`, msg: `El precio es menor al costo. ¡Estás perdiendo dinero!` });
        }

        // Productos sin movimiento - usar mapa pre-calculado
        const productSales = salesByProduct.get(p.id);
        if (!productSales && new Date(p.createdAt) < new Date(thirtyDaysAgo)) {
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

    // Cachear alertas por 30 segundos
    AppCache.set(cacheKey, { alerts, productCount: products.length, insumoCount: insumos.length }, 30000);
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
    renderEmployeeReport();
}

function renderTopProductsReport() {
    const tbody = document.getElementById('report-top-products');

    // Pre-calcular ventas por producto en un solo pass
    const productSalesMap = new Map();
    sales.forEach(s => {
        if (!productSalesMap.has(s.productId)) {
            productSalesMap.set(s.productId, { sold: 0, totalProfit: 0 });
        }
        const entry = productSalesMap.get(s.productId);
        entry.sold += s.quantity;
        entry.totalProfit += s.profit;
    });

    const productStats = products.map(p => {
        const salesData = productSalesMap.get(p.id) || { sold: 0, totalProfit: 0 };
        const margin = ((p.price - p.cost) / p.cost * 100).toFixed(1);
        return { name: p.name, margin, profitUnit: p.price - p.cost, sold: salesData.sold, totalProfit: salesData.totalProfit };
    });

    const sorted = productStats.sort((a,b) => b.totalProfit - a.totalProfit).slice(0,10);
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
        const product = productsIndex.get(s.productId);
        const cat = product ? product.category : 'Otro';
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
// REPORTE POR EMPLEADO
// ==========================================
function renderEmployeeReport() {
    const tbody = document.getElementById('report-employees');
    if (!tbody) return;

    const empSales = {};
    sales.forEach(s => {
        const emp = s.soldBy || 'Dueño';
        if (!empSales[emp]) empSales[emp] = { count: 0, revenue: 0, profit: 0 };
        empSales[emp].count += s.quantity;
        empSales[emp].revenue += s.total;
        empSales[emp].profit += s.profit;
    });

    const sorted = Object.entries(empSales).sort((a, b) => b[1].revenue - a[1].revenue);
    tbody.innerHTML = sorted.map(([emp, d]) => `<tr>
        <td><strong>${esc(emp)}</strong></td>
        <td>${d.count}</td>
        <td>${formatCurrency(d.revenue)}</td>
        <td class="profit-positive">${formatCurrency(d.profit)}</td>
    </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;">No hay datos</td></tr>';
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
    history = [];
    clearHistoryFromDB();
    renderHistory();
    showToast('Historial limpiado', 'info');
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
            AppCache.clear(); // Limpiar todo el caché
            rebuildProductsIndex();
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
        version: '5.0-firebase',
        date: new Date().toISOString(),
        businessName: settings.businessName,
        products, sales, history, clients, suppliers, expenses, insumos, recipes, settings
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
// ==========================================
// CIERRE DE CAJA POR TURNOS (Configurable)
// ==========================================
let currentCashShift = 'todo'; // 'manana', 'noche', 'todo'
let shiftStart1 = 6;  // Hora inicio turno 1 (default 6am)
let shiftStart2 = 14; // Hora inicio turno 2 (default 2pm)

function updateShiftTimes() {
    const t1 = document.getElementById('shift-start-1').value;
    const t2 = document.getElementById('shift-start-2').value;
    if (t1) shiftStart1 = parseInt(t1.split(':')[0]);
    if (t2) shiftStart2 = parseInt(t2.split(':')[0]);
    // Guardar en settings
    settings.shiftStart1 = shiftStart1;
    settings.shiftStart2 = shiftStart2;
    saveSettings();
    renderCashClose();
}

function selectCashShift(shift) {
    currentCashShift = shift;
    document.getElementById('btn-turno-manana').style.background = shift === 'manana' ? 'var(--primary)' : 'var(--bg)';
    document.getElementById('btn-turno-manana').style.color = shift === 'manana' ? 'white' : 'var(--text)';
    document.getElementById('btn-turno-noche').style.background = shift === 'noche' ? 'var(--primary)' : 'var(--bg)';
    document.getElementById('btn-turno-noche').style.color = shift === 'noche' ? 'white' : 'var(--text)';
    document.getElementById('btn-turno-todo').style.background = shift === 'todo' ? 'var(--primary)' : 'var(--bg)';
    document.getElementById('btn-turno-todo').style.color = shift === 'todo' ? 'white' : 'var(--text)';
    renderCashClose();
}

function renderCashClose() {
    const dateInput = document.getElementById('cash-date');
    const selectedDate = dateInput.value || new Date().toISOString().split('T')[0];

    // Cargar horas guardadas
    if (settings.shiftStart1) shiftStart1 = settings.shiftStart1;
    if (settings.shiftStart2) shiftStart2 = settings.shiftStart2;
    const s1El = document.getElementById('shift-start-1');
    const s2El = document.getElementById('shift-start-2');
    if (s1El) s1El.value = String(shiftStart1).padStart(2, '0') + ':00';
    if (s2El) s2El.value = String(shiftStart2).padStart(2, '0') + ':00';

    // Filtrar ventas por fecha Y por turno
    let daySales = sales.filter(s => s.date.startsWith(selectedDate));

    if (currentCashShift === 'manana') {
        daySales = daySales.filter(s => {
            const hour = new Date(s.date).getHours();
            return hour >= shiftStart1 && hour < shiftStart2;
        });
    } else if (currentCashShift === 'noche') {
        daySales = daySales.filter(s => {
            const hour = new Date(s.date).getHours();
            return hour >= shiftStart2 || hour < shiftStart1;
        });
    }

    const methods = { 'Efectivo': 0, 'Tarjeta': 0, 'Transferencia': 0 };
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
    setText('cash-tarjeta', formatCurrency(methods['Tarjeta']));
    setText('cash-transferencia', formatCurrency(methods['Transferencia']));
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

    // Cachear cálculo de ventas del mes (se invalida con cada venta nueva)
    const monthSales = AppCache.getOrSet('sales_month_total', () => {
        return sales.filter(s => s.date.startsWith(thisMonth)).reduce((sum, s) => sum + s.total, 0);
    }, 30000);

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
    loadCashCloseHistory();
}

// Guardar acta de cierre de caja como registro permanente
async function saveCashCloseRecord() {
    const date = document.getElementById('cash-date').value || new Date().toISOString().split('T')[0];
    const shiftNames = { manana: 'Turno Mañana', noche: 'Turno Noche', todo: 'Todo el día' };
    const shift = shiftNames[currentCashShift] || 'Todo el día';

    const record = {
        id: generateId(),
        date: date,
        shift: currentCashShift,
        shiftName: shift,
        total: document.getElementById('cash-total').textContent,
        profit: document.getElementById('cash-profit').textContent,
        salesCount: document.getElementById('cash-count').textContent,
        units: document.getElementById('cash-units').textContent,
        efectivo: document.getElementById('cash-efectivo').textContent,
        tarjeta: document.getElementById('cash-tarjeta').textContent,
        transferencia: document.getElementById('cash-transferencia').textContent,
        closedBy: sessionStorage.getItem('activeEmployee') || 'Dueño',
        closedAt: new Date().toISOString()
    };

    await firestoreOperation(() => userCollection('cashCloses').doc(record.id).set(record));
    showToast('✅ Acta de cierre guardada', 'success');
    loadCashCloseHistory();
}

async function loadCashCloseHistory() {
    const container = document.getElementById('cash-close-history');
    if (!container || !currentUser) return;

    try {
        const snap = await userCollection('cashCloses').orderBy('closedAt', 'desc').limit(10).get();
        const records = snap.docs.map(doc => doc.data());

        if (records.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = `<h4 style="margin-bottom:12px;">📋 Últimos cierres guardados</h4>` +
            records.map(r => `<div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:12px 16px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                <div>
                    <strong>${new Date(r.date).toLocaleDateString('es-CO')}</strong> — ${esc(r.shiftName)}
                    <div style="font-size:0.8rem;color:var(--text-light);">Cerrado por: ${esc(r.closedBy)} a las ${new Date(r.closedAt).toLocaleTimeString('es-CO', {hour:'2-digit',minute:'2-digit'})}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:700;color:var(--success);">${r.total}</div>
                    <div style="font-size:0.8rem;color:var(--text-light);">${r.salesCount} ventas</div>
                </div>
            </div>`).join('');
    } catch (e) { container.innerHTML = ''; }
}


function printCashClose() {
    const date = document.getElementById('cash-date').value || new Date().toISOString().split('T')[0];
    const shiftNames = { manana: '☀️ TURNO MAÑANA (6am-2pm)', noche: '🌙 TURNO NOCHE (2pm-cierre)', todo: '📊 TODO EL DÍA' };
    const shiftLabel = shiftNames[currentCashShift] || 'Todo el día';
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
            <div class="center">${shiftLabel}</div>
            <div class="center">${new Date(date).toLocaleDateString('es-CO')}</div>
            <hr>
            <div class="row"><span>Ventas:</span><span>${document.getElementById('cash-count').textContent}</span></div>
            <div class="row"><span>Unidades:</span><span>${document.getElementById('cash-units').textContent}</span></div>
            <hr>
            <div class="row"><span>Efectivo:</span><span>${document.getElementById('cash-efectivo').textContent}</span></div>
            <div class="row"><span>Tarjeta:</span><span>${document.getElementById('cash-tarjeta').textContent}</span></div>
            <div class="row"><span>Transferencia:</span><span>${document.getElementById('cash-transferencia').textContent}</span></div>
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
    // Debounce en búsqueda de clientes
    const debouncedRenderClients = debounce(renderClients, 250);
    document.getElementById('client-search').addEventListener('input', debouncedRenderClients);
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
    const deleted = { ...c };
    clients = clients.filter(x => x.id !== id);
    deleteClientFromDB(id);
    renderClients();
    showUndoToast(`Cliente "${c.name}" eliminado`, () => {
        clients.push(deleted);
        saveClient(deleted);
        renderClients();
    });
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

    // Pre-calcular ventas por cliente en un solo pass
    const salesByClient = new Map();
    sales.forEach(s => {
        const clientName = (s.client || '').toLowerCase();
        if (!clientName) return;
        if (!salesByClient.has(clientName)) salesByClient.set(clientName, { count: 0, total: 0 });
        const entry = salesByClient.get(clientName);
        entry.count++;
        entry.total += s.total;
    });

    tbody.innerHTML = list.map(c => {
        const clientData = salesByClient.get(c.name.toLowerCase()) || { count: 0, total: 0 };
        return `<tr>
            <td><strong>${esc(c.name)}</strong></td>
            <td>${esc(c.phone || '-')}</td>
            <td>${esc(c.email || '-')}</td>
            <td>${clientData.count}</td>
            <td class="profit-positive">${formatCurrency(clientData.total)}</td>
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
    // Debounce en búsqueda de proveedores
    const debouncedRenderSuppliers = debounce(renderSuppliers, 250);
    document.getElementById('supplier-search').addEventListener('input', debouncedRenderSuppliers);
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
    const deleted = { ...s };
    suppliers = suppliers.filter(x => x.id !== id);
    deleteSupplierFromDB(id);
    renderSuppliers();
    showUndoToast(`Proveedor "${s.name}" eliminado`, () => {
        suppliers.push(deleted);
        saveSupplier(deleted);
        renderSuppliers();
    });
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
    const deleted = { ...x };
    expenses = expenses.filter(e => e.id !== id);
    deleteExpenseFromDB(id);
    renderExpenses();
    updateDashboardStats();
    showUndoToast(`Gasto "${x.concept}" eliminado`, () => {
        expenses.push(deleted);
        saveExpense(deleted);
        renderExpenses();
        updateDashboardStats();
    });
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

// Hashear PIN con SHA-256 (nunca se guarda en texto plano)
async function hashPin(pin) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin + '_gestionpro_salt');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
function getProduct(id) { return productsIndex.get(id) || products.find(p => p.id === id); }
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
    toast.innerHTML = `<span>${icons[type] || ''}</span><span>${esc(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// ==========================================
// DESHACER ELIMINACIÓN (5 segundos para recuperar)
// ==========================================
let undoData = null;
let undoTimeout = null;

function showUndoToast(message, undoCallback) {
    if (undoTimeout) clearTimeout(undoTimeout);
    const container = document.getElementById('toast-container');
    container.querySelectorAll('.toast-undo').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = 'toast warning toast-undo';
    toast.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 16px;';
    toast.innerHTML = `<span>⚠️ ${esc(message)}</span><button onclick="executeUndo()" style="background:white;color:#d97706;border:none;padding:6px 14px;border-radius:8px;font-weight:700;font-size:0.8rem;cursor:pointer;white-space:nowrap;">↩️ Deshacer</button>`;
    container.appendChild(toast);

    undoData = undoCallback;
    undoTimeout = setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
        undoData = null;
    }, 5000);
}

function executeUndo() {
    if (undoData) {
        undoData();
        undoData = null;
        if (undoTimeout) clearTimeout(undoTimeout);
        document.querySelectorAll('.toast-undo').forEach(t => t.remove());
        showToast('↩️ Acción deshecha', 'success');
    }
}

// Renderizar gráficas al cargar si estamos en dashboard
setTimeout(() => { if (currentUser) { renderCharts(); renderHistory(); } }, 1000);

// ==========================================
// INDICADOR OFFLINE/ONLINE
// ==========================================
// Atajo de teclado: Enter en campo PIN para confirmar
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'sale-quantity') {
        e.preventDefault();
        document.getElementById('sale-form').requestSubmit();
    }
});

function showOfflineIndicator() {
    let indicator = document.getElementById('offline-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'offline-indicator';
        indicator.style.cssText = 'position:fixed;bottom:16px;left:16px;padding:10px 18px;border-radius:10px;font-size:0.85rem;font-weight:700;z-index:9999;transition:all 0.3s;display:flex;align-items:center;gap:8px;';
        document.body.appendChild(indicator);
    }
    return indicator;
}

window.addEventListener('offline', () => {
    const el = showOfflineIndicator();
    el.style.background = '#fef2f2';
    el.style.color = '#dc2626';
    el.style.border = '1px solid #fca5a5';
    el.innerHTML = '📡 Sin conexión — Los datos se guardan localmente';
    el.style.display = 'flex';
});

window.addEventListener('online', () => {
    const el = showOfflineIndicator();
    el.style.background = '#f0fdf4';
    el.style.color = '#16a34a';
    el.style.border = '1px solid #86efac';
    el.innerHTML = '✅ Conectado — Sincronizando datos...';
    el.style.display = 'flex';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
});



// ==========================================
// MÓDULO DE INSUMOS (Materias Primas)
// ==========================================
let editingInsumoId = null;

function initInsumos() {
    document.getElementById('insumo-form').addEventListener('submit', handleInsumoSubmit);
    document.getElementById('btn-cancel-insumo').addEventListener('click', cancelInsumoEdit);
    // Debounce en búsqueda de insumos
    const debouncedRenderInsumos = debounce(renderInsumos, 250);
    document.getElementById('insumo-search').addEventListener('input', debouncedRenderInsumos);
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
    const deleted = { ...i };
    insumos = insumos.filter(x => x.id !== id);
    deleteInsumoFromDB(id);
    renderInsumos();
    showUndoToast(`Insumo "${i.name}" eliminado`, () => {
        insumos.push(deleted);
        saveInsumo(deleted);
        renderInsumos();
    });
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
    await firestoreOperation(() => userCollection('insumos').doc(insumo.id).set(insumo));
}

async function deleteInsumoFromDB(id) {
    await firestoreOperation(() => userCollection('insumos').doc(id).delete());
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

function showNewProductInRecipe() {
    const section = document.getElementById('recipe-new-product');
    section.style.display = section.style.display === 'none' ? 'block' : 'none';
    // Si se muestra el mini-form, quitar selección del select
    if (section.style.display !== 'none') {
        document.getElementById('recipe-product').value = '';
    }
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
    let productId = document.getElementById('recipe-product').value;

    // Si están creando un producto nuevo desde aquí
    const newProductSection = document.getElementById('recipe-new-product');
    if (newProductSection.style.display !== 'none' && !productId) {
        const newName = document.getElementById('recipe-new-name').value.trim();
        const newCategory = document.getElementById('recipe-new-category').value;
        const newPrice = parseFloat(document.getElementById('recipe-new-price').value) || 0;
        const newStock = parseInt(document.getElementById('recipe-new-stock').value) || 50;

        if (!newName) { showToast('Ponle nombre al producto', 'error'); return; }
        if (newPrice <= 0) { showToast('Ingresa el precio de venta', 'error'); return; }

        // Calcular costo con los ingredientes
        const rows = document.querySelectorAll('.ingredient-row');
        let recipeCost = 0;
        rows.forEach(row => {
            const insumoId = row.querySelector('.ing-insumo').value;
            const qty = parseFloat(row.querySelector('.ing-qty').value) || 0;
            if (insumoId && qty > 0) {
                const insumo = insumos.find(i => i.id === insumoId);
                if (insumo) recipeCost += (insumo.purchasePrice / insumo.purchaseQty) * qty;
            }
        });

        // Crear el producto
        const newProduct = {
            id: generateId(),
            name: newName,
            category: newCategory,
            quantity: newStock,
            cost: Math.round(recipeCost * 100) / 100,
            margin: newPrice > 0 && recipeCost > 0 ? Math.round(((newPrice - recipeCost) / recipeCost) * 100) : 30,
            price: newPrice,
            minStock: 5,
            supplier: '',
            description: '',
            image: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        products.push(newProduct);
        saveProduct(newProduct);
        rebuildProductsIndex();
        productId = newProduct.id;
        updateRecipeProductList();
        showToast(`Producto "${newName}" creado`, 'success');
    }

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
    const deleted = { ...r };
    recipes = recipes.filter(x => x.id !== id);
    deleteRecipeFromDB(id);
    renderRecipes();
    showUndoToast(`Receta de "${r.productName}" eliminada`, () => {
        recipes.push(deleted);
        saveRecipe(deleted);
        renderRecipes();
    });
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
    await firestoreOperation(() => userCollection('recipes').doc(recipe.id).set(recipe));
}

async function deleteRecipeFromDB(id) {
    await firestoreOperation(() => userCollection('recipes').doc(id).delete());
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
    // Mostrar link de turno para empleados
    const linkInput = document.getElementById('mesero-link');
    if (linkInput) linkInput.value = window.location.origin + window.location.pathname.replace('index.html', '') + 'turno.html';
    loadMesas();
}

async function loadMesas() {
    try {
        const snap = await userCollection('mesas').get();
        mesasList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderMesasAdmin();
        // Generate menu link and QR
        const menuUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '') + 'menu.html?u=' + currentUser.uid;
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
    mesasList = mesasList.filter(x => x.id !== id);
    userCollection('mesas').doc(id).delete();
    renderMesasAdmin();
    showToast('Mesa eliminada', 'warning');
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
    let prevCount = 0;
    userCollection('orders').onSnapshot((snapshot) => {
        const pendingOrders = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(o => o.status === 'active' || o.status === 'preparing' || o.status === 'ready');
        
        // Sonido si hay pedido nuevo
        if (pendingOrders.length > prevCount && prevCount > 0) {
            playOrderNotification();
        }
        prevCount = pendingOrders.length;
        renderPendingOrders(pendingOrders);
    });
}

function playOrderNotification() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.value = 0.3;
        osc.frequency.value = 660;
        osc.type = 'sine';
        osc.start();
        setTimeout(() => { osc.frequency.value = 880; }, 150);
        setTimeout(() => { gain.gain.value = 0; osc.stop(); ctx.close(); }, 300);
    } catch(e) {}
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
    if (customization.color && customization.color !== '#635bff') {
        root.style.setProperty('--primary', customization.color);
        root.style.setProperty('--primary-dark', adjustColor(customization.color, -20));
        root.style.setProperty('--primary-light', customization.color + '15');
    }

    // Sidebar style
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        const styles = {
            'default': 'linear-gradient(180deg, #0f172a, #1a1f36)',
            'gradient-blue': 'linear-gradient(180deg, #1e3a5f, #0f172a)',
            'gradient-purple': 'linear-gradient(180deg, #4c1d95, #1e1b4b)',
            'gradient-green': 'linear-gradient(180deg, #064e3b, #0f172a)',
            'gradient-dark': 'linear-gradient(180deg, #000000, #1a1f36)',
            'solid-primary': `linear-gradient(180deg, ${customization.color || '#635bff'}, ${adjustColor(customization.color || '#635bff', -40)})`
        };
        const bg = styles[customization.sidebarStyle] || styles['default'];
        sidebar.style.background = bg;
    }

    // Border style
    const radiusMap = { 'rounded': '12px', 'sharp': '4px', 'pill': '20px' };
    const radiusSmMap = { 'rounded': '8px', 'sharp': '2px', 'pill': '14px' };
    root.style.setProperty('--radius', radiusMap[customization.borderStyle] || '12px');
    root.style.setProperty('--radius-sm', radiusSmMap[customization.borderStyle] || '8px');

    // Background style - only override in light mode
    if (document.documentElement.getAttribute('data-theme') !== 'dark') {
        const bgMap = {
            'light': '#f6f8fa',
            'white': '#ffffff',
            'warm': '#faf8f5',
            'cool': '#f4f6fb'
        };
        root.style.setProperty('--bg', bgMap[customization.bgStyle] || '#f6f8fa');
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

    // Slogan - show below business name, NOT in user display
    const sloganEl = document.getElementById('sidebar-slogan');
    if (sloganEl) {
        sloganEl.textContent = customization.slogan || '';
        sloganEl.style.display = customization.slogan ? 'block' : 'none';
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
    // Invalidar caché tras anular venta
    AppCache.invalidateBusinessData();
    renderAll();
    showToast('Venta anulada. Stock restaurado.', 'warning');
}



// ==========================================
// SISTEMA DE ROLES
// ==========================================
// Roles: 'owner' (todo), 'caja' (pedidos, cobrar, cocina, inventario, ventas, caja), 'waiter' (solo tomar pedidos)
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
    if (!pin) { showToast('El PIN es obligatorio', 'error'); return; }

    // Hashear PIN antes de guardar
    hashPin(pin).then(hashedPin => {
        const employee = { id: generateId(), name, email, role, pin: hashedPin, active: true, createdAt: new Date().toISOString() };
        employees.push(employee);
        saveEmployee(employee);
        renderEmployees();
        showToast(`Empleado "${name}" agregado como ${getRoleName(role)}`, 'success');
        e.target.reset();
    });
}

function deleteEmployee(id) {
    const emp = employees.find(e => e.id === id);
    if (!emp) return;
    employees = employees.filter(e => e.id !== id);
    userCollection('employees').doc(id).delete();
    renderEmployees();
    showToast('Empleado eliminado', 'warning');
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
    const names = { owner: '👑 Dueño', caja: '💰 Caja', waiter: '📋 Mesero' };
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
// Aplicar restricciones de rol al menú (usa la función unificada definida arriba)



// ==========================================
// TUTORIAL / ONBOARDING
// ==========================================
function checkOnboarding() {
    // Solo mostrar una vez por perfil
    const activeEmployee = sessionStorage.getItem('activeEmployee') || 'owner';
    const key = 'onboarding_done_' + activeEmployee;
    if (localStorage.getItem(key)) return;
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
        { icon: '🎨', title: '6. Configura tu negocio', text: 'En Ajustes puedes cambiar el nombre de tu negocio, la moneda y la meta de ventas.' },
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
        const activeEmployee = sessionStorage.getItem('activeEmployee') || 'owner';
        localStorage.setItem('onboarding_done_' + activeEmployee, 'true');
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

    // Si es trial, dar acceso completo sin banners ni restricciones
    if (userPlan === 'trial') {
        currentPlan = 'trial';
        applyPlanRestrictions('restaurant');
    } else {
        currentPlan = userPlan;
        applyPlanRestrictions(currentPlan);
    }

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

// ==========================================
// PRODUCTOS DE PRUEBA (con fotos y descripciones)
// ==========================================
async function loadDemoProducts() {

    const demoProducts = [
        {
            name: 'Hamburguesa Clásica',
            category: 'Alimentos',
            quantity: 50,
            cost: 8000,
            margin: 50,
            price: 12000,
            minStock: 5,
            supplier: '',
            description: 'Carne 150g, lechuga, tomate, cebolla, salsa especial, pan artesanal',
            image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop'
        },
        {
            name: 'Pizza Margarita',
            category: 'Alimentos',
            quantity: 30,
            cost: 10000,
            margin: 60,
            price: 16000,
            minStock: 5,
            supplier: '',
            description: 'Masa artesanal, salsa de tomate italiano, mozzarella fresca, albahaca',
            image: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400&h=300&fit=crop'
        },
        {
            name: 'Tacos al Pastor',
            category: 'Alimentos',
            quantity: 80,
            cost: 3000,
            margin: 65,
            price: 5000,
            minStock: 10,
            supplier: '',
            description: '3 tacos con carne al pastor, piña, cilantro, cebolla y salsa verde',
            image: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400&h=300&fit=crop'
        },
        {
            name: 'Ensalada César',
            category: 'Alimentos',
            quantity: 25,
            cost: 6000,
            margin: 55,
            price: 9500,
            minStock: 5,
            supplier: '',
            description: 'Lechuga romana, pollo grillado, crutones, parmesano, aderezo césar',
            image: 'https://images.unsplash.com/photo-1546793665-c74683f339c1?w=400&h=300&fit=crop'
        },
        {
            name: 'Limonada Natural',
            category: 'Alimentos',
            quantity: 100,
            cost: 1500,
            margin: 100,
            price: 3000,
            minStock: 10,
            supplier: '',
            description: 'Limón fresco exprimido, agua, hielo, endulzada al gusto',
            image: 'https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=400&h=300&fit=crop'
        },
        {
            name: 'Café Latte',
            category: 'Alimentos',
            quantity: 60,
            cost: 2000,
            margin: 75,
            price: 3500,
            minStock: 10,
            supplier: '',
            description: 'Espresso doble con leche vaporizada y arte latte',
            image: 'https://images.unsplash.com/photo-1534778101976-62847782c213?w=400&h=300&fit=crop'
        },
        {
            name: 'Brownie con Helado',
            category: 'Alimentos',
            quantity: 20,
            cost: 4000,
            margin: 62,
            price: 6500,
            minStock: 5,
            supplier: '',
            description: 'Brownie de chocolate caliente con helado de vainilla y salsa de chocolate',
            image: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=400&h=300&fit=crop'
        },
        {
            name: 'Alitas BBQ',
            category: 'Alimentos',
            quantity: 40,
            cost: 7000,
            margin: 57,
            price: 11000,
            minStock: 5,
            supplier: '',
            description: '8 alitas crujientes bañadas en salsa BBQ ahumada, con palitos de apio',
            image: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=400&h=300&fit=crop'
        }
    ];

    showAppLoading(true);
    let count = 0;
    for (const p of demoProducts) {
        const product = {
            ...p,
            id: generateId(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        products.push(product);
        await saveProduct(product);
        count++;
    }
    rebuildProductsIndex();
    renderAll();
    showAppLoading(false);
    showToast(`✅ ${count} productos de prueba cargados con fotos`, 'success');
}


// ==========================================
// ABRIR PANTALLAS EXTERNAS CON ROL
// ==========================================
function openCocina() {
    sessionStorage.setItem('activeRole', 'owner');
    window.open('cocina.html', '_blank');
}

function openMesero() {
    sessionStorage.setItem('activeRole', 'owner');
    window.open('mesero.html', '_blank');
}

function openTurno() {
    window.location.href = 'turno.html';
}
