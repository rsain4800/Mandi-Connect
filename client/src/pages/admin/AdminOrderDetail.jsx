import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
    ArrowLeft, User, CreditCard, Package, Truck, MapPin,
    Clock, ChevronDown, RotateCcw, XCircle, Send, Search, FileText
} from 'lucide-react';
import API from '../../api/client';

const INVOICE_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const ALL_STATUSES = [
    'Pending', 'Confirmed', 'Processing', 'Packed', 'Shipped',
    'Out for Delivery', 'Delivered', 'Cancelled',
    'Return Requested', 'Returned', 'Refunded'
];

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
    'Returned':           'bg-slate-200 text-slate-800',
    'Refunded':           'bg-teal-100 text-teal-800'
};

const PAYMENT_STYLES = {
    'pending':            'bg-amber-100 text-amber-800',
    'paid':               'bg-emerald-100 text-emerald-800',
    'failed':             'bg-rose-100 text-rose-800',
    'partially_refunded': 'bg-orange-100 text-orange-800',
    'refunded':           'bg-teal-100 text-teal-800'
};

export default function AdminOrderDetail() {
    const { id } = useParams();
    const [order, setOrder] = useState(null);
    const [items, setItems] = useState([]);
    const [history, setHistory] = useState([]);
    const [refunds, setRefunds] = useState([]);
    const [actions, setActions] = useState(null);
    const [loading, setLoading] = useState(true);

    // Admin status update form
    const [newStatus, setNewStatus] = useState('');
    const [courier, setCourier] = useState('');
    const [tracking, setTracking] = useState('');
    const [estDelivery, setEstDelivery] = useState('');
    const [statusComment, setStatusComment] = useState('');
    const [updating, setUpdating] = useState(false);

    // Refund form
    const [refundAmount, setRefundAmount] = useState('');
    const [refundReason, setRefundReason] = useState('');
    const [restock, setRestock] = useState(false);
    const [refunding, setRefunding] = useState(false);

    const fetchOrder = async () => {
        try {
            setLoading(true);
            const res = await API.get(`/orders/${id}`);
            if (res.data.success) {
                setOrder(res.data.order);
                setItems(res.data.items);
                setHistory(res.data.statusHistory);
                setRefunds(res.data.refunds || []);
                setActions(res.data.actions || null);
                setCourier(res.data.order.courier_provider || '');
                setTracking(res.data.order.tracking_number || '');
                setEstDelivery(res.data.order.estimated_delivery_date ? res.data.order.estimated_delivery_date.split('T')[0] : '');
            }
        } catch (err) {
            console.error('Fetch order error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchOrder(); }, [id]);

    const handleStatusUpdate = async () => {
        if (!newStatus && !courier && !tracking && !estDelivery) return;
        setUpdating(true);
        try {
            const payload = {};
            if (newStatus) payload.order_status = newStatus;
            if (courier !== undefined) payload.courier_provider = courier;
            if (tracking !== undefined) payload.tracking_number = tracking;
            if (estDelivery) payload.estimated_delivery_date = estDelivery;
            if (statusComment) payload.comment = statusComment;

            const res = await API.put(`/orders/${order.id}/status`, payload);
            if (res.data.success) {
                setNewStatus('');
                setStatusComment('');
                fetchOrder();
            }
        } catch (err) {
            console.error(err);
        } finally {
            setUpdating(false);
        }
    };

    const handleRefund = async () => {
        if (!refundReason.trim()) return;
        setRefunding(true);
        try {
            const payload = {
                reason: refundReason,
                restock
            };
            if (refundAmount) payload.amount = parseFloat(refundAmount);

            const res = await API.post(`/payments/admin/orders/${order.id}/refund`, payload);
            if (res.data.success) {
                setRefundAmount('');
                setRefundReason('');
                setRestock(false);
                fetchOrder();
            }
        } catch (err) {
            console.error(err);
        } finally {
            setRefunding(false);
        }
    };

    const handleFullCancel = async () => {
        setUpdating(true);
        try {
            const res = await API.put(`/orders/${order.id}/cancel`, {
                reason: 'Cancelled by admin'
            });
            if (res.data.success) fetchOrder();
        } catch (err) {
            console.error(err);
        } finally {
            setUpdating(false);
        }
    };

    const handleApproveReturn = async () => {
        setUpdating(true);
        try {
            const res = await API.put(`/orders/${order.id}/status`, {
                order_status: 'Returned',
                comment: 'Return approved by admin — goods restocked.'
            });
            if (res.data.success) fetchOrder();
        } catch (err) {
            console.error(err);
        } finally {
            setUpdating(false);
        }
    };

    const handleRejectReturn = async () => {
        setUpdating(true);
        try {
            const res = await API.put(`/orders/${order.id}/status`, {
                order_status: 'Delivered',
                comment: 'Return request rejected by admin — order remains delivered.'
            });
            if (res.data.success) fetchOrder();
        } catch (err) {
            console.error(err);
        } finally {
            setUpdating(false);
        }
    };

    if (loading) {
        return (
            <div className="space-y-4">
                {[1, 2, 3].map(n => <div key={n} className="h-40 skeleton rounded-2xl" />)}
            </div>
        );
    }

    if (!order) {
        return (
            <div className="text-center py-12">
                <p className="text-gray-500 text-sm">Order not found.</p>
                <Link to="/admin/orders" className="mt-2 inline-block text-xs font-bold text-[#1F4D36] hover:underline">
                    ← Back to Orders
                </Link>
            </div>
        );
    }

    const subtotal = parseFloat(order.subtotal);
    const discount = parseFloat(order.discount_amount || 0);
    const shipping = parseFloat(order.shipping_charge || 0);
    const total = parseFloat(order.total_amount);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#E2DAC8] pb-4">
                <div>
                    <Link to="/admin/orders" className="text-xs font-bold text-[#1F4D36] hover:underline flex items-center gap-1 mb-2">
                        <ArrowLeft className="w-4 h-4" /> Back to Orders
                    </Link>
                    <h1 className="text-2xl font-bold font-serif text-[#163326]">
                        Order #{order.order_number}
                    </h1>
                </div>
                <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${STATUS_STYLES[order.order_status] || 'bg-gray-100 text-gray-700'}`}>
                        {order.order_status}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${PAYMENT_STYLES[order.payment_status] || 'bg-gray-100 text-gray-700'}`}>
                        Payment: {order.payment_status.replace('_', ' ')}
                    </span>
                    <a
                        href={`${INVOICE_BASE_URL}/orders/${order.id}/invoice`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#E2DAC8] text-[#1F4D36] font-bold text-[10px] rounded-full hover:bg-[#F4F1E8] transition-all"
                    >
                        <FileText className="w-3.5 h-3.5" /> Invoice
                    </a>
                    <a
                        href={`${INVOICE_BASE_URL}/invoices/${order.id}/pdf`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1F4D36] text-white font-bold text-[10px] rounded-full hover:bg-[#163326] transition-all"
                    >
                        <FileText className="w-3.5 h-3.5" /> PDF
                    </a>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left column: Info cards */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Customer Info */}
                    <div className="bg-white p-5 rounded-2xl border border-[#E2DAC8] space-y-3">
                        <h3 className="text-sm font-bold text-[#163326] flex items-center gap-2 border-b border-gray-100 pb-2">
                            <User className="w-4 h-4 text-[#D9760C]" /> Customer
                        </h3>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                            <div>
                                <span className="text-gray-500 block">Name</span>
                                <span className="font-bold text-gray-900">{order.user_name || order.shipping_full_name}</span>
                            </div>
                            <div>
                                <span className="text-gray-500 block">Email</span>
                                <span className="font-bold text-gray-900">{order.user_email || 'N/A'}</span>
                            </div>
                            <div>
                                <span className="text-gray-500 block">Phone</span>
                                <span className="font-bold text-gray-900">{order.shipping_phone}</span>
                            </div>
                            <div>
                                <span className="text-gray-500 block">Order Date</span>
                                <span className="font-bold text-gray-900">{new Date(order.created_at).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    {/* Order Value Breakdown */}
                    <div className="bg-white p-5 rounded-2xl border border-[#E2DAC8] space-y-3">
                        <h3 className="text-sm font-bold text-[#163326] flex items-center gap-2 border-b border-gray-100 pb-2">
                            <CreditCard className="w-4 h-4 text-emerald-700" /> Order Value & Payment
                        </h3>
                        <div className="space-y-2 text-xs">
                            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="font-bold text-gray-900">₹{subtotal.toFixed(2)}</span></div>
                            {discount > 0 && <div className="flex justify-between"><span className="text-gray-500">Discount {order.coupon_code ? `(${order.coupon_code})` : ''}</span><span className="font-bold text-emerald-700">-₹{discount.toFixed(2)}</span></div>}
                            <div className="flex justify-between"><span className="text-gray-500">Shipping</span><span className="font-bold text-gray-900">{shipping > 0 ? `₹${shipping.toFixed(2)}` : 'FREE'}</span></div>
                            <div className="flex justify-between pt-2 border-t border-gray-100"><span className="font-extrabold text-gray-900">Total</span><span className="font-extrabold text-[#1F4D36] text-base">₹{total.toFixed(2)}</span></div>
                            <div className="flex justify-between pt-2 border-t border-gray-100">
                                <span className="text-gray-500">Payment Method</span>
                                <span className="font-bold uppercase text-gray-900">{order.payment_method}</span>
                            </div>
                        </div>
                    </div>

                    {/* Products */}
                    <div className="bg-white p-5 rounded-2xl border border-[#E2DAC8] space-y-3">
                        <h3 className="text-sm font-bold text-[#163326] flex items-center gap-2 border-b border-gray-100 pb-2">
                            <Package className="w-4 h-4 text-purple-700" /> Products ({items.length})
                        </h3>
                        <div className="divide-y divide-gray-100">
                            {items.map(item => {
                                const cancelled = item.cancelled_quantity || 0;
                                const returned = item.returned_quantity || 0;
                                const active = item.quantity - cancelled - returned;
                                return (
                                    <div key={item.id} className="py-3 flex items-center justify-between text-xs gap-4">
                                        <div className="flex items-center gap-3">
                                            <img src={item.thumbnail || 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=100'} alt="" className="w-10 h-10 rounded-xl bg-gray-100 object-cover" />
                                            <div>
                                                <p className="font-bold text-gray-900">{item.product_name}</p>
                                                <p className="text-gray-500">SKU: {item.sku} • {item.unit}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="flex items-center gap-2 justify-end">
                                                <span className="font-bold text-gray-900">{active}/{item.quantity}</span>
                                                <span className="text-gray-400">×</span>
                                                <span className="font-bold text-gray-900">₹{parseFloat(item.price).toFixed(2)}</span>
                                            </div>
                                            <span className="font-extrabold text-[#1F4D36]">₹{parseFloat(item.total_price).toFixed(2)}</span>
                                            {(cancelled > 0 || returned > 0) && (
                                                <div className="flex gap-1 mt-0.5 justify-end">
                                                    {cancelled > 0 && <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">{cancelled} cancelled</span>}
                                                    {returned > 0 && <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">{returned} returned</span>}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Delivery Info */}
                    <div className="bg-white p-5 rounded-2xl border border-[#E2DAC8] space-y-3">
                        <h3 className="text-sm font-bold text-[#163326] flex items-center gap-2 border-b border-gray-100 pb-2">
                            <MapPin className="w-4 h-4 text-[#D9760C]" /> Delivery Address
                        </h3>
                        <p className="text-xs font-bold text-gray-900">{order.shipping_full_name} ({order.shipping_phone})</p>
                        <p className="text-xs text-gray-600 leading-relaxed">{order.shipping_address_text}</p>
                        {order.courier_provider && (
                            <div className="mt-3 p-3 bg-emerald-50 rounded-xl text-xs">
                                <span className="text-gray-500">Courier: </span>
                                <span className="font-bold text-gray-900">{order.courier_provider}</span>
                                {order.tracking_number && <span className="ml-3 text-gray-500">Tracking: <span className="font-mono font-bold text-[#1F4D36]">{order.tracking_number}</span></span>}
                                {order.estimated_delivery_date && <span className="ml-3 text-gray-500">Est: <span className="font-bold text-[#D9760C]">{new Date(order.estimated_delivery_date).toLocaleDateString()}</span></span>}
                            </div>
                        )}
                    </div>

                    {/* Refund State */}
                    {refunds.length > 0 && (
                        <div className="bg-white p-5 rounded-2xl border border-[#E2DAC8] space-y-3">
                            <h3 className="text-sm font-bold text-[#163326] flex items-center gap-2 border-b border-gray-100 pb-2">
                                <RotateCcw className="w-4 h-4 text-teal-700" /> Refund History
                            </h3>
                            <div className="divide-y divide-gray-100">
                                {refunds.map(r => (
                                    <div key={r.id} className="py-3 flex items-center justify-between text-xs">
                                        <div>
                                            <p className="font-bold text-gray-900">₹{parseFloat(r.amount).toFixed(2)} — {r.notes || 'Refund'}</p>
                                            <p className="text-gray-500">Initiated by {r.initiated_by} • {new Date(r.created_at).toLocaleString()}</p>
                                            {r.razorpay_refund_id && <p className="text-gray-400 font-mono">Razorpay ID: {r.razorpay_refund_id}</p>}
                                        </div>
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                                            r.status === 'processed' ? 'bg-emerald-100 text-emerald-800' :
                                            r.status === 'processing' ? 'bg-amber-100 text-amber-800' :
                                            r.status === 'failed' ? 'bg-rose-100 text-rose-800' :
                                            'bg-gray-100 text-gray-700'
                                        }`}>{r.status}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right column: Status history + Actions */}
                <div className="space-y-6">
                    {/* Status Update Controls */}
                    <div className="bg-white p-5 rounded-2xl border border-[#E2DAC8] space-y-4">
                        <h3 className="text-sm font-bold text-[#163326] flex items-center gap-2 border-b border-gray-100 pb-2">
                            <Send className="w-4 h-4 text-[#1F4D36]" /> Update Status
                        </h3>

                        {order.order_status === 'Return Requested' && (
                            <div className="flex gap-2">
                                <button
                                    onClick={handleApproveReturn}
                                    disabled={updating}
                                    className="flex-1 px-3 py-2 bg-emerald-600 text-white font-bold text-[11px] rounded-xl hover:bg-emerald-700 disabled:opacity-40"
                                >
                                    Approve Return
                                </button>
                                <button
                                    onClick={handleRejectReturn}
                                    disabled={updating}
                                    className="flex-1 px-3 py-2 bg-rose-100 text-rose-700 font-bold text-[11px] rounded-xl hover:bg-rose-200 disabled:opacity-40"
                                >
                                    Reject Return
                                </button>
                            </div>
                        )}

                        {actions?.canCancel && order.order_status !== 'Return Requested' && (
                            <button
                                onClick={handleFullCancel}
                                disabled={updating}
                                className="w-full px-3 py-2 bg-rose-50 border border-rose-200 text-rose-700 font-bold text-[11px] rounded-xl hover:bg-rose-100 disabled:opacity-40 flex items-center justify-center gap-1"
                            >
                                <XCircle className="w-3.5 h-3.5" /> Cancel Order
                            </button>
                        )}

                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">New Status</label>
                            <select
                                value={newStatus}
                                onChange={e => setNewStatus(e.target.value)}
                                className="w-full p-2.5 bg-[#FBF8F1] border border-gray-200 rounded-xl text-xs font-bold"
                            >
                                <option value="">Current: {order.order_status}</option>
                                {(actions?.allowedNextStatuses || ALL_STATUSES).map(s => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Courier Provider</label>
                            <input
                                type="text"
                                value={courier}
                                onChange={e => setCourier(e.target.value)}
                                placeholder="e.g. Delhivery, BlueDart"
                                className="w-full p-2.5 bg-[#FBF8F1] border border-gray-200 rounded-xl text-xs"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Tracking Number</label>
                            <input
                                type="text"
                                value={tracking}
                                onChange={e => setTracking(e.target.value)}
                                placeholder="AWB / Tracking ID"
                                className="w-full p-2.5 bg-[#FBF8F1] border border-gray-200 rounded-xl text-xs font-mono"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Est. Delivery Date</label>
                            <input
                                type="date"
                                value={estDelivery}
                                onChange={e => setEstDelivery(e.target.value)}
                                className="w-full p-2.5 bg-[#FBF8F1] border border-gray-200 rounded-xl text-xs"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Comment</label>
                            <textarea
                                value={statusComment}
                                onChange={e => setStatusComment(e.target.value)}
                                placeholder="Internal note for status change"
                                rows={2}
                                className="w-full p-2.5 bg-[#FBF8F1] border border-gray-200 rounded-xl text-xs resize-none"
                            />
                        </div>
                        <button
                            onClick={handleStatusUpdate}
                            disabled={updating || (!newStatus && !courier && !tracking && !estDelivery)}
                            className="w-full py-2.5 bg-[#1F4D36] text-white font-bold text-xs rounded-xl hover:bg-[#163326] disabled:opacity-40 transition-all"
                        >
                            {updating ? 'Updating...' : 'Update Order'}
                        </button>
                    </div>

                    {/* Refund Controls */}
                    {['paid', 'partially_refunded'].includes(order.payment_status) && (
                        <div className="bg-white p-5 rounded-2xl border border-[#E2DAC8] space-y-4">
                            <h3 className="text-sm font-bold text-[#163326] flex items-center gap-2 border-b border-gray-100 pb-2">
                                <RotateCcw className="w-4 h-4 text-teal-700" /> Issue Refund
                            </h3>
                            <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Amount (₹) — leave blank for full refund</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={refundAmount}
                                    onChange={e => setRefundAmount(e.target.value)}
                                    placeholder={`Max: ₹${total.toFixed(2)}`}
                                    className="w-full p-2.5 bg-[#FBF8F1] border border-gray-200 rounded-xl text-xs"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Reason</label>
                                <textarea
                                    value={refundReason}
                                    onChange={e => setRefundReason(e.target.value)}
                                    placeholder="Reason for refund"
                                    rows={2}
                                    className="w-full p-2.5 bg-[#FBF8F1] border border-gray-200 rounded-xl text-xs resize-none"
                                />
                            </div>
                            <label className="flex items-center gap-2 text-xs cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={restock}
                                    onChange={e => setRestock(e.target.checked)}
                                    className="w-4 h-4 accent-[#1F4D36]"
                                />
                                <span className="text-gray-700">Restock physical goods</span>
                            </label>
                            <button
                                onClick={handleRefund}
                                disabled={refunding || !refundReason.trim()}
                                className="w-full py-2.5 bg-teal-600 text-white font-bold text-xs rounded-xl hover:bg-teal-700 disabled:opacity-40 transition-all"
                            >
                                {refunding ? 'Processing...' : 'Request Refund via Razorpay'}
                            </button>
                        </div>
                    )}

                    {/* Status History */}
                    <div className="bg-white p-5 rounded-2xl border border-[#E2DAC8] space-y-3">
                        <h3 className="text-sm font-bold text-[#163326] border-b border-gray-100 pb-2">Status History</h3>
                        <div className="space-y-3 max-h-80 overflow-y-auto">
                            {history.map(h => (
                                <div key={h.id} className="flex items-start gap-3 text-xs">
                                    <div className="w-2 h-2 mt-1.5 rounded-full bg-[#1F4D36] shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            {h.old_status && <span className="text-gray-400">{h.old_status} →</span>}
                                            <span className="font-bold text-gray-900">{h.status}</span>
                                        </div>
                                        {h.comment && <p className="text-gray-500 mt-0.5 truncate" title={h.comment}>{h.comment}</p>}
                                        <p className="text-gray-400">{h.created_by} • {new Date(h.created_at).toLocaleString()}</p>
                                    </div>
                                </div>
                            ))}
                            {history.length === 0 && <p className="text-xs text-gray-400">No history yet.</p>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}