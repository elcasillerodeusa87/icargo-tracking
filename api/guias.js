const { Redis } = require('@upstash/redis');

const redis = new Redis({
url: process.env.UPSTASH_REDIS_REST_URL,
token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KEY = 'icargo:guias';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (req.method === 'GET') {
    const guias = await redis.get(KEY) || [];
    res.status(200).json(guias);
    return;
  }

  if (req.method === 'POST') {
    const body = req.body;
    const guias = await redis.get(KEY) || [];

    if (body.action === 'add') {
      const exists = guias.find(g => g.code === body.guia.code);
      if (exists) { res.status(400).json({ error: 'Ya existe' }); return; }
      guias.unshift(body.guia);
      await redis.set(KEY, guias);
      res.status(200).json({ ok: true });
      return;
    }

    if (body.action === 'update') {
      const idx = guias.findIndex(g => g.code === body.guia.code);
      if (idx !== -1) {
        guias[idx] = { ...guias[idx], ...body.guia };
        await redis.set(KEY, guias);
      }
      res.status(200).json({ ok: true });
      return;
    }

    if (body.action === 'delete') {
      const filtered = guias.filter(g => g.code !== body.code);
      await redis.set(KEY, filtered);
      res.status(200).json({ ok: true });
      return;
    }

    if (body.action === 'archive') {
      const idx = guias.findIndex(g => g.code === body.code);
      if (idx !== -1) {
        guias[idx].archived = !guias[idx].archived;
        await redis.set(KEY, guias);
      }
      res.status(200).json({ ok: true });
      return;
    }

    if (body.action === 'note') {
      const idx = guias.findIndex(g => g.code === body.code);
      if (idx !== -1) {
        guias[idx].note = body.note;
        await redis.set(KEY, guias);
      }
      res.status(200).json({ ok: true });
      return;
    }
  }

  res.status(405).json({ error: 'Método no permitido' });
};
