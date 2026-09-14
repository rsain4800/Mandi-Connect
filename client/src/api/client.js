import axios from 'axios';

// In dev, falls back to localhost so `npm run dev` keeps working with no setup.
// In production this MUST be set via VITE_API_URL (see client/.env.example).
const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const API = axios.create({
    baseURL,
    // The server issues the JWT as an httpOnly cookie (see server/utils/cookies.js),
    // so the browser sends it automatically — this just needs to allow it out.
    // The client never reads or stores the token itself.
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Response Interceptor: on 401, clear any cached user profile so the UI
// reflects the logged-out state (the actual auth cookie is cleared server-side).
API.interceptors.response.use((response) => response, (error) => {
    if (error.response && error.response.status === 401) {
        const currentPath = window.location.pathname;
        if (!currentPath.includes('/login') && !currentPath.includes('/admin/login')) {
            localStorage.removeItem('mandi_user');
        }
    }
    return Promise.reject(error);
});

export default API;