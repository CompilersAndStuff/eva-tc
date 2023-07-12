const Type = require('./Type');
const TypeEnvironment = require('./TypeEnvironment');

class EvaTC {
  constructor() {
    this.global = this._createGlobal();
  }

  tcGlobal(exp) {
    return this._tcBody(exp, this.global);
  }

  _tcBody(body, env) {
    if (body[0] === 'begin') {
      return this._tcBlock(body, env);
    }

    return this.tc(body, env);
  }

  tc(exp, env = this.global) {
    if (this._isNumber(exp)) {
      return Type.number;
    }

    if (this._isString(exp)) {
      return Type.string;
    }

    if (this._isBoolean(exp)) {
      return Type.boolean;
    }

    if (this._isBinary(exp)) {
      return this._binary(exp, env);
    }

    if (this._isBooleanBinary(exp)) {
      return this._booleanBinary(exp, env);
    }

    if (exp[0] === 'type') {
      const [_tag, name, base] = exp;

      if (base[0] === 'or') {
        const options = base.slice(1);
        const optionTypes = options.map(type => Type.fromString(type));
        return (Type[name] = new Type.Union({name, optionTypes}));
      }

      if (Type.hasOwnProperty(name)) {
        throw `Type ${name} is already defined: ${Type[name]}.`
      }

      if (!Type.hasOwnProperty(base)) {
        throw `Type ${base} is not defined.`
      }

      return (Type[name] = new Type.Alias({
        name,
        parent: Type[base],
      }))

    }

    if (exp[0] === 'var') {
      const [_tag, name, value] = exp;

      const valueType = this.tc(value, env);

      if (Array.isArray(name)) {
        const [varName, typeAnnotation] = name;
        const expectedType = Type.fromString(typeAnnotation);
        this._expect(valueType, expectedType, value, exp)

        return env.define(varName, expectedType);
      }

      return env.define(name, valueType);
    }

    if (this._isVariableName(exp)) {
      return env.lookup(exp);
    }

    if (exp[0] === 'set') {
      const [_tag, ref, value] = exp;

      if (ref[0] === 'prop') {
        const [_tag, instance, propName] = ref;
        const instanceType = this.tc(instance, env);
        const valueType = this.tc(value, env);
        const propType = instanceType.getField(propName);

        return this._expect(valueType, propType, value, exp);
      }

      const valueType = this.tc(value, env);
      const varType = this.tc(ref, env);

      return this._expect(valueType, varType, value, exp);
    }

    if (exp[0] === 'begin') {
      const blockEnv = new TypeEnvironment({}, env);
      return this._tcBlock(exp, blockEnv);
    }

    if (exp[0] === 'if') {
      const [_tag, condition, consequent, alternate] = exp;

      const t1 = this.tc(condition, env);
      this._expect(t1, Type.boolean, condition, exp);

      let consequentEnv = env;

      if (this._isTypeCastCondition(condition)) {
        const [name, specificType] = this._getSpecifiedType(condition);

        consequentEnv = new TypeEnvironment(
          {[name]: Type.fromString(specificType)},
          env,
        );
      }

      const t2 = this.tc(consequent, consequentEnv);
      const t3 = this.tc(alternate, env);

      return this._expect(t3, t2, exp, exp);
    }

    if (exp[0] === 'while') {
      const [_tag, condition, body] = exp;

      const t1 = this.tc(condition, env);
      this._expect(t1, Type.boolean, condition, exp);

      return this.tc(body, env);
    }

    if (exp[0] === 'lambda') {
      if (this._isGenericLambdaFunction(exp)) {
        return this._createGenericFunctionType(exp, env)
      }

      return this._createSimpleFunctionType(exp, env)
    }

    if (exp[0] === 'def') {
      const varExp = this._transformDefToLambda(exp);

      if (!this._isGenericDefFunction(exp)) {

        const fnname = exp[1];
        const params = exp[2];
        const returnTypeStr = exp[4];

        const paramTypes = params.map(([_pname, typeStr]) => Type.fromString(typeStr));

        env.define(
          fnname,
          new Type.Function({
            paramTypes,
            returnType: Type.fromString(returnTypeStr)
          }),
        );
      }

      return this.tc(varExp, env);
    }

    if (exp[0] === 'class') {
      const [_tag, name, superClassName, body] = exp;

      const superClass = Type[superClassName];

      const classType = new Type.Class({name, superClass});

      Type[name] = env.define(name, classType);

      this._tcBody(body, classType.env);

      return classType;
    }

    if (exp[0] === 'super') {
      const [_tag, className] = exp;

      const classType = Type[className];

      if (classType == null) {
        throw `Unknown class ${className}.`
      }

      return classType.superClass;
    }

    if (exp[0] === 'new') {
      const [_tag, className, ...argValues] = exp;

      const classType = Type[className];

      if (classType == null) {
        throw `Unknown class ${className}.`;
      }

      const argTypes = argValues.map(arg => this.tc(arg, env));

      return this._tcCheckFunctionCall(
        classType.getField('constructor'),
        [classType, ...argTypes],
        env,
        exp,
      )
    }

    if (exp[0] === 'prop') {
      const [_tag, instance, name] = exp;

      const instanceType = this.tc(instance, env);

      return instanceType.getField(name);
    }

    if (Array.isArray(exp)) {
      const fn = this.tc(exp[0], env);

      let actualFn = fn;
      let argValues = exp.slice(1);

      if (fn instanceof Type.GenericFunction) {
        const actualTypes = this._extractActualCallTypes(exp);

        const genericTypesMap = this._getGenericTypesMap(
          fn.genericTypes,
          actualTypes,
        );

        const [boundParams, boundReturnType] = this._bindFunctionTypes(
          fn.params,
          fn.returnType,
          genericTypesMap,
        );

        actualFn = this._tcFunction(boundParams, boundReturnType, fn.body, fn.env);
        argValues = exp.slice(2);
      }

      const argTypes = argValues.map(arg => this.tc(arg, env));

      return this._tcCheckFunctionCall(actualFn, argTypes, env, exp);
    }

    throw `Unknown type for epxression: ${exp}.`
  }

