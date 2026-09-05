// source/no-raw-control-bytes (advisory, errs: under)
//
// A raw C0 control byte in a source file makes git treat the file as binary: it stops diffing and the
// corruption slips past review untouched by typecheck, lint or tests. Tab (0x09), line feed (0x0A) and
// carriage return (0x0D) are the three that belong in text; everything else in 0x00-0x1F does not.
//
// The runner hands each file's decoded content as a string. Every C0 code point is a single UTF-8 byte
// whose value equals the code point, and a lone 0x00-0x1F byte is always valid single-byte UTF-8 that
// survives decoding intact, so scanning charCodeAt over that range IS a raw-byte scan of it: a hit is a
// provable violation, never an approximation.
//
// Reports the FIRST offending byte per file and stops there: a byte-corrupted file is usually corrupt
// throughout, one anchored report is enough to act on, and a re-run catches any residue after the fix.

const ALLOWED = new Set([0x09, 0x0a, 0x0d]);

export function check(ctx) {
  const violations = [];

  for (const file of ctx.files) {
    const content = file.content;
    for (let i = 0; i < content.length; i++) {
      const code = content.charCodeAt(i);
      if (code > 0x1f || ALLOWED.has(code)) continue;

      let line = 1;
      for (let j = 0; j < i; j++) if (content.charCodeAt(j) === 0x0a) line++;

      violations.push({
        file: file.path,
        line,
        column: 0,
        message:
          `Raw control byte 0x${code.toString(16).padStart(2, '0')} in the source text.\n` +
          `git treats a file containing one as binary, so it stops diffing and the corruption is ` +
          `invisible to review, to the type checker and to the tests.\n` +
          `Replace the raw byte with its escape (for example \\u0001 or \\0 inside a string literal), or delete it.`,
      });
      break;
    }
  }

  return violations;
}
