/**
 * Filter expression parser for cross-field OR/AND filter logic.
 *
 * Parses a filter expression string (e.g. `status='active'||status='draft'`)
 * into parameterized SQL. Supports:
 *   - Conditions: `field=value`, `field!='text'`, `field>=100`, `field~'text'`
 *   - AND logic:  `expr1 && expr2`
 *   - OR logic:   `expr1 || expr2`
 *   - Grouping:   `(expr1 || expr2) && expr3`
 *
 * Values: single/double-quoted strings, numbers, `true`, `false`, `null`.
 */

import type { Field } from "../types/collection.ts";
import type { FilterOperator } from "../types/query.ts";

// ─── Token Types ─────────────────────────────────────────────────────────────

type Token =
  | { type: "and" }
  | { type: "or" }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "op"; value: FilterOperator }
  | { type: "field"; value: string }
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "bool"; value: boolean }
  | { type: "null" };

// ─── AST Types ───────────────────────────────────────────────────────────────

type ConditionNode = {
  type: "condition";
  field: string;
  op: FilterOperator;
  value: string | number | boolean | null;
};

type LogicNode = {
  type: "and" | "or";
  children: FilterAst[];
};

type FilterAst = ConditionNode | LogicNode;

// ─── Tokenizer ───────────────────────────────────────────────────────────────

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    // Skip whitespace
    if (/\s/.test(expr[i])) { i++; continue; }

    // Two-char logical operators
    if (expr.startsWith("&&", i)) { tokens.push({ type: "and" }); i += 2; continue; }
    if (expr.startsWith("||", i)) { tokens.push({ type: "or" }); i += 2; continue; }

    // Two-char comparison operators (must precede single-char checks)
    if (expr.startsWith(">=", i)) { tokens.push({ type: "op", value: ">=" }); i += 2; continue; }
    if (expr.startsWith("<=", i)) { tokens.push({ type: "op", value: "<=" }); i += 2; continue; }
    if (expr.startsWith("!=", i)) { tokens.push({ type: "op", value: "!=" }); i += 2; continue; }
    if (expr.startsWith("!~", i)) { tokens.push({ type: "op", value: "!~" }); i += 2; continue; }

    // Single-char tokens
    if (expr[i] === "(") { tokens.push({ type: "lparen" }); i++; continue; }
    if (expr[i] === ")") { tokens.push({ type: "rparen" }); i++; continue; }
    if (expr[i] === "=") { tokens.push({ type: "op", value: "=" }); i++; continue; }
    if (expr[i] === ">") { tokens.push({ type: "op", value: ">" }); i++; continue; }
    if (expr[i] === "<") { tokens.push({ type: "op", value: "<" }); i++; continue; }
    if (expr[i] === "~") { tokens.push({ type: "op", value: "~" }); i++; continue; }

    // Single-quoted string
    if (expr[i] === "'") {
      i++;
      let str = "";
      while (i < expr.length && expr[i] !== "'") {
        if (expr[i] === "\\" && i + 1 < expr.length) {
          str += expr[i + 1]; i += 2;
        } else {
          str += expr[i++];
        }
      }
      if (i < expr.length) i++; // skip closing '
      tokens.push({ type: "string", value: str });
      continue;
    }

    // Double-quoted string
    if (expr[i] === '"') {
      i++;
      let str = "";
      while (i < expr.length && expr[i] !== '"') {
        if (expr[i] === "\\" && i + 1 < expr.length) {
          str += expr[i + 1]; i += 2;
        } else {
          str += expr[i++];
        }
      }
      if (i < expr.length) i++; // skip closing "
      tokens.push({ type: "string", value: str });
      continue;
    }

    // Number (with optional leading minus)
    if (/[0-9]/.test(expr[i]) || (expr[i] === "-" && /[0-9]/.test(expr[i + 1] ?? ""))) {
      let num = "";
      if (expr[i] === "-") { num = "-"; i++; }
      while (i < expr.length && /[0-9.]/.test(expr[i])) num += expr[i++];
      tokens.push({ type: "number", value: parseFloat(num) });
      continue;
    }

    // Identifier → field name or keyword (true, false, null)
    if (/[a-zA-Z_]/.test(expr[i])) {
      let ident = "";
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) ident += expr[i++];
      if (ident === "true") tokens.push({ type: "bool", value: true });
      else if (ident === "false") tokens.push({ type: "bool", value: false });
      else if (ident === "null") tokens.push({ type: "null" });
      else tokens.push({ type: "field", value: ident });
      continue;
    }

    throw new Error(
      `Unexpected character '${expr[i]}' at position ${i} in filter expression`
    );
  }

  return tokens;
}

