import { resolveValue } from '../events/valueResolver.js';

function clampByte(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.max(0, Math.min(255, Math.round(num)));
}

function normalizeColorSpec(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;

  if (text.includes(',')) {
    const parts = text.split(',').map(part => part.trim());
    if (parts.length === 3) {
      const r = clampByte(parts[0]);
      const g = clampByte(parts[1]);
      const b = clampByte(parts[2]);
      if (r === null || g === null || b === null) return null;
      return `rgb(${r}, ${g}, ${b})`;
    }
  }

  return text.toLowerCase();
}

function interpolateRagsVars(text, context) {
  if (typeof text !== 'string' || !text.includes('[v:')) return text;

  return text.replace(/\[v:\s*([^\]]+)\]/gi, (match, rawToken) => {
    const token = String(rawToken ?? '').trim();
    if (!token) return '';

    if (context?.vars && Object.prototype.hasOwnProperty.call(context.vars, token)) {
      const value = context.vars[token];
      return value === null || value === undefined ? '' : String(value);
    }

    const resolved = resolveValue(token, context);
    if (resolved === null || resolved === undefined) return '';
    return String(resolved);
  });
}

export function ragsToHtml(rawText, context = {}) {
  if (rawText === null || rawText === undefined) return '';
  let text = String(rawText);

  text = interpolateRagsVars(text, context);

  text = text.replace(/\r\n/g, '\n').replace(/\n/g, '<br>');

  text = text.replace(/\[b\]/gi, '<b>').replace(/\[\/b\]/gi, '</b>');

  text = text.replace(/\[i\]/gi, '<i>').replace(/\[\/i\]/gi, '</i>');

  text = text.replace(/\[middle\]/gi, '<div class="rags-middle">').replace(/\[\/middle\]/gi, '</div>');

  text = text.replace(/\[c\s+([^\]]+)\]/gi, (_, rawColor) => {
    const color = normalizeColorSpec(rawColor);
    if (!color) return '<span>';
    return `<span style="color:${color}">`;
  });
  text = text.replace(/\[\/c\]/gi, '</span>');

  text = text.replace(/&lt;([\s\S]*?)&gt;/g, (_, inner) => `<span class="rags-thought">&lt;${inner}&gt;</span>`);

  return text;
}
