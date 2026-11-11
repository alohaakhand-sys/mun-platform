"use client";

import { useState } from "react";
import { X, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  max?: number;
  className?: string;
}

/** Chip-style multi-value input. Add on Enter/comma, remove via the chip's ×. */
export function TagInput({ value, onChange, placeholder, max = 30, className }: TagInputProps) {
  const [draft, setDraft] = useState("");

  const addTag = (raw: string) => {
    const tag = raw.trim().replace(/,$/, "").trim();
    if (!tag) return;
    if (value.some((v) => v.toLowerCase() === tag.toLowerCase())) {
      setDraft("");
      return;
    }
    if (value.length >= max) return;
    onChange([...value, tag]);
    setDraft("");
  };

  const removeTag = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  return (
    <div className={cn("space-y-2", className)}>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag, i) => (
            <Badge key={`${tag}-${i}`} variant="secondary" className="gap-1 pr-1">
              {tag}
              <button
                type="button"
                onClick={() => removeTag(i)}
                className="rounded-full p-0.5 hover:bg-foreground/10"
                aria-label={`Remove ${tag}`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag(draft);
            } else if (e.key === "Backspace" && !draft && value.length) {
              removeTag(value.length - 1);
            }
          }}
          placeholder={placeholder || "Type and press Enter"}
        />
        <button
          type="button"
          onClick={() => addTag(draft)}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-input px-2.5 text-sm font-medium hover:bg-secondary/40"
        >
          <Plus className="size-3.5" /> Add
        </button>
      </div>
    </div>
  );
}
