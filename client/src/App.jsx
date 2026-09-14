import React, { lazy, Suspense } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import ProtectedRoute, { AdminRoute } from "./components/ProtectedRoute";
import AdminLayout from "./components/AdminLayout";
import ErrorBoundary from "./components/common/ErrorBoundary";
import InstallAppPrompt from "./components/InstallAppPrompt";

// Lazy-loaded Customer Pages
const Home = lazy(() => import("./pages/Home"));
const Products = lazy(() => import("./pages/Products"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Cart = lazy(() => import("./pages/Cart"));
const Wishlist = lazy(() => import("./pages/Wishlist"));
const Checkout = lazy(() => import("./pages/Checkout"));
const OrderSuccess = lazy(() => import("./pages/OrderSuccess"));
const MyOrders = lazy(() => import("./pages/MyOrders"));
const OrderTracking = lazy(() => import("./pages/OrderTracking"));
const Profile = lazy(() => import("./pages/Profile"));
const Addresses = lazy(() => import("./pages/Addresses"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const Terms = lazy(() => import("./pages/Terms"));
const RefundPolicy = lazy(() => import("./pages/RefundPolicy"));

// Lazy-loaded Admin Pages
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminProducts = lazy(() => import("./pages/admin/AdminProducts"));
const AdminProductForm = lazy(() => import("./pages/admin/AdminProductForm"));
const AdminCategories = lazy(() => import("./pages/admin/AdminCategories"));
const AdminOrders = lazy(() => import("./pages/admin/AdminOrders"));
const AdminOrderDetail = lazy(() => import("./pages/admin/AdminOrderDetail"));
const AdminCustomers = lazy(() => import("./pages/admin/AdminCustomers"));
const AdminCoupons = lazy(() => import("./pages/admin/AdminCoupons"));
const AdminReviews = lazy(() => import("./pages/admin/AdminReviews"));
const AdminShipping = lazy(() => import("./pages/admin/AdminShipping"));
const AdminReports = lazy(() => import("./pages/admin/AdminReports"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminInvoices = lazy(() => import("./pages/admin/AdminInvoices"));

// Invoice Page
const InvoiceView = lazy(() => import("./pages/InvoiceView"));

const PageLoader = () => (
  <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 space-y-3">
    <div className="w-10 h-10 border-4 border-[#1F4D36]/20 border-t-[#1F4D36] rounded-full animate-spin"></div>
    <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Loading...</span>
  </div>
);

function App() {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col bg-[#FBF8F1] text-gray-900">
        {/* Hide main header and footer on admin routes */}
        {!isAdminRoute && <Navbar />}

        <div className="flex-1">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public Customer Routes */}
              <Route path="/" element={<Home />} />
              <Route path="/products" element={<Products />} />
              <Route path="/products/:id" element={<ProductDetail />} />
              <Route path="/category/:slug" element={<Products />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/about" element={<About />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/refund-policy" element={<RefundPolicy />} />

              {/* Protected Customer Routes */}
              <Route path="/cart" element={
                <ProtectedRoute><Cart /></ProtectedRoute>
              } />
              <Route path="/wishlist" element={
                <ProtectedRoute><Wishlist /></ProtectedRoute>
              } />
              <Route path="/checkout" element={
                <ProtectedRoute><Checkout /></ProtectedRoute>
              } />
              <Route path="/order-success" element={
                <ProtectedRoute><OrderSuccess /></ProtectedRoute>
              } />
              <Route path="/orders" element={
                <ProtectedRoute><MyOrders /></ProtectedRoute>
              } />
              <Route path="/orders/:id" element={
                <ProtectedRoute><OrderTracking /></ProtectedRoute>
              } />
              <Route path="/orders/:orderId/invoice" element={
                <ProtectedRoute><InvoiceView /></ProtectedRoute>
              } />
              <Route path="/track-order" element={
                <ProtectedRoute><OrderTracking /></ProtectedRoute>
              } />
              <Route path="/profile" element={
                <ProtectedRoute><Profile /></ProtectedRoute>
              } />
              <Route path="/addresses" element={
                <ProtectedRoute><Addresses /></ProtectedRoute>
              } />

              {/* Admin Login Route */}
              <Route path="/admin/login" element={<AdminLogin />} />

              {/* Protected Admin Nested Layout Routes */}
              <Route path="/admin" element={
                <AdminRoute><AdminLayout /></AdminRoute>
              }>
                <Route index element={<AdminDashboard />} />
                <Route path="dashboard" element={<AdminDashboard />} />
                <Route path="products" element={<AdminProducts />} />
                <Route path="products/add" element={<AdminProductForm />} />
                <Route path="products/edit/:id" element={<AdminProductForm />} />
                <Route path="categories" element={<AdminCategories />} />
                <Route path="orders" element={<AdminOrders />} />
                <Route path="orders/:id" element={<AdminOrderDetail />} />
                <Route path="customers" element={<AdminCustomers />} />
                <Route path="coupons" element={<AdminCoupons />} />
                <Route path="reviews" element={<AdminReviews />} />
                <Route path="shipping" element={<AdminShipping />} />
                <Route path="reports" element={<AdminReports />} />
                <Route path="settings" element={<AdminSettings />} />
                <Route path="invoices" element={<AdminInvoices />} />
              </Route>

              {/* Fallback 404 Route */}
              <Route path="*" element={
                <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center space-y-4">
                  <h1 className="text-6xl font-black text-[#163326]">404</h1>
                  <h2 className="text-xl font-bold text-gray-800">Page Not Found</h2>
                  <p className="text-sm text-gray-500 max-w-md">The page you are looking for does not exist or has been moved.</p>
                  <a href="/" className="px-5 py-2.5 bg-[#1F4D36] text-white rounded-xl text-xs font-bold shadow-md hover:bg-[#163326] transition-colors">
                    Back to Mandi Connect Home
                  </a>
                </div>
              } />
            </Routes>
          </Suspense>
        </div>

        <InstallAppPrompt />
        {!isAdminRoute && <Footer />}
      </div>
    </ErrorBoundary>
  );
}

export default App;
