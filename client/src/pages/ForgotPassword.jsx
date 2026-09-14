import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowRight, CheckCircle2 } from 'lucide-react';
import API from '../api/client';
import { useToast } from '../context/ToastContext';

export default function ForgotPassword() {
    const { showToast } = useToast();
    const [email, setEmail] = useState('');
    const [sentToken, setSentToken] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setLoading(true);
            const res = await API.post('/auth/forgot-password', { email });
            if (res.data.success) {
                setSentToken(res.data.resetToken);
                showToast(res.data.message, 'success');
            }
        } catch (error) {
            showToast(error.response?.data?.message || 'Error processing request.', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
            <div className="w-full max-w-md bg-white p-8 rounded-3xl border border-[#E2DAC8] shadow-xl space-y-6">
                <div className="text-center space-y-2">
                    <h1 className="text-2xl font-bold font-serif text-[#163326]">Forgot Password</h1>
                    <p className="text-xs text-gray-500">Enter your email to receive password reset instructions</p>
                </div>

                {!sentToken ? (
                    <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                        <div>
                            <label className="font-bold text-gray-700 block mb-1">Email Address</label>
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                                placeholder="name@example.com"
                                className="w-full p-3 bg-[#FBF8F1] border border-gray-200 rounded-xl"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3.5 bg-[#1F4D36] text-white font-bold text-xs rounded-full shadow-md hover:bg-[#163326]"
                        >
                            {loading ? 'Sending Request...' : 'Send Reset Instructions'}
                        </button>
                    </form>
                ) : (
                    <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-3 text-xs text-emerald-900">
                        <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                        <p className="font-bold text-center">Reset Instructions Dispatched!</p>
                        <p className="text-[11px] text-gray-600">
                            Use this reset link to set your new password:
                        </p>
                        <Link
                            to={`/reset-password?token=${sentToken}`}
                            className="block p-2 bg-white rounded-lg text-center font-mono font-bold text-[#1F4D36] border border-emerald-300 hover:bg-emerald-100"
                        >
                            Proceed to Reset Password
                        </Link>
                    </div>
                )}

                <div className="text-center text-xs">
                    <Link to="/login" className="text-gray-500 hover:underline">Back to Login</Link>
                </div>
            </div>
        </div>
    );
}
