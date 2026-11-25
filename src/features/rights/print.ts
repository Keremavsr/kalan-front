/**
 * Prints only the letter: a hidden frame holds the text in the app's font and asks the system print
 * dialog for it, so the page around it is not printed. Works in the browser and the desktop shell.
 */
export function printText(text: string, title: string) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    return;
  }
  // The page's own ink, read from the token, so no colour is written here.
  const ink = getComputedStyle(document.documentElement).getPropertyValue('--color-ink').trim() || 'black';
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title>` +
      `<style>@page{margin:2.2cm}body{font:12pt/1.55 system-ui,sans-serif;color:${ink};white-space:pre-wrap;margin:0}</style>` +
      `</head><body>${escape(text)}</body></html>`,
  );
  doc.close();
  const cleanup = () => setTimeout(() => frame.remove(), 500);
  win.addEventListener('afterprint', cleanup, { once: true });
  win.focus();
  win.print();
  // Some engines do not fire afterprint; never leave the frame behind.
  setTimeout(() => frame.isConnected && frame.remove(), 60_000);
}
