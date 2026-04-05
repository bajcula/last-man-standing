import { useState, useEffect } from 'react';
import { pb } from '../lib/pocketbase';
import type { WinningTeam, Team, User, Pick, Deadline } from '../types';

interface PlayerPick {
  week: number;
  teamInfo: Team | undefined;
  pickDate: string;
}

interface PlayerData {
  displayName: string;
  firstName: string;
  lastName: string;
  eliminatedWeek: number | null;
  picks: PlayerPick[];
}

interface OrganizedPick {
  team: string;
  shortName: string;
  pickDate: string;
  teamId: string | undefined;
}

function AllPlayersPicksHistory() {
  const [picksData, setPicksData] = useState<Record<number, Record<string, OrganizedPick>>>({});
  const [players, setPlayers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [maxWeek, setMaxWeek] = useState(0);
  const [winningTeams, setWinningTeams] = useState<WinningTeam[]>([]);
  const [currentWeek, setCurrentWeek] = useState(0);

  useEffect(() => {
    loadHistoricalData();
  }, []);

  const isWeekFinished = (week: number): boolean => {
    return winningTeams.some(winner => winner.week_number === week);
  };

  const getBorderStyle = (week: number, teamId: string | undefined): string => {
    const weekFinished = isWeekFinished(week);

    if (week === currentWeek) {
      return '2px solid #007bff';
    }

    const teamWon = teamId && winningTeams.some(winner =>
      winner.week_number === week && winner.team_id === teamId
    );

    if (!weekFinished) {
      return '2px solid #007bff';
    }

    const borderWidth = '3px double';
    return teamWon ? `${borderWidth} #28a745` : `${borderWidth} #dc3545`;
  };

  const calculateUserEliminations = async (users: PlayerData[]): Promise<{ eliminatedWeek: number | null }[]> => {
    try {
      const allWinners = await pb.collection('winning_teams').getFullList() as unknown as WinningTeam[];

      return users.map(user => {
        let eliminatedWeek: number | null = null;

        const sortedPicks = user.picks.sort((a, b) => a.week - b.week);
        const maxWeekVal = Math.max(...user.picks.map(p => p.week), 0);

        for (let week = 1; week <= maxWeekVal; week++) {
          const pickForWeek = sortedPicks.find(p => p.week === week);

          if (!pickForWeek) {
            continue;
          }

          const teamWon = allWinners.some(winner =>
            winner.week_number === week && winner.team_id === pickForWeek.teamInfo?.id
          );

          if (!teamWon && allWinners.some(w => w.week_number === week)) {
            eliminatedWeek = week;
            break;
          }
        }

        return { eliminatedWeek };
      });
    } catch (err) {
      console.error('Error calculating eliminations:', err);
      return users.map(() => ({ eliminatedWeek: null }));
    }
  };

  const loadHistoricalData = async () => {
    try {
      const picks = await pb.collection('picks').getFullList({
        expand: 'user_id,team_id',
        sort: 'week_number',
      }) as unknown as Pick[];

      try {
        const users = await pb.collection('users').getFullList() as unknown as User[];

        const userLookup: Record<string, User> = {};
        users.forEach(user => {
          userLookup[user.id] = user;
        });

        picks.forEach(pick => {
          if (!pick.expand?.user_id && userLookup[pick.user_id]) {
            if (!pick.expand) pick.expand = {};
            pick.expand.user_id = userLookup[pick.user_id];
          }
        });
      } catch (userErr) {
        console.log('Could not load users directly:', userErr);
      }

      const deadlines = await pb.collection('deadlines').getFullList({
        sort: 'week_number',
      }) as unknown as Deadline[];

      const allWinners = await pb.collection('winning_teams').getFullList() as unknown as WinningTeam[];
      setWinningTeams(allWinners);

      const now = new Date();
      const currentWeekData = deadlines.find(d =>
        !d.is_closed && new Date(d.deadline_time) > now
      );
      if (currentWeekData) {
        setCurrentWeek(currentWeekData.week_number);
      }

      const currentUser = pb.authStore.model as unknown as User | null;
      const isAdmin = currentUser?.isAdmin || false;

      let filteredPicks: Pick[];
      if (isAdmin) {
        filteredPicks = picks;
      } else {
        const closedWeeks = deadlines
          .filter(d => new Date(d.deadline_time) < now || d.is_closed)
          .map(d => d.week_number);

        filteredPicks = picks.filter(pick =>
          closedWeeks.includes(pick.week_number)
        );
      }

      const userMap = new Map<string, PlayerData>();

      filteredPicks.forEach(pick => {
        const user = pick.expand?.user_id;
        const userId = pick.user_id;

        if (!userMap.has(userId)) {
          let displayName: string;
          if (user?.first_name && user?.last_name) {
            displayName = `${user.last_name}, ${user.first_name}`;
          } else {
            displayName = `User ${userId.substring(0, 8)}...`;
          }

          userMap.set(userId, {
            displayName,
            firstName: user?.first_name || '',
            lastName: user?.last_name || '',
            eliminatedWeek: null,
            picks: []
          });
        }

        userMap.get(userId)!.picks.push({
          week: pick.week_number,
          teamInfo: pick.expand?.team_id,
          pickDate: pick.created
        });
      });

      const userElimination = await calculateUserEliminations(Array.from(userMap.values()));

      userElimination.forEach((eliminationInfo, index) => {
        const userArray = Array.from(userMap.values());
        userArray[index]!.eliminatedWeek = eliminationInfo.eliminatedWeek;
      });

      const organized: Record<number, Record<string, OrganizedPick>> = {};
      let maxWeekFound = 0;

      filteredPicks.forEach(pick => {
        const week = pick.week_number;
        const user = userMap.get(pick.user_id)!;
        const playerName = user.displayName;
        const teamInfo = pick.expand?.team_id;

        if (!organized[week]) {
          organized[week] = {};
        }
        organized[week]![playerName] = {
          team: teamInfo?.team_name || 'Unknown Team',
          shortName: teamInfo?.team_short_name || 'UNK',
          pickDate: pick.created,
          teamId: teamInfo?.id
        };

        maxWeekFound = Math.max(maxWeekFound, week);
      });

      const sortedPlayers = Array.from(userMap.values()).sort((a, b) => {
        if (a.eliminatedWeek === null && b.eliminatedWeek !== null) return -1;
        if (a.eliminatedWeek !== null && b.eliminatedWeek === null) return 1;

        if (a.eliminatedWeek !== null && b.eliminatedWeek !== null) {
          if (a.eliminatedWeek !== b.eliminatedWeek) {
            return b.eliminatedWeek - a.eliminatedWeek;
          }
        }

        return a.displayName.localeCompare(b.displayName);
      }).map(user => user.displayName);

      setPicksData(organized);
      setPlayers(sortedPlayers);
      setMaxWeek(maxWeekFound);
    } catch (err) {
      console.error('Failed to load historical data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="card">
      <div className="skeleton skeleton-row skeleton-row--medium"></div>
      <div className="skeleton skeleton-row"></div>
      <div className="skeleton skeleton-card"></div>
    </div>
  );

  const weeks = Array.from({ length: maxWeek }, (_, i) => i + 1);
  const availableWeeks = weeks.filter(week => picksData[week]);

  return (
    <div className="card">
      <h2>All Players - Historical Picks</h2>
      <p>Shows all picks for weeks where the deadline has passed</p>

      {availableWeeks.length === 0 ? (
        <p>No historical picks available yet</p>
      ) : (
        <div className="history-table-container" style={{ overflowX: 'auto' }}>
          <table className="history-table">
            <thead>
              <tr>
                <th className="sticky-col">Player</th>
                {availableWeeks.map(week => {
                  const weekFinished = isWeekFinished(week);
                  return (
                    <th key={week} className={weekFinished ? 'week-done' : ''} style={{ minWidth: '70px', whiteSpace: 'nowrap' }}>
                      Week {week}
                      {weekFinished && (
                        <div style={{ fontSize: '10px', color: 'var(--color-success)', fontWeight: 'bold', marginTop: '2px' }}>
                          DONE
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {players.map(player => (
                <tr key={player}>
                  <td className="sticky-col" style={{ fontWeight: 'bold' }}>
                    {player}
                  </td>
                  {availableWeeks.map(week => {
                    const pick = picksData[week]?.[player];
                    return (
                      <td key={`${player}-${week}`} style={{ padding: '6px', minWidth: '70px', textAlign: 'center' }}>
                        {pick ? (
                          <div style={{
                            border: getBorderStyle(week, pick.teamId),
                            borderRadius: '6px',
                            padding: '4px',
                            backgroundColor: '#f8f9fa',
                            textAlign: 'center',
                            minWidth: '50px'
                          }}>
                            <strong style={{
                              color: '#007bff',
                              fontSize: '14px',
                              display: 'block'
                            }}>
                              {pick.shortName}
                            </strong>
                          </div>
                        ) : (
                          <span style={{ color: '#999' }}>-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {availableWeeks.length > 0 && (
        <div style={{ marginTop: '20px', fontSize: '14px', color: 'var(--color-text-muted)' }}>
          <p>🔒 Current week picks are hidden until deadline passes</p>
        </div>
      )}
    </div>
  );
}

export default AllPlayersPicksHistory;
