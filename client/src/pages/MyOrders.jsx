import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, ChevronRight, Package, Truck, Clock, RotateCcw, XCircle, RefreshCcw, FileText } from 'lucide-react';
import API from '../api/client';

const STATUS_STYLES = {
    'Pending':            'bg-amber-100 text-amber-800',
    'Confirmed':          'bg-blue-100 text-blue-800',
    'Processing':         'bg-indigo-100 text-indigo-800',
    'Packed':             'bg-purple-100 text-purple-800',
    'Shipped':            'bg-cyan-100 text-cyan-800',
    'Out for Delivery':   'bg-orange-100 text-orange-800',
    'Delivered':          'bg-emerald-100 text-emerald-800',
    'Cancelled':          'bg-rose-100 text-rose-800',
    'Return Requested':   'bg-yellow-100 text-yellow-800',
    'Returned':           'bg-slate-100 text-slate-800',
    'Refunded':           'bg-teal-100 text-teal-800'
};

const PAYMENT_STYLES = {
    'pending':            'text-amber-700',
    'paid':               'text-emerald-700',
    'failed':             'text-rose-700',
    'partially_refunded': 'text-orange-700',
    'refunded':           'text-teal-700'
};

export default function MyOrders() {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        API.get('/orders/my-orders')
            .then(res => {
                if (res.data.success) {
                    setOrders(res.data.orders);
                }
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="max-w-5xl mx-auto px-4 py-12 space-y-4">
                {[1, 2, 3].map(n => <div key={n} className="h-28 skeleton rounded-2xl" />)}
            </div>
        );
    }

    if (orders.length === 0) {
        return (
            <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
                <div className="w-16 h-16 bg-[#F4EEDD] text-[#1F4D36] rounded-full flex items-center justify-center mx-auto">
                    <ShoppingBag className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold font-serif text-gray-900">No Orders Found</h2>
                <p className="text-xs text-gray-500">You haven't placed any orders on Mandi Connect yet.</p>
                <Link to="/products" className="inline-block px-6 py-2.5 bg-[#1F4D36] text-white font-bold text-xs rounded-full">
                    Start Shopping Produce
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
            <h1 className="text-3xl font-bold font-serif text-[#163326] border-b border-[#E2DAC8] pb-4">
                My Orders ({orders.length})
            </h1>

            <div className="space-y-4">
                {orders.map(order => (
                    <div
                        key={order.id}
                        className="bg-white p-6 rounded-3xl border border-[#E2DAC8] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs hover:border-[#1F4D36] transition-all"
                    >
                        <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-3 flex-wrap">
                                <span className="text-sm font-extrabold font-mono text-[#163326]">#{order.order_number}</span>
                                <span className={`px-3 py-0.5 rounded-full text-[10px] font-bold uppercase ${STATUS_STYLES[order.order_status] || 'bg-gray-100 text-gray-700'}`}>
                                    {order.order_status}
                                </span>
                            </div>
                            <p className="text-xs text-gray-500">
                                Placed on {new Date(order.created_at).toLocaleDateString()} • {order.payment_method.toUpperCase()}
                                <span className={`ml-1 font-bold uppercase ${PAYMENT_STYLES[order.payment_status] || 'text-gray-700'}`}>
                                    {' '}({order.payment_status.replace('_', ' ')})
                                </span>
                            </p>
                            <p className="text-xs text-gray-500">
                                {order.item_count} item{order.item_count !== 1 ? 's' : ''} • Total: <span className="font-bold text-[#1F4D36]">₹{parseFloat(order.total_amount).toFixed(2)}</span>
                            </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            {(order.payment_status === 'paid' || order.payment_method === 'cod') && (
                                <a
                                    href={`/api/invoices/${order.id}/pdf`}
                                    className="px-4 py-2.5 bg-white border border-[#E2DAC8] text-[#1F4D36] text-xs font-bold rounded-full hover:bg-[#F4EEDD] transition-all flex items-center justify-center gap-1.5"
                                >
                                    <FileText className="w-4 h-4" /> Invoice
                                </a>
                            )}
                            <Link
                                to={`/orders/${order.order_number}`}
                                className="px-5 py-2.5 bg-[#F4EEDD] hover:bg-[#1F4D36] text-[#163326] hover:text-white text-xs font-bold rounded-full transition-all flex items-center justify-center gap-1.5"
                            >
                                <Truck className="w-4 h-4" /> Track Order <ChevronRight className="w-4 h-4" />
                            </Link>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
