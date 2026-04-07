/**
 * ============================================================
 * PLANIT — main.js
 * Punto de entrada principal
 * ============================================================
 */

import { abrirDB, Categorias }           from './modules/db.js';
import { mostrarToast }                  from './modules/ui.js';
import { inicializarNotificaciones,
         programarProximaAlarma,
         reproducirChime }               from './modules/notifications.js';
import { app, setNavigator, navegarA,
         hoyISO, isoADate }              from './modules/router.js';

// ─── Vistas — rutas RELATIVAS desde /assets/js/ ──────────────
const VISTAS = {
  '/agenda'    : () => import('./views/agenda.js'),
  '/semana'    : () => import('./views/semana.js'),
  '/mes'       : () => import('./views/mes.js'),
  '/horario-u' : () => import('./views/horario-u.js'),
  '/proyectos' : () => import('./views/proyectos.js'),
  '/tareas'    : () => import('./views/tareas.js'),
};

const VISTA_POR_DEFECTO = '/agenda';

// ─── Inicialización ───────────────────────────────────────────
async function init() {
  try {
    app.db = await abrirDB();
    await Categorias.sembrarDefecto(app.db);
    app.categorias = await Categorias.obtenerTodas(app.db);
    console.log('[PLANIT] DB lista —', app.categorias.length, 'categorías');

    // Registrar el navigator ANTES de cualquier render
    setNavigator(_navegarA);

    // ⚡ CRÍTICO: SW y notificaciones se lanzan sin await para NO
    // bloquear el render. Si tardan o fallan, la app ya está visible.
    registrarServiceWorker();
    inicializarNotificaciones(app.db);

    configurarNavegacion();

    // Este sí lo esperamos — es el render de la vista inicial
    await _navegarA(leerRutaActual());

  } catch (error) {
    console.error('[PLANIT] Error crítico:', error);
    mostrarErrorCritico(error);
  }
}

// ─── Navegación ───────────────────────────────────────────────
async function _navegarA(ruta) {
  const rutaFinal = VISTAS[ruta] ? ruta : VISTA_POR_DEFECTO;

  let contenedor = document.getElementById('planit-vista');
  if (!contenedor) return;

  // Clonar mata listeners viejos
  const nuevoContenedor = contenedor.cloneNode(false);

  // Limpiar clases de vistas anteriores y aplicar la nueva
  nuevoContenedor.className = 'planit-vista';
  if (rutaFinal === '/mes') nuevoContenedor.classList.add('planit-vista--mes');

  contenedor.parentNode.replaceChild(nuevoContenedor, contenedor);
  contenedor = nuevoContenedor;

  contenedor.innerHTML = `
    <div class="planit-cargando-inicial">
      <div class="planit-spinner" role="status"></div>
    </div>`;

  try {
    const modulo = await VISTAS[rutaFinal]();
    contenedor.innerHTML = '';
    await modulo.render(app, contenedor);
    app.vistaActual = rutaFinal;
    actualizarNavActiva(rutaFinal);
  } catch (error) {
    console.error(`[PLANIT] Error vista '${rutaFinal}':`, error);
    contenedor.innerHTML = `<div class="planit-error-vista"><p>Error al cargar.</p></div>`;
  }
}

// ─── Service Worker ───────────────────────────────────────────
async function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    reg.addEventListener('updatefound', () =>
      mostrarToast('Nueva versión disponible. Recarga para actualizar.', 'info')
    );
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.tipo === 'NAVEGAR') _navegarA(e.data.ruta);
    });
  } catch (err) {
    console.warn('[PLANIT] SW no registrado:', err);
  }
}

// ─── Router ───────────────────────────────────────────────────
function leerRutaActual() {
  const hash = window.location.hash.replace('#', '') || VISTA_POR_DEFECTO;
  return hash.startsWith('/') ? hash : `/${hash}`;
}

function configurarNavegacion() {
  // hashchange para el botón atrás del navegador
  window.addEventListener('hashchange', () => _navegarA(leerRutaActual()));

  document.addEventListener('click', (e) => {
    const enlace = e.target.closest('.planit-nav__item[data-ruta]');
    if (!enlace) return;
    e.preventDefault();
    _navegarA(enlace.dataset.ruta);
  });

  // FAB de crear evento
  document.getElementById('planit-btn-crear')
    ?.addEventListener('click', abrirFormularioEvento);
  document.getElementById('planit-btn-crear-mobile')
    ?.addEventListener('click', abrirFormularioEvento);
}

function actualizarNavActiva(rutaActual) {
  document.querySelectorAll('[data-ruta]').forEach((el) =>
    el.classList.toggle('activo', el.dataset.ruta === rutaActual)
  );
}

