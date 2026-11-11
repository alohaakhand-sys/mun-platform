"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { getHTMLFromFragment } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import Paragraph from "@tiptap/extension-paragraph";
import Heading from "@tiptap/extension-heading";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TiptapImage from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { Markdown } from "tiptap-markdown";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3, List, ListOrdered, Quote, Code, Link2, Undo2, Redo2,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, ImagePlus, Loader2, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AiToolbarMenu, AiSelectionBubble, type EditorAiConfig } from "@/components/features/shared/RichTextEditorAi";
import { uploadAuthHeaders } from "@/lib/uploadImage";

export type { EditorAiConfig };

// Word / Google-Docs style WYSIWYG surface. Authors visually (live bold/underline,
// alignment, inline images, Ctrl+B/I/U shortcuts, ribbon toolbar) but the value in/out
// is always markdown, so storage, chair-review rendering, .md download and PDF import
// stay unchanged.

// Markdown has no alignment syntax and the default paragraph/heading serializers drop
// node attributes — so a plainly-aligned block would lose its alignment on save. These
// extended nodes emit the whole block as raw HTML (which tiptap-markdown html:true keeps
// and `marked` renders) when aligned, and fall back to normal markdown otherwise. Inner
// marks (bold/links) are serialized as HTML too, so they survive inside an aligned block.
function serializeAlignedAsHtml(state: any, node: any) {
  state.write(getHTMLFromFragment(Fragment.from(node), node.type.schema));
  state.closeBlock(node);
}

const MarkdownParagraph = Paragraph.extend({
  addStorage() {
    return {
      markdown: {
        serialize(this: any, state: any, node: any) {
          const align = node.attrs.textAlign;
          if (align && align !== "left") {
            serializeAlignedAsHtml(state, node);
          } else {
            state.renderInline(node);
            state.closeBlock(node);
          }
        },
        parse: {},
      },
    };
  },
});

const MarkdownHeading = Heading.extend({
  addStorage() {
    return {
      markdown: {
        serialize(this: any, state: any, node: any) {
          const align = node.attrs.textAlign;
          if (align && align !== "left") {
            serializeAlignedAsHtml(state, node);
          } else {
            state.write(state.repeat("#", node.attrs.level) + " ");
            state.renderInline(node);
            state.closeBlock(node);
          }
        },
        parse: {},
      },
    };
  },
});

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeightClass = "min-h-[320px]",
  ai,
}: {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  minHeightClass?: string;
  /** Enables the AI menu (toolbar) + selection bubble. Omit = no AI UI at all. */
  ai?: EditorAiConfig;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);

  const editor = useEditor({
    // Avoid SSR hydration mismatch — render the editor only on the client.
    immediatelyRender: false,
    extensions: [
      // Replace StarterKit's paragraph + heading with the alignment-aware markdown versions.
      StarterKit.configure({ paragraph: false, heading: false }),
      MarkdownParagraph,
      MarkdownHeading,
      Underline,
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer" } }),
      Placeholder.configure({ placeholder: placeholder || "Start writing…" }),
      TiptapImage.configure({ inline: false }),
      TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right", "justify"] }),
      Markdown.configure({ html: true, transformPastedText: true, linkify: true }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class: cn(
          "markdown-content focus:outline-none px-5 py-4 max-w-none overflow-auto max-h-[560px]",
          minHeightClass,
        ),
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.storage.markdown.getMarkdown());
    },
  });

  // Push external value changes (upload .md, import PDF, reset) into the editor without
  // clobbering the cursor on every keystroke — only when it genuinely differs.
  useEffect(() => {
    if (!editor) return;
    const current = editor.storage.markdown.getMarkdown();
    if (value !== current) {
      editor.commands.setContent(value || "", false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  // Image insert — images ONLY, reusing the app's existing Cloudinary upload endpoint.
  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file || !editor) return;
    if (!file.type.startsWith("image/")) {
      setImgError("Only image files are allowed (JPEG, PNG, GIF, WebP…).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImgError("Image must be under 5MB.");
      return;
    }
    setImgError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd, headers: await uploadAuthHeaders() });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Upload failed.");
      }
      const { url } = await res.json();
      editor.chain().focus().setImage({ src: url, alt: file.name }).run();
    } catch (err: any) {
      setImgError(err?.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-secondary/[0.04] overflow-hidden">
      <Toolbar editor={editor} uploading={uploading} onImageClick={() => fileInputRef.current?.click()} ai={ai} />
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
      {editor && ai && <AiSelectionBubble editor={editor} ai={ai} />}
      <EditorContent editor={editor} />
      {imgError && (
        <div className="flex items-start gap-2 border-t border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> <span>{imgError}</span>
        </div>
      )}
    </div>
  );
}

