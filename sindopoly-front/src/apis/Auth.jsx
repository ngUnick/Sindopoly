import { GetEndpoint } from "./apiConfig";

export const AuthAPI = {
    exchangeCodeWithToken: async (info) => {
        const {code} = info;
        const client_id = "659672d99847e402c7acb08c";
        const client_secret = "19yzc2507u6w8ugno53creg8cj7vqwtb75xuxrxi2sxsab8x0p";
        const tokenUrl = 'https://login.iee.ihu.gr/token';
        const infoUrl = 'https://api.iee.ihu.gr/profile?access_token=';

        const data = new URLSearchParams();
        data.append('client_id', client_id);
        data.append('client_secret', client_secret);
        data.append('grant_type', 'authorization_code');
        data.append('code', code);

        const requestOptions = {
            method: 'POST',
            body: data,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        };

        const response = await fetch(tokenUrl, requestOptions);
        if(response.ok)
            return await response.json();
        throw new Error(response);
    },
    login : async (access_token) => {
        var myHeaders = new Headers();
        myHeaders.append("Content-Type", "application/json");

        var raw = JSON.stringify({
            "access_token": access_token,
        });

        const requestOptions = {
            method: 'POST',
            redirect: 'follow',
            headers: myHeaders,
            body: raw,
        };

        let endPoint = `api/login.php`;
        const apiUrl = GetEndpoint() + endPoint;
        const apiUrlWithFilters = apiUrl;
        
        const response = await fetch(apiUrlWithFilters, requestOptions);
        // console.log('response', response);
        if(response.ok)
            return await response.json();
        throw new Error(response);
        
    },
};