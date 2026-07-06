import { logError } from "./logger";

export type GraphType = "files" | "calls" | "classes";

export type GraphNode = {
  id: string;
  label: string;
  group: string;
  degree: number;
  summary?: string;
};

export type GraphLink = {
  source: string;
  target: string;
  type: "import" | "call" | "extends" | "implements";
};

export type GraphData = {
  nodes: GraphNode[];
  links: GraphLink[];
};

type FileRecord = {
  fileName: string;
  sourceCode: string;
  summary: string;
};

const LANGUAGE_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".java": "java",
  ".go": "go",
  ".rs": "rust",
  ".rb": "ruby",
  ".php": "php",
  ".swift": "swift",
  ".c": "cpp",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".h": "cpp",
  ".hpp": "cpp",
  ".cs": "csharp",
  ".scala": "scala",
  ".dart": "dart",
  ".lua": "lua",
  ".r": "r",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
};

const CODE_EXTENSIONS = new Set(Object.keys(LANGUAGE_MAP));

function getExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  if (idx === -1) return "";
  return fileName.slice(idx).toLowerCase();
}

function getLanguage(fileName: string): string | null {
  const ext = getExtension(fileName);
  return LANGUAGE_MAP[ext] ?? null;
}

function isCodeFile(fileName: string): boolean {
  const ext = getExtension(fileName);
  return CODE_EXTENSIONS.has(ext);
}

function getDir(filePath: string): string {
  const idx = filePath.lastIndexOf("/");
  return idx === -1 ? "" : filePath.slice(0, idx);
}

function joinPath(dir: string, rel: string): string {
  if (rel.startsWith("./")) rel = rel.slice(2);
  if (rel.startsWith("/")) rel = rel.slice(1);

  const parts = (dir ? dir + "/" : "") + rel;
  const stack: string[] = [];
  for (const part of parts.split("/")) {
    if (part === "..") stack.pop();
    else if (part === "." || part === "") continue;
    else stack.push(part);
  }
  return stack.join("/");
}

const RESOLVE_EXTENSIONS = [
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".kt", ".java", ".go", ".rs", ".rb",
  ".php", ".swift", ".c", ".cpp", ".h", ".hpp",
  ".cs", ".scala", ".dart",
];

