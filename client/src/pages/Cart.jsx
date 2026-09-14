import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2, ShoppingBag, Plus, Minus, ArrowRight, Ticket, ShieldCheck, Truck, Tag } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { resolveMediaUrl } from '../utils/media';
import { useToast } from '../context/ToastContext';
import API from '../api/client';

export default function Cart() {
    const { cartItems, subtotal, updateQuantity, removeFromCart, clearCart } = useCart();
    const { showToast } = useToast();
    const navigate = useNavigate();

    const [couponCode, setCouponCode] = useState('');
    const [appliedCoupon, setAppliedCoupon] = useState(null);
    const [validatingCoupon, setValidatingCoupon] = useState(false);

    const handleApplyCoupon = async (e) => {
        e.preventDefault();
        if (!couponCode.trim()) return;

        try {
            setValidatingCoupon(true);
            const res = await API.post('/coupons/validate', {
                code: couponCode.trim(),
                subtotal
            });
            if (res.data.success) {
                setAppliedCoupon(res.data.coupon);
                showToast(res.data.message, 'success');
            }
        } catch (error) {
            showToast(error.response?.data?.message || 'Invalid coupon code.', 'error');
            setAppliedCoupon(null);
        } finally {
            setValidatingCoupon(false);
        }
    };

    const discountAmount = appliedCoupon ? appliedCoupon.discount_amount : 0;
    const shippingCharge = subtotal >= 500 || subtotal === 0 ? 0.00 : 40.00;
    const grandTotal = Math.max(0, subtotal - discountAmount + shippingCharge);

    if (cartItems.length === 0) {
        return (
            <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-4">
                <div className="w-20 h-20 bg-[#F4EEDD] text-[#1F4D36] rounded-full flex items-center justify-center mx-auto">
                    <ShoppingBag className="w-10 h-10" />
                </div>
                <h2 className="text-2xl font-bold font-serif text-gray-900">Your Cart is Empty</h2>
                <p className="text-xs text-gray-500 max-w-sm mx-auto">
                    Explore fresh vegetables, seasonal fruits, and mandi items to start building your cart!
                </p>
                <Link
                    to="/products"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-[#1F4D36] text-white font-bold text-xs rounded-full shadow-md hover:bg-[#163326] transition-all"
                >
                    Start Shopping Mandi Items <ArrowRight className="w-4 h-4" />
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
            <div className="flex items-center justify-between border-b border-[#E2DAC8] pb-4">
                <h1 className="text-3xl font-bold font-serif text-[#163326]">Shopping Cart</h1>
                <button
                    onClick={clearCart}
                    className="text-xs font-bold text-rose-600 hover:underline flex items-center gap-1"
                >
                    <Trash2 className="w-4 h-4" /> Clear Entire Cart
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Cart Items Table */}
                <div className="lg:col-span-2 space-y-4">
                    {cartItems.map(item => (
                        <div
                            key={item.item_id}
                            className="bg-white p-4 rounded-2xl border border-[#E2DAC8] flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs"
                        >
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                                <img
                                    src={resolveMediaUrl(item.thumbnail) || 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=200'}
                                    alt={item.name}
                                    className="w-16 h-16 object-cover rounded-xl bg-gray-100 shrink-0"
                                />
                                <div className="min-w-0 flex-1">
                                    <Link to={`/products/${item.slug}`} className="text-sm font-bold text-gray-900 hover:text-[#1F4D36] truncate block">
                                        {item.name}
                                    </Link>
                                    <p className="text-xs text-gray-500">₹{item.effectivePrice.toFixed(2)} / {item.unit}</p>
                                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                        <span className="text-[10px] text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded-full inline-block">
                                            {item.available_stock} {item.unit} available
                                        </span>
                                        <span className="text-[10px] text-[#8A5A17] font-bold bg-[#FBF3E3] px-2 py-0.5 rounded-full inline-block">
                                            MOQ: {item.minimum_order_quantity} {item.unit}
                                        </span>
                                        {item.is_active === 0 && (
                                            <span className="text-[10px] text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded-full inline-block">
                                                No longer available
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Quantity Controls — decrement stops at MOQ; to
                                go below MOQ, remove the item with the trash
                                icon instead (the backend rejects any quantity
                                update below MOQ). */}
                            <div className="flex items-center gap-3 bg-[#FBF8F1] border border-gray-200 rounded-xl px-3 py-1.5">
                                <button
                                    onClick={() => updateQuantity(item.item_id, item.quantity - 1)}
                                    disabled={item.quantity <= item.minimum_order_quantity}
                                    title={item.quantity <= item.minimum_order_quantity ? `MOQ is ${item.minimum_order_quantity} ${item.unit} — remove the item instead to go lower` : undefined}
                                    className="text-gray-600 hover:text-black disabled:opacity-30"
                                >
                                    <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="text-xs font-bold text-gray-900 w-6 text-center">{item.quantity}</span>
                                <button
                                    onClick={() => updateQuantity(item.item_id, item.quantity + 1)}
                                    disabled={item.quantity >= item.available_stock || (item.maximum_order_quantity && item.quantity >= item.maximum_order_quantity)}
                                    className="text-gray-600 hover:text-black disabled:opacity-30"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            {/* Subtotal & Delete */}
                            <div className="text-right flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                                <span className="text-sm font-extrabold text-[#163326]">
                                    ₹{item.totalPrice.toFixed(2)}
                                </span>
                                <button
                                    onClick={() => removeFromCart(item.item_id)}
                                    className="text-rose-500 hover:text-rose-700 p-1"
                                    title="Remove Item"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Pricing & Coupon Sidebar */}
                <div className="space-y-6">
                    {/* Coupon Application Box */}
                    <div className="bg-white p-6 rounded-3xl border border-[#E2DAC8] space-y-3">
                        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                            <Ticket className="w-4 h-4 text-[#D9760C]" /> Have a Promo Coupon?
                        </h3>
                        <form onSubmit={handleApplyCoupon} className="flex gap-2">
                            <input
                                type="text"
                                value={couponCode}
                                onChange={(e) => setCouponCode(e.target.value)}
                                placeholder="Enter code (MANDI100)"
                                className="flex-1 bg-[#FBF8F1] border border-gray-200 rounded-xl px-3 py-2 text-xs uppercase font-mono font-bold focus:outline-none focus:ring-1 focus:ring-[#1F4D36]"
                            />
                            <button
                                type="submit"
                                disabled={validatingCoupon}
                                className="px-4 py-2 bg-[#163326] text-white text-xs font-bold rounded-xl hover:bg-[#1F4D36]"
                            >
                                Apply
                            </button>
                        </form>

                        {appliedCoupon && (
                            <div className="p-2.5 bg-emerald-50 text-emerald-800 text-xs font-bold rounded-xl flex items-center justify-between border border-emerald-200">
                                <span>Coupon "{appliedCoupon.code}" Applied!</span>
                                <span>-₹{appliedCoupon.discount_amount.toFixed(2)}</span>
                            </div>
                        )}
                    </div>

                    {/* Cost Breakdown */}
                    <div className="bg-white p-6 rounded-3xl border border-[#E2DAC8] space-y-4 shadow-sm">
                        <h3 className="text-base font-bold text-[#163326] font-serif border-b border-gray-100 pb-3">Order Summary</h3>

                        <div className="space-y-2 text-xs text-gray-600">
                            <div className="flex justify-between">
                                <span>Subtotal</span>
                                <span className="font-bold text-gray-900">₹{subtotal.toFixed(2)}</span>
                            </div>
                            {appliedCoupon && (
                                <div className="flex justify-between text-emerald-700">
                                    <span>Discount</span>
                                    <span className="font-bold">-₹{discountAmount.toFixed(2)}</span>
                                </div>
                            )}
                            <div className="flex justify-between">
                                <span>Shipping Charge</span>
                                <span className="font-bold text-gray-900">
                                    {shippingCharge === 0 ? <span className="text-emerald-600 font-extrabold uppercase">FREE</span> : `₹${shippingCharge.toFixed(2)}`}
                                </span>
                            </div>
                            {subtotal < 500 && (
                                <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg">
                                    Add ₹{(500 - subtotal).toFixed(2)} more produce to unlock FREE Mandi Shipping!
                                </p>
                            )}
                        </div>

                        <div className="pt-3 border-t border-gray-100 flex items-baseline justify-between">
                            <span className="text-base font-bold text-gray-900">Grand Total</span>
                            <span className="text-2xl font-extrabold text-[#1F4D36]">₹{grandTotal.toFixed(2)}</span>
                        </div>

                        <button
                            onClick={() => navigate('/checkout', { state: { coupon_code: appliedCoupon?.code } })}
                            className="w-full py-3.5 bg-[#1F4D36] hover:bg-[#163326] text-white font-bold text-sm rounded-2xl shadow-md transition-all flex items-center justify-center gap-2"
                        >
                            Proceed to Checkout <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}