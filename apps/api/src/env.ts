import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface RuntimeConfig {
  apiPort?: string;
  envFile: string;
  openaiApiKey?: string;
  openaiListingModel?: string;
  publicAppUrl?: string;
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

const hasValue = (value?: string) => Boolean(value?.trim());

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
    envFile,
    openaiApiKey: source.OPENAI_API_KEY,
    openaiListingModel: source.OPENAI_LISTING_MODEL,
    publicAppUrl: source.PUBLIC_APP_URL,
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

export const hasConfiguredOpenAi = (config: RuntimeConfig) => hasValue(config.openaiApiKey);
