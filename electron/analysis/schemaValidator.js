/**
 * Schema Validation Module
 * Validates analysis data against JSON Schema
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats').default;

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Simplified schema validation - full schema would be loaded from file
const schema = {
  type: 'object',
  required: ['metadata', 'linear_analysis', 'structural_map', 'arrangement_flow', 'harmonic_context'],
  properties: {
    metadata: {
      type: 'object',
      properties: {
        file_path: { type: 'string' },
        duration_seconds: { type: 'number' },
        sample_rate: { type: 'integer' },
        analysis_timestamp: { type: 'string', format: 'date-time' },
        engine_version: { type: 'string' },
        confidence_threshold: { type: 'number', minimum: 0, maximum: 1 },
        tempo_hint: { type: 'number' },
        key_hint: { type: 'string' },
      },
    },
    linear_analysis: {
      type: 'object',
      properties: {
        events: { type: 'array' },
        beat_grid: { type: 'object' },
      },
    },
    structural_map: {
      type: 'object',
      properties: {
        sections: {
          type: 'array',
          items: {
            type: 'object',
            required: ['section_id', 'section_label', 'harmonic_dna', 'rhythmic_dna'],
          },
        },
      },
    },
    arrangement_flow: { type: 'object' },
    harmonic_context: { type: 'object' },
  },
};

const validate = ajv.compile(schema);

/**
 * Validate complete analysis output
 */
function validateAnalysis(analysisData) {
  const valid = validate(analysisData);

  if (!valid) {
    return {
      valid: false,
      errors: validate.errors.map((err) => ({
        path: err.instancePath || err.schemaPath,
        message: err.message,
        params: err.params,
      })),
    };
  }

  return { valid: true, errors: [] };
}

/**
 * Validate section data
 */
function validateSection(section) {
  if (!section.section_id || !section.section_label) {
    return {
      valid: false,
      errors: [{ message: 'Section must have section_id and section_label' }],
    };
  }

  if (!section.harmonic_dna || !section.rhythmic_dna) {
    return {
      valid: false,
      errors: [{ message: 'Section must have harmonic_dna and rhythmic_dna' }],
    };
  }

  return { valid: true, errors: [] };
}

module.exports = {
  validateAnalysis,
  validateSection,
};

