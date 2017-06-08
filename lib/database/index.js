const {
  toSnakeCase,
  toTableName,
  toModelName,
  toCamelCase,
  toCollectionName,
  toCamelCaseObject
} = require('../../util');

const { recordsLimit } = require('../config');
const { toDbType, toUIType } = require('./types');

const { columnsView } = require('./views');

const dbColumn = (field, dbSchema) => {
  return [
    toSnakeCase(field.nameValue) + (field.isRelation && !toSnakeCase(field.nameValue).match(/_id$/) ? '_id' : ''),
    field.isRelation ? `text references ${dbSchema}.${toTableName(field.typeValue)}(id)` : toDbType(field.typeValue),
    field.isRequired === 'yes' ? ' not null': ''
  ].join(' ');
};

const getHandler = (object, property) => {
  if (Reflect.has(object, property)) {
    return Reflect.get(object, property);
  }

  if (object[`${property}Id`]) {
    const tableName = toTableName(property);
    return (args, { db }) => {
      return db.find(tableName, { id: object[`${property}Id`] });
    };
  }
};

const dbColumns = (fields, dbSchema) => {
  return fields.map(field => dbColumn(field, dbSchema));
};

module.exports = (dbPool) => (dbSchema, keys) => {
  return {
    createTable(data) {
      const tableName = toTableName(data.collectionName);
      return dbPool.query(`
        CREATE TABLE ${dbSchema}.${tableName} (
          idx bigserial primary key,
          id text not null unique default md5(now()::text || '-' || random()::text),
          ${dbColumns(data.fields, dbSchema)},
          created_at timestamp without time zone not null default (now() at time zone 'utc'),
          updated_at timestamp without time zone not null default (now() at time zone 'utc')
        )`
      ).then(() => this.tableAndColumns(tableName));
    },

    alterTable(data) {
      const tableName = toTableName(data.collectionName);
      return this.tableAndColumns(tableName).then(info => {
        let currentFields = info[tableName].fields;
        let newFields = [];

        data.fields.forEach(field => {
          const current = currentFields.find(cf => cf.id === field.id);
          if (current) {
            current.noChange = true;
            return;
          }

          newFields.push(field);
        });

        const fieldsToDrop = currentFields.filter(cf => !cf.noChange && !['idx', 'id', 'createdAt', 'updatedAt'].includes(cf.nameValue)); // TODO: idx

        if (newFields.length === 0 && fieldsToDrop.length === 0) {
          return this.tableAndColumns(tableName);
        }

        return dbPool.query(`
          ALTER TABLE ${dbSchema}.${tableName}
            ${newFields.map(field => `ADD COLUMN ${dbColumn(field, dbSchema)}`).join(',\n')}
            ${newFields.length > 0 && fieldsToDrop.length > 0 ? ',' : ''}
            ${fieldsToDrop.map(field => `DROP COLUMN ${toSnakeCase(field.nameValue)}`).join(',\n')}
          `
        ).then(() => this.tableAndColumns(tableName));
      });
    },

    oneModelInfo(tableName, columnsArray) {
      return {
        tableName: tableName,
        modelName: toModelName(tableName),
        collectionName: toCollectionName(tableName),
        fields: columnsArray.map(columnInfo => ({
          id: `${tableName}_${columnInfo.column_name}`,
          nameValue: toCamelCase(columnInfo.column_name),
          typeValue: toUIType(columnInfo.data_type),
          isRequired: (columnInfo.is_nullable === 'NO' ? 'yes': 'no'),
        })),
      };
    },

    getModelsInfo(includePk = true) {
      return this.getTablesInfo(includePk).then(data => {
        Object.entries(data).forEach(([tableName, columnsArray]) => {
          data[tableName] = this.oneModelInfo(tableName, columnsArray);
        });
        return data;
      });
    },

    tableAndColumns(tableName) {
      return dbPool.query(`
        SELECT *
        FROM (${columnsView}) cv
        WHERE table_schema = $1
          AND table_name   = $2
          AND column_name != 'idx'
        ORDER BY ordinal_position`,
        [dbSchema, tableName]
      ).then(columnsRes => {
        return {
          [tableName]: this.oneModelInfo(tableName, columnsRes.rows)
        };
      });
    },

    getTablesInfo(includePk = true) {
      return dbPool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_type = 'BASE TABLE'
        AND table_schema = $1`,
        [dbSchema]
      ).then(tablesRes => {
        let data = {};
        let tableNames = [];
        tablesRes.rows.forEach(tableRes => {
          tableNames.push(tableRes.table_name);
          data[tableRes.table_name] = [];
        });
        return dbPool.query(`
          SELECT *
          FROM (${columnsView}) cv
          WHERE table_schema = $1
            AND table_name   = ANY($2)
          ORDER BY ordinal_position`,
          [dbSchema, tableNames]
        ).then(columnsRes => {
          columnsRes.rows.forEach(colRes => {
            if (includePk || colRes.constraint_type !== 'PRIMARY KEY') {
              data[colRes.table_name].push(colRes);
            }
          });
          return data;
        });
      });
    },

    list(tableName, { filters, before, after, limit = recordsLimit, idField = 'id' }) {
      const idx = keys[tableName].primaryKey;

      if (!idx) {
        return this.listNoPK(tableName, { filters, limit });
      }

      if (keys[tableName].uniqueKeys.indexOf(idField) === -1) {
        throw new Error('Invalid Operation for idField');
      }

      let whereClause = `${idx} > 0`;
      let order = 'desc';
      let values = [];
      let lastIndex = 0;

      if (before) {
        whereClause += ` AND ${idx} < (SELECT ${idx} from ${dbSchema}.${tableName} where ${idField} = $${++lastIndex})`;
        values.push(before);
      }

      if (after) {
        whereClause += ` AND ${idx} > (SELECT ${idx} from ${dbSchema}.${tableName} where ${idField} = $${++lastIndex})`;
        values.push(after);
        order = 'asc';
      }

      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          whereClause += ` AND lower(${toSnakeCase(key)}) like ($${++lastIndex})`;
          values.push(`%${value.toLowerCase()}%`);
        });
      }

      return dbPool.query(`
        SELECT * FROM (
          SELECT *
          FROM ${dbSchema}.${tableName}
          WHERE ${whereClause}
          ORDER BY ${idx} ${order}
          LIMIT ${limit}) limited_set
        ORDER BY ${idx} DESC`,
        values
      ).then(res => {
        return toCamelCaseObject(res.rows).map(row => {
          return new Proxy(row, { get: getHandler });
        });
      });
    },

    listNoPK(tableName, { filters, limit = recordsLimit }) {
      if (limit > 500) { limit = 500; }

      let whereClause = 'true';
      let values = [];
      let lastIndex = 0;

      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          whereClause += ` AND ${toSnakeCase(key)} = ($${++lastIndex})`;
          values.push(value);
        });
      }

      return dbPool.query(`
          SELECT *
          FROM ${dbSchema}.${tableName}
          WHERE ${whereClause}
          LIMIT ${limit}
        `,
        values
      ).then(res => {
        return toCamelCaseObject(res.rows).map(row => {
          return new Proxy(row, { get: getHandler });
        });
      });
    },

    find(tableName, args) {
      const whereClause = Object.keys(args).map(findField => {
        return `${toSnakeCase(findField)} = '${args[findField]}'`;
      }).join(' AND ');

      return dbPool.query(`
        SELECT *
        FROM ${dbSchema}.${tableName}
        WHERE ${whereClause}
        LIMIT 1`,
        null
      ).then(res => {
        if (!res.rows[0]) {
          return null;
        }
        return new Proxy(toCamelCaseObject(res.rows[0]), { get: getHandler });
      });
    },

    createRecord(tableName, input) {
      const keys = toSnakeCase(Object.keys(input));
      const values = keys.map((key, index) => `$${index + 1}`);

      return dbPool.query(`
        INSERT INTO ${dbSchema}.${tableName}(${keys})
        VALUES (${values})
        RETURNING *`,
        Object.values(input)
      ).then(res => {
        if (!res.rows[0]) {
          return null;
        }
        return new Proxy(toCamelCaseObject(res.rows[0]), { get: getHandler });
      });
    },

    findOrCreateRecord(tableName, input, { findFields }) {
      const whereClause = findFields.map(findField => {
        return `${toSnakeCase(findField)} = '${input[findField]}'`;
      }).join(' AND ');

      return dbPool.query(`
        SELECT *
        FROM ${dbSchema}.${tableName}
        WHERE ${whereClause}`,
        null
      ).then(res => {
        if (res.rows.length === 1) {
          return new Proxy(toCamelCaseObject(res.rows[0]), { get: getHandler });
        }
        delete input.id;
        return this.createRecord(tableName, input);
      });
    },

    createOrUpdateRecord(tableName, input, { findFields }) {
      const whereClause = findFields.map(findField => {
        return `${toSnakeCase(findField)} = '${input[findField]}'`;
      }).join(' AND ');

      return dbPool.query(`
        SELECT *
        FROM ${dbSchema}.${tableName}
        WHERE ${whereClause}`,
        null
      ).then(res => {
        if (res.rows.length > 1) {
          throw new Error('Invalid Operation');
        }

        delete input.id;
        const keys = toSnakeCase(Object.keys(input));

        if (res.rows.length === 1) {
          return dbPool.query(`
            UPDATE ${dbSchema}.${tableName}
            SET
              updated_at = now() at time zone 'utc',
              ${keys.map((key, index) => `${key} = $${index + 1}`).join(',\n')}
            WHERE ${whereClause}
            RETURNING *`,
            Object.values(input)
          ).then(res => new Proxy(toCamelCaseObject(res.rows[0]), { get: getHandler }));
        }

        const values = keys.map((key, index) => `$${index + 1}`);

        return dbPool.query(`
          INSERT INTO ${dbSchema}.${tableName}(${keys})
          VALUES (${values})
          RETURNING *`,
          Object.values(input)
        ).then(res => new Proxy(toCamelCaseObject(res.rows[0]), { get: getHandler }));

      });
    },

    updateRecord(tableName, input, { findFields, updateOperation }) {
      const whereClause = findFields.map(findField => {
        return `${toSnakeCase(findField)} = '${input[findField]}'`;
      }).join(' AND ');

      return dbPool.query(`
        SELECT *
        FROM ${dbSchema}.${tableName}
        WHERE ${whereClause}`,
        null
      ).then(res => {
        if (res.rows.length !== 1) {
          throw new Error('Invalid Operation');
        }

        let setClause = '';

        switch (updateOperation.type) {
          case 'set':
            setClause = `${updateOperation.field} = ${updateOperation.value}`;
            break;
          case 'increment':
            setClause = `${updateOperation.field} = ${updateOperation.field} + ${updateOperation.value}`;
            break;
          case 'multiply':
            setClause = `${updateOperation.field} = ${updateOperation.field} * ${updateOperation.value}`;
            break;
          case 'square':
            setClause = `${updateOperation.field} = ${updateOperation.field} * ${updateOperation.field}`;
            break;
          default:
            throw new Error('Unsupported Operation');
        }

        return dbPool.query(`
          UPDATE ${dbSchema}.${tableName}
          SET
            updated_at = now() at time zone 'utc',
            ${setClause}
          WHERE ${whereClause}
          RETURNING *`,
          []
        ).then(res => new Proxy(toCamelCaseObject(res.rows[0]), { get: getHandler }));
      });
    },

    deleteRecord(tableName, input, { findFields }) {
      const whereClause = findFields.map(findField => {
        return `${toSnakeCase(findField)} = '${input[findField]}'`;
      }).join(' AND ');

      return dbPool.query(`
        SELECT *
        FROM ${dbSchema}.${tableName}
        WHERE ${whereClause}`,
        null
      ).then(selectRes => {
        if (selectRes.rows.length !== 1) {
          throw new Error('Invalid Operation');
        }

        return dbPool.query(`
          DELETE FROM ${dbSchema}.${tableName}
          WHERE ${whereClause}`,
          []
        ).then(() => ({ deletedId: selectRes.rows[0].id }));
      });
    },

  };

};
