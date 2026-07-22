export type AgentMessageImageReference = {
  key: string;
  label: string;
  filePath: string;
  originalSource: string;
};

export type AgentMessageImageAttachment = {
  label: string;
  path: string;
};

type ImageCandidate = {
  label: string | null;
  source: string;
  start: number | null;
  end: number | null;
};

const imageExtensionPattern = /\.(?:png|jpe?g|gif|webp|svg)(?:[?#].*)?$/i;
const remoteSourcePattern = /^(?:https?:|data:|blob:|\/\/|#)/i;

function decodeImageSource(value: string) {
  const trimmed = value.trim().replace(/^<|>$/g, "");
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

function stripMarkdownTitle(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("<")) {
    const end = trimmed.indexOf(">");
    return end > 0 ? trimmed.slice(1, end) : trimmed;
  }

  const titleMatch = trimmed.match(/^(.+?)\s+(?:"[^"]*"|'[^']*')\s*$/);
  return titleMatch?.[1] ?? trimmed;
}

function collectMarkdownImages(text: string) {
  const candidates: ImageCandidate[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const start = text.indexOf("![", cursor);
    if (start < 0) break;
    const altEnd = text.indexOf("](", start + 2);
    if (altEnd < 0) break;

    let index = altEnd + 2;
    let depth = 1;
    let quote: string | null = null;
    let escaped = false;
    for (; index < text.length; index += 1) {
      const character = text[index]!;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (quote) {
        if (character === quote) quote = null;
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        continue;
      }
      if (character === "(") depth += 1;
      if (character === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }

    if (depth !== 0) {
      cursor = altEnd + 2;
      continue;
    }

    candidates.push({
      label: text.slice(start + 2, altEnd).trim() || null,
      source: stripMarkdownTitle(text.slice(altEnd + 2, index)),
      start,
      end: index + 1,
    });
    cursor = index + 1;
  }

  return candidates;
}

function collectHtmlImages(text: string) {
  const candidates: ImageCandidate[] = [];
  const pattern = /<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    candidates.push({
      label: null,
      source: match[2] ?? "",
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return candidates;
}

function collectPathMentions(text: string) {
  const candidates: ImageCandidate[] = [];
  const pattern = /(?:^|[\s'"`(:])((?:\.\.\/|\.\/|\/workspace\/target\/|(?:[\w.-]+\/)+)?[\w.-]+\.(?:png|jpe?g|gif|webp|svg)(?:[?#][^\s<>"'`]*)?)/gim;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    candidates.push({ label: null, source: match[1] ?? "", start: null, end: null });
  }
  return candidates;
}

function normalizedRoot(value: string) {
  return value.trim().replace(/\\/g, "/").replace(/\/+$/, "");
}

function normalizeRelativeSegments(value: string) {
  const segments: string[] = [];
  for (const segment of value.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

export function normalizeAgentImagePath(source: string, targetPath: string) {
  let decoded = decodeImageSource(source).replace(/\\/g, "/");
  if (!decoded || remoteSourcePattern.test(decoded) || !imageExtensionPattern.test(decoded)) {
    return null;
  }

  decoded = decoded.replace(/[?#].*$/, "");
  if (/^file:\/\//i.test(decoded)) decoded = decoded.replace(/^file:\/\//i, "");

  const root = normalizedRoot(targetPath);
  let relative = decoded;
  if (root && (decoded === root || decoded.startsWith(`${root}/`))) {
    relative = decoded.slice(root.length);
  } else if (decoded === "/workspace/target" || decoded.startsWith("/workspace/target/")) {
    relative = decoded.slice("/workspace/target".length);
  } else if (/^(?:[A-Za-z]:)?\//.test(decoded)) {
    return null;
  }

  const normalized = normalizeRelativeSegments(relative.replace(/^\/+/, ""));
  return normalized && imageExtensionPattern.test(normalized) ? normalized : null;
}

function cleanMessageText(text: string, candidates: ImageCandidate[]) {
  const spans = candidates
    .filter((candidate) => candidate.start != null && candidate.end != null)
    .map((candidate) => ({ start: candidate.start!, end: candidate.end! }))
    .sort((left, right) => right.start - left.start);
  let result = text;
  for (const span of spans) {
    result = `${result.slice(0, span.start)}${result.slice(span.end)}`;
  }
  return result
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseAgentMessageImages(
  text: string,
  targetPath: string,
  attachments: AgentMessageImageAttachment[] = []
) {
  const embeddedCandidates = [
    ...collectMarkdownImages(text),
    ...collectHtmlImages(text),
    ...collectPathMentions(text),
  ];
  const candidates = [
    ...embeddedCandidates,
    ...attachments.map((attachment) => ({
      label: attachment.label,
      source: attachment.path,
      start: null,
      end: null,
    })),
  ];
  const images = new Map<string, AgentMessageImageReference>();
  const acceptedEmbeddedCandidates: ImageCandidate[] = [];

  for (const candidate of candidates) {
    const filePath = normalizeAgentImagePath(candidate.source, targetPath);
    if (!filePath) continue;
    if (candidate.start != null && candidate.end != null) {
      acceptedEmbeddedCandidates.push(candidate);
    }
    if (images.has(filePath)) continue;
    const pathSegments = filePath.split("/");
    const fallbackLabel = pathSegments[pathSegments.length - 1] ?? filePath;
    images.set(filePath, {
      key: filePath,
      label: candidate.label?.trim() || fallbackLabel,
      filePath,
      originalSource: candidate.source,
    });
  }

  return {
    displayText: cleanMessageText(text, acceptedEmbeddedCandidates),
    images: [...images.values()],
  };
}

export function isAgentImageAttachment(path: string, targetPath: string) {
  return normalizeAgentImagePath(path, targetPath) !== null;
}
