# 🚀 DEPLOYMENT GUIDE

## Drag & Drop to GitHub → Deploy to Render

### Step 1: Upload to GitHub
1. **Create new repository** on GitHub
2. **Drag and drop** this entire `razorpay-render-deploy` folder to GitHub
3. **Commit** the files

### Step 2: Deploy on Render
1. Go to [render.com](https://render.com) and sign up/login
2. Click **"New +"** → **"Web Service"**
3. **Connect** your GitHub repository
4. **Settings**:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free (for testing)

### Step 3: Environment Variables
Add these in Render dashboard:

```
RAZORPAY_KEY_ID = rzp_test_your_actual_key_id
RAZORPAY_KEY_SECRET = your_actual_secret_key
NODE_ENV = production
```

### Step 4: Deploy & Test
1. Click **"Deploy"**
2. Wait for build to complete
3. Your API will be live at: `https://your-app-name.onrender.com`
4. Test with: `https://your-app-name.onrender.com/health`

### Step 5: Use Payment SDK
1. Update `test-payment.html` with your live API URL
2. Open `test-payment.html` in browser
3. Enter your Razorpay key and test payments

---

## 📁 What's Included

✅ **server.js** - Production API server  
✅ **package.json** - Dependencies & scripts  
✅ **payment-sdk.js** - Frontend payment SDK  
✅ **test-payment.html** - Payment testing page  
✅ **.env.example** - Environment variables template  
✅ **README.md** - Documentation  
✅ **.gitignore** - Git ignore rules  

---

## 🎯 Ready to Deploy!

Just drag this folder to GitHub and follow the steps above. Your Razorpay API will be live in 5 minutes! 🎉
