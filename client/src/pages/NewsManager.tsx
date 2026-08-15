import { useState, useMemo, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertNewsArticleSchema, type NewsArticle } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Newspaper,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Upload,
  X,
  ImageOff,
} from "lucide-react";

const NEWS_BUCKET = "news-images";
const NEWS_LIST_KEY = ["supabase", "news_articles", "manager-list"] as const;
const PUBLIC_NEWS_KEY = ["supabase", "news_articles", "latest", 6] as const;

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

const formSchema = insertNewsArticleSchema.extend({
  title: z.string().min(1, "Title is required").max(200, "Title is too long"),
  slug: z
    .string()
    .max(120, "Slug is too long")
    .regex(/^[a-z0-9-]*$/, "Slug must only contain lowercase letters, numbers, and hyphens")
    .optional()
    .nullable(),
  summary: z.string().max(500, "Summary is too long").optional().nullable(),
  body: z.string().optional().nullable(),
  league: z.string().max(100, "League is too long").optional().nullable(),
  source_url: z
    .string()
    .url("Must be a valid URL")
    .or(z.literal(""))
    .optional()
    .nullable(),
  image_url: z.string().optional().nullable(),
  is_published: z.boolean().default(true),
});

type FormValues = z.infer<typeof formSchema>;

const DEFAULT_FORM_VALUES: FormValues = {
  title: "",
  slug: "",
  summary: "",
  body: "",
  league: "",
  source_url: "",
  image_url: "",
  is_published: true,
};

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function extractStoragePath(publicUrl: string | null | undefined): string | null {
  if (!publicUrl) return null;
  const marker = `/storage/v1/object/public/${NEWS_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(publicUrl.substring(idx + marker.length));
}

export default function NewsManager() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<NewsArticle | null>(null);
  const [pendingDelete, setPendingDelete] = useState<NewsArticle | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const articlesQuery = useQuery<NewsArticle[]>({
    queryKey: NEWS_LIST_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("news_articles")
        .select(
          "id, title, slug, summary, body, image_url, source_url, league, published_at, is_published",
        )
        .order("published_at", { ascending: false });
      if (error) throw error;
      return (data || []) as NewsArticle[];
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  });

  // Reset form whenever the dialog opens for a new/edit target
  useEffect(() => {
    if (!dialogOpen) return;
    if (editingArticle) {
      form.reset({
        title: editingArticle.title ?? "",
        slug: (editingArticle as any).slug ?? "",
        summary: editingArticle.summary ?? "",
        body: editingArticle.body ?? "",
        league: editingArticle.league ?? "",
        source_url: editingArticle.source_url ?? "",
        image_url: editingArticle.image_url ?? "",
        is_published: editingArticle.is_published ?? true,
      });
      setImagePreview(editingArticle.image_url ?? null);
    } else {
      form.reset(DEFAULT_FORM_VALUES);
      setImagePreview(null);
    }
    setImageFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, editingArticle?.id]);

  const invalidateLists = () => {
    queryClient.invalidateQueries({ queryKey: NEWS_LIST_KEY });
    queryClient.invalidateQueries({ queryKey: PUBLIC_NEWS_KEY });
  };

  const uploadImageIfNeeded = async (
    currentImageUrl: string | null | undefined,
  ): Promise<string | null> => {
    if (!imageFile) return currentImageUrl ?? null;

    setUploadingImage(true);
    try {
      const ext = (imageFile.name.split(".").pop() || "jpg").toLowerCase();
      const safeExt = ext.replace(/[^a-z0-9]/g, "") || "jpg";
      const filePath = `articles/${crypto.randomUUID()}.${safeExt}`;

      const { error: uploadError } = await supabase.storage
        .from(NEWS_BUCKET)
        .upload(filePath, imageFile, {
          upsert: false,
          contentType: imageFile.type || undefined,
        });

      if (uploadError) throw uploadError;

      // If there was a previous image we own, remove it.
      const previousPath = extractStoragePath(currentImageUrl);
      if (previousPath) {
        await supabase.storage.from(NEWS_BUCKET).remove([previousPath]);
      }

      const { data } = supabase.storage.from(NEWS_BUCKET).getPublicUrl(filePath);
      return data.publicUrl;
    } finally {
      setUploadingImage(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const imageUrl = await uploadImageIfNeeded(editingArticle?.image_url);

      const payload = {
        title: values.title.trim(),
        slug: values.slug?.trim() || undefined,
        summary: values.summary?.trim() || null,
        body: values.body?.trim() || null,
        league: values.league?.trim() || null,
        source_url: values.source_url?.trim() || null,
        image_url: imageUrl || null,
        is_published: !!values.is_published,
      };

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const authHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      if (editingArticle) {
        const res = await fetch(`/api/news-articles/${editingArticle.id}`, {
          method: "PATCH",
          headers: authHeaders,
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Save failed"); }
      } else {
        const res = await fetch("/api/news-articles", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Save failed"); }
      }
    },
    onSuccess: () => {
      invalidateLists();
      toast({
        title: editingArticle ? "Article updated" : "Article published",
        description: editingArticle
          ? "Your changes are live."
          : "The article was added to the news list.",
      });
      setDialogOpen(false);
      setEditingArticle(null);
    },
    onError: (err: any) => {
      toast({
        title: "Save failed",
        description: err?.message || "Could not save the article.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (article: NewsArticle) => {
      const path = extractStoragePath(article.image_url);
      if (path) {
        await supabase.storage.from(NEWS_BUCKET).remove([path]);
      }
      const { error } = await supabase
        .from("news_articles")
        .delete()
        .eq("id", article.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateLists();
      toast({
        title: "Article deleted",
        description: "The article has been removed.",
      });
      setPendingDelete(null);
    },
    onError: (err: any) => {
      toast({
        title: "Delete failed",
        description: err?.message || "Could not delete the article.",
        variant: "destructive",
      });
    },
  });

  const articles = articlesQuery.data ?? [];
  const isLoading = articlesQuery.isLoading;
  const isError = articlesQuery.isError;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setImageFile(f);
    if (f) {
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview(ev.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setImagePreview(editingArticle?.image_url ?? null);
    }
  };

  const handleClearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    form.setValue("image_url", "");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onSubmit = (values: FormValues) => {
    saveMutation.mutate(values);
  };

  const sortedArticles = useMemo(() => {
    return [...articles].sort((a, b) => {
      const ta = a.published_at ? new Date(a.published_at).getTime() : 0;
      const tb = b.published_at ? new Date(b.published_at).getTime() : 0;
      return tb - ta;
    });
  }, [articles]);

  const submitting = saveMutation.isPending || uploadingImage;

  return (
    <div className="bg-white min-h-screen py-12 sm:py-16">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex items-center justify-between w-full mb-6">
          <Button
            variant="outline"
            onClick={() => navigate("/dashboard")}
            className="border-orange-200 text-orange-700 hover:bg-orange-50 hover:border-orange-300"
            data-testid="button-back-dashboard"
          >
            ← Back to Dashboard
          </Button>
          <Button
            className="bg-orange-600 hover:bg-orange-700 text-white"
            onClick={() => {
              setEditingArticle(null);
              setDialogOpen(true);
            }}
            data-testid="button-new-article"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Article
          </Button>
        </div>

        <div className="flex items-center gap-3 mb-2">
          <div className="h-12 w-12 rounded-full bg-orange-600 flex items-center justify-center">
            <Newspaper className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900">
              News Manager
            </h1>
            <p className="text-slate-600 text-sm sm:text-base">
              Create, edit, and remove articles shown in the public Latest News section.
            </p>
          </div>
        </div>

        <Card className="mt-8 border-orange-100 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-orange-900 text-lg">
              All Articles
              {!isLoading && (
                <span className="ml-2 text-sm font-normal text-slate-500">
                  ({sortedArticles.length})
                </span>
              )}
            </CardTitle>
            <CardDescription>Newest first. Drafts are hidden from the public site.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3" data-testid="news-list-loading">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="flex items-center gap-4 p-3 rounded-lg border border-orange-100"
                  >
                    <Skeleton className="h-16 w-24 rounded-md" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                    <Skeleton className="h-9 w-20" />
                  </div>
                ))}
              </div>
            ) : isError ? (
              <div
                className="rounded-lg border border-red-200 bg-red-50 p-6 text-center"
                data-testid="news-list-error"
              >
                <p className="font-medium text-red-700">Couldn't load articles</p>
                <p className="text-sm text-red-600 mt-1">
                  {(articlesQuery.error as any)?.message || "Please try again."}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => articlesQuery.refetch()}
                >
                  Retry
                </Button>
              </div>
            ) : sortedArticles.length === 0 ? (
              <div
                className="rounded-lg border border-dashed border-orange-200 p-10 text-center"
                data-testid="news-list-empty"
              >
                <Newspaper className="h-8 w-8 text-orange-400 mx-auto mb-3" />
                <p className="font-medium text-slate-700">No articles yet</p>
                <p className="text-sm text-slate-500 mt-1">
                  Create your first story to populate the Latest News section.
                </p>
                <Button
                  className="mt-4 bg-orange-600 hover:bg-orange-700 text-white"
                  onClick={() => {
                    setEditingArticle(null);
                    setDialogOpen(true);
                  }}
                  data-testid="button-empty-new-article"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Article
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-orange-50" data-testid="news-list">
                {sortedArticles.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-4 py-4"
                    data-testid={`news-item-${a.id}`}
                  >
                    <div className="h-16 w-24 flex-shrink-0 rounded-md overflow-hidden bg-orange-50 border border-orange-100 flex items-center justify-center">
                      {a.image_url ? (
                        <img
                          src={a.image_url}
                          alt={a.title}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <ImageOff className="h-6 w-6 text-orange-300" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {a.league && (
                          <Badge
                            variant="secondary"
                            className="bg-orange-100 text-orange-700 hover:bg-orange-100"
                          >
                            {a.league}
                          </Badge>
                        )}
                        <Badge
                          variant={a.is_published ? "default" : "outline"}
                          className={
                            a.is_published
                              ? "bg-green-600 hover:bg-green-600 text-white"
                              : "text-slate-500 border-slate-300"
                          }
                        >
                          {a.is_published ? "Published" : "Draft"}
                        </Badge>
                        <span className="text-xs text-slate-500">
                          {formatDate(a.published_at)}
                        </span>
                      </div>
                      <p className="font-semibold text-slate-900 truncate">
                        {a.title}
                      </p>
                      {a.summary && (
                        <p className="text-sm text-slate-600 line-clamp-1">
                          {a.summary}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingArticle(a);
                          setDialogOpen(true);
                        }}
                        data-testid={`button-edit-${a.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => setPendingDelete(a)}
                        data-testid={`button-delete-${a.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (submitting) return;
          setDialogOpen(open);
          if (!open) setEditingArticle(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingArticle ? "Edit Article" : "New Article"}
            </DialogTitle>
            <DialogDescription>
              {editingArticle
                ? "Update the article details and save your changes."
                : "Add a new story that will appear in the Latest News section."}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-4"
              data-testid="form-article"
            >
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Lions clinch the season finale"
                        {...field}
                        value={field.value ?? ""}
                        data-testid="input-title"
                        onChange={(e) => {
                          field.onChange(e);
                          const current = form.getValues("slug") ?? "";
                          if (!current || current === generateSlug(field.value ?? "")) {
                            form.setValue("slug", generateSlug(e.target.value), {
                              shouldValidate: false,
                            });
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>URL Slug</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="lions-clinch-season-finale-2026"
                        {...field}
                        value={field.value ?? ""}
                        data-testid="input-slug"
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Auto-generated from title. Used in the article URL:{" "}
                      <span className="font-mono text-orange-700">
                        /news/{form.watch("slug") || "your-slug-here"}
                      </span>
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="summary"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Summary</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Short blurb shown on the news cards"
                        rows={2}
                        {...field}
                        value={field.value ?? ""}
                        data-testid="input-summary"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="body"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Body</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Full article body (plain text)"
                        rows={6}
                        {...field}
                        value={field.value ?? ""}
                        data-testid="input-body"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="league"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>League</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Premier League"
                          {...field}
                          value={field.value ?? ""}
                          data-testid="input-league"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="source_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Source URL</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://example.com/article"
                          type="url"
                          {...field}
                          value={field.value ?? ""}
                          data-testid="input-source-url"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="is_published"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border border-orange-100 p-3">
                    <div>
                      <FormLabel className="text-base">Published</FormLabel>
                      <FormDescription>
                        Show this article on the public site.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={!!field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-published"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div>
                <label className="block text-sm font-medium mb-1">
                  Image
                </label>
                <div className="rounded-lg border border-orange-100 p-3 space-y-3">
                  {imagePreview ? (
                    <div className="relative inline-block">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="h-32 w-auto rounded-md border border-orange-100 object-cover"
                        data-testid="img-article-preview"
                      />
                      <button
                        type="button"
                        onClick={handleClearImage}
                        className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow"
                        aria-label="Remove image"
                        data-testid="button-clear-image"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500">
                      No image selected. Upload a file from your device.
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="block w-full text-sm text-gray-600
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-md file:border-0
                      file:text-sm file:font-semibold
                      file:bg-orange-100 file:text-orange-700
                      hover:file:bg-orange-200 cursor-pointer"
                    data-testid="input-image-file"
                  />
                  {uploadingImage && (
                    <p className="text-xs text-orange-700 flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Uploading image…
                    </p>
                  )}
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={submitting}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                  disabled={submitting}
                  data-testid="button-save"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      {editingArticle ? "Save Changes" : "Publish Article"}
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this article?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? (
                <>
                  "{pendingDelete.title}" will be permanently removed
                  {pendingDelete.image_url ? ", along with its uploaded image" : ""}.
                  This can't be undone.
                </>
              ) : (
                "This can't be undone."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleteMutation.isPending}
              data-testid="button-cancel-delete"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (pendingDelete) deleteMutation.mutate(pendingDelete);
              }}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
