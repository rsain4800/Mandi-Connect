import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, ArrowRight } from 'lucide-react';
import API from '../api/client';
import { useToast } from '../context/ToastContext';

export default function ResetPassword() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const navigate = useNavigate();
    const { showToast } = useToast();

    const [newPassword, setNewPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setLoading(true);
            const res = await API.post('/auth/reset-password', {
                resetToken: token,
                newPassword
            });
            if (res.data.success) {
                showToast('Password reset successfully! Please log in.', 'success');
                navigate('/login');
            }
        } catch (error) {
            showToast(error.response?.data?.message || 'Password reset failed.', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
            <div className="w-full max-w-md bg-white p-8 rounded-3xl border border-[#E2DAC8] shadow-xl space-y-6">
                <div className="text-center space-y-2">
                    <h1 className="text-2xl font-bold font-serif text-[#163326]">Reset Your Password</h1>
                    <p className="text-xs text-gray-500">Enter your new secure account password</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                    <div>
                        <label className="font-bold text-gray-700 block mb-1">New Password</label>
                        <input
                            type="password"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            required
                            minLength={6}
                            placeholder="At least 6 characters"
                            className="w-full p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3.5 bg-[#1F4D36] text-white font-bold text-xs rounded-full shadow-md hover:bg-[#163326]"
                    >
                        {loading ? 'Updating Password...' : 'Reset Password'}
                    </button>
                </form>
            </div>
        </div>
    );
}