  _getGenericTypesMap(genericTypes, actualType) {
    const boundTypes = new Map();
    for (let i = 0; i < genericTypes.length; i++) {
      boundTypes.set(genericTypes[i], actualType[i]);
    }

    return boundTypes;
  }

  _bindFunctionTypes(params, returnType, genericTypesMap) {
    const actualParams = [];

    for (let i = 0; i < params.length; i++) {
      const [paramName, paramType] = params[i];

      let actualParamType = paramType;

      if (genericTypesMap.has(paramType)) {
        actualParamType = genericTypesMap.get(paramType);
      }

      actualParams.push([paramName, actualParamType]);
    }

    let actualReturnType = returnType;

    if (genericTypesMap.has(returnType)) {
      actualReturnType = genericTypesMap.get(returnType);

      return [actualParams, actualReturnType];
    }
  }

  _extractActualCallTypes(exp) {
    const data = /^<([^>]+)>$/.exec(exp[1]);

    if (data === null) {
      throw `No actual types provided in generic call: ${exp}.`;
    }

    return data[1].split(',');
  }

  _createSimpleFunctionType(exp, env) {
    const [_tag, params, _retDel, returnTypeStr, body] = exp;
    return this._tcFunction(params, returnTypeStr, body, env);
  }

  _createGenericFunctionType(exp, env) {
    const [_tag, genericTypes, params, _retDel, returnType, body] = exp;

    return new Type.GenericFunction({
      genericTypesStr: genericTypes.slice(1,-1),
      params,
      body,
      returnType,
      env,
    });
  }

  _isGenericLambdaFunction(exp) {
    return exp.length === 6 && /^<[^>]+>$/.test(exp[1]);
  }

  _isGenericDefFunction(exp) {
    return exp.length === 7 && /^<[^>]+>$/.test(exp[2]);
  }

  _transformDefToLambda(exp) {
    if (this._isGenericDefFunction(exp)) {
      const [_tag, name, genericTypesStr, params, retDel, returnTypeStr, body] = exp;
      return ['var', name, ['lambda', genericTypesStr, params, retDel, returnTypeStr, body]];
    }

    const [_tag, name, params, retDel, returnTypeStr, body] = exp;
    return ['var', name, ['lambda', params, retDel, returnTypeStr, body]];
  }

  _isTypeCastCondition(condition) {
    const [op, lhs] = condition;

    return op === '==' && lhs[0] === 'typeof';
  }

  _getSpecifiedType(condition) {
    const [_op, [_typeof, name], specificType] = condition;

    return [name, specificType.slice(1,-1)];
  }

