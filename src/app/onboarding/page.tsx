"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { DateField } from "@/components/ui/DateTimePicker";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase/client";
import { doc, setDoc } from "firebase/firestore";
import { saveMyContact } from "@/lib/services/userService";
import { Loader2, Camera, X, User, Mail, Calendar, Phone, ArrowRight } from "lucide-react";
import { uploadAuthHeaders } from "@/lib/uploadImage";

function FieldLabel({ icon: Icon, children, required }: { icon: React.ElementType; children: React.ReactNode; required?: boolean }) {
  return (
    <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <Icon className="w-3.5 h-3.5" /> {children}
      {required && <span className="text-primary">*</span>}
    </Label>
  );
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.15 } },
};

const field = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export default function OnboardingPage() {
  const { user, profile, loading: authLoading, refreshProfile } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    dob: "",
    phoneNumber: "",
    photoURL: "",
  });

  const todayStr = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!authLoading && profile?.onboardingComplete) {
      router.push("/dashboard");
    }
  }, [profile, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    const googlePhoto = user.photoURL || "";
    const display = user.displayName || "";
    const [gFirst, ...gRest] = display.trim().split(/\s+/);
    setFormData((prev) => ({
      ...prev,
      email: user.email || prev.email,
      photoURL: prev.photoURL || googlePhoto,
      firstName: prev.firstName || gFirst || "",
      lastName: prev.lastName || gRest.join(" ") || "",
    }));
  }, [user]);

  useEffect(() => {
    if (!profile) return;
    const p = profile as any;
    setFormData((prev) => ({
      ...prev,
      firstName: prev.firstName || p.firstName || "",
      lastName: prev.lastName || p.lastName || "",
      photoURL: prev.photoURL || p.photoURL || "",
      phoneNumber: prev.phoneNumber || p.phoneNumber || "",
      dob: prev.dob || p.dob || "",
    }));
  }, [profile]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("Image must be less than 5MB.");
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd, headers: await uploadAuthHeaders() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Upload failed");
      }
      const data = await res.json();
      setImgError(false);
      setFormData((prev) => ({ ...prev, photoURL: data.url }));
    } catch (err: any) {
      setUploadError(err.message || "Failed to upload image.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const clearPhoto = () => {
    setImgError(false);
    setFormData((prev) => ({ ...prev, photoURL: user?.photoURL || "" }));
  };

  const isValid = !!(formData.firstName.trim() && formData.lastName.trim() && formData.dob);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isValid) return;
    setLoading(true);
    try {
      const userRef = doc(db, "users", user.uid);
      const finalRole =
        profile?.role && profile.role !== "delegate" && profile.role !== "user"
          ? profile.role
          : "user";

      const userData = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        dob: formData.dob,
        photoURL: formData.photoURL || user.photoURL || "",
        role: finalRole,
        onboardingComplete: true,
        createdAt: new Date().toISOString(),
      };

      await setDoc(userRef, userData, { merge: true });
      // Email and phone are private (users/{uid}/private/contact), never on the public profile doc.
      await saveMyContact(user.uid, { email: formData.email, phoneNumber: formData.phoneNumber });

      // Fire welcome email on first onboarding completion. Fire-and-forget — never block redirect.
      const wasAlreadyOnboarded = (profile as any)?.onboardingComplete === true;
      if (!wasAlreadyOnboarded && formData.email) {
        fetch("/api/notify/welcome", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: formData.email, name: formData.firstName.trim() }),
        }).catch((err) => console.error("Welcome email dispatch failed:", err));
      }

      await refreshProfile();
      router.push("/dashboard");
    } catch (error) {
      console.error("Error saving profile:", error);
      alert("Failed to save profile. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const displayPhoto = formData.photoURL || user?.photoURL || "";
  const initials = `${formData.firstName?.[0] || ""}${formData.lastName?.[0] || ""}`.toUpperCase() || "?";
  const isCustomUpload = !!formData.photoURL && formData.photoURL !== (user?.photoURL || "");

  return (
    <div className="container mx-auto py-6 max-w-xl px-4 relative min-h-screen flex flex-col justify-center">
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 -translate-x-1/2 left-1/2 w-[800px] h-[400px] opacity-[0.12] bg-primary blur-[100px] rounded-full" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-5"
      >
        <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-indigo-400 bg-clip-text text-transparent">
          Welcome to MUN Platform
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          A few basics to get you started — everything else is optional.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <Card className="bg-card/80 backdrop-blur-xl text-card-foreground rounded-2xl border border-border/60 overflow-hidden">
          <CardContent className="p-5 sm:p-6">
            <motion.form
              onSubmit={handleSubmit}
              className="space-y-4"
              variants={container}
              initial="hidden"
              animate="show"
            >
              {/* Profile picture + heading */}
              <motion.div variants={field} className="flex items-center gap-4">
                <motion.div
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 16, delay: 0.2 }}
                  className="relative shrink-0"
                >
                  <div className="rounded-full p-[2.5px] bg-gradient-to-br from-primary/60 to-indigo-500/60">
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-muted ring-2 ring-card flex items-center justify-center text-xl font-bold text-muted-foreground relative">
                      {displayPhoto && !imgError ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={displayPhoto}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={() => setImgError(true)}
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span>{initials}</span>
                      )}
                      {uploading && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-full">
                          <Loader2 className="w-6 h-6 animate-spin text-white" />
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm hover:scale-110 active:scale-95 transition disabled:opacity-60"
                    aria-label="Upload profile picture"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                  {isCustomUpload && (
                    <button
                      type="button"
                      onClick={clearPhoto}
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-muted text-muted-foreground border border-border flex items-center justify-center hover:bg-accent hover:text-accent-foreground"
                      aria-label="Remove uploaded picture"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </motion.div>
                <div className="min-w-0">
                  <h2 className="font-bold text-lg leading-tight">Set up your profile</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Add a photo or skip to use your Google account photo.
                  </p>
                  {uploadError && <p className="text-xs text-destructive mt-0.5">{uploadError}</p>}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
              </motion.div>

              <motion.div variants={container} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <motion.div variants={field} className="space-y-1.5">
                  <FieldLabel icon={User} required>First Name</FieldLabel>
                  <Input
                    id="firstName"
                    required
                    value={formData.firstName}
                    onChange={(e) => handleChange("firstName", e.target.value)}
                    placeholder="John"
                    className="h-11"
                  />
                </motion.div>
                <motion.div variants={field} className="space-y-1.5">
                  <FieldLabel icon={User} required>Last Name</FieldLabel>
                  <Input
                    id="lastName"
                    required
                    value={formData.lastName}
                    onChange={(e) => handleChange("lastName", e.target.value)}
                    placeholder="Doe"
                    className="h-11"
                  />
                </motion.div>
                <motion.div variants={field} className="space-y-1.5 md:col-span-2">
                  <FieldLabel icon={Mail}>Email</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    disabled
                    className="h-11 bg-muted text-muted-foreground cursor-not-allowed"
                  />
                </motion.div>
                <motion.div variants={field} className="space-y-1.5">
                  <FieldLabel icon={Calendar} required>Date of Birth</FieldLabel>
                  <DateField
                    value={formData.dob}
                    onChange={(v) => handleChange("dob", v)}
                    max={todayStr}
                    placeholder="Select date"
                    className="h-11"
                  />
                </motion.div>
                <motion.div variants={field} className="space-y-1.5">
                  <FieldLabel icon={Phone}>Mobile (Optional)</FieldLabel>
                  <Input
                    id="phoneNumber"
                    type="tel"
                    value={formData.phoneNumber}
                    onChange={(e) => handleChange("phoneNumber", e.target.value)}
                    placeholder="+1 234 567 8900"
                    className="h-11"
                  />
                </motion.div>
              </motion.div>

              <motion.div variants={field} className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-border/50 pt-4">
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Add nationality, socials, and more later from <span className="text-foreground font-medium">Profile Settings</span>.
                </p>
                <motion.div whileHover={{ scale: isValid && !loading ? 1.02 : 1 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    type="submit"
                    size="lg"
                    disabled={loading || !isValid}
                    className="h-11 px-6 gap-2 min-w-[180px]"
                  >
                    {loading ? (
                      <><Loader2 className="w-5 h-5 animate-spin" /> Saving…</>
                    ) : (
                      <>Complete Setup <ArrowRight className="w-4 h-4" /></>
                    )}
                  </Button>
                </motion.div>
              </motion.div>
            </motion.form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
