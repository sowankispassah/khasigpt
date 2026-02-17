"use client";

import { DeleteIcon, X } from "lucide-react";
import {
  type ChangeEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
const CALCULATOR_LANGUAGE_STORAGE_KEY = "calculator.selectedLanguage";
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
        "flex w-full aspect-[10/9] cursor-pointer items-center justify-center rounded-full transition active:scale-[0.98]",
        className
      )}
      onMouseDown={(event) => event.preventDefault()}
      onPointerDown={(event) => event.preventDefault()}
      onClick={onClick}
      type="button"
    >
      <span className={cn("font-medium text-[2rem]", valueClassName)}>
        {label}
      </span>
    </button>
  );
}

export function CalculatorWorkbench() {
  const [expression, setExpression] = useState("");
  const [result, setResult] = useState<number | null>(null);
  const expressionInputRef = useRef<HTMLInputElement>(null);
  const [, setCaretRange] = useState({ start: 0, end: 0 });
  const caretRangeRef = useRef({ start: 0, end: 0 });
  const [hasEnteredData, setHasEnteredData] = useState(false);
  const [language, setLanguage] = useState<NumberWordLanguage | "">("");
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
      } else if (fallback.endsWith("sqrt")) {
        fallback = fallback.slice(0, -4).trim();
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
    if (language === "") {
      return "Select Language";
    }
    try {
      return convertNumberToWords(inWordsSource, language);
    } catch (conversionError) {
      return conversionError instanceof Error
        ? conversionError.message
        : "Unable to convert result to words.";
    }
  }, [inWordsSource, language]);

  useEffect(() => {
    if (!hasEnteredData && (expression.trim().length > 0 || result !== null)) {
      setHasEnteredData(true);
    }
  }, [expression, hasEnteredData, result]);

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem(
      CALCULATOR_LANGUAGE_STORAGE_KEY
    );
    if (
      savedLanguage &&
      LANGUAGE_OPTIONS.some((option) => option.value === savedLanguage)
    ) {
      setLanguage(savedLanguage as NumberWordLanguage);
    }
  }, []);

  useEffect(() => {
    if (language === "") {
      window.localStorage.removeItem(CALCULATOR_LANGUAGE_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(CALCULATOR_LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  const updateCaretRange = (nextRange: { start: number; end: number }) => {
    caretRangeRef.current = nextRange;
    setCaretRange(nextRange);
  };

  const getCaretRange = (length: number) => {
    const input = expressionInputRef.current;
    if (input && document.activeElement === input) {
      return {
        start: Math.max(0, Math.min(input.selectionStart ?? length, length)),
        end: Math.max(0, Math.min(input.selectionEnd ?? length, length)),
      };
    }
    return {
      start: Math.max(0, Math.min(caretRangeRef.current.start, length)),
      end: Math.max(0, Math.min(caretRangeRef.current.end, length)),
    };
  };

  const setInputCaret = (position: number) => {
    const safePosition = Math.max(0, position);
    updateCaretRange({ start: safePosition, end: safePosition });
    requestAnimationFrame(() => {
      const input = expressionInputRef.current;
      if (!input) {
        return;
      }
      if (document.activeElement !== input) {
        return;
      }
      const boundedPosition = Math.max(0, Math.min(safePosition, input.value.length));
      input.setSelectionRange(boundedPosition, boundedPosition);
    });
  };

  const syncCaretFromInput = () => {
    const input = expressionInputRef.current;
    if (!input) {
      return;
    }
    const length = input.value.length;
    const start = Math.max(0, Math.min(input.selectionStart ?? length, length));
    const end = Math.max(0, Math.min(input.selectionEnd ?? length, length));
    updateCaretRange({ start, end });
  };

  const closeGstModeForInput = () => {
    setIsGstPanelOpen(false);
    setGstBaseValue(null);
    setGstPreview(null);
    setGstSnapshot(null);
  };

  const handleExpressionInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (isGstPanelOpen) {
      closeGstModeForInput();
    }
    setError(null);
    const normalized = event.target.value
      .replaceAll(/\s+/g, "")
      .replaceAll("×", "*")
      .replaceAll("÷", "/")
      .replaceAll("−", "-")
      .replaceAll(",", ".")
      .replaceAll("π", "pi")
      .replaceAll("X", "x");
    const sanitized = normalized.replaceAll(/[^0-9+\-*/%^().!a-z]/gi, "");
    setExpression(sanitized);

    const position = event.target.selectionStart ?? sanitized.length;
    const safePosition = Math.max(0, Math.min(position, sanitized.length));
    updateCaretRange({ start: safePosition, end: safePosition });
  };

  const appendToExpression = (value: string) => {
    expressionInputRef.current?.blur();
    if (isGstPanelOpen) {
      closeGstModeForInput();
    }
    setError(null);
    let nextCaretPosition: number | null = null;
    setExpression((current) => {
      const { start, end } = getCaretRange(current.length);
      let working = current;
      let localStart = start;
      let localEnd = end;
      const startsWithOperator = /^[+*/%^]/.test(value);
      if (!working && startsWithOperator) {
        if (result === null) {
          return working;
        }
        working = toExpressionValue(result);
        localStart = working.length;
        localEnd = working.length;
      }

      let before = working.slice(0, localStart);
      const after = working.slice(localEnd);

      if (value === "." && /\.\d*$/.test(before)) {
        nextCaretPosition = localStart;
        return working;
      }

      if (/^[+\-*/%^]$/.test(value) && localStart === localEnd && /[+\-*/%^]$/.test(before)) {
        before = before.slice(0, -1);
        localStart -= 1;
      }

      const nextValue = `${before}${value}${after}`;
      nextCaretPosition = localStart + value.length;
      return nextValue;
    });
    if (nextCaretPosition !== null) {
      setInputCaret(nextCaretPosition);
    }
  };

  const evaluateAndStore = (input: string) => {
    const evaluated = evaluateExpression(input);
    if (!evaluated.ok) {
      setError(evaluated.error);
      return null;
    }
    if (Math.abs(evaluated.result) > CALCULATOR_MAX_SUPPORTED_ABSOLUTE) {
      setError("Result exceeds supported range (up to 9,99,99,99,999).");
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
        setError("Result exceeds supported range (up to 9,99,99,99,999).");
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
    setGstSnapshot({
      expression,
      result,
      error,
    });
    setGstBaseValue(baseValue);
    setGstPreview(
      baseValue === null ? null : calculateGstResult(baseValue, gstRate, gstMode)
    );
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
    updateCaretRange({ start: 0, end: 0 });
    setInputCaret(0);
  };

  const handleBackspace = () => {
    expressionInputRef.current?.blur();
    if (isGstPanelOpen) {
      closeGstModeForInput();
    }
    setError(null);
    let nextCaretPosition: number | null = null;
    setExpression((current) => {
      const { start, end } = getCaretRange(current.length);
      if (start !== end) {
        nextCaretPosition = start;
        return `${current.slice(0, start)}${current.slice(end)}`;
      }
      if (start === 0) {
        nextCaretPosition = 0;
        return current;
      }
      const beforeCursor = current.slice(0, start);
      let removeLength = 1;
      if (beforeCursor.endsWith("sqrt(")) {
        removeLength = 5;
      } else if (beforeCursor.endsWith("sqrt")) {
        removeLength = 4;
      } else if (beforeCursor.endsWith("pi")) {
        removeLength = 2;
      }
      const nextStart = Math.max(0, start - removeLength);
      nextCaretPosition = nextStart;
      return `${current.slice(0, nextStart)}${current.slice(start)}`;
    });
    if (nextCaretPosition !== null) {
      setInputCaret(nextCaretPosition);
    }
  };

  const handleParentheses = () => {
    expressionInputRef.current?.blur();
    if (isGstPanelOpen) {
      closeGstModeForInput();
    }
    setError(null);
    let nextCaretPosition: number | null = null;
    setExpression((current) => {
      const { start, end } = getCaretRange(current.length);
      const before = current.slice(0, start);
      const after = current.slice(end);
      const openCount = (before.match(/\(/g) ?? []).length;
      const closeCount = (before.match(/\)/g) ?? []).length;
      const shouldClose =
        openCount > closeCount && /(?:[0-9)!]|pi)$/.test(before.trim());
      const insertion = shouldClose ? ")" : "(";
      nextCaretPosition = start + 1;
      return `${before}${insertion}${after}`;
    });
    if (nextCaretPosition !== null) {
      setInputCaret(nextCaretPosition);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      const target = event.target;
      if (target instanceof HTMLElement) {
        const tagName = target.tagName;
        if (
          target.isContentEditable ||
          tagName === "INPUT" ||
          tagName === "TEXTAREA" ||
          tagName === "SELECT"
        ) {
          return;
        }
      }

      const key = event.key;

      if (/^[0-9]$/.test(key)) {
        event.preventDefault();
        appendToExpression(key);
        return;
      }

      if (key === "." || key === ",") {
        event.preventDefault();
        appendToExpression(".");
        return;
      }

      if (
        key === "+" ||
        key === "-" ||
        key === "*" ||
        key === "/" ||
        key === "%" ||
        key === "^" ||
        key === "(" ||
        key === ")" ||
        key === "!" ||
        key === "x" ||
        key === "X"
      ) {
        event.preventDefault();
        appendToExpression(key === "x" || key === "X" ? "*" : key);
        return;
      }

      if (key === "Enter" || key === "=") {
        event.preventDefault();
        handleEvaluate();
        return;
      }

      if (key === "Backspace") {
        event.preventDefault();
        handleBackspace();
        return;
      }

      if (key === "Escape") {
        event.preventDefault();
        handleClear();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [appendToExpression, handleBackspace, handleClear, handleEvaluate]);

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col gap-0.5 rounded-3xl border bg-card p-3 shadow-sm sm:h-auto sm:gap-4 sm:p-4">
      <div className="relative min-h-[clamp(11rem,25dvh,16rem)] flex-[1.55] rounded-2xl bg-muted/40 p-3 sm:h-auto sm:flex-none sm:p-4">
        <input
          className="min-h-9 w-full bg-transparent text-right font-medium text-3xl outline-none placeholder:text-foreground/70 sm:min-h-10 sm:text-4xl"
          inputMode="decimal"
          onChange={handleExpressionInputChange}
          onClick={syncCaretFromInput}
          onFocus={syncCaretFromInput}
          onKeyUp={syncCaretFromInput}
          onSelect={syncCaretFromInput}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "=") {
              event.preventDefault();
              handleEvaluate();
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              handleClear();
            }
          }}
          placeholder="0"
          ref={expressionInputRef}
          spellCheck={false}
          type="text"
          value={expression}
        />
        <div className="mt-1 min-h-7 text-right text-3xl text-muted-foreground sm:mt-2 sm:min-h-8 sm:text-4xl">
          = {displayedResult === null ? "0" : formatNumericResult(displayedResult)}
        </div>

        {!hasEnteredData ? (
          <p className="pointer-events-none absolute inset-x-4 bottom-3 text-center text-muted-foreground text-sm leading-relaxed">
            Calculator that converts numbers into words in Khasi and other
            languages.
          </p>
        ) : null}

        <div className="mt-[clamp(1.2rem,3dvh,2.4rem)] min-h-[clamp(2rem,4.5dvh,3.8rem)] sm:mt-20 sm:min-h-24">
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
                      setLanguage(event.target.value as NumberWordLanguage | "")
                    }
                    value={language}
                  >
                    <option value="">Select Language</option>
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

      <div className="h-[3.8rem]">
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
                  handleGstModeChange(
                    gstMode === "include" ? "exclude" : "include"
                  )
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
          <div className="flex h-full items-end">
            <button
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-[#ff940f] font-medium text-[11px] text-white transition hover:bg-[#e6860d]"
              onClick={handleGst}
              type="button"
            >
              GST
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 justify-items-center gap-1 sm:gap-1.5">
        <CalculatorKey
          className="bg-violet-200 hover:bg-violet-300 dark:bg-violet-950 dark:hover:bg-violet-900"
          label="AC"
          onClick={handleClear}
        />
        <CalculatorKey
          className="bg-blue-100 hover:bg-blue-200 dark:bg-blue-950 dark:hover:bg-blue-900"
          label="()"
          onClick={handleParentheses}
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
