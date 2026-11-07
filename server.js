const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const port = Number(process.env.PORT) || 3000;
const userDataDirectory = path.join(root, '.data');
const userDataPath = path.join(userDataDirectory, 'users.json');
const publicationNotificationsPath = path.join(userDataDirectory, 'publication-notifications.json');
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readRequestBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 5 * 1024 * 1024) throw new Error('Requête trop volumineuse');
  }
  return JSON.parse(body);
}

function toPublicUser(user) {
  const { passwordHash, ...publicUser } = user;
  return publicUser;
}

async function readStoredUsers() {
  try {
    const users = JSON.parse(await fs.promises.readFile(userDataPath, 'utf8'));
    return Array.isArray(users) ? users : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function readPublicationNotifications() {
  try {
    const notifications = JSON.parse(await fs.promises.readFile(publicationNotificationsPath, 'utf8'));
    return Array.isArray(notifications) ? notifications : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function handlePublicationNotificationsApi(request, response) {
  if (request.method === 'GET') {
    try {
      sendJson(response, 200, await readPublicationNotifications());
    } catch {
      sendJson(response, 500, { error: 'Impossible de lire les notifications.' });
    }
    return;
  }

  if (request.method !== 'POST') {
    response.writeHead(405, { Allow: 'GET, POST' }).end();
    return;
  }

  let publication;
  try {
    publication = await readRequestBody(request);
  } catch {
    sendJson(response, 400, { error: 'Données invalides ou trop volumineuses.' });
    return;
  }
  if (!publication || typeof publication.articleId !== 'string'
    || typeof publication.title !== 'string' || typeof publication.author !== 'string'
    || !publication.articleId.trim() || !publication.title.trim() || !publication.author.trim()) {
    sendJson(response, 400, { error: 'Informations de publication invalides.' });
    return;
  }

  try {
    const notifications = await readPublicationNotifications();
    notifications.unshift({
      id: `publication-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      articleId: publication.articleId.slice(0, 160),
      title: publication.title.trim().slice(0, 240),
      author: publication.author.trim().slice(0, 120),
      publishedAt: new Date().toISOString(),
    });
    await fs.promises.mkdir(userDataDirectory, { recursive: true });
    const temporaryPath = `${publicationNotificationsPath}.${process.pid}.tmp`;
    await fs.promises.writeFile(temporaryPath, JSON.stringify(notifications.slice(0, 500), null, 2), { mode: 0o600 });
    await fs.promises.rename(temporaryPath, publicationNotificationsPath);
    sendJson(response, 201, { saved: true });
  } catch {
    sendJson(response, 500, { error: 'Impossible d’enregistrer la notification.' });
  }
}

async function handleLogin(request, response) {
  let credentials;
  try {
    credentials = await readRequestBody(request);
  } catch {
    sendJson(response, 400, { error: 'Données invalides.' });
    return;
  }
  if (typeof credentials.email !== 'string' || typeof credentials.passwordHash !== 'string') {
    sendJson(response, 400, { error: 'Identifiants invalides.' });
    return;
  }

  try {
    const users = await readStoredUsers();
    const user = users.find((entry) => entry.email === credentials.email.toLowerCase());
    if (!user || user.passwordHash !== credentials.passwordHash) {
      sendJson(response, 401, { error: 'Adresse e-mail ou mot de passe incorrect.' });
      return;
    }
    sendJson(response, 200, toPublicUser(user));
  } catch {
    sendJson(response, 500, { error: 'Impossible de vérifier les identifiants.' });
  }
}

async function handleUsersApi(request, response) {
  if (request.method === 'GET') {
    try {
      const users = await readStoredUsers();
      sendJson(response, 200, users.map(toPublicUser));
    } catch (error) {
      sendJson(response, 500, { error: 'Impossible de lire les comptes.' });
    }
    return;
  }

  if (request.method !== 'PUT') {
    response.writeHead(405, { Allow: 'GET, PUT' }).end();
    return;
  }

  let users;
  try {
    users = await readRequestBody(request);
  } catch {
    sendJson(response, 400, { error: 'Données invalides ou trop volumineuses.' });
    return;
  }
  if (!Array.isArray(users) || users.length > 500 || users.some((user) => (
    !user || typeof user.email !== 'string'
  ))) {
    sendJson(response, 400, { error: 'Liste de comptes invalide.' });
    return;
  }

  try {
    const storedUsers = await readStoredUsers();
    const storedByEmail = new Map(storedUsers.map((user) => [user.email, user]));
    users = users.map((user) => ({
      ...user,
      passwordHash: user.passwordHash || storedByEmail.get(user.email)?.passwordHash || '',
    }));
    await fs.promises.mkdir(userDataDirectory, { recursive: true });
    const temporaryPath = `${userDataPath}.${process.pid}.tmp`;
    await fs.promises.writeFile(temporaryPath, JSON.stringify(users, null, 2), { mode: 0o600 });
    await fs.promises.rename(temporaryPath, userDataPath);
    sendJson(response, 200, { saved: true });
  } catch {
    sendJson(response, 500, { error: 'Impossible d’enregistrer les comptes.' });
  }
}

const server = http.createServer(async (request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  } catch {
    response.writeHead(400).end('Requête invalide');
    return;
  }

  if (pathname === '/api/users') {
    await handleUsersApi(request, response);
    return;
  }
  if (pathname === '/api/publications') {
    await handlePublicationNotificationsApi(request, response);
    return;
  }
  if (pathname === '/api/login' && request.method === 'POST') {
    await handleLogin(request, response);
    return;
  }

  const requestedPath = pathname === '/' ? '/login.html' : pathname;
  const filePath = path.resolve(root, `.${requestedPath}`);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end('Accès refusé');
    return;
  }
  if (filePath.startsWith(`${userDataDirectory}${path.sep}`)) {
    response.writeHead(404).end('Page introuvable');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(error.code === 'ENOENT' ? 'Page introuvable' : 'Erreur serveur');
      return;
    }
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream' });
    response.end(content);
  });
});

server.listen(port, () => {
  console.log(`Site disponible sur http://localhost:${port}`);
});
