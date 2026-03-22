/* ═══════════════════════════════════════════════════════════════
   RalliVell — app.js
   Host controls everything (play/pause/seek) for YouTube & MP4.
   Guests are read-only — they follow the host.
═══════════════════════════════════════════════════════════════ */

'use strict';

// ─── Socket ──────────────────────────────────────────────────────
const socket = io();

// ─── State ───────────────────────────────────────────────────────
let myName   = '';
let myRoomId = null;
let isHost   = false;
let currentUrl = '';
let videoType  = null;   // 'youtube' | 'mp4' | null
let videoEl    = null;   // <video> element for MP4
let ytPlayer   = null;   // YouTube IFrame Player instance
let unreadChat = 0;

// ─── YouTube IFrame API ──────────────────────────────────────────
let ytApiReady     = false;
let ytPendingCreate = null;  // queued create() call until API loads

(function loadYTApi() {
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
})();

window.onYouTubeIframeAPIReady = function () {
  ytApiReady = true;
  if (ytPendingCreate) { ytPendingCreate(); ytPendingCreate = null; }
};

// ─── DOM refs ─────────────────────────────────────────────────────
const pageHome = document.getElementById('page-home');
const pageRoom = document.getElementById('page-room');

const homeVideoUrl    = document.getElementById('home-video-url');
const btnWatchNow     = document.getElementById('btn-watch-now');
const soloPlayerWrap  = document.getElementById('solo-player-wrap');
const soloPlayer      = document.getElementById('solo-player');
const soloVideoTitle  = document.getElementById('solo-video-title');
const btnSoloClose    = document.getElementById('btn-solo-close');
const featureCards    = document.getElementById('feature-cards');
const btnOpenCreate   = document.getElementById('btn-open-create');
const btnOpenJoin     = document.getElementById('btn-open-join');
const btnHeroCreate   = document.getElementById('btn-hero-create');
const btnHeroJoin     = document.getElementById('btn-hero-join');

const modalCreate      = document.getElementById('modal-create');
const createName       = document.getElementById('create-name');
const createVideoUrl   = document.getElementById('create-video-url');
const btnCreateConfirm = document.getElementById('btn-create-confirm');
const btnCreateCancel  = document.getElementById('btn-create-cancel');
const createError      = document.getElementById('create-error');

const modalJoin      = document.getElementById('modal-join');
const joinName       = document.getElementById('join-name');
const joinCode       = document.getElementById('join-code');
const btnJoinConfirm = document.getElementById('btn-join-confirm');
const btnJoinCancel  = document.getElementById('btn-join-cancel');
const joinError      = document.getElementById('join-error');

const displayRoomCode  = document.getElementById('display-room-code');
const displayRoomCodeM = document.getElementById('display-room-code-m'); // Mobile
const btnCopyCode      = document.getElementById('btn-copy-code');
const btnCopyInvite    = document.getElementById('btn-copy-invite');
const btnCopyInviteM   = document.getElementById('btn-copy-invite-m'); // Mobile
const btnLeave         = document.getElementById('btn-leave-room');
const btnLeaveM        = document.getElementById('btn-leave-room-m'); // Mobile
const roomUrlBar       = document.getElementById('room-url-bar');
const roomVideoUrl     = document.getElementById('room-video-url');
const btnRoomSetVideo  = document.getElementById('btn-room-set-video');
const guestNote        = document.getElementById('guest-note');
const roomPlayer       = document.getElementById('room-player');
const membersList      = document.getElementById('members-list');
const chatMessages     = document.getElementById('chat-messages');
const chatInput        = document.getElementById('chat-input');
const btnChatSend      = document.getElementById('btn-chat-send');
const roomControls     = document.getElementById('room-controls');
const ctrlPlay         = document.getElementById('ctrl-play');
const ctrlProgress     = document.getElementById('ctrl-progress');
const ctrlTimeCur      = document.getElementById('ctrl-time-cur');
const ctrlTimeDur      = document.getElementById('ctrl-time-dur');
const ctrlVolume       = document.getElementById('ctrl-volume');
const ctrlVolIcon      = document.getElementById('ctrl-vol-icon');
const viewerNum        = document.getElementById('viewer-num');
const chatBadge        = document.getElementById('chat-badge');

