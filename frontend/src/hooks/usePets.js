// Controller layer: react-query hooks that wrap the model layer and own cache invalidation.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HomeApi, MeApi, PetsApi, RemindersApi } from '../api/resources';
import { useAuth } from '../state/AuthContext';

export const keys = {
  home: ['home'],
  pets: ['pets'],
  series: (id) => ['pets', id, 'series'],
  meds: (id) => ['pets', id, 'meds'],
  vax: (id) => ['pets', id, 'vax'],
  appts: (id) => ['pets', id, 'appts'],
  feeding: (id) => ['pets', id, 'feeding'],
  reminders: (q) => ['reminders', q],
  notifications: ['notifications'],
};

export const usePets = () => {
  const { signedIn } = useAuth();
  return useQuery({ queryKey: keys.pets, queryFn: PetsApi.list, enabled: signedIn });
};
export const useHome = () => useQuery({ queryKey: keys.home, queryFn: HomeApi.get });
export const useWeightSeries = (id) => useQuery({ queryKey: keys.series(id), queryFn: () => PetsApi.weightSeries(id), enabled: Boolean(id) });
export const useMedications = (id) => useQuery({ queryKey: keys.meds(id), queryFn: () => PetsApi.medications(id), enabled: Boolean(id) });
export const useVaccinations = (id) => useQuery({ queryKey: keys.vax(id), queryFn: () => PetsApi.vaccinations(id), enabled: Boolean(id) });
export const useAppointments = (id) => useQuery({ queryKey: keys.appts(id), queryFn: () => PetsApi.appointments(id), enabled: Boolean(id) });
export const useFeeding = (id) => useQuery({ queryKey: keys.feeding(id), queryFn: () => PetsApi.feeding(id), enabled: Boolean(id) });
export const useReminders = (query = 'scope=upcoming') => useQuery({ queryKey: keys.reminders(query), queryFn: () => RemindersApi.list(query) });
export const useNotifications = () => useQuery({ queryKey: keys.notifications, queryFn: MeApi.notifications });

/**
 * mutation(fn, invalidate): runs `fn` then refetches the listed query keys. Reminders and the
 * Home summary depend on almost every care record, so they are always invalidated too.
 */
export function useAction(fn, invalidate = []) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      [...invalidate, keys.home, ['reminders']].forEach((queryKey) => qc.invalidateQueries({ queryKey }));
    },
  });
}
