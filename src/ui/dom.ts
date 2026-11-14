export const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

/** Writes made only when they change: setting `hidden`, text or an attribute to what it already is still counts as a
 * change to the page, and the browser restyles it; done every frame, that's part of the stutter (ROADMAP 8x). */
export const hide = (el: HTMLElement, v: boolean): void => { if (el.hidden !== v) el.hidden = v; };
export const put = (el: Element, t: string): void => { if (el.textContent !== t) el.textContent = t; };
export const attr = (el: Element, k: string, v: string): void => { if (el.getAttribute(k) !== v) el.setAttribute(k, v); };
export const title = (el: HTMLElement, t: string): void => { if (el.title !== t) el.title = t; };
