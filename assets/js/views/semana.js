/**
 * ============================================================
 * PLANIT — views/semana.js
 * Vista de semana con Weekly Flow Dial
 * ============================================================
 *
 * Layout:
 *   ┌──────────────┬─────────────────┬──────────────┐
 *   │ LUN   MAR    │  Weekly Flow    │ JUE   VIE    │
 *   │ evento evento│     Dial SVG    │ evento evento │
 *   │ ...          │  38h · semana   │ ...          │
 *   └──────────────┴─────────────────┴──────────────┘
 *
 * El Dial es un gráfico SVG circular generado en JS puro
 * con los datos de calcularFlowDial() de scheduler.js.
 * ============================================================
 */

import {
  obtenerEventosSemana,
  calcularFlowDial,
  obtenerRangoSemana,
  formatearFecha,
} from '../modules/scheduler.js';
import { mostrarSkeleton } from '../modules/ui.js';
import { navegarA, hoyISO, sumarDias, isoADate } from '../modules/router.js';

const DIAS = ['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM'];

export async function render(app, contenedor) {
  mostrarSkeleton(contenedor, 'semana');

  // fechaActiva es "YYYY-MM-DD" — convertir a Date LOCAL para obtenerRangoSemana
  const fechaDate = isoADate(app.fechaActiva);
  const { lunes } = obtenerRangoSemana(fechaDate);

  let eventos = [], dialData = [];
  try {
    [eventos, dialData] = await Promise.all([
      obtenerEventosSemana(app.db, fechaDate),
      calcularFlowDial(app.db, fechaDate),
    ]);
  } catch (err) {
    console.error('[Semana] Error:', err);
    eventos = []; dialData = [];
  }

  contenedor.innerHTML = '';
  contenedor.appendChild(construirVista(app, lunes, eventos, dialData));
  registrarListeners(contenedor, app);
}

// ─── Construcción ─────────────────────────────────────────────

function construirVista(app, lunes, eventos, dialData) {
  const frag = document.createDocumentFragment();
  frag.appendChild(construirHeader(lunes));
  frag.appendChild(construirGrid(lunes, eventos, dialData, app.categorias));
  return frag;
}

function construirHeader(lunes) {
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);

  const header = document.createElement('div');
  header.className = 'planit-vista-header';

  const titulo = document.createElement('h2');
  titulo.className = 'planit-vista-titulo';
  titulo.textContent = `${formatearFecha(lunes, 'corto')} – ${formatearFecha(domingo, 'corto')}`;

  const navFecha = document.createElement('div');
  navFecha.className = 'planit-nav-fecha';
  navFecha.innerHTML = `
    <button class="planit-nav-fecha__btn" data-accion="anterior" aria-label="Semana anterior">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15 18l-6-6 6-6"/></svg>
    </button>
    <button class="planit-nav-fecha__hoy" data-accion="hoy">HOY</button>
    <button class="planit-nav-fecha__btn" data-accion="siguiente" aria-label="Semana siguiente">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18l6-6-6-6"/></svg>
    </button>
  `;

  header.appendChild(titulo);
  header.appendChild(navFecha);
  return header;
}

function construirGrid(lunes, eventos, dialData, categorias) {
  const grid = document.createElement('div');
  grid.className = 'planit-semana-grid';
  grid.style.cssText = `
    display: grid;
    grid-template-columns: 1fr 180px 1fr;
    gap: 16px;
    align-items: start;
  `;

  // Agrupar eventos por día de la semana
  const eventosPorDia = agruparPorDia(lunes, eventos);

  // Columna izquierda: LUN, MAR, MIÉ
  grid.appendChild(construirColumnasDias(lunes, eventosPorDia, categorias, [0, 1, 2]));

  // Centro: Weekly Flow Dial
  grid.appendChild(construirDial(dialData, eventos));

  // Columna derecha: JUE, VIE, SÁB, DOM
  grid.appendChild(construirColumnasDias(lunes, eventosPorDia, categorias, [3, 4, 5, 6]));

  return grid;
}

function construirColumnasDias(lunes, eventosPorDia, categorias, indices) {
  const col = document.createElement('div');
  col.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';

  for (const idx of indices) {
    const fecha = new Date(lunes);
    fecha.setDate(lunes.getDate() + idx);
    // Formatear como "YYYY-MM-DD" con hora local (sin toISOString que usa UTC)
    const key = _dateAISO(fecha);
    const eventosDelDia = eventosPorDia[key] || [];

    const diaWrap = document.createElement('div');

    const diaLabel = document.createElement('div');
    diaLabel.className = 'planit-label';
    diaLabel.style.marginBottom = '6px';
    diaLabel.textContent = DIAS[idx];

    diaWrap.appendChild(diaLabel);

    if (eventosDelDia.length === 0) {
      const vacio = document.createElement('div');
      vacio.style.cssText = 'height: 4px; background: var(--color-borde); border-radius: 2px; opacity: 0.4;';
      diaWrap.appendChild(vacio);
    } else {
      for (const ev of eventosDelDia.slice(0, 3)) {
        const bloque = document.createElement('div');
        bloque.className = 'planit-evento';
        bloque.dataset.id = ev.id;
        const color = ev.color || categorias.find(c => c.id === ev.categoria_id)?.color || '#5a6a7e';
        bloque.style.setProperty('--evento-color', color);
        bloque.style.marginBottom = '4px';
        bloque.innerHTML = `
          <div class="planit-evento__franja"></div>
          <div class="planit-evento__cuerpo">
            <time class="planit-evento__hora">${ev.fecha_inicio.slice(11,16)}</time>
            <h3 class="planit-evento__titulo" style="font-size:12px;">${ev.titulo}</h3>
          </div>
        `;
        diaWrap.appendChild(bloque);
      }
      if (eventosDelDia.length > 3) {
        const mas = document.createElement('div');
        mas.style.cssText = 'font-size:11px; color:var(--texto-terciario); font-family:var(--fuente-mono); padding: 2px 8px;';
        mas.textContent = `+${eventosDelDia.length - 3} más`;
        diaWrap.appendChild(mas);
      }
    }
    col.appendChild(diaWrap);
  }
  return col;
}

