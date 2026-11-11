"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { motion } from "framer-motion";
import { Loader2, CheckCircle2, ArrowLeft } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (cooldown > 0) {
      timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldown > 0 || !email) return;

    setStatus("loading");
    setErrorMessage("");

    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase(), {
        url: `${window.location.origin}/login`,
        handleCodeInApp: false,
      });
      setStatus("success");
      setCooldown(60);
    } catch (err: any) {
      // Security: do not leak user enumeration
      if (err.code === "auth/user-not-found") {
        setStatus("success");
        setCooldown(60);
        return;
      }
      
      setStatus("error");
      if (err.code === "auth/invalid-email") {
        setErrorMessage("Please enter a valid email address.");
      } else if (err.code === "auth/too-many-requests") {
        setErrorMessage("Too many attempts. Please try again in a few minutes.");
      } else {
        setErrorMessage("Something went wrong. Please try again.");
      }
    }
  };

  return (
    <div className="w-full lg:grid lg:min-h-[calc(100vh-4rem)] lg:grid-cols-2">
      {/* Left side Form */}
      <div className="flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative bg-background">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="mx-auto w-full max-w-sm space-y-6"
        >
          {status === "success" ? (
            <Card className="border-green-500/20 bg-green-500/5 glass-card">
              <CardHeader className="text-center space-y-2">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
                <CardTitle className="text-2xl">Check your inbox</CardTitle>
                <CardDescription className="text-base">
                  We sent a password reset link to <strong>{email}</strong>. The link expires in 1 hour.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <Button 
                  variant="ghost" 
                  className="w-full" 
                  onClick={handleSubmit} 
                  disabled={cooldown > 0}
                >
                  {cooldown > 0 ? `Resend in 0:${cooldown.toString().padStart(2, '0')}` : "Resend email"}
                </Button>
                <Link href="/login" className="flex items-center justify-center text-sm font-medium text-primary hover:underline underline-offset-4">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to login
                </Link>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="space-y-2 text-center">
                <h1 className="text-3xl font-bold tracking-tight">Reset your password</h1>
                <p className="text-muted-foreground text-sm">
                  Enter the email associated with your account and we&apos;ll send you a reset link.
                </p>
              </div>

              <div aria-live="polite">
                {status === "error" && (
                  <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md text-center border border-destructive/20 mb-4">
                    {errorMessage}
                  </div>
                )}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="m@example.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 transition-all focus:ring-2 focus:ring-primary/20"
                    autoFocus
                  />
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-11 text-base shadow-lg shadow-primary/10" 
                  disabled={status === "loading" || cooldown > 0}
                >
                  {status === "loading" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending link...
                    </>
                  ) : cooldown > 0 ? (
                    `Resend in 0:${cooldown.toString().padStart(2, '0')}`
                  ) : (
                    "Reset password"
                  )}
                </Button>

                <div className="mt-4 text-center">
                  <Link href="/login" className="inline-flex items-center text-sm font-medium text-primary hover:underline underline-offset-4">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to login
                  </Link>
                </div>
              </form>
            </>
          )}
        </motion.div>
      </div>

      {/* Right side Graphic (reusing login style) */}
      <div className="relative hidden h-full flex-col bg-muted lg:flex overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/90 via-indigo-900 to-slate-900 z-0" />
        <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-20 mix-blend-overlay z-10"></div>
        
        <div className="relative z-20 flex h-full flex-col p-10 text-white justify-between">
          <div className="flex items-center text-lg font-medium">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white font-bold mr-2 backdrop-blur-md">
              M
            </div>
            MUN Platform
          </div>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="space-y-6 max-w-lg"
          >
            <h2 className="text-4xl font-bold leading-tight">Secure your account</h2>
            <p className="text-lg text-white/80">
              Get back to managing your Model UN journey in just a few clicks.
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
