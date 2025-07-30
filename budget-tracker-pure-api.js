const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-razorpay-signature']
}));

app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    console.log(`[${timestamp}] ${req.method} ${req.path} - IP: ${clientIP}`);
    if (req.body && Object.keys(req.body).length > 0) {
        console.log(`[REQUEST BODY] ${JSON.stringify(req.body, null, 2)}`);
    }
    next();
});

app.use((req, res, next) => {
    res.on('finish', () => {
        console.log(`[RESPONSE] ${req.method} ${req.path} - Status: ${res.statusCode}`);
    });
    next();
});
const csvPath = path.join(__dirname, 'rzp (1).csv');
let RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET;

function initializeRazorpay() {
    try {
        if (!fs.existsSync(csvPath)) {
            console.error('[ERROR] Razorpay credentials file not found:', csvPath);
            console.error('[ERROR] Create file with format: key_id,key_secret');
            process.exit(1);
        }

        const csvData = fs.readFileSync(csvPath, 'utf8');
        const lines = csvData.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
            console.error('[ERROR] Invalid CSV format. Expected header and data row.');
            process.exit(1);
        }

        const dataLine = lines[1];
        const credentials = dataLine.split(',').map(key => key.trim());
        
        if (credentials.length < 2) {
            console.error('[ERROR] Invalid credentials format. Expected: key_id,key_secret');
            process.exit(1);
        }

        [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET] = credentials;
        
        if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
            console.error('[ERROR] Empty credentials found in file');
            process.exit(1);
        }

        console.log('[SUCCESS] Razorpay credentials loaded');
        console.log(`[INFO] Key ID: ${RAZORPAY_KEY_ID.substring(0, 8)}...`);
        return true;
    } catch (error) {
        console.error('[ERROR] Failed to load Razorpay credentials:', error.message);
        process.exit(1);
    }
}

initializeRazorpay();

const razorpay = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET
});

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

const dataPath = path.join(__dirname, 'budget-api-data.json');

function loadData() {
    try {
        if (fs.existsSync(dataPath)) {
            const fileContent = fs.readFileSync(dataPath, 'utf8');
            if (fileContent.trim()) {
                budgetData = JSON.parse(fileContent);
                console.log(`[DATA] Loaded ${Object.keys(budgetData.users).length} users, ${budgetData.payments.length} payments`);
            }
        } else {
            console.log('[DATA] Starting with fresh database');
        }
    } catch (error) {
        console.error('[ERROR] Failed to load data:', error.message);
        console.log('[DATA] Starting with fresh database');
    }
}

function saveData() {
    try {
        fs.writeFileSync(dataPath, JSON.stringify(budgetData, null, 2));
    } catch (error) {
        console.error('[ERROR] Failed to save data:', error.message);
    }
}

loadData();

