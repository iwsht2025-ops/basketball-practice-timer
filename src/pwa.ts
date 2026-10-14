export async function registerPwa(): Promise<boolean> {
  if (
    !("serviceWorker" in navigator) ||
    !window.isSecureContext ||
    import.meta.env.DEV
  )
    return false;
  try {
    const directory = new URL("./", document.baseURI);
    await navigator.serviceWorker.register(new URL("sw.js", directory), {
      scope: directory.pathname,
      updateViaCache: "none",
    });
    return true;
  } catch {
    return false;
  }
}
