const { pool } = require('../config/db');

// Admin Dashboard Summary Metrics
const getDashboardMetrics = async (req, res) => {
    try {
        // Total Revenue & Order Counts
        const [salesTotal] = await pool.query(
            `SELECT COALESCE(SUM(total_amount), 0) AS total_sales,
                    COUNT(id) AS total_orders
             FROM orders
             WHERE order_status != 'Cancelled'`
        );

        // Today's Sales
        const todayStr = new Date().toISOString().split('T')[0];
        const [todaySales] = await pool.query(
            `SELECT COALESCE(SUM(total_amount), 0) AS today_sales
             FROM orders
             WHERE DATE(created_at) = ? AND order_status != 'Cancelled'`,
            [todayStr]
        );

        // Monthly Sales
        const [monthlySales] = await pool.query(
            `SELECT COALESCE(SUM(total_amount), 0) AS monthly_sales
             FROM orders
             WHERE MONTH(created_at) = MONTH(CURRENT_DATE())
               AND YEAR(created_at) = YEAR(CURRENT_DATE())
               AND order_status != 'Cancelled'`
        );

        // Orders Breakdown by Status
        const [statusCounts] = await pool.query(
            `SELECT order_status, COUNT(id) as count
             FROM orders
             GROUP BY order_status`
        );

        const statusMap = {
            Pending: 0,
            Confirmed: 0,
            Processing: 0,
            Packed: 0,
            Shipped: 0,
            'Out for Delivery': 0,
            Delivered: 0,
            Cancelled: 0
        };
        statusCounts.forEach(s => statusMap[s.order_status] = s.count);

        // Customer & Product Counts
        const [customerCount] = await pool.query(`SELECT COUNT(id) AS total FROM users WHERE role = 'customer'`);
        const [productCount] = await pool.query(`SELECT COUNT(id) AS total FROM products WHERE is_active = 1`);
        
        // Low Stock Products (< 20 units), with MOQ shown alongside so the
        // admin can see at a glance whether remaining stock can even cover
        // one more minimum order.
        const [lowStockProducts] = await pool.query(
            `SELECT id, name, sku, unit, stock_quantity AS available_stock, minimum_order_quantity, thumbnail
             FROM products
             WHERE stock_quantity <= 20 AND is_active = 1
             ORDER BY stock_quantity ASC
             LIMIT 10`
        );

        // Recent Orders
        const [recentOrders] = await pool.query(
            `SELECT o.id, o.order_number, o.shipping_full_name, o.total_amount, o.order_status, o.payment_status, o.created_at
             FROM orders o
             ORDER BY o.created_at DESC
             LIMIT 8`
        );

        // Top Selling Products
        const [topProducts] = await pool.query(
            `SELECT oi.product_name, SUM(oi.quantity) as total_sold, SUM(oi.total_price) as total_revenue
             FROM order_items oi
             JOIN orders o ON oi.order_id = o.id
             WHERE o.order_status != 'Cancelled'
             GROUP BY oi.product_id, oi.product_name
             ORDER BY total_sold DESC
             LIMIT 5`
        );

        return res.json({
            success: true,
            metrics: {
                total_sales: parseFloat(salesTotal[0].total_sales),
                today_sales: parseFloat(todaySales[0].today_sales),
                monthly_sales: parseFloat(monthlySales[0].monthly_sales),
                total_orders: salesTotal[0].total_orders,
                total_customers: customerCount[0].total,
                total_products: productCount[0].total,
                status_breakdown: statusMap,
                low_stock_products: lowStockProducts,
                recent_orders: recentOrders,
                top_products: topProducts
            }
        });
    } catch (error) {
        console.error('Get Dashboard Metrics Error:', error);
        return res.status(500).json({ success: false, message: 'Error fetching admin metrics.' });
    }
};

// Admin Customers Management
const getAdminCustomers = async (req, res) => {
    try {
        const [customers] = await pool.query(
            `SELECT u.id, u.full_name, u.email, u.phone, u.profile_image, u.is_active, u.created_at,
                    COUNT(o.id) as total_orders,
                    COALESCE(SUM(o.total_amount), 0) as total_spent
             FROM users u
             LEFT JOIN orders o ON u.id = o.user_id AND o.order_status != 'Cancelled'
             WHERE u.role = 'customer'
             GROUP BY u.id
             ORDER BY u.created_at DESC`
        );
        return res.json({ success: true, customers });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching customer list.' });
    }
};

// Toggle Customer Status (Activate/Deactivate)
const toggleCustomerStatus = async (req, res) => {
    try {
        const customerId = req.params.id;
        const [users] = await pool.query('SELECT is_active FROM users WHERE id = ? AND role = "customer"', [customerId]);
        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'Customer not found.' });
        }

        const newStatus = users[0].is_active ? 0 : 1;
        await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [newStatus, customerId]);
        return res.json({ success: true, message: `Customer account ${newStatus ? 'activated' : 'deactivated'}.` });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error updating customer status.' });
    }
};

// Admin Analytics & Performance Reports
const getAnalyticsReports = async (req, res) => {
    try {
        // Sales Trend (Last 6 Months)
        const [monthlyTrends] = await pool.query(
            `SELECT DATE_FORMAT(created_at, '%b %Y') as month,
                    COUNT(id) as total_orders,
                    COALESCE(SUM(total_amount), 0) as total_revenue
             FROM orders
             WHERE order_status != 'Cancelled'
             GROUP BY YEAR(created_at), MONTH(created_at), DATE_FORMAT(created_at, '%b %Y')
             ORDER BY YEAR(created_at) DESC, MONTH(created_at) DESC
             LIMIT 6`
        );

        // Sales by Category
        const [categorySales] = await pool.query(
            `SELECT c.name as category_name,
                    COUNT(DISTINCT oi.order_id) as total_orders,
                    COALESCE(SUM(oi.total_price), 0) as category_revenue
             FROM order_items oi
             JOIN products p ON oi.product_id = p.id
             JOIN categories c ON p.category_id = c.id
             JOIN orders o ON oi.order_id = o.id
             WHERE o.order_status != 'Cancelled'
             GROUP BY c.id, c.name
             ORDER BY category_revenue DESC`
        );

        // Payment Method breakdown
        const [paymentMethods] = await pool.query(
            `SELECT payment_method, COUNT(id) as count, COALESCE(SUM(total_amount), 0) as revenue
             FROM orders
             WHERE order_status != 'Cancelled'
             GROUP BY payment_method`
        );

        return res.json({
            success: true,
            reports: {
                monthly_trends: monthlyTrends.reverse(),
                category_sales: categorySales,
                payment_methods: paymentMethods
            }
        });
    } catch (error) {
        console.error('Get Analytics Reports Error:', error);
        return res.status(500).json({ success: false, message: 'Error fetching analytics reports.' });
    }
};

module.exports = {
    getDashboardMetrics,
    getAdminCustomers,
    toggleCustomerStatus,
    getAnalyticsReports
};