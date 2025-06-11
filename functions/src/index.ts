import * as admin from "firebase-admin";

// Importar funciones de Firestore de V2
import {
  onDocumentCreated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import { HttpsError } from "firebase-functions/v2/https";


admin.initializeApp(); // Inicializa el SDK de Admin para interactuar con Firestore

const db = admin.firestore(); // Obtén la instancia de Firestore

// --- Función: reservarActividad (para Actividades Grupales) ---
export const reservarActividad = onDocumentCreated(
  "reservas/{reservaId}", // Ruta del documento
  async (event) => {
    // onDocumentCreated recibe un 'event' que contiene los datos del snapshot
    const snapshot = event.data;

    if (!snapshot) {
      console.error("No snapshot data found for onCreate event.");
      return;
    }

    const nuevaReserva = snapshot.data();
    const actividadId = nuevaReserva.actividadId;
    const fechaActividad = nuevaReserva.fechaActividad; // Timestamp de la instancia de la clase
    const cupoTomado = nuevaReserva.cupoTomado || 1; // Por defecto 1 cupo

    if (!actividadId || !fechaActividad) {
      console.error("Datos incompletos para la reserva:", nuevaReserva);
      // Podrías eliminar el documento si no tiene datos válidos
      await snapshot.ref.delete();
      return;
    }

    const actividadRef = db.collection("actividades").doc(actividadId);

    // Usa una transacción para asegurar la atomicidad en la verificación y actualización del cupo
    try {
      await db.runTransaction(async (transaction) => {
        const actividadDoc = await transaction.get(actividadRef);

        if (!actividadDoc.exists) {
          // Si la actividad no existe, lanza un error HTTP
          throw new HttpsError(
            "not-found",
            `La actividad con ID ${actividadId} no existe.`
          );
        }

        const actividadData = actividadDoc.data();
        const cupoMaximo = actividadData?.cupo || 0; // Cupo definido en el documento de actividad

        // Consulta todas las reservas para esta actividad y fecha/hora específica
        const reservasSnapshot = await transaction.get(
          db
            .collection("reservas")
            .where("actividadId", "==", actividadId)
            .where("fechaActividad", "==", fechaActividad)
            // Considerar estados de reserva (ej. solo confirmadas/pendientes)
            .where("estado", "in", ["confirmada", "pendiente"])
        );

        let cupoOcupado = 0;
        reservasSnapshot.forEach((doc) => {
          // No sumes la reserva actual si ya fue creada (onCreate trigger)
          if (doc.id !== snapshot.id) {
            cupoOcupado += doc.data().cupoTomado || 1;
          }
        });

        const cupoDisponible = cupoMaximo - cupoOcupado;

        // Validar si hay cupo suficiente
        if (cupoDisponible < cupoTomado) {
          // Si no hay cupo, lanzamos un error que aborta la transacción
          throw new HttpsError(
            "resource-exhausted", // Error HTTP para recursos agotados
            `No hay cupos disponibles para la actividad ${actividadData?.nombre} el ${fechaActividad.toDate().toLocaleString()}. Cupo actual: ${cupoDisponible}.`
          );
        }

        // Si hay cupo, la transacción continuará y la reserva se habrá creado exitosamente.
        // Solo para logs:
        console.log(
          `Reserva ${snapshot.id} para ${actividadData?.nombre} el ${fechaActividad.toDate().toLocaleString()} confirmada. Cupo restante: ${cupoDisponible - cupoTomado}.`
        );
      });
    } catch (error: any) { // Captura el error para manejarlo
      if (error instanceof HttpsError) {
        console.error("Error al procesar la reserva (transacción):", error.code, error.message);
        // El documento de reserva ya se creó. Lo marcamos como fallido/cancelado.
        await snapshot.ref.update({ estado: "fallida", motivoFalla: error.message });
      } else {
        console.error("Error inesperado en la transacción de reserva:", error);
        await snapshot.ref.update({ estado: "fallida", motivoFalla: "Error interno del servidor." });
      }
    }
  }
);


// --- Función: reservarTurno (para Terapias Individuales) ---
export const reservarTurno = onDocumentCreated(
  "turnos/{turnoId}",
  async (event) => {
    const snapshot = event.data;

    if (!snapshot) {
      console.error("No snapshot data found for onCreate event.");
      return;
    }

    const nuevoTurno = snapshot.data();
    const terapiaId = nuevoTurno.terapiaId;
    const fechaTurno = nuevoTurno.fechaTurno; // Timestamp de inicio del turno
    const usuarioId = nuevoTurno.usuarioId;

    if (!terapiaId || !fechaTurno || !usuarioId) {
      console.error("Datos incompletos para el turno:", nuevoTurno);
      await snapshot.ref.delete();
      return;
    }

    const terapiaRef = db.collection("terapias").doc(terapiaId);

    try {
      await db.runTransaction(async (transaction) => {
        const terapiaDoc = await transaction.get(terapiaRef);

        if (!terapiaDoc.exists) {
          throw new HttpsError(
            "not-found",
            `La terapia con ID ${terapiaId} no existe.`
          );
        }

        const terapiaData = terapiaDoc.data();
        const duracionTerapia = terapiaData?.duracionMinutos || 0;
        const profesionalId = terapiaData?.profesionalId;

        if (!profesionalId) {
          throw new HttpsError(
            "failed-precondition",
            `La terapia ${terapiaData?.nombre} no tiene un profesional asignado.`
          );
        }

        // Calcula el fin del turno actual
        const finTurnoActual = new admin.firestore.Timestamp(
          fechaTurno.seconds + duracionTerapia * 60,
          fechaTurno.nanoseconds
        );

        // Consulta si el profesional ya tiene turnos solapados
        // Se buscan turnos del mismo profesional y que su rango de tiempo se solape con el nuevo turno.
        // La condición de solapamiento es: (InicioA < FinB) AND (FinA > InicioB)
        const solapamientosSnapshot = await transaction.get(
          db
            .collection("turnos")
            .where("estado", "in", ["confirmado", "pendiente"]) // Solo turnos activos
            // La consulta de solapamiento idealmente sería:
            // .where("profesionalId", "==", profesionalId) // Si se guarda profesionalId en el turno
            // Pero como no lo tenemos en el turno, buscaremos más amplio y filtramos después.
            .where("fechaTurno", "<=", finTurnoActual) // Turnos que empiezan antes o en el fin del nuevo
        );

        let solapamientoEncontrado = false;
        for (const doc of solapamientosSnapshot.docs) { // Usamos for...of para poder usar await dentro
          if (doc.id === snapshot.id) { // Si es el documento que se está creando, lo ignoramos
            continue;
          }

          const existingTurno = doc.data();
          const existingFechaTurno = existingTurno.fechaTurno as admin.firestore.Timestamp;

          // Hay que obtener la duración de la terapia del turno existente.
          // OBTENIENDO LA TERAPIA ASOCIADA AL TURNO EXISTENTE
          const existingTerapiaRef = db.collection("terapias").doc(existingTurno.terapiaId);
          const existingTerapiaDoc = await transaction.get(existingTerapiaRef);
          const existingTerapiaData = existingTerapiaDoc.data();
          const existingDuracion = existingTerapiaData?.duracionMinutos || 0;

          // Si el terapeuta del turno existente no es el mismo que el del nuevo turno, no hay solapamiento de profesional
          if (existingTerapiaData?.profesionalId !== profesionalId) {
              continue;
          }

          const existingFinTurno = new admin.firestore.Timestamp(
            existingFechaTurno.seconds + existingDuracion * 60,
            existingFechaTurno.nanoseconds
          );

          // Chequeo de solapamiento: [fechaTurno, finTurnoActual] vs [existingFechaTurno, existingFinTurno]
          if (
            (fechaTurno.seconds < existingFinTurno.seconds) && // El nuevo turno empieza antes de que el existente termine
            (finTurnoActual.seconds > existingFechaTurno.seconds) // El nuevo turno termina después de que el existente empiece
          ) {
            solapamientoEncontrado = true;
            break; // Salir del bucle for...of
          }
        }

        if (solapamientoEncontrado) {
          throw new HttpsError(
            "already-exists",
            `El terapeuta ya tiene un turno reservado para esa franja horaria.`
          );
        }

        // Si no hay solapamientos, el turno se crea.
        console.log(`Turno ${snapshot.id} de ${terapiaData?.nombre} para ${usuarioId} a las ${fechaTurno.toDate().toLocaleString()} confirmado.`);
      });
    } catch (error: any) {
      if (error instanceof HttpsError) {
        console.error("Error al procesar el turno (transacción):", error.code, error.message);
        await snapshot.ref.update({ estado: "fallida", motivoFalla: error.message });
      } else {
        console.error("Error inesperado en la transacción de turno:", error);
        await snapshot.ref.update({ estado: "fallida", motivoFalla: "Error interno del servidor." });
      }
    }
  }
);


// --- Función: procesarSuspension ---
export const procesarSuspension = onDocumentWritten(
  "suspensiones/{suspensionId}",
  async (event) => {
    // 'suspensionAntes' se declara y se obtiene, pero si no se usa, TypeScript puede advertir.
    // Lo removemos para evitar la advertencia si no se usa explícitamente en la lógica siguiente.
    // const suspensionAntes = event.data?.before?.data(); // <--- COMENTADO: Si no se usa, se elimina

    const suspensionDespues = event.data?.after?.data();

    // Si el documento se eliminó, no hay nada que procesar aquí (podrías reactivar si quieres)
    if (!event.data?.after.exists) {
      console.log(`Suspensión ${event.params.suspensionId} eliminada. No se procesan cancelaciones.`);
      return null;
    }

    // Solo procesar si se está creando o actualizando y afecta reservas existentes
    if (!suspensionDespues || !suspensionDespues.afectaReservasExistentes) {
      return null;
    }

    const { tipo, actividadId, profesorId, fechaInicio, fechaFin, motivo } = suspensionDespues;

    console.log(`Procesando suspensión tipo: ${tipo} desde ${fechaInicio.toDate()} hasta ${fechaFin.toDate()} por motivo: ${motivo}`);

    // ----- Cancelar Reservas de Actividades Grupales -----
    let reservasQuery: admin.firestore.Query = db.collection("reservas")
      .where("fechaActividad", ">=", fechaInicio)
      .where("fechaActividad", "<=", fechaFin)
      .where("estado", "==", "confirmada"); // Solo cancelar confirmadas

    if (tipo === "actividad" && actividadId) {
      reservasQuery = reservasQuery.where("actividadId", "==", actividadId);
    }
    // Si tipo es 'profesor', esto requeriría una lógica más compleja:
    // 1. Obtener todas las actividades asociadas a ese profesor (si tuvieran 'profesorId' en su documento).
    // 2. Luego buscar reservas para esas actividades. Esto puede requerir múltiples consultas o Cloud Functions adicionales.
    // Por simplicidad, no se implementa aquí la lógica de 'profesor' para reservas.

    const reservasSnapshot = await reservasQuery.get();
    const batchReservas = db.batch(); // Usamos un batch para actualizar múltiples documentos de forma atómica

    reservasSnapshot.forEach((doc) => {
      batchReservas.update(doc.ref, {
        estado: "cancelado_por_admin",
        motivoCancelacion: motivo,
        fechaCancelacion: admin.firestore.FieldValue.serverTimestamp(),
      });
      // Lógica para enviar una notificación (email/push) al usuario de esta reserva cancelada
      console.log(`Reserva ${doc.id} (actividad ${doc.data().actividadId}) cancelada.`);
    });

    await batchReservas.commit();
    console.log(`Procesadas ${reservasSnapshot.size} reservas de actividades.`);


    // ----- Cancelar Turnos Individuales de Terapias -----
    let turnosQuery: admin.firestore.Query = db.collection("turnos")
      .where("fechaTurno", ">=", fechaInicio)
      .where("fechaTurno", "<=", fechaFin)
      .where("estado", "==", "confirmado");

    if (tipo === "profesor" && profesorId) {
      // Para turnos, el profesional está en el documento de terapia.
      // Se requiere una consulta compleja:
      // 1. Obtener todas las terapias asociadas a este profesionalId.
      const terapiasDeProfesor = await db.collection("terapias")
        .where("profesionalId", "==", profesorId)
        .get();
      const terapiaIdsAfectadas = terapiasDeProfesor.docs.map(doc => doc.id);

      // 2. Filtrar turnos solo por estas terapias (Firestore no permite 'IN' con más de 10 elementos)
      // Si la lista de terapiaIdsAfectadas es grande, necesitarás dividir la consulta.
      if (terapiaIdsAfectadas.length > 0) {
        turnosQuery = turnosQuery.where("terapiaId", "in", terapiaIdsAfectadas);
      } else {
        // No hay terapias para este profesor, así que no hay turnos que cancelar.
        console.log(`No hay terapias asociadas al profesor ${profesorId} en el rango, no se cancelan turnos.`);
        return null; // Salir aquí si no hay terapias afectadas
      }
    } else if (tipo === "actividad" && actividadId) { // Si una suspensión es por una terapia específica
      // Asumiendo que 'actividadId' en este contexto se refiere a 'terapiaId'
      turnosQuery = turnosQuery.where("terapiaId", "==", actividadId);
    }

    const turnosSnapshot = await turnosQuery.get();
    const batchTurnos = db.batch();

    turnosSnapshot.forEach((doc) => {
      batchTurnos.update(doc.ref, {
        estado: "cancelado_por_admin",
        motivoCancelacion: motivo,
        fechaCancelacion: admin.firestore.FieldValue.serverTimestamp(),
      });
      // Lógica de notificación para el usuario del turno
      console.log(`Turno ${doc.id} (terapia ${doc.data().terapiaId}) cancelado.`);
    });

    await batchTurnos.commit();
    console.log(`Procesados ${turnosSnapshot.size} turnos de terapias.`);

    return null;
  }
);
