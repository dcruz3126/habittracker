// ============================================================
// STATE
// ============================================================

const EMOJIS = ['💧','🏃','📚','😴','🧘','🥗','💊','🎯','✍️','🎸','🐕','🌿','🏋️','🧠','❤️','☀️','🛁','📵','💤','🍎'];

const state = {
  habits:      [],
  todayData:   [],
  settings:    {},
  editingId:   null,
  selectedEmoji: EMOJIS[0],
  selectedType: 'boolean',
  activeDays:  ["1","1","1","1","1","1","1"],
  theme:       'dark',
  currentView: 'today',
  selectedDate: null,
};

// ============================================================
// GOOGLE SCRIPT BRIDGE
// ============================================================
// In production, replace mock with real calls:

const API_URL =
  'https://script.google.com/macros/s/AKfycbxZtpmdA0oNewRSxIUsqk81oj6p04T0c6aXgd7zH2Z7uyKN26FMmgh_85-uFQdmdq5y/exec';

async function run(fn, ...args) {
  console.log("RUN CALLED", fn, args);
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: fn,
      ssid: window.SSID,
      args
    })
  });

  return response.json();
}

// ============================================================
// INIT
// ============================================================


async function init() {
  try {
    console.log("INIT STARTED");
    const params = new URLSearchParams(window.location.search);
    const ssid = params.get('ssid');
    window.SSID = ssid;
    
    state.settings = await run('getSettings') || {};
    
      // First time user — show onboarding instead of app
    // const hasSetup = state.settings && state.settings.setup_complete === 'TRUE' || state.settings.setup_complete === true;
    const hasSetup = !window.DEMO_MODE && state.settings && 
    (state.settings.setup_complete === 'TRUE' || 
    state.settings.setup_complete === true);
    if (!hasSetup) {
      document.getElementById('loading').classList.add('hidden');
      document.getElementById('onboarding').style.display = 'flex';
      applyTheme('dark');
      return;
    }

      // Returning user — load normally
      applyTheme(state.settings.theme === 'light' ? 'light' : 'dark');
      await loadToday();
      await loadSettings();
  } catch(e) {
    console.error('Init error', e);
  } finally {
    setTimeout(() => {
      document.getElementById('loading').classList.add('hidden');
    }, 1000);
  }

}


// ============================================================
// NAVIGATION
// ============================================================
function goTo(view) {
  state.currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.getElementById('nav-' + view).classList.add('active');

  if (view === 'stats')    loadStats();
  if (view === 'settings') loadSettings();
  if (view === 'today') loadToday();
}

// ============================================================
// TODAY
// ============================================================
async function loadToday() {
    showLoader();
  try {
    const now      = state.selectedDate
      ? new Date(state.selectedDate + 'T00:00:00')
      : new Date();

    const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    const today  = new Date();
    today.setHours(0,0,0,0);
    const isToday = now.toDateString() === today.toDateString();

    // Date label
    document.getElementById('today-date').innerHTML = isToday
      ? `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}<em>.</em>`
      : `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}<em> ↩</em>`;

    // Greeting — only show on today
    const h = now.getHours();
    const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    document.getElementById('today-greeting').textContent = isToday
      ? (state.settings.user_name ? `${greeting}, ${state.settings.user_name}` : greeting)
      : 'Viewing past day';

    // Disable next arrow if today, disable prev if at 7-day limit
    const minDate = new Date(today);
    minDate.setDate(minDate.getDate() - 7);
    document.getElementById('date-next').classList.toggle('disabled', isToday);
    document.getElementById('date-prev').classList.toggle('disabled', now <= minDate);

    try {
      const dateParam = state.selectedDate || _getTodayString();
      state.todayData = await run('getTodayHabits', dateParam) || [];
      console.log('today ', state.todayData)
      renderToday();
    } catch(e) { console.error(e); }

  } catch(e) { 
    console.error(e); 
  } finally {
    hideLoader();
  }
}

