export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    const source = "export const env = globalThis.__TEST_CLOUDFLARE_ENV__ ?? {};";
    return {
      url: `data:text/javascript,${encodeURIComponent(source)}`,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
