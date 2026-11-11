'use client';

import React, { useState, useRef } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { uploadAuthHeaders } from "@/lib/uploadImage";

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
  folder?: string;
}

export function ImageUploader({ value, onChange }: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (JPEG, PNG, etc.)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5MB');
      return;
    }

    setError(null);
    setIsUploading(true);
    setProgress(10); // Start progress indicator

    try {
      const formData = new FormData();
      formData.append('image', file);

      setProgress(30);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
        headers: await uploadAuthHeaders(),
      });

      setProgress(80);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }

      const data = await response.json();
      setProgress(100);
      onChange(data.url);
    } catch (err: any) {
      console.error('Upload failed:', err);
      setError(err.message || 'Failed to upload image. Please try again.');
    } finally {
      setIsUploading(false);
      setProgress(0);
    }
  };

  const clearImage = () => {
    onChange('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-500 font-medium">{error}</p>}

      {value ? (
        <div className="relative group rounded-xl overflow-hidden border border-border aspect-video bg-muted flex items-center justify-center">
          <img 
            src={value} 
            alt="Uploaded preview" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Button 
              type="button" 
              variant="destructive" 
              onClick={clearImage}
              className="gap-2"
            >
              <X className="w-4 h-4" /> Remove Image
            </Button>
          </div>
        </div>
      ) : (
        <div 
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 transition-colors cursor-pointer aspect-video
            ${isUploading ? 'bg-muted border-muted' : 'border-border hover:bg-secondary/5 hover:border-violet-400'}`}
        >
          {isUploading ? (
            <>
              <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
              <div className="text-center">
                <p className="text-sm font-medium">Uploading... {Math.round(progress)}%</p>
                <p className="text-xs text-muted-foreground mt-1">Please wait</p>
              </div>
            </>
          ) : (
            <>
              <div className="w-12 h-12 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 dark:text-violet-400">
                <Upload className="w-6 h-6" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">Click to upload cover photo</p>
                <p className="text-xs text-muted-foreground mt-1">JPG, PNG or WEBP (Max 5MB)</p>
              </div>
            </>
          )}
        </div>
      )}
      
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept="image/*" 
        className="hidden" 
      />
    </div>
  );
}