function renderToday() {
  const active = state.todayData.filter(h => !h.completed);
  const done   = state.todayData.filter(h =>  h.completed);
  const total  = state.todayData.length;
  const doneCount = done.length;

  // Progress
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  document.getElementById('progress-fill').style.width  = pct + '%';
  document.getElementById('progress-label').textContent = `${doneCount} / ${total}`;

  // All done banner
  const banner = document.getElementById('all-done-banner');
  if (total > 0 && doneCount === total) {
    banner.classList.add('show');
  } else {
    banner.classList.remove('show');
  }

  // Active habits
  const activeEl = document.getElementById('active-habits');
  const activeLabel = document.getElementById('active-label');
  activeEl.innerHTML = '';
  if (active.length === 0 && done.length > 0) {
    activeLabel.style.display = 'none';
  } else {
    activeLabel.style.display = active.length > 0 ? 'block' : 'none';
    active.forEach((h, i) => {
      console.log('streak: ', h.streak)
      activeEl.appendChild(buildHabitCard(h, i));
    });
  }

  // Done habits
  const doneEl    = document.getElementById('done-habits');
  const doneLabel = document.getElementById('done-label');
  doneEl.innerHTML = '';
  if (done.length > 0) {
    doneLabel.classList.add('show');
    done.forEach((h, i) => {
      doneEl.appendChild(buildHabitCard(h, i));
    });
  } else {
    doneLabel.classList.remove('show');
  }
}

function buildHabitCard(h, i) {
  const card = document.createElement('div');
  card.className = 'habit-card' + (h.completed ? ' done' : '');
  card.style.animationDelay = (i * 40) + 'ms';
  card.dataset.id = h.habit_id;

  const streakHtml = h.streak > 0
    ? `<span class="habit-streak-fire">🔥</span> ${h.streak} day streak`
    : 'No streak yet';

  if (h.type === 'boolean') {
    card.innerHTML = `
      <div class="habit-emoji">${h.emoji}</div>
      <div class="habit-info">
        <div class="habit-name">${h.habit_name}</div>
        <div class="habit-streak">${streakHtml}</div>
      </div>
      <div class="habit-check" onclick="tapBoolean('${h.habit_id}', this)">
        <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
    `;
  } else {
    const val  = h.value_today || 0;
    const goal = h.goal || 1;
    card.innerHTML = `
      <div class="habit-emoji">${h.emoji}</div>
      <div class="habit-info">
        <div class="habit-name">${h.habit_name}</div>
        <div class="habit-streak">${streakHtml}</div>
      </div>
      <div class="habit-qty">
        <div class="qty-btn" onclick="adjustQty('${h.habit_id}', -1, event)">−</div>
        <div style="display:flex; flex-direction:column; align-items:center;">
          <input 
            class="qty-val" 
            id="qty-val-${h.habit_id}" 
            type="number" 
            value="${val}"
            min="0"
            inputmode="numeric"
            onclick="event.stopPropagation()"
            onchange="handleQtyInput('${h.habit_id}', this)"
            style="border:none; background:transparent; text-align:center; width:36px; color:var(--c-text); font-size:14px; font-weight:500; font-family:var(--font-body);"
          >
          <div class="qty-goal">/ ${goal} ${h.unit}</div>
        </div>
        <div class="qty-btn" onclick="adjustQty('${h.habit_id}', 1, event)">+</div>
      </div>
    `;
  }
  return card;
}

async function tapBoolean(habitId, checkEl) {
  const habit = state.todayData.find(h => h.habit_id === habitId);
  if (!habit) return;

  const newVal = habit.completed ? 0 : 1;
  habit.value_today = newVal;
  habit.completed   = !habit.completed;

  checkEl.classList.add('check-pop');
  setTimeout(() => checkEl.classList.remove('check-pop'), 400);

  renderToday();

  try {
    const date = state.selectedDate || _getTodayString();
    if (newVal === 0) {
      // Unchecking — delete the log entry
      await run('deleteLog', habitId, date);
      habit.streak = 0;
    } else {
      // Checking — log it
      const res = await run('logHabit', habitId, newVal, date);
      if (res && res.streak !== undefined) {
        habit.streak = res.streak;
      }
    }
    renderToday();
  } catch(e) { showToast('Could not save — try again'); }
}

