// Desktop status page: "starting" while the back end boots, an error with Restart and the stderr tail if it stops.
// Runs in the sandboxed renderer; talks to the main process only through window.kalan from the preload.
'use strict';

const TEXT = {
  tr: {
    starting: 'kalan başlatılıyor…',
    stopped: 'kalan arka ucu durdu.',
    restart: 'Yeniden başlat',
    log: 'Son günlük satırları:',
  },
  en: {
    starting: 'Starting kalan…',
    stopped: 'The kalan back end stopped.',
    restart: 'Restart',
    log: 'Last log lines:',
  },
};

const lang = (navigator.language || 'en').toLowerCase().startsWith('tr') ? 'tr' : 'en';
document.documentElement.lang = lang;
for (const el of document.querySelectorAll('[data-text]')) {
  el.textContent = TEXT[lang][el.dataset.text] || el.textContent;
}

const starting = document.getElementById('starting');
const error = document.getElementById('error');
const message = document.getElementById('message');
const stderr = document.getElementById('stderr');
const restart = document.getElementById('restart');

function render(status) {
  if (!status) return;
  const failed = status.state === 'error';
  starting.hidden = failed;
  error.hidden = !failed;
  message.textContent = status.message || '';
  stderr.textContent = (status.stderr || []).join('\n');
  restart.disabled = false;
}

restart.addEventListener('click', () => {
  restart.disabled = true;
  void window.kalan.restartBackend();
});

if (window.kalan && window.kalan.getStatus) {
  window.kalan.onStatus(render);
  void window.kalan.getStatus().then(render);
}
