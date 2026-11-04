import { DatabaseSync } from "node:sqlite";
import type { Row, SqlDriver, SqlValue, Statement } from "./driver";

/** node:sqlite adapter for tests and scripts. */
export function nodeSqliteDriver(path = ":memory:"): SqlDriver & { close(): void } {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON;");
  return {
    async all(sql: string, params: SqlValue[] = []) {
      return db.prepare(sql).all(...params) as Row[];
    },
    async run(sql: string, params: SqlValue[] = []) {
      if (params.length) db.prepare(sql).run(...params);
      else db.exec(sql);
    },
    async tx(statements: Statement[]) {
      db.exec("BEGIN");
      try {
        for (const s of statements) {
          if (s.params?.length) db.prepare(s.sql).run(...s.params);
          else db.exec(s.sql);
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    close: () => db.close(),
  };
}
