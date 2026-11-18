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

  // ---------- som (alinhado com os cliques e o sparkle do resto do site, ui-sound.js) ----------
  let ac = null, lastTickAt = 0, lastBumpAt = 0;
  function audio() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return ac; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    return ac;
  }
  function shared() { return window.__nqUiSound; }
  function tick(len, back) {
    const now = Date.now();
    if (now - lastTickAt < 45) return;         // não dispara em rajada
    lastTickAt = now;
    const s = shared();
    if (s) s.pop();
  }
  function bump() {
    const now = Date.now();
    if (now - lastBumpAt < 180) return;
    lastBumpAt = now;
    const c = audio(); if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.09);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.055, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(lp); lp.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + 0.14);
  }
  function fanfare() {
    const s = shared();
    if (s) s.shimmer();
  }

  function generate() {
    active = new Array(cols * rows).fill(true);
    startCell = 0;                                      // boneca no canto de cima à esquerda

    // recursive backtracker só nas células ativas
    walls = new Array(cols * rows).fill(N | E | S | W);
    const seen = new Array(cols * rows).fill(false);
    const list = [startCell];
    seen[startCell] = true;
    while (list.length) {
      // 15% escolhe uma célula qualquer, 85% a mais recente — poucos ramos, corredores longos e simples
      const pick = Math.random() < 0.15 ? Math.floor(Math.random() * list.length) : list.length - 1;
      const cur = list[pick];
      const cx = cur % cols, cy = Math.floor(cur / cols);
      const options = DIRS.filter((d) => inside(cx + DX[d], cy + DY[d]) && !seen[idx(cx + DX[d], cy + DY[d])]);
      if (!options.length) { list.splice(pick, 1); continue; }
      const d = options[Math.floor(Math.random() * options.length)];
      const nxt = idx(cx + DX[d], cy + DY[d]);
      walls[cur] &= ~d; walls[nxt] &= ~OPP[d];
      seen[nxt] = true; list.push(nxt);
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
    // fim a meio caminho da distância máxima: percurso mais curto, menos cansativo
    const targetDist = Math.max(1, Math.round(dist[far] * 0.55));
    end = far;
    let bestDiff = Infinity;
    for (let i = 0; i < dist.length; i++) {
      if (dist[i] < 0) continue;
      const diff = Math.abs(dist[i] - targetDist);
      if (diff < bestDiff) { bestDiff = diff; end = i; }
    }
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
    // labirinto em blocos: paredes com a mesma espessura dos corredores (bs)
    const nCell = small ? 36 : 42;                      // célula lógica = 2 blocos (maior = menos células = mais simples)
    const bs = nCell / 2;
    const maxW = small ? 230 : 320, maxH = small ? 260 : 220;
    const nc = Math.max(5, Math.floor((Math.min(W_ - 8, maxW) - bs) / nCell));
    const nr = Math.max(5, Math.floor((Math.min(H_ - 8, maxH) - bs) / nCell));
    const nKey = [nc, nr, nCell].join('|');
    const moved = nKey !== key;
    key = nKey; cols = nc; rows = nr; cell = nCell;
    ox = (W_ - (cols * cell + bs)) / 2 + bs / 2;
    oy = (H_ - (rows * cell + bs)) / 2 + bs / 2;
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
    // retoma a partir do ponto do traço mais próximo do toque (a boneca = recomeçar)
    let near = -1, nd = cell * 1.3;
    path.forEach((c, k) => { const q = center(c); const dd = Math.hypot(p.x - q.x, p.y - q.y); if (dd <= nd) { nd = dd; near = k; } });
    if (near < 0) return;
    path = path.slice(0, near + 1);
    const head = center(path[path.length - 1]);
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

    // caminho percorrido
    ctx.strokeStyle = '#D2E8FF';
    ctx.lineWidth = cell * 0.3;
    ctx.beginPath();
    path.forEach((c, i) => { const p = center(c); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
    if (finger && dragging) {
      const head = center(path[path.length - 1]), lim = cell * 0.5;
      ctx.lineTo(Math.max(head.x - lim, Math.min(head.x + lim, finger.x)), Math.max(head.y - lim, Math.min(head.y + lim, finger.y)));
    }
    ctx.stroke();

    // paredes (só células ativas)
    ctx.strokeStyle = '#F3E9D2';
    ctx.lineCap = 'square';
    ctx.lineWidth = cell / 2;
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
    ctx.lineCap = 'round';

    // fim: anel a pulsar
    const e = center(end);
    const pulse = 0.5 + 0.5 * Math.sin((t || 0) / 380);
    ctx.strokeStyle = '#D2E8FF'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(e.x, e.y, cell * (0.24 + 0.08 * pulse), 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#D2E8FF';
    ctx.beginPath(); ctx.arc(e.x, e.y, cell * 0.1, 0, Math.PI * 2); ctx.fill();

    // início: favicon
    const s = center(startCell), size = cell * 0.95;
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
