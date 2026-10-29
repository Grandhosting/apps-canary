// Grandhosting Apps stress-test app. One image, one behaviour per deploy, chosen by STRESS_MODE (set as a deploy
// env var, never by a request). The web endpoints are always on and are capped, so the public URL cannot be used to
// start the abuse modes or to run unbounded work.
//
// STRESS_MODE   what it does after start                                  knobs (env, all optional)
//   web         nothing (default): serves the endpoints below
//   cpu         N threads spin forever                                    STRESS_THREADS (4)
//   mem         allocates and touches memory in steps until killed        STRESS_MEM_MB (2048), STRESS_MEM_STEP_MB (64)
//   disk        writes 32 MB files to /tmp/fill until it fails            STRESS_DISK_MB (4096)
//   fork        starts `sleep 600` children until it fails                STRESS_FORK_MAX (20000)
//   crash       exits with status 1 after a few seconds                   STRESS_CRASH_AFTER (5)
//   unhealthy   /health answers 500 (the deploy must never go live)
//   egress      tries a fixed list of connections once and logs each      STRESS_EGRESS_TARGETS (host:port,...)
//               result; then, only if STRESS_EGRESS_URL is set (our own   STRESS_EGRESS_URL, STRESS_EGRESS_SECONDS (60)
//               load server), downloads it in a loop and logs MB/s
//
// Endpoints: /health, /, /work?ms= (CPU, max 500), /sleep?ms= (max 60000), /sse?s= (max 900), /bytes?kb= (max 1024),
// /stats. Every progress line starts with "stress:" so the test scripts can grep the pod log.
const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Worker } = require('node:worker_threads');

const port = Number(process.env.PORT) || 3000;
const mode = process.env.STRESS_MODE || 'web';
const num = (name, def) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : def;
};
const clamp = (v, max) => Math.max(0, Math.min(Number(v) || 0, max));
const log = (...a) => console.log('stress:', ...a);
const counters = { requests: 0, work: 0, sse: 0, held: 0, forks: 0, memMb: 0, diskMb: 0 };
const started = Date.now();

function spin(ms) {
  const end = Date.now() + ms;
  let x = 0;
  while (Date.now() < end) x += Math.sqrt(x + 1);
  return x;
}

const server = http.createServer((req, res) => {
  counters.requests++;
  const u = new URL(req.url, 'http://localhost');
  const q = (k) => u.searchParams.get(k);
  res.setHeader('cache-control', 'no-store');
  switch (u.pathname) {
    case '/health':
      if (mode === 'unhealthy') {
        res.statusCode = 500;
        return res.end('unhealthy on purpose');
      }
      return res.end('ok');
    case '/':
      res.setHeader('content-type', 'text/plain');
      return res.end(`stress app, mode ${mode}\n`);
    case '/work': {
      counters.work++;
      spin(clamp(q('ms') ?? 50, 500));
      return res.end('done');
    }
    case '/sleep': {
      counters.held++;
      const t = setTimeout(() => {
        counters.held--;
        res.end('slept');
      }, clamp(q('ms') ?? 1000, 60000));
      req.on('close', () => {
        if (!res.writableEnded) {
          clearTimeout(t);
          counters.held--;
        }
      });
      return undefined;
    }
    case '/sse': {
      counters.sse++;
      const secs = clamp(q('s') ?? 60, 900);
      res.writeHead(200, { 'content-type': 'text/event-stream', connection: 'keep-alive' });
      let n = 0;
      const iv = setInterval(() => {
        n += 5;
        res.write(`data: ${n}\n\n`);
        if (n >= secs) {
          clearInterval(iv);
          counters.sse--;
          res.end();
        }
      }, 5000);
      req.on('close', () => {
        if (!res.writableEnded) {
          clearInterval(iv);
          counters.sse--;
        }
      });
      return undefined;
    }
    case '/bytes': {
      res.setHeader('content-type', 'application/octet-stream');
      return res.end(Buffer.alloc(clamp(q('kb') ?? 64, 1024) * 1024, 97));
    }
    case '/stats':
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ mode, uptimeS: Math.round((Date.now() - started) / 1000), rssMb: Math.round(process.memoryUsage().rss / 1048576), ...counters }));
    default:
      res.statusCode = 404;
      return res.end('not found');
  }
});
server.keepAliveTimeout = 65000;
server.listen(port, '0.0.0.0', () => log(`listening on ${port}, mode ${mode}`));

// ---------------------------------------------------------------------------------------------- modes ----------
function modeCpu() {
  const n = num('STRESS_THREADS', 4);
  for (let i = 0; i < n; i++) {
    new Worker('let x=0; for(;;){ x += Math.sqrt(x + 1); }', { eval: true });
  }
  log(`cpu: ${n} threads spinning`);
}

function modeMem() {
  const max = num('STRESS_MEM_MB', 2048);
  const step = num('STRESS_MEM_STEP_MB', 64);
  const hold = [];
  const iv = setInterval(() => {
    if (counters.memMb >= max) {
      clearInterval(iv);
      log(`mem: holding ${counters.memMb} MB (target reached, not killed)`);
      return;
    }
    hold.push(Buffer.alloc(step * 1048576, 1)); // filled, so the pages are really used
    counters.memMb += step;
    log(`mem: ${counters.memMb} MB`);
  }, 1000);
}

