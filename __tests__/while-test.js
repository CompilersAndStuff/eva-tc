const Type = require('../src/Type');

const {exec, test} = require('./test-util');

module.exports = eva => {

  test(eva,
  `

    (var x 10)

    (while (!= x 0)
      (set x (- x 1)))

    x

  `,
  Type.number);

};