// ═══════════════════════════════════════════════════════════════
//   PARTICLES BACKGROUND
// ═══════════════════════════════════════════════════════════════

(function initParticles() {
  const container = document.getElementById('particles');
  const colors = ['#f0569a', '#9b5de5', '#c77dff', '#f5a3d0', '#7c3aed'];
  function spawn() {
    const el = document.createElement('div');
    el.className = 'particle';
    const size = 3 + Math.random() * 6;
    const dur  = 12 + Math.random() * 16;
    const delay = Math.random() * 8;
    el.style.cssText = `width:${size}px;height:${size}px;left:${Math.random()*100}%;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      animation-duration:${dur}s;animation-delay:${delay}s;opacity:0;`;
    container.appendChild(el);
    setTimeout(() => el.remove(), (dur + delay) * 1000);
  }
  for (let i = 0; i < 30; i++) spawn();
  setInterval(spawn, 700);
})();

// ═══════════════════════════════════════════════════════════════
//   UTILITIES
// ═══════════════════════════════════════════════════════════════

function showPage(name) {
  pageHome.classList.toggle('active', name === 'home');
  pageRoom.classList.toggle('active', name === 'room');
  document.title = name === 'room'
    ? `RalliVell — Комната ${myRoomId}`
    : 'RalliVell — Watch Together';
}

let toastTimer;
function showToast(msg, duration = 2800) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), duration);
}

function openModal(modal) {
  modal.classList.remove('hidden');
  const m = modal.querySelector('.modal');
  if (m) { m.style.animation = 'none'; requestAnimationFrame(() => { m.style.animation = ''; }); }
}
function closeModal(modal) { modal.classList.add('hidden'); }

