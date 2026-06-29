const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'user-data.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) { console.error('Error loading data:', e); }
  return { workouts: [], meals: [], sleep: [], measurements: [], chatHistory: [] };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

app.get('/api/data', (req, res) => {
  res.json(loadData());
});

app.post('/api/data', (req, res) => {
  const data = loadData();
  Object.assign(data, req.body);
  saveData(data);
  res.json({ ok: true });
});

app.post('/api/data/:collection', (req, res) => {
  const data = loadData();
  const collection = req.params.collection;
  if (!data[collection]) data[collection] = [];
  data[collection].push({ ...req.body, id: Date.now().toString(), createdAt: new Date().toISOString() });
  saveData(data);
  res.json({ ok: true, item: data[collection][data[collection].length - 1] });
});

app.delete('/api/data/:collection/:id', (req, res) => {
  const data = loadData();
  const collection = req.params.collection;
  if (data[collection]) {
    data[collection] = data[collection].filter(i => i.id !== req.params.id);
    saveData(data);
  }
  res.json({ ok: true });
});

app.post('/api/ai', async (req, res) => {
  const { message, context } = req.body;
  const apiKey = req.headers['x-api-key'] || process.env.VERCEL_AI_KEY;
  const baseUrl = req.headers['x-api-base-url'] || 'https://ai-gateway.vercel.sh/v1';

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Eres un asistente experto en entrenamiento físico, nutrición y descanso. Ayudas al usuario a analizar su progreso y dar recomendaciones personalizadas basadas en sus datos de entrenamiento, alimentación y sueño. Contexto actual del usuario: ${JSON.stringify(context || {})}. Responde en español, sé conciso y práctico.`
          },
          ...(req.body.history || []),
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/import/garmin', (req, res) => {
  const data = loadData();
  const { activities } = req.body;
  if (activities && Array.isArray(activities)) {
    if (!data.workouts) data.workouts = [];
    const imported = activities.map(a => ({
      ...a,
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      source: 'garmin',
      createdAt: new Date().toISOString(),
    }));
    data.workouts.push(...imported);
    saveData(data);
    res.json({ ok: true, count: imported.length });
  } else {
    res.status(400).json({ error: 'Invalid activities data' });
  }
});

app.listen(PORT, () => {
  console.log(`Asistente de Entrenamiento corriendo en http://localhost:${PORT}`);
});
