// ============================================================
//  router.js — Hash-based SPA routing
//  Routes: #login, #dashboard, #groups, #cases, #chat, #summary, #history, #admin
// ============================================================

const SCREENS = {
  login:     { render: renderLogin,     requireAuth: false },
  dashboard: { render: renderDashboard, requireAuth: true  },
  groups:    { render: renderGroups,    requireAuth: true  },
  cases:     { render: renderCases,     requireAuth: true  },
  chat:      { render: renderChat,      requireAuth: true  },
  summary:   { render: renderSummary,   requireAuth: true  },
  history:   { render: renderHistory,   requireAuth: true  },
  admin:     { render: renderAdmin,     requireAuth: true, requireAdmin: true },
};

const Router = {
  _params: {},
  _inited: false,

  go(route, params = {}) {
    this._params = params;
    window.location.hash = '#' + route;
  },

  getParams() { return this._params; },

  // เรียกซ้ำไม่ได้ — listener ตัวที่สองทำให้ทุก hashchange dispatch 2 รอบ
  // (คู่กับ onAuthReady ใน auth.js ที่ยิง callback ครั้งเดียว)
  init() {
    if (this._inited) return;
    this._inited = true;
    window.addEventListener('hashchange', () => this._dispatch());
    this._dispatch();
  },

  _dispatch() {
    const hash   = window.location.hash.replace('#', '') || 'login';
    const screen = SCREENS[hash];

    if (!screen) {
      this.go('login');
      return;
    }

    const user = getCurrentUser();

    if (screen.requireAuth && !user) {
      this.go('login');
      return;
    }

    if (screen.requireAdmin && !isAdmin()) {
      this.go('dashboard');
      return;
    }

    const app = document.getElementById('app');
    app.innerHTML = '';
    screen.render(app, this._params);
  }
};