function Toolbar({ editor, uploading, onImageClick, ai }: { editor: Editor | null; uploading: boolean; onImageClick: () => void; ai?: EditorAiConfig }) {
  if (!editor) return null;

  const btn = (active: boolean) =>
    cn(
      "p-1.5 rounded transition-all text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-40 disabled:pointer-events-none",
      active && "bg-background text-foreground shadow-sm",
    );
  const Divider = () => <span className="w-px h-5 bg-border/60 mx-0.5" />;

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div className="sticky top-0 z-10 flex items-center gap-0.5 flex-wrap px-2 py-1.5 border-b border-border/50 bg-secondary">
      <button type="button" className={btn(false)} onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo (Ctrl+Z)"><Undo2 className="w-3.5 h-3.5" /></button>
      <button type="button" className={btn(false)} onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo (Ctrl+Y)"><Redo2 className="w-3.5 h-3.5" /></button>
      <Divider />
      <button type="button" className={btn(editor.isActive("bold"))} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (Ctrl+B)"><Bold className="w-3.5 h-3.5" /></button>
      <button type="button" className={btn(editor.isActive("italic"))} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (Ctrl+I)"><Italic className="w-3.5 h-3.5" /></button>
      <button type="button" className={btn(editor.isActive("underline"))} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline (Ctrl+U)"><UnderlineIcon className="w-3.5 h-3.5" /></button>
      <button type="button" className={btn(editor.isActive("strike"))} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough"><Strikethrough className="w-3.5 h-3.5" /></button>
      <Divider />
      <button type="button" className={btn(editor.isActive("heading", { level: 1 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1"><Heading1 className="w-3.5 h-3.5" /></button>
      <button type="button" className={btn(editor.isActive("heading", { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2"><Heading2 className="w-3.5 h-3.5" /></button>
      <button type="button" className={btn(editor.isActive("heading", { level: 3 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3"><Heading3 className="w-3.5 h-3.5" /></button>
      <Divider />
      <button type="button" className={btn(editor.isActive({ textAlign: "left" }))} onClick={() => editor.chain().focus().setTextAlign("left").run()} title="Align left"><AlignLeft className="w-3.5 h-3.5" /></button>
      <button type="button" className={btn(editor.isActive({ textAlign: "center" }))} onClick={() => editor.chain().focus().setTextAlign("center").run()} title="Align center"><AlignCenter className="w-3.5 h-3.5" /></button>
      <button type="button" className={btn(editor.isActive({ textAlign: "right" }))} onClick={() => editor.chain().focus().setTextAlign("right").run()} title="Align right"><AlignRight className="w-3.5 h-3.5" /></button>
      <button type="button" className={btn(editor.isActive({ textAlign: "justify" }))} onClick={() => editor.chain().focus().setTextAlign("justify").run()} title="Justify"><AlignJustify className="w-3.5 h-3.5" /></button>
      <Divider />
      <button type="button" className={btn(editor.isActive("bulletList"))} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list"><List className="w-3.5 h-3.5" /></button>
      <button type="button" className={btn(editor.isActive("orderedList"))} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list"><ListOrdered className="w-3.5 h-3.5" /></button>
      <button type="button" className={btn(editor.isActive("blockquote"))} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Quote"><Quote className="w-3.5 h-3.5" /></button>
      <button type="button" className={btn(editor.isActive("codeBlock"))} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Code block"><Code className="w-3.5 h-3.5" /></button>
      <Divider />
      <button type="button" className={btn(editor.isActive("link"))} onClick={setLink} title="Link"><Link2 className="w-3.5 h-3.5" /></button>
      <button type="button" className={btn(false)} onClick={onImageClick} disabled={uploading} title="Insert image (upload)">
        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
      </button>
      {ai && (
        <>
          <Divider />
          <AiToolbarMenu editor={editor} ai={ai} />
        </>
      )}
    </div>
  );
}
