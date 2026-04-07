/**
 * ============================================================
 * PLANIT — views/agenda.js
 * Vista de agenda diaria (línea de tiempo vertical)
 * ============================================================
 *
 * Muestra todos los eventos y materias universitarias
 * del día activo en una línea de tiempo cronológica.
 *
 * Estructura de la vista:
 *   ┌─────────────────────────────────┐
 *   │ Viernes, 4 de abril · ← Hoy →  │  ← header
 *   ├─────────────────────────────────┤
 *   │ 09:00 ──────────────────────── │  ← separador de hora
 *   │ [████ Reunión Proyecto · Trab] │  ← bloque evento
 *   │ [░░░░ Cálculo II · U]          │  ← bloque virtual
 *   │ 13:00 ──────────────────────── │
 *   │ [████ Almuerzo · Personal]     │
 *   └─────────────────────────────────┘
 *
 * Exporta: render(app, contenedor)
 * ============================================================
 */

import { obtenerEventosDia } from '../modules/scheduler.js';
import { formatearFecha }    from '../modules/scheduler.js';
import {
  mostrarSkeleton,
  crearBloqueEvento,
  crearEstadoVacio,
  abrirModal,
  mostrarToast,
} from '../modules/ui.js';
import { Eventos } from '../modules/db.js';
import { navegarA, app as appGlobal, hoyISO, sumarDias, isoADate } from '../modules/router.js';
import { crearPanelResumenIA } from '../modules/resumen-ia.js';
import { crearBloqueExamen } from '../modules/modo-examen.js';
import { verificarAlerta24h } from '../modules/modo-examen.js';


// ─── Render principal ─────────────────────────────────────────

/**
 * Punto de entrada de la vista. Llamado por main.js
 * cada vez que el usuario navega a '#/agenda'.
 *
 * @param {object}      app        - Estado global (db, categorias, fechaActiva)
 * @param {HTMLElement} contenedor - #planit-vista
 */
export async function render(app, contenedor) {
  // Mostrar skeleton mientras se cargan los datos
  mostrarSkeleton(contenedor, 'agenda');

  // Actualizar la fecha en el header global
  actualizarFechaHeader(app.fechaActiva);

  // Cargar eventos del día activo
  // fechaActiva es string "YYYY-MM-DD" — pasarlo directo funciona con obtenerEventosDia
  let eventos;
  try {
    eventos = await obtenerEventosDia(app.db, app.fechaActiva);
  } catch (err) {
    console.error('[Agenda] Error al cargar eventos:', err);
    mostrarToast('Error al cargar los eventos del día', 'error');
    eventos = [];
  }
  verificarAlerta24h(app.db, mostrarToast);


  // Construir el HTML de la vista
  contenedor.innerHTML = '';

  // Panel IA (se genera en paralelo con el render)
  const panelIA = await crearPanelResumenIA(app.db, app.fechaActiva, app.categorias);

  // Header de fecha
  const header = construirHeader(app);
  contenedor.appendChild(header);

  // Panel IA va entre el header y el timeline
  contenedor.appendChild(panelIA);

  // Timeline de eventos
  if (eventos.length === 0) {
    contenedor.appendChild(
      crearEstadoVacio('Sin eventos para este día', 'Crear evento', null)
    );
  } else {
    contenedor.appendChild(construirTimeline(eventos, app.categorias, app.db));
  }

  registrarListeners(contenedor, app);
}

// ─── Construcción del DOM ─────────────────────────────────────

function construirVista(app, eventos) {
  const fragmento = document.createDocumentFragment();

  // Header de la vista
  fragmento.appendChild(construirHeader(app));

  // Contenido: timeline o estado vacío
  if (eventos.length === 0) {
    fragmento.appendChild(
      crearEstadoVacio(
        'Sin eventos para este día',
        'Crear evento',
        null // el FAB global maneja la creación
      )
    );
  } else {
    fragmento.appendChild(construirTimeline(eventos, app.categorias));
  }

  return fragmento;
}

