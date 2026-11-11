"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut as firebaseSignOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase/client";
import { doc, getDoc } from "firebase/firestore";
import { initPresence } from "@/lib/services/presenceService";

interface AuthContextType {
  user: User | null;
  profile: any | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  signInWithGoogle: async () => {},
  logout: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (uid: string) => {
    try {
      const [userDoc, contactDoc] = await Promise.all([
        getDoc(doc(db, "users", uid)),
        // Email and phone moved off the public profile doc; the owner reads their own here.
        getDoc(doc(db, "users", uid, "private", "contact")).catch(() => null),
      ]);
      if (userDoc.exists()) {
        const contact = contactDoc?.exists() ? contactDoc.data() : {};
        setProfile({
          uid: userDoc.id,
          ...userDoc.data(),
          email: contact.email || userDoc.data().email || auth.currentUser?.email || "",
          phoneNumber: contact.phoneNumber ?? userDoc.data().phoneNumber ?? "",
        });
      } else {
        setProfile(null);
      }
    } catch (error) {
      console.error("Error fetching profile in AuthContext:", error);
      setProfile(null);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.uid);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      // Reset loading on every auth change so consumers (e.g. dashboard guard)
      // wait for the profile fetch below before deciding to redirect. Without
      // this, a login fires this callback while `loading` is already false and
      // `profile` is still null, causing onboarded users to be bounced to
      // /onboarding instead of /dashboard.
      setLoading(true);
      setUser(currentUser);

      let cleanupPresence = () => {};
      
      if (currentUser) {
        await fetchProfile(currentUser.uid);
        cleanupPresence = initPresence(currentUser.uid);
      } else {
        setProfile(null);
      }
      
      try {
        if (currentUser) {
          // User is logged in, sync session cookie
          const idToken = await currentUser.getIdToken();
          await fetch("/api/auth/session", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ idToken }),
          });
        } else {
          // User is logged out, clear session cookie
          await fetch("/api/auth/session", {
            method: "DELETE",
          });
        }
      } catch (error) {
        console.error("Failed to sync session", error);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const logout = async () => {
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signInWithGoogle, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
