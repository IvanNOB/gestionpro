// ==========================================
// AUTENTICACIÓN - GestiónPro
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    initAuthForms();
    checkAuthState();
});

// ==========================================
// VERIFICAR ESTADO DE SESIÓN
// ==========================================
function checkAuthState() {
    showLoading(true);
    auth.onAuthStateChanged((user) => {
        showLoading(false);
        if (user) {
            // Usuario logueado, redirigir a la app
            window.location.href = 'index.html';
        }
    });
}

// ==========================================
// INICIALIZAR FORMULARIOS
// ==========================================
function initAuthForms() {
    // Navegación entre formularios
    document.getElementById('show-register').addEventListener('click', (e) => {
        e.preventDefault();
        showForm('register-form');
    });
    document.getElementById('show-login').addEventListener('click', (e) => {
        e.preventDefault();
        showForm('login-form');
    });
    document.getElementById('show-reset').addEventListener('click', (e) => {
        e.preventDefault();
        showForm('reset-form');
    });
    document.getElementById('show-login-from-reset').addEventListener('click', (e) => {
        e.preventDefault();
        showForm('login-form');
    });

    // Formulario de Login
    document.getElementById('login-form').addEventListener('submit', handleLogin);

    // Formulario de Registro
    document.getElementById('register-form').addEventListener('submit', handleRegister);

    // Formulario de Reset
    document.getElementById('reset-form').addEventListener('submit', handleReset);

    // Google Login
    document.getElementById('btn-google-login').addEventListener('click', handleGoogleAuth);
    document.getElementById('btn-google-register').addEventListener('click', handleGoogleAuth);
}

// ==========================================
// LOGIN CON EMAIL/PASSWORD
// ==========================================
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
        showMessage('Completa todos los campos', 'error');
        return;
    }

    showLoading(true);
    try {
        await auth.signInWithEmailAndPassword(email, password);
        showMessage('¡Bienvenido de vuelta!', 'success');
        // La redirección la maneja onAuthStateChanged
    } catch (error) {
        showMessage(getErrorMessage(error.code), 'error');
    } finally {
        showLoading(false);
    }
}

// ==========================================
// REGISTRO CON EMAIL/PASSWORD
// ==========================================
async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const passwordConfirm = document.getElementById('register-password-confirm').value;

    if (!name || !email || !password) {
        showMessage('Completa todos los campos', 'error');
        return;
    }
    if (password !== passwordConfirm) {
        showMessage('Las contraseñas no coinciden', 'error');
        return;
    }
    if (password.length < 6) {
        showMessage('La contraseña debe tener al menos 6 caracteres', 'error');
        return;
    }

    showLoading(true);
    try {
        // Crear usuario
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // Actualizar nombre
        await user.updateProfile({ displayName: name });

        // Crear documento del usuario en Firestore
        await db.collection('users').doc(user.uid).set({
            businessName: name,
            email: email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            plan: 'free',
            settings: {
                businessName: name,
                currency: 'COP',
                defaultTax: 19,
                defaultMargin: 30,
                theme: 'light',
                monthlyGoal: 0
            }
        });

        showMessage('¡Cuenta creada exitosamente!', 'success');
        // La redirección la maneja onAuthStateChanged
    } catch (error) {
        showMessage(getErrorMessage(error.code), 'error');
    } finally {
        showLoading(false);
    }
}

// ==========================================
// LOGIN CON GOOGLE
// ==========================================
async function handleGoogleAuth() {
    const provider = new firebase.auth.GoogleAuthProvider();
    showLoading(true);

    try {
        const result = await auth.signInWithPopup(provider);
        const user = result.user;

        // Verificar si es usuario nuevo
        if (result.additionalUserInfo && result.additionalUserInfo.isNewUser) {
            // Crear documento del usuario en Firestore
            await db.collection('users').doc(user.uid).set({
                businessName: user.displayName || 'Mi Negocio',
                email: user.email,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                plan: 'free',
                settings: {
                    businessName: user.displayName || 'Mi Negocio',
                    currency: 'COP',
                    defaultTax: 19,
                    defaultMargin: 30,
                    theme: 'light',
                    monthlyGoal: 0
                }
            });
        }

        showMessage('¡Bienvenido!', 'success');
    } catch (error) {
        if (error.code !== 'auth/popup-closed-by-user') {
            showMessage(getErrorMessage(error.code), 'error');
        }
    } finally {
        showLoading(false);
    }
}

// ==========================================
// RESET DE CONTRASEÑA
// ==========================================
async function handleReset(e) {
    e.preventDefault();
    const email = document.getElementById('reset-email').value.trim();

    if (!email) {
        showMessage('Ingresa tu correo electrónico', 'error');
        return;
    }

    showLoading(true);
    try {
        await auth.sendPasswordResetEmail(email);
        showMessage('¡Correo enviado! Revisa tu bandeja de entrada (y spam).', 'success');
        setTimeout(() => showForm('login-form'), 3000);
    } catch (error) {
        showMessage(getErrorMessage(error.code), 'error');
    } finally {
        showLoading(false);
    }
}

// ==========================================
// UTILIDADES DE UI
// ==========================================
function showForm(formId) {
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    document.getElementById(formId).classList.add('active');
    hideMessage();
}

function showMessage(text, type) {
    const el = document.getElementById('auth-message');
    el.textContent = text;
    el.className = `auth-message ${type}`;
    el.style.display = 'block';
    // Auto-ocultar después de 5 segundos
    setTimeout(() => hideMessage(), 5000);
}

function hideMessage() {
    const el = document.getElementById('auth-message');
    el.style.display = 'none';
}

function showLoading(show) {
    document.getElementById('auth-loading').style.display = show ? 'flex' : 'none';
}

// ==========================================
// MENSAJES DE ERROR EN ESPAÑOL
// ==========================================
function getErrorMessage(code) {
    const messages = {
        'auth/email-already-in-use': 'Este correo ya está registrado. Intenta iniciar sesión.',
        'auth/invalid-email': 'El correo electrónico no es válido.',
        'auth/user-disabled': 'Esta cuenta ha sido deshabilitada.',
        'auth/user-not-found': 'No existe una cuenta con este correo.',
        'auth/wrong-password': 'Contraseña incorrecta.',
        'auth/weak-password': 'La contraseña es muy débil (mínimo 6 caracteres).',
        'auth/too-many-requests': 'Demasiados intentos. Espera un momento e intenta de nuevo.',
        'auth/network-request-failed': 'Error de conexión. Verifica tu internet.',
        'auth/popup-closed-by-user': 'Se cerró la ventana de Google.',
        'auth/operation-not-allowed': 'Este método de inicio de sesión no está habilitado.',
        'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    };
    return messages[code] || `Error: ${code}`;
}
