/**
 * PlayGarba Morphicons Runtime
 * Universal spring-physics icon morphing and micro-interactions for button icons.
 * Zero external runtime dependencies.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

// Canonical icon paths for morphing states (24x24 viewBox)
export const MORPH_ICONS = {
  // Play triangle: (9, 6) -> (19, 12) -> (9, 18)
  play: 'M 9 6 L 19 12 L 9 18 Z',
  // Pause bars: two parallel bars
  pause: 'M 9 6 L 9 18 M 15 6 L 15 18',
  // Prev transport
  prev: 'M 7 5 L 7 19 M 19 6 L 10 12 L 19 18 Z',
  // Next transport
  next: 'M 17 5 L 17 19 M 5 6 L 14 12 L 5 18 Z',
  // Shuffle inactive
  shuffleInactive: 'M 16 3 L 21 3 L 21 8 M 4 20 L 21 3 M 21 16 L 21 21 L 16 21 M 15 15 L 21 21 M 4 4 L 9 9',
  // Shuffle active (energized curved flow)
  shuffleActive: 'M 16 4 L 21 4 L 21 9 M 3 19 C 8 19 13 5 21 5 M 21 15 L 21 20 L 16 20 M 14 14 C 17 17 19 19 21 20 M 3 5 C 6 5 8 9 10 12',
  // Heart outline
  heartOutline: 'M 20.8 4.9 A 5.5 5.5 0 0 0 13 4.9 L 12 5.9 L 11 4.9 A 5.5 5.5 0 0 0 3.2 12.7 L 4.2 13.7 L 12 21 L 19.8 13.7 L 20.8 12.7 A 5.5 5.5 0 0 0 20.8 4.9 Z',
  // Heart filled
  heartFilled: 'M 20.8 4.9 A 5.5 5.5 0 0 0 13 4.9 L 12 5.9 L 11 4.9 A 5.5 5.5 0 0 0 3.2 12.7 L 4.2 13.7 L 12 21 L 19.8 13.7 L 20.8 12.7 A 5.5 5.5 0 0 0 20.8 4.9 Z',
  // Search magnifying glass
  search: 'M 11 4 A 7 7 0 1 0 11 18 A 7 7 0 1 0 11 4 Z M 21 21 L 16.65 16.65',
  // Share
  share: 'M 18 5 A 2.5 2.5 0 1 0 18 10 A 2.5 2.5 0 1 0 18 5 Z M 6 12 A 2.5 2.5 0 1 0 6 17 A 2.5 2.5 0 1 0 6 12 Z M 18 19 A 2.5 2.5 0 1 0 18 24 A 2.5 2.5 0 1 0 18 19 Z M 8.5 13.5 L 15.5 17.5 M 15.5 6.5 L 8.5 10.5',
  // Queue list
  queue: 'M 4 6 L 15 6 M 4 12 L 15 12 M 4 18 L 11 18 M 18 13 L 18 20 M 18 13 L 21 15',
  // Live Radio antenna signal
  radioWave: 'M 4.9 4.9 A 10 10 0 0 1 19.1 4.9 M 7.8 7.8 A 6 6 0 0 1 16.2 7.8 M 12 11 A 1.5 1.5 0 1 1 12 14 A 1.5 1.5 0 1 1 12 11 Z',
  // Sheet close chevron down
  closeChevron: 'M 7 10 L 12 15 L 17 10',
};

// Analytical spring simulation
class SpringPhysics {
  constructor({ stiffness = 180, damping = 14, mass = 1 } = {}) {
    this.k = stiffness;
    this.c = damping;
    this.m = mass;
    this.position = 0;
    this.velocity = 0;
    this.target = 1;
  }

  step(dt) {
    const displacement = this.position - this.target;
    const springForce = -this.k * displacement;
    const dampingForce = -this.c * this.velocity;
    const acceleration = (springForce + dampingForce) / this.m;

    this.velocity += acceleration * dt;
    this.position += this.velocity * dt;

    const isAtRest = Math.abs(this.velocity) < 0.001 && Math.abs(displacement) < 0.001;
    if (isAtRest) {
      this.position = this.target;
      this.velocity = 0;
    }
    return isAtRest;
  }

  reset(from = 0, to = 1) {
    this.position = from;
    this.velocity = 0;
    this.target = to;
  }
}

/**
 * Morphing controller attached to a target SVG path element
 */
