import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MapPin, Plus, Check, CreditCard, Truck, ShieldCheck, ShoppingBag, ArrowRight, Loader2, AlertTriangle } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import API from '../api/client';

export default function Checkout() {
    const { cartItems, subtotal, clearCart } = useCart();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const location = useLocation();

    const [addresses, setAddresses] = useState([]);
    const [selectedAddressId, setSelectedAddressId] = useState(null);
    const [paymentMethod, setPaymentMethod] = useState('cod'); // 'cod' or 'online'
    const [shippingSettings, setShippingSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [placingOrder, setPlacingOrder] = useState(false);

    // New Address Form toggle
    const [showAddAddress, setShowAddAddress] = useState(false);
    const [newAddress, setNewAddress] = useState({
        full_name: '',
        business_name: '',
        phone: '',
        alternate_phone: '',
        house_building: '',
        street: '',
        area: '',
        city: '',
        state: 'Rajasthan',
        pincode: '',
        landmark: '',
        gstin: '',
        address_type: 'home'
    });

    // Rajasthan pincode serviceability check for the inline add-address form
    const [pincodeStatus, setPincodeStatus] = useState(null);

    const checkPincode = async (pincode) => {
        if (!/^\d{6}$/.test(pincode)) {
            setPincodeStatus(null);
            return;
        }
        setPincodeStatus({ checking: true });
        try {
            const res = await API.get(`/zones/pincode/${pincode}`);
            if (res.data.serviceable) {
                setPincodeStatus({
                    checking: false,
                    serviceable: true,
                    city_town: res.data.city_town,
                    district: res.data.district,
                    zone: res.data.zone
                });
            } else {
                setPincodeStatus({ checking: false, serviceable: false, message: res.data.message });
            }
        } catch (error) {
            setPincodeStatus({
                checking: false,
                serviceable: false,
                message: error.response?.data?.message || 'Could not verify this pincode.'
            });
        }
    };

    const couponCode = location.state?.coupon_code || null;

    useEffect(() => {
        const fetchCheckoutData = async () => {
            try {
                setLoading(true);
                const [addrRes, shipRes] = await Promise.all([
                    API.get('/addresses'),
                    API.get('/shipping')
                ]);

                if (addrRes.data.success) {
                    setAddresses(addrRes.data.addresses);
                    const defaultAddr = addrRes.data.addresses.find(a => a.is_default);
                    if (defaultAddr) setSelectedAddressId(defaultAddr.id);
                    else if (addrRes.data.addresses.length > 0) setSelectedAddressId(addrRes.data.addresses[0].id);
                }

                if (shipRes.data.success) {
                    setShippingSettings(shipRes.data.settings);
                }
            } catch (error) {
                console.error('Checkout init error:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchCheckoutData();
    }, []);

    const handleCreateAddress = async (e) => {
        e.preventDefault();

        if (!pincodeStatus?.serviceable) {
            showToast('Please enter a serviceable Rajasthan pincode before saving.', 'error');
            return;
        }

        try {
            const res = await API.post('/addresses', newAddress);
            if (res.data.success) {
                showToast('New address saved!', 'success');
                setShowAddAddress(false);
                setPincodeStatus(null);
                const addrRes = await API.get('/addresses');
                if (addrRes.data.success) {
                    setAddresses(addrRes.data.addresses);
                    setSelectedAddressId(res.data.address_id);
                }
            }
        } catch (error) {
            showToast(error.response?.data?.message || 'Error saving address.', 'error');
        }
    };

    const shippingCharge = subtotal >= (shippingSettings?.free_shipping_threshold || 500) ? 0.00 : parseFloat(shippingSettings?.shipping_charge || 40);
    const grandTotal = Math.max(0, subtotal + shippingCharge);

    const handlePlaceOrder = async () => {
        if (!selectedAddressId) {
            showToast('Please select a delivery address.', 'error');
            return;
        }

        try {
            setPlacingOrder(true);

            // 1. Create order on backend (COD or Online)
            const orderRes = await API.post('/orders', {
                address_id: selectedAddressId,
                payment_method: paymentMethod,
                coupon_code: couponCode
            });

            if (!orderRes.data.success) {
                showToast(orderRes.data.message || 'Order creation failed.', 'error');
                setPlacingOrder(false);
                return;
            }

            const createdOrder = orderRes.data.order;

            // The server clears cart_items as part of the order transaction.
            // Refresh the provider too so the current page cannot show stale
            // cart contents after a successful order creation.
            await clearCart();

            // 2. If Cash on Delivery, redirect directly to success page
            if (paymentMethod === 'cod') {
                showToast('Order confirmed successfully!', 'success');
                navigate('/order-success', { state: { order: createdOrder } });
                return;
            }

            // 3. If Online Payment via Razorpay
            const razorRes = await API.post('/payments/create-order', {
                order_id: createdOrder.id
            });

            if (!razorRes.data.success) {
                showToast('Failed to initialize online payment gateway.', 'error');
                setPlacingOrder(false);
                return;
            }

            const { razorpayOrder, key, amount } = razorRes.data;
                if (typeof window.Razorpay !== 'function') {
                    showToast('Payment window could not load. Check your internet connection and try again.', 'error');
                    setPlacingOrder(false);
                    return;
                }

            // Open Razorpay Checkout Window
            const options = {
                key: key,
                amount: amount,
                currency: 'INR',
                name: 'Mandi Connect Marketplace',
                description: `Payment for Order #${createdOrder.order_number}`,
                order_id: razorpayOrder.id,
                handler: async function (response) {
                    // Verify signature on backend!
                    try {
                        const verifyRes = await API.post('/payments/verify', {
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            order_id: createdOrder.id
                        });

                        if (verifyRes.data.success) {
                            showToast('Payment verified successfully!', 'success');
                            navigate('/order-success', { state: { order: createdOrder } });
                        }
                    } catch (err) {
                        showToast('Payment signature verification failed.', 'error');
                    }
                },
                prefill: {
                    name: createdOrder.shipping_full_name,
                    contact: createdOrder.shipping_phone
                },
                theme: {
                    color: '#1F4D36'
                }
            };

            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', function () {
                showToast('Payment process cancelled or failed.', 'error');
                setPlacingOrder(false);
            });
            rzp.open();

        } catch (error) {
            console.error('Order placement error:', error);
            showToast(error.response?.data?.message || 'Error processing order placement.', 'error');
            setPlacingOrder(false);
        }
    };

    if (loading) {
        return (
            <div className="max-w-7xl mx-auto px-4 py-16 text-center">
                <div className="w-10 h-10 border-4 border-[#1F4D36] border-t-transparent rounded-full animate-spin mx-auto"></div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
            <h1 className="text-3xl font-bold font-serif text-[#163326] border-b border-[#E2DAC8] pb-4">
                Multi-Step Secure Checkout
            </h1>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Steps Container */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Step 1: Select Delivery Address */}
                    <div className="bg-white p-6 rounded-3xl border border-[#E2DAC8] space-y-4 shadow-xs">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                            <h3 className="text-base font-bold text-[#163326] flex items-center gap-2">
                                <MapPin className="w-5 h-5 text-[#D9760C]" /> Step 1: Delivery Address
                            </h3>
                            <button
                                onClick={() => setShowAddAddress(!showAddAddress)}
                                className="text-xs font-bold text-[#1F4D36] hover:underline flex items-center gap-1"
                            >
                                <Plus className="w-4 h-4" /> Add New Address
                            </button>
                        </div>

                        {/* Add Address Form */}
                        {showAddAddress && (
                            <form onSubmit={handleCreateAddress} className="p-4 bg-[#FBF8F1] rounded-2xl border border-gray-200 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                <input
                                    type="text"
                                    placeholder="Full Name"
                                    required
                                    value={newAddress.full_name}
                                    onChange={e => setNewAddress({ ...newAddress, full_name: e.target.value })}
                                    className="p-2.5 bg-white border border-gray-200 rounded-xl"
                                />
                                <input
                                    type="text"
                                    placeholder="Business / Company Name (optional)"
                                    value={newAddress.business_name}
                                    onChange={e => setNewAddress({ ...newAddress, business_name: e.target.value })}
                                    className="p-2.5 bg-white border border-gray-200 rounded-xl"
                                />
                                <input
                                    type="text"
                                    placeholder="Phone Number"
                                    required
                                    value={newAddress.phone}
                                    onChange={e => setNewAddress({ ...newAddress, phone: e.target.value })}
                                    className="p-2.5 bg-white border border-gray-200 rounded-xl"
                                />
                                <input
                                    type="text"
                                    placeholder="Alternate Phone (optional)"
                                    value={newAddress.alternate_phone}
                                    onChange={e => setNewAddress({ ...newAddress, alternate_phone: e.target.value })}
                                    className="p-2.5 bg-white border border-gray-200 rounded-xl"
                                />
                                <input
                                    type="text"
                                    placeholder="House/Building"
                                    required
                                    value={newAddress.house_building}
                                    onChange={e => setNewAddress({ ...newAddress, house_building: e.target.value })}
                                    className="p-2.5 bg-white border border-gray-200 rounded-xl"
                                />
                                <input
                                    type="text"
                                    placeholder="Street / Road"
                                    required
                                    value={newAddress.street}
                                    onChange={e => setNewAddress({ ...newAddress, street: e.target.value })}
                                    className="p-2.5 bg-white border border-gray-200 rounded-xl"
                                />
                                <input
                                    type="text"
                                    placeholder="Area / Locality"
                                    required
                                    value={newAddress.area}
                                    onChange={e => setNewAddress({ ...newAddress, area: e.target.value })}
                                    className="p-2.5 bg-white border border-gray-200 rounded-xl"
                                />
                                <input
                                    type="text"
                                    placeholder="Village / Town / City"
                                    required
                                    value={newAddress.city}
                                    onChange={e => setNewAddress({ ...newAddress, city: e.target.value })}
                                    className="p-2.5 bg-white border border-gray-200 rounded-xl"
                                />
                                <input
                                    type="text"
                                    value="Rajasthan"
                                    disabled
                                    className="p-2.5 bg-gray-100 border border-gray-200 rounded-xl text-gray-500 font-bold cursor-not-allowed"
                                />
                                <input
                                    type="text"
                                    placeholder="Pincode"
                                    required
                                    maxLength={6}
                                    value={newAddress.pincode}
                                    onChange={e => {
                                        const v = e.target.value.replace(/\D/g, '');
                                        setNewAddress({ ...newAddress, pincode: v });
                                        setPincodeStatus(null);
                                    }}
                                    onBlur={e => e.target.value.trim() && checkPincode(e.target.value.trim())}
                                    className="p-2.5 bg-white border border-gray-200 rounded-xl"
                                />

                                {pincodeStatus && (
                                    <div className="sm:col-span-2 -mt-1">
                                        {pincodeStatus.checking && (
                                            <p className="flex items-center gap-1.5 text-gray-500">
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking serviceability...
                                            </p>
                                        )}
                                        {pincodeStatus.serviceable === true && (
                                            <p className="flex items-center gap-1.5 text-emerald-700 font-bold">
                                                <Check className="w-3.5 h-3.5" />
                                                Deliverable — {pincodeStatus.city_town}, {pincodeStatus.district?.name} ({pincodeStatus.zone?.name})
                                            </p>
                                        )}
                                        {pincodeStatus.serviceable === false && (
                                            <p className="flex items-center gap-1.5 text-rose-600 font-bold">
                                                <AlertTriangle className="w-3.5 h-3.5" /> {pincodeStatus.message}
                                            </p>
                                        )}
                                    </div>
                                )}

                                <input
                                    type="text"
                                    placeholder="GSTIN (optional)"
                                    value={newAddress.gstin}
                                    onChange={e => setNewAddress({ ...newAddress, gstin: e.target.value.toUpperCase() })}
                                    className="sm:col-span-2 p-2.5 bg-white border border-gray-200 rounded-xl"
                                />

                                <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                                    <button type="button" onClick={() => setShowAddAddress(false)} className="px-4 py-2 text-gray-500 font-bold">Cancel</button>
                                    <button
                                        type="submit"
                                        disabled={!pincodeStatus?.serviceable}
                                        className="px-4 py-2 bg-[#1F4D36] text-white font-bold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        Save Address
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* Saved Addresses List */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {addresses.map(addr => (
                                <div
                                    key={addr.id}
                                    onClick={() => setSelectedAddressId(addr.id)}
                                    className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                                        selectedAddressId === addr.id
                                            ? 'border-[#1F4D36] bg-emerald-50/40 shadow-xs'
                                            : 'border-gray-200 hover:border-gray-300'
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-bold text-gray-900">{addr.full_name}</span>
                                        <span className="px-2 py-0.5 bg-[#F4EEDD] text-[#163326] text-[10px] font-bold rounded-full uppercase">
                                            {addr.address_type}
                                        </span>
                                    </div>
                                    {addr.business_name && (
                                        <p className="text-[11px] font-bold text-[#D9760C] mb-1">{addr.business_name}</p>
                                    )}
                                    <p className="text-xs text-gray-600 leading-relaxed">
                                        {addr.house_building}, {addr.street}, {addr.area}, {addr.city}
                                        {addr.district ? `, ${addr.district}` : ''}, {addr.state} - {addr.pincode}
                                    </p>
                                    <p className="text-[11px] font-bold text-gray-500 mt-2">Phone: {addr.phone}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Step 2: Payment Method */}
                    <div className="bg-white p-6 rounded-3xl border border-[#E2DAC8] space-y-4 shadow-xs">
                        <h3 className="text-base font-bold text-[#163326] flex items-center gap-2 border-b border-gray-100 pb-3">
                            <CreditCard className="w-5 h-5 text-[#D9760C]" /> Step 2: Select Payment Method
                        </h3>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Cash on Delivery */}
                            {shippingSettings?.cod_enabled === 1 && (
                                <div
                                    onClick={() => setPaymentMethod('cod')}
                                    className={`p-4 rounded-2xl border-2 cursor-pointer flex items-center gap-3 ${
                                        paymentMethod === 'cod' ? 'border-[#1F4D36] bg-emerald-50/40' : 'border-gray-200'
                                    }`}
                                >
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === 'cod' ? 'border-[#1F4D36] bg-[#1F4D36] text-white' : 'border-gray-300'}`}>
                                        {paymentMethod === 'cod' && <Check className="w-3 h-3" />}
                                    </div>
                                    <div>
                                        <h4 className="text-xs font-bold text-gray-900">Cash on Delivery (COD)</h4>
                                        <p className="text-[11px] text-gray-500">Pay cash upon receiving produce</p>
                                    </div>
                                </div>
                            )}

                            {/* Online Payment via Razorpay */}
                            <div
                                onClick={() => setPaymentMethod('online')}
                                className={`p-4 rounded-2xl border-2 cursor-pointer flex items-center gap-3 ${
                                    paymentMethod === 'online' ? 'border-[#1F4D36] bg-emerald-50/40' : 'border-gray-200'
                                }`}
                            >
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === 'online' ? 'border-[#1F4D36] bg-[#1F4D36] text-white' : 'border-gray-300'}`}>
                                    {paymentMethod === 'online' && <Check className="w-3 h-3" />}
                                </div>
                                <div>
                                    <h4 className="text-xs font-bold text-gray-900">Razorpay Online Payment</h4>
                                    <p className="text-[11px] text-gray-500">UPI, Cards, Net Banking & Wallets</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Summary Sidebar */}
                <div className="bg-white p-6 rounded-3xl border border-[#E2DAC8] space-y-6 h-fit shadow-sm">
                    <h3 className="text-base font-bold text-[#163326] font-serif border-b border-gray-100 pb-3">Order Final Confirmation</h3>

                    {/* Order Items Preview */}
                    <div className="space-y-3 max-h-56 overflow-y-auto pr-1 divide-y divide-gray-50">
                        {cartItems.map(item => (
                            <div key={item.item_id} className="pt-2 flex items-center justify-between text-xs">
                                <div>
                                    <p className="font-bold text-gray-800 line-clamp-1">{item.name}</p>
                                    <p className="text-gray-400">{item.quantity} × ₹{item.effectivePrice.toFixed(2)} / {item.unit}</p>
                                </div>
                                <span className="font-extrabold text-gray-900">₹{item.totalPrice.toFixed(2)}</span>
                            </div>
                        ))}
                    </div>

                    <div className="border-t border-gray-100 pt-3 space-y-2 text-xs text-gray-600">
                        <div className="flex justify-between">
                            <span>Subtotal</span>
                            <span className="font-bold text-gray-900">₹{subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Shipping Fee</span>
                            <span className="font-bold text-gray-900">{shippingCharge === 0 ? 'FREE' : `₹${shippingCharge.toFixed(2)}`}</span>
                        </div>
                        <div className="pt-2 border-t border-gray-100 flex items-baseline justify-between">
                            <span className="text-sm font-bold text-gray-900">Total Payable</span>
                            <span className="text-2xl font-extrabold text-[#1F4D36]">₹{grandTotal.toFixed(2)}</span>
                        </div>
                    </div>

                    <button
                        onClick={handlePlaceOrder}
                        disabled={placingOrder}
                        className="w-full py-4 bg-[#1F4D36] hover:bg-[#163326] text-white font-bold text-sm rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {placingOrder ? 'Processing...' : paymentMethod === 'online' ? 'Pay Now & Confirm Order' : 'Confirm Order (COD)'}
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}