/**
 * ============================================================
 * PLANIT — db.js
 * Módulo de persistencia local con IndexedDB
 * ============================================================
 *
 * Este módulo es la ÚNICA parte de la app que habla con
 * IndexedDB. Ningún otro módulo accede a la base de datos
 * directamente — todo pasa por las funciones exportadas aquí.
 *
 * Object Stores (tablas):
 *   - eventos     → citas y bloques de tiempo con fecha
 *   - tareas      → ítems de to-do con prioridad y estado
 *   - proyectos   → agrupadores de eventos y tareas
 *   - categorias  → etiquetas de color para el Weekly Flow Dial
 *   - horario_u   → materias universitarias con recurrencia semanal
 *
 * Patrón usado: Promise wrapper sobre IDBRequest.
 * Todas las funciones son async y devuelven Promises,
 * lo que permite usar await en el resto de la app.
 * ============================================================
 */

// ─── Configuración ───────────────────────────────────────────

const DB_NAME    = 'planit_db';
const DB_VERSION = 2; // v2: booleanos → números en índices (activa, completada)

// ─── Apertura y migración ────────────────────────────────────

/**
 * Abre (o crea) la base de datos.
 * Se llama una sola vez al iniciar la app desde main.js.
 *
 * La función onupgradeneeded es donde IndexedDB crea o
 * modifica la estructura — equivale a las migraciones SQL.
 * Solo se ejecuta cuando DB_VERSION es mayor al número
 * guardado en el navegador del usuario.
 *
 * @returns {Promise<IDBDatabase>}
 */
export function abrirDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // ── Migración / creación inicial ──────────────────────────
    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // ── Store: eventos ──────────────────────────────────────
      // Guarda cualquier bloque de tiempo con fecha concreta.
      // keyPath: IndexedDB usará el campo 'id' como clave primaria.
      if (!db.objectStoreNames.contains('eventos')) {
        const eventos = db.createObjectStore('eventos', { keyPath: 'id' });

        // Índice por fecha_inicio: permite consultas como
        // "todos los eventos del día X" de forma eficiente.
        eventos.createIndex('por_fecha', 'fecha_inicio', { unique: false });

        // Índice por categoria: para filtrar por color en el Dial.
        eventos.createIndex('por_categoria', 'categoria_id', { unique: false });

        // Índice por proyecto: para ver todos los eventos de un proyecto.
        eventos.createIndex('por_proyecto', 'proyecto_id', { unique: false });
      }

      // ── Store: tareas ───────────────────────────────────────
      // Ítems de to-do. Pueden estar sueltas o ligadas a un proyecto.
      if (!db.objectStoreNames.contains('tareas')) {
        const tareas = db.createObjectStore('tareas', { keyPath: 'id' });

        // Índice por completada (0/1 — IDB no indexa booleanos):
        // para obtener rápido todas las tareas pendientes.
        tareas.createIndex('por_completada', 'completada', { unique: false });

        // Índice por proyecto (opcional, puede ser null):
        tareas.createIndex('por_proyecto', 'proyecto_id', { unique: false });

        // Índice por prioridad: 'alta' | 'media' | 'baja'
        tareas.createIndex('por_prioridad', 'prioridad', { unique: false });
      }

      // ── Store: proyectos ────────────────────────────────────
      // Agrupan eventos y tareas bajo un nombre y color.
      if (!db.objectStoreNames.contains('proyectos')) {
        const proyectos = db.createObjectStore('proyectos', { keyPath: 'id' });

        // Índice por nombre: para búsquedas rápidas por texto.
        proyectos.createIndex('por_nombre', 'nombre', { unique: false });
      }

      // ── Store: categorias ───────────────────────────────────
      // Etiquetas de color (Trabajo, Personal, etc.).
      // El Weekly Flow Dial las usa para calcular % de tiempo.
      if (!db.objectStoreNames.contains('categorias')) {
        db.createObjectStore('categorias', { keyPath: 'id' });
        // Las categorías se buscan siempre completas, no hace
        // falta índice adicional. Son pocas (4-8 típicamente).
      }

      // ── Store: horario_u ────────────────────────────────────
      // Materias universitarias con recurrencia semanal.
      // A diferencia de un evento, NO tienen fecha_inicio concreta
      // — se repiten cada semana mientras dure el semestre.
      if (!db.objectStoreNames.contains('horario_u')) {
        const horario = db.createObjectStore('horario_u', { keyPath: 'id' });

        // Índice por semestre: para mostrar/ocultar el horario
        // del semestre actual vs semestres pasados.
        horario.createIndex('por_semestre', 'semestre', { unique: false });

        // Índice por activa (0/1 — IDB no indexa booleanos):
        // 1 mientras el semestre está vigente.
        horario.createIndex('por_activa', 'activa', { unique: false });
      }
    };

    request.onsuccess  = (e) => resolve(e.target.result);
    request.onerror    = (e) => reject(e.target.error);
  });
}

