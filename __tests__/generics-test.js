const { exec, test } = require('./test-util');
const Type = require('../src/Type');

module.exports = eva => {

  exec(eva,
    `
    (def combine <K> ((x K) (y K)) -> K (+ x y))

  `);

  test(eva,
    `

    (combine <number> 2 3)

  `,
    Type.number);

  test(eva,
    `

    (combine <string> "Hello, " "world!")

  `,
    Type.string);

  test(eva,
    `
    ((lambda <K> ((x K)) -> K (+ x x)) <number> 2)

  `,
    Type.number);

  test(eva,
    `
    ((lambda <K> ((x K)) -> K (+ x x)) <string> "hello")

  `,
    Type.string);

};
