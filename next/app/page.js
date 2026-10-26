export default function Page() {
  return (
    <main>
      <h1>Grandhosting canary: Next.js</h1>
      <p id="greeting">{process.env.NEXT_PUBLIC_GREETING}</p>
    </main>
  );
}
