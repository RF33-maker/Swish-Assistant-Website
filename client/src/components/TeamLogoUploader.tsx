import { useState } from "react";
import type { ReactNode } from "react";
import React from "react";
import Uppy from "@uppy/core";
import { DashboardModal } from "@uppy/react";
import "@uppy/core/dist/style.min.css";
import "@uppy/dashboard/dist/style.min.css";
import AwsS3 from "@uppy/aws-s3";
import type { UploadResult } from "@uppy/core";
import { Button } from "@/components/ui/button";

interface TeamLogoUploaderProps {
  leagueId: string;
  teamName: string;
  onUploadComplete?: (logoUrl: string) => void;
  buttonClassName?: string;
  children: ReactNode;
}

/**
 * A team logo upload component that renders as a button and provides a modal interface for
 * uploading team logos. Only for use by league owners.
 * 
 * Features:
 * - Renders as a customizable button that opens a file upload modal
 * - Provides a modal interface for team logo file selection and upload
 * - Automatically saves the logo association to the database after upload
 * 
 * @param props - Component props
 * @param props.leagueId - The ID of the league the team belongs to
 * @param props.teamName - The name of the team to upload logo for
 * @param props.onUploadComplete - Callback function called when upload and DB save is complete
 * @param props.buttonClassName - Optional CSS class name for the button
 * @param props.children - Content to be rendered inside the button
 */
export function TeamLogoUploader({
  leagueId,
  teamName,
  onUploadComplete,
  buttonClassName,
  children,
}: TeamLogoUploaderProps) {
  const [showModal, setShowModal] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleGetUploadParameters = async () => {
    try {
      const response = await fetch('/api/team-logos/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to get upload URL');
      }

      const data = await response.json();
      return {
        method: 'PUT' as const,
        url: data.uploadURL,
      };
    } catch (error) {
      console.error('Error getting upload parameters:', error);
      throw error;
    }
  };

  const handleComplete = async (result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => {
    setUploading(true);
    try {
      // Get the uploaded file URL
      const uploadedFile = result.successful?.[0];
      if (uploadedFile && uploadedFile.uploadURL) {
        // Save the logo assignment to the database
        const response = await fetch('/api/team-logos', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            leagueId,
            teamName,
            logoUrl: uploadedFile.uploadURL,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to save team logo');
        }

        const savedLogo = await response.json();
        
        // Close the modal
        setShowModal(false);
        
        // Call the completion callback
        onUploadComplete?.(savedLogo.logoPath);
      }
    } catch (error) {
      console.error('Error saving team logo:', error);
    } finally {
      setUploading(false);
    }
  };

  const [uppy] = useState(() =>
    new Uppy({
      restrictions: {
        maxNumberOfFiles: 1,
        maxFileSize: 5242880, // 5MB
        allowedFileTypes: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
      },
      autoProceed: false,
    })
      .use(AwsS3, {
        shouldUseMultipart: false,
        getUploadParameters: handleGetUploadParameters,
      })
      .on("complete", handleComplete)
  );

  return (
    <div>
      <Button 
        onClick={() => setShowModal(true)} 
        className={buttonClassName}
        disabled={uploading}
      >
        {uploading ? "Saving..." : children}
      </Button>

      <DashboardModal
        uppy={uppy}
        open={showModal}
        onRequestClose={() => setShowModal(false)}
        proudlyDisplayPoweredByUppy={false}
        note={`Upload logo for ${teamName}`}
      />
    </div>
  );
}