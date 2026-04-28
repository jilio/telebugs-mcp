import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import styles from "./oauth.generated.css" with { type: "text" };
import logoTelebugs from "./logo-telebugs.svg" with { type: "text" };

export interface OAuthAuthorizePageParams {
  responseType: string;
  clientId: string;
  redirectUri: string;
  resource: string;
  state?: string;
  codeChallenge: string;
  codeChallengeMethod: "S256" | "plain";
  scope: string;
}

interface OAuthAuthorizePageProps {
  params: OAuthAuthorizePageParams;
  error?: string;
}

function HiddenOAuthFields({ params }: { params: OAuthAuthorizePageParams }) {
  return (
    <>
      <input type="hidden" name="response_type" value={params.responseType} />
      <input type="hidden" name="client_id" value={params.clientId} />
      <input type="hidden" name="redirect_uri" value={params.redirectUri} />
      <input type="hidden" name="resource" value={params.resource} />
      <input type="hidden" name="scope" value={params.scope} />
      <input type="hidden" name="code_challenge" value={params.codeChallenge} />
      <input
        type="hidden"
        name="code_challenge_method"
        value={params.codeChallengeMethod}
      />
      {params.state ? <input type="hidden" name="state" value={params.state} /> : null}
    </>
  );
}

function TelebugsLogo() {
  return (
    <div
      className="logo oauth-logo"
      aria-label="Telebugs"
      dangerouslySetInnerHTML={{ __html: logoTelebugs }}
    />
  );
}

function OAuthAuthorizePage({ params, error }: OAuthAuthorizePageProps) {
  const title = "Sign in to your account";

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <title>{title}</title>
        <style dangerouslySetInnerHTML={{ __html: styles }} />
      </head>
      <body>
        <main id="main" className="marketing-gradient flex min-h-screen flex-col">
          <div className="mx-auto mt-20 max-w-6xl px-4 lg:px-8 space-y-8 flex-grow">
            <div className="flex flex-col items-center gap-y-4">
              <TelebugsLogo />
            </div>

            <section className="card" aria-labelledby="oauth-title">
              <h1 id="oauth-title" className="card__title">
                {title}
              </h1>

              <hr className="my-4" />

              <form method="post" action="/oauth/authorize" autoComplete="on">
                <HiddenOAuthFields params={params} />

                <div className="space-y-4 px-4 pb-6 sm:px-6 w-full sm:max-w-sm">
                  {error ? (
                    <div className="oauth-error rounded-md px-3 py-2 text-sm" role="alert">
                      {error}
                    </div>
                  ) : null}

                  <label className="block">
                    <span className="sr-only">Email address</span>
                    <input
                      className="text-field"
                      type="email"
                      name="email_address"
                      autoComplete="username"
                      autoFocus
                      required
                      placeholder="Enter your email address"
                    />
                  </label>

                  <label className="block">
                    <span className="sr-only">Password</span>
                    <input
                      className="text-field"
                      type="password"
                      name="password"
                      autoComplete="current-password"
                      maxLength={72}
                      required
                      placeholder="Enter your password"
                    />
                  </label>

                  <div className="mt-6">
                    <button className="w-full btn btn--primary" type="submit">
                      Sign in
                    </button>
                  </div>
                </div>
              </form>
            </section>
          </div>
        </main>
      </body>
    </html>
  );
}

export function renderOAuthAuthorizePage(
  params: OAuthAuthorizePageParams,
  error?: string
): string {
  return `<!doctype html>${renderToStaticMarkup(
    <OAuthAuthorizePage params={params} error={error} />
  )}`;
}