/**
 * Construye el Weekly Flow Dial como SVG puro.
 * Los arcos se calculan con la fórmula de stroke-dasharray
 * en un círculo de radio 54 (circunferencia ≈ 339.3px).
 */
function construirDial(dialData, eventos) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:12px; position:sticky; top:80px;';

  const totalMin   = dialData.reduce((s, d) => s + d.minutos, 0);
  const totalHoras = Math.round(totalMin / 60);

  const R = 54;
  const C = 2 * Math.PI * R;

  let offset = C * 0.25;
  const arcos = dialData.map((d) => {
    const largo = (d.minutos / totalMin) * C;
    const arco  = { ...d, largo, offset: -offset };
    offset += largo;
    return arco;
  });

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.setAttribute('width', '140');
  svg.setAttribute('height', '140');
  svg.setAttribute('aria-label', 'Weekly Flow Dial');
  svg.setAttribute('role', 'img');

  const pista = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  pista.setAttribute('cx', '60'); pista.setAttribute('cy', '60');
  pista.setAttribute('r', String(R));
  pista.setAttribute('fill', 'none');
  pista.setAttribute('stroke', '#2a3040');
  pista.setAttribute('stroke-width', '10');
  svg.appendChild(pista);

  for (const arco of arcos) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '60'); circle.setAttribute('cy', '60');
    circle.setAttribute('r', String(R));
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', arco.color);
    circle.setAttribute('stroke-width', '10');
    circle.setAttribute('stroke-dasharray', `${arco.largo} ${C - arco.largo}`);
    circle.setAttribute('stroke-dashoffset', String(arco.offset));
    circle.setAttribute('stroke-linecap', 'round');
    svg.appendChild(circle);
  }

  const circulo = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circulo.setAttribute('cx', '60'); circulo.setAttribute('cy', '60');
  circulo.setAttribute('r', '40'); circulo.setAttribute('fill', '#141820');
  svg.appendChild(circulo);

  const txtHoras = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  txtHoras.setAttribute('x', '60'); txtHoras.setAttribute('y', '57');
  txtHoras.setAttribute('text-anchor', 'middle');
  txtHoras.setAttribute('dominant-baseline', 'central');
  txtHoras.setAttribute('font-family', 'Space Mono, monospace');
  txtHoras.setAttribute('font-size', '16');
  txtHoras.setAttribute('font-weight', '700');
  txtHoras.setAttribute('fill', '#d0dcea');
  txtHoras.textContent = `${totalHoras}h`;
  svg.appendChild(txtHoras);

  const txtLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  txtLabel.setAttribute('x', '60'); txtLabel.setAttribute('y', '70');
  txtLabel.setAttribute('text-anchor', 'middle');
  txtLabel.setAttribute('font-family', 'Space Mono, monospace');
  txtLabel.setAttribute('font-size', '8');
  txtLabel.setAttribute('fill', '#5a6a7e');
  txtLabel.setAttribute('letter-spacing', '1');
  txtLabel.textContent = 'SEMANA';
  svg.appendChild(txtLabel);

  wrap.appendChild(svg);

  if (dialData.length > 0) {
    const leyenda = document.createElement('div');
    leyenda.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:4px 12px; width:100%;';
    for (const d of dialData) {
      const item = document.createElement('div');
      item.style.cssText = 'display:flex; align-items:center; gap:6px; font-size:11px; color:var(--texto-secundario);';
      item.innerHTML = `
        <span style="width:8px;height:8px;border-radius:50%;background:${d.color};flex-shrink:0;"></span>
        ${d.categoria}
      `;
      leyenda.appendChild(item);
    }
    wrap.appendChild(leyenda);
  } else {
    const sinDatos = document.createElement('p');
    sinDatos.style.cssText = 'font-size:11px; color:var(--texto-terciario); text-align:center;';
    sinDatos.textContent = 'Sin datos esta semana';
    wrap.appendChild(sinDatos);
  }

  return wrap;
}

// ─── Helpers ──────────────────────────────────────────────────

/**
 * Convierte un objeto Date LOCAL a "YYYY-MM-DD" sin pasar por UTC.
 * Evita el bug de timezone en Bolivia (UTC-4).
 */
function _dateAISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function agruparPorDia(lunes, eventos) {
  const mapa = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(lunes);
    d.setDate(lunes.getDate() + i);
    mapa[_dateAISO(d)] = []; // sin toISOString
  }
  for (const ev of eventos) {
    const key = ev.fecha_inicio.slice(0, 10);
    if (mapa[key]) mapa[key].push(ev);
  }
  return mapa;
}

// ─── Listeners ────────────────────────────────────────────────

function registrarListeners(contenedor, app) {
  contenedor.addEventListener('click', async (e) => {
    const accion = e.target.closest('[data-accion]')?.dataset.accion;
    if (!accion) return;

    // fechaActiva es "YYYY-MM-DD" — sumarDias opera sin timezone
    if (accion === 'anterior') {
      app.fechaActiva = sumarDias(app.fechaActiva, -7);
    } else if (accion === 'siguiente') {
      app.fechaActiva = sumarDias(app.fechaActiva, 7);
    } else if (accion === 'hoy') {
      app.fechaActiva = hoyISO();
    }

    await navegarA('/semana');
  });
}