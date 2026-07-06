export function parseVersion(version = "1.0.0"): `${number}.${number}.${number}` {
  const [major = 1, minor = 0, patch = 0] = (version.match(/\d+/g) ?? []).map(Number);
  return `${major}.${minor}.${patch}`;
}
