import React, { useState } from 'react';
import { User, Phone, Mail, Camera, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import API from '../api/client';

export default function Profile() {
    const { user, updateUserState } = useAuth();
    const { showToast } = useToast();

    const [fullName, setFullName] = useState(user?.full_name || '');
    const [phone, setPhone] = useState(user?.phone || '');
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(user?.profile_image || null);
    const [updating, setUpdating] = useState(false);

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const handleProfileSubmit = async (e) => {
        e.preventDefault();
        try {
            setUpdating(true);
            const formData = new FormData();
            formData.append('full_name', fullName);
            formData.append('phone', phone);
            if (imageFile) {
                formData.append('profile_image', imageFile);
            }

            const res = await API.put('/auth/profile', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (res.data.success) {
                showToast(res.data.message, 'success');
                updateUserState(res.data.user);
            }
        } catch (error) {
            showToast('Error updating profile.', 'error');
        } finally {
            setUpdating(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
            <h1 className="text-3xl font-bold font-serif text-[#163326] border-b border-[#E2DAC8] pb-4">
                Account & Profile Management
            </h1>

            <form onSubmit={handleProfileSubmit} className="bg-white p-8 rounded-3xl border border-[#E2DAC8] space-y-6 shadow-xs">
                {/* Profile Image Avatar */}
                <div className="flex flex-col items-center gap-3">
                    <div className="relative w-24 h-24 rounded-full bg-[#163326] text-white font-bold text-2xl flex items-center justify-center overflow-hidden shadow-md">
                        {imagePreview ? (
                            <img src={imagePreview} alt="" className="w-full h-full object-cover" />
                        ) : (
                            user?.full_name?.charAt(0).toUpperCase()
                        )}
                        <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 cursor-pointer transition-opacity">
                            <Camera className="w-6 h-6 text-white" />
                            <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                        </label>
                    </div>
                    <span className="text-xs text-gray-500 font-medium">Click image to upload profile photo</span>
                </div>

                {/* Form Fields */}
                <div className="space-y-4 text-xs">
                    <div>
                        <label className="font-bold text-gray-700 block mb-1">Full Name</label>
                        <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            required
                            className="w-full p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1F4D36]"
                        />
                    </div>

                    <div>
                        <label className="font-bold text-gray-700 block mb-1">Email Address (Read Only)</label>
                        <input
                            type="email"
                            value={user?.email || ''}
                            disabled
                            className="w-full p-3 bg-gray-100 border border-gray-200 rounded-xl text-gray-500 cursor-not-allowed"
                        />
                    </div>

                    <div>
                        <label className="font-bold text-gray-700 block mb-1">Phone Number</label>
                        <input
                            type="text"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="Enter 10 digit phone number"
                            className="w-full p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1F4D36]"
                        />
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={updating}
                    className="w-full py-3 bg-[#1F4D36] hover:bg-[#163326] text-white font-bold text-xs rounded-full shadow-md transition-all"
                >
                    {updating ? 'Saving Changes...' : 'Save Profile Changes'}
                </button>
            </form>
        </div>
    );
}
