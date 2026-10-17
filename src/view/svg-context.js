const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escape = (text) => String(text).replace(/[&<>"]/g, (character) => ESCAPES[character]);
const round = (value) => Math.round(value * 100) / 100;

function parseFont(shorthand) {
  const match = shorthand.match(/^(\d+)?\s*(\d+(?:\.\d+)?)px\s+(.+)$/);
  if (!match) return { weight: 400, size: 13, family: 'sans-serif' };
  return { weight: Number(match[1]) || 400, size: Number(match[2]), family: match[3] };
}

const ANCHORS = { left: 'start', center: 'middle', right: 'end' };

// Imita la API de CanvasRenderingContext2D pero arma SVG. El diagrama se dibuja con el
// mismo código para PNG y SVG.

const PROPERTIES = ['fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'globalAlpha', 'font', 'textAlign'];

export class SvgContext {
  constructor() {
    this.elements = [];
    this.path = [];
    this.circle = null;
    this.state = {
      fillStyle: '#000',
      strokeStyle: '#000',
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
      globalAlpha: 1,
      font: '400 13px sans-serif',
      textAlign: 'left',
      dash: null,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    };
    this.stack = [];

    for (const name of PROPERTIES) {
      Object.defineProperty(this, name, {
        get: () => this.state[name],
        set: (value) => { this.state[name] = value; },
      });
    }
  }

  save() {
    this.stack.push({ ...this.state });
  }

  restore() {
    if (this.stack.length > 0) this.state = this.stack.pop();
  }

  translate(x, y) {
    this.state.offsetX += x * this.state.scale;
    this.state.offsetY += y * this.state.scale;
  }

  // Sólo uniforme (se usa el primer factor): es lo único que pide el dibujo, y así el grosor
  // del trazo escala parejo.
  scale(factor) {
    this.state.scale *= factor;
  }

  point(x, y) {
    const { scale, offsetX, offsetY } = this.state;
    return [round(x * scale + offsetX), round(y * scale + offsetY)];
  }

  setLineDash(pattern) {
    this.state.dash = pattern && pattern.length > 0 ? pattern.join(' ') : null;
  }

  beginPath() {
    this.path = [];
    // Igual que en el contexto 2D, beginPath descarta el círculo pendiente.
    this.circle = null;
  }

  moveTo(x, y) {
    this.path.push(`M${this.point(x, y).join(' ')}`);
  }

  lineTo(x, y) {
    this.path.push(`L${this.point(x, y).join(' ')}`);
  }

  arc(x, y, radius) {
    const { scale, offsetX, offsetY } = this.state;
    this.circle = { x: x * scale + offsetX, y: y * scale + offsetY, radius: radius * scale };
    this.path = [];
  }

  fillAttributes() {
    const { fillStyle, globalAlpha } = this.state;
    return `fill="${fillStyle}"${globalAlpha < 1 ? ` fill-opacity="${round(globalAlpha)}"` : ''}`;
  }

  fillRect(x, y, width, height) {
    const [left, top] = this.point(x, y);
    const { scale } = this.state;
    this.elements.push(`<rect x="${left}" y="${top}"`
      + ` width="${round(width * scale)}" height="${round(height * scale)}" ${this.fillAttributes()}/>`);
  }

  fill() {
    if (!this.circle) return;
    this.elements.push(`<circle cx="${round(this.circle.x)}" cy="${round(this.circle.y)}"`
      + ` r="${round(this.circle.radius)}" ${this.fillAttributes()}/>`);
  }

  stroke() {
    if (this.circle) {
      this.elements.push(`<circle cx="${round(this.circle.x)}" cy="${round(this.circle.y)}"`
        + ` r="${round(this.circle.radius)}" fill="none" ${this.strokeAttributes()}/>`);
      this.circle = null;
      return;
    }
    if (this.path.length === 0) return;
    this.elements.push(`<path d="${this.path.join('')}" fill="none" ${this.strokeAttributes()}/>`);
  }

  strokePathData(data) {
    const { offsetX, offsetY, scale } = this.state;
    const scaled = scale === 1 ? '' : ` scale(${round(scale)})`;
    // Con la escala en el transform, el grosor del trazo va sin escalar: el SVG lo escala solo.
    this.elements.push(`<path d="${data}" fill="none" transform="translate(${round(offsetX)} ${round(offsetY)})${scaled}"`
      + ` ${this.strokeAttributes(1)}/>`);
  }

  fillText(content, x, y, halo) {
    const { weight, size, family } = parseFont(this.state.font);
    const { strokeStyle, lineWidth, lineJoin, scale } = this.state;
    const [left, top] = this.point(x, y);
    this.elements.push(`<text x="${left}" y="${top}"`
      + ` ${this.fillAttributes()} font-family="${escape(family)}" font-size="${round(size * scale)}"`
      + ` font-weight="${weight}" text-anchor="${ANCHORS[this.state.textAlign] || 'start'}"`
      + (halo ? ` paint-order="stroke" stroke="${strokeStyle}" stroke-width="${round(lineWidth * scale)}"`
        + ` stroke-linejoin="${lineJoin}"` : '')
      + `>${escape(content)}</text>`);
  }

  strokeAttributes(scale = this.state.scale) {
    const { strokeStyle, lineWidth, lineCap, lineJoin, globalAlpha, dash } = this.state;
    return `stroke="${strokeStyle}" stroke-width="${round(lineWidth * scale)}" stroke-linecap="${lineCap}"`
      + ` stroke-linejoin="${lineJoin}"${globalAlpha < 1 ? ` stroke-opacity="${round(globalAlpha)}"` : ''}`
      + `${dash ? ` stroke-dasharray="${dash}"` : ''}`;
  }

  toSvg({ width, height, title }) {
    const box = { width: round(width), height: round(height) };
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box.width} ${box.height}"`
      + ` width="${box.width}" height="${box.height}" role="img" aria-label="${escape(title)}">\n`
      + `<title>${escape(title)}</title>\n${this.elements.join('\n')}\n</svg>\n`;
  }
}

export function strokeGlyph(context, data) {
  if (context.strokePathData) context.strokePathData(data);
  else context.stroke(new Path2D(data));
}

// Contorno del color del fondo debajo del relleno, para que el texto se lea sobre un cable.
export function haloText(context, content, x, y) {
  if (context.strokePathData) context.fillText(content, x, y, true);
  else {
    context.strokeText(content, x, y);
    context.fillText(content, x, y);
  }
}
