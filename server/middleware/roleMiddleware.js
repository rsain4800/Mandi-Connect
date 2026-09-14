// Restricts a route to specific user roles (e.g. "seller", "buyer", "admin")
const roleMiddleware = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                message: "Access Denied: Aapko is action ki permission nahi hai"
            });
        }
        next();
    };
};

module.exports = roleMiddleware;
