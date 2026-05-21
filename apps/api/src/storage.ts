import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { extname, parse } from "node:path";

export interface UploadOwnerMediaInput {
  ownerId: string;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
}

export interface UploadedOwnerMedia {
  storageKey: string;
  publicUrl: string;
}

export interface StorageService {
  uploadOwnerMedia(input: UploadOwnerMediaInput): Promise<UploadedOwnerMedia>;
}

export interface StorageTestDeps {
  publicBaseUrl: string;
  putObject(object: { key: string; body: Buffer; contentType: string }): Promise<void>;
}

export interface R2StorageConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
}

const slugFileName = (fileName: string) => {
  const parsed = parse(fileName);
  const base = parsed.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "media";
  return `${base}${extname(fileName).toLowerCase()}`;
};

export function createStorageService(deps: StorageTestDeps): StorageService {
  const publicBaseUrl = deps.publicBaseUrl.replace(/\/$/, "");

  return {
    async uploadOwnerMedia(input) {
      const storageKey = `owners/${input.ownerId}/${randomUUID()}-${slugFileName(input.fileName)}`;
      await deps.putObject({
        key: storageKey,
        body: input.bytes,
        contentType: input.mimeType
      });

      return {
        storageKey,
        publicUrl: `${publicBaseUrl}/${storageKey}`
      };
    }
  };
}

export function createR2StorageService(config: R2StorageConfig): StorageService {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });

  return createStorageService({
    publicBaseUrl: config.publicBaseUrl,
    async putObject(object) {
      await client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: object.key,
        Body: object.body,
        ContentType: object.contentType
      }));
    }
  });
}
