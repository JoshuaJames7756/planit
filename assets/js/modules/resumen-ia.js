/**
 * ============================================================
 * PLANIT — modules/resumen-ia.js
 * Panel de resumen diario generado por IA
 * ============================================================
 * Se inserta en la vista de agenda ENCIMA del timeline.
 * Llama al proxy /api/ia (Vercel Serverless) que internamente
 * habla con Anthropic. La API key nunca llega al cliente.
 * ============================================================
 */

import { obtenerEventosDia } from './scheduler.js';
import { Tareas } from './db.js';
import { hoyISO } from './router.js';

const MODELO = 'claude-sonnet-4-20250514';

/**
 * Construye y retorna el elemento DOM del panel de IA.
 * Lo inserta antes del timeline en la vista de agenda.
 *
 * @param {IDBDatabase} db
 * @param {string}      fechaISO   - "YYYY-MM-DD"
 * @param {object[]}    categorias
 * @returns {HTMLElement}
 */
export async function crearPanelResumenIA(db, fechaISO, categorias) {
  // ── Contenedor del panel ──────────────────────────────────
  const panel = document.createElement('div');
  panel.className = 'planit-resumen-ia';
  panel.style.cssText = `
    background: color-mix(in srgb, var(--acento-cian) 5%, var(--color-superficie));
    border: 0.5px solid color-mix(in srgb, var(--acento-cian) 20%, transparent);
    border-radius: var(--radio-lg);
    padding: 14px 16px;
    margin-bottom: 20px;
    position: relative;
    overflow: hidden;
  `;

  // Línea decorativa superior
  const linea = document.createElement('div');
  linea.style.cssText = `
    position: absolute; top: 0; left: 0; right: 0; height: 2px;
    background: linear-gradient(90deg, var(--acento-cian), var(--acento-purpura), transparent);
  `;
  panel.appendChild(linea);

  // Header del panel
  const header = document.createElement('div');
  header.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:10px;';
  header.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="var(--acento-cian)" stroke-width="2" style="flex-shrink:0;">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
      <path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
    </svg>
    <span style="
      font-family:var(--fuente-mono); font-size:10px;
      letter-spacing:2px; color:var(--acento-cian);
      text-transform:uppercase;
    ">Resumen del día · IA</span>
  `;
  panel.appendChild(header);

  // Área de contenido — empieza con skeleton animado
  const contenido = document.createElement('div');
  contenido.className = 'planit-resumen-ia__contenido';
  contenido.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:6px;">
      <div class="planit-skeleton planit-skeleton--linea" style="width:85%;"></div>
      <div class="planit-skeleton planit-skeleton--linea" style="width:70%;"></div>
      <div class="planit-skeleton planit-skeleton--linea" style="width:60%;"></div>
    </div>
  `;
  panel.appendChild(contenido);

  // Disparar la llamada a la IA de forma asíncrona
  // (no bloqueamos el render del timeline)
  _generarResumen(db, fechaISO, categorias, contenido);

  return panel;
}

// ─── Generación del resumen ───────────────────────────────────

