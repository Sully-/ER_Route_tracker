// Test avec le point exact donné par l'utilisateur
const calibrationPoints = [
  { gameX: 11731.32, gameZ: 9888.13, pixelX: 1161, pixelY: 4752 },
  { gameX: 13956.86, gameZ: 9997.36, pixelX: 3867, pixelY: 4648 },
  { gameX: 13268.81, gameZ: 12292.96, pixelX: 3187, pixelY: 2357 },
  { gameX: 11514.89, gameZ: 10556.45, pixelX: 1426, pixelY: 4097 },
];

// Point exact donné par l'utilisateur
const exactPoint = {
  gameX: 11958.53,
  gameZ: 10560.36,
  pixelX: 1883,
  pixelY: 4080,
};

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

console.log('=== AVANT (avec 4 points) ===');
const [a1, b1, c1] = solveLinearSystem(calibrationPoints, p => p.pixelX);
const [d1, e1, f1] = solveLinearSystem(calibrationPoints, p => p.pixelY);

const calcX1 = a1 * exactPoint.gameX + b1 * exactPoint.gameZ + c1;
const calcY1 = d1 * exactPoint.gameX + e1 * exactPoint.gameZ + f1;
console.log(`Point exact (11958.53, 10560.36):`);
console.log(`  Attendu: (1883, 4080)`);
console.log(`  Calculé: (${calcX1.toFixed(2)}, ${calcY1.toFixed(2)})`);
console.log(`  Erreur: (${(calcX1 - 1883).toFixed(2)}, ${(calcY1 - 4080).toFixed(2)})`);
console.log();

console.log('=== APRÈS (avec 5 points incluant le point exact) ===');
const allPoints = [...calibrationPoints, exactPoint];
const [a2, b2, c2] = solveLinearSystem(allPoints, p => p.pixelX);
const [d2, e2, f2] = solveLinearSystem(allPoints, p => p.pixelY);

console.log(`Nouvelle transformation:`);
console.log(`  pixelX = ${a2.toFixed(6)} * gameX + ${b2.toFixed(6)} * gameZ + ${c2.toFixed(2)}`);
console.log(`  pixelY = ${d2.toFixed(6)} * gameX + ${e2.toFixed(6)} * gameZ + ${f2.toFixed(2)}`);
console.log();

const calcX2 = a2 * exactPoint.gameX + b2 * exactPoint.gameZ + c2;
const calcY2 = d2 * exactPoint.gameX + e2 * exactPoint.gameZ + f2;
console.log(`Point exact (11958.53, 10560.36):`);
console.log(`  Attendu: (1883, 4080)`);
console.log(`  Calculé: (${calcX2.toFixed(2)}, ${calcY2.toFixed(2)})`);
console.log(`  Erreur: (${(calcX2 - 1883).toFixed(2)}, ${(calcY2 - 4080).toFixed(2)})`);
console.log();

console.log('Erreurs sur tous les points:');
let totalError = 0;
allPoints.forEach((p, i) => {
  const predX = a2 * p.gameX + b2 * p.gameZ + c2;
  const predY = d2 * p.gameX + e2 * p.gameZ + f2;
  const errX = predX - p.pixelX;
  const errY = predY - p.pixelY;
  const errDist = Math.sqrt(errX * errX + errY * errY);
  totalError += errDist;
  console.log(`  Point ${i + 1}: erreur=${errDist.toFixed(2)}px (dx=${errX.toFixed(2)}, dy=${errY.toFixed(2)})`);
});
console.log(`  Erreur moyenne: ${(totalError / allPoints.length).toFixed(2)}px`);