function formatTime(s) {
  s = Math.floor(s || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${m}:${String(sec).padStart(2,'0')}`;
}

function avatarLetter(name) { return (name || '?')[0].toUpperCase(); }

function avatarColor(name) {
  const gradients = [
    'linear-gradient(135deg,#f0569a,#9b5de5)',
    'linear-gradient(135deg,#9b5de5,#06b6d4)',
    'linear-gradient(135deg,#10b981,#3b82f6)',
    'linear-gradient(135deg,#f59e0b,#ef4444)',
    'linear-gradient(135deg,#8b5cf6,#ec4899)',
    'linear-gradient(135deg,#14b8a6,#8b5cf6)',
    'linear-gradient(135deg,#f97316,#f0569a)',
    'linear-gradient(135deg,#06b6d4,#10b981)',
  ];
  let hash = 0;
  for (const c of (name || '')) hash = (hash * 31 + c.charCodeAt(0)) & 0xfffff;
  return gradients[hash % gradients.length];
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ═══════════════════════════════════════════════════════════════
//   INVITE LINK (URL param auto-fill)
// ═══════════════════════════════════════════════════════════════

function getInviteCodeFromURL() {
  const p = new URLSearchParams(window.location.search);
  return p.get('room') || p.get('code') || null;
}

(function checkInviteOnLoad() {
  const code = getInviteCodeFromURL();
  if (!code) return;
  window.history.replaceState({}, '', window.location.pathname);
  joinError.classList.add('hidden');
  joinName.value = '';
  joinCode.value  = code.toUpperCase();
  openModal(modalJoin);
  joinName.focus();
  showToast(`🔗 Код комнаты ${code.toUpperCase()} — введи своё имя!`);
})();

// ═══════════════════════════════════════════════════════════════
//   VIDEO DETECTION
// ═══════════════════════════════════════════════════════════════

function getYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('?')[0];
    if (u.hostname.includes('youtube.com')) {
      return u.searchParams.get('v') ||
        (u.pathname.startsWith('/shorts/') ? u.pathname.split('/')[2] : null) ||
        (u.pathname.startsWith('/embed/')  ? u.pathname.split('/')[2] : null);
    }
  } catch {}
  return null;
}

// Extract VK owner ID and video ID from various vk.com/video URLs
function getVKVideoInfo(url) {
  try {
    // Matches: video-12345_67890 or video12345_67890 (anywhere in URL/hash/path)
    const match = url.match(/video(-?\d+)_(\d+)/);
    if (match) return { oid: match[1], id: match[2] };
  } catch {}
  return null;
}

function detectVideoType(url) {
  if (!url) return null;
  if (getYouTubeId(url)) return 'youtube';
  if (getVKVideoInfo(url)) return 'vk';
  if (/\.(mp4|webm|ogg|mov)(\?|$)/i.test(url)) return 'mp4';
  return null;
}

// ═══════════════════════════════════════════════════════════════
//   PLAYER LIFECYCLE
// ═══════════════════════════════════════════════════════════════

function destroyCurrentPlayer() {
  // Clear YT progress interval
  if (window._ytInterval) { clearInterval(window._ytInterval); window._ytInterval = null; }
  // Destroy YT player
  if (ytPlayer) { try { ytPlayer.destroy(); } catch(e) {} ytPlayer = null; }
  // Clear MP4
  videoEl  = null;
  videoType = null;
  roomControls.classList.add('hidden');
}

// ── Build embed (entrance point) ──────────────────────────────────
function buildEmbed(url, container, { autoplay = false, isRoom = false } = {}) {
  destroyCurrentPlayer();
  container.innerHTML = '';
  videoType = detectVideoType(url);

  if (!videoType) {
    container.innerHTML = `
      <div class="player-placeholder">
        <div class="placeholder-anim">⚠️</div>
        <p>Неподдерживаемая ссылка.<br>Поддерживаются YouTube, VK и прямые MP4-файлы.</p>
      </div>`;
    return;
  }

  if (videoType === 'youtube') {
    if (isRoom) {
      buildYTRoom(getYouTubeId(url), container, autoplay);
    } else {
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube.com/embed/${getYouTubeId(url)}?autoplay=${autoplay?1:0}&rel=0&modestbranding=1`;
      iframe.allow = 'autoplay; encrypted-media; fullscreen';
      iframe.allowFullscreen = true;
      container.appendChild(iframe);
    }
  } else if (videoType === 'vk') {
    buildVKEmbed(getVKVideoInfo(url), container, { autoplay, isRoom });
  } else {
    buildMP4(url, container, { autoplay, isRoom });
  }
}

// ── VK embed ──────────────────────────────────────────────────────
// VK has no public JS API, so we embed via iframe.
// Host controls playback on their side; guests receive socket events.
function buildVKEmbed(vkInfo, container, { autoplay, isRoom }) {
  const iframe = document.createElement('iframe');
  const params = new URLSearchParams({
    oid:      vkInfo.oid,
    id:       vkInfo.id,
    autoplay: autoplay ? '1' : '0',
    hd:       '2',
  });
  iframe.src = `https://vk.com/video_ext.php?${params}`;
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
  iframe.allow = 'autoplay; encrypted-media; fullscreen';
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = 'strict-origin';
  container.appendChild(iframe);

  // VK doesn't expose a JS API, so we can't hook play/pause events.
  // Controls are always visible so guests can change quality/volume freely.
  // Sync still works via socket: host emits events, guests reload iframe at correct position.
  if (isRoom) {
    if (isHost) roomControls.classList.remove('hidden');
    else        setTimeout(() => socket.emit('request-sync', { roomId: myRoomId }), 800);
  }
}

