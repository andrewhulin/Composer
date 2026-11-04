import { invoke } from "@tauri-apps/api/core";
import type { Row, SqlDriver, SqlValue, Statement } from "@composer/data";
import { inTauri } from "./env";

/** rusqlite on one connection, through Tauri commands. */
const tauriDriver: SqlDriver = {
  all: (sql: string, params: SqlValue[] = []) => invoke<Row[]>("db_all", { sql, params }),
  run: (sql: string, params: SqlValue[] = []) => invoke<void>("db_run", { sql, params }),
  tx: (statements: Statement[]) => invoke<void>("db_tx", { statements: statements.map((s) => ({ sql: s.sql, params: s.params ?? [] })) }),
};

/** In the browser preview: SQLite compiled to wasm, persisted to localStorage. Dev only. */
async function browserDriver(): Promise<SqlDriver> {
  const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([import("sql.js"), import("sql.js/dist/sql-wasm.wasm?url")]);
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const KEY = "composer.devdb";
  const saved = localStorage.getItem(KEY);
  const db = saved ? new SQL.Database(Uint8Array.from(atob(saved), (c) => c.charCodeAt(0))) : new SQL.Database();
  db.run("PRAGMA foreign_keys = ON;");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const persist = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const bytes = db.export();
      let s = "";
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      localStorage.setItem(KEY, btoa(s));
    }, 300);
  };
  const exec = (sql: string, params: SqlValue[] = []) => (params.length ? db.run(sql, params) : db.exec(sql));
  return {
    async all(sql, params = []) {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const rows: Row[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as Row);
      stmt.free();
      return rows;
    },
    async run(sql, params = []) {
      exec(sql, params);
      persist();
    },
    async tx(statements) {
      db.exec("BEGIN");
      try {
        for (const s of statements) exec(s.sql, s.params ?? []);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      persist();
    },
  };
}

export async function openDb(): Promise<SqlDriver> {
  return inTauri() ? tauriDriver : browserDriver();
}