function resolveImport(
  importPath: string,
  fromFile: string,
  knownFiles: Set<string>
): string | null {
  if (!importPath) return null;

  // Skip external packages (no ./ or ../ and not a known file)
  const isRelative = importPath.startsWith("./") ||
    importPath.startsWith("../") ||
    importPath.startsWith("/");

  if (isRelative) {
    const dir = getDir(fromFile);
    const base = joinPath(dir, importPath);

    // Try exact match
    if (knownFiles.has(base)) return base;

    // Try with extensions
    for (const ext of RESOLVE_EXTENSIONS) {
      if (knownFiles.has(base + ext)) return base + ext;
    }

    // Try /index (JS/TS convention)
    for (const ext of RESOLVE_EXTENSIONS) {
      if (knownFiles.has(base + "/index" + ext)) return base + "/index" + ext;
    }
  }

  // Try path-alias matching (e.g. @/components/Button → src/components/Button)
  // Strip common alias prefixes and try suffix matching
  const stripped = importPath
    .replace(/^@\//, "")
    .replace(/^@[\w-]+\//, "")
    .replace(/^~\//, "")
    .replace(/^src\//, "");

  if (stripped !== importPath) {
    // Try matching as suffix of known files
    const candidates = [...knownFiles].filter(f => f.endsWith(stripped));
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      // Prefer the shortest path (most likely the real one)
      return candidates.sort((a, b) => a.length - b.length)[0];
    }

    // Try with extensions
    for (const ext of RESOLVE_EXTENSIONS) {
      const withExt = stripped + ext;
      const matches = [...knownFiles].filter(f => f.endsWith(withExt));
      if (matches.length === 1) return matches[0];
    }
  }

  // Try package-name matching (Kotlin/Java/Python etc.)
  // e.g. com.example.MyClass → com/example/MyClass.kt
  const asPath = importPath.replace(/\./g, "/");
  for (const ext of RESOLVE_EXTENSIONS) {
    const withExt = asPath + ext;
    const matches = [...knownFiles].filter(f => f.endsWith(withExt));
    if (matches.length >= 1) {
      return matches.sort((a, b) => a.length - b.length)[0];
    }
  }

  // Try the path as-is (no extension) as a suffix
  {
    const matches = [...knownFiles].filter(f => f.endsWith(asPath));
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      return matches.sort((a, b) => a.length - b.length)[0];
    }
  }

  return null;
}

// ─── Import Extraction ─────────────────────────────────────────────

function extractImports(sourceCode: string, language: string): string[] {
  const imports: string[] = [];

  try {
    switch (language) {
      case "typescript":
      case "javascript": {
        // import ... from '...'
        const importFromRe = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"`]([^'"`]+)['"`]/g;
        let m;
        while ((m = importFromRe.exec(sourceCode)) !== null) imports.push(m[1]);

        // require('...')
        const requireRe = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
        while ((m = requireRe.exec(sourceCode)) !== null) imports.push(m[1]);

        // dynamic import('...')
        const dynamicRe = /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
        while ((m = dynamicRe.exec(sourceCode)) !== null) imports.push(m[1]);
        break;
      }

      case "python": {
        // from .module import ... / from module import ...
        const fromRe = /from\s+([\w.]+)\s+import/g;
        let m;
        while ((m = fromRe.exec(sourceCode)) !== null) imports.push(m[1]);

        // import module
        const importRe = /(?:^|\n)\s*import\s+([\w.]+)/g;
        while ((m = importRe.exec(sourceCode)) !== null) imports.push(m[1]);
        break;
      }

      case "kotlin":
      case "java": {
        const importRe = /import\s+([\w.]+)/g;
        let m;
        while ((m = importRe.exec(sourceCode)) !== null) imports.push(m[1]);
        break;
      }

      case "go": {
        // import "..." or import ( ... )
        const singleRe = /import\s+"([^"]+)"/g;
        let m;
        while ((m = singleRe.exec(sourceCode)) !== null) imports.push(m[1]);

        const blockRe = /import\s*\(([\s\S]*?)\)/g;
        while ((m = blockRe.exec(sourceCode)) !== null) {
          const lineRe = /"([^"]+)"/g;
          let lm;
          while ((lm = lineRe.exec(m[1])) !== null) imports.push(lm[1]);
        }
        break;
      }

      case "rust": {
        const useRe = /use\s+([\w:]+)/g;
        let m;
        while ((m = useRe.exec(sourceCode)) !== null) imports.push(m[1]);
        break;
      }

      case "cpp": {
        const includeRe = /#include\s*[<"]([^>"]+)[>"]/g;
        let m;
        while ((m = includeRe.exec(sourceCode)) !== null) imports.push(m[1]);
        break;
      }

      case "ruby": {
        const requireRe = /require(?:_relative)?\s+['"]([^'"]+)['"]/g;
        let m;
        while ((m = requireRe.exec(sourceCode)) !== null) imports.push(m[1]);
        break;
      }

      case "php": {
        const useRe = /use\s+([\w\\]+)/g;
        let m;
        while ((m = useRe.exec(sourceCode)) !== null) imports.push(m[1]);

        const requireRe = /require(?:_once)?\s*\(?\s*['"]([^'"]+)['"]/g;
        while ((m = requireRe.exec(sourceCode)) !== null) imports.push(m[1]);
        break;
      }

      case "swift": {
        const importRe = /(?:^|\n)\s*import\s+([\w]+)/g;
        let m;
        while ((m = importRe.exec(sourceCode)) !== null) imports.push(m[1]);
        break;
      }

      case "csharp": {
        const usingRe = /using\s+([\w.]+)/g;
        let m;
        while ((m = usingRe.exec(sourceCode)) !== null) imports.push(m[1]);
        break;
      }

      case "dart": {
        const importRe = /import\s+['"]([^'"]+)['"]/g;
        let m;
        while ((m = importRe.exec(sourceCode)) !== null) imports.push(m[1]);
        break;
      }
    }
  } catch {
    // Regex errors shouldn't crash the whole graph
  }

  return imports;
}

// ─── Function Extraction ───────────────────────────────────────────

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
]);

