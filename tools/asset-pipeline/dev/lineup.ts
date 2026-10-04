import '@bcgov/bc-sans/css/BC_Sans.css';
import '@bcgov/design-tokens/css/variables.css';

import {
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

import manifest from '../generated/models.manifest.json';

declare global {
  interface Window {
    __lineupReady: boolean;
  }
}

interface LineupModel {
  readonly modelKey: string;
  readonly file: string;
  readonly dims: { readonly widthM: number; readonly depthM: number; readonly heightM: number };
  readonly source: { readonly name: string };
}

interface Row {
  readonly title: string;
  readonly tiltDeg: number;
  readonly match: (modelKey: string) => boolean;
}

interface Item {
  readonly group: Group;
  readonly widthM: number;
}

const FIGURE = { widthM: 0.5, heightM: 1.8, depthM: 0.3 };
const GAP_SHARE = 0.08;
// An orthographic view keeps every model at the same scale across the row, so sizes compare.
const VIEW_TILT_DEG = 15;
// Flat tiles need a steeper view to show their footprint.
const GROUND_TILT_DEG = 55;
const HALF = 0.5;
const FRAME_MARGIN = 1.15;
// Share of the view kept below the ground for the two lanes of labels.
const LABEL_ROOM = 0.2;
const LABEL_LANES = 2;
const LIGHT = { sky: 2.2, sun: 2.4 };
const SUN_DIRECTION = { x: 2, y: 4, z: 5 };
const CAMERA_DISTANCE_M = 2000;
const CLIP = { nearM: 0.1, farM: 5000 };
const PLACEHOLDER = 'procedural placeholder';
const GROUND_KEYS =
  /^(path-(?!light)|lawn|meadow|plaza|pond|rain-garden|parking|off-leash|community-garden)/;
const BIG_KEYS =
  /^(tennis|basketball|ball-diamond|playground|swings|spray|outdoor-fitness|washroom)/;

const ROWS: readonly Row[] = [
  {
    title: 'Trees and shrubs',
    tiltDeg: VIEW_TILT_DEG,
    match: (key) => key.startsWith('tree-') || key.startsWith('shrub-'),
  },
  {
    title: 'Buildings, play and sports',
    tiltDeg: VIEW_TILT_DEG,
    match: (key) => BIG_KEYS.test(key),
  },
  {
    title: 'Ground tiles and path segments',
    tiltDeg: GROUND_TILT_DEG,
    match: (key) => GROUND_KEYS.test(key),
  },
  {
    title: 'Furniture and kit parts',
    tiltDeg: VIEW_TILT_DEG,
    match: (key) => !GROUND_KEYS.test(key) && !BIG_KEYS.test(key) && !/^(tree|shrub)-/.test(key),
  },
];

function label(text: string, index: number): CSS2DObject {
  const element = document.createElement('div');
  // Alternate rows of labels so neighbours with narrow models do not overlap.
  element.className = index % LABEL_LANES === 0 ? 'lineup-label' : 'lineup-label lineup-label-low';
  element.textContent = text;
  return new CSS2DObject(element);
}

function figure(): Group {
  const group = new Group();
  const body = new Mesh(
    new BoxGeometry(FIGURE.widthM, FIGURE.heightM, FIGURE.depthM).translate(
      0,
      FIGURE.heightM * HALF,
      0,
    ),
    new MeshStandardMaterial({ color: new Color('#707070') }),
  );
  group.add(body, label('1.8 m figure', 0));
  return group;
}

async function loadModel(loader: GLTFLoader, model: LineupModel, index: number): Promise<Group> {
  const gltf = await loader.loadAsync(`/${model.file}`);
  const group = new Group();
  const name = model.source.name === PLACEHOLDER ? `${model.modelKey} *` : model.modelKey;
  group.add(gltf.scene, label(name, index));
  return group;
}

interface Framing {
  readonly widthM: number;
  readonly heightM: number;
  readonly aspect: number;
  readonly tiltDeg: number;
}

function camera({ widthM, heightM, aspect, tiltDeg }: Framing): OrthographicCamera {
  const fullHeight = Math.max(heightM * (1 + LABEL_ROOM), widthM / aspect) * FRAME_MARGIN;
  const halfHeight = fullHeight * HALF;
  const halfWidth = halfHeight * aspect;
  const view = new OrthographicCamera(
    -halfWidth,
    halfWidth,
    halfHeight,
    -halfHeight,
    CLIP.nearM,
    CLIP.farM,
  );
  const tilt = MathUtils.degToRad(tiltDeg);
  const centreY = (heightM - fullHeight * LABEL_ROOM) * HALF;
  view.position.set(
    0,
    centreY + Math.sin(tilt) * CAMERA_DISTANCE_M,
    Math.cos(tilt) * CAMERA_DISTANCE_M,
  );
  view.lookAt(0, centreY, 0);
  return view;
}

function layout(items: readonly Item[]): number {
  const widest = Math.max(...items.map((item) => item.widthM));
  const gap = widest * GAP_SHARE;
  const total = items.reduce((sum, item) => sum + item.widthM, 0) + gap * (items.length - 1);
  let cursor = -total * HALF;
  items.forEach((item) => {
    item.group.position.x = cursor + item.widthM * HALF;
    cursor += item.widthM + gap;
  });
  return total;
}

function lights(): readonly [HemisphereLight, DirectionalLight] {
  const sun = new DirectionalLight('#ffffff', LIGHT.sun);
  sun.position.set(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z);
  return [new HemisphereLight('#ffffff', '#8a8a80', LIGHT.sky), sun];
}

function rowContainer(title: string): HTMLDivElement {
  const container = document.createElement('section');
  const heading = document.createElement('h2');
  heading.textContent = title;
  const canvasBox = document.createElement('div');
  canvasBox.className = 'lineup-row';
  container.append(heading, canvasBox);
  document.getElementById('rows')?.append(container);
  return canvasBox;
}

async function drawRow(
  row: Row,
  models: readonly LineupModel[],
  loader: GLTFLoader,
): Promise<void> {
  const canvasBox = rowContainer(row.title);
  const scene = new Scene();
  scene.background = new Color('#f2f2f2');
  scene.add(...lights());
  const loaded = await Promise.all(
    models.map((model, index) => loadModel(loader, model, index + 1)),
  );
  const items: Item[] = [
    { group: figure(), widthM: FIGURE.widthM },
    ...loaded.map((group, index) => ({ group, widthM: models[index]?.dims.widthM ?? 1 })),
  ];
  items.forEach((item) => scene.add(item.group));
  const totalWidth = layout(items);
  const tallest = Math.max(FIGURE.heightM, ...models.map((model) => model.dims.heightM));
  const { clientWidth, clientHeight } = canvasBox;
  const view = camera({
    widthM: totalWidth,
    heightM: tallest,
    aspect: clientWidth / clientHeight,
    tiltDeg: row.tiltDeg,
  });
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setSize(clientWidth, clientHeight);
  const labels = new CSS2DRenderer();
  labels.setSize(clientWidth, clientHeight);
  labels.domElement.className = 'lineup-labels';
  canvasBox.append(renderer.domElement, labels.domElement);
  renderer.render(scene, view);
  labels.render(scene, view);
}

async function main(): Promise<void> {
  window.__lineupReady = false;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const models: readonly LineupModel[] = manifest.models;
  for (const row of ROWS) {
    await drawRow(
      row,
      models.filter((model) => row.match(model.modelKey)),
      loader,
    );
  }
  window.__lineupReady = true;
}

void main();
