/**
 * Agent Conductor — SKILL.md loader.
 *
 * Discovers skills across the directory conventions used by the major
 * agent tools, parses frontmatter for metadata, and loads full bodies on
 * demand. Frontmatter parsing covers the YAML subset the SKILL.md
 * ecosystem actually uses (string scalars and inline/dash lists) to keep
 * the dependency surface at zero.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { LoadedSkill, SkillMetadata, SkillScope } from "./types.ts";

/** Skill directories, in shadowing order (first hit wins per skill name). */
export function skillRoots(projectRoot: string): Array<{ dir: string; scope: SkillScope }> {
  const home = homedir();
  return [
    { dir: join(projectRoot, ".conductor", "skills"), scope: "project" },
    { dir: join(projectRoot, ".claude", "skills"), scope: "project" },
    { dir: join(projectRoot, ".cursor", "skills"), scope: "project" },
    { dir: join(home, ".claude", "skills"), scope: "personal" },
    { dir: join(home, ".cursor", "skills"), scope: "personal" },
  ];
}

// ─── Frontmatter ─────────────────────────────────────────────────────────────

export interface Frontmatter {
  readonly fields: Record<string, string | string[]>;
  readonly body: string;
}

/** Parse `---` frontmatter: string scalars, inline `[a, b]` and dash lists. */
export function parseFrontmatter(text: string): Frontmatter {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { fields: {}, body: text };

  const fields: Record<string, string | string[]> = {};
  let currentListKey: string | null = null;

  for (const line of match[1].split("\n")) {
    const dashItem = line.match(/^\s+-\s+(.*)$/);
    if (dashItem && currentListKey) {
      (fields[currentListKey] as string[]).push(unquote(dashItem[1]));
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, raw] = kv;
    if (raw === "") {
      fields[key] = [];
      currentListKey = key;
    } else if (raw.startsWith("[") && raw.endsWith("]")) {
      fields[key] = raw
        .slice(1, -1)
        .split(",")
        .map((s) => unquote(s))
        .filter((s) => s !== "");
      currentListKey = null;
    } else {
      fields[key] = unquote(raw);
      currentListKey = null;
    }
  }
  return { fields, body: match[2].trim() };
}

function unquote(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "");
}

// ─── Discovery ───────────────────────────────────────────────────────────────

function readSkillDir(dir: string, skillName: string, scope: SkillScope): SkillMetadata | null {
  const skillPath = join(dir, skillName, "SKILL.md");
  if (!existsSync(skillPath)) return null;
  const { fields } = parseFrontmatter(readFileSync(skillPath, "utf8"));
  const asString = (v: string | string[] | undefined, fallback: string) =>
    typeof v === "string" ? v : fallback;
  const asList = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
  return {
    name: asString(fields["name"], skillName),
    description: asString(fields["description"], ""),
    version: asString(fields["version"], "0.0.0"),
    tools: asList(fields["tools"] ?? fields["allowed-tools"]),
    scope,
    path: skillPath,
  };
}

/** Discover all skills visible from a project root. Metadata only. */
export function discoverSkills(projectRoot: string): SkillMetadata[] {
  const found = new Map<string, SkillMetadata>();
  for (const { dir, scope } of skillRoots(projectRoot)) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const metadata = readSkillDir(dir, entry.name, scope);
      if (metadata && !found.has(metadata.name)) found.set(metadata.name, metadata);
    }
  }
  return Array.from(found.values());
}

/** Load a skill's full body — the on-demand half of progressive disclosure. */
export function loadSkill(metadata: SkillMetadata): LoadedSkill {
  const { body } = parseFrontmatter(readFileSync(metadata.path, "utf8"));
  return { ...metadata, body };
}
