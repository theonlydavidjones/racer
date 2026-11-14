// Mock-up for the owner (not built): "Yours or the crew's" shown coherently in the sail band. The owner: "there's
// confusion between active and auto state on sail controls. if i'm manually controlling a line, it turns yellow. but
// there's no state change for the auto trim tab. let's get that cleaned up and coherent. not sure the exact solution."
// Today: a line you take turns amber (its name and a ring on its rope); the tab reads Auto-Trim or Hand Back. Three
// options for one language, drawn over the real band with two lines taken (the starboard vang and the jib sheet).
window.__mock = (() => {
  const css = document.createElement('style');
  css.textContent = `
    .mk-tab{display:inline-flex;align-items:center;gap:6px;height:22px;box-sizing:border-box;padding:0 9px;font:700 10px/1 var(--f-inst);letter-spacing:.08em;text-transform:uppercase;border-radius:6px 6px 0 0;border:1px solid var(--rule);border-bottom:0;background:var(--pod-solid);color:var(--text)}
    .mk-tab.mine{color:#13202b;background:var(--accent);border-color:var(--accent)}
    .mk-tab .dots{display:inline-flex;gap:2px}.mk-tab .dots i{width:5px;height:5px;border-radius:50%;background:#5f7a8c}.mk-tab .dots i.y{background:#13202b}
    .mk-split{display:inline-flex;height:22px;border-radius:6px 6px 0 0;overflow:hidden;border:1px solid var(--rule);border-bottom:0}
    .mk-split span{display:flex;align-items:center;gap:5px;padding:0 9px;font:700 10px/1 var(--f-inst);letter-spacing:.08em;text-transform:uppercase;background:var(--pod-solid);color:var(--muted)}
    .mk-split span.you{background:var(--accent);color:#13202b}
    .mk-split span b{font-size:12px}
    .mk-badge{position:absolute;top:-2px;right:-4px;width:12px;height:12px;border-radius:50%;display:grid;place-items:center;font:800 8px/1 var(--f-inst)}
    .mk-badge.crew{background:#2e4a5e;color:#cfe}
    .mk-badge.you{background:var(--accent);color:#13202b}
    .sb-v,.sb-h,.sb-jc{position:relative}
  `;
  document.head.appendChild(css);
  const real = () => document.querySelector('.sb-all');
  const put = html => { document.querySelector('.mk-opt')?.remove(); const t = real(); t.style.display = 'none'; const s = document.createElement('span'); s.className = 'mk-opt'; s.innerHTML = html; t.after(s); };
  const lines = () => [...document.querySelectorAll('.sb-v[data-line], .sb-h[data-line], .sb-trk[data-line], .sb-jc[data-line]')].filter(e => e.offsetParent);
  // a line, not an end: the vang, the outhaul, the backstay are each one line led to both sides; the jib sheets and cars are a pair
  const key = e => ['jib', 'car'].includes(e.dataset.line) ? e.dataset.line + e.dataset.side : e.dataset.line;
  const uniq = es => [...new Set(es.map(key))];
  const all = () => uniq(lines()), mine = () => uniq(lines().filter(e => e.classList.contains('mine')));
  return {
    /** A: the tab counts: "Crew trims all" (plain) or "2 yours · Hand back" (amber, filled, a dot per line). */
    a() { const n = mine().length, tot = all().length;
      put(n ? `<span class="mk-tab mine">${n} yours · Hand back <span class="dots">${Array.from({ length: tot }, (_, i) => `<i class="${i < n ? 'y' : ''}"></i>`).join('')}</span></span>` : `<span class="mk-tab">Crew trims all</span>`); },
    /** B: the tab split: Crew | You, each with its count; tapping You hands your lines back. */
    b() { const n = mine().length, tot = all().length; put(`<span class="mk-split"><span>Crew <b>${tot - n}</b></span><span class="${n ? 'you' : ''}">You <b>${n}</b></span></span>`); },
    /** C: every line marked: a small crew mark (C) on the crew's, an amber hand (Y) on yours; the tab says the count. */
    c() { document.querySelectorAll('.mk-badge').forEach(e => e.remove());
      for (const e of lines()) { const b = document.createElement('i'); const y = e.classList.contains('mine'); b.className = 'mk-badge ' + (y ? 'you' : 'crew'); b.textContent = y ? 'Y' : 'C'; e.appendChild(b); }
      this.a(); },
    clear() { document.querySelectorAll('.mk-badge,.mk-opt').forEach(e => e.remove()); if (real()) real().style.display = ''; }
  };
})();
