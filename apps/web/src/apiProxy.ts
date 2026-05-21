export const rewriteApiProxyPath = (path: string) => {
  if (/^\/api\/(owner|telegram|readiness)(\/|$)/.test(path)) return path;
  return path.replace(/^\/api/, "");
};
