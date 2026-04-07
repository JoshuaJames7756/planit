/**
 * ============================================================
 * PLANIT — views/mes.js
 * Vista de calendario mensual
 * ============================================================
 *
 * Muestra una cuadrícula de 5-6 semanas con puntos de color
 * por cada evento. Al hacer clic en un día, navega a la
 * vista de agenda con esa fecha activa.
 * ============================================================
 */

import { Eventos } from '../modules/db.js';
import { generarEventosHorarioU, formatearFecha } from '../modules/scheduler.js';
import { mostrarSkeleton } from '../modules/ui.js';
import { navegarA, hoyISO, sumarDias, isoADate } from '../modules/router.js';

const DIAS_HEADER = ['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM'];

export async function render(app, contenedor) {
  mostrarSkeleton(contenedor, 'mes');

  // fechaActiva es "YYYY-MM-DD" — extraer año y mes sin timezone
  const [anio, mes] = app.fechaActiva.split('-').map(Number);
  // mes aquí es 1-12 (humano); para Date JS usaremos mes-1

  const hoyStr = hoyISO(); // "YYYY-MM-DD" en hora local

  // Primer y último día del mes como strings locales (sin toISOString)
  const primerDia = new Date(anio, mes - 1, 1);
  const ultimoDia = new Date(anio, mes, 0); // día 0 del mes siguiente = último del actual

  // Formatear como "YYYY-MM-DD" con aritmética local (sin UTC)
  const desdeISO = _dateAISO(primerDia);
  const hastaISO = _dateAISO(ultimoDia);

  // Obtener todos los eventos del mes (reales + virtuales)
  let eventosMes = [];
  try {
    const [reales, virtuales] = await Promise.all([
      Eventos.obtenerPorRango(app.db, desdeISO, hastaISO),
      generarEventosHorarioU(app.db, primerDia, ultimoDia),
    ]);
    eventosMes = [...reales, ...virtuales];
  } catch (err) {
    console.error('[Mes] Error:', err);
  }

  // Indexar eventos por fecha "YYYY-MM-DD"
  const eventosIndexados = indexarPorFecha(eventosMes);

  contenedor.innerHTML = '';
  contenedor.appendChild(construirVista(app, anio, mes, hoyStr, eventosIndexados));
  registrarListeners(contenedor, app);
}

// ─── Construcción ─────────────────────────────────────────────

function construirVista(app, anio, mes, hoyStr, eventosIndexados) {
  const frag = document.createDocumentFragment();
  frag.appendChild(construirHeader(anio, mes));
  const cal = construirCalendario(anio, mes, hoyStr, eventosIndexados, app.categorias);
  cal.style.width = '100%';
  frag.appendChild(cal);
  return frag;
}

function construirHeader(anio, mes) {
  // mes es 1-12 → para Date JS: mes-1
  const nombreMes = new Date(anio, mes - 1, 1)
    .toLocaleDateString('es-BO', { month: 'long', year: 'numeric' })
    .toUpperCase();

  const header = document.createElement('div');
  header.className = 'planit-vista-header';

  const titulo = document.createElement('h2');
  titulo.className = 'planit-vista-titulo';
  titulo.textContent = nombreMes;

  const navFecha = document.createElement('div');
  navFecha.className = 'planit-nav-fecha';
  navFecha.innerHTML = `
    <button class="planit-nav-fecha__btn" data-accion="anterior" aria-label="Mes anterior">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15 18l-6-6 6-6"/></svg>
    </button>
    <button class="planit-nav-fecha__hoy" data-accion="hoy">HOY</button>
    <button class="planit-nav-fecha__btn" data-accion="siguiente" aria-label="Mes siguiente">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18l6-6-6-6"/></svg>
    </button>
  `;

  header.appendChild(titulo);
  header.appendChild(navFecha);
  return header;
}

