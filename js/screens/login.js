// ============================================================
//  screens/login.js
// ============================================================

function renderLogin(container) {
  container.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1rem;">
      <div class="container-sm w-full fade-in">

        <!-- Logo -->
        <div class="text-center mb-3">
          <img src="img/logo.jpg?v=2" alt="Pharm From Home — AI-Supported Virtual Patient Program" class="brand-logo" />
          <p class="text-dim mt-1">ระบบฝึกปฏิบัติงานร้านยาชุมชน</p>
        </div>

        <!-- Card -->
        <!-- ต้องเป็น <form> จริง: password manager ถึงจะเสนอบันทึก/เติมรหัสให้
             และ Enter จากช่องไหนก็ submit ได้เองโดยไม่ต้องดัก keydown เอง -->
        <form class="card" id="login-form" novalidate>
          <h3 class="mb-2">เข้าสู่ระบบ</h3>

          <!-- role=alert ให้ screen reader อ่านข้อความ error ทันทีที่ขึ้น -->
          <div id="login-alert" class="hidden mb-2" role="alert" aria-live="assertive"></div>

          <div class="mb-2">
            <label class="input-label" for="login-id">รหัสผู้เข้าร่วม</label>
            <input id="login-id" name="username" class="input" type="text" placeholder="เช่น P00001"
                   autocomplete="username" autocapitalize="characters" spellcheck="false" required />
          </div>

          <div class="mb-3">
            <label class="input-label" for="login-pw">รหัสผ่าน</label>
            <input id="login-pw" name="password" class="input" type="password" placeholder="••••••••"
                   autocomplete="current-password" required />
          </div>

          <button id="login-btn" type="submit" class="btn btn-primary btn-full btn-lg">
            เข้าสู่ระบบ
          </button>
        </form>

        <p class="text-center text-xs text-dim mt-2">
          Pharm From Home — สำหรับการศึกษาเท่านั้น
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
        'auth/invalid-login-credentials',
      ].includes(e.code);

      // เคสที่เจอบ่อยจริงเวลานักศึกษาพิมพ์ผิดหลายรอบ — เดิมหลุดไปโชว์ข้อความอังกฤษดิบ
      let msg;
      if (authFail)                              msg = 'รหัสผู้เข้าร่วมหรือรหัสผ่านไม่ถูกต้อง';
      else if (e.code === 'auth/too-many-requests')
        msg = 'ลองเข้าสู่ระบบผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่ หรือติดต่อผู้ดูแล';
      else if (e.code === 'auth/network-request-failed')
        msg = 'เชื่อมต่ออินเทอร์เน็ตไม่ได้ กรุณาตรวจสอบสัญญาณแล้วลองใหม่';
      else if (e.code === 'auth/user-disabled')
        msg = 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแล';
      else                                       msg = `เกิดข้อผิดพลาด: ${e.message || 'กรุณาลองใหม่'}`;

      showAlert(msg);
      btn.disabled = false;
      btn.textContent = 'เข้าสู่ระบบ';
      idInput.focus();   // พาเคอร์เซอร์กลับไปที่ช่องแรกให้พิมพ์ใหม่ได้เลย
    }
  }

  // submit ครอบคลุมทั้งคลิกปุ่มและกด Enter จากช่องไหนก็ได้
  document.getElementById('login-form').addEventListener('submit', e => {
    e.preventDefault();
    doLogin();
  });

  idInput.focus();
}
