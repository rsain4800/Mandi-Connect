import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, DollarSign, ShoppingBag, FolderTree, CreditCard, RefreshCw } from 'lucide-react';
import API from '../../api/client';
import { useToast } from '../../context/ToastContext';

export default function AdminReports() {
    const [reports, setReports] = useState(null);
    const [loading, setLoading] = useState(true);
    const { addToast } = useToast();

    const fetchReports = async () => {
        try {
            setLoading(true);
            const res = await API.get('/admin/dashboard/reports');
            if (res.data.success) {
                setReports(res.data.reports);
            }
        } catch (error) {
            addToast('Failed to fetch analytics reports', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReports();
    }, []);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-[#163326]">Analytics & Sales Performance Reports</h1>
                    <p className="text-sm text-gray-600">Track monthly sales trends, category performance, and payment breakdown.</p>
                </div>
                <button
                    onClick={fetchReports}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-[#1F4D36] hover:bg-emerald-100 rounded-xl text-xs font-bold transition-colors border border-emerald-200 self-start sm:self-auto"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh Reports
                </button>
            </div>

            {loading ? (
                <div className="p-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-100">
                    <div className="w-8 h-8 border-4 border-[#1F4D36] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                    Generating revenue analytics...
                </div>
            ) : !reports ? (
                <div className="p-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-100">
                    <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    No analytics data available yet. Place test orders to generate metrics.
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Monthly Trends Table & Visual Progress */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                            <TrendingUp className="w-5 h-5 text-[#D9760C]" />
                            <h2 className="text-lg font-bold text-[#163326]">Monthly Revenue & Order Velocity</h2>
                        </div>

                        {reports.monthly_trends.length === 0 ? (
                            <p className="text-xs text-gray-500">No monthly trends recorded.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-[#FAF8F5] text-gray-600 text-xs font-bold uppercase">
                                        <tr>
                                            <th className="py-3 px-4">Month</th>
                                            <th className="py-3 px-4 text-center">Total Orders</th>
                                            <th className="py-3 px-4 text-right">Revenue (₹)</th>
                                            <th className="py-3 px-4">Visual Scale</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {reports.monthly_trends.map((m, idx) => {
                                            const maxRevenue = Math.max(...reports.monthly_trends.map(t => parseFloat(t.total_revenue || 0)), 1);
                                            const widthPercent = Math.min(100, Math.max(8, (parseFloat(m.total_revenue || 0) / maxRevenue) * 100));
                                            return (
                                                <tr key={idx} className="hover:bg-amber-50/20">
                                                    <td className="py-3.5 px-4 font-bold text-gray-900">{m.month}</td>
                                                    <td className="py-3.5 px-4 text-center font-semibold text-gray-700">{m.total_orders}</td>
                                                    <td className="py-3.5 px-4 text-right font-bold text-[#163326]">
                                                        ₹{parseFloat(m.total_revenue).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="py-3.5 px-4">
                                                        <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                                                            <div
                                                                className="bg-gradient-to-r from-[#1F4D36] to-[#D9760C] h-full rounded-full transition-all duration-500"
                                                                style={{ width: `${widthPercent}%` }}
                                                            ></div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Sales by Category */}
                        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                            <div className="flex items-center gap-2 mb-4">
                                <FolderTree className="w-5 h-5 text-[#1F4D36]" />
                                <h2 className="text-lg font-bold text-[#163326]">Category Sales Distribution</h2>
                            </div>

                            <div className="space-y-4">
                                {reports.category_sales.map((cat, i) => (
                                    <div key={i} className="p-3 bg-[#FAF8F5] rounded-xl border border-amber-900/5 flex items-center justify-between">
                                        <div>
                                            <p className="font-bold text-gray-900 text-sm">{cat.category_name}</p>
                                            <span className="text-xs text-gray-500">{cat.total_orders} orders placed</span>
                                        </div>
                                        <p className="font-bold text-[#163326] text-sm">
                                            ₹{parseFloat(cat.category_revenue).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Payment Method Breakdown */}
                        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                            <div className="flex items-center gap-2 mb-4">
                                <CreditCard className="w-5 h-5 text-[#D9760C]" />
                                <h2 className="text-lg font-bold text-[#163326]">Payment Gateway Breakdown</h2>
                            </div>

                            <div className="space-y-4">
                                {reports.payment_methods.map((pm, i) => (
                                    <div key={i} className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-[#1F4D36] text-white flex items-center justify-center font-bold text-xs uppercase">
                                                {pm.payment_method}
                                            </div>
                                            <div>
                                                <p className="font-bold text-gray-900 text-sm uppercase">{pm.payment_method === 'cod' ? 'Cash on Delivery (COD)' : 'Razorpay Online Payment'}</p>
                                                <span className="text-xs text-gray-500">{pm.count} total transactions</span>
                                            </div>
                                        </div>
                                        <p className="font-bold text-[#163326] text-sm">
                                            ₹{parseFloat(pm.revenue).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
