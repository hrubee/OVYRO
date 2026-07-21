import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

/**
 * The worker is a separate Railway service. If it ever pulls in the Next.js
 * server runtime, `bun run worker` starts dragging the web framework into a
 * process that has no HTTP server — and the "web app stays stateless" rule in
 * CLAUDE.md quietly stops meaning anything.
 *
 * So: walk the real module graph from the worker entrypoint and assert what it
 * imports. A grep of the worker directory alone would miss a `next` import that
 * arrives through a shared `src/lib` module.
 */
const WORKER_DIR = import.meta.dir;
const ROOT = resolve(WORKER_DIR, "..");
const ENTRYPOINT = join(WORKER_DIR, "index.ts");

/** Catches `from "x"`, `import "x"` and `import("x")` — enough for this tree. */
const IMPORT_PATTERN = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;
const EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx", ".js"];

async function readIfFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

/** Mirrors the tsconfig `@/*` -> `./src/*` alias plus relative resolution. */
async function resolveLocal(
  specifier: string,
  fromFile: string,
): Promise<{ path: string; source: string } | null> {
  let base: string;
  if (specifier.startsWith("@/")) {
    base = join(ROOT, "src", specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    base = resolve(dirname(fromFile), specifier);
  } else {
    return null;
  }

  for (const extension of ["", ...EXTENSIONS]) {
    const candidate = `${base}${extension}`;
    const source = await readIfFile(candidate);
    if (source !== null) return { path: candidate, source };
  }
  return null;
}

/** Returns every bare (node_modules) specifier reachable from the entrypoint. */
async function collectBareImports(entrypoint: string): Promise<Set<string>> {
  const bare = new Set<string>();
  const visited = new Set<string>();
  const queue: Array<{ path: string; source: string }> = [];

  const entrySource = await readIfFile(entrypoint);
  expect(entrySource).not.toBeNull();
  queue.push({ path: entrypoint, source: entrySource! });

  while (queue.length > 0) {
    const current = queue.pop()!;
    if (visited.has(current.path)) continue;
    visited.add(current.path);

    for (const match of current.source.matchAll(IMPORT_PATTERN)) {
      const specifier = match[1];
      if (!specifier) continue;

      if (specifier.startsWith("@/") || specifier.startsWith(".")) {
        const resolved = await resolveLocal(specifier, current.path);
        if (resolved && !visited.has(resolved.path)) queue.push(resolved);
        continue;
      }
      bare.add(specifier);
    }
  }

  // Sanity check on the walker itself: a graph this small means resolution broke.
  expect(visited.size).toBeGreaterThan(4);
  return bare;
}

describe("worker module graph", () => {
  test("does not import the Next.js runtime", async () => {
    const imports = await collectBareImports(ENTRYPOINT);
    const nextImports = [...imports].filter(
      (specifier) => specifier === "next" || specifier.startsWith("next/"),
    );

    expect(nextImports).toEqual([]);
  });

  test("does not import React", async () => {
    const imports = await collectBareImports(ENTRYPOINT);
    const reactImports = [...imports].filter(
      (specifier) => specifier === "react" || specifier.startsWith("react-"),
    );

    expect(reactImports).toEqual([]);
  });

  test("reaches shared src/lib code, not a private copy", async () => {
    const source = await readFile(join(WORKER_DIR, "processors", "email.ts"), "utf8");
    expect(source).toContain('from "@/lib/email"');
    expect(relative(ROOT, ENTRYPOINT)).toBe("worker/index.ts");
  });
});
