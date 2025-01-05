import monopoly_logo from "../../assets/images/monopoly_logo.png";
import { Button } from "antd";

const Login = () => {
  const client_id = "659672d99847e402c7acb08c";
  const redirect_uri = "http://4xix.l.time4vps.cloud/getToken";

  return (
    <div className="flex-grow flex justify-center items-center bg-pic bg-cover bg-no-repeat">
      {/* Vignette */}
      <div className="fixed w-full h-full shadow-[0_0_80px_rgba(255,255,255,0.7)_inset] left-0 top-0"></div>
      <div className="bg-[rgba(255,236,195,0.8)] pt-[50px] pb-[20px] px-5 backdrop-blur-sm border-solid border-[rgba(255,255,255,0.6)] rounded-md">
        <div className="w-[800px] flex flex-col gap-5 items-center pb-5">
          <img src={monopoly_logo} alt="logo" className="mb-5"/>
          <a href={`https://login.iee.ihu.gr/login?client_id=${client_id}&response_type=code&scope=profile&redirect_uri=${redirect_uri}`}>
            <Button className="px-5">Login</Button>
          </a>
        </div>
      </div>
    </div>
  );
};

export default Login;
