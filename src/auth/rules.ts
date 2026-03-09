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
 * SQL filter result for row-level list access control.
 * sql: extra WHERE conditions (empty = no filter, '1=0' = deny all)
 * params: bound parameters for the conditions
 */
export interface SqlFilter {
  sql: string;
  params: Record<string, unknown>;
}

/**
 * Convert a list rule expression into a SQL WHERE fragment for row-level filtering.
 *
 * Returns null if access is completely denied (null rule for non-admin).
 * Returns SqlFilter with empty sql if no filtering needed (public rule or admin).
 * Returns SqlFilter with sql conditions for expression rules.
 *
 * @param rule - The rule (null = admin only, '' = public, string = expression)
 * @param context - The evaluation context (without record, since we're filtering)
 * @param validFieldNames - Valid column names for this collection (prevents SQL injection)
 */
export function ruleToSqlFilter(
  rule: string | null,
  context: RuleContext,
  validFieldNames: string[]
): SqlFilter | null {
  // Admin always has full access
  if (context.isAdmin) return { sql: '', params: {} };

  // null = admin only → deny
  if (rule === null) return null;

  // Empty string = public → no extra filter
  if (rule === '') return { sql: '', params: {} };

  const counter = { n: 0 };
  return expressionToSqlFilter(rule.trim(), context, validFieldNames, counter);
}

/**
 * Resolve a non-field token to its concrete value from context.
 * Returns null-boxed value for known references (including null auth fields).
 * Returns undefined if the token is not a known reference (i.e., it's a field name).
 */
function resolveContextValue(token: string, context: RuleContext): { value: unknown } | undefined {
  // Quoted string literal
  if ((token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'"))) {
    return { value: token.slice(1, -1) };
  }

  // Number literal
  if (/^\d+(\.\d+)?$/.test(token)) return { value: parseFloat(token) };

  // Boolean literal
  if (token === 'true') return { value: true };
  if (token === 'false') return { value: false };

  // @request.auth.*
  if (token.startsWith('@request.auth.')) {
    const field = token.slice('@request.auth.'.length);
    if (!context.auth) return { value: null };
    switch (field) {
      case 'id':             return { value: context.auth.id };
      case 'email':          return { value: context.auth.email };
      case 'verified':       return { value: context.auth.verified };
      case 'collectionId':   return { value: context.auth.collectionId };
      case 'collectionName': return { value: context.auth.collectionName };
      default:               return { value: null };
    }
  }

  // @request.body.* — not applicable in list context
  if (token.startsWith('@request.')) return { value: null };

  // Unknown token — treat as a record field name
  return undefined;
}

/**
 * Reverse a comparison operator for SQL (e.g., `auth_val > field` → `field < auth_val`).
 */
function reverseOp(op: string): string {
  switch (op) {
    case '>':  return '<';
    case '<':  return '>';
    case '>=': return '<=';
    case '<=': return '>=';
    default:   return op; // = and != are symmetric
  }
}

/**
 * Recursively convert a rule expression to a SQL filter fragment.
 */
function expressionToSqlFilter(
  expression: string,
  context: RuleContext,
  validFieldNames: string[],
  counter: { n: number }
): SqlFilter | null {
  // Handle &&
  if (expression.includes('&&')) {
    const parts = expression.split('&&').map(p => p.trim());
    const clauses: string[] = [];
    const params: Record<string, unknown> = {};

    for (const part of parts) {
      const result = expressionToSqlFilter(part, context, validFieldNames, counter);
      if (result === null) return null;           // invalid expression → deny
      if (result.sql === '1=0') return { sql: '1=0', params: {} }; // short-circuit
      if (result.sql) {
        clauses.push(`(${result.sql})`);
        Object.assign(params, result.params);
      }
      // empty sql = constant true → no clause needed
    }

    return { sql: clauses.join(' AND '), params };
  }

  // Handle ||
  if (expression.includes('||')) {
    const parts = expression.split('||').map(p => p.trim());
    const clauses: string[] = [];
    const params: Record<string, unknown> = {};

    for (const part of parts) {
      const result = expressionToSqlFilter(part, context, validFieldNames, counter);
      if (result === null || result.sql === '1=0') continue; // always false → skip branch
      if (result.sql === '') return { sql: '', params: {} };   // constant true → whole OR passes
      clauses.push(`(${result.sql})`);
      Object.assign(params, result.params);
    }

    if (clauses.length === 0) return { sql: '1=0', params: {} }; // all branches false
    return { sql: clauses.join(' OR '), params };
  }

  // Single comparison: left op right
  const match = expression.match(/^(.+?)\s*(!=|>=|<=|=|>|<)\s*(.+)$/);
  if (!match) {
    console.warn(`Invalid rule expression: ${expression}`);
    return null;
  }

  const [, leftRaw, operator, rightRaw] = match;
  const left = leftRaw.trim();
  const right = rightRaw.trim();

  const leftResolved = resolveContextValue(left, context);
  const rightResolved = resolveContextValue(right, context);

  const paramName = `rule_${counter.n++}`;

  if (leftResolved === undefined && rightResolved !== undefined) {
    // left is a field name, right is a resolved value
    if (!validFieldNames.includes(left)) {
      console.warn(`Unknown field in rule expression: ${left}`);
      return null;
    }
    return {
      sql: `"${left}" ${operator} $${paramName}`,
      params: { [paramName]: rightResolved.value },
    };
  }

  if (rightResolved === undefined && leftResolved !== undefined) {
    // right is a field name, left is a resolved value
    if (!validFieldNames.includes(right)) {
      console.warn(`Unknown field in rule expression: ${right}`);
      return null;
    }
    return {
      sql: `"${right}" ${reverseOp(operator)} $${paramName}`,
      params: { [paramName]: leftResolved.value },
    };
  }

  // Both sides are constants — evaluate and return a constant filter
  const lVal = leftResolved !== undefined ? leftResolved.value : left;
  const rVal = rightResolved !== undefined ? rightResolved.value : right;
  const isTrue = compare(lVal, rVal, operator);
  return isTrue ? { sql: '', params: {} } : { sql: '1=0', params: {} };
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
