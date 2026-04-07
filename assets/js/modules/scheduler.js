/**
 * ============================================================
 * PLANIT — scheduler.js
 * Motor de recurrencia y generación de eventos virtuales
 * ============================================================
 *
 * Responsabilidades:
 *   1. Convertir materias de HorarioU en eventos virtuales
 *      para una semana o un rango de fechas dado
 *   2. Calcular la distribución de tiempo por categoría
 *      (datos para el Weekly Flow Dial)
 *   3. Detectar conflictos de horario (dos eventos que se solapan)
 *   4. Calcular el próximo evento del día (para notificaciones)
 *
 * Concepto clave — "eventos virtuales":
 *   Las materias universitarias se guardan UNA sola vez en
 *   IndexedDB con su array de días recurrentes. Este módulo
 *   las "expande" en memoria para cualquier rango de fechas
 *   sin escribir nada en disco. El resultado son objetos con
 *   la misma forma que un Evento real, pero con virtual: true.
 *   Las vistas los renderizan igual que cualquier otro evento.
 * ============================================================
 */

import { Eventos, HorarioU, Categorias } from './db.js';

// ─── Constantes ───────────────────────────────────────────────

/**
 * Mapa de nombre de día a índice JS (getDay()).
 * getDay() devuelve: 0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb
 */
const DIA_A_INDEX = {
  'DOM': 0,
  'LUN': 1,
  'MAR': 2,
  'MIÉ': 3,
  'JUE': 4,
  'VIE': 5,
  'SÁB': 6,
};

// ─── Generación de eventos virtuales ─────────────────────────

/**
 * Expande las materias activas del HorarioU en eventos virtuales
 * para todos los días del rango [desde, hasta].
 *
 * Ejemplo:
 *   Materia: "Cálculo II", dias: ["LUN","MIÉ","VIE"], hora: "08:00-10:00"
 *   Rango: semana del 6 al 12 de abril 2026
 *   Resultado: 3 eventos virtuales (lunes 6, miércoles 8, viernes 10)
 *
 * @param {IDBDatabase} db
 * @param {Date}        desde  - Inicio del rango (inclusive)
 * @param {Date}        hasta  - Fin del rango (inclusive)
 * @returns {Promise<object[]>} - Array de eventos virtuales
 */
export async function generarEventosHorarioU(db, desde, hasta) {
  // Obtener solo las materias del semestre activo
  const materias = await HorarioU.obtenerActivas(db);
  if (materias.length === 0) return [];

  const eventosVirtuales = [];

  // Iterar cada día del rango
  const cursor = new Date(desde);
  cursor.setHours(0, 0, 0, 0);

  const finRango = new Date(hasta);
  finRango.setHours(23, 59, 59, 999);

  while (cursor <= finRango) {
    const diaSemana = cursor.getDay(); // 0-6

    for (const materia of materias) {
      // Verificar si la materia ocurre en este día de la semana
      const diasMateria = materia.dias.map((d) => DIA_A_INDEX[d.toUpperCase()]);
      if (!diasMateria.includes(diaSemana)) continue;

      // Construir las fechas ISO de inicio y fin del evento virtual
      const [hInicio, mInicio] = materia.hora_inicio.split(':').map(Number);
      const [hFin,    mFin   ] = materia.hora_fin.split(':').map(Number);

      const fechaInicio = new Date(cursor);
      fechaInicio.setHours(hInicio, mInicio, 0, 0);

      const fechaFin = new Date(cursor);
      fechaFin.setHours(hFin, mFin, 0, 0);

      // El evento virtual tiene la misma forma que un Evento real.
      // La propiedad `virtual: true` y `horario_u_id` permiten
      // distinguirlo si la UI necesita tratarlo diferente
      // (ej. no mostrar botón "eliminar", sino "editar materia").
      eventosVirtuales.push({
        id:           `virtual-${materia.id}-${cursor.toISOString().slice(0, 10)}`,
        titulo:       materia.materia,
        fecha_inicio: fechaInicio.toISOString(),
        fecha_fin:    fechaFin.toISOString(),
        categoria_id: materia.categoria_id || null,
        proyecto_id:  null,
        color:        materia.color || null,
        notas:        materia.aula ? `Aula: ${materia.aula}` : null,
        virtual:      true,          // ← NO es un evento real en IndexedDB
        horario_u_id: materia.id,    // ← referencia a la materia original
      });
    }

    // Avanzar al siguiente día
    cursor.setDate(cursor.getDate() + 1);
  }

  return eventosVirtuales;
}