  _tcCheckFunctionCall(fn, argTypes, _env, exp) {
    if (fn.paramTypes.length !== argTypes.length) {
      throw `\nFunction ${exp[0]} ${fn.getName()} expects ${fn.paramTypes.length} arguments, ${argTypes.length} given in ${exp}.\n`
    }

    argTypes.forEach((argType, index) => {
      if (fn.paramTypes[index] === Type.any) {
        return;
      }
      this._expect(argType, fn.paramTypes[index], argTypes[index], exp);
    });

    return fn.returnType;
  }

  _tcFunction(params, returnTypeStr, body, env) {
    const returnType = Type.fromString(returnTypeStr);

    const paramsRecord = {};
    const paramTypes = [];

    params.forEach(([name, typeStr]) => {
      const paramType = Type.fromString(typeStr);
      paramsRecord[name] = paramType;
      paramTypes.push(paramType);
    });

    const fnEnv = new TypeEnvironment(paramsRecord, env);

    const actualReturnType = this._tcBody(body, fnEnv);

    if (!returnType.equals(actualReturnType)) {
      `Expected function ${body} to return ${returnType}, but got ${actualReturnType}.`;
    }

    return new Type.Function({
      paramTypes,
      returnType,
    });
  }

  _tcBlock(exp, blockEnv) {
    let result;

    const [_tag, ...expressions] = exp;

    expressions.forEach(e => {
      result = this.tc(e, blockEnv);
    });

    return result;
  }

  _isVariableName(exp) {
    return typeof exp === 'string' && /^[+\-*/<>=a-zA-Z0-9_:]+$/.test(exp);
  }

  _booleanBinary(exp, env) {
    this._checkArity(exp, 2);

    const t1 = this.tc(exp[1], env);
    const t2 = this.tc(exp[2], env);

    this._expect(t2, t1, exp[2], exp);

    return Type.boolean;
  }


  _binary(exp, env) {
    this._checkArity(exp, 2);

    const t1 = this.tc(exp[1], env);
    const t2 = this.tc(exp[2], env);

    const allowedTypes = this._getOperandTypesForOperator(exp[0]);

    this._expectOperatorType(t1, allowedTypes, exp);
    this._expectOperatorType(t2, allowedTypes, exp);

    return this._expect(t2, t1, exp[2], exp);
  }

  _getOperandTypesForOperator(operator) {
    switch(operator) {
      case '+':
        return [Type.string, Type.number];
      case '-':
        return [Type.number];
      case '*':
        return [Type.number];
      case '/':
        return [Type.number];
      default:
        throw `Unknown operator: ${operator}.`;
    }
  }

  _expectOperatorType(type_, allowedTypes, exp) {
    if (type_ instanceof Type.Union) {
      if (type_.includesAll(allowedTypes)) {
        return;
      }
    } else {
      if (allowedTypes.some(t => t.equals(type_))) {
        return;
      }
    }
    throw `\nUnexpected type: ${type_} in ${exp}, allowed: ${allowedTypes}.`;
  }

  _checkArity(exp, arity) {
    if ( exp.length - 1 !== arity ) {
      throw `\nOperator '${exp[0]}' expects ${arity} operands, ${exp.length - 1} given in ${exp}.\n`
    }
  }

  _expect(actualType, expectedType, value, exp) {
    if(!actualType.equals(expectedType)) {
      this._throw(actualType, expectedType, value, exp);
    }

    return actualType;
  }

  _throw(actualType, expectedType, value, exp) {
    throw `\nExpected, '${expectedType}' type for ${value} in ${exp}, but got '${actualType} type.'`
  }

  _createGlobal() {
    return new TypeEnvironment({
      VERSION: Type.string,

      sum: Type.fromString('Fn<number<number, number>>'),
      square: Type.fromString('Fn<number<number>>'),

      typeof: Type.fromString('Fn<string<any>>'),
    });
  }

  _isBooleanBinary(exp) {
    return (
      exp[0] === '==' ||
      exp[0] === '!=' ||
      exp[0] === '>=' ||
      exp[0] === '<=' ||
      exp[0] === '>' ||
      exp[0] === '<'
    );
  }

  _isBinary(exp) {
    return /^[+\-*/]$/.test(exp[0]);
  }

  _isNumber(exp) {
    return typeof exp === 'number';
  }

  _isString(exp) {
    return typeof exp === 'string' && exp[0] === '"' && exp.at(-1) === '"';
  }

  _isBoolean(exp) {
    return typeof exp === 'boolean' || exp === 'true' || exp === 'false';
  }
}

module.exports = EvaTC;