function construirCalendario(anio, mes, hoyStr, eventosIndexados, categorias) {
  const wrap = document.createElement('div');
  wrap.className = 'planit-card';
  wrap.style.padding = '0';
  wrap.style.overflow = 'hidden';
  wrap.style.width = '100%';      // ← AGREGAR

  // Header días semana
  const headerDias = document.createElement('div');
  headerDias.style.cssText = `
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    border-bottom: 0.5px solid var(--color-borde);
  `;
  for (const dia of DIAS_HEADER) {
    const cell = document.createElement('div');
    cell.style.cssText = `
      font-family: var(--fuente-mono); font-size: 10px;
      color: var(--texto-desactivado); text-align: center;
      padding: 10px 4px; letter-spacing: 1px;
    `;
    cell.textContent = dia;
    headerDias.appendChild(cell);
  }
  wrap.appendChild(headerDias);

  const grid = document.createElement('div');
  grid.style.cssText = 'display: grid; grid-template-columns: repeat(7, 1fr); width: 100%;'; // ← agregar width:100%

  const primerDiaMes = new Date(anio, mes - 1, 1);
  const diaSemana    = primerDiaMes.getDay();
  const diasOffset   = diaSemana === 0 ? 6 : diaSemana - 1;
  const cursor       = new Date(anio, mes - 1, 1 - diasOffset);

  for (let i = 0; i < 42; i++) {
    const fechaStr      = _dateAISO(cursor);
    const esHoy         = fechaStr === hoyStr;
    const esMesActual   = cursor.getMonth() === mes - 1;
    const eventosDelDia = eventosIndexados[fechaStr] || [];

    const cell = document.createElement('div');
    cell.dataset.fecha = fechaStr;
    cell.style.cssText = `
      border-right: 0.5px solid var(--color-borde);
      border-bottom: 0.5px solid var(--color-borde);
      padding: 6px 4px 8px;
      min-height: 80px;          /* ← más alto que antes (64px) */
      cursor: pointer;
      transition: background var(--trans-rapida);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    `;
    if ((i + 1) % 7 === 0) cell.style.borderRight = 'none';

    cell.addEventListener('mouseenter', () => {
      cell.style.background = 'color-mix(in srgb, var(--texto-primario) 4%, transparent)';
    });
    cell.addEventListener('mouseleave', () => {
      cell.style.background = esHoy
        ? 'color-mix(in srgb, var(--acento-cian) 6%, transparent)'
        : 'transparent';
    });

    // Fondo sutil para hoy
    if (esHoy) {
      cell.style.background = 'color-mix(in srgb, var(--acento-cian) 6%, transparent)';
    }

    // Número del día
    const numEl = document.createElement('div');
    numEl.textContent = cursor.getDate();
    if (esHoy) {
      numEl.style.cssText = `
        width:22px; height:22px; background:var(--acento-cian);
        color:var(--color-base); border-radius:50%;
        display:flex; align-items:center; justify-content:center;
        font-family:var(--fuente-mono); font-size:11px; font-weight:700;
      `;
    } else {
      numEl.style.cssText = `
        font-family:var(--fuente-mono); font-size:11px;
        color:${esMesActual ? 'var(--texto-secundario)' : 'var(--texto-desactivado)'};
        width:22px; height:22px;
        display:flex; align-items:center; justify-content:center;
      `;
    }
    cell.appendChild(numEl);

    // Puntos de colores reales (máximo 3)
    if (eventosDelDia.length > 0) {
      const dots = document.createElement('div');
      dots.style.cssText = 'display:flex; gap:3px; flex-wrap:wrap; justify-content:center;';

      const visibles = eventosDelDia.slice(0, 3);
      for (const ev of visibles) {
        // Buscar color: primero en el evento, luego en la categoría
        const cat   = categorias.find(c => c.id === ev.categoria_id);
        const color = ev.color || cat?.color || '#5a6a7e';

        const dot = document.createElement('div');
        dot.title = ev.titulo; // tooltip con nombre del evento
        dot.style.cssText = `
          width:6px; height:6px; border-radius:50%;
          background:${ev.virtual ? 'transparent' : color};
          ${ev.virtual ? `border:1.5px solid ${color};` : ''}
          flex-shrink:0;
        `;
        dots.appendChild(dot);
      }

      if (eventosDelDia.length > 3) {
        const extra = document.createElement('div');
        extra.style.cssText = 'font-size:9px; color:var(--texto-terciario); font-family:var(--fuente-mono);';
        extra.textContent = `+${eventosDelDia.length - 3}`;
        dots.appendChild(extra);
      }

      cell.appendChild(dots);
    }

    grid.appendChild(cell);
    cursor.setDate(cursor.getDate() + 1);
  }

  wrap.appendChild(grid);
  return wrap;
}

// ─── Helpers ──────────────────────────────────────────────────

/**
 * Convierte un objeto Date LOCAL a string "YYYY-MM-DD"
 * SIN pasar por UTC (evita el bug de timezone en Bolivia).
 * @param {Date} date
 * @returns {string}
 */
function _dateAISO(date) {
  const y  = date.getFullYear();
  const m  = String(date.getMonth() + 1).padStart(2, '0');
  const d  = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function indexarPorFecha(eventos) {
  return eventos.reduce((mapa, ev) => {
    const key = ev.fecha_inicio.slice(0, 10);
    if (!mapa[key]) mapa[key] = [];
    mapa[key].push(ev);
    return mapa;
  }, {});
}

// ─── Listeners ────────────────────────────────────────────────

function registrarListeners(contenedor, app) {
  contenedor.addEventListener('click', async (e) => {
    const accion = e.target.closest('[data-accion]')?.dataset.accion;
    const celda  = e.target.closest('[data-fecha]');

    if (accion) {
      // fechaActiva es "YYYY-MM-DD" — extraer año y mes sin Date
      const [anio, mes] = app.fechaActiva.split('-').map(Number);

      if (accion === 'anterior') {
        // Retroceder un mes: si mes=1 → diciembre del año anterior
        const nuevoMes  = mes === 1  ? 12      : mes - 1;
        const nuevoAnio = mes === 1  ? anio - 1 : anio;
        app.fechaActiva = `${nuevoAnio}-${String(nuevoMes).padStart(2, '0')}-01`;
      } else if (accion === 'siguiente') {
        // Avanzar un mes: si mes=12 → enero del año siguiente
        const nuevoMes  = mes === 12 ? 1       : mes + 1;
        const nuevoAnio = mes === 12 ? anio + 1 : anio;
        app.fechaActiva = `${nuevoAnio}-${String(nuevoMes).padStart(2, '0')}-01`;
      } else if (accion === 'hoy') {
        app.fechaActiva = hoyISO();
      }

      await navegarA('/mes');
      return;
    }

    // Click en un día del calendario → navegar a agenda con esa fecha
    if (celda?.dataset.fecha) {
      app.fechaActiva = celda.dataset.fecha; // ya es "YYYY-MM-DD"
      await navegarA('/agenda');
    }
  });
}