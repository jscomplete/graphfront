'use strict';

const { buildSchema } = require('graphql');
const rootValueWrapper = require('./rootValue');
const { toGraphType } = require('../database/types');
const { toCamelCase, toModelName, toSingular } = require('../../util');
const graphqlSchemas = {};

const graphType = (dbType, required) => {
  return toGraphType(dbType) + (required ? '!' : '');
};

const generateFields = (columns) => {
  const relationFields = [];
  const filteredColumns = [];
  let primaryKey;
  const uniqueKeys = [];
  columns.forEach((column) => {
    if (!column.column_name.match(/^(created_at|updated_at)$/)) {
      // No input for these
      filteredColumns.push(column);
    }

    if (column.constraint_type === 'FOREIGN KEY') {
      relationFields.push(
        `${toSingular(column.related_table_name)}: ${toModelName(
          column.related_table_name
        )}`
      );
    }

    if (column.constraint_type === 'PRIMARY KEY') {
      primaryKey = column.column_name;
    }

    if (
      column.constraint_type === 'UNIQUE' ||
      column.constraint_type === 'PRIMARY KEY'
    ) {
      uniqueKeys.push(column.column_name);
    }
  });

  return {
    viewerFields: columns
      .filter((column) => column.column_name !== primaryKey)
      .map(
        (column) =>
          `${toCamelCase(column.column_name)} (hashWith: String): ${graphType(
            column.data_type,
            column.is_nullable === 'NO'
          )}`
      )
      .join('\n'),
    inputFields: filteredColumns
      .filter((column) => column.column_name !== primaryKey)
      .map(
        (column) =>
          `${toCamelCase(column.column_name)}: ${graphType(
            column.data_type,
            column.is_nullable === 'NO' && column.column_default === null
          )}`
      )
      .join('\n'),
    optionalFields: filteredColumns
      .map(
        (column) =>
          `${toCamelCase(column.column_name)}: ${graphType(
            column.data_type,
            false
          )}`
      )
      .join('\n'),
    stringFields: columns
      .filter((column) => column.data_type === 'text')
      .map(
        (column) =>
          `${toCamelCase(column.column_name)}: ${graphType(
            column.data_type,
            false
          )}`
      )
      .join('\n'),
    relationalFields: relationFields.join('\n'),
    primaryKey,
    uniqueKeys
  };
};

const generateTableSchema = (modelName, collectionName, columns) => {
  const {
    viewerFields,
    inputFields,
    optionalFields,
    stringFields,
    relationalFields,
    primaryKey,
    uniqueKeys
  } = generateFields(columns);
  return {
    tableKeys: {
      primaryKey,
      uniqueKeys
    },
    tableTypes: `
      type ${modelName} {
        ${viewerFields}
        ${relationalFields}
      }
      input ${modelName}Input {
        ${inputFields}
      }
      input ${modelName}OptionalInput {
        ${optionalFields}
      }
      input ${modelName}SearchInput {
        ${stringFields}
      }
    `,
    tableQueryFields: `
      ${collectionName}(
        filters: ${modelName}OptionalInput,
        search: ${modelName}SearchInput,
        before: String,
        after: String,
        limit: Int,
        idField: String,
        sortBy: String,
      ): [${modelName}]

      find${modelName}(
        ${optionalFields}
      ): ${modelName}
    `,
    tableMutationFields: `
      create${modelName}(
        apiKey: String!,
        input: ${modelName}Input!,
      ): ${modelName}

      update${modelName}(
        apiKey: String!,
        input: ${modelName}OptionalInput!,
        findFields: [String],
        updateOperation: UpdateOperationInput,
      ): ${modelName}

      delete${modelName}(
        apiKey: String!,
        input: ${modelName}OptionalInput!,
        findFields: [String],
      ): deletedObject

      findOrCreate${modelName}(
        apiKey: String!,
        input: ${modelName}OptionalInput!
        findFields: [String],
      ): ${modelName}

      createOrUpdate${modelName}(
        apiKey: String!,
        input: ${modelName}OptionalInput!
        findFields: [String],
      ): ${modelName}
    `
  };
};

exports.generateSchema = (db, apiKeyValidator) => (dbSchema) => {
  if (graphqlSchemas[dbSchema]) {
    return Promise.resolve(graphqlSchemas[dbSchema]);
  }

  return db(dbSchema)
    .getTablesInfo()
    .then((data) => {
      const tableNames = Object.keys(data);

      let types = '';
      const queryMethods = [];
      const mutationMethods = [];
      let queryFields = '';
      let mutationFields = '';
      const keys = {};

      tableNames.forEach((tableName) => {
        const collectionName = toCamelCase(tableName);

        const modelName = toModelName(tableName);

        queryMethods.push(collectionName, `find${modelName}`);

        mutationMethods.push(
          `create${modelName}`,
          `update${modelName}`,
          `delete${modelName}`,
          `findOrCreate${modelName}`,
          `createOrUpdate${modelName}`
        );

        const {
          tableKeys,
          tableTypes,
          tableQueryFields,
          tableMutationFields
        } = generateTableSchema(modelName, collectionName, data[tableName]);

        keys[tableName] = tableKeys;
        types += tableTypes;
        queryFields += tableQueryFields;
        mutationFields += tableMutationFields;
      });

      const schema = `
      ${types}

      type Viewer {
        ${queryFields}
      }

      type Query {
        viewer(apiKey: String!): Viewer
      }

      input UpdateOperationInput {
        type: String!
        field: String!
        value: Int
      }

      type deletedObject {
        deletedId: String!
      }

      type Mutation {
        ${mutationFields}
      }
    `;

      graphqlSchemas[dbSchema] = {
        schema: buildSchema(schema),
        rootValue: rootValueWrapper({
          queryMethods,
          mutationMethods,
          apiKeyValidator
        }),
        db: db(dbSchema, keys)
      };

      return graphqlSchemas[dbSchema];
    });
};

exports.resetSchema = (project) => {
  delete graphqlSchemas[project.dbSchema];
};

exports.buildSchema = buildSchema;
