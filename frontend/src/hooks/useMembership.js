import { useQuery } from '@tanstack/react-query';
import { MembershipApi } from '../api/resources';
import { useAuth } from '../state/AuthContext';

export const membershipKey = ['membership'];

/** Server-owned membership state + price + whether Nimiq payments are available. */
export function useMembership() {
  const { signedIn } = useAuth();
  return useQuery({ queryKey: membershipKey, queryFn: MembershipApi.get, enabled: signedIn, staleTime: 30_000 });
}

/** { loading, locked }: locked is only true once the server has said community isn't unlocked. */
export function useCommunityAccess() {
  const { data, isLoading, isError } = useMembership();
  return { loading: isLoading, error: isError, locked: Boolean(data) && !data.features.community, info: data };
}
