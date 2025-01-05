import { Link } from "react-router-dom";

function Navbar() {
    return ( 
    <div className="w-full bg-black h-10 text-white flex items-center justify-center">
        <Link to="/" className="decoration-white text-white">MONOPOLY</Link>
        
    </div> );
}

export default Navbar;