export function initDotCursor() {
  if (window.matchMedia && window.matchMedia('(hover: none)').matches) return () => {};
  if (window.__nqDot) return window.__nqDot.destroy;
  if (!document.getElementById('nq-dot-kf')) {
    const st = document.createElement('style');
    st.id = 'nq-dot-kf';
    st.textContent = '@keyframes nqTwinkle { 0%,100% { transform:rotate(0deg) scale(1); } 50% { transform:rotate(18deg) scale(0.88); } }';
    document.head.appendChild(st);
  }
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dot = document.createElement('div');
  dot.style.cssText = 'position:fixed; left:0; top:0; width:22px; height:22px; margin:-11px 0 0 -11px; pointer-events:none; z-index:2147483647; opacity:0; transition:opacity .25s ease, width .22s cubic-bezier(.22,1,.36,1), height .22s cubic-bezier(.22,1,.36,1), margin .22s cubic-bezier(.22,1,.36,1); filter:drop-shadow(0 0 2px #F3E9D2) drop-shadow(0 1px 2px rgba(57,29,1,0.4));';
  const star = document.createElement('div');
  star.style.cssText = 'width:100%; height:100%; background:#4B2E2A;' + (reduceMotion ? '' : ' animation:nqTwinkle 1.3s ease-in-out infinite;') + ' clip-path:polygon(50% 0%,61% 35%,98% 35%,69% 57%,79% 91%,50% 70%,21% 91%,31% 57%,2% 35%,39% 35%);';
  dot.appendChild(star);
  document.body.appendChild(dot);
  let x = 0, y = 0, cx = 0, cy = 0, raf = null, alive = true;
  const move = (e) => {
    x = e.clientX; y = e.clientY;
    dot.style.opacity = '1';
    const t = e.target;
    const hot = t && t.closest && t.closest('a,button,input,textarea,[role="button"]');
    dot.style.width = hot ? '32px' : '22px';
    dot.style.height = hot ? '32px' : '22px';
    dot.style.margin = hot ? '-16px 0 0 -16px' : '-11px 0 0 -11px';
  };
  const leave = () => { dot.style.opacity = '0'; };
  const loop = () => {
    if (!alive) return;
    // gentle glide: softer than a 1:1 follow so the star slides behind the pointer
    cx += (x - cx) * 0.2;
    cy += (y - cy) * 0.2;
    dot.style.transform = 'translate(' + cx + 'px,' + cy + 'px)';
    raf = requestAnimationFrame(loop);
  };
  window.addEventListener('pointermove', move, { passive: true });
  document.addEventListener('mouseleave', leave);
  raf = requestAnimationFrame(loop);
  const destroy = () => {
    alive = false;
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener('pointermove', move);
    document.removeEventListener('mouseleave', leave);
    dot.remove();
    window.__nqDot = null;
  };
  window.__nqDot = { destroy };
  return destroy;
}
