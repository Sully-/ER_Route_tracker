// Test avec un point exact donné par l'utilisateur
const calibrationPoints = [
  { gameX: 11731.32, gameZ: 9888.13, pixelX: 1161, pixelY: 4752 },
  { gameX: 13956.86, gameZ: 9997.36, pixelX: 3867, pixelY: 4648 },
  { gameX: 13268.81, gameZ: 12292.96, pixelX: 3187, pixelY: 2357 },
  { gameX: 11514.89, gameZ: 10556.45, pixelX: 1426, pixelY: 4097 },
];

function solveLinearSystem(points, getTarget) {
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
    [sumX, sumZ, n],
  ];
  const B = [sumXT, sumZT, sumT];

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

  const x = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    x[i] = B[i];
    for (let j = i + 1; j < 3; j++) x[i] -= A[i][j] * x[j];
    x[i] /= A[i][i];
  }
  return x;
}

const [a, b, c] = solveLinearSystem(calibrationPoints, p => p.pixelX);
const [d, e, f] = solveLinearSystem(calibrationPoints, p => p.pixelY);

console.log('Transformation actuelle:');
console.log(`  pixelX = ${a.toFixed(6)} * gameX + ${b.toFixed(6)} * gameZ + ${c.toFixed(2)}`);
console.log(`  pixelY = ${d.toFixed(6)} * gameX + ${e.toFixed(6)} * gameZ + ${f.toFixed(2)}`);
console.log();

console.log('Vérification des points de calibration:');
calibrationPoints.forEach((p, i) => {
  const calcX = a * p.gameX + b * p.gameZ + c;
  const calcY = d * p.gameX + e * p.gameZ + f;
  const errX = calcX - p.pixelX;
  const errY = calcY - p.pixelY;
  console.log(`  Point ${i + 1}: (${p.gameX}, ${p.gameZ})`);
  console.log(`    Attendu: (${p.pixelX}, ${p.pixelY})`);
  console.log(`    Calculé: (${calcX.toFixed(2)}, ${calcY.toFixed(2)})`);
  console.log(`    Erreur: (${errX.toFixed(2)}, ${errY.toFixed(2)})`);
  console.log();
});

console.log('Pour tester un nouveau point, modifiez les valeurs ci-dessous:');
console.log('const testGameX = VOTRE_X;');
console.log('const testGameZ = VOTRE_Z;');
console.log('const expectedPixelX = VOTRE_PIXEL_X;');
console.log('const expectedPixelY = VOTRE_PIXEL_Y;');

