# Facturen — factuurprogramma met klantendatabase

Een webapplicatie om klanten te beheren en facturen te maken, gebouwd op
Cloudflare Workers met een D1-database. Inloggen gaat via de meegeleverde
[OpenAuth](https://openauth.js.org/) server (e-mail + wachtwoord); elke
gebruiker ziet alleen zijn eigen klanten en facturen.

## Functies

- **Klantendatabase**: naam, contactpersoon, e-mail, telefoon, adres, BTW- en
  KvK-nummer en interne notities. Zoeken op naam, contact, e-mail of plaats.
  Per klant een overzicht van facturen en het openstaande bedrag.
- **Facturen**: meerdere regels met aantal, prijs (excl. BTW) en BTW-tarief
  (21%, 9% of 0%). Subtotaal, BTW per tarief en totaal worden direct berekend.
- **Automatische factuurnummers**: opeenvolgend per gebruiker, met instelbaar
  voorvoegsel (bijv. `2026-` → `2026-0001`).
- **Status**: concept → verzonden → betaald. Verzonden facturen voorbij de
  vervaldatum worden als *vervallen* gemarkeerd. Alleen concepten kunnen
  worden gewijzigd of verwijderd.
- **Dashboard** met openstaand, vervallen en dit jaar betaald bedrag.
- **Afdrukken / PDF**: nette factuurweergave (`/print/:id`) die je via de
  afdrukfunctie van de browser als PDF opslaat.
- **Instellingen**: je bedrijfsgegevens (afzender), IBAN, betalingstermijn en
  voettekst.

## Structuur

| Bestand | Inhoud |
| --- | --- |
| `src/index.ts` | Routing, OpenAuth server en sessie (cookies) |
| `src/api.ts` | REST API: `/api/customers`, `/api/invoices`, `/api/settings` |
| `src/invoice-math.ts` | Berekening van regels, BTW en totalen (in centen) |
| `src/print.ts` | Afdrukbare factuur (HTML) |
| `src/app.html` | De webinterface (single-page app) |
| `migrations/0002_create_invoicing_tables.sql` | Tabellen voor klanten, facturen en instellingen |

## Lokaal draaien

```bash
npm install
npx wrangler d1 migrations apply AUTH_DB --local
npm run dev
```

Open http://localhost:8787, registreer een account en vul de verificatiecode
in die in de terminal (Worker logs) verschijnt. Stel daarna bij
**Instellingen** je bedrijfsgegevens in.

Voor productie volg je de setup-stappen hieronder; `npm run deploy` voert de
migraties automatisch uit op de remote database. Vervang `sendCode` in
`src/index.ts` door echte e-mailverzending (bijv. Resend) zodat gebruikers hun
verificatiecode per mail krijgen.

---

# OpenAuth Server

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/openauth-template)

![OpenAuth Template Preview](https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/b2ff10c6-8f7c-419f-8757-e2ccf1c84500/public)

<!-- dash-content-start -->

[OpenAuth](https://openauth.js.org/) is a universal provider for managing user authentication. By deploying OpenAuth on Cloudflare Workers, you can add scalable authentication to your application. This demo showcases login, user registration, and password reset, with storage and state powered by [D1](https://developers.cloudflare.com/d1/) and [KV](https://developers.cloudflare.com/kv/).

> [!IMPORTANT]
> When using C3 to create this project, select "no" when it asks if you want to deploy. You need to follow this project's [setup steps](https://github.com/cloudflare/templates/tree/main/openauth-template#setup-steps) before deploying.

<!-- dash-content-end -->

## Getting Started

Outside of this repo, you can start a new project with this template using [C3](https://developers.cloudflare.com/pages/get-started/c3/) (the `create-cloudflare` CLI):

```bash
npm create cloudflare@latest -- --template=cloudflare/templates/openauth-template
```

A live public deployment of this template is available at [https://openauth-template.templates.workers.dev](https://openauth-template.templates.workers.dev)

## Setup Steps

1. Install the project dependencies with a package manager of your choice:
   ```bash
   npm install
   ```
2. Create a [D1 database](https://developers.cloudflare.com/d1/get-started/) with the name "openauth-template-auth-db":
   ```bash
   npx wrangler d1 create openauth-template-auth-db
   ```
   ...and update the `database_id` field in `wrangler.json` with the new database ID.
3. Run the following db migration to initialize the database (notice the `migrations` directory in this project):
   ```bash
   npx wrangler d1 migrations apply --remote openauth-template-auth-db
   ```
4. Create a [kv namespace](https://developers.cloudflare.com/kv/get-started/) with a binding named "AUTH_STORAGE":
   ```bash
   npx wrangler kv namespace create AUTH_STORAGE
   ```
   ...and update the `kv_namespaces` -> `id` field in `wrangler.json` with the new namespace ID.
5. Deploy the project!
   ```bash
   npx wrangler deploy
   ```
