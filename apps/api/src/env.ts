import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface RuntimeConfig {
  apiPort?: string;
  databaseUrl?: string;
  emailFrom?: string;
  envFile: string;
  localDataDir?: string;
  manualPaymentMode?: boolean;
  bookingLinkSecret?: string;
  openaiApiKey?: string;
  openaiListingModel?: string;
  publicAppUrl?: string;
  r2AccountId?: string;
  r2AccessKeyId?: string;
  r2SecretAccessKey?: string;
  r2Bucket?: string;
  r2PublicBaseUrl?: string;
  resendApiKey?: string;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  telegramBotToken?: string;
  telegramWebhookSecret?: string;
}

export interface ServiceReadiness {
  configured: boolean;
  env: string;
  label: string;
  missingLabel: string;
  readyLabel: string;
}

export interface LaunchReadiness {
  ok: true;
  envFile: string;
  services: {
    openai: ServiceReadiness;
    telegram: ServiceReadiness;
    publicAppUrl: ServiceReadiness;
    stripe: ServiceReadiness;
  };
  nextSteps: string[];
}

export interface ProductionOnboardingReadiness {
  ok: true;
  envFile: string;
  manualPaymentMode: boolean;
  database: "configured" | "missing";
  email: "configured" | "missing";
  mediaStorage: "configured" | "missing";
  telegram: "configured" | "missing";
  openai: "configured" | "missing";
  nextSteps: string[];
}

const placeholderPatterns = [
  /^replace-with-/i,
  /USER:PASSWORD/i,
  /your-domain\.com/i
];

const isPlaceholderValue = (value?: string) =>
  Boolean(value?.trim()) && placeholderPatterns.some((pattern) => pattern.test(value?.trim() ?? ""));

const hasValue = (value?: string) => Boolean(value?.trim()) && !isPlaceholderValue(value);
const parseBoolean = (value?: string) => value?.trim().toLowerCase() === "true";
const readinessValue = (configured: boolean) => configured ? "configured" as const : "missing" as const;

