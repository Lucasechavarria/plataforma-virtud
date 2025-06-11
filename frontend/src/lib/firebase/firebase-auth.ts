import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  AuthError,
  UserCredential
} from "firebase/auth";
import { auth } from "./config";

const provider = new GoogleAuthProvider();

// Configuración adicional del proveedor Google
provider.setCustomParameters({
  prompt: "select_account"
});

/**
 * Inicia sesión con Google
 * @returns Promise con el usuario o null en caso de error
 */
export const signInWithGoogle = async (): Promise<User | null> => {
  try {
    const result: UserCredential = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    handleAuthError(error as AuthError);
    return null;
  }
};

/**
 * Inicia sesión con email y contraseña
 * @param email 
 * @param password 
 * @returns Promise con el usuario o null en caso de error
 */
export const signInWithEmail = async (
  email: string,
  password: string
): Promise<User | null> => {
  try {
    const result: UserCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );
    return result.user;
  } catch (error) {
    handleAuthError(error as AuthError);
    return null;
  }
};

/**
 * Crea un usuario con email y contraseña
 * @param email 
 * @param password 
 * @returns Promise con el usuario o null en caso de error
 */
export const createUser = async (
  email: string,
  password: string
): Promise<User | null> => {
  try {
    const result: UserCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );
    return result.user;
  } catch (error) {
    handleAuthError(error as AuthError);
    return null;
  }
};

/**
 * Cierra la sesión actual
 * @returns Promise<void>
 */
export const logout = async (): Promise<void> => {
  try {
    await signOut(auth);
  } catch (error) {
    handleAuthError(error as AuthError);
  }
};

/**
 * Observador del estado de autenticación
 * @param callback Función a ejecutar cuando cambie el estado
 * @returns Función para desuscribirse
 */
export const onAuthStateChange = (
  callback: (user: User | null) => void
) => {
  return onAuthStateChanged(auth, callback);
};

/**
 * Maneja errores de autenticación
 * @param error Error de Firebase Auth
 */
const handleAuthError = (error: AuthError): void => {
  console.error("Auth Error:", error.code, error.message);
  
  // Puedes agregar lógica adicional basada en el código de error
  switch (error.code) {
    case "auth/user-not-found":
      console.warn("Usuario no registrado");
      break;
    case "auth/wrong-password":
      console.warn("Contraseña incorrecta");
      break;
    case "auth/too-many-requests":
      console.warn("Demasiados intentos. Cuenta temporalmente bloqueada");
      break;
    default:
      console.warn("Error de autenticación");
  }
};

// Exporta la instancia de auth por si se necesita directamente
export { auth };