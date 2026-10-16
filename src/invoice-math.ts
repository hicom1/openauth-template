// Berekeningen voor factuurbedragen. Alle bedragen zijn in centen.

export interface LineInput {
  quantity: number;
  unit_price: number;
  vat_rate: number;
}

export interface VatLine {
  rate: number;
  base: number;
  amount: number;
}

export interface Totals {
  subtotal: number;
  vat_amount: number;
  total: number;
  vat_lines: VatLine[];
}

export function lineAmount(item: LineInput): number {
  return Math.round(item.quantity * item.unit_price);
}

// BTW wordt per tarief over het totaal van de regels berekend, zoals
// gebruikelijk op Nederlandse facturen.
export function calculateTotals(items: LineInput[]): Totals {
  const bases = new Map<number, number>();
  let subtotal = 0;
  for (const item of items) {
    const amount = lineAmount(item);
    subtotal += amount;
    bases.set(item.vat_rate, (bases.get(item.vat_rate) ?? 0) + amount);
  }
  const vat_lines = [...bases.entries()]
    .sort(([a], [b]) => b - a)
    .map(([rate, base]) => ({
      rate,
      base,
      amount: Math.round((base * rate) / 100),
    }));
  const vat_amount = vat_lines.reduce((sum, line) => sum + line.amount, 0);
  return { subtotal, vat_amount, total: subtotal + vat_amount, vat_lines };
}

const currency = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
});

export function formatMoney(cents: number): string {
  return currency.format(cents / 100);
}

export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}-${month}-${year}`;
}
