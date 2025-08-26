import { getMatchWinner, getFirstAvailableTeam, checkUserElimination } from './gameLogic'

describe('getMatchWinner', () => {
  it('should return home team when home score is higher', () => {
    const match = {
      strStatus: 'Match Finished',
      strHomeTeam: 'Arsenal',
      strAwayTeam: 'Chelsea',
      intHomeScore: '3',
      intAwayScore: '1'
    }
    expect(getMatchWinner(match)).toBe('Arsenal')
  })

  it('should return away team when away score is higher', () => {
    const match = {
      strStatus: 'Match Finished',
      strHomeTeam: 'Arsenal',
      strAwayTeam: 'Chelsea',
      intHomeScore: '1',
      intAwayScore: '3'
    }
    expect(getMatchWinner(match)).toBe('Chelsea')
  })

  it('should return Draw when scores are equal', () => {
    const match = {
      strStatus: 'Match Finished',
      strHomeTeam: 'Arsenal',
      strAwayTeam: 'Chelsea',
      intHomeScore: '2',
      intAwayScore: '2'
    }
    expect(getMatchWinner(match)).toBe('Draw')
  })

  it('should return null when match is not finished', () => {
    const match = {
      strStatus: 'Not Started',
      strHomeTeam: 'Arsenal',
      strAwayTeam: 'Chelsea',
      intHomeScore: '0',
      intAwayScore: '0'
    }
    expect(getMatchWinner(match)).toBeNull()
  })

  it('should handle missing or invalid scores', () => {
    const match = {
      strStatus: 'Match Finished',
      strHomeTeam: 'Arsenal',
      strAwayTeam: 'Chelsea',
      intHomeScore: null,
      intAwayScore: undefined
    }
    expect(getMatchWinner(match)).toBe('Draw') // Both scores become 0
  })
})

describe('getFirstAvailableTeam', () => {
  const mockTeams = [
    { id: '1', team_name: 'Chelsea' },
    { id: '2', team_name: 'Aston Villa' },
    { id: '3', team_name: 'Brighton' },
    { id: '4', team_name: 'Arsenal' }
  ]

  it('should return Aston Villa (first alphabetically) when no picks made', () => {
    const userPicks = []
    const result = getFirstAvailableTeam(mockTeams, userPicks)
    expect(result).toEqual({ id: '4', team_name: 'Arsenal' })
  })

  it('should return next available team when first is already picked', () => {
    const userPicks = [
      { team_id: '4', week_number: 1 } // Arsenal picked
    ]
    const result = getFirstAvailableTeam(mockTeams, userPicks)
    expect(result).toEqual({ id: '2', team_name: 'Aston Villa' })
  })

  it('should skip multiple used teams and return next available', () => {
    const userPicks = [
      { team_id: '4', week_number: 1 }, // Arsenal
      { team_id: '2', week_number: 2 }  // Aston Villa
    ]
    const result = getFirstAvailableTeam(mockTeams, userPicks)
    expect(result).toEqual({ id: '3', team_name: 'Brighton' })
  })

  it('should return null when all teams are used', () => {
    const userPicks = [
      { team_id: '4', week_number: 1 }, // Arsenal
      { team_id: '2', week_number: 2 }, // Aston Villa
      { team_id: '3', team_number: 3 }, // Brighton
      { team_id: '1', week_number: 4 }  // Chelsea
    ]
    const result = getFirstAvailableTeam(mockTeams, userPicks)
    expect(result).toBeNull()
  })

  it('should handle empty teams array', () => {
    const result = getFirstAvailableTeam([], [])
    expect(result).toBeNull()
  })
})

describe('checkUserElimination', () => {
  const mockWinningTeams = [
    { week_number: 1, team_id: 'arsenal_id' },
    { week_number: 1, team_id: 'villa_id' },
    { week_number: 2, team_id: 'chelsea_id' },
    { week_number: 2, team_id: 'city_id' }
  ]

  it('should not eliminate anyone in week 1', () => {
    const userPicks = []
    const result = checkUserElimination(userPicks, mockWinningTeams, 1)
    expect(result.isEliminated).toBe(false)
    expect(result.eliminationInfo).toBeNull()
  })

  it('should not eliminate user with winning picks', () => {
    const userPicks = [
      { week_number: 1, team_id: 'arsenal_id', expand: { team_id: { team_name: 'Arsenal' } } },
      { week_number: 2, team_id: 'chelsea_id', expand: { team_id: { team_name: 'Chelsea' } } }
    ]
    const result = checkUserElimination(userPicks, mockWinningTeams, 3)
    expect(result.isEliminated).toBe(false)
    expect(result.eliminationInfo).toBeNull()
  })

  it('should eliminate user with losing pick', () => {
    const userPicks = [
      { week_number: 1, team_id: 'arsenal_id', expand: { team_id: { team_name: 'Arsenal' } } },
      { week_number: 2, team_id: 'spurs_id', expand: { team_id: { team_name: 'Tottenham' } } }
    ]
    const result = checkUserElimination(userPicks, mockWinningTeams, 3)
    expect(result.isEliminated).toBe(true)
    expect(result.eliminationInfo).toEqual({
      reason: 'Team lost',
      week: 2,
      teamName: 'Tottenham',
      eliminatedWeek: 2
    })
  })

  it('should eliminate user with no pick for a week', () => {
    const userPicks = [
      { week_number: 1, team_id: 'arsenal_id', expand: { team_id: { team_name: 'Arsenal' } } }
      // No pick for week 2
    ]
    const result = checkUserElimination(userPicks, mockWinningTeams, 3)
    expect(result.isEliminated).toBe(true)
    expect(result.eliminationInfo).toEqual({
      reason: 'No pick made',
      week: 2,
      teamName: 'No team selected',
      eliminatedWeek: 2
    })
  })

  it('should skip weeks with no declared winners', () => {
    const mockWinningTeamsWithGaps = [
      { week_number: 1, team_id: 'arsenal_id' },
      // Week 2 has no winners (wasn't played)
      { week_number: 3, team_id: 'chelsea_id' }
    ]
    const userPicks = [
      { week_number: 1, team_id: 'arsenal_id', expand: { team_id: { team_name: 'Arsenal' } } },
      { week_number: 3, team_id: 'chelsea_id', expand: { team_id: { team_name: 'Chelsea' } } }
      // No pick for week 2, but that's OK since week 2 wasn't played
    ]
    const result = checkUserElimination(userPicks, mockWinningTeamsWithGaps, 4)
    expect(result.isEliminated).toBe(false)
    expect(result.eliminationInfo).toBeNull()
  })

  it('should eliminate on first losing week encountered', () => {
    const userPicks = [
      { week_number: 1, team_id: 'loser_id', expand: { team_id: { team_name: 'Loser FC' } } },
      { week_number: 2, team_id: 'chelsea_id', expand: { team_id: { team_name: 'Chelsea' } } }
    ]
    const result = checkUserElimination(userPicks, mockWinningTeams, 3)
    expect(result.isEliminated).toBe(true)
    expect(result.eliminationInfo.week).toBe(1) // Eliminated in week 1, doesn't check week 2
  })
})