import {
  useQuery as useTanstackQuery,
  useQueryClient,
  type AnyUseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

type DirectQueryState = {
  data: unknown;
  error: Error | null;
  fetchStatus: "fetching" | "idle";
  status: "pending" | "error" | "success";
};

function queryKeyHash(queryKey: readonly unknown[]) {
  return JSON.stringify(queryKey);
}

function normalizeError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

function useWeappDirectQuery(options: AnyUseQueryOptions): UseQueryResult {
  const queryClient = useQueryClient();
  const keyHash = queryKeyHash(options.queryKey);
  const enabled = options.enabled !== false;
  const cachedData = queryClient.getQueryData(options.queryKey);
  const [state, setState] = useState<DirectQueryState>(() => ({
    data: cachedData,
    error: null,
    fetchStatus: "idle",
    status: cachedData === undefined ? "pending" : "success",
  }));
  const stateRef = useRef(state);
  const mountedRef = useRef(true);
  const requestSequenceRef = useRef(0);
  const fetchingRef = useRef(false);
  const queryFnRef = useRef(options.queryFn);
  const selectRef = useRef(options.select);
  const retryRef = useRef(options.retry);
  const intervalRef = useRef(options.refetchInterval);
  const queryKeyRef = useRef(options.queryKey);
  stateRef.current = state;
  queryFnRef.current = options.queryFn;
  selectRef.current = options.select;
  retryRef.current = options.retry;
  intervalRef.current = options.refetchInterval;
  queryKeyRef.current = options.queryKey;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestSequenceRef.current += 1;
    };
  }, []);

  const execute = useCallback(async () => {
    const queryFn = queryFnRef.current;
    if (typeof queryFn !== "function") {
      return { data: stateRef.current.data };
    }

    const requestSequence = ++requestSequenceRef.current;
    const queryKey = queryKeyRef.current;
    fetchingRef.current = true;
    setState((current) => ({
      ...current,
      error: null,
      fetchStatus: "fetching",
    }));

    const configuredRetry = retryRef.current;
    const retryCount = configuredRetry === false
      ? 0
      : typeof configuredRetry === "number"
        ? configuredRetry
        : 1;

    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      try {
        const queryData = await (queryFn as () => Promise<unknown>)();
        const data = typeof selectRef.current === "function"
          ? selectRef.current(queryData)
          : queryData;

        if (mountedRef.current && requestSequence === requestSequenceRef.current) {
          fetchingRef.current = false;
          queryClient.setQueryData(queryKey, data);
          setState({
            data,
            error: null,
            fetchStatus: "idle",
            status: "success",
          });
        }
        return { data };
      } catch (error) {
        if (attempt < retryCount) {
          continue;
        }

        const normalizedError = normalizeError(error);
        if (mountedRef.current && requestSequence === requestSequenceRef.current) {
          fetchingRef.current = false;
          setState((current) => ({
            ...current,
            error: normalizedError,
            fetchStatus: "idle",
            status: "error",
          }));
        }
        return { data: undefined, error: normalizedError };
      }
    }

    return { data: undefined };
  }, [keyHash, queryClient]);

  useEffect(() => {
    requestSequenceRef.current += 1;
    fetchingRef.current = false;
    const cached = queryClient.getQueryData(queryKeyRef.current);
    setState({
      data: cached,
      error: null,
      fetchStatus: "idle",
      status: cached === undefined ? "pending" : "success",
    });

    if (enabled) {
      void execute();
    }
  }, [enabled, execute, keyHash, queryClient]);

  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        if (queryKeyHash(event.query.queryKey) !== keyHash) {
          return;
        }

        const cacheState = event.query.state;
        if (cacheState.data !== undefined) {
          setState((current) => ({
            ...current,
            data: cacheState.data,
            error: null,
            status: "success",
          }));
        }

        if (enabled && cacheState.isInvalidated && !fetchingRef.current) {
          void execute();
        }
      }),
    [enabled, execute, keyHash, queryClient]
  );

  useEffect(() => {
    if (!enabled || state.fetchStatus === "fetching") {
      return undefined;
    }

    const configuredInterval = intervalRef.current;
    const interval = typeof configuredInterval === "function"
      ? (configuredInterval as (query: unknown) => number | false | undefined)({
          state: { data: state.data },
        })
      : configuredInterval;
    if (typeof interval !== "number" || interval <= 0) {
      return undefined;
    }

    const timer = setTimeout(() => {
      void execute();
    }, interval);
    return () => clearTimeout(timer);
  }, [enabled, execute, state.data, state.fetchStatus]);

  const isPending = state.status === "pending";
  const isFetching = state.fetchStatus === "fetching";
  return {
    data: state.data,
    dataUpdatedAt: 0,
    error: state.error,
    errorUpdateCount: state.error ? 1 : 0,
    errorUpdatedAt: 0,
    failureCount: state.error ? 1 : 0,
    failureReason: state.error,
    fetchStatus: state.fetchStatus,
    isError: state.status === "error",
    isFetched: state.status !== "pending",
    isFetchedAfterMount: state.status !== "pending",
    isFetching,
    isInitialLoading: isPending && isFetching,
    isLoading: isPending,
    isLoadingError: state.status === "error" && state.data === undefined,
    isPaused: false,
    isPending,
    isPlaceholderData: false,
    isRefetchError: state.status === "error" && state.data !== undefined,
    isRefetching: isFetching && !isPending,
    isStale: true,
    isSuccess: state.status === "success",
    promise: Promise.resolve(state.data),
    refetch: execute,
    status: state.status,
  } as UseQueryResult;
}

export const useMobileQuery = (
  process.env.TARO_ENV === "weapp" ? useWeappDirectQuery : useTanstackQuery
) as typeof useTanstackQuery;