app.get('/health', (req, res) => {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    
    res.json({
        status: 'healthy',
        service: 'Budget Tracker API',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
        memory: {
            used: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
            total: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`
        },
        razorpay: 'connected',
        database: {
            users: Object.keys(budgetData.users).length,
            transactions: budgetData.payments.length
        }
    });
});

app.get('/api/info', (req, res) => {
    res.json({
        name: 'Budget Tracker API',
        version: '1.0.0',
        description: 'Clean backend API for budget tracking with Razorpay integration',
        endpoints: {
            payment: {
                create_order: 'POST /api/create-order',
                verify_payment: 'POST /api/verify-payment',
                webhook: 'POST /api/webhook'
            },
            users: {
                create_user: 'POST /api/users',
                get_user: 'GET /api/users/:userId',
                update_user: 'PUT /api/users/:userId'
            },
            budget: {
                set_budget: 'POST /api/set-budget',
                get_budget: 'GET /api/budget/:userId'
            },
            transactions: {
                get_transactions: 'GET /api/transactions/:userId',
                get_user_data: 'GET /api/user-data/:userId'
            }
        },
        razorpay_key_id: RAZORPAY_KEY_ID
    });
});

app.post('/api/users', (req, res) => {
    try {
        const { userId, name, email, initialBudget = 10000 } = req.body;
        
        if (!userId || typeof userId !== 'string') {
            return res.status(400).json({ 
                success: false, 
                error: 'Valid userId is required',
                received: typeof userId
            });
        }

        if (budgetData.users[userId]) {
            return res.status(409).json({ 
                success: false, 
                error: 'User already exists',
                userId 
            });
        }

        const newUser = {
            id: userId,
            name: name || 'Anonymous User',
            email: email || '',
            totalSpent: 0,
            transactions: [],
            createdAt: new Date().toISOString(),
            lastActive: new Date().toISOString()
        };

        const newBudget = {
            monthly: initialBudget,
            categories: {},
            alerts: true,
            createdAt: new Date().toISOString()
        };

        budgetData.users[userId] = newUser;
        budgetData.budgets[userId] = newBudget;
        budgetData.analytics.totalUsers++;
        
        saveData();
        console.log(`[USER] Created new user: ${userId}`);

        res.json({
            success: true,
            message: 'User created successfully',
            user: newUser,
            budget: newBudget
        });

    } catch (error) {
        console.error('[ERROR] Create user failed:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to create user',
            details: error.message
        });
    }
});

app.get('/api/users/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                error: 'UserId parameter is required' 
            });
        }

        const user = budgetData.users[userId];
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found',
                userId 
            });
        }

        console.log(`[USER] Retrieved user data: ${userId}`);

        res.json({
            success: true,
            user,
            budget: budgetData.budgets[userId],
            lastUpdated: new Date().toISOString()
        });

    } catch (error) {
        console.error('[ERROR] Get user failed:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch user',
            details: error.message
        });
    }
});

app.post('/api/create-order', async (req, res) => {
    try {
        const { amount, userId, category, description, currency = 'INR' } = req.body;
        
        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Valid amount is required',
                received: amount
            });
        }

        if (!userId || typeof userId !== 'string') {
            return res.status(400).json({ 
                success: false, 
                error: 'Valid userId is required',
                received: typeof userId
            });
        }

        if (!budgetData.users[userId]) {
            const newUser = {
                id: userId,
                name: `User ${userId}`,
                email: `${userId}@example.com`,
                totalSpent: 0,
                transactions: [],
                createdAt: new Date().toISOString(),
                lastActive: new Date().toISOString()
            };
            budgetData.users[userId] = newUser;
            budgetData.budgets[userId] = {
                monthly: 10000,
                categories: {},
                alerts: true,
                createdAt: new Date().toISOString()
            };
            console.log(`[USER] Auto-created user during order: ${userId}`);
        }

        const shortTimestamp = Date.now().toString().slice(-8);
        const shortUserId = userId.slice(-10);
        const orderOptions = {
            amount: Math.round(amount * 100),
            currency: currency,
            receipt: `rcpt_${shortUserId}_${shortTimestamp}`,
            payment_capture: 1,
            notes: {
                userId,
                category: category || 'Other',
                description: description || 'Budget payment',
                createdBy: 'budget_tracker_api'
            }
        };

        const order = await razorpay.orders.create(orderOptions);

        console.log(`[ORDER] Created: ${order.id} for ${userId} - ₹${amount}`);
        
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
        console.error('[ERROR] Create order failed:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to create payment order',
            details: error.message 
        });
    }
});

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

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required payment verification data',
                required: ['razorpay_order_id', 'razorpay_payment_id', 'razorpay_signature']
            });
        }

        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                error: 'UserId is required for payment verification'
            });
        }

        const hmac = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET);
        hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
        const generated_signature = hmac.digest('hex');

        if (generated_signature !== razorpay_signature) {
            console.log(`[SECURITY] Invalid signature for payment: ${razorpay_payment_id}`);
            return res.status(400).json({ 
                success: false, 
                error: 'Payment verification failed - Invalid signature'
            });
        }

        const user = budgetData.users[userId] || { 
            id: userId,
            name: `User ${userId}`,
            email: `${userId}@example.com`,
            totalSpent: 0, 
            transactions: [],
            createdAt: new Date().toISOString(),
            lastActive: new Date().toISOString()
        };
        
        const paymentAmount = parseFloat(amount) || 0;
        const transaction = {
            id: razorpay_payment_id,
            orderId: razorpay_order_id,
            amount: paymentAmount,
            category: category || 'Other',
            description: description || 'Payment',
            date: new Date().toISOString(),
            status: 'success',
            verified: true,
            method: 'razorpay'
        };

        user.totalSpent += paymentAmount;
        user.transactions.push(transaction);
        user.lastActive = new Date().toISOString();
        budgetData.users[userId] = user;

        budgetData.payments.push({
            ...transaction,
            userId
        });

        budgetData.analytics.totalTransactions++;
        budgetData.analytics.totalAmount += paymentAmount;

        saveData();

        console.log(`[PAYMENT] Verified: ${razorpay_payment_id} - ${userId} - ₹${paymentAmount}`);

        res.json({
            success: true,
            message: 'Payment verified and recorded successfully',
            transaction,
            user: {
                id: userId,
                totalSpent: user.totalSpent,
                transactionCount: user.transactions.length
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[ERROR] Payment verification failed:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error during payment verification',
            details: error.message 
        });
    }
});

app.post('/api/webhook', (req, res) => {
    try {
        const signature = req.headers['x-razorpay-signature'];
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'your_webhook_secret';
        
        if (webhookSecret !== 'your_webhook_secret') {
            const hmac = crypto.createHmac('sha256', webhookSecret);
            const body = JSON.stringify(req.body);
            hmac.update(body);
            const generated_signature = hmac.digest('hex');

            if (signature !== generated_signature) {
                console.log('[SECURITY] Webhook signature verification failed');
                return res.status(400).json({ error: 'Invalid signature' });
            }
        }

        const { event, payload } = req.body;
        console.log(`[WEBHOOK] Event: ${event}, Payment ID: ${payload.payment?.entity?.id || 'N/A'}`);

        res.status(200).json({ received: true, event, timestamp: new Date().toISOString() });

    } catch (error) {
        console.error('[ERROR] Webhook processing failed:', error.message);
        res.status(500).json({ error: 'Webhook processing error', details: error.message });
    }
});

app.post('/api/set-budget', (req, res) => {
    try {
        const { userId, monthlyLimit, categories, alerts = true } = req.body;
        
        if (!userId || typeof userId !== 'string') {
            return res.status(400).json({ 
                success: false, 
                error: 'Valid userId is required',
                received: typeof userId
            });
        }

        if (!monthlyLimit || isNaN(monthlyLimit) || monthlyLimit <= 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Valid monthly limit is required',
                received: monthlyLimit
            });
        }

        const budgetData_entry = {
            monthly: monthlyLimit,
            categories: categories || {},
            alerts,
            updatedAt: new Date().toISOString()
        };

        budgetData.budgets[userId] = budgetData_entry;
        saveData();

        console.log(`[BUDGET] Updated for ${userId}: ₹${monthlyLimit}`);

        res.json({
            success: true,
            message: 'Budget limits updated successfully',
            budget: budgetData_entry
        });

    } catch (error) {
        console.error('[ERROR] Set budget failed:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to set budget',
            details: error.message 
        });
    }
});

app.get('/api/budget/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                error: 'UserId parameter is required' 
            });
        }

        const budget = budgetData.budgets[userId];
        
        if (!budget) {
            return res.status(404).json({ 
                success: false, 
                error: 'Budget not found',
                userId 
            });
        }

        res.json({
            success: true,
            budget,
            lastUpdated: new Date().toISOString()
        });

    } catch (error) {
        console.error('[ERROR] Get budget failed:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch budget',
            details: error.message
        });
    }
});

app.get('/api/transactions/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        const { limit = 50, offset = 0, category, status } = req.query;
        
        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                error: 'UserId parameter is required' 
            });
        }

        const user = budgetData.users[userId];
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found',
                userId 
            });
        }

        let transactions = [...user.transactions];

        if (category && category !== 'all') {
            transactions = transactions.filter(t => t.category === category);
        }
        
        if (status && status !== 'all') {
            transactions = transactions.filter(t => t.status === status);
        }

        transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        const startIndex = parseInt(offset) || 0;
        const limitNum = parseInt(limit) || 50;
        const endIndex = startIndex + limitNum;
        const paginatedTransactions = transactions.slice(startIndex, endIndex);

        console.log(`[TRANSACTIONS] Retrieved ${paginatedTransactions.length}/${transactions.length} for ${userId}`);

        res.json({
            success: true,
            transactions: paginatedTransactions,
            pagination: {
                total: transactions.length,
                limit: limitNum,
                offset: startIndex,
                hasMore: endIndex < transactions.length
            }
        });

    } catch (error) {
        console.error('[ERROR] Get transactions failed:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch transactions',
            details: error.message 
        });
    }
});

app.get('/api/user-data/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                error: 'UserId parameter is required' 
            });
        }

        const user = budgetData.users[userId];
        const budget = budgetData.budgets[userId];
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found',
                userId 
            });
        }

        const totalSpent = user.totalSpent || 0;
        const budgetLimit = budget?.monthly || 0;
        const remainingBudget = budgetLimit - totalSpent;
        const spendingPercentage = budgetLimit > 0 ? (totalSpent / budgetLimit) * 100 : 0;

        console.log(`[USER-DATA] Retrieved complete data for ${userId}`);

        res.json({
            success: true,
            user: {
                id: userId,
                name: user.name || 'User',
                email: user.email || '',
                totalSpent,
                transactionCount: user.transactions?.length || 0,
                lastActive: user.lastActive,
                createdAt: user.createdAt
            },
            budget: {
                monthly: budgetLimit,
                spent: totalSpent,
                remaining: remainingBudget,
                spendingPercentage: parseFloat(spendingPercentage.toFixed(2)),
                categories: budget?.categories || {},
                alerts: budget?.alerts || true
            },
            recentTransactions: (user.transactions || []).slice(-10).reverse(),
            lastUpdated: new Date().toISOString()
        });

    } catch (error) {
        console.error('[ERROR] Get user data failed:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch user data',
            details: error.message 
        });
    }
});

app.use((err, req, res, next) => {
    console.error('[UNHANDLED ERROR]', err.stack);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
        timestamp: new Date().toISOString()
    });
});

app.use('*', (req, res) => {
    console.log(`[404] Unknown endpoint: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        requested: `${req.method} ${req.originalUrl}`,
        availableEndpoints: '/api/info'
    });
});

app.listen(PORT, '0.0.0.0', () => {
    const networkInterfaces = require('os').networkInterfaces();
    const localIPs = [];
    
    Object.keys(networkInterfaces).forEach(interfaceName => {
        networkInterfaces[interfaceName].forEach(interface => {
            if (interface.family === 'IPv4' && !interface.internal) {
                localIPs.push(interface.address);
            }
        });
    });

    console.log('\n=================================');
    console.log('Budget Tracker API Server Started');
    console.log('=================================');
    console.log(`Port: ${PORT}`);
    console.log(`Local: http://localhost:${PORT}`);
    
    if (localIPs.length > 0) {
        console.log('Network Access:');
        localIPs.forEach(ip => {
            console.log(`  http://${ip}:${PORT}`);
        });
    }
    
    console.log('\nEndpoints:');
    console.log(`  Health: /health`);
    console.log(`  API Info: /api/info`);
    console.log(`  Create Order: POST /api/create-order`);
    console.log(`  Verify Payment: POST /api/verify-payment`);
    
    console.log('\nDatabase Status:');
    console.log(`  Users: ${Object.keys(budgetData.users).length}`);
    console.log(`  Transactions: ${budgetData.payments.length}`);
    console.log(`  Total Amount: ₹${budgetData.analytics.totalAmount.toLocaleString()}`);
    
    console.log(`\nRazorpay: Connected (${RAZORPAY_KEY_ID.substring(0, 8)}...)`);
    console.log('=================================\n');
});

process.on('SIGINT', () => {
    console.log('\n[SHUTDOWN] Saving data and shutting down...');
    saveData();
    console.log('[SHUTDOWN] Server stopped gracefully');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n[SHUTDOWN] Saving data and shutting down...');
    saveData();
    console.log('[SHUTDOWN] Server stopped gracefully');
    process.exit(0);
});

module.exports = app;
