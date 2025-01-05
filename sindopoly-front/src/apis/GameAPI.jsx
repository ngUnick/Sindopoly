import { GetEndpoint } from "./apiConfig";


export const GameAPI = {
    getAll : async () => {
        var myHeaders = new Headers();

        const requestOptions = {
            method: 'GET',
            redirect: 'follow',
            headers: myHeaders
        };

        let endPoint = `api/game.php`;
        const apiUrl = GetEndpoint() + endPoint;
        const apiUrlWithFilters = apiUrl;
        
        const response = await fetch(apiUrlWithFilters, requestOptions);
        if(response.ok)
            return await response.json();
        throw new Error(response);
        
    },
    createGame : async (maxTime, maxMoney, bot) => {
        var myHeaders = new Headers();
        myHeaders.append("Content-Type", "application/json");

        var raw = JSON.stringify({
            "playerCreator": localStorage.getItem('player_id'),
            "maxTime": maxTime,
            "maxMoney": maxMoney,
            "bot" : bot,
        });

        const requestOptions = {
            method: 'POST',
            redirect: 'follow',
            headers: myHeaders,
            body: raw,
        };

        let endPoint = `api/game.php`;
        const apiUrl = GetEndpoint() + endPoint;
        const apiUrlWithFilters = apiUrl;
        
        const response = await fetch(apiUrlWithFilters, requestOptions);
        // console.log('response', response);
        if(response.ok)
            return await response.json();
        throw new Error(response);
        
    },
    getGameInfo : async (game_id) => {
        var myHeaders = new Headers();

        const requestOptions = {
            method: 'GET',
            redirect: 'follow',
            headers: myHeaders
        };

        let endPoint = `api/game.php/${game_id}`;
        const apiUrl = GetEndpoint() + endPoint;
        const apiUrlWithFilters = apiUrl;
        
        const response = await fetch(apiUrlWithFilters, requestOptions);
        if(response.ok)
            return await response.json();
        throw new Error(response);
        
    },
    startGame : async (game_id) => {
        var myHeaders = new Headers();
        myHeaders.append("Content-Type", "application/json");

        var raw = JSON.stringify({
            "player_id": localStorage.getItem('player_id'),
        });

        const requestOptions = {
            method: 'POST',
            redirect: 'follow',
            headers: myHeaders,
            body: raw,
        };

        let endPoint = `api/game.php/start/${game_id}`;
        const apiUrl = GetEndpoint() + endPoint;
        const apiUrlWithFilters = apiUrl;
        
        const response = await fetch(apiUrlWithFilters, requestOptions);
        // console.log('response', response);
        if(response.ok)
            return await response.json();
        throw new Error(response);
        
    },
    joinGame : async (game_id) => {
        var myHeaders = new Headers();
        myHeaders.append("Content-Type", "application/json");

        var raw = JSON.stringify({
            "player_id": localStorage.getItem('player_id'),
        });

        const requestOptions = {
            method: 'POST',
            redirect: 'follow',
            headers: myHeaders,
            body: raw,
        };

        let endPoint = `api/game.php/join/${game_id}`;
        const apiUrl = GetEndpoint() + endPoint;
        const apiUrlWithFilters = apiUrl;
        
        const response = await fetch(apiUrlWithFilters, requestOptions);
        // console.log('response', response);
        if(response.ok)
            return await response.json();
        throw new Error(response);
        
    },
};