/**
 * Devuelve todos los eventos (reales + virtuales) de un día.
 * Es la función que las vistas deben usar para obtener
 * el contenido de un día, no llamar a Eventos.obtenerPorDia()
 * directamente (que no incluye el horario universitario).
 *
 * @param {IDBDatabase} db
 * @param {Date|string} fecha - Date o string ISO "YYYY-MM-DD"
 * @returns {Promise<object[]>} - Mezclados y ordenados por hora
 */
export async function obtenerEventosDia(db, fecha) {
  const fechaObj = fecha instanceof Date ? fecha : new Date(fecha);
  const fechaISO = fechaObj.toISOString().slice(0, 10);

  // Eventos reales guardados en IndexedDB
  const reales = await Eventos.obtenerPorDia(db, fechaISO);

  // Eventos virtuales generados desde el horario universitario
  const virtuales = await generarEventosHorarioU(db, fechaObj, fechaObj);

  // Mezclar y ordenar cronológicamente
  return [...reales, ...virtuales].sort((a, b) =>
    a.fecha_inicio.localeCompare(b.fecha_inicio)
  );
}

/**
 * Devuelve todos los eventos (reales + virtuales) de una semana.
 * La vista de semana y el Weekly Flow Dial usan esta función.
 *
 * @param {IDBDatabase} db
 * @param {Date}        fechaEnLaSemana - Cualquier día de la semana
 * @returns {Promise<object[]>}
 */
export async function obtenerEventosSemana(db, fechaEnLaSemana) {
  const { lunes, domingo } = obtenerRangoSemana(fechaEnLaSemana);

  const reales    = await Eventos.obtenerPorRango(db,
    lunes.toISOString().slice(0, 10),
    domingo.toISOString().slice(0, 10)
  );
  const virtuales = await generarEventosHorarioU(db, lunes, domingo);

  return [...reales, ...virtuales].sort((a, b) =>
    a.fecha_inicio.localeCompare(b.fecha_inicio)
  );
}

// ─── Weekly Flow Dial ─────────────────────────────────────────

/**
 * Calcula la distribución de tiempo por categoría para una semana.
 * Devuelve los datos que el componente del Dial necesita para
 * dibujar los arcos del gráfico circular.
 *
 * @param {IDBDatabase} db
 * @param {Date}        fechaEnLaSemana
 * @returns {Promise<Array<{categoria, minutos, porcentaje, color}>>}
 *
 * Ejemplo de resultado:
 * [
 *   { categoria: 'Trabajo',   minutos: 1260, porcentaje: 55, color: '#00ffc8' },
 *   { categoria: 'Proyectos', minutos:  480, porcentaje: 21, color: '#b060ff' },
 *   { categoria: 'Personal',  minutos:  360, porcentaje: 16, color: '#7de06e' },
 *   { categoria: 'Descanso',  minutos:  180, porcentaje:  8, color: '#f0b429' },
 * ]
 */
export async function calcularFlowDial(db, fechaEnLaSemana) {
  const [categorias, eventosSemana] = await Promise.all([
    Categorias.obtenerTodas(db),
    obtenerEventosSemana(db, fechaEnLaSemana),
  ]);

  // Acumular minutos por categoria_id
  const minutosPorCategoria = {};

  for (const evento of eventosSemana) {
    if (!evento.categoria_id) continue;

    const inicio   = new Date(evento.fecha_inicio);
    const fin      = new Date(evento.fecha_fin);
    const minutos  = (fin - inicio) / (1000 * 60); // ms → minutos

    if (minutos <= 0) continue; // ignorar eventos mal formados

    minutosPorCategoria[evento.categoria_id] =
      (minutosPorCategoria[evento.categoria_id] || 0) + minutos;
  }

  // Calcular total para los porcentajes
  const totalMinutos = Object.values(minutosPorCategoria)
    .reduce((sum, m) => sum + m, 0);

  if (totalMinutos === 0) return [];

  // Construir el array de resultado enriquecido con datos de categoría
  return categorias
    .filter((cat) => minutosPorCategoria[cat.id])
    .map((cat) => ({
      categoria:   cat.nombre,
      color:       cat.color,
      minutos:     Math.round(minutosPorCategoria[cat.id]),
      porcentaje:  Math.round((minutosPorCategoria[cat.id] / totalMinutos) * 100),
    }))
    .sort((a, b) => b.minutos - a.minutos); // de mayor a menor
}

// ─── Detección de conflictos ──────────────────────────────────

