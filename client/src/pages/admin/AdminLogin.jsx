import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Lock, Mail, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export default function AdminLogin() {
    const { loginAdmin } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setLoading(true);
            const res = await loginAdmin(email, password);
            if (res.success) {
                showToast('Single Admin authentication successful. Welcome!', 'success');
                navigate('/admin/dashboard');
            }
        } catch (error) {
            showToast(error.response?.data?.message || 'Invalid admin credentials.', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#163326] flex items-center justify-center px-4 py-12">
            <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-2xl space-y-6">
                <div className="text-center space-y-2">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#D9760C] to-[#B25F06] text-white flex items-center justify-center mx-auto shadow-lg">
                        <Shield className="w-8 h-8" />
                    </div>
                    <h1 className="text-2xl font-bold font-serif text-[#163326]">Mandi Connect Single Admin Portal</h1>
                    <p className="text-xs text-gray-500">Restricted access portal for single authorized administrator</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                    <div>
                        <label className="font-bold text-gray-700 block mb-1">Admin Email Address</label>
                        <div className="relative">
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="admin@mandiconnect.com"
                                required
                                className="w-full p-3 pl-10 bg-[#FBF8F1] border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1F4D36]"
                            />
                            <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-3.5" />
                        </div>
                    </div>

                    <div>
                        <label className="font-bold text-gray-700 block mb-1">Admin Security Password</label>
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
                        className="w-full py-3.5 bg-[#D9760C] hover:bg-[#B25F06] text-white font-bold text-xs rounded-full shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                        {loading ? 'Authenticating Admin...' : 'Authenticate Admin Login'} <ArrowRight className="w-4 h-4" />
                    </button>
                </form>

                <div className="text-center text-[11px] text-gray-400 pt-2 border-t border-gray-100">
                    Protected by JWT security & single admin role authorization.
                </div>
            </div>
        </div>
    );
}
