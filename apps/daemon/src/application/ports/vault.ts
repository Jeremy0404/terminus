export interface VaultNote {
  readonly path: string;
  readonly content: string;
}

export interface Vault {
  read(path: string): string | null;
  list(directory: string): string[];
  write(notes: readonly VaultNote[], message: string): void;
}
