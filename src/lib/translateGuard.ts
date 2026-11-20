/**
 * Browsers that translate a page (Chrome's Translate, Edge's, extensions)
 * swap its text for their own. React still holds the text it put there, and
 * when it later removes that text, or puts something just before it, the
 * browser throws "not a child of this node" and the board goes blank. That
 * blanked a tester's board on 2026-11-20 (Ukrainian Chrome, English board).
 *
 * The guard makes those two calls forgiving. Removing something that has
 * moved removes it from where it is now, or does nothing if it's gone.
 * Putting something before a piece that has moved puts it before whatever
 * stands in that piece's place, or at the end. A wrong word for a moment
 * beats a blank board. Each time it steps in is counted for the report.
 */

let stepped = 0;

/** How often the guard has stepped around a translated page since the page loaded. */
export function translateGuardHits(): number {
  return stepped;
}

/** The child of `parent` that holds `node` now, if any: a translator may wrap text in its own elements. */
function standIn(parent: Node, node: Node): Node | null {
  let at: Node | null = node;
  while (at && at.parentNode !== parent) at = at.parentNode;
  return at;
}

let installed = false;

/** Install once, before React draws. */
export function installTranslateGuard(): void {
  if (installed || typeof Node !== 'function' || !Node.prototype) return;
  installed = true;
  const proto = Node.prototype;
  const removeChild = proto.removeChild;
  const insertBefore = proto.insertBefore;

  proto.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode === this) return removeChild.call(this, child) as T;
    stepped++;
    if (child.parentNode) return removeChild.call(child.parentNode, child) as T;
    return child;
  };

  proto.insertBefore = function <T extends Node>(this: Node, node: T, ref: Node | null): T {
    if (!ref || ref.parentNode === this) return insertBefore.call(this, node, ref) as T;
    stepped++;
    return insertBefore.call(this, node, standIn(this, ref)) as T;
  };
}

/**
 * Whether the browser is translating the page, and to what: Chrome marks
 * the page and sets its language, Edge marks the text it translated. The
 * page says it's English, so any other language means a translation.
 * Null when it isn't translated, as far as the page can tell.
 */
export function pageTranslation(doc: Document | undefined = typeof document === 'undefined' ? undefined : document): string | null {
  if (!doc?.documentElement) return null;
  const html = doc.documentElement;
  const lang = (html.getAttribute('lang') ?? '').trim();
  const foreign = lang && !/^en\b/i.test(lang) ? lang : '';
  const chrome = html.classList.contains('translated-ltr') || html.classList.contains('translated-rtl');
  let edge = false;
  try {
    edge = !!doc.querySelector('[_msttexthash]');
  } catch {
    edge = false;
  }
  if (foreign) return foreign;
  return chrome || edge ? 'another language' : null;
}
