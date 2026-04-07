/**
 * ============================================================
 * PLANIT — modules/router.js
 * Router ligero — evita dependencia circular entre
 * main.js y las vistas.
 *
 * Las vistas importan navegarA desde aquí, no desde main.js.
 * main.js registra el handler real con setNavigator().
 * ============================================================
 */

let _navegarFn = null;

/**
 * Registrado UNA vez desde main.js al arrancar.
 * @param {Function} fn
 */
export function setNavigator(fn) {
  _navegarFn = fn;
}

/**
 * Usado por las vistas para navegar. 
 * Solo cambia el hash; dejamos que el listener global en main.js 
 * se encargue de detectar el cambio y renderizar la vista.
 * * @param {string} ruta - Ej: "/tareas" o "tareas"
 */
// modules/router.js — REEMPLAZAR la función navegarA completa

export async function navegarA(ruta) {
  const rutaFormateada = ruta.startsWith('/') ? ruta : `/${ruta}`;
  
  // Llamar DIRECTO al navigator registrado por main.js
  // NO tocar window.location.hash aquí — eso dispararía hashchange
  // y causaría un segundo render duplicado
  if (_navegarFn) {
    await _navegarFn(rutaFormateada);
    // Actualizar el hash DESPUÉS del render, silenciosamente
    history.replaceState(null, '', `#${rutaFormateada}`);
  }
}// ─── Helpers de fecha seguros (sin timezone bugs) ─────────────

/**
 * Devuelve la fecha de hoy como string "YYYY-MM-DD" en hora LOCAL.
 * NUNCA usar new Date().toISOString() para esto — eso usa UTC
 * y en Bolivia (UTC-4) da el día anterior después de las 20:00.
 *
 * @returns {string} ej. "2026-04-05"
 */
export function hoyISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

/**
 * Suma o resta días a una fecha ISO string sin que el timezone
 * interfiera. Trabaja puramente con números de calendario.
 *
 * @param {string} fechaISO  - "YYYY-MM-DD"
 * @param {number} dias      - Positivo = adelante, negativo = atrás
 * @returns {string}         - "YYYY-MM-DD"
 */
export function sumarDias(fechaISO, dias) {
  // Parsear como fecha LOCAL (mediodía evita cualquier ambigüedad de DST)
  const [y, m, d] = fechaISO.split('-').map(Number);
  const fecha = new Date(y, m - 1, d + dias); // mes es 0-indexed en JS
  const yy  = fecha.getFullYear();
  const mm  = String(fecha.getMonth() + 1).padStart(2, '0');
  const dd  = String(fecha.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Convierte una fecha ISO string a objeto Date LOCAL (mediodía).
 * Útil cuando una vista necesita un Date para formatear.
 * NO usar new Date("YYYY-MM-DD") directamente — eso asume UTC.
 *
 * @param {string} fechaISO - "YYYY-MM-DD"
 * @returns {Date}
 */
export function isoADate(fechaISO) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0); // mediodía local
}

/**
 * Estado global compartido.
 * fechaActiva es SIEMPRE un string "YYYY-MM-DD" (hora local).
 * Nunca guardar un objeto Date aquí — causa bugs de timezone.
 */
export const app = {
  db:          null,
  categorias:  [],
  fechaActiva: hoyISO(), // string "YYYY-MM-DD", nunca Date
  vistaActual: null,
};