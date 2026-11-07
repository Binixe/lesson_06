const USERS_KEY = 'atelier.users';
const SESSION_KEY = 'atelier.session';
const ARTICLES_KEY = 'atelier.articles';
const NOTIFICATION_READ_KEY = 'atelier.publicationNotifications.read.';
const DEFAULT_ADMIN_EMAIL = 'admin@atelier.local';
const DEFAULT_ADMIN_PASSWORD = 'AtelierAdmin2026!';

function getSessionEmail() {
  const savedSession = sessionStorage.getItem(SESSION_KEY);
  if (savedSession) return savedSession;

  const previousSession = localStorage.getItem(SESSION_KEY);
  if (previousSession) {
    sessionStorage.setItem(SESSION_KEY, previousSession);
    localStorage.removeItem(SESSION_KEY);
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

async function persistUsers(users) {
  const response = await fetch('/api/users', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(users),
  });
  if (!response.ok) throw new Error('Impossible d’enregistrer les comptes sur le serveur.');
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

async function encodeProfilePhoto(file) {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) throw new Error('Choisissez une image JPG, PNG ou WebP.');
  if (file.size > 5 * 1024 * 1024) throw new Error('La photo doit faire moins de 5 Mo.');

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const photo = canvas.toDataURL('image/webp', 0.82);
  if (photo.length > 350 * 1024) throw new Error('Cette image est trop volumineuse. Choisissez-en une plus légère.');
  return photo;
}

async function recordPublicationNotification(article) {
  const response = await fetch('/api/publications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      articleId: article.id,
      title: article.titre,
      author: article.auteur,
    }),
  });
  if (!response.ok) throw new Error('Impossible d’enregistrer la notification de publication.');
}

