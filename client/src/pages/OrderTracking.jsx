import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Truck, MapPin, Calendar, CreditCard, ChevronLeft, PackageCheck, XCircle, RotateCcw, AlertTriangle, Check, Minus, FileText } from 'lucide-react';
import OrderTrackerStepper from '../components/OrderTrackerStepper';
import API from '../api/client';

const INVOICE_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function OrderTracking() {
    const { id } = useParams();
    const [order, setOrder] = useState(null);
    const [items, setItems] = useState([]);
    const [history, setHistory] = useState([]);
    const [refunds, setRefunds] = useState([]);
    const [actions, setActions] = useState(null);
    const [loading, setLoading] = useState(true);

    // Cancel / Return state
    const [cancelReason, setCancelReason] = useState('');
    const [returnReason, setReturnReason] = useState('');
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [showReturnModal, setShowReturnModal] = useState(false);
    const [showPartialCancel, setShowPartialCancel] = useState(false);
    const [partialItems, setPartialItems] = useState({});
    const [submitting, setSubmitting] = useState(false);

    const fetchOrder = () => {
        API.get(`/orders/${id}`)
            .then(res => {
                if (res.data.success) {
                    setOrder(res.data.order);
                    setItems(res.data.items);
                    setHistory(res.data.statusHistory);
                    setRefunds(res.data.refunds || []);
                    setActions(res.data.actions || null);
                }
            })
            .catch(err => console.error('Fetch order detail error:', err))
            .finally(() => setLoading(false));
    };

    useEffect(() => { fetchOrder(); }, [id]);

    const handleFullCancel = async () => {
        if (!cancelReason.trim()) return;
        setSubmitting(true);
        try {
            const res = await API.put(`/orders/${order.id}/cancel`, { reason: cancelReason });
            if (res.data.success) {
                setShowCancelModal(false);
                setCancelReason('');
                fetchOrder();
            }
        } catch (err) {
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    };

    const handlePartialCancel = async () => {
        const selectedItems = Object.entries(partialItems)
            .filter(([, qty]) => qty > 0)
            .map(([order_item_id, quantity]) => ({ order_item_id: Number(order_item_id), quantity }));

        if (selectedItems.length === 0) return;

        setSubmitting(true);
        try {
            const res = await API.put(`/orders/${order.id}/cancel`, {
                reason: cancelReason || 'Partial cancellation by customer',
                items: selectedItems
            });
            if (res.data.success) {
                setShowPartialCancel(false);
                setShowCancelModal(false);
                setCancelReason('');
                setPartialItems({});
                fetchOrder();
            }
        } catch (err) {
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    };

    const handleReturnRequest = async () => {
        if (!returnReason.trim()) return;
        setSubmitting(true);
        try {
            const res = await API.post(`/orders/${order.id}/return`, { reason: returnReason });
            if (res.data.success) {
                setShowReturnModal(false);
                setReturnReason('');
                fetchOrder();
            }
        } catch (err) {
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    };

    const initPartialCancel = () => {
        const initial = {};
        items.forEach(item => {
            const active = item.quantity - (item.cancelled_quantity || 0) - (item.returned_quantity || 0);
            initial[item.id] = 0;
            item._activeQty = active;
        });
        setPartialItems(initial);
        setShowPartialCancel(true);
    };

    if (loading) {
        return (
            <div className="max-w-5xl mx-auto px-4 py-16">
                <div className="h-64 skeleton rounded-3xl" />
            </div>
        );
    }

    if (!order) {
        return (
            <div className="max-w-4xl mx-auto px-4 py-16 text-center">
                <h2 className="text-xl font-bold text-gray-800">Order Not Found</h2>
                <Link to="/orders" className="mt-4 inline-block px-6 py-2 bg-[#1F4D36] text-white font-bold text-xs rounded-full">
                    Return to My Orders
                </Link>
            </div>
        );
    }

    const canCancel = actions?.canCancel && order.order_status !== 'Cancelled';
    const canReturn = actions?.canRequestReturn;
    const hasRefunds = refunds.length > 0;

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
            <div className="flex items-center justify-between border-b border-[#E2DAC8] pb-4">
                <div>
                    <Link to="/orders" className="text-xs font-bold text-[#1F4D36] hover:underline flex items-center gap-1 mb-2">
                        <ChevronLeft className="w-4 h-4" /> Back to My Orders
                    </Link>
                    <h1 className="text-2xl font-bold font-serif text-[#163326]">
                        Tracking Order #{order.order_number}
                    </h1>
                </div>

                <div className="text-right flex flex-col items-end gap-2">
                    <div>
                        <span className="text-xs text-gray-500 block">Placed On</span>
                        <span className="text-xs font-bold text-gray-900">{new Date(order.created_at).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <a
                            href={`${INVOICE_BASE_URL}/orders/${order.id}/invoice`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-[#E2DAC8] text-[#1F4D36] font-bold text-xs rounded-full hover:bg-[#F4F1E8] transition-all"
                        >
                            <FileText className="w-3.5 h-3.5" /> View Invoice
                        </a>
                        <a
                            href={`${INVOICE_BASE_URL}/invoices/${order.id}/pdf`}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1F4D36] text-white font-bold text-xs rounded-full hover:bg-[#163326] transition-all"
                        >
                            <FileText className="w-3.5 h-3.5" /> Download PDF
                        </a>
                    </div>
                </div>
            </div>

            {/* Visual Status Stepper */}
            <OrderTrackerStepper currentStatus={order.order_status} history={history} />

            {/* Action Buttons */}
            {(canCancel || canReturn) && (
                <div className="flex flex-wrap gap-3">
                    {canCancel && (
                        <button
                            onClick={() => setShowCancelModal(true)}
                            className="px-5 py-2.5 bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs rounded-full hover:bg-rose-100 transition-all flex items-center gap-2"
                        >
                            <XCircle className="w-4 h-4" /> Cancel Order
                        </button>
                    )}
                    {canReturn && (
                        <button
                            onClick={() => setShowReturnModal(true)}
                            className="px-5 py-2.5 bg-amber-50 border border-amber-200 text-amber-700 font-bold text-xs rounded-full hover:bg-amber-100 transition-all flex items-center gap-2"
                        >
                            <RotateCcw className="w-4 h-4" /> Request Return
                        </button>
                    )}
                </div>
            )}

            {/* Courier & Tracking Details */}
            {order.courier_provider && (
                <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-[#1F4D36] text-white rounded-2xl flex items-center justify-center">
                            <Truck className="w-6 h-6" />
                        </div>
                        <div>
                            <h4 className="text-sm font-bold text-gray-900">Courier Provider: {order.courier_provider}</h4>
                            <p className="text-xs text-gray-600">Tracking Number: <span className="font-mono font-bold text-[#1F4D36]">{order.tracking_number || 'N/A'}</span></p>
                        </div>
                    </div>
                    {order.estimated_delivery_date && (
                        <div className="text-right">
                            <span className="text-xs text-gray-500 font-medium">Est. Delivery Date:</span>
                            <p className="text-sm font-extrabold text-[#D9760C]">{new Date(order.estimated_delivery_date).toLocaleDateString()}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Shipping & Payment Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-3xl border border-[#E2DAC8] space-y-2">
                    <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-2">
                        <MapPin className="w-4 h-4 text-[#D9760C]" /> Delivery Address
                    </h4>
                    <p className="text-xs font-bold text-gray-900">{order.shipping_full_name} ({order.shipping_phone})</p>
                    <p className="text-xs text-gray-600 leading-relaxed">{order.shipping_address_text}</p>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-[#E2DAC8] space-y-2">
                    <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-2">
                        <CreditCard className="w-4 h-4 text-emerald-700" /> Payment & Billing
                    </h4>
                    <div className="space-y-1 text-xs text-gray-600">
                        <div className="flex justify-between">
                            <span>Payment Method:</span>
                            <span className="font-bold uppercase text-gray-900">{order.payment_method}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Payment Status:</span>
                            <span className={`font-bold uppercase ${
                                order.payment_status === 'paid' ? 'text-emerald-700' :
                                order.payment_status === 'refunded' ? 'text-teal-700' :
                                order.payment_status === 'partially_refunded' ? 'text-orange-700' :
                                'text-amber-700'
                            }`}>{order.payment_status.replace('_', ' ')}</span>
                        </div>
                        {order.discount_amount > 0 && (
                            <div className="flex justify-between">
                                <span>Discount:</span>
                                <span className="font-bold text-emerald-700">-₹{parseFloat(order.discount_amount).toFixed(2)}</span>
                            </div>
                        )}
                        <div className="flex justify-between">
                            <span>Shipping:</span>
                            <span className="font-bold text-gray-900">{order.shipping_charge > 0 ? `₹${parseFloat(order.shipping_charge).toFixed(2)}` : 'FREE'}</span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-gray-100 font-extrabold text-sm text-gray-900">
                            <span>Total Amount:</span>
                            <span className="text-[#1F4D36]">₹{parseFloat(order.total_amount).toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Ordered Items */}
            <div className="bg-white p-6 rounded-3xl border border-[#E2DAC8] space-y-4">
                <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-3">
                    <PackageCheck className="w-4 h-4 text-[#1F4D36]" /> Ordered Items ({items.length})
                </h4>
                <div className="divide-y divide-gray-100">
                    {items.map(item => {
                        const cancelled = item.cancelled_quantity || 0;
                        const returned = item.returned_quantity || 0;
                        const activeQty = item.quantity - cancelled - returned;
                        const hasPartial = cancelled > 0 || returned > 0;

                        return (
                            <div key={item.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                                <div className="flex items-center gap-3">
                                    <img src={item.thumbnail || 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=100'} alt="" className="w-12 h-12 object-cover rounded-xl bg-gray-100" />
                                    <div>
                                        <p className="font-bold text-gray-900">{item.product_name}</p>
                                        <p className="text-gray-500">SKU: {item.sku} • {item.unit}</p>
                                        {hasPartial && (
                                            <div className="flex gap-2 mt-1">
                                                {cancelled > 0 && (
                                                    <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                                                        {cancelled} cancelled
                                                    </span>
                                                )}
                                                {returned > 0 && (
                                                    <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                                                        {returned} returned
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className={`font-bold ${activeQty < item.quantity ? 'text-rose-600' : 'text-gray-900'}`}>
                                        {activeQty} × ₹{parseFloat(item.price).toFixed(2)}
                                    </p>
                                    <span className={`font-extrabold ${activeQty < item.quantity ? 'text-rose-600' : 'text-[#1F4D36]'}`}>
                                        ₹{(parseFloat(item.price) * activeQty).toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Refund Section */}
            {hasRefunds && (
                <div className="bg-white p-6 rounded-3xl border border-[#E2DAC8] space-y-4">
                    <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-3">
                        <RotateCcw className="w-4 h-4 text-teal-700" /> Refund History
                    </h4>
                    <div className="divide-y divide-gray-100">
                        {refunds.map(refund => (
                            <div key={refund.id} className="py-3 flex items-center justify-between text-xs">
                                <div>
                                    <p className="font-bold text-gray-900">₹{parseFloat(refund.amount).toFixed(2)} refund</p>
                                    <p className="text-gray-500">
                                        {refund.notes || 'Refund processed'} • Initiated by {refund.initiated_by}
                                    </p>
                                </div>
                                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                                    refund.status === 'processed' ? 'bg-emerald-100 text-emerald-800' :
                                    refund.status === 'processing' ? 'bg-amber-100 text-amber-800' :
                                    refund.status === 'failed' ? 'bg-rose-100 text-rose-800' :
                                    'bg-gray-100 text-gray-700'
                                }`}>
                                    {refund.status}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Status History */}
            {history.length > 0 && (
                <div className="bg-white p-6 rounded-3xl border border-[#E2DAC8] space-y-4">
                    <h4 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3">Status History</h4>
                    <div className="space-y-3">
                        {history.map(h => (
                            <div key={h.id} className="flex items-start gap-3 text-xs">
                                <div className="w-2 h-2 mt-1.5 rounded-full bg-[#1F4D36] shrink-0" />
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        {h.old_status && (
                                            <span className="text-gray-500">{h.old_status} →</span>
                                        )}
                                        <span className="font-bold text-gray-900">{h.status}</span>
                                        <span className="text-gray-400">by {h.created_by}</span>
                                    </div>
                                    {h.comment && <p className="text-gray-500 mt-0.5">{h.comment}</p>}
                                    <p className="text-gray-400 mt-0.5">{new Date(h.created_at).toLocaleString()}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ─── Cancel Modal ─── */}
            {showCancelModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-xl">
                        <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                            <XCircle className="w-5 h-5 text-rose-600" /> Cancel Order
                        </h3>

                        {actions?.canPartiallyCancel && items.some(i => (i.quantity - (i.cancelled_quantity||0) - (i.returned_quantity||0)) > 0) && !showPartialCancel && (
                            <button
                                onClick={initPartialCancel}
                                className="w-full px-4 py-2.5 bg-amber-50 border border-amber-200 text-amber-700 font-bold text-xs rounded-xl hover:bg-amber-100 flex items-center justify-center gap-2"
                            >
                                <Minus className="w-4 h-4" /> Cancel Specific Items Instead
                            </button>
                        )}

                        {showPartialCancel ? (
                            <div className="space-y-3">
                                <p className="text-xs text-gray-500">Select items and quantities to cancel:</p>
                                {items.map(item => {
                                    const active = item.quantity - (item.cancelled_quantity||0) - (item.returned_quantity||0);
                                    if (active <= 0) return null;
                                    return (
                                        <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl text-xs">
                                            <div>
                                                <p className="font-bold text-gray-900">{item.product_name}</p>
                                                <p className="text-gray-500">{active} available to cancel • ₹{parseFloat(item.price).toFixed(2)} each</p>
                                            </div>
                                            <input
                                                type="number"
                                                min={0}
                                                max={active}
                                                value={partialItems[item.id] || 0}
                                                onChange={e => {
                                                    const v = Math.min(active, Math.max(0, parseInt(e.target.value) || 0));
                                                    setPartialItems(prev => ({ ...prev, [item.id]: v }));
                                                }}
                                                className="w-16 p-1.5 text-center border border-gray-200 rounded-lg font-bold"
                                            />
                                        </div>
                                    );
                                })}
                                <button
                                    onClick={() => setShowPartialCancel(false)}
                                    className="text-xs text-gray-500 hover:underline"
                                >
                                    ← Cancel whole order instead
                                </button>
                            </div>
                        ) : null}

                        <textarea
                            value={cancelReason}
                            onChange={e => setCancelReason(e.target.value)}
                            placeholder="Reason for cancellation (required)"
                            className="w-full p-3 border border-gray-200 rounded-xl text-xs resize-none"
                            rows={3}
                        />
                        <div className="flex gap-3 justify-end">
                            <button onClick={() => { setShowCancelModal(false); setShowPartialCancel(false); }} className="px-4 py-2 text-gray-500 font-bold text-xs">Close</button>
                            <button
                                onClick={showPartialCancel ? handlePartialCancel : handleFullCancel}
                                disabled={submitting || !cancelReason.trim()}
                                className="px-5 py-2 bg-rose-600 text-white font-bold text-xs rounded-xl hover:bg-rose-700 disabled:opacity-40"
                            >
                                {submitting ? 'Processing...' : showPartialCancel ? 'Confirm Partial Cancel' : 'Confirm Cancel'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Return Modal ─── */}
            {showReturnModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-xl">
                        <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                            <RotateCcw className="w-5 h-5 text-amber-600" /> Request Return
                        </h3>
                        <p className="text-xs text-gray-500">Describe the reason for your return request. Our team will review it.</p>
                        <textarea
                            value={returnReason}
                            onChange={e => setReturnReason(e.target.value)}
                            placeholder="Reason for return (required)"
                            className="w-full p-3 border border-gray-200 rounded-xl text-xs resize-none"
                            rows={3}
                        />
                        <div className="flex gap-3 justify-end">
                            <button onClick={() => setShowReturnModal(false)} className="px-4 py-2 text-gray-500 font-bold text-xs">Close</button>
                            <button
                                onClick={handleReturnRequest}
                                disabled={submitting || !returnReason.trim()}
                                className="px-5 py-2 bg-amber-600 text-white font-bold text-xs rounded-xl hover:bg-amber-700 disabled:opacity-40"
                            >
                                {submitting ? 'Submitting...' : 'Submit Return Request'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}