import { logError } from "./logger";
import { extractFromSource, SUPPORTED_LANGUAGES } from "./ast-parser";

export type GraphType = "files" | "calls";

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
  type: "import" | "call";
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

type ParsedFile = {
  fileName: string;
  language: string;
  summary: string;
  imports: string[];
  functionDefs: string[];
  functionCalls: string[];
};

const LANGUAGE_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "tsx",
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

function isSupportedLanguage(fileName: string): boolean {
  const lang = getLanguage(fileName);
  return lang !== null && SUPPORTED_LANGUAGES.has(lang);
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

  const isRelative = importPath.startsWith("./") ||
    importPath.startsWith("../") ||
    importPath.startsWith("/");

  if (isRelative) {
    const dir = getDir(fromFile);
    const base = joinPath(dir, importPath);

    if (knownFiles.has(base)) return base;

    for (const ext of RESOLVE_EXTENSIONS) {
      if (knownFiles.has(base + ext)) return base + ext;
    }

    for (const ext of RESOLVE_EXTENSIONS) {
      if (knownFiles.has(base + "/index" + ext)) return base + "/index" + ext;
    }
  }

  const stripped = importPath
    .replace(/^@\//, "")
    .replace(/^@[\w-]+\//, "")
    .replace(/^~\//, "")
    .replace(/^src\//, "");

  if (stripped !== importPath) {
    const candidates = [...knownFiles].filter(f => f.endsWith(stripped));
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      return candidates.sort((a, b) => a.length - b.length)[0];
    }

    for (const ext of RESOLVE_EXTENSIONS) {
      const withExt = stripped + ext;
      const matches = [...knownFiles].filter(f => f.endsWith(withExt));
      if (matches.length === 1) return matches[0];
    }
  }

  const asPath = importPath.replace(/\./g, "/");
  for (const ext of RESOLVE_EXTENSIONS) {
    const withExt = asPath + ext;
    const matches = [...knownFiles].filter(f => f.endsWith(withExt));
    if (matches.length >= 1) {
      return matches.sort((a, b) => a.length - b.length)[0];
    }
  }

  {
    const matches = [...knownFiles].filter(f => f.endsWith(asPath));
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      return matches.sort((a, b) => a.length - b.length)[0];
    }
  }

  return null;
}

async function parseFiles(files: FileRecord[]): Promise<ParsedFile[]> {
  const results = await Promise.all(
    files.map(async (file) => {
      const language = getLanguage(file.fileName);
      if (!language || !SUPPORTED_LANGUAGES.has(language)) return null;

      const extraction = await extractFromSource(file.sourceCode, language);
      return {
        fileName: file.fileName,
        language,
        summary: file.summary,
        imports: extraction.imports,
        functionDefs: extraction.functionDefs,
        functionCalls: extraction.functionCalls,
      };
    })
  );
  return results.filter((r): r is ParsedFile => r !== null);
}

async function buildFileDependencyGraph(files: FileRecord[]): Promise<GraphData> {
  const parsed = await parseFiles(files);
  const knownFiles = new Set(parsed.map(f => f.fileName));
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const linkSet = new Set<string>();

  for (const file of parsed) {
    nodes.push({
      id: file.fileName,
      label: file.fileName.split("/").pop() || file.fileName,
      group: file.language,
      degree: 0,
      summary: file.summary,
    });

    for (const imp of file.imports) {
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

  for (const link of links) {
    const srcNode = nodes.find(n => n.id === link.source);
    const tgtNode = nodes.find(n => n.id === link.target);
    if (srcNode) srcNode.degree++;
    if (tgtNode) tgtNode.degree++;
  }

  return { nodes, links };
}

async function buildCallGraph(files: FileRecord[]): Promise<GraphData> {
  const parsed = await parseFiles(files);
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const linkSet = new Set<string>();

  const functionToFiles = new Map<string, string[]>();
  for (const file of parsed) {
    for (const def of file.functionDefs) {
      const existing = functionToFiles.get(def) || [];
      existing.push(file.fileName);
      functionToFiles.set(def, existing);
    }
  }

  for (const file of parsed) {
    nodes.push({
      id: file.fileName,
      label: file.fileName.split("/").pop() || file.fileName,
      group: file.language,
      degree: 0,
      summary: file.summary,
    });

    for (const call of file.functionCalls) {
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

  for (const link of links) {
    const srcNode = nodes.find(n => n.id === link.source);
    const tgtNode = nodes.find(n => n.id === link.target);
    if (srcNode) srcNode.degree++;
    if (tgtNode) tgtNode.degree++;
  }

  return { nodes, links };
}

export async function buildGraph(files: FileRecord[], type: GraphType): Promise<GraphData> {
  try {
    const codeFiles = files.filter(f => isCodeFile(f.fileName) && isSupportedLanguage(f.fileName));

    switch (type) {
      case "files":
        return await buildFileDependencyGraph(codeFiles);
      case "calls":
        return await buildCallGraph(codeFiles);
      default:
        return { nodes: [], links: [] };
    }
  } catch (error) {
    logError("BuildGraph", "Error building graph:", error);
    return { nodes: [], links: [] };
  }
}
