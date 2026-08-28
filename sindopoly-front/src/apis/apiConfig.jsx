// Vite variables are public build-time configuration, never a secret channel.
const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const API_BASE_URL = (configuredBaseUrl || "http://localhost:8080").replace(/\/+$/, "");

export const GetEndpoint = () => API_BASE_URL;
export default API_BASE_URL;
