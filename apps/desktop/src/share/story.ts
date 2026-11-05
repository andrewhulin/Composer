import { create } from "zustand";
import { hashOf, type OutputVersion, type TextArtifact } from "@composer/core";
import { prMarkdown, type PrData, type PrototypeData, type StoryData } from "@composer/engine";
import type { StoryProps } from "@composer/renderer";
import { prototypeUrl } from "../prototype/runtime";
import { openPr, rendererDefaultDir, renderStory, type RenderLine } from "../platform/share";
import { toast, useProject } from "../store/project";

/** The latest locked prototype, newest loop first. */
function lockedPrototype(): { version: OutputVersion; data: PrototypeData; artifact: TextArtifact } | null {
  const { versions, blobs } = useProject.getState();
  const v = Object.values(versions)
    .filter((x) => x.phase === "build")
    .sort((a, b) => b.loop - a.loop || b.version - a.version)[0];
  const artifact = v ? (blobs.get(v.contentHash) as TextArtifact | undefined) : undefined;
  return v && artifact?.data ? { version: v, data: artifact.data as PrototypeData, artifact } : null;
}

/** Everything the video needs, from the real project: the whole graph in creation order and the locked prototype. */
export async function storyProps(story: StoryData): Promise<StoryProps> {
  const { graph, project, loop } = useProject.getState();
  const proto = lockedPrototype();
  const src = proto ? await prototypeUrl(hashOf(proto.artifact), proto.data.html) : undefined;
  return {
    story,
    process: {
      nodes: Object.values(graph.nodes).map((n) => ({ id: n.id, kind: n.kind, phase: n.phase, loop: n.loop, title: n.kind === "hypothesis" ? n.alias : n.title, x: n.position.x, y: n.position.y, seq: n.createdSeq })),
      edges: graph.edges.map((e) => ({ from: e.from, to: e.to })),
    },
    prototype: proto ? { html: proto.data.html, ...(src ? { src } : {}) } : null,
    project: { name: project?.name ?? "Untitled problem", loops: loop },
  };
}

interface RenderState {
  line: RenderLine | null;
  running: boolean;
  error?: string;
}

/** Render progress and results per story artifact, so they survive reselecting the node. */
export const useShare = create<{ renders: Record<string, RenderState>; prs: Record<string, string> }>(() => ({ renders: {}, prs: {} }));

const setRender = (key: string, patch: Partial<RenderState>) =>
  useShare.setState((s) => ({ renders: { ...s.renders, [key]: { ...{ line: null, running: false }, ...s.renders[key], ...patch } } }));

export async function rendererDir(): Promise<string | null> {
  const repo = useProject.getState().repo;
  return (await repo?.getSetting<string>("renderer_dir")) || (await rendererDefaultDir());
}

export async function renderRelease(key: string, story: StoryData) {
  const dir = await rendererDir();
  if (!dir) {
    toast("Set the renderer folder in Settings (⌘,) → Share.", "error");
    return;
  }
  setRender(key, { running: true, line: { stage: "voice" }, error: undefined });
  try {
    const props = await storyProps(story);
    const last = await renderStory(key.slice(0, 24), props, dir, (line) => setRender(key, { line }));
    setRender(key, { running: false, line: last });
    toast("Release video rendered", "success");
  } catch (e) {
    setRender(key, { running: false, error: e instanceof Error ? e.message : String(e) });
  }
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "change";

/** What the PR will contain, so the confirm step can say exactly what gets pushed. */
export async function prPlan(pr: PrData, storyKey: string | null) {
  const repo = await useProject.getState().repo?.getSetting<string>("pr_repo");
  const rendered = storyKey ? useShare.getState().renders[storyKey]?.line : null;
  const proto = lockedPrototype();
  const name = slug(pr.title);
  const files = [
    ...(proto ? [{ name: "prototype.html", content: proto.data.html }] : []),
    ...(rendered?.gif ? [{ name: "story.gif", from: rendered.gif }] : []),
    ...(rendered?.poster ? [{ name: "poster.png", from: rendered.poster }] : []),
  ];
  const body = [
    prMarkdown(pr),
    ...(rendered?.gif ? ["", "![Release story]({{raw:story.gif}})"] : []),
    ...(proto ? ["", "Prototype: `prototype.html` in this PR."] : []),
    "",
    "Made with Design Composer.",
  ].join("\n");
  return { repo: repo || null, branch: `composer/${name}`, folder: `design/composer/${name}`, title: pr.title, body, files };
}

export async function openPullRequest(prKey: string, plan: Awaited<ReturnType<typeof prPlan>>) {
  if (!plan.repo) throw new Error("Set the repository for PRs in Settings (⌘,) → Share.");
  const url = await openPr({ ...plan, repo: plan.repo });
  useShare.setState((s) => ({ prs: { ...s.prs, [prKey]: url } }));
  const { repo, project } = useProject.getState();
  if (repo && project) await repo.decide(project.id, "pr_opened", `Opened ${url}`, { url });
  toast("Pull request opened", "success");
  return url;
}
