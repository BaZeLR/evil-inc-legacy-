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

function parseArrayToken(token) {
  const raw = String(token ?? '').trim();
  if (!raw) return { base: '', indexes: [] };
  const base = raw.split('(')[0].trim();
  const indexes = [];
  const matches = raw.matchAll(/\(([^)]+)\)/g);
  for (const match of matches) {
    const value = String(match[1] ?? '').trim();
    if (!value) continue;
    const num = Number(value);
    indexes.push(Number.isFinite(num) ? num : value);
  }
  return { base, indexes };
}

function resolveArrayIndex(value, indexes) {
  let current = value;
  for (const index of indexes) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      current = current[index];
      continue;
    }
    if (typeof current === 'object') {
      current = current[index];
      continue;
    }
    return undefined;
  }
  return current;
}

function resolveLegacyToken(type, rawToken, context) {
  const { base, indexes } = parseArrayToken(rawToken);
  if (!base) return '';
  let ref = base;
  const tokenType = String(type ?? '').trim().toLowerCase();
  if (tokenType === 'rp') ref = `room.${base}`;
  if (tokenType === 'ip') ref = `object.${base}`;
  if (tokenType === 'pp') ref = `player.${base}`;
  if (tokenType === 'cp') ref = `character.${base}`;
  if (tokenType === 'vp') ref = `vars.${base}`;
  if (tokenType === 'tp') ref = `timer.${base}`;
  const resolved = resolveValue(ref, context);
  if (indexes.length) return resolveArrayIndex(resolved, indexes);
  return resolved;
}

function interpolateLegacyTokens(text, context) {
  if (typeof text !== 'string' || !text.includes('[')) return text;
  return text.replace(/\[(V|RP|IP|PP|CP|VP|TP):\s*([^\]]+)\]/gi, (match, rawType, rawToken) => {
    const resolved = resolveLegacyToken(rawType, rawToken, context);
    if (resolved === null || resolved === undefined) return '';
    return String(resolved);
  });
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

  text = interpolateLegacyTokens(text, context);
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
