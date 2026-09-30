const INHERITED_ENVIRONMENT_NAMES = [
  "PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LC_ALL", "TERM",
  "TMPDIR", "TMP", "TEMP", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME",
  "XDG_STATE_HOME", "XDG_RUNTIME_DIR", "GEMINI_API_KEY", "GOOGLE_API_KEY",
  "GOOGLE_APPLICATION_CREDENTIALS", "CLOUDSDK_CONFIG", "GOOGLE_CLOUD_PROJECT",
  "GCLOUD_PROJECT", "CLI_GRAPHICS", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY",
  "http_proxy", "https_proxy", "no_proxy", "SSL_CERT_FILE", "SSL_CERT_DIR",
  "NODE_EXTRA_CA_CERTS",
] as const;

export function allowedEnvironment(
  injected: Record<string, string> = {},
  source: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of INHERITED_ENVIRONMENT_NAMES) {
    const value = source[key];
    if (value !== undefined) result[key] = value;
  }
  Object.assign(result, injected);
  return result;
}

export function isolatedLocalEnvironment(
  injected: Record<string, string> = {},
  source: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const result: Record<string, string | undefined> = {};
  for (const key of Object.keys(source)) result[key] = undefined;
  Object.assign(result, allowedEnvironment(injected, source));
  return result as Record<string, string>;
}

export function inheritedEnvironmentForRedaction(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  return allowedEnvironment({}, source);
}
