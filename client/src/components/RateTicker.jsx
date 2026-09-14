import { useEffect, useState } from "react";
import api from "../api/client";

// Signature element: a scrolling "mandi board" ticker built from real listed
// products/prices (not mock data) so it stays honest as the catalog grows.
const RateTicker = () => {
    const [items, setItems] = useState([]);

    useEffect(() => {
        api.get("/products")
            .then(({ data }) => setItems(data.slice(0, 12)))
            .catch(() => setItems([]));
    }, []);

    if (items.length === 0) return null;

    const loopItems = [...items, ...items];

    return (
        <div className="ticker">
            <div className="ticker-track">
                {loopItems.map((p, i) => (
                    <span className="ticker-item" key={`${p.id}-${i}`}>
                        {p.name} <b>₹{Number(p.price_per_unit).toFixed(0)}/{p.unit}</b>
                    </span>
                ))}
            </div>
        </div>
    );
};

export default RateTicker;