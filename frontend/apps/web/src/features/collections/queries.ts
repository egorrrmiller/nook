import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CollectionDocument, CollectionRow, CollectionView, CollectionViewPatch, JsonValue } from './model';
import { collectionTransport } from './transport';

export const collectionKeys = {
  document: (workspaceId: string, collectionId: string) => ['collections', workspaceId, collectionId] as const,
};

export function collectionQuery(workspaceId: string, collectionId: string) {
  return queryOptions<CollectionDocument>({
    queryKey: collectionKeys.document(workspaceId, collectionId),
    queryFn: ({ signal }) => collectionTransport.get(collectionId, signal),
    staleTime: 15_000,
  });
}

export function useCollection(workspaceId: string, collectionId: string, enabled = true) {
  return useQuery({ ...collectionQuery(workspaceId, collectionId), enabled });
}

export function useUpdateCollectionRow(workspaceId: string, collectionId: string) {
  const queryClient = useQueryClient();
  const key = collectionKeys.document(workspaceId, collectionId);
  return useMutation({
    mutationFn: ({ rowId, propertyId, value }: { rowId: string; propertyId: string; value: JsonValue }) =>
      collectionTransport.patchRowProperty(collectionId, rowId, { propertyId, value }),
    onMutate: async ({ rowId, propertyId, value }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CollectionDocument>(key);
      if (previous) {
        queryClient.setQueryData<CollectionDocument>(key, {
          ...previous,
          rows: previous.rows.map((row) =>
            row.id === rowId ? { ...row, properties: { ...row.properties, [propertyId]: value } } : row,
          ),
        });
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSuccess: (row) => {
      queryClient.setQueryData<CollectionDocument>(key, (document) =>
        document
          ? { ...document, rows: document.rows.map((current) => (current.id === row.id ? row : current)) }
          : document,
      );
    },
  });
}

export function useUpdateCollectionView(workspaceId: string, collectionId: string) {
  const queryClient = useQueryClient();
  const key = collectionKeys.document(workspaceId, collectionId);
  return useMutation({
    mutationFn: ({ viewId, config }: { viewId: string; config: CollectionViewPatch['config'] }) =>
      collectionTransport.patchView(collectionId, viewId, { config }),
    onMutate: async ({ viewId, config }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CollectionDocument>(key);
      if (previous) {
        queryClient.setQueryData<CollectionDocument>(key, {
          ...previous,
          views: previous.views.map((view) => (view.id === viewId ? { ...view, config } : view)),
        });
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSuccess: (view) => {
      queryClient.setQueryData<CollectionDocument>(key, (document) =>
        document
          ? { ...document, views: document.views.map((current) => (current.id === view.id ? view : current)) }
          : document,
      );
    },
  });
}

export type { CollectionRow, CollectionView };

