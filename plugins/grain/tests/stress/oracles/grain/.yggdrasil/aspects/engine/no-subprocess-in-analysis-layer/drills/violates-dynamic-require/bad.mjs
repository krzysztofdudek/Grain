export async function run(cmd) {
  const cp = await import('node:child_process');
  return cp.spawnSync(cmd);
}
