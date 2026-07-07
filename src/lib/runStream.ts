import { createRunsRealtimeClient, type RunRealtimeConnection } from "@lingban/api-sdk";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { serverRealtimeMessageSchema, type RunSnapshot } from "@lingban/contracts";
import { applyBridgeEventToRunSnapshot } from "@lingban/domain-models";
import { mobileApiBaseUrl } from "./api";

function upsertRunSnapshot(list: RunSnapshot[] | undefined, snapshot: RunSnapshot) {
  const current = list ?? [];
  const index = current.findIndex((item) => item.run.runId === snapshot.run.runId);

  if (index === -1) {
    return [snapshot, ...current];
  }

  return current.map((item, itemIndex) => (itemIndex === index ? snapshot : item));
}

const mobileRunsRealtime = createRunsRealtimeClient({
  baseUrl: mobileApiBaseUrl,
});

type MobileRunStreamState = {
  connected: boolean;
  transport: "idle" | "ws" | "sse";
  sendMessage(text: string): boolean;
};

export function useMobileRunStream(runId: string | null, enabled = true) {
  const queryClient = useQueryClient();
  const connectionRef = useRef<RunRealtimeConnection | null>(null);
  const [connected, setConnected] = useState(false);
  const [transport, setTransport] = useState<MobileRunStreamState["transport"]>("idle");

  useEffect(() => {
    connectionRef.current?.close();
    connectionRef.current = null;
    setConnected(false);
    setTransport("idle");

    if (!enabled || !runId) {
      return;
    }

    const syncSnapshot = (snapshot: RunSnapshot) => {
      queryClient.setQueryData(["mobile", "runs", runId], snapshot);
      queryClient.setQueryData(["mobile", "runs"], (current: RunSnapshot[] | undefined) =>
        upsertRunSnapshot(current, snapshot)
      );
      queryClient.setQueryData(["mobile", "runs", runId, "files"], snapshot.files);
    };

    if (typeof WebSocket !== "undefined") {
      const connection = mobileRunsRealtime.connect(runId, {
        onOpen: () => {
          setConnected(true);
          setTransport("ws");
        },
        onClose: () => {
          setConnected(false);
        },
        onSnapshot: syncSnapshot,
        onEvent: (event) => {
          const current = queryClient.getQueryData<RunSnapshot>(["mobile", "runs", runId]);
          if (!current) {
            return;
          }

          const next = applyBridgeEventToRunSnapshot(current, event);
          syncSnapshot(next);
        },
      });

      connectionRef.current = connection;

      return () => {
        connection.close();
        if (connectionRef.current === connection) {
          connectionRef.current = null;
        }
        setConnected(false);
        setTransport("idle");
      };
    }

    if (typeof EventSource === "undefined") {
      return;
    }

    setConnected(true);
    setTransport("sse");

    const source = new EventSource(`${mobileApiBaseUrl}/v1/runs/${runId}/stream`);

    const handleRealtimePayload = (event: MessageEvent<string>) => {
      const parsed = serverRealtimeMessageSchema.parse(JSON.parse(event.data) as unknown);

      if (parsed.type === "runs.snapshot") {
        syncSnapshot(parsed.payload);
        return;
      }

      if (parsed.type !== "runs.event") {
        return;
      }

      const current = queryClient.getQueryData<RunSnapshot>(["mobile", "runs", runId]);
      if (!current) {
        return;
      }

      const next = applyBridgeEventToRunSnapshot(current, parsed.payload);
      syncSnapshot(next);
    };

    source.addEventListener("runs.snapshot", handleRealtimePayload as EventListener);
    source.addEventListener("runs.event", handleRealtimePayload as EventListener);

    return () => {
      source.close();
      setConnected(false);
      setTransport("idle");
    };
  }, [enabled, queryClient, runId]);

  return {
    connected,
    transport,
    sendMessage(text: string) {
      if (!connectionRef.current?.isOpen()) {
        return false;
      }

      connectionRef.current.sendMessage({
        text,
        attachments: [],
      });
      return true;
    },
  } satisfies MobileRunStreamState;
}
