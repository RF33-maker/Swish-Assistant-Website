import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

export default function ResetPassword() {
  const [token, setToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [, navigate] = useLocation(); // <-- navigate function

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace("#", "?"));
    const token = params.get("access_token");

    if (token) {
      supabase.auth
        .setSession({ access_token: token, refresh_token: "" })
        .then(({ error }) => {
          if (error) setError("Failed to set session.");
          else setToken(token);
        });
    } else {
      setError("Missing access token.");
    }
  }, []);

  const handleSubmit = async () => {
    if (!token) {
      setError("Missing token.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      setError(error.message);
    } else {
      // Redirect after 1.5 seconds
      setTimeout(() => {
        navigate("/auth");
      }, 1500);
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto">
      <h1 className="text-xl font-semibold mb-4">Reset Your Password</h1>

      <input
        type="password"
        placeholder="New password"
        onChange={(e) => setNewPassword(e.target.value)}
        className="border p-2 mb-2 w-full"
      />
      <button
        onClick={handleSubmit}
        className="bg-blue-500 text-white px-4 py-2 w-full rounded"
      >
        Submit
      </button>

      {error && <p className="text-red-500 mt-2">{error}</p>}
    </div>
  );
}


