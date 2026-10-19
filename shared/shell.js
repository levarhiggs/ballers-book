/* Baller's Book shell for play pages.
   Include with <script src="../shared/shell.js" defer></script> and mark the body:
     <body data-bb-play="<id from plays.json>" data-bb-title="Short title" [data-bb-lock]>
   Loaded with defer, so it runs after the play's own inline script: it only adds a top bar
   and talks to the play through its existing controls (Sound button/checkbox). */
(function () {
  'use strict';
  const PREFIX = 'ballersBook.';
  const store = {
    get(k, d) { try { const v = localStorage.getItem(PREFIX + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch (e) {} },
  };
  window.BB = { store };

  const body = document.body;
  const playId = body.dataset.bbPlay || '';
  const title = body.dataset.bbTitle || document.title;
  if (playId) store.set('lastPlay', playId);

  const ICON = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    awake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    full: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  };

  // ---------- top bar ----------
  const bar = document.createElement('header');
  bar.className = 'bb-bar';
  bar.innerHTML =
    '<a class="bb-btn bb-back" href="../index.html" aria-label="Back to all plays">' + ICON.back + '<span class="bb-lbl">Plays</span></a>' +
    '<div class="bb-title"></div>' +
    '<div class="bb-actions">' +
    (body.hasAttribute('data-bb-lock') ? '<button type="button" class="bb-btn" id="bbLock" aria-pressed="false">' + ICON.lock + '<span class="bb-lbl">Lock</span></button>' : '') +
    '<button type="button" class="bb-btn" id="bbAwake" aria-pressed="false" hidden>' + ICON.awake + '<span class="bb-lbl">Awake</span></button>' +
    '<button type="button" class="bb-btn" id="bbFull" aria-pressed="false" hidden>' + ICON.full + '<span class="bb-lbl">Full</span></button>' +
    '</div>';
  bar.querySelector('.bb-title').textContent = title;
  body.insertBefore(bar, body.firstChild);

  // ---------- global sound setting, applied through the play's own control ----------
  const soundOn = store.get('sound', true);
  const sndBtn = document.getElementById('bSnd');      // offense plays: toggle button
  const sndBox = document.getElementById('snd');       // Zone Shift Studio: checkbox
  if (sndBtn) {
    // turning sound off through the play's handler makes no noise and needs no audio unlock
    if (!soundOn && sndBtn.getAttribute('aria-pressed') === 'true') sndBtn.click();
    sndBtn.addEventListener('click', () => store.set('sound', sndBtn.getAttribute('aria-pressed') === 'true'));
  } else if (sndBox) {
    sndBox.checked = soundOn;
    sndBox.addEventListener('change', () => store.set('sound', sndBox.checked));
  }

  // ---------- keep screen awake ----------
  const awakeBtn = document.getElementById('bbAwake');
  let wantAwake = store.get('awake', true), lock = null;
  function paintAwake() { awakeBtn.setAttribute('aria-pressed', String(wantAwake)); awakeBtn.title = wantAwake ? (lock ? 'Screen will stay awake' : 'Keep awake (waiting)') : 'Screen may sleep'; }
  async function acquire() {
    if (!wantAwake || lock || document.visibilityState !== 'visible') return;
    try {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; paintAwake(); });
    } catch (e) { lock = null; }
    paintAwake();
  }
  if ('wakeLock' in navigator) {
    awakeBtn.hidden = false;
    paintAwake();
    awakeBtn.addEventListener('click', () => {
      wantAwake = !wantAwake; store.set('awake', wantAwake);
      if (wantAwake) acquire(); else if (lock) { lock.release().catch(() => {}); lock = null; }
      paintAwake();
    });
    document.addEventListener('visibilitychange', acquire);
    // some browsers only grant the lock after a user gesture
    document.addEventListener('pointerdown', acquire, { passive: true });
    acquire();
  }

  // ---------- fullscreen (hidden when unsupported or already standalone) ----------
  const fullBtn = document.getElementById('bbFull');
  const de = document.documentElement;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const canFull = !standalone && (document.fullscreenEnabled || document.webkitFullscreenEnabled);
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  if (canFull) {
    fullBtn.hidden = false;
    fullBtn.addEventListener('click', () => {
      try {
        if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        else (de.requestFullscreen || de.webkitRequestFullscreen).call(de);
      } catch (e) {}
    });
    const sync = () => fullBtn.setAttribute('aria-pressed', String(!!fsEl()));
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
  }

  // ---------- presentation lock (plays that opt in with data-bb-lock) ----------
  const lockBtn = document.getElementById('bbLock');
  if (lockBtn) {
    const key = 'locked.' + playId;
    const setLocked = on => {
      body.classList.toggle('bb-locked', on);
      lockBtn.setAttribute('aria-pressed', String(on));
      lockBtn.querySelector('.bb-lbl').textContent = on ? 'Locked' : 'Lock';
      lockBtn.setAttribute('aria-label', on ? 'Locked for presenting. Tap to unlock editing' : 'Lock editing for presenting');
      store.set(key, on);
    };
    setLocked(store.get(key, false));
    lockBtn.addEventListener('click', () => setLocked(!body.classList.contains('bb-locked')));
  }
})();
