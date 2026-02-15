import {
  CALCULATOR_MAX_SUPPORTED_ABSOLUTE,
  CALCULATOR_RESULT_PRECISION,
} from "@/lib/calculator/constants";
import { roundCalculatorResult } from "@/lib/calculator/evaluator";

export type NumberWordLanguage =
  | "khasi"
  | "english"
  | "english_ind"
  | "hindi";

type NumberWordConfig = {
  numberingSystem: "indian" | "international";
  zero: string;
  minus: string;
  point: string;
  digits: string[];
  hundred: string;
  thousand: string;
  lakh?: string;
  crore?: string;
  million?: string;
  billion?: string;
  below100: (value: number) => string;
};

const ENGLISH_BELOW_20 = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];

const ENGLISH_TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];

const KHASI_DIGITS = [
  "nod",
  "wei",
  "ar",
  "lai",
  "saw",
  "san",
  "hynriew",
  "hyniew",
  "phra",
  "khyndai",
];

const KHASI_BELOW_20 = [
  "nod",
  "wei",
  "ar",
  "lai",
  "saw",
  "san",
  "hynriew",
  "hyniew",
  "phra",
  "khyndai",
  "shiphew",
  "khatwei",
  "khatar",
  "khatlai",
  "khatsaw",
  "khatsan",
  "khathynriew",
  "khathyniew",
  "khatphra",
  "khatkhyndai",
];

const KHASI_TENS = [
  "",
  "",
  "arphew",
  "laiphew",
  "sawphew",
  "sanphew",
  "hynriewphew",
  "hyniewphew",
  "phraphew",
  "khyndaiphew",
];

const HINDI_BELOW_100 = [
  "शून्य",
  "एक",
  "दो",
  "तीन",
  "चार",
  "पांच",
  "छह",
  "सात",
  "आठ",
  "नौ",
  "दस",
  "ग्यारह",
  "बारह",
  "तेरह",
  "चौदह",
  "पंद्रह",
  "सोलह",
  "सत्रह",
  "अठारह",
  "उन्नीस",
  "बीस",
  "इक्कीस",
  "बाईस",
  "तेईस",
  "चौबीस",
  "पच्चीस",
  "छब्बीस",
  "सत्ताईस",
  "अट्ठाईस",
  "उनतीस",
  "तीस",
  "इकतीस",
  "बत्तीस",
  "तैंतीस",
  "चौंतीस",
  "पैंतीस",
  "छत्तीस",
  "सैंतीस",
  "अड़तीस",
  "उनतालीस",
  "चालीस",
  "इकतालीस",
  "बयालीस",
  "तैंतालीस",
  "चवालीस",
  "पैंतालीस",
  "छियालीस",
  "सैंतालीस",
  "अड़तालीस",
  "उनचास",
  "पचास",
  "इक्यावन",
  "बावन",
  "तिरपन",
  "चौवन",
  "पचपन",
  "छप्पन",
  "सत्तावन",
  "अट्ठावन",
  "उनसठ",
  "साठ",
  "इकसठ",
  "बासठ",
  "तिरसठ",
  "चौंसठ",
  "पैंसठ",
  "छियासठ",
  "सड़सठ",
  "अड़सठ",
  "उनहत्तर",
  "सत्तर",
  "इकहत्तर",
  "बहत्तर",
  "तिहत्तर",
  "चौहत्तर",
  "पचहत्तर",
  "छिहत्तर",
  "सतहत्तर",
  "अठहत्तर",
  "उन्नासी",
  "अस्सी",
  "इक्यासी",
  "बयासी",
  "तिरासी",
  "चौरासी",
  "पचासी",
  "छियासी",
  "सतासी",
  "अट्ठासी",
  "नवासी",
  "नब्बे",
  "इक्यानवे",
  "बानवे",
  "तिरानवे",
  "चौरानवे",
  "पंचानवे",
  "छियानवे",
  "सत्तानवे",
  "अट्ठानवे",
  "निन्यानवे",
];

