import { GetEndpoint } from "./apiConfig";


export const StatisticsAPI = {
    getWinners : async () => {
        var myHeaders = new Headers();

        const requestOptions = {
            method: 'GET',
            redirect: 'follow',
            headers: myHeaders
        };

        let endPoint = `api/statistics.php/Winners`;
        const apiUrl = GetEndpoint() + endPoint;
        const apiUrlWithFilters = apiUrl;
        
        const response = await fetch(apiUrlWithFilters, requestOptions);
        if(response.ok)
            return await response.json();
        throw new Error(response);
        
    },
}