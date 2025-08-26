# ⚽ Last Man Standing - Premier League Game

A complete web application for managing "Last Man Standing" competitions where friends pick Premier League teams each week. Last player with a winning team standing wins!

## 🎮 Features

### 🏆 Complete Game System
- **User Authentication** - Secure login with admin roles
- **Smart Team Selection** - Pick from 20 current Premier League teams
- **Advanced Validation** - Can't reuse teams, deadline enforcement
- **Real Match Integration** - Live Premier League fixtures and results
- **Automatic Elimination** - Players eliminated when their team loses
- **Beautiful UI** - Modern glass-morphism design, fully responsive

### 👑 Professional Admin Dashboard
- **User Management** - Create accounts for all players
- **Smart Deadlines** - Auto-set 6 hours before first match kickoff
- **Winner Management** - Manual selection + API auto-fill from real results
- **Round Progression** - One-click advancement with automatic elimination
- **Season Management** - Reset system for continuous competitions
- **Week Validation** - Prevents resets to already-played weeks

### 📱 User Experience
- **Match Display** - See all week's fixtures when making picks
- **Pick History** - Beautiful card-based history of all selections
- **Privacy Protection** - Picks hidden until deadlines pass
- **Elimination Pages** - Encouraging messages for eliminated players
- **Mobile Optimized** - Perfect on phones, tablets, and desktop

## 🚀 Tech Stack

- **Backend:** PocketBase (Go-based with built-in SQLite, auth, real-time)
- **Frontend:** React + Vite (modern hooks, responsive design)
- **API Integration:** Premier League fixtures and results
- **Hosting:** Railway/Vercel (free tier sufficient)
- **Database:** SQLite with complete relational schema

## ⚡ Quick Start

### 1. Clone and Setup
```bash
git clone <your-repo>
cd last-man-standing

# Setup environment
cp .env.example .env
# Edit .env with your admin credentials
```

### 2. Start Backend
```bash
cd pocketbase
./pocketbase serve
```
- **Admin UI:** http://localhost:8090/_/
- **Create admin account** when prompted

### 3. Initialize Database
```bash
# Run setup scripts (from project root)
node setup_collections.js  # Creates all database collections
node setup_teams.js        # Loads 2025/26 Premier League teams
node setup_deadlines.js    # Creates initial deadlines
```

### 4. Start Frontend
```bash
cd frontend
npm install
npm run dev
```
- **Game URL:** http://localhost:5173
- **Login** with your admin credentials

## 🎯 Game Rules

1. **Weekly Picks** - Each player selects one Premier League team per week
2. **Win to Advance** - Selected team must win their match (draws/losses = elimination)
3. **No Repeats** - Can't pick the same team twice in a season
4. **Deadline System** - Picks locked 6 hours before first match
5. **Auto-Pick** - Miss deadline = automatic assignment of first available team
6. **Last Standing** - Final remaining player wins the competition

## 🔧 Admin Management

### User Management
- Create accounts for all participants
- View player statistics and pick history
- Manage user roles and permissions

### Game Management
- **Set Deadlines:** Automatic 6-hour buffer before matches
- **Mark Winners:** Manual selection or API auto-fill
- **Advance Rounds:** One-click progression with elimination
- **Reset Seasons:** Start fresh competitions from any week

### Match Integration
- Real-time Premier League fixture display
- Automatic winner detection from API
- Manual override for edge cases

## 🌐 Production Deployment (Free)

**Total Cost: $0/month for groups up to 50 players**

### Option 1: Railway + Vercel (Recommended)
```bash
# 1. Deploy PocketBase to Railway
# - Connect GitHub repository
# - Railway auto-detects and deploys
# - Get URL: https://yourapp.up.railway.app

# 2. Deploy Frontend to Vercel
# - Import GitHub repository
# - Set environment variable:
#   VITE_POCKETBASE_URL=https://yourapp.up.railway.app
# - Get URL: https://yourapp.vercel.app
```

### Option 2: PocketHost + Netlify
```bash
# 1. PocketHost.io for backend (easiest)
# - Upload your pb_data folder
# - Get hosted PocketBase URL

# 2. Build and deploy frontend
cd frontend
npm run build
# Upload dist/ folder to Netlify
```

### Complete Setup Guide
See **[DEPLOY.md](DEPLOY.md)** for detailed 15-minute deployment instructions.

## 📁 Project Structure

```
last-man-standing/
├── frontend/                 # React application
│   ├── src/
│   │   ├── components/      # React components
│   │   │   ├── Admin.jsx    # Complete admin dashboard
│   │   │   ├── PickTeam.jsx # Team selection with fixtures
│   │   │   ├── MyPicks.jsx  # Pick history display
│   │   │   └── AllPlayersPicksHistory.jsx
│   │   ├── lib/
│   │   │   └── pocketbase.js # API client
│   │   └── App.jsx          # Main application
│   └── package.json
├── pocketbase/              # Backend database
│   ├── pocketbase          # Executable
│   └── pb_data/            # SQLite database
├── setup_collections.js    # Database schema setup
├── setup_teams.js          # Premier League teams data
├── setup_deadlines.js      # Initial deadline setup
├── DEPLOY.md               # Complete deployment guide
└── README.md               # This file
```

## 🎮 Usage Examples

### For Players
1. **Login** → Access your game dashboard
2. **View Week's Fixtures** → See all Premier League matches
3. **Make Your Pick** → Select a team you haven't used
4. **Track Progress** → View your pick history and status
5. **Stay Updated** → Real-time deadline and result information

### For Admins
1. **Create Players** → Add all participants via admin panel
2. **Set Deadlines** → Use smart auto-calculation or manual override
3. **Mark Winners** → Auto-fill from API or manual selection
4. **Advance Rounds** → One-click progression with elimination
5. **Manage Seasons** → Reset for continuous competitions

## 🔒 Security & Privacy

- **Encrypted Authentication** - JWT tokens with PocketBase security
- **Role-based Access** - Admin vs player permissions
- **Pick Privacy** - Selections hidden until deadlines pass
- **Data Validation** - All inputs validated server-side
- **HTTPS in Production** - Secure connections automatically enforced

## 📊 Scalability

### Free Tier Supports:
- ✅ **50+ Players** - Perfect for friend groups and small leagues
- ✅ **Full Seasons** - 38-week Premier League campaigns
- ✅ **1000+ Picks** - Complete historical data storage
- ✅ **Real-time Updates** - Live match data integration

### Performance Optimized:
- Efficient database queries
- Responsive design for all devices
- Smart caching and state management
- Graceful error handling and fallbacks

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🎉 Ready to Play!

**The Last Man Standing game is production-ready and feature-complete.** 

Follow the [DEPLOY.md](DEPLOY.md) guide for 15-minute setup, invite your friends, and start your Premier League competition today!

**Good luck, and may the best picker be the last one standing! ⚽**

---

*Built with ❤️ for football fans who love a good competition*