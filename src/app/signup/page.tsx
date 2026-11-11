"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { motion } from "framer-motion";

export default function SignupPage() {
  const { signInWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Sync session before redirecting to avoid middleware race condition
      const idToken = await userCredential.user.getIdToken();
      await fetch("/api/auth/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ idToken }),
      });

      // New account has no profile yet — go straight to onboarding.
      // Hard navigation so the freshly-set `session` cookie reaches the proxy.
      window.location.assign("/onboarding");
      return;
    } catch (err: any) {
      setError(err.message || "Failed to sign up");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setLoading(true);
    setError("");
    try {
      await signInWithGoogle();
      
      // Ensure session is synced before redirecting
      if (auth.currentUser) {
        const idToken = await auth.currentUser.getIdToken();
        await fetch("/api/auth/session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ idToken }),
        });
      }

      // Google account may already be an onboarded user — route accordingly.
      const u = auth.currentUser;
      if (u) {
        const { doc, getDoc } = await import("firebase/firestore");
        const { db } = await import("@/lib/firebase/client");
        const userDoc = await getDoc(doc(db, "users", u.uid));
        if (userDoc.exists() && userDoc.data().onboardingComplete) {
          window.location.assign("/dashboard");
          return;
        }
      }
      window.location.assign("/onboarding");
      return;
    } catch (err: any) {
      setError(err.message || "Failed to sign up with Google");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full lg:grid lg:min-h-[calc(100vh-4rem)] lg:grid-cols-2">
      {/* Left side Graphic */}
      <div className="relative hidden h-full flex-col bg-muted lg:flex overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/90 via-indigo-900 to-slate-900 z-0" />
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
            <h2 className="text-4xl font-bold leading-tight">Start your journey today.</h2>
            <p className="text-lg text-white/80">
              Create an account to unlock powerful tools for managing your Model UN career, from delegate applications to conference organization.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Right side Form */}
      <div className="flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative bg-background">
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="mx-auto w-full max-w-sm space-y-6"
        >
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-bold tracking-tight">Create an Account</h1>
            <p className="text-muted-foreground text-sm">
              Enter your details below to get started
            </p>
          </div>
          
          {error && (
            <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md text-center border border-destructive/20">
              {error}
            </div>
          )}

          <form onSubmit={handleEmailSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 transition-all focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 transition-all focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-11 transition-all focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <Button type="submit" className="w-full h-11 text-base shadow-lg shadow-primary/10 mt-2" disabled={loading}>
              {loading ? "Creating account..." : "Sign Up"}
            </Button>
            
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/60" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or continue with
                </span>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full h-11 text-base hover:bg-secondary/50"
              type="button"
              onClick={handleGoogleSignup}
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Google
            </Button>
          </form>
          
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-primary hover:underline underline-offset-4">
              Log in
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
