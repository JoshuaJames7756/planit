/**
 * ============================================================
 * PLANIT — modules/modo-examen.js
 * Panel de examen con cuenta regresiva + checklist + bloqueo
 * ============================================================
 */

import { Eventos } from './db.js';
import { hoyISO, isoADate } from './router.js';

/**
 * Busca exámenes próximos (hoy + próximos 7 días)
 * y retorna el más cercano que no haya pasado.
 */
export async function obtenerProximoExamen(db) {
  const todos = await Eventos.obtenerTodos(db);
  const ahora = new Date();

  return todos
    .filter(ev => ev.tipo === 'examen' && new Date(ev.fecha_inicio) > ahora)
    .sort((a, b) => new Date(a.fecha_inicio) - new Date(b.fecha_inicio))[0] || null;
}

/**
 * Construye el bloque especial de examen para la vista de agenda.
 * Reemplaza el bloque normal cuando el evento es de tipo 'examen'.
 */
export function crearBloqueExamen(evento, onTemaToggle) {
  const ahora     = new Date();
  const inicio    = new Date(evento.fecha_inicio);
  const color     = '#f0b429'; // ámbar para exámenes

  const article = document.createElement('article');
  article.className = 'planit-evento planit-examen';
  article.dataset.id = evento.id;
  article.style.cssText = `
    background: color-mix(in srgb, ${color} 8%, var(--color-superficie));
    border-left: 3px solid ${color};
    border-top: 0.5px solid color-mix(in srgb, ${color} 30%, transparent);
    border-right: 0.5px solid color-mix(in srgb, ${color} 30%, transparent);
    border-bottom: 0.5px solid color-mix(in srgb, ${color} 30%, transparent);
    border-radius: var(--radio-lg);
    padding: 14px 16px;
    margin-bottom: 8px;
    position: relative;
    cursor: pointer;
  `;

  // ── Cuenta regresiva ──────────────────────────────────────
  const diff    = inicio - ahora;
  const diffAbs = Math.abs(diff);
  const dias    = Math.floor(diffAbs / 86400000);
  const horas   = Math.floor((diffAbs % 86400000) / 3600000);
  const mins    = Math.floor((diffAbs % 3600000) / 60000);

  let cuentaTexto, cuentaColor;
  if (diff < 0) {
    cuentaTexto = 'En curso';
    cuentaColor = '#f09595';
  } else if (dias === 0 && horas === 0) {
    cuentaTexto = `${mins}min`;
    cuentaColor = '#f09595';
  } else if (dias === 0) {
    cuentaTexto = `${horas}h ${mins}min`;
    cuentaColor = horas < 3 ? '#f09595' : color;
  } else {
    cuentaTexto = `${dias}d ${horas}h`;
    cuentaColor = dias <= 1 ? color : 'var(--texto-secundario)';
  }

  // ── Header del bloque ─────────────────────────────────────
  const headerEl = document.createElement('div');
  headerEl.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;';
  headerEl.innerHTML = `
    <div style="flex:1; min-width:0;">
        <div style="
        display:inline-flex; align-items:center; gap:5px;
        font-family:var(--fuente-mono); font-size:10px; letter-spacing:1px;
        color:${color}; margin-bottom:4px;
        ">
        🎯 EXAMEN ${evento.aula_examen ? `<span style="opacity:0.6;">· ${evento.aula_examen}</span>` : ''}
        </div>
        <h3 style="font-size:15px; font-weight:600; color:var(--texto-primario); margin:0 0 3px;">
        ${evento.titulo}
        </h3>
        <div style="font-family:var(--fuente-mono); font-size:11px; color:var(--texto-terciario);">
        ${evento.fecha_inicio.slice(11,16)} – ${evento.fecha_fin.slice(11,16)}
        </div>
    </div>
    <div style="
        text-align:center; flex-shrink:0; margin-left:12px;
        background: color-mix(in srgb, ${cuentaColor} 12%, transparent);
        border: 0.5px solid color-mix(in srgb, ${cuentaColor} 30%, transparent);
        border-radius: var(--radio-md);
        padding: 8px 12px;
    ">
        <div style="font-family:var(--fuente-mono); font-size:18px; font-weight:700; color:${cuentaColor}; line-height:1;">
        ${cuentaTexto}
        </div>
        <div style="font-family:var(--fuente-mono); font-size:9px; color:var(--texto-terciario); letter-spacing:1px; margin-top:3px;">
        FALTAN
        </div>
    </div>
  `;
  article.appendChild(headerEl);

  // ── Checklist de temas ────────────────────────────────────
  const temas = evento.temas || [];
  const completados = new Set(evento.temas_completados || []);

  if (temas.length > 0) {
    const divider = document.createElement('div');
    divider.style.cssText = `
      height: 0.5px; background: color-mix(in srgb, ${color} 20%, transparent);
      margin: 10px 0;
    `;
    article.appendChild(divider);

    const checklistLabel = document.createElement('div');
    checklistLabel.style.cssText = `
      font-family:var(--fuente-mono); font-size:9px; letter-spacing:2px;
      color:var(--texto-terciario); margin-bottom:8px; text-transform:uppercase;
    `;
    const completadosCount = temas.filter((_, i) => completados.has(String(i))).length;
    checklistLabel.textContent = `TEMAS · ${completadosCount}/${temas.length}`;
    article.appendChild(checklistLabel);

    // Barra de progreso
    const progresoBarra = document.createElement('div');
    progresoBarra.style.cssText = `
      height: 3px; background: var(--color-borde); border-radius: 2px;
      margin-bottom: 10px; overflow: hidden;
    `;
    const progresoFill = document.createElement('div');
    const pct = temas.length > 0 ? (completadosCount / temas.length) * 100 : 0;
    progresoFill.style.cssText = `
      height: 100%; width: ${pct}%;
      background: ${color}; border-radius: 2px;
      transition: width 0.3s ease;
    `;
    progresoBarra.appendChild(progresoFill);
    article.appendChild(progresoBarra);

    const checklist = document.createElement('div');
    checklist.style.cssText = 'display:flex; flex-direction:column; gap:5px;';

    temas.forEach((tema, idx) => {
      const item = document.createElement('div');
      item.style.cssText = `
        display:flex; align-items:center; gap:8px;
        font-size:13px; cursor:pointer;
        color: ${completados.has(String(idx)) ? 'var(--texto-desactivado)' : 'var(--texto-secundario)'};
        text-decoration: ${completados.has(String(idx)) ? 'line-through' : 'none'};
        transition: color 0.15s;
        padding: 2px 0;
      `;
      item.dataset.temaIdx = idx;

      const check = document.createElement('div');
      check.style.cssText = `
        width: 16px; height: 16px; border-radius: 4px; flex-shrink:0;
        border: 1.5px solid ${completados.has(String(idx)) ? color : 'var(--color-borde-hover)'};
        background: ${completados.has(String(idx)) ? color : 'transparent'};
        display:flex; align-items:center; justify-content:center;
        transition: all 0.15s; flex-shrink:0;
      `;
      if (completados.has(String(idx))) {
        check.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 5l2.5 2.5L8 3" stroke="#0d0f14" stroke-width="1.5" stroke-linecap="round"/>
        </svg>`;
      }

      item.appendChild(check);
      item.appendChild(document.createTextNode(tema));

      // Click en tema → toggle completado
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        const nuevoSet = new Set(completados);
        if (nuevoSet.has(String(idx))) {
          nuevoSet.delete(String(idx));
        } else {
          nuevoSet.add(String(idx));
        }
        if (onTemaToggle) await onTemaToggle(evento.id, [...nuevoSet]);
      });

      checklist.appendChild(item);
    });

    article.appendChild(checklist);
  }

  return article;
}

/**
 * Verifica si hay un examen en las próximas 24 horas
 * y muestra una notificación toast si es necesario.
 */
export async function verificarAlerta24h(db, mostrarToastFn) {
  const proximo = await obtenerProximoExamen(db);
  if (!proximo) return;

  const ahora  = new Date();
  const inicio = new Date(proximo.fecha_inicio);
  const diff   = inicio - ahora;
  const horas  = diff / 3600000;

  // Solo alertar si está entre 20 y 25 horas (ventana de 24h)
  if (horas > 0 && horas <= 25) {
    const h = Math.floor(horas);
    const m = Math.floor((horas % 1) * 60);
    mostrarToastFn(
      `🎯 Examen "${proximo.titulo}" en ${h}h ${m}min`,
      'aviso',
      8000
    );
  }
}