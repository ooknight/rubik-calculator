import { execSync } from 'child_process';
try {
  const out = execSync('netstat -ano | findstr :5173').toString();
  const pids = new Set();
  out.split('\n').forEach((l) => {
    const m = l.trim().split(/\s+/);
    const pid = m[m.length - 1];
    if (pid && /^\d+$/.test(pid)) pids.add(pid);
  });
  pids.forEach((p) => {
    try { process.kill(Number(p), 'SIGKILL'); console.log('killed', p); } catch (e) {}
  });
  console.log('done, pids=', [...pids]);
} catch (e) {
  console.log('no proc on 5173');
}
