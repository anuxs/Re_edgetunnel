export const LOGIN_SCRIPT = String.raw`
(() => {
  const form = document.querySelector('form[method="post"]');
  const button = document.querySelector('[data-login-button]');
  const error = document.querySelector('[data-login-error]');
  const password = document.querySelector('#password');
  document.querySelector('[data-toggle-password]')?.addEventListener('click', () => {
    password.type = password.type === 'password' ? 'text' : 'password';
  });
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    button.disabled = true;
    button.textContent = '正在验证…';
    error.classList.add('hidden');
    try {
      const response = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        body: new URLSearchParams(new FormData(form)),
      });
      if (!response.ok) throw new Error('密码不正确，请重新输入。');
      location.replace('/admin');
    } catch (reason) {
      error.textContent = reason.message || '登录失败，请稍后重试。';
      error.classList.remove('hidden');
      password.select();
    } finally {
      button.disabled = false;
      button.textContent = '进入控制台';
    }
  });
})();
`;
