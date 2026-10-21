/**
 * The open dialogs, oldest first. Modal, Drawer and ConfirmDialog push a token when they open and
 * pop it when they close (useDialog), so only the topmost one answers Esc and its scrim. A dialog
 * that closes out of order, under the top one, takes just its own token with it.
 */
const stack: symbol[] = [];

export function pushDialog(token: symbol): void {
  stack.push(token);
}

export function popDialog(token: symbol): void {
  const at = stack.lastIndexOf(token);
  if (at !== -1) stack.splice(at, 1);
}

export function isTopDialog(token: symbol): boolean {
  return stack.length > 0 && stack[stack.length - 1] === token;
}