// ── YouTube room embed (IFrame API) ───────────────────────────────
function buildYTRoom(ytId, container, autoplay) {
  const wrapper = document.createElement('div');
  wrapper.id = 'yt-player-el';
  wrapper.style.cssText = 'width:100%;height:100%;';
  container.appendChild(wrapper);

  function create() {
    ytPlayer = new YT.Player('yt-player-el', {
      videoId: ytId,
      height: '100%',
      width: '100%',
      playerVars: {
        autoplay:       autoplay ? 1 : 0,
        rel:            0,
        modestbranding: 1,
        controls:       1, // Включаем родные контролы всем, чтобы гости могли менять качество (шестерёнка)
        disablekb:      isHost ? 0 : 1,
        fs:             1,
      },
      events: {
        onReady: () => {
          if (isHost) {
            roomControls.classList.remove('hidden');
            startYTProgressTracker();
          } else {
            // Ask host for current state
            setTimeout(() => socket.emit('request-sync', { roomId: myRoomId }), 800);
          }
        },
        onStateChange: (e) => {
          // Only host events get broadcast
          if (!isHost) return;
          if (e.data === YT.PlayerState.PLAYING) {
            socket.emit('video-play', { roomId: myRoomId, currentTime: ytPlayer.getCurrentTime() });
            ctrlPlay.textContent = '⏸';
          } else if (e.data === YT.PlayerState.PAUSED) {
            socket.emit('video-pause', { roomId: myRoomId, currentTime: ytPlayer.getCurrentTime() });
            ctrlPlay.textContent = '▶';
          }
        }
      }
    });
  }

  if (ytApiReady) create();
  else ytPendingCreate = create;
}

// Track YT progress for host custom controls
function startYTProgressTracker() {
  if (window._ytInterval) clearInterval(window._ytInterval);
  window._ytInterval = setInterval(() => {
    if (!ytPlayer || typeof ytPlayer.getCurrentTime !== 'function') return;
    const cur = ytPlayer.getCurrentTime();
    const dur = ytPlayer.getDuration() || 0;
    if (!dur) return;
    ctrlProgress.max   = dur;
    ctrlProgress.value = cur;
    ctrlTimeCur.textContent = formatTime(cur);
    ctrlTimeDur.textContent = formatTime(dur);
    const pct = (cur / dur) * 100;
    ctrlProgress.style.background =
      `linear-gradient(to right, var(--brand-c) ${pct}%, var(--border2) ${pct}%)`;
    const state = ytPlayer.getPlayerState();
    ctrlPlay.textContent = state === YT.PlayerState.PLAYING ? '⏸' : '▶';
  }, 500);
}

// ── MP4 room embed ────────────────────────────────────────────────
function buildMP4(url, container, { autoplay, isRoom }) {
  const video = document.createElement('video');
  video.src      = url;
  video.controls = true; // Родные контролы включены у всех (для полноэкранного режима и звука)
  video.autoplay = autoplay;
  video.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000;';
  container.appendChild(video);
  videoEl = video;

  if (isRoom) {
    if (isHost) {
      roomControls.classList.remove('hidden');
      setupMP4Events(video);
    } else {
      roomControls.classList.add('hidden');
      setTimeout(() => socket.emit('request-sync', { roomId: myRoomId }), 800);
    }
  }
}

function setupMP4Events(video) {
  video.addEventListener('timeupdate', () => {
    if (isNaN(video.duration)) return;
    ctrlProgress.max   = video.duration;
    ctrlProgress.value = video.currentTime;
    ctrlTimeCur.textContent = formatTime(video.currentTime);
    ctrlTimeDur.textContent = formatTime(video.duration);
    const pct = (video.currentTime / video.duration) * 100;
    ctrlProgress.style.background =
      `linear-gradient(to right, var(--brand-c) ${pct}%, var(--border2) ${pct}%)`;
  });
  video.addEventListener('play',  () => { ctrlPlay.textContent = '⏸'; });
  video.addEventListener('pause', () => { ctrlPlay.textContent = '▶'; });
  video.addEventListener('volumechange', () => {
    ctrlVolIcon.textContent = video.muted || video.volume === 0 ? '🔇'
                            : video.volume < 0.5 ? '🔉' : '🔊';
  });
  ctrlVolume.addEventListener('input', () => {
    video.volume = ctrlVolume.value;
    video.muted  = parseFloat(ctrlVolume.value) === 0;
  });
}

