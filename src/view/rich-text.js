// Packet Tracer guarda texto con formato: las instrucciones de una actividad (HTML de Word) y la
// descripción de la red (HTML de Qt). Se arma de nuevo sin atributos, estilos, enlaces ni guiones.
const RENAMED = {
  h1: 'h4', h2: 'h5', h3: 'h6', h4: 'h6', h5: 'h6', h6: 'h6',
  p: 'p', b: 'strong', strong: 'strong', i: 'em', em: 'em', sub: 'sub', sup: 'sup', br: 'br',
  table: 'table', thead: 'thead', tbody: 'tbody', tr: 'tr', td: 'td', th: 'th',
  ul: 'ul', ol: 'ol', li: 'li', pre: 'pre', code: 'code',
};

const DROPPED = new Set([
  'script', 'style', 'head', 'title', 'meta', 'link', 'img', 'svg', 'math', 'object', 'embed',
  'iframe', 'video', 'audio', 'canvas', 'input', 'button', 'select', 'textarea', 'form', 'template',
  'noscript',
]);

const KEEP_EMPTY = new Set(['br', 'td', 'th', 'tr', 'thead', 'tbody', 'table']);

// Estilos de las plantillas de Cisco. "Config Window" es una marca invisible (blanca, de 3 puntos)
// y el título ya va en el resumen de la sección.
const HIDDEN = /^(ConfigWindow|MsoTitle)/i;
const COMMAND = /^CMD/i;
const BULLET = /^Bullet/i;
const BULLET_MARK = /^[\s\u00a0]*[·•▪o§\uf0b7\uf0a7-][\s\u00a0]+/;

function kind(node) {
  if (node.nodeType !== Node.ELEMENT_NODE || node.localName !== 'p') return null;
  if (COMMAND.test(node.className)) return 'command';
  if (BULLET.test(node.className)) return 'bullet';
  return null;
}

// Word corta los renglones largos del código fuente con un salto que reemplaza a un espacio.
function commandLine(node) {
  return node.textContent.replace(/\u00a0/g, ' ').replace(/\r?\n/g, ' ').replace(/\s+$/, '');
}

// Sin esto la política de seguridad anota un aviso en la consola por cada estilo de Word, aunque
// el documento sea inerte.
function unstyled(page) {
  return page
    .replace(/<style[\s\S]*?<\/style\s*>/gi, '')
    .replace(/\sstyle\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

function rebuild(node, into) {
  if (node.nodeType === Node.TEXT_NODE) {
    into.append(node.data.replace(/\u00a0/g, ' '));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const name = node.localName;
  if (DROPPED.has(name) || HIDDEN.test(node.className)) return;

  const tag = RENAMED[name];
  if (!tag) {
    rebuildChildren(node, into);
    return;
  }
  const target = document.createElement(tag);
  // Lo único que se copia: sin esto la tabla de direcciones se desarma.
  if (tag === 'td' || tag === 'th') {
    for (const span of ['rowspan', 'colspan']) {
      const value = Number(node.getAttribute(span));
      if (value > 1) target.setAttribute(span, String(Math.min(value, 100)));
    }
  }
  rebuildChildren(node, target);
  if (!KEEP_EMPTY.has(tag) && !target.textContent.trim()) return;
  if (tag === 'table') {
    target.className = 'table';
    const scroller = document.createElement('div');
    scroller.className = 'table-scroller';
    scroller.append(target);
    into.append(scroller);
    return;
  }
  into.append(target);
}

// Los párrafos de comandos seguidos van en un solo bloque, y las viñetas seguidas en una lista.
function rebuildChildren(parent, into) {
  let group = null;
  for (const child of parent.childNodes) {
    const current = kind(child);
    if (current === null && group && child.nodeType === Node.TEXT_NODE && !child.data.trim()) continue;
    if (current !== group?.kind) group = null;

    if (current === 'command') {
      if (!group) {
        group = { kind: current, node: document.createElement('pre') };
        group.node.className = 'code-block';
        into.append(group.node);
      }
      group.node.append(`${group.node.textContent ? '\n' : ''}${commandLine(child)}`);
    } else if (current === 'bullet') {
      if (!group) {
        group = { kind: current, node: document.createElement('ul') };
        into.append(group.node);
      }
      const item = document.createElement('li');
      rebuildChildren(child, item);
      item.normalize();
      const first = item.firstChild;
      if (first?.nodeType === Node.TEXT_NODE) first.data = first.data.replace(BULLET_MARK, '');
      if (/level[2-9]/i.test(child.className)) item.className = 'rich-text__deeper';
      if (item.textContent.trim()) group.node.append(item);
    } else {
      rebuild(child, into);
    }
  }
}

// DOMParser arma un documento inerte: no corre guiones ni pide imágenes.
export function renderRichText(pages) {
  const content = document.createElement('div');
  content.className = 'rich-text';
  let title = '';
  for (const page of pages) {
    const parsed = new DOMParser().parseFromString(unstyled(page), 'text/html');
    title ||= (parsed.title || parsed.querySelector('.MsoTitle')?.textContent || '').replace(/\s+/g, ' ').trim();
    const lang = parsed.body.lang || parsed.documentElement.lang;
    if (lang && !content.lang) content.lang = lang;
    rebuildChildren(parsed.body, content);
  }
  return { title, content };
}
