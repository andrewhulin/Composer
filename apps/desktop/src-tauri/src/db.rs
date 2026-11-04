//! SQLite on one connection. Repositories in TypeScript send SQL through these commands; keeping a
//! single connection means a transaction's statements can never land on different connections.

use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{params_from_iter, Connection};
use serde::Deserialize;
use serde_json::{Map, Value};
use std::sync::Mutex;
use tauri::State;

pub struct Db(pub Mutex<Connection>);

impl Db {
    pub fn open(path: &std::path::Path) -> rusqlite::Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;")?;
        Ok(Db(Mutex::new(conn)))
    }
}

#[derive(Deserialize)]
pub struct Stmt {
    sql: String,
    #[serde(default)]
    params: Vec<Value>,
}

fn to_sql(v: &Value) -> SqlValue {
    match v {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(i64::from(*b)),
        Value::Number(n) => n.as_i64().map(SqlValue::Integer).unwrap_or_else(|| SqlValue::Real(n.as_f64().unwrap_or(0.0))),
        Value::String(s) => SqlValue::Text(s.clone()),
        other => SqlValue::Text(other.to_string()),
    }
}

fn from_sql(v: ValueRef) -> Value {
    match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::from(i),
        ValueRef::Real(f) => Value::from(f),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(b) => Value::String(String::from_utf8_lossy(b).into_owned()),
    }
}

fn exec(conn: &Connection, sql: &str, params: &[Value]) -> rusqlite::Result<()> {
    if params.is_empty() {
        conn.execute_batch(sql)
    } else {
        conn.execute(sql, params_from_iter(params.iter().map(to_sql))).map(|_| ())
    }
}

/// Runs a query and returns rows as JSON objects keyed by column name.
#[tauri::command]
pub async fn db_all(db: State<'_, Db>, sql: String, params: Vec<Value>) -> Result<Vec<Map<String, Value>>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let names: Vec<String> = stmt.column_names().map(|s| s.to_string()).collect();
    let rows = stmt
        .query_map(params_from_iter(params.iter().map(to_sql)), |row| {
            let mut obj = Map::new();
            for (i, name) in names.iter().enumerate() {
                obj.insert(name.clone(), from_sql(row.get_ref(i)?));
            }
            Ok(obj)
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Runs one statement (or a batch of parameterless statements).
#[tauri::command]
pub async fn db_run(db: State<'_, Db>, sql: String, params: Vec<Value>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    exec(&conn, &sql, &params).map_err(|e| e.to_string())
}

/// Runs statements atomically: all of them commit, or none do.
#[tauri::command]
pub async fn db_tx(db: State<'_, Db>, statements: Vec<Stmt>) -> Result<(), String> {
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for s in &statements {
        exec(&tx, &s.sql, &s.params).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}
