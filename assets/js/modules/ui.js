/**
 * ============================================================
 * PLANIT — ui.js
 * Sistema de componentes reutilizables de interfaz
 * ============================================================
 *
 * Responsabilidades:
 *   1. Toast notifications (mensajes temporales)
 *   2. Modal genérico (confirmaciones, formularios)
 *   3. Skeleton loaders (placeholders mientras carga)
 *   4. Renderizado de bloques de evento (timeline)
 *   5. Badge de categoría con color
 *   6. Helpers de DOM (crear elementos, limpiar contenedor)
 *
 * Principio: todas las funciones son puras en cuanto al DOM —
 * reciben datos, devuelven o insertan elementos. No tocan
 * IndexedDB ni el estado global `app`.
 * ============================================================
 */

// ─── Toast ────────────────────────────────────────────────────

/**
 * Contenedor singleton de toasts. Se crea una sola vez
 * y se reutiliza para todas las notificaciones.
 * @type {HTMLElement|null}
 */
let _toastContenedor = null;

function obtenerContenedorToast() {
  if (_toastContenedor) return _toastContenedor;

  _toastContenedor = document.createElement('div');
  _toastContenedor.id = 'planit-toasts';
  _toastContenedor.setAttribute('aria-live', 'polite');
  _toastContenedor.setAttribute('aria-atomic', 'false');
  document.body.appendChild(_toastContenedor);
  return _toastContenedor;
}

/**
 * Muestra un mensaje temporal tipo toast en la esquina
 * inferior de la pantalla.
 *
 * @param {string} mensaje
 * @param {'info'|'exito'|'error'|'aviso'} tipo
 * @param {number} duracionMs - tiempo antes de desaparecer (default 3500ms)
 */
export function mostrarToast(mensaje, tipo = 'info', duracionMs = 3500) {
  const contenedor = obtenerContenedorToast();

  const toast = document.createElement('div');
  toast.className = `planit-toast planit-toast--${tipo}`;
  toast.setAttribute('role', 'status');
  toast.textContent = mensaje;

  // Botón de cierre manual
  const cerrar = document.createElement('button');
  cerrar.className = 'planit-toast__cerrar';
  cerrar.setAttribute('aria-label', 'Cerrar notificación');
  cerrar.textContent = '×';
  cerrar.addEventListener('click', () => eliminarToast(toast));
  toast.appendChild(cerrar);

  contenedor.appendChild(toast);

  // Animar entrada (la clase se agrega en el siguiente frame
  // para que la transición CSS tenga efecto)
  requestAnimationFrame(() => toast.classList.add('planit-toast--visible'));

  // Auto-eliminar después de duracionMs
  setTimeout(() => eliminarToast(toast), duracionMs);
}

function eliminarToast(toast) {
  toast.classList.remove('planit-toast--visible');
  // Esperar a que termine la transición de salida antes de quitar del DOM
  toast.addEventListener('transitionend', () => toast.remove(), { once: true });
}

// ─── Modal ────────────────────────────────────────────────────

/**
 * Abre un modal genérico con título, contenido y botones de acción.
 * Devuelve una Promise que resuelve con true (confirmar) o false (cancelar).
 *
 * Uso típico:
 *   const confirmado = await abrirModal({
 *     titulo: '¿Eliminar evento?',
 *     contenido: 'Esta acción no se puede deshacer.',
 *     labelConfirmar: 'Eliminar',
 *     peligroso: true,
 *   });
 *   if (confirmado) await Eventos.eliminar(db, id);
 *
 * @param {object} opciones
 * @param {string}      opciones.titulo
 * @param {string|HTMLElement} opciones.contenido - texto o nodo DOM
 * @param {string}      [opciones.labelConfirmar='Confirmar']
 * @param {string}      [opciones.labelCancelar='Cancelar']
 * @param {boolean}     [opciones.peligroso=false] - aplica estilo destructivo al botón
 * @returns {Promise<boolean>}
 */