function extractFunctionDefs(sourceCode: string, language: string): string[] {
  const defs: string[] = [];

  try {
    switch (language) {
      case "typescript":
      case "javascript": {
        // function foo(  /  const foo = (  /  foo(  /  foo: (  /  async foo(
        const re = /(?:function\s+|const\s+|let\s+|var\s+)?(\w+)\s*(?:=\s*)?(?:async\s*)?\(|(?:async\s+)?(\w+)\s*\(/g;
        let m;
        while ((m = re.exec(sourceCode)) !== null) {
          const name = m[1] || m[2];
          if (name && !BUILTIN_KEYWORDS.has(name) && name.length > 1) {
            defs.push(name);
          }
        }
        break;
      }

      case "python": {
        const re = /def\s+(\w+)\s*\(/g;
        let m;
        while ((m = re.exec(sourceCode)) !== null) defs.push(m[1]);
        break;
      }

      case "kotlin": {
        const re = /fun\s+(\w+)\s*\(/g;
        let m;
        while ((m = re.exec(sourceCode)) !== null) defs.push(m[1]);
        break;
      }

      case "go": {
        const re = /func\s+(?:\([^)]*\)\s+)?(\w+)\s*\(/g;
        let m;
        while ((m = re.exec(sourceCode)) !== null) defs.push(m[1]);
        break;
      }

      case "java": {
        // (modifiers) returnType name(
        const re = /(?:public|private|protected|static|final|synchronized|abstract|\s)+(\w+)\s*\(/g;
        let m;
        while ((m = re.exec(sourceCode)) !== null) {
          if (!BUILTIN_KEYWORDS.has(m[1]) && m[1].length > 1) defs.push(m[1]);
        }
        break;
      }

      case "rust": {
        const re = /fn\s+(\w+)\s*\(/g;
        let m;
        while ((m = re.exec(sourceCode)) !== null) defs.push(m[1]);
        break;
      }

      case "ruby": {
        const re = /def\s+(\w+)/g;
        let m;
        while ((m = re.exec(sourceCode)) !== null) defs.push(m[1]);
        break;
      }

      case "php": {
        const re = /function\s+(\w+)\s*\(/g;
        let m;
        while ((m = re.exec(sourceCode)) !== null) defs.push(m[1]);
        break;
      }

      case "swift": {
        const re = /func\s+(\w+)\s*\(/g;
        let m;
        while ((m = re.exec(sourceCode)) !== null) defs.push(m[1]);
        break;
      }

      case "csharp": {
        const re = /(?:public|private|protected|internal|static|virtual|override|async|\s)+(\w+)\s*\(/g;
        let m;
        while ((m = re.exec(sourceCode)) !== null) {
          if (!BUILTIN_KEYWORDS.has(m[1]) && m[1].length > 1) defs.push(m[1]);
        }
        break;
      }

      case "cpp": {
        const re = /(\w+)\s+(\w+)\s*\(/g;
        let m;
        while ((m = re.exec(sourceCode)) !== null) {
          if (!BUILTIN_KEYWORDS.has(m[2]) && m[2].length > 1) defs.push(m[2]);
        }
        break;
      }
    }
  } catch {
    // ignore
  }

  return [...new Set(defs)];
}

function extractFunctionCalls(sourceCode: string): string[] {
  const calls: string[] = [];

  try {
    // Universal: word followed by (
    const re = /(\w+)\s*\(/g;
    let m;
    while ((m = re.exec(sourceCode)) !== null) {
      if (!BUILTIN_KEYWORDS.has(m[1]) && m[1].length > 1) {
        calls.push(m[1]);
      }
    }
  } catch {
    // ignore
  }

  return [...new Set(calls)];
}

// ─── Class Extraction ──────────────────────────────────────────────

type ClassDef = {
  name: string;
  extends?: string;
  implements?: string[];
};

function extractClasses(sourceCode: string, language: string): ClassDef[] {
  const classes: ClassDef[] = [];

  try {
    switch (language) {
      case "typescript":
      case "javascript": {
        // class Foo extends Bar implements Baz, Qux
        const re = /class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?/g;
        let m;
        while ((m = re.exec(sourceCode)) !== null) {
          classes.push({
            name: m[1],
            extends: m[2],
            implements: m[3]?.split(",").map(s => s.trim()).filter(Boolean),
          });
        }
        break;
      }

      case "python": {
        // class Foo(Bar, Baz):
        const re = /class\s+(\w+)\s*\(([^)]*)\)/g;
        let m;
        while ((m = re.exec(sourceCode)) !== null) {
          const bases = m[2].split(",").map(s => s.trim()).filter(Boolean);
          classes.push({
            name: m[1],
            extends: bases[0],
            implements: bases.slice(1),
          });
        }
        break;
      }

      case "kotlin": {
        // class Foo : Bar(), Baz
        const re = /class\s+(\w+)\s*(?::\s*([\w<>,\s]+))?/g;
        let m;
        while ((m = re.exec(sourceCode)) !== null) {
          const parents = m[2]?.split(",").map(s => s.trim().replace(/\(\)/g, "")).filter(Boolean) || [];
          classes.push({
            name: m[1],
            extends: parents[0],
            implements: parents.slice(1),
          });
        }
        break;
      }

      case "java": {
        // class Foo extends Bar implements Baz, Qux
        const re = /class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?/g;
        let m;
        while ((m = re.exec(sourceCode)) !== null) {
          classes.push({
            name: m[1],
            extends: m[2],
            implements: m[3]?.split(",").map(s => s.trim()).filter(Boolean),
          });
        }
        break;
      }

      case "cpp": {
        // class Foo : public Bar, private Baz
        const re = /class\s+(\w+)\s*(?::\s*([\w:\s,]+))?/g;
        let m;
        while ((m = re.exec(sourceCode)) !== null) {
          const parents = m[2]?.split(",").map(s => s.trim().replace(/^(public|private|protected|virtual)\s+/, "")).filter(Boolean) || [];
          classes.push({
            name: m[1],
            extends: parents[0],
            implements: parents.slice(1),
          });
        }
        break;
      }

      case "ruby": {
        // class Foo < Bar
        const re = /class\s+(\w+)\s*<\s*(\w+)/g;
        let m;
        while ((m = re.exec(sourceCode)) !== null) {
          classes.push({ name: m[1], extends: m[2] });
        }
        break;
      }

      case "php": {
        // class Foo extends Bar implements Baz
        const re = /class\s+(\w+)(?:\s+extends\s+(\\?\w+))?(?:\s+implements\s+([\w\\,\s]+))?/g;
        let m;
        while ((m = re.exec(sourceCode)) !== null) {
          classes.push({
            name: m[1],
            extends: m[2],
            implements: m[3]?.split(",").map(s => s.trim().replace(/^\\/, "")).filter(Boolean),
          });
        }
        break;
      }

      case "swift": {
        // class Foo: Bar, Baz
        const re = /class\s+(\w+)\s*(?::\s*([\w,\s]+))?/g;
        let m;
        while ((m = re.exec(sourceCode)) !== null) {
          const parents = m[2]?.split(",").map(s => s.trim()).filter(Boolean) || [];
          classes.push({
            name: m[1],
            extends: parents[0],
            implements: parents.slice(1),
          });
        }
        break;
      }

      case "csharp": {
        // class Foo : Bar, Baz
        const re = /class\s+(\w+)\s*(?::\s*([\w,\s]+))?/g;
        let m;
        while ((m = re.exec(sourceCode)) !== null) {
          const parents = m[2]?.split(",").map(s => s.trim()).filter(Boolean) || [];
          classes.push({
            name: m[1],
            extends: parents[0],
            implements: parents.slice(1),
          });
        }
        break;
      }
    }
  } catch {
    // ignore
  }

  return classes;
}

// ─── Graph Builders ────────────────────────────────────────────────

export function buildFileDependencyGraph(files: FileRecord[]): GraphData {
  const knownFiles = new Set(files.map(f => f.fileName));
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const linkSet = new Set<string>();

  for (const file of files) {
    const language = getLanguage(file.fileName);
    if (!language) continue;

    nodes.push({
      id: file.fileName,
      label: file.fileName.split("/").pop() || file.fileName,
      group: language,
      degree: 0,
      summary: file.summary,
    });

    const imports = extractImports(file.sourceCode, language);
    for (const imp of imports) {
      const resolved = resolveImport(imp, file.fileName, knownFiles);
      if (resolved && resolved !== file.fileName) {
        const linkKey = `${file.fileName}->${resolved}`;
        if (!linkSet.has(linkKey)) {
          linkSet.add(linkKey);
          links.push({ source: file.fileName, target: resolved, type: "import" });
        }
      }
    }
  }

  // Calculate degrees
  for (const link of links) {
    const srcNode = nodes.find(n => n.id === link.source);
    const tgtNode = nodes.find(n => n.id === link.target);
    if (srcNode) srcNode.degree++;
    if (tgtNode) tgtNode.degree++;
  }

  return { nodes, links };
}

export function buildCallGraph(files: FileRecord[]): GraphData {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const linkSet = new Set<string>();

  // Build global function → file map
  const functionToFiles = new Map<string, string[]>();
  for (const file of files) {
    const language = getLanguage(file.fileName);
    if (!language) continue;

    const defs = extractFunctionDefs(file.sourceCode, language);
    for (const def of defs) {
      const existing = functionToFiles.get(def) || [];
      existing.push(file.fileName);
      functionToFiles.set(def, existing);
    }
  }

  // For each file, find calls to functions defined in OTHER files
  for (const file of files) {
    const language = getLanguage(file.fileName);
    if (!language) continue;

    nodes.push({
      id: file.fileName,
      label: file.fileName.split("/").pop() || file.fileName,
      group: language,
      degree: 0,
      summary: file.summary,
    });

    const calls = extractFunctionCalls(file.sourceCode);
    for (const call of calls) {
      const definingFiles = functionToFiles.get(call);
      if (!definingFiles) continue;

      for (const defFile of definingFiles) {
        if (defFile !== file.fileName) {
          const linkKey = `${file.fileName}->${defFile}:${call}`;
          if (!linkSet.has(linkKey)) {
            linkSet.add(linkKey);
            links.push({ source: file.fileName, target: defFile, type: "call" });
          }
        }
      }
    }
  }

  // Calculate degrees
  for (const link of links) {
    const srcNode = nodes.find(n => n.id === link.source);
    const tgtNode = nodes.find(n => n.id === link.target);
    if (srcNode) srcNode.degree++;
    if (tgtNode) tgtNode.degree++;
  }

  return { nodes, links };
}

export function buildClassHierarchyGraph(files: FileRecord[]): GraphData {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const linkSet = new Set<string>();

  // Collect all class definitions and build class → file map
  const classToFile = new Map<string, string>();
  const allClasses: { def: ClassDef; file: string }[] = [];

  for (const file of files) {
    const language = getLanguage(file.fileName);
    if (!language) continue;

    const classes = extractClasses(file.sourceCode, language);
    for (const cls of classes) {
      classToFile.set(cls.name, file.fileName);
      allClasses.push({ def: cls, file: file.fileName });
    }
  }

  // Create nodes (one per class)
  for (const { def, file } of allClasses) {
    const language = getLanguage(file) || "unknown";
    nodes.push({
      id: def.name,
      label: def.name,
      group: language,
      degree: 0,
      summary: undefined,
    });
  }

  // Create edges
  for (const { def } of allClasses) {
    if (def.extends && classToFile.has(def.extends)) {
      const linkKey = `${def.name}->${def.extends}:extends`;
      if (!linkSet.has(linkKey)) {
        linkSet.add(linkKey);
        links.push({ source: def.name, target: def.extends, type: "extends" });
      }
    }

    if (def.implements) {
      for (const impl of def.implements) {
        if (classToFile.has(impl)) {
          const linkKey = `${def.name}->${impl}:implements`;
          if (!linkSet.has(linkKey)) {
            linkSet.add(linkKey);
            links.push({ source: def.name, target: impl, type: "implements" });
          }
        }
      }
    }
  }

  // Calculate degrees
  for (const link of links) {
    const srcNode = nodes.find(n => n.id === link.source);
    const tgtNode = nodes.find(n => n.id === link.target);
    if (srcNode) srcNode.degree++;
    if (tgtNode) tgtNode.degree++;
  }

  return { nodes, links };
}

export function buildGraph(files: FileRecord[], type: GraphType): GraphData {
  try {
    // Filter to code files only
    const codeFiles = files.filter(f => isCodeFile(f.fileName));

    switch (type) {
      case "files":
        return buildFileDependencyGraph(codeFiles);
      case "calls":
        return buildCallGraph(codeFiles);
      case "classes":
        return buildClassHierarchyGraph(codeFiles);
      default:
        return { nodes: [], links: [] };
    }
  } catch (error) {
    logError("BuildGraph", "Error building graph:", error);
    return { nodes: [], links: [] };
  }
}
