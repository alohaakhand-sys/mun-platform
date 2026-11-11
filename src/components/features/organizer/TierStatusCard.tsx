import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface TierStatusCardProps {
  name: string;
  price: number;
  /** Per-tier seat cap. Omit when capacity is committee-derived (shows sold count only). */
  capacity?: number;
  sold: number;
  currency?: string;
}

export function TierStatusCard({ name, price, capacity, sold, currency = 'USD' }: TierStatusCardProps) {
  const hasCap = typeof capacity === 'number' && capacity > 0;
  const percentage = hasCap ? Math.round((sold / capacity!) * 100) : 0;
  const isSoldOut = hasCap && sold >= capacity!;

  return (
    <Card className={`relative overflow-hidden ${isSoldOut ? 'border-amber-200 bg-amber-50/50 dark:bg-amber-900/10' : ''}`}>
      {isSoldOut && (
        <div className="absolute top-0 right-0 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-bl-lg">
          SOLD OUT
        </div>
      )}
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg font-bold">{name}</CardTitle>
          <span className="font-semibold text-primary dark:text-primary">
            {price === 0 ? 'Free' : `${price} ${currency}`}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Tickets Sold</span>
            <span className="font-medium">{hasCap ? `${sold} / ${capacity}` : sold}</span>
          </div>
          {hasCap && (
            <Progress value={percentage} className="h-2" indicatorColor={isSoldOut ? 'bg-amber-500' : 'bg-primary'} />
          )}
        </div>
        <div className="pt-2 border-t flex justify-between items-center text-sm">
          <span className="text-muted-foreground">Revenue</span>
          <span className="font-semibold">{sold * price} {currency}</span>
        </div>
      </CardContent>
    </Card>
  );
}
