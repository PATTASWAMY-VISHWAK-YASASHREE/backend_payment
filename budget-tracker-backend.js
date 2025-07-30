// AI Agent Budget Tracker - Backend Server with Razorpay Integration
const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Razorpay Configuration
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'your_razorpay_key_id',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'your_razorpay_key_secret',
});

// Webhook Secret for signature verification
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'your_webhook_secret';

// In-memory storage (replace with database in production)
let budgetData = {
  users: {},
  transactions: [],
  budgetLimits: {
    daily: 1000,    // ₹10 in paise
    weekly: 5000,   // ₹50 in paise
    monthly: 20000  // ₹200 in paise
  }
};

// AI Budget Analysis Function
function analyzeSpending(userId, amount, category = 'general') {
  const user = budgetData.users[userId];
  if (!user) return { analysis: 'User not found', recommendations: [] };

  const today = new Date().toDateString();
  const thisWeek = getWeekStart(new Date());
  const thisMonth = new Date().getMonth();

  // Calculate current spending
  const dailySpent = user.transactions
    .filter(t => new Date(t.timestamp).toDateString() === today)
    .reduce((sum, t) => sum + t.amount, 0);

  const weeklySpent = user.transactions
    .filter(t => getWeekStart(new Date(t.timestamp)).getTime() === thisWeek.getTime())
    .reduce((sum, t) => sum + t.amount, 0);

  const monthlySpent = user.transactions
    .filter(t => new Date(t.timestamp).getMonth() === thisMonth)
    .reduce((sum, t) => sum + t.amount, 0);

  // AI Analysis
  const analysis = {
    currentSpending: {
      daily: dailySpent,
      weekly: weeklySpent,
      monthly: monthlySpent
    },
    budgetLimits: budgetData.budgetLimits,
    percentageUsed: {
      daily: (dailySpent / budgetData.budgetLimits.daily) * 100,
      weekly: (weeklySpent / budgetData.budgetLimits.weekly) * 100,
      monthly: (monthlySpent / budgetData.budgetLimits.monthly) * 100
    },
    alerts: [],
    recommendations: []
  };

  // Generate AI recommendations
  if (analysis.percentageUsed.daily > 80) {
    analysis.alerts.push('⚠️ Daily budget almost exceeded!');
    analysis.recommendations.push('Consider postponing non-essential purchases today');
  }

  if (analysis.percentageUsed.weekly > 70) {
    analysis.alerts.push('📊 Weekly spending is high');
    analysis.recommendations.push('Focus on essential purchases for the rest of the week');
  }

  if (analysis.percentageUsed.monthly > 60) {
    analysis.alerts.push('📈 Monthly spending trending high');
    analysis.recommendations.push('Review your spending patterns and consider budget adjustments');
  }

  // Category-specific recommendations
  if (category === 'food' && dailySpent > budgetData.budgetLimits.daily * 0.5) {
    analysis.recommendations.push('🍽️ Consider cooking at home to save on food expenses');
  }

  return analysis;
}

// Helper function to get week start date
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
}

// Routes

// 1. Create Razorpay Order
app.post('/api/create-order', async (req, res) => {
  try {
    const { amount, currency = 'INR', userId, category = 'general', description } = req.body;

    if (!amount || !userId) {
      return res.status(400).json({ error: 'Amount and userId are required' });
    }

    // Create user if doesn't exist
    if (!budgetData.users[userId]) {
      budgetData.users[userId] = {
        id: userId,
        transactions: [],
        createdAt: new Date().toISOString()
      };
    }

    // Create Razorpay order
    const options = {
      amount: amount, // amount in paise
      currency: currency,
      receipt: `budget_${userId}_${Date.now()}`,
      notes: {
        userId: userId,
        category: category,
        description: description
      }
    };

    const order = await razorpay.orders.create(options);
    
    res.json({
      success: true,
      order: order,
      message: 'Order created successfully'
    });

  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ 
      error: 'Failed to create order',
      details: error.message 
    });
  }
});

// 2. Verify Payment (called from frontend after payment)
app.post('/api/verify-payment', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId } = req.body;

    // Verify payment signature
    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto.createHmac("sha256", razorpay.key_secret)
      .update(sign.toString())
      .digest("hex");

    if (razorpay_signature === expectedSign) {
      // Fetch payment details from Razorpay
      const payment = await razorpay.payments.fetch(razorpay_payment_id);
      
      // Store transaction
      const transaction = {
        id: razorpay_payment_id,
        orderId: razorpay_order_id,
        userId: userId,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        category: payment.notes?.category || 'general',
        description: payment.notes?.description || 'Payment',
        timestamp: new Date().toISOString(),
        method: payment.method
      };

      budgetData.transactions.push(transaction);
      budgetData.users[userId].transactions.push(transaction);

      // Generate AI analysis
      const aiAnalysis = analyzeSpending(userId, payment.amount, payment.notes?.category);

      res.json({
        success: true,
        message: 'Payment verified successfully',
        transaction: transaction,
        aiAnalysis: aiAnalysis
      });

    } else {
      res.status(400).json({
        success: false,
        error: 'Invalid payment signature'
      });
    }

  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ 
      error: 'Payment verification failed',
      details: error.message 
    });
  }
});