async function _generarResumen(db, fechaISO, categorias, contenedor) {
  try {
    // 1. Recopilar datos del día
    const [eventos, tareasPendientes] = await Promise.all([
      obtenerEventosDia(db, fechaISO),
      Tareas.obtenerPendientes(db),
    ]);

    const esHoy = fechaISO === hoyISO();

    // 2. Construir el prompt con los datos reales
    const prompt = _construirPrompt(fechaISO, eventos, tareasPendientes, categorias, esHoy);

    // 3. Llamar al PROXY de Vercel (no a Anthropic directo)
    //    Así evitamos el error de CORS y la API key nunca llega al browser.
    const respuesta = await fetch('/api/ia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 1000,
        system: `Eres el asistente de productividad de PLANIT, una app de calendario para estudiantes universitarios bolivianos.
Analiza los datos del día y responde SOLO con un objeto JSON con esta estructura exacta, sin markdown ni texto extra:
{
  "saludo": "frase corta motivadora según el contexto del día (máx 12 palabras)",
  "carga": "análisis de la carga del día: ligero | moderado | intenso, con una razón breve",
  "prioridad": "la tarea o evento más importante a no olvidar hoy, en una línea",
  "consejo": "un consejo concreto y accionable para este día específico (máx 15 palabras)"
}`,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await respuesta.json();
    const texto = data.content?.[0]?.text || '';

    // 4. Parsear la respuesta JSON
    let resumen;
    try {
      const limpio = texto.replace(/```json|```/g, '').trim();
      resumen = JSON.parse(limpio);
    } catch {
      throw new Error('Respuesta IA inválida');
    }

    // 5. Renderizar el resultado
    _renderizarResumen(contenedor, resumen, eventos.length);

  } catch (err) {
    console.warn('[ResumenIA] Error:', err);
    contenedor.innerHTML = `
      <p style="font-size:12px; color:var(--texto-terciario); font-style:italic;">
        Resumen no disponible — sin conexión o datos insuficientes.
      </p>
    `;
  }
}

function _construirPrompt(fechaISO, eventos, tareas, categorias, esHoy) {
  const fecha = new Date(fechaISO + 'T12:00:00');
  const fechaLegible = fecha.toLocaleDateString('es-BO', {
    weekday: 'long', day: 'numeric', month: 'long'
  });

  const eventosTexto = eventos.length === 0
    ? 'Sin eventos agendados.'
    : eventos.map(ev => {
        const hora = ev.fecha_inicio.slice(11, 16);
        const cat  = categorias.find(c => c.id === ev.categoria_id);
        return `- ${hora} | ${ev.titulo}${cat ? ` [${cat.nombre}]` : ''}${ev.virtual ? ' (clase U)' : ''}`;
      }).join('\n');

  const tareasTexto = tareas.length === 0
    ? 'Sin tareas pendientes.'
    : tareas.slice(0, 5).map(t =>
        `- ${t.titulo} [${t.prioridad}]${t.fecha_limite ? ` · límite: ${t.fecha_limite.slice(0,10)}` : ''}`
      ).join('\n');

  return `Fecha: ${fechaLegible}${esHoy ? ' (HOY)' : ''}

EVENTOS DEL DÍA:
${eventosTexto}

TAREAS PENDIENTES (primeras 5):
${tareasTexto}

Genera el resumen JSON para este día.`;
}

function _renderizarResumen(contenedor, resumen, cantidadEventos) {
  const colorCarga = {
    ligero:   'var(--acento-verde)',
    moderado: 'var(--acento-ambar)',
    intenso:  '#f09595',
  };

  const nivel = Object.keys(colorCarga).find(k =>
    resumen.carga?.toLowerCase().includes(k)
  ) || 'moderado';

  contenedor.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:8px;">

      <!-- Saludo -->
      <p style="
        font-size:13px; font-weight:500;
        color:var(--texto-primario); margin:0; line-height:1.4;
      ">${resumen.saludo || '¡Buen día!'}</p>

      <!-- Carga -->
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <div style="
          display:flex; align-items:center; gap:5px;
          background: color-mix(in srgb, ${colorCarga[nivel]} 10%, transparent);
          border: 0.5px solid color-mix(in srgb, ${colorCarga[nivel]} 25%, transparent);
          border-radius: var(--radio-pill);
          padding: 3px 10px;
          font-size: 11px; font-family: var(--fuente-mono);
          color: ${colorCarga[nivel]};
        ">
          <div style="
            width:6px; height:6px; border-radius:50%;
            background:${colorCarga[nivel]};
          "></div>
          ${resumen.carga || 'Carga moderada'}
        </div>
      </div>

      <!-- Prioridad -->
      <div style="
        display:flex; align-items:flex-start; gap:6px;
        font-size:12px; color:var(--texto-secundario); line-height:1.5;
      ">
        <span style="color:var(--acento-cian); flex-shrink:0; margin-top:1px;">▸</span>
        <span>${resumen.prioridad || 'Sin prioridades críticas hoy.'}</span>
      </div>

      <!-- Consejo -->
      <div style="
        display:flex; align-items:flex-start; gap:6px;
        font-size:11px; color:var(--texto-terciario);
        font-style:italic; line-height:1.5;
        padding-top: 4px;
        border-top: 0.5px solid var(--color-borde);
      ">
        <span style="flex-shrink:0;">💡</span>
        <span>${resumen.consejo || ''}</span>
      </div>

    </div>
  `;
}