import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, ShoppingBag, Eye, Truck, ArrowUpDown } from 'lucide-react';
import API from '../../api/client';

export default function AdminOrders() {
    const [orders, setOrders] = useState([]);
    const [statusFilter, setStatusFilter] = useState('');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);

    const fetchOrders = async () => {
        try {
            setLoading(true);
            const query = new URLSearchParams();
            if (statusFilter) query.append('status', statusFilter);
            if (search) query.append('search', search);

            const res = await API.get(`/orders/admin-all?${query.toString()}`);
            if (res.data.success) {
                setOrders(res.data.orders);
            }
        } catch (error) {
            console.error('Fetch admin orders error:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();
    }, [statusFilter, search]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2DAC8] pb-4">
                <div>
                    <h1 className="text-2xl font-bold font-serif text-[#163326]">Order Fulfillment Hub</h1>
                    <p className="text-xs text-gray-500">Manage order statuses, courier tracking numbers, and delivery dispatch</p>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-2xl border border-[#E2DAC8]">
                <div className="relative flex-1 min-w-[200px]">
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search order number or customer name..."
                        className="w-full bg-[#FBF8F1] border border-gray-200 rounded-xl px-3 py-2 text-xs pl-9"
                    />
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                </div>

                <div className="flex items-center gap-2 text-xs">
                    <span className="font-bold text-gray-700">Filter Status:</span>
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="bg-[#FBF8F1] border border-gray-200 rounded-xl px-3 py-2 font-bold"
                    >
                        <option value="">All Statuses</option>
                        <option value="Pending">Pending</option>
                        <option value="Confirmed">Confirmed</option>
                        <option value="Processing">Processing</option>
                        <option value="Packed">Packed</option>
                        <option value="Shipped">Shipped</option>
                        <option value="Out for Delivery">Out for Delivery</option>
                        <option value="Delivered">Delivered</option>
                        <option value="Cancelled">Cancelled</option>
                    </select>
                </div>
            </div>

            {/* Orders Table */}
            <div className="bg-white rounded-3xl border border-[#E2DAC8] overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs">
                    <thead className="bg-[#F4EEDD] text-[#163326] font-bold uppercase">
                        <tr>
                            <th className="p-4">Order #</th>
                            <th className="p-4">Customer</th>
                            <th className="p-4">Total Amount</th>
                            <th className="p-4">Payment</th>
                            <th className="p-4">Order Status</th>
                            <th className="p-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr><td colSpan="6" className="p-8 text-center text-gray-400">Loading orders...</td></tr>
                        ) : orders.length === 0 ? (
                            <tr><td colSpan="6" className="p-8 text-center text-gray-400">No orders found.</td></tr>
                        ) : (
                            orders.map(order => (
                                <tr key={order.id} className="hover:bg-[#FBF8F1]">
                                    <td className="p-4 font-mono font-bold text-[#163326]">#{order.order_number}</td>
                                    <td className="p-4">
                                        <p className="font-bold text-gray-900">{order.shipping_full_name}</p>
                                        <p className="text-[10px] text-gray-500">{order.shipping_phone}</p>
                                    </td>
                                    <td className="p-4 font-extrabold text-[#163326]">₹{parseFloat(order.total_amount).toFixed(2)}</td>
                                    <td className="p-4">
                                        <span className="uppercase font-bold text-gray-700 block">{order.payment_method}</span>
                                        <span className={`text-[10px] font-bold uppercase ${order.payment_status === 'paid' ? 'text-emerald-700' : 'text-amber-700'}`}>
                                            {order.payment_status}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                                            order.order_status === 'Delivered' ? 'bg-emerald-100 text-emerald-800' :
                                            order.order_status === 'Cancelled' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                                        }`}>
                                            {order.order_status}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right">
                                        <Link to={`/admin/orders/${order.id}`} className="px-3 py-1.5 bg-[#1F4D36] text-white rounded-xl font-bold flex items-center gap-1 inline-flex hover:bg-[#163326]">
                                            <Eye className="w-3.5 h-3.5" /> Fulfill & Track
                                        </Link>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
