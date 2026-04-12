import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { pb } from '../lib/pocketbase';
import type { Competition, CompetitionParticipant } from '../types';

interface CompetitionContextType {
  competitions: Competition[];
  selectedCompetition: Competition | null;
  setSelectedCompetition: (comp: Competition) => void;
  loading: boolean;
  reload: () => Promise<void>;
}

const CompetitionContext = createContext<CompetitionContextType>({
  competitions: [],
  selectedCompetition: null,
  setSelectedCompetition: () => {},
  loading: true,
  reload: async () => {},
});

export function CompetitionProvider({ children }: { children: ReactNode }) {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const userId = pb.authStore.model?.id;
      if (!userId) {
        setLoading(false);
        return;
      }

      const isAdmin = (pb.authStore.model as Record<string, unknown>)?.isAdmin;

      let comps: Competition[];
      if (isAdmin) {
        comps = await pb.collection('competitions').getFullList() as unknown as Competition[];
      } else {
        const participations = await pb.collection('competition_participants').getFullList({
          filter: `user_id = "${userId}"`,
        }) as unknown as CompetitionParticipant[];

        const compIds = participations.map(p => p.competition_id);
        if (compIds.length === 0) {
          setCompetitions([]);
          setSelectedCompetition(null);
          setLoading(false);
          return;
        }

        const filter = compIds.map(id => `id = "${id}"`).join(' || ');
        comps = await pb.collection('competitions').getFullList({
          filter,
        }) as unknown as Competition[];
      }

      // Sort: active first
      comps.sort((a, b) => {
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (a.status !== 'active' && b.status === 'active') return 1;
        return 0;
      });

      setCompetitions(comps);

      // Auto-select first active, or keep current if still valid
      if (!selectedCompetition || !comps.find(c => c.id === selectedCompetition.id)) {
        const firstActive = comps.find(c => c.status === 'active');
        setSelectedCompetition(firstActive || comps[0] || null);
      }
    } catch (err) {
      console.error('Failed to load competitions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [pb.authStore.model?.id]);

  return (
    <CompetitionContext.Provider value={{
      competitions,
      selectedCompetition,
      setSelectedCompetition,
      loading,
      reload: load,
    }}>
      {children}
    </CompetitionContext.Provider>
  );
}

export const useCompetition = () => useContext(CompetitionContext);
