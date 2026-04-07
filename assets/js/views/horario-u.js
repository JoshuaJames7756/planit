/**
 * ============================================================
 * PLANIT — views/horario-u.js
 * Vista de horario universitario
 * ============================================================
 *
 * Muestra las materias del semestre activo organizadas
 * en una grilla visual de días de la semana.
 * Permite agregar, editar y desactivar materias.
 *
 * Layout:
 *   ┌──────── Semestre 2026-1 ─────────┐
 *   │ LUN    MAR    MIÉ    JUE    VIE  │
 *   │ [Cal2] [Cal2] [Cal2]             │
 *   │        [Prog]        [Prog]      │
 *   │ [Fís]         [Fís]             │
 *   └──────────────────────────────────┘
 * ============================================================
 */

import { HorarioU, Categorias } from '../modules/db.js';
import { mostrarSkeleton, abrirModalFormulario, mostrarToast, crearEl } from '../modules/ui.js';
import { navegarA } from '../modules/router.js';

const DIAS_ORDEN = ['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM'];

export async function render(app, contenedor) {
  mostrarSkeleton(contenedor, 'lista');

  let materias = [], categorias = [];
  try {
    [materias, categorias] = await Promise.all([
      HorarioU.obtenerActivas(app.db),
      Categorias.obtenerTodas(app.db),
    ]);
  } catch (err) {
    console.error('[HorarioU] Error:', err);
  }

  contenedor.innerHTML = '';
  contenedor.appendChild(construirVista(app, materias, categorias));
  registrarListeners(contenedor, app, categorias);
}

// ─── Construcción ─────────────────────────────────────────────

function construirVista(app, materias, categorias) {
  const frag = document.createDocumentFragment();

  // Header
  const header = document.createElement('div');
  header.className = 'planit-vista-header';
  header.innerHTML = `<h2 class="planit-vista-titulo">Horario universitario</h2>`;

  const btnAgregar = crearEl('button', {
    clase: 'planit-btn planit-btn--ghost',
    texto: '+ Agregar materia',
    attrs: { 'data-accion': 'nueva-materia' },
  });
  header.appendChild(btnAgregar);
  frag.appendChild(header);

  if (materias.length === 0) {
    const vacio = document.createElement('div');
    vacio.className = 'planit-vacio';
    vacio.innerHTML = `
      <p class="planit-vacio__mensaje">No hay materias registradas para este semestre.</p>
      <button class="planit-btn planit-btn--primario" data-accion="nueva-materia">
        Agregar primera materia
      </button>
    `;
    frag.appendChild(vacio);
    return frag;
  }

  // Grilla de días
  frag.appendChild(construirGrillaDias(materias, categorias));

  // Lista de materias con detalle
  frag.appendChild(construirListaMaterias(materias, categorias));

  return frag;
}

function construirGrillaDias(materias, categorias) {
  const wrap = document.createElement('div');
  wrap.className = 'planit-card';
  wrap.style.marginBottom = '24px';

  const diasConMaterias = DIAS_ORDEN.filter(d =>
    materias.some(m => m.dias.map(x => x.toUpperCase()).includes(d))
  );

  const grid = document.createElement('div');
  grid.style.cssText = `
    display: grid;
    grid-template-columns: repeat(${diasConMaterias.length}, 1fr);
    gap: 8px;
  `;

  for (const dia of diasConMaterias) {
    const col = document.createElement('div');

    const diaLabel = document.createElement('div');
    diaLabel.className = 'planit-label';
    diaLabel.style.marginBottom = '8px';
    diaLabel.textContent = dia;
    col.appendChild(diaLabel);

    const materiasDelDia = materias.filter(m =>
      m.dias.map(x => x.toUpperCase()).includes(dia)
    ).sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));

    for (const materia of materiasDelDia) {
      const color = materia.color ||
        categorias.find(c => c.id === materia.categoria_id)?.color ||
        '#b060ff';

      const chip = document.createElement('div');
      chip.dataset.materiaId = materia.id;
      chip.dataset.accion = 'ver-materia';
      chip.style.cssText = `
        background: color-mix(in srgb, ${color} 10%, transparent);
        border: 0.5px solid color-mix(in srgb, ${color} 30%, transparent);
        border-left: 3px solid ${color};
        border-radius: var(--radio-md);
        padding: 6px 8px;
        cursor: pointer;
        margin-bottom: 4px;
        transition: transform var(--trans-rapida);
      `;
      chip.innerHTML = `
        <div style="font-size:11px;font-weight:600;color:var(--texto-primario);
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${materia.materia}
        </div>
        <div style="font-family:var(--fuente-mono);font-size:10px;color:var(--texto-terciario);">
          ${materia.hora_inicio}–${materia.hora_fin}
        </div>
      `;
      chip.addEventListener('mouseenter', () => { chip.style.transform = 'translateY(-1px)'; });
      chip.addEventListener('mouseleave', () => { chip.style.transform = 'none'; });
      col.appendChild(chip);
    }

    grid.appendChild(col);
  }

  wrap.appendChild(grid);
  return wrap;
}

