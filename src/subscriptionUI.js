async function request(path, body) {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

export function initSubscriptionUI() {
  const dialog = document.getElementById('account-dialog');
  const openButton = document.getElementById('account-open');
  const closeButton = document.getElementById('account-close');
  const form = document.getElementById('account-form');
  const emailInput = document.getElementById('account-email');
  const passwordInput = document.getElementById('account-password');
  const modeButtons = [...document.querySelectorAll('[data-account-mode]')];
  const submitButton = document.getElementById('account-submit');
  const magicButton = document.getElementById('account-magic');
  const accountStatus = document.getElementById('account-status');
  const signedIn = document.getElementById('account-signed-in');
  const accountEmail = document.getElementById('account-email-label');
  const verification = document.getElementById('account-verification');
  const pricing = document.getElementById('account-pricing');
  const interval = document.getElementById('account-interval');
  const subscribeButton = document.getElementById('account-subscribe');
  const portalButton = document.getElementById('account-portal');
  const signOutButton = document.getElementById('account-signout');
  const adminControls = document.getElementById('account-admin-controls');
  const freeToggle = document.getElementById('account-free-toggle');
  let mode = 'login';
  let currentAccount = null;

  if (!dialog || !openButton || !form) return;

  const setStatus = (text, isError = false) => {
    accountStatus.textContent = text;
    accountStatus.dataset.state = isError ? 'error' : 'normal';
  };

  const updateMode = (nextMode) => {
    mode = nextMode;
    for (const button of modeButtons) {
      const active = button.dataset.accountMode === mode;
      button.setAttribute('aria-pressed', String(active));
    }
    passwordInput.required = true;
    submitButton.textContent = mode === 'signup' ? 'Create account' : 'Sign in';
    passwordInput.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    setStatus('');
  };

  const render = (account) => {
    currentAccount = account;
    const user = account?.user;
    openButton.title = user ? `Account: ${user.email}` : 'Sign in or subscribe';
    signedIn.hidden = !user;
    form.hidden = Boolean(user);
    pricing.hidden = !user || account.freeForAll || account.activeSubscription;
    verification.hidden = !user || user.emailVerified;
    if (user) accountEmail.textContent = user.email;
    portalButton.hidden = !user || !account.activeSubscription;
    subscribeButton.hidden = !user || account.freeForAll || account.activeSubscription;
    adminControls.hidden = !user?.admin;
    if (user?.admin) freeToggle.checked = Boolean(account.freeForAll);
  };

  const refresh = async () => {
    try { render(await request('/api/account/me')); } catch { render(null); }
  };

  openButton.addEventListener('click', () => {
    setStatus('');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  });
  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  for (const button of modeButtons) button.addEventListener('click', () => updateMode(button.dataset.accountMode));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    submitButton.disabled = true;
    try {
      if (mode === 'signup') {
        await request('/api/account/signup', { email, password });
        setStatus('Check your inbox to verify your email.');
      } else {
        await request('/api/account/login', { email, password });
        window.location.reload();
      }
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      submitButton.disabled = false;
    }
  });

  magicButton.addEventListener('click', async () => {
    magicButton.disabled = true;
    try {
      await request('/api/account/magic-link', { email: emailInput.value.trim() });
      setStatus('If that address has an account, a sign-in link is on its way.');
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      magicButton.disabled = false;
    }
  });

  subscribeButton.addEventListener('click', async () => {
    subscribeButton.disabled = true;
    try {
      const result = await request('/api/account/subscribe', { interval: interval.value });
      window.location.assign(result.url);
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      subscribeButton.disabled = false;
    }
  });

  portalButton.addEventListener('click', async () => {
    try {
      const result = await request('/api/account/portal', {});
      window.location.assign(result.url);
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  signOutButton.addEventListener('click', async () => {
    try {
      await request('/api/account/logout', {});
      window.location.reload();
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  freeToggle.addEventListener('change', async () => {
    freeToggle.disabled = true;
    try {
      await request('/api/account/admin/free-for-all', { enabled: freeToggle.checked });
      window.location.reload();
    } catch (error) {
      freeToggle.checked = !freeToggle.checked;
      setStatus(error.message, true);
    } finally {
      freeToggle.disabled = false;
    }
  });

  void refresh();
  const params = new URLSearchParams(window.location.search);
  const magicToken = params.get('magic');
  if (magicToken) {
    params.delete('magic');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    void request('/api/account/magic-link/consume', { token: magicToken })
      .then(() => window.location.reload())
      .catch((error) => {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        setStatus(error.message, true);
      });
  }

  const billing = params.get('billing');
  if (billing === 'success' || billing === 'cancelled') {
    params.delete('billing');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    setStatus(billing === 'success' ? 'Payment received. Your subscription will activate shortly.' : 'Checkout was cancelled.');
  }

  updateMode('login');
}
