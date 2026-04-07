/**
 * ============================================================
 * PLANIT — views/proyectos.js
 * Vista de gestión de proyectos
 * ============================================================
 *
 * Cada proyecto muestra: nombre, color, progreso de tareas,
 * y los próximos eventos asociados.
 * ============================================================
 */

import { Proyectos, Tareas, Eventos } from '../modules/db.js';
import {
  mostrarSkeleton, abrirModalFormulario, abrirModal,
  mostrarToast, crearEl,
} from '../modules/ui.js';
import { formatearFecha } from '../modules/scheduler.js';
import { navegarA } from '../modules/router.js';

// Paleta de colores predefinidos para proyectos
const COLORES_PROYECTO = [
  '#00ffc8','#b060ff','#7de06e','#f0b429',
  '#378ADD','#D85A30','#D4537E','#1D9E75',
];

export async function render(app, contenedor) {
  mostrarSkeleton(contenedor, 'lista');

  let proyectos = [], todasTareas = [], todosEventos = [];
  try {
    [proyectos, todasTareas, todosEventos] = await Promise.all([
      Proyectos.obtenerTodos(app.db),
      Tareas.obtenerTodas(app.db),
      Eventos.obtenerTodos(app.db),
    ]);
  } catch (err) {
    console.error('[Proyectos] Error:', err);
  }

  contenedor.innerHTML = '';
  contenedor.appendChild(construirVista(app, proyectos, todasTareas, todosEventos));
  registrarListeners(contenedor, app, proyectos, todasTareas, todosEventos);
}

// ─── Construcción ─────────────────────────────────────────────

function construirVista(app, proyectos, tareas, eventos) {
  const frag = document.createDocumentFragment();
  frag.appendChild(construirHeader());

  if (proyectos.length === 0) {
    const vacio = document.createElement('div');
    vacio.className = 'planit-vacio';
    vacio.innerHTML = `
      <p class="planit-vacio__mensaje">No hay proyectos aún.</p>
      <button class="planit-btn planit-btn--primario" data-accion="nuevo-proyecto">
        Crear primer proyecto
      </button>
    `;
    frag.appendChild(vacio);
    return frag;
  }

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:16px;';

  for (const proyecto of proyectos) {
    const tareasProyecto  = tareas.filter(t => t.proyecto_id === proyecto.id);
    const eventosProyecto = eventos.filter(e => e.proyecto_id === proyecto.id);
    grid.appendChild(crearTarjetaProyecto(proyecto, tareasProyecto, eventosProyecto));
  }

  frag.appendChild(grid);
  return frag;
}

function construirHeader() {
  const header = document.createElement('div');
  header.className = 'planit-vista-header';
  header.innerHTML = `<h2 class="planit-vista-titulo">Proyectos</h2>`;

  const btn = crearEl('button', {
    clase: 'planit-btn planit-btn--ghost',
    texto: '+ Nuevo proyecto',
    attrs: { 'data-accion': 'nuevo-proyecto' },
  });
  header.appendChild(btn);
  return header;
}

