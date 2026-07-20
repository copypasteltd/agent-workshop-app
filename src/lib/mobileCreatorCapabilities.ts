export async function loadMobileCreatorCapabilities<
  Providers,
  ProviderBindings,
  Mcps,
  McpBindings,
  Credentials,
>(loaders: {
  loadProviders: () => Promise<Providers>;
  loadProviderBindings: () => Promise<ProviderBindings>;
  loadMcps: () => Promise<Mcps>;
  loadMcpBindings: () => Promise<McpBindings>;
  loadCredentials: () => Promise<Credentials>;
}) {
  const [providers, providerBindings, mcps, mcpBindings, credentials] = await Promise.all([
    loaders.loadProviders(),
    loaders.loadProviderBindings(),
    loaders.loadMcps(),
    loaders.loadMcpBindings(),
    loaders.loadCredentials(),
  ]);

  return { providers, providerBindings, mcps, mcpBindings, credentials };
}
