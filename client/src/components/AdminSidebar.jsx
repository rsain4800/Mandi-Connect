import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard,
    Package,
    FolderTree,
    ShoppingBag,
    Users,
    Ticket,
    Star,
    Truck,
    Settings,
    BarChart3,
    LogOut,
    Leaf,
    Shield,
    FileText
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AdminSidebar() {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, logout } = useAuth();

    const menuItems = [
        { path: '/admin/dashboard', label: 'Dashboard Overview', icon: LayoutDashboard },
        { path: '/admin/products', label: 'Product Inventory', icon: Package },
        { path: '/admin/categories', label: 'Category Master', icon: FolderTree },
        { path: '/admin/orders', label: 'Order Fulfillment Hub', icon: ShoppingBag },
        { path: '/admin/customers', label: 'Customer Management', icon: Users },
        { path: '/admin/coupons', label: 'Promotional Coupons', icon: Ticket },
        { path: '/admin/reviews', label: 'Verified Buyer Reviews', icon: Star },
        { path: '/admin/shipping', label: 'Shipping & Delivery', icon: Truck },
        { path: '/admin/invoices', label: 'Invoice Records', icon: FileText },
        { path: '/admin/reports', label: 'Analytics & Reports', icon: BarChart3 },
        { path: '/admin/settings', label: 'Platform Settings', icon: Settings }
    ];

    return (
        <aside className="w-64 bg-[#163326] text-gray-300 min-h-screen flex flex-col justify-between p-4 shrink-0 shadow-2xl border-r border-emerald-950">
            <div>
                {/* Brand Header */}
                <div className="flex items-center gap-3 px-3 py-4 border-b border-emerald-900/60 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#D9760C] to-[#B25F06] flex items-center justify-center text-white font-bold shadow-md">
                        <Leaf className="w-5 h-5 text-amber-100" />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-white font-serif tracking-tight leading-none">
                            Mandi<span className="text-[#D9760C]">Admin</span>
                        </h2>
                        <span className="text-[10px] text-emerald-400 font-semibold tracking-wider uppercase flex items-center gap-1 mt-1">
                            <Shield className="w-3 h-3 text-amber-400" /> Single Admin Portal
                        </span>
                    </div>
                </div>

                {/* Navigation Links */}
                <nav className="space-y-1">
                    {menuItems.map(item => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.path || (item.path !== '/admin/dashboard' && location.pathname.startsWith(item.path));
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                                    isActive
                                        ? 'bg-[#1F4D36] text-white shadow-sm font-bold border-l-4 border-[#D9760C]'
                                        : 'text-gray-300 hover:bg-emerald-900/50 hover:text-white'
                                }`}
                            >
                                <Icon className={`w-4 h-4 ${isActive ? 'text-amber-400' : 'text-gray-400'}`} />
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>
            </div>

            {/* Admin Profile & Logout */}
            <div className="pt-4 border-t border-emerald-900/60">
                <div className="px-3 py-2 mb-2 bg-emerald-950/60 rounded-xl flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-500 text-white font-bold text-xs flex items-center justify-center">
                        A
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white truncate">{user?.full_name || 'Admin User'}</p>
                        <p className="text-[10px] text-gray-400 truncate">{user?.email}</p>
                    </div>
                </div>

                <button
                    onClick={() => {
                        logout();
                        navigate('/admin/login');
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-rose-300 bg-rose-950/40 hover:bg-rose-900/60 rounded-xl transition-colors border border-rose-900/40"
                >
                    <LogOut className="w-4 h-4" /> Secure Admin Logout
                </button>
            </div>
        </aside>
    );
}
