import Taro from "@tarojs/taro";

type HeaderRecord = Record<string, string>;

function normalizeRequestHeaders(headers?: HeadersInit): HeaderRecord {
  const normalized: HeaderRecord = {};
  if (!headers) {
    return normalized;
  }

  if (Array.isArray(headers)) {
    for (const [name, value] of headers) {
      normalized[name] = String(value);
    }
    return normalized;
  }

  if (typeof (headers as Headers).forEach === "function") {
    (headers as Headers).forEach((value, name) => {
      normalized[name] = value;
    });
    return normalized;
  }

  for (const [name, value] of Object.entries(headers)) {
    normalized[name] = String(value);
  }
  return normalized;
}

function normalizeResponseHeaders(headers: TaroGeneral.IAnyObject): HeaderRecord {
  const normalized: HeaderRecord = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    normalized[name.toLowerCase()] = Array.isArray(value)
      ? value.join(", ")
      : String(value);
  }
  return normalized;
}

function requestBodyToTaroData(body: BodyInit | null | undefined) {
  if (body == null || typeof body === "string" || body instanceof ArrayBuffer) {
    return body ?? undefined;
  }

  if (ArrayBuffer.isView(body)) {
    return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
  }

  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    return body.toString();
  }

  throw new TypeError("The mini-program request body type is unsupported.");
}

function encodeUtf8(value: string) {
  const encoded = encodeURIComponent(value);
  const bytes: number[] = [];

  for (let index = 0; index < encoded.length; index += 1) {
    if (encoded[index] === "%") {
      bytes.push(Number.parseInt(encoded.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(encoded.charCodeAt(index));
    }
  }

  return new Uint8Array(bytes).buffer;
}

function createResponseHeaders(headers: HeaderRecord) {
  return {
    get(name: string) {
      return headers[name.toLowerCase()] ?? null;
    },
    has(name: string) {
      return Object.prototype.hasOwnProperty.call(headers, name.toLowerCase());
    },
    forEach(callback: (value: string, key: string) => void) {
      for (const [key, value] of Object.entries(headers)) {
        callback(value, key);
      }
    },
  } as Headers;
}

function createTaroResponse(input: {
  url: string;
  status: number;
  headers: TaroGeneral.IAnyObject;
  data: unknown;
}): Response {
  const responseHeaders = normalizeResponseHeaders(input.headers);
  const readText = () =>
    typeof input.data === "string" ? input.data : JSON.stringify(input.data ?? null);
  const readArrayBuffer = () => {
    if (input.data instanceof ArrayBuffer) {
      return input.data;
    }
    if (ArrayBuffer.isView(input.data)) {
      return input.data.buffer.slice(
        input.data.byteOffset,
        input.data.byteOffset + input.data.byteLength
      );
    }
    return encodeUtf8(readText());
  };

  return {
    ok: input.status >= 200 && input.status < 300,
    redirected: false,
    status: input.status,
    statusText: "",
    type: "basic",
    url: input.url,
    headers: createResponseHeaders(responseHeaders),
    body: null,
    bodyUsed: false,
    async arrayBuffer() {
      return readArrayBuffer();
    },
    async blob() {
      if (typeof Blob === "undefined") {
        throw new Error("Blob responses are unavailable in this mini-program runtime.");
      }
      return new Blob([readArrayBuffer()], {
        type: responseHeaders["content-type"] ?? "application/octet-stream",
      });
    },
    async bytes() {
      return new Uint8Array(readArrayBuffer());
    },
    async formData() {
      throw new Error("FormData responses are unavailable in this mini-program runtime.");
    },
    async json() {
      return typeof input.data === "string" ? JSON.parse(input.data) : input.data;
    },
    async text() {
      return readText();
    },
    clone() {
      return createTaroResponse(input);
    },
  } as Response;
}

function createAbortError() {
  const error = new Error("The request was aborted.");
  error.name = "AbortError";
  return error;
}

export const taroRequestFetch: typeof fetch = ((
  input: RequestInfo | URL,
  init?: RequestInit
) => {
  const url = typeof input === "string" ? input : input.toString();

  return new Promise<Response>((resolve, reject) => {
    if (init?.signal?.aborted) {
      reject(createAbortError());
      return;
    }

    let settled = false;
    const requestTask = Taro.request<string | TaroGeneral.IAnyObject | ArrayBuffer>({
      url,
      method: (init?.method?.toUpperCase() ?? "GET") as keyof Taro.request.Method,
      header: normalizeRequestHeaders(init?.headers),
      data: requestBodyToTaroData(init?.body),
      dataType: "text",
      responseType: "text",
      success(result) {
        settled = true;
        resolve(
          createTaroResponse({
            url,
            status: result.statusCode,
            headers: result.header,
            data: result.data,
          })
        );
      },
      fail(result) {
        settled = true;
        reject(new TypeError(result.errMsg || "Mini-program network request failed."));
      },
    });

    init?.signal?.addEventListener(
      "abort",
      () => {
        if (!settled) {
          requestTask.abort();
          reject(createAbortError());
        }
      },
      { once: true }
    );
  });
}) as typeof fetch;
