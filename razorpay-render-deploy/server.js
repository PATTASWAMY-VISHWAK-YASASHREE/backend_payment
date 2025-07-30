const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// Security and Performance Middleware
app.use(helmet());
app.use(compression());
app.use(morgan('combined'));

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: {
        success: false,
        error: 'Too many requests from this IP, please try again later.'
    }
});
app.use('/api/', limiter);

// CORS Configuration
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-razorpay-signature']
}));

// Body Parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// In-memory data storage
let budgetData = {
    users: {},
    payments: [],
    analytics: { totalUsers: 0, totalTransactions: 0, totalAmount: 0 }
};

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        success: true,
        service: 'Razorpay Budget Tracker API',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString(),
        endpoints: {
            health: '/health',
            info: '/api/info',
            users: '/api/users',
            payments: '/api/create-order, /api/verify-payment'
        }
    });
});

// Health Check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'Razorpay Budget Tracker API',
        timestamp: new Date().toISOString(),
        uptime: `${Math.floor(process.uptime() / 60)}m`,
        environment: process.env.NODE_ENV || 'development',
        razorpay: 'connected'
    });
});

// API Information
app.get('/api/info', (req, res) => {
    res.json({
        name: 'Razorpay Budget Tracker API',
        version: '1.0.0',
        endpoints: {
            health: 'GET /health',
            create_order: 'POST /api/create-order',
            verify_payment: 'POST /api/verify-payment',
            create_user: 'POST /api/users'
        },
        razorpay_key_id: process.env.RAZORPAY_KEY_ID
    });
});

// Create User
app.post('/api/users', (req, res) => {
    try {
        const { userId, name, email, initialBudget = 10000 } = req.body;
        
        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                error: 'UserId is required' 
            });
        }

        if (budgetData.users[userId]) {
            return res.status(409).json({ 
                success: false, 
                error: 'User already exists' 
            });
        }

        const newUser = {
            id: userId,
            name: name || 'User',
            email: email || '',
            totalSpent: 0,
            transactions: [],
            createdAt: new Date().toISOString()
        };

        budgetData.users[userId] = newUser;
        budgetData.analytics.totalUsers++;

        res.json({
            success: true,
            message: 'User created successfully',
            user: newUser
        });

    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to create user' 
        });
    }
});

// Create Payment Order
app.post('/api/create-order', async (req, res) => {
    try {
        const { amount, userId, category, description, currency = 'INR' } = req.body;
        
        if (!amount || !userId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Amount and userId are required' 
            });
        }

        // Auto-create user if doesn't exist
        if (!budgetData.users[userId]) {
            budgetData.users[userId] = {
                id: userId,
                name: `User ${userId}`,
                email: '',
                totalSpent: 0,
                transactions: [],
                createdAt: new Date().toISOString()
            };
        }

        const orderOptions = {
            amount: Math.round(amount * 100),
            currency: currency,
            receipt: `rcpt_${userId}_${Date.now()}`,
            payment_capture: 1
        };

        const order = await razorpay.orders.create(orderOptions);

        res.json({
            success: true,
            orderId: order.id,
            amount: amount,
            currency: currency,
            key: process.env.RAZORPAY_KEY_ID,
            userId,
            category,
            description
        });

    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to create payment order' 
        });
    }
});

// Verify Payment
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

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !userId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required payment data' 
            });
        }

        // Verify signature
        const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
        hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
        const generated_signature = hmac.digest('hex');

        if (generated_signature !== razorpay_signature) {
            return res.status(400).json({ 
                success: false, 
                error: 'Payment verification failed' 
            });
        }

        // Update user data
        const user = budgetData.users[userId];
        if (user) {
            const paymentAmount = parseFloat(amount) || 0;
            const transaction = {
                id: razorpay_payment_id,
                orderId: razorpay_order_id,
                amount: paymentAmount,
                category: category || 'Payment',
                description: description || 'Payment',
                date: new Date().toISOString(),
                status: 'success'
            };

            user.totalSpent += paymentAmount;
            user.transactions.push(transaction);

            budgetData.payments.push({ ...transaction, userId });
            budgetData.analytics.totalTransactions++;
            budgetData.analytics.totalAmount += paymentAmount;
        }

        res.json({
            success: true,
            message: 'Payment verified successfully',
            transaction: {
                id: razorpay_payment_id,
                amount: parseFloat(amount),
                status: 'success'
            }
        });

    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Payment verification failed' 
        });
    }
});

// Webhook Handler
app.post('/api/webhook', (req, res) => {
    console.log('Webhook received:', req.body);
    res.status(200).json({ received: true });
});

// 404 Handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        available: '/api/info'
    });
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
    console.log('=================================');
    console.log('Razorpay Budget Tracker API');
    console.log('=================================');
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Port: ${PORT}`);
    console.log(`Razorpay Key: ${process.env.RAZORPAY_KEY_ID || 'Not Set'}`);
    console.log('=================================');
});

module.exports = app;
