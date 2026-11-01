// @ts-nocheck
import { Parser, Language } from "web-tree-sitter";
import path from "path";
import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

let initialized = false;
const languageCache = new Map<string, any>();

const WASM_DIR = path.join(
  path.dirname(require.resolve("tree-sitter-wasms/package.json")),
  "out"
);

const PARSER_WASM = require.resolve("web-tree-sitter/web-tree-sitter.wasm");

const LANGUAGE_WASM: Record<string, string> = {
  typescript: "tree-sitter-typescript.wasm",
  javascript: "tree-sitter-javascript.wasm",
  kotlin: "tree-sitter-kotlin.wasm",
  java: "tree-sitter-java.wasm",
  python: "tree-sitter-python.wasm",
  go: "tree-sitter-go.wasm",
  rust: "tree-sitter-rust.wasm",
  ruby: "tree-sitter-ruby.wasm",
  php: "tree-sitter-php.wasm",
};

export const SUPPORTED_LANGUAGES = new Set(Object.keys(LANGUAGE_WASM));

async function ensureInitialized() {
  if (!initialized) {
    await Parser.init({
      locateFile: () => PARSER_WASM,
    });
    initialized = true;
  }
}

async function getLanguage(language: string): Promise<any | null> {
  if (languageCache.has(language)) return languageCache.get(language);
  await ensureInitialized();
  const wasmFile = LANGUAGE_WASM[language];
  if (!wasmFile) return null;
  const wasmPath = path.join(WASM_DIR, wasmFile);
  const wasmBuffer = fs.readFileSync(wasmPath);
  const lang = await Language.load(wasmBuffer);
  languageCache.set(language, lang);
  return lang;
}

const BUILTIN_KEYWORDS = new Set([
  "if", "else", "for", "while", "switch", "case", "catch", "try",
  "return", "new", "typeof", "instanceof", "void", "delete", "in",
  "of", "do", "throw", "finally", "break", "continue", "default",
  "function", "def", "fun", "func", "fn", "class", "struct", "enum",
  "interface", "trait", "extends", "implements", "import", "export",
  "from", "as", "const", "let", "var", "static", "public", "private",
  "protected", "internal", "abstract", "async", "await", "yield",
  "super", "this", "self", "init", "constructor", "main",
  "print", "println", "printf", "console", "log", "error", "warn",
  "setTimeout", "setInterval", "clearTimeout", "clearInterval",
  "require", "module", "exports", "process", "window", "document",
  "when", "with", "repeat", "synchronized", "assert", "check", "require",
  "lazy", "scope", "apply", "also", "run", "take", "drop",
  "forEach", "map", "filter", "reduce", "fold", "groupBy", "sortedBy",
  "forEachIndexed", "mapIndexed", "filterIndexed",
  "println", "print", "readLine", "readln",
  "arrayOf", "listOf", "setOf", "mapOf", "mutableListOf",
  "rangeTo", "until", "step", "downTo",
  "len", "append", "str", "int", "float", "bool",
  "string", "number", "boolean", "object", "array",
  "true", "false", "null", "nil", "none", "undefined",
  "and", "or", "not", "is", "in", "out", "ref", "var", "val",
  "data", "sealed", "open", "override", "final", "lateinit",
  "companion", "object", "by", "get", "set",
  "package", "include", "using", "namespace",
  "go", "defer", "select", "chan", "type", "range",
  "func", "make", "copy", "close", "cap", "complex", "real", "imag",
  "panic", "recover", "iota", "nil", "true", "false",
]);

export type ExtractionResult = {
  imports: string[];
  functionDefs: string[];
  functionCalls: string[];
};

function collectNodes(root: any, types: Set<string>): any[] {
  const results: any[] = [];
  function walk(node: any) {
    if (types.has(node.type)) results.push(node);
    for (const child of node.children) walk(child);
  }
  walk(root);
  return results;
}

