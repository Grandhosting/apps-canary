# Stress-test fixtures

Used by `gh-infrastructure/scripts/app-hosting/stress/` (rounds A–E). Branch `stress` only; `main` stays the plain canary.

- `stress/`: the runtime test app. `STRESS_MODE` (a deploy env var) picks the behaviour: web, cpu, mem, disk, fork,
  crash, unhealthy, egress. See the header of `server.js`.
- `stress-build-oom/`: a build that needs more than 8 GiB.
- `stress-build-slow/`: a build longer than the 20-minute limit (`SLOW_SECONDS` build var shortens it).
- `stress-build-log/`: a build with ~60 MB of log.
- `stress-build-disk/`: a build that writes 24 GiB.
