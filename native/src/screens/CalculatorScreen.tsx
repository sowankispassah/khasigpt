import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { Check, ChevronDown, Delete, X } from "lucide-react-native";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { AppSidebar } from "@/components/AppSidebar";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
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
import type { MainTabParamList } from "@/navigation/types";
import { radius, spacing } from "@/theme/tokens";
import { useAppTheme } from "@/theme/useAppTheme";

type CalculatorScreenProps = BottomTabScreenProps<MainTabParamList, "Calculator">;

const LANGUAGE_OPTIONS: Array<{ label: string; value: NumberWordLanguage }> = [
  { label: "Khasi", value: "khasi" },
  { label: "English (Ind)", value: "english_ind" },
  { label: "English", value: "english" },
  { label: "Hindi", value: "hindi" },
];
const LANGUAGE_SELECT_PLACEHOLDER_VALUE = "__select_language__" as const;
const CALCULATOR_LANGUAGE_STORAGE_KEY = "calculator.selectedLanguage";
const GST_RATE_OPTIONS = [3, 5, 12, 18, 28] as const;

type CalculatorLanguage =
  | NumberWordLanguage
  | typeof LANGUAGE_SELECT_PLACEHOLDER_VALUE;

function toExpressionValue(value: number) {
  return value.toString();
}

function normalizeInput(value: string) {
  return value.replaceAll("×", "*").replaceAll("÷", "/").replaceAll("−", "-");
}

function formatExpressionForDisplay(value: string) {
  return value.replaceAll("*", "×").replaceAll("/", "÷");
}

function startsWithOperator(value: string) {
  return /^[+*/%^]/.test(value);
}

