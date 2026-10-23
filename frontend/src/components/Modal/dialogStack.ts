/**
 * The open dialogs, oldest first. Modal, Drawer and ConfirmDialog push a layer when they open and pop
 * it when they close (useDialog), so only the topmost one answers Esc and its scrim. A dialog that
 * closes out of order, under the top one, takes just its own layer with it.
 *
 * A layer also knows where focus goes back when it closes: the element that had focus as it opened,
 * and the open dialog that element was in, if any. When that dialog has closed as well (a confirm
 * that closes the dialog under it as it succeeds, in the same update), focus goes back where that
 * dialog came from instead, and so on down, so it never lands on a button in a dialog that is going.
 */
interface Layer {
  token: symbol;
  /** The element that had focus as the dialog opened. */
  opener: Element | null;
  /** The open dialog the opener was in, if any. */
  parent: Layer | null;
  /** Whether the dialog's sheet holds an element (a dialog opened from inside it). */
  holds: (el: Element) => boolean;
  open: boolean;
}

const stack: Layer[] = [];

export function pushDialog(token: symbol, opener: Element | null = null, holds: (el: Element) => boolean = () => false): void {
  let parent: Layer | null = null;
  for (let i = stack.length - 1; i >= 0 && opener && !parent; i--) {
    if (stack[i].holds(opener)) parent = stack[i];
  }
  stack.push({ token, opener, parent, holds, open: true });
}

/** Takes the dialog off the stack, and says where focus goes back: null when nowhere still on the page. */
export function popDialog(token: symbol): HTMLElement | null {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].token !== token) continue;
    const [layer] = stack.splice(i, 1);
    layer.open = false;
    return returnTarget(layer);
  }
  return null;
}

export function isTopDialog(token: symbol): boolean {
  return stack.length > 0 && stack[stack.length - 1].token === token;
}

function returnTarget(layer: Layer): HTMLElement | null {
  if (layer.parent && !layer.parent.open) return returnTarget(layer.parent);
  const { opener } = layer;
  return opener instanceof HTMLElement && opener.isConnected ? opener : null;
}
