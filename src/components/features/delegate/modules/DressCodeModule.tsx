"use client";

import { useEffect, useState } from "react";
import { getDressCode, DressCode } from "@/lib/services/optionalModulesService";
import { Shirt, Loader2, Sparkles, AlertCircle } from "lucide-react";

interface DressCodeModuleProps {
  eventId: string;
}

export function DressCodeModule({ eventId }: DressCodeModuleProps) {
  const [dressCode, setDressCode] = useState<DressCode | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDressCode(eventId).then((data) => {
      setDressCode(data);
      setLoading(false);
    });
  }, [eventId]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!dressCode || !dressCode.text) {
    return (
      <div className="glass-card rounded-2xl p-12 text-center border border-border/40">
        <Shirt className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-1">No dress code specified</h3>
        <p className="text-sm text-muted-foreground">The organizer hasn't added dress code information yet.</p>
      </div>
    );
  }

  const mainImage = dressCode.images?.[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
          <Shirt className="w-5 h-5 text-rose-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Dress Code</h2>
          <p className="text-sm text-muted-foreground">Conference attire requirements</p>
        </div>
      </div>

      <div className="glass-card rounded-3xl overflow-hidden border border-border/40 hover:border-rose-500/20 transition-all duration-300">
        {mainImage && (
          <div className="w-full h-72 overflow-hidden relative group">
            <img
              src={mainImage}
              alt="Dress code reference"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
          </div>
        )}
        <div className="p-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rose-500/10 border border-rose-500/20 mb-6">
            <Shirt className="w-4 h-4 text-rose-500" />
            <span className="text-rose-600 font-bold text-sm">Attire Requirement</span>
          </div>

          <div className="prose prose-sm max-w-none text-muted-foreground">
            <p className="leading-relaxed text-base text-foreground/90 whitespace-pre-line">{dressCode.text}</p>
          </div>

          {dressCode.images && dressCode.images.length > 1 && (
            <div className="mt-8">
              <p className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-rose-500" /> Reference Gallery
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {dressCode.images.slice(1).map((img, i) => (
                  <div key={i} className="aspect-square rounded-xl overflow-hidden border border-border/50 group">
                    <img
                      src={img}
                      alt={`Reference ${i + 2}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                label: "Expected",
                desc: "Follow the dress code guidelines above for all official sessions.",
                bg: "bg-green-500/5",
                border: "border-green-500/10",
                text: "text-green-600",
                iconColor: "text-green-500",
                icon: Sparkles
              },
              {
                label: "Opening Ceremony",
                desc: "Formal or traditional attire is required at all times.",
                bg: "bg-blue-500/5",
                border: "border-blue-500/10",
                text: "text-blue-600",
                iconColor: "text-blue-500",
                icon: Shirt
              },
              {
                label: "Non-compliance",
                desc: "Violations may result in restricted access to committee rooms.",
                bg: "bg-red-500/5",
                border: "border-red-500/10",
                text: "text-red-600",
                iconColor: "text-red-500",
                icon: AlertCircle
              }
            ].map(({ label, desc, bg, border, text, iconColor, icon: Icon }) => (
              <div key={label} className={`rounded-xl p-4 ${bg} border ${border} flex flex-col gap-1`}>
                <div className="flex items-center gap-1.5">
                  <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
                  <p className={`text-xs font-bold uppercase tracking-wider ${text}`}>{label}</p>
                </div>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
