/**
 * ============================================================
 * PLANIT — notifications.js
 * Sistema de notificaciones: sonido + Web Push + alarmas
 * ============================================================
 *
 * Responsabilidades:
 *   1. Pulsar Chime — sonido de confirmación con Web Audio API
 *   2. Solicitar permiso de notificaciones push al usuario
 *   3. Mostrar notificaciones nativas del sistema operativo
 *   4. Programar alarmas para el próximo evento del día
 *   5. Cancelar alarmas cuando el usuario edita/elimina un evento
 *
 * Este módulo NO toca IndexedDB directamente.
 * Recibe los datos que necesita como parámetros.
 * ============================================================
 */

import { obtenerProximoEvento } from './scheduler.js';
import { mostrarToast }         from './ui.js';

// ─── Estado interno ───────────────────────────────────────────

/**
 * Contexto de Web Audio API — singleton.
 * Se crea la primera vez que se reproduce un sonido
 * (los navegadores requieren que sea después de un gesto del usuario).
 * @type {AudioContext|null}
 */
let _audioCtx = null;

/**
 * ID del setTimeout activo para la próxima alarma.
 * Guardamos la referencia para poder cancelarlo si el evento cambia.
 * @type {number|null}
 */
let _alarmaTimeout = null;

// ─── Web Audio API — Pulsar Chime ─────────────────────────────

/**
 * Obtiene (o crea) el AudioContext singleton.
 * Debe llamarse solo después de un gesto del usuario
 * (click, tap) — restricción impuesta por los navegadores.
 *
 * @returns {AudioContext}
 */
function obtenerAudioCtx() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Reanudar si estaba suspendido (política de autoplay del navegador)
  if (_audioCtx.state === 'suspended') {
    _audioCtx.resume();
  }
  return _audioCtx;
}

/**
 * Reproduce el Pulsar Chime — señal de confirmación de PLANIT.
 *
 * Arquitectura del sonido (3 osciladores encadenados):
 *
 *   OSC 1 — Tono principal ascendente (sine, 880→1320 Hz)
 *     El "cuerpo" del chime. Sube medio tono en 120ms,
 *     luego decae exponencialmente en ~550ms.
 *     Sensación: "confirmado, avanza".
 *
 *   OSC 2 — Armónico superior (sine, 1760→2200 Hz)
 *     Entra 40ms después del principal.
 *     Añade el brillo metálico que lo diferencia de un beep.
 *     Amplitud muy baja (0.07) para no dominar.
 *
 *   OSC 3 — Cola de reverb (triangle, 660→440 Hz)
 *     Entra a los 100ms y dura ~800ms.
 *     El triángulo tiene armónicos impares que dan calidez.
 *     Desciende suavemente — es el "eco" que se desvanece.
 *
 * Resultado: "un pulso sónico breve y ascendente,
 * como el eco de un radar limpio".
 *
 * @param {number} [volumen=1.0] - 0.0 a 1.0
 */
export function reproducirChime(volumen = 1.0) {
  if (!window.AudioContext && !window.webkitAudioContext) {
    console.warn('[PLANIT] Web Audio API no disponible en este navegador');
    return;
  }

  const ctx = obtenerAudioCtx();
  const ahora = ctx.currentTime;

  // ── Oscilador 1: tono principal ──────────────────────────────
  const osc1  = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.connect(gain1);
  gain1.connect(ctx.destination);

  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(880, ahora);
  osc1.frequency.linearRampToValueAtTime(1320, ahora + 0.12);

  gain1.gain.setValueAtTime(0, ahora);
  gain1.gain.linearRampToValueAtTime(0.18 * volumen, ahora + 0.02);
  gain1.gain.exponentialRampToValueAtTime(0.001, ahora + 0.55);

  osc1.start(ahora);
  osc1.stop(ahora + 0.6);

  // ── Oscilador 2: armónico superior ───────────────────────────
  const osc2  = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.connect(gain2);
  gain2.connect(ctx.destination);

  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(1760, ahora + 0.04);
  osc2.frequency.linearRampToValueAtTime(2200, ahora + 0.15);

  gain2.gain.setValueAtTime(0, ahora + 0.04);
  gain2.gain.linearRampToValueAtTime(0.07 * volumen, ahora + 0.07);
  gain2.gain.exponentialRampToValueAtTime(0.001, ahora + 0.45);

  osc2.start(ahora + 0.04);
  osc2.stop(ahora + 0.5);

  // ── Oscilador 3: cola de reverb ───────────────────────────────
  const osc3  = ctx.createOscillator();
  const gain3 = ctx.createGain();
  osc3.connect(gain3);
  gain3.connect(ctx.destination);

  osc3.type = 'triangle';
  osc3.frequency.setValueAtTime(660, ahora + 0.1);
  osc3.frequency.exponentialRampToValueAtTime(440, ahora + 0.7);

  gain3.gain.setValueAtTime(0, ahora + 0.1);
  gain3.gain.linearRampToValueAtTime(0.05 * volumen, ahora + 0.15);
  gain3.gain.exponentialRampToValueAtTime(0.001, ahora + 0.8);

  osc3.start(ahora + 0.1);
  osc3.stop(ahora + 0.85);
}

/**
 * Sonido de error — versión descendente del chime.
 * Misma textura, dirección opuesta: transmite "algo falló".
 *
 * @param {number} [volumen=0.8]
 */
export function reproducirError(volumen = 0.8) {
  if (!window.AudioContext && !window.webkitAudioContext) return;

  const ctx   = obtenerAudioCtx();
  const ahora = ctx.currentTime;

  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'sine';
  osc.frequency.setValueAtTime(660, ahora);
  osc.frequency.linearRampToValueAtTime(330, ahora + 0.25);

  gain.gain.setValueAtTime(0, ahora);
  gain.gain.linearRampToValueAtTime(0.15 * volumen, ahora + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, ahora + 0.4);

  osc.start(ahora);
  osc.stop(ahora + 0.45);
}

