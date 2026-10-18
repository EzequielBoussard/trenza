// Pruebas en un navegador de verdad sin dependencias: un servidor estático con las cabeceras de
// _headers y Chrome o Edge sin ventana, manejado por el protocolo de DevTools.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { delimiter, extname, join, normalize } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

// Las cabeceras de "/*": la política de seguridad tiene que valer también en las pruebas.
async function siteHeaders(root) {
  const headers = {};
  let inside = false;
  for (const line of (await readFile(join(root, '_headers'), 'utf8')).split('\n')) {
    if (!line.startsWith(' ')) inside = line.trim() === '/*';
    const pair = inside && line.match(/^ {2}([A-Za-z-]+):\s*(.+)$/);
    if (pair) headers[pair[1]] = pair[2].trim();
  }
  return headers;
}

// Como Pages: una ruta que no existe devuelve el index.
export async function serve(root) {
  const headers = await siteHeaders(root);
  const server = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = normalize(join(root, path === '/' ? 'index.html' : path));
    let body;
    let type;
    try {
      if (!file.startsWith(normalize(root))) throw new Error('fuera de la carpeta');
      body = await readFile(file);
      type = TYPES[extname(file)] ?? 'application/octet-stream';
    } catch {
      body = await readFile(join(root, 'index.html'));
      type = TYPES['.html'];
    }
    response.writeHead(200, { ...headers, 'Content-Type': type, 'Cache-Control': 'no-store' });
    response.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

const INSTALLED = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];
const ON_PATH = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'];

export function findBrowser() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const local = process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe');
  for (const path of [local, ...INSTALLED]) if (path && existsSync(path)) return path;
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    for (const name of ON_PATH) if (directory && existsSync(join(directory, name))) return join(directory, name);
  }
  return null;
}

class Connection {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.next = 1;
    this.pending = new Map();
    this.handlers = [];
    this.socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      const waiting = this.pending.get(message.id);
      if (waiting) {
        this.pending.delete(message.id);
        if (message.error) waiting.reject(new Error(`${waiting.method}: ${message.error.message}`));
        else waiting.resolve(message.result);
        return;
      }
      for (const handler of this.handlers) handler(message);
    });
  }

  opened() {
    return new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', () => reject(new Error('sin conexión con el navegador')), { once: true });
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.next++;
    this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject, method }));
  }
}

// Una pestaña: guarda los errores de la consola, las excepciones y lo que bloquea la política.
class Tab {
  constructor(connection, sessionId) {
    this.connection = connection;
    this.sessionId = sessionId;
    this.problems = [];
    this.loaded = null;
    connection.handlers.push((message) => {
      if (message.sessionId !== sessionId) return;
      const { method, params } = message;
      if (method === 'Runtime.exceptionThrown') this.problems.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
      if (method === 'Runtime.consoleAPICalled' && params.type === 'error') this.problems.push(params.args.map((arg) => arg.value ?? arg.description).join(' '));
      if (method === 'Log.entryAdded' && params.entry.level === 'error') this.problems.push(params.entry.text);
      if (method === 'Page.loadEventFired') this.loaded?.();
    });
  }

  send(method, params) {
    return this.connection.send(method, params, this.sessionId);
  }

  async open(url) {
    const loaded = new Promise((resolve) => { this.loaded = resolve; });
    await this.send('Page.navigate', { url });
    await loaded;
  }

  async evaluate(expression) {
    const { result, exceptionDetails } = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  }

  async waitFor(expression, timeout = 15000) {
    const until = Date.now() + timeout;
    for (;;) {
      const value = await this.evaluate(expression);
      if (value) return value;
      if (Date.now() > until) throw new Error(`no se cumplió a tiempo: ${expression}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  async chooseFile(selector, path) {
    const { root } = await this.send('DOM.getDocument', {});
    const { nodeId } = await this.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    await this.send('DOM.setFileInputFiles', { nodeId, files: [path] });
  }

  wheel(x, y, deltaY) {
    return this.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY });
  }
}

export async function launch(executable) {
  const profile = mkdtempSync(join(tmpdir(), 'trenza-'));
  const args = [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--window-size=1440,900', 'about:blank',
  ];
  // En Ubuntu 24 el sandbox de Chrome no arranca para un usuario común sin cambiar AppArmor.
  if (process.env.CI) args.unshift('--no-sandbox');
  const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'] });

  const endpoint = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`el navegador no abrió:\n${output}`)), 20000);
    child.stderr.on('data', (chunk) => {
      output += chunk;
      const found = output.match(/DevTools listening on (ws:\/\/\S+)/);
      if (found) {
        clearTimeout(timer);
        resolve(found[1]);
      }
    });
    child.on('exit', () => reject(new Error(`el navegador se cerró:\n${output}`)));
  });

  const connection = new Connection(endpoint);
  await connection.opened();

  return {
    // En inglés, que es lo que comparan las pruebas, aunque el sistema esté en otro idioma.
    async tab({ width = 1440, height = 900, storage = {} } = {}) {
      const { targetId } = await connection.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await connection.send('Target.attachToTarget', { targetId, flatten: true });
      const tab = new Tab(connection, sessionId);
      for (const domain of ['Page', 'Runtime', 'Log']) await tab.send(`${domain}.enable`);
      await tab.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      const entries = JSON.stringify(Object.entries({ 'trenza.language': 'en', ...storage }));
      await tab.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `try { for (const [key, value] of ${entries}) localStorage.setItem(key, value); } catch {}`,
      });
      tab.close = () => connection.send('Target.closeTarget', { targetId });
      return tab;
    },
    async close() {
      if (child.exitCode === null) {
        const exited = new Promise((resolve) => child.once('exit', resolve));
        await connection.send('Browser.close').catch(() => child.kill());
        await exited;
      }
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
}