export function abrirModal(opciones) {
  const {
    titulo,
    contenido,
    labelConfirmar = 'Confirmar',
    labelCancelar  = 'Cancelar',
    peligroso      = false,
  } = opciones;

  return new Promise((resolve) => {
    // Overlay
    const overlay = document.createElement('div');
    overlay.className = 'planit-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'planit-modal-titulo');

    // Panel del modal
    const panel = document.createElement('div');
    panel.className = 'planit-modal';

    // Título
    const h2 = document.createElement('h2');
    h2.id = 'planit-modal-titulo';
    h2.className = 'planit-modal__titulo';
    h2.textContent = titulo;

    // Cuerpo
    const cuerpo = document.createElement('div');
    cuerpo.className = 'planit-modal__cuerpo';
    if (typeof contenido === 'string') {
      cuerpo.textContent = contenido;
    } else {
      cuerpo.appendChild(contenido);
    }

    // Acciones
    const acciones = document.createElement('div');
    acciones.className = 'planit-modal__acciones';

    const btnCancelar = document.createElement('button');
    btnCancelar.className = 'planit-btn planit-btn--secundario';
    btnCancelar.textContent = labelCancelar;

    const btnConfirmar = document.createElement('button');
    btnConfirmar.className = `planit-btn ${peligroso ? 'planit-btn--peligro' : 'planit-btn--primario'}`;
    btnConfirmar.textContent = labelConfirmar;

    // Función de cierre reutilizable
    const cerrar = (resultado) => {
      overlay.classList.remove('planit-modal-overlay--visible');
      overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
      resolve(resultado);
    };

    btnCancelar.addEventListener('click',  () => cerrar(false));
    btnConfirmar.addEventListener('click', () => cerrar(true));

    // Cerrar al hacer click en el overlay (fuera del panel)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cerrar(false);
    });

    // Cerrar con Escape
    const onKeydown = (e) => {
      if (e.key === 'Escape') {
        cerrar(false);
        document.removeEventListener('keydown', onKeydown);
      }
    };
    document.addEventListener('keydown', onKeydown);

    acciones.appendChild(btnCancelar);
    acciones.appendChild(btnConfirmar);
    panel.appendChild(h2);
    panel.appendChild(cuerpo);
    panel.appendChild(acciones);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // Animar entrada
    requestAnimationFrame(() => overlay.classList.add('planit-modal-overlay--visible'));

    // Focus al botón confirmar para accesibilidad
    btnConfirmar.focus();
  });
}

/**
 * Abre un modal con un formulario HTML arbitrario.
 * Devuelve los datos del formulario como FormData, o null si se canceló.
 *
 * Uso:
 *   const datos = await abrirModalFormulario({
 *     titulo: 'Nuevo evento',
 *     formulario: construirFormEvento(),
 *   });
 *
 * @param {object} opciones
 * @param {string}      opciones.titulo
 * @param {HTMLElement} opciones.formulario - nodo <form> o <div> con inputs
 * @param {string}      [opciones.labelGuardar='Guardar']
 * @returns {Promise<FormData|null>}
 */
export function abrirModalFormulario({ titulo, formulario, labelGuardar = 'Guardar' }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'planit-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'planit-modal-form-titulo');

    const panel = document.createElement('div');
    panel.className = 'planit-modal planit-modal--formulario';

    const h2 = document.createElement('h2');
    h2.id = 'planit-modal-form-titulo';
    h2.className = 'planit-modal__titulo';
    h2.textContent = titulo;

    const cuerpo = document.createElement('div');
    cuerpo.className = 'planit-modal__cuerpo';
    cuerpo.appendChild(formulario);

    const acciones = document.createElement('div');
    acciones.className = 'planit-modal__acciones';

    const btnCancelar = document.createElement('button');
    btnCancelar.type = 'button';
    btnCancelar.className = 'planit-btn planit-btn--secundario';
    btnCancelar.textContent = 'Cancelar';

    const btnGuardar = document.createElement('button');
    btnGuardar.type = 'button';
    btnGuardar.className = 'planit-btn planit-btn--primario';
    btnGuardar.textContent = labelGuardar;

    const cerrar = (resultado) => {
      overlay.classList.remove('planit-modal-overlay--visible');
      overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
      resolve(resultado);
    };

    btnCancelar.addEventListener('click', () => cerrar(null));
    btnGuardar.addEventListener('click', () => {
      // Si el contenido tiene un <form>, usar FormData nativo
      const form = formulario.tagName === 'FORM'
        ? formulario
        : formulario.querySelector('form');
      cerrar(form ? new FormData(form) : null);
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cerrar(null);
    });

    acciones.appendChild(btnCancelar);
    acciones.appendChild(btnGuardar);
    panel.appendChild(h2);
    panel.appendChild(cuerpo);
    panel.appendChild(acciones);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => overlay.classList.add('planit-modal-overlay--visible'));
  });
}

