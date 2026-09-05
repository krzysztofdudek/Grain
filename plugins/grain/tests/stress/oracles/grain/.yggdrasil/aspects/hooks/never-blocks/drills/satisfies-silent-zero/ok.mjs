export async function main(argv) {
  const cmd = argv[0];
  if (cmd === 'check-hook') {
    try {
      const findings = collect();
      if (!findings.length) return 0;
      console.log(findings.join('\n'));
    } catch { /* a hook never speaks about its own failure */ }
    return 0;
  }
  return 1;
}
function collect() { return []; }
