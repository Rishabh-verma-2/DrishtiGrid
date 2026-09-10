/**
 * DrishtiGrid — Secure Government Footage Request State Machine
 * Deterministic transition rules, SLA computation, and role/department authorization
 */

// Canonical Government Lifecycle States
const TICKET_STATES = {
  PENDING_ADMIN_REVIEW: 'PENDING_ADMIN_REVIEW',
  ADMIN_APPROVED: 'ADMIN_APPROVED',
  ROUTED_TO_DEPARTMENT: 'ROUTED_TO_DEPARTMENT',
  DEPARTMENT_ACKNOWLEDGED: 'DEPARTMENT_ACKNOWLEDGED',
  ACKNOWLEDGED: 'DEPARTMENT_ACKNOWLEDGED', // Safe alias
  ASSIGNED: 'ASSIGNED',
  PROCESSING: 'PROCESSING',
  FOOTAGE_READY: 'FOOTAGE_READY',
  SUBMITTED: 'SUBMITTED',
  AVAILABLE_TO_REQUESTER: 'AVAILABLE_TO_REQUESTER',
  EVIDENCE_UPLOADED: 'AVAILABLE_TO_REQUESTER', // Safe alias
  AVAILABLE: 'AVAILABLE_TO_REQUESTER', // Safe alias
  ACCESSED: 'ACCESSED',
  VIEWED: 'ACCESSED', // Safe alias
  COMPLETED: 'COMPLETED',

  // Branching / Exception States
  ADMIN_REJECTED: 'ADMIN_REJECTED',
  DEPARTMENT_REJECTED: 'DEPARTMENT_REJECTED',
  REJECTED: 'DEPARTMENT_REJECTED', // Safe alias
  CLARIFICATION_REQUIRED: 'CLARIFICATION_REQUIRED',
  CANCELLED: 'CANCELLED',
  PROCESSING_FAILED: 'PROCESSING_FAILED',
};

// Legacy status mapping for seamless backward compatibility
const LEGACY_STATUS_MAP = {
  pending: TICKET_STATES.PENDING_ADMIN_REVIEW,
  submitted: TICKET_STATES.PENDING_ADMIN_REVIEW,
  acknowledged: TICKET_STATES.DEPARTMENT_ACKNOWLEDGED,
  department_acknowledged: TICKET_STATES.DEPARTMENT_ACKNOWLEDGED,
  routed_to_department: TICKET_STATES.ROUTED_TO_DEPARTMENT,
  accepted: TICKET_STATES.DEPARTMENT_ACKNOWLEDGED,
  under_review: TICKET_STATES.ROUTED_TO_DEPARTMENT,
  approved: TICKET_STATES.PROCESSING,
  processing: TICKET_STATES.PROCESSING,
  'evidence uploaded': TICKET_STATES.AVAILABLE_TO_REQUESTER,
  evidence_uploaded: TICKET_STATES.AVAILABLE_TO_REQUESTER,
  dispatched: TICKET_STATES.AVAILABLE_TO_REQUESTER,
  available: TICKET_STATES.AVAILABLE_TO_REQUESTER,
  viewed: TICKET_STATES.ACCESSED,
  accessed: TICKET_STATES.ACCESSED,
  responded: TICKET_STATES.ACCESSED,
  closed: TICKET_STATES.COMPLETED,
  completed: TICKET_STATES.COMPLETED,
  rejected: TICKET_STATES.DEPARTMENT_REJECTED,
  admin_rejected: TICKET_STATES.ADMIN_REJECTED,
  department_rejected: TICKET_STATES.DEPARTMENT_REJECTED,
  clarification_required: TICKET_STATES.CLARIFICATION_REQUIRED,
  cancelled: TICKET_STATES.CANCELLED,
};

/**
 * Normalizes any legacy or arbitrary status string to canonical state
 */
function normalizeStatus(status) {
  if (!status) return TICKET_STATES.PENDING_ADMIN_REVIEW;
  const key = String(status).toLowerCase().trim();
  return LEGACY_STATUS_MAP[key] || status;
}

// Configurable SLA Durations (in minutes) by priority
const SLA_CONFIG = {
  urgent: 30, // 30 minutes
  critical: 30, // 30 minutes
  high: 60, // 1 hour
  medium: 240, // 4 hours
  low: 1440, // 24 hours
};

