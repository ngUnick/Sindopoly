import { Navigate } from "react-router-dom";
import { useContext } from "react";
import AuthContext from "./AuthContext";

export const ProtectedRoute = ({ children }) => {
  const { isLoggedIn, loading } = useContext(AuthContext);

  if (loading) return null;

  if (!isLoggedIn()) {
    return <Navigate to="/login" />;
  }

  return children;
};
