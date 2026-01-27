import type { CollectionRules } from "../types/collection";
import type { AuthenticatedUser } from "./middleware";

/**
 * Context available to rule expressions.
 */
export interface RuleContext {
  /** Is this an admin request? */
  isAdmin: boolean;
  /** Authenticated user (null if not authenticated) */
  auth: AuthenticatedUser | null;
  /** The record being accessed (for view/update/delete) */
  record?: Record<string, unknown>;
  /** The request body (for create/update) */
  body?: Record<string, unknown>;
}

/**
 * Evaluate a collection rule against the context.
 *
 * @param rule - The rule to evaluate (null = admin only, '' = public, string = expression)
 * @param context - The evaluation context
 * @returns true if access is allowed, false otherwise
 */
export function evaluateRule(
  rule: string | null,
  context: RuleContext
): boolean {
  // Admin always has access
  if (context.isAdmin) {
    return true;
  }

  // null = locked (admin only)
  if (rule === null) {
    return false;
  }

  // Empty string = public access
  if (rule === '') {
    return true;
  }

  // Parse and evaluate expression
  return evaluateExpression(rule, context);
}

/**
 * Evaluate a rule expression.
 * Supports:
 * - @request.auth.id (user ID)
 * - @request.auth.email
 * - @request.auth.verified
 * - @request.auth.collectionId
 * - @request.auth.collectionName
 * - Field references (e.g., id, user_id, owner)
 * - Operators: =, !=, >, <, >=, <=
 * - Logical: &&, ||
 * - Quotes for string literals
 */
function evaluateExpression(expression: string, context: RuleContext): boolean {
  // Handle logical operators (split by && or ||)
  if (expression.includes('&&')) {
    const parts = expression.split('&&').map(p => p.trim());
    return parts.every(part => evaluateExpression(part, context));
  }

  if (expression.includes('||')) {
    const parts = expression.split('||').map(p => p.trim());
    return parts.some(part => evaluateExpression(part, context));
  }

  // Parse comparison (left operator right)
  const match = expression.match(/^(.+?)\s*(!=|>=|<=|=|>|<)\s*(.+)$/);
  if (!match) {
    // Invalid expression - fail closed (deny access)
    console.warn(`Invalid rule expression: ${expression}`);
    return false;
  }

  const [, leftRaw, operator, rightRaw] = match;
  const left = resolveValue(leftRaw.trim(), context);
  const right = resolveValue(rightRaw.trim(), context);

  return compare(left, right, operator);
}

/**
 * Resolve a value reference to an actual value.
 */
function resolveValue(value: string, context: RuleContext): unknown {
  // String literal (quoted)
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  // Number literal
  if (/^\d+(\.\d+)?$/.test(value)) {
    return parseFloat(value);
  }

  // Boolean literal
  if (value === 'true') return true;
  if (value === 'false') return false;

  // @request.auth references
  if (value.startsWith('@request.auth.')) {
    const field = value.slice('@request.auth.'.length);
    if (!context.auth) {
      return '';
    }

    switch (field) {
      case 'id':
        return context.auth.id;
      case 'email':
        return context.auth.email;
      case 'verified':
        return context.auth.verified;
      case 'collectionId':
        return context.auth.collectionId;
      case 'collectionName':
        return context.auth.collectionName;
      default:
        return '';
    }
  }

  // @request.body references
  if (value.startsWith('@request.body.')) {
    const field = value.slice('@request.body.'.length);
    return context.body?.[field] ?? '';
  }

  // Record field reference (e.g., id, user_id, owner)
  if (context.record && value in context.record) {
    return context.record[value];
  }

  return value;
}

/**
 * Compare two values using the given operator.
 */
function compare(left: unknown, right: unknown, operator: string): boolean {
  const l = normalizeForComparison(left);
  const r = normalizeForComparison(right);

  switch (operator) {
    case '=':
      return l === r;
    case '!=':
      return l !== r;
    case '>':
      return (l as number) > (r as number);
    case '<':
      return (l as number) < (r as number);
    case '>=':
      return (l as number) >= (r as number);
    case '<=':
      return (l as number) <= (r as number);
    default:
      return false;
  }
}

/**
 * Normalize values for comparison.
 */
function normalizeForComparison(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value;
  return String(value);
}

/**
 * Get the appropriate rule for an operation.
 */
export function getRuleForOperation(
  rules: CollectionRules | null,
  operation: 'list' | 'view' | 'create' | 'update' | 'delete'
): string | null {
  if (!rules) {
    return null;
  }

  switch (operation) {
    case 'list':
      return rules.listRule;
    case 'view':
      return rules.viewRule;
    case 'create':
      return rules.createRule;
    case 'update':
      return rules.updateRule;
    case 'delete':
      return rules.deleteRule;
  }
}
