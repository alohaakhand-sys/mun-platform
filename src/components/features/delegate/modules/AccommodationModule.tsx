"use client";

import { useEffect, useState } from "react";
import {
  getAccommodationBlocks, getAccommodationRequest, requestAccommodation,
  AccommodationBlock, AccommodationRequest
} from "@/lib/services/optionalModulesService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Hotel, BedDouble, DollarSign, Loader2, CheckCircle2, Clock, XCircle } from "lucide-react";

interface AccommodationModuleProps {
  eventId: string;
  delegateUid: string;
}

const statusConfig = {
  pending: { label: "Pending Review", icon: Clock, color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
  confirmed: { label: "Confirmed", icon: CheckCircle2, color: "bg-green-500/10 text-green-600 border-green-500/20" },
  rejected: { label: "Rejected", icon: XCircle, color: "bg-red-500/10 text-red-600 border-red-500/20" },
};

export function AccommodationModule({ eventId, delegateUid }: AccommodationModuleProps) {
  const [blocks, setBlocks] = useState<AccommodationBlock[]>([]);
  const [myRequest, setMyRequest] = useState<AccommodationRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getAccommodationBlocks(eventId),
      getAccommodationRequest(eventId, delegateUid),
    ]).then(([blocksData, requestData]) => {
      setBlocks(blocksData);
      setMyRequest(requestData);
      setLoading(false);
    });
  }, [eventId, delegateUid]);

  const handleRequest = async (block: AccommodationBlock) => {
    if (!block.id) return;
    setRequesting(block.id);
    setError(null);
    const result = await requestAccommodation(eventId, {
      delegateUid,
      blockId: block.id,
      blockName: block.blockName,
      status: "pending",
    });
    if (result.success) {
      setMyRequest({
        id: result.id,
        delegateUid,
        blockId: block.id,
        blockName: block.blockName,
        status: "pending",
      });
    } else {
      setError("Failed to submit request. Please try again.");
    }
    setRequesting(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (blocks.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-12 text-center">
        <Hotel className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-1">No accommodation options available</h3>
        <p className="text-sm text-muted-foreground">The organizer hasn't set up accommodation blocks yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Hotel className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Accommodation</h2>
          <p className="text-sm text-muted-foreground">Request a room for the conference duration</p>
        </div>
      </div>

      {myRequest && (() => {
        const cfg = statusConfig[myRequest.status];
        const Icon = cfg.icon;
        return (
          <div className={`glass-card rounded-2xl p-5 border ${cfg.color}`}>
            <div className="flex items-center gap-3 mb-2">
              <Icon className="w-5 h-5" />
              <span className="font-semibold">{cfg.label}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Your request for <strong>{myRequest.blockName}</strong> is {myRequest.status}.
              {myRequest.status === "pending" && " The organizer will review shortly."}
            </p>
          </div>
        );
      })()}

      {error && (
        <p className="text-sm text-red-500 bg-red-500/10 rounded-lg px-4 py-2">{error}</p>
      )}

      {!myRequest && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {blocks.map(block => (
            <Card key={block.id} className="glass-card rounded-2xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BedDouble className="w-4 h-4 text-primary" />
                  {block.blockName}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>Room Type</span>
                    <Badge variant="outline">{block.roomType}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Price / Night</span>
                    <span className="font-semibold text-foreground flex items-center gap-1">
                      <DollarSign className="w-3.5 h-3.5" />{block.pricePerNight}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Available Rooms</span>
                    <span className={`font-semibold ${block.availableRooms === 0 ? "text-red-500" : "text-green-500"}`}>
                      {block.availableRooms}
                    </span>
                  </div>
                </div>
                <Button
                  className="w-full"
                  disabled={block.availableRooms === 0 || requesting === block.id}
                  onClick={() => handleRequest(block)}
                >
                  {requesting === block.id
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Requesting...</>
                    : block.availableRooms === 0 ? "No Rooms Available" : "Request Room"
                  }
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
