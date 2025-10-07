import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";

const BASE = import.meta.env.VITE_BACKEND_URL;

export default function UploadSection() {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file || !user) return;

      setUploading(true);
      setMessage("Uploading...");


      const safeName = file.name
          .toLowerCase()
          .replace(/\s+/g, "_")         // Replace spaces
          .replace(/[^a-z0-9_.-]/g, ""); // Remove any non-safe chars

        const filePath = `${user.id}/${safeName}`;


      console.log("User:", user);
      console.log("File path:", filePath);

      const { error } = await supabase.storage
        .from("user-uploads")
        .upload(filePath, file, {
          cacheControl: "3600",
          //upsert: true,
          contentType: "application/pdf",
        });
      console.log("Uploading file:", file.name, file.size, file.type);


      if (error) {
        setMessage("Upload failed: " + error.message);
        setUploading(false);
        return;
      }

      setMessage("Upload successful. Starting parse...");
      setUploadedFile(file.name);

      const res = await fetch(`${BASE}/api/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          file_path: filePath,
        }),
      });

      if (res.ok) {
        setMessage("Parsing complete! ✅");
      } else {
        setMessage("Parsing failed ❌");
      }

      setUploading(false);
    },
    [user]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [] },
    multiple: false,
  });

  return (
    <section className="p-4 md:p-6 bg-gray-50 border-t border-b text-center">
      <h2 className="text-lg md:text-xl font-semibold mb-2">Upload FIBA PDF</h2>
      <p className="text-sm md:text-base text-gray-600 mb-4 md:mb-6">Upload below to get the chatbot going ⚡</p>

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-6 md:p-8 transition-all cursor-pointer duration-200 ${
          isDragActive
            ? "border-orange-400 bg-orange-100"
            : "border-gray-300 bg-white hover:bg-orange-50"
        }`}
      >
        <input {...getInputProps()} />
        {isDragActive ? (
          <p className="text-sm md:text-base text-orange-500 font-medium">Drop the PDF here...</p>
        ) : (
          <p className="text-sm md:text-base text-gray-500">
            Drag & drop a PDF here, or <span className="text-swish-dark underline">click to browse</span>
          </p>
        )}
      </div>

      {uploading && <p className="mt-3 md:mt-4 text-xs md:text-sm text-gray-600">Uploading...</p>}
      {message && <p className="mt-2 text-xs md:text-sm text-gray-700">{message}</p>}
      {uploadedFile && (
        <div className="mt-3 md:mt-4 text-xs md:text-sm text-green-700 font-medium">
          Uploaded: {uploadedFile} ✅
        </div>
      )}
    </section>
  );
}
