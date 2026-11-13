/**
 * Redraw a panel from new HTML by changing the page in place: the same elements kept, only what differs changed (an
 * attribute, a word, a value). A panel redrawn wholesale (innerHTML) replaces the button under the pointer, so its
 * hover drops and a new choice snaps on with no easing; changed in place, a choice eases over like every other on the
 * page (the owner: the Yacht Club's buttons should react as the setup's do). Where the shape differs (another element
 * in a place), that part is replaced as before.
 *
 * Listeners must be on the panel itself (delegated), as they are in the Yacht Club and the boat editor: an element kept
 * keeps whatever was attached to it, and one replaced loses it.
 */
export function morph(el: Element, html: string): void {
  const next = document.createElement(el.tagName); next.innerHTML = html;
  children(el, next);
}

function children(a: Node, b: Node): void {
  const an = [...a.childNodes], bn = [...b.childNodes];
  for (let i = 0; i < bn.length; i++) {
    if (i >= an.length) { a.appendChild(bn[i]); continue; }
    node(an[i], bn[i]);
  }
  for (let i = bn.length; i < an.length; i++) a.removeChild(an[i]);
}

function node(a: Node, b: Node): void {
  if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName
    || (a instanceof HTMLInputElement && b instanceof HTMLInputElement && a.type !== b.type)) { a.parentNode!.replaceChild(b, a); return; }
  if (a.nodeType === Node.TEXT_NODE || a.nodeType === Node.COMMENT_NODE) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
  if (!(a instanceof Element) || !(b instanceof Element)) return;
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name);
  for (const { name, value } of [...b.attributes]) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  // (a canvas keeps its picture: its owner draws it again after the redraw if it needs to)
  if (!(a instanceof HTMLCanvasElement)) children(a, b);
  // form controls: their live state is a property, not the attribute (except the one you're typing in)
  if (a === document.activeElement && (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement)) return;
  if (a instanceof HTMLInputElement && b instanceof HTMLInputElement) {
    if (a.type === 'checkbox' || a.type === 'radio') a.checked = b.checked; else if (a.value !== b.value) a.value = b.value;
  } else if (a instanceof HTMLSelectElement && b instanceof HTMLSelectElement) { if (a.value !== b.value) a.value = b.value; }
  else if (a instanceof HTMLTextAreaElement && b instanceof HTMLTextAreaElement) { if (a.value !== b.value) a.value = b.value; }
}
