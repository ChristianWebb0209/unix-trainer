import { useNavigate } from "react-router-dom";

export default function Home() {
    const navigate = useNavigate();
    return (
        <div className="home-container" style={{ textAlign: "center", padding: "4rem" }}>
            <h1>Welcome to Unix Trainer</h1>
            <p>Sharpen your Bash, Awk, and Unix skills with hands-on practice.</p>
            <button
                style={{ marginTop: "2rem", padding: "1rem 2rem", fontSize: "1.2rem" }}
                onClick={() => navigate("/editor")}
            >
                Load Editor
            </button>
        </div>
    );
}
