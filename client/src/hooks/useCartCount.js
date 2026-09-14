import { useEffect, useState, useCallback } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { CART_UPDATED_EVENT } from "../utils/cartEvents";

export const useCartCount = () => {
    const { user } = useAuth();
    const [count, setCount] = useState(0);

    const refresh = useCallback(async () => {
        if (!user || user.role !== "buyer") {
            setCount(0);
            return;
        }
        try {
            const { data } = await api.get("/cart");
            setCount(data.items.length);
        } catch {
            setCount(0);
        }
    }, [user]);

    useEffect(() => {
        refresh();
        window.addEventListener(CART_UPDATED_EVENT, refresh);
        return () => window.removeEventListener(CART_UPDATED_EVENT, refresh);
    }, [refresh]);

    return count;
};
