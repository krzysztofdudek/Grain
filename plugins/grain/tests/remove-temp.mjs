// Shared teardown for a `mkdtempSync` fixture (issue 481): every test that builds one in `tmpdir()` calls
// `removeTemp(dir)` to remove it again, instead of its own bare `rmSync`.
//
// Why: on windows-latest a process that just held a file inside the fixture (git, the grain CLI under test, a
// spawned server) can still be releasing its handle to it the instant the test's teardown runs, so the very first
// `rmSync` can hit `EBUSY: resource busy or locked` or `EPERM` on a directory the OS is a moment from letting go
// of. `maxRetries`/`retryDelay` (already `fs.rmSync`'s own knobs) ride out that window on every OS. But a retry
// budget is still a guess at how long "a moment" is: if the handle outlives even 40 retries at 250ms — a slow
// runner, an antivirus scan holding the file, a child process the test forgot to wait for — the directory is still
// only sitting in the OS temp dir, which the runner wipes on its own after the job. Failing the whole suite over a
// leftover fixture directory the runner was going to delete anyway punishes the wrong thing, so on win32 only, a
// final EBUSY/EPERM/ENOTEMPTY is swallowed (noted on stderr, not silently) rather than thrown. Elsewhere the retry
// budget is already generous for what a real bug would look like, so anything left over there is not "a moment
// longer" — it is a bug, and removeTemp lets it fail the test as `rmSync` always did.
import { rmSync } from 'node:fs';

export function removeTemp(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 40, retryDelay: 250 });
  } catch (err) {
    if (process.platform === 'win32' && ['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(err?.code)) {
      process.stderr.write(`removeTemp: giving up on ${dir} after retries (${err.code}); the OS temp dir is cleaned by the runner anyway\n`);
      return;
    }
    throw err;
  }
}
