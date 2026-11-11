"use client";

import { useEffect, useState } from "react";
import { getFoodSlots, getMyPassUse, FoodSlot } from "@/lib/services/optionalModulesService";
import { useAuth } from "@/contexts/AuthContext";
import { inAudience, DEFAULT_MEAL_AUDIENCE } from "@/lib/data/passAudience";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Loader2, Utensils, Clock, MapPin, CheckCircle2 } from "lucide-react";

interface FoodCouponsModuleProps {
  eventId: string;
  applicationId: string;
}

const mealColors: Record<string, string> = {
  breakfast: "bg-amber-500/10 border-amber-500/20 text-amber-600",
  lunch: "bg-orange-500/10 border-orange-500/20 text-orange-600",
  dinner: "bg-primary/10 border-primary/20 text-primary",
};

export function FoodCouponsModule({ eventId, applicationId }: FoodCouponsModuleProps) {
  const { user } = useAuth();
  const [slots, setSlots] = useState<FoodSlot[]>([]);
  const [used, setUsed] = useState<Record<string, { count: number; lastAt: number | null }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    // Only the meals this person's pass covers; used ones fade (board B3.1).
    Promise.all([getFoodSlots(eventId), getMyPassUse(eventId, user.uid)]).then(([data, mine]) => {
      setSlots(mine.member ? data.filter(s => inAudience(user.uid, mine.member!, s.audience, DEFAULT_MEAL_AUDIENCE)) : data);
      setUsed(mine.used);
      setLoading(false);
    });
  }, [eventId, user]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-12 text-center">
        <Utensils className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-1">No food slots configured yet</h3>
        <p className="text-sm text-muted-foreground">Check back once the organizer sets up meal schedules.</p>
      </div>
    );
  }

  const days = [...new Set(slots.map(s => s.day))].sort();

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
          <Utensils className="w-5 h-5 text-orange-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Food Coupons</h2>
          <p className="text-sm text-muted-foreground">
            Show <Link href="?tab=pass" className="text-primary font-medium hover:underline">your pass</Link> at the counter: one QR for every meal.
          </p>
        </div>
      </div>

      {days.map(day => (
        <div key={day}>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">{day}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {slots.filter(s => s.day === day).map(slot => {
              const mealKey = slot.mealName.toLowerCase();
              const colorClass = Object.entries(mealColors).find(([k]) => mealKey.includes(k))?.[1]
                || "bg-primary/10 border-primary/20 text-primary";
              const uses = slot.usesPerPerson ?? 1;
              const u = used[`meal:${slot.id}`];
              const left = uses - (u?.count || 0);

              return (
                <Card key={slot.id} className={`glass-card border ${colorClass} rounded-2xl ${left <= 0 ? "opacity-50" : ""}`}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Utensils className="w-4 h-4" />
                      {slot.mealName}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{slot.timeWindow}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5" />
                        <span>{slot.venue}</span>
                      </div>
                    </div>
                    {left <= 0 ? (
                      <p className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Used{u?.lastAt ? ` at ${new Date(u.lastAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
                      </p>
                    ) : uses > 1 ? (
                      <p className="text-xs font-semibold text-foreground">{left} of {uses} left</p>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
