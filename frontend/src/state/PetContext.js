import { createContext, useContext, useMemo, useState } from 'react';
import { usePets } from '../hooks/usePets';

const PetContext = createContext(null);
export const usePetSelection = () => useContext(PetContext);

/** Which pet the Home / My Pet screens are currently looking at. */
export function PetProvider({ children }) {
  const { data } = usePets();
  const [selectedId, setSelectedId] = useState(null);
  const pets = data?.items ?? [];
  const value = useMemo(() => {
    const selected = pets.find((p) => p.id === selectedId) ?? pets[0] ?? null;
    return { pets, selected, selectPet: setSelectedId };
  }, [pets, selectedId]);
  return <PetContext.Provider value={value}>{children}</PetContext.Provider>;
}
