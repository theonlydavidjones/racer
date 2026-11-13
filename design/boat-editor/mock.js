// The boat editor reorganized (ROADMAP 8i): a mock-up injected into the real panel. window.__mockEditor(mode): 'folded' | 'hull' | 'lines'.
window.__mockEditor = (mode) => {
  const el = document.getElementById('boatPanel');
  const css = `
  .mk .fold{border:1px solid var(--rule);border-radius:10px;margin:0 0 8px;background:rgba(255,255,255,.015)}
  .mk .fold>header{display:grid;grid-template-columns:96px 1fr auto;gap:10px;align-items:center;padding:11px 12px;cursor:pointer}
  .mk .fold>header b{font:600 10.5px/1 var(--f-inst);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
  .mk .fold>header span{font:600 13px/1.35 var(--f-inst);letter-spacing:.02em;color:var(--text)}
  .mk .fold>header i{font-style:normal;color:var(--accent);font:600 11.5px/1 var(--f-inst);letter-spacing:.06em}
  .mk .fold.open{border-color:var(--accent)}
  .mk .fold .in{padding:2px 12px 12px;display:flex;flex-direction:column;gap:12px}
  .mk .dot{display:inline-block;width:10px;height:10px;border-radius:50%;vertical-align:-1px;margin:0 4px 0 1px;box-shadow:0 0 0 1px rgba(233,242,245,.35)}
  .mk .ro{font:500 12.5px var(--f-inst);color:var(--muted);padding:0 12px 11px 118px;margin-top:-6px}.mk .ro a{color:var(--accent);text-decoration:none}
  .mk .cfield{display:flex;align-items:center;justify-content:space-between;gap:10px}
  .mk .cfield>span{font:600 11px var(--f-inst);letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
  .mk .cbtn{display:flex;align-items:center;gap:8px;border:1px solid var(--rule);border-radius:8px;padding:5px 9px 5px 5px;background:var(--btn);color:var(--text);font:600 12.5px var(--f-inst)}
  .mk .cbtn.on{border-color:var(--accent)}.mk .cbtn i{width:26px;height:20px;border-radius:5px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.25)}.mk .cbtn em{font-style:normal;color:var(--muted);font-weight:500}
  .mk .picker{border:1px solid var(--rule);border-radius:10px;padding:10px;background:#0b1924;display:flex;flex-direction:column;gap:9px}
  .mk .sv{height:120px;border-radius:7px;position:relative;background:linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl(45,100%,50%))}
  .mk .sv::after{content:'';position:absolute;left:4%;top:5%;width:12px;height:12px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #0006;transform:translate(-50%,-50%)}
  .mk .hue{height:12px;border-radius:6px;position:relative;background:linear-gradient(to right,red,#ff0,lime,cyan,blue,#f0f,red)}
  .mk .hue::after{content:'';position:absolute;left:12.5%;top:-2px;width:6px;height:16px;border-radius:3px;background:#fff;box-shadow:0 0 0 1px #0007}
  .mk .hexrow{display:flex;gap:8px;align-items:center}.mk .hexrow input{width:96px;font:600 13px var(--f-inst);letter-spacing:.06em}.mk .hexrow small{color:var(--muted)}
  .mk .prow{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.mk .prow>b{width:100%;font:600 10px var(--f-inst);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
  .mk .ps{width:22px;height:22px;border-radius:5px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.3),0 0 0 1px rgba(233,242,245,.12)}.mk .ps.on{outline:2px solid var(--accent);outline-offset:1px}
  .mk .ps.add{display:grid;place-items:center;background:transparent;border:1px dashed rgba(233,242,245,.4);color:var(--muted);font:600 14px var(--f-inst)}
  .mk .rope{display:inline-block;vertical-align:middle;border-radius:5px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.25)}
  .mk .lrow{display:flex;justify-content:space-between;align-items:center;gap:8px;font:600 12.5px var(--f-inst)}.mk .lrow em{font-style:normal;color:var(--muted);font-weight:500}
  .mk .lrow.on{color:var(--accent)}
  .mk .ropes{display:grid;grid-template-columns:repeat(2,1fr);gap:6px 10px;border:1px solid var(--rule);border-radius:10px;padding:10px;background:#0b1924}
  .mk .ropes div{display:flex;align-items:center;gap:8px;font:500 12px var(--f-inst);color:var(--text)}.mk .ropes div.on{color:var(--accent)}.mk .ropes div.on .rope{outline:2px solid var(--accent);outline-offset:1px}
  .mk .src{font:500 11px/1.35 var(--f-inst);color:var(--muted)}
  .mk .seg button{font-size:12px}
  .mk .fold>header{grid-template-columns:1fr auto !important}
  .mk .fold>header b{font-size:11.5px !important;color:var(--accent) !important}
  .mk .sum,.mk .in{padding:0 12px 10px;display:flex;flex-direction:column;gap:0}
  .mk .kv{display:grid;grid-template-columns:132px 1fr;align-items:center;min-height:30px;border-top:1px solid rgba(150,196,218,.08)}
  .mk .in .kv{min-height:40px}
  .mk .kv>span:first-child{font:500 12.5px var(--f-inst);color:var(--muted);letter-spacing:.02em}
  .mk .kv>*:last-child{justify-self:end}
  .mk .v{display:inline-flex;align-items:center;gap:7px;font:600 13px var(--f-inst);color:var(--text)}.mk .v.mu{color:var(--muted);font-weight:500}.mk .v a{color:var(--accent);text-decoration:none}
  .mk .sq{width:16px;height:16px;border-radius:4px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.3),0 0 0 1px rgba(233,242,245,.15)}
  .mk .kv .seg{width:210px}.mk .slide input{width:150px}.mk .slide em{font-style:normal;color:var(--muted);font-weight:500;width:34px}
  .mk .num{width:56px}
  .mk .cbtn{min-width:150px}
  .mk .picker,.mk .ropes{margin:2px 0 8px}
  .mk .tile{display:inline-flex;align-items:center;gap:6px}.mk .tile i{width:11px;height:11px;border-radius:50%;border:2.5px solid;box-sizing:border-box;box-shadow:0 0 0 1px rgba(233,242,245,.28)}.mk .tile em{font-style:normal;color:var(--muted)}`;
  // a rope as drawn: its braid (the cover's crossing strands), and the colorway's fleck or tracer
  const rope = (base, kind, mark, w = 46, h = 14) => {
    let s = `<svg class="rope" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${base}"/>`;
    for (let x = -h; x < w; x += 4) s += `<path d="M${x} 0L${x + h} ${h}" stroke="rgba(0,0,0,.13)" stroke-width="1.2"/><path d="M${x + h} 0L${x} ${h}" stroke="rgba(255,255,255,.10)" stroke-width="1"/>`;
    if (kind === 'fleck') { let r = 7; const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280; for (let i = 0; i < w * 0.55; i++) { const x = rnd() * w, y = rnd() * h; s += `<path d="M${x} ${y}l2.2 2.2" stroke="${mark}" stroke-width="1.6" stroke-linecap="round"/>`; } }
    if (kind === 'tracer') for (let x = -h; x < w; x += 12) s += `<path d="M${x} 0L${x + h} ${h}" stroke="${mark}" stroke-width="1.5"/>`;
    s += `<rect width="${w}" height="${h}" fill="url(#rsh)"/></svg>`;
    return s;
  };
  const shade = `<svg width="0" height="0" style="position:absolute"><defs><linearGradient id="rsh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient></defs></svg>`;
  // the colorways, from the makers' ranges (retailers' listings: New England Ropes Sta-Set and Sta-Set X; Samson XLS; Marlow Doublebraid)
  const ROPES = [
    ['White', '#eef0ee', 'solid'], ['Gray', '#9aa1a6', 'solid'], ['Black', '#26282b', 'solid'], ['Navy', '#1f2a4a', 'solid'], ['Blue', '#2f5fb3', 'solid'], ['Red', '#c8312f', 'solid'], ['Green', '#2f7a45', 'solid'],
    ['Red fleck', '#eef0ee', 'fleck', '#c8312f'], ['Blue fleck', '#eef0ee', 'fleck', '#2f5fb3'], ['Green fleck', '#eef0ee', 'fleck', '#2f7a45'], ['Gold fleck', '#eef0ee', 'fleck', '#c99a2e'],
    ['White, red tracers', '#eef0ee', 'tracer', '#c8312f'], ['Navy, beige tracer', '#1f2a4a', 'tracer', '#cdb98f']];
  const R = n => { const r = ROPES.find(x => x[0] === n); return rope(r[1], r[2], r[3]); };
  // one property per row: label left (muted), value or control right, on one grid
  const sw = (c, n) => `<span class="v"><i class="sq" style="background:${c}"></i>${n}</span>`;
  const row = (label, value) => `<div class="kv"><span>${label}</span>${value}</div>`;
  const fold = (label, rows, open = false, inner = '') => `<div class="fold${open ? ' open' : ''}"><header><b>${label}</b><i>${open ? 'Done ▴' : 'Change ▾'}</i></header>${open ? `<div class="in">${inner}</div>` : `<div class="sum">${rows.join('')}</div>`}</div>`;
  const cbtn = (c, n, on = false) => `<button class="cbtn${on ? ' on' : ''}"><i style="background:${c}"></i>${n}</button>`;
  const CLASS = [['Pearl', '#f4f1e8'], ['Snow white', '#f7f7f4'], ['Cream', '#efe6cf'], ['Buff', '#d9c49a'], ['Navy', '#1f2c4f'], ['Flag blue', '#24407a'], ['Hunter green', '#2a4a33'], ['Racing green', '#1f5a3a'], ['Signal red', '#b3302a'], ['Black', '#1c1d20']];
  const picker = `<div class="picker"><div class="sv"></div><div class="hue"></div>
    <div class="hexrow"><input class="pick" value="#F4F1E8" aria-label="Hex"></div>
    <div class="prow"><b>Folkboat colors</b>${CLASS.map(([n, c], i) => `<i class="ps${i === 0 ? ' on' : ''}" style="background:${c}" title="${n}"></i>`).join('')}</div>
    <div class="prow"><b>Your colors</b>${['#8e9f7c', '#24324f', '#a8802f'].map(c => `<i class="ps" style="background:${c}"></i>`).join('')}<i class="ps add" title="Save this color">+</i></div></div>`;
  const seg = (opts, cur) => `<div class="seg">${opts.map(o => `<button type="button" aria-pressed="${o === cur}">${o}</button>`).join('')}</div>`;
  const hullIn = row('Hull', seg(['Fiberglass', 'Wood'], 'Fiberglass')) + row('Topsides', cbtn('#f4f1e8', 'Pearl', true)) + picker
    + row('Boot stripe', cbtn('#24324f', 'Midnight')) + row('Bottom paint', cbtn('#2a2d33', 'Black')) + row('Bottom finish', seg(['As rolled on', 'Burnished'], 'As rolled on'))
    + row('Last cleaned', '<span class="v slide"><input type="range" min="0" max="26" value="2"><em>2 wk</em></span>') + row('Name lettering', cbtn('#1f2c4f', 'Navy'))
    + row('Over the minimum', '<span class="v"><input class="pick num" value="0"> lb</span>');
  const LINES = [['Jib sheets', 'Red fleck'], ['Main halyard', 'White'], ['Jib Cunningham', 'Red'], ['Main Cunningham', 'Blue'], ['Outhaul', 'Blue fleck'], ['Vang', 'Navy'], ['Jib halyard', 'White, red tracers'], ['Mainsheet', 'Blue fleck'], ['Backstay', 'White']];
  const ropeBtn = (r, on) => `<button class="cbtn${on ? ' on' : ''}">${R(r)}${r}</button>`;
  const linesIn = LINES.map(([n, r], i) => row(n, ropeBtn(r, i === 0)) + (i === 0 ? `<div class="ropes">${ROPES.map(x => `<div class="${x[0] === r ? 'on' : ''}">${rope(x[1], x[2], x[3], 40, 13)}${x[0]}</div>`).join('')}</div>` : '')).join('');
  const her = fold('Her', [row('Boat', `<span class="v"><span class="tile"><i style="border-color:#f4f1e8"></i>JOSEPHINE</span></span>`), row('Sail number', '<span class="v">USA 110</span>'), row('Club', '<span class="v">St. Francis YC</span>'), row('Skipper', '<span class="v">You · <a href="#">Yacht Club ›</a></span>')]);
  const hull = fold('Hull', [row('Topsides', sw('#f4f1e8', 'Pearl')), row('Boot stripe', sw('#24324f', 'Midnight')), row('Bottom', sw('#2a2d33', 'Black')), row('Last cleaned', '<span class="v">2 weeks ago</span>')], mode === 'hull', hullIn);
  const deck = fold('Deck and cabin', [row('Deck', sw('#8e9f7c', 'Sage non-skid')), row('Forehatch', '<span class="v">Teak</span>'), row('Outboard', '<span class="v">Ashore</span>')]);
  const rig = fold('Rig', [row('Mast and boom', '<span class="v">Aluminum</span>'), row('Rig tune', '<span class="v">As measured</span>')]);
  const sails = fold('Sails', [row('Sailcloth', '<span class="v">White Dacron</span>'), row('Main · jib', '<span class="v">Midlife</span>'), row('Numbers and F', sw('#1f2c4f', 'Navy'))]);
  const lines = fold('Lines', [row('Jib sheets', `<span class="v">${R('Red fleck')}</span>`), row('Mainsheet', `<span class="v">${R('Blue fleck')}</span>`), row('Halyards', `<span class="v">${R('White')}</span>`), row('6 more', '<span class="v mu">Change to see</span>')], mode === 'lines', linesIn);
  const berth = fold('Home berth', [row('Marina', '<span class="v">West Harbor</span>'), row('Slip', '<span class="v">B dock, slip 12</span>')]);
  el.innerHTML = `<style>${css}</style>${shade}<div class="bphead"><h2>Edit JOSEPHINE</h2><button type="button" class="ghost sm">Turn her</button><button type="button" class="cta">Done</button></div>
    <div class="bpbody mk">${her}${hull}${deck}${rig}${sails}${lines}${berth}</div>`;
  if (mode !== 'folded') { const o = el.querySelector('.fold.open'), body = el.querySelector('.bpbody'); body.scrollTop += o.getBoundingClientRect().top - body.getBoundingClientRect().top - 8; }
};
