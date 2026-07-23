export type AgentMessageMediaKind = "image" | "video";

export type AgentMessageMediaReference = {
  key: string;
  kind: AgentMessageMediaKind;
  label: string;
  filePath: string;
  originalSource: string;
};

export type AgentMessageImageReference = AgentMessageMediaReference & { kind: "image" };

export type AgentMessageImageAttachment = {
  label: string;
  path: string;
};

type MediaCandidate = {
  label: string | null;
  source: string;
  start: number | null;
  end: number | null;
};

const imageExtensionPattern = /\.(?:png|jpe?g|gif|webp|svg)(?:[?#].*)?$/i;
const videoExtensionPattern = /\.(?:mp4|webm|mov|m4v|ogv|ogg)(?:[?#].*)?$/i;
const mediaExtensionPattern = /\.(?:png|jpe?g|gif|webp|svg|mp4|webm|mov|m4v|ogv|ogg)(?:[?#].*)?$/i;
const remoteSourcePattern = /^(?:https?:|data:|blob:|\/\/|#)/i;

function decodeMediaSource(value: string) {
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

export function getAgentMediaKind(source: string): AgentMessageMediaKind | null {
  if (imageExtensionPattern.test(source)) return "image";
  if (videoExtensionPattern.test(source)) return "video";
  return null;
}

function collectMarkdownMedia(text: string) {
  const candidates: MediaCandidate[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const bracketStart = text.indexOf("[", cursor);
    if (bracketStart < 0) break;
    const start = bracketStart > 0 && text[bracketStart - 1] === "!" ? bracketStart - 1 : bracketStart;
    const labelStart = bracketStart + 1;
    const labelEnd = text.indexOf("](", labelStart);
    if (labelEnd < 0) break;

    let index = labelEnd + 2;
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
      cursor = labelEnd + 2;
      continue;
    }

    const source = stripMarkdownTitle(text.slice(labelEnd + 2, index));
    if (getAgentMediaKind(source)) {
      candidates.push({
        label: text.slice(labelStart, labelEnd).trim() || null,
        source,
        start,
        end: index + 1,
      });
    }
    cursor = index + 1;
  }

  return candidates;
}

function collectHtmlMedia(text: string) {
  const candidates: MediaCandidate[] = [];
  const videoSpans: Array<{ start: number; end: number }> = [];
  const videoPattern = /<video\b[^>]*>[\s\S]*?<\/video\s*>/gi;
  let match: RegExpExecArray | null;
  while ((match = videoPattern.exec(text)) !== null) {
    const sourceMatch = /<(?:video|source)\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/i.exec(match[0]);
    if (!sourceMatch) continue;
    const start = match.index;
    const end = match.index + match[0].length;
    candidates.push({
      label: null,
      source: sourceMatch[2] ?? "",
      start,
      end,
    });
    videoSpans.push({ start, end });
  }

  const tagPattern = /<(?:img|video|source)\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gi;
  while ((match = tagPattern.exec(text)) !== null) {
    const start = match.index;
    const end = match.index + match[0].length;
    if (videoSpans.some((span) => start >= span.start && end <= span.end)) continue;
    candidates.push({ label: null, source: match[2] ?? "", start, end });
  }
  return candidates;
}

function collectPathMentions(text: string) {
  const candidates: MediaCandidate[] = [];
  const pattern = /(?:^|[\s'"`(:])((?:\.\.\/|\.\/|\/workspace\/target\/|(?:[\w.-]+\/)+)?[\w.-]+\.(?:png|jpe?g|gif|webp|svg|mp4|webm|mov|m4v|ogv|ogg)(?:[?#][^\s<>"'`]*)?)/gim;
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

export function normalizeAgentMediaPath(source: string, targetPath: string) {
  let decoded = decodeMediaSource(source).replace(/\\/g, "/");
  if (!decoded || remoteSourcePattern.test(decoded) || !mediaExtensionPattern.test(decoded)) {
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
  return normalized && mediaExtensionPattern.test(normalized) ? normalized : null;
}

export function normalizeAgentImagePath(source: string, targetPath: string) {
  return imageExtensionPattern.test(source) ? normalizeAgentMediaPath(source, targetPath) : null;
}

function cleanMessageText(text: string, candidates: MediaCandidate[]) {
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

export function parseAgentMessageMedia(
  text: string,
  targetPath: string,
  attachments: AgentMessageImageAttachment[] = []
) {
  const embeddedCandidates = [
    ...collectMarkdownMedia(text),
    ...collectHtmlMedia(text),
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
  const media = new Map<string, AgentMessageMediaReference>();
  const acceptedEmbeddedCandidates: MediaCandidate[] = [];

  for (const candidate of candidates) {
    const filePath = normalizeAgentMediaPath(candidate.source, targetPath);
    const kind = filePath ? getAgentMediaKind(filePath) : null;
    if (!filePath || !kind) continue;
    if (candidate.start != null && candidate.end != null) {
      acceptedEmbeddedCandidates.push(candidate);
    }
    if (media.has(filePath)) continue;
    const pathSegments = filePath.split("/");
    const fallbackLabel = pathSegments[pathSegments.length - 1] ?? filePath;
    media.set(filePath, {
      key: `${kind}:${filePath}`,
      kind,
      label: candidate.label?.trim() || fallbackLabel,
      filePath,
      originalSource: candidate.source,
    });
  }

  const references = [...media.values()];
  return {
    displayText: cleanMessageText(text, acceptedEmbeddedCandidates),
    media: references,
    images: references.filter((item): item is AgentMessageImageReference => item.kind === "image"),
    videos: references.filter((item) => item.kind === "video"),
  };
}

export function parseAgentMessageImages(
  text: string,
  targetPath: string,
  attachments: AgentMessageImageAttachment[] = []
) {
  return parseAgentMessageMedia(text, targetPath, attachments);
}

export function isAgentImageAttachment(path: string, targetPath: string) {
  return normalizeAgentImagePath(path, targetPath) !== null;
}

export function isAgentVideoAttachment(path: string, targetPath: string) {
  const normalized = normalizeAgentMediaPath(path, targetPath);
  return normalized != null && getAgentMediaKind(normalized) === "video";
}

export function isAgentMediaAttachment(path: string, targetPath: string) {
  return normalizeAgentMediaPath(path, targetPath) !== null;
}
