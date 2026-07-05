// ==========================================
// CONFIGURACIÓN DE FIREBASE
// ==========================================
// INSTRUCCIONES:
// 1. Ve a https://console.firebase.google.com/
// 2. Crea un nuevo proyecto (o usa uno existente)
// 3. Ve a Configuración del proyecto > General
// 4. En "Tus apps", haz clic en el ícono de Web (</>)
// 5. Registra tu app y copia los valores aquí abajo
// 6. Activa Authentication (Email/Password y Google) en la consola
// 7. Activa Firestore Database en la consola
// ==========================================

const firebaseConfig = {
    apiKey: "AIzaSyAg0d_g_l0wqSB3o2SThdcCQnZvA0II03Y",
    authDomain: "gestionpro-d74ed.firebaseapp.com",
    projectId: "gestionpro-d74ed",
    storageBucket: "gestionpro-d74ed.firebasestorage.app",
    messagingSenderId: "1040016256559",
    appId: "1:1040016256559:web:c8aed7e87018ac103e60da",
    measurementId: "G-6J00VWLGZD"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// Referencias globales
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Configurar persistencia de Firestore (datos offline)
db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
    if (err.code === 'failed-precondition') {
        console.warn('Firestore: Múltiples pestañas abiertas, persistencia solo en una.');
    } else if (err.code === 'unimplemented') {
        console.warn('Firestore: Persistencia no soportada en este navegador.');
    }
});
