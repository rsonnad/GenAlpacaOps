/**
 * Validation Utilities - Lightweight input validation
 *
 * Usage:
 *   import { validate, rules } from '../shared/validation.js';
 *
 *   const result = validate(data, {
 *     email: [rules.required(), rules.email()],
 *     start_date: [rules.required(), rules.date()],
 *     end_date: [rules.required(), rules.date(), rules.afterField('start_date')],
 *     rate_amount: [rules.required(), rules.number({ min: 0 })],
 *   });
 *
 *   if (!result.valid) {
 *     console.log(result.errors); // { email: 'Invalid email format', ... }
 *   }
 */

// =============================================
// VALIDATION RULES
// =============================================

export const rules = {
  /**
   * Field is required (not null, undefined, or empty string)
   */
  required: (message = 'This field is required') => ({
    validate: (value) => {
      if (value === null || value === undefined || value === '') {
        return message;
      }
      return null;
    }
  }),

  /**
   * Valid email format
   */
  email: (message = 'Invalid email format') => ({
    validate: (value) => {
      if (!value) return null; // Let required() handle empty
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        return message;
      }
      return null;
    }
  }),

  /**
   * Valid UUID format
   */
  uuid: (message = 'Invalid ID format') => ({
    validate: (value) => {
      if (!value) return null;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(value)) {
        return message;
      }
      return null;
    }
  }),

  /**
   * Valid date (can be Date object or string)
   */
  date: (message = 'Invalid date') => ({
    validate: (value) => {
      if (!value) return null;
      const d = value instanceof Date ? value : new Date(value);
      if (isNaN(d.getTime())) {
        return message;
      }
      return null;
    }
  }),

  /**
   * Date must be in the future
   */
  futureDate: (message = 'Date must be in the future') => ({
    validate: (value) => {
      if (!value) return null;
      const d = value instanceof Date ? value : new Date(value);
      if (isNaN(d.getTime())) return null; // Let date() handle invalid
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (d < today) {
        return message;
      }
      return null;
    }
  }),

  /**
   * Date must be after another field's date
   */
  afterField: (fieldName, message) => ({
    validate: (value, allValues) => {
      if (!value || !allValues[fieldName]) return null;
      const thisDate = value instanceof Date ? value : new Date(value);
      const otherDate = allValues[fieldName] instanceof Date
        ? allValues[fieldName]
        : new Date(allValues[fieldName]);

      if (isNaN(thisDate.getTime()) || isNaN(otherDate.getTime())) return null;

      if (thisDate <= otherDate) {
        return message || `Must be after ${fieldName.replace(/_/g, ' ')}`;
      }
      return null;
    }
  }),

  /**
   * Date must be before another field's date
   */
  beforeField: (fieldName, message) => ({
    validate: (value, allValues) => {
      if (!value || !allValues[fieldName]) return null;
      const thisDate = value instanceof Date ? value : new Date(value);
      const otherDate = allValues[fieldName] instanceof Date
        ? allValues[fieldName]
        : new Date(allValues[fieldName]);

      if (isNaN(thisDate.getTime()) || isNaN(otherDate.getTime())) return null;

      if (thisDate >= otherDate) {
        return message || `Must be before ${fieldName.replace(/_/g, ' ')}`;
      }
      return null;
    }
  }),

  /**
   * Number validation with optional min/max
   */
  number: (options = {}) => ({
    validate: (value) => {
      if (value === null || value === undefined || value === '') return null;

      const num = Number(value);
      if (isNaN(num)) {
        return options.message || 'Must be a number';
      }

      if (options.min !== undefined && num < options.min) {
        return options.minMessage || `Must be at least ${options.min}`;
      }

      if (options.max !== undefined && num > options.max) {
        return options.maxMessage || `Must be at most ${options.max}`;
      }

      if (options.positive && num <= 0) {
        return options.positiveMessage || 'Must be a positive number';
      }

      if (options.integer && !Number.isInteger(num)) {
        return options.integerMessage || 'Must be a whole number';
      }

      return null;
    }
  }),

  /**
   * String length validation
   */
  length: (options = {}) => ({
    validate: (value) => {
      if (!value) return null;
      const str = String(value);

      if (options.min !== undefined && str.length < options.min) {
        return options.minMessage || `Must be at least ${options.min} characters`;
      }

      if (options.max !== undefined && str.length > options.max) {
        return options.maxMessage || `Must be at most ${options.max} characters`;
      }

      if (options.exact !== undefined && str.length !== options.exact) {
        return options.exactMessage || `Must be exactly ${options.exact} characters`;
      }

      return null;
    }
  }),

  /**
   * Value must be one of allowed values
   */
  oneOf: (allowedValues, message) => ({
    validate: (value) => {
      if (!value) return null;
      if (!allowedValues.includes(value)) {
        return message || `Must be one of: ${allowedValues.join(', ')}`;
      }
      return null;
    }
  }),

  /**
   * Phone number (basic validation - at least 10 digits)
   */
  phone: (message = 'Invalid phone number') => ({
    validate: (value) => {
      if (!value) return null;
      // Remove all non-digits
      const digits = String(value).replace(/\D/g, '');
      if (digits.length < 10) {
        return message;
      }
      return null;
    }
  }),

  /**
   * URL validation
   */
  url: (message = 'Invalid URL') => ({
    validate: (value) => {
      if (!value) return null;
      try {
        new URL(value);
        return null;
      } catch {
        return message;
      }
    }
  }),

  /**
   * Custom validation function
   */
  custom: (validatorFn, message = 'Invalid value') => ({
    validate: (value, allValues) => {
      if (!validatorFn(value, allValues)) {
        return message;
      }
      return null;
    }
  }),
};

