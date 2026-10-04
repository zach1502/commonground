export type ShapeKind = 'box' | 'cylinder' | 'sphere';

/** A primitive shape sized by its full extents, with its base on y = 0 and centred in x and z. */
export interface ShapeSize {
  readonly shape: ShapeKind;
  readonly widthM: number;
  readonly depthM: number;
  readonly heightM: number;
}

export interface ShapeArrays {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
}

const ROUND_SEGMENTS = 12;
const SPHERE_RINGS = 6;
const HALF = 0.5;
const TURNS_TO_RADIANS = 2;
const FULL_TURN = Math.PI * TURNS_TO_RADIANS;
const COMPONENTS = 3;
// Each side step of a cylinder adds a bottom and a top vertex.
const RING_STRIDE = 2;

interface Builder {
  readonly positions: number[];
  readonly normals: number[];
  readonly indices: number[];
}

type Vec3 = readonly [number, number, number];

function vertex(builder: Builder, position: Vec3, normal: Vec3): number {
  builder.positions.push(...position);
  builder.normals.push(...normal);
  return builder.positions.length / COMPONENTS - 1;
}

// Unit shapes span -0.5..0.5 in x and z and 0..1 in y; finish() stretches them to size.
const BOX_FACES: readonly { normal: Vec3; corners: readonly Vec3[] }[] = [
  {
    normal: [1, 0, 0],
    corners: [
      [1, 0, 1],
      [1, 0, -1],
      [1, 1, -1],
      [1, 1, 1],
    ],
  },
  {
    normal: [-1, 0, 0],
    corners: [
      [-1, 0, -1],
      [-1, 0, 1],
      [-1, 1, 1],
      [-1, 1, -1],
    ],
  },
  {
    normal: [0, 1, 0],
    corners: [
      [-1, 1, 1],
      [1, 1, 1],
      [1, 1, -1],
      [-1, 1, -1],
    ],
  },
  {
    normal: [0, -1, 0],
    corners: [
      [-1, 0, -1],
      [1, 0, -1],
      [1, 0, 1],
      [-1, 0, 1],
    ],
  },
  {
    normal: [0, 0, 1],
    corners: [
      [-1, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [-1, 1, 1],
    ],
  },
  {
    normal: [0, 0, -1],
    corners: [
      [1, 0, -1],
      [-1, 0, -1],
      [-1, 1, -1],
      [1, 1, -1],
    ],
  },
];

function addBox(builder: Builder): void {
  BOX_FACES.forEach(({ normal, corners }) => {
    const [a, b, c, d] = corners.map(([x, y, z]) =>
      vertex(builder, [x * HALF, y, z * HALF], normal),
    ) as [number, number, number, number];
    builder.indices.push(a, b, c, a, c, d);
  });
}

function ringPoint(step: number): readonly [number, number] {
  const angle = (step / ROUND_SEGMENTS) * FULL_TURN;
  return [Math.cos(angle) * HALF, Math.sin(angle) * HALF];
}

function addCap(builder: Builder, y: 0 | 1): void {
  const normal: Vec3 = [0, y === 1 ? 1 : -1, 0];
  const centre = vertex(builder, [0, y, 0], normal);
  const first = builder.positions.length / COMPONENTS;
  for (let step = 0; step < ROUND_SEGMENTS; step += 1) {
    const [x, z] = ringPoint(step);
    vertex(builder, [x, y, z], normal);
  }
  for (let step = 0; step < ROUND_SEGMENTS; step += 1) {
    const a = first + step;
    const b = first + ((step + 1) % ROUND_SEGMENTS);
    builder.indices.push(...(y === 1 ? [centre, b, a] : [centre, a, b]));
  }
}

function addCylinder(builder: Builder): void {
  const first = builder.positions.length / COMPONENTS;
  for (let step = 0; step <= ROUND_SEGMENTS; step += 1) {
    const [x, z] = ringPoint(step);
    const normal: Vec3 = [x / HALF, 0, z / HALF];
    vertex(builder, [x, 0, z], normal);
    vertex(builder, [x, 1, z], normal);
  }
  for (let step = 0; step < ROUND_SEGMENTS; step += 1) {
    const base = first + step * RING_STRIDE;
    const next = base + RING_STRIDE;
    builder.indices.push(base, base + 1, next + 1, base, next + 1, next);
  }
  addCap(builder, 0);
  addCap(builder, 1);
}

function addSphere(builder: Builder): void {
  const first = builder.positions.length / COMPONENTS;
  const columns = ROUND_SEGMENTS + 1;
  for (let ring = 0; ring <= SPHERE_RINGS; ring += 1) {
    const polar = (ring / SPHERE_RINGS) * Math.PI;
    for (let step = 0; step <= ROUND_SEGMENTS; step += 1) {
      const angle = (step / ROUND_SEGMENTS) * FULL_TURN;
      const normal: Vec3 = [
        Math.sin(polar) * Math.cos(angle),
        -Math.cos(polar),
        Math.sin(polar) * Math.sin(angle),
      ];
      vertex(builder, [normal[0] * HALF, (normal[1] + 1) * HALF, normal[2] * HALF], normal);
    }
  }
  for (let ring = 0; ring < SPHERE_RINGS; ring += 1) {
    for (let step = 0; step < ROUND_SEGMENTS; step += 1) {
      const a = first + ring * columns + step;
      const b = a + columns;
      builder.indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
}

const ADDERS: Readonly<Record<ShapeKind, (builder: Builder) => void>> = {
  box: addBox,
  cylinder: addCylinder,
  sphere: addSphere,
};

/** Positions, normals and indices for one shape stretched to its size. */
export function shapeArrays(size: ShapeSize): ShapeArrays {
  const builder: Builder = { positions: [], normals: [], indices: [] };
  ADDERS[size.shape](builder);
  const scale = [size.widthM, size.heightM, size.depthM];
  const positions = builder.positions.map(
    (value, index) => value * (scale[index % COMPONENTS] ?? 1),
  );
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(builder.normals),
    indices: new Uint32Array(builder.indices),
  };
}
