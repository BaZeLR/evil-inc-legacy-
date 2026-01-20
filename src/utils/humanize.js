function titleCaseWords(value) {
  const words = String(value ?? '')
    .split(/\s+/)
    .map(word => word.trim())
    .filter(Boolean);

  if (!words.length) return '';

  return words
    .map(word => {
      if (!word) return '';
      if (/^\d+$/.test(word)) return word;
      return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
    })
    .join(' ');
}

export function humanizeId(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const looksLikeSentence = raw.includes(' ') && /[a-z]/i.test(raw);
  if (looksLikeSentence && !raw.includes('_') && !raw.includes('-')) return raw;

  const withoutSuffix = raw.replace(/_lc_\d+$/i, '').replace(/_\d+$/i, '');
  const spaced = withoutSuffix.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!spaced) return raw;

  return titleCaseWords(spaced);
}

