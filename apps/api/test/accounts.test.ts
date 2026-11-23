import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service.ts";
import { FakeClock } from "../src/time/clock.ts";
import { Browser, emailsTo, linkToken, resetDb, testApp, verifiedUser } from "./support.ts";

const clock = new FakeClock();
const app = await testApp({}, { clock });
const db = app.get(PrismaService);
afterAll(() => app.close());
beforeEach(() => resetDb(db));

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const PASSWORD = "senha-boa-123";

describe("sign-up and verification", () => {
  it("emails a one-time link that verifies the address and signs the person in", async () => {
    const browser = new Browser(app);
    const signup = await browser.post("/api/auth/signup", {
      name: " Ana  Souza ",
      email: "Ana@Exemplo.com",
      password: PASSWORD,
    });
    expect(signup.statusCode).toBe(202);
    expect(signup.json()).toEqual({ ok: true });
    expect(browser.cookie).toBeNull();

    const [email] = await emailsTo(app, "ana@exemplo.com");
    expect(email).toMatchObject({ kind: "verify_email", subject: "Confirme seu e-mail no Lance" });
    // The token travels in the fragment, which browsers never send to a server.
    expect(email!.text).toMatch(/http:\/\/localhost:3030\/verificar#t=[\w-]{43}/);

    const verify = await browser.post("/api/auth/verify", {
      token: await linkToken(app, "ana@exemplo.com", "verify_email"),
    });
    expect(verify.statusCode).toBe(200);
    expect(verify.json()).toMatchObject({ name: "Ana Souza", email: "ana@exemplo.com", emailVerified: true });
    expect(verify.cookies.find((c) => c.name === "lance_session")).toMatchObject({
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
    });
    expect((await browser.get("/api/me")).json()).toMatchObject({ name: "Ana Souza", client: null });
  });

  it("answers the same for an address that already has an account, and tells its owner", async () => {
    const { email } = await verifiedUser(app);
    const again = await new Browser(app).post("/api/auth/signup", {
      name: "Outra Pessoa",
      email,
      password: "outra-senha-456",
    });
    expect(again.statusCode).toBe(202);
    expect(again.json()).toEqual({ ok: true });
    expect((await emailsTo(app, email)).map((e) => e.kind)).toEqual(["verify_email", "signup_existing"]);
    expect(await db.user.count()).toBe(1);
  });

  it("lets two sign-ups for one address race: one account, both answered alike", async () => {
    const answers = await Promise.all(
      [1, 2].map(() =>
        new Browser(app).post("/api/auth/signup", { name: "Ana", email: "ana@x.com", password: PASSWORD }),
      ),
    );
    expect(answers.map((a) => a.statusCode)).toEqual([202, 202]);
    expect(await db.user.count()).toBe(1);
  });

  it("uses a link once, even when clicked twice at the same moment", async () => {
    await new Browser(app).post("/api/auth/signup", { name: "Ana", email: "ana@x.com", password: PASSWORD });
    const token = await linkToken(app, "ana@x.com", "verify_email");
    const clicks = await Promise.all([1, 2].map(() => new Browser(app).post("/api/auth/verify", { token })));
    expect(clicks.map((c) => c.statusCode).sort()).toEqual([200, 400]);
    expect(await db.session.count()).toBe(1);
  });

  it("refuses an expired link, and a new one can be asked for", async () => {
    const browser = new Browser(app);
    await browser.post("/api/auth/signup", { name: "Ana", email: "ana@x.com", password: PASSWORD });
    const old = await linkToken(app, "ana@x.com", "verify_email");
    clock.advance(49 * HOUR);
    const late = await browser.post("/api/auth/verify", { token: old });
    expect(late.statusCode).toBe(400);
    expect(late.json().error.code).toBe("invalid_link");

    expect((await browser.post("/api/auth/resend-verification", { email: "ana@x.com" })).statusCode).toBe(
      202,
    );
    const fresh = await linkToken(app, "ana@x.com", "verify_email");
    expect((await browser.post("/api/auth/verify", { token: fresh })).statusCode).toBe(200);
  });

  it("sends nothing for an unknown address, with the same answer", async () => {
    const browser = new Browser(app);
    expect((await browser.post("/api/auth/resend-verification", { email: "nobody@x.com" })).json()).toEqual({
      ok: true,
    });
    expect((await browser.post("/api/auth/forgot-password", { email: "nobody@x.com" })).json()).toEqual({
      ok: true,
    });
    expect(await emailsTo(app, "nobody@x.com")).toEqual([]);
  });
});

describe("signing in", () => {
  it("needs the right password and a verified address", async () => {
    await new Browser(app).post("/api/auth/signup", { name: "Ana", email: "ana@x.com", password: PASSWORD });
    const browser = new Browser(app);
    const unverified = await browser.post("/api/auth/login", { email: "ana@x.com", password: PASSWORD });
    expect(unverified.statusCode).toBe(403);
    expect(unverified.json().error.code).toBe("unverified");

    const wrong = await browser.post("/api/auth/login", { email: "ana@x.com", password: "errada-123" });
    const unknown = await browser.post("/api/auth/login", { email: "nobody@x.com", password: PASSWORD });
    // An unknown address and a wrong password look the same.
    expect(wrong.statusCode).toBe(401);
    expect(unknown.json()).toEqual(wrong.json());
    expect(browser.cookie).toBeNull();
  });

  it("signs in, out, and the old cookie stops working", async () => {
    const { email } = await verifiedUser(app);
    const browser = new Browser(app);
    const login = await browser.post("/api/auth/login", { email: email.toUpperCase(), password: PASSWORD });
    expect(login.statusCode).toBe(200);
    const cookie = browser.cookie;
    expect((await browser.get("/api/me")).statusCode).toBe(200);

    expect((await browser.post("/api/auth/logout")).statusCode).toBe(204);
    expect(browser.cookie).toBeNull();
    browser.cookie = cookie;
    const after = await browser.get("/api/me");
    expect(after.statusCode).toBe(401);
    expect(after.json().error.code).toBe("unauthenticated");
  });

  it("locks an address after five wrong passwords, from any address, for a while", async () => {
    const { email } = await verifiedUser(app);
    for (let attempt = 0; attempt < 5; attempt++) {
      const wrong = await new Browser(app).post("/api/auth/login", { email, password: "errada-123" });
      expect(wrong.statusCode).toBe(401);
    }
    const locked = await new Browser(app).post("/api/auth/login", { email, password: PASSWORD });
    expect(locked.statusCode).toBe(429);
    expect(locked.headers["retry-after"]).toBe("900");

    clock.advance(15 * 60_000);
    expect((await new Browser(app).post("/api/auth/login", { email, password: PASSWORD })).statusCode).toBe(
      200,
    );
  });

  it("limits sign-ups per client address", async () => {
    const browser = new Browser(app);
    const answers = [];
    for (let n = 0; n < 6; n++) {
      answers.push(
        (await browser.post("/api/auth/signup", { name: "Ana", email: `a${n}@x.com`, password: PASSWORD }))
          .statusCode,
      );
    }
    expect(answers).toEqual([202, 202, 202, 202, 202, 429]);
  });

  it("keeps an active session alive and ends an idle one after 30 days", async () => {
    const { browser } = await verifiedUser(app);
    clock.advance(16 * DAY);
    const renewed = await browser.get("/api/me");
    expect(renewed.statusCode).toBe(200);
    expect(renewed.cookies.some((c) => c.name === "lance_session")).toBe(true);

    clock.advance(29 * DAY);
    expect((await browser.get("/api/me")).statusCode).toBe(200);
    clock.advance(31 * DAY);
    expect((await browser.get("/api/me")).statusCode).toBe(401);
  });

  it("turns a suspended account away, session included", async () => {
    const { browser, me } = await verifiedUser(app);
    await db.user.update({ where: { id: me.id }, data: { suspendedAt: clock.now() } });
    expect((await browser.get("/api/me")).statusCode).toBe(401);
  });
});

describe("password reset", () => {
  it("sets a new password, ends every other session, and signs in", async () => {
    const { browser: elsewhere, email } = await verifiedUser(app);
    const browser = new Browser(app);
    expect((await browser.post("/api/auth/forgot-password", { email })).statusCode).toBe(202);
    const token = await linkToken(app, email, "reset_password");
    expect((await emailsTo(app, email)).at(-1)!.text).toContain("/redefinir-senha#t=");

    const reset = await browser.post("/api/auth/reset-password", { token, password: "nova-senha-789" });
    expect(reset.statusCode).toBe(200);
    expect((await browser.get("/api/me")).statusCode).toBe(200);
    expect((await elsewhere.get("/api/me")).statusCode).toBe(401);

    const old = await new Browser(app).post("/api/auth/login", { email, password: PASSWORD });
    expect(old.statusCode).toBe(401);
    const fresh = await new Browser(app).post("/api/auth/login", { email, password: "nova-senha-789" });
    expect(fresh.statusCode).toBe(200);
    expect(
      (await browser.post("/api/auth/reset-password", { token, password: "outra-senha-000" })).statusCode,
    ).toBe(400);
  });

  it("expires after an hour", async () => {
    const { email } = await verifiedUser(app);
    const browser = new Browser(app);
    await browser.post("/api/auth/forgot-password", { email });
    const token = await linkToken(app, email, "reset_password");
    clock.advance(HOUR + 1);
    expect(
      (await browser.post("/api/auth/reset-password", { token, password: "nova-senha-789" })).statusCode,
    ).toBe(400);
  });
});

describe("requests", () => {
  it("that change something must come from the web app", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: "https://elsewhere.example" },
      payload: { email: "ana@x.com", password: PASSWORD },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("forbidden_origin");
    const noOrigin = await app.inject({ method: "POST", url: "/api/auth/signup", payload: {} });
    expect(noOrigin.statusCode).toBe(403);
  });

  it("are checked with the shared schemas, naming the fields only", async () => {
    const response = await new Browser(app).post("/api/auth/signup", {
      name: "A",
      email: "x",
      password: "1",
    });
    expect(response.statusCode).toBe(400);
    expect(
      response
        .json()
        .error.fields.map((f: { path: string }) => f.path)
        .sort(),
    ).toEqual(["email", "name", "password"]);
    expect(response.body).not.toContain('"1"');
  });
});
