// 🤖 AI Budget Tracker Server with Razorpay Integration
const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(cors());

// Read Razorpay credentials from CSV
const csvPath = path.join(__dirname, 'rzp (1).csv');
let RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET;

try {
    const csvData = fs.readFileSync(csvPath, 'utf8');
    const lines = csvData.split('\n');
    const dataLine = lines[1]; // Skip header
    [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET] = dataLine.split(',');
    console.log('🔑 Razorpay credentials loaded successfully');
} catch (error) {
    console.error('❌ Error reading Razorpay credentials:', error);
    process.exit(1);
}

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET
});

// In-memory database (replace with actual DB in production)
let budgetData = {
    users: {},
    payments: [],
    budgets: {}
};

// Load existing data if file exists
const dataPath = path.join(__dirname, 'budget-data.json');
try {
    if (fs.existsSync(dataPath)) {
        budgetData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        console.log('📊 Budget data loaded from file');
    }
} catch (error) {
    console.log('📊 Starting with fresh budget data');
}

// Save data to file
function saveData() {
    fs.writeFileSync(dataPath, JSON.stringify(budgetData, null, 2));
}

// AI Budget Analyzer
class AIBudgetAnalyzer {
    static analyzeBudget(userId) {
        const user = budgetData.users[userId] || { totalSpent: 0, transactions: [] };
        const budget = budgetData.budgets[userId] || { monthly: 10000, categories: {} };
        
        const analysis = {
            currentSpent: user.totalSpent,
            budgetLimit: budget.monthly,
            remainingBudget: budget.monthly - user.totalSpent,
            spendingPercentage: ((user.totalSpent / budget.monthly) * 100).toFixed(2),
            status: 'good',
            aiRecommendation: '',
            categoryBreakdown: this.getCategoryBreakdown(user.transactions)
        };

        // AI Analysis Logic
        if (analysis.spendingPercentage > 90) {
            analysis.status = 'critical';
            analysis.aiRecommendation = '🚨 Critical: You\'ve exceeded 90% of your budget! Consider reducing expenses immediately.';
        } else if (analysis.spendingPercentage > 75) {
            analysis.status = 'warning';
            analysis.aiRecommendation = '⚠️ Warning: You\'re at 75% of your budget. Start monitoring expenses closely.';
        } else if (analysis.spendingPercentage > 50) {
            analysis.status = 'moderate';
            analysis.aiRecommendation = '📊 Moderate: Good spending pace. Keep tracking your expenses.';
        } else {
            analysis.status = 'good';
            analysis.aiRecommendation = '✅ Excellent: You\'re well within budget. Great financial discipline!';
        }

        return analysis;
    }

    static getCategoryBreakdown(transactions) {
        const categories = {};
        transactions.forEach(transaction => {
            const category = transaction.category || 'Other';
            categories[category] = (categories[category] || 0) + transaction.amount;
        });
        return categories;
    }

    static getSpendingTrends(userId) {
        const user = budgetData.users[userId] || { transactions: [] };
        const last30Days = user.transactions.filter(t => {
            const transactionDate = new Date(t.date);
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            return transactionDate >= thirtyDaysAgo;
        });

        return {
            totalTransactions: last30Days.length,
            averageTransaction: last30Days.length > 0 ? 
                (last30Days.reduce((sum, t) => sum + t.amount, 0) / last30Days.length).toFixed(2) : 0,
            trends: last30Days.slice(-7) // Last 7 transactions
        };
    }
}

// Routes

// 🏠 Serve main dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'budget-dashboard.html'));
});

// 💳 Create payment order
app.post('/create-order', async (req, res) => {
    try {
        const { amount, userId, category, description } = req.body;
        
        // Validate amount
        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        // Create Razorpay order
        const order = await razorpay.orders.create({
            amount: amount * 100, // Convert to paise
            currency: 'INR',
            receipt: `receipt_${Date.now()}`,
            payment_capture: 1,
            notes: {
                userId: userId || 'anonymous',
                category: category || 'Other',
                description: description || 'Budget payment'
            }
        });

        console.log('💳 Order created:', order.id, 'Amount:', amount);
        
        res.json({
            orderId: order.id,
            amount: amount,
            currency: 'INR',
            key: RAZORPAY_KEY_ID
        });

    } catch (error) {
        console.error('❌ Error creating order:', error);
        res.status(500).json({ error: 'Failed to create order' });
    }
});