// ─── Notificaciones del sistema ───────────────────────────────

/**
 * Solicita permiso para mostrar notificaciones nativas.
 * Debe llamarse después de un gesto del usuario (ej. al activar
 * las notificaciones en ajustes de la app).
 *
 * @returns {Promise<'granted'|'denied'|'default'>}
 */
export async function solicitarPermisoNotificaciones() {
  if (!('Notification' in window)) {
    console.warn('[PLANIT] Notifications API no disponible');
    return 'denied';
  }

  if (Notification.permission === 'granted') return 'granted';

  const permiso = await Notification.requestPermission();
  console.log('[PLANIT] Permiso de notificaciones:', permiso);
  return permiso;
}

/**
 * Muestra una notificación nativa del sistema operativo.
 * Si el Service Worker está activo, las notificaciones llegan
 * incluso con la pestaña en segundo plano.
 *
 * @param {string} titulo
 * @param {object} [opciones]
 * @param {string}   [opciones.cuerpo]       - texto de la notificación
 * @param {string}   [opciones.icono]        - ruta al ícono
 * @param {string}   [opciones.etiqueta]     - agrupa notificaciones del mismo evento
 * @param {object}   [opciones.datos]        - datos extra para el click handler
 * @param {boolean}  [opciones.conSonido]    - reproducir Pulsar Chime también
 */
export async function mostrarNotificacion(titulo, opciones = {}) {
  const {
    cuerpo    = '',
    icono     = '/assets/img/icons/icon-192.png',
    etiqueta  = 'planit-evento',
    datos     = {},
    conSonido = true,
  } = opciones;

  if (conSonido) reproducirChime(0.7);

  // Intentar usar el Service Worker para notificaciones en background
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    const registro = await navigator.serviceWorker.ready;
    await registro.showNotification(titulo, {
      body:  cuerpo,
      icon:  icono,
      tag:   etiqueta,
      data:  datos,
      badge: '/assets/img/icons/icon-192.png',
    });
    return;
  }

  // Fallback: Notification API directa (solo funciona con pestaña activa)
  if (Notification.permission === 'granted') {
    new Notification(titulo, { body: cuerpo, icon: icono, tag: etiqueta });
  }
}

// ─── Sistema de alarmas ───────────────────────────────────────

/**
 * Programa una alarma para el próximo evento del día.
 * Cancela cualquier alarma previa antes de programar la nueva.
 *
 * Llámalo:
 *   - Al arrancar la app (desde main.js)
 *   - Después de crear o editar un evento
 *   - Después de eliminar un evento
 *
 * @param {IDBDatabase} db
 * @param {number}      [minutosAntes=5] - aviso N minutos antes del evento
 */
export async function programarProximaAlarma(db, minutosAntes = 5) {
  cancelarAlarma(); // Limpiar la alarma anterior si existe

  const evento = await obtenerProximoEvento(db);
  if (!evento) {
    console.log('[PLANIT] No hay próximos eventos hoy para alarmar');
    return;
  }

  const ahora         = Date.now();
  const inicioEvento  = new Date(evento.fecha_inicio).getTime();
  const momentoAlarma = inicioEvento - (minutosAntes * 60 * 1000);
  const msHastaAlarma = momentoAlarma - ahora;

  // Si el evento ya empezó o está muy próximo (< 30 segundos), omitir
  if (msHastaAlarma < 30 * 1000) {
    console.log('[PLANIT] El próximo evento está demasiado cerca, alarma omitida');
    return;
  }

  console.log(
    `[PLANIT] Alarma programada para "${evento.titulo}" ` +
    `en ${Math.round(msHastaAlarma / 60000)} minutos`
  );

  _alarmaTimeout = setTimeout(async () => {
    await mostrarNotificacion(
      `En ${minutosAntes} min: ${evento.titulo}`,
      {
        cuerpo:   `${evento.fecha_inicio.slice(11, 16)} – ${evento.fecha_fin.slice(11, 16)}`,
        etiqueta: `alarma-${evento.id}`,
        datos:    { eventoId: evento.id, ruta: '/agenda' },
        conSonido: true,
      }
    );

    // Mostrar también el toast en la app (por si está en primer plano)
    mostrarToast(`En ${minutosAntes} min: ${evento.titulo}`, 'aviso', 8000);

    // Reprogramar para el siguiente evento del día
    await programarProximaAlarma(db, minutosAntes);

  }, msHastaAlarma);
}

/**
 * Cancela la alarma activa (si existe).
 * Se llama automáticamente antes de programar una nueva,
 * y también cuando el usuario desactiva las notificaciones.
 */
export function cancelarAlarma() {
  if (_alarmaTimeout !== null) {
    clearTimeout(_alarmaTimeout);
    _alarmaTimeout = null;
  }
}

/**
 * Inicializa el sistema de notificaciones completo.
 * Llamar desde main.js después de abrirDB().
 *
 * Flujo:
 *   1. Verificar si ya tiene permiso (no preguntar de nuevo)
 *   2. Si tiene permiso, programar la alarma del próximo evento
 *   3. Si no tiene permiso, esperar a que el usuario lo active
 *      en ajustes (no preguntar automáticamente al cargar)
 *
 * @param {IDBDatabase} db
 */
export async function inicializarNotificaciones(db) {
  if (!('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    await programarProximaAlarma(db);
    console.log('[PLANIT] Sistema de notificaciones inicializado');
  } else {
    console.log('[PLANIT] Notificaciones pendientes de permiso del usuario');
  }
}