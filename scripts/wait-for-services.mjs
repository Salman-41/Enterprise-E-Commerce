const urls = ["http://localhost:4000/api/v1/ready", "http://localhost:3000"];
for (const url of urls) {
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* The service may still be starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error(`Service did not become ready: ${url}`);
}
