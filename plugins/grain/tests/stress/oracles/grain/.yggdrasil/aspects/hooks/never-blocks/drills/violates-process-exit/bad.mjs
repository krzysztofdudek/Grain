export async function main(argv) {
  const cmd = argv[0];
  if (cmd === 'edit-hook') {
    if (!indexed()) process.exit(1);
    return 0;
  }
  return 1;
}
function indexed() { return false; }
