import { CALIBRATION_POINTS, MAP_WIDTH, MAP_HEIGHT, CalibrationPoint } from './calibration';

export interface Transform {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

function solveLinearSystem(
  points: CalibrationPoint[],
  getTarget: (p: CalibrationPoint) => number
): [number, number, number] {
  const n = points.length;
  let sumX = 0, sumZ = 0, sumXX = 0, sumZZ = 0, sumXZ = 0;
  let sumT = 0, sumXT = 0, sumZT = 0;

  for (const p of points) {
    const x = p.gameX, z = p.gameZ, t = getTarget(p);
    sumX += x; sumZ += z;
    sumXX += x * x; sumZZ += z * z; sumXZ += x * z;
    sumT += t; sumXT += x * t; sumZT += z * t;
  }

  const A = [
    [sumXX, sumXZ, sumX],
    [sumXZ, sumZZ, sumZ],
    [sumX, sumZ, n]
  ];
  const B = [sumXT, sumZT, sumT];

  // Gaussian elimination
  for (let i = 0; i < 3; i++) {
    let maxRow = i;
    for (let k = i + 1; k < 3; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k;
    }
    [A[i], A[maxRow]] = [A[maxRow], A[i]];
    [B[i], B[maxRow]] = [B[maxRow], B[i]];

    for (let k = i + 1; k < 3; k++) {
      const c = A[k][i] / A[i][i];
      for (let j = i; j < 3; j++) A[k][j] -= c * A[i][j];
      B[k] -= c * B[i];
    }
  }

  const x: [number, number, number] = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    x[i] = B[i];
    for (let j = i + 1; j < 3; j++) x[i] -= A[i][j] * x[j];
    x[i] /= A[i][i];
  }
  return x;
}

let cachedTransform: Transform | null = null;

export function calculateTransform(): Transform {
  if (cachedTransform) return cachedTransform;

  if (CALIBRATION_POINTS.length < 2) {
    cachedTransform = { 
      a: 1, b: 0, c: MAP_WIDTH / 2, 
      d: 0, e: -1, f: MAP_HEIGHT 
    };
    return cachedTransform;
  }

  const [a, b, c] = solveLinearSystem(CALIBRATION_POINTS, p => p.pixelX);
  const [d, e, f] = solveLinearSystem(CALIBRATION_POINTS, p => p.pixelY);

  cachedTransform = { a, b, c, d, e, f };
  console.log('Transform calculated:', cachedTransform);
  return cachedTransform;
}

export function gameToPixel(gameX: number, gameZ: number): { x: number; y: number } {
  const transform = calculateTransform();
  return {
    x: transform.a * gameX + transform.b * gameZ + transform.c,
    y: transform.d * gameX + transform.e * gameZ + transform.f
  };
}

