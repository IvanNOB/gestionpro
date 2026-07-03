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
    apiKey: "TU_API_KEY_AQUI",
    authDomain: "TU_PROYECTO.firebaseapp.com",
    projectId: "TU_PROJECT_ID",
    storageBucket: "TU_PROYECTO.appspot.com",
    messagingSenderId: "TU_SENDER_ID",
    appId: "TU_APP_ID"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// Referencias globales
const auth = firebase.auth();
const db = firebase.firestore();

// Configurar persistencia de Firestore (datos offline)
db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
    if (err.code === 'failed-precondition') {
        console.warn('Firestore: Múltiples pestañas abiertas, persistencia solo en una.');
    } else if (err.code === 'unimplemented') {
        console.warn('Firestore: Persistencia no soportada en este navegador.');
    }
});