const ENGLISH_INDIAN_CONFIG: NumberWordConfig = {
  numberingSystem: "indian",
  zero: "zero",
  minus: "minus",
  point: "point",
  digits: ENGLISH_BELOW_20.slice(0, 10),
  hundred: "hundred",
  thousand: "thousand",
  lakh: "lakh",
  crore: "crore",
  below100(value) {
    if (value < 20) {
      return ENGLISH_BELOW_20[value];
    }
    const tensPart = Math.floor(value / 10);
    const unitPart = value % 10;
    if (unitPart === 0) {
      return ENGLISH_TENS[tensPart];
    }
    return `${ENGLISH_TENS[tensPart]} ${ENGLISH_BELOW_20[unitPart]}`;
  },
};

const ENGLISH_INTERNATIONAL_CONFIG: NumberWordConfig = {
  numberingSystem: "international",
  zero: "zero",
  minus: "minus",
  point: "point",
  digits: ENGLISH_BELOW_20.slice(0, 10),
  hundred: "hundred",
  thousand: "thousand",
  million: "million",
  billion: "billion",
  below100(value) {
    if (value < 20) {
      return ENGLISH_BELOW_20[value];
    }
    const tensPart = Math.floor(value / 10);
    const unitPart = value % 10;
    if (unitPart === 0) {
      return ENGLISH_TENS[tensPart];
    }
    return `${ENGLISH_TENS[tensPart]} ${ENGLISH_BELOW_20[unitPart]}`;
  },
};

const KHASI_CONFIG: NumberWordConfig = {
  numberingSystem: "indian",
  zero: "nod",
  minus: "minus",
  point: "point",
  digits: KHASI_DIGITS,
  hundred: "spah",
  thousand: "hajar",
  lakh: "lakh",
  crore: "klur",
  below100(value) {
    if (value < 20) {
      return KHASI_BELOW_20[value];
    }
    const tensPart = Math.floor(value / 10);
    const unitPart = value % 10;
    if (unitPart === 0) {
      return KHASI_TENS[tensPart];
    }
    return `${KHASI_TENS[tensPart]} ${KHASI_DIGITS[unitPart]}`;
  },
};

const HINDI_CONFIG: NumberWordConfig = {
  numberingSystem: "indian",
  zero: "शून्य",
  minus: "माइनस",
  point: "दशमलव",
  digits: HINDI_BELOW_100.slice(0, 10),
  hundred: "सौ",
  thousand: "हजार",
  lakh: "लाख",
  crore: "करोड़",
  below100(value) {
    return HINDI_BELOW_100[value];
  },
};

function formatRoundedNumber(value: number) {
  const rounded = roundCalculatorResult(value, CALCULATOR_RESULT_PRECISION);
  if (Object.is(rounded, -0)) {
    return "0";
  }
  return rounded.toFixed(CALCULATOR_RESULT_PRECISION).replace(/\.?0+$/, "");
}

function convertBelow1000(value: number, config: NumberWordConfig): string {
  if (value < 100) {
    return config.below100(value);
  }

  const hundredsPart = Math.floor(value / 100);
  const remainder = value % 100;
  const hundredPrefix =
    config === KHASI_CONFIG && hundredsPart === 1
      ? "shi"
      : config.digits[hundredsPart];
  const hundredPhrase = `${hundredPrefix} ${config.hundred}`;

  if (remainder === 0) {
    return hundredPhrase;
  }
  return `${hundredPhrase} ${config.below100(remainder)}`;
}