// ─── Helpers internos ────────────────────────────────────────

/**
 * Abre una transacción y devuelve el object store listo para usar.
 *
 * @param {IDBDatabase} db         - Instancia de la BD abierta
 * @param {string}      storeName  - Nombre del store
 * @param {string}      modo       - 'readonly' | 'readwrite'
 * @returns {IDBObjectStore}
 */
function getStore(db, storeName, modo = 'readonly') {
  return db.transaction(storeName, modo).objectStore(storeName);
}

/**
 * Envuelve un IDBRequest en una Promise.
 * Patrón central del módulo: convierte la API de callbacks
 * de IndexedDB en algo usable con async/await.
 *
 * @param {IDBRequest} request
 * @returns {Promise<any>}
 */
function promesaRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror   = (e) => reject(e.target.error);
  });
}

/**
 * Genera un UUID v4 simple para usar como ID de registro.
 * No depende de librerías externas.
 *
 * @returns {string} ej. "f47ac10b-58cc-4372-a567-0e02b2c3d479"
 */
function generarId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─── CRUD genérico ───────────────────────────────────────────
// Estas cuatro funciones cubren el 90% de las operaciones.
// Las funciones específicas de cada entidad las usan internamente.

/**
 * Inserta un registro. Si no tiene 'id', se genera automáticamente.
 * Devuelve el objeto completo con su id asignado.
 *
 * @param {IDBDatabase} db
 * @param {string}      storeName
 * @param {object}      datos
 * @returns {Promise<object>}
 */
async function crear(db, storeName, datos) {
  const registro = {
    ...datos,
    id:         datos.id || generarId(),
    creado_en:  datos.creado_en  || new Date().toISOString(),
    editado_en: new Date().toISOString(),
  };
  const store = getStore(db, storeName, 'readwrite');
  await promesaRequest(store.add(registro));
  return registro;
}

/**
 * Obtiene un registro por su id (clave primaria).
 * Devuelve el objeto o undefined si no existe.
 *
 * @param {IDBDatabase} db
 * @param {string}      storeName
 * @param {string}      id
 * @returns {Promise<object|undefined>}
 */
function obtenerPorId(db, storeName, id) {
  return promesaRequest(getStore(db, storeName).get(id));
}

/**
 * Actualiza un registro existente (merge parcial).
 * Solo sobreescribe los campos que vengan en 'cambios'.
 * Lanza error si el registro no existe.
 *
 * @param {IDBDatabase} db
 * @param {string}      storeName
 * @param {string}      id
 * @param {object}      cambios
 * @returns {Promise<object>}
 */
async function actualizar(db, storeName, id, cambios) {
  const existente = await obtenerPorId(db, storeName, id);
  if (!existente) throw new Error(`[PLANIT] No se encontró el registro '${id}' en '${storeName}'`);

  const actualizado = {
    ...existente,
    ...cambios,
    id,                               // el id nunca cambia
    editado_en: new Date().toISOString(),
  };
  const store = getStore(db, storeName, 'readwrite');
  await promesaRequest(store.put(actualizado));
  return actualizado;
}

/**
 * Elimina un registro por su id.
 *
 * @param {IDBDatabase} db
 * @param {string}      storeName
 * @param {string}      id
 * @returns {Promise<void>}
 */
function eliminar(db, storeName, id) {
  return promesaRequest(getStore(db, storeName, 'readwrite').delete(id));
}

/**
 * Devuelve TODOS los registros de un store como array.
 * Para stores pequeños (categorias, proyectos) es la opción simple.
 * Para eventos con miles de registros, usar las funciones de índice.
 *
 * @param {IDBDatabase} db
 * @param {string}      storeName
 * @returns {Promise<object[]>}
 */
function obtenerTodos(db, storeName) {
  return promesaRequest(getStore(db, storeName).getAll());
}

// ─── API pública — Eventos ───────────────────────────────────

/**
 * Crea un nuevo evento.
 *
 * Estructura esperada:
 * {
 *   titulo:       string,           // "Reunión Proyecto"
 *   fecha_inicio: string (ISO),     // "2026-04-04T09:00:00"
 *   fecha_fin:    string (ISO),     // "2026-04-04T10:30:00"
 *   categoria_id: string|null,      // uuid de Categoria
 *   proyecto_id:  string|null,      // uuid de Proyecto (opcional)
 *   notas:        string|null,      // texto libre
 *   color:        string|null,      // override de color (ej. "#00ffc8")
 * }
 */