async function adjustQty(habitId, delta, e) {
  e.stopPropagation();
  const habit = state.todayData.find(h => h.habit_id === habitId);
  if (!habit) return;

  const newVal = Math.max(0, (habit.value_today || 0) + delta);
  habit.value_today = newVal;
  habit.completed   = newVal >= habit.goal;

  // Optimistic UI — updates instantly
  const valEl = document.getElementById('qty-val-' + habitId);
  if (valEl) valEl.value = newVal; // changed from .textContent
  
  // const valEl = document.getElementById('qty-val-' + habitId);
  // if (valEl) valEl.textContent = newVal;
  document.getElementById('progress-fill').style.width =
    (state.todayData.filter(h=>h.completed).length / state.todayData.length * 100) + '%';

  if (habit.completed) {
    setTimeout(renderToday, 300);
  }

  // Debounced save — only fires 2 seconds after last tap
  const date = state.selectedDate || _getTodayString();
  debouncedLogHabit(habitId, newVal, date);
}

function handleQtyInput(habitId, input) {
  // Strip non-numeric
  let val = parseInt(input.value);

  // Validate
  if (isNaN(val) || val < 0) {
    val = 0;
  }

  // Cap at something reasonable
  if (val > 9999) val = 9999;

  // Update display and state
  input.value = val;
  const habit = state.todayData.find(h => h.habit_id === habitId);
  if (!habit) return;

  habit.value_today = val;
  habit.completed   = val >= habit.goal;

  document.getElementById('progress-fill').style.width =
    (state.todayData.filter(h=>h.completed).length / state.todayData.length * 100) + '%';

  if (habit.completed) setTimeout(renderToday, 300);

  const date = state.selectedDate || _getTodayString();
  debouncedLogHabit(habitId, val, date);
}

