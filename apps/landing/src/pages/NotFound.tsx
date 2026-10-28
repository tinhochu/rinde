const NotFound = () => (
  <main className="page-width flex min-h-screen flex-col items-start justify-center gap-5 text-primary">
    <a href="/" className="wordmark text-3xl">rinde ✳</a>
    <h1 className="editorial section-title">Esta página no existe.</h1>
    <p className="text-sm text-[var(--body-ink)]">Revisa la dirección o vuelve al inicio. <span lang="en">This page doesn’t exist.</span></p>
    <a href="/" className="rounded-full bg-primary px-7 py-4 text-sm font-semibold text-primary-foreground">Ir al inicio</a>
  </main>
);

export default NotFound;
