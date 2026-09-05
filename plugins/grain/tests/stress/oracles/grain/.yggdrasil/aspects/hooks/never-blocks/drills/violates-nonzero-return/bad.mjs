export async function main(argv) {
  const cmd = argv[0];
  if (cmd === 'check-hook') {
    const findings = collect();
    if (findings.length) return 2;
    return 0;
  }
  return 1;
}
function collect() { return ['a deviation']; }
