// ============================================================
//  screens/login.js
// ============================================================

function renderLogin(container) {
  container.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1rem;">
      <div class="container-sm w-full fade-in">

        <!-- Logo -->
        <div class="text-center mb-3">
          <div style="font-size:3rem;margin-bottom:0.5rem;">💊</div>
          <h1 class="text-accent">PharmBot</h1>
          <p class="text-dim mt-1">ระบบฝึกปฏิบัติงานร้านยาชุมชน</p>
        </div>

        <!-- Card -->
        <div class="card">
          <h3 class="mb-2">เข้าสู่ระบบ</h3>

          <div id="login-alert" class="hidden mb-2"></div>

          <div class="mb-2">
            <label class="input-label">รหัสผู้เข้าร่วม</label>
            <input id="login-id" class="input" type="text" placeholder="เช่น P00001" autocomplete="username" />
          </div>

          <div class="mb-3">
            <label class="input-label">รหัสผ่าน</label>
            <input id="login-pw" class="input" type="password" placeholder="••••••••" autocomplete="current-password" />
          </div>

          <button id="login-btn" class="btn btn-primary btn-full btn-lg">
            เข้าสู่ระบบ
          </button>
        </div>

        <p class="text-center text-xs text-dim mt-2">
          PharmBot v2 — สำหรับการศึกษาเท่านั้น
        </p>
      </div>
    </div>
  `;

  const idInput  = document.getElementById('login-id');
  const pwInput  = document.getElementById('login-pw');
  const btn      = document.getElementById('login-btn');
  const alertBox = document.getElementById('login-alert');

  function showAlert(msg, type = 'error') {
    alertBox.className = `alert alert-${type} mb-2`;
    alertBox.textContent = msg;
    alertBox.classList.remove('hidden');
  }

  async function doLogin() {
    const pid = idInput.value.trim().toUpperCase();
    const pw  = pwInput.value;

    if (!pid || !pw) { showAlert('กรุณากรอกรหัสผู้เข้าร่วมและรหัสผ่าน'); return; }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> กำลังเข้าสู่ระบบ…';

    try {
      await loginWithParticipantId(pid, pw);
      Router.go('dashboard');
    } catch (e) {
      const authFail = [
        'auth/wrong-password', 'auth/user-not-found',
        'auth/invalid-credential', 'auth/invalid-email',
      ].includes(e.code);
      const msg = authFail
        ? 'รหัสผู้เข้าร่วมหรือรหัสผ่านไม่ถูกต้อง'
        : `เกิดข้อผิดพลาด: ${e.message || 'กรุณาลองใหม่'}`;
      showAlert(msg);
      btn.disabled = false;
      btn.textContent = 'เข้าสู่ระบบ';
    }
  }

  btn.addEventListener('click', doLogin);
  pwInput.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  idInput.addEventListener('keydown', e => { if (e.key === 'Enter') pwInput.focus(); });
}
