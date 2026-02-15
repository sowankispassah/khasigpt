"use client";

import { DeleteIcon, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { CALCULATOR_MAX_SUPPORTED_ABSOLUTE } from "@/lib/calculator/constants";
import {
  evaluateExpression,
  roundCalculatorResult,
} from "@/lib/calculator/evaluator";
import {
  convertNumberToWords,
  formatNumericResult,
  type NumberWordLanguage,
} from "@/lib/calculator/number-to-words";
import { cn } from "@/lib/utils";

const LANGUAGE_OPTIONS: Array<{
  label: string;
  value: NumberWordLanguage;
}> = [
  { label: "Khasi", value: "khasi" },
  { label: "English (Ind)", value: "english_ind" },
  { label: "English", value: "english" },
  { label: "Hindi", value: "hindi" },
];
const GST_RATE_OPTIONS = [3, 5, 12, 18, 28] as const;

function toExpressionValue(value: number) {
  return value.toString();
}

function CalculatorKey({
  className,
  label,
  onClick,
  valueClassName,
}: {
  className?: string;
  label: ReactNode;
  onClick: () => void;
  valueClassName?: string;
}) {
  return (
    <button
      className={cn(
        "flex h-[clamp(3rem,7.2dvh,4rem)] cursor-pointer items-center justify-center rounded-full transition active:scale-[0.98] sm:h-16",
        className
      )}
      onClick={onClick}
      type="button"
    >
      <span className={cn("font-medium text-xl sm:text-2xl", valueClassName)}>
        {label}
      </span>
    </button>
  );
}

export function CalculatorWorkbench() {
  const [expression, setExpression] = useState("");
  const [result, setResult] = useState<number | null>(null);
  const [hasEnteredData, setHasEnteredData] = useState(false);
  const [language, setLanguage] = useState<NumberWordLanguage>("khasi");
  const [isInWordsOpen, setIsInWordsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGstPanelOpen, setIsGstPanelOpen] = useState(false);
  const [gstMode, setGstMode] = useState<"include" | "exclude">("include");
  const [gstRate, setGstRate] = useState<number>(18);
  const [gstBaseValue, setGstBaseValue] = useState<number | null>(null);
  const [gstPreview, setGstPreview] = useState<number | null>(null);
  const [gstSnapshot, setGstSnapshot] = useState<{
    expression: string;
    result: number | null;
    error: string | null;
  } | null>(null);

  const previewResult = useMemo(() => {
    const normalizedExpression = expression.trim();
    if (!normalizedExpression) {
      return null;
    }

    const evaluateWithinRange = (input: string) => {
      const evaluated = evaluateExpression(input);
      if (!evaluated.ok) {
        return null;
      }
      if (Math.abs(evaluated.result) > CALCULATOR_MAX_SUPPORTED_ABSOLUTE) {
        return null;
      }
      return evaluated.result;
    };

    const directResult = evaluateWithinRange(normalizedExpression);
    if (directResult !== null) {
      return directResult;
    }

    let fallback = normalizedExpression;
    while (fallback.length > 0) {
      if (fallback.endsWith("sqrt(")) {
        fallback = fallback.slice(0, -5).trim();
      } else if (/[+\-*/%^.(]$/.test(fallback)) {
        fallback = fallback.slice(0, -1).trim();
      } else {
        break;
      }

      if (!fallback) {
        return null;
      }

      const fallbackResult = evaluateWithinRange(fallback);
      if (fallbackResult !== null) {
        return fallbackResult;
      }
    }

    return null;
  }, [expression]);

  const displayedResult = isGstPanelOpen
    ? (gstPreview ?? previewResult ?? result)
    : (previewResult ?? result);
  const wordsSourceResult = isGstPanelOpen
    ? (gstPreview ?? result)
    : result;
  const inWordsSource = wordsSourceResult ?? previewResult;
  const shouldShowInWords = inWordsSource !== null;

  const words = useMemo(() => {
    if (inWordsSource === null) {
      return null;
    }
    try {
      return convertNumberToWords(inWordsSource, language);
    } catch (conversionError) {
      return conversionError instanceof Error
        ? conversionError.message
        : "Unable to convert result to words.";
    }
  }, [inWordsSource, language]);

  const displayExpression = expression
    ? expression
        .replaceAll("pi", "π")
        .replaceAll("*", "×")
        .replaceAll("/", "÷")
    : "0";

  useEffect(() => {
    if (!hasEnteredData && (expression.trim().length > 0 || result !== null)) {
      setHasEnteredData(true);
    }
  }, [expression, hasEnteredData, result]);

  const appendToExpression = (value: string) => {
    if (isGstPanelOpen) {
      return;
    }
    setError(null);
    setExpression((current) => {
      const startsWithOperator = /^[+*/%^]/.test(value);
      if (!current && startsWithOperator) {
        if (result === null) {
          return current;
        }
        return `${toExpressionValue(result)}${value}`;
      }

      if (value === "." && /\.\d*$/.test(current)) {
        return current;
      }

      if (/^[+\-*/%^]$/.test(value) && /[+\-*/%^]$/.test(current)) {
        return `${current.slice(0, -1)}${value}`;
      }

      return `${current}${value}`;
    });
  };

  const evaluateAndStore = (input: string) => {
    const evaluated = evaluateExpression(input);
    if (!evaluated.ok) {
      setError(evaluated.error);
      return null;
    }
    if (Math.abs(evaluated.result) > CALCULATOR_MAX_SUPPORTED_ABSOLUTE) {
      setError("Result exceeds supported range (up to 99,99,99,999).");
      return null;
    }
    setResult(evaluated.result);
    setError(null);
    return evaluated.result;
  };

  const calculateGstResult = (
    baseValue: number,
    rate: number,
    mode: "include" | "exclude"
  ) => {
    if (mode === "include") {
      return roundCalculatorResult(baseValue * (1 + rate / 100));
    }
    return roundCalculatorResult((baseValue * 100) / (100 + rate));
  };

  const resolveCurrentValue = () => {
    if (previewResult !== null) {
      return previewResult;
    }
    if (result !== null) {
      return result;
    }
    return null;
  };

  const handleEvaluate = () => {
    if (isGstPanelOpen) {
      if (gstPreview === null) {
        setError("Unable to apply GST for the current value.");
        return;
      }
      if (Math.abs(gstPreview) > CALCULATOR_MAX_SUPPORTED_ABSOLUTE) {
        setError("Result exceeds supported range (up to 99,99,99,999).");
        return;
      }
      setExpression(toExpressionValue(gstPreview));
      setResult(gstPreview);
      setError(null);
      setIsGstPanelOpen(false);
      setGstBaseValue(null);
      setGstPreview(null);
      setGstSnapshot(null);
      return;
    }
    if (!expression.trim()) {
      setError("Enter an expression to calculate.");
      return;
    }
    evaluateAndStore(expression);
  };

  const handleGst = () => {
    if (isGstPanelOpen) {
      return;
    }
    const baseValue = resolveCurrentValue();
    if (baseValue === null) {
      setError("Enter an expression before applying GST.");
      return;
    }
    setGstSnapshot({
      expression,
      result,
      error,
    });
    setGstBaseValue(baseValue);
    setGstPreview(calculateGstResult(baseValue, gstRate, gstMode));
    setIsGstPanelOpen(true);
    setError(null);
  };

  const handleCloseGstPanel = () => {
    if (gstSnapshot) {
      setExpression(gstSnapshot.expression);
      setResult(gstSnapshot.result);
      setError(gstSnapshot.error);
    }
    setIsGstPanelOpen(false);
    setGstBaseValue(null);
    setGstPreview(null);
    setGstSnapshot(null);
  };

  const handleGstModeChange = (mode: "include" | "exclude") => {
    setGstMode(mode);
    if (gstBaseValue === null) {
      return;
    }
    setGstPreview(calculateGstResult(gstBaseValue, gstRate, mode));
  };

  const handleGstRateChange = (rate: number) => {
    setGstRate(rate);
    if (gstBaseValue === null) {
      return;
    }
    setGstPreview(calculateGstResult(gstBaseValue, rate, gstMode));
  };

  const handleClear = () => {
    setExpression("");
    setResult(null);
    setError(null);
    setIsGstPanelOpen(false);
    setGstBaseValue(null);
    setGstPreview(null);
    setGstSnapshot(null);
  };

  const handleBackspace = () => {
    if (isGstPanelOpen) {
      return;
    }
    setError(null);
    setExpression((current) => {
      if (!current) {
        return current;
      }
      if (current.endsWith("sqrt(")) {
        return current.slice(0, -5);
      }
      if (current.endsWith("pi")) {
        return current.slice(0, -2);
      }
      return current.slice(0, -1);
    });
  };

  const handleParentheses = () => {
    if (isGstPanelOpen) {
      return;
    }
    setError(null);
    setExpression((current) => {
      const openCount = (current.match(/\(/g) ?? []).length;
      const closeCount = (current.match(/\)/g) ?? []).length;
      const shouldClose =
        openCount > closeCount && /(?:[0-9)!]|pi)$/.test(current.trim());
      return shouldClose ? `${current})` : `${current}(`;
    });
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col gap-2 rounded-3xl border bg-card p-3 shadow-sm sm:h-auto sm:gap-4 sm:p-4">
      <div className="relative flex flex-1 flex-col rounded-2xl bg-muted/40 p-3 sm:flex-none sm:p-4">
        <div className="min-h-9 break-words text-right font-medium text-3xl sm:min-h-10 sm:text-4xl">
          {displayExpression}
        </div>
        <div className="mt-1 min-h-7 text-right text-3xl text-muted-foreground sm:mt-2 sm:min-h-8 sm:text-4xl">
          = {displayedResult === null ? "0" : formatNumericResult(displayedResult)}
        </div>

        {!hasEnteredData ? (
          <p className="pointer-events-none absolute inset-x-4 top-1/2 -translate-y-1/2 text-center text-muted-foreground text-sm leading-relaxed">
            Calculator that converts numbers into words in Khasi and other
            languages.
          </p>
        ) : null}

        <div className="mt-[clamp(2rem,6dvh,5rem)] min-h-[clamp(3rem,8dvh,6rem)] sm:mt-20 sm:min-h-24">
          {shouldShowInWords ? (
            isInWordsOpen ? (
              <>
                <p className="text-right font-medium text-sm leading-relaxed">
                  {words}
                </p>

                <div className="mt-0 flex items-center justify-end gap-2">
                  <select
                    className="cursor-pointer rounded-md border bg-background px-2 py-1 text-sm"
                    onChange={(event) =>
                      setLanguage(event.target.value as NumberWordLanguage)
                    }
                    value={language}
                  >
                    {LANGUAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    aria-label="Close language selector"
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border bg-background hover:bg-muted/70"
                    onClick={() => setIsInWordsOpen(false)}
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-end">
                <button
                  className="cursor-pointer rounded-md border bg-background px-3 py-1 font-medium text-sm hover:bg-muted/70"
                  onClick={() => setIsInWordsOpen(true)}
                  type="button"
                >
                  In Words
                </button>
              </div>
            )
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm">
          {error}
        </p>
      ) : null}

      {isGstPanelOpen ? (
        <div className="space-y-1 sm:space-y-2">
          <div className="flex items-center gap-2">
            <button
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              onClick={handleCloseGstPanel}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
            <button
              className={cn(
                "cursor-pointer rounded-full px-2 py-1 text-sm transition",
                gstMode === "include"
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-zinc-100 text-zinc-800 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              )}
              onClick={() =>
                handleGstModeChange(gstMode === "include" ? "exclude" : "include")
              }
              type="button"
            >
              {gstMode === "include" ? "+" : "-"}
            </button>
            {GST_RATE_OPTIONS.map((rate) => (
              <button
                className={cn(
                  "cursor-pointer rounded-full px-2 py-1 text-sm transition",
                  gstRate === rate
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-800 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                )}
                key={rate}
                onClick={() => handleGstRateChange(rate)}
                type="button"
              >
                {rate}%
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
          <CalculatorKey
            className="bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            label="GST"
            onClick={handleGst}
            valueClassName="text-base"
          />
          <CalculatorKey
            className="bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            label="√"
            onClick={() => appendToExpression("sqrt(")}
          />
          <CalculatorKey
            className="bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            label="π"
            onClick={() => appendToExpression("pi")}
          />
          <CalculatorKey
            className="bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            label="^"
            onClick={() => appendToExpression("^")}
          />
          <CalculatorKey
            className="bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            label="!"
            onClick={() => appendToExpression("!")}
          />
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        <CalculatorKey
          className="bg-violet-200 hover:bg-violet-300 dark:bg-violet-950 dark:hover:bg-violet-900"
          label="AC"
          onClick={handleClear}
          valueClassName="text-xl"
        />
        <CalculatorKey
          className="bg-blue-100 hover:bg-blue-200 dark:bg-blue-950 dark:hover:bg-blue-900"
          label="()"
          onClick={handleParentheses}
          valueClassName="text-xl"
        />
        <CalculatorKey
          className="bg-blue-100 hover:bg-blue-200 dark:bg-blue-950 dark:hover:bg-blue-900"
          label="%"
          onClick={() => appendToExpression("%")}
        />
        <CalculatorKey
          className="bg-blue-100 hover:bg-blue-200 dark:bg-blue-950 dark:hover:bg-blue-900"
          label="÷"
          onClick={() => appendToExpression("/")}
        />

        <CalculatorKey
          className="bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          label="7"
          onClick={() => appendToExpression("7")}
        />
        <CalculatorKey
          className="bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          label="8"
          onClick={() => appendToExpression("8")}
        />
        <CalculatorKey
          className="bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          label="9"
          onClick={() => appendToExpression("9")}
        />
        <CalculatorKey
          className="bg-blue-100 hover:bg-blue-200 dark:bg-blue-950 dark:hover:bg-blue-900"
          label="×"
          onClick={() => appendToExpression("*")}
        />

        <CalculatorKey
          className="bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          label="4"
          onClick={() => appendToExpression("4")}
        />
        <CalculatorKey
          className="bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          label="5"
          onClick={() => appendToExpression("5")}
        />
        <CalculatorKey
          className="bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          label="6"
          onClick={() => appendToExpression("6")}
        />
        <CalculatorKey
          className="bg-blue-100 hover:bg-blue-200 dark:bg-blue-950 dark:hover:bg-blue-900"
          label="-"
          onClick={() => appendToExpression("-")}
        />

        <CalculatorKey
          className="bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          label="1"
          onClick={() => appendToExpression("1")}
        />
        <CalculatorKey
          className="bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          label="2"
          onClick={() => appendToExpression("2")}
        />
        <CalculatorKey
          className="bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          label="3"
          onClick={() => appendToExpression("3")}
        />
        <CalculatorKey
          className="bg-blue-100 hover:bg-blue-200 dark:bg-blue-950 dark:hover:bg-blue-900"
          label="+"
          onClick={() => appendToExpression("+")}
        />

        <CalculatorKey
          className="bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          label="0"
          onClick={() => appendToExpression("0")}
        />
        <CalculatorKey
          className="bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          label="."
          onClick={() => appendToExpression(".")}
        />
        <CalculatorKey
          className="bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          label={<DeleteIcon className="h-5 w-5 sm:h-6 sm:w-6" />}
          onClick={handleBackspace}
          valueClassName=""
        />
        <CalculatorKey
          className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
          label="="
          onClick={handleEvaluate}
          valueClassName="text-white"
        />
      </div>
    </div>
  );
}
