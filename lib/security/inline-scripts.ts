export const PRELOAD_PROGRESS_STYLE = `
  #__preload-progress {
    position: fixed;
    left: 0;
    right: 0;
    top: 0;
    height: 4px;
    pointer-events: none;
    z-index: 9999;
    background: rgba(0,0,0,0.05);
  }
  #__preload-progress-bar {
    height: 100%;
    width: 100%;
    transform-origin: left;
    transform: scaleX(0);
    background: var(--primary, #22c55e);
    transition: transform 180ms ease-out;
    animation: __preloadGrow 2800ms cubic-bezier(.25,.8,.4,1) forwards;
  }
  @keyframes __preloadGrow {
    0% { transform: scaleX(0); }
    12% { transform: scaleX(0.28); }
    35% { transform: scaleX(0.6); }
    62% { transform: scaleX(0.78); }
    100% { transform: scaleX(0.9); }
  }
`;

export const PRELOAD_PROGRESS_SCRIPT = `(function() {
  if (window.__preloadProgressInit) return;
  window.__preloadProgressInit = true;
  var container = document.createElement('div');
  container.id = '__preload-progress';
  var bar = document.createElement('div');
  bar.id = '__preload-progress-bar';
  container.appendChild(bar);
  document.documentElement.appendChild(container);

  var done = false;

  function finish() {
    if (done) return;
    done = true;
    bar.style.transform = 'scaleX(1)';
    setTimeout(function() {
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
      }
    }, 220);
  }

  window.__hidePreloadProgress = finish;
  window.addEventListener('load', finish);
  setTimeout(finish, 4500);
})();`;

const LIGHT_THEME_COLOR = "hsl(0 0% 100%)";
const DARK_THEME_COLOR = "hsl(240deg 10% 3.92%)";

export const THEME_COLOR_SCRIPT = `(function() {
  var html = document.documentElement;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  function updateThemeColor() {
    var isDark = html.classList.contains('dark');
    meta.setAttribute('content', isDark ? '${DARK_THEME_COLOR}' : '${LIGHT_THEME_COLOR}');
  }
  var observer = new MutationObserver(updateThemeColor);
  observer.observe(html, { attributes: true, attributeFilter: ['class'] });
  updateThemeColor();
})();`;
