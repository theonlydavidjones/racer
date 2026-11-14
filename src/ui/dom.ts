export const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
/*
 * Writes for things updated every frame: each only when the value changes. A DOM write, even of the value already there,
 * invalidates the page's style, and the next read of a size (a canvas fitted to its box) then lays the page out again.
 */
export const setText = (el: Element, t: string): void => { if (el.textContent !== t) el.textContent = t; };
export const setHtml = (el: Element, h: string): void => { if (el.innerHTML !== h) el.innerHTML = h; };
export const setAttr = (el: Element, k: string, v: string): void => { if (el.getAttribute(k) !== v) el.setAttribute(k, v); };
export const setHidden = (el: HTMLElement, on: boolean): void => { if (el.hidden !== on) el.hidden = on; };
export const setTitle = (el: HTMLElement, t: string): void => { if (el.title !== t) el.title = t; };