export const Eventos = {

  crear: (db, datos) => crear(db, 'eventos', datos),

  obtener: (db, id) => obtenerPorId(db, 'eventos', id),

  actualizar: (db, id, cambios) => actualizar(db, 'eventos', id, cambios),

  eliminar: (db, id) => eliminar(db, 'eventos', id),

  /**
   * Devuelve todos los eventos de un día concreto.
   * Usa el índice 'por_fecha' con un IDBKeyRange para buscar
   * entre el inicio y el fin del día (00:00:00 a 23:59:59).
   *
   * @param {IDBDatabase} db
   * @param {string}      fechaISO  - Ej: "2026-04-04"
   * @returns {Promise<object[]>}
   */
  obtenerPorDia(db, fechaISO) {
    return new Promise((resolve, reject) => {
      const inicio = `${fechaISO}T00:00:00`;
      const fin    = `${fechaISO}T23:59:59`;
      const rango  = IDBKeyRange.bound(inicio, fin);
      const store  = getStore(db, 'eventos');
      const idx    = store.index('por_fecha');
      const req    = idx.getAll(rango);
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = (e) => reject(e.target.error);
    });
  },

  /**
   * Devuelve todos los eventos de un rango de fechas.
   * Útil para la vista de semana y el calendario mensual.
   *
   * @param {IDBDatabase} db
   * @param {string}      desdeISO  - Ej: "2026-04-01"
   * @param {string}      hastaISO  - Ej: "2026-04-30"
   * @returns {Promise<object[]>}
   */
  obtenerPorRango(db, desdeISO, hastaISO) {
    return new Promise((resolve, reject) => {
      const inicio = `${desdeISO}T00:00:00`;
      const fin    = `${hastaISO}T23:59:59`;
      const rango  = IDBKeyRange.bound(inicio, fin);
      const idx    = getStore(db, 'eventos').index('por_fecha');
      const req    = idx.getAll(rango);
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = (e) => reject(e.target.error);
    });
  },

  /**
   * Devuelve todos los eventos de una categoría.
   * El Weekly Flow Dial lo usa para calcular horas por categoría.
   */
  obtenerPorCategoria(db, categoriaId) {
    return new Promise((resolve, reject) => {
      const idx = getStore(db, 'eventos').index('por_categoria');
      const req = idx.getAll(IDBKeyRange.only(categoriaId));
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = (e) => reject(e.target.error);
    });
  },

  obtenerTodos: (db) => obtenerTodos(db, 'eventos'),
};

// ─── API pública — Tareas ────────────────────────────────────

/**
 * Estructura esperada al crear una tarea:
 * {
 *   titulo:       string,
 *   completada:   0|1,              // 0 por defecto (IDB no indexa booleanos)
 *   prioridad:    'alta'|'media'|'baja',
 *   fecha_limite: string|null,      // ISO date opcional
 *   proyecto_id:  string|null,
 *   notas:        string|null,
 * }
 */
export const Tareas = {

  crear: (db, datos) => crear(db, 'tareas', {
    completada: 0,      // 0 = pendiente (IDB no indexa booleanos)
    prioridad: 'media',
    ...datos,
  }),

  obtener: (db, id) => obtenerPorId(db, 'tareas', id),

  actualizar: (db, id, cambios) => actualizar(db, 'tareas', id, cambios),

  eliminar: (db, id) => eliminar(db, 'tareas', id),

  /**
   * Marca una tarea como completada (1) o pendiente (0).
   * Atajo conveniente para el checkbox de la UI.
   */
  toggleCompletada(db, id, valor) {
    // Normalizar a número por si llega un booleano desde la UI
    return actualizar(db, 'tareas', id, { completada: valor ? 1 : 0 });
  },

  /** Devuelve solo las tareas pendientes (completada = 0). */
  obtenerPendientes(db) {
    return new Promise((resolve, reject) => {
      const idx = getStore(db, 'tareas').index('por_completada');
      const req = idx.getAll(IDBKeyRange.only(0)); // 0 = pendiente
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = (e) => reject(e.target.error);
    });
  },

  /** Devuelve tareas de un proyecto específico. */
  obtenerPorProyecto(db, proyectoId) {
    return new Promise((resolve, reject) => {
      const idx = getStore(db, 'tareas').index('por_proyecto');
      const req = idx.getAll(IDBKeyRange.only(proyectoId));
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = (e) => reject(e.target.error);
    });
  },

  obtenerTodas: (db) => obtenerTodos(db, 'tareas'),
};

// ─── API pública — Proyectos ─────────────────────────────────

