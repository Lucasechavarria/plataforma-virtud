import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  AuthError
} from "firebase/auth";
// Ahora importamos 'db' directamente de la configuración
import { auth, db } from "./config";
// Importar funciones de Firestore para interactuar con la base de datos
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
// Asumiendo que logError espera un string como segundo argumento
import { logEvent, logError } from "@/services/analytics";

const provider = new GoogleAuthProvider();
provider.setCustomParameters({
  prompt: "select_account",
  login_hint: ""
});

interface AuthResponse {
  success: boolean;
  user?: User; // Objeto User de Firebase Authentication
  firestoreUser?: any; // Objeto de documento de usuario de Firestore
  error?: string;
  code?: string;
  provider?: string;
}

const errorMessages: Record<string, string> = {
  "auth/invalid-email": "Email inválido",
  "auth/user-disabled": "Cuenta deshabilitada",
  "auth/user-not-found": "Usuario no registrado",
  "auth/wrong-password": "Credenciales incorrectas",
  "auth/email-already-in-use": "El email ya está registrado",
  "auth/operation-not-allowed": "Método no permitido",
  "auth/weak-password": "La contraseña debe tener al menos 6 caracteres",
  "auth/too-many-requests": "Demasiados intentos. Intente más tarde",
  "auth/network-request-failed": "Error de conexión",
  "auth/popup-closed-by-user": "El popup de autenticación fue cerrado",
  "auth/cancelled-popup-request": "Solicitud de autenticación cancelada"
};

// Se corrige handleAuthError para pasar 'context' como string
const handleAuthError = (error: AuthError, context: string): AuthResponse => {
  const errorCode = error.code as keyof typeof errorMessages;
  const message = errorMessages[errorCode] || error.message;

  // Se pasa 'context' directamente como string
  logError(error, context);

  return {
    success: false,
    error: message,
    code: error.code
  };
};

/**
 * Función auxiliar para crear o actualizar el documento de usuario en Firestore.
 * Si es un nuevo usuario, lo crea con datos iniciales y un tipo por defecto.
 * Si ya existe, actualiza el timestamp de último acceso.
 * @param user El objeto User de Firebase Auth.
 * @param isNewUser Si es true, crea el documento con datos iniciales. Si es false, actualiza metadatos.
 * @param initialData Datos iniciales a fusionar si es un nuevo usuario.
 * @returns El documento del usuario de Firestore (data()).
 */
const createUserDocument = async (user: User, isNewUser: boolean, initialData?: { nombre?: string, telefono?: string, edad?: number, tipo?: string, responsableDePago?: string | null, usuariosACargo?: string[] }) => {
    const userDocRef = doc(db, "usuarios", user.uid);
    let firestoreUserDoc = null;

    if (isNewUser) {
        // Crear el documento con datos iniciales y el tipo por defecto
        await setDoc(userDocRef, {
            dni: "", // Puedes dejarlo vacío para que el usuario lo complete después
            nombre: initialData?.nombre || user.displayName || user.email?.split('@')[0] || '',
            telefono: initialData?.telefono || '',
            fechaNacimiento: null, // Puedes solicitarla después
            tipo: initialData?.tipo || "socio", // Asigna 'socio' por defecto
            email: user.email || '',
            uid: user.uid,
            metadata: {
                fechaCreacion: serverTimestamp(),
                ultimoAcceso: serverTimestamp(),
                dispositivo: "web"
            },
            responsableDePago: initialData?.responsableDePago || null,
            usuariosACargo: initialData?.usuariosACargo || []
        }, { merge: true }); // Usamos merge para evitar sobrescribir si por alguna razón el doc ya existía (ej. al usar popups)
        firestoreUserDoc = (await getDoc(userDocRef)).data();
        logEvent("firestore_user_created", { uid: user.uid, type: firestoreUserDoc?.tipo });

    } else {
        // Si el usuario ya existía en Auth, solo actualizamos el metadata
        await updateDoc(userDocRef, {
            "metadata.ultimoAcceso": serverTimestamp()
        });
        firestoreUserDoc = (await getDoc(userDocRef)).data(); // Obtenemos el documento completo
    }
    return firestoreUserDoc;
};

