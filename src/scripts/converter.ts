import { currencies } from '../data/currencies';
import { convertAmount } from '../lib/conversion';

interface RatesResponse {
  base: string;
  rates: Record<string, number>;
  lastUpdated: string | null;
  nextUpdate: string | null;
}

interface CachedRates {
  data: RatesResponse;
  savedAt: number;
}

const RATES_CACHE_KEY = 'currency-converter-rates-v1';
const FAVOURITES_KEY = 'currency-converter-favourites-v1';
const LOCAL_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_FAVOURITES = 10;

const amountInput = document.querySelector<HTMLInputElement>('#amount')!;
const fromSelect = document.querySelector<HTMLSelectElement>('#from-currency')!;
const toSelect = document.querySelector<HTMLSelectElement>('#to-currency')!;
const swapButton = document.querySelector<HTMLButtonElement>('#swap-currencies')!;
const convertedAmount = document.querySelector<HTMLElement>('#converted-amount')!;
const rateLine = document.querySelector<HTMLElement>('#rate-line')!;
const statusMessage = document.querySelector<HTMLElement>('#status-message')!;
const rateUpdated = document.querySelector<HTMLElement>('#rate-updated')!;
const rateStatusPill = document.querySelector<HTMLElement>('#rate-status-pill')!;
const rateStatusLabel = document.querySelector<HTMLElement>('#rate-status-label')!;
const favouriteList = document.querySelector<HTMLElement>('#favourite-list')!;
const toggleFavouriteButton = document.querySelector<HTMLButtonElement>('#toggle-favourite')!;

if (
  !amountInput || !fromSelect || !toSelect || !swapButton || !convertedAmount ||
  !rateLine || !statusMessage || !rateUpdated || !rateStatusPill ||
  !rateStatusLabel || !favouriteList || !toggleFavouriteButton
) {
  throw new Error('Currency converter markup is incomplete.');
}

let ratesData: RatesResponse | null = null;
let favourites = readFavourites();

