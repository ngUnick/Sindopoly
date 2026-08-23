import { createContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthAPI } from '../apis/AuthAPI';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const navigate = useNavigate();
    const [currentPlayer, setCurrentPlayer] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        AuthAPI.getCurrentPlayer()
            .then((player) => login(player))
            .catch(() => clearLocalIdentity())
            .finally(() => setLoading(false));
    }, []);

    const clearLocalIdentity = () => {
        localStorage.removeItem('player_id');
        localStorage.removeItem('user');
        sessionStorage.removeItem('nickname');
        setCurrentPlayer(null);
    };


    const login = (user_info) => {
        const {id : player_id} = user_info;
        localStorage.setItem('player_id', player_id);
        localStorage.setItem('user', JSON.stringify(user_info));
        sessionStorage.setItem('nickname', user_info.nickname);
        setCurrentPlayer(user_info);
    };

    const logout = async () => {
        try {
            await AuthAPI.logout();
        } finally {
            clearLocalIdentity();
            navigate('/login');
        }
    };

    const isLoggedIn = () => {
        return Boolean(currentPlayer);
    }

    const getPlayerId = () => {
        return localStorage.getItem("player_id");
    }

    return (
        <AuthContext.Provider value={{ login, logout, isLoggedIn, getPlayerId, currentPlayer, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;
