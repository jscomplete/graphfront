# Graphfront

Use a database schema information to generate a GraphQL schema.

This is a work-in-progress project.
It requires a super recent version of Node.js and using it in production is not recommended.


[![npm version](https://badge.fury.io/js/graphfront.svg)](https://badge.fury.io/js/graphfront)

## Getting Started

An overview of GraphQL in general is available in the
[README](https://github.com/facebook/graphql/blob/master/README.md) for the
[Specification for GraphQL](https://github.com/facebook/graphql).

### Using Graphfront

Install Graphfront from npm

```sh
npm install --save graphfront
```

Graphfront provides two important capabilities: generating a GraphQL schema, and
exposing an HTTP handler to server requests for that schema.

First, generate a GraphQL schema based on a database schema.

```js
import { generator } from 'graphfront';

const { getSchema } = generator(dbPool, apiKeyValidator);
```

This defines a a function that can be invoked to generate a schema.

Or you can use request handler that automatically generates the schema

```js
const graphfront = require('graphfront');

const graphfrontHTTP = graphfront({
  dbPool,
  apiKeyValidator: (apiKey) => apiKey === 'SuperSecretKey'
});

app.use('/my-api', graphfrontHTTP);
```

### Contributing

We actively welcome pull requests, learn how to
[contribute](https://github.com/jscomplete/graphfront/blob/master/CONTRIBUTING.md).

### Changelog

Changes are tracked as [Github releases](https://github.com/jscomplete/graphfront/releases).

### License

Graphfront is [BSD-licensed](https://github.com/jscomplete/graphfront/blob/master/LICENSE).