// ─── Formulario de nuevo evento (FAB) ────────────────────────
async function abrirFormularioEvento() {
  const { abrirModalFormulario } = await import('./modules/ui.js');
  const { Eventos } = await import('./modules/db.js');

  const fechaHoy = app.fechaActiva || hoyISO();
  const ahora  = new Date();
  const enHora = new Date(ahora.getTime() + 3600000);
  const pad    = (n) => String(n).padStart(2, '0');

  const form = document.createElement('form');
  form.className = 'planit-form';
  form.innerHTML = `
    <div class="planit-campo">
      <label>Tipo de evento</label>
      <div style="display:flex; gap:8px;" id="tipo-selector">
        <button type="button" class="planit-tipo-btn activo" data-tipo="evento">
          📅 Evento
        </button>
        <button type="button" class="planit-tipo-btn" data-tipo="examen">
          🎯 Examen
        </button>
      </div>
      <input type="hidden" name="tipo" id="tipo-hidden" value="evento"/>
    </div>
    <div class="planit-campo">
      <label>Título</label>
      <input type="text" name="titulo" required placeholder="ej. Parcial Cálculo II"/>
    </div>
    <div class="planit-form__fila">
      <div class="planit-campo">
        <label>Fecha</label>
        <input type="date" name="fecha" required value="${fechaHoy}"/>
      </div>
      <div class="planit-campo">
        <label>Categoría</label>
        <select name="categoria_id">
          <option value="">Sin categoría</option>
          ${app.categorias.map(c =>
            `<option value="${c.id}">${c.nombre}</option>`
          ).join('')}
        </select>
      </div>
    </div>
    <div class="planit-form__fila">
      <div class="planit-campo">
        <label>Hora inicio</label>
        <input type="time" name="hora_inicio" required
          value="${pad(ahora.getHours())}:${pad(ahora.getMinutes())}"/>
      </div>
      <div class="planit-campo">
        <label>Hora fin</label>
        <input type="time" name="hora_fin" required
          value="${pad(enHora.getHours())}:${pad(enHora.getMinutes())}"/>
      </div>
    </div>
    <div id="campos-examen" style="display:none; flex-direction:column; gap:16px;">
      <div class="planit-campo">
        <label>Temas a repasar (uno por línea)</label>
        <textarea name="temas" placeholder="Ej:\nDerivadas\nIntegrales\nLímites"
          style="min-height:100px;"></textarea>
      </div>
      <div class="planit-campo">
        <label>Aula / Sala</label>
        <input type="text" name="aula_examen" placeholder="ej. Aula 302"/>
      </div>
    </div>
    <div class="planit-campo">
      <label>Notas (opcional)</label>
      <textarea name="notas" placeholder="Detalles adicionales..."></textarea>
    </div>
  `;

  form.querySelector('#tipo-selector').addEventListener('click', (e) => {
    const btn = e.target.closest('.planit-tipo-btn');
    if (!btn) return;
    form.querySelectorAll('.planit-tipo-btn').forEach(b => b.classList.remove('activo'));
    btn.classList.add('activo');
    form.querySelector('#tipo-hidden').value = btn.dataset.tipo;
    const camposExamen = form.querySelector('#campos-examen');
    camposExamen.style.display = btn.dataset.tipo === 'examen' ? 'flex' : 'none';
  });

  const datos = await abrirModalFormulario({
    titulo: 'Nuevo evento',
    formulario: form,
    labelGuardar: 'Crear',
  });
  if (!datos) return;

  const fecha = datos.get('fecha');
  const tipo  = datos.get('tipo');

  const temasRaw = datos.get('temas') || '';
  const temas = temasRaw.split('\n').map(t => t.trim()).filter(Boolean);

  await Eventos.crear(app.db, {
    titulo:       datos.get('titulo'),
    fecha_inicio: `${fecha}T${datos.get('hora_inicio')}:00`,
    fecha_fin:    `${fecha}T${datos.get('hora_fin')}:00`,
    categoria_id: datos.get('categoria_id') || null,
    proyecto_id:  null,
    notas:        datos.get('notas') || null,
    tipo:         tipo,
    temas:        tipo === 'examen' ? temas : [],
    aula_examen:  tipo === 'examen' ? (datos.get('aula_examen') || null) : null,
    temas_completados: [],
  });

  reproducirChime(0.6);
  mostrarToast(tipo === 'examen' ? '¡Examen registrado!' : 'Evento creado', 'exito');
  await programarProximaAlarma(app.db);

  if (['/agenda', '/mes', '/semana'].includes(app.vistaActual)) {
    await _navegarA(app.vistaActual);
  }
}

// ─── Error crítico ────────────────────────────────────────────
function mostrarErrorCritico(error) {
  const c = document.getElementById('planit-vista') || document.body;
  c.innerHTML = `
    <div class="planit-error-critico">
      <h2>PLANIT no pudo iniciarse</h2>
      <p>Verifica que tu navegador permita almacenamiento local.</p>
      <details>
        <summary>Detalle técnico</summary>
        <code>${error.message}</code>
      </details>
    </div>`;
}

document.addEventListener('DOMContentLoaded', init);