import { randomBytes, createHash } from "node:crypto";
import { writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const iterations = 210000;
const words = ["maple", "kite", "river", "cedar", "lantern", "pebble", "harbor", "comet", "willow", "amber", "north", "sunny", "quiet", "brass", "cloud", "meadow"];
const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";

function pick(list) {
  return list[randomBytes(1)[0] % list.length];
}

function backupCode() {
  const bytes = randomBytes(8);
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

const password = `${pick(words)}-${pick(words)}-${pick(words)}-${String(randomBytes(1)[0] % 100).padStart(2, "0")}`;
const salt = randomBytes(16);
const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
const bits = await crypto.subtle.deriveBits(
  { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
  key,
  256,
);
const passwordHash = Buffer.from(bits);
const totpBytes = randomBytes(20);
const base32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
let totpSecret = "";
let value = 0;
let bitsLeft = 0;
for (const byte of totpBytes) {
  value = (value << 8) | byte;
  bitsLeft += 8;
  while (bitsLeft >= 5) {
    totpSecret += base32[(value >>> (bitsLeft - 5)) & 31];
    bitsLeft -= 5;
  }
}
if (bitsLeft > 0) totpSecret += base32[(value << (5 - bitsLeft)) & 31];

const backups = Array.from({ length: 8 }, backupCode);
const backupHashes = backups.map((code) => createHash("sha256").update(code).digest("hex"));
const bootstrap = {
  user_id: `usr_${randomBytes(16).toString("hex")}`,
  email: "kaleb@t3nable.com",
  password_salt: salt.toString("base64"),
  password_hash: passwordHash.toString("base64"),
  totp_secret: totpSecret,
  backup_hashes: backupHashes,
};
const secretPath = "/tmp/grok-attention-bootstrap.json";
writeFileSync(secretPath, JSON.stringify(bootstrap));
chmodSync(secretPath, 0o600);
const dir = join(homedir(), ".config", "grok-attention");
mkdirSync(dir, { recursive: true });
const accountPath = join(dir, "account.txt");
writeFileSync(
  accountPath,
  [
    "email: kaleb@t3nable.com",
    `password: ${password}`,
    `totp_secret: ${totpSecret}`,
    `otpauth: otpauth://totp/Grok%20Attention:kaleb@t3nable.com?secret=${totpSecret}&issuer=Grok%20Attention&digits=6&period=30`,
    "backup_codes:",
    ...backups,
    "",
  ].join("\n"),
);
chmodSync(accountPath, 0o600);
console.log(`wrote ${accountPath}`);
console.log(`wrote ${secretPath}`);
