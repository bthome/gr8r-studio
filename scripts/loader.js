export async function resolve(specifier, context, next) {
  if (specifier === 'virtual:icons') return { url: new URL('./icons-stub.js', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
