// Desktop status page: "starting" while the back end boots, an error with Restart and the stderr tail if it stops,
// and the two renderer-crash states (the screen closed once and comes back; it closed again, restart the app).
// Runs in the sandboxed renderer; talks to the main process only through window.kalan from the preload.
'use strict';

const TEXT = {
  tr: {
    starting: 'kalan başlatılıyor…',
    stopped: 'kalan çalışmayı bıraktı',
    explain: 'Ekstrelerin bu bilgisayarda duruyor. Yeniden başlat; yine durursa nedeni aşağıdaki satırlarda.',
    restart: 'Yeniden başlat',
    log: 'Son günlük satırları',
    recoveringTitle: 'Ekran beklenmedik biçimde kapandı',
    recoveringExplain: 'Yeniden açıyorum. Bir kez daha olursa kalan\'ı yeniden başlatmanı isteyeceğim.',
    crashedTitle: 'Ekran yine kapandı',
    crashedExplain: 'Ekstrelerin bu bilgisayarda duruyor. kalan\'ı yeniden başlat; ne olduğunu Ayarlar\'daki hata kaydı söyler.',
    relaunch: 'kalan\'ı yeniden başlat',
  },
  en: {
    starting: 'Starting kalan…',
    stopped: 'kalan stopped working',
    explain: 'Your statements are safe on this computer. Restart it; if it stops again, the lines below say why.',
    restart: 'Restart',
    log: 'Last log lines',
    recoveringTitle: 'The screen closed unexpectedly',
    recoveringExplain: 'Opening it again. If it happens once more, kalan will ask you to restart it.',
    crashedTitle: 'The screen closed again',
    crashedExplain: 'Your statements are safe on this computer. Restart kalan; the error log in Settings says what happened.',
    relaunch: 'Restart kalan',
  },
};

const lang = (navigator.language || 'en').toLowerCase().startsWith('tr') ? 'tr' : 'en';
document.documentElement.lang = lang;
for (const el of document.querySelectorAll('[data-text]')) {
  el.textContent = TEXT[lang][el.dataset.text] || el.textContent;
}

const starting = document.getElementById('starting');
const error = document.getElementById('error');
const recovering = document.getElementById('recovering');
const crashed = document.getElementById('crashed');
const message = document.getElementById('message');
const stderr = document.getElementById('stderr');
const restart = document.getElementById('restart');
const relaunch = document.getElementById('relaunch');

function render(status) {
  if (!status) return;
  const state = status.state;
  starting.hidden = state !== 'starting' && state !== 'ready';
  error.hidden = state !== 'error';
  recovering.hidden = state !== 'recovering';
  crashed.hidden = state !== 'crashed';
  message.textContent = status.message || '';
  stderr.textContent = (status.stderr || []).join('\n');
  restart.disabled = false;
  relaunch.disabled = false;
}

restart.addEventListener('click', () => {
  restart.disabled = true;
  void window.kalan.restartBackend();
});

relaunch.addEventListener('click', () => {
  relaunch.disabled = true;
  void window.kalan.relaunch();
});

if (window.kalan && window.kalan.getStatus) {
  window.kalan.onStatus(render);
  void window.kalan.getStatus().then(render);
}
