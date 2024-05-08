"use strict";

const { Hono } = require("hono");
const { logger } = require("hono/logger");
const { html } = require("hono/html");
const { HTTPException } = require("hono/http-exception");
const { secureHeaders } = require("hono/secure-headers");
const { env } = require("hono/adapter");
const { serveStatic } = require("@hono/node-server/serve-static");
const { trimTrailingSlash } = require("hono/trailing-slash")
const { githubAuth } = require("@hono/oauth-providers/github"); = require("@hono/oauth-providers/github");
const { getIronSession } = require("iron-session");
const layout = require("./layout");

const indexRouter = require("./routes/index");
const loginRouter = require("./routes/login");
const logoutRouter = require("./routes/logout");

const app = new Hono();

app.use(logger());
app.use(serveStatic({ root: "./public" }));
app.use(secureHeaders());

// セッション管理用のミドルウェア
app.use(async (c, next) => {
  const { SESSION_PASSWORD } = env(c);
  const session = await getIronSession(c.req.raw, c.res, {
    password: SESSION_PASSWORD,
    cookieName: "session",
  });
  c.set("session", session);
  await next();
});

// GitHub 認証
app.use("/auth/github", async (c, next) => {
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = env(c);
  const authHandler = githubAuth({
    client_id: GITHUB_CLIENT_ID,
    client_secret: GITHUB_CLIENT_SECRET,
    scope: ["user:email"],
    oauthApp: true,
  });
  return await authHandler(c, next);
});

// GitHub 認証の後の処理
app.get("/auth/github", async (c) => {
  const session = c.get("session");
  session.user = c.get("user-github");
  await session.save();
  return c.redirect("/");
});

// ルーティング
app.route("/", indexRouter);
app.route("/login", loginRouter);
app.route("/logout", logoutRouter);

// 404 Not Found
app.notFound((c) => {
  return c.html(
    layout(
      c,
      "Not Found",
      html`
        <h1>Not Found</h1>
        <p>${c.req.url} の内容が見つかりませんでした。</p>
      `,
    ),
    404,
  );
});

// エラーハンドリング
app.onError((error, c) => {
  console.error(error);
  const statusCode = error instanceof HTTPException ? error.status : 500;
  const { NODE_ENV } = env(c);
  return c.html(
    layout(
      c,
      "Error",
      html`
        <h1>Error</h1>
        <h2>${error.name} (${statusCode})</h2>
        <p>${error.message}</p>
        ${NODE_ENV === "development" ? html`<pre>${error.stack}</pre>` : ""}
      `,
    ),
    statusCode,
  );
});

module.exports = app;