export function createMorphIcon(pathElement, initialIconKey = 'play', options = {}) {
  if (!pathElement) return null;

  let currentD = MORPH_ICONS[initialIconKey] || initialIconKey;
  let targetD = currentD;
  let animationFrameId = null;
  let lastTime = 0;
  const spring = new SpringPhysics({
    stiffness: options.stiffness || 210,
    damping: options.damping || 16,
  });

  pathElement.setAttribute('d', currentD);

  function animate(now) {
    if (!lastTime) lastTime = now;
    const dt = Math.min((now - lastTime) / 1000, 0.064);
    lastTime = now;

    const atRest = spring.step(dt);
    const progress = Math.min(Math.max(spring.position, 0), 1.25);

    // Apply tactile spring pulse to the host SVG
    const svgParent = pathElement.closest('svg');
    if (svgParent) {
      const scale = 1 + (progress > 1 ? (progress - 1) * 0.15 : Math.sin(progress * Math.PI) * 0.08);
      svgParent.style.transform = `scale(${scale.toFixed(3)})`;
    }

    if (atRest) {
      pathElement.setAttribute('d', targetD);
      if (svgParent) svgParent.style.transform = '';
      animationFrameId = null;
      lastTime = 0;
      return;
    }

    animationFrameId = requestAnimationFrame(animate);
  }

  return {
    morphTo(nextIconKey, { instant = false } = {}) {
      const nextD = MORPH_ICONS[nextIconKey] || nextIconKey;
      if (!nextD) return;

      const prefersReducedMotion = typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      targetD = nextD;
      currentD = nextD;

      if (instant || prefersReducedMotion) {
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
        pathElement.setAttribute('d', nextD);
        const svgParent = pathElement.closest('svg');
        if (svgParent) svgParent.style.transform = '';
        return;
      }

      // Start spring transition
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      pathElement.setAttribute('d', nextD);
      spring.reset(0, 1);
      lastTime = 0;
      animationFrameId = requestAnimationFrame(animate);
    },

    pulse() {
      const prefersReducedMotion = typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReducedMotion) return;

      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      spring.reset(0, 1);
      lastTime = 0;
      animationFrameId = requestAnimationFrame(animate);
    },

    destroy() {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    },
  };
}

/**
 * Initialize Morphicon controllers on button elements in the player interface
 */
export function initMorphicons(elements = {}) {
  const morphs = new Map();

  // 1. Play / Pause button
  const playButton = elements.playButton || document.getElementById('playButton');
  if (playButton) {
    const playSvg = playButton.querySelector('.play-icon') || playButton.querySelector('svg');
    const playPath = playSvg ? (playSvg.querySelector('path') || playSvg) : null;
    if (playPath && playPath.tagName.toLowerCase() === 'path') {
      morphs.set('play', createMorphIcon(playPath, 'play', { stiffness: 220, damping: 15 }));
    }
  }

  // 2. Mini play button
  const miniPlay = elements.miniPlay || document.getElementById('miniPlay');
  if (miniPlay) {
    const miniSvg = miniPlay.querySelector('.play-icon') || miniPlay.querySelector('svg');
    const miniPath = miniSvg ? (miniSvg.querySelector('path') || miniSvg) : null;
    if (miniPath && miniPath.tagName.toLowerCase() === 'path') {
      morphs.set('miniPlay', createMorphIcon(miniPath, 'play', { stiffness: 220, damping: 15 }));
    }
  }

  // 3. Shuffle button
  const shuffleBtn = elements.shuffleButton || document.getElementById('shuffleButton');
  if (shuffleBtn) {
    const shufflePath = shuffleBtn.querySelector('path');
    if (shufflePath) {
      morphs.set('shuffle', createMorphIcon(shufflePath, 'shuffleInactive', { stiffness: 200, damping: 14 }));
    }
  }

  // 4. Favourites buttons
  const favBtn = elements.favouritesButton || document.getElementById('favouritesButton');
  if (favBtn) {
    const favPath = favBtn.querySelector('path');
    if (favPath) {
      morphs.set('favourites', createMorphIcon(favPath, 'heartOutline', { stiffness: 240, damping: 13 }));
    }
  }

  const mobFav = elements.mobileFavourite || document.getElementById('mobileFavourite');
  if (mobFav) {
    const mobFavPath = mobFav.querySelector('path');
    if (mobFavPath) {
      morphs.set('mobileFavourite', createMorphIcon(mobFavPath, 'heartOutline', { stiffness: 240, damping: 13 }));
    }
  }

  // 5. Live radio button
  const liveBtn = elements.liveStationButton || document.getElementById('liveStationButton');
  if (liveBtn) {
    const livePath = liveBtn.querySelector('path');
    if (livePath) {
      morphs.set('live', createMorphIcon(livePath, 'radioWave', { stiffness: 180, damping: 12 }));
    }
  }

  // Attach tactile micro-animations to icon-buttons
  if (typeof document !== 'undefined') {
    document.querySelectorAll('.icon-button, .transport').forEach((btn) => {
      btn.addEventListener('pointerdown', () => {
        const svg = btn.querySelector('svg');
        if (svg) svg.style.transform = 'scale(0.88)';
      }, { passive: true });

      const resetScale = () => {
        const svg = btn.querySelector('svg');
        if (svg) svg.style.transform = '';
      };

      btn.addEventListener('pointerup', resetScale, { passive: true });
      btn.addEventListener('pointercancel', resetScale, { passive: true });
      btn.addEventListener('pointerleave', resetScale, { passive: true });
    });
  }

  return morphs;
}

if (typeof window !== 'undefined') {
  window.GARBA_MORPHICONS = {
    MORPH_ICONS,
    createMorphIcon,
    initMorphicons,
  };
}