// ── Unified control helpers ───────────────────────────────────────
function hostCurrentTime() {
  if (videoType === 'youtube' && ytPlayer?.getCurrentTime) return ytPlayer.getCurrentTime();
  if (videoEl) return videoEl.currentTime;
  return 0;
}

function guestSeekTo(t) {
  if (videoType === 'youtube' && ytPlayer?.seekTo) ytPlayer.seekTo(t, true);
  else if (videoEl) videoEl.currentTime = t;
}

function guestPlay(t) {
  guestSeekTo(t);
  if (videoType === 'youtube' && ytPlayer?.playVideo) ytPlayer.playVideo();
  else if (videoEl) videoEl.play().catch(() => {});
}

function guestPause(t) {
  guestSeekTo(t);
  if (videoType === 'youtube' && ytPlayer?.pauseVideo) ytPlayer.pauseVideo();
  else if (videoEl) videoEl.pause();
}

// ═══════════════════════════════════════════════════════════════
//   CUSTOM CONTROLS (host only)
// ═══════════════════════════════════════════════════════════════

ctrlPlay.addEventListener('click', () => {
  if (!isHost) return;
  if (videoType === 'youtube' && ytPlayer) {
    const state = ytPlayer.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
      ytPlayer.pauseVideo();
      // onStateChange will emit video-pause
    } else {
      ytPlayer.playVideo();
      // onStateChange will emit video-play
    }
  } else if (videoEl) {
    if (videoEl.paused) {
      videoEl.play();
      socket.emit('video-play', { roomId: myRoomId, currentTime: videoEl.currentTime });
    } else {
      videoEl.pause();
      socket.emit('video-pause', { roomId: myRoomId, currentTime: videoEl.currentTime });
    }
  }
});

let seekTimeout;
ctrlProgress.addEventListener('input', () => {
  if (!isHost) return;
  ctrlTimeCur.textContent = formatTime(ctrlProgress.value);
  clearTimeout(seekTimeout);
  seekTimeout = setTimeout(() => {
    const t = parseFloat(ctrlProgress.value);
    if (videoType === 'youtube' && ytPlayer) {
      ytPlayer.seekTo(t, true);
      socket.emit('video-seek', { roomId: myRoomId, currentTime: t });
    } else if (videoEl) {
      videoEl.currentTime = t;
      socket.emit('video-seek', { roomId: myRoomId, currentTime: t });
    }
  }, 250);
});

ctrlVolIcon.addEventListener('click', () => {
  if (!videoEl) return;
  videoEl.muted    = !videoEl.muted;
  ctrlVolume.value = videoEl.muted ? 0 : videoEl.volume;
  ctrlVolIcon.textContent = videoEl.muted ? '🔇' : '🔊';
});

// ═══════════════════════════════════════════════════════════════
//   HOME PAGE
// ═══════════════════════════════════════════════════════════════

btnWatchNow.addEventListener('click', () => {
  const url = homeVideoUrl.value.trim();
  if (!url) return showToast('⚠️ Вставь ссылку на видео');
  soloVideoTitle.textContent = url;
  buildEmbed(url, soloPlayer, { autoplay: true });
  soloPlayerWrap.classList.remove('hidden');
  currentUrl = url;
  soloPlayerWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

homeVideoUrl.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnWatchNow.click(); });

btnSoloClose.addEventListener('click', () => {
  soloPlayerWrap.classList.add('hidden');
  soloPlayer.innerHTML = '';
  homeVideoUrl.value = '';
});

document.getElementById('logo-home').addEventListener('click', () => {
  if (myRoomId && !confirm('Выйти из комнаты?')) return;
  if (myRoomId) leaveRoom();
  showPage('home');
});
document.getElementById('logo-room').addEventListener('click', () => {
  if (!confirm('Выйти из комнаты?')) return;
  leaveRoom();
  showPage('home');
});

