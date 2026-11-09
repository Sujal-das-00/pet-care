import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChallengeApi } from '../api/resources';

export const chk = {
  list: (status) => ['challenges', 'list', status],
  one: (id) => ['challenges', 'one', id],
  entries: (id) => ['challenges', 'entries', id],
  board: (id, f) => ['challenges', 'board', id, f],
};

export const useChallenges = (status = 'active', enabled = true) =>
  useQuery({ queryKey: chk.list(status), queryFn: () => ChallengeApi.list(status), enabled });
export const useChallenge = (id) => useQuery({ queryKey: chk.one(id), queryFn: () => ChallengeApi.get(id), enabled: Boolean(id) });
export const useMyEntries = (id) => useQuery({ queryKey: chk.entries(id), queryFn: () => ChallengeApi.entries(id), enabled: Boolean(id) });
export const useLeaderboard = (id, filters) =>
  useQuery({ queryKey: chk.board(id, filters), queryFn: () => ChallengeApi.leaderboard(id, filters), enabled: Boolean(id) && !filters.skip, retry: false });

export function useRefreshChallenges() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: ['challenges'] }), qc.invalidateQueries({ queryKey: ['admin'] })]);
}
