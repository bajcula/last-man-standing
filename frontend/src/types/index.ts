import type { RecordModel } from 'pocketbase';

// ---- PocketBase record types ----

export interface Team extends RecordModel {
  team_name: string;
  team_short_name: string;
}

export interface User extends RecordModel {
  first_name: string;
  last_name: string;
  email: string;
  username: string;
  isAdmin: boolean;
}

export interface Pick extends RecordModel {
  user_id: string;
  team_id: string;
  week_number: number;
  competition_id: string;
  expand?: {
    user_id?: User;
    team_id?: Team;
  };
}

export interface Deadline extends RecordModel {
  week_number: number;
  deadline_time: string;
  is_closed: boolean;
  competition_id: string;
}

export interface WinningTeam extends RecordModel {
  week_number: number;
  team_id: string;
}

export interface Competition extends RecordModel {
  name: string;
  status: 'active' | 'ended';
  start_week: number;
  end_week: number | null;
  created_by: string;
}

export interface CompetitionParticipant extends RecordModel {
  competition_id: string;
  user_id: string;
  is_eliminated: boolean;
}

// ---- TheSportsDB API types ----

export interface ApiMatch {
  idEvent: string;
  strHomeTeam: string;
  strAwayTeam: string;
  intHomeScore: string | null;
  intAwayScore: string | null;
  strStatus: string;
  strPostponed: string;
  dateEvent: string;
  strTime: string;
  strRound: string;
}

// ---- Frontend display types ----

export interface DisplayMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: string | null;
  awayScore: string | null;
  status: string;
  postponed: string;
  date: string;
  time: string;
  round: string;
  winner: string | null;
}

export interface EliminationInfo {
  reason: string;
  week: number;
  teamName: string;
  eliminatedWeek: number;
}

export interface EliminationResult {
  isEliminated: boolean;
  eliminationInfo: EliminationInfo | null;
}

export interface DeadlineStatus {
  status: 'no-deadline' | 'closed' | 'passed' | 'urgent' | 'soon' | 'open';
  message: string;
  color?: string;
}

// ---- Component prop types ----

export interface UserManagementProps {
  users: User[];
  loading: boolean;
  message: string;
  setMessage: (msg: string) => void;
  onUserCreated: () => void;
}

export interface GameResetProps {
  loading: boolean;
  setLoading: (loading: boolean) => void;
  message: string;
  setMessage: (msg: string) => void;
  onResetComplete: (startWeek: number) => void;
}