// ============================================================
// STATS
// ============================================================
async function loadStats() {
  const el = document.getElementById('stats-content');
  el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-title">Loading…</div></div>';
  try {
    const data = await run('getStats');
    renderStats(data);
  } catch(e) { el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-title">Could not load stats</div></div>'; }
}

function renderStats(data) {
  if (!data) return;
  const el = document.getElementById('stats-content');
  const totalHabits = data.habits.length;
  const avgStreak   = totalHabits > 0
    ? Math.round(data.habits.reduce((s,h) => s + h.streak, 0) / totalHabits)
    : 0;

  let html = `
    <div class="stats-summary">
      <div class="stat-block">
        <div class="stat-num">${avgStreak}</div>
        <div class="stat-label">Avg. streak</div>
      </div>
      <div class="stat-block">
        <div class="stat-num">${data.month_total_completed}</div>
        <div class="stat-label">Completed this month</div>
      </div>
      <div class="stat-block">
        <div class="stat-num">${data.best_day}</div>
        <div class="stat-label">Best day</div>
      </div>
      <div class="stat-block">
        <div class="stat-num">${totalHabits}</div>
        <div class="stat-label">Active habits</div>
      </div>
    </div>
    <div class="section-label">Per Habit</div>
  `;

  data.habits.forEach((h, i) => {
    html += `
      <div class="stat-habit-card" style="animation-delay:${i*50}ms">
        <div class="stat-habit-header">
          <div class="stat-habit-emoji">${h.emoji}</div>
          <div class="stat-habit-name">${h.habit_name}</div>
        </div>
        <div class="stat-habit-row">
          <div class="stat-mini">
            <div class="stat-mini-num">${h.streak}<span>🔥</span></div>
            <div class="stat-mini-label">Current streak</div>
          </div>
          <div class="stat-mini">
            <div class="stat-mini-num">${h.longest_streak}</div>
            <div class="stat-mini-label">Best streak</div>
          </div>
          <div class="stat-mini">
            <div class="stat-mini-num">${h.month_pct}<span>%</span></div>
            <div class="stat-mini-label">This month</div>
          </div>
        </div>
        <div class="month-bar-wrap">
          <div class="month-bar-header">
            <span>Monthly completion</span>
            <span>${h.month_pct}%</span>
          </div>
          <div class="month-bar-track">
            <div class="month-bar-fill" style="width:0%" data-pct="${h.month_pct}"></div>
          </div>
        </div>
      </div>
    `;
  });

  el.innerHTML = html;

  // Animate bars
  setTimeout(() => {
    el.querySelectorAll('.month-bar-fill').forEach(bar => {
      bar.style.width = bar.dataset.pct + '%';
    });
  }, 100);
}

// ============================================================
// SETTINGS
// ============================================================
async function loadSettings() {
    showLoader();
  try {
    const habits = await run('getAllHabitsForSettings') || [];
    renderManageHabits(habits);
    // Sync theme toggle
    const tog = document.getElementById('theme-toggle');
    if (state.theme === 'dark') tog.classList.add('on');
    else tog.classList.remove('on');
  } catch(e) { 
    console.error(e); 
  } finally {
    hideLoader();
  }
}

function renderManageHabits(habits) {
  const list = document.getElementById('manage-habits-list');
  let html = '';
  habits.forEach(h => {
    html += `
      <div class="manage-habit-row" onclick="openEditHabit(${JSON.stringify(h).replace(/"/g,'&quot;')})">
        <div class="manage-habit-emoji">${h.emoji}</div>
        <div class="manage-habit-name">${h.habit_name}</div>
        <div class="manage-habit-chevron">
          <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>
    `;
  });
  html += `
    <div class="add-habit-row" onclick="openAddHabit()">
      <div class="add-habit-icon">+</div>
      Add new habit
    </div>
  `;
  list.innerHTML = html;
}

// ============================================================
// THEME
// ============================================================
function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : '');
  const tog = document.getElementById('theme-toggle');
  if (theme === 'dark') tog.classList.add('on');
  else tog.classList.remove('on');
}

function toggleTheme() {
  const next = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  run('saveSetting', 'theme', next);
}

// ============================================================
// ADD / EDIT HABIT MODAL
// ============================================================
function buildEmojiPicker() {
  const row = document.getElementById('emoji-row');
  row.innerHTML = '';
  EMOJIS.forEach(em => {
    const el = document.createElement('div');
    el.className = 'emoji-opt' + (em === state.selectedEmoji ? ' selected' : '');
    el.textContent = em;
    el.onclick = () => {
      state.selectedEmoji = em;
      row.querySelectorAll('.emoji-opt').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
    };
    row.appendChild(el);
  });
}

function openAddHabit() {
  state.editingId = null;
  state.selectedEmoji = EMOJIS[0];
  state.selectedType  = 'boolean';
  state.activeDays    = ["1","1","1","1","1","1","1"];

  document.getElementById('modal-title').textContent = 'New Habit';
  document.getElementById('habit-name-input').value  = '';
  document.getElementById('habit-goal-input').value  = '';
  document.getElementById('habit-unit-input').value  = '';
  document.getElementById('delete-habit-btn').style.display = 'none';

  selectType('boolean');
  syncDayPills();
  buildEmojiPicker();
  document.getElementById('habit-modal-overlay').classList.add('open');
}

