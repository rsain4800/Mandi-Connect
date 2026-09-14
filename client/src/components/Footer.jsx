import React from 'react';
import { Link } from 'react-router-dom';
import { Leaf, Phone, Mail, MapPin, ShieldCheck, Truck, RefreshCw, Award } from 'lucide-react';

export default function Footer() {
    return (
        <footer className="bg-[#163326] text-gray-300 pt-16 pb-8 border-t-4 border-[#D9760C]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Features Value Props */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pb-12 border-b border-emerald-900/60">
                    <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-emerald-900/80 flex items-center justify-center text-emerald-400 shrink-0">
                            <Leaf className="w-5 h-5" />
                        </div>
                        <div>
                            <h4 className="text-sm font-bold text-white mb-0.5">Farm Fresh Daily</h4>
                            <p className="text-xs text-gray-400">Directly sourced from regional mandis</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-emerald-900/80 flex items-center justify-center text-amber-400 shrink-0">
                            <Truck className="w-5 h-5" />
                        </div>
                        <div>
                            <h4 className="text-sm font-bold text-white mb-0.5">Speedy Delivery</h4>
                            <p className="text-xs text-gray-400">Hassle-free doorstep shipping</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-emerald-900/80 flex items-center justify-center text-emerald-400 shrink-0">
                            <Award className="w-5 h-5" />
                        </div>
                        <div>
                            <h4 className="text-sm font-bold text-white mb-0.5">Best Mandi Prices</h4>
                            <p className="text-xs text-gray-400">No middlemen price markups</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-emerald-900/80 flex items-center justify-center text-emerald-400 shrink-0">
                            <ShieldCheck className="w-5 h-5" />
                        </div>
                        <div>
                            <h4 className="text-sm font-bold text-white mb-0.5">100% Guaranteed</h4>
                            <p className="text-xs text-gray-400">Verified buyer reviews & easy refunds</p>
                        </div>
                    </div>
                </div>

                {/* Main Links Grid */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-10 py-12">
                    {/* Brand Info */}
                    <div className="md:col-span-2 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white font-bold">
                                <Leaf className="w-5 h-5" />
                            </div>
                            <span className="text-2xl font-bold tracking-tight text-white font-serif">
                                Mandi<span className="text-[#D9760C]">Connect</span>
                            </span>
                        </div>
                        <p className="text-xs text-gray-400 leading-relaxed max-w-sm">
                            Mandi Connect is India's leading digital produce marketplace connecting local agricultural mandis directly to households. Fresh fruits, vegetables, grains, and groceries delivered with full transparency.
                        </p>
                        <div className="pt-2 flex items-center gap-4 text-xs font-semibold text-emerald-400">
                            <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> +91 1800-MANDI-CONNECT</span>
                            <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> support@mandiconnect.com</span>
                        </div>
                    </div>

                    {/* Shop Categories */}
                    <div>
                        <h4 className="text-sm font-bold text-white tracking-wider uppercase mb-4">Categories</h4>
                        <ul className="space-y-2.5 text-xs">
                            <li><Link to="/category/vegetables" className="hover:text-emerald-400 transition-colors">Fresh Vegetables</Link></li>
                            <li><Link to="/category/fruits" className="hover:text-emerald-400 transition-colors">Seasonal Fruits</Link></li>
                            <li><Link to="/category/potatoes-onions" className="hover:text-emerald-400 transition-colors">Potatoes & Onions</Link></li>
                            <li><Link to="/category/leafy-vegetables" className="hover:text-emerald-400 transition-colors">Leafy Greens</Link></li>
                            <li><Link to="/category/groceries" className="hover:text-emerald-400 transition-colors">Groceries & Flours</Link></li>
                            <li><Link to="/category/organic-products" className="hover:text-emerald-400 transition-colors">100% Organic Produce</Link></li>
                        </ul>
                    </div>

                    {/* Quick Links */}
                    <div>
                        <h4 className="text-sm font-bold text-white tracking-wider uppercase mb-4">Quick Links</h4>
                        <ul className="space-y-2.5 text-xs">
                            <li><Link to="/products" className="hover:text-emerald-400 transition-colors">All Mandi Products</Link></li>
                            <li><Link to="/cart" className="hover:text-emerald-400 transition-colors">Shopping Cart</Link></li>
                            <li><Link to="/wishlist" className="hover:text-emerald-400 transition-colors">My Wishlist</Link></li>
                            <li><Link to="/orders" className="hover:text-emerald-400 transition-colors">Track Orders</Link></li>
                            <li><Link to="/profile" className="hover:text-emerald-400 transition-colors">Account Profile</Link></li>
                            <li><Link to="/admin/login" className="text-amber-400 hover:underline transition-colors font-semibold">Admin Login Portal</Link></li>
                        </ul>
                    </div>

                    {/* Customer Policies */}
                    <div>
                        <h4 className="text-sm font-bold text-white tracking-wider uppercase mb-4">Policies</h4>
                        <ul className="space-y-2.5 text-xs">
                            <li><Link to="/about" className="hover:text-emerald-400 transition-colors">About Us</Link></li>
                            <li><Link to="/contact" className="hover:text-emerald-400 transition-colors">Contact Us</Link></li>
                            <li><Link to="/privacy-policy" className="hover:text-emerald-400 transition-colors">Privacy Policy</Link></li>
                            <li><Link to="/terms" className="hover:text-emerald-400 transition-colors">Terms of Service</Link></li>
                            <li><Link to="/refund-policy" className="hover:text-emerald-400 transition-colors">Refund & Return Policy</Link></li>
                        </ul>
                    </div>
                </div>

                {/* Bottom Copyright */}
                <div className="pt-8 border-t border-emerald-900/60 flex flex-col md:flex-row items-center justify-between text-xs text-gray-400 gap-4">
                    <p>© 2026 Mandi Connect. All rights reserved. "Fresh from the Mandi, Delivered to You"</p>
                    <div className="flex items-center gap-6 text-gray-400">
                        <span>Safe & Secure Online Payments via Razorpay</span>
                    </div>
                </div>
            </div>
        </footer>
    );
}
