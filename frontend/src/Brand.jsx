import { Link } from "react-router-dom";
export default function Brand({ light = false }) {
  return (
    <Link
      to="/"
      className={`brand ${light ? "brand-light" : ""}`}
      aria-label="Dhaka Tesla Pool home"
    >
      <span className="brand-mark">
        D<span>•</span>
      </span>
      <span className="brand-name">
        DHAKA <strong>TESLA</strong> POOL
      </span>
    </Link>
  );
}