function openEditHabit(habit) {
  state.editingId     = habit.habit_id;
  state.selectedEmoji = habit.emoji || EMOJIS[0];
  state.selectedType  = habit.type  || 'boolean';
  state.activeDays    = (habit.active_days || '1111111').split('');

  document.getElementById('modal-title').textContent            = 'Edit Habit';
  document.getElementById('habit-name-input').value             = habit.habit_name || '';
  document.getElementById('habit-goal-input').value             = habit.goal || '';
  document.getElementById('habit-unit-input').value             = habit.unit || '';
  document.getElementById('delete-habit-btn').style.display     = 'block';

  selectType(state.selectedType);
  syncDayPills();
  buildEmojiPicker();
  document.getElementById('habit-modal-overlay').classList.add('open');
}

function closeHabitModal(e) {
  if (e && e.target !== document.getElementById('habit-modal-overlay')) return;
  document.getElementById('habit-modal-overlay').classList.remove('open');
}

function selectType(type) {
  state.selectedType = type;
  document.getElementById('type-boolean').classList.toggle('selected',  type === 'boolean');
  document.getElementById('type-quantity').classList.toggle('selected', type === 'quantity');
  document.getElementById('qty-fields').style.display = type === 'quantity' ? 'block' : 'none';
}

function syncDayPills() {
  document.querySelectorAll('#days-row .day-pill').forEach((pill, i) => {
    pill.classList.toggle('on', state.activeDays[i] === '1');

    console.log(`INIT PILL ${i}`, {
      state: state.activeDays[i],
      isOnClass: pill.classList.contains('on')
    });
    pill.onclick = () => {
      state.activeDays[i] = state.activeDays[i] === '1' ? '0' : '1';
      pill.classList.toggle('on', state.activeDays[i] === '1');
    };
  });

  console.log('sync days: ', state.active_days)
}

async function saveHabit() {
  const name = document.getElementById('habit-name-input').value.trim();
  if (!name) { showToast('Please enter a habit name'); return; }

  const goal      = document.getElementById('habit-goal-input').value || 1;
  const unit      = document.getElementById('habit-unit-input').value.trim();
  const activeDays = state.activeDays.join('');

  const btn = document.querySelector('#habit-modal-overlay .btn-primary');
  
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    if (state.editingId) {
      await run('updateHabit', state.editingId, {
        habit_name: name,
        emoji:      state.selectedEmoji,
        type:       state.selectedType,
        goal:       goal,
        unit:       unit,
        active_days: activeDays,
      });
      showToast('Habit updated');
    } else {
      await run('addHabit', name, state.selectedEmoji, state.selectedType, goal, unit, activeDays);
      showToast('Habit added');
    }
    document.getElementById('habit-modal-overlay').classList.remove('open');
    await loadToday();
    if (state.currentView === 'settings') loadSettings();
  } catch(e) { 
    showToast('Could not save — try again');

  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Habit';

  }
}

async function confirmDeleteHabit() {
  if (!state.editingId) return;
  if (!confirm('Delete this habit? Your history will be kept.')) return;
  try {
    await run('deleteHabit', state.editingId);
    showToast('Habit deleted');
    document.getElementById('habit-modal-overlay').classList.remove('open');
    await loadToday();
    if (state.currentView === 'settings') loadSettings();
  } catch(e) { showToast('Could not delete — try again'); }
}

// ============================================================
// TOAST
// ============================================================
let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}
// ============================================================
// ONBOARDING
// ============================================================
let obTheme = 'dark';
let obType  = 'boolean';
let obEmoji = EMOJIS[0];

function obSelectTheme(theme) {
  obTheme = theme;
  applyTheme(theme);
  document.getElementById('ob-dark').classList.toggle('selected',  theme === 'dark');
  document.getElementById('ob-light').classList.toggle('selected', theme === 'light');
}

function obSelectType(type) {
  obType = type;
  document.getElementById('ob-type-boolean').classList.toggle('selected',  type === 'boolean');
  document.getElementById('ob-type-quantity').classList.toggle('selected', type === 'quantity');
  document.getElementById('ob-qty-fields').style.display = type === 'quantity' ? 'block' : 'none';
}

