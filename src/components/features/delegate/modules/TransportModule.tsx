"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getTransportRoutes, registerForTransport, TransportRoute
} from "@/lib/services/optionalModulesService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bus, Clock, MapPin, Users, Loader2, CheckCircle2, QrCode } from "lucide-react";

interface TransportModuleProps {
  eventId: string;
  applicationId: string;
}

export function TransportModule({ eventId, applicationId }: TransportModuleProps) {
  const [routes, setRoutes] = useState<TransportRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTransportRoutes(eventId).then(data => {
      setRoutes(data);
      setLoading(false);
    });
  }, [eventId]);

  const myRoute = routes.find(r => (r.registeredDelegates || []).includes(applicationId));

  const handleRegister = async (routeId: string) => {
    setRegistering(routeId);
    setError(null);
    const result = await registerForTransport(eventId, routeId, applicationId);
    if (result.success) {
      setRoutes(prev => prev.map(r =>
        r.id === routeId
          ? { ...r, registeredDelegates: [...(r.registeredDelegates || []), applicationId] }
          : r
      ));
    } else {
      setError(result.error || "Registration failed");
    }
    setRegistering(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (routes.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-12 text-center">
        <Bus className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-1">No transport routes available</h3>
        <p className="text-sm text-muted-foreground">The organizer hasn't added any transport routes yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
          <Bus className="w-5 h-5 text-blue-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Transport</h2>
          <p className="text-sm text-muted-foreground">Register for a shuttle route</p>
        </div>
      </div>

      {myRoute && (
        <div className="glass-card rounded-2xl p-6 border border-green-500/20 bg-green-500/5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm font-semibold text-green-600">You're registered</span>
              </div>
              <h3 className="text-lg font-bold">{myRoute.routeName}</h3>
              <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5" />
                  {myRoute.pickupPoint} → {myRoute.dropoffPoint}
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5" />
                  Departs {myRoute.departureTime} · Returns {myRoute.returnTime}
                </div>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-3 flex items-center gap-1">
            <QrCode className="w-3 h-3" /> Show <Link href="?tab=pass" className="text-primary font-medium hover:underline">your pass</Link> to the transport coordinator
          </p>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-500 bg-red-500/10 rounded-lg px-4 py-2">{error}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {routes.map(route => {
          const isRegistered = (route.registeredDelegates || []).includes(applicationId);
          const isFull = (route.registeredDelegates || []).length >= route.capacity;
          const isMyRoute = myRoute?.id === route.id;

          return (
            <Card key={route.id} className={`glass-card rounded-2xl ${isMyRoute ? "border-green-500/30" : ""}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{route.routeName}</CardTitle>
                  {isFull && !isRegistered && (
                    <Badge variant="destructive" className="text-xs">Full</Badge>
                  )}
                  {isRegistered && (
                    <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-xs">Registered</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span>{route.pickupPoint} → {route.dropoffPoint}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span>Dep: {route.departureTime} · Ret: {route.returnTime}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 shrink-0" />
                    <span>{(route.registeredDelegates || []).length} / {route.capacity} seats</span>
                  </div>
                </div>

                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${isFull ? "bg-red-500" : "bg-primary"}`}
                    style={{ width: `${Math.min(100, ((route.registeredDelegates || []).length / route.capacity) * 100)}%` }}
                  />
                </div>

                {!myRoute && (
                  <Button
                    className="w-full"
                    variant={isFull ? "outline" : "default"}
                    disabled={isFull || registering === route.id}
                    onClick={() => route.id && handleRegister(route.id)}
                  >
                    {registering === route.id
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Registering...</>
                      : isFull ? "Route Full" : "Register for This Route"
                    }
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