// ─── Skeleton loaders ─────────────────────────────────────────

/**
 * Genera un placeholder animado mientras se cargan los datos.
 * Cada vista llama a esto antes de hacer las consultas a IndexedDB.
 *
 * @param {HTMLElement} contenedor
 * @param {'agenda'|'semana'|'mes'|'lista'} tipo
 */
export function mostrarSkeleton(contenedor, tipo = 'lista') {
  const plantillas = {
    agenda: `
      <div class="planit-skeleton planit-skeleton--header"></div>
      ${Array(4).fill('<div class="planit-skeleton planit-skeleton--evento"></div>').join('')}
    `,
    semana: `
      <div class="planit-skeleton planit-skeleton--header"></div>
      <div class="planit-skeleton planit-skeleton--grid-semana"></div>
    `,
    mes: `
      <div class="planit-skeleton planit-skeleton--header"></div>
      <div class="planit-skeleton planit-skeleton--grid-mes"></div>
    `,
    lista: Array(5).fill(`
      <div class="planit-skeleton-fila">
        <div class="planit-skeleton planit-skeleton--dot"></div>
        <div class="planit-skeleton planit-skeleton--linea"></div>
      </div>
    `).join(''),
  };

  contenedor.innerHTML = `
    <div class="planit-skeleton-wrap" aria-hidden="true">
      ${plantillas[tipo] || plantillas.lista}
    </div>
  `;
}

// ─── Bloque de evento (timeline) ─────────────────────────────

/**
 * Construye el elemento DOM de un bloque de evento para la
 * vista de agenda/día. Reutilizado en agenda.js y semana.js.
 *
 * @param {object}   evento
 * @param {object[]} categorias  - array completo de categorías
 * @returns {HTMLElement}        - <article> listo para insertar
 */