/**
 * Calculates due date based on priority
 */
function calculateDueAt(priority = 'medium', fromDate = new Date()) {
  const normPriority = String(priority).toLowerCase().trim();
  const minutes = SLA_CONFIG[normPriority] || SLA_CONFIG.medium;
  const dueAt = new Date(fromDate.getTime() + minutes * 60 * 1000);
  return { dueAt, slaMinutes: minutes };
}

/**
 * Calculates current SLA status
 * @returns {{ status: 'ON_TRACK'|'SLA_WARNING'|'SLA_BREACHED', remainingMs: number, minutesLeft: number }}
 */
function checkSLAStatus(dueAt, isCompleted = false) {
  if (!dueAt || isCompleted) {
    return { status: 'ON_TRACK', remainingMs: 0, minutesLeft: 0 };
  }

  const now = Date.now();
  const dueTime = new Date(dueAt).getTime();
  const remainingMs = dueTime - now;
  const minutesLeft = Math.round(remainingMs / (60 * 1000));

  if (remainingMs <= 0) {
    return { status: 'SLA_BREACHED', remainingMs, minutesLeft };
  }
  // If less than 25% of SLA or under 15 minutes remains
  if (minutesLeft <= 15) {
    return { status: 'SLA_WARNING', remainingMs, minutesLeft };
  }
  return { status: 'ON_TRACK', remainingMs, minutesLeft };
}

/**
 * Valid allowed transitions dictionary
 * Maps Current State -> Array of Allowed Next States
 */
const ALLOWED_TRANSITIONS = {
  [TICKET_STATES.PENDING_ADMIN_REVIEW]: [
    TICKET_STATES.ADMIN_APPROVED,
    TICKET_STATES.ROUTED_TO_DEPARTMENT,
    TICKET_STATES.ADMIN_REJECTED,
    TICKET_STATES.CLARIFICATION_REQUIRED,
    TICKET_STATES.CANCELLED,
  ],
  [TICKET_STATES.ADMIN_APPROVED]: [
    TICKET_STATES.ROUTED_TO_DEPARTMENT,
  ],
  [TICKET_STATES.ROUTED_TO_DEPARTMENT]: [
    TICKET_STATES.DEPARTMENT_ACKNOWLEDGED,
    TICKET_STATES.ASSIGNED,
    TICKET_STATES.DEPARTMENT_REJECTED,
    TICKET_STATES.CLARIFICATION_REQUIRED,
  ],
  [TICKET_STATES.DEPARTMENT_ACKNOWLEDGED]: [
    TICKET_STATES.ASSIGNED,
    TICKET_STATES.PROCESSING,
    TICKET_STATES.DEPARTMENT_REJECTED,
    TICKET_STATES.CLARIFICATION_REQUIRED,
  ],
  [TICKET_STATES.ASSIGNED]: [
    TICKET_STATES.ASSIGNED, // Re-assignment
    TICKET_STATES.PROCESSING,
    TICKET_STATES.CLARIFICATION_REQUIRED,
    TICKET_STATES.DEPARTMENT_REJECTED,
  ],
  [TICKET_STATES.PROCESSING]: [
    TICKET_STATES.FOOTAGE_READY,
    TICKET_STATES.SUBMITTED,
    TICKET_STATES.AVAILABLE_TO_REQUESTER,
    TICKET_STATES.PROCESSING_FAILED,
    TICKET_STATES.CLARIFICATION_REQUIRED,
  ],
  [TICKET_STATES.FOOTAGE_READY]: [
    TICKET_STATES.SUBMITTED,
    TICKET_STATES.AVAILABLE_TO_REQUESTER,
    TICKET_STATES.PROCESSING,
  ],
  [TICKET_STATES.SUBMITTED]: [
    TICKET_STATES.AVAILABLE_TO_REQUESTER,
    TICKET_STATES.ACCESSED,
    TICKET_STATES.COMPLETED,
  ],
  [TICKET_STATES.AVAILABLE_TO_REQUESTER]: [
    TICKET_STATES.ACCESSED,
    TICKET_STATES.COMPLETED,
  ],
  [TICKET_STATES.ACCESSED]: [
    TICKET_STATES.COMPLETED,
  ],
  [TICKET_STATES.CLARIFICATION_REQUIRED]: [
    TICKET_STATES.ROUTED_TO_DEPARTMENT,
    TICKET_STATES.PENDING_ADMIN_REVIEW,
    TICKET_STATES.ADMIN_REJECTED,
    TICKET_STATES.DEPARTMENT_REJECTED,
    TICKET_STATES.CANCELLED,
  ],
  [TICKET_STATES.COMPLETED]: [],
  [TICKET_STATES.ADMIN_REJECTED]: [],
  [TICKET_STATES.DEPARTMENT_REJECTED]: [],
  [TICKET_STATES.CANCELLED]: [],
  [TICKET_STATES.PROCESSING_FAILED]: [
    TICKET_STATES.PROCESSING,
    TICKET_STATES.DEPARTMENT_REJECTED,
  ],
};

