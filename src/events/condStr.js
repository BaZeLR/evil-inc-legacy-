import { compareOp } from '../utils/compare.js';
import { coerceLiteral, resolveValue } from './valueResolver.js';

function parseConditionToken(tokenRaw) {
  const token = String(tokenRaw ?? '').trim();
  if (!token) return null;
  const match = token.match(/^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
  if (!match) return { kind: 'truthy', ref: token };
  return { kind: 'cmp', left: match[1].trim(), op: match[2].trim(), right: match[3].trim() };
}

export function evaluateCondStr(condStr, ctx) {
  const raw = String(condStr ?? '').trim();
  if (!raw) return true;

  const tokens = raw
    .split(/\s+(&&|\|\|)\s+/)
    .map(part => String(part ?? '').trim())
    .filter(Boolean);
  if (!tokens.length) return true;

  let result = null;
  let join = null;

  const evalAtom = atomRaw => {
    const node = parseConditionToken(atomRaw);
    if (!node) return true;
    if (node.kind === 'truthy') return Boolean(resolveValue(node.ref, ctx));

    const actual = resolveValue(node.left, ctx);
    const expected = coerceLiteral(String(node.right ?? '').replace(/^['"]|['"]$/g, ''));
    return compareOp(actual, node.op, expected, { caseInsensitive: true, coerceNumbers: true, trimStrings: true });
  };

  for (const token of tokens) {
    if (token === '&&' || token === '||') {
      join = token;
      continue;
    }
    const value = evalAtom(token);
    if (result === null) {
      result = value;
      continue;
    }
    if (join === '||') result = Boolean(result) || Boolean(value);
    else result = Boolean(result) && Boolean(value);
    join = null;
  }

  return Boolean(result);
}

