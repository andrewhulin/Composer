/** A SQL value as it crosses the driver boundary. */
export type SqlValue = string | number | null;
export type Row = Record<string, SqlValue>;

export interface Statement {
  sql: string;
  params?: SqlValue[];
}

/**
 * The only thing repositories know about storage. The desktop app implements it with rusqlite
 * commands on one connection (so transactions can't split across a pool); tests use node:sqlite.
 */
export interface SqlDriver {
  all(sql: string, params?: SqlValue[]): Promise<Row[]>;
  run(sql: string, params?: SqlValue[]): Promise<void>;
  /** Runs statements atomically: all or nothing. */
  tx(statements: Statement[]): Promise<void>;
}
