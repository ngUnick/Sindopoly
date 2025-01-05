import { GetEndpoint } from "./apiConfig";


export const GamePlayAPI = {
    getBoard : async (player_id) => {
        var myHeaders = new Headers();

        const requestOptions = {
            method: 'GET',
            redirect: 'follow',
            headers: myHeaders
        };

        let endPoint = `api/gamePlay.php/${player_id}/board`;
        const apiUrl = GetEndpoint() + endPoint;
        const apiUrlWithFilters = apiUrl;
        
        const response = await fetch(apiUrlWithFilters, requestOptions);
        // console.log('response', response);
        if(response.ok)
            return await response.json();
        throw new Error(response);
        
    },
    rollDice : async (player_id) => {
        var myHeaders = new Headers();

        const requestOptions = {
            method: 'POST',
            redirect: 'follow',
            headers: myHeaders
        };

        let endPoint = `api/playerAction.php/roll/${player_id}`;
        const apiUrl = GetEndpoint() + endPoint;
        const apiUrlWithFilters = apiUrl;
        
        const response = await fetch(apiUrlWithFilters, requestOptions);
        // console.log('response', response);
        if(response.ok)
            return await response.json();
        throw new Error(response);
        
    },
    passTurn : async (player_id) => {
        var myHeaders = new Headers();

        const requestOptions = {
            method: 'POST',
            redirect: 'follow',
            headers: myHeaders
        };

        let endPoint = `api/playerAction.php/pass_turn/${player_id}`;
        const apiUrl = GetEndpoint() + endPoint;
        const apiUrlWithFilters = apiUrl;
        
        const response = await fetch(apiUrlWithFilters, requestOptions);
        // console.log('response', response);
        if(response.ok)
            return await response.json();
        throw new Error(response);
        
    },
    getActions : async (player_id) => {
        var myHeaders = new Headers();

        const requestOptions = {
            method: 'GET',
            redirect: 'follow',
            headers: myHeaders
        };

        let endPoint = `api/playerAction.php/actions/${player_id}`;
        const apiUrl = GetEndpoint() + endPoint;
        const apiUrlWithFilters = apiUrl;
        
        const response = await fetch(apiUrlWithFilters, requestOptions);
        // console.log('response eeee   ', (await response.text()));
        if(response.ok)
            return await response.json();
        throw new Error(response);
        
    },
    buyProperty : async (player_id) => {
        var myHeaders = new Headers();

        const requestOptions = {
            method: 'POST',
            redirect: 'follow',
            headers: myHeaders
        };

        let endPoint = `api/playerAction.php/buyProperty/${player_id}`;
        const apiUrl = GetEndpoint() + endPoint;
        const apiUrlWithFilters = apiUrl;
        
        const response = await fetch(apiUrlWithFilters, requestOptions);
        // console.log('response', response);
        if(response.ok)
            return await response.json();
        throw new Error(response);
        
    },
    endGame : async (player_id) => {
        var myHeaders = new Headers();

        const requestOptions = {
            method: 'POST',
            redirect: 'follow',
            headers: myHeaders
        };

        let endPoint = `api/playerAction.php/deletePlayerGame/${player_id}`;
        const apiUrl = GetEndpoint() + endPoint;
        const apiUrlWithFilters = apiUrl;
        
        const response = await fetch(apiUrlWithFilters, requestOptions);
        // console.log('response', response);
        if(response.ok)
            return await response.json();
        throw new Error(response);
        
    },
};