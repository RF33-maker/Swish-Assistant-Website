import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function SettingsPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleChangePassword = async () => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) setMessage(`❌ ${error.message}`);
    else setMessage("✅ Password updated successfully.");
  };

  return (
    <div className="p-6 max-w-md mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Change Password</h1>

      <input
        type="password"
        placeholder="New Password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        className="border p-2 w-full mb-4"
      />
      <button
        onClick={handleChangePassword}
        className="bg-blue-600 text-white px-4 py-2 rounded w-full"
      >
        Update Password
      </button>
      {message && <p className="mt-4 text-sm">{message}</p>}
    </div>
  );
}