/**
 * Detecta si un evento nuevo se solapa con eventos existentes.
 * Útil para avisar al usuario antes de guardar.
 *
 * Dos eventos se solapan si: inicioA < finB Y finA > inicioB
 *
 * @param {IDBDatabase} db
 * @param {string}      fechaInicio  - ISO string del nuevo evento
 * @param {string}      fechaFin     - ISO string del nuevo evento
 * @param {string|null} idExcluir    - ID a excluir (para edición)
 * @returns {Promise<object[]>}      - Eventos que se solapan
 */
export async function detectarConflictos(db, fechaInicio, fechaFin, idExcluir = null) {
  const fechaISO   = fechaInicio.slice(0, 10);
  const eventosDia = await obtenerEventosDia(db, fechaISO);

  const inicioNuevo = new Date(fechaInicio).getTime();
  const finNuevo    = new Date(fechaFin).getTime();

  return eventosDia.filter((evento) => {
    if (evento.id === idExcluir) return false; // ignorar el propio evento al editar

    const inicioExistente = new Date(evento.fecha_inicio).getTime();
    const finExistente    = new Date(evento.fecha_fin).getTime();

    // Condición de solapamiento
    return inicioNuevo < finExistente && finNuevo > inicioExistente;
  });
}

// ─── Próximo evento ───────────────────────────────────────────

/**
 * Devuelve el próximo evento del día a partir de ahora.
 * Lo usa notifications.js para programar la alarma del siguiente evento.
 *
 * @param {IDBDatabase} db
 * @returns {Promise<object|null>}
 */
export async function obtenerProximoEvento(db) {
  const ahora      = new Date();
  const eventosDia = await obtenerEventosDia(db, ahora);

  // Filtrar eventos que aún no han empezado
  const proximos = eventosDia.filter(
    (e) => new Date(e.fecha_inicio) > ahora
  );

  // El más cercano es el primero (ya están ordenados)
  return proximos[0] || null;
}

// ─── Helpers de fechas ────────────────────────────────────────

/**
 * Calcula el lunes y domingo de la semana que contiene `fecha`.
 * La semana empieza en lunes (estándar europeo/latinoamericano).
 *
 * @param {Date} fecha
 * @returns {{ lunes: Date, domingo: Date }}
 */
export function obtenerRangoSemana(fecha) {
  const d       = new Date(fecha);
  const diaSem  = d.getDay(); // 0=Dom ... 6=Sáb
  // Ajuste para que lunes sea el día 0 (en JS domingo = 0)
  const diffLunes = diaSem === 0 ? -6 : 1 - diaSem;

  const lunes = new Date(d);
  lunes.setDate(d.getDate() + diffLunes);
  lunes.setHours(0, 0, 0, 0);

  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  domingo.setHours(23, 59, 59, 999);

  return { lunes, domingo };
}

/**
 * Formatea una fecha como string legible en español.
 * Centraliza el formato para que todas las vistas muestren
 * las fechas de la misma manera.
 *
 * @param {Date|string} fecha
 * @param {'corto'|'largo'|'hora'|'dia-mes'} formato
 * @returns {string}
 *
 * Ejemplos:
 *   formatearFecha(new Date(), 'largo')    → "viernes, 4 de abril de 2026"
 *   formatearFecha(new Date(), 'corto')    → "4 abr"
 *   formatearFecha(new Date(), 'hora')     → "09:00"
 *   formatearFecha(new Date(), 'dia-mes')  → "4 de abril"
 */
export function formatearFecha(fecha, formato = 'corto') {
  const d = fecha instanceof Date ? fecha : new Date(fecha);

  const opciones = {
    largo:    { weekday: 'long',  day: 'numeric', month: 'long',  year: 'numeric' },
    corto:    { day: 'numeric',   month: 'short' },
    hora:     { hour: '2-digit',  minute: '2-digit', hour12: false },
    'dia-mes':{ day: 'numeric',   month: 'long' },
  };

  return d.toLocaleDateString('es-BO', opciones[formato] || opciones.corto);
}

/**
 * Calcula la duración entre dos fechas ISO y la devuelve
 * como string legible: "1h 30min", "45min", "2h".
 *
 * @param {string} inicioISO
 * @param {string} finISO
 * @returns {string}
 */
export function formatearDuracion(inicioISO, finISO) {
  const minutos = (new Date(finISO) - new Date(inicioISO)) / (1000 * 60);
  if (minutos <= 0) return '—';

  const horas = Math.floor(minutos / 60);
  const mins  = Math.round(minutos % 60);

  if (horas === 0)  return `${mins}min`;
  if (mins  === 0)  return `${horas}h`;
  return `${horas}h ${mins}min`;
}