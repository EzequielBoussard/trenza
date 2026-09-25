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
    this.state.offsetX += x;
    this.state.offsetY += y;
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
    this.path.push(`M${round(x + this.state.offsetX)} ${round(y + this.state.offsetY)}`);
  }

  lineTo(x, y) {
    this.path.push(`L${round(x + this.state.offsetX)} ${round(y + this.state.offsetY)}`);
  }

  arc(x, y, radius) {
    this.circle = { x: x + this.state.offsetX, y: y + this.state.offsetY, radius };
    this.path = [];
  }

  fillAttributes() {
    const { fillStyle, globalAlpha } = this.state;
    return `fill="${fillStyle}"${globalAlpha < 1 ? ` fill-opacity="${round(globalAlpha)}"` : ''}`;
  }

  fillRect(x, y, width, height) {
    const { offsetX, offsetY } = this.state;
    this.elements.push(`<rect x="${round(x + offsetX)}" y="${round(y + offsetY)}"`
      + ` width="${round(width)}" height="${round(height)}" ${this.fillAttributes()}/>`);
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
    const { offsetX, offsetY } = this.state;
    this.elements.push(`<path d="${data}" fill="none" transform="translate(${round(offsetX)} ${round(offsetY)})"`
      + ` ${this.strokeAttributes()}/>`);
  }

  fillText(content, x, y, halo) {
    const { weight, size, family } = parseFont(this.state.font);
    const { strokeStyle, lineWidth, lineJoin } = this.state;
    this.elements.push(`<text x="${round(x + this.state.offsetX)}" y="${round(y + this.state.offsetY)}"`
      + ` ${this.fillAttributes()} font-family="${escape(family)}" font-size="${round(size)}"`
      + ` font-weight="${weight}" text-anchor="${ANCHORS[this.state.textAlign] || 'start'}"`
      + (halo ? ` paint-order="stroke" stroke="${strokeStyle}" stroke-width="${round(lineWidth)}"`
        + ` stroke-linejoin="${lineJoin}"` : '')
      + `>${escape(content)}</text>`);
  }

  strokeAttributes() {
    const { strokeStyle, lineWidth, lineCap, lineJoin, globalAlpha, dash } = this.state;
    return `stroke="${strokeStyle}" stroke-width="${round(lineWidth)}" stroke-linecap="${lineCap}"`
      + ` stroke-linejoin="${lineJoin}"${globalAlpha < 1 ? ` stroke-opacity="${round(globalAlpha)}"` : ''}`
      + `${dash ? ` stroke-dasharray="${dash}"` : ''}`;
  }

  toSvg({ width, height, title }) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"`
      + ` width="${width}" height="${height}" role="img" aria-label="${escape(title)}">\n`
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
