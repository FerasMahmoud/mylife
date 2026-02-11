/* ==========================================================================
   MyLife - Personal Health Tracking PWA
   Main application controller (SPA router + page controllers)
   ========================================================================== */

const App = {
  currentPage: 'dashboard',
  currentDate: new Date(),
  currentTrackTab: 'health',
  meditationTimer: null,
  meditationSeconds: 0,
  selectedMood: null,
  selectedHabitIcon: '\u2705',
  confirmCallback: null,
  foodSearchDebounceTimer: null,

  // Mood value to emoji mapping
  moodEmojis: {
    1: '\uD83D\uDE22',
    2: '\uD83D\uDE15',
    3: '\uD83D\uDE10',
    4: '\uD83D\uDE42',
    5: '\uD83D\uDE0A'
  },

  // ===== INITIALIZATION =====
  async init() {
    try {
      const url = localStorage.getItem('mylife-script-url');
      if (typeof DataStore !== 'undefined') {
        await DataStore.init(url);
      }

      this.loadTheme();
      this.setupNav();
      this.setupForms();
      this.setupModals();
      this.setupThemeToggle();
      this.setupDatePicker();
      this.setupTrackSubTabs();
      this.setupSliders();
      this.setupMoodPicker();
      this.setupEmojiPicker();
      this.setupSettingsButtons();
      this.setupFoodSearch();

      // Restore last track sub-tab
      const savedTab = localStorage.getItem('mylife-track-tab');
      if (savedTab) {
        this.currentTrackTab = savedTab;
      }

      // Handle URL hash navigation
      const hash = window.location.hash.replace('#', '');
      if (hash && ['dashboard', 'track', 'habits', 'goals', 'settings'].includes(hash)) {
        this.navigate(hash);
      } else {
        this.navigate('dashboard');
      }

      this.registerSW();

      window.addEventListener('mylife-sync', () => this.refreshCurrentPage());
      window.addEventListener('online', () => this.updateSyncStatus());
      window.addEventListener('offline', () => this.updateSyncStatus());
      window.addEventListener('hashchange', () => {
        const h = window.location.hash.replace('#', '');
        if (h && h !== this.currentPage) {
          this.navigate(h);
        }
      });
    } catch (err) {
      console.error('App init error:', err);
    }
  },

  // ===== NAVIGATION =====
  setupNav() {
    const nav = document.querySelector('#bottom-nav');
    if (!nav) return;
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-page]');
      if (!btn) return;
      const page = btn.getAttribute('data-page');
      this.navigate(page);
    });
  },

  navigate(page) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    // Show target page
    const targetPage = document.querySelector(`#page-${page}`);
    if (targetPage) {
      targetPage.classList.add('active');
    }

    // Update nav active state
    document.querySelectorAll('.bottom-nav__item').forEach(btn => btn.classList.remove('active'));
    const navBtn = document.querySelector(`#nav-${page}`);
    if (navBtn) {
      navBtn.classList.add('active');
    }

    this.currentPage = page;
    window.location.hash = page;

    // Load page data
    switch (page) {
      case 'dashboard':
        this.loadDashboard();
        break;
      case 'track':
        this.loadTrackPage();
        break;
      case 'habits':
        this.loadHabits();
        break;
      case 'goals':
        this.loadGoals();
        break;
      case 'settings':
        this.loadSettings();
        break;
    }
  },

  // ===== THEME =====
  loadTheme() {
    const theme = localStorage.getItem('mylife-theme') || 'light';
    document.documentElement.setAttribute('data-theme', theme);
    this.updateThemeIcons(theme);
    const toggle = document.querySelector('#toggle-dark-mode');
    if (toggle) {
      toggle.checked = theme === 'dark';
    }
  },

  setupThemeToggle() {
    const headerBtn = document.querySelector('#btn-theme-toggle');
    if (headerBtn) {
      headerBtn.addEventListener('click', () => this.toggleTheme());
    }
    const settingsToggle = document.querySelector('#toggle-dark-mode');
    if (settingsToggle) {
      settingsToggle.addEventListener('change', () => this.toggleTheme());
    }
  },

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('mylife-theme', next);
    this.updateThemeIcons(next);

    const toggle = document.querySelector('#toggle-dark-mode');
    if (toggle) {
      toggle.checked = next === 'dark';
    }

    // Re-render charts on current page since colors may change
    this.refreshCurrentPage();
  },

  updateThemeIcons(theme) {
    const sun = document.querySelector('#icon-sun');
    const moon = document.querySelector('#icon-moon');
    if (sun && moon) {
      if (theme === 'dark') {
        sun.style.display = 'none';
        moon.style.display = '';
      } else {
        sun.style.display = '';
        moon.style.display = 'none';
      }
    }
  },

  // ===== DATE PICKER =====
  setupDatePicker() {
    const prevBtn = document.querySelector('#day-prev');
    const nextBtn = document.querySelector('#day-next');
    const label = document.querySelector('#day-picker-label');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        this.currentDate = new Date(this.currentDate.getTime() - 86400000);
        this.updateDateDisplay();
        this.refreshCurrentPage();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        this.currentDate = new Date(this.currentDate.getTime() + 86400000);
        this.updateDateDisplay();
        this.refreshCurrentPage();
      });
    }

    if (label) {
      label.addEventListener('click', () => {
        this.currentDate = new Date();
        this.updateDateDisplay();
        this.refreshCurrentPage();
      });
    }

    this.updateDateDisplay();
  },

  updateDateDisplay() {
    const label = document.querySelector('#day-picker-label');
    const appBarDate = document.querySelector('#app-bar-date');
    const greetingDate = document.querySelector('#greeting-date');
    const habitsDate = document.querySelector('#habits-date');

    const today = new Date();
    const isToday = this.formatDate(this.currentDate) === this.formatDate(today);
    const displayText = isToday ? 'Today' : this.formatDisplayDate(this.currentDate);

    if (label) label.textContent = displayText;
    if (appBarDate) appBarDate.textContent = this.formatDisplayDate(this.currentDate);
    if (greetingDate) greetingDate.textContent = this.formatFullDate(this.currentDate);
    if (habitsDate) habitsDate.textContent = displayText;
  },

  formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  formatDisplayDate(date) {
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  },

  formatFullDate(date) {
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  },

  // ===== SLIDERS =====
  setupSliders() {
    const sleepQuality = document.querySelector('#input-sleep-quality');
    const sleepVal = document.querySelector('#sleep-quality-val');
    if (sleepQuality && sleepVal) {
      sleepQuality.addEventListener('input', () => {
        sleepVal.textContent = sleepQuality.value;
      });
    }

    const stress = document.querySelector('#input-stress');
    const stressVal = document.querySelector('#stress-val');
    if (stress && stressVal) {
      stress.addEventListener('input', () => {
        stressVal.textContent = stress.value;
      });
    }

    const energy = document.querySelector('#input-energy');
    const energyVal = document.querySelector('#energy-val');
    if (energy && energyVal) {
      energy.addEventListener('input', () => {
        energyVal.textContent = energy.value;
      });
    }
  },

  // ===== MOOD PICKER =====
  setupMoodPicker() {
    const picker = document.querySelector('#mood-picker');
    if (!picker) return;
    picker.addEventListener('click', (e) => {
      const btn = e.target.closest('.mood-btn');
      if (!btn) return;
      const mood = btn.getAttribute('data-mood');
      this.selectedMood = Number(mood);
      const hidden = document.querySelector('#input-mood-value');
      if (hidden) hidden.value = mood;

      picker.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  },

  // ===== EMOJI PICKER (for habits) =====
  setupEmojiPicker() {
    const picker = document.querySelector('#emoji-picker-mini');
    if (!picker) return;
    picker.addEventListener('click', (e) => {
      const btn = e.target.closest('.emoji-btn');
      if (!btn) return;
      const emoji = btn.getAttribute('data-emoji');
      this.selectedHabitIcon = emoji;
      const hidden = document.querySelector('#input-habit-icon');
      if (hidden) hidden.value = emoji;

      picker.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  },

  // ===== FOOD SEARCH =====
  setupFoodSearch() {
    const input = document.querySelector('#input-food-search');
    if (!input) return;
    input.addEventListener('input', () => {
      clearTimeout(this.foodSearchDebounceTimer);
      const query = input.value.trim();
      if (query.length < 2) {
        this.clearFoodResults();
        return;
      }
      this.foodSearchDebounceTimer = setTimeout(() => {
        this.searchFood(query);
      }, 300);
    });
  },

  async searchFood(query) {
    const resultsEl = document.querySelector('#food-results');
    if (!resultsEl) return;

    if (typeof FoodSearch === 'undefined') {
      resultsEl.innerHTML = '<li class="empty-state">Food search not available.</li>';
      return;
    }

    try {
      const results = await FoodSearch.search(query);
      if (!results || results.length === 0) {
        resultsEl.innerHTML = '<li class="empty-state">No results found.</li>';
        return;
      }

      resultsEl.innerHTML = results.map((item, idx) => `
        <li class="food-result-item" data-food-index="${idx}">
          <div class="food-result-item__name">${this.escapeHtml(item.name)}</div>
          <div class="food-result-item__details">
            ${item.calories || 0} kcal &bull; P: ${item.protein || 0}g &bull; C: ${item.carbs || 0}g &bull; F: ${item.fat || 0}g
          </div>
          ${item.serving ? `<div class="food-result-item__serving">${this.escapeHtml(item.serving)}</div>` : ''}
        </li>
      `).join('');

      // Attach click handlers via delegation
      resultsEl.onclick = (e) => {
        const item = e.target.closest('.food-result-item');
        if (!item) return;
        const idx = Number(item.getAttribute('data-food-index'));
        const food = results[idx];
        if (food) {
          this.fillMealForm(food);
          this.clearFoodResults();
          const searchInput = document.querySelector('#input-food-search');
          if (searchInput) searchInput.value = '';
        }
      };
    } catch (err) {
      console.error('Food search error:', err);
      resultsEl.innerHTML = '<li class="empty-state">Search failed. Try again.</li>';
    }
  },

  fillMealForm(food) {
    const name = document.querySelector('#input-food-name');
    const cal = document.querySelector('#input-meal-calories');
    const protein = document.querySelector('#input-meal-protein');
    const carbs = document.querySelector('#input-meal-carbs');
    const fat = document.querySelector('#input-meal-fat');
    const fiber = document.querySelector('#input-meal-fiber');

    if (name) name.value = food.name || '';
    if (cal) cal.value = food.calories || '';
    if (protein) protein.value = food.protein || '';
    if (carbs) carbs.value = food.carbs || '';
    if (fat) fat.value = food.fat || '';
    if (fiber) fiber.value = food.fiber || '';
  },

  clearFoodResults() {
    const el = document.querySelector('#food-results');
    if (el) {
      el.innerHTML = '';
      el.onclick = null;
    }
  },

  // ===== DASHBOARD =====
  async loadDashboard() {
    const dateStr = this.formatDate(this.currentDate);
    this.updateGreeting();
    this.updateDateDisplay();

    try {
      const [health, sleep, nutrition, water, mood, habits, habitDefs] = await Promise.all([
        this.safeGet('health', { date: dateStr }),
        this.safeGet('sleep', { date: dateStr }),
        this.safeGet('nutrition', { date: dateStr }),
        this.safeGet('water', { date: dateStr }),
        this.safeGet('mood', { date: dateStr }),
        this.safeGet('habits', { date: dateStr }),
        this.safeGet('habit_defs')
      ]);

      // Weight
      const weightEl = document.querySelector('#val-weight');
      if (weightEl) {
        const latestWeight = this.findLatest(health, 'weight_kg');
        weightEl.textContent = latestWeight !== null ? latestWeight : '--';
      }

      // Sleep
      const sleepEl = document.querySelector('#val-sleep');
      if (sleepEl) {
        const totalSleep = sleep.reduce((sum, s) => sum + (Number(s.hours) || 0), 0);
        sleepEl.textContent = totalSleep > 0 ? totalSleep.toFixed(1) : '--';
      }

      // Calories
      const calEl = document.querySelector('#val-calories');
      if (calEl) {
        const totalCal = nutrition.reduce((sum, n) => sum + (Number(n.calories) || 0), 0);
        calEl.textContent = totalCal > 0 ? totalCal : '--';
      }

      // Water
      const waterEl = document.querySelector('#val-water');
      if (waterEl) {
        const totalWater = water.reduce((sum, w) => sum + (Number(w.amount_ml) || 0), 0);
        waterEl.textContent = totalWater > 0 ? totalWater : '--';
      }

      // Mood
      const moodEl = document.querySelector('#val-mood');
      if (moodEl) {
        if (mood.length > 0) {
          const latestMood = mood[mood.length - 1];
          const moodVal = Number(latestMood.mood);
          moodEl.textContent = this.moodEmojis[moodVal] || moodVal || '--';
        } else {
          moodEl.textContent = '--';
        }
      }

      // Habits percentage
      const habitsEl = document.querySelector('#val-habits-pct');
      if (habitsEl) {
        const activeHabits = (habitDefs || []).filter(h => h.active !== false && h.active !== 'false');
        if (activeHabits.length > 0) {
          const completedCount = habits.filter(h => Number(h.completed) === 1).length;
          const pct = Math.round((completedCount / activeHabits.length) * 100);
          habitsEl.textContent = pct;
        } else {
          habitsEl.textContent = '--';
        }
      }

      // Render mini habit checklist
      this.renderDashboardHabits(habitDefs, habits);

      // Render trend charts
      await this.renderWeightTrend();
      await this.renderMoodTrend();
    } catch (err) {
      console.error('Dashboard load error:', err);
    }
  },

  updateGreeting() {
    const hour = new Date().getHours();
    let greeting = 'Good evening';
    if (hour < 12) greeting = 'Good morning';
    else if (hour < 17) greeting = 'Good afternoon';

    const el = document.querySelector('#greeting-text');
    if (el) {
      const profileName = localStorage.getItem('mylife-profile-name');
      el.textContent = profileName ? `${greeting}, ${profileName}` : greeting;
    }
  },

  renderDashboardHabits(habitDefs, todayHabits) {
    const container = document.querySelector('#dashboard-habits');
    if (!container) return;

    const activeHabits = (habitDefs || []).filter(h => h.active !== false && h.active !== 'false');
    if (activeHabits.length === 0) {
      container.innerHTML = '<li class="empty-state">No habits yet. Add some in the Habits tab.</li>';
      return;
    }

    container.innerHTML = activeHabits.map(habit => {
      const entry = (todayHabits || []).find(h => h.habit_id === habit.id);
      const checked = entry && Number(entry.completed) === 1;
      return `
        <li class="habit-mini-item">
          <label class="habit-mini-item__label">
            <input type="checkbox" class="habit-mini-checkbox" data-habit-id="${this.escapeHtml(habit.id)}" ${checked ? 'checked' : ''}>
            <span class="habit-mini-item__icon">${habit.icon || '\u2705'}</span>
            <span class="habit-mini-item__name">${this.escapeHtml(habit.name)}</span>
          </label>
        </li>
      `;
    }).join('');

    // Event delegation for checkboxes
    container.onclick = (e) => {
      const checkbox = e.target.closest('.habit-mini-checkbox');
      if (!checkbox) return;
      const habitId = checkbox.getAttribute('data-habit-id');
      this.toggleHabit(habitId, checkbox.checked);
    };
  },

  async renderWeightTrend() {
    if (typeof Charts === 'undefined') return;

    const to = this.formatDate(this.currentDate);
    const fromDate = new Date(this.currentDate.getTime() - 7 * 86400000);
    const from = this.formatDate(fromDate);

    try {
      const data = await this.safeGet('health', { from, to });
      const filtered = data.filter(d => d.weight_kg);

      Charts.destroy('chart-weight');

      if (filtered.length > 0) {
        const labels = filtered.map(d => (d.date || '').slice(5));
        const values = filtered.map(d => Number(d.weight_kg));
        Charts.line('chart-weight', labels, values, { label: 'Weight (kg)' });
      }
    } catch (err) {
      console.error('Weight trend error:', err);
    }
  },

  async renderMoodTrend() {
    if (typeof Charts === 'undefined') return;

    const to = this.formatDate(this.currentDate);
    const fromDate = new Date(this.currentDate.getTime() - 7 * 86400000);
    const from = this.formatDate(fromDate);

    try {
      const data = await this.safeGet('mood', { from, to });

      Charts.destroy('chart-mood');

      if (data.length > 0) {
        const labels = data.map(d => (d.date || '').slice(5));
        const values = data.map(d => Number(d.mood));
        Charts.line('chart-mood', labels, values, { label: 'Mood (1-5)' });
      }
    } catch (err) {
      console.error('Mood trend error:', err);
    }
  },

  // ===== TRACK PAGE =====
  setupTrackSubTabs() {
    const tabBar = document.querySelector('#track-subtabs');
    if (!tabBar) return;
    tabBar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-subtab]');
      if (!btn) return;
      const tab = btn.getAttribute('data-subtab');
      this.switchTrackTab(tab);
    });
  },

  loadTrackPage() {
    this.switchTrackTab(this.currentTrackTab);
  },

  switchTrackTab(tab) {
    this.currentTrackTab = tab;
    localStorage.setItem('mylife-track-tab', tab);

    // Update sub-tab buttons
    document.querySelectorAll('#track-subtabs .sub-tab').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-subtab') === tab);
    });

    // Show/hide sub-page content
    document.querySelectorAll('#page-track .sub-page').forEach(sp => {
      sp.classList.toggle('active', sp.getAttribute('data-subtab-content') === tab);
    });

    // Load data for the active tab
    switch (tab) {
      case 'health':
        this.loadTrackHealth();
        break;
      case 'fitness':
        this.loadTrackFitness();
        break;
      case 'nutrition':
        this.loadTrackNutrition();
        break;
      case 'sleep':
        this.loadTrackSleep();
        break;
      case 'mind':
        this.loadTrackMind();
        break;
    }
  },

  // --- Health ---
  async loadTrackHealth() {
    const dateStr = this.formatDate(this.currentDate);

    try {
      const [health, meds, appts] = await Promise.all([
        this.safeGet('health', { date: dateStr }),
        this.safeGet('medications', { date: dateStr }),
        this.safeGet('appointments', { date: dateStr })
      ]);

      // Populate vitals form if data exists
      if (health.length > 0) {
        const latest = health[health.length - 1];
        this.setInputValue('#input-weight', latest.weight_kg);
        this.setInputValue('#input-bp-systolic', latest.bp_systolic);
        this.setInputValue('#input-bp-diastolic', latest.bp_diastolic);
        this.setInputValue('#input-heart-rate', latest.heart_rate);
        this.setInputValue('#input-blood-sugar', latest.blood_sugar);
        this.setInputValue('#input-vitals-notes', latest.notes);
      }

      // Render medications
      this.renderMedicationList(meds);

      // Render appointments
      this.renderAppointmentList(appts);
    } catch (err) {
      console.error('Track health load error:', err);
    }
  },

  renderMedicationList(meds) {
    const container = document.querySelector('#medication-list');
    if (!container) return;

    if (!meds || meds.length === 0) {
      container.innerHTML = '<li class="empty-state">No medications tracked.</li>';
      return;
    }

    container.innerHTML = meds.map(med => `
      <li class="list-item">
        <label class="list-item__label">
          <input type="checkbox" class="med-checkbox" data-med-id="${this.escapeHtml(med.id)}" ${Number(med.taken) === 1 ? 'checked' : ''}>
          <span class="list-item__text">
            <strong>${this.escapeHtml(med.name || 'Medication')}</strong>
            ${med.dosage ? ` - ${this.escapeHtml(med.dosage)}` : ''}
            ${med.time ? ` at ${this.escapeHtml(med.time)}` : ''}
          </span>
        </label>
        <button class="btn-icon btn-danger" data-delete-med="${this.escapeHtml(med.id)}" aria-label="Delete medication">&times;</button>
      </li>
    `).join('');

    container.onclick = async (e) => {
      const checkbox = e.target.closest('.med-checkbox');
      if (checkbox) {
        const id = checkbox.getAttribute('data-med-id');
        try {
          await DataStore.update('medications', id, { taken: checkbox.checked ? 1 : 0 });
        } catch (err) {
          console.error('Medication update error:', err);
        }
        return;
      }

      const deleteBtn = e.target.closest('[data-delete-med]');
      if (deleteBtn) {
        const id = deleteBtn.getAttribute('data-delete-med');
        this.showConfirm('Delete this medication?', async () => {
          try {
            await DataStore.delete('medications', id);
            this.showToast('Medication deleted');
            this.loadTrackHealth();
          } catch (err) {
            console.error('Medication delete error:', err);
          }
        });
      }
    };
  },

  renderAppointmentList(appts) {
    const container = document.querySelector('#appointment-list');
    if (!container) return;

    if (!appts || appts.length === 0) {
      container.innerHTML = '<li class="empty-state">No upcoming appointments.</li>';
      return;
    }

    container.innerHTML = appts.map(apt => `
      <li class="list-item">
        <div class="list-item__content">
          <strong>${this.escapeHtml(apt.doctor || 'Appointment')}</strong>
          <div class="list-item__meta">
            ${apt.date ? this.escapeHtml(apt.date) : ''}
            ${apt.time ? ` at ${this.escapeHtml(apt.time)}` : ''}
            ${apt.location ? ` &bull; ${this.escapeHtml(apt.location)}` : ''}
          </div>
          ${apt.notes ? `<div class="list-item__notes">${this.escapeHtml(apt.notes)}</div>` : ''}
        </div>
        <button class="btn-icon btn-danger" data-delete-apt="${this.escapeHtml(apt.id)}" aria-label="Delete appointment">&times;</button>
      </li>
    `).join('');

    container.onclick = (e) => {
      const deleteBtn = e.target.closest('[data-delete-apt]');
      if (!deleteBtn) return;
      const id = deleteBtn.getAttribute('data-delete-apt');
      this.showConfirm('Delete this appointment?', async () => {
        try {
          await DataStore.delete('appointments', id);
          this.showToast('Appointment deleted');
          this.loadTrackHealth();
        } catch (err) {
          console.error('Appointment delete error:', err);
        }
      });
    };
  },

  async saveVitals() {
    const data = {
      date: this.formatDate(this.currentDate),
      weight_kg: this.getInputNumber('#input-weight'),
      bp_systolic: this.getInputNumber('#input-bp-systolic'),
      bp_diastolic: this.getInputNumber('#input-bp-diastolic'),
      heart_rate: this.getInputNumber('#input-heart-rate'),
      blood_sugar: this.getInputNumber('#input-blood-sugar'),
      notes: this.getInputValue('#input-vitals-notes')
    };

    // Remove null fields
    Object.keys(data).forEach(k => {
      if (data[k] === null || data[k] === '') delete data[k];
    });

    if (Object.keys(data).length <= 1) {
      this.showToast('Enter at least one vital', 'warning');
      return;
    }

    try {
      await DataStore.save('health', data);
      this.showToast('Vitals saved');
      this.loadTrackHealth();
    } catch (err) {
      console.error('Save vitals error:', err);
      this.showToast('Failed to save vitals', 'danger');
    }
  },

  // --- Fitness ---
  async loadTrackFitness() {
    const dateStr = this.formatDate(this.currentDate);

    try {
      const workouts = await this.safeGet('fitness', { date: dateStr });
      this.renderWorkoutHistory(workouts);
    } catch (err) {
      console.error('Track fitness load error:', err);
    }
  },

  renderWorkoutHistory(workouts) {
    const container = document.querySelector('#workout-history');
    if (!container) return;

    if (!workouts || workouts.length === 0) {
      container.innerHTML = '<li class="empty-state">No workouts logged yet.</li>';
      return;
    }

    container.innerHTML = workouts.map(w => `
      <li class="list-item">
        <div class="list-item__content">
          <strong>${this.escapeHtml(w.exercise || w.type || 'Workout')}</strong>
          <div class="list-item__meta">
            ${w.type ? this.escapeHtml(w.type) : ''}
            ${w.duration_min ? ` &bull; ${w.duration_min} min` : ''}
            ${w.sets ? ` &bull; ${w.sets} sets` : ''}
            ${w.reps ? ` x ${w.reps} reps` : ''}
            ${w.weight_kg ? ` @ ${w.weight_kg} kg` : ''}
          </div>
          ${w.notes ? `<div class="list-item__notes">${this.escapeHtml(w.notes)}</div>` : ''}
        </div>
        <button class="btn-icon btn-danger" data-delete-workout="${this.escapeHtml(w.id)}" aria-label="Delete workout">&times;</button>
      </li>
    `).join('');

    container.onclick = (e) => {
      const deleteBtn = e.target.closest('[data-delete-workout]');
      if (!deleteBtn) return;
      const id = deleteBtn.getAttribute('data-delete-workout');
      this.showConfirm('Delete this workout?', async () => {
        try {
          await DataStore.delete('fitness', id);
          this.showToast('Workout deleted');
          this.loadTrackFitness();
        } catch (err) {
          console.error('Workout delete error:', err);
        }
      });
    };
  },

  async saveWorkout() {
    const data = {
      date: this.formatDate(this.currentDate),
      type: this.getInputValue('#input-workout-type'),
      exercise: this.getInputValue('#input-exercise-name'),
      duration_min: this.getInputNumber('#input-workout-duration'),
      sets: this.getInputNumber('#input-workout-sets'),
      reps: this.getInputNumber('#input-workout-reps'),
      weight_kg: this.getInputNumber('#input-workout-weight'),
      notes: this.getInputValue('#input-workout-notes')
    };

    if (!data.exercise && !data.type) {
      this.showToast('Enter an exercise name', 'warning');
      return;
    }

    try {
      await DataStore.save('fitness', data);
      this.showToast('Workout logged');
      this.clearForm('#form-workout');
      this.loadTrackFitness();
    } catch (err) {
      console.error('Save workout error:', err);
      this.showToast('Failed to save workout', 'danger');
    }
  },

  // --- Nutrition ---
  async loadTrackNutrition() {
    const dateStr = this.formatDate(this.currentDate);

    try {
      const meals = await this.safeGet('nutrition', { date: dateStr });
      this.renderMealList(meals);
      this.renderMacrosChart(meals);
      this.renderCalorieChart(meals);
    } catch (err) {
      console.error('Track nutrition load error:', err);
    }
  },

  renderMealList(meals) {
    const container = document.querySelector('#meal-list');
    if (!container) return;

    if (!meals || meals.length === 0) {
      container.innerHTML = '<li class="empty-state">No meals logged today.</li>';
      return;
    }

    container.innerHTML = meals.map(m => `
      <li class="list-item">
        <div class="list-item__content">
          <strong>${this.escapeHtml(m.food || m.meal || 'Meal')}</strong>
          <div class="list-item__meta">
            ${m.meal ? this.escapeHtml(m.meal) : ''}
            ${m.calories ? ` &bull; ${m.calories} kcal` : ''}
            ${m.protein_g ? ` &bull; P: ${m.protein_g}g` : ''}
            ${m.carbs_g ? ` &bull; C: ${m.carbs_g}g` : ''}
            ${m.fat_g ? ` &bull; F: ${m.fat_g}g` : ''}
          </div>
        </div>
        <button class="btn-icon btn-danger" data-delete-meal="${this.escapeHtml(m.id)}" aria-label="Delete meal">&times;</button>
      </li>
    `).join('');

    container.onclick = (e) => {
      const deleteBtn = e.target.closest('[data-delete-meal]');
      if (!deleteBtn) return;
      const id = deleteBtn.getAttribute('data-delete-meal');
      this.showConfirm('Delete this meal?', async () => {
        try {
          await DataStore.delete('nutrition', id);
          this.showToast('Meal deleted');
          this.loadTrackNutrition();
        } catch (err) {
          console.error('Meal delete error:', err);
        }
      });
    };
  },

  renderMacrosChart(meals) {
    if (typeof Charts === 'undefined') return;

    const totals = { protein: 0, carbs: 0, fat: 0 };
    (meals || []).forEach(m => {
      totals.protein += Number(m.protein_g) || 0;
      totals.carbs += Number(m.carbs_g) || 0;
      totals.fat += Number(m.fat_g) || 0;
    });

    Charts.destroy('chart-macros');
    if (totals.protein > 0 || totals.carbs > 0 || totals.fat > 0) {
      Charts.doughnut('chart-macros', ['Protein', 'Carbs', 'Fat'], [totals.protein, totals.carbs, totals.fat]);
    }
  },

  renderCalorieChart(meals) {
    if (typeof Charts === 'undefined') return;

    const totalCal = (meals || []).reduce((sum, m) => sum + (Number(m.calories) || 0), 0);
    const target = Number(localStorage.getItem('mylife-calorie-target')) || 2000;

    Charts.destroy('chart-calories');
    Charts.bar('chart-calories', ['Consumed', 'Target'], [totalCal, target]);
  },

  async saveMeal() {
    const data = {
      date: this.formatDate(this.currentDate),
      meal: this.getInputValue('#input-meal-type'),
      food: this.getInputValue('#input-food-name'),
      calories: this.getInputNumber('#input-meal-calories'),
      protein_g: this.getInputNumber('#input-meal-protein'),
      carbs_g: this.getInputNumber('#input-meal-carbs'),
      fat_g: this.getInputNumber('#input-meal-fat'),
      fiber_g: this.getInputNumber('#input-meal-fiber')
    };

    if (!data.food) {
      this.showToast('Enter a food name', 'warning');
      return;
    }

    try {
      await DataStore.save('nutrition', data);
      this.showToast('Meal logged');
      this.clearForm('#form-meal');
      this.loadTrackNutrition();
    } catch (err) {
      console.error('Save meal error:', err);
      this.showToast('Failed to save meal', 'danger');
    }
  },

  // --- Sleep ---
  async loadTrackSleep() {
    const dateStr = this.formatDate(this.currentDate);

    try {
      const sleepData = await this.safeGet('sleep', { date: dateStr });

      // Populate form if data exists for today
      if (sleepData.length > 0) {
        const latest = sleepData[sleepData.length - 1];
        this.setInputValue('#input-bedtime', latest.bedtime);
        this.setInputValue('#input-waketime', latest.wake_time);
        if (latest.quality) {
          this.setInputValue('#input-sleep-quality', latest.quality);
          const qVal = document.querySelector('#sleep-quality-val');
          if (qVal) qVal.textContent = latest.quality;
        }
        this.setInputValue('#input-sleep-notes', latest.notes);
      }

      await this.renderSleepChart();
    } catch (err) {
      console.error('Track sleep load error:', err);
    }
  },

  async renderSleepChart() {
    if (typeof Charts === 'undefined') return;

    const to = this.formatDate(this.currentDate);
    const fromDate = new Date(this.currentDate.getTime() - 7 * 86400000);
    const from = this.formatDate(fromDate);

    try {
      const data = await this.safeGet('sleep', { from, to });

      Charts.destroy('chart-sleep');

      if (data.length > 0) {
        const labels = data.map(d => (d.date || '').slice(5));
        const values = data.map(d => Number(d.hours) || 0);
        Charts.bar('chart-sleep', labels, values);
      }
    } catch (err) {
      console.error('Sleep chart error:', err);
    }
  },

  async saveSleep() {
    const bedtime = this.getInputValue('#input-bedtime');
    const wakeTime = this.getInputValue('#input-waketime');

    if (!bedtime || !wakeTime) {
      this.showToast('Enter bedtime and wake time', 'warning');
      return;
    }

    const hours = this.calculateSleepHours(bedtime, wakeTime);
    const data = {
      date: this.formatDate(this.currentDate),
      bedtime: bedtime,
      wake_time: wakeTime,
      hours: hours,
      quality: this.getInputNumber('#input-sleep-quality'),
      notes: this.getInputValue('#input-sleep-notes')
    };

    try {
      await DataStore.save('sleep', data);
      this.showToast('Sleep logged');
      this.loadTrackSleep();
    } catch (err) {
      console.error('Save sleep error:', err);
      this.showToast('Failed to save sleep', 'danger');
    }
  },

  calculateSleepHours(bedtime, wakeTime) {
    const [bH, bM] = bedtime.split(':').map(Number);
    const [wH, wM] = wakeTime.split(':').map(Number);
    let mins = (wH * 60 + wM) - (bH * 60 + bM);
    if (mins < 0) mins += 1440; // overnight
    return Math.round(mins / 60 * 10) / 10;
  },

  // --- Mind ---
  async loadTrackMind() {
    const dateStr = this.formatDate(this.currentDate);

    try {
      const [moods, meditations] = await Promise.all([
        this.safeGet('mood', { date: dateStr }),
        this.safeGet('meditation', { date: dateStr })
      ]);

      // Populate mood form with latest entry
      if (moods.length > 0) {
        const latest = moods[moods.length - 1];
        if (latest.mood) {
          this.selectedMood = Number(latest.mood);
          const hidden = document.querySelector('#input-mood-value');
          if (hidden) hidden.value = latest.mood;
          // Highlight the mood button
          document.querySelectorAll('#mood-picker .mood-btn').forEach(btn => {
            btn.classList.toggle('selected', btn.getAttribute('data-mood') === String(latest.mood));
          });
        }
        if (latest.stress) {
          this.setInputValue('#input-stress', latest.stress);
          const sv = document.querySelector('#stress-val');
          if (sv) sv.textContent = latest.stress;
        }
        if (latest.energy) {
          this.setInputValue('#input-energy', latest.energy);
          const ev = document.querySelector('#energy-val');
          if (ev) ev.textContent = latest.energy;
        }
        this.setInputValue('#input-gratitude', latest.gratitude);
      }

      // Render meditation log
      this.renderMeditationLog(meditations);
    } catch (err) {
      console.error('Track mind load error:', err);
    }
  },

  renderMeditationLog(meditations) {
    const container = document.querySelector('#meditation-log');
    if (!container) return;

    if (!meditations || meditations.length === 0) {
      container.innerHTML = '<li class="empty-state">No meditation sessions logged.</li>';
      return;
    }

    container.innerHTML = meditations.map(m => `
      <li class="list-item">
        <div class="list-item__content">
          <strong>${this.escapeHtml(m.type || 'Meditation')}</strong>
          <div class="list-item__meta">${m.duration_min || 0} min</div>
        </div>
        <button class="btn-icon btn-danger" data-delete-meditation="${this.escapeHtml(m.id)}" aria-label="Delete session">&times;</button>
      </li>
    `).join('');

    container.onclick = (e) => {
      const deleteBtn = e.target.closest('[data-delete-meditation]');
      if (!deleteBtn) return;
      const id = deleteBtn.getAttribute('data-delete-meditation');
      this.showConfirm('Delete this meditation session?', async () => {
        try {
          await DataStore.delete('meditation', id);
          this.showToast('Session deleted');
          this.loadTrackMind();
        } catch (err) {
          console.error('Meditation delete error:', err);
        }
      });
    };
  },

  async saveMood() {
    if (!this.selectedMood) {
      this.showToast('Select a mood first', 'warning');
      return;
    }

    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const data = {
      date: this.formatDate(this.currentDate),
      time: time,
      mood: this.selectedMood,
      stress: this.getInputNumber('#input-stress'),
      energy: this.getInputNumber('#input-energy'),
      gratitude: this.getInputValue('#input-gratitude')
    };

    try {
      await DataStore.save('mood', data);
      this.showToast('Mood logged');
      this.loadTrackMind();
    } catch (err) {
      console.error('Save mood error:', err);
      this.showToast('Failed to save mood', 'danger');
    }
  },

  // Meditation timer
  startMeditation() {
    this.meditationSeconds = 0;
    const display = document.querySelector('#meditation-display');
    const btn = document.querySelector('#btn-meditation-toggle');

    this.meditationTimer = setInterval(() => {
      this.meditationSeconds++;
      const mins = Math.floor(this.meditationSeconds / 60);
      const secs = this.meditationSeconds % 60;
      if (display) {
        display.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }
    }, 1000);

    if (btn) {
      btn.textContent = 'Stop';
      btn.classList.remove('btn--primary');
      btn.classList.add('btn--danger');
    }
  },

  async stopMeditation() {
    clearInterval(this.meditationTimer);
    this.meditationTimer = null;

    const duration = Math.round(this.meditationSeconds / 60);
    const display = document.querySelector('#meditation-display');
    const btn = document.querySelector('#btn-meditation-toggle');

    if (duration > 0) {
      const type = this.getInputValue('#input-meditation-type') || 'mindfulness';
      try {
        await DataStore.save('meditation', {
          date: this.formatDate(this.currentDate),
          duration_min: duration,
          type: type
        });
        this.showToast(`${duration} min meditation saved`);
      } catch (err) {
        console.error('Save meditation error:', err);
        this.showToast('Failed to save meditation', 'danger');
      }
    }

    this.meditationSeconds = 0;
    if (display) display.textContent = '00:00';
    if (btn) {
      btn.textContent = 'Start';
      btn.classList.remove('btn--danger');
      btn.classList.add('btn--primary');
    }

    this.loadTrackMind();
  },

  toggleMeditation() {
    if (this.meditationTimer) {
      this.stopMeditation();
    } else {
      this.startMeditation();
    }
  },

  // ===== HABITS PAGE =====
  async loadHabits() {
    const dateStr = this.formatDate(this.currentDate);
    this.updateDateDisplay();

    try {
      const [habitDefs, todayHabits] = await Promise.all([
        this.safeGet('habit_defs'),
        this.safeGet('habits', { date: dateStr })
      ]);

      const activeHabits = (habitDefs || []).filter(h => h.active !== false && h.active !== 'false');
      this.renderHabitsList(activeHabits, todayHabits);
      await this.renderHabitHeatmap(activeHabits);
    } catch (err) {
      console.error('Habits load error:', err);
    }
  },

  renderHabitsList(activeHabits, todayHabits) {
    const container = document.querySelector('#habits-list');
    if (!container) return;

    if (activeHabits.length === 0) {
      container.innerHTML = '<li class="empty-state">No habits created yet. Tap + to add one.</li>';
      return;
    }

    container.innerHTML = activeHabits.map(habit => {
      const entry = (todayHabits || []).find(h => h.habit_id === habit.id);
      const checked = entry && Number(entry.completed) === 1;
      return `
        <li class="habit-item ${checked ? 'habit-item--done' : ''}">
          <label class="habit-item__label">
            <input type="checkbox" class="habit-checkbox" data-habit-id="${this.escapeHtml(habit.id)}" ${checked ? 'checked' : ''}>
            <span class="habit-item__icon">${habit.icon || '\u2705'}</span>
            <span class="habit-item__info">
              <span class="habit-item__name">${this.escapeHtml(habit.name)}</span>
              <span class="habit-item__streak" data-streak-id="${this.escapeHtml(habit.id)}"></span>
            </span>
          </label>
          <button class="btn-icon btn-danger" data-delete-habit="${this.escapeHtml(habit.id)}" aria-label="Delete habit">&times;</button>
        </li>
      `;
    }).join('');

    // Load streaks
    activeHabits.forEach(habit => {
      this.calculateStreak(habit.id).then(streak => {
        const el = container.querySelector(`[data-streak-id="${habit.id}"]`);
        if (el && streak > 0) {
          el.textContent = `${streak} day streak`;
        }
      });
    });

    // Event delegation
    container.onclick = (e) => {
      const checkbox = e.target.closest('.habit-checkbox');
      if (checkbox) {
        const habitId = checkbox.getAttribute('data-habit-id');
        this.toggleHabit(habitId, checkbox.checked);
        return;
      }

      const deleteBtn = e.target.closest('[data-delete-habit]');
      if (deleteBtn) {
        const id = deleteBtn.getAttribute('data-delete-habit');
        this.showConfirm('Delete this habit?', () => this.deleteHabitDef(id));
      }
    };
  },

  async toggleHabit(habitId, completed) {
    const dateStr = this.formatDate(this.currentDate);

    try {
      const existing = await this.safeGet('habits', { date: dateStr });
      const entry = existing.find(h => h.habit_id === habitId);

      if (entry) {
        await DataStore.update('habits', entry.id, { completed: completed ? 1 : 0 });
      } else {
        await DataStore.save('habits', {
          date: dateStr,
          habit_id: habitId,
          completed: completed ? 1 : 0
        });
      }

      // Update streak display without full reload
      const streak = await this.calculateStreak(habitId);
      const streakEl = document.querySelector(`[data-streak-id="${habitId}"]`);
      if (streakEl) {
        streakEl.textContent = streak > 0 ? `${streak} day streak` : '';
      }

      // Update habit item visual state
      const checkbox = document.querySelector(`.habit-checkbox[data-habit-id="${habitId}"]`);
      if (checkbox) {
        const li = checkbox.closest('.habit-item');
        if (li) {
          li.classList.toggle('habit-item--done', completed);
        }
      }

      // Also update dashboard habit checkbox if visible
      const miniCheckbox = document.querySelector(`.habit-mini-checkbox[data-habit-id="${habitId}"]`);
      if (miniCheckbox) {
        miniCheckbox.checked = completed;
      }
    } catch (err) {
      console.error('Toggle habit error:', err);
    }
  },

  async calculateStreak(habitId) {
    try {
      let streak = 0;
      const today = new Date(this.currentDate);

      for (let i = 0; i < 365; i++) {
        const dateStr = this.formatDate(new Date(today.getTime() - i * 86400000));
        const entries = await this.safeGet('habits', { date: dateStr });
        const entry = entries.find(h => h.habit_id === habitId);

        if (entry && Number(entry.completed) === 1) {
          streak++;
        } else if (i === 0) {
          // Today not completed yet is okay; don't break streak
          continue;
        } else {
          break;
        }
      }

      return streak;
    } catch (err) {
      console.error('Calculate streak error:', err);
      return 0;
    }
  },

  async renderHabitHeatmap(habits) {
    const container = document.querySelector('#habit-heatmap');
    if (!container) return;

    if (!habits || habits.length === 0) {
      container.innerHTML = '<div class="heatmap-placeholder">Add habits to see the heatmap</div>';
      return;
    }

    try {
      // Get last 28 days of data
      const days = 28;
      const heatmapData = [];

      for (let i = days - 1; i >= 0; i--) {
        const dateObj = new Date(this.currentDate.getTime() - i * 86400000);
        const dateStr = this.formatDate(dateObj);
        const entries = await this.safeGet('habits', { date: dateStr });
        const completedCount = entries.filter(h => Number(h.completed) === 1).length;
        const pct = habits.length > 0 ? completedCount / habits.length : 0;

        heatmapData.push({
          date: dateStr,
          label: dateObj.toLocaleDateString('en-US', { weekday: 'narrow' }),
          dayNum: dateObj.getDate(),
          value: pct
        });
      }

      // Render as CSS grid if Charts.heatmap is not available
      if (typeof Charts !== 'undefined' && typeof Charts.heatmap === 'function') {
        Charts.heatmap('habit-heatmap', heatmapData);
      } else {
        this.renderSimpleHeatmap(container, heatmapData);
      }
    } catch (err) {
      console.error('Heatmap render error:', err);
      container.innerHTML = '<div class="heatmap-placeholder">Could not load heatmap</div>';
    }
  },

  renderSimpleHeatmap(container, data) {
    const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    let html = '<div class="heatmap-grid">';

    // Header row
    weekDays.forEach(d => {
      html += `<div class="heatmap-header">${d}</div>`;
    });

    // Calculate starting offset (day of week for first entry)
    if (data.length > 0) {
      const firstDate = new Date(data[0].date + 'T00:00:00');
      const startDay = firstDate.getDay();
      for (let i = 0; i < startDay; i++) {
        html += '<div class="heatmap-cell heatmap-cell--empty"></div>';
      }
    }

    // Data cells
    data.forEach(d => {
      let level = 0;
      if (d.value > 0 && d.value < 0.33) level = 1;
      else if (d.value >= 0.33 && d.value < 0.66) level = 2;
      else if (d.value >= 0.66 && d.value < 1) level = 3;
      else if (d.value >= 1) level = 4;

      html += `<div class="heatmap-cell heatmap-cell--level-${level}" title="${d.date}: ${Math.round(d.value * 100)}%">
        <span class="heatmap-cell__day">${d.dayNum}</span>
      </div>`;
    });

    html += '</div>';
    container.innerHTML = html;
  },

  async saveHabitDef() {
    const name = this.getInputValue('#input-habit-name');
    if (!name) {
      this.showToast('Enter a habit name', 'warning');
      return;
    }

    const data = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name,
      icon: this.selectedHabitIcon || '\u2705',
      category: this.getInputValue('#input-habit-category') || 'other',
      target: this.getInputValue('#input-habit-frequency') || 'daily',
      active: true
    };

    try {
      await DataStore.save('habit_defs', data);
      this.showToast('Habit created');
      this.closeModal('modal-habit');
      this.clearForm('#form-habit');
      this.selectedHabitIcon = '\u2705';
      this.loadHabits();
    } catch (err) {
      console.error('Save habit def error:', err);
      this.showToast('Failed to create habit', 'danger');
    }
  },

  async deleteHabitDef(id) {
    try {
      await DataStore.delete('habit_defs', id);
      this.showToast('Habit deleted');
      this.loadHabits();
    } catch (err) {
      console.error('Delete habit def error:', err);
      this.showToast('Failed to delete habit', 'danger');
    }
  },

  // ===== GOALS PAGE =====
  async loadGoals() {
    try {
      const goals = await this.safeGet('goals');
      const active = (goals || []).filter(g => g.status !== 'completed');
      const completed = (goals || []).filter(g => g.status === 'completed');

      this.renderGoalsList(active, '#goals-active');
      this.renderGoalsList(completed, '#goals-completed');
    } catch (err) {
      console.error('Goals load error:', err);
    }
  },

  renderGoalsList(goals, containerId) {
    const container = document.querySelector(containerId);
    if (!container) return;

    if (!goals || goals.length === 0) {
      const emptyMsg = containerId === '#goals-active'
        ? 'No active goals. Set one above.'
        : 'No completed goals yet.';
      container.innerHTML = `<li class="empty-state">${emptyMsg}</li>`;
      return;
    }

    container.innerHTML = goals.map(g => {
      const target = Number(g.target) || 1;
      const current = Number(g.current) || 0;
      const pct = Math.min(100, Math.round((current / target) * 100));

      return `
        <li class="goal-card card" data-id="${this.escapeHtml(g.id)}">
          <div class="goal-header">
            <span class="goal-title">${this.escapeHtml(g.title)}</span>
            <span class="goal-type badge">${this.escapeHtml(g.type || 'daily')}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${pct}%"></div>
          </div>
          <div class="goal-footer">
            <span>${current} / ${target}</span>
            ${g.deadline ? `<span class="text-secondary">${this.escapeHtml(g.deadline)}</span>` : ''}
          </div>
          <div class="goal-actions">
            <button class="btn-icon" data-goal-update="${this.escapeHtml(g.id)}" aria-label="Update progress">+</button>
            <button class="btn-icon" data-goal-complete="${this.escapeHtml(g.id)}" aria-label="Complete goal">&check;</button>
            <button class="btn-icon btn-danger" data-goal-delete="${this.escapeHtml(g.id)}" aria-label="Delete goal">&times;</button>
          </div>
        </li>
      `;
    }).join('');

    // Event delegation
    container.onclick = (e) => {
      const updateBtn = e.target.closest('[data-goal-update]');
      if (updateBtn) {
        this.updateGoalProgress(updateBtn.getAttribute('data-goal-update'));
        return;
      }

      const completeBtn = e.target.closest('[data-goal-complete]');
      if (completeBtn) {
        this.completeGoal(completeBtn.getAttribute('data-goal-complete'));
        return;
      }

      const deleteBtn = e.target.closest('[data-goal-delete]');
      if (deleteBtn) {
        this.deleteGoal(deleteBtn.getAttribute('data-goal-delete'));
      }
    };
  },

  async saveGoal(fromModal) {
    let title, type, target, deadline;

    if (fromModal) {
      title = this.getInputValue('#input-modal-goal-title');
      type = this.getInputValue('#input-modal-goal-type');
      target = this.getInputNumber('#input-modal-goal-target');
      deadline = this.getInputValue('#input-modal-goal-deadline');
    } else {
      title = this.getInputValue('#input-goal-title');
      type = this.getInputValue('#input-goal-type');
      target = this.getInputNumber('#input-goal-target');
      deadline = this.getInputValue('#input-goal-deadline');
    }

    if (!title) {
      this.showToast('Enter a goal title', 'warning');
      return;
    }
    if (!target || target <= 0) {
      this.showToast('Enter a target value', 'warning');
      return;
    }

    const data = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: title,
      type: type || 'daily',
      target: target,
      current: 0,
      status: 'active',
      deadline: deadline || null
    };

    try {
      await DataStore.save('goals', data);
      this.showToast('Goal created');

      if (fromModal) {
        this.closeModal('modal-goal');
      } else {
        this.clearForm('#form-goal');
      }

      this.loadGoals();
    } catch (err) {
      console.error('Save goal error:', err);
      this.showToast('Failed to create goal', 'danger');
    }
  },

  async updateGoalProgress(id) {
    try {
      const goals = await this.safeGet('goals');
      const goal = goals.find(g => g.id === id);
      if (!goal) return;

      const newValue = prompt('Enter current progress:', goal.current || 0);
      if (newValue !== null && newValue !== '') {
        const numVal = Number(newValue);
        if (isNaN(numVal)) {
          this.showToast('Enter a valid number', 'warning');
          return;
        }
        await DataStore.update('goals', id, { current: numVal });
        this.loadGoals();
      }
    } catch (err) {
      console.error('Update goal error:', err);
      this.showToast('Failed to update goal', 'danger');
    }
  },

  async completeGoal(id) {
    try {
      await DataStore.update('goals', id, { status: 'completed' });
      this.showToast('Goal completed!');
      this.loadGoals();
    } catch (err) {
      console.error('Complete goal error:', err);
      this.showToast('Failed to complete goal', 'danger');
    }
  },

  async deleteGoal(id) {
    this.showConfirm('Delete this goal?', async () => {
      try {
        await DataStore.delete('goals', id);
        this.showToast('Goal deleted');
        this.loadGoals();
      } catch (err) {
        console.error('Delete goal error:', err);
        this.showToast('Failed to delete goal', 'danger');
      }
    });
  },

  // ===== SETTINGS PAGE =====
  setupSettingsButtons() {
    const saveProfile = document.querySelector('#btn-save-profile');
    if (saveProfile) {
      saveProfile.addEventListener('click', () => this.saveSettings());
    }

    const testConn = document.querySelector('#btn-test-connection');
    if (testConn) {
      testConn.addEventListener('click', () => this.testSheetConnection());
    }

    const syncNow = document.querySelector('#btn-sync-now');
    if (syncNow) {
      syncNow.addEventListener('click', () => this.syncNow());
    }

    const exportBtn = document.querySelector('#btn-export-json');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportData());
    }

    const clearBtn = document.querySelector('#btn-clear-cache');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearCache());
    }
  },

  async loadSettings() {
    try {
      let profile = {};
      if (typeof DataStore !== 'undefined' && typeof DataStore.getProfile === 'function') {
        profile = await DataStore.getProfile() || {};
      }

      // Populate profile fields
      this.setInputValue('#input-profile-name', profile.name || localStorage.getItem('mylife-profile-name') || '');
      this.setInputValue('#input-profile-height', profile.height || localStorage.getItem('mylife-profile-height') || '');
      this.setInputValue('#input-profile-weight-target', profile.weight_target || localStorage.getItem('mylife-weight-target') || '');
      this.setInputValue('#input-profile-calorie-target', profile.calorie_target || localStorage.getItem('mylife-calorie-target') || '');
      this.setInputValue('#input-profile-water-target', profile.water_target || localStorage.getItem('mylife-water-target') || '');

      // Show script URL (masked)
      const savedUrl = localStorage.getItem('mylife-script-url') || '';
      this.setInputValue('#input-sheets-url', savedUrl);

      // Dark mode toggle
      const toggle = document.querySelector('#toggle-dark-mode');
      if (toggle) {
        toggle.checked = document.documentElement.getAttribute('data-theme') === 'dark';
      }

      this.updateSyncStatus();
    } catch (err) {
      console.error('Settings load error:', err);
    }
  },

  async saveSettings() {
    const name = this.getInputValue('#input-profile-name');
    const height = this.getInputValue('#input-profile-height');
    const weightTarget = this.getInputValue('#input-profile-weight-target');
    const calorieTarget = this.getInputValue('#input-profile-calorie-target');
    const waterTarget = this.getInputValue('#input-profile-water-target');

    // Save to localStorage for immediate use
    if (name) localStorage.setItem('mylife-profile-name', name);
    if (height) localStorage.setItem('mylife-profile-height', height);
    if (weightTarget) localStorage.setItem('mylife-weight-target', weightTarget);
    if (calorieTarget) localStorage.setItem('mylife-calorie-target', calorieTarget);
    if (waterTarget) localStorage.setItem('mylife-water-target', waterTarget);

    // Save to DataStore
    try {
      if (typeof DataStore !== 'undefined' && typeof DataStore.saveProfile === 'function') {
        if (name) await DataStore.saveProfile('name', name);
        if (height) await DataStore.saveProfile('height', height);
        if (weightTarget) await DataStore.saveProfile('weight_target', weightTarget);
        if (calorieTarget) await DataStore.saveProfile('calorie_target', calorieTarget);
        if (waterTarget) await DataStore.saveProfile('water_target', waterTarget);
      }
    } catch (err) {
      console.error('Save profile to DataStore error:', err);
    }

    this.showToast('Settings saved');
  },

  async testSheetConnection() {
    const url = this.getInputValue('#input-sheets-url');
    if (!url) {
      this.showToast('Enter Apps Script URL first', 'warning');
      return;
    }

    localStorage.setItem('mylife-script-url', url);

    if (typeof DataStore !== 'undefined') {
      DataStore.setScriptUrl(url);
      try {
        const ok = await DataStore.testConnection();
        this.showToast(ok ? 'Connected!' : 'Connection failed', ok ? 'success' : 'danger');
      } catch (err) {
        this.showToast('Connection failed', 'danger');
      }
    }

    this.updateSyncStatus();
  },

  async syncNow() {
    if (typeof DataStore === 'undefined') return;
    try {
      await DataStore.syncNow();
      this.showToast('Sync complete');
      this.updateSyncStatus();
      this.refreshCurrentPage();
    } catch (err) {
      console.error('Sync error:', err);
      this.showToast('Sync failed', 'danger');
    }
  },

  async updateSyncStatus() {
    const dot = document.querySelector('#sync-dot');
    const text = document.querySelector('#sync-status-text');
    const pendingEl = document.querySelector('#sync-pending-count');

    let online = navigator.onLine;
    let pending = 0;

    if (typeof DataStore !== 'undefined') {
      if (typeof DataStore.isOnline === 'function') {
        online = DataStore.isOnline();
      }
      if (typeof DataStore.pendingSync === 'function') {
        const p = DataStore.pendingSync();
        pending = (p instanceof Promise) ? await p : (p || 0);
      }
    }

    const hasUrl = !!localStorage.getItem('mylife-script-url');

    if (dot) {
      dot.className = 'sync-status__dot';
      if (!hasUrl) {
        dot.classList.add('sync-status__dot--disconnected');
      } else if (online) {
        dot.classList.add('sync-status__dot--connected');
      } else {
        dot.classList.add('sync-status__dot--offline');
      }
    }

    if (text) {
      if (!hasUrl) {
        text.textContent = 'Not connected';
      } else if (online) {
        text.textContent = 'Connected';
      } else {
        text.textContent = 'Offline';
      }
    }

    if (pendingEl) {
      pendingEl.textContent = String(pending);
    }
  },

  async exportData() {
    try {
      let data;
      if (typeof DataStore !== 'undefined' && typeof DataStore.exportAll === 'function') {
        data = await DataStore.exportAll();
      } else {
        data = { message: 'No data available' };
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mylife-export-${this.formatDate(new Date())}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.showToast('Data exported');
    } catch (err) {
      console.error('Export error:', err);
      this.showToast('Export failed', 'danger');
    }
  },

  clearCache() {
    this.showConfirm('Clear all local data? Unsynced changes will be lost.', async () => {
      try {
        if (typeof DataStore !== 'undefined' && typeof DataStore.clearLocal === 'function') {
          await DataStore.clearLocal();
        }
        this.showToast('Cache cleared');
        setTimeout(() => location.reload(), 500);
      } catch (err) {
        console.error('Clear cache error:', err);
        this.showToast('Failed to clear cache', 'danger');
      }
    });
  },

  // ===== MODALS =====
  setupModals() {
    // Close modal on backdrop click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          this.closeModal(overlay.id);
        }
      });
    });

    // Close buttons with data-close-modal
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close-modal');
        this.closeModal(modalId);
      });
    });

    // ESC key closes all modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeAllModals();
      }
    });

    // Quick-log button handlers
    const quickMeal = document.querySelector('#btn-quick-meal');
    if (quickMeal) {
      quickMeal.addEventListener('click', () => this.openModal('modal-meal'));
    }

    const quickWater = document.querySelector('#btn-quick-water');
    if (quickWater) {
      quickWater.addEventListener('click', () => this.openModal('modal-water'));
    }

    const quickWeight = document.querySelector('#btn-quick-weight');
    if (quickWeight) {
      quickWeight.addEventListener('click', () => this.openModal('modal-weight'));
    }

    // Add habit button
    const addHabit = document.querySelector('#btn-add-habit');
    if (addHabit) {
      addHabit.addEventListener('click', () => this.openModal('modal-habit'));
    }

    // Add medication button
    const addMed = document.querySelector('#btn-add-medication');
    if (addMed) {
      addMed.addEventListener('click', () => this.openModal('modal-medication'));
    }

    // Add appointment button
    const addApt = document.querySelector('#btn-add-appointment');
    if (addApt) {
      addApt.addEventListener('click', () => this.openModal('modal-appointment'));
    }

    // Modal save buttons
    const saveWater = document.querySelector('#btn-save-water');
    if (saveWater) {
      saveWater.addEventListener('click', () => this.saveQuickWater());
    }

    const saveQuickWeight = document.querySelector('#btn-save-quick-weight');
    if (saveQuickWeight) {
      saveQuickWeight.addEventListener('click', () => this.saveQuickWeight());
    }

    const saveQuickMeal = document.querySelector('#btn-save-quick-meal');
    if (saveQuickMeal) {
      saveQuickMeal.addEventListener('click', () => this.saveQuickMeal());
    }

    const saveHabit = document.querySelector('#btn-save-habit');
    if (saveHabit) {
      saveHabit.addEventListener('click', () => this.saveHabitDef());
    }

    const saveModalGoal = document.querySelector('#btn-save-modal-goal');
    if (saveModalGoal) {
      saveModalGoal.addEventListener('click', () => this.saveGoal(true));
    }

    const saveMedication = document.querySelector('#btn-save-medication');
    if (saveMedication) {
      saveMedication.addEventListener('click', () => this.saveMedication());
    }

    const saveAppointment = document.querySelector('#btn-save-appointment');
    if (saveAppointment) {
      saveAppointment.addEventListener('click', () => this.saveAppointment());
    }

    // Water preset buttons
    document.querySelectorAll('[data-water]').forEach(btn => {
      btn.addEventListener('click', () => {
        const amount = Number(btn.getAttribute('data-water'));
        this.quickLogWater(amount);
      });
    });

    // Meditation toggle
    const medToggle = document.querySelector('#btn-meditation-toggle');
    if (medToggle) {
      medToggle.addEventListener('click', () => this.toggleMeditation());
    }

    // Confirm dialog buttons
    const confirmOk = document.querySelector('#btn-confirm-ok');
    if (confirmOk) {
      confirmOk.addEventListener('click', () => {
        if (this.confirmCallback) {
          this.confirmCallback();
          this.confirmCallback = null;
        }
        this.closeModal('modal-confirm');
      });
    }

    const confirmCancel = document.querySelector('#btn-confirm-cancel');
    if (confirmCancel) {
      confirmCancel.addEventListener('click', () => {
        this.confirmCallback = null;
        this.closeModal('modal-confirm');
      });
    }
  },

  openModal(modalId) {
    const modal = document.querySelector(`#${modalId}`);
    if (modal) {
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  },

  closeModal(modalId) {
    if (modalId) {
      const modal = document.querySelector(`#${modalId}`);
      if (modal) {
        modal.classList.remove('active');
      }
    } else {
      this.closeAllModals();
    }
    // Restore scroll if no modals are open
    const anyOpen = document.querySelector('.modal-overlay.active');
    if (!anyOpen) {
      document.body.style.overflow = '';
    }
  },

  closeAllModals() {
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    document.body.style.overflow = '';
  },

  showConfirm(message, callback) {
    const msgEl = document.querySelector('#modal-confirm-message');
    if (msgEl) msgEl.textContent = message;
    this.confirmCallback = callback;
    this.openModal('modal-confirm');
  },

  // Quick-log handlers
  async quickLogWater(amount) {
    if (!amount || amount <= 0) return;

    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    try {
      await DataStore.save('water', {
        date: this.formatDate(this.currentDate),
        time: time,
        amount_ml: amount
      });
      this.showToast(`+${amount}ml water`);
      this.closeModal('modal-water');
      this.refreshCurrentPage();
    } catch (err) {
      console.error('Quick log water error:', err);
      this.showToast('Failed to log water', 'danger');
    }
  },

  async saveQuickWater() {
    const customInput = document.querySelector('#input-water-custom');
    const amount = customInput ? Number(customInput.value) : 0;
    if (amount > 0) {
      await this.quickLogWater(amount);
      if (customInput) customInput.value = '';
    } else {
      this.showToast('Enter an amount or pick a preset', 'warning');
    }
  },

  async saveQuickWeight() {
    const input = document.querySelector('#input-quick-weight');
    const weight = input ? Number(input.value) : 0;
    if (!weight || weight <= 0) {
      this.showToast('Enter a valid weight', 'warning');
      return;
    }

    try {
      await DataStore.save('health', {
        date: this.formatDate(this.currentDate),
        weight_kg: weight
      });
      this.showToast('Weight logged');
      if (input) input.value = '';
      this.closeModal('modal-weight');
      this.refreshCurrentPage();
    } catch (err) {
      console.error('Quick log weight error:', err);
      this.showToast('Failed to log weight', 'danger');
    }
  },

  async saveQuickMeal() {
    const mealType = this.getInputValue('#input-quick-meal-type');
    const foodName = this.getInputValue('#input-quick-food-name');
    const calories = this.getInputNumber('#input-quick-meal-calories');
    const protein = this.getInputNumber('#input-quick-meal-protein');

    if (!foodName) {
      this.showToast('Enter a food name', 'warning');
      return;
    }

    try {
      await DataStore.save('nutrition', {
        date: this.formatDate(this.currentDate),
        meal: mealType,
        food: foodName,
        calories: calories || 0,
        protein_g: protein || 0
      });
      this.showToast('Meal logged');

      // Clear modal inputs
      const nameInput = document.querySelector('#input-quick-food-name');
      const calInput = document.querySelector('#input-quick-meal-calories');
      const proInput = document.querySelector('#input-quick-meal-protein');
      if (nameInput) nameInput.value = '';
      if (calInput) calInput.value = '';
      if (proInput) proInput.value = '';

      this.closeModal('modal-meal');
      this.refreshCurrentPage();
    } catch (err) {
      console.error('Quick log meal error:', err);
      this.showToast('Failed to log meal', 'danger');
    }
  },

  async saveMedication() {
    const name = this.getInputValue('#input-med-name');
    if (!name) {
      this.showToast('Enter medication name', 'warning');
      return;
    }

    const data = {
      date: this.formatDate(this.currentDate),
      name: name,
      dosage: this.getInputValue('#input-med-dosage'),
      time: this.getInputValue('#input-med-time'),
      taken: document.querySelector('#input-med-taken')?.checked ? 1 : 0
    };

    try {
      await DataStore.save('medications', data);
      this.showToast('Medication added');

      // Clear modal
      const nameInput = document.querySelector('#input-med-name');
      const dosageInput = document.querySelector('#input-med-dosage');
      const takenInput = document.querySelector('#input-med-taken');
      if (nameInput) nameInput.value = '';
      if (dosageInput) dosageInput.value = '';
      if (takenInput) takenInput.checked = false;

      this.closeModal('modal-medication');
      this.loadTrackHealth();
    } catch (err) {
      console.error('Save medication error:', err);
      this.showToast('Failed to save medication', 'danger');
    }
  },

  async saveAppointment() {
    const title = this.getInputValue('#input-apt-title');
    if (!title) {
      this.showToast('Enter appointment title', 'warning');
      return;
    }

    const data = {
      date: this.getInputValue('#input-apt-date') || this.formatDate(this.currentDate),
      time: this.getInputValue('#input-apt-time'),
      doctor: title,
      specialty: '',
      location: this.getInputValue('#input-apt-location'),
      notes: this.getInputValue('#input-apt-notes')
    };

    try {
      await DataStore.save('appointments', data);
      this.showToast('Appointment added');

      // Clear modal
      const titleInput = document.querySelector('#input-apt-title');
      const dateInput = document.querySelector('#input-apt-date');
      const timeInput = document.querySelector('#input-apt-time');
      const locInput = document.querySelector('#input-apt-location');
      const notesInput = document.querySelector('#input-apt-notes');
      if (titleInput) titleInput.value = '';
      if (dateInput) dateInput.value = '';
      if (timeInput) timeInput.value = '';
      if (locInput) locInput.value = '';
      if (notesInput) notesInput.value = '';

      this.closeModal('modal-appointment');
      this.loadTrackHealth();
    } catch (err) {
      console.error('Save appointment error:', err);
      this.showToast('Failed to save appointment', 'danger');
    }
  },

  // ===== FORMS =====
  setupForms() {
    // Vitals form
    const vitalsForm = document.querySelector('#form-weight');
    if (vitalsForm) {
      vitalsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveVitals();
      });
    }

    // Workout form
    const workoutForm = document.querySelector('#form-workout');
    if (workoutForm) {
      workoutForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveWorkout();
      });
    }

    // Meal form
    const mealForm = document.querySelector('#form-meal');
    if (mealForm) {
      mealForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveMeal();
      });
    }

    // Sleep form
    const sleepForm = document.querySelector('#form-sleep');
    if (sleepForm) {
      sleepForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveSleep();
      });
    }

    // Mood form
    const moodForm = document.querySelector('#form-mood');
    if (moodForm) {
      moodForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveMood();
      });
    }

    // Goal form (inline on goals page)
    const goalForm = document.querySelector('#form-goal');
    if (goalForm) {
      goalForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveGoal(false);
      });
    }

    // Habit form inside modal (prevent default since button handles it)
    const habitForm = document.querySelector('#form-habit');
    if (habitForm) {
      habitForm.addEventListener('submit', (e) => {
        e.preventDefault();
      });
    }
  },

  // ===== UTILITIES =====
  showToast(message, type) {
    if (!type) type = 'success';
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.setAttribute('role', 'alert');
    document.body.appendChild(toast);

    // Trigger reflow then animate in
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 3000);
  },

  refreshCurrentPage() {
    switch (this.currentPage) {
      case 'dashboard':
        this.loadDashboard();
        break;
      case 'track':
        this.switchTrackTab(this.currentTrackTab);
        break;
      case 'habits':
        this.loadHabits();
        break;
      case 'goals':
        this.loadGoals();
        break;
      case 'settings':
        this.loadSettings();
        break;
    }
  },

  registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js')
        .then(function(reg) {
          console.log('SW registered:', reg.scope);
        })
        .catch(function(err) {
          console.error('SW registration failed:', err);
        });
    }
  },

  // Safe DataStore.get wrapper that returns empty array on error
  async safeGet(sheet, options) {
    if (typeof DataStore === 'undefined') return [];
    try {
      const result = await DataStore.get(sheet, options);
      return Array.isArray(result) ? result : [];
    } catch (err) {
      console.error(`DataStore.get(${sheet}) error:`, err);
      return [];
    }
  },

  // Find latest non-empty value for a field in an array
  findLatest(arr, field) {
    if (!arr || arr.length === 0) return null;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i][field] !== undefined && arr[i][field] !== null && arr[i][field] !== '') {
        return arr[i][field];
      }
    }
    return null;
  },

  // DOM helpers
  getInputValue(selector) {
    const el = document.querySelector(selector);
    return el ? el.value.trim() : '';
  },

  getInputNumber(selector) {
    const el = document.querySelector(selector);
    if (!el || el.value === '') return null;
    const num = Number(el.value);
    return isNaN(num) ? null : num;
  },

  setInputValue(selector, value) {
    const el = document.querySelector(selector);
    if (el && value !== undefined && value !== null) {
      el.value = value;
    }
  },

  clearForm(formSelector) {
    const form = document.querySelector(formSelector);
    if (form) {
      form.reset();
    }
  },

  escapeHtml(str) {
    if (!str) return '';
    const s = String(str);
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(s));
    return div.innerHTML;
  },

  debounce(fn, ms) {
    if (!ms) ms = 300;
    let timer;
    return function() {
      const args = arguments;
      const context = this;
      clearTimeout(timer);
      timer = setTimeout(function() {
        fn.apply(context, args);
      }, ms);
    };
  }
};

// Expose App globally for inline onclick handlers (used in rendered goal cards)
window.App = App;

// Start app
document.addEventListener('DOMContentLoaded', function() {
  App.init();
});
