/**
 * Charts.js - Chart.js wrapper for MyLife PWA
 * Provides window.Charts with line, doughnut, bar, and heatmap chart types.
 * Automatically adapts to dark/light theme via data-theme attribute.
 */
window.Charts = {
  _instances: {},

  /**
   * Get theme-aware colors based on data-theme attribute on <html>.
   */
  _getThemeColors() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      text: isDark ? '#f1f5f9' : '#111827',
      grid: isDark ? '#334155' : '#e5e7eb',
      accent: isDark ? '#60a5fa' : '#3b82f6',
      bg: isDark ? '#1e293b' : '#ffffff'
    };
  },

  /**
   * Line chart - smooth line with optional fill.
   * @param {string} canvasId - Canvas element ID
   * @param {string[]} labels - X-axis labels
   * @param {number[]} data - Y-axis values
   * @param {Object} options - { label, color, fill }
   */
  line(canvasId, labels, data, options = {}) {
    this.destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const colors = this._getThemeColors();

    this._instances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: options.label || '',
          data,
          borderColor: options.color || colors.accent,
          backgroundColor: (options.color || colors.accent) + '20',
          borderWidth: 2,
          fill: options.fill || false,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: options.color || colors.accent
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            ticks: { color: colors.text },
            grid: { color: colors.grid }
          },
          y: {
            ticks: { color: colors.text },
            grid: { color: colors.grid }
          }
        }
      }
    });
  },

  /**
   * Doughnut chart - for macro breakdowns (protein, carbs, fat).
   * @param {string} canvasId - Canvas element ID
   * @param {string[]} labels - Segment labels
   * @param {number[]} data - Segment values
   */
  doughnut(canvasId, labels, data) {
    this.destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const colors = this._getThemeColors();

    // Center text plugin: shows total calories or sum in the donut hole
    const centerTextPlugin = {
      id: 'centerText',
      afterDraw(chart) {
        const { ctx: drawCtx, width, height } = chart;
        const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
        drawCtx.save();
        drawCtx.font = 'bold 18px system-ui, -apple-system, sans-serif';
        drawCtx.fillStyle = colors.text;
        drawCtx.textAlign = 'center';
        drawCtx.textBaseline = 'middle';
        drawCtx.fillText(`${Math.round(total)}g`, width / 2, height / 2);
        drawCtx.restore();
      }
    };

    this._instances[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: ['#3b82f6', '#f59e0b', '#ef4444'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: colors.text,
              padding: 12
            }
          }
        }
      },
      plugins: [centerTextPlugin]
    });
  },

  /**
   * Bar chart - for calories consumed vs target, water intake, etc.
   * @param {string} canvasId - Canvas element ID
   * @param {string[]} labels - X-axis labels
   * @param {number[]} data - Bar values
   * @param {Object} options - { label }
   */
  bar(canvasId, labels, data, options = {}) {
    this.destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const colors = this._getThemeColors();

    // Generate per-bar colors: first bar accent, rest use grid color
    const barColors = data.map((_, i) => i === 0 ? colors.accent : colors.grid);

    this._instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: options.label || '',
          data,
          backgroundColor: barColors,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            ticks: { color: colors.text },
            grid: { display: false }
          },
          y: {
            ticks: { color: colors.text },
            grid: { color: colors.grid },
            beginAtZero: true
          }
        }
      }
    });
  },

  /**
   * CSS-based heatmap for habit tracking.
   * Renders a 7-column grid (Mon-Sun) showing last 4 weeks.
   * @param {string} containerId - Container element ID
   * @param {Array<{date: string, value: number}>} data - date (YYYY-MM-DD), value 0-1
   */
  heatmap(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const colors = this._getThemeColors();
    const today = new Date();

    // Build 28-day grid (4 weeks)
    const cells = [];
    for (let i = 27; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const entry = data.find(e => e.date === dateStr);
      const value = entry ? entry.value : 0;
      // getDay(): 0=Sun, convert to Mon=0 through Sun=6
      const jsDay = d.getDay();
      const day = jsDay === 0 ? 6 : jsDay - 1;
      cells.push({ date: dateStr, value, day });
    }

    // Group cells into weeks (rows)
    const weeks = [];
    let currentWeek = new Array(7).fill(null);
    let weekIndex = 0;

    for (const cell of cells) {
      currentWeek[cell.day] = cell;
      // If Sunday (day index 6) or last cell, push the week
      if (cell.day === 6 || cell === cells[cells.length - 1]) {
        weeks.push([...currentWeek]);
        currentWeek = new Array(7).fill(null);
      }
    }

    // Color interpolation: bg (0) -> accent-light (0.5) -> accent (1)
    function getCellColor(value) {
      if (value === 0) return colors.grid;
      const accent = colors.accent;
      const opacity = 0.2 + value * 0.8;
      return accent;
    }

    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    container.innerHTML = `
      <div class="heatmap-grid" style="
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 4px;
        max-width: 320px;
      ">
        ${dayLabels.map(d => `
          <div class="heatmap-label" style="
            text-align: center;
            font-size: 11px;
            color: ${colors.text};
            opacity: 0.6;
            padding-bottom: 4px;
          ">${d}</div>
        `).join('')}
        ${cells.map(c => `
          <div class="heatmap-cell" style="
            width: 100%;
            aspect-ratio: 1;
            border-radius: 4px;
            background-color: ${c.value > 0 ? colors.accent : colors.grid};
            opacity: ${c.value > 0 ? (0.2 + c.value * 0.8) : 0.3};
            cursor: default;
          " title="${c.date}: ${Math.round(c.value * 100)}%"></div>
        `).join('')}
      </div>
    `;
  },

  /**
   * Destroy a chart instance and free its resources.
   * @param {string} canvasId - Canvas element ID of the chart to destroy
   */
  destroy(canvasId) {
    if (this._instances[canvasId]) {
      this._instances[canvasId].destroy();
      delete this._instances[canvasId];
    }
  }
};
