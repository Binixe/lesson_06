const USERS_KEY = 'atelier.users';
const SESSION_KEY = 'atelier.session';
const ARTICLES_KEY = 'atelier.articles';

function readUsers() {
  try {
    const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    if (!Array.isArray(users)) return [];
    if (users.length && !users.some((user) => typeof user.auteur === 'boolean')) {
      users[0].auteur = true;
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }
    return users;
  } catch {
    return [];
  }
}

function readArticles() {
  try {
    const articles = JSON.parse(localStorage.getItem(ARTICLES_KEY) || '[]');
    return Array.isArray(articles) ? articles : [];
  } catch {
    return [];
  }
}

function getCurrentUser() {
  const email = sessionStorage.getItem(SESSION_KEY);
  return readUsers().find((user) => user.email === email) || null;
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
      // Dans cette démo locale, le premier compte devient le premier auteur.
      const auteur = users.length === 0;
      users.push({ name, email, passwordHash, auteur });
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
      registerForm.reset();
      document.querySelector('#login-email').value = email;
      openTab('login');
      showMessage(loginMessage, auteur
        ? 'Compte auteur créé ! Vous pouvez maintenant vous connecter et publier.'
        : 'Compte créé ! Vous pouvez maintenant vous connecter.', true);
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
      const returnTo = sessionStorage.getItem('atelier.returnTo');
      sessionStorage.removeItem('atelier.returnTo');
      window.location.assign(returnTo || 'index.html');
    } catch {
      showMessage(loginMessage, 'Impossible de vous connecter dans ce navigateur. Réessayez en local.');
    }
  });
}

function initHomePage() {
  const user = getCurrentUser();
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
  document.querySelector('#session-status').textContent = user.auteur === true
    ? 'Votre session auteur est active'
    : 'Votre session est active';
  document.querySelector('#welcome-copy').textContent = `Bienvenue dans votre espace personnel, ${user.name}. Tout est prêt, vous pouvez profiter de votre session.`;
  logoutButton.setAttribute('aria-label', 'Se déconnecter');
  logoutButton.addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_KEY);
    window.location.replace('login.html');
  });
}

function initArticleListPage() {
  const user = getCurrentUser();
  const userName = document.querySelector('#user-name');
  const sessionLink = document.querySelector('#session-link');
  if (user) {
    userName.textContent = user.name;
    sessionLink.textContent = 'Se déconnecter';
    sessionLink.href = '#deconnexion';
    sessionLink.addEventListener('click', (event) => {
      event.preventDefault();
      sessionStorage.removeItem(SESSION_KEY);
      window.location.assign('login.html');
    });
  } else {
    userName.textContent = 'Visiteur';
    sessionLink.textContent = 'Se connecter';
    sessionLink.href = 'login.html';
  }

  const articles = readArticles().sort((left, right) => new Date(right.date) - new Date(left.date));
  const list = document.querySelector('#article-list');
  const emptyState = document.querySelector('#article-empty');
  if (!articles.length) {
    emptyState.hidden = false;
    return;
  }

  list.replaceChildren(...articles.map((article) => {
    const card = document.createElement('article');
    card.className = 'article-card';
    const meta = document.createElement('div');
    meta.className = 'article-meta';
    const date = document.createElement('time');
    date.dateTime = article.date;
    const parsedDate = new Date(article.date);
    date.textContent = Number.isNaN(parsedDate.getTime())
      ? 'Date inconnue'
      : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(parsedDate);
    const status = document.createElement('span');
    status.className = article.publier ? 'article-status is-published' : 'article-status';
    status.textContent = article.publier ? 'Publié' : 'Brouillon';
    meta.append(date, status);

    const title = document.createElement('h2');
    title.textContent = article.titre || 'Sans titre';
    const body = document.createElement('p');
    body.className = 'article-body';
    body.textContent = article.article || '';
    card.append(meta, title, body);
    if (article.auteur) {
      const author = document.createElement('p');
      author.className = 'article-author';
      author.textContent = `Par ${article.auteur}`;
      card.append(author);
    }
    return card;
  }));
}

function initArticleComposerPage() {
  const user = getCurrentUser();
  if (!user) {
    sessionStorage.setItem('atelier.returnTo', 'ecrire.html');
    window.location.replace('login.html');
    return;
  }

  if (user.auteur !== true) {
    document.querySelector('#composer-form').hidden = true;
    document.querySelector('#author-denied').hidden = false;
    document.querySelector('#author-denied-name').textContent = user.name;
    return;
  }

  document.querySelector('#composer-name').textContent = user.name;
  document.querySelector('#composer-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const articles = readArticles();
    articles.push({
      titre: String(data.get('titre')).trim(),
      article: String(data.get('article')).trim(),
      date: new Date().toISOString(),
      publier: data.get('publier') === 'true',
      auteur: user.name,
    });
    try {
      localStorage.setItem(ARTICLES_KEY, JSON.stringify(articles));
      window.location.assign('articles.html');
    } catch {
      showMessage(document.querySelector('#article-form-message'), 'Impossible d’enregistrer l’article dans ce navigateur.');
    }
  });
}

function initCursorBackground() {
  if (!window.matchMedia('(pointer: fine)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const body = document.body;
  let currentX = 0;
  let currentY = 0;
  let targetX = 0;
  let targetY = 0;
  let animationFrame = 0;
  let previousTime = 0;

  function animateBackground(time) {
    const elapsed = previousTime ? Math.min(time - previousTime, 64) : 16;
    previousTime = time;
    const easing = 1 - Math.exp(-elapsed / 210);
    currentX += (targetX - currentX) * easing;
    currentY += (targetY - currentY) * easing;
    body.style.setProperty('--background-x', `${currentX}px`);
    body.style.setProperty('--background-y', `${currentY}px`);
    body.style.setProperty('--panel-shift-x', `${-currentX / 45 * 8}%`);
    body.style.setProperty('--panel-shift-y', `${-currentY / 35 * 8}%`);

    if (Math.hypot(targetX - currentX, targetY - currentY) > 0.15) {
      animationFrame = requestAnimationFrame(animateBackground);
    } else {
      currentX = targetX;
      currentY = targetY;
      body.style.setProperty('--background-x', `${currentX}px`);
      body.style.setProperty('--background-y', `${currentY}px`);
      body.style.setProperty('--panel-shift-x', `${-currentX / 45 * 8}%`);
      body.style.setProperty('--panel-shift-y', `${-currentY / 35 * 8}%`);
      animationFrame = 0;
      previousTime = 0;
    }
  }

  function scheduleBackground() {
    if (!animationFrame) animationFrame = requestAnimationFrame(animateBackground);
  }

  function moveBackground(event) {
    targetX = (0.5 - event.clientX / window.innerWidth) * 90;
    targetY = (0.5 - event.clientY / window.innerHeight) * 70;
    scheduleBackground();
  }

  function resetBackground() {
    targetX = 0;
    targetY = 0;
    scheduleBackground();
  }

  window.addEventListener('pointermove', moveBackground, { passive: true });
  window.addEventListener('pointerleave', resetBackground);
  window.addEventListener('resize', resetBackground, { passive: true });
}

initCursorBackground();

if (document.body.dataset.page === 'auth') initAuthPage();
if (document.body.dataset.page === 'home') initHomePage();
if (document.body.dataset.page === 'articles') initArticleListPage();
if (document.body.dataset.page === 'composer') initArticleComposerPage();
