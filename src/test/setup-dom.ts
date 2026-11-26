import '@testing-library/jest-dom/vitest';
import { AUTO_RUN_KEY, localDay } from '../features/ai/autoStart';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import i18n from '../i18n';

// jsdom has no <dialog> modal support; give it the minimum the Modal needs.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
}
if (!('scrollIntoView' in Element.prototype)) {
  Object.defineProperty(Element.prototype, 'scrollIntoView', { value: () => undefined });
}

// The first-run tour opens by itself on a fresh profile; screen tests start as a returning user.
// Tour tests remove the flag first.
// Likewise the automatic AI run counts as done for today, so a chosen tool does not start a batch by itself;
// the auto-start tests remove the flag.
beforeEach(() => {
  localStorage.setItem('kalan.tourSeen', '1');
  localStorage.setItem(AUTO_RUN_KEY, localDay(new Date()));
});

afterEach(async () => {
  cleanup();
  localStorage.clear();
  await i18n.changeLanguage('tr');
});
