import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Leaf, ShieldCheck, Truck, Award, Sparkles, Star, ChevronRight, Zap } from 'lucide-react';
import ProductCard from '../components/ProductCard';
import API from '../api/client';
import { resolveMediaUrl, DEFAULT_CATEGORY_IMAGE } from '../utils/media';

export default function Home() {
    const [categories, setCategories] = useState([]);
    const [featuredProducts, setFeaturedProducts] = useState([]);
    const [bestSellers, setBestSellers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [catRes, featRes, bestRes] = await Promise.all([
                    API.get('/categories'),
                    API.get('/products?featured=true&limit=8'),
                    API.get('/products?best_seller=true&limit=8')
                ]);

                if (catRes.data.success) setCategories(catRes.data.categories);
                if (featRes.data.success) setFeaturedProducts(featRes.data.products);
                if (bestRes.data.success) setBestSellers(bestRes.data.products);
            } catch (error) {
                console.error('Home data fetch error:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    return (
        <div className="space-y-16 pb-16">
            {/* Hero Section */}
            <section className="relative mandi-hero-bg text-white py-16 lg:py-24 rounded-3xl overflow-hidden mx-4 sm:mx-6 lg:mx-8 shadow-2xl border border-emerald-900/60 mt-4">
                <div className="max-w-7xl mx-auto px-6 lg:px-12 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                    <div className="space-y-6 text-center lg:text-left z-10">
                        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-900/80 border border-emerald-700 text-amber-300 text-xs font-bold uppercase tracking-wider">
                            <Sparkles className="w-4 h-4 text-amber-400" /> Direct Farm & Mandi Marketplace
                        </div>
                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold font-serif leading-tight text-white">
                            Fresh Produce <br />
                            <span className="text-[#D9760C]">Directly From Mandi</span>
                        </h1>
                        <p className="text-sm sm:text-base text-gray-300 max-w-lg leading-relaxed font-light">
                            Buy farm-fresh vegetables, orchard fruits, grains, and groceries at authentic wholesale mandi rates. Zero middleman markup, 100% quality guarantee.
                        </p>
                        <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 pt-2">
                            <Link
                                to="/products"
                                className="px-7 py-3.5 bg-[#D9760C] hover:bg-[#B25F06] text-white font-bold text-sm rounded-full shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
                            >
                                Shop Mandi Products <ArrowRight className="w-4 h-4" />
                            </Link>
                            <Link
                                to="/category/vegetables"
                                className="px-6 py-3.5 bg-white/10 hover:bg-white/20 text-white font-bold text-sm rounded-full border border-white/20 transition-all"
                            >
                                Browse Vegetables
                            </Link>
                        </div>

                        {/* Quick Trust Stat Pills */}
                        <div className="pt-8 border-t border-emerald-800/60 grid grid-cols-3 gap-4 text-center lg:text-left">
                            <div>
                                <h3 className="text-xl font-bold text-white">100%</h3>
                                <p className="text-xs text-gray-400">Fresh Produce</p>
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white">₹0</h3>
                                <p className="text-xs text-gray-400">Middleman Commission</p>
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white">24-48h</h3>
                                <p className="text-xs text-gray-400">Express Delivery</p>
                            </div>
                        </div>
                    </div>

                    {/* Hero Visual Mockup */}
                    <div className="relative flex justify-center lg:justify-end">
                        <div className="relative w-full max-w-md bg-gradient-to-b from-white/10 to-white/5 p-4 rounded-3xl backdrop-blur-md border border-white/20 shadow-2xl">
                            <img
                                src="https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?auto=format&fit=crop&w=800&q=80"
                                alt="Fresh Vegetables Mandi"
                                className="w-full h-80 object-cover rounded-2xl shadow-md"
                            />
                            <div className="absolute -bottom-6 -left-6 bg-white text-gray-900 p-4 rounded-2xl shadow-2xl border border-gray-100 flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-[#1F4D36] flex items-center justify-center font-bold">
                                    <Leaf className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-gray-900">Today's Nashik Red Onions</p>
                                    <p className="text-sm font-extrabold text-[#1F4D36]">₹28.00 / kg <span className="text-[10px] text-gray-400 line-through">₹35.00</span></p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Categories Section */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h2 className="text-2xl font-bold text-[#163326]">Explore Categories</h2>
                        <p className="text-xs text-gray-500">Handpicked direct mandi categories</p>
                    </div>
                    <Link to="/products" className="text-xs font-bold text-[#1F4D36] hover:text-[#D9760C] flex items-center gap-1">
                        View All <ChevronRight className="w-4 h-4" />
                    </Link>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-4">
                    {categories.map(cat => (
                        <Link
                            key={cat.id}
                            to={`/category/${cat.slug}`}
                            className="group bg-white p-4 rounded-2xl border border-[#E2DAC8] hover:border-[#1F4D36] hover:shadow-lg transition-all text-center flex flex-col items-center"
                        >
                            <div className="w-16 h-16 rounded-2xl bg-[#F4EEDD] flex items-center justify-center mb-3 group-hover:scale-110 transition-transform overflow-hidden">
                                {cat.image ? (
                                    <img
                                        src={resolveMediaUrl(cat.image)}
                                        alt={cat.name}
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                            e.currentTarget.src = DEFAULT_CATEGORY_IMAGE;
                                        }}
                                    />
                                ) : (
                                    <Leaf className="w-8 h-8 text-[#1F4D36]" />
                                )}
                            </div>
                            <h3 className="text-xs font-bold text-gray-800 group-hover:text-[#1F4D36] line-clamp-2">
                                {cat.name}
                            </h3>
                        </Link>
                    ))}
                </div>
            </section>

            {/* Featured Mandi Produce */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <span className="text-xs font-bold uppercase tracking-wider text-[#D9760C]">Fresh Arrivals</span>
                        <h2 className="text-2xl font-bold text-[#163326]">Featured Mandi Produce</h2>
                    </div>
                    <Link to="/products?featured=true" className="text-xs font-bold text-[#1F4D36] hover:underline flex items-center gap-1">
                        Explore Featured <ChevronRight className="w-4 h-4" />
                    </Link>
                </div>

                {loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="h-72 skeleton rounded-2xl" />
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                        {featuredProducts.map(product => (
                            <ProductCard key={product.id} product={product} />
                        ))}
                    </div>
                )}
            </section>

            {/* Promotional Banner */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="bg-gradient-to-r from-[#163326] via-[#1F4D36] to-[#2E6B4D] rounded-3xl p-8 sm:p-12 text-white flex flex-col md:flex-row items-center justify-between gap-8 shadow-xl">
                    <div className="space-y-3 text-center md:text-left">
                        <span className="px-3 py-1 bg-amber-500 text-gray-900 text-xs font-extrabold rounded-full uppercase tracking-wider">
                            Special Mandi Offer
                        </span>
                        <h2 className="text-3xl font-bold font-serif text-white">Get Flat 20% OFF On Fresh Organic Greens</h2>
                        <p className="text-xs sm:text-sm text-gray-300">
                            Use Coupon Code <span className="font-mono font-bold text-amber-300 bg-black/30 px-2 py-1 rounded">FRESH20</span> on checkout.
                        </p>
                    </div>
                    <Link
                        to="/category/organic-products"
                        className="px-8 py-3.5 bg-[#D9760C] hover:bg-[#B25F06] text-white font-bold text-sm rounded-full shadow-md transition-all shrink-0"
                    >
                        Claim Offer Now
                    </Link>
                </div>
            </section>

            {/* Best Sellers */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Top Choices</span>
                        <h2 className="text-2xl font-bold text-[#163326]">Best Selling Staples</h2>
                    </div>
                    <Link to="/products?sort=popular" className="text-xs font-bold text-[#1F4D36] hover:underline flex items-center gap-1">
                        View All Best Sellers <ChevronRight className="w-4 h-4" />
                    </Link>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {bestSellers.map(product => (
                        <ProductCard key={product.id} product={product} />
                    ))}
                </div>
            </section>

            {/* Why Choose Mandi Connect */}
            <section className="bg-[#F4EEDD]/50 py-16 border-y border-[#E2DAC8]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center max-w-2xl mx-auto mb-12">
                        <span className="text-xs font-bold uppercase tracking-wider text-[#D9760C]">Why Us</span>
                        <h2 className="text-3xl font-bold text-[#163326] mt-1 font-serif">Why Choose Mandi Connect?</h2>
                        <p className="text-xs text-gray-600 mt-2">
                            Reinventing fruit & vegetable shopping directly from regional APMC mandis to your kitchen.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="bg-white p-8 rounded-3xl border border-[#E2DAC8] shadow-xs text-center space-y-4">
                            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 text-[#1F4D36] flex items-center justify-center">
                                <Leaf className="w-7 h-7" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900">Direct From Mandi</h3>
                            <p className="text-xs text-gray-500 leading-relaxed">
                                No third-party brokers or supermarket store markups. Produce is harvested and shipped straight from mandi lots.
                            </p>
                        </div>

                        <div className="bg-white p-8 rounded-3xl border border-[#E2DAC8] shadow-xs text-center space-y-4">
                            <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-100 text-[#D9760C] flex items-center justify-center">
                                <Award className="w-7 h-7" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900">Wholesale Mandi Rates</h3>
                            <p className="text-xs text-gray-500 leading-relaxed">
                                Enjoy authentic mandi wholesale rates per kg, dozen, or crate with full price transparency.
                            </p>
                        </div>

                        <div className="bg-white p-8 rounded-3xl border border-[#E2DAC8] shadow-xs text-center space-y-4">
                            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 text-[#1F4D36] flex items-center justify-center">
                                <Truck className="w-7 h-7" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900">Live Visual Order Tracking</h3>
                            <p className="text-xs text-gray-500 leading-relaxed">
                                Track your shipment step-by-step from Mandi Packing to Doorstep Delivery in real-time.
                            </p>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