/**
 * Validates whether transition from currentStatus to nextStatus is permissible
 * for the user role and department context.
 */
function validateTransition({
  currentStatus,
  nextStatus,
  user,
  ticket,
}) {
  const normCurrent = normalizeStatus(currentStatus);
  const normNext = normalizeStatus(nextStatus);

  if (normCurrent === normNext) {
    return { allowed: true };
  }

  const allowedNext = ALLOWED_TRANSITIONS[normCurrent] || [];
  if (!allowedNext.includes(normNext)) {
    return {
      allowed: false,
      reason: `Illegal state transition: Cannot change status from '${normCurrent}' to '${normNext}'.`,
    };
  }

  const role = String(user?.role || '').toUpperCase();
  const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(role);
  const userDept = (user?.department || '').toLowerCase().trim();
  const targetDept = (ticket?.targetDepartment || '').toLowerCase().trim();
  const reqDept = (ticket?.requestingDepartment || '').toLowerCase().trim();
  const isOwner = ticket?.requestedBy && (ticket.requestedBy._id || ticket.requestedBy).toString() === user?._id?.toString();

  const isTargetDept =
    targetDept.includes(userDept) ||
    userDept.includes(targetDept) ||
    (userDept.includes('traffic') && targetDept.includes('traffic')) ||
    (userDept.includes('police') && targetDept.includes('police'));

  const isRequestingDept =
    reqDept.includes(userDept) ||
    userDept.includes(reqDept) ||
    isOwner;

  // Role & Department specific rules
  switch (normNext) {
    case TICKET_STATES.ADMIN_APPROVED:
    case TICKET_STATES.ADMIN_REJECTED:
      if (!isAdmin) {
        return { allowed: false, reason: 'Only Central Control Room Nodal Officers (ADMIN) can perform Admin Review.' };
      }
      break;

    case TICKET_STATES.DEPARTMENT_ACKNOWLEDGED:
    case TICKET_STATES.ASSIGNED:
      if (!isAdmin && !isTargetDept) {
        return { allowed: false, reason: 'Only the requested target department supervisor can acknowledge or assign tickets.' };
      }
      break;

    case TICKET_STATES.PROCESSING:
    case TICKET_STATES.FOOTAGE_READY:
    case TICKET_STATES.SUBMITTED:
    case TICKET_STATES.AVAILABLE_TO_REQUESTER:
      if (!isAdmin && !isTargetDept) {
        return { allowed: false, reason: 'Only the authorized operator in the target department can prepare and submit evidence.' };
      }
      break;

    case TICKET_STATES.DEPARTMENT_REJECTED:
      if (!isAdmin && !isTargetDept) {
        return { allowed: false, reason: 'Only the target department supervisor or administrator can reject a routed request.' };
      }
      break;

    case TICKET_STATES.CANCELLED:
      if (!isAdmin && !isRequestingDept) {
        return { allowed: false, reason: 'Only the requesting department can cancel their requisition.' };
      }
      break;

    case TICKET_STATES.COMPLETED:
      if (!isAdmin && !isRequestingDept && !isTargetDept) {
        return { allowed: false, reason: 'Only requisition stakeholders can complete the ticket.' };
      }
      break;

    default:
      break;
  }

  return { allowed: true };
}

module.exports = {
  TICKET_STATES,
  LEGACY_STATUS_MAP,
  SLA_CONFIG,
  normalizeStatus,
  calculateDueAt,
  checkSLAStatus,
  validateTransition,
};
