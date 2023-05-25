const Type = require('../src/Type');

const {exec, test} = require('./test-util');

module.exports = eva => {

  test(eva,

    ['begin',
      ['var', 'x', 10],
      ['var', 'y', 20],
      ['+', ['*', 'x', 10], 'y']],

  Type.number);

  test(eva,

    ['begin',
      ['var', 'x', 10],

      ['begin',
        ['var', 'x', '"hello"'],
        ['+', 'x', '"world"']],

      ['-', 'x', 5]],

  Type.number);

  test(eva,

    ['begin',
      ['var', 'x', 10],

      ['begin',
        ['var', 'y', 20],
        ['+', 'x', 'y']]],

  Type.number);


  test(eva,

    ['begin',
      ['var', 'x', 10],

      ['begin',
        ['var', 'y', 20],
        ['set', 'x', ['+', 'x', 'y']]]],

  Type.number);

  test(eva,
    `
    (begin
      (var x 10)
      (var y 20)
      (+ (* x 10) y))
  `,
    Type.number);

  exec(eva, `(var x 10)`);

  test(eva,
    `
    (var y 20)
    (+ (* x 10) y)
  `,
    Type.number);

};