// 3. Razorpay Webhook Handler (for real-time updates)
app.post('/api/razorpay-webhook', async (req, res) => {
  try {
    // Verify webhook signature
    const signature = req.headers['x-razorpay-signature'];
    const body = JSON.stringify(req.body);
    
    const expectedSignature = crypto.createHmac('sha256', WEBHOOK_SECRET)
      .update(body)
      .digest('hex');

    if (signature !== expectedSignature) {
      console.log('Invalid webhook signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = req.body.event;
    const paymentData = req.body.payload.payment?.entity;
    const orderData = req.body.payload.order?.entity;

    console.log(`📧 Webhook received: ${event}`);

    switch (event) {
      case 'payment.captured':
        await handlePaymentCaptured(paymentData);
        break;
        
      case 'payment.failed':
        await handlePaymentFailed(paymentData);
        break;
        
      case 'order.paid':
        await handleOrderPaid(orderData);
        break;
        
      default:
        console.log(`Unhandled webhook event: ${event}`);
    }

    res.status(200).json({ status: 'ok' });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Webhook event handlers
async function handlePaymentCaptured(payment) {
  const userId = payment.notes?.userId;
  if (!userId) return;

  const transaction = {
    id: payment.id,
    orderId: payment.order_id,
    userId: userId,
    amount: payment.amount,
    currency: payment.currency,
    status: 'captured',
    category: payment.notes?.category || 'general',
    description: payment.notes?.description || 'Payment',
    timestamp: new Date().toISOString(),
    method: payment.method,
    source: 'webhook'
  };

  // Update budget data
  budgetData.transactions.push(transaction);
  if (budgetData.users[userId]) {
    budgetData.users[userId].transactions.push(transaction);
  }

  // Generate real-time AI analysis
  const aiAnalysis = analyzeSpending(userId, payment.amount, payment.notes?.category);
  
  console.log(`💰 Payment captured for user ${userId}: ₹${payment.amount/100}`);
  console.log(`🤖 AI Analysis:`, aiAnalysis.alerts);

  // Here you could emit to websockets for real-time dashboard updates
  // io.emit('payment-update', { userId, transaction, aiAnalysis });
}

async function handlePaymentFailed(payment) {
  console.log(`❌ Payment failed: ${payment.id}`);
  // Handle failed payment logic
}

async function handleOrderPaid(order) {
  console.log(`✅ Order paid: ${order.id}`);
  // Handle order paid logic
}

// 4. Get User Dashboard Data
app.get('/api/dashboard/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = budgetData.users[userId];

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Calculate current spending
    const aiAnalysis = analyzeSpending(userId, 0);
    
    // Get recent transactions
    const recentTransactions = user.transactions
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 10);

    res.json({
      success: true,
      user: {
        id: userId,
        totalTransactions: user.transactions.length,
        createdAt: user.createdAt
      },
      budgetAnalysis: aiAnalysis,
      recentTransactions: recentTransactions,
      budgetLimits: budgetData.budgetLimits
    });

  } catch (error) {
    console.error('Error fetching dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// 5. Update Budget Limits
app.post('/api/budget-limits', async (req, res) => {
  try {
    const { daily, weekly, monthly } = req.body;

    if (daily) budgetData.budgetLimits.daily = daily;
    if (weekly) budgetData.budgetLimits.weekly = weekly;
    if (monthly) budgetData.budgetLimits.monthly = monthly;

    res.json({
      success: true,
      message: 'Budget limits updated',
      budgetLimits: budgetData.budgetLimits
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to update budget limits' });
  }
});

// 6. Get AI Spending Insights
app.get('/api/ai-insights/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const analysis = analyzeSpending(userId, 0);

    // Enhanced AI insights
    const insights = {
      ...analysis,
      spendingTrends: generateSpendingTrends(userId),
      categoryBreakdown: generateCategoryBreakdown(userId),
      predictedMonthlySpend: predictMonthlySpending(userId),
      savingsOpportunities: findSavingsOpportunities(userId)
    };

    res.json({
      success: true,
      insights: insights
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to generate AI insights' });
  }
});

// AI Helper Functions
function generateSpendingTrends(userId) {
  const user = budgetData.users[userId];
  if (!user) return [];

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i);
    return date.toDateString();
  });

  return last7Days.map(date => {
    const daySpending = user.transactions
      .filter(t => new Date(t.timestamp).toDateString() === date)
      .reduce((sum, t) => sum + t.amount, 0);
    
    return {
      date: date,
      amount: daySpending
    };
  });
}

function generateCategoryBreakdown(userId) {
  const user = budgetData.users[userId];
  if (!user) return {};

  const categories = {};
  user.transactions.forEach(transaction => {
    const category = transaction.category;
    categories[category] = (categories[category] || 0) + transaction.amount;
  });

  return categories;
}

function predictMonthlySpending(userId) {
  const user = budgetData.users[userId];
  if (!user) return 0;

  const currentDate = new Date();
  const dayOfMonth = currentDate.getDate();
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();

  const monthlySpent = user.transactions
    .filter(t => new Date(t.timestamp).getMonth() === currentDate.getMonth())
    .reduce((sum, t) => sum + t.amount, 0);

  return (monthlySpent / dayOfMonth) * daysInMonth;
}

function findSavingsOpportunities(userId) {
  const categoryBreakdown = generateCategoryBreakdown(userId);
  const opportunities = [];

  Object.entries(categoryBreakdown).forEach(([category, amount]) => {
    if (amount > budgetData.budgetLimits.weekly * 0.3) {
      opportunities.push({
        category: category,
        currentSpend: amount,
        suggestion: `Consider reducing ${category} expenses by 20% to save ₹${(amount * 0.2 / 100).toFixed(2)}`
      });
    }
  });

  return opportunities;
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 AI Budget Tracker Server running on port ${PORT}`);
  console.log(`📊 Dashboard available at http://localhost:${PORT}`);
  console.log(`💳 Razorpay integration active`);
  console.log(`🤖 AI budget analysis enabled`);
});

module.exports = app;
