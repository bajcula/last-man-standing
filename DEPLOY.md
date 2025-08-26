# 🚀 Deployment Guide - Last Man Standing

This guide will help you deploy your Last Man Standing game so you and your friends can play it publicly.

## 📋 Overview

**Frontend**: React app deployed on Vercel (free)
**Backend**: PocketBase deployed on Railway/Fly.io (free tier)

## 🎯 Quick Setup (15 minutes)

### Step 1: Deploy PocketBase Backend

#### Option A: Railway (Recommended - Easy)
1. **Create account** at [railway.app](https://railway.app)
2. **Click "Deploy from GitHub"**
3. **Fork this repository** to your GitHub account
4. **Select your fork** in Railway
5. **Add environment variables**:
   ```
   PORT=8080
   ```
6. **Deploy** - Railway will provide a URL like `https://yourapp.up.railway.app`

#### Option B: Fly.io (Alternative)
1. **Install Fly CLI**: `curl -L https://fly.io/install.sh | sh`
2. **Create account**: `fly auth signup`
3. **In your project folder**:
   ```bash
   fly launch --name your-last-man-standing
   fly deploy
   ```

### Step 2: Configure PocketBase

1. **Visit your PocketBase URL** (from Railway/Fly)
2. **Create admin account** with your email/password
3. **Run setup script**:
   ```bash
   # Update your .env with the deployed URL
   POCKETBASE_URL=https://your-pocketbase-url.railway.app
   ADMIN_EMAIL=your-email@example.com
   ADMIN_PASSWORD=your-secure-password
   
   # Run setup
   node setup_collections.js
   node setup_teams.js
   node setup_deadlines.js
   ```

### Step 3: Deploy Frontend

#### Vercel (Recommended - Free)
1. **Create account** at [vercel.com](https://vercel.com)
2. **Import your GitHub repository**
3. **Set environment variables**:
   ```
   VITE_POCKETBASE_URL=https://your-pocketbase-url.railway.app
   ```
4. **Deploy** - Vercel will provide a URL like `https://your-app.vercel.app`

#### Netlify (Alternative)
1. **Create account** at [netlify.com](https://netlify.com)
2. **Drag and drop your `frontend/dist` folder** after building:
   ```bash
   cd frontend
   npm run build
   ```

## 🔧 Detailed Setup

### Backend Deployment (PocketBase)

#### Railway Setup
```bash
# 1. Create Dockerfile in project root
FROM alpine:latest

RUN apk update && apk add --no-cache \
    unzip \
    ca-certificates

ADD https://github.com/pocketbase/pocketbase/releases/download/v0.20.0/pocketbase_0.20.0_linux_amd64.zip /tmp/pb.zip
RUN unzip /tmp/pb.zip -d /pb/

EXPOSE 8080

CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8080"]
```

```bash
# 2. Create railway.json
{
  "deploy": {
    "startCommand": "./pocketbase serve --http=0.0.0.0:$PORT"
  }
}
```

#### Alternative: PocketHost.io (Easiest)
1. **Go to [pockethost.io](https://pockethost.io)**
2. **Create free account**
3. **Upload your `pb_data` folder**
4. **Get your hosted URL**

### Frontend Deployment

#### Vercel Setup
```bash
# 1. Update frontend/.env.production
VITE_POCKETBASE_URL=https://your-pocketbase-url.railway.app

# 2. Update vercel.json in frontend/
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### Environment Variables Summary

#### Backend (.env)
```env
# For setup scripts only
ADMIN_EMAIL=your-email@example.com
ADMIN_PASSWORD=your-secure-password
```

#### Frontend (.env.production)
```env
VITE_POCKETBASE_URL=https://your-pocketbase-url.railway.app
```

## 🎮 Post-Deployment Setup

### 1. Create Admin User
```bash
# Update your local .env with production URLs
POCKETBASE_URL=https://your-production-url.railway.app
ADMIN_EMAIL=your-email@example.com
ADMIN_PASSWORD=your-secure-password

# Run user creation
node create_admin_user.js  # (if this script exists)
# OR manually create via PocketBase admin UI
```

### 2. Invite Your Friends
1. **Share the Vercel URL** with friends
2. **Create user accounts** for them via Admin panel
3. **Set first deadline** for Week 1
4. **Ready to play!**

## 🚀 Free Hosting Costs

| Service | Free Tier Limits | Perfect For |
|---------|-----------------|-------------|
| **Railway** | 500 hours/month, 1GB RAM | PocketBase backend |
| **Vercel** | 100 deployments/month | React frontend |
| **Total** | **$0/month** | 10-50 players |

## 🔒 Security Checklist

### Production Security
- [ ] Change default admin password
- [ ] Use strong passwords for all users
- [ ] Set proper CORS headers in PocketBase
- [ ] Enable HTTPS (auto with Railway/Vercel)
- [ ] Don't commit `.env` files to GitHub

### PocketBase Security
1. **Admin panel**: Only accessible to you
2. **API Rules**: Set in PocketBase admin
3. **User permissions**: Configured automatically by setup scripts

## 🐛 Troubleshooting

### Common Issues

#### "Failed to load data"
- **Check**: PocketBase URL in frontend env vars
- **Check**: CORS settings in PocketBase admin
- **Solution**: Ensure URLs match exactly

#### "404 Collection not found"
- **Check**: Run all setup scripts on production
- **Solution**: Run `node setup_collections.js` with production URL

#### "No teams showing"
- **Check**: Teams collection populated
- **Solution**: Run `node setup_teams.js`

### Debug Mode
```bash
# Check if PocketBase is running
curl https://your-pocketbase-url.railway.app/api/health

# Check collections exist
curl https://your-pocketbase-url.railway.app/api/collections
```

## 📱 Mobile Friendly

The app is responsive and works great on:
- ✅ Desktop browsers
- ✅ Mobile phones (iOS/Android)
- ✅ Tablets

## 🎯 Next Steps After Deployment

1. **Test with friends** - Create a few test users
2. **Run a practice round** - Test the complete workflow
3. **Set first real deadline** - Start your competition!
4. **Share the URL** - Invite all your friends

## 💡 Pro Tips

### For Large Groups (20+ players)
- Consider upgrading Railway to paid tier
- Use Railway's monitoring dashboard
- Set up backups of PocketBase data

### For Long Seasons
- Monitor storage usage in PocketBase
- Regularly backup game data
- Consider archiving old competitions

---

## 🎉 You're Ready!

Your Last Man Standing game is now live and ready for your friends to enjoy. The total setup time should be about 15-20 minutes, and hosting is completely free for small groups.

**Share your game URL and let the competition begin! ⚽**