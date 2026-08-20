'use client';

import type { ThinkingIconId } from '@/lib/widget-thinking-icon';

const STEP = 5.55;

function cubieStyle(x: number, y: number, z: number) {
  return {
    transform: `translate3d(${x * STEP}px, ${-y * STEP}px, ${z * STEP}px)`,
  };
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
  const cubies = [];
  for (let x = -1; x <= 1; x += 1) {
    for (let y = -1; y <= 1; y += 1) {
      for (let z = -1; z <= 1; z += 1) {
        if (x === 0 && y === 0 && z === 0) continue;
        cubies.push(<Cubie key={`${x}${y}${z}`} x={x} y={y} z={z} />);
      }
    }
  }
  return <span className="wb-thinking-mark__cube">{cubies}</span>;
}

/** Prisma / cristal 3D — mismo peso visual que el Cubo. */
function CrystalMark() {
  return (
    <span className="wb-ic-crystal">
      <span className="wb-ic-crystal__core">
        <span className="wb-ic-crystal__facet wb-ic-crystal__facet--n" />
        <span className="wb-ic-crystal__facet wb-ic-crystal__facet--e" />
        <span className="wb-ic-crystal__facet wb-ic-crystal__facet--s" />
        <span className="wb-ic-crystal__facet wb-ic-crystal__facet--w" />
        <span className="wb-ic-crystal__spark" />
      </span>
    </span>
  );
}

/** Planeta con anillo inclinado. */
function PlanetMark() {
  return (
    <span className="wb-ic-planet">
      <span className="wb-ic-planet__glow" />
      <span className="wb-ic-planet__sphere">
        <span className="wb-ic-planet__shine" />
        <span className="wb-ic-planet__band" />
      </span>
      <span className="wb-ic-planet__ring" />
    </span>
  );
}

/** Átomo 3D con electrones en órbita. */
function OrbitMark() {
  return (
    <span className="wb-ic-orbit">
      <span className="wb-ic-orbit__core" />
      <span className="wb-ic-orbit__ring wb-ic-orbit__ring--a">
        <span className="wb-ic-orbit__e" />
      </span>
      <span className="wb-ic-orbit__ring wb-ic-orbit__ring--b">
        <span className="wb-ic-orbit__e" />
      </span>
      <span className="wb-ic-orbit__ring wb-ic-orbit__ring--c">
        <span className="wb-ic-orbit__e" />
      </span>
    </span>
  );
}

/** Radar con barrido y blip. */
function RadarMark() {
  return (
    <span className="wb-ic-radar">
      <span className="wb-ic-radar__disc" />
      <span className="wb-ic-radar__grid" />
      <span className="wb-ic-radar__ring" />
      <span className="wb-ic-radar__ring wb-ic-radar__ring--mid" />
      <span className="wb-ic-radar__sweep" />
      <span className="wb-ic-radar__blip" />
      <span className="wb-ic-radar__cross" />
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
        <CrystalMark />
      </span>
    );
  }

  if (kind === 'orb') {
    return (
      <span className={wrap} aria-hidden>
        <PlanetMark />
      </span>
    );
  }

  if (kind === 'atom') {
    return (
      <span className={wrap} aria-hidden>
        <OrbitMark />
      </span>
    );
  }

  return (
    <span className={wrap} aria-hidden>
      <RadarMark />
    </span>
  );
}
