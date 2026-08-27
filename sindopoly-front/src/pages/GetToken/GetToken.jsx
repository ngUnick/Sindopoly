import { useEffect, useState, useContext } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useNavigate } from "react-router-dom";
import { AuthAPI } from '../../apis/AuthAPI';
import AuthContext from "../../AuthContext/AuthContext.jsx";

const GetToken = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [code, setCode] = useState();
    const [token, setToken] = useState();
    const navigate = useNavigate();
    const { login } = useContext(AuthContext);

    const loginFun = async (codeFromServer) => {
        const response = await AuthAPI.exchangeCodeWithToken({code : codeFromServer});
        setToken(response);
        const response2 = await AuthAPI.login(response.access_token);
        login(response2);
        navigate("/");
    };

    useEffect(() => {
        setCode(searchParams.get('code'));
        loginFun(searchParams.get('code'));
    },[]);

    return ( 
        <div className="">
            <div className="">
                The code is {code ? code : ""}
            </div>
            <div className="">
                The token is {token ? token.access_token : ""}
            </div>
            
        </div>
     );
}
 
export default GetToken;
