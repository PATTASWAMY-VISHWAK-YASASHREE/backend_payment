# Razorpay Budget Tracker API

Production-ready Razorpay payment processing API with budget tracking capabilities.

## 🚀 Quick Deploy to Render

1. **Fork/Upload this repository to GitHub**
2. **Connect to Render**:
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
3. **Configure Settings**:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. **Set Environment Variables**:
   - `RAZORPAY_KEY_ID` - Your Razorpay Key ID
   - `RAZORPAY_KEY_SECRET` - Your Razorpay Secret Key
   - `NODE_ENV` - Set to `production`
5. **Deploy** - Your API will be live!

## 📋 API Endpoints

- `GET /` - Service information
- `GET /health` - Health check
- `GET /api/info` - API documentation
- `POST /api/users` - Create user
- `POST /api/create-order` - Create payment order
- `POST /api/verify-payment` - Verify payment

## 🔧 Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_secret_key
NODE_ENV=production
```

## 🧪 Testing

After deployment, test your API:

```bash
# Health check
curl https://your-app.onrender.com/health

# Create user
curl -X POST https://your-app.onrender.com/api/users \
  -H "Content-Type: application/json" \
  -d '{"userId": "test123", "name": "Test User"}'

# Create order
curl -X POST https://your-app.onrender.com/api/create-order \
  -H "Content-Type: application/json" \
  -d '{"amount": 500, "userId": "test123"}'
```

## 📱 Frontend Integration

Use with the provided JavaScript SDK for easy payment integration.

## 🔒 Security Features

- Rate limiting (1000 requests per 15 minutes)
- CORS protection
- Security headers (Helmet)
- Request compression
- Payment signature verification

## 📊 Features

- User management
- Payment order creation
- Payment verification
- Budget tracking
- Transaction history
- Real-time analytics

---

**Ready to deploy!** Just drag and drop this folder to GitHub and connect to Render! 🎉
