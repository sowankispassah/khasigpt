export type CalculatorSelection = { start: number; end: number };
export type CalculatorEditorState = {
  expression: string;
  selection: CalculatorSelection;
};
export type CalculatorEdit =
  | { type: "insert"; value: string; result: number | null }
  | { type: "backspace" }
  | { type: "parentheses" };

export function calculatorExpressionState(expression: string): CalculatorEditorState {
  return { expression, selection: { start: expression.length, end: expression.length } };
}

// Expression and caret are computed atomically, including queued keypad presses.
export function editCalculatorExpression(state: CalculatorEditorState, edit: CalculatorEdit): CalculatorEditorState {
  let expression = state.expression;
  let start = Math.max(0, Math.min(state.selection.start, expression.length));
  let end = Math.max(start, Math.min(state.selection.end, expression.length));
  if (edit.type === "backspace") {
    if (start === end) {
      const before = expression.slice(0, start);
      const length = before.endsWith("sqrt(") ? 5 : before.endsWith("sqrt") ? 4 : before.endsWith("pi") ? 2 : 1;
      start = Math.max(0, start - length);
    }
    return { expression: expression.slice(0, start) + expression.slice(end), selection: { start, end: start } };
  }
  let value: string;
  if (edit.type === "parentheses") {
    const before = expression.slice(0, start);
    const opens = (before.match(/\(/g) ?? []).length;
    const closes = (before.match(/\)/g) ?? []).length;
    value = opens > closes && /(?:[0-9)!]|pi)$/.test(before.trim()) ? ")" : "(";
  } else {
    value = edit.value.replaceAll("×", "*").replaceAll("÷", "/").replaceAll("−", "-");
    if (!expression && /^[+*/%^]/.test(value)) {
      if (edit.result === null) return state;
      expression = edit.result.toString();
      start = expression.length;
      end = start;
    }
  }
  let before = expression.slice(0, start);
  if (value === "." && /\.\d*$/.test(before)) return state;
  if (/^[+\-*/%^]$/.test(value) && start === end && /[+\-*/%^]$/.test(before)) {
    before = before.slice(0, -1);
    start -= 1;
  }
  const position = start + value.length;
  return { expression: before + value + expression.slice(end), selection: { start: position, end: position } };
}
