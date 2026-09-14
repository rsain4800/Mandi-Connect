const nodemailer = require('nodemailer');
const logger = require('./logger');

const smtpConfigured = Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD &&
    !process.env.SMTP_HOST.includes('example.com') &&
    !process.env.SMTP_USER.startsWith('replace_with_') &&
    !process.env.SMTP_PASSWORD.startsWith('replace_with_')
);

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASSWORD || ''
    }
});

// Send Order Notification to SINGLE ADMIN EMAIL
const sendAdminNewOrderEmail = async (order, items, customer) => {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@mandiconnect.com';
    
    let itemsHtml = items.map(item => `
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.product_name} (${item.unit})</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₹${parseFloat(item.price).toFixed(2)}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₹${parseFloat(item.total_price).toFixed(2)}</td>
        </tr>
    `).join('');

    const mailOptions = {
        from: `"Mandi Connect System" <${process.env.SMTP_USER || 'noreply@mandiconnect.com'}>`,
        to: adminEmail,
        subject: `New Mandi Connect Order - #${order.order_number}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px; background: #fafafa;">
                <h2 style="color: #163326; margin-top: 0;">🛒 New Order Received!</h2>
                <p>A new order <strong>#${order.order_number}</strong> has been placed on Mandi Connect.</p>
                
                <h3 style="color: #1F4D36; border-bottom: 2px solid #2E6B4D; padding-bottom: 6px;">Customer Information</h3>
                <p>
                    <strong>Name:</strong> ${customer.full_name}<br>
                    <strong>Email:</strong> ${customer.email}<br>
                    <strong>Phone:</strong> ${customer.phone || 'N/A'}<br>
                    <strong>Delivery Address:</strong> ${order.shipping_address_text}
                </p>

                <h3 style="color: #1F4D36; border-bottom: 2px solid #2E6B4D; padding-bottom: 6px;">Order Details</h3>
                <p>
                    <strong>Order ID:</strong> ${order.order_number}<br>
                    <strong>Order Date:</strong> ${new Date(order.created_at || Date.now()).toLocaleString()}<br>
                    <strong>Payment Method:</strong> ${order.payment_method.toUpperCase()}<br>
                    <strong>Payment Status:</strong> <span style="text-transform: uppercase; color: ${order.payment_status === 'paid' ? 'green' : 'orange'};">${order.payment_status}</span>
                </p>

                <table style="width: 100%; border-collapse: collapse; background: #ffffff; margin-top: 16px;">
                    <thead>
                        <tr style="background: #163326; color: #ffffff;">
                            <th style="padding: 10px; text-align: left;">Product</th>
                            <th style="padding: 10px; text-align: center;">Qty</th>
                            <th style="padding: 10px; text-align: right;">Price</th>
                            <th style="padding: 10px; text-align: right;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>

                <div style="margin-top: 16px; text-align: right; line-height: 1.6;">
                    <p>Subtotal: <strong>₹${parseFloat(order.subtotal).toFixed(2)}</strong></p>
                    <p>Discount: <strong>-₹${parseFloat(order.discount_amount).toFixed(2)}</strong></p>
                    <p>Shipping Charge: <strong>₹${parseFloat(order.shipping_charge).toFixed(2)}</strong></p>
                    <h3 style="color: #D9760C; margin: 8px 0 0 0;">Grand Total: ₹${parseFloat(order.total_amount).toFixed(2)}</h3>
                </div>
            </div>
        `
    };

    try {
        if (smtpConfigured) {
            await transporter.sendMail(mailOptions);
            logger.info({ orderNumber: order.order_number, adminEmail }, 'Admin order notification email sent');
        } else {
            logger.info({ orderNumber: order.order_number, adminEmail }, '[SMTP Not Configured] Mock admin order email');
        }
    } catch (error) {
        logger.error({ err: error }, 'Failed to send admin order email');
    }
};

