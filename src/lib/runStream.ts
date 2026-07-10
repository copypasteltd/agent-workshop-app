import { createRunsRealtimeClient, type RunRealtimeConnection } from "@lingban/api-sdk";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  type ApproveRunInput,
  type RunSnapshot,
  type SendRunMessageInput,
} from "@lingban/contracts";
import { applyBridgeEventToRunSnapshot } from "@lingban/domain-models";
import { mobileApiBaseUrl } from "./api";
import { mobileRunDetailQueryKey, mobileRunFilesQueryKey } from "./runQueryKeys";
import { useMobileAuthStore } from "../stores/mobileAuthStore";

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
  getAccessToken: () => useMobileAuthStore.getState().tokens?.accessToken,
});

type MobileRunStreamState = {
  connected: boolean;
  transport: "idle" | "ws" | "sse";
  sendMessage(input: SendRunMessageInput): boolean;
  approve(input: ApproveRunInput): boolean;
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
      queryClient.setQueryData(mobileRunDetailQueryKey(runId), snapshot);
      queryClient.setQueryData(["mobile", "runs"], (current: RunSnapshot[] | undefined) =>
        upsertRunSnapshot(current, snapshot)
      );
      queryClient.setQueryData(mobileRunFilesQueryKey(runId), snapshot.files);
    };

    const connection = mobileRunsRealtime.connect(runId, {
      onOpen: () => {
        setConnected(true);
      },
      onClose: () => {
        setConnected(false);
        setTransport("idle");
      },
      onTransport: (nextTransport) => {
        setTransport(nextTransport);
      },
      onSnapshot: syncSnapshot,
      onEvent: (event) => {
        const current = queryClient.getQueryData<RunSnapshot>(mobileRunDetailQueryKey(runId));
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
  }, [enabled, queryClient, runId]);

  return {
    connected,
    transport,
    sendMessage(input: SendRunMessageInput) {
      if (!connectionRef.current?.isOpen()) {
        return false;
      }

      connectionRef.current.sendMessage(input);
      return true;
    },
    approve(input: ApproveRunInput) {
      if (!connectionRef.current?.isOpen()) {
        return false;
      }

      connectionRef.current.approve(input);
      return true;
    },
  } satisfies MobileRunStreamState;
}
