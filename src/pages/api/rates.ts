
import type { APIRoute } from "astro";

export const prerender = false;

const BASE_CURRENCY = "MYR";
const API_BASE_URL = "https://v6.exchangerate-api.com/v6";

// ExchangeRate-API's Free rates update once per day.
// Keep a short in-memory cache as an additional safeguard.
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

interface ExchangeRateApiResponse {
  result: string;
  base_code?: string;
  time_last_update_utc?: string;
  time_next_update_utc?: string;
  conversion_rates?: Record<string, number>;
  "error-type"?: string;
}

interface CachedRates {
  data: {
    base: string;
    rates: Record<string, number>;
    lastUpdated: string | null;
    nextUpdate: string | null;
  };
  expiresAt: number;
}

// A warm server instance may reuse this cache.
// It is not shared across all Vercel serverless instances.
let cachedRates: CachedRates | undefined;

export const GET: APIRoute = async () => {
  const now = Date.now();

  if (cachedRates && now < cachedRates.expiresAt) {
    return Response.json(cachedRates.data, {
      headers: {
        "Cache-Control":
          "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  }

  const apiKey = import.meta.env.EXCHANGERATE_API_KEY;

  if (!apiKey) {
    return Response.json(
      { error: "Exchange rate service is not configured." },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/${encodeURIComponent(apiKey)}/latest/${BASE_CURRENCY}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!response.ok) {
      throw new Error(`Upstream API returned HTTP ${response.status}`);
    }

    const result =
      (await response.json()) as ExchangeRateApiResponse;

    if (
      result.result !== "success" ||
      result.base_code !== BASE_CURRENCY ||
      !result.conversion_rates ||
      typeof result.conversion_rates !== "object"
    ) {
      throw new Error("Invalid exchange rate response.");
    }

    const rates = result.conversion_rates;

    // Reject malformed data rather than serving unreliable rates.
    if (
      !Object.values(rates).every(
        (rate) => typeof rate === "number" &&
          Number.isFinite(rate) &&
          rate > 0,
      ) ||
      rates[BASE_CURRENCY] !== 1
    ) {
      throw new Error("Invalid exchange rate values.");
    }

    const data = {
      base: BASE_CURRENCY,
      rates,
      lastUpdated: result.time_last_update_utc ?? null,
      nextUpdate: result.time_next_update_utc ?? null,
    };

    cachedRates = {
      data,
      expiresAt: now + CACHE_TTL_MS,
    };

    return Response.json(data, {
      headers: {
        "Cache-Control":
          "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    // Don't expose the API key, upstream response or internal error.
    console.error("Exchange rate request failed:", error);

    return Response.json(
      { error: "Unable to retrieve exchange rates. Please try again later." },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
};