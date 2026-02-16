interface QueryLike<TData> {
  data: TData | undefined;
  isPending: boolean;
  isFetching: boolean;
}

export function getQueryLoadState<TData>(query: QueryLike<TData>) {
  const hasData = query.data !== undefined;

  return {
    isInitialLoading: query.isPending && !hasData,
    isRefreshing: query.isFetching && hasData,
  };
}
