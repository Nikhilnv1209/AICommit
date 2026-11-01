// @ts-nocheck
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

type Extraction = {
  imports: string[];
  functionDefs: string[];
  functionCalls: string[];
};

type ParserModule = {
  extractFromSource: (sourceCode: string, language: string) => Promise<Extraction>;
  SUPPORTED_LANGUAGES: Set<string>;
};

async function loadParser(query = ""): Promise<ParserModule> {
  const mod: any = await import(`./ast-parser.ts${query}`);
  return mod.default ?? mod;
}

const emptyExtraction: Extraction = { imports: [], functionDefs: [], functionCalls: [] };

test("recovers the Parser constructor after Emscripten overwrites module.exports", async () => {
  // Load the raw package before the parser has initialized. This is the shape
  // that works: a function with .init on it.
  const raw = require("web-tree-sitter");
  assert.equal(typeof raw?.init, "function", "expected a fresh web-tree-sitter export");

  // Parsing initializes the WASM runtime, and Emscripten's preamble runs
  // `module.exports = Module` — destroying the package's real export.
  await raw.init({
    locateFile: () => require.resolve("web-tree-sitter/tree-sitter.wasm"),
  });

  const afterInit = require("web-tree-sitter");
  assert.equal(
    typeof afterInit?.init,
    "undefined",
    "expected Emscripten to overwrite module.exports after init"
  );

  // Simulate a hot reload where module-level state is gone.
  delete (globalThis as any).__astParserCtor;
  delete (globalThis as any).__astParserReady;
  delete (globalThis as any).__astParserPromise;

  const parser = await loadParser("?hmr=1");
  const result = await parser.extractFromSource(
    `import com.foo.Bar\nfun run(){ helper() }`,
    "kotlin"
  );

  assert.deepEqual(result, {
    imports: ["com.foo.Bar"],
    functionDefs: ["run"],
    functionCalls: ["helper"],
  });
});

test("reuses the initialized parser after another module re-evaluation", async () => {
  const parser = await loadParser("?hmr=2");
  const result = await parser.extractFromSource(
    `import com.foo.Bar\nfun run(){ helper() }`,
    "kotlin"
  );

  assert.deepEqual(result, {
    imports: ["com.foo.Bar"],
    functionDefs: ["run"],
    functionCalls: ["helper"],
  });
});

const languageCases: {
  language: string;
  source: string;
  expected: Extraction;
}[] = [
  {
    language: "typescript",
    source: `import { foo } from "./bar";\nfunction baz(){ foo(); console.log("x"); }\nconst qux = () => baz();`,
    expected: {
      imports: ["./bar"],
      functionDefs: ["baz", "qux"],
      functionCalls: ["foo", "baz"],
    },
  },
  {
    language: "tsx",
    source: `import React from "react";\nexport function App(){ return <div>hi</div>; }`,
    expected: {
      imports: ["react"],
      functionDefs: ["App"],
      functionCalls: [],
    },
  },
  {
    language: "kotlin",
    source: `import com.foo.Bar\nfun greet(name: String) { println(name); helper() }\nclass A { fun run() { this.helper() } }`,
    expected: {
      imports: ["com.foo.Bar"],
      functionDefs: ["greet", "run"],
      functionCalls: ["helper"],
    },
  },
  {
    language: "java",
    source: `import com.foo.Bar;\nimport java.util.*;\nclass A { void run(){ helper(); } }`,
    expected: {
      imports: ["com.foo.Bar", "java.util"],
      functionDefs: ["run"],
      functionCalls: ["helper"],
    },
  },
  {
    language: "python",
    source: `from foo import bar\nimport os\ndef run():\n  bar()\n  print("x")`,
    expected: {
      imports: ["foo", "os"],
      functionDefs: ["run"],
      functionCalls: ["bar"],
    },
  },
  {
    language: "go",
    source: `package main\nimport "fmt"\nfunc main(){ fmt.Println("x") }`,
    expected: {
      imports: ["fmt"],
      functionDefs: ["main"],
      functionCalls: ["Println"],
    },
  },
  {
    language: "rust",
    source: `use std::io;\nfn main(){ helper(); println!("x"); }`,
    expected: {
      imports: ["std::io"],
      functionDefs: ["main"],
      functionCalls: ["helper"],
    },
  },
  {
    language: "php",
    source: `<?php\nrequire "foo.php";\nfunction run(){ helper(); }`,
    expected: {
      imports: ["foo.php"],
      functionDefs: ["run"],
      functionCalls: ["helper"],
    },
  },
];

for (const { language, source, expected } of languageCases) {
  test(`extracts ${language} symbols`, async () => {
    const parser = await loadParser();
    const result = await parser.extractFromSource(source, language);
    assert.deepEqual(result, expected);
  });
}

test("returns an empty result for unsupported languages without throwing", async () => {
  const parser = await loadParser();
  const result = await parser.extractFromSource("puts 'hi'", "ruby");
  assert.deepEqual(result, emptyExtraction);
});