function construirListaMaterias(materias, categorias) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex; flex-direction:column; gap:8px;';

  const titulo = document.createElement('div');
  titulo.className = 'planit-label';
  titulo.style.marginBottom = '8px';
  titulo.textContent = 'Todas las materias';
  wrap.appendChild(titulo);

  for (const materia of materias) {
    const color = materia.color ||
      categorias.find(c => c.id === materia.categoria_id)?.color ||
      '#b060ff';

    const row = document.createElement('div');
    row.className = 'planit-card';
    row.dataset.materiaId = materia.id;
    row.style.cssText = `
      display:flex; justify-content:space-between; align-items:center;
      border-left: 3px solid ${color}; padding: 12px 16px; cursor:pointer;
    `;

    const info = document.createElement('div');
    info.innerHTML = `
      <div style="font-weight:500;font-size:14px;margin-bottom:4px;">${materia.materia}</div>
      <div style="font-size:12px;font-family:var(--fuente-mono);color:var(--texto-terciario);">
        ${materia.dias.join(' · ')} &nbsp;|&nbsp; ${materia.hora_inicio}–${materia.hora_fin}
        ${materia.aula ? ` &nbsp;|&nbsp; ${materia.aula}` : ''}
      </div>
    `;

    const acciones = document.createElement('div');
    acciones.style.cssText = 'display:flex; gap:8px; flex-shrink:0;';
    acciones.innerHTML = `
      <button class="planit-btn planit-btn--sm planit-btn--secundario"
        data-accion="editar-materia" data-materia-id="${materia.id}">Editar</button>
      <button class="planit-btn planit-btn--sm planit-btn--peligro"
        data-accion="eliminar-materia" data-materia-id="${materia.id}">Quitar</button>
    `;

    row.appendChild(info);
    row.appendChild(acciones);
    wrap.appendChild(row);
  }

  return wrap;
}

function construirFormMateria(categorias, materia = null) {
  const form = document.createElement('form');
  form.className = 'planit-form';

  const diasSeleccionados = new Set(
    (materia?.dias || []).map(d => d.toUpperCase())
  );

  // Paleta de colores para materias
  const COLORES = [
    '#7C3AED', '#2563EB', '#059669', '#DC2626',
    '#D97706', '#DB2777', '#0891B2', '#65A30D',
  ];
  const colorActual = materia?.color || COLORES[0];

  form.innerHTML = `
    <div class="planit-campo">
      <label>Nombre de la materia</label>
      <input type="text" name="materia" required
        value="${materia?.materia || ''}" placeholder="ej. Cálculo II"/>
    </div>
    <div class="planit-form__fila">
      <div class="planit-campo">
        <label>Hora inicio</label>
        <input type="time" name="hora_inicio" required value="${materia?.hora_inicio || '08:00'}"/>
      </div>
      <div class="planit-campo">
        <label>Hora fin</label>
        <input type="time" name="hora_fin" required value="${materia?.hora_fin || '10:00'}"/>
      </div>
    </div>
    <div class="planit-campo">
      <label>Días de clase</label>
      <div class="planit-dias-semana" id="dias-selector">
        ${DIAS_ORDEN.map(d => `
          <button type="button" class="planit-dia-btn ${diasSeleccionados.has(d) ? 'activo' : ''}"
            data-dia="${d}">${d.slice(0,2)}</button>
        `).join('')}
      </div>
    </div>
    <div class="planit-campo">
      <label>Color de la materia</label>
      <div style="display:flex; gap:8px; flex-wrap:wrap;" id="color-selector">
        ${COLORES.map(c => `
          <button type="button"
            data-color="${c}"
            style="
              width:28px; height:28px; border-radius:50%;
              background:${c}; border:2px solid transparent;
              cursor:pointer; transition:transform 0.15s, border-color 0.15s;
              ${c === colorActual ? 'border-color:white; transform:scale(1.2);' : ''}
            "
          ></button>
        `).join('')}
      </div>
      <input type="hidden" name="color" id="color-hidden" value="${colorActual}"/>
    </div>
    <div class="planit-form__fila">
      <div class="planit-campo">
        <label>Docente (opcional)</label>
        <input type="text" name="docente" value="${materia?.docente || ''}" placeholder="ej. Dr. García"/>
      </div>
      <div class="planit-campo">
        <label>Aula (opcional)</label>
        <input type="text" name="aula" value="${materia?.aula || ''}" placeholder="ej. Lab 3B"/>
      </div>
    </div>
    <div class="planit-campo">
      <label>Semestre</label>
      <input type="text" name="semestre" required value="${materia?.semestre || ''}" placeholder="ej. 2026-1"/>
    </div>
    <input type="hidden" name="dias" id="dias-hidden" value="${(materia?.dias || []).join(',')}"/>
  `;

  // Selección de días
  form.querySelector('#dias-selector').addEventListener('click', (e) => {
    const btn = e.target.closest('.planit-dia-btn');
    if (!btn) return;
    btn.classList.toggle('activo');
    const activos = [...form.querySelectorAll('.planit-dia-btn.activo')]
      .map(b => b.dataset.dia);
    form.querySelector('#dias-hidden').value = activos.join(',');
  });

  // Selección de color
  form.querySelector('#color-selector').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-color]');
    if (!btn) return;
    // Resetear todos
    form.querySelectorAll('#color-selector button').forEach(b => {
      b.style.borderColor = 'transparent';
      b.style.transform = 'scale(1)';
    });
    // Activar el seleccionado
    btn.style.borderColor = 'white';
    btn.style.transform = 'scale(1.2)';
    form.querySelector('#color-hidden').value = btn.dataset.color;
  });

  return form;
}

