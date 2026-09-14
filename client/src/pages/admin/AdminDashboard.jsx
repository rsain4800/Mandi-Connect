import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, Users, Package, AlertTriangle, TrendingUp, Clock, ChevronRight, CheckCircle, IndianRupee } from 'lucide-react';
import API from '../../api/client';

export default function AdminDashboard() {
    const [metrics, setMetrics] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        API.get('/admin/dashboard/metrics')
            .then(res => {
                if (res.data.success) {
                    setMetrics(res.data.metrics);
                }
            })
            .catch(err => console.error('Dashboard metrics error:', err))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {[1, 2, 3, 4].map(n => <div key={n} className="h-28 skeleton rounded-3xl" />)}
                </div>
            </div>
        );
    }

    if (!metrics) return null;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold font-serif text-[#163326]">Executive Admin Dashboard</h1>
                <p className="text-xs text-gray-500">Live sales overview, inventory stats, and fulfillment metrics</p>
            </div>

            {/* Metrics Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-3xl border border-[#E2DAC8] shadow-xs flex items-center justify-between">
                    <div>
                        <span className="text-xs font-semibold text-gray-500">Total Sales</span>
                        <h3 className="text-2xl font-extrabold text-[#163326] mt-1">₹{metrics.total_sales.toFixed(2)}</h3>
                        <span className="text-[11px] font-bold text-emerald-600 mt-1 block">Monthly: ₹{metrics.monthly_sales.toFixed(2)}</span>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-[#1F4D36] flex items-center justify-center font-bold">
                        <IndianRupee className="w-6 h-6" />
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-[#E2DAC8] shadow-xs flex items-center justify-between">
                    <div>
                        <span className="text-xs font-semibold text-gray-500">Today's Sales</span>
                        <h3 className="text-2xl font-extrabold text-[#D9760C] mt-1">₹{metrics.today_sales.toFixed(2)}</h3>
                        <span className="text-[11px] text-gray-400 mt-1 block">Live Revenue</span>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-amber-100 text-[#D9760C] flex items-center justify-center font-bold">
                        <TrendingUp className="w-6 h-6" />
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-[#E2DAC8] shadow-xs flex items-center justify-between">
                    <div>
                        <span className="text-xs font-semibold text-gray-500">Total Orders</span>
                        <h3 className="text-2xl font-extrabold text-gray-900 mt-1">{metrics.total_orders}</h3>
                        <span className="text-[11px] font-bold text-amber-600 mt-1 block">{metrics.status_breakdown.Pending || 0} Pending</span>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                        <ShoppingBag className="w-6 h-6" />
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-[#E2DAC8] shadow-xs flex items-center justify-between">
                    <div>
                        <span className="text-xs font-semibold text-gray-500">Total Customers</span>
                        <h3 className="text-2xl font-extrabold text-gray-900 mt-1">{metrics.total_customers}</h3>
                        <span className="text-[11px] text-gray-400 mt-1 block">{metrics.total_products} Active Products</span>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                        <Users className="w-6 h-6" />
                    </div>
                </div>
            </div>

            {/* Order Status Counters */}
            <div className="bg-white p-6 rounded-3xl border border-[#E2DAC8] space-y-4 shadow-xs">
                <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3">Order Status Pipeline</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-center text-xs">
                    <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200">
                        <span className="text-gray-500 block">Pending</span>
                        <span className="text-lg font-bold text-amber-800">{metrics.status_breakdown.Pending || 0}</span>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-2xl border border-blue-200">
                        <span className="text-gray-500 block">Confirmed</span>
                        <span className="text-lg font-bold text-blue-800">{metrics.status_breakdown.Confirmed || 0}</span>
                    </div>
                    <div className="p-3 bg-indigo-50 rounded-2xl border border-indigo-200">
                        <span className="text-gray-500 block">Processing</span>
                        <span className="text-lg font-bold text-indigo-800">{metrics.status_breakdown.Processing || 0}</span>
                    </div>
                    <div className="p-3 bg-purple-50 rounded-2xl border border-purple-200">
                        <span className="text-gray-500 block">Packed</span>
                        <span className="text-lg font-bold text-purple-800">{metrics.status_breakdown.Packed || 0}</span>
                    </div>
                    <div className="p-3 bg-cyan-50 rounded-2xl border border-cyan-200">
                        <span className="text-gray-500 block">Shipped</span>
                        <span className="text-lg font-bold text-cyan-800">{metrics.status_breakdown.Shipped || 0}</span>
                    </div>
                    <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200">
                        <span className="text-gray-500 block">Delivered</span>
                        <span className="text-lg font-bold text-emerald-800">{metrics.status_breakdown.Delivered || 0}</span>
                    </div>
                    <div className="p-3 bg-rose-50 rounded-2xl border border-rose-200">
                        <span className="text-gray-500 block">Cancelled</span>
                        <span className="text-lg font-bold text-rose-800">{metrics.status_breakdown.Cancelled || 0}</span>
                    </div>
                </div>
            </div>

            {/* Low Stock Alerts & Recent Orders */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Low Stock Alerts */}
                <div className="bg-white p-6 rounded-3xl border border-[#E2DAC8] space-y-4 shadow-xs">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-rose-600" /> Low Stock Produce (&lt; 20 units)
                        </h3>
                        <Link to="/admin/products" className="text-xs font-bold text-[#1F4D36] hover:underline">Manage Stock</Link>
                    </div>

                    {metrics.low_stock_products.length === 0 ? (
                        <p className="text-xs text-gray-500">All produce items have healthy inventory levels.</p>
                    ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                            {metrics.low_stock_products.map(item => (
                                <div key={item.id} className="p-3 bg-rose-50/60 rounded-2xl border border-rose-100 flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-3">
                                        <img src={item.thumbnail || 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=100'} alt="" className="w-10 h-10 object-cover rounded-lg bg-gray-100" />
                                        <div>
                                            <p className="font-bold text-gray-900">{item.name}</p>
                                            <p className="text-[10px] text-gray-500">SKU: {item.sku}</p>
                                        </div>
                                    </div>
                                    <span className="px-2.5 py-1 bg-rose-600 text-white font-extrabold rounded-full">
                                        {item.available_stock ?? item.stock_quantity} {item.unit}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Recent Orders */}
                <div className="bg-white p-6 rounded-3xl border border-[#E2DAC8] space-y-4 shadow-xs">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                            <Clock className="w-4 h-4 text-[#D9760C]" /> Recent Orders
                        </h3>
                        <Link to="/admin/orders" className="text-xs font-bold text-[#1F4D36] hover:underline">View All Orders</Link>
                    </div>

                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {metrics.recent_orders.map(o => (
                            <Link key={o.id} to={`/admin/orders/${o.id}`} className="block p-3 hover:bg-[#F4EEDD]/40 rounded-2xl border border-gray-100 flex items-center justify-between text-xs transition-colors">
                                <div>
                                    <p className="font-bold text-gray-900">#{o.order_number} ({o.shipping_full_name})</p>
                                    <p className="text-[10px] text-gray-500">{new Date(o.created_at).toLocaleString()}</p>
                                </div>
                                <div className="text-right">
                                    <span className="font-extrabold text-[#163326] block">₹{parseFloat(o.total_amount).toFixed(2)}</span>
                                    <span className="text-[10px] font-bold text-emerald-700 uppercase">{o.order_status}</span>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}