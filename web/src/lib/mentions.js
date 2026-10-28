const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Staff type readable mentions (@Sam Lee, @Support, #support). Before sending, they become
 * Discord tokens so the right people are pinged. Longest names go first so "@Sam Lee" wins over "@Sam".
 */
export function encodeMentions(text, { picks, roles, channels }) {
  const pairs = [
    ...Object.entries(picks),
    ...roles.map(r => ['@' + r.name, `<@&${r.id}>`]),
    ...channels.filter(c => c.kind !== 'dm').map(c => ['#' + c.name, `<#${c.id}>`])
  ].sort((a, b) => b[0].length - a[0].length);
  let out = text;
  for (const [label, token] of pairs) {
    out = out.replace(new RegExp(escape(label) + '(?![\\w-])', 'g'), token);
  }
  return out;
}
