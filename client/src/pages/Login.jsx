import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Leaf, Mail, Lock, ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function Login() {
    const { loginCustomer } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const location = useLocation();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const from = location.state?.from?.pathname || '/';

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setLoading(true);
            const res = await loginCustomer(email, password);
            if (res.success) {
                showToast('Welcome back to Mandi Connect!', 'success');
                navigate(from, { replace: true });
            }
        } catch (error) {
            showToast(error.response?.data?.message || 'Invalid email or password.', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-[75vh] flex items-center justify-center px-4 py-12">
            <div className="w-full max-w-md bg-white p-8 rounded-3xl border border-[#E2DAC8] shadow-xl space-y-6">
                <div className="text-center space-y-2">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#163326] to-[#2E6B4D] text-white flex items-center justify-center mx-auto shadow-md">
                        <Leaf className="w-7 h-7 text-emerald-400" />
                    </div>
                    <h1 className="text-2xl font-bold font-serif text-[#163326]">Customer Login</h1>
                    <p className="text-xs text-gray-500">Sign in to your Mandi Connect customer account</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                    <div>
                        <label className="font-bold text-gray-700 block mb-1">Email Address</label>
                        <div className="relative">
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="name@example.com"
                                required
                                className="w-full p-3 pl-10 bg-[#FBF8F1] border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1F4D36]"
                            />
                            <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-3.5" />
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="font-bold text-gray-700">Password</label>
                            <Link to="/forgot-password" className="text-[11px] text-[#1F4D36] hover:underline">Forgot password?</Link>
                        </div>
                        <div className="relative">
                            <input
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                className="w-full p-3 pl-10 bg-[#FBF8F1] border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1F4D36]"
                            />
                            <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-3.5" />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3.5 bg-[#1F4D36] hover:bg-[#163326] text-white font-bold text-xs rounded-full shadow-md transition-all flex items-center justify-center gap-2"
                    >
                        {loading ? 'Signing In...' : 'Log In to Account'} <ArrowRight className="w-4 h-4" />
                    </button>
                </form>

                <div className="text-center text-xs text-gray-500 pt-2 border-t border-gray-100">
                    Don't have an account?{' '}
                    <Link to="/register" className="font-bold text-[#1F4D36] hover:underline">
                        Register Now
                    </Link>
                </div>
            </div>
        </div>
    );
}
