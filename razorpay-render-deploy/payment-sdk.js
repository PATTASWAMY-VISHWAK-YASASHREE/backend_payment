// Razorpay Payment SDK - Pure Payment Processing
class RazorpayPaymentSDK {
    constructor(config) {
        this.apiUrl = config.apiUrl;
        this.razorpayKeyId = config.razorpayKeyId;
        this.userId = config.userId || 'user_' + Date.now();
        this.loadRazorpaySDK();
    }

    loadRazorpaySDK() {
        if (document.getElementById('razorpay-sdk')) return;
        const script = document.createElement('script');
        script.id = 'razorpay-sdk';
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        document.head.appendChild(script);
    }

    async createUser(userData = {}) {
        const response = await fetch(`${this.apiUrl}/api/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: this.userId,
                name: userData.name || 'User',
                email: userData.email || '',
                initialBudget: userData.budget || 10000
            })
        });
        return await response.json();
    }

    async createOrder(paymentData) {
        const response = await fetch(`${this.apiUrl}/api/create-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: paymentData.amount,
                userId: this.userId,
                category: paymentData.category || 'Payment',
                description: paymentData.description || 'Online Payment',
                currency: paymentData.currency || 'INR'
            })
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        return result;
    }

    async verifyPayment(paymentResponse, orderData) {
        const response = await fetch(`${this.apiUrl}/api/verify-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                razorpay_order_id: paymentResponse.razorpay_order_id,
                razorpay_payment_id: paymentResponse.razorpay_payment_id,
                razorpay_signature: paymentResponse.razorpay_signature,
                userId: this.userId,
                amount: orderData.amount,
                category: orderData.category,
                description: orderData.description
            })
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        return result;
    }

    async makePayment(paymentData, options = {}) {
        try {
            await this.createUser(options.user);
            const order = await this.createOrder(paymentData);

            const razorpayOptions = {
                key: this.razorpayKeyId || order.key,
                amount: order.amount * 100,
                currency: order.currency || 'INR',
                order_id: order.orderId,
                name: options.companyName || 'Your Company',
                description: paymentData.description || 'Payment',
                image: options.logo || '',
                handler: async (response) => {
                    try {
                        const verification = await this.verifyPayment(response, {
                            amount: paymentData.amount,
                            category: paymentData.category,
                            description: paymentData.description
                        });
                        if (options.onSuccess) {
                            options.onSuccess(verification);
                        } else {
                            alert('Payment Successful! ID: ' + response.razorpay_payment_id);
                        }
                    } catch (error) {
                        if (options.onError) {
                            options.onError(error);
                        } else {
                            alert('Payment verification failed: ' + error.message);
                        }
                    }
                },
                modal: {
                    ondismiss: () => {
                        if (options.onCancel) options.onCancel();
                    }
                },
                theme: { color: options.themeColor || '#3399cc' },
                prefill: {
                    name: options.user?.name || '',
                    email: options.user?.email || '',
                    contact: options.user?.phone || ''
                }
            };

            const razorpay = new window.Razorpay(razorpayOptions);
            razorpay.open();

        } catch (error) {
            if (options.onError) {
                options.onError(error);
            } else {
                alert('Payment failed: ' + error.message);
            }
        }
    }
}

// Usage Example:
/*
const paymentSDK = new RazorpayPaymentSDK({
    apiUrl: 'https://your-app.onrender.com',
    razorpayKeyId: 'rzp_test_your_key_id',
    userId: 'user123'
});

function makePayment() {
    paymentSDK.makePayment({
        amount: 500,
        category: 'Shopping',
        description: 'Online Purchase'
    }, {
        companyName: 'Your Store',
        onSuccess: (result) => {
            console.log('Payment Success:', result);
        },
        onError: (error) => {
            console.log('Payment Error:', error);
        }
    });
}
*/