function crearTarjetaProyecto(proyecto, tareas, eventos) {
  const completadas = tareas.filter(t => t.completada).length;
  const total       = tareas.length;
  const progreso    = total > 0 ? Math.round((completadas / total) * 100) : 0;

  // Próximos 2 eventos del proyecto
  const ahora         = new Date().toISOString();
  const proxEvs = eventos
    .filter(e => e.fecha_inicio > ahora)
    .sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio))
    .slice(0, 2);

  const card = document.createElement('div');
  card.className = 'planit-card';
  card.dataset.proyectoId = proyecto.id;
  card.style.cssText = `
    border-top: 3px solid ${proyecto.color || '#b060ff'};
    display:flex; flex-direction:column; gap:12px;
  `;

  // Cabecera de la tarjeta
  const cabecera = document.createElement('div');
  cabecera.style.cssText = 'display:flex; justify-content:space-between; align-items:flex-start;';
  cabecera.innerHTML = `
    <div>
      <h3 style="font-size:15px;font-weight:600;margin-bottom:4px;">${proyecto.nombre}</h3>
      ${proyecto.descripcion ? `<p style="font-size:12px;color:var(--texto-terciario);line-height:1.4;">${proyecto.descripcion}</p>` : ''}
    </div>
    <div style="display:flex;gap:6px;">
      <button class="planit-btn planit-btn--sm planit-btn--secundario"
        data-accion="editar-proyecto" data-proyecto-id="${proyecto.id}">···</button>
      <button class="planit-btn planit-btn--sm planit-btn--peligro"
        data-accion="eliminar-proyecto" data-proyecto-id="${proyecto.id}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
  `;

  // Barra de progreso de tareas
  const progresoWrap = document.createElement('div');
  progresoWrap.innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
      <span style="font-size:11px;color:var(--texto-terciario);font-family:var(--fuente-mono);">
        TAREAS
      </span>
      <span style="font-size:11px;color:var(--texto-terciario);font-family:var(--fuente-mono);">
        ${completadas}/${total}
      </span>
    </div>
    <div style="height:3px;background:var(--color-borde);border-radius:2px;overflow:hidden;">
      <div style="height:100%;width:${progreso}%;background:${proyecto.color || '#b060ff'};
        border-radius:2px;transition:width 0.4s ease;"></div>
    </div>
  `;

  card.appendChild(cabecera);
  card.appendChild(progresoWrap);

  // Próximos eventos
  if (proxEvs.length > 0) {
    const evSection = document.createElement('div');
    const evLabel = document.createElement('div');
    evLabel.className = 'planit-label';
    evLabel.style.marginBottom = '6px';
    evLabel.textContent = 'PRÓXIMOS EVENTOS';
    evSection.appendChild(evLabel);

    for (const ev of proxEvs) {
      const evRow = document.createElement('div');
      evRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:4px;';
      evRow.innerHTML = `
        <div style="width:3px;height:28px;background:${proyecto.color||'#b060ff'};border-radius:2px;flex-shrink:0;"></div>
        <div>
          <div style="font-size:12px;font-weight:500;">${ev.titulo}</div>
          <div style="font-size:11px;font-family:var(--fuente-mono);color:var(--texto-terciario);">
            ${formatearFecha(ev.fecha_inicio, 'dia-mes')} · ${ev.fecha_inicio.slice(11,16)}
          </div>
        </div>
      `;
      evSection.appendChild(evRow);
    }
    card.appendChild(evSection);
  }

  // Fechas del proyecto
  if (proyecto.fecha_inicio || proyecto.fecha_fin) {
    const fechas = document.createElement('div');
    fechas.style.cssText = 'font-size:11px;font-family:var(--fuente-mono);color:var(--texto-desactivado);border-top:0.5px solid var(--color-borde);padding-top:8px;';
    fechas.textContent = [
      proyecto.fecha_inicio ? `Inicio: ${proyecto.fecha_inicio.slice(0,10)}` : '',
      proyecto.fecha_fin    ? `Fin: ${proyecto.fecha_fin.slice(0,10)}`    : '',
    ].filter(Boolean).join('  ·  ');
    card.appendChild(fechas);
  }

  return card;
}

// ─── Formulario de proyecto ───────────────────────────────────

function construirFormProyecto(proyecto = null) {
  const colorInicial = proyecto?.color || COLORES_PROYECTO[0];
  const form = document.createElement('form');
  form.className = 'planit-form';
  form.innerHTML = `
    <div class="planit-campo">
      <label>Nombre del proyecto</label>
      <input type="text" name="nombre" required
        value="${proyecto?.nombre || ''}" placeholder="ej. PLANIT v1"/>
    </div>
    <div class="planit-campo">
      <label>Descripción (opcional)</label>
      <textarea name="descripcion" placeholder="¿De qué trata este proyecto?">${proyecto?.descripcion || ''}</textarea>
    </div>
    <div class="planit-campo">
      <label>Color</label>
      <div id="color-selector" style="display:flex;gap:8px;flex-wrap:wrap;">
        ${COLORES_PROYECTO.map(c => `
          <button type="button" data-color="${c}"
            style="width:28px;height:28px;border-radius:50%;background:${c};
              border:2.5px solid ${c === colorInicial ? '#fff' : 'transparent'};
              cursor:pointer;transition:transform var(--trans-rapida);"
            title="${c}">
          </button>
        `).join('')}
      </div>
      <input type="hidden" name="color" value="${colorInicial}"/>
    </div>
    <div class="planit-form__fila">
      <div class="planit-campo">
        <label>Fecha inicio (opcional)</label>
        <input type="date" name="fecha_inicio" value="${proyecto?.fecha_inicio?.slice(0,10) || ''}"/>
      </div>
      <div class="planit-campo">
        <label>Fecha fin (opcional)</label>
        <input type="date" name="fecha_fin" value="${proyecto?.fecha_fin?.slice(0,10) || ''}"/>
      </div>
    </div>
  `;

  // Selector de color interactivo
  form.querySelector('#color-selector').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-color]');
    if (!btn) return;
    form.querySelectorAll('[data-color]').forEach(b => b.style.borderColor = 'transparent');
    btn.style.borderColor = '#fff';
    form.querySelector('[name="color"]').value = btn.dataset.color;
  });

  return form;
}

// ─── Listeners ────────────────────────────────────────────────

function registrarListeners(contenedor, app, proyectos, tareas, eventos) {
  contenedor.addEventListener('click', async (e) => {
    const accion     = e.target.closest('[data-accion]')?.dataset.accion;
    const proyectoId = e.target.closest('[data-proyecto-id]')?.dataset.proyectoId;

    if (accion === 'nuevo-proyecto') {
      await flujoCrearProyecto(app);
    } else if (accion === 'editar-proyecto' && proyectoId) {
      await flujoEditarProyecto(app, proyectoId);
    } else if (accion === 'eliminar-proyecto' && proyectoId) {
      await flujoEliminarProyecto(app, proyectoId);
    }
  });
}

async function flujoCrearProyecto(app) {
  const form  = construirFormProyecto();
  const datos = await abrirModalFormulario({ titulo: 'Nuevo proyecto', formulario: form, labelGuardar: 'Crear' });
  if (!datos) return;

  await Proyectos.crear(app.db, {
    nombre:       datos.get('nombre'),
    descripcion:  datos.get('descripcion') || null,
    color:        datos.get('color') || COLORES_PROYECTO[0],
    fecha_inicio: datos.get('fecha_inicio') || null,
    fecha_fin:    datos.get('fecha_fin')    || null,
  });

  mostrarToast('Proyecto creado', 'exito');
  await navegarA('/proyectos');
}

async function flujoEditarProyecto(app, proyectoId) {
  const proyecto = await Proyectos.obtener(app.db, proyectoId);
  if (!proyecto) return;

  const form  = construirFormProyecto(proyecto);
  const datos = await abrirModalFormulario({ titulo: 'Editar proyecto', formulario: form, labelGuardar: 'Guardar' });
  if (!datos) return;

  await Proyectos.actualizar(app.db, proyectoId, {
    nombre:       datos.get('nombre'),
    descripcion:  datos.get('descripcion') || null,
    color:        datos.get('color'),
    fecha_inicio: datos.get('fecha_inicio') || null,
    fecha_fin:    datos.get('fecha_fin')    || null,
  });

  mostrarToast('Proyecto actualizado', 'exito');
  await navegarA('/proyectos');
}

async function flujoEliminarProyecto(app, proyectoId) {
  const proyecto = await Proyectos.obtener(app.db, proyectoId);
  if (!proyecto) return;

  const ok = await abrirModal({
    titulo: `¿Eliminar "${proyecto.nombre}"?`,
    contenido: 'Las tareas y eventos asociados no se eliminarán, pero perderán su referencia al proyecto.',
    labelConfirmar: 'Eliminar proyecto',
    peligroso: true,
  });
  if (!ok) return;

  await Proyectos.eliminar(app.db, proyectoId);
  mostrarToast('Proyecto eliminado', 'exito');
  await navegarA('/proyectos');
}