/**
 * Estructura esperada:
 * {
 *   nombre:       string,
 *   color:        string,           // hex, ej. "#b060ff"
 *   descripcion:  string|null,
 *   fecha_inicio: string|null,      // ISO date
 *   fecha_fin:    string|null,      // ISO date (opcional)
 * }
 */
export const Proyectos = {

  crear: (db, datos) => crear(db, 'proyectos', datos),

  obtener: (db, id) => obtenerPorId(db, 'proyectos', id),

  actualizar: (db, id, cambios) => actualizar(db, 'proyectos', id, cambios),

  eliminar: (db, id) => eliminar(db, 'proyectos', id),

  obtenerTodos: (db) => obtenerTodos(db, 'proyectos'),
};

// ─── API pública — Categorías ────────────────────────────────

/**
 * Estructura esperada:
 * {
 *   nombre: string,   // "Trabajo", "Personal", etc.
 *   color:  string,   // hex, ej. "#00ffc8"
 * }
 *
 * Al iniciar la app, si no existen categorías se llama a
 * sembrarCategoriasPorDefecto() desde main.js.
 */
export const Categorias = {

  crear: (db, datos) => crear(db, 'categorias', datos),

  obtener: (db, id) => obtenerPorId(db, 'categorias', id),

  actualizar: (db, id, cambios) => actualizar(db, 'categorias', id, cambios),

  eliminar: (db, id) => eliminar(db, 'categorias', id),

  obtenerTodas: (db) => obtenerTodos(db, 'categorias'),

  /**
   * Inserta las 4 categorías por defecto si el store está vacío.
   * Se llama solo una vez en el primer arranque.
   */
  async sembrarDefecto(db) {
    const existentes = await obtenerTodos(db, 'categorias');
    if (existentes.length > 0) return; // ya tiene datos, no hacer nada

    const defaults = [
      { nombre: 'Trabajo',   color: '#00ffc8' },
      { nombre: 'Proyectos', color: '#b060ff' },
      { nombre: 'Personal',  color: '#7de06e' },
      { nombre: 'Descanso',  color: '#f0b429' },
    ];

    for (const cat of defaults) {
      await crear(db, 'categorias', cat);
    }
  },
};

// ─── API pública — Horario Universitario ─────────────────────

/**
 * Entidad especial: materias con recurrencia semanal fija.
 * NO son eventos con fecha concreta — se repiten cada semana
 * hasta que el semestre termina (o activa = 0).
 *
 * Estructura esperada:
 * {
 *   materia:     string,           // "Cálculo II"
 *   docente:     string|null,      // "Dr. Mamani"
 *   aula:        string|null,      // "Lab 3B"
 *   dias:        string[],         // ["LUN","MIÉ","VIE"]
 *   hora_inicio: string,           // "08:00"  (formato HH:MM)
 *   hora_fin:    string,           // "10:00"
 *   semestre:    string,           // "2026-1"  (año-período)
 *   color:       string|null,      // override de color
 *   activa:      0|1,              // 1 = semestre vigente (IDB no indexa booleanos)
 * }
 *
 * ¿Cómo se renderizan en el calendario?
 * El módulo scheduler.js lee todas las materias activas y
 * genera eventos "virtuales" (sin guardarlos en IndexedDB)
 * para cada día de la semana que coincida con dias[].
 * Así el calendario muestra las clases sin duplicar datos.
 */
export const HorarioU = {

  crear: (db, datos) => crear(db, 'horario_u', {
    activa: 1,  // 1 = vigente por defecto (IDB no indexa booleanos)
    ...datos,
  }),

  obtener: (db, id) => obtenerPorId(db, 'horario_u', id),

  actualizar: (db, id, cambios) => actualizar(db, 'horario_u', id, cambios),

  eliminar: (db, id) => eliminar(db, 'horario_u', id),

  /** Devuelve solo las materias del semestre vigente (activa = 1). */
  obtenerActivas(db) {
    return new Promise((resolve, reject) => {
      const idx = getStore(db, 'horario_u').index('por_activa');
      const req = idx.getAll(IDBKeyRange.only(1)); // 1 = vigente
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = (e) => reject(e.target.error);
    });
  },

  /** Devuelve todas las materias de un semestre (ej. "2026-1"). */
  obtenerPorSemestre(db, semestre) {
    return new Promise((resolve, reject) => {
      const idx = getStore(db, 'horario_u').index('por_semestre');
      const req = idx.getAll(IDBKeyRange.only(semestre));
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = (e) => reject(e.target.error);
    });
  },

  obtenerTodas: (db) => obtenerTodos(db, 'horario_u'),
};