import React, { useState, useEffect } from 'react';
import { Search, User, Mail, Phone, Calendar, ShoppingBag, ShieldAlert, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import API from '../../api/client';
import { useToast } from '../../context/ToastContext';

export default function AdminCustomers() {
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const { addToast } = useToast();

    const fetchCustomers = async () => {
        try {
            setLoading(true);
            const res = await API.get('/admin/dashboard/customers');
            if (res.data.success) {
                setCustomers(res.data.customers);
            }
        } catch (error) {
            addToast(error.response?.data?.message || 'Failed to fetch customer list', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCustomers();
    }, []);

    const toggleStatus = async (id, currentStatus) => {
        try {
            const res = await API.put(`/admin/dashboard/customers/${id}/status`);
            if (res.data.success) {
                addToast(res.data.message, 'success');
                setCustomers(prev => prev.map(c => c.id === id ? { ...c, is_active: currentStatus ? 0 : 1 } : c));
            }
        } catch (error) {
            addToast('Error toggling customer status', 'error');
        }
    };

    const filteredCustomers = customers.filter(c => 
        c.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone?.includes(searchQuery)
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-[#163326]">Customer Management</h1>
                    <p className="text-sm text-gray-600">View customer accounts, order history, and account active status.</p>
                </div>
                <button 
                    onClick={fetchCustomers}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-[#1F4D36] hover:bg-emerald-100 rounded-xl text-xs font-bold transition-colors self-start md:self-auto border border-emerald-200"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh Directory
                </button>
            </div>

            {/* Search Bar */}
            <div className="relative max-w-md">
                <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-gray-400" />
                <input
                    type="text"
                    placeholder="Search by name, email, or phone..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4D36]/20 focus:border-[#1F4D36]"
                />
            </div>

            {/* Customers Table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-gray-500">
                        <div className="w-8 h-8 border-4 border-[#1F4D36] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                        Loading customer directory...
                    </div>
                ) : filteredCustomers.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                        <User className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        No customers found matching your criteria.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-[#FAF8F5] border-b border-gray-100 text-gray-600 text-xs uppercase font-bold tracking-wider">
                                <tr>
                                    <th className="py-3.5 px-4">Customer</th>
                                    <th className="py-3.5 px-4">Contact Info</th>
                                    <th className="py-3.5 px-4">Joined Date</th>
                                    <th className="py-3.5 px-4 text-center">Orders Placed</th>
                                    <th className="py-3.5 px-4 text-right">Total Spent</th>
                                    <th className="py-3.5 px-4 text-center">Status</th>
                                    <th className="py-3.5 px-4 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 font-medium">
                                {filteredCustomers.map(customer => (
                                    <tr key={customer.id} className="hover:bg-amber-50/20 transition-colors">
                                        <td className="py-4 px-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-emerald-100 text-[#1F4D36] font-bold flex items-center justify-center text-sm">
                                                    {customer.full_name?.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-gray-900">{customer.full_name}</p>
                                                    <span className="text-[11px] text-gray-400 font-mono">ID: #{customer.id}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-4 px-4 text-xs space-y-1">
                                            <div className="flex items-center gap-1.5 text-gray-700">
                                                <Mail className="w-3.5 h-3.5 text-gray-400" /> {customer.email}
                                            </div>
                                            {customer.phone && (
                                                <div className="flex items-center gap-1.5 text-gray-500">
                                                    <Phone className="w-3.5 h-3.5 text-gray-400" /> {customer.phone}
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-4 px-4 text-xs text-gray-500 whitespace-nowrap">
                                            {new Date(customer.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="py-4 px-4 text-center">
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                                <ShoppingBag className="w-3.5 h-3.5 text-amber-600" /> {customer.total_orders || 0} orders
                                            </span>
                                        </td>
                                        <td className="py-4 px-4 text-right font-bold text-[#163326]">
                                            ₹{parseFloat(customer.total_spent || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="py-4 px-4 text-center">
                                            {customer.is_active ? (
                                                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                                                    <CheckCircle2 className="w-3.5 h-3.5" /> Active
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200">
                                                    <XCircle className="w-3.5 h-3.5" /> Deactivated
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-4 px-4 text-center">
                                            <button
                                                onClick={() => toggleStatus(customer.id, customer.is_active)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                                    customer.is_active
                                                        ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                                                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                                                }`}
                                            >
                                                {customer.is_active ? 'Deactivate' : 'Activate'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
