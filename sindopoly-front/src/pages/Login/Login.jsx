const Login = () => {
    const client_id = "659672d99847e402c7acb08c";
    const redirect_uri = "http://4xix.l.time4vps.cloud/getToken";

    return ( 
    <div className="flex justify-center items-center h-[100vh]">
        <a href={`https://login.iee.ihu.gr/login?client_id=${client_id}&response_type=code&scope=profile&redirect_uri=${redirect_uri}`}>
            <button className="p-20">KANE LOGIN RE</button>
        </a>
    </div> 
    );
}
 
export default Login;