const typesMap = {
  'String': 'text',
  'Int': 'integer',
  'Float': 'double precision',
  'Date': 'date',
  'Time': 'time without time zone',
  'DateTime': 'timestamp without time zone',
  'Boolean': 'boolean'
};

const toDbType = type => typesMap[type];

const toUIType = type => {
  return Object.keys(typesMap).find(key => typesMap[key] === type);
};

const toGraphType = type => {
  if (type.match(/date|time|character/)) {
    return 'String';
  }
  if (type.match(/bigint/)) {
    return 'Int';
  }
  return toUIType(type);
};

module.exports = {
  toDbType,
  toGraphType,
  toUIType,
};
