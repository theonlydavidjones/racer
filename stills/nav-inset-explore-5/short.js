// The nav strip's "To" name (the owner, 20 Nov 2026): brief, never truncated. Her slip: Home. A place: its bare name
// (no "Off", no "(south side)", nothing after a comma, no light or buoy designation). Racing, the mark by its code.
function shortName(name, race, slip) {
  if (slip) return 'Home';
  if (race && name.includes(' · ')) return name.split(' · ')[0];
  let n = name.includes(' · ') ? name.split(' · ')[1] : name;
  n = n.replace(/\s*\(.*?\)/g, '').replace(/^(Off|Under|North of|South of|East of|West of)\s+/i, '').replace(/^the\s+/i, '').replace(/,.*$/, '').replace(/\s+light\b.*$/i, '')
    .replace(/\s+[RG]\s+"[^"]*".*$/, '').replace(/\s+"[^"]*".*$/, '').replace(/\s+(start mark|outer buoy|mid-channel)$/i, '').trim();
  return n;
}
if (typeof module !== 'undefined') module.exports = shortName;