// =============================================
// VALIDATION FUNCTION
// =============================================

/**
 * Validate an object against a schema
 * @param {Object} data - Data to validate
 * @param {Object} schema - Validation schema { fieldName: [rule1, rule2, ...] }
 * @returns {{ valid: boolean, errors: Object, data: Object }}
 */
export function validate(data, schema) {
  const errors = {};
  let valid = true;

  for (const [field, fieldRules] of Object.entries(schema)) {
    const value = data[field];

    for (const rule of fieldRules) {
      const error = rule.validate(value, data);
      if (error) {
        errors[field] = error;
        valid = false;
        break; // Stop at first error for this field
      }
    }
  }

  return {
    valid,
    errors,
    data: valid ? data : null,
  };
}

/**
 * Validate a single value against rules
 * @param {*} value - Value to validate
 * @param {Array} fieldRules - Array of rules
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateField(value, fieldRules) {
  for (const rule of fieldRules) {
    const error = rule.validate(value, {});
    if (error) {
      return { valid: false, error };
    }
  }
  return { valid: true, error: null };
}

// =============================================
// PRE-BUILT SCHEMAS
// =============================================

/**
 * Common validation schemas for reuse
 */
export const schemas = {
  /**
   * Rental application validation
   */
  rentalApplication: {
    person_id: [rules.required(), rules.uuid()],
    desired_space_id: [rules.required(), rules.uuid()],
    desired_start_date: [rules.required(), rules.date()],
    desired_end_date: [rules.date(), rules.afterField('desired_start_date', 'End date must be after start date')],
    rate_amount: [rules.number({ min: 0, positive: true })],
  },

  /**
   * Event request validation
   */
  eventRequest: {
    person_id: [rules.required(), rules.uuid()],
    event_date: [rules.required(), rules.date(), rules.futureDate()],
    event_type: [rules.required()],
    estimated_guests: [rules.number({ min: 1, max: 500, integer: true })],
    rental_fee: [rules.number({ min: 0 })],
    cleaning_deposit: [rules.number({ min: 0 })],
  },

  /**
   * Person/contact validation
   */
  person: {
    first_name: [rules.required(), rules.length({ min: 1, max: 100 })],
    last_name: [rules.length({ max: 100 })],
    email: [rules.required(), rules.email()],
    phone: [rules.phone()],
  },

  /**
   * Payment validation
   */
  payment: {
    amount: [rules.required(), rules.number({ positive: true })],
    payment_method: [rules.required()],
    payment_date: [rules.required(), rules.date()],
  },
};

export default {
  validate,
  validateField,
  rules,
  schemas,
};
