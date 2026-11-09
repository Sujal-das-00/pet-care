// Controller layer for communities, posts and events.
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { CommunityApi, EventApi, SafetyApi } from '../api/resources';
import { useAuth } from '../state/AuthContext';

export const ck = {
  communities: (q) => ['communities', q],
  community: (id) => ['community', id],
  feed: ['feed'],
  posts: (id) => ['posts', id],
  post: (id) => ['post', id],
  comments: (id) => ['comments', id],
  events: (q) => ['events', q],
  event: (id) => ['event', id],
  participants: (id) => ['participants', id],
  ideas: ['ideas'],
  idea: (id) => ['idea', id],
  blocks: ['blocks'],
};

export const useCommunities = (q, enabled = true) => useQuery({ queryKey: ck.communities(q), queryFn: () => CommunityApi.list(q), enabled });
export const useCommunity = (id) => useQuery({ queryKey: ck.community(id), queryFn: () => CommunityApi.get(id), enabled: Boolean(id) });
export const useEvents = (q, enabled = true) => useQuery({ queryKey: ck.events(q), queryFn: () => EventApi.list(q), enabled });
export const useEvent = (id) => useQuery({ queryKey: ck.event(id), queryFn: () => EventApi.get(id), enabled: Boolean(id) });
export const useParticipants = (id) => useQuery({ queryKey: ck.participants(id), queryFn: () => EventApi.participants(id), enabled: Boolean(id) });
export const useIdeas = () => useQuery({ queryKey: ck.ideas, queryFn: EventApi.ideas, staleTime: 5 * 60_000 });
export const useIdea = (id) => useQuery({ queryKey: ck.idea(id), queryFn: () => EventApi.idea(id), enabled: Boolean(id) });
export const usePost = (id) => useQuery({ queryKey: ck.post(id), queryFn: () => CommunityApi.post(id), enabled: Boolean(id) });
export const useComments = (id) => useQuery({ queryKey: ck.comments(id), queryFn: () => CommunityApi.comments(id), enabled: Boolean(id) });
export const useBlocks = () => useQuery({ queryKey: ck.blocks, queryFn: SafetyApi.blocks });

/** Cursor-paginated posts: pass a fetcher (community posts or the home feed). */
export function usePostPages(key, fetcher, enabled = true) {
  return useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => fetcher(pageParam ? { cursor: pageParam, limit: 10 } : { limit: 10 }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
}

/** Refetch everything community-shaped after a mutation (counts appear in many places). */
export function useRefreshCommunity() {
  const qc = useQueryClient();
  const { signedIn } = useAuth();
  return () => {
    if (!signedIn) return;
    ['communities', 'community', 'feed', 'posts', 'post', 'comments', 'events', 'event', 'participants', 'home'].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    );
  };
}
