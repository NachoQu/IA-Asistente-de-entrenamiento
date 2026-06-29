const path = require('path');
const fs = require('fs');

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

function normalizeDates(startDate, days) {
  const end = new Date();
  let start;
  if (startDate) {
    start = new Date(startDate);
  } else {
    start = new Date();
    start.setDate(start.getDate() - (parseInt(days) || 365 * 5));
  }
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

app.post('/api/garmin/sync', async (req, res) => {
  const { email, password, startDate, days } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const { start, end } = normalizeDates(startDate, days);
  const python = path.join(__dirname, '.venv', 'bin', 'python3');
  const script = path.join(__dirname, 'garmin-sync.py');

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Transfer-Encoding': 'chunked',
  });

  try {
    const { execSync } = require('child_process');
    const output = execSync(`"${python}" "${script}"`, {
      env: {
        ...process.env,
        GARMIN_EMAIL: email,
        GARMIN_PASSWORD: password,
        GARMIN_START: start,
        GARMIN_END: end,
      },
      encoding: 'utf8',
      timeout: 300000,
      maxBuffer: 50 * 1024 * 1024,
    });

    const result = JSON.parse(output);
    if (result.error) {
      return res.end(JSON.stringify({ error: result.error }));
    }

    const data = loadData();

    // Activities
    if (!data.workouts) data.workouts = [];
    const existingIds = new Set(data.workouts.map(w => `${w.date}-${w.type}-${w.duration}`));
    let imported = 0;
    for (const a of result.activities) {
      const key = `${a.date}-${a.type}-${a.duration}`;
      if (!existingIds.has(key)) {
        data.workouts.push({
          ...a,
          id: Date.now().toString() + Math.random().toString(36).slice(2),
          source: 'garmin',
          createdAt: new Date().toISOString(),
        });
        imported++;
      }
    }

    // Daily stats
    if (!data.daily_stats) data.daily_stats = [];
    const existingDays = new Set(data.daily_stats.map(d => d.date));
    for (const day of result.daily_stats) {
      if (!existingDays.has(day.date)) {
        data.daily_stats.push(day);
      } else {
        const idx = data.daily_stats.findIndex(d => d.date === day.date);
        if (idx >= 0) data.daily_stats[idx] = { ...data.daily_stats[idx], ...day };
      }
    }

    // Body composition
    if (!data.measurements) data.measurements = [];
    const existingMeas = new Set(data.measurements.map(m => m.date));
    for (const m of result.body_composition) {
      if (!existingMeas.has(m.date)) {
        data.measurements.push({
          ...m,
          id: Date.now().toString() + Math.random().toString(36).slice(2),
          source: 'garmin',
          createdAt: new Date().toISOString(),
        });
      }
    }

    saveData(data);

    res.end(JSON.stringify({
      ok: true,
      summary: result._summary,
      imported_activities: imported,
      total_activities: data.workouts.length,
      total_days: data.daily_stats.length,
    }));
  } catch (e) {
    res.end(JSON.stringify({ error: e.message }));
  }
});

app.listen(PORT, () => {
  console.log(`FitIA corriendo en http://localhost:${PORT}`);
});
