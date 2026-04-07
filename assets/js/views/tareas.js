/**
 * ============================================================
 * PLANIT — views/tareas.js
 * Vista de gestión de tareas con filtros y prioridades
 * ============================================================
 *
 * Layout:
 *   ┌─ Tareas ──────────────────── [+ Nueva] ─┐
 *   │ [Todas] [Pendientes] [Completadas]       │  ← filtros
 *   │ [Alta] [Media] [Baja]                    │  ← por prioridad
 *   ├──────────────────────────────────────────┤
 *   │ ○ Reunión Proyecto    [alta] [Pendiente] │
 *   │ ✓ Review UI           [media]            │  ← completada
 *   └──────────────────────────────────────────┘
 * ============================================================
 */

import { Tareas, Proyectos } from '../modules/db.js';
import {
  mostrarSkeleton, abrirModalFormulario, abrirModal,
  mostrarToast, crearEl,
} from '../modules/ui.js';
import { reproducirChime } from '../modules/notifications.js';
import { navegarA } from '../modules/router.js';

export async function render(app, contenedor) {
  mostrarSkeleton(contenedor, 'lista');

  let todasTareas = [], proyectos = [];
  try {
    [todasTareas, proyectos] = await Promise.all([
      Tareas.obtenerTodas(app.db),
      Proyectos.obtenerTodos(app.db),
    ]);
  } catch (err) {
    console.error('[Tareas] Error:', err);
  }

  // Estado de filtros (en memoria, se pierde al navegar)
  const estado = { filtro: 'pendientes', prioridad: 'todas' };

  contenedor.innerHTML = '';
  contenedor.appendChild(construirVista(app, todasTareas, proyectos, estado));
  registrarListeners(contenedor, app, todasTareas, proyectos, estado);
}

// ─── Construcción ─────────────────────────────────────────────

function construirVista(app, tareas, proyectos, estado) {
  const frag = document.createDocumentFragment();
  frag.appendChild(construirHeader());
  frag.appendChild(construirFiltros(estado));
  frag.appendChild(construirListaTareas(filtrarTareas(tareas, estado), proyectos));
  return frag;
}

function construirHeader() {
  const header = document.createElement('div');
  header.className = 'planit-vista-header';
  header.innerHTML = `<h2 class="planit-vista-titulo">Tareas</h2>`;

  const btn = crearEl('button', {
    clase: 'planit-btn planit-btn--ghost',
    texto: '+ Nueva tarea',
    attrs: { 'data-accion': 'nueva-tarea' },
  });
  header.appendChild(btn);
  return header;
}

function construirFiltros(estado) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex; flex-direction:column; gap:8px; margin-bottom:20px;';

  // Fila 1: estado
  const filaEstado = document.createElement('div');
  filaEstado.style.cssText = 'display:flex; gap:6px; flex-wrap:wrap;';

  for (const [val, label] of [['todas','Todas'],['pendientes','Pendientes'],['completadas','Completadas']]) {
    const btn = document.createElement('button');
    btn.className = `planit-btn planit-btn--sm ${estado.filtro === val ? 'planit-btn--primario' : 'planit-btn--secundario'}`;
    btn.dataset.filtroEstado = val;
    btn.textContent = label;
    filaEstado.appendChild(btn);
  }

  // Fila 2: prioridad
  const filaPrioridad = document.createElement('div');
  filaPrioridad.style.cssText = 'display:flex; gap:6px; flex-wrap:wrap;';

  for (const [val, label] of [['todas','Todas'],['alta','Alta'],['media','Media'],['baja','Baja']]) {
    const btn = document.createElement('button');
    btn.className = `planit-btn planit-btn--sm ${estado.prioridad === val ? 'planit-btn--primario' : 'planit-btn--secundario'}`;
    btn.dataset.filtroPrioridad = val;
    btn.textContent = label;
    filaPrioridad.appendChild(btn);
  }

  wrap.appendChild(filaEstado);
  wrap.appendChild(filaPrioridad);
  return wrap;
}

function construirListaTareas(tareas, proyectos) {
  const lista = document.createElement('div');
  lista.id = 'planit-lista-tareas';
  lista.style.cssText = 'display:flex; flex-direction:column; gap:6px;';

  if (tareas.length === 0) {
    const vacio = document.createElement('div');
    vacio.className = 'planit-vacio';
    vacio.innerHTML = `<p class="planit-vacio__mensaje">No hay tareas con estos filtros.</p>`;
    lista.appendChild(vacio);
    return lista;
  }

  // Agrupar por prioridad para mostrar separadores
  const grupos = { alta: [], media: [], baja: [] };
  for (const t of tareas) grupos[t.prioridad || 'media'].push(t);

  for (const [prio, items] of Object.entries(grupos)) {
    if (items.length === 0) continue;

    const sep = document.createElement('div');
    sep.className = 'planit-label';
    sep.style.cssText = 'padding:8px 0 4px; border-top:0.5px solid var(--color-borde); margin-top:8px;';
    sep.textContent = prio.toUpperCase();
    lista.appendChild(sep);

    for (const tarea of items) {
      lista.appendChild(crearFilaTarea(tarea, proyectos));
    }
  }

  return lista;
}

