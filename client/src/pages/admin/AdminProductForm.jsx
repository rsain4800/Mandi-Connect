import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ChevronLeft, Upload, Leaf, Plus, Trash2 } from 'lucide-react';
import API from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { resolveMediaUrl } from '../../utils/media';

const UNIT_OPTIONS = [
    { value: 'kg', label: 'kg (Kilogram)' },
    { value: 'gram', label: 'gram' },
    { value: 'quintal', label: 'quintal (100 kg)' },
    { value: 'ton', label: 'ton (1000 kg)' },
    { value: 'piece', label: 'piece' },
    { value: 'dozen', label: 'dozen' },
    { value: 'crate', label: 'crate' },
    { value: 'box', label: 'box' },
    { value: 'bag', label: 'bag' }
];

const emptyTier = () => ({ min_quantity: '', max_quantity: '', price: '' });

export default function AdminProductForm() {
    const { id } = useParams();
    const isEdit = !!id;
    const navigate = useNavigate();
    const { showToast } = useToast();

    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const [form, setForm] = useState({
        name: '',
        sku: '',
        description: '',
        category_id: '',
        subcategory: '',
        brand: 'Mandi Direct',
        price: '',
        discount_price: '',
        available_stock: 100,
        unit: 'kg',
        weight: '1 kg',
        minimum_order_quantity: 1,
        maximum_order_quantity: '',
        grade: '',
        quality: '',
        origin: '',
        origin_district: '',
        origin_mandi: '',
        is_featured: false,
        is_best_seller: false,
        is_active: true
    });

    // Wholesale price tiers — optional. Leave empty for a product that just
    // uses the flat price/discount_price above ("do not break the existing
    // product price system unnecessarily").
    const [priceTiers, setPriceTiers] = useState([]);

    const [imageFiles, setImageFiles] = useState([]);
    const [imagePreviews, setImagePreviews] = useState([]);

    useEffect(() => {
        // Fetch categories
        API.get('/categories')
            .then(res => {
                if (res.data.success) setCategories(res.data.categories);
            });

        if (isEdit) {
            setLoading(true);
            API.get(`/products/${id}`)
                .then(res => {
                    if (res.data.success) {
                        const p = res.data.product;
                        setForm({
                            name: p.name,
                            sku: p.sku,
                            description: p.description || '',
                            category_id: p.category_id,
                            subcategory: p.subcategory || '',
                            brand: p.brand || 'Mandi Direct',
                            price: p.price,
                            discount_price: p.discount_price || '',
                            available_stock: p.available_stock ?? p.stock_quantity,
                            unit: p.unit,
                            weight: p.weight || '',
                            minimum_order_quantity: p.minimum_order_quantity || 1,
                            maximum_order_quantity: p.maximum_order_quantity || '',
                            grade: p.grade || '',
                            quality: p.quality || '',
                            origin: p.origin || '',
                            origin_district: p.origin_district || '',
                            origin_mandi: p.origin_mandi || '',
                            is_featured: p.is_featured === 1,
                            is_best_seller: p.is_best_seller === 1,
                            is_active: p.is_active === 1
                        });
                        if (p.price_tiers && p.price_tiers.length > 0) {
                            setPriceTiers(p.price_tiers.map(t => ({
                                min_quantity: t.min_quantity,
                                max_quantity: t.max_quantity ?? '',
                                price: t.price
                            })));
                        }
                        if (p.thumbnail) setImagePreviews([resolveMediaUrl(p.thumbnail)]);
                    }
                })
                .finally(() => setLoading(false));
        }
    }, [id, isEdit]);

    const handleFileChange = (e) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            setImageFiles(files);
            const previews = files.map(file => URL.createObjectURL(file));
            setImagePreviews(previews);
        }
    };

    const updateTier = (index, field, value) => {
        setPriceTiers(prev => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
    };

    const removeTier = (index) => {
        setPriceTiers(prev => prev.filter((_, i) => i !== index));
    };

    const addTier = () => {
        setPriceTiers(prev => [...prev, emptyTier()]);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // MOQ/max-order-quantity client-side check — UX only, the backend
        // re-validates this regardless (see server/validators/index.js).
        const moq = parseInt(form.minimum_order_quantity, 10);
        const maxOq = form.maximum_order_quantity !== '' ? parseInt(form.maximum_order_quantity, 10) : null;
        if (maxOq !== null && maxOq < moq) {
            showToast('Maximum order quantity cannot be less than the minimum order quantity.', 'error');
            return;
        }

        try {
            setSubmitting(true);
            const formData = new FormData();
            Object.keys(form).forEach(key => {
                formData.append(key, form[key]);
            });
            // Send tiers with blank rows dropped, as JSON — parsed server-side.
            const cleanTiers = priceTiers
                .filter(t => t.min_quantity !== '' && t.price !== '')
                .map(t => ({
                    min_quantity: parseInt(t.min_quantity, 10),
                    max_quantity: t.max_quantity !== '' ? parseInt(t.max_quantity, 10) : null,
                    price: parseFloat(t.price)
                }));
            formData.append('price_tiers', JSON.stringify(cleanTiers));

            imageFiles.forEach(file => {
                formData.append('images', file);
            });

            let res;
            if (isEdit) {
                res = await API.put(`/products/${id}`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            } else {
                res = await API.post('/products', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            }

            if (res.data.success) {
                showToast(isEdit ? 'Product updated successfully!' : 'Product added successfully!', 'success');
                navigate('/admin/products');
            }
        } catch (error) {
            showToast(error.response?.data?.message || 'Error saving product.', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-xs text-gray-500">Loading product form...</div>;

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between border-b border-[#E2DAC8] pb-4">
                <div>
                    <Link to="/admin/products" className="text-xs font-bold text-[#1F4D36] hover:underline flex items-center gap-1 mb-1">
                        <ChevronLeft className="w-4 h-4" /> Back to Inventory
                    </Link>
                    <h1 className="text-2xl font-bold font-serif text-[#163326]">
                        {isEdit ? 'Edit Produce Item' : 'Add New Produce Item'}
                    </h1>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="bg-white p-8 rounded-3xl border border-[#E2DAC8] space-y-6 shadow-xs text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="font-bold text-gray-700 block mb-1">Product Name *</label>
                        <input
                            type="text"
                            required
                            value={form.name}
                            onChange={e => setForm({ ...form, name: e.target.value })}
                            placeholder="Nashik Red Onions"
                            className="w-full p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                        />
                    </div>

                    <div>
                        <label className="font-bold text-gray-700 block mb-1">Category *</label>
                        <select
                            required
                            value={form.category_id}
                            onChange={e => setForm({ ...form, category_id: e.target.value })}
                            className="w-full p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl font-bold"
                        >
                            <option value="">Select Category</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="font-bold text-gray-700 block mb-1">SKU (Auto-generated if empty)</label>
                        <input
                            type="text"
                            value={form.sku}
                            onChange={e => setForm({ ...form, sku: e.target.value })}
                            placeholder="MND-ONN-001"
                            className="w-full p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                        />
                    </div>

                    <div>
                        <label className="font-bold text-gray-700 block mb-1">Brand / Source Mandi</label>
                        <input
                            type="text"
                            value={form.brand}
                            onChange={e => setForm({ ...form, brand: e.target.value })}
                            placeholder="Nashik Mandi Direct"
                            className="w-full p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                        />
                    </div>

                    <div>
                        <label className="font-bold text-gray-700 block mb-1">Regular Price (₹) *</label>
                        <input
                            type="number"
                            step="0.01"
                            required
                            value={form.price}
                            onChange={e => setForm({ ...form, price: e.target.value })}
                            placeholder="3500.00"
                            className="w-full p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                        />
                    </div>

                    <div>
                        <label className="font-bold text-gray-700 block mb-1">Discounted Price (₹)</label>
                        <input
                            type="number"
                            step="0.01"
                            value={form.discount_price}
                            onChange={e => setForm({ ...form, discount_price: e.target.value })}
                            placeholder="3200.00"
                            className="w-full p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                        />
                    </div>

                    <div>
                        <label className="font-bold text-gray-700 block mb-1">Wholesale Unit *</label>
                        <select
                            value={form.unit}
                            onChange={e => setForm({ ...form, unit: e.target.value })}
                            className="w-full p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl font-bold"
                        >
                            {UNIT_OPTIONS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="font-bold text-gray-700 block mb-1">Available Stock *</label>
                        <input
                            type="number"
                            required
                            min="0"
                            value={form.available_stock}
                            onChange={e => setForm({ ...form, available_stock: e.target.value })}
                            className="w-full p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                        />
                    </div>

                    <div>
                        <label className="font-bold text-gray-700 block mb-1">Minimum Order Quantity (MOQ) *</label>
                        <input
                            type="number"
                            required
                            min="1"
                            value={form.minimum_order_quantity}
                            onChange={e => setForm({ ...form, minimum_order_quantity: e.target.value })}
                            placeholder="5"
                            className="w-full p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                        />
                        <p className="text-[10px] text-gray-500 mt-1">Customers can never order less than this, enforced server-side.</p>
                    </div>

                    <div>
                        <label className="font-bold text-gray-700 block mb-1">Maximum Order Quantity</label>
                        <input
                            type="number"
                            min="1"
                            value={form.maximum_order_quantity}
                            onChange={e => setForm({ ...form, maximum_order_quantity: e.target.value })}
                            placeholder="Leave blank for no cap"
                            className="w-full p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                        />
                    </div>

                    <div>
                        <label className="font-bold text-gray-700 block mb-1">Weight / Pack Size Label</label>
                        <input
                            type="text"
                            value={form.weight}
                            onChange={e => setForm({ ...form, weight: e.target.value })}
                            placeholder="1 Quintal (100 kg)"
                            className="w-full p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                        />
                    </div>
                </div>

                {/* Optional wholesale/quality metadata — leave blank for
                    products that don't need it (e.g. packaged groceries). */}
                <div className="pt-2 border-t border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-1.5">
                        <Leaf className="w-3.5 h-3.5 text-emerald-700" /> Quality & Origin (optional)
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label className="font-bold text-gray-700 block mb-1">Grade</label>
                            <input
                                type="text"
                                value={form.grade}
                                onChange={e => setForm({ ...form, grade: e.target.value })}
                                placeholder="A"
                                className="w-full p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                            />
                        </div>
                        <div>
                            <label className="font-bold text-gray-700 block mb-1">Quality</label>
                            <input
                                type="text"
                                value={form.quality}
                                onChange={e => setForm({ ...form, quality: e.target.value })}
                                placeholder="Premium"
                                className="w-full p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                            />
                        </div>
                        <div>
                            <label className="font-bold text-gray-700 block mb-1">Origin (State)</label>
                            <input
                                type="text"
                                value={form.origin}
                                onChange={e => setForm({ ...form, origin: e.target.value })}
                                placeholder="Rajasthan"
                                className="w-full p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                            />
                        </div>
                        <div>
                            <label className="font-bold text-gray-700 block mb-1">Origin District</label>
                            <input
                                type="text"
                                value={form.origin_district}
                                onChange={e => setForm({ ...form, origin_district: e.target.value })}
                                placeholder="Jaipur"
                                className="w-full p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="font-bold text-gray-700 block mb-1">Origin Mandi</label>
                            <input
                                type="text"
                                value={form.origin_mandi}
                                onChange={e => setForm({ ...form, origin_mandi: e.target.value })}
                                placeholder="Muhana Mandi, Jaipur"
                                className="w-full p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                            />
                        </div>
                    </div>
                </div>

                {/* Wholesale Price Tiers */}
                <div className="pt-2 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h3 className="font-bold text-gray-800">Wholesale Price Tiers (optional)</h3>
                            <p className="text-[10px] text-gray-500 mt-0.5">
                                e.g. 5–20 {form.unit} = ₹X, 21–50 {form.unit} = ₹Y, 51+ {form.unit} = ₹Z. Leave empty to use the flat price above.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={addTier}
                            className="flex items-center gap-1 px-3 py-1.5 bg-[#F4EEDD] text-[#163326] font-bold rounded-full text-[11px] hover:bg-[#E2DAC8]"
                        >
                            <Plus className="w-3.5 h-3.5" /> Add Tier
                        </button>
                    </div>

                    {priceTiers.length > 0 && (
                        <div className="space-y-2">
                            <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-[10px] font-bold text-gray-500 px-1">
                                <span>Min Qty ({form.unit})</span>
                                <span>Max Qty (blank = no cap)</span>
                                <span>Price (₹)</span>
                                <span></span>
                            </div>
                            {priceTiers.map((tier, idx) => (
                                <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                                    <input
                                        type="number"
                                        min="1"
                                        value={tier.min_quantity}
                                        onChange={e => updateTier(idx, 'min_quantity', e.target.value)}
                                        placeholder="5"
                                        className="p-2.5 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                                    />
                                    <input
                                        type="number"
                                        min="1"
                                        value={tier.max_quantity}
                                        onChange={e => updateTier(idx, 'max_quantity', e.target.value)}
                                        placeholder="20"
                                        className="p-2.5 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                                    />
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={tier.price}
                                        onChange={e => updateTier(idx, 'price', e.target.value)}
                                        placeholder="3200.00"
                                        className="p-2.5 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeTier(idx)}
                                        className="p-2.5 text-rose-500 hover:text-rose-700"
                                        title="Remove tier"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div>
                    <label className="font-bold text-gray-700 block mb-1">Description</label>
                    <textarea
                        rows="3"
                        value={form.description}
                        onChange={e => setForm({ ...form, description: e.target.value })}
                        placeholder="Detailed produce description..."
                        className="w-full p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                    />
                </div>

                {/* File Upload */}
                <div>
                    <label className="font-bold text-gray-700 block mb-1">Product Images</label>
                    <input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={handleFileChange}
                        className="p-2 bg-[#FBF8F1] border border-gray-200 rounded-xl w-full"
                    />
                    {imagePreviews.length > 0 && (
                        <div className="flex gap-3 mt-3 overflow-x-auto">
                            {imagePreviews.map((src, i) => (
                                <img key={i} src={src} alt="" className="w-16 h-16 object-cover rounded-xl border border-gray-200" />
                            ))}
                        </div>
                    )}
                </div>

                {/* Checkboxes */}
                <div className="flex flex-wrap gap-6 pt-2">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-gray-800">
                        <input
                            type="checkbox"
                            checked={form.is_featured}
                            onChange={e => setForm({ ...form, is_featured: e.target.checked })}
                            className="w-4 h-4 text-[#1F4D36]"
                        />
                        Mark Featured
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-gray-800">
                        <input
                            type="checkbox"
                            checked={form.is_best_seller}
                            onChange={e => setForm({ ...form, is_best_seller: e.target.checked })}
                            className="w-4 h-4 text-[#1F4D36]"
                        />
                        Mark Best Seller
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-gray-800">
                        <input
                            type="checkbox"
                            checked={form.is_active}
                            onChange={e => setForm({ ...form, is_active: e.target.checked })}
                            className="w-4 h-4 text-[#1F4D36]"
                        />
                        Active Status
                    </label>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                    <Link to="/admin/products" className="px-6 py-3 text-gray-500 font-bold">Cancel</Link>
                    <button
                        type="submit"
                        disabled={submitting}
                        className="px-8 py-3 bg-[#1F4D36] text-white font-bold rounded-full hover:bg-[#163326] shadow-md"
                    >
                        {submitting ? 'Saving...' : isEdit ? 'Update Product' : 'Add Product'}
                    </button>
                </div>
            </form>
        </div>
    );
}