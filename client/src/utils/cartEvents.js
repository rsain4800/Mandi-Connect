// Tiny event bus so any component can tell the Navbar to refresh the cart count
// after adding/removing/updating a cart item, without prop-drilling.
export const CART_UPDATED_EVENT = "mc:cart-updated";

export const notifyCartUpdated = () => {
    window.dispatchEvent(new Event(CART_UPDATED_EVENT));
};
