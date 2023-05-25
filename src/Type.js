class Type {
  constructor(name) {
    this.name = name;
  }

  getName() {
    return this.name;
  }

  toString() {
    return this.getName();
  }

  equals(other) {
    return this.name === other.name;
  }

  static fromString(typeStr) {
    if (this.hasOwnProperty(typeStr)) {
      return this[typeStr];
    }
    throw `Unknown type: ${typeStr}.`
  }
}

Type.number = new Type('number');

Type.string = new Type('string');

Type.boolean = new Type('boolean');

module.exports = Type;
