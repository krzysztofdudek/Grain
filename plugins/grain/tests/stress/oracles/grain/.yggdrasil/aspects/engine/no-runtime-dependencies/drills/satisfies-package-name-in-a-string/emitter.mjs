// The proposal writer emits rule scripts as TEXT; that text contains imports of the host's helpers.
export const template = body => `import { walk, report } from '@chrisdudek/yg/ast';\n${body}`;
