import React, { useState, useEffect } from 'react';
import { MapPin, Plus, Trash2, Edit, Check } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import API from '../api/client';

export default function Addresses() {
    const { showToast } = useToast();
    const [addresses, setAddresses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);

    const [form, setForm] = useState({
        full_name: '',
        phone: '',
        house_building: '',
        street: '',
        area: '',
        city: '',
        state: '',
        pincode: '',
        landmark: '',
        address_type: 'home',
        is_default: false
    });

    const fetchAddresses = async () => {
        try {
            setLoading(true);
            const res = await API.get('/addresses');
            if (res.data.success) {
                setAddresses(res.data.addresses);
            }
        } catch (error) {
            console.error('Fetch addresses error:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAddresses();
    }, []);

    const resetForm = () => {
        setForm({
            full_name: '',
            phone: '',
            house_building: '',
            street: '',
            area: '',
            city: '',
            state: '',
            pincode: '',
            landmark: '',
            address_type: 'home',
            is_default: false
        });
        setEditingId(null);
        setShowForm(false);
    };

    const handleEditClick = (addr) => {
        setForm(addr);
        setEditingId(addr.id);
        setShowForm(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingId) {
                await API.put(`/addresses/${editingId}`, form);
                showToast('Address updated!', 'success');
            } else {
                await API.post('/addresses', form);
                showToast('Address added!', 'success');
            }
            resetForm();
            await fetchAddresses();
        } catch (error) {
            showToast('Error saving address.', 'error');
        }
    };

    const handleDelete = async (id) => {
        try {
            await API.delete(`/addresses/${id}`);
            showToast('Address deleted.', 'info');
            await fetchAddresses();
        } catch (error) {
            showToast('Error deleting address.', 'error');
        }
    };

    const handleSetDefault = async (id) => {
        try {
            await API.put(`/addresses/${id}/default`);
            showToast('Default address updated!', 'success');
            await fetchAddresses();
        } catch (error) {
            showToast('Error setting default address.', 'error');
        }
    };

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
            <div className="flex items-center justify-between border-b border-[#E2DAC8] pb-4">
                <h1 className="text-3xl font-bold font-serif text-[#163326]">Saved Delivery Addresses</h1>
                <button
                    onClick={() => { resetForm(); setShowForm(!showForm); }}
                    className="px-4 py-2 bg-[#1F4D36] text-white font-bold text-xs rounded-full flex items-center gap-1.5 shadow-xs hover:bg-[#163326]"
                >
                    <Plus className="w-4 h-4" /> Add Address
                </button>
            </div>

            {/* Address Form Drawer/Modal */}
            {showForm && (
                <form onSubmit={handleSubmit} className="p-6 bg-white rounded-3xl border border-[#E2DAC8] shadow-md space-y-4 text-xs">
                    <h3 className="text-base font-bold text-[#163326] font-serif">
                        {editingId ? 'Edit Address' : 'Add New Delivery Address'}
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                            type="text"
                            placeholder="Full Name"
                            required
                            value={form.full_name}
                            onChange={e => setForm({ ...form, full_name: e.target.value })}
                            className="p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                        />
                        <input
                            type="text"
                            placeholder="Phone Number"
                            required
                            value={form.phone}
                            onChange={e => setForm({ ...form, phone: e.target.value })}
                            className="p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                        />
                        <input
                            type="text"
                            placeholder="House / Building / Apartment"
                            required
                            value={form.house_building}
                            onChange={e => setForm({ ...form, house_building: e.target.value })}
                            className="p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                        />
                        <input
                            type="text"
                            placeholder="Street / Road"
                            required
                            value={form.street}
                            onChange={e => setForm({ ...form, street: e.target.value })}
                            className="p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                        />
                        <input
                            type="text"
                            placeholder="Area / Sector"
                            required
                            value={form.area}
                            onChange={e => setForm({ ...form, area: e.target.value })}
                            className="p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                        />
                        <input
                            type="text"
                            placeholder="City"
                            required
                            value={form.city}
                            onChange={e => setForm({ ...form, city: e.target.value })}
                            className="p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                        />
                        <input
                            type="text"
                            placeholder="State"
                            required
                            value={form.state}
                            onChange={e => setForm({ ...form, state: e.target.value })}
                            className="p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                        />
                        <input
                            type="text"
                            placeholder="Pincode"
                            required
                            value={form.pincode}
                            onChange={e => setForm({ ...form, pincode: e.target.value })}
                            className="p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                        />
                        <input
                            type="text"
                            placeholder="Landmark (Optional)"
                            value={form.landmark || ''}
                            onChange={e => setForm({ ...form, landmark: e.target.value })}
                            className="sm:col-span-2 p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                        />
                        <div className="sm:col-span-2 flex items-center justify-between pt-2">
                            <select
                                value={form.address_type}
                                onChange={e => setForm({ ...form, address_type: e.target.value })}
                                className="p-2 bg-[#FBF8F1] border border-gray-200 rounded-xl font-bold"
                            >
                                <option value="home">Home</option>
                                <option value="work">Work</option>
                                <option value="other">Other</option>
                            </select>

                            <div className="flex gap-2">
                                <button type="button" onClick={resetForm} className="px-4 py-2 text-gray-500 font-bold">Cancel</button>
                                <button type="submit" className="px-6 py-2 bg-[#1F4D36] text-white font-bold rounded-full">Save Address</button>
                            </div>
                        </div>
                    </div>
                </form>
            )}

            {/* Address Cards List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {addresses.map(addr => (
                    <div key={addr.id} className="bg-white p-5 rounded-3xl border border-[#E2DAC8] space-y-3 relative shadow-xs">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                                <MapPin className="w-4 h-4 text-[#D9760C]" /> {addr.full_name}
                            </span>
                            <div className="flex items-center gap-2">
                                {addr.is_default ? (
                                    <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full uppercase">
                                        Default
                                    </span>
                                ) : (
                                    <button
                                        onClick={() => handleSetDefault(addr.id)}
                                        className="text-[10px] text-gray-500 hover:text-black underline"
                                    >
                                        Set Default
                                    </button>
                                )}
                                <span className="px-2 py-0.5 bg-[#F4EEDD] text-[#163326] text-[10px] font-bold rounded-full uppercase">
                                    {addr.address_type}
                                </span>
                            </div>
                        </div>

                        <p className="text-xs text-gray-600 leading-relaxed">
                            {addr.house_building}, {addr.street}, {addr.area}, {addr.city}, {addr.state} - {addr.pincode}
                        </p>
                        <p className="text-xs font-bold text-gray-500">Phone: {addr.phone}</p>

                        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                            <button onClick={() => handleEditClick(addr)} className="p-1.5 text-gray-500 hover:text-black">
                                <Edit className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDelete(addr.id)} className="p-1.5 text-rose-500 hover:text-rose-700">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
