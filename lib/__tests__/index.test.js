'use strict';

const graphql = require('graphql');
const graphfront = require('../index');
const graphqlHTTP = require('express-graphql');

describe('Graphfront API', () => {
  it('exposes buildSchema and graphqlHTTP', () => {
    expect(graphfront.buildSchema).toBe(graphql.buildSchema);
    expect(graphfront.graphqlHTTP).toBe(graphqlHTTP);
  });

  it('must be a top-level function that receives a config object', () => {
    expect(() => graphfront({})).not.toThrow();

    expect(() => graphfront()).toThrow();
  });

  it('exposes a schemaDb function', () => {
    expect(() => graphfront.schemaDb()).not.toThrow();
  });

  it('exposes a generator function', () => {
    expect(() => graphfront.generator()).not.toThrow();
  });
});
