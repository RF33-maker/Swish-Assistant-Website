import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Edit2, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface EditableDescriptionProps {
  description: string | null;
  onSave: (newDescription: string) => Promise<void>;
  placeholder?: string;
  canEdit: boolean;
}

export function EditableDescription({
  description,
  onSave,
  placeholder = "Add a description to improve SEO and help visitors learn more...",
  canEdit
}: EditableDescriptionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedDescription, setEditedDescription] = useState(description || "");
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(editedDescription);
      setIsEditing(false);
      toast({
        title: "Success",
        description: "Description updated successfully",
      });
    } catch (error) {
      console.error("Error saving description:", error);
      toast({
        title: "Error",
        description: "Failed to update description",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedDescription(description || "");
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="space-y-3">
        <Textarea
          value={editedDescription}
          onChange={(e) => setEditedDescription(e.target.value)}
          placeholder={placeholder}
          className="min-h-[120px] border-orange-200 focus:border-orange-400"
          data-testid="textarea-description"
        />
        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            size="sm"
            className="bg-orange-600 hover:bg-orange-700"
            data-testid="button-save-description"
          >
            <Save className="h-4 w-4 mr-1" />
            {isSaving ? "Saving..." : "Save"}
          </Button>
          <Button
            onClick={handleCancel}
            disabled={isSaving}
            size="sm"
            variant="outline"
            className="border-orange-200"
            data-testid="button-cancel-edit"
          >
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative group">
      {description ? (
        <p className="text-gray-700 leading-relaxed whitespace-pre-wrap" data-testid="text-description">
          {description}
        </p>
      ) : canEdit ? (
        <p className="text-gray-400 italic" data-testid="text-no-description">
          {placeholder}
        </p>
      ) : null}
      
      {canEdit && (
        <Button
          onClick={() => setIsEditing(true)}
          size="sm"
          variant="outline"
          className="mt-3 border-orange-200 hover:bg-orange-50"
          data-testid="button-edit-description"
        >
          <Edit2 className="h-4 w-4 mr-1" />
          {description ? "Edit Description" : "Add Description"}
        </Button>
      )}
    </div>
  );
}
