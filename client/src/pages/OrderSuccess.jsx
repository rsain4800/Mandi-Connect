import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CheckCircle2, Package, ArrowRight, Truck, Mail } from 'lucide-react';

export default function OrderSuccess() {
    const location = useLocation();
    const order = location.state?.order;

    return (
        <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-6">
            <div className="w-20 h-20 bg-emerald-100 text-[#1F4D36] rounded-full flex items-center justify-center mx-auto shadow-inner animate-bounce">
                <CheckCircle2 className="w-12 h-12" />
            </div>

            <div className="space-y-2">
                <span className="px-3.5 py-1 bg-emerald-100 text-emerald-800 font-extrabold text-xs rounded-full uppercase tracking-wider">
                    Order Confirmed
                </span>
                <h1 className="text-3xl font-bold font-serif text-[#163326]">Thank You For Your Order!</h1>
                <p className="text-xs text-gray-500 max-w-md mx-auto">
                    We've received your order and sent a confirmation receipt to your email address.
                </p>
            </div>

            {order && (
                <div className="bg-white p-6 rounded-3xl border border-[#E2DAC8] text-left space-y-4 max-w-md mx-auto shadow-xs">
                    <div className="flex justify-between border-b border-gray-100 pb-3 text-xs">
                        <span className="text-gray-500 font-medium">Order Number:</span>
                        <span className="font-bold font-mono text-[#163326]">{order.order_number}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 pb-3 text-xs">
                        <span className="text-gray-500 font-medium">Payment Status:</span>
                        <span className="font-bold uppercase text-emerald-700">{order.payment_status}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 pb-3 text-xs">
                        <span className="text-gray-500 font-medium">Total Amount Paid:</span>
                        <span className="font-extrabold text-gray-900">₹{parseFloat(order.total_amount || 0).toFixed(2)}</span>
                    </div>
                    <div className="text-xs space-y-1">
                        <span className="text-gray-500 font-medium block">Shipping Address:</span>
                        <p className="text-gray-800 font-semibold">{order.shipping_address_text}</p>
                    </div>
                </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
                {order && (
                    <Link
                        to={`/orders/${order.order_number || order.id}`}
                        className="px-6 py-3 bg-[#1F4D36] text-white font-bold text-xs rounded-full shadow-md hover:bg-[#163326] transition-all flex items-center gap-2"
                    >
                        <Truck className="w-4 h-4" /> Track Order Status
                    </Link>
                )}
                <Link
                    to="/products"
                    className="px-6 py-3 bg-[#F4EEDD] text-[#163326] font-bold text-xs rounded-full hover:bg-emerald-100 transition-all"
                >
                    Continue Shopping Mandi Produce
                </Link>
            </div>
        </div>
    );
}
