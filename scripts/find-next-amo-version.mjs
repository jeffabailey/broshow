// Resolve the next available AMO version starting from a target version.
// Queries the AMO v5 API for the addon's existing versions (unlisted channel)
// and walks the patch component forward until finding one not yet on AMO.
// Outputs the resolved version on stdout.
//
// Usage:
//   AMO_JWT_ISSUER=... AMO_JWT_SECRET=... \
//     node scripts/find-next-amo-version.mjs <starting-version> [<addon-guid>]
//
// Default addon guid: broshow@jeffabailey.com (matches the gecko id used by
// scripts/patch-firefox-manifest.mjs).

import { createHmac, randomBytes } from 'crypto';

const issuer = process.env.AMO_JWT_ISSUER;
const secret = process.env.AMO_JWT_SECRET;
const startingVersion = process.argv[2];
const addonGuid = process.argv[3] ?? 'broshow@jeffabailey.com';

if (!issuer || !secret || !startingVersion) {
  console.error(
    'Usage: AMO_JWT_ISSUER=... AMO_JWT_SECRET=... node scripts/find-next-amo-version.mjs <starting-version> [<addon-guid>]',
  );
  process.exit(2);
}

const base64url = (data) =>
  Buffer.from(data).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const generateJWT = () => {
  const header = { typ: 'JWT', alg: 'HS256' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: issuer,
    jti: randomBytes(16).toString('hex'),
    iat: now,
    exp: now + 60,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = base64url(createHmac('sha256', secret).update(signingInput).digest());
  return `${signingInput}.${signature}`;
};

const fetchAllVersions = async () => {
  const versions = new Set();
  let url = `https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(addonGuid)}/versions/?filter=all_with_unlisted&page_size=100`;
  while (url) {
    const response = await fetch(url, {
      headers: { Authorization: `JWT ${generateJWT()}` },
    });
    if (response.status === 404) {
      // Addon not yet on AMO (no versions submitted) — every version is free.
      return versions;
    }
    if (!response.ok) {
      throw new Error(`AMO API ${response.status}: ${await response.text()}`);
    }
    const data = await response.json();
    for (const v of data.results ?? []) {
      if (typeof v.version === 'string') versions.add(v.version);
    }
    url = data.next ?? null;
  }
  return versions;
};

const bumpPatch = (version) => {
  const parts = version.split('.').map((p) => parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) {
    throw new Error(`Cannot bump non-numeric version: ${version}`);
  }
  while (parts.length < 3) parts.push(0);
  parts[parts.length - 1] += 1;
  return parts.join('.');
};

const existing = await fetchAllVersions();
let candidate = startingVersion;
let bumped = 0;
while (existing.has(candidate)) {
  candidate = bumpPatch(candidate);
  bumped += 1;
  if (bumped > 1000) {
    throw new Error(
      `Bumped past 1000 candidates starting from ${startingVersion}; aborting to avoid infinite loop`,
    );
  }
}
console.log(candidate);
if (bumped > 0) {
  console.error(`[find-next-amo-version] ${startingVersion} taken on AMO; resolved to ${candidate} (after ${bumped} bumps).`);
}
