import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Search, ShoppingBag, Heart, User, LogOut, Menu, X, ChevronDown, Leaf, ShieldCheck, Truck, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { resolveMediaUrl } from '../utils/media';
import API from '../api/client';

export default function Navbar() {
    const { user, isAuthenticated, isAdmin, logout } = useAuth();
    const { cartCount } = useCart();
    const { wishlistCount } = useWishlist();
    const navigate = useNavigate();
    const location = useLocation();

    const [searchQuery, setSearchQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [categories, setCategories] = useState([]);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isProfileOpen, setIsProfileOpen] = useState(false);

    const searchRef = useRef(null);

    // Fetch categories for dropdown
    useEffect(() => {
        API.get('/categories')
            .then(res => {
                if (res.data.success) {
                    setCategories(res.data.categories);
                }
            })
            .catch(() => {});
    }, []);

    // Live search autocomplete debounced
    useEffect(() => {
        if (searchQuery.trim().length >= 2) {
            const timer = setTimeout(() => {
                API.get(`/products/suggestions?q=${encodeURIComponent(searchQuery)}`)
                    .then(res => {
                        if (res.data.success) {
                            setSuggestions(res.data.suggestions);
                            setShowSuggestions(true);
                        }
                    })
                    .catch(() => {});
            }, 300);
            return () => clearTimeout(timer);
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
        }
    }, [searchQuery]);

    // Close click outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (searchRef.current && !searchRef.current.contains(e.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            setShowSuggestions(false);
            navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
        }
    };

    return (
        <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#E2DAC8] shadow-xs">
            {/* Top Announcement Bar */}
            <div className="bg-[#163326] text-amber-200 text-xs py-1.5 px-4 text-center font-medium flex items-center justify-center gap-4 overflow-x-auto">
                <span className="flex items-center gap-1.5 shrink-0">
                    <Leaf className="w-3.5 h-3.5 text-emerald-400" /> Direct Mandi Pricing – Fresh Produce Daily!
                </span>
                <span className="hidden md:inline text-emerald-600">•</span>
                <span className="hidden md:flex items-center gap-1.5 shrink-0">
                    <Truck className="w-3.5 h-3.5 text-amber-400" /> Free Delivery on Mandi Orders above ₹500
                </span>
                <span className="hidden md:inline text-emerald-600">•</span>
                <span className="hidden lg:flex items-center gap-1.5 shrink-0">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> 100% Verified Buyer Guarantee
                </span>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-20 gap-4">
                    {/* Brand Logo */}
                    <Link to="/" className="flex items-center gap-3 shrink-0 group">
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#163326] to-[#2E6B4D] flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform duration-300">
                            <Leaf className="w-6 h-6 text-emerald-400" />
                        </div>
                        <div>
                            <span className="text-2xl font-bold tracking-tight text-[#163326] font-serif block leading-none">
                                Mandi<span className="text-[#D9760C]">Connect</span>
                            </span>
                            <span className="text-[10px] text-gray-500 font-medium tracking-wider uppercase">
                                Fresh Produce Direct
                            </span>
                        </div>
                    </Link>

                    {/* Search Bar with Autocomplete */}
                    <div ref={searchRef} className="relative flex-1 max-w-xl hidden md:block">
                        <form onSubmit={handleSearchSubmit} className="relative">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onFocus={() => searchQuery.length >= 2 && setShowSuggestions(true)}
                                placeholder="Search onions, potatoes, mangoes, spinach, rice, SKU..."
                                className="w-full bg-[#FBF8F1] border border-[#E2DAC8] rounded-full py-2.5 pl-5 pr-12 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1F4D36] focus:border-transparent transition-all shadow-inner"
                            />
                            <button
                                type="submit"
                                className="absolute right-1.5 top-1.5 bottom-1.5 px-4 bg-[#1F4D36] text-white rounded-full flex items-center justify-center hover:bg-[#163326] transition-colors"
                            >
                                <Search className="w-4 h-4" />
                            </button>
                        </form>

                        {/* Search Autocomplete Suggestions Dropdown */}
                        {showSuggestions && suggestions.length > 0 && (
                            <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50 divide-y divide-gray-50">
                                <div className="p-2 bg-[#FBF8F1] text-xs font-semibold text-gray-500 tracking-wider uppercase px-4">
                                    Product Suggestions
                                </div>
                                {suggestions.map(item => (
                                    <div
                                        key={item.id}
                                        onClick={() => {
                                            setShowSuggestions(false);
                                            setSearchQuery('');
                                            navigate(`/products/${item.slug}`);
                                        }}
                                        className="flex items-center gap-3 p-3 hover:bg-[#F4EEDD]/50 cursor-pointer transition-colors"
                                    >
                                        <img
                                            src={resolveMediaUrl(item.thumbnail) || 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=100'}
                                            alt={item.name}
                                            className="w-10 h-10 object-cover rounded-lg bg-gray-100 shrink-0"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-gray-800 truncate">{item.name}</p>
                                            <p className="text-xs text-gray-500">{item.category_name} • {item.unit}</p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <span className="text-sm font-bold text-[#1F4D36]">
                                                ₹{item.discount_price || item.price}
                                            </span>
                                            {item.discount_price && (
                                                <span className="text-xs text-gray-400 line-through block">
                                                    ₹{item.price}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Nav Actions */}
                    <div className="flex items-center gap-2 sm:gap-4">
                        {/* Wishlist Icon */}
                        {(!user || user.role === 'customer') && (
                            <Link
                                to="/wishlist"
                                className="relative p-2.5 text-gray-700 hover:text-[#1F4D36] hover:bg-[#F4EEDD]/50 rounded-full transition-all"
                                title="Wishlist"
                            >
                                <Heart className="w-5 h-5" />
                                {wishlistCount > 0 && (
                                    <span className="absolute top-1 right-1 w-4 h-4 bg-rose-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                                        {wishlistCount}
                                    </span>
                                )}
                            </Link>
                        )}

                        {/* Cart Icon */}
                        {(!user || user.role === 'customer') && (
                            <Link
                                to="/cart"
                                className="relative p-2.5 text-gray-700 hover:text-[#1F4D36] hover:bg-[#F4EEDD]/50 rounded-full transition-all flex items-center gap-2"
                                title="Shopping Cart"
                            >
                                <div className="relative">
                                    <ShoppingBag className="w-5 h-5" />
                                    {cartCount > 0 && (
                                        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#D9760C] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                                            {cartCount}
                                        </span>
                                    )}
                                </div>
                                <span className="hidden lg:inline text-xs font-semibold text-[#163326]">Cart</span>
                            </Link>
                        )}

                        {/* Profile & Auth Menu */}
                        {isAuthenticated ? (
                            <div className="relative">
                                <button
                                    onClick={() => setIsProfileOpen(!isProfileOpen)}
                                    className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 bg-[#F4EEDD]/60 hover:bg-[#F4EEDD] border border-[#E2DAC8] rounded-full transition-colors"
                                >
                                    <div className="w-8 h-8 rounded-full bg-[#163326] text-white font-bold text-xs flex items-center justify-center overflow-hidden">
                                        {user.profile_image ? (
                                            <img src={user.profile_image} alt={user.full_name} className="w-full h-full object-cover" />
                                        ) : (
                                            user.full_name?.charAt(0).toUpperCase()
                                        )}
                                    </div>
                                    <span className="text-xs font-bold text-gray-800 hidden sm:inline max-w-[100px] truncate">
                                        {user.full_name}
                                    </span>
                                    <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                                </button>

                                {isProfileOpen && (
                                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50">
                                        <div className="px-4 py-2.5 border-b border-gray-100">
                                            <p className="text-xs font-bold text-gray-900 truncate">{user.full_name}</p>
                                            <p className="text-[11px] text-gray-500 truncate">{user.email}</p>
                                            <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-emerald-100 text-emerald-800">
                                                {user.role}
                                            </span>
                                        </div>

                                        {isAdmin ? (
                                            <Link
                                                to="/admin/dashboard"
                                                onClick={() => setIsProfileOpen(false)}
                                                className="flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-[#F4EEDD]/50 transition-colors"
                                            >
                                                <Sparkles className="w-4 h-4 text-[#D9760C]" /> Admin Dashboard
                                            </Link>
                                        ) : (
                                            <>
                                                <Link
                                                    to="/profile"
                                                    onClick={() => setIsProfileOpen(false)}
                                                    className="flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-[#F4EEDD]/50 transition-colors"
                                                >
                                                    <User className="w-4 h-4 text-gray-500" /> Profile & Account
                                                </Link>
                                                <Link
                                                    to="/orders"
                                                    onClick={() => setIsProfileOpen(false)}
                                                    className="flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-[#F4EEDD]/50 transition-colors"
                                                >
                                                    <ShoppingBag className="w-4 h-4 text-gray-500" /> My Orders & Tracking
                                                </Link>
                                            </>
                                        )}

                                        <button
                                            onClick={() => {
                                                setIsProfileOpen(false);
                                                logout();
                                                navigate('/');
                                            }}
                                            className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors border-t border-gray-100 mt-1"
                                        >
                                            <LogOut className="w-4 h-4" /> Logout
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <Link
                                    to="/login"
                                    className="px-4 py-2 text-xs font-bold text-[#163326] hover:bg-[#F4EEDD]/60 rounded-full transition-colors"
                                >
                                    Log In
                                </Link>
                                <Link
                                    to="/register"
                                    className="px-4 py-2 text-xs font-bold text-white bg-[#1F4D36] hover:bg-[#163326] rounded-full shadow-xs transition-all"
                                >
                                    Register
                                </Link>
                            </div>
                        )}

                        {/* Mobile Menu Button */}
                        <button
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className="p-2 md:hidden text-gray-700 hover:text-gray-900"
                        >
                            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                        </button>
                    </div>
                </div>

                {/* Mobile Search & Categories drawer */}
                {isMenuOpen && (
                    <div className="md:hidden pb-4 pt-2 border-t border-gray-100 space-y-3">
                        <form onSubmit={handleSearchSubmit} className="relative">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search produce, rice, mandi items..."
                                className="w-full bg-[#FBF8F1] border border-[#E2DAC8] rounded-full py-2 pl-4 pr-10 text-xs"
                            />
                            <button type="submit" className="absolute right-2 top-2 text-gray-500">
                                <Search className="w-4 h-4" />
                            </button>
                        </form>

                        <div className="flex flex-wrap gap-2 pt-2">
                            <Link
                                to="/products"
                                onClick={() => setIsMenuOpen(false)}
                                className="px-3 py-1.5 text-xs font-semibold rounded-full bg-[#163326] text-white"
                            >
                                All Products
                            </Link>
                            {categories.map(cat => (
                                <Link
                                    key={cat.id}
                                    to={`/category/${cat.slug}`}
                                    onClick={() => setIsMenuOpen(false)}
                                    className="px-3 py-1.5 text-xs font-medium rounded-full bg-[#F4EEDD] text-[#163326]"
                                >
                                    {cat.name}
                                </Link>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Category Navigation Bar */}
            <div className="bg-[#F4EEDD]/40 border-t border-[#E2DAC8]/60 hidden md:block">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center gap-6 overflow-x-auto py-2.5 no-scrollbar text-xs font-semibold text-gray-700">
                        <Link to="/products" className="text-[#163326] hover:text-[#D9760C] shrink-0 font-bold flex items-center gap-1">
                            <Leaf className="w-3.5 h-3.5 text-emerald-600" /> All Mandi Products
                        </Link>
                        {categories.map(cat => (
                            <Link
                                key={cat.id}
                                to={`/category/${cat.slug}`}
                                className="hover:text-[#1F4D36] transition-colors shrink-0"
                            >
                                {cat.name}
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </header>
    );
}
