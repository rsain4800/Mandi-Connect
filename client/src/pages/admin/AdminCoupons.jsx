import React, { useState, useEffect } from 'react';
import { Ticket, Plus, Trash2, Calendar, Tag, AlertCircle, Percent, DollarSign, X } from 'lucide-react';
import API from '../../api/client';
import { useToast } from '../../context/ToastContext';

export default function AdminCoupons() {
    const [coupons, setCoupons] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const { addToast } = useToast();

    // Form state
    const [formData, setFormData] = useState({
        code: '',
        discount_type: 'percentage',
        discount_value: '',
        min_order_amount: '0',
        max_discount: '',
        start_date: new Date().toISOString().split('T')[0],
        expiry_date: '',
        usage_limit: '100',
        per_user_limit: '1',
        is_active: 1
    });

    const fetchCoupons = async () => {
        try {
            setLoading(true);
            const res = await API.get('/coupons/admin-list');
            if (res.data.success) {
                setCoupons(res.data.coupons);
            }
        } catch (error) {
            addToast('Failed to fetch coupons list', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCoupons();
    }, []);

    const handleCreateCoupon = async (e) => {
        e.preventDefault();
        try {
            const res = await API.post('/coupons', formData);
            if (res.data.success) {
                addToast('Coupon created successfully!', 'success');
                setShowModal(false);
                setFormData({
                    code: '',
                    discount_type: 'percentage',
                    discount_value: '',
                    min_order_amount: '0',
                    max_discount: '',
                    start_date: new Date().toISOString().split('T')[0],
                    expiry_date: '',
                    usage_limit: '100',
                    per_user_limit: '1',
                    is_active: 1
                });
                fetchCoupons();
            }
        } catch (error) {
            addToast(error.response?.data?.message || 'Error creating coupon', 'error');
        }
    };

    const handleDeleteCoupon = async (id) => {
        if (!window.confirm('Are you sure you want to delete this promotional coupon?')) return;
        try {
            const res = await API.delete(`/coupons/${id}`);
            if (res.data.success) {
                addToast('Coupon deleted successfully', 'success');
                setCoupons(prev => prev.filter(c => c.id !== id));
            }
        } catch (error) {
            addToast('Failed to delete coupon', 'error');
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-[#163326]">Promotional Coupon Master</h1>
                    <p className="text-sm text-gray-600">Create & manage discount codes for checkout offers.</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1F4D36] text-white hover:bg-[#163326] rounded-xl text-xs font-bold transition-all shadow-md hover:shadow-lg self-start sm:self-auto"
                >
                    <Plus className="w-4 h-4" /> Create New Coupon
                </button>
            </div>

            {/* Coupon Grid */}
            {loading ? (
                <div className="p-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-100">
                    <div className="w-8 h-8 border-4 border-[#1F4D36] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                    Loading promotional coupons...
                </div>
            ) : coupons.length === 0 ? (
                <div className="p-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-100">
                    <Ticket className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    No promotional coupons found. Create your first discount offer!
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {coupons.map(c => {
                        const isExpired = new Date(c.expiry_date) < new Date();
                        return (
                            <div key={c.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-amber-100/40 to-transparent rounded-bl-full -mr-6 -mt-6 pointer-events-none"></div>

                                <div>
                                    <div className="flex items-center justify-between gap-2 mb-3">
                                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-50 text-[#D9760C] font-mono text-sm font-bold rounded-lg border border-amber-200">
                                            <Tag className="w-3.5 h-3.5" /> {c.code}
                                        </span>
                                        <button
                                            onClick={() => handleDeleteCoupon(c.id)}
                                            className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                            title="Delete Coupon"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>

                                    <div className="my-4">
                                        <p className="text-2xl font-black text-[#163326]">
                                            {c.discount_type === 'percentage' ? `${c.discount_value}% OFF` : `₹${c.discount_value} OFF`}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-1">
                                            Min Order: <strong className="text-gray-800">₹{c.min_order_amount}</strong>
                                            {c.max_discount && ` • Max Cap: ₹${c.max_discount}`}
                                        </p>
                                    </div>

                                    <div className="space-y-1.5 text-xs text-gray-500 border-t border-gray-100 pt-3">
                                        <div className="flex items-center gap-2">
                                            <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                            <span>Valid: {new Date(c.start_date).toLocaleDateString()} – {new Date(c.expiry_date).toLocaleDateString()}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1">
                                            <span>Limit: {c.usage_limit} total</span>
                                            <span>Per User: {c.per_user_limit} max</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                                    <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                                        isExpired
                                            ? 'bg-rose-50 text-rose-600 border border-rose-200'
                                            : c.is_active
                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                            : 'bg-gray-100 text-gray-500'
                                    }`}>
                                        {isExpired ? 'Expired' : c.is_active ? 'Active & Live' : 'Inactive'}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Create Coupon Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                            <h3 className="text-lg font-bold text-[#163326] flex items-center gap-2">
                                <Ticket className="w-5 h-5 text-[#D9760C]" /> Create New Discount Coupon
                            </h3>
                            <button onClick={() => setShowModal(false)} className="p-1 text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleCreateCoupon} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Coupon Code (Uppercase)</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. MANDI2026"
                                    value={formData.code}
                                    onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                    className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm uppercase font-mono font-bold focus:ring-2 focus:ring-[#1F4D36]/20 focus:border-[#1F4D36]"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Discount Type</label>
                                    <select
                                        value={formData.discount_type}
                                        onChange={e => setFormData({ ...formData, discount_type: e.target.value })}
                                        className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#1F4D36]/20 focus:border-[#1F4D36]"
                                    >
                                        <option value="percentage">Percentage (%)</option>
                                        <option value="fixed">Fixed Amount (₹)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Discount Value</label>
                                    <input
                                        type="number"
                                        required
                                        min="1"
                                        placeholder={formData.discount_type === 'percentage' ? 'e.g. 20' : 'e.g. 100'}
                                        value={formData.discount_value}
                                        onChange={e => setFormData({ ...formData, discount_value: e.target.value })}
                                        className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#1F4D36]/20 focus:border-[#1F4D36]"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Min Order Subtotal (₹)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        placeholder="0"
                                        value={formData.min_order_amount}
                                        onChange={e => setFormData({ ...formData, min_order_amount: e.target.value })}
                                        className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#1F4D36]/20 focus:border-[#1F4D36]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Max Discount Cap (₹)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        placeholder="Optional"
                                        value={formData.max_discount}
                                        onChange={e => setFormData({ ...formData, max_discount: e.target.value })}
                                        className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#1F4D36]/20 focus:border-[#1F4D36]"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Start Date</label>
                                    <input
                                        type="date"
                                        required
                                        value={formData.start_date}
                                        onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                                        className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#1F4D36]/20 focus:border-[#1F4D36]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Expiry Date</label>
                                    <input
                                        type="date"
                                        required
                                        value={formData.expiry_date}
                                        onChange={e => setFormData({ ...formData, expiry_date: e.target.value })}
                                        className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#1F4D36]/20 focus:border-[#1F4D36]"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Total Usage Limit</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={formData.usage_limit}
                                        onChange={e => setFormData({ ...formData, usage_limit: e.target.value })}
                                        className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#1F4D36]/20 focus:border-[#1F4D36]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Per User Limit</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={formData.per_user_limit}
                                        onChange={e => setFormData({ ...formData, per_user_limit: e.target.value })}
                                        className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#1F4D36]/20 focus:border-[#1F4D36]"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-5 py-2 bg-[#1F4D36] hover:bg-[#163326] text-white rounded-xl text-xs font-bold shadow-md"
                                >
                                    Save Coupon
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