export const signInWithGoogle = async (): Promise<AuthResponse> => {
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    const email = user.email || 'unknown';
    const providerId = user.providerData[0]?.providerId || 'google';

    // Verificar si el documento del usuario ya existe en Firestore
    const userDocRef = doc(db, "usuarios", user.uid);
    const userDocSnap = await getDoc(userDocRef);

    const isNewUser = !userDocSnap.exists();
    const firestoreUser = await createUserDocument(user, isNewUser, { tipo: "socio" }); // Asume 'socio' por defecto para nuevos registros Google

    logEvent("login", {
      method: "google",
      email,
      provider: providerId
    });

    return {
      success: true,
      user: user,
      firestoreUser: firestoreUser, // Incluye el documento de Firestore
      provider: providerId
    };
  } catch (error) {
    return handleAuthError(error as AuthError, "google_signin");
  }
};

export const signInWithEmail = async (
  email: string,
  password: string
): Promise<AuthResponse> => {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    const user = result.user;

    // Al iniciar sesión, solo actualizamos el metadata y cargamos el documento de Firestore
    const firestoreUser = await createUserDocument(user, false); // No es un nuevo usuario en Auth, solo actualiza Firestore metadata

    logEvent("login", {
      method: "email",
      email,
      provider: "password"
    });
    return {
      success: true,
      user: user,
      firestoreUser: firestoreUser, // Incluye el documento de Firestore
      provider: "email"
    };
  } catch (error) {
    return handleAuthError(error as AuthError, "email_signin");
  }
};

export const createUser = async (
  email: string,
  password: string,
  nombre: string, // Añadir nombre como parámetro para el registro
  telefono: string, // Añadir telefono
  edad: number // Añadir edad
): Promise<AuthResponse> => {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    const user = result.user;

    // Crear el documento de usuario en Firestore inmediatamente después del registro
    const firestoreUser = await createUserDocument(user, true, {
        nombre: nombre,
        telefono: telefono,
        edad: edad,
        tipo: "socio" // Asigna 'socio' por defecto al registrarse
    });

    logEvent("signup", {
      method: "email",
      email,
      provider: "password"
    });
    return {
      success: true,
      user: user,
      firestoreUser: firestoreUser, // Incluye el documento de Firestore
      provider: "email"
    };
  } catch (error) {
    return handleAuthError(error as AuthError, "email_signup");
  }
};

export const logout = async (): Promise<AuthResponse> => {
  try {
    await signOut(auth);
    logEvent("logout");
    return { success: true };
  } catch (error) {
    return handleAuthError(error as AuthError, "logout");
  }
};

// Esta función se mantiene igual, pero la interfaz de tu aplicación necesitará usar firestoreUser
export const onAuthStateChange = (
  callback: (user: User | null, firestoreUser: any | null) => void // Callback ahora recibe también el doc de Firestore
) => {
  return onAuthStateChanged(auth, async (user) => {
    let firestoreUserDoc: any | null = null;
    if (user) {
      // Si hay un usuario Auth, cargar su documento de Firestore
      const userDocRef = doc(db, "usuarios", user.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        firestoreUserDoc = userDocSnap.data();
      } else {
        // Caso excepcional: usuario Auth existe pero no hay documento en Firestore
        // Podría pasar si se borró manualmente el doc, o en flujos complejos.
        // Aquí puedes decidir si crear uno (con un tipo por defecto) o forzar al usuario a completar perfil.
        console.warn("User authenticated but no Firestore document found for UID:", user.uid);
        // Opcional: Podrías crear el documento aquí con un tipo 'pendiente' o 'sin_perfil'
        // firestoreUserDoc = await createUserDocument(user, true, { tipo: "pendiente" });
      }

      logEvent("auth_state_changed", {
        logged_in: true,
        email: user.email,
        provider: user.providerData[0]?.providerId,
        user_type: firestoreUserDoc?.tipo || "unknown" // Agregamos el tipo de usuario al log
      });
    } else {
      logEvent("auth_state_changed", { logged_in: false });
    }
    callback(user, firestoreUserDoc); // Pasa ambos objetos al callback
  });
};

export const getCurrentUser = (): Promise<{ authUser: User | null; firestoreUser: any | null }> => {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe(); // Desuscribirse después de la primera llamada
      let firestoreUserDoc: any | null = null;
      if (user) {
        const userDocRef = doc(db, "usuarios", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          firestoreUserDoc = userDocSnap.data();
        } else {
           console.warn("getCurrentUser: User authenticated but no Firestore document found for UID:", user.uid);
        }
      }
      resolve({ authUser: user, firestoreUser: firestoreUserDoc });
    });
  });
};

export { auth };

