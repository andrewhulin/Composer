import type { SqlDriver, Statement } from "./driver";

/**
 * Schema migrations, applied in order. Kept as TS strings so the webview bundle and node tests
 * load the exact same SQL. Never edit a shipped migration; add a new one.
 */
export const MIGRATIONS: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: "init",
    sql: `
CREATE TABLE blob (
  hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  size INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE asset (
  hash TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE project (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active_phase TEXT NOT NULL DEFAULT 'understand',
  loop INTEGER NOT NULL DEFAULT 1,
  branch_id TEXT,
  seq INTEGER NOT NULL DEFAULT 0,
  working_manifest TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE branch (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id),
  name TEXT NOT NULL,
  head_snapshot_id TEXT,
  forked_from_snapshot_id TEXT,
  state TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);
CREATE TABLE snapshot (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id),
  branch_id TEXT NOT NULL REFERENCES branch(id),
  parent_id TEXT,
  seq INTEGER NOT NULL,
  manifest_hash TEXT NOT NULL,
  kind TEXT NOT NULL,
  cause_id TEXT,
  label TEXT,
  phase TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX snapshot_branch_seq ON snapshot(branch_id, seq);
CREATE INDEX snapshot_project_seq ON snapshot(project_id, seq);
CREATE TABLE bookmark (
  snapshot_id TEXT PRIMARY KEY REFERENCES snapshot(id),
  label TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE run (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id),
  node_id TEXT NOT NULL,
  recipe TEXT NOT NULL,
  status TEXT NOT NULL,
  local_key TEXT NOT NULL,
  env_key TEXT NOT NULL,
  input_manifest_hash TEXT,
  prompt_hash TEXT,
  report_hash TEXT,
  output_hash TEXT,
  stop_reason TEXT,
  model TEXT NOT NULL,
  effort TEXT NOT NULL,
  template_version_id TEXT,
  rule_ids TEXT NOT NULL DEFAULT '[]',
  foundation_ids TEXT NOT NULL DEFAULT '[]',
  usage TEXT,
  error TEXT,
  started_seq INTEGER NOT NULL,
  ended_seq INTEGER,
  started_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE INDEX run_node ON run(node_id, started_seq);
CREATE INDEX run_template ON run(template_version_id);
CREATE TABLE output_version (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id),
  family_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  loop INTEGER NOT NULL,
  version INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  run_id TEXT,
  snapshot_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (family_id, version)
);
CREATE TABLE hypothesis_block (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id),
  label TEXT NOT NULL,
  parent_id TEXT,
  statement TEXT NOT NULL,
  vars TEXT NOT NULL,
  status TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  note TEXT,
  snapshot_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE prompt_template (
  id TEXT PRIMARY KEY,
  recipe TEXT NOT NULL,
  version INTEGER NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  proposal_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (recipe, version)
);
CREATE TABLE craft_rule (
  id TEXT PRIMARY KEY,
  lineage_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  version INTEGER NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  proposal_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE foundation_version (
  id TEXT PRIMARY KEY,
  slot TEXT NOT NULL,
  version TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  changelog TEXT,
  parent_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (slot, version)
);
CREATE TABLE proposal (
  id TEXT PRIMARY KEY,
  target_kind TEXT NOT NULL,
  target_id TEXT,
  base_version TEXT,
  diff_hash TEXT NOT NULL,
  rationale TEXT NOT NULL,
  evidence TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',
  resolved_version_id TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE TABLE score (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES run(id),
  value INTEGER NOT NULL,
  criterion TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX score_run ON score(run_id);
CREATE TABLE decision (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  kind TEXT NOT NULL,
  statement TEXT NOT NULL,
  payload TEXT,
  snapshot_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE link (
  from_kind TEXT NOT NULL,
  from_id TEXT NOT NULL,
  rel TEXT NOT NULL,
  to_kind TEXT NOT NULL,
  to_id TEXT NOT NULL,
  PRIMARY KEY (from_kind, from_id, rel, to_kind, to_id)
);
CREATE INDEX link_to ON link(to_kind, to_id);
CREATE TABLE token_count (
  hash TEXT NOT NULL,
  model_family TEXT NOT NULL,
  tokens INTEGER NOT NULL,
  PRIMARY KEY (hash, model_family)
);
CREATE TABLE setting (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`,
  },
  {
    id: 2,
    name: "evals",
    sql: `
CREATE TABLE pick (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  phase TEXT NOT NULL,
  winner_run_id TEXT NOT NULL REFERENCES run(id),
  loser_run_id TEXT NOT NULL REFERENCES run(id),
  source TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX pick_phase ON pick(phase);
CREATE TABLE replay_case (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  phase TEXT NOT NULL,
  recipe TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES run(id),
  name TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  output_hash TEXT NOT NULL,
  retired INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX replay_case_run ON replay_case(run_id);
CREATE TABLE replay_result (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES proposal(id),
  case_id TEXT NOT NULL REFERENCES replay_case(id),
  output_hash TEXT,
  status TEXT NOT NULL,
  error TEXT,
  pick TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX replay_result_proposal ON replay_result(proposal_id);
`,
  },
  {
    id: 3,
    name: "project_archive",
    sql: `
ALTER TABLE project ADD COLUMN archived_at TEXT;
`,
  },
  {
    id: 4,
    name: "skills",
    sql: `
CREATE TABLE skill (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  author TEXT,
  source TEXT NOT NULL,
  kind TEXT NOT NULL,
  mode TEXT NOT NULL,
  version INTEGER NOT NULL,
  body_hash TEXT NOT NULL,
  files TEXT NOT NULL DEFAULT '[]',
  tokens INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  phases TEXT NOT NULL DEFAULT '[]',
  ref TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX skill_source ON skill(source);
CREATE TABLE skill_version (
  skill_id TEXT NOT NULL REFERENCES skill(id),
  version INTEGER NOT NULL,
  body_hash TEXT NOT NULL,
  files TEXT NOT NULL DEFAULT '[]',
  ref TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (skill_id, version)
);
`,
  },
];

/** Applies pending migrations. Each migration runs in one transaction. */
export async function migrate(db: SqlDriver): Promise<number[]> {
  await db.run("CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
  const done = new Set((await db.all("SELECT id FROM schema_migrations")).map((r) => Number(r.id)));
  const applied: number[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    const statements: Statement[] = m.sql
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((sql) => ({ sql }));
    statements.push({ sql: "INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)", params: [m.id, m.name, new Date().toISOString()] });
    await db.tx(statements);
    applied.push(m.id);
  }
  return applied;
}
