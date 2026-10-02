import { expect, test } from "@playwright/test";
import { evaluateExpression } from "@/lib/calculator/evaluator";
import { calculatorExpressionState, editCalculatorExpression } from "@/lib/calculator/expression-editor";

const percentageExamples: Array<[string, number]> = [
  ["5000000*6.25%", 312500],
  ["5000000×6.25%", 312500],
  ["6.25%", 0.0625],
  ["200+10%", 220],
  ["200-10%", 180],
  ["200*10%", 20],
  ["200/10%", 2000],
  ["200+10%+5%", 231],
  ["200*(10%+5%)", 30],
  ["200*(5+5)%", 20],
  ["-200*10%", -20],
  ["200+-10%", 180],
  ["0%", 0],
  ["50%%", 0.005],
  ["20%+2", 2.2],
  ["(20%)*100", 20],
  ["2^3%", 1.0210121257],
  ["2+3*4", 14],
  ["sqrt(9)+3!", 9],
];

test("percentages calculate ratios, increases and discounts without intermediate rounding", () => {
  expect(evaluateExpression("5000000*6.25%")).toEqual({ ok: true, result: 312500 });
  for (const [expression, result] of percentageExamples) {
    expect(evaluateExpression(expression, 10), expression).toEqual({ ok: true, result });
  }
});

test("keypad preserves percentage when entering the next operation or closing a group", () => {
  let state = calculatorExpressionState("");
  for (const value of ["2", "0", "0", "+", "1", "0", "%", "+", "5", "%"]) {
    state = editCalculatorExpression(state, { type: "insert", value, result: null });
  }
  expect(state.expression).toBe("200+10%+5%");
  expect(evaluateExpression(state.expression)).toEqual({ ok: true, result: 231 });
  expect(editCalculatorExpression(calculatorExpressionState("(20%"), { type: "parentheses" }).expression).toBe("(20%)");
  expect(editCalculatorExpression(calculatorExpressionState("20+"), { type: "insert", value: "%", result: null }).expression).toBe("20+");
});

test("invalid percentage operands and division by zero still return errors", () => {
  for (const expression of ["%", "20+%", "20/%", "200/0%", "20%+"]) {
    expect(evaluateExpression(expression).ok, expression).toBe(false);
  }
});
