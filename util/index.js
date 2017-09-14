'use strict';

const crypto = require('crypto');
const humps = require('humps');
const pluralize = require('pluralize');

const util = {
  hashWith(stringToHash, algorithm, { asIs = false } = {}) {
    if (!algorithm) {
      return stringToHash;
    }
    if (!asIs) {
      stringToHash = stringToHash.trim().toLowerCase();
    }
    return crypto
      .createHash(algorithm)
      .update(stringToHash)
      .digest('hex');
  },

  replaceSpaces(string, sep = '_') {
    return string.replace(/\s+/g, sep);
  },

  toSnakeCase(stringOrArray) {
    if (Array.isArray(stringOrArray)) {
      return stringOrArray.map(humps.decamelize);
    }
    return humps
      .decamelize(util.replaceSpaces(stringOrArray))
      .replace(/_+/g, '_');
  },

  toCamelCase(string) {
    return humps.camelize(string);
  },

  toCamelCaseObject(object) {
    return humps.camelizeKeys(object);
  },

  toTitleCase(string) {
    return humps.pascalize(string);
  },

  toPlural(string) {
    return pluralize.plural(pluralize.singular(string));
  },

  toSingular(string) {
    return pluralize.singular(string);
  },

  // "learners" => "Learner"
  // "learner_courses" => "LearnerCourse"
  toModelName(string) {
    return util.toTitleCase(util.toSingular(string));
  },

  // learner_courses => "learnerCourses"
  toCollectionName(string) {
    return util.toCamelCase(util.toPlural(string));
  },

  // "Learner" => "learners"
  // "LearnerCourse" => "learner_courses"
  toTableName(string) {
    return util.toSnakeCase(util.toPlural(string));
  },

  toColumName(string) {
    return util.toTitleCase(string); // TODO: Spaces, Maybe
  }
};

module.exports = util;
