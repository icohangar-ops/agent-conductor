/**
 * Agent Conductor — Skill types.
 *
 * Skills follow the SKILL.md convention (Anthropic skills /
 * awesome-agent-skills): a directory containing SKILL.md with YAML
 * frontmatter (name, description, optional version/tools) and a markdown
 * body of instructions. Progressive disclosure: discovery loads only
 * frontmatter (~100 tokens); the body loads on demand.
 */

/** Where a skill was found. Project scopes shadow personal scopes. */
export type SkillScope = "project" | "personal";

/** Frontmatter-only view of a skill — what discovery returns. */
export interface SkillMetadata {
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly tools: string[];
  readonly scope: SkillScope;
  readonly path: string;
}

/** A fully loaded skill: metadata plus the SKILL.md body. */
export interface LoadedSkill extends SkillMetadata {
  readonly body: string;
}
