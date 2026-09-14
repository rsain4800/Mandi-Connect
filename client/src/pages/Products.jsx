import React, { useState, useEffect } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import { Filter, SlidersHorizontal, ArrowUpDown, Search, RefreshCw, X, ChevronLeft, ChevronRight } from 'lucide-react';
import ProductCard from '../components/ProductCard';
import API from '../api/client';

export default function Products() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { slug } = useParams();
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
    const [loading, setLoading] = useState(true);
    const [showFilterMobile, setShowFilterMobile] = useState(false);

    // Filter states
    const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
    const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || slug || '');
    const [minPrice, setMinPrice] = useState('');
    const [maxPrice, setMaxPrice] = useState('');
    const [unitFilter, setUnitFilter] = useState('');
    const [sortOption, setSortOption] = useState(searchParams.get('sort') || 'newest');
    const [currentPage, setCurrentPage] = useState(1);

    // Fetch Categories
    useEffect(() => {
        API.get('/categories')
            .then(res => {
                if (res.data.success) {
                    setCategories(res.data.categories);
                }
            })
            .catch(() => {});
    }, []);

    // Sync state with URL params / route slug. The `/category/:slug` route
    // and the `?category=` query param both carry a category SLUG (matching
    // what the backend's `c.slug = ?` filter expects) — this used to look up
    // the matching category and store its numeric `id` instead, which then
    // got sent to the backend as `?category=<id>`. Since the backend only
    // treats `category` as a slug (use `category_id` for an id filter), that
    // sent something like `?category=3`, which never matches any category's
    // slug — so every category page silently returned zero products.
    useEffect(() => {
        setSearchTerm(searchParams.get('search') || '');
        if (slug) {
            setSelectedCategory(slug);
        } else if (searchParams.get('category')) {
            setSelectedCategory(searchParams.get('category') || '');
        }
        setSortOption(searchParams.get('sort') || 'newest');
    }, [searchParams, slug]);

    // Fetch Products
    const fetchProducts = async () => {
        try {
            setLoading(true);
            const query = new URLSearchParams();
            if (searchTerm) query.append('search', searchTerm);
            const categoryFilter = slug || selectedCategory;
            if (categoryFilter) query.append('category', categoryFilter);
            if (minPrice) query.append('min_price', minPrice);
            if (maxPrice) query.append('max_price', maxPrice);
            if (unitFilter) query.append('unit', unitFilter);
            if (sortOption) query.append('sort', sortOption);
            query.append('page', currentPage);
            query.append('limit', 12);

            const res = await API.get(`/products?${query.toString()}`);
            if (res.data.success) {
                setProducts(res.data.products);
                setPagination(res.data.pagination);
            }
        } catch (error) {
            console.error('Fetch products error:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProducts();
    }, [searchTerm, selectedCategory, slug, minPrice, maxPrice, unitFilter, sortOption, currentPage]);

    const handleResetFilters = () => {
        setSearchTerm('');
        setSelectedCategory('');
        setMinPrice('');
        setMaxPrice('');
        setUnitFilter('');
        setSortOption('newest');
        setCurrentPage(1);
        setSearchParams({});
    };

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
            {/* Header & Breadcrumb */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E2DAC8] pb-6">
                <div>
                    <h1 className="text-3xl font-bold font-serif text-[#163326]">Mandi Marketplace Catalog</h1>
                    <p className="text-xs text-gray-500 mt-1">
                        Showing {pagination.total || 0} produce items directly from regional mandis
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {/* Mobile Filter Toggle */}
                    <button
                        onClick={() => setShowFilterMobile(!showFilterMobile)}
                        className="md:hidden px-4 py-2 bg-[#F4EEDD] text-[#163326] rounded-full text-xs font-bold flex items-center gap-2"
                    >
                        <Filter className="w-4 h-4" /> Filters
                    </button>

                    {/* Sorting Selector */}
                    <div className="flex items-center gap-2 bg-white px-4 py-2 border border-[#E2DAC8] rounded-full text-xs font-semibold">
                        <ArrowUpDown className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-500">Sort By:</span>
                        <select
                            value={sortOption}
                            onChange={(e) => setSortOption(e.target.value)}
                            className="bg-transparent font-bold text-gray-900 focus:outline-none cursor-pointer"
                        >
                            <option value="newest">Newest Produce</option>
                            <option value="price_low">Price: Low to High</option>
                            <option value="price_high">Price: High to Low</option>
                            <option value="popular">Best Sellers & Popular</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                {/* Desktop Filter Sidebar */}
                <div className={`md:block ${showFilterMobile ? 'block' : 'hidden'} space-y-6 bg-white p-6 rounded-3xl border border-[#E2DAC8] h-fit sticky top-28`}>
                    <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                        <h3 className="text-sm font-bold text-[#163326] flex items-center gap-2">
                            <SlidersHorizontal className="w-4 h-4 text-[#D9760C]" /> Filter Options
                        </h3>
                        <button
                            onClick={handleResetFilters}
                            className="text-[11px] font-bold text-gray-400 hover:text-rose-600 flex items-center gap-1"
                        >
                            <RefreshCw className="w-3 h-3" /> Reset
                        </button>
                    </div>

                    {/* Search filter input */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-700">Search Keywords</label>
                        <div className="relative">
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Name, SKU, Brand..."
                                className="w-full bg-[#FBF8F1] border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#1F4D36]"
                            />
                            {searchTerm && (
                                <button onClick={() => setSearchTerm('')} className="absolute right-2 top-2 text-gray-400">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Categories Radio Filter */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-700">Categories</label>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto text-xs pr-1">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="cat"
                                    checked={selectedCategory === ''}
                                    onChange={() => setSelectedCategory('')}
                                    className="text-[#1F4D36]"
                                />
                                <span className={selectedCategory === '' ? 'font-bold text-[#1F4D36]' : 'text-gray-600'}>
                                    All Categories
                                </span>
                            </label>
                            {categories.map(cat => (
                                <label key={cat.id} className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="cat"
                                        checked={selectedCategory === cat.slug}
                                        onChange={() => setSelectedCategory(cat.slug)}
                                        className="text-[#1F4D36]"
                                    />
                                    <span className={selectedCategory === cat.slug ? 'font-bold text-[#1F4D36]' : 'text-gray-600'}>
                                        {cat.name}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Price Range Filter */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-700">Price Range (₹)</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                placeholder="Min"
                                value={minPrice}
                                onChange={(e) => setMinPrice(e.target.value)}
                                className="w-1/2 bg-[#FBF8F1] border border-gray-200 rounded-xl px-3 py-1.5 text-xs"
                            />
                            <span className="text-gray-400 text-xs">-</span>
                            <input
                                type="number"
                                placeholder="Max"
                                value={maxPrice}
                                onChange={(e) => setMaxPrice(e.target.value)}
                                className="w-1/2 bg-[#FBF8F1] border border-gray-200 rounded-xl px-3 py-1.5 text-xs"
                            />
                        </div>
                    </div>

                    {/* Mandi Unit Selector Filter */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-700">Mandi Unit</label>
                        <select
                            value={unitFilter}
                            onChange={(e) => setUnitFilter(e.target.value)}
                            className="w-full bg-[#FBF8F1] border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-800"
                        >
                            <option value="">All Units</option>
                            <option value="kg">Per Kilogram (kg)</option>
                            <option value="gram">Per Gram</option>
                            <option value="quintal">Per Quintal</option>
                            <option value="dozen">Per Dozen</option>
                            <option value="crate">Per Crate</option>
                            <option value="piece">Per Piece</option>
                        </select>
                    </div>
                </div>

                {/* Product Catalog Grid */}
                <div className="md:col-span-3 space-y-6">
                    {loading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {[1, 2, 3, 4, 5, 6].map(n => (
                                <div key={n} className="h-80 skeleton rounded-2xl" />
                            ))}
                        </div>
                    ) : products.length === 0 ? (
                        <div className="bg-white p-12 text-center rounded-3xl border border-[#E2DAC8] space-y-4">
                            <div className="w-16 h-16 bg-amber-100 text-[#D9760C] rounded-full flex items-center justify-center mx-auto">
                                <Search className="w-8 h-8" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900">No Produce Found</h3>
                            <p className="text-xs text-gray-500 max-w-sm mx-auto">
                                We couldn't find any products matching your current filters or search terms. Try clearing your filters.
                            </p>
                            <button
                                onClick={handleResetFilters}
                                className="px-5 py-2.5 bg-[#1F4D36] text-white text-xs font-bold rounded-full hover:bg-[#163326]"
                            >
                                Clear All Filters
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {products.map(product => (
                                <ProductCard key={product.id} product={product} />
                            ))}
                        </div>
                    )}

                    {/* Pagination */}
                    {pagination.totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 pt-6">
                            <button
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(p => p - 1)}
                                className="p-2 rounded-full border border-gray-200 disabled:opacity-30 hover:bg-[#F4EEDD]"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <span className="text-xs font-bold text-gray-700 px-4">
                                Page {pagination.page} of {pagination.totalPages}
                            </span>
                            <button
                                disabled={currentPage === pagination.totalPages}
                                onClick={() => setCurrentPage(p => p + 1)}
                                className="p-2 rounded-full border border-gray-200 disabled:opacity-30 hover:bg-[#F4EEDD]"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}