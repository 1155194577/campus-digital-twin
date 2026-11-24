import assert from "node:assert/strict";
import test from "node:test";

test("only an explicit Cloudflare build enables static export", async () => {
  const previous = process.env.CLOUDFLARE_BUILD;
  try {
    delete process.env.CLOUDFLARE_BUILD;
    const { default: standardConfig } = await import("../next.config.ts");
    assert.equal(standardConfig.output, undefined);

    process.env.CLOUDFLARE_BUILD = "1";
    const { default: cloudflareConfig } = await import("../next.config.ts?cloudflare");
    assert.equal(cloudflareConfig.output, "export");
  } finally {
    if (previous === undefined) delete process.env.CLOUDFLARE_BUILD;
    else process.env.CLOUDFLARE_BUILD = previous;
  }
});
