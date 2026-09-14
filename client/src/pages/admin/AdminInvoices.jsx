import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, FileText, Download, Eye, Calendar } from 'lucide-react';
import API from '../../api/client';

const formatMoney = (val) => `Rs. ${parseFloat(val || 0).toFixed(2)}`;

const PAYMENT_STYLES = {
    'pending': 'bg-amber-100 text-amber-800',
    'paid': 'bg-emerald-100 text-emerald-800',
    'failed': 'bg-rose-100 text-rose-800',
    'partially_refunded': 'bg-orange-100 text-orange-800',
    'refunded': 'bg-teal-100 text-teal-800',
    'cancelled': 'bg-gray-100 text-gray-700'
};

export default function AdminInvoices() {
    const [invoices, setInvoices] = useState([]);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 });
    const [loading, setLoading] = useState(true);

    const fetchInvoices = async (page = 1) => {
        try {
            setLoading(true);
            const query = new URLSearchParams({ page: String(page), limit: '20' });
            if (search) query.append('q', search);
            if (statusFilter) query.append('status', statusFilter);

            const endpoint = search || statusFilter ? '/invoices/admin/search' : '/invoices/admin/all';
            const res = await API.get(`${endpoint}?${query.toString()}`);
            if (res.data.success) {
                setInvoices(res.data.invoices);
                setPagination(res.data.pagination);
            }
        } catch (err) {
            console.error('Fetch invoices error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInvoices(1);
    }, [search, statusFilter]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2DAC8] pb-4">
                <div>
                    <h1 className="text-2xl font-bold font-serif text-[#163326]">Invoices</h1>
                    <p className="text-xs text-gray-500">View, search, and download business invoices</p>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-2xl border border-[#E2DAC8]">
                <div className="relative flex-1 min-w-[200px]">
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search invoice number, customer name, or email..."
                        className="w-full bg-[#FBF8F1] border border-gray-200 rounded-xl px-3 py-2 text-xs pl-9"
                    />
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                </div>

                <div className="flex items-center gap-2 text-xs">
                    <span className="font-bold text-gray-700">Payment Status:</span>
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="bg-[#FBF8F1] border border-gray-200 rounded-xl px-3 py-2 font-bold"
                    >
                        <option value="">All Statuses</option>
                        <option value="pending">Pending</option>
                        <option value="paid">Paid</option>
                        <option value="failed">Failed</option>
                        <option value="partially_refunded">Partially Refunded</option>
                        <option value="refunded">Refunded</option>
                    </select>
                </div>
            </div>

            {/* Results count */}
            <div className="text-xs text-gray-500">
                {pagination.total} invoice{pagination.total !== 1 ? 's' : ''} found
            </div>

            {/* Invoices Table */}
            <div className="bg-white rounded-3xl border border-[#E2DAC8] overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs">
                    <thead className="bg-[#F4EEDD] text-[#163326] font-bold uppercase">
                        <tr>
                            <th className="p-4">Invoice #</th>
                            <th className="p-4">Order #</th>
                            <th className="p-4">Customer</th>
                            <th className="p-4">Total</th>
                            <th className="p-4">Payment</th>
                            <th className="p-4">Date</th>
                            <th className="p-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr><td colSpan="7" className="p-8 text-center text-gray-400">Loading invoices...</td></tr>
                        ) : invoices.length === 0 ? (
                            <tr><td colSpan="7" className="p-8 text-center text-gray-400">No invoices found.</td></tr>
                        ) : (
                            invoices.map(inv => (
                                <tr key={inv.id} className="hover:bg-[#FBF8F1]">
                                    <td className="p-4 font-mono font-bold text-[#163326]">
                                        {inv.invoice_number}
                                    </td>
                                    <td className="p-4 font-mono text-gray-700">
                                        #{inv.order_number || inv.order_id}
                                    </td>
                                    <td className="p-4">
                                        <p className="font-bold text-gray-900">{inv.customer_name}</p>
                                        <p className="text-[10px] text-gray-500">{inv.customer_email}</p>
                                    </td>
                                    <td className="p-4 font-extrabold text-[#163326]">
                                        {formatMoney(inv.total_amount)}
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                                            PAYMENT_STYLES[inv.payment_status] || 'bg-gray-100 text-gray-700'
                                        }`}>
                                            {(inv.payment_status || '').replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td className="p-4 text-gray-500">
                                        <div className="flex items-center gap-1">
                                            <Calendar className="w-3 h-3" />
                                            {new Date(inv.created_at).toLocaleDateString('en-IN')}
                                        </div>
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="flex items-center gap-2 justify-end">
                                            <a
                                                href={`/api/invoices/${inv.order_id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="px-3 py-1.5 bg-[#F4EEDD] text-[#163326] rounded-xl font-bold flex items-center gap-1 hover:bg-[#1F4D36] hover:text-white transition-all text-[10px]"
                                            >
                                                <Eye className="w-3 h-3" /> View
                                            </a>
                                            <a
                                                href={`/api/invoices/${inv.order_id}/pdf`}
                                                className="px-3 py-1.5 bg-[#1F4D36] text-white rounded-xl font-bold flex items-center gap-1 hover:bg-[#163326] text-[10px]"
                                            >
                                                <Download className="w-3 h-3" /> PDF
                                            </a>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
                <div className="flex justify-center gap-2">
                    {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                        .filter(p => Math.abs(p - pagination.page) <= 2 || p === 1 || p === pagination.totalPages)
                        .map((p, idx, arr) => (
                            <React.Fragment key={p}>
                                {idx > 0 && arr[idx - 1] !== p - 1 && (
                                    <span className="px-2 py-1 text-gray-400 text-xs">...</span>
                                )}
                                <button
                                    onClick={() => fetchInvoices(p)}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                        p === pagination.page
                                            ? 'bg-[#1F4D36] text-white'
                                            : 'bg-[#F4EEDD] text-[#163326] hover:bg-[#1F4D36] hover:text-white'
                                    }`}
                                >
                                    {p}
                                </button>
                            </React.Fragment>
                        ))
                    }
                </div>
            )}
        </div>
    );
}
