/* ═══════════════════════════════════════════════════════════════
   RalliVell — app.js   (Rave-like watch party)
   Socket.IO client · video embedding · room sync · chat
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
let videoEl    = null;   // <video> element (mp4 only)
let unreadChat = 0;
let chatOpen   = false;

// ─── DOM refs ─────────────────────────────────────────────────────
const pageHome = document.getElementById('page-home');
const pageRoom = document.getElementById('page-room');

// Home
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

// Modals
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

// Room
const displayRoomCode  = document.getElementById('display-room-code');
const btnCopyCode      = document.getElementById('btn-copy-code');
const btnCopyInvite    = document.getElementById('btn-copy-invite');
const btnLeave         = document.getElementById('btn-leave-room');
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
    const left = Math.random() * 100;
    const dur  = 12 + Math.random() * 16;
    const delay = Math.random() * 8;
    const color = colors[Math.floor(Math.random() * colors.length)];
    el.style.cssText = `
      width:${size}px; height:${size}px;
      left:${left}%;
      background:${color};
      animation-duration:${dur}s;
      animation-delay:${delay}s;
      opacity:0;
      filter: blur(${Math.random() > .5 ? 1 : 0}px);
    `;
    container.appendChild(el);
    setTimeout(() => el.remove(), (dur + delay) * 1000);
  }

  // Spawn 30 initial particles
  for (let i = 0; i < 30; i++) spawn();
  // Keep spawning
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
  // Animate in
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
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════════════════════
//   URL PARAMS — invite link support
// ═══════════════════════════════════════════════════════════════

function getInviteCodeFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('room') || params.get('code') || null;
}

(function checkInviteOnLoad() {
  const code = getInviteCodeFromURL();
  if (code) {
    // Clean URL so user doesn't see ugly params
    window.history.replaceState({}, '', window.location.pathname);
    // Open join modal with pre-filled code
    joinError.classList.add('hidden');
    joinName.value = '';
    joinCode.value = code.toUpperCase();
    openModal(modalJoin);
    joinName.focus();
    showToast(`🔗 Код комнаты ${code.toUpperCase()} — введи своё имя!`);
  }
})();

// ═══════════════════════════════════════════════════════════════
//   VIDEO DETECTION & EMBEDDING
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

function detectVideoType(url) {
  if (!url) return null;
  if (getYouTubeId(url)) return 'youtube';
  if (/\.(mp4|webm|ogg|mov)(\?|$)/i.test(url)) return 'mp4';
  return null;
}

function buildEmbed(url, container, { autoplay = false, isRoom = false } = {}) {
  container.innerHTML = '';
  videoEl   = null;
  videoType = detectVideoType(url);

  if (!videoType) {
    container.innerHTML = `
      <div class="player-placeholder">
        <div class="placeholder-anim">⚠️</div>
        <p>Неподдерживаемая ссылка.<br>Поддерживаются YouTube и прямые MP4-файлы.</p>
      </div>`;
    return;
  }

  if (videoType === 'youtube') {
    const ytId = getYouTubeId(url);
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube.com/embed/${ytId}?autoplay=${autoplay ? 1 : 0}&rel=0&modestbranding=1&enablejsapi=1`;
    iframe.allow = 'autoplay; encrypted-media; fullscreen';
    iframe.allowFullscreen = true;
    container.appendChild(iframe);
    if (isRoom) roomControls.classList.add('hidden');
  } else {
    const video = document.createElement('video');
    video.src      = url;
    video.controls = !isRoom;
    video.autoplay = autoplay;
    video.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000;';
    container.appendChild(video);
    videoEl = video;

    if (isRoom) {
      if (isHost) {
        roomControls.classList.remove('hidden');
      }
      setupVideoEvents(video);
    }
  }
}

// ─── Custom controls for mp4 ─────────────────────────────────────
function setupVideoEvents(video) {
  video.addEventListener('timeupdate', () => {
    if (isNaN(video.duration)) return;
    ctrlProgress.max   = video.duration;
    ctrlProgress.value = video.currentTime;
    ctrlTimeCur.textContent = formatTime(video.currentTime);
    ctrlTimeDur.textContent = formatTime(video.duration);
    // Fill track progress
    const pct = (video.currentTime / video.duration) * 100;
    ctrlProgress.style.background = `linear-gradient(to right, var(--brand-c) ${pct}%, var(--border2) ${pct}%)`;
  });
  video.addEventListener('play',  () => { ctrlPlay.textContent = '⏸'; });
  video.addEventListener('pause', () => { ctrlPlay.textContent = '▶'; });
  video.addEventListener('volumechange', () => {
    ctrlVolIcon.textContent = video.muted || video.volume === 0 ? '🔇' : video.volume < .5 ? '🔉' : '🔊';
  });
  ctrlVolume.addEventListener('input', () => {
    video.volume = ctrlVolume.value;
    if (parseFloat(ctrlVolume.value) === 0) video.muted = true;
    else video.muted = false;
  });
}

ctrlPlay.addEventListener('click', () => {
  if (!videoEl || !isHost) return;
  if (videoEl.paused) {
    videoEl.play();
    socket.emit('video-play', { roomId: myRoomId, currentTime: videoEl.currentTime });
  } else {
    videoEl.pause();
    socket.emit('video-pause', { roomId: myRoomId, currentTime: videoEl.currentTime });
  }
});

let seekTimeout;
ctrlProgress.addEventListener('input', () => {
  if (!videoEl || !isHost) return;
  ctrlTimeCur.textContent = formatTime(ctrlProgress.value);
  clearTimeout(seekTimeout);
  seekTimeout = setTimeout(() => {
    videoEl.currentTime = parseFloat(ctrlProgress.value);
    socket.emit('video-seek', { roomId: myRoomId, currentTime: videoEl.currentTime });
  }, 250);
});

// Volume icon mute toggle
ctrlVolIcon.addEventListener('click', () => {
  if (!videoEl) return;
  videoEl.muted = !videoEl.muted;
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
  videoEl = null;
});

// ─── Logos → home ──────────────────────────────────────────────────
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
  joinCode.value = code.toUpperCase();
  openModal(modalJoin);
  (code ? joinName : joinName).focus();
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
  if (!name)                { showModalError(joinError, 'Введи своё имя');    return; }
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
  chatOpen   = true;

  displayRoomCode.textContent = roomInfo.roomId;
  showPage('room');

  // Host vs guest UI
  if (isHost) {
    roomUrlBar.classList.remove('hidden');
    guestNote.classList.add('hidden');
    roomControls.classList.add('hidden');
  } else {
    roomUrlBar.classList.add('hidden');
    guestNote.classList.remove('hidden');
    roomControls.classList.add('hidden');
  }

  // Members
  renderMembers(roomInfo.members, roomInfo.hostId);
  updateViewerCount(roomInfo.members.length);

  // Load video
  if (roomInfo.videoUrl) {
    buildEmbed(roomInfo.videoUrl, roomPlayer, { autoplay: false, isRoom: true });
    if (!isHost) {
      setTimeout(() => socket.emit('request-sync', { roomId: myRoomId }), 1000);
    }
  } else {
    roomPlayer.innerHTML = `
      <div class="player-placeholder">
        <div class="placeholder-anim">🎬</div>
        <p>${isHost ? 'Вставь ссылку на видео выше' : 'Ожидание видео от хоста...'}</p>
      </div>`;
  }

  // Welcome chat message
  appendSystemMsg(`🎉 Добро пожаловать в комнату ${roomInfo.roomId}!`);
  if (isHost) appendSystemMsg('🏠 Ты хост — вставь ссылку и нажми «Загрузить»');

  showToast(isHost
    ? '🏠 Ты хост! Скопируй ссылку и поделись с друзьями.'
    : `✅ Ты в комнате ${roomInfo.roomId}`
  );
}

function leaveRoom() {
  socket.disconnect();
  myRoomId = null;
  isHost   = false;
  myName   = '';
  videoEl  = null;
  roomPlayer.innerHTML   = '';
  chatMessages.innerHTML = '';
  membersList.innerHTML  = '';
  roomControls.classList.add('hidden');
  unreadChat = 0;
  chatBadge.classList.add('hidden');
  socket.connect();
}

btnLeave.addEventListener('click', () => {
  if (!confirm('Выйти из комнаты?')) return;
  leaveRoom();
  showPage('home');
  showToast('👋 Ты вышел из комнаты');
});

// ─── Copy room code ───────────────────────────────────────────────
btnCopyCode.addEventListener('click', () => {
  navigator.clipboard.writeText(myRoomId || '')
    .then(() => showToast('📋 Код скопирован!'));
});

// ─── Copy invite link ─────────────────────────────────────────────
btnCopyInvite.addEventListener('click', () => {
  const url = `${location.origin}${location.pathname}?room=${myRoomId}`;
  navigator.clipboard.writeText(url)
    .then(() => showToast('🔗 Ссылка-приглашение скопирована!'));
});

// ─── Host sets new video ──────────────────────────────────────────
btnRoomSetVideo.addEventListener('click', () => {
  const url = roomVideoUrl.value.trim();
  if (!url) return showToast('⚠️ Вставь ссылку на видео');
  socket.emit('video-change', { roomId: myRoomId, videoUrl: url });
  roomVideoUrl.value = '';
});
roomVideoUrl.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnRoomSetVideo.click(); });

// ─── Viewer count ─────────────────────────────────────────────────
function updateViewerCount(n) {
  viewerNum.textContent = n;
}

// ═══════════════════════════════════════════════════════════════
//   MEMBERS RENDERING
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

// ─── Sidebar tabs ──────────────────────────────────────────────────
document.querySelectorAll('.sidebar-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-tab').forEach(t   => t.classList.remove('active'));
    document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    const panel = document.getElementById(`tab-${tab.dataset.tab}`);
    if (panel) panel.classList.add('active');

    if (tab.dataset.tab === 'chat') {
      chatOpen = true;
      unreadChat = 0;
      chatBadge.classList.add('hidden');
      chatBadge.textContent = '0';
      chatMessages.scrollTop = chatMessages.scrollHeight;
    } else {
      chatOpen = false;
    }
  });
});

// ═══════════════════════════════════════════════════════════════
//   SOCKET EVENTS
// ═══════════════════════════════════════════════════════════════

// ─── Video changed ───────────────────────────────────────────────
socket.on('video-changed', ({ videoUrl }) => {
  buildEmbed(videoUrl, roomPlayer, { autoplay: false, isRoom: true });
  if (!isHost) {
    setTimeout(() => socket.emit('request-sync', { roomId: myRoomId }), 800);
  }
  appendSystemMsg('🎬 Видео обновлено');
});

// ─── Playback (guests) ───────────────────────────────────────────
socket.on('video-played', ({ currentTime }) => {
  if (isHost || !videoEl) return;
  videoEl.currentTime = currentTime;
  videoEl.play().catch(() => {});
});

socket.on('video-paused', ({ currentTime }) => {
  if (isHost || !videoEl) return;
  videoEl.currentTime = currentTime;
  videoEl.pause();
});

socket.on('video-seeked', ({ currentTime }) => {
  if (isHost || !videoEl) return;
  videoEl.currentTime = currentTime;
});

// ─── Sync ──────────────────────────────────────────────────────────
socket.on('sync-request', ({ guestId }) => {
  if (!isHost || !videoEl) return;
  socket.emit('sync-response', {
    roomId: myRoomId,
    guestId,
    currentTime: videoEl.currentTime,
    playing: !videoEl.paused
  });
});

socket.on('sync-state', ({ currentTime, playing }) => {
  if (!videoEl) return;
  videoEl.currentTime = currentTime;
  if (playing) videoEl.play().catch(() => {});
  else videoEl.pause();
});

// ─── Members ──────────────────────────────────────────────────────
socket.on('user-joined', ({ name }) => {
  appendSystemMsg(`👋 ${name} присоединился(ась)`);
  showToast(`👋 ${name} в комнате`);
});

socket.on('user-left', ({ name }) => {
  appendSystemMsg(`🚪 ${name} покинул(а) комнату`);
});

socket.on('host-changed', ({ newHostId }) => {
  if (newHostId === socket.id) {
    isHost = true;
    roomUrlBar.classList.remove('hidden');
    guestNote.classList.add('hidden');
    if (videoEl) roomControls.classList.remove('hidden');
    appendSystemMsg('👑 Ты стал(а) хостом');
    showToast('👑 Ты новый хост!');
  }
});

socket.on('room-update', (roomInfo) => {
  renderMembers(roomInfo.members, roomInfo.hostId);
  updateViewerCount(roomInfo.members.length);
});

// ─── Chat ──────────────────────────────────────────────────────────
socket.on('chat-message', (payload) => {
  appendChatMsg(payload);

  // Badge if chat is not open
  const chatTab = document.querySelector('[data-tab="chat"]');
  if (!chatTab.classList.contains('active')) {
    unreadChat++;
    chatBadge.textContent = unreadChat > 9 ? '9+' : unreadChat;
    chatBadge.classList.remove('hidden');
    // Flash the tab
    chatTab.style.color = 'var(--brand-a)';
    setTimeout(() => { chatTab.style.color = ''; }, 2000);
  }
});

// ─── Connection ────────────────────────────────────────────────────
socket.on('disconnect', () => {
  if (myRoomId) showToast('⚠️ Соединение потеряно — переподключение...');
});
socket.on('reconnect', () => {
  if (myRoomId) showToast('✅ Переподключено');
});

// Escape key to close modals
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal(modalCreate);
    closeModal(modalJoin);
  }
});
