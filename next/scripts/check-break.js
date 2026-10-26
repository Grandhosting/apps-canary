if (process.env.CANARY_BREAK_BUILD === '1') {
  console.error('CANARY_BREAK_BUILD=1 is set: failing the build on purpose.');
  process.exit(1);
}
