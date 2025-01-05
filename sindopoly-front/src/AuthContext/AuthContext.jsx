import { createContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const navigate = useNavigate();


    const login = (user_info) => {
        const {id : player_id} = user_info;
        localStorage.setItem('player_id', player_id);
        localStorage.setItem('user', JSON.stringify(user_info));
    };

    const logout = () => {
        localStorage.removeItem('player_id');
        localStorage.removeItem('user');
        navigate('/login');
    };

    const isLoggedIn = () => {
        let flag = false;

        //check user has player_id
        localStorage.getItem("player_id") ? (flag = true) : (flag = false);

        return flag;
    }

    const getPlayerId = () => {
        return localStorage.getItem("player_id");
    }

    return (
        <AuthContext.Provider value={{ login, logout, isLoggedIn, getPlayerId }}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;