// ─── Parser ──────────────────────────────────────────────────────────────────

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    const tok = this.tokens[this.pos++];
    if (!tok) throw new Error("Unexpected end of filter expression");
    return tok;
  }

  parse(): FilterAst {
    const node = this.parseOr();
    if (this.pos < this.tokens.length) {
      throw new Error("Unexpected token after filter expression");
    }
    return node;
  }

  private parseOr(): FilterAst {
    const children: FilterAst[] = [this.parseAnd()];
    while (this.peek()?.type === "or") {
      this.consume();
      children.push(this.parseAnd());
    }
    return children.length === 1 ? children[0] : { type: "or", children };
  }

  private parseAnd(): FilterAst {
    const children: FilterAst[] = [this.parsePrimary()];
    while (this.peek()?.type === "and") {
      this.consume();
      children.push(this.parsePrimary());
    }
    return children.length === 1 ? children[0] : { type: "and", children };
  }

  private parsePrimary(): FilterAst {
    const tok = this.peek();
    if (!tok) throw new Error("Unexpected end of filter expression");

    if (tok.type === "lparen") {
      this.consume();
      const inner = this.parseOr();
      const close = this.consume();
      if (close.type !== "rparen") throw new Error("Expected closing parenthesis");
      return inner;
    }

    // condition: FIELD OP VALUE
    const fieldTok = this.consume();
    if (fieldTok.type !== "field") {
      throw new Error(`Expected field name, got '${fieldTok.type}'`);
    }

    const opTok = this.consume();
    if (opTok.type !== "op") {
      throw new Error(`Expected operator after field '${fieldTok.value}'`);
    }

    const valueTok = this.consume();
    let value: string | number | boolean | null;
    if (valueTok.type === "string") value = valueTok.value;
    else if (valueTok.type === "number") value = valueTok.value;
    else if (valueTok.type === "bool") value = valueTok.value;
    else if (valueTok.type === "null") value = null;
    else throw new Error("Expected value in filter condition");

    return { type: "condition", field: fieldTok.value, op: opTok.value, value };
  }
}

// ─── SQL Generator ───────────────────────────────────────────────────────────

const SYSTEM_FIELDS = new Set(["id", "created_at", "updated_at"]);

function escapeFilterLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function astToSql(
  node: FilterAst,
  fields: Field[],
  params: Record<string, unknown>,
  counter: { n: number }
): string {
  if (node.type === "condition") {
    if (!SYSTEM_FIELDS.has(node.field) && !fields.some((f) => f.name === node.field)) {
      throw new Error(`Invalid filter field: "${node.field}"`);
    }

    // Coerce boolean string values for boolean fields
    const fieldDef = fields.find((f) => f.name === node.field);
    let value = node.value;
    if (fieldDef?.type === "boolean" && typeof value === "string") {
      value =
        value === "true" || value === "1" ? 1
        : value === "false" || value === "0" ? 0
        : value;
    }

    const p = `fe_${counter.n++}`;
    switch (node.op) {
      case "=":  params[p] = value; return `"${node.field}" = $${p}`;
      case "!=": params[p] = value; return `"${node.field}" != $${p}`;
      case ">":  params[p] = value; return `"${node.field}" > $${p}`;
      case "<":  params[p] = value; return `"${node.field}" < $${p}`;
      case ">=": params[p] = value; return `"${node.field}" >= $${p}`;
      case "<=": params[p] = value; return `"${node.field}" <= $${p}`;
      case "~":
        params[p] = `%${escapeFilterLike(String(value))}%`;
        return `"${node.field}" LIKE $${p} ESCAPE '\\'`;
      case "!~":
        params[p] = `%${escapeFilterLike(String(value))}%`;
        return `"${node.field}" NOT LIKE $${p} ESCAPE '\\'`;
    }
  }

  if (node.type === "and") {
    return node.children
      .map((c) => {
        const sql = astToSql(c, fields, params, counter);
        // Wrap OR children in parens to preserve precedence
        return c.type === "or" ? `(${sql})` : sql;
      })
      .join(" AND ");
  }

  if (node.type === "or") {
    return node.children
      .map((c) => astToSql(c, fields, params, counter))
      .join(" OR ");
  }

  throw new Error("Unknown AST node type");
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Parse a filter expression string into parameterized SQL.
 *
 * @param expr - Filter expression string (e.g. `status='active'||status='draft'`)
 * @param fields - Field definitions for validation
 * @returns SQL fragment (no WHERE keyword) and bound params
 * @throws Error if the expression is syntactically invalid or references unknown fields
 */
export function parseFilterExpression(
  expr: string,
  fields: Field[]
): { sql: string; params: Record<string, unknown> } {
  if (!expr.trim()) throw new Error("Empty filter expression");

  const tokens = tokenize(expr);
  const ast = new Parser(tokens).parse();
  const params: Record<string, unknown> = {};
  const counter = { n: 0 };
  const sql = astToSql(ast, fields, params, counter);
  return { sql, params };
}