// ─── Listeners ────────────────────────────────────────────────

function registrarListeners(contenedor, app, categorias) {
  contenedor.addEventListener('click', async (e) => {
    const accion    = e.target.closest('[data-accion]')?.dataset.accion;
    const materiaId = e.target.closest('[data-materia-id]')?.dataset.materiaId;

    if (accion === 'nueva-materia') {
      await flujoCrearMateria(app, categorias);
    } else if (accion === 'editar-materia' && materiaId) {
      await flujoEditarMateria(app, materiaId, categorias);
    } else if (accion === 'eliminar-materia' && materiaId) {
      await flujoEliminarMateria(app, materiaId);
    }
  });
}

async function flujoCrearMateria(app, categorias) {
  const form  = construirFormMateria(categorias);
  const datos = await abrirModalFormulario({ titulo: 'Nueva materia', formulario: form, labelGuardar: 'Agregar' });
  if (!datos) return;

  const diasStr = datos.get('dias');
  if (!diasStr) { mostrarToast('Selecciona al menos un día', 'aviso'); return; }

  await HorarioU.crear(app.db, {
    materia:     datos.get('materia'),
    hora_inicio: datos.get('hora_inicio'),
    hora_fin:    datos.get('hora_fin'),
    dias:        diasStr.split(',').filter(Boolean),
    docente:     datos.get('docente') || null,
    aula:        datos.get('aula')    || null,
    semestre:    datos.get('semestre'),
    color:       datos.get('color') || '#7C3AED', // ← AGREGAR
    activa:      1,
  });

  mostrarToast('Materia agregada', 'exito');
  await navegarA('/horario-u');
}

async function flujoEditarMateria(app, materiaId, categorias) {
  const materia = await HorarioU.obtener(app.db, materiaId);
  if (!materia) return;

  const form  = construirFormMateria(categorias, materia);
  const datos = await abrirModalFormulario({ titulo: 'Editar materia', formulario: form, labelGuardar: 'Guardar' });
  if (!datos) return;

  const diasStr = datos.get('dias');
  await HorarioU.actualizar(app.db, materiaId, {
    materia:     datos.get('materia'),
    hora_inicio: datos.get('hora_inicio'),
    hora_fin:    datos.get('hora_fin'),
    dias:        diasStr ? diasStr.split(',').filter(Boolean) : materia.dias,
    docente:     datos.get('docente') || null,
    aula:        datos.get('aula')    || null,
    semestre:    datos.get('semestre'),
    color:       datos.get('color') || materia.color || '#7C3AED', // ← AGREGAR
  });

  mostrarToast('Materia actualizada', 'exito');
  await navegarA('/horario-u');
}

async function flujoEliminarMateria(app, materiaId) {
  const materia = await HorarioU.obtener(app.db, materiaId);
  if (!materia) return;

  const { abrirModal } = await import('../modules/ui.js');
  const ok = await abrirModal({
    titulo: `¿Quitar "${materia.materia}"?`,
    contenido: 'Desaparecerá del calendario. No se puede deshacer.',
    labelConfirmar: 'Quitar',
    peligroso: true,
  });
  if (!ok) return;

  await HorarioU.eliminar(app.db, materiaId);
  mostrarToast('Materia eliminada', 'exito');
  await navegarA('/horario-u');
}