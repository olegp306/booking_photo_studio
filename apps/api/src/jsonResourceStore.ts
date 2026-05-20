import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

interface JsonResourceStore<T> {
  list: () => Promise<T[]>;
  setAll: (records: T[]) => Promise<void>;
}

const readResourceFile = async <T>(path: string): Promise<T[]> => {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T[];
  } catch {
    return [];
  }
};

export const createJsonResourceStore = <T>(localDataDir: string | undefined, fileName: string): JsonResourceStore<T> => {
  if (!localDataDir?.trim()) {
    let records: T[] = [];

    return {
      list: async () => records,
      setAll: async (updatedRecords) => {
        records = updatedRecords;
      }
    };
  }

  const filePath = join(localDataDir, fileName);

  return {
    list: async () => readResourceFile<T>(filePath),
    setAll: async (records) => {
      await mkdir(localDataDir, { recursive: true });
      await writeFile(filePath, JSON.stringify(records, null, 2), "utf8");
    }
  };
};
