import { cache } from "react";
import { fetchWithTimeout } from "@/lib/utils/async";

export type ExchangeRateResult = {
  rate: number;
  fetchedAt: Date;
};

const DEFAULT_RATE = 83.0;
const EXCHANGE_RATE_TAG = "exchange-rate-usd-inr";
const EXCHANGE_RATE_TIMEOUT_MS = 2500;
let lastSuccessfulRate: ExchangeRateResult | null = null;

type ExchangeProvider = {
  name: string;
  getUrl: () => string | null;
  parse: (json: unknown) => {
    rate?: number;
    timestamp?: string | number | Date | null;
  };
};

const providers: ExchangeProvider[] = [
  {
    name: "custom-endpoint",
    getUrl: () => process.env.EXCHANGE_RATE_API_URL ?? null,
    parse: (json) => extractStandardProvider(json),
  },
  {
    name: "exchange-rate-api",
    getUrl: () => {
      const key = process.env.EXCHANGE_RATE_API_KEY;
      return key
        ? `https://v6.exchangerate-api.com/v6/${key}/latest/USD`
        : null;
    },
    parse: (json) => extractStandardProvider(json),
  },
  {
    name: "open-er-api",
    getUrl: () => "https://open.er-api.com/v6/latest/USD",
    parse: (json) => {
      if (!json || typeof json !== "object") {
        return {};
      }
      const payload = json as {
        result?: string;
        rates?: Record<string, number>;
        time_last_update_utc?: string;
      };
      if (payload.result !== "success") {
        return {};
      }
      return {
        rate: payload.rates?.INR,
        timestamp: payload.time_last_update_utc ?? null,
      };
    },
  },
  {
    name: "exchangerate-host",
    getUrl: () => "https://api.exchangerate.host/latest?base=USD&symbols=INR",
    parse: (json) => extractStandardProvider(json),
  },
];

function extractStandardProvider(json: unknown) {
  if (!json || typeof json !== "object") {
    return {};
  }

  const payload = json as {
    rates?: Record<string, number>;
    time_last_update_utc?: string;
    date?: string;
    timestamp?: number;
  };

  return {
    rate: payload.rates?.INR,
    timestamp:
      payload.time_last_update_utc ??
      payload.date ??
      (typeof payload.timestamp === "number"
        ? new Date(payload.timestamp * 1000).toISOString()
        : null),
  };
}

async function fetchUsdToInr(): Promise<ExchangeRateResult> {
  for (const provider of providers) {
    const url = provider.getUrl();
    if (!url) {
      continue;
    }

    try {
      const response = await fetchWithTimeout(
        url,
        {
          next: { revalidate: 300, tags: [EXCHANGE_RATE_TAG] },
        },
        EXCHANGE_RATE_TIMEOUT_MS
      );

      if (!response.ok) {
        throw new Error(`${provider.name} responded with ${response.status}`);
      }

      const json = (await response.json()) as unknown;
      const { rate: rawRate, timestamp } = provider.parse(json);

      if (
        typeof rawRate === "number" &&
        Number.isFinite(rawRate) &&
        rawRate > 0
      ) {
        const result: ExchangeRateResult = {
          rate: rawRate,
          fetchedAt: timestamp ? new Date(timestamp) : new Date(),
        };
        lastSuccessfulRate = result;
        return {
          ...result,
        };
      }

      throw new Error(`${provider.name} payload missing INR rate`);
    } catch (error) {
      console.warn(
        `[exchange-rate] Provider "${provider.name}" failed, falling back.`,
        error
      );
    }
  }

  if (lastSuccessfulRate) {
    console.warn(
      "[exchange-rate] All providers failed. Reusing last successful USD→INR rate."
    );
    return {
      rate: lastSuccessfulRate.rate,
      fetchedAt: new Date(),
    };
  }

  console.error(
    "[exchange-rate] All providers failed. Falling back to default USD→INR rate."
  );
  return {
    rate: DEFAULT_RATE,
    fetchedAt: new Date(),
  };
}

export const getUsdToInrRate = cache(fetchUsdToInr);

export function getExchangeRateCacheTag() {
  return EXCHANGE_RATE_TAG;
}

export function getFallbackUsdToInrRate() {
  return lastSuccessfulRate?.rate ?? DEFAULT_RATE;
}
