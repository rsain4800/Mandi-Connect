import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Edit, Ban, RotateCcw, Search, Check, X, Leaf, Image, Tags } from 'lucide-react';
import API from '../../api/client';
import { useToast } from '../../context/ToastContext';

export default function AdminProducts() {
    const { showToast } = useToast();
    const navigate = useNavigate();
    const [products, setProducts] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // all | active | inactive
    const [loading, setLoading] = useState(true);

    const fetchProducts = async () => {
        try {
            setLoading(true);
            const res = await API.get('/products/admin-list');
            if (res.data.success) {
                setProducts(res.data.products);
            }
        } catch (error) {
            console.error('Fetch admin products error:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProducts();
    }, []);

    // Products are never hard-deleted (a product with historical orders
    // can't be — order_items.product_id references it). "Delete" always
    // means deactivate; a deactivated product can be reactivated later.
    const handleDeactivate = async (id) => {
        if (!window.confirm('Deactivate this product? It will disappear from the storefront but stay in past orders.')) return;
        try {
            await API.delete(`/products/${id}`);
            showToast('Product deactivated.', 'info');
            fetchProducts();
        } catch (error) {
            showToast('Error deactivating product.', 'error');
        }
    };

    const handleReactivate = async (id) => {
        try {
            await API.patch(`/products/${id}/reactivate`);
            showToast('Product reactivated.', 'success');
            fetchProducts();
        } catch (error) {
            showToast('Error reactivating product.', 'error');
        }
    };

    const filtered = products
        .filter(p =>
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.sku.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .filter(p => {
            if (statusFilter === 'active') return p.is_active === 1;
            if (statusFilter === 'inactive') return p.is_active === 0;
            return true;
        });

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2DAC8] pb-4">
                <div>
                    <h1 className="text-2xl font-bold font-serif text-[#163326]">Product Inventory Master</h1>
                    <p className="text-xs text-gray-500">Manage mandi items, wholesale pricing, MOQ, stock, and status</p>
                </div>

                <Link
                    to="/admin/products/add"
                    className="px-5 py-2.5 bg-[#1F4D36] hover:bg-[#163326] text-white font-bold text-xs rounded-full shadow-md flex items-center gap-1.5 shrink-0"
                >
                    <Plus className="w-4 h-4" /> Add New Produce Item
                </Link>
            </div>

            {/* Search filter + status filter */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative max-w-md flex-1">
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Search by product name or SKU..."
                        className="w-full bg-white border border-[#E2DAC8] rounded-xl px-4 py-2.5 text-xs pl-10"
                    />
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                </div>
                <div className="flex gap-1.5 bg-white border border-[#E2DAC8] rounded-xl p-1 text-xs font-bold">
                    {['all', 'active', 'inactive'].map(s => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={`px-3 py-1.5 rounded-lg capitalize transition-colors ${
                                statusFilter === s ? 'bg-[#1F4D36] text-white' : 'text-gray-500 hover:bg-gray-50'
                            }`}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-3xl border border-[#E2DAC8] overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-[#F4EEDD] text-[#163326] font-bold uppercase tracking-wider">
                            <tr>
                                <th className="p-4">Produce Item</th>
                                <th className="p-4">SKU / Category</th>
                                <th className="p-4">Mandi Rate / Unit</th>
                                <th className="p-4">MOQ / Max</th>
                                <th className="p-4">Available Stock</th>
                                <th className="p-4">Status</th>
                                <th className="p-4">Badges</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan="8" className="p-8 text-center text-gray-400">Loading inventory...</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan="8" className="p-8 text-center text-gray-400">No products found.</td></tr>
                            ) : (
                                filtered.map(product => {
                                    const availableStock = product.available_stock ?? product.stock_quantity;
                                    return (
                                        <tr key={product.id} className={`hover:bg-[#FBF8F1]/60 transition-colors ${product.is_active === 0 ? 'opacity-60' : ''}`}>
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <img src={product.thumbnail || 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=100'} alt="" className="w-10 h-10 object-cover rounded-xl bg-gray-100 shrink-0" />
                                                    <div>
                                                        <p className="font-bold text-gray-900 line-clamp-1">{product.name}</p>
                                                        <p className="text-[10px] text-gray-400">{product.brand}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <span className="font-mono text-gray-700 block font-bold">{product.sku}</span>
                                                <span className="text-gray-500">{product.category_name}</span>
                                            </td>
                                            <td className="p-4">
                                                <span className="font-extrabold text-[#163326]">₹{product.discount_price || product.price}</span>
                                                <span className="text-[10px] text-gray-400 block">/ {product.unit}</span>
                                                {product.price_tier_count > 0 && (
                                                    <span className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-md text-[9px] font-bold">
                                                        <Tags className="w-2.5 h-2.5" /> {product.price_tier_count} tiers
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                <span className="font-bold text-gray-800 block">MOQ: {product.minimum_order_quantity}</span>
                                                <span className="text-[10px] text-gray-500">
                                                    Max: {product.maximum_order_quantity || '—'}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                                    availableStock <= 0 ? 'bg-rose-100 text-rose-800' :
                                                    availableStock < product.minimum_order_quantity ? 'bg-amber-100 text-amber-800' :
                                                    availableStock <= 20 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                                                }`}>
                                                    {availableStock} {product.unit}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                {product.is_active === 1 ? (
                                                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">Active</span>
                                                ) : (
                                                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-gray-200 text-gray-600">Inactive</span>
                                                )}
                                            </td>
                                            <td className="p-4 space-x-1">
                                                {product.is_featured === 1 && <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md text-[9px] font-bold">Featured</span>}
                                                {product.is_best_seller === 1 && <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded-md text-[9px] font-bold">Best Seller</span>}
                                            </td>
                                            <td className="p-4 text-right space-x-2 whitespace-nowrap">
                                                <Link to={`/admin/products/edit/${product.id}`} className="p-1.5 text-gray-600 hover:text-black inline-block" title="Edit">
                                                    <Edit className="w-4 h-4" />
                                                </Link>
                                                {product.is_active === 1 ? (
                                                    <button onClick={() => handleDeactivate(product.id)} className="p-1.5 text-rose-500 hover:text-rose-700" title="Deactivate">
                                                        <Ban className="w-4 h-4" />
                                                    </button>
                                                ) : (
                                                    <button onClick={() => handleReactivate(product.id)} className="p-1.5 text-emerald-600 hover:text-emerald-800" title="Reactivate">
                                                        <RotateCcw className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}