// ═══════════════════════════════════════════════════════════════
//   CREATE ROOM MODAL
// ═══════════════════════════════════════════════════════════════

function openCreateModal() {
  createError.classList.add('hidden');
  createName.value     = '';
  createVideoUrl.value = currentUrl || '';
  openModal(modalCreate);
  createName.focus();
}

btnOpenCreate.addEventListener('click', openCreateModal);
btnHeroCreate.addEventListener('click', openCreateModal);
btnCreateCancel.addEventListener('click', () => closeModal(modalCreate));
modalCreate.addEventListener('click', (e) => { if (e.target === modalCreate) closeModal(modalCreate); });

btnCreateConfirm.addEventListener('click', () => {
  const name = createName.value.trim();
  if (!name) { showModalError(createError, 'Введи своё имя'); return; }
  const url = createVideoUrl.value.trim();
  btnCreateConfirm.disabled = true;
  btnCreateConfirm.textContent = 'Создаём...';
  socket.emit('create-room', { name, videoUrl: url }, (res) => {
    btnCreateConfirm.disabled = false;
    btnCreateConfirm.innerHTML = '<span>✨</span> Создать';
    if (!res.success) { showModalError(createError, res.error || 'Ошибка'); return; }
    closeModal(modalCreate);
    enterRoom(res.roomInfo, name);
  });
});

createName.addEventListener('keydown',     (e) => { if (e.key === 'Enter') btnCreateConfirm.click(); });
createVideoUrl.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnCreateConfirm.click(); });

// ═══════════════════════════════════════════════════════════════
//   JOIN ROOM MODAL
// ═══════════════════════════════════════════════════════════════

function openJoinModal(code = '') {
  joinError.classList.add('hidden');
  joinName.value = '';
  joinCode.value  = code.toUpperCase();
  openModal(modalJoin);
  joinName.focus();
}

btnOpenJoin.addEventListener('click', () => openJoinModal());
btnHeroJoin.addEventListener('click', () => openJoinModal());
btnJoinCancel.addEventListener('click', () => closeModal(modalJoin));
modalJoin.addEventListener('click', (e) => { if (e.target === modalJoin) closeModal(modalJoin); });

joinCode.addEventListener('input', () => {
  joinCode.value = joinCode.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

btnJoinConfirm.addEventListener('click', () => {
  const name   = joinName.value.trim();
  const roomId = joinCode.value.trim().toUpperCase();
  if (!name)   { showModalError(joinError, 'Введи своё имя');    return; }
  if (!roomId || roomId.length < 4) { showModalError(joinError, 'Введи код комнаты'); return; }
  btnJoinConfirm.disabled = true;
  btnJoinConfirm.textContent = 'Входим...';
  socket.emit('join-room', { roomId, name }, (res) => {
    btnJoinConfirm.disabled = false;
    btnJoinConfirm.innerHTML = '<span>🚀</span> Войти';
    if (!res.success) { showModalError(joinError, res.error || 'Ошибка'); return; }
    closeModal(modalJoin);
    enterRoom(res.roomInfo, name);
  });
});

joinName.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnJoinConfirm.click(); });
joinCode.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnJoinConfirm.click(); });

function showModalError(el, text) {
  el.textContent = text;
  el.classList.remove('hidden');
}

// ═══════════════════════════════════════════════════════════════
//   ENTER / LEAVE ROOM
// ═══════════════════════════════════════════════════════════════

