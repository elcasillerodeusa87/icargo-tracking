const Redis = require('ioredis');
const fetch = require('node-fetch');
const twilio = require('twilio');

const redis = new Redis(process.env.UPSTASH_REDIS_URL_REAL);
const KEY = 'icargo:guias';

const DESTINOS = { FLO: 'Hacienda Cañaveral', BUC: 'Mirador del Cacique' };
const ALERTAS = ['retenida', 'reprogramado', 'demora', 'retenido', 'reajuste'];

const TWILIO_FROM = process.env.TWILIO_WHATSAPP_FROM;
const TWILIO_TO = process.env.TWILIO_WHATSAPP_TO;

module.exports = async (req, res) => {
  // Seguridad: solo permitir si trae la clave secreta correcta
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const raw = await redis.get(KEY);
    const guias = raw ? JSON.parse(raw) : [];

    const activas = guias.filter(g => !g.archived && !esEntregada(g));

    const twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    const reporte = {
      total: guias.length,
      revisadas: activas.length,
      cambios: 0,
      inicializadas: 0,
      errores: 0,
      detalles: []
    };

    for (const guia of activas) {
      try {
        const data = await consultarICargo(guia.code);
        if (!data || !data.items || !data.items.length) {
          reporte.detalles.push({ code: guia.code, resultado: 'sin datos iCargo' });
          continue;
        }

        const estadoActual = data.items[0]._vstLastDetail || '';
        const idActual = data.items[0]._vstTypeStausId;

        // Primera vez: inicializar sin notificar
        if (!guia.lastNotifiedStatus) {
          guia.lastNotifiedStatus = estadoActual;
          guia.items = data.items;
          guia.lastStatus = estadoActual;
          guia.lastStatusId = idActual;
          guia.lastCheck = new Date().toISOString();
          reporte.inicializadas++;
          reporte.detalles.push({ code: guia.code, resultado: 'inicializada (sin notificar)' });
          continue;
        }

        // Comparar contra el último estado notificado
        if (estadoActual !== guia.lastNotifiedStatus) {
          const dias = diasEnTransito(guia);
          const destino = DESTINOS[guia.code.substring(0, 3).toUpperCase()] || 'Destino desconocido';
          const alerta = ALERTAS.some(a => estadoActual.toLowerCase().includes(a));

          await enviarWhatsApp(twilioClient, guia.code, destino, estadoActual, dias, alerta);

          guia.lastNotifiedStatus = estadoActual;
          guia.items = data.items;
          guia.lastStatus = estadoActual;
          guia.lastStatusId = idActual;
          guia.lastCheck = new Date().toISOString();
          reporte.cambios++;
          reporte.detalles.push({ code: guia.code, resultado: 'WhatsApp enviado', nuevoEstado: estadoActual });
        } else {
          // Igual actualizamos lastCheck e items por si acaso
          guia.items = data.items;
          guia.lastCheck = new Date().toISOString();
          reporte.detalles.push({ code: guia.code, resultado: 'sin cambios' });
        }
      } catch (err) {
        reporte.errores++;
        reporte.detalles.push({ code: guia.code, resultado: 'error', mensaje: err.message });
      }
    }

    // Guardar todo de vuelta en Redis
    await redis.set(KEY, JSON.stringify(guias));

    return res.status(200).json(reporte);
  } catch (error) {
    console.error('Error general:', error);
    return res.status(500).json({ error: error.message });
  }
};

async function consultarICargo(code) {
  const filter = `Vst_Trncode = '${code}' AND Vst_Public = 'true'`;
  const url = `https://icargo.misiil.com/api/VwGetTransactionsStatusReport/${encodeURIComponent(filter)}/Vst_RealDate%20desc/0/10000/0`;
  const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!response.ok) throw new Error('iCargo respondió con error');
  return response.json();
}

function esEntregada(g) {
  if (!g.items || !g.items.length) return false;
  const t = (g.items[0]._vstLastDescription || '').toLowerCase();
  return t.includes('entregada') || g.lastStatusId === 999;
}

function diasEnTransito(g) {
  const inicio = g.fechaEnvio ? new Date(g.fechaEnvio) : new Date(g.addedAt);
  return Math.floor((Date.now() - inicio.getTime()) / 86400000);
}

async function enviarWhatsApp(client, code, destino, estado, dias, alerta) {
  let body = `📦 El Casillero de USA\n\n`;
  body += `Guía: ${code}\n`;
  body += `Destino: ${destino}\n\n`;
  body += `🆕 Nuevo estado: ${estado}\n`;
  body += `⏱ ${dias} días en tránsito`;
  if (alerta) {
    body += `\n\n⚠️ Posible demora — revisa con iCargo`;
  }

  return client.messages.create({
    from: TWILIO_FROM,
    to: TWILIO_TO,
    body
  });
}
