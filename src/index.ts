import { issuer } from "@openauthjs/openauth";
import { createClient } from "@openauthjs/openauth/client";
import { CloudflareStorage } from "@openauthjs/openauth/storage/cloudflare";
import { PasswordProvider } from "@openauthjs/openauth/provider/password";
import { PasswordUI } from "@openauthjs/openauth/ui/password";
import { createSubjects } from "@openauthjs/openauth/subject";
import { object, string } from "valibot";
import { getInvoice, getSettings, handleApi, HttpError } from "./api";
import { renderInvoice } from "./print";
import appHtml from "./app.html";

// This value should be shared between the OpenAuth server Worker and other
// client Workers that you connect to it, so the types and schema validation are
// consistent.
const subjects = createSubjects({
  user: object({
    id: string(),
  }),
});

const CLIENT_ID = "facturen";
const ACCESS_COOKIE = "access_token";
const REFRESH_COOKIE = "refresh_token";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const auth = createIssuer(env);

    // De factuurapplicatie is een client van de OpenAuth server in dezelfde
    // Worker. Verzoeken van de client naar de issuer gaan rechtstreeks naar
    // de issuer-app, zonder netwerkomweg.
    const client = createClient({
      clientID: CLIENT_ID,
      issuer: url.origin,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) =>
        auth.fetch(new Request(input, init), env, ctx),
    });
    const redirectUri = url.origin + "/callback";

    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      if (!code) return new Response("Ontbrekende code", { status: 400 });
      const exchanged = await client.exchange(code, redirectUri);
      if (exchanged.err) {
        return new Response("Inloggen mislukt: " + exchanged.err.message, {
          status: 400,
        });
      }
      const headers = new Headers({ Location: "/" });
      setTokenCookies(headers, exchanged.tokens.access, exchanged.tokens.refresh);
      return new Response(null, { status: 302, headers });
    }

    if (url.pathname === "/logout") {
      const headers = new Headers({ Location: "/" });
      headers.append("Set-Cookie", clearCookie(ACCESS_COOKIE));
      headers.append("Set-Cookie", clearCookie(REFRESH_COOKIE));
      return new Response(null, { status: 302, headers });
    }

    const isApi = url.pathname.startsWith("/api/");
    const printMatch = url.pathname.match(/^\/print\/(\d+)$/);
    if (url.pathname === "/" || isApi || printMatch) {
      const session = await getSession(request, client);
      if (!session) {
        if (isApi) {
          return Response.json({ error: "Niet ingelogd" }, { status: 401 });
        }
        const { url: authorizeUrl } = await client.authorize(redirectUri, "code");
        return Response.redirect(authorizeUrl, 302);
      }

      let response: Response;
      if (isApi) {
        response = await handleApi(request, env, session.userId);
      } else if (printMatch) {
        response = await printInvoice(env, session.userId, Number(printMatch[1]));
      } else {
        response = new Response(appHtml, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
      if (session.tokens) {
        response = new Response(response.body, response);
        setTokenCookies(response.headers, session.tokens.access, session.tokens.refresh);
      }
      response.headers.set("Cache-Control", "no-store");
      return response;
    }

    // De OpenAuth server (inloggen, registreren, wachtwoord herstellen).
    return auth.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;

function createIssuer(env: Env) {
  return issuer({
    storage: CloudflareStorage({
      namespace: env.AUTH_STORAGE,
    }),
    subjects,
    providers: {
      password: PasswordProvider(
        PasswordUI({
          // eslint-disable-next-line @typescript-eslint/require-await
          sendCode: async (email, code) => {
            // This is where you would email the verification code to the
            // user, e.g. using Resend:
            // https://resend.com/docs/send-with-cloudflare-workers
            console.log(`Sending code ${code} to ${email}`);
          },
          copy: {
            input_code: "Code (check Worker logs)",
          },
        }),
      ),
    },
    theme: {
      title: "Facturen",
      primary: "#0051c3",
      favicon: "https://workers.cloudflare.com//favicon.ico",
      logo: {
        dark: "https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/db1e5c92-d3a6-4ea9-3e72-155844211f00/public",
        light:
          "https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/fa5a3023-7da9-466b-98a7-4ce01ee6c700/public",
      },
    },
    success: async (ctx, value) => {
      return ctx.subject("user", {
        id: await getOrCreateUser(env, value.email),
      });
    },
  });
}

type Client = ReturnType<typeof createClient>;

async function getSession(request: Request, client: Client) {
  const cookies = parseCookies(request.headers.get("Cookie"));
  const access = cookies[ACCESS_COOKIE];
  if (!access) return null;
  const verified = await client.verify(subjects, access, {
    refresh: cookies[REFRESH_COOKIE],
  });
  if (verified.err) return null;
  return { userId: verified.subject.properties.id, tokens: verified.tokens };
}

async function printInvoice(env: Env, userId: string, id: number) {
  try {
    const [invoice, settings] = await Promise.all([
      getInvoice(env.AUTH_DB, userId, id),
      getSettings(env.AUTH_DB, userId),
    ]);
    return new Response(renderInvoice(invoice, settings), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    if (err instanceof HttpError) {
      return new Response(err.message, { status: err.status });
    }
    throw err;
  }
}

function parseCookies(header: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of header?.split(";") ?? []) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

function setTokenCookies(headers: Headers, access: string, refresh: string) {
  const maxAge = 60 * 60 * 24 * 30;
  headers.append("Set-Cookie", cookie(ACCESS_COOKIE, access, maxAge));
  headers.append("Set-Cookie", cookie(REFRESH_COOKIE, refresh, maxAge));
}

function cookie(name: string, value: string, maxAge: number) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearCookie(name: string) {
  return cookie(name, "", 0);
}

async function getOrCreateUser(env: Env, email: string): Promise<string> {
  const result = await env.AUTH_DB.prepare(
    `
		INSERT INTO user (email)
		VALUES (?)
		ON CONFLICT (email) DO UPDATE SET email = email
		RETURNING id;
		`,
  )
    .bind(email)
    .first<{ id: string }>();
  if (!result) {
    throw new Error(`Unable to process user: ${email}`);
  }
  console.log(`Found or created user ${result.id} with email ${email}`);
  return result.id;
}
