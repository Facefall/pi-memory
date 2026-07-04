import { MEMORY_SECTIONS } from "../types.js";

const SECTION_HINTS: Record<(typeof MEMORY_SECTIONS)[number], string> = {
  Preferences: "User preferences and defaults.",
  Conventions: "Project or workflow conventions.",
  Findings: "Durable conclusions, decisions, and facts.",
  Todos: "Items to carry forward across sessions.",
};

/** Canonical empty MEMORY.md scaffold (ground truth format). */
export function defaultMemoryTemplate(): string {
  const sections = MEMORY_SECTIONS.map((section) => {
    return `## ${section}\n\n<!-- ${SECTION_HINTS[section]} -->\n`;
  }).join("\n");

  return `# Memory

<!-- pi-memory ground truth — cross-session durable notes for the Pi agent.
     Sections: Preferences | Conventions | Findings | Todos
     User entries: /remember → - [user] text <!-- id:... user ts:... -->
     Line cap: 150; overflow spills to auto-*.md in this directory. -->

${sections}`;
}