// ✅ Verify payment
app.post('/verify-payment', (req, res) => {
    try {
        const { 
            razorpay_order_id, 
            razorpay_payment_id, 
            razorpay_signature,
            userId,
            amount,
            category,
            description
        } = req.body;

        // Verify signature
        const hmac = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET);
        hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
        const generated_signature = hmac.digest('hex');

        if (generated_signature === razorpay_signature) {
            // Payment verified - update budget data
            const user = budgetData.users[userId] || { totalSpent: 0, transactions: [] };
            
            const transaction = {
                id: razorpay_payment_id,
                orderId: razorpay_order_id,
                amount: parseFloat(amount),
                category: category || 'Other',
                description: description || 'Payment',
                date: new Date().toISOString(),
                status: 'success'
            };

            user.totalSpent += transaction.amount;
            user.transactions.push(transaction);
            budgetData.users[userId] = user;

            // Add to payments log
            budgetData.payments.push(transaction);

            // Save data
            saveData();

            // Get AI analysis
            const analysis = AIBudgetAnalyzer.analyzeBudget(userId);

            console.log('✅ Payment verified and budget updated:', {
                userId,
                amount,
                newTotal: user.totalSpent
            });

            res.json({
                success: true,
                message: 'Payment verified and budget updated',
                transaction,
                budgetAnalysis: analysis
            });

        } else {
            console.log('❌ Payment verification failed');
            res.status(400).json({ success: false, error: 'Payment verification failed' });
        }

    } catch (error) {
        console.error('❌ Error verifying payment:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 🔔 Webhook endpoint (for automatic payment updates)
app.post('/webhook', (req, res) => {
    try {
        const signature = req.headers['x-razorpay-signature'];
        const webhookSecret = 'your_webhook_secret'; // Set this in Razorpay dashboard
        
        // Verify webhook signature
        const hmac = crypto.createHmac('sha256', webhookSecret);
        const body = JSON.stringify(req.body);
        hmac.update(body);
        const generated_signature = hmac.digest('hex');

        if (signature === generated_signature) {
            const { event, payload } = req.body;
            
            console.log('🔔 Webhook received:', event);

            switch (event) {
                case 'payment.captured':
                    // Handle successful payment
                    const payment = payload.payment.entity;
                    const userId = payment.notes.userId || 'anonymous';
                    
                    // Update budget automatically
                    const user = budgetData.users[userId] || { totalSpent: 0, transactions: [] };
                    user.totalSpent += payment.amount / 100; // Convert from paise
                    user.transactions.push({
                        id: payment.id,
                        amount: payment.amount / 100,
                        category: payment.notes.category || 'Other',
                        description: payment.notes.description || 'Webhook payment',
                        date: new Date().toISOString(),
                        status: 'captured'
                    });
                    
                    budgetData.users[userId] = user;
                    saveData();
                    break;

                case 'payment.failed':
                    console.log('❌ Payment failed:', payload.payment.entity.id);
                    break;
            }
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error('❌ Webhook error:', error);
        res.status(500).send('Error');
    }
});

// 📊 Get budget dashboard data
app.get('/dashboard/:userId', (req, res) => {
    const { userId } = req.params;
    
    try {
        const analysis = AIBudgetAnalyzer.analyzeBudget(userId);
        const trends = AIBudgetAnalyzer.getSpendingTrends(userId);
        const user = budgetData.users[userId] || { totalSpent: 0, transactions: [] };

        res.json({
            user: {
                id: userId,
                totalSpent: user.totalSpent,
                transactionCount: user.transactions.length,
                recentTransactions: user.transactions.slice(-10).reverse()
            },
            budgetAnalysis: analysis,
            spendingTrends: trends,
            lastUpdated: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error fetching dashboard:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

// 🎯 Set budget limits
app.post('/set-budget', (req, res) => {
    try {
        const { userId, monthlyLimit, categories } = req.body;
        
        budgetData.budgets[userId] = {
            monthly: monthlyLimit || 10000,
            categories: categories || {},
            updatedAt: new Date().toISOString()
        };

        saveData();

        res.json({
            success: true,
            message: 'Budget limits updated',
            budget: budgetData.budgets[userId]
        });

    } catch (error) {
        console.error('❌ Error setting budget:', error);
        res.status(500).json({ error: 'Failed to set budget' });
    }
});

// 📈 Get all payments history
app.get('/payments', (req, res) => {
    res.json({
        payments: budgetData.payments.slice(-50), // Last 50 payments
        totalPayments: budgetData.payments.length
    });
});

// Start server
app.listen(PORT, () => {
    console.log('🚀 AI Budget Tracker Server Started!');
    console.log(`📱 Dashboard: http://localhost:${PORT}`);
    console.log(`🔑 Razorpay Key ID: ${RAZORPAY_KEY_ID}`);
    console.log(`💳 Payment integration: ACTIVE`);
    console.log(`🤖 AI Budget Analysis: ENABLED`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    saveData();
    console.log('\n💾 Data saved. Server shutting down gracefully...');
    process.exit(0);
});
