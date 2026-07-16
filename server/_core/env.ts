export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};

// Fail fast at startup if JWT_SECRET is missing — an empty key causes a
// "Zero-length key is not supported" crypto error deep inside jose/SignJWT,
// which is very hard to diagnose without this guard.
if (!ENV.cookieSecret) {
  throw new Error(
    "[ENV] FATAL: JWT_SECRET is not set or is empty. " +
    "Add JWT_SECRET=<random-64-char-hex> to your .env file and restart the server."
  );
}
