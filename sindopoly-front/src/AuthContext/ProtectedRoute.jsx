import { Navigate } from "react-router-dom";

export const ProtectedRoute = ({ children }) => {
  const nickname = sessionStorage.getItem("nickname");

  if (!nickname) {
    return <Navigate to="/login" />;
  }

  return children;
};
