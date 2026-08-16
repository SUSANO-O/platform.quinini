'use client';

import { useLayoutEffect, useRef } from 'react';
import type { ThinkingIconId } from '@/lib/widget-thinking-icon';

const STEP = 5.55;
const TURN_MS = 2100;
type Axis = 'x' | 'y' | 'z';
type Layer = -1 | 0 | 1;
type Deg = 90 | -90;
type Move = [Axis, Layer, Deg];

function cubieStyle(x: number, y: number, z: number, extra = '') {
  return {
    transform: `translate3d(${x * STEP}px, ${-y * STEP}px, ${z * STEP}px)${extra ? ` ${extra}` : ''}`,
  };
}

function bake(el: HTMLElement, axis: Axis, deg: Deg) {
  const x = Number(el.dataset.x);
  const y = Number(el.dataset.y);
  const z = Number(el.dataset.z);
  let nx = x;
  let ny = y;
  let nz = z;
  if (axis === 'y') {
    if (deg > 0) {
      nx = z;
      nz = -x;
    } else {
      nx = -z;
      nz = x;
    }
  } else if (axis === 'x') {
    if (deg > 0) {
      ny = -z;
      nz = y;
    } else {
      ny = z;
      nz = -y;
    }
  } else if (deg > 0) {
    nx = -y;
    ny = x;
  } else {
    nx = y;
    ny = -x;
  }
  el.dataset.x = String(nx);
  el.dataset.y = String(ny);
  el.dataset.z = String(nz);
  const add = axis === 'x' ? `rotateX(${deg}deg)` : axis === 'y' ? `rotateY(${deg}deg)` : `rotateZ(${deg}deg)`;
  el.dataset.r = `${add}${el.dataset.r ? ` ${el.dataset.r}` : ''}`;
  el.style.transform = `translate3d(${nx * STEP}px, ${-ny * STEP}px, ${nz * STEP}px) ${el.dataset.r}`;
}

function applyInstant(cube: HTMLElement, axis: Axis, layer: Layer, deg: Deg) {
  const slice = Array.from(cube.querySelectorAll<HTMLElement>('.wb-rk-cubie')).filter(
    (el) => Number(el.dataset[axis]) === layer,
  );
  slice.forEach((el) => bake(el, axis, deg));
}

function randomMove(prev: Move | null): Move {
  const axes: Axis[] = ['x', 'y', 'z'];
  const layers: Layer[] = [-1, 0, 1];
  const degs: Deg[] = [90, -90];
  const pick = (): Move => [
    axes[Math.floor(Math.random() * 3)],
    layers[Math.floor(Math.random() * 3)],
    degs[Math.floor(Math.random() * 2)],
  ];
  let move = pick();
  let guard = 0;
  while (prev && guard < 10 && prev[0] === move[0] && prev[1] === move[1] && prev[2] === -move[2]) {
    move = pick();
    guard += 1;
  }
  return move;
}

function scramble(cube: HTMLElement): Move[] {
  const count = 14 + Math.floor(Math.random() * 9);
  const moves: Move[] = [];
  let prev: Move | null = null;
  for (let i = 0; i < count; i += 1) {
    const move = randomMove(prev);
    applyInstant(cube, move[0], move[1], move[2]);
    moves.push(move);
    prev = move;
  }
  return moves;
}

function Tile({
  side,
  color,
}: {
  side: 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom';
  color?: 'w' | 'y' | 'r' | 'o' | 'b' | 'g';
}) {
  return (
    <span className={`wb-rk-tile wb-rk-tile--${side}${color ? ` wb-rk-tile--${color}` : ' wb-rk-tile--inner'}`}>
      {color ? <span className="wb-rk-sticker" /> : null}
    </span>
  );
}

function Cubie({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <span className="wb-rk-cubie" data-x={x} data-y={y} data-z={z} style={cubieStyle(x, y, z)}>
      <Tile side="front" color={z === 1 ? 'g' : undefined} />
      <Tile side="back" color={z === -1 ? 'b' : undefined} />
      <Tile side="right" color={x === 1 ? 'r' : undefined} />
      <Tile side="left" color={x === -1 ? 'o' : undefined} />
      <Tile side="top" color={y === 1 ? 'w' : undefined} />
      <Tile side="bottom" color={y === -1 ? 'y' : undefined} />
    </span>
  );
}

