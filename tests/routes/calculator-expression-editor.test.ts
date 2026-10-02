import { expect, test } from "@playwright/test";
import { evaluateExpression } from "@/lib/calculator/evaluator";
import { calculatorExpressionState, editCalculatorExpression } from "@/lib/calculator/expression-editor";

test("successive queued digits keep the expression and caret in order", () => {
  let state = calculatorExpressionState("");
  for (const digit of ["2", "0", "0", "0"]) {
    const previous = state;
    state = editCalculatorExpression(state, { type: "insert", value: digit, result: null });
    expect(state.selection).toEqual({ start: state.expression.length, end: state.expression.length });
    expect(previous.expression + digit).toBe(state.expression);
  }
  expect(state.expression).toBe("2000");
  expect(evaluateExpression(state.expression)).toEqual({ ok: true, result: 2000 });
});

test("inserting and replacing selected digits preserves the edit location", () => {
  let state = editCalculatorExpression({ expression: "20+30", selection: { start: 1, end: 1 } }, { type: "insert", value: "5", result: null });
  expect(state.expression).toBe("250+30");
  state = editCalculatorExpression(state, { type: "insert", value: "0", result: null });
  expect(state.expression).toBe("2500+30");
  state = editCalculatorExpression({ ...state, selection: { start: 0, end: 4 } }, { type: "insert", value: "4", result: null });
  expect(state).toEqual({ expression: "4+30", selection: { start: 1, end: 1 } });
});

test("backspace removes the selection or one mathematical token and the next digit stays in place", () => {
  expect(editCalculatorExpression({ expression: "2500+30", selection: { start: 1, end: 3 } }, { type: "backspace" })).toEqual({ expression: "20+30", selection: { start: 1, end: 1 } });
  for (const token of ["pi", "sqrt", "sqrt("]) {
    expect(editCalculatorExpression(calculatorExpressionState(`2+${token}`), { type: "backspace" }).expression).toBe("2+");
  }
  let state = editCalculatorExpression(calculatorExpressionState("200"), { type: "backspace" });
  state = editCalculatorExpression(state, { type: "insert", value: "5", result: null });
  expect(state.expression).toBe("205");
  expect(editCalculatorExpression({ expression: "20", selection: { start: 0, end: 0 } }, { type: "backspace" }).expression).toBe("20");
});

test("decimal, operator, parentheses and result continuation rules remain correct", () => {
  let state = calculatorExpressionState("");
  for (const value of ["2", "0", ".", "5", ".", "+", "×", "2"]) {
    state = editCalculatorExpression(state, { type: "insert", value, result: null });
  }
  expect(state.expression).toBe("20.5*2");
  expect(evaluateExpression(state.expression)).toEqual({ ok: true, result: 41 });
  expect(editCalculatorExpression(calculatorExpressionState(""), { type: "insert", value: "+", result: null }).expression).toBe("");
  expect(editCalculatorExpression(calculatorExpressionState(""), { type: "insert", value: "+", result: 20 })).toEqual({ expression: "20+", selection: { start: 3, end: 3 } });
  expect(editCalculatorExpression(calculatorExpressionState("(20"), { type: "parentheses" }).expression).toBe("(20)");
  expect(editCalculatorExpression(calculatorExpressionState("20+"), { type: "parentheses" }).expression).toBe("20+(");
});