// Send Order Confirmation to Customer
const sendCustomerOrderEmail = async (order, items, customer) => {
    let itemsHtml = items.map(item => `
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.product_name} (${item.unit})</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₹${parseFloat(item.total_price).toFixed(2)}</td>
        </tr>
    `).join('');

    const mailOptions = {
        from: `"Mandi Connect" <${process.env.SMTP_USER || 'noreply@mandiconnect.com'}>`,
        to: customer.email,
        subject: `Order Confirmation - #${order.order_number} | Mandi Connect`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px;">
                <h2 style="color: #1F4D36;">Thank you for your order, ${customer.full_name}! 🎉</h2>
                <p>We are processing your fresh produce order. Here is your summary:</p>
                <p><strong>Order ID:</strong> #${order.order_number}</p>
                
                <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
                    <thead>
                        <tr style="background: #E4EEE7; color: #163326;">
                            <th style="padding: 8px; text-align: left;">Item</th>
                            <th style="padding: 8px; text-align: center;">Qty</th>
                            <th style="padding: 8px; text-align: right;">Price</th>
                        </tr>
                    </thead>
                    <tbody>${itemsHtml}</tbody>
                </table>
                <p style="margin-top: 16px; font-weight: bold; font-size: 16px; text-align: right; color: #163326;">Total Paid: ₹${parseFloat(order.total_amount).toFixed(2)}</p>
                <p>Track your order status live inside your Mandi Connect account.</p>
            </div>
        `
    };

    try {
        if (smtpConfigured) {
            await transporter.sendMail(mailOptions);
        } else {
            logger.info({ orderNumber: order.order_number }, '[SMTP Not Configured] Mock customer order email');
        }
    } catch (error) {
        logger.error({ err: error }, 'Failed to send customer order email');
    }
};

// Send Order Status Update to Customer
const sendCustomerStatusEmail = async (order, newStatus, customer) => {
    const mailOptions = {
        from: `"Mandi Connect" <${process.env.SMTP_USER || 'noreply@mandiconnect.com'}>`,
        to: customer.email,
        subject: `Order Update: #${order.order_number} is now ${newStatus}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px;">
                <h2 style="color: #1F4D36;">Order #${order.order_number} Status Update</h2>
                <p>Hello ${customer.full_name},</p>
                <p>Your order status has been updated to: <strong style="color: #D9760C; font-size: 18px;">${newStatus}</strong></p>
                ${order.courier_provider ? `<p><strong>Courier:</strong> ${order.courier_provider}<br><strong>Tracking #:</strong> ${order.tracking_number || 'N/A'}</p>` : ''}
                <p>Thank you for choosing Mandi Connect!</p>
            </div>
        `
    };

    try {
        if (smtpConfigured) {
            await transporter.sendMail(mailOptions);
        }
    } catch (error) {
        logger.error({ err: error }, 'Failed to send order status update email');
    }
};

// Send Password Reset Link to the account owner.
// The raw reset token is NEVER returned in an API response — this email is the
// only channel it travels through.
const sendPasswordResetEmail = async (user, resetToken) => {
    const resetUrl = `${process.env.FRONTEND_URL_PRIMARY || (process.env.FRONTEND_URL || '').split(',')[0]}/reset-password?token=${resetToken}`;

    const mailOptions = {
        from: `"Mandi Connect" <${process.env.SMTP_USER || 'noreply@mandiconnect.com'}>`,
        to: user.email,
        subject: 'Reset your Mandi Connect password',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px;">
                <h2 style="color: #1F4D36;">Password Reset Request</h2>
                <p>Hello ${user.full_name || ''},</p>
                <p>We received a request to reset your Mandi Connect password. This link is valid for 1 hour.</p>
                <p style="margin: 24px 0;">
                    <a href="${resetUrl}" style="background: #1F4D36; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none;">Reset Password</a>
                </p>
                <p>If you didn't request this, you can safely ignore this email — your password will not change.</p>
            </div>
        `
    };

    try {
        if (smtpConfigured) {
            await transporter.sendMail(mailOptions);
        } else {
            logger.info({ to: user.email }, '[SMTP Not Configured] Mock password reset email');
        }
    } catch (error) {
        logger.error({ err: error }, 'Failed to send password reset email');
        throw error;
    }
};

module.exports = {
    sendAdminNewOrderEmail,
    sendCustomerOrderEmail,
    sendCustomerStatusEmail,
    sendPasswordResetEmail
};