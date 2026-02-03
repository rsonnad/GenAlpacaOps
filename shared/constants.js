/**
 * Shared Constants - Status enums and configuration values
 *
 * Consolidates duplicated constants from rental-service.js and event-service.js
 */

// =============================================
// SHARED STATUS ENUMS
// =============================================

/**
 * Application/Request status - used by both rentals and events
 */
export const APPLICATION_STATUS = {
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  DENIED: 'denied',
  DELAYED: 'delayed',
  WITHDRAWN: 'withdrawn',
};

/**
 * Agreement/Contract status
 */
export const AGREEMENT_STATUS = {
  PENDING: 'pending',
  GENERATED: 'generated',
  SENT: 'sent',
  SIGNED: 'signed',
};

/**
 * Deposit status
 */
export const DEPOSIT_STATUS = {
  PENDING: 'pending',
  REQUESTED: 'requested',
  PARTIAL: 'partial',
  RECEIVED: 'received',
  CONFIRMED: 'confirmed',
  REFUNDED: 'refunded', // Events only
};

/**
 * Assignment status
 */
export const ASSIGNMENT_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  PENDING_CONTRACT: 'pending_contract',
  CONTRACT_SENT: 'contract_sent',
};

// =============================================
// PAYMENT CONSTANTS
// =============================================

/**
 * Payment methods
 */
export const PAYMENT_METHOD = {
  VENMO: 'venmo',
  ZELLE: 'zelle',
  PAYPAL: 'paypal',
  BANK_ACH: 'bank_ach',
  CASH: 'cash',
  CHECK: 'check',
};

/**
 * Payment types for rentals
 */
export const RENTAL_PAYMENT_TYPE = {
  MOVE_IN_DEPOSIT: 'move_in_deposit',
  SECURITY_DEPOSIT: 'security_deposit',
  RENT: 'rent',
  PRORATED_RENT: 'prorated_rent',
};

/**
 * Payment types for events
 */
export const EVENT_PAYMENT_TYPE = {
  RESERVATION_FEE: 'reservation_fee',
  CLEANING_DEPOSIT: 'cleaning_deposit',
  RENTAL_FEE: 'rental_fee',
  DAMAGE_DEDUCTION: 'damage_deduction',
  REFUND: 'refund',
};

// =============================================
// EVENT CONSTANTS
// =============================================

/**
 * Event types
 */
export const EVENT_TYPE = {
  PARTY: 'party',
  WORKSHOP: 'workshop',
  RETREAT: 'retreat',
  CEREMONY: 'ceremony',
  MEETING: 'meeting',
  PHOTOSHOOT: 'photoshoot',
  OTHER: 'other',
};

/**
 * Default event fees
 */
export const DEFAULT_EVENT_FEES = {
  RENTAL_FEE: 295,
  RESERVATION_FEE: 95,
  CLEANING_DEPOSIT: 195,
};

// =============================================
// SPACE CONSTANTS
// =============================================

/**
 * Space types
 */
export const SPACE_TYPE = {
  DWELLING: 'Dwelling',
  AMENITY: 'Amenity',
  EVENT: 'Event',
};

/**
 * Bath privacy options
 */
export const BATH_PRIVACY = {
  PRIVATE: 'private',
  SHARED: 'shared',
  NONE: 'none',
};

// =============================================
// PERSON CONSTANTS
// =============================================

/**
 * Person types
 */
export const PERSON_TYPE = {
  TENANT: 'tenant',
  STAFF: 'staff',
  AIRBNB_GUEST: 'airbnb_guest',
  HOUSE_GUEST: 'house_guest',
};

/**
 * User roles
 */
export const USER_ROLE = {
  ADMIN: 'admin',
  STAFF: 'staff',
};

// =============================================
// MEDIA CONSTANTS
// =============================================

/**
 * Media categories
 */
export const MEDIA_CATEGORY = {
  MKTG: 'mktg',
  PROJECTS: 'projects',
  ARCHIVE: 'archive',
  SPACE: 'space',
};

export default {
  APPLICATION_STATUS,
  AGREEMENT_STATUS,
  DEPOSIT_STATUS,
  ASSIGNMENT_STATUS,
  PAYMENT_METHOD,
  RENTAL_PAYMENT_TYPE,
  EVENT_PAYMENT_TYPE,
  EVENT_TYPE,
  DEFAULT_EVENT_FEES,
  SPACE_TYPE,
  BATH_PRIVACY,
  PERSON_TYPE,
  USER_ROLE,
  MEDIA_CATEGORY,
};
