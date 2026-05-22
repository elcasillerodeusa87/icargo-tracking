const fetch = require('node-fetch');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { guia } = req.query;
  if (!guia) {
    res.status(400).json({ error: 'Falta el número de guía' });
    return;
  }

  const filter = `Vst_Trncode = '${guia}' AND Vst_Public = 'true'`;
  const url = `https://icargo.misiil.com/api/VwGetTransactionsStatusReport/${encodeURIComponent(filter)}/Vst_RealDate%20desc/0/10000/0`;

  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar iCargo' });
  }
};
