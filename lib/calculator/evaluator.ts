import { CALCULATOR_RESULT_PRECISION } from "@/lib/calculator/constants";

type RawToken =
  | { kind: "number"; value: number }
  | { kind: "operator"; value: "+" | "-" | "*" | "/" | "%" | "^" | "!" }
  | { kind: "leftParen" }
  | { kind: "rightParen" }
  | { kind: "function"; value: "sqrt" };

type RpnToken =
  | { kind: "number"; value: number }
  | { kind: "operator"; value: "+" | "-" | "*" | "/" | "%" | "^" | "u-" | "!" }
  | { kind: "function"; value: "sqrt" };

type StackToken =
  | { kind: "operator"; value: "+" | "-" | "*" | "/" | "%" | "^" | "u-" | "!" }
  | { kind: "leftParen" }
  | { kind: "function"; value: "sqrt" };

type ParsedOperator = "+" | "-" | "*" | "/" | "%" | "^" | "u-" | "!";

export type CalculatorEvaluation =
  | {
      ok: true;
      result: number;
    }
  | {
      ok: false;
      error: string;
    };

function normalizeExpression(expression: string) {
  return expression
    .trim()
    .replaceAll(/\s+/g, "")
    .replaceAll("×", "*")
    .replaceAll("÷", "/")
    .replaceAll("−", "-")
    .replaceAll("π", "pi");
}

function tokenize(expression: string): RawToken[] {
  const normalized = normalizeExpression(expression);
  if (!normalized) {
    throw new Error("Enter an expression to calculate.");
  }

  const tokens: RawToken[] = [];
  let index = 0;

  while (index < normalized.length) {
    const char = normalized[index];

    if (/[0-9.]/.test(char)) {
      const start = index;
      let hasDecimalPoint = false;
      while (index < normalized.length) {
        const current = normalized[index];
        if (current === ".") {
          if (hasDecimalPoint) {
            throw new Error("Invalid number format.");
          }
          hasDecimalPoint = true;
          index += 1;
          continue;
        }
        if (!/[0-9]/.test(current)) {
          break;
        }
        index += 1;
      }

      const rawNumber = normalized.slice(start, index);
      if (rawNumber === ".") {
        throw new Error("Invalid decimal format.");
      }
      const numericValue = Number.parseFloat(rawNumber);
      if (!Number.isFinite(numericValue)) {
        throw new Error("Invalid numeric value.");
      }
      tokens.push({ kind: "number", value: numericValue });
      continue;
    }

    if (char === "(") {
      tokens.push({ kind: "leftParen" });
      index += 1;
      continue;
    }

    if (char === ")") {
      tokens.push({ kind: "rightParen" });
      index += 1;
      continue;
    }

    if (char === "x" || char === "X") {
      tokens.push({ kind: "operator", value: "*" });
      index += 1;
      continue;
    }

    if (char === "+" || char === "-" || char === "*" || char === "/" || char === "%" || char === "^" || char === "!") {
      tokens.push({
        kind: "operator",
        value: char,
      });
      index += 1;
      continue;
    }

    if (normalized.startsWith("sqrt", index)) {
      tokens.push({ kind: "function", value: "sqrt" });
      index += 4;
      continue;
    }

    if (normalized.startsWith("pi", index)) {
      tokens.push({ kind: "number", value: Math.PI });
      index += 2;
      continue;
    }

    throw new Error(`Unsupported token "${char}".`);
  }

  return tokens;
}

function precedence(operator: ParsedOperator): number {
  if (operator === "u-") {
    return 4;
  }
  if (operator === "!") {
    return 5;
  }
  if (operator === "^") {
    return 3;
  }
  if (operator === "*" || operator === "/" || operator === "%") {
    return 2;
  }
  return 1;
}

function associativity(operator: ParsedOperator): "left" | "right" {
  if (operator === "^" || operator === "u-") {
    return "right";
  }
  return "left";
}

