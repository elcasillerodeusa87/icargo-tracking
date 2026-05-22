const Redis = require('ioredis');

const redis = new Redis("rediss://default:gQAAAAAAAgxlAAIgcDFmM2RjMjM0NzllMmI0ODkwOWQ2YmI4NjZlMDk3MDVlYQ@select-ibex-134245.upstash.io:6379");

const KEY = 'icargo:guias';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (req.method === 'GET') {
    const raw = await redis.get(KEY);
    const guias = raw ? JSON.parse(raw) : [];
    res.status(200).json(guias);
    return;
  }

  if (req.method === 'POST') {
    const body = req.body;
    const raw = await redis.get(KEY);
    const guias = raw ? JSON.parse(raw) : [];

    if (body.action === 'add') {
      const exists = guias.find(g => g.code === body.guia.code);
      if (exists) { res.status(400).json({ error: 'Ya existe' }); return; }
      guias.unshift(body.guia);
      await redis.set(KEY, JSON.stringify(guias));
      res.status(200).json({ ok: true });
      return;
    }

    if (body.action === 'update') {
      const idx = guias.findIndex(g => g.code === body.guia.code);
      if (idx !== -1) {
        guias[idx] = { ...guias[idx], ...body.guia };
        await redis.set(KEY, JSON.stringify(guias));
      }
      res.status(200).json({ ok: true });
      return;
    }

    if (body.action === 'delete') {
      const filtered = guias.filter(g => g.code !== body.code);
      await redis.set(KEY, JSON.stringify(filtered));
      res.status(200).json({ ok: true });
      return;
    }

    if (body.action === 'archive') {
      const idx = guias.findIndex(g => g.code === body.code);
      if (idx !== -1) {
        guias[idx].archived = !guias[idx].archived;
        await redis.set(KEY, JSON.stringify(guias));
      }
      res.status(200).json({ ok: true });
      return;
    }

    if (body.action === 'note') {
      const idx = guias.findIndex(g => g.code === body.code);
      if (idx !== -1) {
        guias[idx].note = body.note;
        await redis.set(KEY, JSON.stringify(guias));
      }
      res.status(200).json({ ok: true });
      return;
    }
  }

  res.status(405).json({ error: 'Método no permitido' });
};
