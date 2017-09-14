'use strict';

const {
  buildSchema,
  generateSchema,
  resetSchema
} = require('./graphql/schema');
const graphqlHTTP = require('express-graphql');

const generator = (dbPool, apiKeyValidator) => {
  const db = require('./database')(dbPool);

  return {
    getSchema: generateSchema(db, apiKeyValidator),
    resetSchema,
    db
  };
};

const graphfront = function({ dbPool, dbSchema = 'public', apiKeyValidator }) {
  const { getSchema } = generator(dbPool, apiKeyValidator);

  return function(req, res) {
    getSchema(dbSchema)
      .then(({ schema, rootValue, db }) => {
        graphqlHTTP({
          schema,
          rootValue,
          context: { db },
          graphiql: true
        })(req, res);
      })
      .catch((err) => {
        console.error(err);
        res.status(500).send('Something went wrong');
      });
  };
};

graphfront.buildSchema = buildSchema;
graphfront.graphqlHTTP = graphqlHTTP;

graphfront.schemaDb = function(dbPool, dbSchema) {
  const db = require('./database')(dbPool);

  return {
    projectDb: db(dbSchema),
    resetSchema
  };
};

graphfront.generator = generator;

module.exports = graphfront;
