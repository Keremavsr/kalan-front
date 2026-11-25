/** Saves text as a file through the browser's (or the desktop shell's) download. */
export function saveTextFile(text: string, filename: string, contentType = 'text/plain') {
  const blob = new Blob([text], { type: `${contentType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