async function hashPassword(email, password) {
  const value = `${email.trim().toLowerCase()}:${password}`;
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function ensureDefaultAdmin() {
  const response = await fetch('/api/users');
  if (!response.ok) throw new Error('Impossible de charger les comptes du serveur.');
  const serverUsers = await response.json();
  if (!Array.isArray(serverUsers)) throw new Error('Liste de comptes invalide.');

  const localUsers = readUsers();
  const localByEmail = new Map(localUsers.map((user) => [user.email, user]));
  const users = serverUsers.map((user) => ({
    ...user,
    passwordHash: localByEmail.get(user.email)?.passwordHash || '',
  }));
  const serverEmails = new Set(serverUsers.map((user) => user.email));
  localUsers.forEach((user) => {
    if (!serverEmails.has(user.email)) users.push(user);
  });

  const passwordHash = await hashPassword(DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD);
  const admin = users.find((user) => user.email === DEFAULT_ADMIN_EMAIL);
  if (admin) {
    admin.name ||= 'Administrateur Atelier';
    admin.passwordHash = passwordHash;
    admin.auteur = true;
    admin.administrateur = true;
  } else {
    users.push({
      name: 'Administrateur Atelier',
      email: DEFAULT_ADMIN_EMAIL,
      passwordHash,
      auteur: true,
      administrateur: true,
    });
  }
  await persistUsers(users);
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
      await persistUsers(users);
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
    try {
      const passwordHash = await hashPassword(email, password);
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, passwordHash }),
      });
      if (!response.ok) {
        showMessage(loginMessage, 'Adresse e-mail ou mot de passe incorrect.');
        return;
      }
      const user = { ...(await response.json()), passwordHash };
      const users = readUsers();
      const existingUserIndex = users.findIndex((entry) => entry.email === email);
      if (existingUserIndex === -1) users.push(user);
      else users[existingUserIndex] = { ...users[existingUserIndex], ...user };
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
      sessionStorage.setItem(SESSION_KEY, user.email);
      localStorage.removeItem(SESSION_KEY);
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
  const profileForm = document.querySelector('#profile-form');
  const profilePhoto = document.querySelector('#profile-photo');
  const profileInitials = document.querySelector('#profile-initials');
  const profileMessage = document.querySelector('#profile-message');
  const removePhotoButton = document.querySelector('#profile-remove-photo');

  function renderProfile(profile) {
    const name = profile.name || 'Membre';
    document.querySelector('#user-name').textContent = name;
    document.querySelector('#profile-name').value = name;
    document.querySelector('#profile-biography').value = profile.biography || '';
    document.querySelector('#welcome-copy').textContent = profile.biography || `Bienvenue dans votre espace personnel, ${name}. Tout est prêt, vous pouvez profiter de votre session.`;
    profileInitials.textContent = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase('fr-FR');
    profilePhoto.hidden = !profile.photo;
    profileInitials.hidden = Boolean(profile.photo);
    if (profile.photo) profilePhoto.src = profile.photo;
    profilePhoto.alt = `Photo de profil de ${name}`;
    removePhotoButton.hidden = !profile.photo;
  }

  if (adminLink && user?.administrateur === true) adminLink.hidden = false;
  if (!user) {
    document.querySelector('#profile-avatar').hidden = true;
    profileForm.hidden = true;
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

  renderProfile(user);
  profileForm.hidden = false;
  profileForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage(profileMessage, '');
    const users = readUsers();
    const profile = users.find((entry) => entry.email === user.email);
    if (!profile) {
      showMessage(profileMessage, 'Votre compte n’a pas été retrouvé. Reconnectez-vous.');
      return;
    }

    const file = document.querySelector('#profile-photo-input').files[0];
    try {
      const photo = file ? await encodeProfilePhoto(file) : profile.photo || '';
      profile.name = document.querySelector('#profile-name').value.trim();
      profile.biography = document.querySelector('#profile-biography').value.trim();
      profile.photo = photo;
      await persistUsers(users);
      Object.assign(user, profile);
      renderProfile(user);
      document.querySelector('#profile-photo-input').value = '';
      showMessage(profileMessage, 'Profil enregistré.', true);
    } catch (error) {
      showMessage(profileMessage, error.message || 'Impossible d’enregistrer le profil. Réessayez.');
    }
  });
  removePhotoButton.addEventListener('click', async () => {
    const users = readUsers();
    const profile = users.find((entry) => entry.email === user.email);
    if (!profile) return;
    profile.photo = '';
    try {
      await persistUsers(users);
      Object.assign(user, profile);
      renderProfile(user);
      document.querySelector('#profile-photo-input').value = '';
      showMessage(profileMessage, 'Photo retirée.', true);
    } catch {
      showMessage(profileMessage, 'Impossible de retirer la photo. Réessayez.');
    }
  });
  document.querySelector('#session-status').textContent = user.auteur === true
    ? 'Votre session auteur est active'
    : 'Votre session est active';
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
  const authorCounts = new Map();
  articles.forEach((article) => {
    const author = typeof article.auteur === 'string' ? article.auteur.trim() : '';
    if (!author) return;
    const key = author.toLocaleLowerCase('fr');
    const entry = authorCounts.get(key) || { name: author, count: 0 };
    entry.count += 1;
    authorCounts.set(key, entry);
  });
  const leaderboard = document.querySelector('#author-leaderboard');
  const leaderboardList = document.querySelector('#leaderboard-list');
  const rankedAuthors = [...authorCounts.values()].sort((left, right) => (
    right.count - left.count || left.name.localeCompare(right.name, 'fr')
  ));
  if (rankedAuthors.length) {
    leaderboard.hidden = false;
    leaderboardList.replaceChildren(...rankedAuthors.map((author, index) => {
      const item = document.createElement('li');
      item.className = 'leaderboard-item';
      const rank = document.createElement('span');
      rank.className = 'leaderboard-rank';
      rank.textContent = String(index + 1).padStart(2, '0');
      const name = document.createElement('span');
      name.className = 'leaderboard-name';
      name.textContent = author.name;
      const count = document.createElement('span');
      count.className = 'leaderboard-count';
      count.textContent = `${author.count} ${author.count > 1 ? 'articles' : 'article'}`;
      item.append(rank, name, count);
      return item;
    }));
  }
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
    const requestButton = document.querySelector('#author-request-button');
    const requestStatus = document.querySelector('#author-request-status');
    if (user.demandeAuteur === true) {
      requestButton.disabled = true;
      requestButton.textContent = 'Demande envoyée';
      showMessage(requestStatus, 'Votre demande est en attente de validation par un administrateur.', true);
    }
    requestButton.addEventListener('click', async () => {
      const users = readUsers();
      const currentUser = users.find((entry) => entry.email === user.email);
      if (!currentUser || currentUser.auteur === true || currentUser.demandeAuteur === true) return;
      currentUser.demandeAuteur = true;
      try {
        await persistUsers(users);
        requestButton.disabled = true;
        requestButton.textContent = 'Demande envoyée';
        showMessage(requestStatus, 'Votre demande est en attente de validation par un administrateur.', true);
      } catch {
        showMessage(requestStatus, 'Impossible d’envoyer la demande dans ce navigateur. Réessayez.');
      }
    });
    return;
  }

  document.querySelector('#composer-name').textContent = user.name;
  document.querySelector('#composer-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const articles = readArticles();
    const article = {
      id: `article-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      titre: String(data.get('titre')).trim(),
      article: String(data.get('article')).trim(),
      date: new Date().toISOString(),
      publier: data.get('publier') === 'true',
      auteur: user.name,
    };
    articles.push(article);
    try {
      localStorage.setItem(ARTICLES_KEY, JSON.stringify(articles));
      if (article.publier) await recordPublicationNotification(article);
      window.location.assign('articles.html');
    } catch {
      showMessage(document.querySelector('#article-form-message'), article.publier
        ? 'Article enregistré, mais la notification de publication n’a pas pu être envoyée.'
        : 'Impossible d’enregistrer l’article dans ce navigateur.');
    }
  });
}

function initAdminPage() {
  const adminContent = document.querySelector('#admin-content');
  const denied = document.querySelector('#admin-denied');
  const adminLink = document.querySelector('#admin-link');
  const userName = document.querySelector('#user-name');
  const sessionLink = document.querySelector('#session-link');
  const notificationControl = document.querySelector('#admin-notifications');
  const notificationToggle = document.querySelector('#notifications-toggle');
  const notificationPanel = document.querySelector('#notifications-panel');
  const notificationBadge = document.querySelector('#notification-count');
  const notificationList = document.querySelector('#notification-list');
  let publicationNotifications = [];

  function isAdmin() {
    return getCurrentUser()?.administrateur === true;
  }

  function readSeenPublicationIds() {
    const email = getCurrentUser()?.email;
    if (!email) return new Set();
    try {
      const ids = JSON.parse(localStorage.getItem(`${NOTIFICATION_READ_KEY}${email}`) || '[]');
      return new Set(Array.isArray(ids) ? ids : []);
    } catch {
      return new Set();
    }
  }

  function renderNotifications() {
    if (!notificationControl) return;
    notificationControl.hidden = !isAdmin();
    if (!isAdmin()) return;

    const users = readUsers();
    const requests = users.filter((user) => user.demandeAuteur === true && user.auteur !== true);
    const seenIds = readSeenPublicationIds();
    const unreadPublications = publicationNotifications.filter((item) => !seenIds.has(item.id));
    const unreadCount = requests.length + unreadPublications.length;
    notificationBadge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
    notificationBadge.hidden = unreadCount === 0;
    notificationToggle.setAttribute('aria-label', unreadCount
      ? `Notifications, ${unreadCount} à consulter`
      : 'Notifications');

    const items = [];
    requests.forEach((user) => {
      const item = document.createElement('li');
      item.className = 'notification-item is-pending';
      const copy = document.createElement('div');
      copy.className = 'notification-copy';
      const title = document.createElement('strong');
      title.textContent = 'Demande de droit d’écriture';
      const detail = document.createElement('span');
      detail.textContent = `${user.name || 'Utilisateur'} · ${user.email}`;
      copy.append(title, detail);
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'notification-action';
      action.dataset.focusRequest = user.email;
      action.textContent = 'Voir';
      item.append(copy, action);
      items.push(item);
    });

    publicationNotifications.forEach((publication) => {
      const item = document.createElement('li');
      item.className = 'notification-item';
      if (!seenIds.has(publication.id)) item.classList.add('is-unread');
      const copy = document.createElement('div');
      copy.className = 'notification-copy';
      const title = document.createElement('strong');
      title.textContent = 'Article publié';
      const detail = document.createElement('span');
      detail.textContent = publication.title;
      const author = document.createElement('span');
      author.className = 'notification-author';
      author.textContent = `Publié par ${publication.author}`;
      const date = document.createElement('time');
      const publishedAt = new Date(publication.publishedAt);
      if (!Number.isNaN(publishedAt.getTime())) {
        date.dateTime = publishedAt.toISOString();
        date.textContent = publishedAt.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
      }
      copy.append(title, detail, author, date);
      item.append(copy);
      items.push(item);
    });

    if (!items.length) {
      const empty = document.createElement('li');
      empty.className = 'notification-empty';
      empty.textContent = 'Aucune notification pour le moment.';
      items.push(empty);
    }
    notificationList.replaceChildren(...items);
  }

  const actionIcons = {
    write: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
    removeWrite: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/><path d="m4 4 16 16"/>',
    accept: '<path d="m5 12 4 4L19 6"/>',
    reject: '<path d="m6 6 12 12M18 6 6 18"/>',
    promote: '<path d="M12 3 4.5 6v5c0 5 3.2 8.5 7.5 10 4.3-1.5 7.5-5 7.5-10V6Z"/><path d="M12 8v7m-3.5-3.5h7"/>',
    demote: '<path d="M12 3 4.5 6v5c0 5 3.2 8.5 7.5 10 4.3-1.5 7.5-5 7.5-10V6Z"/><path d="M9 12h6"/>',
    user: '<path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="8" r="4"/>',
    delete: '<path d="M3 6h18"/><path d="M8 6V4h8v2m3 0-1 14H6L5 6"/><path d="M10 11v5m4-5v5"/>',
    publish: '<path d="M12 21V9m-5 5 5-5 5 5"/><path d="M5 7V3h14v4"/>',
    unpublish: '<path d="M12 3v12m-5-5 5 5 5-5"/><path d="M5 17v4h14v-4"/>',
  };

  function createActionButton(label, iconName, variant, dataAttribute, value) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `button button-small admin-action ${variant}`;
    button.dataset[dataAttribute] = value;
    button.title = label;
    button.setAttribute('aria-label', label);
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = actionIcons[iconName];
    const text = document.createElement('span');
    text.textContent = label;
    button.append(icon, text);
    return button;
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
      row.dataset.userEmail = user.email;
      const nameCell = document.createElement('td');
      nameCell.textContent = user.name || 'Sans nom';
      const emailCell = document.createElement('td');
      emailCell.textContent = user.email;
      const roleCell = document.createElement('td');
      const roles = [user.administrateur === true ? 'Administrateur' : '', user.auteur === true ? 'Auteur' : 'Lecteur'];
      if (user.demandeAuteur === true && user.auteur !== true) roles.push('Demande d’écriture en attente');
      roleCell.textContent = roles.filter(Boolean).join(' · ');
      const actionCell = document.createElement('td');
      const actions = document.createElement('div');
      actions.className = 'admin-actions';
      const permissionActions = document.createElement('div');
      permissionActions.className = 'admin-action-group';
      const managementActions = document.createElement('div');
      managementActions.className = 'admin-action-group is-destructive';
      const isAuthorRequest = user.demandeAuteur === true && user.auteur !== true;
      const authorButton = createActionButton(
        isAuthorRequest ? 'Accepter la demande' : user.auteur === true ? 'Retirer droit d’écriture' : 'Autoriser à écrire',
        isAuthorRequest ? 'accept' : user.auteur === true ? 'removeWrite' : 'write',
        isAuthorRequest ? 'admin-action--accept' : user.auteur === true ? 'admin-action--revoke' : 'admin-action--grant',
        'toggleAuthor',
        user.email,
      );
      authorButton.disabled = user.email === currentUser.email;
      const adminButton = createActionButton(
        user.administrateur === true ? 'Retirer admin' : 'Promouvoir admin',
        user.administrateur === true ? 'demote' : 'promote',
        user.administrateur === true ? 'admin-action--revoke' : 'admin-action--promote',
        'toggleAdmin',
        user.email,
      );
      adminButton.disabled = user.email === currentUser.email
        || (user.administrateur === true && users.filter((entry) => entry.administrateur === true).length <= 1);
      const deleteButton = createActionButton(
        user.email === currentUser.email ? 'Votre compte' : 'Supprimer',
        user.email === currentUser.email ? 'user' : 'delete',
        'admin-action--danger',
        'deleteUser',
        user.email,
      );
      deleteButton.disabled = user.email === currentUser.email
        || (user.administrateur === true && users.filter((entry) => entry.administrateur === true).length <= 1);
      permissionActions.append(authorButton, adminButton);
      managementActions.append(deleteButton);
      if (isAuthorRequest) {
        managementActions.append(createActionButton('Refuser', 'reject', 'admin-action--danger', 'rejectAuthorRequest', user.email));
      }
      actions.append(permissionActions, managementActions);
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
      const publishActions = document.createElement('div');
      publishActions.className = 'admin-action-group';
      const articleManagementActions = document.createElement('div');
      articleManagementActions.className = 'admin-action-group is-destructive';
      publishActions.append(createActionButton(article.publier ? 'Dépublier' : 'Publier', article.publier ? 'unpublish' : 'publish', 'admin-action--grant', 'toggleArticle', article.id));
      articleManagementActions.append(createActionButton('Supprimer', 'delete', 'admin-action--danger', 'deleteArticle', article.id));
      actions.append(publishActions, articleManagementActions);
      actionCell.append(actions);
      row.append(titleCell, authorCell, statusCell, actionCell);
      return row;
    }));

    document.querySelector('#admin-user-empty').hidden = users.length > 0;
    document.querySelector('#admin-article-empty').hidden = articles.length > 0;
    renderNotifications();
  }

  async function refreshAdminNotifications() {
    if (!isAdmin()) return;
    try {
      const [usersResponse, publicationsResponse] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/publications'),
      ]);
      if (usersResponse.ok) {
        const serverUsers = await usersResponse.json();
        if (Array.isArray(serverUsers)) {
          const localUsers = readUsers();
          const localByEmail = new Map(localUsers.map((user) => [user.email, user]));
          const serverState = JSON.stringify(serverUsers.map(({ name, email, auteur, administrateur, demandeAuteur }) => (
            [name, email, auteur, administrateur, demandeAuteur]
          )));
          const localState = JSON.stringify(localUsers.map(({ name, email, auteur, administrateur, demandeAuteur }) => (
            [name, email, auteur, administrateur, demandeAuteur]
          )));
          if (serverState !== localState) {
            const synchronizedUsers = serverUsers.map((user) => ({
              ...user,
              passwordHash: localByEmail.get(user.email)?.passwordHash || '',
            }));
            localStorage.setItem(USERS_KEY, JSON.stringify(synchronizedUsers));
            renderAdmin();
          }
        }
      }
      if (publicationsResponse.ok) {
        const notifications = await publicationsResponse.json();
        publicationNotifications = Array.isArray(notifications)
          ? notifications.filter((item) => item && item.id && item.title && item.author && item.publishedAt)
          : [];
        renderNotifications();
      }
    } catch {
      renderNotifications();
    }
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
  notificationToggle.addEventListener('click', async () => {
    const opening = notificationPanel.hidden;
    notificationPanel.hidden = !opening;
    notificationToggle.setAttribute('aria-expanded', String(opening));
    if (opening) {
      await refreshAdminNotifications();
      const seenIds = readSeenPublicationIds();
      publicationNotifications.forEach((item) => seenIds.add(item.id));
      const email = getCurrentUser()?.email;
      if (email) localStorage.setItem(`${NOTIFICATION_READ_KEY}${email}`, JSON.stringify([...seenIds]));
      renderNotifications();
    }
  });
  notificationPanel.addEventListener('click', (event) => {
    const action = event.target.closest('[data-focus-request]');
    if (!action) return;
    notificationPanel.hidden = true;
    notificationToggle.setAttribute('aria-expanded', 'false');
    const row = [...document.querySelectorAll('#admin-user-list tr')]
      .find((entry) => entry.dataset.userEmail === action.dataset.focusRequest);
    row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row?.querySelector('[data-toggle-author]')?.focus({ preventScroll: true });
  });
  document.addEventListener('click', (event) => {
    if (notificationControl.contains(event.target)) return;
    notificationPanel.hidden = true;
    notificationToggle.setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    notificationPanel.hidden = true;
    notificationToggle.setAttribute('aria-expanded', 'false');
  });
  refreshAdminNotifications();
  window.setInterval(refreshAdminNotifications, 15000);

  adminContent.addEventListener('click', async (event) => {
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
        if (target.administrateur) {
          target.auteur = true;
          target.demandeAuteur = false;
        }
      } else {
        target.auteur = target.auteur !== true;
        if (target.auteur) target.demandeAuteur = false;
      }

      await persistUsers(users);
      renderAdmin();
      return;
    }

    if (button.dataset.rejectAuthorRequest) {
      const users = readUsers();
      const target = users.find((user) => user.email === button.dataset.rejectAuthorRequest);
      if (!target || target.auteur === true || target.demandeAuteur !== true) return;
      target.demandeAuteur = false;
      await persistUsers(users);
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
      await persistUsers(users.filter((user) => user.email !== email));
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
        if (article.publier) {
          try {
            await recordPublicationNotification(article);
          } catch (error) {
            console.error(error);
          }
        }
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

async function initApp() {
  await ensureDefaultAdmin();
  initCursorBackground();

  if (document.body.dataset.page === 'auth') initAuthPage();
  if (document.body.dataset.page === 'home') initHomePage();
  if (document.body.dataset.page === 'articles') initArticleListPage();
  if (document.body.dataset.page === 'composer') initArticleComposerPage();
  if (document.body.dataset.page === 'admin') initAdminPage();
}

initApp();