function obBuildEmojiPicker() {
  const row = document.getElementById('ob-emoji-row');
  row.innerHTML = '';
  EMOJIS.forEach(em => {
    const el = document.createElement('div');
    el.className = 'emoji-opt' + (em === obEmoji ? ' selected' : '');
    el.textContent = em;
    el.onclick = () => {
      obEmoji = em;
      row.querySelectorAll('.emoji-opt').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
    };
    row.appendChild(el);
  });
}

function obNext(from) {
  if (from === 1) {
    const name = document.getElementById('ob-name').value.trim();
    if (!name) { showToast('Please enter your name'); return; }
    if (!window.DEMO_MODE) {state.settings.user_name = name};
  }
  const current = document.getElementById('ob-screen-' + from);
  const next    = document.getElementById('ob-screen-' + (from + 1));
  current.classList.remove('active');
  next.classList.add('active');
  if (from + 1 === 3) obBuildEmojiPicker();
}

async function obFinish() {
  const habitName = document.getElementById('ob-habit-name').value.trim();
  if (!habitName) { showToast('Please name your first habit'); return; }
  document.getElementById('app').style.display = 'none';
  showLoader();
  const goal = document.getElementById('ob-goal').value || 1;
  const unit = document.getElementById('ob-unit').value.trim();

  const btn = document.querySelector('#ob-screen-3 .btn-primary');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    
    // await run('setupTracker');
    if (!window.DEMO_MODE) {
      await run('saveSetting', 'user_name', state.settings.user_name);
      await run('saveSetting', 'theme', obTheme);
      await run('saveSetting', 'setup_complete', 'TRUE');
      await run('addHabit', habitName, obEmoji, obType, goal, unit, '1111111');
    }

    document.getElementById('onboarding').style.display = 'none';
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('app').style.display = 'flex';
    await loadToday();
    showToast('Welcome, ' + state.settings.user_name + '! 🎉');
  } catch(e) {
    console.error('obFinish error:', e); // ADD THIS
    showToast('Something went wrong — try again');
    btn.disabled = false;
    btn.textContent = 'Start Tracking →';
  }finally {
    hideLoader();
  }
}

function changeDay(delta) {
  const baseStr = state.selectedDate || _getTodayString();
  const base    = new Date(baseStr + 'T00:00:00');
  base.setDate(base.getDate() + delta);

  const todayStr = _getTodayString();
  const today    = new Date(todayStr + 'T00:00:00');
  const minDate  = new Date(todayStr + 'T00:00:00');
  minDate.setDate(minDate.getDate() - 7);

  // Clamp
  if (base > today || base < minDate) return;

  const newStr  = base.toISOString().slice(0, 10); // safe here, base is midnight local
  const isToday = newStr === todayStr;
  state.selectedDate = isToday ? null : newStr;

  loadToday();
}


function _getTodayString() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function showInstallPrompt() {
  const isIOS     = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid = /android/i.test(navigator.userAgent);

  if (isIOS) {
    showToast('Tap the Share icon → "Add to Home Screen"');
  } else if (isAndroid) {
    showToast('Tap the menu (⋮) → "Add to Home Screen"');
  } else {
    showToast('Open this on your phone to install');
  }
}
function showLoader() {
  document.getElementById('view-loader').classList.add('show');
}
function hideLoader() {
  document.getElementById('view-loader').classList.remove('show');
}
const qtyDebounceTimers = {};

function debouncedLogHabit(habitId, value, date, delay = 2000) {
  if (qtyDebounceTimers[habitId]) {
    clearTimeout(qtyDebounceTimers[habitId]);
  }
  qtyDebounceTimers[habitId] = setTimeout(async () => {
    try {
      const res = await run('logHabit', habitId, value, date);
      const habit = state.todayData.find(h => h.habit_id === habitId);
      if (res && res.streak !== undefined && habit) {
        habit.streak = res.streak;
      }
    } catch(e) {
      showToast('Could not save — try again');
    }
    delete qtyDebounceTimers[habitId];
  }, delay);
}