function cleanName(text: string): string {
  return text.replace(/['"`]/g, "").trim();
}

function getCallName(funcNode: any): string | null {
  if (!funcNode) return null;
  if (funcNode.type === "identifier") return funcNode.text;
  if (funcNode.type === "member_expression" || funcNode.type === "field_expression") {
    const prop = funcNode.childForFieldName("property");
    if (prop) return prop.text;
  }
  return funcNode.text;
}

function extractTypeScript(root: any): ExtractionResult {
  const imports: string[] = [];
  const functionDefs: string[] = [];
  const functionCalls: string[] = [];

  const nodes = collectNodes(root, new Set([
    "import_statement", "function_declaration", "call_expression",
    "variable_declarator", "method_definition",
  ]));

  for (const node of nodes) {
    switch (node.type) {
      case "import_statement": {
        const source = node.childForFieldName("source");
        if (source) imports.push(cleanName(source.text));
        break;
      }
      case "function_declaration":
      case "method_definition": {
        const name = node.childForFieldName("name");
        if (name) functionDefs.push(name.text);
        break;
      }
      case "variable_declarator": {
        const name = node.childForFieldName("name");
        const value = node.childForFieldName("value");
        if (name && value) {
          const vt = value.text;
          if (vt.includes("=>") || vt.startsWith("function")) {
            functionDefs.push(name.text);
          }
        }
        break;
      }
      case "call_expression": {
        const func = node.childForFieldName("function");
        const name = getCallName(func);
        if (name && !BUILTIN_KEYWORDS.has(name) && name.length > 1) {
          functionCalls.push(name);
        }
        break;
      }
    }
  }

  return {
    imports: [...new Set(imports)],
    functionDefs: [...new Set(functionDefs)],
    functionCalls: [...new Set(functionCalls)],
  };
}

function extractKotlin(root: any): ExtractionResult {
  const imports: string[] = [];
  const functionDefs: string[] = [];
  const functionCalls: string[] = [];

  const nodes = collectNodes(root, new Set([
    "import_statement", "function_declaration", "call_expression",
  ]));

  for (const node of nodes) {
    switch (node.type) {
      case "import_statement": {
        const text = node.text.replace(/^import\s+/, "").trim();
        imports.push(text);
        break;
      }
      case "function_declaration": {
        const name = node.childForFieldName("name");
        if (name) functionDefs.push(name.text);
        break;
      }
      case "call_expression": {
        const func = node.childForFieldName("function");
        const name = getCallName(func);
        if (name && !BUILTIN_KEYWORDS.has(name) && name.length > 1) {
          functionCalls.push(name);
        }
        break;
      }
    }
  }

  return {
    imports: [...new Set(imports)],
    functionDefs: [...new Set(functionDefs)],
    functionCalls: [...new Set(functionCalls)],
  };
}

function extractJava(root: any): ExtractionResult {
  const imports: string[] = [];
  const functionDefs: string[] = [];
  const functionCalls: string[] = [];

  const nodes = collectNodes(root, new Set([
    "import_declaration", "method_declaration", "method_invocation",
    "constructor_declaration",
  ]));

  for (const node of nodes) {
    switch (node.type) {
      case "import_declaration": {
        const name = node.childForFieldName("name");
        if (name) imports.push(name.text);
        break;
      }
      case "method_declaration":
      case "constructor_declaration": {
        const name = node.childForFieldName("name");
        if (name) functionDefs.push(name.text);
        break;
      }
      case "method_invocation": {
        const name = node.childForFieldName("name");
        if (name && !BUILTIN_KEYWORDS.has(name.text) && name.text.length > 1) {
          functionCalls.push(name.text);
        }
        break;
      }
    }
  }

  return {
    imports: [...new Set(imports)],
    functionDefs: [...new Set(functionDefs)],
    functionCalls: [...new Set(functionCalls)],
  };
}

function extractPython(root: any): ExtractionResult {
  const imports: string[] = [];
  const functionDefs: string[] = [];
  const functionCalls: string[] = [];

  const nodes = collectNodes(root, new Set([
    "import_statement", "import_from_statement",
    "function_definition", "call",
  ]));

  for (const node of nodes) {
    switch (node.type) {
      case "import_statement": {
        const text = node.text.replace(/^import\s+/, "").trim();
        imports.push(text);
        break;
      }
      case "import_from_statement": {
        const mod = node.childForFieldName("module_name");
        if (mod) imports.push(mod.text);
        break;
      }
      case "function_definition": {
        const name = node.childForFieldName("name");
        if (name) functionDefs.push(name.text);
        break;
      }
      case "call": {
        const func = node.childForFieldName("function");
        const name = getCallName(func);
        if (name && !BUILTIN_KEYWORDS.has(name) && name.length > 1) {
          functionCalls.push(name);
        }
        break;
      }
    }
  }

  return {
    imports: [...new Set(imports)],
    functionDefs: [...new Set(functionDefs)],
    functionCalls: [...new Set(functionCalls)],
  };
}

function extractGo(root: any): ExtractionResult {
  const imports: string[] = [];
  const functionDefs: string[] = [];
  const functionCalls: string[] = [];

  const nodes = collectNodes(root, new Set([
    "import_declaration", "function_declaration", "call_expression",
    "method_declaration",
  ]));

  for (const node of nodes) {
    switch (node.type) {
      case "import_declaration": {
        const text = node.text;
        const matches = text.matchAll(/"([^"]+)"/g);
        for (const m of matches) imports.push(m[1]);
        break;
      }
      case "function_declaration":
      case "method_declaration": {
        const name = node.childForFieldName("name");
        if (name) functionDefs.push(name.text);
        break;
      }
      case "call_expression": {
        const func = node.childForFieldName("function");
        const name = getCallName(func);
        if (name && !BUILTIN_KEYWORDS.has(name) && name.length > 1) {
          functionCalls.push(name);
        }
        break;
      }
    }
  }

  return {
    imports: [...new Set(imports)],
    functionDefs: [...new Set(functionDefs)],
    functionCalls: [...new Set(functionCalls)],
  };
}

function extractRust(root: any): ExtractionResult {
  const imports: string[] = [];
  const functionDefs: string[] = [];
  const functionCalls: string[] = [];

  const nodes = collectNodes(root, new Set([
    "use_declaration", "function_item", "call_expression",
    "macro_invocation",
  ]));

  for (const node of nodes) {
    switch (node.type) {
      case "use_declaration": {
        const text = node.text.replace(/^use\s+/, "").replace(/;$/, "").trim();
        imports.push(text);
        break;
      }
      case "function_item": {
        const name = node.childForFieldName("name");
        if (name) functionDefs.push(name.text);
        break;
      }
      case "call_expression":
      case "macro_invocation": {
        const func = node.childForFieldName("function") || node.childForFieldName("macro");
        const name = getCallName(func);
        if (name && !BUILTIN_KEYWORDS.has(name) && name.length > 1) {
          functionCalls.push(name);
        }
        break;
      }
    }
  }

  return {
    imports: [...new Set(imports)],
    functionDefs: [...new Set(functionDefs)],
    functionCalls: [...new Set(functionCalls)],
  };
}

function extractRuby(root: any): ExtractionResult {
  const imports: string[] = [];
  const functionDefs: string[] = [];
  const functionCalls: string[] = [];

  const nodes = collectNodes(root, new Set([
    "call", "method", "identifier",
  ]));

  for (const node of nodes) {
    if (node.type === "method") {
      const name = node.childForFieldName("name");
      if (name) functionDefs.push(name.text);
    } else if (node.type === "call") {
      const text = node.text;
      if (text.startsWith("require") || text.startsWith("require_relative")) {
        const m = text.match(/['"]([^'"]+)['"]/);
        if (m) imports.push(m[1]);
      }
      const func = node.childForFieldName("method");
      if (func) {
        const name = func.text;
        if (name && !BUILTIN_KEYWORDS.has(name) && name.length > 1) {
          functionCalls.push(name);
        }
      }
    }
  }

  return {
    imports: [...new Set(imports)],
    functionDefs: [...new Set(functionDefs)],
    functionCalls: [...new Set(functionCalls)],
  };
}

function extractPhp(root: any): ExtractionResult {
  const imports: string[] = [];
  const functionDefs: string[] = [];
  const functionCalls: string[] = [];

  const nodes = collectNodes(root, new Set([
    "include_expression", "require_expression",
    "function_definition", "function_call_expression",
    "method_declaration",
  ]));

  for (const node of nodes) {
    switch (node.type) {
      case "include_expression":
      case "require_expression": {
        const text = node.text;
        const m = text.match(/['"]([^'"]+)['"]/);
        if (m) imports.push(m[1]);
        break;
      }
      case "function_definition":
      case "method_declaration": {
        const name = node.childForFieldName("name");
        if (name) functionDefs.push(name.text);
        break;
      }
      case "function_call_expression": {
        const func = node.childForFieldName("function");
        const name = getCallName(func);
        if (name && !BUILTIN_KEYWORDS.has(name) && name.length > 1) {
          functionCalls.push(name);
        }
        break;
      }
    }
  }

  return {
    imports: [...new Set(imports)],
    functionDefs: [...new Set(functionDefs)],
    functionCalls: [...new Set(functionCalls)],
  };
}

export async function extractFromSource(
  sourceCode: string,
  language: string
): Promise<ExtractionResult> {
  try {
    const lang = await getLanguage(language);
    if (!lang) return { imports: [], functionDefs: [], functionCalls: [] };

    const parser = new Parser();
    parser.setLanguage(lang);
    const tree = parser.parse(sourceCode);
    if (!tree) return { imports: [], functionDefs: [], functionCalls: [] };

    const root = tree.rootNode;
    tree.delete();
    parser.delete();

    switch (language) {
      case "typescript":
      case "javascript":
        return extractTypeScript(root);
      case "kotlin":
        return extractKotlin(root);
      case "java":
        return extractJava(root);
      case "python":
        return extractPython(root);
      case "go":
        return extractGo(root);
      case "rust":
        return extractRust(root);
      case "ruby":
        return extractRuby(root);
      case "php":
        return extractPhp(root);
      default:
        return { imports: [], functionDefs: [], functionCalls: [] };
    }
  } catch {
    return { imports: [], functionDefs: [], functionCalls: [] };
  }
}