const parseEnvFile = (content: string) =>
  Object.fromEntries(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const [key, ...valueParts] = line.split("=");
        return [key.trim(), valueParts.join("=").trim().replace(/^['"]|['"]$/g, "")];
      })
  ) as Record<string, string>;

const findEnvFile = (fileName: string) => {
  let current = process.cwd();

  while (true) {
    const candidate = join(current, fileName);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
};

const loadEnvFileValues = () => {
  if (process.env.NODE_ENV === "test") {
    return {
      envFile: ".env.local",
      values: {}
    };
  }

  const localFile = findEnvFile(".env.local");
  const fallbackFile = findEnvFile(".env");
  const filePath = localFile ?? fallbackFile;

  return {
    envFile: localFile ? ".env.local" : fallbackFile ? ".env" : ".env.local",
    values: filePath ? parseEnvFile(readFileSync(filePath, "utf8")) : {}
  };
};

export const loadRuntimeConfig = (overrides: Partial<RuntimeConfig> = {}): RuntimeConfig => {
  const { envFile, values } = loadEnvFileValues();
  const source = {
    ...values,
    ...process.env
  };

  return {
    apiPort: source.API_PORT,
    databaseUrl: source.DATABASE_URL,
    emailFrom: source.EMAIL_FROM,
    envFile,
    localDataDir: source.LOCAL_DATA_DIR,
    manualPaymentMode: source.MANUAL_PAYMENT_MODE === undefined ? true : parseBoolean(source.MANUAL_PAYMENT_MODE),
    bookingLinkSecret: source.BOOKING_LINK_SECRET,
    openaiApiKey: source.OPENAI_API_KEY,
    openaiListingModel: source.OPENAI_LISTING_MODEL,
    publicAppUrl: source.PUBLIC_APP_URL,
    r2AccountId: source.R2_ACCOUNT_ID,
    r2AccessKeyId: source.R2_ACCESS_KEY_ID,
    r2SecretAccessKey: source.R2_SECRET_ACCESS_KEY,
    r2Bucket: source.R2_BUCKET,
    r2PublicBaseUrl: source.R2_PUBLIC_BASE_URL,
    resendApiKey: source.RESEND_API_KEY,
    stripeSecretKey: source.STRIPE_SECRET_KEY,
    stripeWebhookSecret: source.STRIPE_WEBHOOK_SECRET,
    telegramBotToken: source.TELEGRAM_BOT_TOKEN,
    telegramWebhookSecret: source.TELEGRAM_WEBHOOK_SECRET,
    ...overrides
  };
};

export const getLaunchReadiness = (config: RuntimeConfig): LaunchReadiness => {
  const services = {
    openai: {
      configured: hasValue(config.openaiApiKey),
      env: "OPENAI_API_KEY",
      label: "OpenAI listing assistant",
      missingLabel: "Missing OPENAI_API_KEY",
      readyLabel: "OPENAI_API_KEY configured"
    },
    telegram: {
      configured: hasValue(config.telegramBotToken),
      env: "TELEGRAM_BOT_TOKEN",
      label: "Telegram owner bot",
      missingLabel: "Missing TELEGRAM_BOT_TOKEN",
      readyLabel: "TELEGRAM_BOT_TOKEN configured"
    },
    publicAppUrl: {
      configured: hasValue(config.publicAppUrl),
      env: "PUBLIC_APP_URL",
      label: "Public app URL",
      missingLabel: "Missing PUBLIC_APP_URL",
      readyLabel: "PUBLIC_APP_URL configured"
    },
    stripe: {
      configured: hasValue(config.stripeSecretKey),
      env: "STRIPE_SECRET_KEY",
      label: "Stripe payments",
      missingLabel: "Missing STRIPE_SECRET_KEY",
      readyLabel: "STRIPE_SECRET_KEY configured"
    }
  };
  const nextSteps = [
    !services.openai.configured &&
      "Fill OPENAI_API_KEY to switch listing drafts from local fallback to AI generation.",
    !services.telegram.configured &&
      "Fill TELEGRAM_BOT_TOKEN before wiring the owner onboarding bot.",
    !services.publicAppUrl.configured &&
      "Fill PUBLIC_APP_URL so Telegram links can open the web app.",
    !services.stripe.configured &&
      "Fill STRIPE_SECRET_KEY before replacing simulated payment capture."
  ].filter(Boolean) as string[];

  return {
    ok: true,
    envFile: config.envFile,
    services,
    nextSteps
  };
};

export const getProductionOnboardingReadiness = (config: RuntimeConfig): ProductionOnboardingReadiness => {
  const databaseConfigured = hasValue(config.databaseUrl);
  const emailConfigured = hasValue(config.resendApiKey) && hasValue(config.emailFrom);
  const mediaStorageConfigured =
    hasValue(config.r2Bucket) &&
    hasValue(config.r2PublicBaseUrl);
  const telegramConfigured = hasValue(config.telegramBotToken);
  const openaiConfigured = hasValue(config.openaiApiKey);
  const nextSteps = [
    !config.manualPaymentMode && "Set MANUAL_PAYMENT_MODE=true for the cash/direct payment soft launch.",
    !databaseConfigured && "Fill DATABASE_URL for Prisma/PostgreSQL persistence.",
    !emailConfigured && "Fill RESEND_API_KEY and EMAIL_FROM for owner email codes.",
    !mediaStorageConfigured && "Fill Cloudflare R2 settings for owner media uploads.",
    !telegramConfigured && "Fill TELEGRAM_BOT_TOKEN before enabling Telegram owner intake.",
    !openaiConfigured && "Fill OPENAI_API_KEY for AI-assisted owner drafts."
  ].filter(Boolean) as string[];

  return {
    ok: true,
    envFile: config.envFile,
    manualPaymentMode: config.manualPaymentMode === true,
    database: readinessValue(databaseConfigured),
    email: readinessValue(emailConfigured),
    mediaStorage: readinessValue(mediaStorageConfigured),
    telegram: readinessValue(telegramConfigured),
    openai: readinessValue(openaiConfigured),
    nextSteps
  };
};

export const hasConfiguredOpenAi = (config: RuntimeConfig) => hasValue(config.openaiApiKey);