function modeDisk() {
  const max = num('STRESS_DISK_MB', 4096);
  const dir = '/tmp/fill';
  fs.mkdirSync(dir, { recursive: true });
  const chunk = Buffer.alloc(32 * 1048576, 1);
  const iv = setInterval(() => {
    if (counters.diskMb >= max) {
      clearInterval(iv);
      log(`disk: holding ${counters.diskMb} MB (target reached, not evicted)`);
      return;
    }
    try {
      fs.writeFileSync(path.join(dir, `f${counters.diskMb}`), chunk);
      counters.diskMb += 32;
      if (counters.diskMb % 128 === 0) log(`disk: ${counters.diskMb} MB`);
    } catch (e) {
      clearInterval(iv);
      log(`disk: write failed at ${counters.diskMb} MB: ${e.code || e.message}`);
    }
  }, 250);
}

function modeFork() {
  const max = num('STRESS_FORK_MAX', 20000);
  const kids = [];
  const once = () => {
    for (let i = 0; i < 50 && counters.forks < max; i++) {
      try {
        const c = spawn('sleep', ['600'], { stdio: 'ignore' });
        c.on('error', (e) => {
          if (!modeFork.failed) {
            modeFork.failed = true;
            log(`fork: spawn failed after ${counters.forks}: ${e.code || e.message}`);
          }
        });
        kids.push(c);
        counters.forks++;
      } catch (e) {
        log(`fork: spawn threw after ${counters.forks}: ${e.code || e.message}`);
        return;
      }
    }
    if (counters.forks % 500 === 0) log(`fork: ${counters.forks} children`);
    if (counters.forks < max && !modeFork.failed) setTimeout(once, 20);
    else log(`fork: stopped at ${counters.forks}`);
  };
  once();
}

function modeCrash() {
  const s = num('STRESS_CRASH_AFTER', 5);
  log(`crash: exiting in ${s} s`);
  setTimeout(() => process.exit(1), s * 1000);
}

const DEFAULT_TARGETS = [
  '1.1.1.1:443', // the internet on 443: allowed
  '1.1.1.1:25', // SMTP: blocked
  '169.254.169.254:80', // cloud metadata: blocked
  '10.0.2.3:3306', // MariaDB: blocked
  '10.0.2.3:6032', // ProxySQL admin: blocked
  'kubernetes.default.svc.cluster.local:443', // kube API: blocked
  'redis-master.redis.svc.cluster.local:6379', // queue Redis: blocked
];

function tryConnect(target) {
  return new Promise((resolve) => {
    const i = target.lastIndexOf(':');
    const host = target.slice(0, i);
    const p = Number(target.slice(i + 1));
    const t0 = Date.now();
    const s = net.connect({ host, port: p });
    const done = (r) => {
      s.destroy();
      resolve(`${target} ${r} ${Date.now() - t0}ms`);
    };
    s.setTimeout(3000, () => done('timeout'));
    s.on('connect', () => done('CONNECTED'));
    s.on('error', (e) => done(`error ${e.code || e.message}`));
  });
}

async function modeEgress() {
  const list = (process.env.STRESS_EGRESS_TARGETS || DEFAULT_TARGETS.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
  for (const t of list) log(`egress: ${await tryConnect(t)}`);
  const url = process.env.STRESS_EGRESS_URL;
  if (!url) return log('egress: no STRESS_EGRESS_URL, bandwidth part skipped');
  const secs = num('STRESS_EGRESS_SECONDS', 60);
  const end = Date.now() + secs * 1000;
  let bytes = 0;
  let last = Date.now();
  let lastBytes = 0;
  while (Date.now() < end) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      const b = await r.arrayBuffer();
      bytes += b.byteLength;
    } catch (e) {
      log(`egress: download error ${e.cause?.code || e.message}`);
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (Date.now() - last >= 5000) {
      log(`egress: ${(((bytes - lastBytes) / 1048576) / ((Date.now() - last) / 1000)).toFixed(1)} MB/s`);
      last = Date.now();
      lastBytes = bytes;
    }
  }
  log(`egress: done, ${(bytes / 1048576).toFixed(0)} MB in ${secs} s`);
}

const modes = { web: () => {}, unhealthy: () => {}, cpu: modeCpu, mem: modeMem, disk: modeDisk, fork: modeFork, crash: modeCrash, egress: modeEgress };
if (!modes[mode]) {
  log(`unknown STRESS_MODE ${mode}, running as web`);
} else {
  // Start the abuse a moment after listen, so the first readiness probe can pass (except crash/unhealthy).
  setTimeout(() => Promise.resolve(modes[mode]()).catch((e) => log(`mode ${mode} error: ${e.message}`)), 3000);
}
process.on('SIGTERM', () => {
  log('SIGTERM, closing');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
});
