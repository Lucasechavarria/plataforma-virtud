import { analytics } from "@/lib/firebase/config";
import { logEvent as firebaseLogEvent } from "firebase/analytics";

// Inicialización condicional para SSR
export const initAnalytics = () => {
  if (!analytics) {
    console.warn('Analytics no disponible en entorno server-side');
    return null;
  }
  return analytics;
};

// Registro de eventos
export const logEvent = (
  eventName: string, 
  eventParams?: Record<string, any>
) => {
  if (!analytics) {
    console.warn('No se puede registrar evento - Analytics no inicializado');
    return;
  }
  
  try {
    firebaseLogEvent(analytics, eventName, eventParams);
  } catch (error) {
    console.error('Error al registrar evento:', error);
  }
};

// Registro de errores mejorado
export const logError = (
  error: unknown,
  context?: string,
  additionalData?: Record<string, any>
) => {
  const errorData = {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    context,
    ...additionalData,
    timestamp: new Date().toISOString()
  };

  console.error('⚠️ Error:', errorData);
  
  // Solo registrar en producción
  if (process.env.NODE_ENV === 'production') {
    logEvent('error_occurred', errorData);
  }
};

// Eventos predefinidos
export const events = {
  LOGIN: 'login',
  LOGOUT: 'logout',
  PAGE_VIEW: 'page_view',
  ERROR: 'error_occurred'
};