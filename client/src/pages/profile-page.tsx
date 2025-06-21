import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState("");
  const [profileUrl, setProfileUrl] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) return setMessage("Error loading user");

      setUser(userData.user);
      setEmail(userData.user.email);

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userData.user.id)
        .single();

      if (data) {
        setName(data.name || "");
        setBio(data.bio || "");
        setProfileUrl(data.profile_url || "");
        setIsPublic(data.is_public || false);
      }
    };

    fetchProfile();
  }, []);

  const handleSave = async () => {
    if (!user) return;

    const updates = {
      id: user.id,
      name,
      bio,
      profile_url: profileUrl,
      is_public: isPublic,
      updated_at: new Date(),
    };

    const { error } = await supabase.from("profiles").upsert(updates);
    setMessage(error ? `❌ ${error.message}` : "✅ Profile updated.");
  };

  const handleChangePassword = async () => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setMessage(error ? `❌ ${error.message}` : "✅ Password changed.");
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Profile</h1>

      {message && <p className="text-sm text-gray-600">{message}</p>}

      <div>
        <label className="block text-sm mb-1">Name</label>
        <input
          className="border p-2 w-full"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm mb-1">Email (read-only)</label>
        <input className="border p-2 w-full bg-gray-100" value={email} disabled />
      </div>

      <div>
        <label className="block text-sm mb-1">Bio</label>
        <textarea
          className="border p-2 w-full"
          rows={3}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm mb-1">Profile Image URL</label>
        <input
          className="border p-2 w-full"
          value={profileUrl}
          onChange={(e) => setProfileUrl(e.target.value)}
        />
        {profileUrl && (
          <img
            src={profileUrl}
            alt="Profile"
            className="mt-2 w-24 h-24 object-cover rounded-full border"
          />
        )}
      </div>

      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={() => setIsPublic(!isPublic)}
        />
        <label>Make profile public</label>
      </div>

      <button
        onClick={handleSave}
        className="bg-blue-600 text-white px-4 py-2 rounded"
      >
        Save Profile
      </button>

      <hr />

      <h2 className="text-xl font-semibold">Change Password</h2>
      <div>
        <input
          type="password"
          placeholder="New Password"
          className="border p-2 w-full mb-2"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <button
          onClick={handleChangePassword}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Update Password
                  </button>
                </div>
              </div>
            );
          }