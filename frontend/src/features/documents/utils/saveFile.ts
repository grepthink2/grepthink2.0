/** Hands the browser a text to save as a file named `filename`, as a download link would. */
export function saveFile(text: string, filename: string, type = 'text/markdown;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // After the click has been handled: revoking first would cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
