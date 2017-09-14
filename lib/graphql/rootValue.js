'use strict';

const { toTableName } = require('../../util');

module.exports = ({ queryMethods, mutationMethods, apiKeyValidator }) => {
  const viewerRoot = {
    viewer: (args) => {
      return new Proxy(
        {},
        {
          get: (object, property) => {
            if (Reflect.has(object, property)) {
              return Reflect.get(object, property);
            }
            if (queryMethods.indexOf(property) >= 0) {
              const found = property.match(/^(find)?(.*)/);
              if (found) {
                const tableName = toTableName(found[2]);
                const method = found[1] || 'list';
                if (!apiKeyValidator(args.apiKey, 'query', method)) {
                  throw new Error('Invalid Request');
                }
                return (args, { db }) => {
                  return db[method](tableName, args);
                };
              }
            }
          }
        }
      );
    }
  };

  const rootValue = new Proxy(viewerRoot, {
    get: (object, property) => {
      if (Reflect.has(object, property)) {
        return Reflect.get(object, property);
      }
      if (mutationMethods.indexOf(property) >= 0) {
        const found = property.match(
          /^(findOrCreate|createOrUpdate|create|update|delete)(.*)/
        );
        if (found) {
          const tableName = toTableName(found[2]);
          return (args, { db }) => {
            if (!apiKeyValidator(args.apiKey, 'mutation', found[1])) {
              throw new Error('Invalid Request');
            }
            const input = Object.assign({}, args.input);
            return db[`${found[1]}Record`](tableName, input, args);
          };
        }
      }
    }
  });

  return rootValue;
};
