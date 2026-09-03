import { test } from "node:test";
import assert from "node:assert/strict";
import { isOptimizableImageUrl, isRenderablePhotoUrl, parsePhotoUrl } from "./images";

function withHosts<T>(value: string | undefined, run: () => T): T {
  const previous = process.env.IMAGE_HOSTS;
  if (value === undefined) delete process.env.IMAGE_HOSTS;
  else process.env.IMAGE_HOSTS = value;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.IMAGE_HOSTS;
    else process.env.IMAGE_HOSTS = previous;
  }
}

test("a blank field means no photo, not an error", () => {
  assert.deepEqual(parsePhotoUrl(""), { ok: true, url: null });
  assert.deepEqual(parsePhotoUrl("   "), { ok: true, url: null });
  assert.deepEqual(parsePhotoUrl(null), { ok: true, url: null });
  assert.deepEqual(parsePhotoUrl(undefined), { ok: true, url: null });
});

test("a normal https image URL is accepted", () => {
  withHosts(undefined, () => {
    const result = parsePhotoUrl("https://cdn.example.com/dr-sharma.jpg");
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.url, "https://cdn.example.com/dr-sharma.jpg");
  });
});

// Everything below passed the previous `z.string().url()` validator.
test("non-https protocols are rejected", () => {
  for (const value of ["javascript:alert(1)", "file:///etc/passwd", "ftp://host/x.png", "data:image/png;base64,AAAA"]) {
    const result = parsePhotoUrl(value);
    assert.equal(result.ok, false, `${value} should be rejected`);
  }
});

test("plain http is rejected rather than silently never loading", () => {
  assert.equal(parsePhotoUrl("http://cdn.example.com/a.jpg").ok, false);
});

// The SSRF payloads. The metadata endpoint is the one that leaks cloud
// credentials, and it is a plain https URL, so protocol checks alone miss it.
test("private, loopback and link-local hosts are rejected", () => {
  for (const value of [
    "https://169.254.169.254/latest/meta-data/",
    "https://localhost/a.png",
    "https://127.0.0.1/a.png",
    "https://10.0.0.5/a.png",
    "https://192.168.1.1/a.png",
    "https://172.16.0.1/a.png",
    "https://[::1]/a.png",
  ]) {
    const result = parsePhotoUrl(value);
    assert.equal(result.ok, false, `${value} should be rejected`);
  }
});

test("garbage that is not a URL at all is rejected", () => {
  assert.equal(parsePhotoUrl("not a url").ok, false);
  assert.equal(parsePhotoUrl("://").ok, false);
});

test("a configured allowlist restricts which hosts may be used", () => {
  withHosts("images.apnahealth.in, cdn.example.com", () => {
    assert.equal(parsePhotoUrl("https://images.apnahealth.in/a.jpg").ok, true);
    assert.equal(parsePhotoUrl("https://CDN.EXAMPLE.COM/a.jpg").ok, true);
    assert.equal(parsePhotoUrl("https://evil.example.net/a.jpg").ok, false);
  });
});

test("with no allowlist configured, any public https host is accepted", () => {
  withHosts("", () => {
    assert.equal(parsePhotoUrl("https://anything.example.org/a.jpg").ok, true);
  });
});

// Rows predate this validation, so the render path checks too.
test("isRenderablePhotoUrl rejects legacy values that could not be saved today", () => {
  assert.equal(isRenderablePhotoUrl("https://cdn.example.com/a.jpg"), true);
  assert.equal(isRenderablePhotoUrl("javascript:alert(1)"), false);
  assert.equal(isRenderablePhotoUrl("http://cdn.example.com/a.jpg"), false);
  assert.equal(isRenderablePhotoUrl("https://169.254.169.254/x"), false);
  assert.equal(isRenderablePhotoUrl(null), false);
  assert.equal(isRenderablePhotoUrl(""), false);
});

// Letting the viewer's browser fetch an image is a privacy question;
// letting the SERVER fetch it is an SSRF question, and only the allowlist
// answers that one.
test("only allowlisted hosts may be fetched by the image optimizer", () => {
  withHosts("", () => {
    assert.equal(isOptimizableImageUrl("https://cdn.example.com/a.jpg"), false);
  });
  withHosts("cdn.example.com", () => {
    assert.equal(isOptimizableImageUrl("https://cdn.example.com/a.jpg"), true);
    assert.equal(isOptimizableImageUrl("https://other.example.com/a.jpg"), false);
    assert.equal(isOptimizableImageUrl("https://169.254.169.254/a.jpg"), false);
  });
});
