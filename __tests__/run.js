const EvaTC = require('../src/EvaTC');

const tests = [
  require('./self-eval-test.js'),
  require('./math-test'),
  require('./variable-test'),
  require('./block-test'),
  require('./if-test'),
  require('./while-test'),
];

const eva = new EvaTC();

tests.forEach(test => test(eva));

console.log('All assertions passed!');
