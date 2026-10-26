import ms from "ms";

const port = Number(process.env.PORT) || 3000;

Bun.serve({
  port,
  hostname: "0.0.0.0",
  fetch(req) {
    const { pathname } = new URL(req.url);
    if (pathname === "/health") return new Response("ok");
    if (pathname === "/") return Response.json({ app: "grandhosting-canary-bun", runtime: "bun", uptime: ms(Math.round(performance.now())) });
    return new Response("not found", { status: 404 });
  },
});

console.log(`listening on ${port}`);
