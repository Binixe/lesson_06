const USERS_KEY = 'atelier.users';
const SESSION_KEY = 'atelier.session';
const ARTICLES_KEY = 'atelier.articles';

function getSessionEmail() {
  const savedSession = localStorage.getItem(SESSION_KEY);
  if (savedSession) return savedSession;

  const previousSession = sessionStorage.getItem(SESSION_KEY);
  if (previousSession) {
    localStorage.setItem(SESSION_KEY, previousSession);
    sessionStorage.removeItem(SESSION_KEY);
  }
  return previousSession;
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

function readUsers() {
  try {
    const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    if (!Array.isArray(users)) return [];
    let changed = false;
    if (users.length && !users.some((user) => user.administrateur === true)) {
      users[0].administrateur = true;
      changed = true;
    }
    if (users.length && !users.some((user) => typeof user.auteur === 'boolean')) {
      users[0].auteur = true;
      changed = true;
    }
    if (changed) {
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
    if (!Array.isArray(articles)) return [];
    let changed = false;
    articles.forEach((article) => {
      if (!article.id) {
        article.id = `article-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        changed = true;
      }
    });
    if (changed) localStorage.setItem(ARTICLES_KEY, JSON.stringify(articles));
    return articles;
  } catch {
    return [];
  }
}

function getCurrentUser() {
  const email = getSessionEmail();
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

  const currentSession = getSessionEmail();
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
      // Dans cette démo locale, le premier compte devient administrateur et auteur.
      const premierCompte = users.length === 0;
      users.push({ name, email, passwordHash, auteur: premierCompte, administrateur: premierCompte });
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
      registerForm.reset();
      document.querySelector('#login-email').value = email;
      openTab('login');
      showMessage(loginMessage, premierCompte
        ? 'Compte administrateur créé ! Vous pouvez maintenant vous connecter et gérer l’atelier.'
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
      localStorage.setItem(SESSION_KEY, user.email);
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
  const adminLink = document.querySelector('#admin-link');
  if (adminLink && user?.administrateur === true) adminLink.hidden = false;
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
    clearSession();
    window.location.replace('login.html');
  });
}

function initArticleListPage() {
  const user = getCurrentUser();
  const userName = document.querySelector('#user-name');
  const sessionLink = document.querySelector('#session-link');
  if (user) {
    userName.textContent = user.name;
    const adminLink = document.querySelector('#admin-link');
    if (adminLink && user.administrateur === true) adminLink.hidden = false;
    sessionLink.textContent = 'Se déconnecter';
    sessionLink.href = '#deconnexion';
    sessionLink.addEventListener('click', (event) => {
      event.preventDefault();
      clearSession();
      window.location.assign('login.html');
    });
  } else {
    userName.textContent = 'Visiteur';
    sessionLink.textContent = 'Se connecter';
    sessionLink.href = 'login.html';
  }

  const articles = readArticles()
    .filter((article) => article.publier === true)
    .sort((left, right) => new Date(right.date) - new Date(left.date));
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
    status.className = 'article-status is-published';
    status.textContent = 'Publié';
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

  if (user.auteur !== true && user.administrateur !== true) {
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
      id: `article-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

function initAdminPage() {
  const adminContent = document.querySelector('#admin-content');
  const denied = document.querySelector('#admin-denied');
  const adminLink = document.querySelector('#admin-link');
  const userName = document.querySelector('#user-name');
  const sessionLink = document.querySelector('#session-link');

  function isAdmin() {
    return getCurrentUser()?.administrateur === true;
  }

  function renderAdmin() {
    if (!isAdmin()) {
      adminContent.hidden = true;
      denied.hidden = false;
      return;
    }
    denied.hidden = true;
    adminContent.hidden = false;
    const currentUser = getCurrentUser();
    userName.textContent = currentUser.name;
    adminLink.hidden = false;

    const users = readUsers();
    const articles = readArticles().sort((left, right) => new Date(right.date) - new Date(left.date));
    const userList = document.querySelector('#admin-user-list');
    const articleList = document.querySelector('#admin-article-list');

    userList.replaceChildren(...users.map((user) => {
      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      nameCell.textContent = user.name || 'Sans nom';
      const emailCell = document.createElement('td');
      emailCell.textContent = user.email;
      const roleCell = document.createElement('td');
      roleCell.textContent = [user.administrateur === true ? 'Administrateur' : '', user.auteur === true ? 'Auteur' : 'Lecteur']
        .filter(Boolean).join(' · ');
      const actionCell = document.createElement('td');
      const actions = document.createElement('div');
      actions.className = 'admin-actions';
      const authorButton = document.createElement('button');
      authorButton.type = 'button';
      authorButton.className = 'button button-small button-quiet';
      authorButton.dataset.toggleAuthor = user.email;
      authorButton.textContent = user.auteur === true ? 'Retirer droit d’écriture' : 'Autoriser à écrire';
      authorButton.disabled = user.email === currentUser.email;
      const adminButton = document.createElement('button');
      adminButton.type = 'button';
      adminButton.className = 'button button-small button-quiet';
      adminButton.dataset.toggleAdmin = user.email;
      adminButton.textContent = user.administrateur === true ? 'Retirer admin' : 'Promouvoir admin';
      adminButton.disabled = user.email === currentUser.email
        || (user.administrateur === true && users.filter((entry) => entry.administrateur === true).length <= 1);
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'button button-small button-danger';
      deleteButton.dataset.deleteUser = user.email;
      deleteButton.textContent = user.email === currentUser.email ? 'Votre compte' : 'Supprimer';
      deleteButton.disabled = user.email === currentUser.email
        || (user.administrateur === true && users.filter((entry) => entry.administrateur === true).length <= 1);
      actions.append(authorButton, adminButton, deleteButton);
      actionCell.append(actions);
      row.append(nameCell, emailCell, roleCell, actionCell);
      return row;
    }));

    articleList.replaceChildren(...articles.map((article) => {
      const row = document.createElement('tr');
      const titleCell = document.createElement('td');
      titleCell.textContent = article.titre || 'Sans titre';
      const authorCell = document.createElement('td');
      authorCell.textContent = article.auteur || 'Auteur inconnu';
      const statusCell = document.createElement('td');
      const status = document.createElement('span');
      status.className = article.publier ? 'article-status is-published' : 'article-status';
      status.textContent = article.publier ? 'Publié' : 'Brouillon';
      statusCell.append(status);
      const actionCell = document.createElement('td');
      const actions = document.createElement('div');
      actions.className = 'admin-actions';
      const publishButton = document.createElement('button');
      publishButton.type = 'button';
      publishButton.className = 'button button-small button-quiet';
      publishButton.dataset.toggleArticle = article.id;
      publishButton.textContent = article.publier ? 'Dépublier' : 'Publier';
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'button button-small button-danger';
      deleteButton.dataset.deleteArticle = article.id;
      deleteButton.textContent = 'Supprimer';
      actions.append(publishButton, deleteButton);
      actionCell.append(actions);
      row.append(titleCell, authorCell, statusCell, actionCell);
      return row;
    }));

    document.querySelector('#admin-user-empty').hidden = users.length > 0;
    document.querySelector('#admin-article-empty').hidden = articles.length > 0;
  }

  const currentUser = getCurrentUser();
  userName.textContent = currentUser?.name || 'Visiteur';
  if (currentUser) {
    sessionLink.textContent = 'Se déconnecter';
    sessionLink.href = '#deconnexion';
    sessionLink.addEventListener('click', (event) => {
      event.preventDefault();
      clearSession();
      window.location.assign('login.html');
    });
  } else {
    sessionLink.textContent = 'Se connecter';
    sessionLink.href = 'login.html';
  }
  if (currentUser?.administrateur === true) adminLink.hidden = false;
  renderAdmin();

  adminContent.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || !isAdmin()) return;

    if (button.dataset.toggleAuthor || button.dataset.toggleAdmin) {
      const email = button.dataset.toggleAuthor || button.dataset.toggleAdmin;
      const users = readUsers();
      const target = users.find((user) => user.email === email);
      if (!target || email === getCurrentUser()?.email) return;

      if (button.dataset.toggleAdmin) {
        if (target.administrateur === true && users.filter((user) => user.administrateur === true).length <= 1) return;
        target.administrateur = target.administrateur !== true;
        if (target.administrateur) target.auteur = true;
      } else {
        target.auteur = target.auteur !== true;
      }

      localStorage.setItem(USERS_KEY, JSON.stringify(users));
      renderAdmin();
      return;
    }

    if (button.dataset.deleteUser) {
      const email = button.dataset.deleteUser;
      const users = readUsers();
      const target = users.find((user) => user.email === email);
      if (!target || email === getCurrentUser()?.email) return;
      if (target.administrateur === true && users.filter((user) => user.administrateur === true).length <= 1) return;
      if (!window.confirm(`Supprimer le compte de ${target.name || email} ?`)) return;
      localStorage.setItem(USERS_KEY, JSON.stringify(users.filter((user) => user.email !== email)));
      renderAdmin();
      return;
    }

    if (button.dataset.toggleArticle || button.dataset.deleteArticle) {
      const articles = readArticles();
      const articleId = button.dataset.toggleArticle || button.dataset.deleteArticle;
      const article = articles.find((entry) => entry.id === articleId);
      if (!article) return;
      if (button.dataset.deleteArticle) {
        if (!window.confirm(`Supprimer l’article « ${article.titre || 'Sans titre'} » ?`)) return;
        localStorage.setItem(ARTICLES_KEY, JSON.stringify(articles.filter((entry) => entry.id !== articleId)));
      } else {
        article.publier = !article.publier;
        localStorage.setItem(ARTICLES_KEY, JSON.stringify(articles));
      }
      renderAdmin();
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
if (document.body.dataset.page === 'admin') initAdminPage();
