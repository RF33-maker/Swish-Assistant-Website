import { useRef, useState } from "react";
import { ImagePlus, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isImageFile, uploadNewsImage } from "@/lib/newsArticles";

/**
 * The article's cover: shown at the top of the article, on news cards and in
 * link previews. Uploads as soon as a file is chosen or dropped; the article
 * only points at it once it's saved.
 */
export default function CoverImageField({
  imageUrl,
  alt,
  credit,
  onImageChange,
  onAltChange,
  onCreditChange,
}: {
  imageUrl: string | null;
  alt: string;
  credit: string;
  onImageChange: (url: string | null) => void;
  onAltChange: (alt: string) => void;
  onCreditChange: (credit: string) => void;
}) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      onImageChange(await uploadNewsImage(file, "articles"));
    } catch (err: any) {
      toast({ title: "Cover image not added", description: err?.message || "The image couldn't be uploaded.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      upload(Array.from(e.dataTransfer.files).find(isImageFile));
    },
  };

  return (
    <div>
      {imageUrl ? (
        <div {...dropHandlers}>
          <div className="group relative overflow-hidden rounded-[14px] border border-[color:var(--ch-border)] bg-[color:var(--ch-surface-3)]">
            <img src={imageUrl} alt={alt} className="block h-auto w-full" data-testid="img-cover-preview" />
            {(uploading || dragging) && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-sm font-medium text-white">
                {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : "Drop to replace"}
              </div>
            )}
            <div className="absolute right-3 top-3 flex gap-2 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
              <button
                type="button"
                className="flex h-9 items-center gap-1.5 rounded-lg bg-black/65 px-3 text-[13px] font-semibold text-white hover:bg-black/80"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Replace
              </button>
              <button
                type="button"
                className="flex h-9 items-center gap-1.5 rounded-lg bg-black/65 px-3 text-[13px] font-semibold text-white hover:bg-black/80"
                onClick={() => onImageChange(null)}
                disabled={uploading}
                data-testid="button-remove-cover"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            </div>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_200px]">
            <input
              className="ch-input h-9 w-full px-3 text-[13px]"
              value={alt}
              maxLength={300}
              placeholder="Describe the image for people who can't see it"
              aria-label="Cover image description (alt text)"
              onChange={(e) => onAltChange(e.target.value)}
              data-testid="input-cover-alt"
            />
            <input
              className="ch-input h-9 w-full px-3 text-[13px]"
              value={credit}
              maxLength={200}
              placeholder="Photo credit"
              aria-label="Cover photo credit"
              onChange={(e) => onCreditChange(e.target.value)}
              data-testid="input-cover-credit"
            />
          </div>
        </div>
      ) : (
        <button
          type="button"
          {...dropHandlers}
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-[14px] border-2 border-dashed px-6 py-9 text-center transition-colors ${
            dragging
              ? "border-[color:var(--ch-accent)] bg-[color:var(--ch-accent-soft)]"
              : "border-[color:var(--ch-border-strong)] hover:border-[color:var(--ch-accent)] hover:bg-[color:var(--ch-surface-2)]"
          }`}
          data-testid="button-add-cover"
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ch-muted)]" />
          ) : (
            <ImagePlus className="h-6 w-6 text-[color:var(--ch-muted)]" />
          )}
          <span className="text-[14px] font-semibold text-[color:var(--ch-text)]">{uploading ? "Uploading…" : "Add a cover image"}</span>
          <span className="text-[12.5px] text-[color:var(--ch-muted)]">Drop one here or click to choose. JPG, PNG or WebP.</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          upload(file);
        }}
        data-testid="input-cover-file"
      />
    </div>
  );
}