function trimIncompleteExpression(value: string) {
  let next = value.trim();
  while (next.length > 0) {
    if (next.endsWith("sqrt(")) {
      next = next.slice(0, -5).trim();
    } else if (next.endsWith("sqrt")) {
      next = next.slice(0, -4).trim();
    } else if (/[+\-*/%^.(]$/.test(next)) {
      next = next.slice(0, -1).trim();
    } else {
      break;
    }
  }
  return next;
}

function CalculatorKey({
  accent,
  children,
  onPress,
  size,
}: {
  accent: "primary" | "operator" | "equals" | "number";
  children: ReactNode;
  onPress: () => void;
  size: number;
}) {
  const { mode } = useAppTheme();
  const [isFlashing, setIsFlashing] = useState(false);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundColor =
    accent === "primary"
      ? mode === "dark"
        ? "#4c1d95"
        : "#ddd6fe"
      : accent === "operator"
        ? mode === "dark"
          ? "#172554"
          : "#dbeafe"
        : accent === "equals"
          ? "#2563eb"
          : mode === "dark"
            ? "#18181b"
            : "#f4f4f5";
  const color = accent === "equals" ? "#ffffff" : mode === "dark" ? "#fafafa" : "#000000";
  const rippleColor =
    accent === "equals" ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.12)";
  const handlePress = () => {
    if (flashTimeoutRef.current) {
      clearTimeout(flashTimeoutRef.current);
    }
    setIsFlashing(true);
    flashTimeoutRef.current = setTimeout(() => {
      setIsFlashing(false);
      flashTimeoutRef.current = null;
    }, 110);
    onPress();
  };

  useEffect(
    () => () => {
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current);
      }
    },
    []
  );

  return (
    <Pressable
      accessibilityRole="button"
      android_ripple={{ color: rippleColor, borderless: false }}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.key,
        {
          backgroundColor,
          height: size,
          opacity: pressed || isFlashing ? 0.72 : 1,
          transform: [{ scale: pressed || isFlashing ? 0.91 : 1 }],
          width: size,
        },
      ]}
    >
      {typeof children === "string" ? (
        <Text style={[styles.keyText, { color }]}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

export function CalculatorScreen({ navigation }: CalculatorScreenProps) {
  const { width } = useWindowDimensions();
  const { mode, palette } = useAppTheme();
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [expression, setExpression] = useState("");
  const [result, setResult] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<CalculatorLanguage>(
    LANGUAGE_SELECT_PLACEHOLDER_VALUE
  );
  const [isInWordsOpen, setIsInWordsOpen] = useState(false);
  const [isLanguageDropdownOpen, setIsLanguageDropdownOpen] = useState(false);
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

  const cardWidth = Math.min(width - 8, 456);
  const cardPadding = width < 390 ? 12 : 16;
  const keyGap = width < 390 ? 6 : 8;
  const keySize = Math.floor((cardWidth - cardPadding * 2 - keyGap * 3) / 4);

  useEffect(() => {
    AsyncStorage.getItem(CALCULATOR_LANGUAGE_STORAGE_KEY)
      .then((savedLanguage) => {
        if (
          savedLanguage &&
          LANGUAGE_OPTIONS.some((option) => option.value === savedLanguage)
        ) {
          setLanguage(savedLanguage as NumberWordLanguage);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (language === LANGUAGE_SELECT_PLACEHOLDER_VALUE) {
      AsyncStorage.removeItem(CALCULATOR_LANGUAGE_STORAGE_KEY).catch(
        () => undefined
      );
      return;
    }
    AsyncStorage.setItem(CALCULATOR_LANGUAGE_STORAGE_KEY, language).catch(
      () => undefined
    );
  }, [language]);

  const evaluateWithinRange = useCallback((input: string) => {
    const evaluated = evaluateExpression(input);
    if (!evaluated.ok) {
      return null;
    }
    if (Math.abs(evaluated.result) > CALCULATOR_MAX_SUPPORTED_ABSOLUTE) {
      return null;
    }
    return evaluated.result;
  }, []);

  const previewResult = useMemo(() => {
    const normalizedExpression = expression.trim();
    if (!normalizedExpression) {
      return null;
    }

    const directResult = evaluateWithinRange(normalizedExpression);
    if (directResult !== null) {
      return directResult;
    }

    const fallback = trimIncompleteExpression(normalizedExpression);
    if (!fallback) {
      return null;
    }
    return evaluateWithinRange(fallback);
  }, [evaluateWithinRange, expression]);

  const displayedResult = isGstPanelOpen
    ? (gstPreview ?? previewResult ?? result)
    : (previewResult ?? result);
  const wordsSourceResult = isGstPanelOpen ? (gstPreview ?? result) : result;
  const inWordsSource = wordsSourceResult ?? previewResult;
  const hasEnteredData = expression.trim().length > 0 || result !== null;
  const shouldShowInWords = inWordsSource !== null;

  const words = useMemo(() => {
    if (inWordsSource === null) {
      return null;
    }
    if (language === LANGUAGE_SELECT_PLACEHOLDER_VALUE) {
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

  const closeGstModeForInput = useCallback(() => {
    setIsGstPanelOpen(false);
    setGstBaseValue(null);
    setGstPreview(null);
    setGstSnapshot(null);
  }, []);

  const appendToExpression = useCallback(
    (rawValue: string) => {
      const value = normalizeInput(rawValue);
      if (isGstPanelOpen) {
        closeGstModeForInput();
      }
      setError(null);
      setExpression((current) => {
        let working = current;
        if (!working && startsWithOperator(value)) {
          if (result === null) {
            return working;
          }
          working = toExpressionValue(result);
        }
        if (value === "." && /\.\d*$/.test(working)) {
          return working;
        }
        if (/^[+\-*/%^]$/.test(value) && /[+\-*/%^]$/.test(working)) {
          return `${working.slice(0, -1)}${value}`;
        }
        return `${working}${value}`;
      });
    },
    [closeGstModeForInput, isGstPanelOpen, result]
  );

  const evaluateAndStore = useCallback((input: string) => {
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
  }, []);

  const calculateGstResult = useCallback(
    (baseValue: number, rate: number, modeValue: "include" | "exclude") => {
      if (modeValue === "include") {
        return roundCalculatorResult(baseValue * (1 + rate / 100));
      }
      return roundCalculatorResult((baseValue * 100) / (100 + rate));
    },
    []
  );

  const resolveCurrentValue = useCallback(() => {
    if (previewResult !== null) {
      return previewResult;
    }
    if (result !== null) {
      return result;
    }
    return null;
  }, [previewResult, result]);

  const handleEvaluate = useCallback(() => {
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
  }, [evaluateAndStore, expression, gstPreview, isGstPanelOpen]);

  const handleGst = useCallback(() => {
    if (isGstPanelOpen) {
      return;
    }
    const baseValue = resolveCurrentValue();
    setGstSnapshot({ expression, result, error });
    setGstBaseValue(baseValue);
    setGstPreview(
      baseValue === null ? null : calculateGstResult(baseValue, gstRate, gstMode)
    );
    setIsGstPanelOpen(true);
    setError(null);
  }, [
    calculateGstResult,
    error,
    expression,
    gstMode,
    gstRate,
    isGstPanelOpen,
    resolveCurrentValue,
    result,
  ]);

  const handleCloseGstPanel = useCallback(() => {
    if (gstSnapshot) {
      setExpression(gstSnapshot.expression);
      setResult(gstSnapshot.result);
      setError(gstSnapshot.error);
    }
    setIsGstPanelOpen(false);
    setGstBaseValue(null);
    setGstPreview(null);
    setGstSnapshot(null);
  }, [gstSnapshot]);

  const handleGstModeChange = useCallback(
    (modeValue: "include" | "exclude") => {
      setGstMode(modeValue);
      if (gstBaseValue === null) {
        return;
      }
      setGstPreview(calculateGstResult(gstBaseValue, gstRate, modeValue));
    },
    [calculateGstResult, gstBaseValue, gstRate]
  );

  const handleGstRateChange = useCallback(
    (rate: number) => {
      setGstRate(rate);
      if (gstBaseValue === null) {
        return;
      }
      setGstPreview(calculateGstResult(gstBaseValue, rate, gstMode));
    },
    [calculateGstResult, gstBaseValue, gstMode]
  );

  const handleClear = useCallback(() => {
    setExpression("");
    setResult(null);
    setError(null);
    setIsInWordsOpen(false);
    setIsLanguageDropdownOpen(false);
    setIsGstPanelOpen(false);
    setGstBaseValue(null);
    setGstPreview(null);
    setGstSnapshot(null);
  }, []);

  const handleBackspace = useCallback(() => {
    if (isGstPanelOpen) {
      closeGstModeForInput();
    }
    setError(null);
    setExpression((current) => {
      if (current.endsWith("sqrt(")) {
        return current.slice(0, -5);
      }
      if (current.endsWith("sqrt")) {
        return current.slice(0, -4);
      }
      if (current.endsWith("pi")) {
        return current.slice(0, -2);
      }
      return current.slice(0, -1);
    });
  }, [closeGstModeForInput, isGstPanelOpen]);

  const handleParentheses = useCallback(() => {
    if (isGstPanelOpen) {
      closeGstModeForInput();
    }
    setError(null);
    setExpression((current) => {
      const openCount = (current.match(/\(/g) ?? []).length;
      const closeCount = (current.match(/\)/g) ?? []).length;
      const shouldClose =
        openCount > closeCount && /(?:[0-9)!]|pi)$/.test(current.trim());
      return `${current}${shouldClose ? ")" : "("}`;
    });
  }, [closeGstModeForInput, isGstPanelOpen]);

  const languageLabel =
    language === LANGUAGE_SELECT_PLACEHOLDER_VALUE
      ? "Select Language"
      : (LANGUAGE_OPTIONS.find((option) => option.value === language)?.label ??
        "Select Language");

  return (
    <Screen padded={false} scroll={false} style={styles.screen}>
      <View style={styles.root}>
        <PageHeader
          compact
          leftControl="sidebar"
          onHomePress={() => navigation.navigate("Chat")}
          onSidebarPress={() => setIsSidebarVisible(true)}
          showHomeButton
          title="Calculator"
        />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.calculatorCard,
              {
                backgroundColor: palette.card,
                borderColor: palette.border,
                padding: cardPadding,
                width: cardWidth,
              },
            ]}
          >
            <View
              style={[
                styles.displayPanel,
                {
                  backgroundColor: mode === "dark" ? "#111113" : "#fafafa",
                },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[styles.expressionText, { color: palette.foreground }]}
              >
                {expression ? formatExpressionForDisplay(expression) : "0"}
              </Text>
              <Text
                numberOfLines={1}
                style={[styles.resultText, { color: palette.mutedForeground }]}
              >
                = {displayedResult === null ? "0" : formatNumericResult(displayedResult)}
              </Text>

              {!hasEnteredData ? (
                <Text style={[styles.helperText, { color: palette.mutedForeground }]}>
                  Calculator that converts numbers into words in Khasi and other
                  languages.
                </Text>
              ) : null}

              <View style={styles.wordsArea}>
                {shouldShowInWords ? (
                  isInWordsOpen ? (
                    <>
                      <Text
                        numberOfLines={2}
                        style={[styles.wordsText, { color: palette.foreground }]}
                      >
                        {words}
                      </Text>
                      <View style={styles.languageRow}>
                        <Pressable
                          onPress={() =>
                            setIsLanguageDropdownOpen((current) => !current)
                          }
                          style={[
                            styles.languageSelect,
                            {
                              backgroundColor: palette.background,
                              borderColor: palette.border,
                            },
                          ]}
                        >
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.languageSelectText,
                              { color: palette.foreground },
                            ]}
                          >
                            {languageLabel}
                          </Text>
                          <ChevronDown color={palette.mutedForeground} size={16} />
                        </Pressable>
                        <Pressable
                          accessibilityLabel="Close language selector"
                          onPress={() => {
                            setIsInWordsOpen(false);
                            setIsLanguageDropdownOpen(false);
                          }}
                          style={[
                            styles.closeLanguageButton,
                            {
                              backgroundColor: palette.background,
                              borderColor: palette.border,
                            },
                          ]}
                        >
                          <X color={palette.foreground} size={17} />
                        </Pressable>
                      </View>
                      {isLanguageDropdownOpen ? (
                        <View
                          style={[
                            styles.languageDropdown,
                            {
                              backgroundColor: palette.popover,
                              borderColor: palette.border,
                            },
                          ]}
                        >
                          {[
                            {
                              label: "Select Language",
                              value: LANGUAGE_SELECT_PLACEHOLDER_VALUE,
                            },
                            ...LANGUAGE_OPTIONS,
                          ].map((option) => {
                            const selected = option.value === language;
                            return (
                              <Pressable
                                key={option.value}
                                onPress={() => {
                                  setLanguage(option.value as CalculatorLanguage);
                                  setIsLanguageDropdownOpen(false);
                                }}
                                style={styles.languageOption}
                              >
                                <View style={styles.languageCheckSlot}>
                                  {selected ? (
                                    <Check color={palette.foreground} size={15} />
                                  ) : null}
                                </View>
                                <Text
                                  style={[
                                    styles.languageOptionText,
                                    { color: palette.foreground },
                                  ]}
                                >
                                  {option.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : null}
                    </>
                  ) : (
                    <View style={styles.inWordsButtonRow}>
                      <Pressable
                        onPress={() => setIsInWordsOpen(true)}
                        style={[
                          styles.inWordsButton,
                          {
                            backgroundColor: palette.background,
                            borderColor: palette.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.inWordsText,
                            { color: palette.foreground },
                          ]}
                        >
                          In Words
                        </Text>
                      </Pressable>
                    </View>
                  )
                ) : null}
              </View>
            </View>

            {error ? (
              <Text
                style={[
                  styles.errorText,
                  {
                    backgroundColor: palette.destructiveMuted,
                    color: palette.destructive,
                  },
                ]}
              >
                {error}
              </Text>
            ) : null}

            <View
              style={[
                styles.gstArea,
                isGstPanelOpen ? styles.gstAreaOpen : styles.gstAreaClosed,
              ]}
            >
              {isGstPanelOpen ? (
                <View style={styles.gstPanel}>
                  <Pressable
                    onPress={handleCloseGstPanel}
                    style={[
                      styles.gstClose,
                      { backgroundColor: mode === "dark" ? "#27272a" : "#e4e4e7" },
                    ]}
                  >
                    <X color={palette.mutedForeground} size={16} />
                  </Pressable>
                  <View style={styles.gstOptions}>
                    <Pressable
                      onPress={() =>
                        handleGstModeChange(
                          gstMode === "include" ? "exclude" : "include"
                        )
                      }
                      style={[
                        styles.gstPill,
                        gstMode === "include"
                          ? styles.gstModePillActive
                          : {
                              backgroundColor:
                                mode === "dark" ? "#18181b" : "#f4f4f5",
                            },
                      ]}
                    >
                      <Text
                        style={[
                          styles.gstPillText,
                          gstMode === "include"
                            ? styles.gstActiveText
                            : { color: palette.foreground },
                        ]}
                      >
                        {gstMode === "include" ? "+" : "-"}
                      </Text>
                    </Pressable>
                    {GST_RATE_OPTIONS.map((rate) => (
                      <Pressable
                        key={rate}
                        onPress={() => handleGstRateChange(rate)}
                        style={[
                          styles.gstPill,
                          gstRate === rate
                            ? {
                                backgroundColor:
                                  mode === "dark" ? "#f4f4f5" : "#18181b",
                              }
                            : {
                                backgroundColor:
                                  mode === "dark" ? "#18181b" : "#f4f4f5",
                              },
                        ]}
                      >
                        <Text
                          style={[
                            styles.gstPillText,
                            {
                              color:
                                gstRate === rate
                                  ? mode === "dark"
                                    ? "#18181b"
                                    : "#ffffff"
                                  : palette.foreground,
                            },
                          ]}
                        >
                          {rate}%
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : (
                <Pressable onPress={handleGst} style={styles.gstButton}>
                  <Text style={styles.gstButtonText}>GST</Text>
                </Pressable>
              )}
            </View>

            <View style={[styles.keypad, { gap: keyGap }]}>
              <View style={[styles.keyRow, { gap: keyGap }]}>
                <CalculatorKey accent="primary" onPress={handleClear} size={keySize}>
                  AC
                </CalculatorKey>
                <CalculatorKey
                  accent="operator"
                  onPress={handleParentheses}
                  size={keySize}
                >
                  ()
                </CalculatorKey>
                <CalculatorKey
                  accent="operator"
                  onPress={() => appendToExpression("%")}
                  size={keySize}
                >
                  %
                </CalculatorKey>
                <CalculatorKey
                  accent="operator"
                  onPress={() => appendToExpression("/")}
                  size={keySize}
                >
                  ÷
                </CalculatorKey>
              </View>
              <View style={[styles.keyRow, { gap: keyGap }]}>
                {["7", "8", "9"].map((value) => (
                  <CalculatorKey
                    accent="number"
                    key={value}
                    onPress={() => appendToExpression(value)}
                    size={keySize}
                  >
                    {value}
                  </CalculatorKey>
                ))}
                <CalculatorKey
                  accent="operator"
                  onPress={() => appendToExpression("*")}
                  size={keySize}
                >
                  ×
                </CalculatorKey>
              </View>
              <View style={[styles.keyRow, { gap: keyGap }]}>
                {["4", "5", "6"].map((value) => (
                  <CalculatorKey
                    accent="number"
                    key={value}
                    onPress={() => appendToExpression(value)}
                    size={keySize}
                  >
                    {value}
                  </CalculatorKey>
                ))}
                <CalculatorKey
                  accent="operator"
                  onPress={() => appendToExpression("-")}
                  size={keySize}
                >
                  -
                </CalculatorKey>
              </View>
              <View style={[styles.keyRow, { gap: keyGap }]}>
                {["1", "2", "3"].map((value) => (
                  <CalculatorKey
                    accent="number"
                    key={value}
                    onPress={() => appendToExpression(value)}
                    size={keySize}
                  >
                    {value}
                  </CalculatorKey>
                ))}
                <CalculatorKey
                  accent="operator"
                  onPress={() => appendToExpression("+")}
                  size={keySize}
                >
                  +
                </CalculatorKey>
              </View>
              <View style={[styles.keyRow, { gap: keyGap }]}>
                <CalculatorKey
                  accent="number"
                  onPress={() => appendToExpression("0")}
                  size={keySize}
                >
                  0
                </CalculatorKey>
                <CalculatorKey
                  accent="number"
                  onPress={() => appendToExpression(".")}
                  size={keySize}
                >
                  .
                </CalculatorKey>
                <CalculatorKey
                  accent="number"
                  onPress={handleBackspace}
                  size={keySize}
                >
                  <Delete
                    color={mode === "dark" ? "#fafafa" : "#000000"}
                    size={22}
                    strokeWidth={2}
                  />
                </CalculatorKey>
                <CalculatorKey accent="equals" onPress={handleEvaluate} size={keySize}>
                  =
                </CalculatorKey>
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
      <AppSidebar
        onClose={() => setIsSidebarVisible(false)}
        visible={isSidebarVisible}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  screen: {
    flex: 1,
  },
  scrollContent: {
    alignItems: "center",
    paddingBottom: spacing[4],
  },
  calculatorCard: {
    borderRadius: 24,
    borderWidth: 1,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  displayPanel: {
    borderRadius: radius.xl,
    height: 190,
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    paddingTop: spacing[3],
    position: "relative",
    zIndex: 5,
  },
  expressionText: {
    fontSize: 36,
    fontWeight: "500",
    lineHeight: 43,
    minHeight: 43,
    textAlign: "right",
  },
  resultText: {
    fontSize: 36,
    lineHeight: 43,
    minHeight: 43,
    textAlign: "right",
  },
  helperText: {
    bottom: spacing[4],
    fontSize: 14,
    left: spacing[4],
    lineHeight: 22,
    position: "absolute",
    right: spacing[4],
    textAlign: "center",
  },
  wordsArea: {
    marginTop: 6,
    position: "relative",
    zIndex: 20,
  },
  wordsText: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    marginBottom: 2,
    textAlign: "right",
  },
  inWordsButtonRow: {
    alignItems: "flex-end",
  },
  inWordsButton: {
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: spacing[3],
  },
  inWordsText: {
    fontSize: 14,
    fontWeight: "500",
  },
  languageRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing[2],
    justifyContent: "flex-end",
  },
  languageSelect: {
    alignItems: "center",
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    height: 34,
    justifyContent: "space-between",
    paddingHorizontal: spacing[3],
    width: 190,
  },
  languageSelectText: {
    flex: 1,
    fontSize: 14,
  },
  closeLanguageButton: {
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  languageDropdown: {
    borderRadius: radius.lg,
    borderWidth: 1,
    elevation: 18,
    paddingVertical: spacing[1],
    position: "absolute",
    right: 42,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    top: 56,
    width: 190,
    zIndex: 40,
  },
  languageOption: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 32,
    paddingHorizontal: spacing[3],
  },
  languageCheckSlot: {
    alignItems: "center",
    height: 20,
    justifyContent: "center",
    marginRight: spacing[2],
    width: 18,
  },
  languageOptionText: {
    fontSize: 14,
  },
  errorText: {
    borderRadius: radius.md,
    fontSize: 13,
    marginTop: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  gstArea: {
    justifyContent: "flex-start",
    zIndex: 1,
  },
  gstAreaClosed: {
    height: 62,
    justifyContent: "flex-end",
  },
  gstAreaOpen: {
    height: 62,
  },
  gstButton: {
    alignItems: "center",
    backgroundColor: "#ff940f",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  gstButtonText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
  },
  gstPanel: {
    gap: 6,
  },
  gstClose: {
    alignItems: "center",
    borderRadius: 14,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  gstOptions: {
    flexDirection: "row",
    gap: 8,
  },
  gstPill: {
    alignItems: "center",
    borderRadius: 14,
    flex: 1,
    height: 28,
    justifyContent: "center",
  },
  gstModePillActive: {
    backgroundColor: "#2563eb",
  },
  gstPillText: {
    fontSize: 14,
    fontWeight: "500",
  },
  gstActiveText: {
    color: "#ffffff",
  },
  keypad: {
    zIndex: 0,
  },
  keyRow: {
    flexDirection: "row",
  },
  key: {
    alignItems: "center",
    borderRadius: 999,
    justifyContent: "center",
    overflow: "hidden",
  },
  keyText: {
    fontSize: 31,
    fontWeight: "500",
  },
});
