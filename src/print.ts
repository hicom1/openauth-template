import type { InvoiceDetail, Settings } from "./api";
import { calculateTotals, formatDate, formatMoney, lineAmount } from "./invoice-math";

// Afdrukbare factuur (HTML). Via de afdrukfunctie van de browser kan de
// factuur als PDF worden opgeslagen.

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const nl2br = (value: string) => escapeHtml(value).replaceAll("\n", "<br>");

function formatQuantity(quantity: number): string {
  return quantity.toLocaleString("nl-NL", { maximumFractionDigits: 3 });
}

function formatRate(rate: number): string {
  return `${rate.toLocaleString("nl-NL", { maximumFractionDigits: 2 })}%`;
}

export function renderInvoice(invoice: InvoiceDetail, settings: Settings): string {
  const c = invoice.customer;
  const totals = calculateTotals(invoice.items);
  const companyLines = [
    settings.address,
    [settings.postal_code, settings.city].filter(Boolean).join(" "),
    settings.country,
    settings.email,
    settings.phone,
  ].filter(Boolean);
  const companyIds = [
    settings.coc_number && `KvK: ${settings.coc_number}`,
    settings.vat_number && `BTW-id: ${settings.vat_number}`,
    settings.iban && `IBAN: ${settings.iban}`,
  ].filter(Boolean);
  const customerLines = [
    c.contact_person && `t.a.v. ${c.contact_person}`,
    c.address,
    [c.postal_code, c.city].filter(Boolean).join(" "),
    c.country,
    c.vat_number && `BTW-id: ${c.vat_number}`,
  ].filter(Boolean);

  const rows = invoice.items
    .map(
      (item) => `
        <tr>
          <td>${nl2br(item.description)}</td>
          <td class="num">${formatQuantity(item.quantity)}</td>
          <td class="num">${formatMoney(item.unit_price)}</td>
          <td class="num">${formatRate(item.vat_rate)}</td>
          <td class="num">${formatMoney(lineAmount(item))}</td>
        </tr>`,
    )
    .join("");

  const vatRows = totals.vat_lines
    .map(
      (line) => `
        <tr>
          <td>BTW ${formatRate(line.rate)} over ${formatMoney(line.base)}</td>
          <td class="num">${formatMoney(line.amount)}</td>
        </tr>`,
    )
    .join("");

  const paymentText =
    invoice.status === "betaald"
      ? "Deze factuur is voldaan. Hartelijk dank!"
      : `Wij verzoeken u het totaalbedrag van ${formatMoney(totals.total)} vóór
         ${formatDate(invoice.due_date)} over te maken${
           settings.iban ? ` op rekeningnummer ${escapeHtml(settings.iban)}` : ""
         }${settings.company_name ? ` t.n.v. ${escapeHtml(settings.company_name)}` : ""},
         onder vermelding van factuurnummer ${escapeHtml(invoice.invoice_number)}.`;

  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Factuur ${escapeHtml(invoice.invoice_number)}</title>
<script>if (window.top !== window.self) document.documentElement.classList.add("embedded");</script>
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a1a1a;
         background: #eef0f3; margin: 0; padding: 24px; font-size: 14px; line-height: 1.45; }
  .page { background: #fff; max-width: 820px; margin: 0 auto; padding: 56px 64px;
          box-shadow: 0 2px 12px rgba(0,0,0,.08); }
  .toolbar { max-width: 820px; margin: 0 auto 16px; display: flex; gap: 8px; justify-content: flex-end; }
  .toolbar a, .toolbar button { font: inherit; padding: 8px 14px; border-radius: 6px; border: 1px solid #c9ced6;
         background: #fff; color: #1a1a1a; cursor: pointer; text-decoration: none; }
  .toolbar button { background: #0051c3; border-color: #0051c3; color: #fff; }
  header { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 48px; }
  h1 { font-size: 28px; margin: 0 0 4px; letter-spacing: .02em; }
  .company { text-align: right; }
  .company strong { font-size: 16px; }
  .muted { color: #5b6270; }
  .meta { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 36px; }
  .meta table td { padding: 2px 12px 2px 0; }
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  table.items th { text-align: left; border-bottom: 2px solid #1a1a1a; padding: 8px 6px; font-size: 12px;
                   text-transform: uppercase; letter-spacing: .04em; }
  table.items td { border-bottom: 1px solid #e3e6ea; padding: 8px 6px; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  table.totals { margin-left: auto; min-width: 320px; border-collapse: collapse; }
  table.totals td { padding: 4px 6px; }
  table.totals tr.total td { border-top: 2px solid #1a1a1a; font-weight: 700; font-size: 16px; padding-top: 8px; }
  .notes, .payment { margin-top: 32px; }
  footer { margin-top: 48px; padding-top: 12px; border-top: 1px solid #e3e6ea; font-size: 12px; }
  .stamp { display: inline-block; border: 2px solid #1a7f37; color: #1a7f37; padding: 2px 10px;
           border-radius: 4px; font-weight: 700; text-transform: uppercase; margin-top: 8px; }
  .embedded body { padding: 0; background: transparent; }
  .embedded .toolbar { display: none; }
  @media print {
    body { background: #fff; padding: 0; }
    .page { box-shadow: none; padding: 0; max-width: none; }
    .toolbar { display: none; }
  }
  @media (max-width: 640px) {
    body { padding: 0; }
    .page { padding: 24px 16px; }
    header, .meta { flex-direction: column; }
    .company { text-align: left; }
    table.totals { min-width: 0; width: 100%; }
  }
</style>
</head>
<body>
<div class="toolbar">
  <a href="/#/facturen/${invoice.id}">Terug</a>
  <button onclick="window.print()">Afdrukken / PDF</button>
</div>
<div class="page">
  <header>
    <div>
      <h1>FACTUUR</h1>
      <div class="muted">${escapeHtml(invoice.invoice_number)}</div>
      ${invoice.status === "betaald" ? '<div class="stamp">Betaald</div>' : ""}
    </div>
    <div class="company">
      <strong>${escapeHtml(settings.company_name || "Uw bedrijfsnaam")}</strong><br>
      ${companyLines.map(escapeHtml).join("<br>")}
    </div>
  </header>

  <div class="meta">
    <div>
      <div class="muted">Factuur aan</div>
      <strong>${escapeHtml(c.name)}</strong><br>
      ${customerLines.map((line) => escapeHtml(line)).join("<br>")}
    </div>
    <table>
      <tr><td class="muted">Factuurnummer</td><td>${escapeHtml(invoice.invoice_number)}</td></tr>
      <tr><td class="muted">Factuurdatum</td><td>${formatDate(invoice.issue_date)}</td></tr>
      <tr><td class="muted">Vervaldatum</td><td>${formatDate(invoice.due_date)}</td></tr>
    </table>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th>Omschrijving</th>
        <th class="num">Aantal</th>
        <th class="num">Prijs</th>
        <th class="num">BTW</th>
        <th class="num">Bedrag</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <table class="totals">
    <tr><td>Subtotaal (excl. BTW)</td><td class="num">${formatMoney(totals.subtotal)}</td></tr>
    ${vatRows}
    <tr class="total"><td>Totaal (incl. BTW)</td><td class="num">${formatMoney(totals.total)}</td></tr>
  </table>

  ${invoice.notes ? `<div class="notes">${nl2br(invoice.notes)}</div>` : ""}
  <div class="payment">${paymentText}</div>

  <footer class="muted">
    ${companyIds.map((line) => escapeHtml(line)).join(" &nbsp;·&nbsp; ")}
    ${settings.footer_text ? `<div>${nl2br(settings.footer_text)}</div>` : ""}
  </footer>
</div>
</body>
</html>`;
}
