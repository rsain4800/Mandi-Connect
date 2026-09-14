import React from 'react';

export default function PrivacyPolicy() {
    return (
        <div className="max-w-4xl mx-auto px-4 py-12 space-y-6 text-xs text-gray-700 leading-relaxed">
            <h1 className="text-3xl font-bold font-serif text-[#163326] border-b border-[#E2DAC8] pb-4">Privacy Policy</h1>
            <p>Mandi Connect respects user privacy and protects customer personal data, phone numbers, and delivery addresses. Information collected during customer registration and checkout is used solely for order processing, payment verification, and delivery notifications.</p>
            <p>We do not store plain-text passwords or secret credit card numbers. Payment processing is secured via Razorpay.</p>
        </div>
    );
}
