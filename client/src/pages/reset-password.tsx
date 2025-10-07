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
    <div className="min-h-screen flex items-center justify-center p-4 md:p-6 bg-gradient-to-br from-orange-100 via-white to-white">
      <div className="w-full max-w-full md:max-w-md bg-white p-6 md:p-8 rounded-xl shadow-md border border-gray-200">
        <h1 className="text-xl md:text-2xl font-semibold mb-4 md:mb-6 text-center text-gray-800">Reset Your Password</h1>

        <input
          type="password"
          placeholder="New password"
          onChange={(e) => setNewPassword(e.target.value)}
          className="border border-gray-300 p-2 md:p-3 mb-3 md:mb-4 w-full rounded-md text-sm md:text-base focus:ring-orange-300 focus:border-orange-400"
        />
        <button
          onClick={handleSubmit}
          className="bg-[#FFC285] hover:bg-[#ffb76c] text-white px-4 py-2 md:py-3 w-full rounded-md font-medium text-sm md:text-base transition"
        >
          Submit
        </button>

        {error && <p className="text-red-500 mt-3 md:mt-4 text-sm md:text-base text-center">{error}</p>}
      </div>
    </div>
  );
}