export function crearBloqueEvento(evento, categorias = []) {
  const categoria = categorias.find((c) => c.id === evento.categoria_id);
  const color     = evento.color || categoria?.color || '#5a6a7e';

  const article = document.createElement('article');
  article.className = `planit-evento${evento.virtual ? ' planit-evento--virtual' : ''}`;
  article.dataset.id = evento.id;
  article.style.setProperty('--evento-color', color);

  // Fondo con tinte sutil del color del evento
  article.style.background = `color-mix(in srgb, ${color} 8%, var(--color-superficie))`;
  article.style.borderLeft  = `3px solid ${color}`;
  article.style.borderRadius = 'var(--radio-md)';
  article.style.padding      = '10px 14px';
  article.style.marginBottom = '6px';
  article.style.cursor       = 'pointer';
  article.style.transition   = 'transform 0.15s, box-shadow 0.15s';
  article.style.position     = 'relative';

  article.addEventListener('mouseenter', () => {
    article.style.transform  = 'translateX(2px)';
    article.style.boxShadow  = `0 2px 12px color-mix(in srgb, ${color} 20%, transparent)`;
  });
  article.addEventListener('mouseleave', () => {
    article.style.transform  = '';
    article.style.boxShadow  = '';
  });

  // Fila superior: hora + badge categoría
  const fila = document.createElement('div');
  fila.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;';

  const hora = document.createElement('time');
  hora.className = 'planit-evento__hora';
  hora.dateTime  = evento.fecha_inicio;
  hora.textContent = `${evento.fecha_inicio.slice(11, 16)} – ${evento.fecha_fin.slice(11, 16)}`;
  hora.style.cssText = `font-size:11px; font-family:var(--fuente-mono); color:${color}; font-weight:600;`;

  fila.appendChild(hora);

  if (categoria) {
    const badge = document.createElement('span');
    badge.textContent = categoria.nombre;
    badge.style.cssText = `
      font-size:10px; font-family:var(--fuente-mono);
      background:color-mix(in srgb, ${color} 15%, transparent);
      color:${color}; padding:2px 7px; border-radius:20px;
      letter-spacing:0.5px;
    `;
    fila.appendChild(badge);
  }

  // Título
  const titulo = document.createElement('h3');
  titulo.className = 'planit-evento__titulo';
  titulo.textContent = evento.titulo;
  titulo.style.cssText = 'font-size:14px; font-weight:500; color:var(--texto-primario); margin:0;';

  // Tag universitario
  if (evento.virtual) {
    const tag = document.createElement('span');
    tag.className = 'planit-evento__tag-u';
    tag.textContent = 'U';
    tag.title = 'Horario universitario';
    tag.style.cssText = `
      position:absolute; top:8px; right:10px;
      font-size:10px; font-family:var(--fuente-mono); font-weight:700;
      color:${color}; opacity:0.7;
    `;
    article.appendChild(tag);
  }

  article.appendChild(fila);
  article.appendChild(titulo);

  return article;
}

// ─── Badge de categoría ───────────────────────────────────────

/**
 * Crea un pequeño badge con el nombre y color de una categoría.
 *
 * @param {object} categoria - { nombre, color }
 * @returns {HTMLElement}
 */
export function crearBadgeCategoria(categoria) {
  const badge = document.createElement('span');
  badge.className = 'planit-badge-categoria';
  badge.textContent = categoria.nombre;
  badge.style.setProperty('--badge-color', categoria.color);
  return badge;
}

// ─── Helpers de DOM ───────────────────────────────────────────

/**
 * Crea un elemento HTML con clase, atributos y texto en una línea.
 * Reduce el boilerplate de document.createElement repetitivo.
 *
 * @param {string} tag
 * @param {object} [opciones]
 * @param {string}   [opciones.clase]
 * @param {string}   [opciones.texto]
 * @param {object}   [opciones.attrs]   - { 'data-id': '123', role: 'button' }
 * @returns {HTMLElement}
 */
export function crearEl(tag, { clase, texto, attrs } = {}) {
  const el = document.createElement(tag);
  if (clase) el.className = clase;
  if (texto) el.textContent = texto;
  if (attrs) {
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  }
  return el;
}

/**
 * Vacía un contenedor de forma segura y eficiente.
 * Más rápido que innerHTML = '' para nodos con muchos hijos.
 *
 * @param {HTMLElement} contenedor
 */
export function limpiarContenedor(contenedor) {
  while (contenedor.firstChild) {
    contenedor.removeChild(contenedor.firstChild);
  }
}

/**
 * Genera un mensaje de estado vacío cuando no hay datos que mostrar.
 *
 * @param {string} mensaje   - Ej: "No hay eventos para hoy"
 * @param {string} [accion]  - Texto del botón opcional
 * @param {string} [ruta]    - data-ruta del botón
 * @returns {HTMLElement}
 */
export function crearEstadoVacio(mensaje, accion = null, ruta = null) {
  const wrap = crearEl('div', { clase: 'planit-vacio' });
  const p    = crearEl('p',   { clase: 'planit-vacio__mensaje', texto: mensaje });
  wrap.appendChild(p);

  if (accion && ruta) {
    const btn = crearEl('button', {
      clase: 'planit-btn planit-btn--secundario',
      texto: accion,
      attrs: { 'data-ruta': ruta },
    });
    wrap.appendChild(btn);
  }

  return wrap;
}