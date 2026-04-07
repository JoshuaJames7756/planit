/**
 * ============================================================
 * PLANIT — api/ia.js
 * Serverless Function (Vercel) — Proxy para la API de Anthropic
 * ============================================================
 *
 * ¿Por qué existe este archivo?
 *   El navegador no puede llamar a api.anthropic.com directamente
 *   porque Anthropic no permite CORS desde orígenes de terceros.
 *   Esta función corre en el servidor de Vercel, actúa de
 *   intermediario y mantiene la API key fuera del frontend.
 *
 * Configuración requerida en Vercel:
 *   Settings → Environment Variables → ANTHROPIC_API_KEY = sk-ant-...
 *
 * Uso desde el cliente:
 *   fetch('/api/ia', { method: 'POST', body: JSON.stringify({...}) })
 *   (igual que llamar a Anthropic pero sin headers de auth)
 * ============================================================
 */

export default async function handler(req, res) {

  // ── CORS — permitir llamadas desde el mismo dominio ────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Preflight OPTIONS (el navegador lo envía antes del POST real)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Solo aceptar POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // ── Verificar que la API key esté configurada en Vercel ────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[PLANIT/ia] ANTHROPIC_API_KEY no está configurada en Vercel');
    return res.status(500).json({ error: 'API key no configurada' });
  }

  try {
    // ── Reenviar la petición a Anthropic ──────────────────────
    const respuesta = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });

    const data = await respuesta.json();

    // Devolver la misma respuesta (con el mismo status code)
    return res.status(respuesta.status).json(data);

  } catch (err) {
    console.error('[PLANIT/ia] Error al conectar con Anthropic:', err);
    return res.status(502).json({ error: 'Error al conectar con la IA' });
  }
}