const USERS_KEY = 'atelier.users';
const SESSION_KEY = 'atelier.session';

function readUsers() {
  try {
    const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    return Array.isArray(users) ? users : [];
  } catch {
    return [];
  }
}

async function hashPassword(email, password) {
  const value = `${email.trim().toLowerCase()}:${password}`;
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function showMessage(element, message, success = false) {
  element.textContent = message;
  element.classList.toggle('is-success', success);
}

function initAuthPage() {
  const loginForm = document.querySelector('#login-form');
  const registerForm = document.querySelector('#register-form');
  const loginMessage = document.querySelector('#login-message');
  const registerMessage = document.querySelector('#register-message');
  const tabs = [...document.querySelectorAll('[data-tab]')];

  function openTab(name) {
    const isLogin = name === 'login';
    loginForm.hidden = !isLogin;
    registerForm.hidden = isLogin;
    document.querySelector('#login-tab').classList.toggle('is-active', isLogin);
    document.querySelector('#register-tab').classList.toggle('is-active', !isLogin);
    document.querySelector('#login-tab').setAttribute('aria-selected', String(isLogin));
    document.querySelector('#register-tab').setAttribute('aria-selected', String(!isLogin));
    document.querySelector('#form-title').textContent = isLogin ? 'Ravi de vous revoir' : 'Rejoignez-nous';
    document.querySelector('#form-subtitle').textContent = isLogin
      ? 'Entrez vos informations pour vous connecter.'
      : 'Créez votre compte en quelques secondes.';
    history.replaceState(null, '', isLogin ? '#connexion' : '#inscription');
  }

  tabs.forEach((tab) => tab.addEventListener('click', () => openTab(tab.dataset.tab)));
  document.querySelectorAll('[data-open-tab]').forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      openTab(trigger.dataset.openTab);
    });
  });

  const currentSession = sessionStorage.getItem(SESSION_KEY);
  if (currentSession && readUsers().some((user) => user.email === currentSession)) {
    window.location.replace('index.html');
    return;
  }

  const requestedTab = window.location.hash === '#inscription' ? 'register' : 'login';
  openTab(requestedTab);

  registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage(registerMessage, '');
    const formData = new FormData(registerForm);
    const name = String(formData.get('name')).trim();
    const email = String(formData.get('email')).trim().toLowerCase();
    const password = String(formData.get('password'));
    const users = readUsers();

    if (users.some((user) => user.email === email)) {
      showMessage(registerMessage, 'Un compte existe déjà avec cette adresse e-mail.');
      return;
    }

    try {
      const passwordHash = await hashPassword(email, password);
      users.push({ name, email, passwordHash });
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
      registerForm.reset();
      document.querySelector('#login-email').value = email;
      openTab('login');
      showMessage(loginMessage, 'Compte créé ! Vous pouvez maintenant vous connecter.', true);
    } catch {
      showMessage(registerMessage, 'Impossible de créer le compte dans ce navigateur. Réessayez en local.');
    }
  });

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage(loginMessage, '');
    const formData = new FormData(loginForm);
    const email = String(formData.get('email')).trim().toLowerCase();
    const password = String(formData.get('password'));
    const user = readUsers().find((entry) => entry.email === email);

    try {
      const passwordHash = await hashPassword(email, password);
      if (!user || user.passwordHash !== passwordHash) {
        showMessage(loginMessage, 'Adresse e-mail ou mot de passe incorrect.');
        return;
      }
      sessionStorage.setItem(SESSION_KEY, user.email);
      window.location.assign('index.html');
    } catch {
      showMessage(loginMessage, 'Impossible de vous connecter dans ce navigateur. Réessayez en local.');
    }
  });
}

function initHomePage() {
  const email = sessionStorage.getItem(SESSION_KEY);
  const user = readUsers().find((entry) => entry.email === email);
  const logoutButton = document.querySelector('#logout-button');
  if (!user) {
    document.querySelector('#welcome-title').textContent = 'Connectez-vous pour continuer';
    document.querySelector('#welcome-copy').textContent = 'Votre session n’a pas été retrouvée dans ce navigateur. Reconnectez-vous pour accéder à votre espace.';
    document.querySelector('#user-name').textContent = 'Visiteur';
    document.querySelector('#session-status').textContent = 'Connexion requise';
    logoutButton.textContent = 'Se connecter';
    logoutButton.setAttribute('aria-label', 'Se connecter');
    logoutButton.addEventListener('click', () => {
      window.location.assign('login.html');
    });
    return;
  }

  document.querySelector('#user-name').textContent = user.name;
  document.querySelector('#welcome-copy').textContent = `Bienvenue dans votre espace personnel, ${user.name}. Tout est prêt, vous pouvez profiter de votre session.`;
  logoutButton.setAttribute('aria-label', 'Se déconnecter');
  logoutButton.addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_KEY);
    window.location.replace('login.html');
  });
}

if (document.body.dataset.page === 'auth') initAuthPage();
if (document.body.dataset.page === 'home') initHomePage();
