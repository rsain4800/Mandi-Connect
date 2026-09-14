import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, FolderTree } from 'lucide-react';
import API from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { resolveMediaUrl, DEFAULT_CATEGORY_IMAGE } from '../../utils/media';

export default function AdminCategories() {
    const { showToast } = useToast();
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);

    const [form, setForm] = useState({ name: '', slug: '', description: '' });
    const [imageFile, setImageFile] = useState(null);

    const fetchCategories = async () => {
        try {
            setLoading(true);
            const res = await API.get('/categories');
            if (res.data.success) setCategories(res.data.categories);
        } catch (error) {
            console.error('Fetch categories error:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCategories();
    }, []);

    const resetForm = () => {
        setForm({ name: '', slug: '', description: '' });
        setImageFile(null);
        setEditingId(null);
        setShowForm(false);
    };

    const handleEditClick = (cat) => {
        setForm({ name: cat.name, slug: cat.slug, description: cat.description || '' });
        setEditingId(cat.id);
        setShowForm(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const formData = new FormData();
            formData.append('name', form.name);
            formData.append('slug', form.slug);
            formData.append('description', form.description);
            if (imageFile) formData.append('image', imageFile);

            if (editingId) {
                await API.put(`/categories/${editingId}`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                showToast('Category updated!', 'success');
            } else {
                await API.post('/categories', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                showToast('Category created!', 'success');
            }
            resetForm();
            fetchCategories();
        } catch (error) {
            showToast('Error saving category.', 'error');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete category?')) return;
        try {
            await API.delete(`/categories/${id}`);
            showToast('Category deleted.', 'info');
            fetchCategories();
        } catch (error) {
            showToast('Error deleting category.', 'error');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-[#E2DAC8] pb-4">
                <div>
                    <h1 className="text-2xl font-bold font-serif text-[#163326]">Category Master System</h1>
                    <p className="text-xs text-gray-500">Organize produce categories and upload category banners</p>
                </div>
                <button
                    onClick={() => { resetForm(); setShowForm(!showForm); }}
                    className="px-5 py-2.5 bg-[#1F4D36] text-white font-bold text-xs rounded-full flex items-center gap-1.5 shadow-md"
                >
                    <Plus className="w-4 h-4" /> Add New Category
                </button>
            </div>

            {/* Form */}
            {showForm && (
                <form onSubmit={handleSubmit} className="bg-white p-6 rounded-3xl border border-[#E2DAC8] space-y-4 text-xs shadow-md">
                    <h3 className="text-sm font-bold text-gray-900 font-serif">{editingId ? 'Edit Category' : 'Create Category'}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <input
                            type="text"
                            placeholder="Category Name (e.g. Leafy Vegetables)"
                            required
                            value={form.name}
                            onChange={e => setForm({ ...form, name: e.target.value })}
                            className="p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                        />
                        <input
                            type="text"
                            placeholder="Slug (optional)"
                            value={form.slug}
                            onChange={e => setForm({ ...form, slug: e.target.value })}
                            className="p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                        />
                        <input
                            type="text"
                            placeholder="Short Description"
                            value={form.description}
                            onChange={e => setForm({ ...form, description: e.target.value })}
                            className="sm:col-span-2 p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                        />
                        <div className="sm:col-span-2">
                            <label className="font-bold text-gray-700 block mb-1">Category Image File</label>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={e => setImageFile(e.target.files[0])}
                                className="p-2 bg-[#FBF8F1] border border-gray-200 rounded-xl w-full"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={resetForm} className="px-4 py-2 text-gray-500 font-bold">Cancel</button>
                        <button type="submit" className="px-6 py-2 bg-[#1F4D36] text-white font-bold rounded-full">Save Category</button>
                    </div>
                </form>
            )}

            {/* Categories Table */}
            <div className="bg-white rounded-3xl border border-[#E2DAC8] overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs">
                    <thead className="bg-[#F4EEDD] text-[#163326] font-bold uppercase">
                        <tr>
                            <th className="p-4">Category Name</th>
                            <th className="p-4">Slug</th>
                            <th className="p-4">Description</th>
                            <th className="p-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {categories.map(cat => (
                            <tr key={cat.id} className="hover:bg-[#FBF8F1]">
                                <td className="p-4 font-bold text-gray-900 flex items-center gap-3">
                                    {cat.image ? (
                                        <img
                                            src={resolveMediaUrl(cat.image)}
                                            alt=""
                                            className="w-8 h-8 rounded-lg object-cover bg-gray-100"
                                            onError={(e) => {
                                                e.currentTarget.src = DEFAULT_CATEGORY_IMAGE;
                                            }}
                                        />
                                    ) : (
                                        <FolderTree className="w-5 h-5 text-[#1F4D36]" />
                                    )}
                                    {cat.name}
                                </td>
                                <td className="p-4 text-gray-500 font-mono">{cat.slug}</td>
                                <td className="p-4 text-gray-600 max-w-xs truncate">{cat.description || 'N/A'}</td>
                                <td className="p-4 text-right space-x-2">
                                    <button onClick={() => handleEditClick(cat)} className="p-1.5 text-gray-600 hover:text-black">
                                        <Edit className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDelete(cat.id)} className="p-1.5 text-rose-500 hover:text-rose-700">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