function crearFilaTarea(tarea, proyectos) {
  const proyecto   = proyectos.find(p => p.id === tarea.proyecto_id);
  // completada puede ser 0/1 (IndexedDB) o true/false (memoria en la sesión)
  const completada = Boolean(tarea.completada);

  const row = document.createElement('div');
  row.className = 'planit-card';
  row.dataset.tareaId = tarea.id;
  row.style.cssText = `
    display:flex; align-items:center; gap:12px;
    padding:10px 14px;
    ${completada ? 'opacity:0.55;' : ''}
    transition:opacity var(--trans-normal);
  `;

  // Checkbox
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = completada;
  checkbox.className = 'planit-checkbox';
  checkbox.style.cssText = `
    width:18px; height:18px; appearance:none; flex-shrink:0;
    border:1.5px solid var(--color-borde-hover); border-radius:4px;
    background:transparent; cursor:pointer;
    transition:border-color var(--trans-rapida), background var(--trans-rapida);
    position:relative;
  `;
  if (completada) {
    checkbox.style.background = 'var(--acento-cian)';
    checkbox.style.borderColor = 'var(--acento-cian)';
  }
  checkbox.dataset.accion = 'toggle-tarea';
  checkbox.dataset.tareaId = tarea.id;

  // Info
  const info = document.createElement('div');
  info.style.cssText = 'flex:1; min-width:0;';
  info.innerHTML = `
    <div style="font-size:14px;font-weight:500;
      ${completada ? 'text-decoration:line-through;color:var(--texto-terciario);' : ''}
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
      ${tarea.titulo}
    </div>
    <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap;align-items:center;">
      <span class="planit-badge-prioridad planit-badge-prioridad--${tarea.prioridad || 'media'}">
        ${tarea.prioridad || 'media'}
      </span>
      ${tarea.fecha_limite ? `<span style="font-family:var(--fuente-mono);font-size:10px;color:var(--texto-terciario);">${tarea.fecha_limite.slice(0,10)}</span>` : ''}
      ${proyecto ? `<span style="font-size:11px;color:${proyecto.color || 'var(--acento-purpura)'};background:${proyecto.color || 'var(--acento-purpura)'}18;padding:1px 6px;border-radius:20px;">${proyecto.nombre}</span>` : ''}
    </div>
  `;

  // Botón eliminar
  const btnEliminar = crearEl('button', {
    clase: 'planit-btn planit-btn--sm planit-btn--peligro',
    attrs: { 'data-accion': 'eliminar-tarea', 'data-tarea-id': tarea.id, 'aria-label': 'Eliminar tarea' },
  });
  btnEliminar.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`;

  row.appendChild(checkbox);
  row.appendChild(info);
  row.appendChild(btnEliminar);
  return row;
}

// ─── Filtros ──────────────────────────────────────────────────

function filtrarTareas(tareas, estado) {
  return tareas.filter(t => {
    // completada puede ser 0/1 o true/false — Boolean() normaliza ambos
    const estaCompletada = Boolean(t.completada);

    const pasaEstado =
      estado.filtro === 'todas' ||
      (estado.filtro === 'pendientes'  && !estaCompletada) ||
      (estado.filtro === 'completadas' && estaCompletada);

    const pasaPrioridad =
      estado.prioridad === 'todas' ||
      t.prioridad === estado.prioridad;

    return pasaEstado && pasaPrioridad;
  });
}

// ─── Formulario nueva tarea ───────────────────────────────────

function construirFormTarea(proyectos, tarea = null) {
  const form = document.createElement('form');
  form.className = 'planit-form';
  form.innerHTML = `
    <div class="planit-campo">
      <label>Título</label>
      <input type="text" name="titulo" required
        value="${tarea?.titulo || ''}" placeholder="¿Qué hay que hacer?"/>
    </div>
    <div class="planit-form__fila">
      <div class="planit-campo">
        <label>Prioridad</label>
        <select name="prioridad">
          <option value="alta"  ${tarea?.prioridad === 'alta'  ? 'selected' : ''}>Alta</option>
          <option value="media" ${!tarea || tarea?.prioridad === 'media' ? 'selected' : ''}>Media</option>
          <option value="baja"  ${tarea?.prioridad === 'baja'  ? 'selected' : ''}>Baja</option>
        </select>
      </div>
      <div class="planit-campo">
        <label>Fecha límite (opcional)</label>
        <input type="date" name="fecha_limite" value="${tarea?.fecha_limite?.slice(0,10) || ''}"/>
      </div>
    </div>
    ${proyectos.length > 0 ? `
    <div class="planit-campo">
      <label>Proyecto (opcional)</label>
      <select name="proyecto_id">
        <option value="">Sin proyecto</option>
        ${proyectos.map(p => `<option value="${p.id}" ${tarea?.proyecto_id === p.id ? 'selected' : ''}>${p.nombre}</option>`).join('')}
      </select>
    </div>
    ` : ''}
    <div class="planit-campo">
      <label>Notas (opcional)</label>
      <textarea name="notas" placeholder="Detalles adicionales...">${tarea?.notas || ''}</textarea>
    </div>
  `;
  return form;
}

// ─── Listeners ────────────────────────────────────────────────

function registrarListeners(contenedor, app, todasTareas, proyectos, estado) {
  contenedor.addEventListener('click', async (e) => {
    const accion  = e.target.closest('[data-accion]')?.dataset.accion;
    const tareaId = e.target.closest('[data-tarea-id]')?.dataset.tareaId;
    const filtroE = e.target.dataset.filtroEstado;
    const filtroP = e.target.dataset.filtroPrioridad;

    // Cambio de filtro → re-renderizar la lista sin recargar la vista
    if (filtroE) {
      estado.filtro = filtroE;
      actualizarFiltrosBtns(contenedor, estado);
      reemplazarLista(contenedor, filtrarTareas(todasTareas, estado), proyectos);
      return;
    }
    if (filtroP) {
      estado.prioridad = filtroP;
      actualizarFiltrosBtns(contenedor, estado);
      reemplazarLista(contenedor, filtrarTareas(todasTareas, estado), proyectos);
      return;
    }

    if (accion === 'nueva-tarea') {
      await flujoCrearTarea(app, proyectos, todasTareas, estado, contenedor);
    } else if (accion === 'toggle-tarea' && tareaId) {
      await flujoToggleTarea(app, tareaId, todasTareas, estado, contenedor, proyectos);
    } else if (accion === 'eliminar-tarea' && tareaId) {
      await flujoEliminarTarea(app, tareaId, todasTareas, estado, contenedor, proyectos);
    }
  });
}

async function flujoCrearTarea(app, proyectos, todasTareas, estado, contenedor) {
  const form  = construirFormTarea(proyectos);
  const datos = await abrirModalFormulario({ titulo: 'Nueva tarea', formulario: form, labelGuardar: 'Crear' });
  if (!datos) return;

  const nueva = await Tareas.crear(app.db, {
    titulo:       datos.get('titulo'),
    prioridad:    datos.get('prioridad') || 'media',
    fecha_limite: datos.get('fecha_limite') || null,
    proyecto_id:  datos.get('proyecto_id') || null,
    notas:        datos.get('notas') || null,
    completada:   0, // 0 = pendiente (IDB no indexa booleanos)
  });

  todasTareas.unshift(nueva);
  mostrarToast('Tarea creada', 'exito');
  reemplazarLista(contenedor, filtrarTareas(todasTareas, estado), proyectos);
}

async function flujoToggleTarea(app, tareaId, todasTareas, estado, contenedor, proyectos) {
  const idx = todasTareas.findIndex(t => t.id === tareaId);
  if (idx === -1) return;

  // Normalizar el valor actual (puede ser 0/1 o true/false) y flipear
  const nuevoValor = Boolean(todasTareas[idx].completada) ? 0 : 1;
  await Tareas.toggleCompletada(app.db, tareaId, nuevoValor);
  todasTareas[idx].completada = nuevoValor;

  if (nuevoValor === 1) reproducirChime(0.5); // feedback sonoro al completar

  reemplazarLista(contenedor, filtrarTareas(todasTareas, estado), proyectos);
}

async function flujoEliminarTarea(app, tareaId, todasTareas, estado, contenedor, proyectos) {
  const ok = await abrirModal({
    titulo: '¿Eliminar tarea?',
    contenido: 'Esta acción no se puede deshacer.',
    labelConfirmar: 'Eliminar',
    peligroso: true,
  });
  if (!ok) return;

  await Tareas.eliminar(app.db, tareaId);
  const idx = todasTareas.findIndex(t => t.id === tareaId);
  if (idx !== -1) todasTareas.splice(idx, 1);

  mostrarToast('Tarea eliminada', 'exito');
  reemplazarLista(contenedor, filtrarTareas(todasTareas, estado), proyectos);
}

// ─── Helpers de re-render parcial ────────────────────────────

function reemplazarLista(contenedor, tareasFiltradas, proyectos) {
  const vieja = contenedor.querySelector('#planit-lista-tareas');
  if (vieja) vieja.replaceWith(construirListaTareas(tareasFiltradas, proyectos));
}

function actualizarFiltrosBtns(contenedor, estado) {
  contenedor.querySelectorAll('[data-filtro-estado]').forEach(btn => {
    btn.className = `planit-btn planit-btn--sm ${estado.filtro === btn.dataset.filtroEstado ? 'planit-btn--primario' : 'planit-btn--secundario'}`;
  });
  contenedor.querySelectorAll('[data-filtro-prioridad]').forEach(btn => {
    btn.className = `planit-btn planit-btn--sm ${estado.prioridad === btn.dataset.filtroPrioridad ? 'planit-btn--primario' : 'planit-btn--secundario'}`;
  });
}