function readFavourites(): string[] {
  try {
    const raw = localStorage.getItem(FAVOURITES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const knownCodes = new Set(currencies.map((currency) => currency.code));
    return [...new Set(parsed.filter((code): code is string => typeof code === 'string' && knownCodes.has(code)))].slice(0, MAX_FAVOURITES);
  } catch {
    return [];
  }
}

function saveFavourites(): void {
  try {
    localStorage.setItem(FAVOURITES_KEY, JSON.stringify(favourites));
  } catch {
    setStatus('Favourites could not be saved in this browser.', 'warning');
  }
}

function readCachedRates(): CachedRates | null {
  try {
    const raw = localStorage.getItem(RATES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedRates;
    if (!parsed || typeof parsed.savedAt !== 'number' || !parsed.data?.rates) return null;
    if (!Number.isFinite(parsed.savedAt)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveCachedRates(data: RatesResponse): void {
  try {
    const cached: CachedRates = { data, savedAt: Date.now() };
    localStorage.setItem(RATES_CACHE_KEY, JSON.stringify(cached));
  } catch {
    // The converter can still work when browser storage is unavailable.
  }
}

function setStatus(message: string, state: 'normal' | 'success' | 'warning' = 'normal'): void {
  statusMessage.textContent = message;
  statusMessage.dataset.state = state;
}

function currencyName(code: string): string {
  return currencies.find((currency) => currency.code === code)?.name ?? code;
}

function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
  }
}

function formatRate(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 6,
    minimumFractionDigits: 2,
  }).format(value);
}

function formatUpdateTime(value: string | null): string {
  if (!value) return 'Update time not provided by the rate service.';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Update time not available.';
  return `Rates updated ${new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date)} UTC`;
}

function updateRateStatus(label: string, state: 'loading' | 'ready' | 'error'): void {
  rateStatusLabel.textContent = label;
  rateStatusPill.dataset.state = state;
}

function renderFavourites(): void {
  favouriteList.replaceChildren();

  if (favourites.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'empty-favourites';
    empty.textContent = 'Your saved currencies will appear here.';
    favouriteList.append(empty);
  } else {
    for (const code of favourites) {
      const currency = currencies.find((item) => item.code === code);
      if (!currency) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'favourite-chip';
      button.textContent = `${currency.flag} ${currency.code}`;
      button.title = `Convert to ${currency.name}`;
      button.addEventListener('click', () => {
        fromSelect.value = code;
        render();
      });
      favouriteList.append(button);
    }
  }

  const targetIsFavourite = favourites.includes(fromSelect.value);
  toggleFavouriteButton.textContent = targetIsFavourite ? '★ Remove target' : '☆ Add target';
  toggleFavouriteButton.disabled = !targetIsFavourite && favourites.length >= MAX_FAVOURITES;
  toggleFavouriteButton.title = toggleFavouriteButton.disabled
    ? 'Remove a favourite before adding another (maximum 10).'
    : targetIsFavourite ? 'Remove the selected target from favourites' : 'Save the selected target currency';
}

function render(): void {
  const amount = amountInput.value.trim() === '' ? Number.NaN : Number(amountInput.value);
  const from = fromSelect.value;
  const to = toSelect.value;

  renderFavourites();

  if (!Number.isFinite(amount) || amount < 0) {
    convertedAmount.textContent = 'Enter a valid amount';
    rateLine.textContent = 'Use zero or a positive number.';
    return;
  }

  if (!ratesData) {
    convertedAmount.textContent = '—';
    rateLine.textContent = 'Waiting for exchange rates…';
    return;
  }

  const result = convertAmount(amount, from, to, ratesData.rates);
  const fromRate = ratesData.rates[from];
  const toRate = ratesData.rates[to];

  if (result === null || !Number.isFinite(result) || !Number.isFinite(fromRate) || !Number.isFinite(toRate)) {
    convertedAmount.textContent = 'Rate unavailable';
    rateLine.textContent = 'Try another currency or refresh the rates later.';
    return;
  }

  convertedAmount.textContent = formatMoney(result, to);
  const oneUnitRate = toRate / fromRate;
  rateLine.textContent = `1 ${from} = ${formatRate(oneUnitRate)} ${to}`;
  rateUpdated.textContent = formatUpdateTime(ratesData.lastUpdated);
}

function validateRatesResponse(value: unknown): value is RatesResponse {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<RatesResponse>;
  if (data.base !== 'MYR' || !data.rates || typeof data.rates !== 'object') return false;
  const rates = data.rates as Record<string, unknown>;
  return rates.MYR === 1 && Object.values(rates).every((rate) => typeof rate === 'number' && Number.isFinite(rate) && rate > 0);
}

async function loadRates(): Promise<void> {
  const cached = readCachedRates();
  const hasUsableCache = cached !== null && validateRatesResponse(cached.data);

  if (cached && hasUsableCache && Date.now() - cached.savedAt < LOCAL_CACHE_TTL_MS) {
    ratesData = cached.data;
    updateRateStatus('Cached rates', 'ready');
    setStatus('Showing recently saved rates while checking for an update.', 'normal');
    render();
  } else {
    updateRateStatus('Loading rates', 'loading');
    setStatus('Retrieving the latest available exchange rates…');
  }

  try {
    const response = await fetch('/api/rates', {
      headers: { Accept: 'application/json' },
    });
    const payload: unknown = await response.json();

    if (!response.ok || !validateRatesResponse(payload)) {
      throw new Error('The rate service returned an invalid response.');
    }

    ratesData = payload;
    saveCachedRates(payload);
    updateRateStatus('Rates ready', 'ready');
    setStatus('Exchange rates loaded successfully.', 'success');
    render();
  } catch {
    if (ratesData) {
      updateRateStatus('Using saved rates', 'ready');
      setStatus('Could not refresh rates. Showing previously saved rates instead.', 'warning');
      render();
    } else {
      updateRateStatus('Rates unavailable', 'error');
      setStatus('Unable to load exchange rates. Check your connection and try refreshing the page.', 'warning');
      convertedAmount.textContent = 'Rates unavailable';
      rateLine.textContent = 'The converter will work once rates can be loaded.';
    }
  }
}

amountInput.addEventListener('input', render);
fromSelect.addEventListener('change', render);
toSelect.addEventListener('change', render);

swapButton.addEventListener('click', () => {
  const previousFrom = fromSelect.value;
  fromSelect.value = toSelect.value;
  toSelect.value = previousFrom;
  render();
});

document.querySelectorAll<HTMLButtonElement>('[data-amount]').forEach((button) => {
  button.addEventListener('click', () => {
    amountInput.value = button.dataset.amount ?? '1';
    render();
    amountInput.focus();
  });
});

toggleFavouriteButton.addEventListener('click', () => {
  const target = fromSelect.value;
  if (favourites.includes(target)) {
    favourites = favourites.filter((code) => code !== target);
    saveFavourites();
    renderFavourites();
    return;
  }

  if (favourites.length >= MAX_FAVOURITES) {
    setStatus('You can save up to 10 favourite currencies. Remove one first.', 'warning');
    return;
  }

  favourites = [...favourites, target];
  saveFavourites();
  renderFavourites();
  setStatus(`${target} added to your favourites.`, 'success');
});

renderFavourites();
void loadRates();
