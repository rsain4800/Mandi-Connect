import React, { useState, useEffect } from 'react';
import { Truck, ShieldCheck, DollarSign, Clock, MapPin, Save, RefreshCw } from 'lucide-react';
import API from '../../api/client';
import { useToast } from '../../context/ToastContext';

export default function AdminShipping() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { addToast } = useToast();

    const [settings, setSettings] = useState({
        shipping_charge: '40.00',
        free_shipping_threshold: '500.00',
        estimated_delivery_days: '2',
        cod_enabled: 1,
        delivery_areas: 'All major cities and mandis across India'
    });

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const res = await API.get('/shipping');
            if (res.data.success && res.data.settings) {
                setSettings({
                    shipping_charge: res.data.settings.shipping_charge,
                    free_shipping_threshold: res.data.settings.free_shipping_threshold,
                    estimated_delivery_days: res.data.settings.estimated_delivery_days,
                    cod_enabled: res.data.settings.cod_enabled,
                    delivery_areas: res.data.settings.delivery_areas || ''
                });
            }
        } catch (error) {
            addToast('Error loading shipping settings', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setSaving(true);
            const res = await API.put('/shipping', settings);
            if (res.data.success) {
                addToast('Shipping settings updated successfully!', 'success');
            }
        } catch (error) {
            addToast(error.response?.data?.message || 'Failed to update shipping settings', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6 max-w-4xl">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-[#163326]">Shipping & Delivery Configuration</h1>
                <p className="text-sm text-gray-600">Configure delivery charges, free shipping thresholds, estimated timelines, and Cash on Delivery parameters.</p>
            </div>

            {loading ? (
                <div className="p-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-100">
                    <div className="w-8 h-8 border-4 border-[#1F4D36] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                    Loading shipping parameters...
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Shipping Charge */}
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1.5">
                                <DollarSign className="w-4 h-4 text-[#D9760C]" /> Standard Shipping Charge (₹)
                            </label>
                            <input
                                type="number"
                                required
                                step="0.01"
                                min="0"
                                value={settings.shipping_charge}
                                onChange={e => setSettings({ ...settings, shipping_charge: e.target.value })}
                                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#1F4D36]/20 focus:border-[#1F4D36]"
                            />
                            <p className="text-[11px] text-gray-400 mt-1">Flat rate added to orders below free shipping threshold.</p>
                        </div>

                        {/* Free Shipping Threshold */}
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1.5">
                                <Truck className="w-4 h-4 text-[#1F4D36]" /> Free Delivery Threshold (₹)
                            </label>
                            <input
                                type="number"
                                required
                                step="0.01"
                                min="0"
                                value={settings.free_shipping_threshold}
                                onChange={e => setSettings({ ...settings, free_shipping_threshold: e.target.value })}
                                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#1F4D36]/20 focus:border-[#1F4D36]"
                            />
                            <p className="text-[11px] text-gray-400 mt-1">Orders with subtotal above this get ₹0 shipping charge.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Estimated Delivery Days */}
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1.5">
                                <Clock className="w-4 h-4 text-[#D9760C]" /> Estimated Delivery Window (Days)
                            </label>
                            <input
                                type="number"
                                required
                                min="1"
                                value={settings.estimated_delivery_days}
                                onChange={e => setSettings({ ...settings, estimated_delivery_days: e.target.value })}
                                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#1F4D36]/20 focus:border-[#1F4D36]"
                            />
                        </div>

                        {/* COD Toggle */}
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1.5">Cash on Delivery (COD) Availability</label>
                            <div className="flex items-center gap-4 mt-2">
                                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-800">
                                    <input
                                        type="radio"
                                        name="cod"
                                        checked={settings.cod_enabled === 1 || settings.cod_enabled === true}
                                        onChange={() => setSettings({ ...settings, cod_enabled: 1 })}
                                        className="text-[#1F4D36] focus:ring-[#1F4D36]"
                                    /> Enabled
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-800">
                                    <input
                                        type="radio"
                                        name="cod"
                                        checked={settings.cod_enabled === 0 || settings.cod_enabled === false}
                                        onChange={() => setSettings({ ...settings, cod_enabled: 0 })}
                                        className="text-[#1F4D36] focus:ring-[#1F4D36]"
                                    /> Disabled (Online Only)
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Delivery Areas */}
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1.5">
                            <MapPin className="w-4 h-4 text-emerald-600" /> Serviceable Delivery Locations & Mandis
                        </label>
                        <textarea
                            rows={3}
                            value={settings.delivery_areas}
                            onChange={e => setSettings({ ...settings, delivery_areas: e.target.value })}
                            placeholder="Specify towns, districts, or mandis serviced..."
                            className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#1F4D36]/20 focus:border-[#1F4D36]"
                        />
                    </div>

                    <div className="pt-4 border-t border-gray-100 flex justify-end">
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex items-center gap-2 px-6 py-2.5 bg-[#1F4D36] text-white hover:bg-[#163326] rounded-xl text-xs font-bold transition-all shadow-md hover:shadow-lg disabled:opacity-50"
                        >
                            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Save Shipping Configuration
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}
