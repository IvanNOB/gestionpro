# 🔥 Guía de Configuración - Firebase + GestiónPro

Esta guía te lleva paso a paso para subir GestiónPro a la web con sistema de login.

## 📋 Requisitos Previos

- Una cuenta de Google (para Firebase)
- Node.js instalado (para el CLI de Firebase) — descárgalo en https://nodejs.org

---

## Paso 1: Crear Proyecto en Firebase

1. Ve a **https://console.firebase.google.com/**
2. Haz clic en **"Agregar proyecto"**
3. Ponle nombre (ej: `gestionpro`)
4. Puedes desactivar Google Analytics si quieres (no es necesario)
5. Haz clic en **"Crear proyecto"**

---

## Paso 2: Registrar tu App Web

1. En la página principal del proyecto, haz clic en el ícono **Web** (`</>`)
2. Ponle un apodo (ej: `GestiónPro Web`)
3. Marca la casilla **"Configurar Firebase Hosting"**
4. Haz clic en **"Registrar app"**
5. Te mostrará un código con `firebaseConfig` — **copia esos valores**

---

## Paso 3: Pegar tu Configuración

Abre el archivo `firebase-config.js` y reemplaza los valores de ejemplo:

```javascript
const firebaseConfig = {
    apiKey: "AIzaSyD...",           // Tu API Key real
    authDomain: "tu-proyecto.firebaseapp.com",
    projectId: "tu-proyecto",
    storageBucket: "tu-proyecto.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abc123"
};
```

---

## Paso 4: Activar Authentication

1. En la consola de Firebase, ve a **Build > Authentication**
2. Haz clic en **"Comenzar"**
3. En la pestaña **"Sign-in method"**, activa:
   - **Correo electrónico/Contraseña** ✅
   - **Google** ✅ (opcional pero recomendado)

---

## Paso 5: Crear Base de Datos Firestore

1. Ve a **Build > Firestore Database**
2. Haz clic en **"Crear base de datos"**
3. Selecciona la ubicación más cercana a tus clientes
4. Selecciona **"Empezar en modo de producción"**
5. Haz clic en **"Crear"**

### Reglas de seguridad (importante)

Ve a la pestaña **"Reglas"** en Firestore y pega esto:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Cada usuario solo puede leer/escribir sus propios datos
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      match /{subcollection}/{document} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

Haz clic en **"Publicar"**.

---

## Paso 6: Subir a la Web (Deploy)

### Opción A: Firebase Hosting (recomendado)

1. Abre una terminal/CMD
2. Instala Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```
3. Inicia sesión:
   ```bash
   firebase login
   ```
4. Ve a la carpeta de tu proyecto:
   ```bash
   cd ruta/a/gestionpro
   ```
5. Inicializa Firebase Hosting:
   ```bash
   firebase init hosting
   ```
   - Selecciona tu proyecto
   - Directorio público: `.` (punto, la carpeta actual)
   - Single-page app: **No**
   - Sobreescribir index.html: **No**

6. Sube tu app:
   ```bash
   firebase deploy
   ```

7. ¡Listo! Te dará una URL como: `https://tu-proyecto.web.app`

### Opción B: Netlify (alternativa más fácil)

1. Ve a **https://app.netlify.com/**
2. Arrastra toda la carpeta del proyecto al área de deploy
3. ¡Listo! Te da una URL automáticamente

### Opción C: GitHub Pages + dominio

1. Sube tu código a GitHub
2. Ve a Settings > Pages > Source: main branch
3. Tu app estará en `https://tu-usuario.github.io/gestionpro`

---

## Paso 7: Probar

1. Abre la URL de tu app
2. Deberías ver la pantalla de login
3. Crea una cuenta nueva
4. ¡Ya puedes usar GestiónPro en la nube!

---

## 💰 Costos

Firebase tiene un **plan gratuito (Spark)** muy generoso:
- **Auth:** 10,000 usuarios/mes gratis
- **Firestore:** 1 GB almacenamiento + 50,000 lecturas/día gratis
- **Hosting:** 10 GB transferencia/mes gratis

Para un negocio pequeño con pocos clientes, es completamente **GRATIS**.

---

## 🔒 Seguridad

- Cada usuario solo ve sus propios datos (las reglas de Firestore lo garantizan)
- Las contraseñas las maneja Firebase (encriptadas, seguras)
- Los datos viajan por HTTPS (encriptados)
- Firebase se encarga de la seguridad del servidor

---

## 📱 Dominio Personalizado (opcional)

Si quieres una URL bonita como `www.gestionpro.com`:
1. Compra un dominio (ej: Namecheap, GoDaddy, Google Domains)
2. En Firebase Hosting > "Agregar dominio personalizado"
3. Sigue las instrucciones para verificar el dominio

---

## 🆘 Problemas Comunes

| Problema | Solución |
|----------|----------|
| "auth/operation-not-allowed" | Activa el método de login en Firebase Console |
| "Missing or insufficient permissions" | Revisa las reglas de Firestore (Paso 5) |
| La app no carga | Verifica que firebase-config.js tenga los valores correctos |
| Google login no funciona | Agrega tu dominio en Authentication > Settings > Authorized domains |
