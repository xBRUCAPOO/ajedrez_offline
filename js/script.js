// MODIFICADO: reubicado a la carpeta js/ (antes estaba junto a index.html)
(function(){
  const FILES = ['a','b','c','d','e','f','g','h'];
  const VALUE = { P:1, N:3, B:3, R:5, Q:9, K:0 };

  // NUEVO: nombres en español para el atributo alt de cada imagen (accesibilidad)
  const PIECE_NAMES = {
    P: 'Peón', N: 'Caballo', B: 'Alfil', R: 'Torre', Q: 'Reina', K: 'Rey'
  };

  // =========================================================================
  // NUEVO: piezas como imágenes .png (antes eran SVG en línea).
  // MODIFICADO (corrección de bug): los archivos reales en assets/pieces/ se
  // llaman "<NombreEnEspañol>_<B|N>.png" (ej. "Rey_B.png", "Caballo_N.png").
  // Antes se armaba "wK.png"/"bN.png", un nombre que no existe en disco, así
  // que ninguna imagen llegaba a cargarse. Este mapa traduce cada tipo de
  // pieza a su nombre de archivo real.
  // =========================================================================
  const PIECE_FILE_NAMES = {
    P: 'Peon', N: 'Caballo', B: 'Alfil', R: 'Torre', Q: 'Reina', K: 'Rey'
  };
  function pieceImgSrc(color, type){
    const suffix = color === 'w' ? 'B' : 'N'; // B = Blancas, N = Negras
    return 'assets/pieces/' + PIECE_FILE_NAMES[type] + '_' + suffix + '.png';
  }
  function pieceImgHTML(color, type, extraClass){
    const alt = (color === 'w' ? 'Blanco' : 'Negro') + ' ' + PIECE_NAMES[type];
    const cls = 'piece-img' + (extraClass ? ' ' + extraClass : '');
    return '<img src="' + pieceImgSrc(color, type) + '" alt="' + alt + '" class="' + cls + '" draggable="false">';
  }

  function initialBoard(){
    const b = Array.from({length:8}, () => Array(8).fill(null));
    const back = ['R','N','B','Q','K','B','N','R'];
    for (let f=0; f<8; f++){
      b[0][f] = { type: back[f], color: 'b' };
      b[1][f] = { type: 'P', color: 'b' };
      b[6][f] = { type: 'P', color: 'w' };
      b[7][f] = { type: back[f], color: 'w' };
    }
    return b;
  }

  let state = {
    board: initialBoard(),
    turn: 'w',
    selected: null,
    legalForSelected: [],
    lastMove: null,
    history: [],
    future: [], // NUEVO: pila de "rehacer" (se vacía cada vez que se juega una jugada nueva)
    castling: { wK:true, wQ:true, bK:true, bQ:true },
    enPassant: null,
    capturedByWhite: [],
    capturedByBlack: [],
    moveNumber: 1,
    moveLog: [], // NUEVO: [{moveNumber, color, notation}, ...] — reemplaza el parcheo manual del DOM, así "rehacer" puede reconstruir la lista
    positionHistory: [], // NUEVO: una entrada por posición alcanzada, para detectar tablas por triple repetición
    halfmoveClock: 0, // NUEVO: jugadas sin captura ni movimiento de peón, para la regla de las 50 jugadas
    kingsPos: { w: {r:7,c:4}, b: {r:0,c:4} },
    gameOver: false,
    flipped: false, // true = el tablero se muestra desde el lado de las negras
    clockConfig: null, // NUEVO: { initialMs, incrementMs } o null si se juega sin reloj
    clockStarted: false, // NUEVO: el reloj no corre hasta la primera jugada de la partida
    clocks: { w: 0, b: 0 } // NUEVO: tiempo restante de cada jugador, en milisegundos
  };

  const boardEl = document.getElementById('board');
  const statusEl = document.getElementById('status');
  const toastEl = document.getElementById('toast'); // NUEVO
  const capWhiteEl = document.getElementById('capByWhite');
  const capBlackEl = document.getElementById('capByBlack');
  const capWhiteDiffEl = document.getElementById('capWhiteDiff'); // NUEVO
  const capBlackDiffEl = document.getElementById('capBlackDiff'); // NUEVO
  const moveListEl = document.getElementById('moveList');
  const promoDialog = document.getElementById('promoDialog');
  const promoChoices = document.getElementById('promoChoices');
  const themeBtn = document.getElementById('themeBtn');
  const soundBtn = document.getElementById('soundBtn'); // NUEVO
  // NUEVO: reloj de ajedrez
  const clockSettingsBtn = document.getElementById('clockSettingsBtn');
  const clockDialog = document.getElementById('clockDialog');
  const clockOptionsEl = document.getElementById('clockOptions');
  const clocksEl = document.getElementById('clocks');
  const clockWhiteEl = document.getElementById('clockWhite');
  const clockBlackEl = document.getElementById('clockBlack');
  const clockWhiteTimeEl = document.getElementById('clockWhiteTime');
  const clockBlackTimeEl = document.getElementById('clockBlackTime');
  // NUEVO: diálogo de confirmación genérico (lo usa "Ofrecer tablas")
  const confirmDialog = document.getElementById('confirmDialog');
  const confirmTitleEl = document.getElementById('confirmTitle');
  const confirmMessageEl = document.getElementById('confirmMessage');
  const confirmYesBtn = document.getElementById('confirmYes');
  const confirmNoBtn = document.getElementById('confirmNo');
  // NUEVO: flecha SVG que marca la última jugada
  const lastMoveArrowEl = document.getElementById('lastMoveArrow');

  function playerLabel(color){
    return color === 'w' ? 'Jugador 1 · Blancas' : 'Jugador 2 · Negras';
  }

  // =========================================================================
  // NUEVO: tema claro/oscuro. El ícono del botón ahora es un Material Symbol
  // (dark_mode / light_mode) en vez del glifo de texto ☾/☀ usado antes.
  // =========================================================================
  const THEME_KEY = 'ajedrez-theme';

  function getPreferredTheme(){
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme){
    document.documentElement.setAttribute('data-theme', theme);
    const icon = themeBtn.querySelector('.material-symbols-outlined');
    icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
    themeBtn.setAttribute('aria-label', theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
    localStorage.setItem(THEME_KEY, theme);
  }

  function toggleTheme(){
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  }

  // =========================================================================
  // NUEVO: sonidos sintetizados con Web Audio API (osciladores). No se usan
  // archivos de audio externos: cada sonido se genera en el momento, así el
  // juego sigue siendo 100% offline. Un AudioContext se crea recién en el
  // primer clic, porque los navegadores bloquean el audio sin gesto del usuario.
  // =========================================================================
  const SOUND_KEY = 'ajedrez-sound';
  let soundEnabled = localStorage.getItem(SOUND_KEY) !== 'off';
  let audioCtx = null;

  function getAudioCtx(){
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  // Reproduce un tono simple: frecuencia, duración (s), tipo de onda y volumen
  function beep(freq, duration, type, gainValue){
    if (!soundEnabled) return;
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.value = gainValue != null ? gainValue : 0.08;
    // Fundido de salida suave para que no se escuche un "clic" al cortar
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  function playMoveSound(){ beep(520, 0.09, 'sine', 0.07); }
  function playCaptureSound(){ beep(260, 0.12, 'triangle', 0.09); }
  function playCheckSound(){ beep(880, 0.09, 'square', 0.05); setTimeout(() => beep(660, 0.12, 'square', 0.05), 90); }
  function playEndSound(){ beep(440, 0.14, 'sine', 0.07); setTimeout(() => beep(330, 0.14, 'sine', 0.07), 130); setTimeout(() => beep(220, 0.22, 'sine', 0.07), 260); }

  function applySoundIcon(){
    const icon = soundBtn.querySelector('.material-symbols-outlined');
    icon.textContent = soundEnabled ? 'volume_up' : 'volume_off';
    soundBtn.setAttribute('aria-label', soundEnabled ? 'Silenciar sonido' : 'Activar sonido');
  }
  function toggleSound(){
    soundEnabled = !soundEnabled;
    localStorage.setItem(SOUND_KEY, soundEnabled ? 'on' : 'off');
    applySoundIcon();
  }

  // =========================================================================
  // NUEVO: aviso corto y temporal (toast). Por ahora se usa para avisar de
  // forma clara cuando una jugada es ilegal porque deja al propio rey en
  // jaque (ver trySelectOrMove).
  // =========================================================================
  let toastTimer = null;
  function showToast(message){
    toastEl.textContent = message;
    toastEl.classList.add('show');
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 1800);
  }

  // =========================================================================
  // NUEVO: anima brevemente un elemento cada vez que su texto cambia (fundido
  // + pequeño desplazamiento), para que ningún texto "aparezca de la nada"
  // de golpe. Usa la Web Animations API directamente (no una clase CSS +
  // reflow) para no depender de que el navegador "confirme" un estado
  // intermedio, tal como se corrigió para el deslizamiento de piezas.
  // =========================================================================
  function animateTextChange(el){
    if (!el.animate) return;
    el.animate(
      [ { opacity: 0, transform: 'translateY(-3px)' }, { opacity: 1, transform: 'translateY(0)' } ],
      { duration: 150, easing: 'ease-out' }
    );
  }

  // NUEVO: reemplaza a las asignaciones directas de statusEl.textContent, así
  // cada cambio de estado (turno, jaque, jaque mate, distintas tablas) se
  // anima solo, sin tener que acordarse de llamar animateTextChange a mano
  // en cada lugar donde cambia el mensaje.
  function setStatus(text){
    statusEl.textContent = text;
    animateTextChange(statusEl);
  }

  // =========================================================================
  // NUEVO: diálogo de confirmación genérico (Sí/No). Lo usa "Ofrecer tablas",
  // pero queda listo para reutilizarse en cualquier otra confirmación futura.
  // =========================================================================
  function askConfirm(title, message, onYes){
    confirmTitleEl.textContent = title;
    confirmMessageEl.textContent = message;
    function onYesClick(){ confirmDialog.close(); cleanup(); onYes(); }
    function onNoClick(){ confirmDialog.close(); cleanup(); }
    function cleanup(){
      confirmYesBtn.removeEventListener('click', onYesClick);
      confirmNoBtn.removeEventListener('click', onNoClick);
    }
    confirmYesBtn.addEventListener('click', onYesClick);
    confirmNoBtn.addEventListener('click', onNoClick);
    confirmDialog.showModal();
  }

  // =========================================================================
  // NUEVO: reloj de ajedrez por jugador, con incremento tipo Fischer opcional.
  // state.clockConfig es null cuando se juega "sin reloj". El intervalo corre
  // siempre de fondo (cada 100ms) pero tickClock() no hace nada si no hay
  // reloj configurado o si la partida ya terminó.
  // =========================================================================
  function formatClock(ms){
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  }

  // NUEVO: recuerda si la fila de relojes está visible, para sólo animar
  // el cambio cuando corresponde (se llama en cada jugada, no sólo cuando
  // se activa/desactiva el reloj).
  let clocksVisible = false;
  function updateClockDisplay(){
    const shouldShow = !!state.clockConfig; // NUEVO: si se juega "sin reloj", esta fila desaparece
    if (shouldShow !== clocksVisible){
      clocksVisible = shouldShow;
      if (shouldShow){
        clocksEl.hidden = false;
        animateShow(clocksEl);
      } else {
        animateHide(clocksEl, () => { clocksEl.hidden = true; });
      }
    }
    if (!state.clockConfig) return;
    clockWhiteTimeEl.textContent = formatClock(state.clocks.w);
    clockBlackTimeEl.textContent = formatClock(state.clocks.b);
    clockWhiteEl.classList.toggle('active', !state.gameOver && state.turn === 'w');
    clockBlackEl.classList.toggle('active', !state.gameOver && state.turn === 'b');
    clockWhiteEl.classList.toggle('low', state.clocks.w <= 30000);
    clockBlackEl.classList.toggle('low', state.clocks.b <= 30000);
  }

  // NUEVO: apariciones/desapariciones animadas genéricas (fundido + un
  // pequeño desplazamiento), usadas por el reloj al activarse/desactivarse.
  function animateShow(el){
    if (!el.animate) return;
    el.animate(
      [ { opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'translateY(0)' } ],
      { duration: 180, easing: 'ease-out' }
    );
  }
  function animateHide(el, onDone){
    if (!el.animate){ onDone(); return; }
    const anim = el.animate(
      [ { opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-4px)' } ],
      { duration: 150, easing: 'ease-in' }
    );
    anim.onfinish = onDone;
  }

  function tickClock(){
    // MODIFICADO: el reloj no descuenta tiempo hasta que se jugó la primera
    // jugada de la partida (antes arrancaba a correr apenas se elegía un
    // control de tiempo, incluso sin que nadie hubiera movido todavía).
    if (state.gameOver || !state.clockConfig || !state.clockStarted) return;
    state.clocks[state.turn] = Math.max(0, state.clocks[state.turn] - 100);
    if (state.clocks[state.turn] === 0){
      state.gameOver = true;
      const opponent = state.turn === 'w' ? 'b' : 'w';
      // NUEVO: si al ganador del reloj no le alcanza material para dar mate,
      // la regla del ajedrez dice que la partida es tablas, no una derrota.
      if (isInsufficientMaterial(state.board)){
        setStatus('Tablas: se acabó el tiempo, pero no hay material suficiente para dar mate');
      } else {
        setStatus(`Tiempo agotado — gana ${playerLabel(opponent)}`);
      }
      playEndSound();
    }
    updateClockDisplay();
  }
  window.setInterval(tickClock, 100);

  // Aplica un control de tiempo elegido en el diálogo (o "Sin reloj").
  function setClockConfig(minutes, incrementSeconds){
    if (minutes == null || isNaN(minutes)){
      state.clockConfig = null;
    } else {
      state.clockConfig = { initialMs: minutes * 60000, incrementMs: (incrementSeconds || 0) * 1000 };
      state.clocks = { w: state.clockConfig.initialMs, b: state.clockConfig.initialMs };
    }
    updateClockDisplay();
  }

  clockSettingsBtn.addEventListener('click', () => clockDialog.showModal());
  clockOptionsEl.querySelectorAll('.clock-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const minutesAttr = btn.dataset.minutes;
      const minutes = minutesAttr === '' ? null : parseInt(minutesAttr, 10);
      const increment = parseInt(btn.dataset.increment || '0', 10);
      setClockConfig(minutes, increment);
      clockDialog.close();
      reset(); // NUEVO: cambiar el control de tiempo arranca una partida nueva con ese reloj
    });
  });

  // =========================================================================
  // NUEVO: el tablero se invierte automáticamente según de quién es el turno,
  // para que cada jugador vea sus piezas "desde abajo" al jugar en la misma
  // máquina. Se anima con un giro 3D (rotateY) en vez de cambiar de golpe.
  // =========================================================================
  function setOrientationForTurn(mode){
    const shouldFlip = state.turn === 'b';
    if (shouldFlip !== state.flipped){
      state.flipped = shouldFlip;
      animateFlipAndRender(mode);
    } else {
      render(mode);
    }
  }

  // =========================================================================
  // NUEVO: registro de temporizadores de animación pendientes (giro de
  // tablero, deslizamiento diferido). Si el usuario deshace/rehace/reinicia
  // mientras una animación todavía está "en el aire", ese setTimeout viejo
  // podía disparar más tarde y pisar el estado recién restaurado con datos
  // obsoletos. cancelPendingAnims() se llama al principio de undo/redo/reset.
  // =========================================================================
  let pendingAnimTimeouts = [];
  function scheduleAnim(fn, ms){
    const id = window.setTimeout(() => {
      pendingAnimTimeouts = pendingAnimTimeouts.filter(t => t !== id);
      fn();
    }, ms);
    pendingAnimTimeouts.push(id);
    return id;
  }
  function cancelPendingAnims(){
    pendingAnimTimeouts.forEach(id => window.clearTimeout(id));
    pendingAnimTimeouts = [];
  }

  function animateFlipAndRender(mode){
    boardEl.classList.add('board-flip-out');
    scheduleAnim(() => {
      boardEl.classList.remove('board-flip-out');
      render(mode);
      boardEl.classList.add('board-flip-in');
      scheduleAnim(() => boardEl.classList.remove('board-flip-in'), 180);
    }, 160);
  }

  // =========================================================================
  // NUEVO: animación fluida del movimiento de piezas (técnica "FLIP":
  // First - Last - Invert - Play). En vez de que la pieza aparezca de golpe
  // en su casilla nueva, se mide su posición en pantalla ANTES de redibujar
  // el tablero y se desliza suavemente hasta la posición final. También se
  // usa para la torre en el enroque y para mostrar una copia que se
  // desvanece cuando se captura una pieza (incluida la captura al paso).
  //
  // MOVE_ANIM_MS debe coincidir con la duración de --anim-move en style.css:
  // es el tiempo que esperamos antes de disparar el giro automático del
  // tablero, para que ambas animaciones no se pisen entre sí.
  //
  // CORRECCIÓN: antes estas animaciones se desactivaban solas si el sistema
  // (o el navegador embebido, como la vista previa de VS Code) reportaba la
  // preferencia "reducir movimiento" — varios entornos de vista previa
  // devuelven esa preferencia como activada aunque el usuario no la haya
  // elegido, lo que hacía que NINGUNA animación se viera nunca. Se sacó esa
  // verificación (y el bloque @media (prefers-reduced-motion) de style.css)
  // para que las animaciones se vean siempre.
  // =========================================================================
  const MOVE_ANIM_MS = 280;
  // NUEVO: debe coincidir con --ease-bounce en style.css
  const EASE_BOUNCE = 'cubic-bezier(.34, 1.56, .64, 1)';

  function getSquareEl(r, c){
    return boardEl.querySelector('.sq[data-r="' + r + '"][data-c="' + c + '"]');
  }
  function getPieceImgEl(r, c){
    const sq = getSquareEl(r, c);
    return sq ? sq.querySelector('.piece-img') : null;
  }

  // Desliza la pieza que ya quedó dibujada en (r,c) desde "oldRect" (su
  // posición en pantalla antes del redibujado) hasta su lugar actual.
  // "popAfter" agrega el "pop" de aterrizaje al terminar (usado para la
  // pieza que corona, ya que cambia de tipo al llegar a la última fila).
  //
  // CORRECCIÓN DE BUG: antes esto se hacía con una clase CSS + transición,
  // forzando un "reflow" manual para que el navegador registrara la
  // posición inicial antes de animar. En varios navegadores (Chromium
  // incluido, según la versión) ese truco no siempre alcanza para un
  // elemento recién creado —el tablero se redibuja entero en cada
  // jugada— y la pieza saltaba directo a su posición final sin animarse.
  // La Web Animations API (element.animate()) anima directamente entre dos
  // estados definidos a mano, sin depender de que el navegador "confirme"
  // un paso intermedio, así que es mucho más confiable.
  function slidePieceFLIP(r, c, oldRect, popAfter){
    const img = getPieceImgEl(r, c);
    if (!img) return;
    if (!oldRect){ img.classList.add('piece-drop'); return; } // sin posición previa: respaldo con "pop"
    const newRect = img.getBoundingClientRect();
    const dx = oldRect.left - newRect.left;
    const dy = oldRect.top - newRect.top;
    if (!dx && !dy){
      if (popAfter) img.classList.add('piece-drop');
      return;
    }
    const anim = img.animate(
      [
        { transform: 'translate(' + dx + 'px,' + dy + 'px)' },
        { transform: 'translate(0,0)' }
      ],
      { duration: MOVE_ANIM_MS, easing: EASE_BOUNCE, fill: 'both' }
    );
    anim.onfinish = () => {
      img.style.transform = ''; // deja que la posición final la maneje el layout normal, no la animación
      if (popAfter) img.classList.add('piece-drop');
    };
  }

  // Muestra una copia de la pieza capturada que se desvanece y encoge en su
  // lugar. Como al redibujar el tablero la pieza capturada desaparece de
  // golpe del DOM, esta "copia fantasma" se posiciona por encima con las
  // coordenadas de pantalla guardadas justo antes del redibujado, y se
  // elimina sola cuando termina su animación (ver @keyframes pieceCaptureFade
  // en style.css).
  function spawnCaptureGhost(ghost){
    const img = document.createElement('img');
    img.src = ghost.src;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.className = 'piece-img piece-capture-ghost';
    img.style.position = 'fixed';
    img.style.left = ghost.rect.left + 'px';
    img.style.top = ghost.rect.top + 'px';
    img.style.width = ghost.rect.width + 'px';
    img.style.height = ghost.rect.height + 'px';
    img.style.margin = '0';
    document.body.appendChild(img);
    window.setTimeout(() => img.remove(), MOVE_ANIM_MS);
  }

  // Orquesta la animación completa de una jugada: mide posiciones antes de
  // redibujar, redibuja ya con la jugada aplicada (misma orientación
  // todavía), desliza la(s) pieza(s) y recién al terminar dispara el giro
  // automático del tablero si corresponde. desc:
  //   { from, to, extraSlide?: {from,to} (torre del enroque), capturedSquare?: {r,c}, promoted?: bool }
  function animateMoveThenOrient(desc){
    const fromImg = getPieceImgEl(desc.from.r, desc.from.c);
    const fromRect = fromImg ? fromImg.getBoundingClientRect() : null;

    let extraFromRect = null;
    if (desc.extraSlide){
      const extraImg = getPieceImgEl(desc.extraSlide.from.r, desc.extraSlide.from.c);
      extraFromRect = extraImg ? extraImg.getBoundingClientRect() : null;
    }

    // Antes de redibujar, guardamos una copia de la pieza capturada (si la
    // hay) para poder animar su desaparición por separado.
    let ghost = null;
    if (desc.capturedSquare){
      const capImg = getPieceImgEl(desc.capturedSquare.r, desc.capturedSquare.c);
      if (capImg){
        ghost = { src: capImg.getAttribute('src'), rect: capImg.getBoundingClientRect() };
      }
    }

    render('none'); // ya con la jugada aplicada, todavía en la orientación anterior

    slidePieceFLIP(desc.to.r, desc.to.c, fromRect, desc.promoted);
    if (desc.extraSlide) slidePieceFLIP(desc.extraSlide.to.r, desc.extraSlide.to.c, extraFromRect);
    if (ghost) spawnCaptureGhost(ghost);

    // El giro automático del tablero (si corresponde) espera a que termine
    // el deslizamiento, para no mezclar ambas animaciones a la vez.
    scheduleAnim(() => setOrientationForTurn('none'), MOVE_ANIM_MS);
  }

  // =========================================================================
  // Reglas del juego: SIN CAMBIOS respecto a la versión anterior
  // (generación de movimientos, jaque, enroque, al paso, promoción, mate)
  // =========================================================================

  // MODIFICADO: el snapshot ahora incluye TODO lo necesario para poder
  // reconstruir la partida en "Deshacer" Y en "Rehacer" (antes sólo servía
  // para deshacer, y la lista de jugadas se parcheaba a mano en el DOM).
  function fullSnapshot(){
    return JSON.parse(JSON.stringify({
      board: state.board,
      turn: state.turn,
      castling: state.castling,
      enPassant: state.enPassant,
      capturedByWhite: state.capturedByWhite,
      capturedByBlack: state.capturedByBlack,
      moveNumber: state.moveNumber,
      kingsPos: state.kingsPos,
      gameOver: state.gameOver,
      lastMove: state.lastMove,
      moveLog: state.moveLog,
      positionHistory: state.positionHistory,
      halfmoveClock: state.halfmoveClock,
      clocks: state.clocks,
      clockStarted: state.clockStarted, // NUEVO
      statusText: statusEl.textContent // NUEVO: para poder restaurar el mensaje exacto (ej. "Jaque mate...") al rehacer
    }));
  }

  function pushHistorySnapshot(){
    state.history.push(fullSnapshot());
    state.future = []; // NUEVO: una jugada nueva invalida cualquier "rehacer" pendiente
  }

  // NUEVO: aplica un snapshot guardado (usado por undo() y redo())
  function restoreSnapshot(snap){
    state.board = snap.board;
    state.turn = snap.turn;
    state.castling = snap.castling;
    state.enPassant = snap.enPassant;
    state.capturedByWhite = snap.capturedByWhite;
    state.capturedByBlack = snap.capturedByBlack;
    state.moveNumber = snap.moveNumber;
    state.kingsPos = snap.kingsPos;
    state.gameOver = snap.gameOver;
    state.lastMove = snap.lastMove;
    state.moveLog = snap.moveLog;
    state.positionHistory = snap.positionHistory;
    state.halfmoveClock = snap.halfmoveClock;
    state.clocks = snap.clocks;
    state.clockStarted = snap.clockStarted; // NUEVO
    state.selected = null;
    state.legalForSelected = [];
    renderMoveList();
    if (snap.gameOver){
      setStatus(snap.statusText); // partida terminada: se restaura el mensaje exacto
    } else {
      refreshStatusText();
    }
    updateClockDisplay();
    setOrientationForTurn('all');
  }

  // NUEVO: recalcula el texto de estado (turno / jaque / mate / distintas
  // tablas) a partir del estado actual. La usan finalizeMove, undo y redo
  // para no repetir esta lógica en cada uno.
  function refreshStatusText(){
    if (state.gameOver){
      return; // el mensaje de fin de partida ya quedó fijado por quien puso gameOver=true
    }
    const check = isInCheck(state.board, state.turn);
    setStatus(`${playerLabel(state.turn)}${check ? ' · ¡Jaque!' : ''}`);
  }

  function inBounds(r,c){ return r>=0 && r<8 && c>=0 && c<8; }

  function pieceAt(r,c){ return state.board[r][c]; }

  function findKing(color, board){
    for (let r=0;r<8;r++) for (let c=0;c<8;c++){
      const p = board[r][c];
      if (p && p.type === 'K' && p.color === color) return {r,c};
    }
    return null;
  }

  function pseudoMoves(board, r, c, castlingRights, enPassant){
    const p = board[r][c];
    if (!p) return [];
    const moves = [];
    const dir = p.color === 'w' ? -1 : 1;
    const opp = p.color === 'w' ? 'b' : 'w';

    function tryAdd(nr, nc, captureOnly, moveOnly){
      if (!inBounds(nr,nc)) return false;
      const target = board[nr][nc];
      if (!target){
        if (!captureOnly) moves.push({r:nr,c:nc});
        return true;
      } else {
        if (!moveOnly && target.color === opp) moves.push({r:nr,c:nc, capture:true});
        return false;
      }
    }

    if (p.type === 'P'){
      const startRow = p.color === 'w' ? 6 : 1;
      const oneR = r + dir;
      if (inBounds(oneR, c) && !board[oneR][c]){
        moves.push({r:oneR, c});
        const twoR = r + dir*2;
        if (r === startRow && !board[twoR][c]){
          moves.push({r:twoR, c, doubleStep:true});
        }
      }
      for (const dc of [-1,1]){
        const nr = r+dir, nc = c+dc;
        if (inBounds(nr,nc)){
          const target = board[nr][nc];
          if (target && target.color === opp){
            moves.push({r:nr, c:nc, capture:true});
          } else if (enPassant && enPassant.r === nr && enPassant.c === nc){
            moves.push({r:nr, c:nc, capture:true, enPassantCapture:true});
          }
        }
      }
    } else if (p.type === 'N'){
      const deltas = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
      for (const [dr,dc] of deltas) tryAdd(r+dr, c+dc, false, false);
    } else if (p.type === 'K'){
      for (let dr=-1; dr<=1; dr++) for (let dc=-1; dc<=1; dc++){
        if (dr===0 && dc===0) continue;
        tryAdd(r+dr, c+dc, false, false);
      }
      const row = p.color === 'w' ? 7 : 0;
      if (r === row && c === 4){
        const kSide = p.color === 'w' ? castlingRights.wK : castlingRights.bK;
        const qSide = p.color === 'w' ? castlingRights.wQ : castlingRights.bQ;
        if (kSide && !board[row][5] && !board[row][6] && board[row][7] && board[row][7].type==='R' && board[row][7].color===p.color){
          moves.push({r:row, c:6, castle:'K'});
        }
        if (qSide && !board[row][3] && !board[row][2] && !board[row][1] && board[row][0] && board[row][0].type==='R' && board[row][0].color===p.color){
          moves.push({r:row, c:2, castle:'Q'});
        }
      }
    } else {
      let dirs = [];
      if (p.type === 'R') dirs = [[-1,0],[1,0],[0,-1],[0,1]];
      else if (p.type === 'B') dirs = [[-1,-1],[-1,1],[1,-1],[1,1]];
      else if (p.type === 'Q') dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
      for (const [dr,dc] of dirs){
        let nr = r+dr, nc = c+dc;
        while (inBounds(nr,nc)){
          const target = board[nr][nc];
          if (!target){ moves.push({r:nr,c:nc}); }
          else {
            if (target.color === opp) moves.push({r:nr,c:nc, capture:true});
            break;
          }
          nr += dr; nc += dc;
        }
      }
    }
    return moves;
  }

  // MODIFICADO: ahora reutiliza attackersOf (ver abajo) en vez de duplicar el
  // recorrido del tablero.
  function isSquareAttacked(board, r, c, byColor){
    return attackersOf(board, r, c, byColor).length > 0;
  }

  // NUEVO: igual que isSquareAttacked, pero devuelve TODAS las piezas
  // atacantes (no sólo si hay alguna). Se usa para resaltar, durante un
  // jaque, cada pieza que amenaza al rey (antes sólo se resaltaba el rey).
  function attackersOf(board, r, c, byColor){
    const attackers = [];
    for (let rr=0; rr<8; rr++){
      for (let cc=0; cc<8; cc++){
        const p = board[rr][cc];
        if (p && p.color === byColor){
          if (p.type === 'P'){
            const dir = p.color === 'w' ? -1 : 1;
            if (rr+dir === r && (cc-1===c || cc+1===c)) attackers.push({r:rr,c:cc});
          } else if (p.type === 'K'){
            if (Math.abs(rr-r)<=1 && Math.abs(cc-c)<=1) attackers.push({r:rr,c:cc});
          } else {
            const moves = pseudoMoves(board, rr, cc, {wK:false,wQ:false,bK:false,bQ:false}, null);
            if (moves.some(m => m.r===r && m.c===c)) attackers.push({r:rr,c:cc});
          }
        }
      }
    }
    return attackers;
  }

  function isInCheck(board, color){
    const k = findKing(color, board);
    if (!k) return false;
    return isSquareAttacked(board, k.r, k.c, color === 'w' ? 'b' : 'w');
  }

  // =========================================================================
  // NUEVO: formas de tablas además del ahogado (que ya existía).
  //   - positionKey: identifica una posición (piezas + turno + derechos de
  //     enroque + al paso disponible) para poder detectar la TRIPLE
  //     REPETICIÓN de posición.
  //   - isInsufficientMaterial: ningún bando tiene piezas suficientes para
  //     dar jaque mate (Rey vs Rey; Rey+Alfil o Rey+Caballo vs Rey; Rey+Alfil
  //     vs Rey+Alfil de alfiles del mismo color de casilla).
  //   - la REGLA DE LAS 50 JUGADAS usa state.halfmoveClock (ver makeMove).
  // =========================================================================
  function positionKey(board, turn, castling, enPassant){
    let key = turn;
    for (let r=0; r<8; r++){
      for (let c=0; c<8; c++){
        const p = board[r][c];
        key += p ? (p.color + p.type) : '.';
      }
    }
    key += (castling.wK?'1':'0') + (castling.wQ?'1':'0') + (castling.bK?'1':'0') + (castling.bQ?'1':'0');
    key += enPassant ? ('ep' + enPassant.r + enPassant.c) : '';
    return key;
  }

  function isInsufficientMaterial(board){
    const minorPieces = []; // piezas menores no-rey, con el color de casilla si son alfiles
    for (let r=0; r<8; r++){
      for (let c=0; c<8; c++){
        const p = board[r][c];
        if (!p || p.type === 'K') continue;
        if (p.type === 'P' || p.type === 'R' || p.type === 'Q') return false; // material suficiente
        minorPieces.push({ type: p.type, squareColor: (r+c) % 2 });
      }
    }
    if (minorPieces.length === 0) return true; // Rey contra Rey
    if (minorPieces.length === 1) return true; // Rey y una pieza menor contra Rey
    if (minorPieces.length === 2 && minorPieces.every(m => m.type === 'B') && minorPieces[0].squareColor === minorPieces[1].squareColor){
      return true; // Rey y Alfil contra Rey y Alfil, ambos de casillas del mismo color
    }
    return false;
  }

  function simulateMove(board, from, to, moveInfo){
    const newBoard = board.map(row => row.slice());
    const piece = newBoard[from.r][from.c];
    newBoard[to.r][to.c] = piece;
    newBoard[from.r][from.c] = null;
    if (moveInfo.enPassantCapture){
      newBoard[from.r][to.c] = null;
    }
    if (moveInfo.castle === 'K'){
      const row = from.r;
      newBoard[row][5] = newBoard[row][7];
      newBoard[row][7] = null;
    } else if (moveInfo.castle === 'Q'){
      const row = from.r;
      newBoard[row][3] = newBoard[row][0];
      newBoard[row][0] = null;
    }
    if (moveInfo.promotion){
      newBoard[to.r][to.c] = { type: moveInfo.promotion, color: piece.color };
    }
    return newBoard;
  }

  function legalMovesFor(r, c){
    const p = pieceAt(r,c);
    if (!p) return [];
    const pseudos = pseudoMoves(state.board, r, c, state.castling, state.enPassant);
    const legal = [];
    for (const m of pseudos){
      if (m.castle){
        const row = r;
        const opp = p.color === 'w' ? 'b' : 'w';
        if (isSquareAttacked(state.board, row, 4, opp)) continue;
        const passCol = m.castle === 'K' ? 5 : 3;
        if (isSquareAttacked(state.board, row, passCol, opp)) continue;
        if (isSquareAttacked(state.board, row, m.c, opp)) continue;
      }
      const simulated = simulateMove(state.board, {r,c}, {r:m.r,c:m.c}, m);
      if (!isInCheck(simulated, p.color)){
        legal.push(m);
      }
    }
    return legal;
  }

  function allLegalMoves(color){
    const all = [];
    for (let r=0;r<8;r++) for (let c=0;c<8;c++){
      const p = state.board[r][c];
      if (p && p.color === color){
        const moves = legalMovesFor(r,c);
        for (const m of moves) all.push({from:{r,c}, to:{r:m.r,c:m.c}, info:m});
      }
    }
    return all;
  }

  function squareName(r,c){ return FILES[c] + (8-r); }

  function makeMove(from, to, moveInfo){
    pushHistorySnapshot();
    const piece = state.board[from.r][from.c];
    const captured = state.board[to.r][to.c];
    let epCaptured = null;

    if (moveInfo.enPassantCapture){
      epCaptured = state.board[from.r][to.c];
      state.board[from.r][to.c] = null;
    }

    state.board[to.r][to.c] = piece;
    state.board[from.r][from.c] = null;

    if (moveInfo.castle === 'K'){
      state.board[from.r][5] = state.board[from.r][7];
      state.board[from.r][7] = null;
    } else if (moveInfo.castle === 'Q'){
      state.board[from.r][3] = state.board[from.r][0];
      state.board[from.r][0] = null;
    }

    if (piece.type === 'K') state.kingsPos[piece.color] = {r:to.r, c:to.c};

    if (piece.type === 'K'){
      if (piece.color === 'w'){ state.castling.wK = false; state.castling.wQ = false; }
      else { state.castling.bK = false; state.castling.bQ = false; }
    }
    if (piece.type === 'R'){
      if (from.r===7 && from.c===0) state.castling.wQ = false;
      if (from.r===7 && from.c===7) state.castling.wK = false;
      if (from.r===0 && from.c===0) state.castling.bQ = false;
      if (from.r===0 && from.c===7) state.castling.bK = false;
    }
    if (captured && captured.type === 'R'){
      if (to.r===7 && to.c===0) state.castling.wQ = false;
      if (to.r===7 && to.c===7) state.castling.wK = false;
      if (to.r===0 && to.c===0) state.castling.bQ = false;
      if (to.r===0 && to.c===7) state.castling.bK = false;
    }

    state.enPassant = null;
    if (piece.type === 'P' && moveInfo.doubleStep){
      const midR = (from.r + to.r) / 2;
      state.enPassant = { r: midR, c: from.c };
    }

    const takenPiece = captured || epCaptured;
    if (takenPiece){
      if (piece.color === 'w') state.capturedByWhite.push(takenPiece);
      else state.capturedByBlack.push(takenPiece);
    }

    // NUEVO: regla de las 50 jugadas — se reinicia el conteo con cualquier
    // captura o movimiento de peón; en cualquier otro caso, suma una jugada.
    if (piece.type === 'P' || takenPiece) state.halfmoveClock = 0;
    else state.halfmoveClock += 1;

    // NUEVO: sonido de movimiento o captura, según corresponda
    if (takenPiece) playCaptureSound(); else playMoveSound();

    const doFinish = (promotionType) => {
      if (promotionType){
        state.board[to.r][to.c] = { type: promotionType, color: piece.color };
      }
      finalizeMove(piece, from, to, moveInfo, !!takenPiece, promotionType);
    };

    if (moveInfo.promotion === undefined && piece.type === 'P' && (to.r === 0 || to.r === 7)){
      openPromotionDialog(piece.color, doFinish);
    } else {
      doFinish(null);
    }
  }

  // Diálogo de coronación: los botones ahora muestran la imagen .png de cada pieza
  function openPromotionDialog(color, callback){
    promoChoices.innerHTML = '';
    ['Q','R','B','N'].forEach(type => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'promo-btn';
      btn.innerHTML = pieceImgHTML(color, type);
      btn.setAttribute('aria-label', PIECE_NAMES[type]);
      btn.addEventListener('click', () => {
        promoDialog.close();
        callback(type);
      });
      promoChoices.appendChild(btn);
    });
    promoDialog.showModal();
  }

  // MODIFICADO: antes devolvía un string con la letra de la pieza (N, B, R,
  // Q, K). Ahora devuelve un objeto: el ícono de la pieza (en su color) se
  // arma aparte en renderMoveList(), y acá sólo queda el resto de la
  // notación (captura, casilla destino, coronación, jaque/mate). El enroque
  // no lleva ícono, ya que "O-O"/"O-O-O" no representa a una sola pieza.
  function algebraic(piece, from, to, moveInfo, isCapture, promotionType, isCheck, isMate){
    if (moveInfo.castle === 'K') return { castle: true, text: isMate ? 'O-O#' : (isCheck ? 'O-O+' : 'O-O') };
    if (moveInfo.castle === 'Q') return { castle: true, text: isMate ? 'O-O-O#' : (isCheck ? 'O-O-O+' : 'O-O-O') };
    let s = '';
    if (isCapture){
      if (piece.type === 'P') s += FILES[from.c];
      s += 'x';
    }
    s += squareName(to.r, to.c);
    if (promotionType) s += '=' + promotionType;
    if (isMate) s += '#';
    else if (isCheck) s += '+';
    return { castle: false, pieceType: piece.type, color: piece.color, text: s };
  }

  function finalizeMove(piece, from, to, moveInfo, wasCapture, promotionType){
    state.clockStarted = true; // NUEVO: el reloj arranca a correr recién con la primera jugada real
    const nextTurn = piece.color === 'w' ? 'b' : 'w';
    const check = isInCheck(state.board, nextTurn);
    const opponentMoves = allLegalMovesFor(nextTurn);
    const mate = check && opponentMoves.length === 0;
    const stalemate = !check && opponentMoves.length === 0;

    // NUEVO: registra la posición resultante (para triple repetición) y
    // revisa las demás formas de tablas automáticas.
    const posKey = positionKey(state.board, nextTurn, state.castling, state.enPassant);
    state.positionHistory.push(posKey);
    const repetitionCount = state.positionHistory.filter(k => k === posKey).length;
    const repetitionDraw = !mate && !stalemate && repetitionCount >= 3;
    const fiftyMoveDraw = !mate && !stalemate && !repetitionDraw && state.halfmoveClock >= 100;
    const insufficientDraw = !mate && !stalemate && !repetitionDraw && !fiftyMoveDraw && isInsufficientMaterial(state.board);

    const notation = algebraic(piece, from, to, moveInfo, wasCapture, promotionType, check, mate);
    recordMove(piece.color, notation);
    // NUEVO: si hay reloj configurado, el jugador que acaba de mover suma su
    // incremento (tipo Fischer) — se aplica después de la jugada, como en un
    // reloj real.
    if (state.clockConfig) state.clocks[piece.color] += state.clockConfig.incrementMs;

    state.lastMove = { from, to };
    state.turn = nextTurn;
    state.selected = null;
    state.legalForSelected = [];

    // MODIFICADO: la pieza recién movida ahora se DESLIZA desde su casilla de
    // origen (antes aparecía directamente en la casilla destino). Si la
    // jugada fue un enroque, la torre también se desliza; si hubo captura
    // (normal o al paso), la pieza capturada se desvanece en su lugar. El
    // giro automático del tablero se dispara recién cuando termina el
    // deslizamiento (ver animateMoveThenOrient).
    let extraSlide = null;
    if (moveInfo.castle === 'K') extraSlide = { from: {r: from.r, c: 7}, to: {r: from.r, c: 5} };
    else if (moveInfo.castle === 'Q') extraSlide = { from: {r: from.r, c: 0}, to: {r: from.r, c: 3} };

    let capturedSquare = null;
    if (wasCapture) capturedSquare = moveInfo.enPassantCapture ? { r: from.r, c: to.c } : { r: to.r, c: to.c };

    animateMoveThenOrient({ from, to, extraSlide, capturedSquare, promoted: !!promotionType });
    updateClockDisplay();

    if (mate){
      setStatus(`Jaque mate — gana ${piece.color === 'w' ? 'Jugador 1 (Blancas)' : 'Jugador 2 (Negras)'}`);
      state.gameOver = true;
      playEndSound();
    } else if (stalemate){
      setStatus('Tablas por ahogado');
      state.gameOver = true;
      playEndSound();
    } else if (repetitionDraw){
      // NUEVO: triple repetición de posición
      setStatus('Tablas por triple repetición de posición');
      state.gameOver = true;
      playEndSound();
    } else if (fiftyMoveDraw){
      // NUEVO: regla de las 50 jugadas
      setStatus('Tablas por la regla de las 50 jugadas');
      state.gameOver = true;
      playEndSound();
    } else if (insufficientDraw){
      // NUEVO: ningún bando tiene material suficiente para dar mate
      setStatus('Tablas por material insuficiente');
      state.gameOver = true;
      playEndSound();
    } else {
      setStatus(`${playerLabel(nextTurn)}${check ? ' · ¡Jaque!' : ''}`);
      if (check) playCheckSound(); // NUEVO
    }
  }

  function allLegalMovesFor(color){
    return allLegalMoves(color);
  }

  // MODIFICADO: ahora guarda el objeto que devuelve algebraic() (moveData)
  // en vez de un string ya armado; quien arma el DOM de la lista es
  // renderMoveList(), así "Deshacer"/"Rehacer" pueden reconstruirla sin
  // parchear nodos a mano.
  function recordMove(color, moveData){
    state.moveLog.push({ moveNumber: state.moveNumber, color, moveData });
    if (color === 'b') state.moveNumber += 1;
    renderMoveList();
  }

  // NUEVO: arma el contenido de una jugada para la lista: el ícono de la
  // pieza jugada (en su color), en vez de la inicial de letra de siempre,
  // seguido del resto de la notación. El enroque se muestra sólo como texto.
  function buildMoveContent(moveData){
    const frag = document.createDocumentFragment();
    if (!moveData.castle){
      const icon = document.createElement('span');
      icon.className = 'move-piece-icon';
      icon.innerHTML = pieceImgHTML(moveData.color, moveData.pieceType);
      frag.appendChild(icon);
    }
    const text = document.createElement('span');
    text.textContent = moveData.text;
    frag.appendChild(text);
    return frag;
  }

  // NUEVO: reconstruye toda la lista de jugadas a partir de state.moveLog.
  // Sólo la última fila agregada recibe la animación de entrada (.move-in).
  function renderMoveList(){
    moveListEl.innerHTML = '';
    for (let i = 0; i < state.moveLog.length; i += 2){
      const whiteEntry = state.moveLog[i];
      const blackEntry = state.moveLog[i + 1];
      const li = document.createElement('li');
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = whiteEntry.moveNumber + '.';
      li.appendChild(num);
      const w = document.createElement('span');
      w.className = 'w';
      w.appendChild(buildMoveContent(whiteEntry.moveData));
      li.appendChild(w);
      if (blackEntry){
        const b = document.createElement('span');
        b.className = 'b';
        b.appendChild(buildMoveContent(blackEntry.moveData));
        li.appendChild(b);
      }
      moveListEl.appendChild(li);
    }
    if (moveListEl.lastElementChild) moveListEl.lastElementChild.classList.add('move-in');
    moveListEl.scrollTop = moveListEl.scrollHeight;
  }

  // =========================================================================
  // MODIFICADO: render(mode)
  //  - las piezas ahora son <img> apuntando a assets/pieces/*.png (antes SVG
  //    inline)
  //  - "mode" reemplaza al viejo booleano "animateMove":
  //      'all'  -> todas las piezas aparecen con un "pop" suave (carga
  //                inicial, nueva partida, deshacer)
  //      'last' -> sólo la pieza de la última jugada usa el "pop" (respaldo
  //                por si no se pudo calcular el deslizamiento FLIP)
  //      sin valor / cualquier otro -> sin animación de aparición (se usa
  //                antes de deslizar piezas a mano, o para refrescos simples
  //                como seleccionar una casilla)
  //  - el recorrido de filas/columnas se invierte según state.flipped
  //    (giro automático de tablero, ver setOrientationForTurn)
  // =========================================================================
  function render(mode){
    boardEl.innerHTML = '';
    const inCheckColor = isInCheck(state.board, state.turn) ? state.turn : null;
    const kingPos = inCheckColor ? findKing(inCheckColor, state.board) : null;
    // NUEVO: además del rey, se identifican todas las piezas que lo atacan
    const attackers = kingPos ? attackersOf(state.board, kingPos.r, kingPos.c, inCheckColor==='w'?'b':'w') : [];

    const rowOrder = state.flipped ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];
    const colOrder = state.flipped ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];
    const leftCol = colOrder[0];
    const bottomRow = rowOrder[7];

    for (const r of rowOrder){
      for (const c of colOrder){
        const sq = document.createElement('div');
        const isLight = (r+c) % 2 === 0;
        sq.className = 'sq ' + (isLight ? 'light' : 'dark');
        sq.dataset.r = r;
        sq.dataset.c = c;

        if (state.lastMove){
          if (state.lastMove.from.r===r && state.lastMove.from.c===c) sq.classList.add('last-from');
          if (state.lastMove.to.r===r && state.lastMove.to.c===c) sq.classList.add('last-to');
        }
        if (kingPos && kingPos.r===r && kingPos.c===c) sq.classList.add('in-check');
        if (attackers.some(a => a.r===r && a.c===c)) sq.classList.add('checking-piece'); // NUEVO

        if (c === leftCol){
          const rankLbl = document.createElement('span');
          rankLbl.className = 'coord rank';
          rankLbl.textContent = 8-r;
          sq.appendChild(rankLbl);
        }
        if (r === bottomRow){
          const fileLbl = document.createElement('span');
          fileLbl.className = 'coord file';
          fileLbl.textContent = FILES[c];
          sq.appendChild(fileLbl);
        }

        const p = state.board[r][c];
        if (p){
          const isMoveTarget = mode === 'last' && state.lastMove && state.lastMove.to.r===r && state.lastMove.to.c===c;
          const pop = mode === 'all' || isMoveTarget;
          const pieceWrap = document.createElement('span');
          pieceWrap.className = 'piece';
          pieceWrap.innerHTML = pieceImgHTML(p.color, p.type, pop ? 'piece-drop' : '');
          sq.appendChild(pieceWrap);
        }

        if (state.selected && state.selected.r===r && state.selected.c===c){
          sq.classList.add('selected');
          // NUEVO: si la pieza seleccionada no tiene ningún movimiento legal
          // (está bloqueada o clavada), el marco de selección se pinta en
          // rojo en vez del color de acento (ver .selected-blocked en CSS).
          if (state.legalForSelected.length === 0) sq.classList.add('selected-blocked');
        }
        const moveHere = state.legalForSelected.find(m => m.r===r && m.c===c);
        if (moveHere){
          sq.classList.add(moveHere.capture ? 'move-capture' : 'move-dot');
        }

        // MODIFICADO: ya no se agrega un listener de "click" por casilla; los
        // clicks Y el arrastre (drag & drop) se manejan por delegación desde
        // un único listener de "pointerdown" en boardEl (ver
        // onBoardPointerDown/onBoardPointerUp), así ambas formas de jugar
        // conviven sin pisarse.
        boardEl.appendChild(sq);
      }
    }

    updateLastMoveArrow(); // NUEVO
    renderCaptured();
  }

  // NUEVO: convierte coordenadas lógicas (fila/columna 0-7) a coordenadas
  // visuales en porcentaje (0-100), respetando el giro automático del
  // tablero (state.flipped). Lo usa la flecha de última jugada.
  function visualCoords(r, c){
    const vr = state.flipped ? 7 - r : r;
    const vc = state.flipped ? 7 - c : c;
    return { x: (vc + 0.5) * 12.5, y: (vr + 0.5) * 12.5 }; // 100 / 8 casillas = 12.5
  }

  // NUEVO: dibuja (o borra) la flecha que marca de dónde a dónde fue la
  // última jugada, como en chess.com/lichess. Se redibuja en cada render().
  function updateLastMoveArrow(){
    if (!state.lastMove){ lastMoveArrowEl.innerHTML = ''; return; }
    const from = visualCoords(state.lastMove.from.r, state.lastMove.from.c);
    const to = visualCoords(state.lastMove.to.r, state.lastMove.to.c);
    // Acorta un poco la línea para que la punta de flecha no quede tapada por la pieza
    const dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const shorten = 5.5;
    const endX = to.x - (dx / len) * shorten;
    const endY = to.y - (dy / len) * shorten;
    lastMoveArrowEl.innerHTML =
      '<defs><marker id="arrowHead" markerWidth="3.4" markerHeight="3.4" refX="1.4" refY="1.7" orient="auto">' +
      '<path class="arrow-head" d="M0,0 L3.4,1.7 L0,3.4 z" /></marker></defs>' +
      '<line class="arrow-line" x1="' + from.x + '" y1="' + from.y + '" x2="' + endX + '" y2="' + endY + '" ' +
      'stroke-width="1.6" stroke-linecap="round" marker-end="url(#arrowHead)" opacity="0.75" />';
  }

  function pieceValueSort(a,b){ return VALUE[b.type] - VALUE[a.type]; }

  // MODIFICADO: usa <img> (pieceImgHTML) en vez del glifo/SVG anterior
  // NUEVO: recuerda el último texto mostrado en cada diferencia de material,
  // para animar sólo cuando el valor realmente cambia (renderCaptured se
  // llama en cada render(), no sólo cuando hay una captura nueva).
  let lastWhiteDiffText = '';
  let lastBlackDiffText = '';

  function renderCaptured(){
    capWhiteEl.innerHTML = '';
    if (state.capturedByWhite.length === 0){
      // NUEVO: detalle — mientras nadie capturó nada todavía, un texto lo aclara
      capWhiteEl.innerHTML = '<span class="empty-hint text-pop">Esperando la primera captura</span>';
    } else {
      state.capturedByWhite.slice().sort(pieceValueSort).forEach(p => {
        const s = document.createElement('span');
        s.className = 'mini-piece';
        s.innerHTML = pieceImgHTML(p.color, p.type);
        capWhiteEl.appendChild(s);
      });
    }
    capBlackEl.innerHTML = '';
    if (state.capturedByBlack.length === 0){
      capBlackEl.innerHTML = '<span class="empty-hint text-pop">Esperando la primera captura</span>';
    } else {
      state.capturedByBlack.slice().sort(pieceValueSort).forEach(p => {
        const s = document.createElement('span');
        s.className = 'mini-piece';
        s.innerHTML = pieceImgHTML(p.color, p.type);
        capBlackEl.appendChild(s);
      });
    }

    // NUEVO: diferencia de material — por cuántos puntos va ganando cada
    // bando según el valor de las piezas que le capturó al otro (VALUE).
    // Sólo se muestra el signo "+N" del lado que va ganando; si están
    // iguales, no se muestra nada en ninguno de los dos.
    const whiteValue = state.capturedByWhite.reduce((sum, p) => sum + VALUE[p.type], 0);
    const blackValue = state.capturedByBlack.reduce((sum, p) => sum + VALUE[p.type], 0);
    const diff = whiteValue - blackValue;
    const whiteDiffText = diff > 0 ? ('+' + diff) : '';
    const blackDiffText = diff < 0 ? ('+' + (-diff)) : '';
    // MODIFICADO: sólo se anima cuando el texto realmente cambió, para que
    // no "parpadee" de más en cada redibujado del tablero.
    if (whiteDiffText !== lastWhiteDiffText){ capWhiteDiffEl.textContent = whiteDiffText; animateTextChange(capWhiteDiffEl); lastWhiteDiffText = whiteDiffText; }
    if (blackDiffText !== lastBlackDiffText){ capBlackDiffEl.textContent = blackDiffText; animateTextChange(capBlackDiffEl); lastBlackDiffText = blackDiffText; }
  }

  // =========================================================================
  // MODIFICADO: selección/movimiento por click Y arrastre (drag & drop),
  // unificados. trySelectOrMove() es la lógica común (antes vivía sólo en
  // onSquareClick); ahora también la usa el arrastre al soltar una pieza.
  // Se usan eventos "pointer" (no el "click" nativo ni HTML5 drag&drop) para
  // que funcione igual con mouse, dedo o lápiz óptico.
  // =========================================================================
  let pointerDrag = null; // estado del arrastre en curso, o null si no hay ninguno
  let dragHoverSq = null; // casilla resaltada mientras se arrastra sobre ella

  function trySelectOrMove(r, c){
    if (state.gameOver) return;
    const p = pieceAt(r, c);
    if (state.selected){
      const move = state.legalForSelected.find(m => m.r===r && m.c===c);
      if (move){
        makeMove(state.selected, {r,c}, move);
        return;
      }
      if (p && p.color === state.turn){
        selectSquare(r,c);
      } else {
        // NUEVO: si el destino tenía sentido para el TIPO de pieza pero
        // quedó afuera de legalForSelected específicamente por dejar el
        // propio rey en jaque, se avisa con un mensaje claro (antes sólo se
        // deseleccionaba en silencio, sin explicar por qué no era válido).
        const sel = state.selected;
        const pseudos = pseudoMoves(state.board, sel.r, sel.c, state.castling, state.enPassant);
        if (pseudos.some(m => m.r===r && m.c===c)){
          showToast('Ese movimiento deja tu rey en jaque');
        }
        state.selected = null;
        state.legalForSelected = [];
        render();
      }
      return;
    }
    if (p && p.color === state.turn){
      selectSquare(r,c);
    }
  }

  function onBoardPointerDown(e){
    if (state.gameOver) return;
    if (e.button !== undefined && e.button !== 0) return; // sólo botón principal del mouse
    const sq = e.target.closest('.sq');
    if (!sq) return;
    const r = parseInt(sq.dataset.r, 10), c = parseInt(sq.dataset.c, 10);
    const p = pieceAt(r, c);
    if (!p || p.color !== state.turn){
      // No hay pieza propia para "levantar": el gesto se resuelve como un
      // click normal recién en pointerup (puede ser, por ejemplo, el
      // segundo click de un click-click para mover una pieza ya seleccionada).
      pointerDrag = { dragging: false, r, c };
    } else {
      pointerDrag = {
        dragging: true, moved: false, r, c,
        startX: e.clientX, startY: e.clientY,
        legalMoves: legalMovesFor(r, c),
        ghost: null
      };
      state.selected = { r, c };
      state.legalForSelected = pointerDrag.legalMoves;
      render();
      window.addEventListener('pointermove', onBoardPointerMove);
    }
    // CORRECCIÓN DE BUG: este listener antes sólo se agregaba en la rama de
    // "dragging=true" (cuando se levantaba una pieza propia). Por eso el
    // SEGUNDO click de un click-click —sobre una casilla vacía o con una
    // pieza rival, para completar el movimiento— nunca disparaba pointerup,
    // y mover haciendo click dejó de funcionar (el arrastre seguía andando
    // porque ese sí pasaba siempre por la otra rama). Ahora se agrega
    // siempre, sea cual sea el caso.
    window.addEventListener('pointerup', onBoardPointerUp, { once: true });
  }

  function onBoardPointerMove(e){
    if (!pointerDrag || !pointerDrag.dragging) return;
    const dx = e.clientX - pointerDrag.startX;
    const dy = e.clientY - pointerDrag.startY;
    if (!pointerDrag.moved){
      if (Math.hypot(dx, dy) < 4) return; // NUEVO: umbral mínimo para distinguir un click de un arrastre real
      pointerDrag.moved = true;
      startDragGhost(pointerDrag, e);
    }
    moveDragGhost(pointerDrag, e);
    updateDragHoverSquare(e);
  }

  function onBoardPointerUp(e){
    window.removeEventListener('pointermove', onBoardPointerMove);
    const drag = pointerDrag;
    pointerDrag = null;
    if (!drag) return;
    clearDragHoverSquare();
    if (drag.dragging && drag.moved){
      removeDragGhost(drag);
      const targetEl = document.elementFromPoint(e.clientX, e.clientY);
      const sq = targetEl ? targetEl.closest('.sq') : null;
      if (sq){
        const r = parseInt(sq.dataset.r, 10), c = parseInt(sq.dataset.c, 10);
        if (r === drag.r && c === drag.c){
          render(); // soltó la pieza sobre su propia casilla: no hace nada, mantiene la selección
        } else {
          trySelectOrMove(r, c);
        }
      } else {
        render(); // soltó fuera del tablero: cancela el arrastre, mantiene la selección
      }
    } else {
      // No hubo arrastre real (o el pointerdown fue sobre casilla ajena o
      // vacía): se comporta exactamente igual que el click de siempre.
      trySelectOrMove(drag.r, drag.c);
    }
  }

  // Crea la copia "levantada" de la pieza que sigue al puntero mientras se arrastra
  function startDragGhost(drag, e){
    const src = getPieceImgEl(drag.r, drag.c);
    if (!src) return;
    const rect = src.getBoundingClientRect();
    src.classList.add('piece-drag-source'); // atenúa la pieza original
    const ghost = document.createElement('img');
    ghost.src = src.getAttribute('src');
    ghost.alt = '';
    ghost.className = 'piece-img piece-drag-ghost';
    const w = rect.width * 1.15, h = rect.height * 1.15; // se ve un poco más grande al "levantarla"
    ghost.style.width = w + 'px';
    ghost.style.height = h + 'px';
    ghost.style.left = (e.clientX - w/2) + 'px';
    ghost.style.top = (e.clientY - h/2) + 'px';
    document.body.appendChild(ghost);
    drag.ghost = ghost;
    drag.ghostHalfW = w/2;
    drag.ghostHalfH = h/2;
  }
  function moveDragGhost(drag, e){
    if (!drag.ghost) return;
    drag.ghost.style.left = (e.clientX - drag.ghostHalfW) + 'px';
    drag.ghost.style.top = (e.clientY - drag.ghostHalfH) + 'px';
  }
  function removeDragGhost(drag){
    if (drag.ghost) drag.ghost.remove();
    // La pieza original desaparece igual al redibujar el tablero (render()),
    // así que no hace falta quitarle la clase 'piece-drag-source' a mano.
  }
  function updateDragHoverSquare(e){
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const sq = el ? el.closest('.sq') : null;
    if (sq === dragHoverSq) return;
    if (dragHoverSq) dragHoverSq.classList.remove('drag-hover');
    dragHoverSq = sq;
    if (dragHoverSq) dragHoverSq.classList.add('drag-hover');
  }
  function clearDragHoverSquare(){
    if (dragHoverSq) dragHoverSq.classList.remove('drag-hover');
    dragHoverSq = null;
  }

  boardEl.addEventListener('pointerdown', onBoardPointerDown); // NUEVO: reemplaza al listener de click por casilla

  function selectSquare(r,c){
    state.selected = {r,c};
    state.legalForSelected = legalMovesFor(r,c);
    render();
  }

  function reset(){
    cancelPendingAnims(); // NUEVO
    state.board = initialBoard();
    state.turn = 'w';
    state.selected = null;
    state.legalForSelected = [];
    state.lastMove = null;
    state.history = [];
    state.future = []; // NUEVO
    state.castling = { wK:true, wQ:true, bK:true, bQ:true };
    state.enPassant = null;
    state.capturedByWhite = [];
    state.capturedByBlack = [];
    state.moveNumber = 1;
    state.moveLog = []; // NUEVO
    state.halfmoveClock = 0; // NUEVO
    state.clockStarted = false; // NUEVO: la partida nueva no arranca el reloj hasta la primera jugada
    state.kingsPos = { w:{r:7,c:4}, b:{r:0,c:4} };
    state.gameOver = false;
    state.flipped = false; // NUEVO: nueva partida siempre arranca del lado de las blancas
    // NUEVO: la posición inicial cuenta como la primera aparición, para la triple repetición
    state.positionHistory = [positionKey(state.board, state.turn, state.castling, state.enPassant)];
    // NUEVO: si hay un control de tiempo elegido, la partida nueva arranca con el tiempo completo
    if (state.clockConfig) state.clocks = { w: state.clockConfig.initialMs, b: state.clockConfig.initialMs };
    moveListEl.innerHTML = '';
    setStatus(playerLabel('w'));
    toastEl.classList.remove('show'); // NUEVO
    updateClockDisplay(); // NUEVO
    render('all'); // MODIFICADO: todas las piezas aparecen con un "pop" suave al iniciar
  }

  function undo(){
    if (state.history.length === 0) return;
    cancelPendingAnims(); // NUEVO: evita que una animación de la jugada anterior pise este cambio
    state.future.push(fullSnapshot()); // guarda el estado actual para poder "rehacer"
    restoreSnapshot(state.history.pop());
  }

  // NUEVO: rehace la última jugada deshecha
  function redo(){
    if (state.future.length === 0) return;
    cancelPendingAnims(); // NUEVO
    state.history.push(fullSnapshot());
    restoreSnapshot(state.future.pop());
  }

  // =========================================================================
  // NUEVO: botones de "confirmación por clicks repetidos". En vez de actuar
  // al primer click, cuentan cuántas veces se los presiona seguido (con el
  // mismo espíritu que "mantener presionado" en otras apps) y sólo disparan
  // la acción real al llegar a "requiredClicks". Si se dejan de presionar
  // por más de 1.2s, el contador se reinicia. El propio botón muestra el
  // progreso (texto "(n/N)" + relleno de color, ver CSS: button.confirming).
  // =========================================================================
  function setupMultiClickButton(btn, requiredClicks, baseLabel, action){
    const labelEl = btn.querySelector('.btn-label');
    let count = 0;
    let resetTimer = null;
    function update(){
      labelEl.textContent = count > 0 ? `${baseLabel} (${count}/${requiredClicks})` : baseLabel;
      btn.style.setProperty('--progress', (count / requiredClicks * 100) + '%');
      btn.classList.toggle('confirming', count > 0);
    }
    function reset(){
      count = 0;
      update();
    }
    btn.addEventListener('click', () => {
      count += 1;
      if (resetTimer) window.clearTimeout(resetTimer);
      if (count >= requiredClicks){
        reset();
        action();
      } else {
        update();
        resetTimer = window.setTimeout(reset, 1200);
      }
    });
  }

  // NUEVO: 5 clicks seguidos para iniciar una partida nueva
  setupMultiClickButton(document.getElementById('resetBtn'), 5, 'Nueva partida', reset);
  document.getElementById('undoBtn').addEventListener('click', undo);
  document.getElementById('redoBtn').addEventListener('click', redo); // NUEVO
  themeBtn.addEventListener('click', toggleTheme);
  soundBtn.addEventListener('click', toggleSound); // NUEVO

  // NUEVO: tablas por acuerdo mutuo (una de las formas de tablas del ajedrez).
  // Al ser una partida local en la misma pantalla, cualquiera de los dos
  // puede proponerlas; requiere 10 clicks seguidos en el botón y, además,
  // una confirmación antes de terminar la partida.
  setupMultiClickButton(document.getElementById('drawBtn'), 10, 'Tablas', () => {
    if (state.gameOver) return;
    askConfirm('Ofrecimiento de tablas', '¿Ambos jugadores están de acuerdo en terminar la partida en tablas?', () => {
      state.gameOver = true;
      setStatus('Tablas por acuerdo mutuo');
      playEndSound();
    });
  });

  applyTheme(getPreferredTheme());
  applySoundIcon(); // NUEVO: fija el ícono de sonido según lo guardado
  // NUEVO: la posición inicial cuenta como la primera aparición, para la triple repetición
  state.positionHistory = [positionKey(state.board, state.turn, state.castling, state.enPassant)];
  updateClockDisplay(); // NUEVO: oculta la fila de relojes hasta que se elija un control de tiempo
  render('all'); // MODIFICADO: las piezas aparecen con un "pop" suave al cargar la página
})();