function convertIntegerToIndianWords(value: number, config: NumberWordConfig) {
  if (value === 0) {
    return config.zero;
  }

  const segments: string[] = [];
  let remaining = value;

  const crorePart = Math.floor(remaining / 10_000_000);
  remaining %= 10_000_000;
  if (crorePart > 0) {
    const crorePrefix =
      config === KHASI_CONFIG && crorePart === 1
        ? "shi"
        : convertBelow1000(crorePart, config);
    segments.push(`${crorePrefix} ${config.crore}`);
  }

  const lakhPart = Math.floor(remaining / 100_000);
  remaining %= 100_000;
  if (lakhPart > 0) {
    const lakhPrefix =
      config === KHASI_CONFIG && lakhPart === 1
        ? "shi"
        : convertBelow1000(lakhPart, config);
    segments.push(`${lakhPrefix} ${config.lakh}`);
  }

  const thousandPart = Math.floor(remaining / 1_000);
  remaining %= 1_000;
  if (thousandPart > 0) {
    const thousandPrefix =
      config === KHASI_CONFIG && thousandPart === 1
        ? "shi"
        : convertBelow1000(thousandPart, config);
    segments.push(
      `${thousandPrefix} ${config.thousand}`
    );
  }

  if (remaining > 0) {
    segments.push(convertBelow1000(remaining, config));
  }

  return segments.join(" ");
}

function convertIntegerToInternationalWords(
  value: number,
  config: NumberWordConfig
) {
  if (value === 0) {
    return config.zero;
  }

  const segments: string[] = [];
  let remaining = value;

  const billionPart = Math.floor(remaining / 1_000_000_000);
  remaining %= 1_000_000_000;
  if (billionPart > 0) {
    segments.push(`${convertBelow1000(billionPart, config)} ${config.billion}`);
  }

  const millionPart = Math.floor(remaining / 1_000_000);
  remaining %= 1_000_000;
  if (millionPart > 0) {
    segments.push(`${convertBelow1000(millionPart, config)} ${config.million}`);
  }

  const thousandPart = Math.floor(remaining / 1_000);
  remaining %= 1_000;
  if (thousandPart > 0) {
    segments.push(
      `${convertBelow1000(thousandPart, config)} ${config.thousand}`
    );
  }

  if (remaining > 0) {
    segments.push(convertBelow1000(remaining, config));
  }

  return segments.join(" ");
}

function getConfig(language: NumberWordLanguage): NumberWordConfig {
  if (language === "english_ind") {
    return ENGLISH_INDIAN_CONFIG;
  }
  if (language === "english") {
    return ENGLISH_INTERNATIONAL_CONFIG;
  }
  if (language === "khasi") {
    return KHASI_CONFIG;
  }
  if (language === "hindi") {
    return HINDI_CONFIG;
  }
  return ENGLISH_INTERNATIONAL_CONFIG;
}

export function formatNumericResult(value: number) {
  const rounded = roundCalculatorResult(value, CALCULATOR_RESULT_PRECISION);
  return rounded.toLocaleString("en-IN", {
    maximumFractionDigits: CALCULATOR_RESULT_PRECISION,
  });
}

export function convertNumberToWords(
  value: number,
  language: NumberWordLanguage
) {
  if (!Number.isFinite(value)) {
    throw new Error("Result is outside supported numeric range.");
  }

  const normalized = formatRoundedNumber(value);
  const isNegative = normalized.startsWith("-");
  const absoluteText = isNegative ? normalized.slice(1) : normalized;
  const [integerText, decimalText = ""] = absoluteText.split(".");
  const integerValue = Number.parseInt(integerText, 10);

  if (Math.abs(integerValue) > CALCULATOR_MAX_SUPPORTED_ABSOLUTE) {
    throw new Error(
      "Result is out of supported range. Limit is 99,99,99,999."
    );
  }

  const config = getConfig(language);
  const integerWords =
    config.numberingSystem === "international"
      ? convertIntegerToInternationalWords(integerValue, config)
      : convertIntegerToIndianWords(integerValue, config);
  const decimalWords =
    decimalText.length > 0
      ? `${config.point} ${decimalText
          .split("")
          .map((digit) => config.digits[Number.parseInt(digit, 10)])
          .join(" ")}`
      : "";

  const signPrefix = isNegative ? `${config.minus} ` : "";

  return `${signPrefix}${integerWords}${decimalWords ? ` ${decimalWords}` : ""}`
    .replaceAll(/\s+/g, " ")
    .trim();
}
