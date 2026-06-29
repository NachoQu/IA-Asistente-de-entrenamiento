(function(){
  'use strict';

  let data = { workouts: [], meals: [], sleep: [], measurements: [], chatHistory: [] };
  let prevChatLen = 0;

  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  function formatDate(d) {
    const date = new Date(d);
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }

  function todayStr() {
    return new Date().toISOString().split('T')[0];
  }

  // Navigation
  $$('#sidebar nav a').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const view = a.dataset.view;
      $$('#sidebar nav a').forEach(x => x.classList.remove('active'));
      a.classList.add('active');
      $$('.view').forEach(v => v.classList.remove('active'));
      const target = document.getElementById('view-' + view);
      if (target) target.classList.add('active');
      const titles = { dashboard: 'Dashboard', training: 'Entrenamiento',
        nutrition: 'Nutrición', rest: 'Descanso', chat: 'Asistente IA',
        garmin: 'Importar Garmin', settings: 'Configuración' };
      $('#view-title').textContent = titles[view] || view;
    });
  });

  $('#menu-toggle').addEventListener('click', () => {
    $('#sidebar').classList.toggle('open');
  });

  // Close sidebar on click outside
  document.addEventListener('click', e => {
    const sidebar = $('#sidebar');
    if (window.innerWidth <= 768 && sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) && e.target !== $('#menu-toggle')) {
      sidebar.classList.remove('open');
    }
  });

  // Load data from server
  async function loadData() {
    try {
      const res = await fetch('/api/data');
      if (res.ok) {
        data = await res.json();
        data.workouts = data.workouts || [];
        data.meals = data.meals || [];
        data.sleep = data.sleep || [];
        data.measurements = data.measurements || [];
        data.chatHistory = data.chatHistory || [];
      }
    } catch (e) { console.error('Error loading data:', e); }
    renderAll();
  }

  // Save data to server
  async function saveData() {
    try {
      await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch (e) { console.error('Error saving data:', e); }
  }

  // Add item to collection
  async function addItem(collection, item) {
    try {
      const res = await fetch(`/api/data/${collection}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      if (res.ok) {
        const result = await res.json();
        data[collection].push(result.item);
        renderAll();
      }
    } catch (e) { console.error('Error adding item:', e); }
  }

  // Delete item
  async function deleteItem(collection, id) {
    try {
      const res = await fetch(`/api/data/${collection}/${id}`, { method: 'DELETE' });
      if (res.ok) {
        data[collection] = data[collection].filter(i => i.id !== id);
        renderAll();
      }
    } catch (e) { console.error('Error deleting item:', e); }
  }

  // ==================== DASHBOARD ====================
  function renderDashboard() {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const weekWorkouts = data.workouts.filter(w => new Date(w.date) >= weekAgo);
    const recentSleep = data.sleep.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 7);
    const sleepAvg = recentSleep.length
      ? (recentSleep.reduce((s, x) => s + Number(x.hours), 0) / recentSleep.length).toFixed(1)
      : 0;

    const todayMeals = data.meals.filter(m => m.date === todayStr());
    const calAvg = todayMeals.length
      ? todayMeals.reduce((s, x) => s + Number(x.calories), 0)
      : 0;

    // Streak
    let streak = 0;
    const d = new Date();
    while (true) {
      const ds = d.toISOString().split('T')[0];
      const hasWorkout = data.workouts.some(w => w.date === ds);
      if (hasWorkout) { streak++; d.setDate(d.getDate() - 1); }
      else break;
    }

    $('#stat-workouts-week').textContent = weekWorkouts.length;
    $('#stat-sleep-avg').textContent = sleepAvg + 'h';
    $('#stat-calories-avg').textContent = calAvg;
    $('#stat-streak').textContent = streak + ' días';

    // Recent workouts
    const recentW = data.workouts.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
    const rwEl = $('#recent-workouts');
    if (recentW.length === 0) {
      rwEl.innerHTML = '<p class="empty-state">No hay entrenamientos registrados</p>';
    } else {
      rwEl.innerHTML = '<div class="item-list">' + recentW.map(w =>
        `<div class="list-item">
          <div class="item-info">
            <div class="item-title">${w.type} · ${w.duration} min</div>
            <div class="item-detail">${formatDate(w.date)}${w.calories ? ' · ' + w.calories + ' cal' : ''}</div>
          </div>
        </div>`
      ).join('') + '</div>';
    }

    // Recent sleep
    const recentS = data.sleep.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
    const rsEl = $('#recent-sleep');
    if (recentS.length === 0) {
      rsEl.innerHTML = '<p class="empty-state">No hay datos de sueño</p>';
    } else {
      rsEl.innerHTML = '<div class="item-list">' + recentS.map(s =>
        `<div class="list-item">
          <div class="item-info">
            <div class="item-title">${s.hours}h de sueño ${s.quality ? '· Calidad ' + s.quality + '/10' : ''}</div>
            <div class="item-detail">${formatDate(s.date)}</div>
          </div>
        </div>`
      ).join('') + '</div>';
    }
  }

  // ==================== TRAINING ====================
  function renderWorkouts() {
    const sorted = data.workouts.sort((a, b) => new Date(b.date) - new Date(a.date));
    const el = $('#workout-list');
    if (sorted.length === 0) {
      el.innerHTML = '<p class="empty-state">No hay entrenamientos registrados</p>';
    } else {
      el.innerHTML = '<div class="item-list">' + sorted.map(w =>
        `<div class="list-item">
          <div class="item-info">
            <div class="item-title">${w.type} · ${w.duration} min${w.distance ? ' · ' + w.distance + ' km' : ''}</div>
            <div class="item-detail">${formatDate(w.date)}${w.calories ? ' · ' + w.calories + ' cal' : ''}${w.rpe ? ' · RPE: ' + w.rpe : ''}${w.notes ? ' · ' + w.notes : ''}</div>
          </div>
          <div class="item-actions"><button data-collection="workouts" data-id="${w.id}" class="delete-btn">✕</button></div>
        </div>`
      ).join('') + '</div>';
      el.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteItem('workouts', btn.dataset.id));
      });
    }
  }

  $('#workout-form').addEventListener('submit', async e => {
    e.preventDefault();
    await addItem('workouts', {
      date: $('#workout-date').value,
      type: $('#workout-type').value,
      duration: Number($('#workout-duration').value),
      distance: $('#workout-distance').value ? Number($('#workout-distance').value) : undefined,
      calories: $('#workout-calories').value ? Number($('#workout-calories').value) : undefined,
      rpe: $('#workout-rpe').value ? Number($('#workout-rpe').value) : undefined,
      notes: $('#workout-notes').value || undefined,
    });
    $('#workout-form').reset();
    $('#workout-date').value = todayStr();
  });

  // ==================== NUTRITION ====================
  function renderMeals() {
    const sorted = data.meals.sort((a, b) => new Date(b.date) - new Date(a.date));
    const el = $('#meal-list');
    if (sorted.length === 0) {
      el.innerHTML = '<p class="empty-state">No hay comidas registradas</p>';
    } else {
      el.innerHTML = '<div class="item-list">' + sorted.map(m =>
        `<div class="list-item">
          <div class="item-info">
            <div class="item-title">${m.description || m.type} · ${m.calories} cal</div>
            <div class="item-detail">${formatDate(m.date)}${m.protein ? ' · P: ' + m.protein + 'g' : ''}${m.carbs ? ' C: ' + m.carbs + 'g' : ''}${m.fat ? ' G: ' + m.fat + 'g' : ''}</div>
          </div>
          <div class="item-actions"><button data-collection="meals" data-id="${m.id}" class="delete-btn">✕</button></div>
        </div>`
      ).join('') + '</div>';
      el.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteItem('meals', btn.dataset.id));
      });
    }
  }

  $('#meal-form').addEventListener('submit', async e => {
    e.preventDefault();
    await addItem('meals', {
      date: $('#meal-date').value,
      type: $('#meal-type').value,
      calories: Number($('#meal-calories').value),
      protein: $('#meal-protein').value ? Number($('#meal-protein').value) : undefined,
      carbs: $('#meal-carbs').value ? Number($('#meal-carbs').value) : undefined,
      fat: $('#meal-fat').value ? Number($('#meal-fat').value) : undefined,
      description: $('#meal-description').value || undefined,
    });
    $('#meal-form').reset();
    $('#meal-date').value = todayStr();
  });

  // ==================== REST ====================
  function renderSleep() {
    const sorted = data.sleep.sort((a, b) => new Date(b.date) - new Date(a.date));
    const el = $('#sleep-list');
    if (sorted.length === 0) {
      el.innerHTML = '<p class="empty-state">No hay datos de sueño</p>';
    } else {
      el.innerHTML = '<div class="item-list">' + sorted.map(s =>
        `<div class="list-item">
          <div class="item-info">
            <div class="item-title">${s.hours}h ${s.quality ? '· Calidad ' + s.quality + '/10' : ''}</div>
            <div class="item-detail">${formatDate(s.date)}${s.notes ? ' · ' + s.notes : ''}</div>
          </div>
          <div class="item-actions"><button data-collection="sleep" data-id="${s.id}" class="delete-btn">✕</button></div>
        </div>`
      ).join('') + '</div>';
      el.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteItem('sleep', btn.dataset.id));
      });
    }
  }

  $('#sleep-form').addEventListener('submit', async e => {
    e.preventDefault();
    await addItem('sleep', {
      date: $('#sleep-date').value,
      hours: Number($('#sleep-hours').value),
      quality: $('#sleep-quality').value ? Number($('#sleep-quality').value) : undefined,
      notes: $('#sleep-notes').value || undefined,
    });
    $('#sleep-form').reset();
    $('#sleep-date').value = todayStr();
  });

  // ==================== AI CHAT ====================
  function addChatMessage(role, content) {
    const container = $('#chat-messages');
    const msg = document.createElement('div');
    msg.className = 'message ' + role;
    msg.innerHTML = `<div class="message-content">${content}</div>`;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  function showTyping() {
    const container = $('#chat-messages');
    const typing = document.createElement('div');
    typing.className = 'message ai';
    typing.id = 'typing-indicator';
    typing.innerHTML = '<div class="message-content"><div class="typing-indicator"><span></span><span></span><span></span></div></div>';
    container.appendChild(typing);
    container.scrollTop = container.scrollHeight;
  }

  function hideTyping() {
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();
  }

  function getSettings() {
    return {
      apiKey: $('#settings-api-key').value,
      baseUrl: $('#settings-base-url').value,
      model: $('#settings-model').value,
      systemPrompt: $('#settings-system-prompt').value,
    };
  }

  $('#chat-form').addEventListener('submit', async e => {
    e.preventDefault();
    const input = $('#chat-input');
    const msg = input.value.trim();
    if (!msg) return;

    addChatMessage('user', msg);
    input.value = '';
    showTyping();

    const settings = getSettings();

    // Build context for the AI
    const context = {
      workouts: data.workouts.slice(-20),
      meals: data.meals.slice(-20),
      sleep: data.sleep.slice(-20),
      stats: {
        totalWorkouts: data.workouts.length,
        totalMeals: data.meals.length,
        totalSleep: data.sleep.length,
      }
    };

    try {
      const history = data.chatHistory.slice(-20).map(m => ({
        role: m.role,
        content: m.content
      }));

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': settings.apiKey,
          'X-API-Base-Url': settings.baseUrl,
        },
        body: JSON.stringify({
          message: msg,
          context,
          history,
          model: settings.model,
          systemPrompt: settings.systemPrompt,
        }),
      });

      hideTyping();

      if (res.ok) {
        const data_res = await res.json();
        const reply = data_res.choices?.[0]?.message?.content || 'Lo siento, no pude generar una respuesta.';
        addChatMessage('ai', reply);
        data.chatHistory.push({ role: 'user', content: msg });
        data.chatHistory.push({ role: 'assistant', content: reply });
        if (data.chatHistory.length > 100) data.chatHistory = data.chatHistory.slice(-100);
        saveData();
      } else {
        const errText = await res.text();
        addChatMessage('ai', 'Error al conectar con la API: ' + (errText || res.statusText));
      }
    } catch (err) {
      hideTyping();
      addChatMessage('ai', 'Error de conexión: ' + err.message);
    }
  });

  // ==================== GARMIN IMPORT ====================
  const dropzone = $('#garmin-dropzone');
  const fileInput = $('#garmin-file-input');
  let garminData = null;

  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', e => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('drag-over');
  });

  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) processGarminFile(file);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) processGarminFile(fileInput.files[0]);
  });

  function processGarminFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        garminData = JSON.parse(e.target.result);
        const activities = garminData.activities || garminData;
        const count = Array.isArray(activities) ? activities.length : 1;
        $('#garmin-activities-count').textContent = `Se encontraron ${count} actividades.`;
        $('#garmin-preview').style.display = 'block';
        $('#garmin-result').innerHTML = '';
      } catch (err) {
        $('#garmin-result').innerHTML = '<p style="color: var(--danger)">Error al leer el archivo. Asegúrate de que sea JSON válido.</p>';
      }
    };
    reader.readAsText(file);
  }

  $('#garmin-import-btn').addEventListener('click', async () => {
    if (!garminData) return;
    try {
      const res = await fetch('/api/import/garmin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activities: garminData.activities || [garminData]
        }),
      });
      const result = await res.json();
      if (result.ok) {
        $('#garmin-result').innerHTML = `<p style="color: var(--success)">✓ ${result.count} actividades importadas correctamente.</p>`;
        $('#garmin-preview').style.display = 'none';
        garminData = null;
        await loadData();
      } else {
        $('#garmin-result').innerHTML = '<p style="color: var(--danger)">Error al importar.</p>';
      }
    } catch (err) {
      $('#garmin-result').innerHTML = '<p style="color: var(--danger)">Error de conexión.</p>';
    }
  });

  // ==================== SETTINGS ====================
  $('#settings-form').addEventListener('submit', e => {
    e.preventDefault();
    // Save settings to localStorage
    const settings = {
      apiKey: $('#settings-api-key').value,
      baseUrl: $('#settings-base-url').value,
      model: $('#settings-model').value,
      systemPrompt: $('#settings-system-prompt').value,
    };
    localStorage.setItem('fitia-settings', JSON.stringify(settings));
    alert('Configuración guardada.');
  });

  // Load settings
  (function loadSettings() {
    const saved = localStorage.getItem('fitia-settings');
    if (saved) {
      try {
        const s = JSON.parse(saved);
        $('#settings-api-key').value = s.apiKey || '';
        $('#settings-base-url').value = s.baseUrl || 'https://ai-gateway.vercel.sh/v1';
        if (s.model) $('#settings-model').value = s.model;
        if (s.systemPrompt) $('#settings-system-prompt').value = s.systemPrompt;
      } catch(e) {}
    }
  })();

  // Export data
  $('#export-data-btn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fitia-data-' + todayStr() + '.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  // Clear data
  $('#clear-data-btn').addEventListener('click', async () => {
    if (confirm('¿Estás seguro de borrar todos los datos? Esta acción no se puede deshacer.')) {
      data = { workouts: [], meals: [], sleep: [], measurements: [], chatHistory: [] };
      await saveData();
      renderAll();
    }
  });

  // ==================== RENDER ALL ====================
  function renderAll() {
    renderDashboard();
    renderWorkouts();
    renderMeals();
    renderSleep();
  }

  // Set default dates
  (function setDefaultDates() {
    $('#workout-date').value = todayStr();
    $('#meal-date').value = todayStr();
    $('#sleep-date').value = todayStr();
  })();

  // Init
  loadData();
})();
