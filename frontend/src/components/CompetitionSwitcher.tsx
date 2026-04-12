import { useCompetition } from '../contexts/CompetitionContext';

function CompetitionSwitcher() {
  const { competitions, selectedCompetition, setSelectedCompetition, loading } = useCompetition();

  if (loading) return null;

  const activeComps = competitions.filter(c => c.status === 'active');
  const endedComps = competitions.filter(c => c.status === 'ended');

  // Don't show switcher if there's only one competition total
  if (competitions.length <= 1) {
    return null;
  }

  return (
    <div className="competition-switcher">
      <select
        value={selectedCompetition?.id || ''}
        onChange={(e) => {
          const comp = competitions.find(c => c.id === e.target.value);
          if (comp) setSelectedCompetition(comp);
        }}
      >
        {activeComps.length > 0 && (
          <optgroup label="Active">
            {activeComps.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </optgroup>
        )}
        {endedComps.length > 0 && (
          <optgroup label="Ended">
            {endedComps.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} (Weeks {c.start_week}–{c.end_week})
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
}

export default CompetitionSwitcher;