function RubikMark() {
  const cubeRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const cube = cubeRef.current;
    if (!cube) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    let stopped = false;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => {
      const t = window.setTimeout(fn, ms);
      timers.push(t);
    };

    const play = (axis: Axis, layer: Layer, deg: Deg, done: () => void) => {
      const slice = Array.from(cube.querySelectorAll<HTMLElement>('.wb-rk-cubie')).filter(
        (el) => Number(el.dataset[axis]) === layer,
      );
      if (!slice.length) {
        done();
        return;
      }
      const spin = document.createElement('span');
      spin.className = 'wb-rk-spin';
      cube.appendChild(spin);
      slice.forEach((el) => spin.appendChild(el));
      const rot = axis === 'x' ? `rotateX(${deg}deg)` : axis === 'y' ? `rotateY(${deg}deg)` : `rotateZ(${deg}deg)`;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        slice.forEach((el) => bake(el, axis, deg));
        while (spin.firstChild) cube.appendChild(spin.firstChild);
        spin.remove();
        done();
      };
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          spin.style.transform = rot;
        });
      });
      later(finish, TURN_MS + 120);
    };

    const assemble = () => {
      if (stopped || !cube.isConnected) return;
      const moves = scramble(cube);
      let i = moves.length - 1;
      const step = () => {
        if (stopped || !cube.isConnected) return;
        if (i < 0) {
          later(assemble, 900);
          return;
        }
        const move = moves[i];
        i -= 1;
        play(move[0], move[1], (-move[2] as Deg), () => {
          later(step, 600);
        });
      };
      later(step, 280);
    };

    assemble();
    return () => {
      stopped = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const cubies = [];
  for (let x = -1; x <= 1; x += 1) {
    for (let y = -1; y <= 1; y += 1) {
      for (let z = -1; z <= 1; z += 1) {
        if (x === 0 && y === 0 && z === 0) continue;
        cubies.push(<Cubie key={`${x}${y}${z}`} x={x} y={y} z={z} />);
      }
    }
  }

  return (
    <span className="wb-thinking-mark__cube" ref={cubeRef}>
      {cubies}
    </span>
  );
}

export function ThinkingIconMark({
  kind,
  className = '',
}: {
  kind: ThinkingIconId;
  className?: string;
}) {
  const wrap = `wb-thinking-mark wb-thinking-mark--${kind}${className ? ` ${className}` : ''}`;

  if (kind === 'rubik') {
    return (
      <span className={wrap} aria-hidden>
        <RubikMark />
      </span>
    );
  }

  if (kind === 'spark') {
    return (
      <span className={wrap} aria-hidden>
        <svg className="wb-thinking-mark__spark" viewBox="0 0 16 16" width="13" height="13">
          <path
            fill="currentColor"
            d="M8 .4 9.05 6.45 15.6 8 9.05 9.55 8 15.6 6.95 9.55.4 8l6.55-1.55z"
          />
        </svg>
      </span>
    );
  }

  if (kind === 'orb') {
    return (
      <span className={wrap} aria-hidden>
        <span className="wb-thinking-mark__orb" />
      </span>
    );
  }

  if (kind === 'atom') {
    return (
      <span className={wrap} aria-hidden>
        <span className="wb-thinking-mark__atom">
          <span className="wb-thinking-mark__atom-core" />
          <span className="wb-thinking-mark__atom-ring" />
          <span className="wb-thinking-mark__atom-ring wb-thinking-mark__atom-ring--b" />
        </span>
      </span>
    );
  }

  return (
    <span className={wrap} aria-hidden>
      <span className="wb-thinking-mark__pulse-ring" />
      <span className="wb-thinking-mark__pulse-ring wb-thinking-mark__pulse-ring--b" />
      <span className="wb-thinking-mark__pulse-dot" />
    </span>
  );
}