function enterRoom(roomInfo, name) {
  myName   = name;
  myRoomId = roomInfo.roomId;
  isHost   = roomInfo.hostId === socket.id;
  unreadChat = 0;

  displayRoomCode.textContent = roomInfo.roomId;
  if (displayRoomCodeM) displayRoomCodeM.textContent = roomInfo.roomId;
  showPage('room');

  if (isHost) {
    roomUrlBar.classList.remove('hidden');
    guestNote.classList.add('hidden');
  } else {
    roomUrlBar.classList.add('hidden');
    guestNote.classList.remove('hidden');
  }

  renderMembers(roomInfo.members, roomInfo.hostId);
  updateViewerCount(roomInfo.members.length);

  if (roomInfo.videoUrl) {
    buildEmbed(roomInfo.videoUrl, roomPlayer, { autoplay: false, isRoom: true });
  } else {
    roomPlayer.innerHTML = `
      <div class="player-placeholder">
        <div class="placeholder-anim">🎬</div>
        <p>${isHost ? 'Вставь ссылку на видео выше' : 'Ожидание видео от хоста...'}</p>
      </div>`;
  }

  appendSystemMsg(`🎉 Добро пожаловать в комнату ${roomInfo.roomId}!`);
  if (isHost) appendSystemMsg('🏠 Ты хост — вставь ссылку, нажми «Загрузить» и управляй просмотром');
  else        appendSystemMsg('👁 Ты зритель — хост управляет воспроизведением');

  showToast(isHost
    ? '🏠 Ты хост — скопируй инвайт-ссылку и поделись!'
    : `✅ Ты в комнате ${roomInfo.roomId}`
  );
}

function leaveRoom() {
  destroyCurrentPlayer();
  socket.disconnect();
  myRoomId = null; isHost = false; myName = '';
  roomPlayer.innerHTML   = '';
  chatMessages.innerHTML = '';
  membersList.innerHTML  = '';
  unreadChat = 0;
  chatBadge.classList.add('hidden');
  socket.connect();
}

[btnLeave, btnLeaveM].forEach(btn => btn?.addEventListener('click', () => {
  if (!confirm('Выйти из комнаты?')) return;
  leaveRoom();
  showPage('home');
  showToast('👋 Ты вышел из комнаты');
}));

btnCopyCode.addEventListener('click', () => {
  navigator.clipboard.writeText(myRoomId || '')
    .then(() => showToast('📋 Код скопирован!'));
});

[btnCopyInvite, btnCopyInviteM].forEach(btn => btn?.addEventListener('click', () => {
  const url = `${location.origin}${location.pathname}?room=${myRoomId}`;
  navigator.clipboard.writeText(url)
    .then(() => showToast('🔗 Ссылка скопирована!'));
}));

btnRoomSetVideo.addEventListener('click', () => {
  const url = roomVideoUrl.value.trim();
  if (!url) return showToast('⚠️ Вставь ссылку на видео');
  socket.emit('video-change', { roomId: myRoomId, videoUrl: url });
  roomVideoUrl.value = '';
});
roomVideoUrl.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnRoomSetVideo.click(); });

function updateViewerCount(n) { viewerNum.textContent = n; }

// ═══════════════════════════════════════════════════════════════
//   MEMBERS
// ═══════════════════════════════════════════════════════════════

function renderMembers(members, hostId) {
  membersList.innerHTML = '';
  members.forEach(m => {
    const li = document.createElement('li');
    const isMe = m.id === socket.id;
    li.innerHTML = `
      <div class="member-avatar" style="background:${avatarColor(m.name)}">${avatarLetter(m.name)}</div>
      <span class="member-name">${escHtml(m.name)}</span>
      ${isMe ? '<span class="member-you">ты</span>' : ''}
      ${(m.isHost || m.id === hostId) ? '<span class="member-badge">Хост</span>' : ''}
    `;
    membersList.appendChild(li);
  });
}

// ═══════════════════════════════════════════════════════════════
//   CHAT
// ═══════════════════════════════════════════════════════════════

