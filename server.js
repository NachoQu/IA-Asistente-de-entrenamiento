const path = require('path');
const fs = require('fs');

// Load .env
try {
  const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  envFile.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
  });
} catch (e) {}

process.env.DATA_FILE = path.join(__dirname, 'data', 'user-data.json');
const mod = require('./api/index');
const app = mod;
const { loadData, saveData } = mod;
const PORT = process.env.PORT || 3000;

app.post('/api/garmin/sync', async (req, res) => {
  const { email, password, days } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const python = path.join(__dirname, '.venv', 'bin', 'python3');
  const script = path.join(__dirname, 'garmin-sync.py');

  try {
    const { execSync } = require('child_process');
    const output = execSync(`"${python}" "${script}"`, {
      env: { ...process.env, GARMIN_EMAIL: email, GARMIN_PASSWORD: password, GARMIN_DAYS: String(days || 30) },
      encoding: 'utf8', timeout: 60000
    });
    const result = JSON.parse(output);
    if (result.error) return res.status(500).json({ error: result.error });

    const data = loadData();
    if (!data.workouts) data.workouts = [];
    const imported = result.activities.map(a => ({
      ...a, id: Date.now().toString() + Math.random().toString(36).slice(2),
      source: 'garmin', createdAt: new Date().toISOString(),
    }));
    data.workouts.push(...imported);
    saveData(data);
    res.json({ ok: true, count: imported.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`FitIA corriendo en http://localhost:${PORT}`);
});
