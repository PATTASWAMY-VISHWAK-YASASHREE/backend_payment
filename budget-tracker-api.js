// 🤖 AI Budget Tracker API Server - Backend Only
// Ready for integration with any frontend/mobile app

const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// ⚙️ Middleware Configuration
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    credentials: true
}));

// 📝 Request Logging Middleware
app.use((req, res, next) => {
    console.log(`📡 ${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// 🔑 Load Razorpay Credentials
const csvPath = path.join(__dirname, 'rzp (1).csv');
let RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET;

try {
    const csvData = fs.readFileSync(csvPath, 'utf8');
    const lines = csvData.split('\n');
    const dataLine = lines[1]; // Skip header
    [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET] = dataLine.split(',').map(key => key.trim());
    console.log('🔑 Razorpay credentials loaded successfully');
} catch (error) {
    console.error('❌ Error reading Razorpay credentials:', error);
    console.log('💡 Make sure rzp (1).csv file exists with key_id,key_secret format');
    process.exit(1);
}

// 🏦 Initialize Razorpay Instance
const razorpay = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET
});

// 💾 Data Storage (Production: Replace with MongoDB/PostgreSQL)
let budgetData = {
    users: {},
    payments: [],
    budgets: {},
    analytics: {
        totalUsers: 0,
        totalTransactions: 0,
        totalAmount: 0
    }
};

// 📁 Data Persistence
const dataPath = path.join(__dirname, 'budget-api-data.json');

function loadData() {
    try {
        if (fs.existsSync(dataPath)) {
            budgetData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
            console.log('📊 Budget data loaded from storage');
        }
    } catch (error) {
        console.log('📊 Starting with fresh budget data');
    }
}

function saveData() {
    try {
        fs.writeFileSync(dataPath, JSON.stringify(budgetData, null, 2));
    } catch (error) {
        console.error('❌ Error saving data:', error);
    }
}

// 🚀 Initialize data on startup
loadData();

// 🤖 AI Budget Analyzer Engine
class AIBudgetAnalyzer {
    static analyzeBudget(userId) {
        const user = budgetData.users[userId] || { totalSpent: 0, transactions: [], createdAt: new Date().toISOString() };
        const budget = budgetData.budgets[userId] || { monthly: 10000, categories: {}, alerts: true };
        
        const analysis = {
            userId,
            currentSpent: user.totalSpent,
            budgetLimit: budget.monthly,
            remainingBudget: budget.monthly - user.totalSpent,
            spendingPercentage: budget.monthly > 0 ? ((user.totalSpent / budget.monthly) * 100).toFixed(2) : 0,
            status: 'good',
            riskLevel: 'low',
            aiRecommendation: '',
            categoryBreakdown: this.getCategoryBreakdown(user.transactions),
            monthlyProjection: this.getMonthlyProjection(user.transactions),
            lastUpdated: new Date().toISOString()
        };

        // 🎯 AI Risk Assessment
        const percentage = parseFloat(analysis.spendingPercentage);
        
        if (percentage >= 100) {
            analysis.status = 'over_budget';
            analysis.riskLevel = 'critical';
            analysis.aiRecommendation = '🚨 CRITICAL: Budget exceeded! Immediate action required. Consider emergency savings or expense cuts.';
        } else if (percentage >= 90) {
            analysis.status = 'critical';
            analysis.riskLevel = 'high';
            analysis.aiRecommendation = '⚠️ HIGH RISK: 90%+ budget used. Stop discretionary spending immediately.';
        } else if (percentage >= 75) {
            analysis.status = 'warning';
            analysis.riskLevel = 'medium';
            analysis.aiRecommendation = '📊 MEDIUM RISK: 75% budget used. Start reducing expenses and track daily.';
        } else if (percentage >= 50) {
            analysis.status = 'moderate';
            analysis.riskLevel = 'low';
            analysis.aiRecommendation = '📈 ON TRACK: Good spending pace. Continue monitoring regularly.';
        } else {
            analysis.status = 'excellent';
            analysis.riskLevel = 'very_low';
            analysis.aiRecommendation = '✅ EXCELLENT: Well within budget. Consider increasing savings or investments.';
        }

        return analysis;
    }

    static getCategoryBreakdown(transactions) {
        const categories = {};
        transactions.forEach(transaction => {
            const category = transaction.category || 'Other';
            categories[category] = (categories[category] || 0) + transaction.amount;
        });
        
        // Sort by amount descending
        return Object.entries(categories)
            .sort(([,a], [,b]) => b - a)
            .reduce((obj, [key, value]) => {
                obj[key] = {
                    amount: value,
                    percentage: categories.total ? ((value / Object.values(categories).reduce((a, b) => a + b, 0)) * 100).toFixed(2) : 0
                };
                return obj;
            }, {});
    }

    static getMonthlyProjection(transactions) {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const currentDay = now.getDate();
        
        const thisMonthTransactions = transactions.filter(t => {
            const transactionDate = new Date(t.date);
            return transactionDate.getMonth() === currentMonth && 
                   transactionDate.getFullYear() === currentYear;
        });

        const spentThisMonth = thisMonthTransactions.reduce((sum, t) => sum + t.amount, 0);
        const dailyAverage = spentThisMonth / currentDay;
        const projectedMonthly = dailyAverage * daysInMonth;

        return {
            spentThisMonth,
            dailyAverage: dailyAverage.toFixed(2),
            projectedMonthly: projectedMonthly.toFixed(2),
            remainingDays: daysInMonth - currentDay,
            transactionCount: thisMonthTransactions.length
        };
    }

    static getSpendingTrends(userId, days = 30) {
        const user = budgetData.users[userId] || { transactions: [] };
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const recentTransactions = user.transactions.filter(t => 
            new Date(t.date) >= cutoffDate
        );

        const dailySpending = {};
        recentTransactions.forEach(t => {
            const day = new Date(t.date).toISOString().split('T')[0];
            dailySpending[day] = (dailySpending[day] || 0) + t.amount;
        });

        return {
            totalTransactions: recentTransactions.length,
            totalAmount: recentTransactions.reduce((sum, t) => sum + t.amount, 0),
            averageTransaction: recentTransactions.length > 0 ? 
                (recentTransactions.reduce((sum, t) => sum + t.amount, 0) / recentTransactions.length).toFixed(2) : 0,
            dailySpending,
            period: `${days} days`,
            trends: recentTransactions.slice(-10).reverse()
        };
    }
}

// 📡 API Routes

// 🏠 Health Check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'AI Budget Tracker API',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        razorpay: 'connected'
    });
});

// 📊 API Information
app.get('/api/info', (req, res) => {
    res.json({
        name: 'AI Budget Tracker API',
        version: '1.0.0',
        description: 'Backend API for AI-powered budget tracking with Razorpay integration',
        endpoints: {
            payment: {
                create_order: 'POST /api/create-order',
                verify_payment: 'POST /api/verify-payment'
            },
            budget: {
                get_dashboard: 'GET /api/dashboard/:userId',
                set_budget: 'POST /api/set-budget',
                get_analytics: 'GET /api/analytics/:userId'
            },
            users: {
                create_user: 'POST /api/users',
                get_user: 'GET /api/users/:userId',
                update_user: 'PUT /api/users/:userId'
            }
        },
        razorpay_key_id: RAZORPAY_KEY_ID
    });
});

// 👤 User Management
app.post('/api/users', (req, res) => {
    try {
        const { userId, name, email, initialBudget = 10000 } = req.body;
        
        if (!userId) {
            return res.status(400).json({ error: 'UserId is required' });
        }

        if (budgetData.users[userId]) {
            return res.status(409).json({ error: 'User already exists' });
        }

        budgetData.users[userId] = {
            id: userId,
            name: name || 'Anonymous User',
            email: email || '',
            totalSpent: 0,
            transactions: [],
            createdAt: new Date().toISOString(),
            lastActive: new Date().toISOString()
        };

        budgetData.budgets[userId] = {
            monthly: initialBudget,
            categories: {},
            alerts: true,
            createdAt: new Date().toISOString()
        };

        budgetData.analytics.totalUsers++;
        saveData();

        res.json({
            success: true,
            message: 'User created successfully',
            user: budgetData.users[userId],
            budget: budgetData.budgets[userId]
        });

    } catch (error) {
        console.error('❌ Error creating user:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

app.get('/api/users/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        const user = budgetData.users[userId];
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            user,
            budget: budgetData.budgets[userId],
            lastUpdated: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error fetching user:', error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// 💳 Payment Order Creation
app.post('/api/create-order', async (req, res) => {
    try {
        const { amount, userId, category, description, currency = 'INR' } = req.body;
        
        // Validation
        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Valid amount is required' });
        }

        if (!userId) {
            return res.status(400).json({ error: 'UserId is required' });
        }

        // Ensure user exists
        if (!budgetData.users[userId]) {
            budgetData.users[userId] = {
                id: userId,
                totalSpent: 0,
                transactions: [],
                createdAt: new Date().toISOString()
            };
        }

        // Create Razorpay order
        const shortTimestamp = Date.now().toString().slice(-8); // Last 8 digits
        const shortUserId = userId.slice(-10); // Last 10 chars of userId  
        const orderOptions = {
            amount: Math.round(amount * 100), // Convert to paise
            currency: currency,
            receipt: `rcpt_${shortUserId}_${shortTimestamp}`, // Max 40 chars
            payment_capture: 1,
            notes: {
                userId,
                category: category || 'Other',
                description: description || 'Budget payment',
                createdBy: 'budget_tracker_api'
            }
        };

        const order = await razorpay.orders.create(orderOptions);

        console.log('💳 Order created:', {
            orderId: order.id,
            userId,
            amount,
            category
        });
        
        res.json({
            success: true,
            orderId: order.id,
            amount: amount,
            currency: currency,
            key: RAZORPAY_KEY_ID,
            userId,
            category,
            description,
            receipt: order.receipt,
            created_at: order.created_at
        });

    } catch (error) {
        console.error('❌ Error creating order:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to create payment order',
            details: error.message 
        });
    }
});

// ✅ Payment Verification
app.post('/api/verify-payment', (req, res) => {
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

        // Input validation
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !userId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required payment verification data' 
            });
        }

        // Verify Razorpay signature
        const hmac = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET);
        hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
        const generated_signature = hmac.digest('hex');

        if (generated_signature !== razorpay_signature) {
            console.log('❌ Payment verification failed - Invalid signature');
            return res.status(400).json({ 
                success: false, 
                error: 'Payment verification failed - Invalid signature' 
            });
        }

        // Get or create user
        const user = budgetData.users[userId] || { 
            id: userId,
            totalSpent: 0, 
            transactions: [],
            createdAt: new Date().toISOString()
        };
        
        // Create transaction record
        const transaction = {
            id: razorpay_payment_id,
            orderId: razorpay_order_id,
            amount: parseFloat(amount),
            category: category || 'Other',
            description: description || 'Payment',
            date: new Date().toISOString(),
            status: 'success',
            verified: true,
            method: 'razorpay'
        };

        // Update user data
        user.totalSpent += transaction.amount;
        user.transactions.push(transaction);
        user.lastActive = new Date().toISOString();
        budgetData.users[userId] = user;

        // Add to global payments log
        budgetData.payments.push({
            ...transaction,
            userId
        });

        // Update analytics
        budgetData.analytics.totalTransactions++;
        budgetData.analytics.totalAmount += transaction.amount;

        // Save data
        saveData();

        // Get AI analysis
        const analysis = AIBudgetAnalyzer.analyzeBudget(userId);

        console.log('✅ Payment verified and budget updated:', {
            userId,
            paymentId: razorpay_payment_id,
            amount: transaction.amount,
            newTotal: user.totalSpent,
            status: analysis.status
        });

        res.json({
            success: true,
            message: 'Payment verified and budget updated successfully',
            transaction,
            budgetAnalysis: analysis,
            user: {
                id: userId,
                totalSpent: user.totalSpent,
                transactionCount: user.transactions.length
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error verifying payment:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error during payment verification',
            details: error.message 
        });
    }
});

// 🔔 Razorpay Webhook Handler
app.post('/api/webhook', (req, res) => {
    try {
        const signature = req.headers['x-razorpay-signature'];
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'your_webhook_secret';
        
        // Verify webhook signature
        const hmac = crypto.createHmac('sha256', webhookSecret);
        const body = JSON.stringify(req.body);
        hmac.update(body);
        const generated_signature = hmac.digest('hex');

        if (signature !== generated_signature) {
            console.log('❌ Webhook signature verification failed');
            return res.status(400).send('Invalid signature');
        }

        const { event, payload } = req.body;
        
        console.log('🔔 Webhook received:', event, 'Payment ID:', payload.payment?.entity?.id);

        switch (event) {
            case 'payment.captured':
                handlePaymentCaptured(payload.payment.entity);
                break;
            case 'payment.failed':
                handlePaymentFailed(payload.payment.entity);
                break;
            case 'order.paid':
                handleOrderPaid(payload.order.entity);
                break;
            default:
                console.log('📡 Unhandled webhook event:', event);
        }

        res.status(200).json({ received: true });

    } catch (error) {
        console.error('❌ Webhook error:', error);
        res.status(500).send('Webhook processing error');
    }
});

function handlePaymentCaptured(payment) {
    const userId = payment.notes?.userId;
    if (!userId) return;

    const user = budgetData.users[userId];
    if (!user) return;

    // Check if transaction already exists
    const existingTransaction = user.transactions.find(t => t.id === payment.id);
    if (existingTransaction) return;

    const transaction = {
        id: payment.id,
        orderId: payment.order_id,
        amount: payment.amount / 100, // Convert from paise
        category: payment.notes?.category || 'Other',
        description: payment.notes?.description || 'Webhook payment',
        date: new Date(payment.created_at * 1000).toISOString(),
        status: 'captured',
        method: 'razorpay_webhook'
    };

    user.totalSpent += transaction.amount;
    user.transactions.push(transaction);
    budgetData.payments.push({ ...transaction, userId });
    
    saveData();
    console.log('✅ Webhook payment processed:', payment.id);
}

function handlePaymentFailed(payment) {
    console.log('❌ Payment failed via webhook:', payment.id, payment.error_description);
}

function handleOrderPaid(order) {
    console.log('💳 Order paid via webhook:', order.id);
}

// 📊 Dashboard Data
app.get('/api/dashboard/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        const { days } = req.query; // Optional: filter by days
        
        if (!budgetData.users[userId]) {
            return res.status(404).json({ error: 'User not found' });
        }

        const analysis = AIBudgetAnalyzer.analyzeBudget(userId);
        const trends = AIBudgetAnalyzer.getSpendingTrends(userId, days ? parseInt(days) : 30);
        const user = budgetData.users[userId];

        res.json({
            success: true,
            user: {
                id: userId,
                name: user.name || 'User',
                totalSpent: user.totalSpent,
                transactionCount: user.transactions.length,
                recentTransactions: user.transactions.slice(-10).reverse(),
                lastActive: user.lastActive
            },
            budgetAnalysis: analysis,
            spendingTrends: trends,
            lastUpdated: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error fetching dashboard:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch dashboard data',
            details: error.message 
        });
    }
});

// 🎯 Budget Management
app.post('/api/set-budget', (req, res) => {
    try {
        const { userId, monthlyLimit, categories, alerts = true } = req.body;
        
        if (!userId) {
            return res.status(400).json({ error: 'UserId is required' });
        }

        if (!monthlyLimit || monthlyLimit <= 0) {
            return res.status(400).json({ error: 'Valid monthly limit is required' });
        }

        budgetData.budgets[userId] = {
            monthly: monthlyLimit,
            categories: categories || {},
            alerts,
            updatedAt: new Date().toISOString()
        };

        saveData();

        // Get updated analysis
        const analysis = AIBudgetAnalyzer.analyzeBudget(userId);

        res.json({
            success: true,
            message: 'Budget limits updated successfully',
            budget: budgetData.budgets[userId],
            budgetAnalysis: analysis
        });

    } catch (error) {
        console.error('❌ Error setting budget:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to set budget',
            details: error.message 
        });
    }
});

// 📈 Advanced Analytics
app.get('/api/analytics/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        const { period = '30' } = req.query;
        
        const user = budgetData.users[userId];
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const days = parseInt(period);
        const analysis = AIBudgetAnalyzer.analyzeBudget(userId);
        const trends = AIBudgetAnalyzer.getSpendingTrends(userId, days);

        // Additional analytics
        const categoryStats = Object.entries(analysis.categoryBreakdown)
            .map(([category, data]) => ({
                category,
                amount: data.amount,
                percentage: data.percentage,
                transactionCount: user.transactions.filter(t => t.category === category).length
            }));

        const monthlyStats = user.transactions.reduce((acc, transaction) => {
            const month = new Date(transaction.date).toISOString().substring(0, 7); // YYYY-MM
            acc[month] = (acc[month] || 0) + transaction.amount;
            return acc;
        }, {});

        res.json({
            success: true,
            userId,
            period: `${days} days`,
            overview: {
                totalSpent: user.totalSpent,
                totalTransactions: user.transactions.length,
                averageTransaction: user.transactions.length > 0 ? 
                    (user.totalSpent / user.transactions.length).toFixed(2) : 0,
                budgetUtilization: analysis.spendingPercentage + '%',
                riskLevel: analysis.riskLevel
            },
            budgetAnalysis: analysis,
            spendingTrends: trends,
            categoryStats,
            monthlyStats,
            generatedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error fetching analytics:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch analytics',
            details: error.message 
        });
    }
});

// 📋 Transaction History
app.get('/api/transactions/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        const { limit = 50, offset = 0, category, status } = req.query;
        
        const user = budgetData.users[userId];
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        let transactions = [...user.transactions];

        // Apply filters
        if (category && category !== 'all') {
            transactions = transactions.filter(t => t.category === category);
        }
        
        if (status && status !== 'all') {
            transactions = transactions.filter(t => t.status === status);
        }

        // Sort by date (newest first)
        transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Apply pagination
        const startIndex = parseInt(offset);
        const endIndex = startIndex + parseInt(limit);
        const paginatedTransactions = transactions.slice(startIndex, endIndex);

        res.json({
            success: true,
            transactions: paginatedTransactions,
            pagination: {
                total: transactions.length,
                limit: parseInt(limit),
                offset: parseInt(offset),
                hasMore: endIndex < transactions.length
            }
        });

    } catch (error) {
        console.error('❌ Error fetching transactions:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch transactions',
            details: error.message 
        });
    }
});

// 🌐 Global Statistics (Admin endpoint)
app.get('/api/admin/stats', (req, res) => {
    try {
        const totalUsers = Object.keys(budgetData.users).length;
        const totalTransactions = budgetData.payments.length;
        const totalAmount = budgetData.payments.reduce((sum, payment) => sum + payment.amount, 0);
        
        const activeUsers = Object.values(budgetData.users).filter(user => {
            const lastActive = new Date(user.lastActive || user.createdAt);
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            return lastActive >= oneWeekAgo;
        }).length;

        res.json({
            success: true,
            statistics: {
                totalUsers,
                activeUsers,
                totalTransactions,
                totalAmount: totalAmount.toFixed(2),
                averageTransactionAmount: totalTransactions > 0 ? 
                    (totalAmount / totalTransactions).toFixed(2) : 0,
                averageUserSpending: totalUsers > 0 ? 
                    (totalAmount / totalUsers).toFixed(2) : 0
            },
            generatedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error fetching admin stats:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch statistics',
            details: error.message 
        });
    }
});

// ❌ Error Handling Middleware
app.use((err, req, res, next) => {
    console.error('💥 Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// 🔍 404 Handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        availableEndpoints: '/api/info'
    });
});

// 🚀 Start Server
app.listen(PORT, () => {
    console.log('🤖 AI Budget Tracker API Server Started!');
    console.log(`🌐 API Base URL: http://localhost:${PORT}`);
    console.log(`📚 API Documentation: http://localhost:${PORT}/api/info`);
    console.log(`💊 Health Check: http://localhost:${PORT}/health`);
    console.log(`🔑 Razorpay Key ID: ${RAZORPAY_KEY_ID}`);
    console.log(`💳 Payment Integration: ACTIVE`);
    console.log(`🤖 AI Budget Analysis: ENABLED`);
    console.log(`📊 Total Users: ${Object.keys(budgetData.users).length}`);
    console.log(`💰 Total Transactions: ${budgetData.payments.length}`);
});

// 🛡️ Graceful Shutdown
process.on('SIGINT', () => {
    console.log('\n💾 Saving data...');
    saveData();
    console.log('🛑 AI Budget Tracker API shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n💾 Saving data...');
    saveData();
    console.log('🛑 AI Budget Tracker API shutting down gracefully...');
    process.exit(0);
});

// 📤 Export for testing/integration
module.exports = app;
