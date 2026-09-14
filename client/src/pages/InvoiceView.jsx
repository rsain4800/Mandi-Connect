import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FileText, Download, ChevronLeft, Printer } from 'lucide-react';
import API from '../api/client';
import { useAuth } from '../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const formatMoney = (val) => `Rs. ${parseFloat(val || 0).toFixed(2)}`;

const PAYMENT_STYLES = {
    'pending': 'bg-amber-100 text-amber-800',
    'paid': 'bg-emerald-100 text-emerald-800',
    'failed': 'bg-rose-100 text-rose-800',
    'partially_refunded': 'bg-orange-100 text-orange-800',
    'refunded': 'bg-teal-100 text-teal-800',
    'cancelled': 'bg-gray-100 text-gray-700'
};

export default function InvoiceView() {
    const { orderId } = useParams();
    const { user } = useAuth();
    const [invoice, setInvoice] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        setLoading(true);
        setError(null);
        API.get(`/invoices/${orderId}`)
            .then(res => {
                // The invoice endpoint returns HTML, but we need JSON data
                // So we fetch the order detail and build the invoice view
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [orderId]);

    // Since the invoice HTML is self-contained, we use an iframe approach
    // or redirect to the HTML endpoint. But for a proper React experience,
    // we render the invoice data as a React component.

    useEffect(() => {
        // Fetch invoice data by fetching order detail which includes invoice info
        setLoading(true);
        setError(null);
        API.get(`/orders/${orderId}`)
            .then(res => {
                if (res.data.success) {
                    setInvoice({
                        order: res.data.order,
                        items: res.data.items
                    });
                }
            })
            .catch(err => {
                setError(err.response?.data?.message || 'Failed to load invoice.');
            })
            .finally(() => setLoading(false));
    }, [orderId]);

    if (loading) {
        return (
            <div className="max-w-4xl mx-auto px-4 py-12 space-y-4">
                <div className="h-8 skeleton rounded-xl w-48" />
                <div className="h-64 skeleton rounded-2xl" />
            </div>
        );
    }

    if (error || !invoice) {
        return (
            <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
                <FileText className="w-12 h-12 text-gray-300 mx-auto" />
                <h2 className="text-xl font-bold text-gray-800">Invoice Not Available</h2>
                <p className="text-sm text-gray-500">{error || 'Invoice not found for this order.'}</p>
                <Link to="/orders" className="inline-block px-6 py-2.5 bg-[#1F4D36] text-white font-bold text-xs rounded-full">
                    Back to My Orders
                </Link>
            </div>
        );
    }

    const { order, items } = invoice;
    const subtotal = parseFloat(order.subtotal || 0);
    const discount = parseFloat(order.discount_amount || 0);
    const shipping = parseFloat(order.shipping_charge || 0);
    const tax = parseFloat(order.tax_amount || 0);
    const total = parseFloat(order.total_amount || 0);

    const invoiceUrl = `${API_BASE_URL}/invoices/${orderId}`;
    const pdfUrl = `${API_BASE_URL}/invoices/${orderId}/pdf`;
    const isCancelled = order.order_status === 'Cancelled';

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#E2DAC8] pb-4">
                <div>
                    <Link
                        to={user?.role === 'admin' ? `/admin/orders/${orderId}` : `/orders/${orderId}`}
                        className="text-xs font-bold text-[#1F4D36] hover:underline flex items-center gap-1 mb-2"
                    >
                        <ChevronLeft className="w-4 h-4" /> Back to Order
                    </Link>
                    <h1 className="text-2xl font-bold font-serif text-[#163326]">Invoice</h1>
                </div>
                <div className="flex items-center gap-2">
                    <a
                        href={invoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#F4EEDD] text-[#163326] font-bold text-xs rounded-full hover:bg-[#1F4D36] hover:text-white transition-all"
                    >
                        <Printer className="w-3.5 h-3.5" /> View Full
                    </a>
                    <a
                        href={pdfUrl}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1F4D36] text-white font-bold text-xs rounded-full hover:bg-[#163326] transition-all"
                    >
                        <Download className="w-3.5 h-3.5" /> Download PDF
                    </a>
                </div>
            </div>

            {/* Invoice Card */}
            <div className="bg-white rounded-3xl border border-[#E2DAC8] overflow-hidden shadow-sm">
                {/* Invoice Header */}
                <div className="p-6 border-b border-[#E2DAC8] flex justify-between items-start">
                    <div>
                        <h2 className="text-lg font-extrabold text-[#163326]">Mandi Connect</h2>
                        <p className="text-xs text-gray-500">Fresh produce, sourced directly from the mandi</p>
                    </div>
                    <div className="text-right">
                        <h3 className="text-base font-extrabold text-[#1F4D36]">INVOICE</h3>
                        <p className="text-xs font-bold font-mono text-[#163326] mt-1">#{order.order_number}</p>
                        <p className="text-xs text-gray-500">
                            {new Date(order.created_at).toLocaleDateString('en-IN', {
                                year: 'numeric', month: 'long', day: 'numeric'
                            })}
                        </p>
                    </div>
                </div>

                {/* Status Pills */}
                <div className="px-6 py-3 flex gap-2">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                        PAYMENT_STYLES[order.payment_status] || 'bg-gray-100 text-gray-700'
                    }`}>
                        Payment: {(order.payment_status || '').replace('_', ' ')}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                        isCancelled ? 'bg-rose-100 text-rose-800' : 'bg-[#E4EEE7] text-[#1F4D36]'
                    }`}>
                        {order.order_status}
                    </span>
                </div>

                {/* Customer & Shipping */}
                <div className="px-6 pb-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-2">Billed To</h4>
                        <p className="text-sm font-bold text-gray-900">{order.shipping_full_name}</p>
                        <p className="text-xs text-gray-600">{order.shipping_address_text}</p>
                        <p className="text-xs text-gray-500 mt-1">Phone: {order.shipping_phone}</p>
                        {order.user_email && <p className="text-xs text-gray-500">Email: {order.user_email}</p>}
                    </div>
                    <div>
                        <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-2">Shipped To</h4>
                        <p className="text-xs text-gray-600">{order.shipping_address_text}</p>
                        <p className="text-xs text-gray-500 mt-1">Phone: {order.shipping_phone}</p>
                    </div>
                </div>

                {/* Line Items */}
                <div className="px-6 pb-6">
                    <table className="w-full text-xs">
                        <thead className="bg-[#F4EEDD] text-[#163326]">
                            <tr>
                                <th className="p-3 text-left font-bold uppercase">Item</th>
                                <th className="p-3 text-right font-bold uppercase">Qty</th>
                                <th className="p-3 text-right font-bold uppercase">Unit Price</th>
                                <th className="p-3 text-right font-bold uppercase">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {items.map(item => {
                                const cancelled = item.cancelled_quantity || 0;
                                const returned = item.returned_quantity || 0;
                                const active = item.quantity - cancelled - returned;
                                return (
                                    <tr key={item.id} className={cancelled + returned > 0 ? 'bg-rose-50/30' : ''}>
                                        <td className="p-3">
                                            <p className="font-bold text-gray-900">{item.product_name}</p>
                                            <p className="text-[10px] text-gray-500">SKU: {item.sku}</p>
                                            {cancelled > 0 && <span className="text-[9px] font-bold text-rose-600">{cancelled} cancelled</span>}
                                            {returned > 0 && <span className="text-[9px] font-bold text-amber-600 ml-1">{returned} returned</span>}
                                        </td>
                                        <td className="p-3 text-right font-bold text-gray-900">
                                            {active} {item.unit}
                                        </td>
                                        <td className="p-3 text-right font-bold text-gray-900">
                                            {formatMoney(item.price)}
                                        </td>
                                        <td className="p-3 text-right font-extrabold text-[#1F4D36]">
                                            {formatMoney(parseFloat(item.price) * active)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Totals */}
                <div className="px-6 pb-6 flex justify-end">
                    <div className="w-64 space-y-1.5 text-xs">
                        <div className="flex justify-between">
                            <span className="text-gray-500">Subtotal</span>
                            <span className="font-bold text-gray-900">{formatMoney(subtotal)}</span>
                        </div>
                        {discount > 0 && (
                            <div className="flex justify-between">
                                <span className="text-gray-500">Discount {order.coupon_code ? `(${order.coupon_code})` : ''}</span>
                                <span className="font-bold text-emerald-700">-{formatMoney(discount)}</span>
                            </div>
                        )}
                        <div className="flex justify-between">
                            <span className="text-gray-500">Shipping</span>
                            <span className="font-bold text-gray-900">
                                {shipping > 0 ? formatMoney(shipping) : 'FREE'}
                            </span>
                        </div>
                        {tax > 0 && (
                            <div className="flex justify-between">
                                <span className="text-gray-500">Tax</span>
                                <span className="font-bold text-gray-900">{formatMoney(tax)}</span>
                            </div>
                        )}
                        <div className="flex justify-between pt-2 border-t border-gray-200">
                            <span className="font-extrabold text-gray-900 text-sm">Grand Total</span>
                            <span className="font-extrabold text-[#1F4D36] text-base">{formatMoney(total)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer Note */}
            <p className="text-xs text-gray-400 text-center">
                This is a system-generated invoice for order #{order.order_number} and does not require a physical signature.
            </p>
        </div>
    );
}