function toRpn(tokens: RawToken[]): RpnToken[] {
  const output: RpnToken[] = [];
  const stack: StackToken[] = [];
  let previous:
    | "start"
    | "number"
    | "operator"
    | "leftParen"
    | "rightParen"
    | "function" = "start";

  for (const token of tokens) {
    if (token.kind === "number") {
      output.push(token);
      previous = "number";
      continue;
    }

    if (token.kind === "function") {
      stack.push(token);
      previous = "function";
      continue;
    }

    if (token.kind === "leftParen") {
      stack.push(token);
      previous = "leftParen";
      continue;
    }

    if (token.kind === "rightParen") {
      let foundLeftParen = false;

      while (stack.length > 0) {
        const top = stack.pop();
        if (!top) {
          break;
        }
        if (top.kind === "leftParen") {
          foundLeftParen = true;
          break;
        }
        if (top.kind === "operator" || top.kind === "function") {
          output.push(top);
        }
      }

      if (!foundLeftParen) {
        throw new Error("Mismatched parentheses.");
      }

      const maybeFunction = stack[stack.length - 1];
      if (maybeFunction?.kind === "function") {
        output.push(maybeFunction);
        stack.pop();
      }

      previous = "rightParen";
      continue;
    }

    if (token.kind === "operator") {
      const unaryContext =
        previous === "start" ||
        previous === "operator" ||
        previous === "leftParen" ||
        previous === "function";
      let operator: ParsedOperator = token.value;

      if (operator === "+" && unaryContext) {
        continue;
      }

      if (operator === "-" && unaryContext) {
        operator = "u-";
      } else if (operator === "!") {
        if (!(previous === "number" || previous === "rightParen")) {
          throw new Error("Factorial can only be used after a value.");
        }
      } else if (unaryContext) {
        throw new Error("Operator is missing a value.");
      }

      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (!top || top.kind === "leftParen") {
          break;
        }
        if (top.kind === "function") {
          output.push(top);
          stack.pop();
          continue;
        }

        const topOperator = top.value;
        const shouldPop =
          (associativity(operator) === "left" &&
            precedence(operator) <= precedence(topOperator)) ||
          (associativity(operator) === "right" &&
            precedence(operator) < precedence(topOperator));

        if (!shouldPop) {
          break;
        }

        output.push(top);
        stack.pop();
      }

      stack.push({ kind: "operator", value: operator });
      previous = operator === "!" ? "number" : "operator";
      continue;
    }
  }

  if (previous === "operator" || previous === "leftParen" || previous === "function") {
    throw new Error("Expression is incomplete.");
  }

  while (stack.length > 0) {
    const top = stack.pop();
    if (!top) {
      break;
    }
    if (top.kind === "leftParen") {
      throw new Error("Mismatched parentheses.");
    }
    output.push(top);
  }

  return output;
}

function computeFactorial(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("Factorial only supports non-negative integers.");
  }
  if (value > 170) {
    throw new Error("Factorial input is too large.");
  }
  let result = 1;
  for (let index = 2; index <= value; index += 1) {
    result *= index;
  }
  return result;
}

function evaluateRpn(tokens: RpnToken[]): number {
  const values: number[] = [];

  for (const token of tokens) {
    if (token.kind === "number") {
      values.push(token.value);
      continue;
    }

    if (token.kind === "function") {
      const operand = values.pop();
      if (operand === undefined) {
        throw new Error("Missing function operand.");
      }
      if (token.value === "sqrt") {
        if (operand < 0) {
          throw new Error("Cannot take square root of a negative number.");
        }
        values.push(Math.sqrt(operand));
      }
      continue;
    }

    if (token.value === "u-") {
      const operand = values.pop();
      if (operand === undefined) {
        throw new Error("Missing value for unary minus.");
      }
      values.push(-operand);
      continue;
    }

    if (token.value === "!") {
      const operand = values.pop();
      if (operand === undefined) {
        throw new Error("Missing value for factorial.");
      }
      values.push(computeFactorial(operand));
      continue;
    }

    const right = values.pop();
    const left = values.pop();
    if (left === undefined || right === undefined) {
      throw new Error("Expression is invalid.");
    }

    if (token.value === "/" && right === 0) {
      throw new Error("Division by zero is not allowed.");
    }

    if (token.value === "%" && right === 0) {
      throw new Error("Modulo by zero is not allowed.");
    }

    let calculated = 0;
    if (token.value === "+") {
      calculated = left + right;
    } else if (token.value === "-") {
      calculated = left - right;
    } else if (token.value === "*") {
      calculated = left * right;
    } else if (token.value === "/") {
      calculated = left / right;
    } else if (token.value === "%") {
      calculated = left % right;
    } else if (token.value === "^") {
      calculated = left ** right;
    }

    if (!Number.isFinite(calculated)) {
      throw new Error("Result is outside supported numeric range.");
    }

    values.push(calculated);
  }

  if (values.length !== 1) {
    throw new Error("Expression is invalid.");
  }

  return values[0];
}

export function roundCalculatorResult(
  value: number,
  precision = CALCULATOR_RESULT_PRECISION
): number {
  const rounded = Number.parseFloat(value.toFixed(precision));
  if (Object.is(rounded, -0)) {
    return 0;
  }
  return rounded;
}

export function evaluateExpression(
  expression: string,
  precision = CALCULATOR_RESULT_PRECISION
): CalculatorEvaluation {
  try {
    const tokens = tokenize(expression);
    const rpnTokens = toRpn(tokens);
    const rawResult = evaluateRpn(rpnTokens);
    const result = roundCalculatorResult(rawResult, precision);
    return {
      ok: true,
      result,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Unable to evaluate expression.";
    return {
      ok: false,
      error: message,
    };
  }
}