function construirHeader(app) {
  const header = document.createElement('div');
  header.className = 'planit-vista-header';

  // Título con fecha formateada
  // isoADate convierte "YYYY-MM-DD" a Date local sin bugs de timezone
  const titulo = document.createElement('h2');
  titulo.className = 'planit-vista-titulo';
  titulo.textContent = formatearFecha(isoADate(app.fechaActiva), 'largo');

  // Controles de navegación de fecha
  const navFecha = document.createElement('div');
  navFecha.className = 'planit-nav-fecha';

  const btnAnterior = document.createElement('button');
  btnAnterior.className = 'planit-nav-fecha__btn';
  btnAnterior.dataset.accion = 'anterior';
  btnAnterior.setAttribute('aria-label', 'Día anterior');
  btnAnterior.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15 18l-6-6 6-6"/></svg>`;

  const btnHoy = document.createElement('button');
  btnHoy.className = 'planit-nav-fecha__hoy';
  btnHoy.dataset.accion = 'hoy';
  btnHoy.textContent = 'HOY';

  const btnSiguiente = document.createElement('button');
  btnSiguiente.className = 'planit-nav-fecha__btn';
  btnSiguiente.dataset.accion = 'siguiente';
  btnSiguiente.setAttribute('aria-label', 'Día siguiente');
  btnSiguiente.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18l6-6-6-6"/></svg>`;

  navFecha.appendChild(btnAnterior);
  navFecha.appendChild(btnHoy);
  navFecha.appendChild(btnSiguiente);

  header.appendChild(titulo);
  header.appendChild(navFecha);
  return header;
}

/**
 * Construye la línea de tiempo agrupando eventos por hora.
 * Inserta separadores de hora entre bloques de diferentes horas.
 */
function construirTimeline(eventos, categorias, db) {
  const timeline = document.createElement('div');
  timeline.className = 'planit-timeline';

  let horaActual = null;

  for (const evento of eventos) {
    const horaEvento = evento.fecha_inicio.slice(11, 13);

    if (horaEvento !== horaActual) {
      const sep = document.createElement('div');
      sep.className = 'planit-timeline__hora';
      sep.textContent = `${horaEvento}:00`;
      timeline.appendChild(sep);
      horaActual = horaEvento;
    }

    // Examen → bloque especial con cuenta regresiva + checklist
    if (evento.tipo === 'examen') {
      const bloqueExamen = crearBloqueExamen(evento, async (id, temasCompletados) => {
        await Eventos.actualizar(db, id, { temas_completados: temasCompletados });
        // Re-render del timeline para actualizar progreso
        const contenedor = document.getElementById('planit-vista');
        if (contenedor) await render({ db, categorias, fechaActiva: evento.fecha_inicio.slice(0,10) }, contenedor);
      });
      timeline.appendChild(bloqueExamen);
    } else {
      timeline.appendChild(crearBloqueEvento(evento, categorias));
    }
  }

  return timeline;
}

// ─── Listeners ────────────────────────────────────────────────

function registrarListeners(contenedor, app) {
  // Delegación: un solo listener para toda la vista
  contenedor.addEventListener('click', async (e) => {
    const accion = e.target.closest('[data-accion]')?.dataset.accion;
    const eventoId = e.target.closest('.planit-evento')?.dataset.id;

    if (accion) await manejarNavFecha(accion, app);
    if (eventoId && !accion) await manejarClickEvento(eventoId, app);
  });
}

// views/agenda.js — REEMPLAZAR manejarNavFecha completa

async function manejarNavFecha(accion, app) {
  if (accion === 'anterior') {
    app.fechaActiva = sumarDias(app.fechaActiva, -1);
  } else if (accion === 'siguiente') {
    app.fechaActiva = sumarDias(app.fechaActiva, 1);
  } else if (accion === 'hoy') {
    app.fechaActiva = hoyISO();
  }

  // navegarA ahora llama _navegarFn directamente (no hashchange)
  // y clona el contenedor → mata listeners viejos
  await navegarA('/agenda');
}


async function manejarClickEvento(eventoId, app) {
  // Los eventos virtuales (horario U) redirigen a su vista
  if (eventoId.startsWith('virtual-')) {
    await navegarA('/horario-u');
    return;
  }

  const evento = await Eventos.obtener(app.db, eventoId);
  if (!evento) return;

  // Mostrar modal de detalle con opciones
  const confirmado = await abrirModal({
    titulo: evento.titulo,
    contenido: `${formatearFecha(evento.fecha_inicio, 'hora')} – ${formatearFecha(evento.fecha_fin, 'hora')}${evento.notas ? '\n\n' + evento.notas : ''}`,
    labelConfirmar: 'Eliminar',
    labelCancelar: 'Cerrar',
    peligroso: true,
  });

  if (confirmado) {
    await Eventos.eliminar(app.db, eventoId);
    mostrarToast('Evento eliminado', 'exito');
    await navegarA('/agenda');
  }
}

// ─── Helper ───────────────────────────────────────────────────

function actualizarFechaHeader(fechaISO) {
  const el = document.getElementById('planit-fecha-activa');
  if (!el) return;
  // Formatear el string de fecha para el header superior
  const d = isoADate(fechaISO);
  el.textContent = formatearFecha(d, 'corto').toUpperCase();
  el.dateTime = fechaISO;
}