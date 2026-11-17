// Labirinto da página de entrada.
// O início é o ícone do favicon; a pessoa desenha o caminho com o dedo (ou rato)
// até ao fim. Ao chegar lá, chama onSolved().
const N = 1, E = 2, S = 4, W = 8;
const DX = { [N]: 0, [E]: 1, [S]: 0, [W]: -1 };
const DY = { [N]: -1, [E]: 0, [S]: 1, [W]: 0 };
const OPP = { [N]: S, [E]: W, [S]: N, [W]: E };

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
  let cols = 0, rows = 0, cell = 0, ox = 0, oy = 0;
  let walls = [];          // bitmask de paredes por célula
  let end = 0;             // índice da célula final
  let path = [0];          // células percorridas (início → cabeça)
  let solved = false;
  let dragging = false;
  let finger = null;       // posição do dedo em px (relativa ao canvas)
  let lastPt = null;
  let started = false;
  let raf = 0;
  let destroyed = false;

  const idx = (cx, cy) => cy * cols + cx;
  const center = (i) => ({ x: ox + (i % cols + 0.5) * cell, y: oy + (Math.floor(i / cols) + 0.5) * cell });

  function generate() {
    walls = new Array(cols * rows).fill(N | E | S | W);
    const seen = new Array(cols * rows).fill(false);
    const stack = [0];
    seen[0] = true;
    while (stack.length) {
      const cur = stack[stack.length - 1];
      const cx = cur % cols, cy = Math.floor(cur / cols);
      const opts = [N, E, S, W].filter((d) => {
        const nx = cx + DX[d], ny = cy + DY[d];
        return nx >= 0 && ny >= 0 && nx < cols && ny < rows && !seen[idx(nx, ny)];
      });
      if (!opts.length) { stack.pop(); continue; }
      const d = opts[Math.floor(Math.random() * opts.length)];
      const nxt = idx(cx + DX[d], cy + DY[d]);
      walls[cur] &= ~d;
      walls[nxt] &= ~OPP[d];
      seen[nxt] = true;
      stack.push(nxt);
    }
    // fim = célula mais distante do início
    const dist = new Array(cols * rows).fill(-1);
    dist[0] = 0;
    const q = [0];
    let far = 0;
    while (q.length) {
      const cur = q.shift();
      if (dist[cur] > dist[far]) far = cur;
      const cx = cur % cols, cy = Math.floor(cur / cols);
      [N, E, S, W].forEach((d) => {
        if (walls[cur] & d) return;
        const nxt = idx(cx + DX[d], cy + DY[d]);
        if (dist[nxt] < 0) { dist[nxt] = dist[cur] + 1; q.push(nxt); }
      });
    }
    end = far;
    path = [0];
    solved = false;
  }

  function layout() {
    const r = host.getBoundingClientRect();
    W_ = Math.max(1, r.width); H_ = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W_ * dpr);
    canvas.height = Math.round(H_ * dpr);
    const target = W_ < 600 ? 44 : 56;
    const nc = Math.max(5, Math.floor((W_ - 8) / target));
    const nr = Math.max(5, Math.floor((H_ - 8) / target));
    const changed = nc !== cols || nr !== rows;
    cols = nc; rows = nr;
    cell = Math.min((W_ - 8) / cols, (H_ - 8) / rows);
    ox = (W_ - cols * cell) / 2;
    oy = (H_ - rows * cell) / 2;
    if (changed || !walls.length) generate();
  }

  function cellAt(x, y) {
    const cx = Math.floor((x - ox) / cell), cy = Math.floor((y - oy) / cell);
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return -1;
    return idx(cx, cy);
  }

  function step(target) {
    if (target < 0 || solved) return;
    const cur = path[path.length - 1];
    if (target === cur) return;
    if (path.length > 1 && target === path[path.length - 2]) { path.pop(); return; }
    const cx = cur % cols, cy = Math.floor(cur / cols);
    const tx = target % cols, ty = Math.floor(target / cols);
    const dx = tx - cx, dy = ty - cy;
    if (Math.abs(dx) + Math.abs(dy) !== 1) return;
    const d = dx === 1 ? E : dx === -1 ? W : dy === 1 ? S : N;
    if (walls[cur] & d) return;           // parede: não passa
    path.push(target);
    if (target === end) {
      solved = true;
      dragging = false;
      finger = null;
      if (onSolved) onSolved();
    }
  }

  function moveTo(x, y) {
    if (lastPt) {
      const dist = Math.hypot(x - lastPt.x, y - lastPt.y);
      const n = Math.max(1, Math.ceil(dist / (cell / 6)));
      for (let k = 1; k <= n; k++) {
        const px = lastPt.x + (x - lastPt.x) * (k / n);
        const py = lastPt.y + (y - lastPt.y) * (k / n);
        step(cellAt(px, py));
      }
    }
    lastPt = { x, y };
    finger = { x, y };
  }

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function down(e) {
    if (solved) return;
    const p = pos(e);
    const head = center(path[path.length - 1]);
    if (Math.hypot(p.x - head.x, p.y - head.y) > cell * 1.6) return; // tem de começar junto à cabeça
    dragging = true;
    lastPt = { x: head.x, y: head.y };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
    if (!started) { started = true; if (onStart) onStart(); }
    moveTo(p.x, p.y);
  }
  function move(e) { if (!dragging) return; const p = pos(e); moveTo(p.x, p.y); e.preventDefault(); }
  function up() { dragging = false; lastPt = null; finger = null; }

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  function draw(t) {
    if (destroyed) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W_, H_);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // caminho percorrido
    if (path.length) {
      ctx.strokeStyle = '#D2E8FF';
      ctx.lineWidth = Math.max(7, cell * 0.26);
      ctx.beginPath();
      path.forEach((c, i) => { const p = center(c); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
      if (finger && dragging) {
        const head = center(path[path.length - 1]);
        const lim = cell * 0.5;
        const fx = Math.max(head.x - lim, Math.min(head.x + lim, finger.x));
        const fy = Math.max(head.y - lim, Math.min(head.y + lim, finger.y));
        ctx.lineTo(fx, fy);
      }
      ctx.stroke();
    }

    // paredes
    ctx.strokeStyle = 'rgba(243,233,210,0.85)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < walls.length; i++) {
      const x = ox + (i % cols) * cell, y = oy + Math.floor(i / cols) * cell;
      const w = walls[i];
      if (w & N) { ctx.moveTo(x, y); ctx.lineTo(x + cell, y); }
      if (w & W) { ctx.moveTo(x, y); ctx.lineTo(x, y + cell); }
      if ((i % cols) === cols - 1 && (w & E)) { ctx.moveTo(x + cell, y); ctx.lineTo(x + cell, y + cell); }
      if (Math.floor(i / cols) === rows - 1 && (w & S)) { ctx.moveTo(x, y + cell); ctx.lineTo(x + cell, y + cell); }
      if (!(i % cols === cols - 1) && (w & E)) { ctx.moveTo(x + cell, y); ctx.lineTo(x + cell, y + cell); }
      if (!(Math.floor(i / cols) === rows - 1) && (w & S)) { ctx.moveTo(x, y + cell); ctx.lineTo(x + cell, y + cell); }
    }
    ctx.stroke();

    // fim: anel a pulsar
    const e = center(end);
    const pulse = 0.5 + 0.5 * Math.sin((t || 0) / 380);
    ctx.strokeStyle = '#D2E8FF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, cell * (0.26 + 0.08 * pulse), 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#D2E8FF';
    ctx.beginPath();
    ctx.arc(e.x, e.y, cell * 0.12, 0, Math.PI * 2);
    ctx.fill();

    // início: ícone do favicon
    const s = center(0);
    const size = cell * 0.86;
    if (iconReady) ctx.drawImage(icon, s.x - size / 2, s.y - size / 2, size, size);
    else { ctx.fillStyle = '#F3E9D2'; ctx.beginPath(); ctx.arc(s.x, s.y, cell * 0.28, 0, Math.PI * 2); ctx.fill(); }

    // cabeça do caminho (indicador de onde continuar)
    if (path.length > 1 && !solved) {
      const h = center(path[path.length - 1]);
      ctx.fillStyle = '#F3E9D2';
      ctx.beginPath();
      ctx.arc(h.x, h.y, Math.max(5, cell * 0.14), 0, Math.PI * 2);
      ctx.fill();
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
      cancelAnimationFrame(raf);
      clearTimeout(rt);
      window.removeEventListener('resize', onResize);
      canvas.remove();
    },
    // para testes
    _state: () => ({ cols, rows, cell, ox, oy, walls: walls.slice(), end, path: path.slice(), solved }),
  };
}