function appendChatMsg({ name, text, senderId }) {
  const mine = senderId === socket.id;
  const div  = document.createElement('div');
  div.className = `chat-msg${mine ? ' mine' : ''}`;
  div.innerHTML = `
    <span class="chat-msg-name">${escHtml(name)}</span>
    <div class="chat-msg-bubble">${escHtml(text)}</div>
  `;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendSystemMsg(text) {
  const div = document.createElement('div');
  div.className = 'chat-system-msg';
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendChat() {
  const text = chatInput.value.trim();
  if (!text || !myRoomId) return;
  socket.emit('chat-message', { roomId: myRoomId, text });
  chatInput.value = '';
}

btnChatSend.addEventListener('click', sendChat);
chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

document.querySelectorAll('.sidebar-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-tab').forEach(t   => t.classList.remove('active'));
    document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`)?.classList.add('active');
    if (tab.dataset.tab === 'chat') {
      unreadChat = 0;
      chatBadge.classList.add('hidden');
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  });
});

// ═══════════════════════════════════════════════════════════════
//   SOCKET EVENTS
// ═══════════════════════════════════════════════════════════════

socket.on('video-changed', ({ videoUrl }) => {
  buildEmbed(videoUrl, roomPlayer, { autoplay: false, isRoom: true });
  appendSystemMsg('🎬 Видео обновлено');
});

// ── Playback (guests receive, host ignores) ────────────────────
socket.on('video-played', ({ currentTime }) => {
  if (isHost) return;
  guestPlay(currentTime);
});

socket.on('video-paused', ({ currentTime }) => {
  if (isHost) return;
  guestPause(currentTime);
});

socket.on('video-seeked', ({ currentTime }) => {
  if (isHost) return;
  guestSeekTo(currentTime);
});

// ── Sync handshake ─────────────────────────────────────────────
socket.on('sync-request', ({ guestId }) => {
  if (!isHost) return;
  let currentTime = 0, playing = false;
  if (videoType === 'youtube' && ytPlayer?.getCurrentTime) {
    currentTime = ytPlayer.getCurrentTime();
    playing     = ytPlayer.getPlayerState() === YT.PlayerState.PLAYING;
  } else if (videoEl) {
    currentTime = videoEl.currentTime;
    playing     = !videoEl.paused;
  }
  socket.emit('sync-response', { roomId: myRoomId, guestId, currentTime, playing });
});

socket.on('sync-state', ({ currentTime, playing }) => {
  if (playing) guestPlay(currentTime);
  else         guestPause(currentTime);
});

// ── Members ────────────────────────────────────────────────────
socket.on('user-joined', ({ name }) => {
  appendSystemMsg(`👋 ${name} присоединился(ась)`);
  showToast(`👋 ${name} в комнате`);
});

socket.on('user-left', ({ name }) => {
  appendSystemMsg(`🚪 ${name} покинул(а) комнату`);
});

socket.on('host-changed', ({ newHostId }) => {
  if (newHostId !== socket.id) return;
  isHost = true;
  roomUrlBar.classList.remove('hidden');
  guestNote.classList.add('hidden');
  // Show controls if player exists
  if (ytPlayer || videoEl) roomControls.classList.remove('hidden');
  if (videoType === 'youtube' && ytPlayer) startYTProgressTracker();
  appendSystemMsg('👑 Ты стал(а) хостом');
  showToast('👑 Ты новый хост!');
});

socket.on('room-update', (roomInfo) => {
  renderMembers(roomInfo.members, roomInfo.hostId);
  updateViewerCount(roomInfo.members.length);
});

socket.on('chat-message', (payload) => {
  appendChatMsg(payload);
  const chatTab = document.querySelector('[data-tab="chat"]');
  if (!chatTab.classList.contains('active')) {
    unreadChat++;
    chatBadge.textContent = unreadChat > 9 ? '9+' : unreadChat;
    chatBadge.classList.remove('hidden');
    chatTab.style.color = 'var(--brand-a)';
    setTimeout(() => { chatTab.style.color = ''; }, 2000);
  }
});

socket.on('disconnect', () => { if (myRoomId) showToast('⚠️ Соединение потеряно...'); });
socket.on('reconnect',  () => { if (myRoomId) showToast('✅ Переподключено'); });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeModal(modalCreate); closeModal(modalJoin); }
});
