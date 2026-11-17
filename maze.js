// Labirinto da página de entrada.
// O início é o ícone do favicon (canto de cima à esquerda); a pessoa desenha o
// caminho com o dedo (ou rato) até ao fim. Há som enquanto desenha e ao concluir.
const N = 1, E = 2, S = 4, W = 8;
const DX = { [N]: 0, [E]: 1, [S]: 0, [W]: -1 };
const DY = { [N]: -1, [E]: 0, [S]: 1, [W]: 0 };
const OPP = { [N]: S, [E]: W, [S]: N, [W]: E };
const DIRS = [N, E, S, W];

export function initMaze(host, opts = {}) {
  const { onSolved, onStart, iconSrc } = opts;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; display:block; touch-action:none; cursor:pointer;';
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const icon = new Image();
  let iconReady = false;
  icon.onload = () => { iconReady = true; };
  if (iconSrc) icon.src = iconSrc;

  let W_ = 0, H_ = 0, dpr = 1;
  let cols = 0, rows = 0, cell = 0, ox = 0, oy = 0, key = '';
  let active = [];         // célula faz parte do labirinto?
  let walls = [];          // bitmask de paredes por célula
  let startCell = 0, end = 0;
  let path = [];
  let solved = false, dragging = false, finger = null, lastPt = null, started = false;
  let raf = 0, destroyed = false;

  const idx = (cx, cy) => cy * cols + cx;
  const inside = (cx, cy) => cx >= 0 && cy >= 0 && cx < cols && cy < rows && active[idx(cx, cy)];
  const center = (i) => ({ x: ox + (i % cols + 0.5) * cell, y: oy + (Math.floor(i / cols) + 0.5) * cell });

  // ---------- som ----------
  let ac = null, master = null, lastTick = 0;
  const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]; // pentatónica maior
  function audio() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return ac; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.9;
    master.connect(ac.destination);
    return ac;
  }
  function note(freq, t, dur, vol, type) {
    const o = ac.createOscillator(); o.type = type || 'sine'; o.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function tick(len, back) {
    if (!audio()) return;
    const now = ac.currentTime;
    if (now - lastTick < 0.045) return;        // não dispara em rajada
    lastTick = now;
    const semi = scale[(Math.floor(len / 2)) % scale.length];
    const f = 392 * Math.pow(2, semi / 12);
    note(back ? f * 0.75 : f, now, back ? 0.14 : 0.22, back ? 0.035 : 0.06, 'sine');
    if (!back) note(f * 2, now, 0.12, 0.018, 'sine');
  }
  function bump() {
    if (!audio()) return;
    const now = ac.currentTime;
    if (now - lastTick < 0.18) return;
    lastTick = now;
    note(130, now, 0.1, 0.05, 'triangle');
  }
  function fanfare() {
    if (!audio()) return;
    const t0 = ac.currentTime + 0.02;
    [0, 4, 7, 12, 16, 19, 24].forEach((semi, i) => {
      const t = t0 + i * 0.075;
      const f = 523.25 * Math.pow(2, semi / 12);
      note(f, t, 0.9, 0.07, 'sine');
      note(f * 3.01, t, 0.35, 0.02, 'sine');
    });
    // acorde final
    [0, 4, 7, 12].forEach((semi) => note(523.25 * Math.pow(2, semi / 12), t0 + 0.6, 1.4, 0.05, 'triangle'));
  }

  function generate() {
    active = new Array(cols * rows).fill(true);
    startCell = 0;                                      // boneca no canto de cima à esquerda

    // recursive backtracker só nas células ativas
    walls = new Array(cols * rows).fill(N | E | S | W);
    const seen = new Array(cols * rows).fill(false);
    const stack = [startCell];
    seen[startCell] = true;
    while (stack.length) {
      const cur = stack[stack.length - 1];
      const cx = cur % cols, cy = Math.floor(cur / cols);
      const options = DIRS.filter((d) => inside(cx + DX[d], cy + DY[d]) && !seen[idx(cx + DX[d], cy + DY[d])]);
      if (!options.length) { stack.pop(); continue; }
      const d = options[Math.floor(Math.random() * options.length)];
      const nxt = idx(cx + DX[d], cy + DY[d]);
      walls[cur] &= ~d; walls[nxt] &= ~OPP[d];
      seen[nxt] = true; stack.push(nxt);
    }
    // mais simples: abre ~35% das paredes interiores (cria atalhos e menos becos sem saída)
    for (let i = 0; i < cols * rows; i++) {
      if (!active[i]) continue;
      const cx = i % cols, cy = Math.floor(i / cols);
      [E, S].forEach((d) => {
        const nx = cx + DX[d], ny = cy + DY[d];
        if ((walls[i] & d) && inside(nx, ny) && Math.random() < 0.35) { walls[i] &= ~d; walls[idx(nx, ny)] &= ~OPP[d]; }
      });
    }
    // fim: célula mais distante do início
    const dist = new Array(cols * rows).fill(-1);
    dist[startCell] = 0;
    const q = [startCell]; let far = startCell;
    while (q.length) {
      const cur = q.shift();
      if (dist[cur] > dist[far]) far = cur;
      const cx = cur % cols, cy = Math.floor(cur / cols);
      DIRS.forEach((d) => {
        if (walls[cur] & d) return;
        const nxt = idx(cx + DX[d], cy + DY[d]);
        if (dist[nxt] < 0) { dist[nxt] = dist[cur] + 1; q.push(nxt); }
      });
    }
    end = far;
    path = [startCell];
    solved = false;
  }

  function layout() {
    const r = host.getBoundingClientRect();
    W_ = Math.max(1, r.width); H_ = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W_ * dpr);
    canvas.height = Math.round(H_ * dpr);
    const small = W_ < 600;
    const nCell = small ? 42 : 46;
    const maxW = small ? 252 : 368, maxH = small ? 294 : 276;
    const nc = Math.max(4, Math.floor(Math.min(W_ - 8, maxW) / nCell));
    const nr = Math.max(4, Math.floor(Math.min(H_ - 8, maxH) / nCell));
    const nKey = [nc, nr, nCell].join('|');
    const moved = nKey !== key;
    key = nKey; cols = nc; rows = nr; cell = nCell;
    ox = (W_ - cols * cell) / 2;
    oy = (H_ - rows * cell) / 2;
    if (moved || !walls.length) generate();
  }

  function cellAt(x, y) {
    const cx = Math.floor((x - ox) / cell), cy = Math.floor((y - oy) / cell);
    return inside(cx, cy) ? idx(cx, cy) : -1;
  }

  function step(target) {
    if (target < 0 || solved) return;
    const cur = path[path.length - 1];
    if (target === cur) return;
    if (path.length > 1 && target === path[path.length - 2]) { path.pop(); tick(path.length, true); return; }
    const cx = cur % cols, cy = Math.floor(cur / cols);
    const dx = (target % cols) - cx, dy = Math.floor(target / cols) - cy;
    if (Math.abs(dx) + Math.abs(dy) !== 1) return;
    const d = dx === 1 ? E : dx === -1 ? W : dy === 1 ? S : N;
    if (walls[cur] & d) { bump(); return; }            // parede: não passa
    path.push(target);
    tick(path.length, false);
    if (target === end) {
      solved = true; dragging = false; finger = null;
      fanfare();
      if (onSolved) onSolved();
    }
  }

  function moveTo(x, y) {
    if (lastPt) {
      const dist = Math.hypot(x - lastPt.x, y - lastPt.y);
      const n = Math.max(1, Math.ceil(dist / (cell / 6)));
      for (let k = 1; k <= n; k++) {
        step(cellAt(lastPt.x + (x - lastPt.x) * (k / n), lastPt.y + (y - lastPt.y) * (k / n)));
      }
    }
    lastPt = { x, y }; finger = { x, y };
  }

  const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  function down(e) {
    audio();                                            // o toque desbloqueia o áudio
    if (solved) return;
    const p = pos(e);
    const sc = center(startCell);
    if (path.length > 1 && Math.hypot(p.x - sc.x, p.y - sc.y) <= cell * 1.1) path = [startCell]; // recomeçar na boneca
    const head = center(path[path.length - 1]);
    if (Math.hypot(p.x - head.x, p.y - head.y) > cell * 1.8) return;
    dragging = true;
    lastPt = { x: head.x, y: head.y };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
    if (!started) { started = true; if (onStart) onStart(); }
    moveTo(p.x, p.y);
  }
  const move = (e) => { if (!dragging) return; const p = pos(e); moveTo(p.x, p.y); e.preventDefault(); };
  const up = () => { dragging = false; lastPt = null; finger = null; };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  // ---------- desenho ----------
  function draw(t) {
    if (destroyed) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W_, H_);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // fundo suave
    ctx.fillStyle = 'rgba(243,233,210,0.06)';
    for (let i = 0; i < active.length; i++) {
      if (!active[i]) continue;
      const x = ox + (i % cols) * cell, y = oy + Math.floor(i / cols) * cell;
      ctx.fillRect(x, y, cell + 0.5, cell + 0.5);
    }

    // caminho percorrido
    ctx.strokeStyle = '#D2E8FF';
    ctx.lineWidth = Math.max(6, cell * 0.3);
    ctx.beginPath();
    path.forEach((c, i) => { const p = center(c); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
    if (finger && dragging) {
      const head = center(path[path.length - 1]), lim = cell * 0.5;
      ctx.lineTo(Math.max(head.x - lim, Math.min(head.x + lim, finger.x)), Math.max(head.y - lim, Math.min(head.y + lim, finger.y)));
    }
    ctx.stroke();

    // paredes (só células ativas)
    ctx.strokeStyle = 'rgba(243,233,210,0.9)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < walls.length; i++) {
      if (!active[i]) continue;
      const cx = i % cols, cy = Math.floor(i / cols);
      const x = ox + cx * cell, y = oy + cy * cell, w = walls[i];
      if (w & N) { ctx.moveTo(x, y); ctx.lineTo(x + cell, y); }
      if (w & W) { ctx.moveTo(x, y); ctx.lineTo(x, y + cell); }
      if ((w & E) && !inside(cx + 1, cy)) { ctx.moveTo(x + cell, y); ctx.lineTo(x + cell, y + cell); }
      else if (w & E) { ctx.moveTo(x + cell, y); ctx.lineTo(x + cell, y + cell); }
      if (w & S) { ctx.moveTo(x, y + cell); ctx.lineTo(x + cell, y + cell); }
    }
    ctx.stroke();

    // fim: anel a pulsar
    const e = center(end);
    const pulse = 0.5 + 0.5 * Math.sin((t || 0) / 380);
    ctx.strokeStyle = '#D2E8FF'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(e.x, e.y, cell * (0.28 + 0.1 * pulse), 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#D2E8FF';
    ctx.beginPath(); ctx.arc(e.x, e.y, cell * 0.13, 0, Math.PI * 2); ctx.fill();

    // início: favicon
    const s = center(startCell), size = cell * 1.05;
    if (iconReady) ctx.drawImage(icon, s.x - size / 2, s.y - size / 2, size, size);
    else { ctx.fillStyle = '#F3E9D2'; ctx.beginPath(); ctx.arc(s.x, s.y, cell * 0.3, 0, Math.PI * 2); ctx.fill(); }

    // cabeça do caminho
    if (path.length > 1 && !solved) {
      const h = center(path[path.length - 1]);
      ctx.fillStyle = '#F3E9D2';
      ctx.beginPath(); ctx.arc(h.x, h.y, Math.max(4, cell * 0.14), 0, Math.PI * 2); ctx.fill();
    }
    raf = requestAnimationFrame(draw);
  }

  let rt = 0;
  const onResize = () => { clearTimeout(rt); rt = setTimeout(layout, 120); };
  window.addEventListener('resize', onResize);
  layout();
  raf = requestAnimationFrame(draw);

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf); clearTimeout(rt);
      window.removeEventListener('resize', onResize);
      canvas.remove();
      if (ac) { try { ac.close(); } catch (err) {} }
    },
    _state: () => ({ cols, rows, cell, ox, oy, walls: walls.slice(), active: active.slice(), start: startCell, end, path: path.slice(), solved }),
  };
}
