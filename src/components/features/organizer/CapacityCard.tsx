import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Users, Plus } from 'lucide-react';

export interface CapacityCardProps {
  committeeId: string;
  name: string;
  capacity: number;
  filledSeats: number;
  /** Omit to render read-only (capacity is edited on the Committees page). */
  onAddSeats?: (committeeId: string, additionalSeats: number) => void;
}

export function CapacityCard({ committeeId, name, capacity, filledSeats, onAddSeats }: CapacityCardProps) {
  const [addAmount, setAddAmount] = useState<string>('');
  const percentage = capacity > 0 ? Math.min(100, Math.round((filledSeats / capacity) * 100)) : 0;
  const isFull = capacity > 0 && filledSeats >= capacity;

  const handleAdd = () => {
    const num = parseInt(addAmount);
    if (!isNaN(num) && num > 0 && onAddSeats) {
      onAddSeats(committeeId, num);
      setAddAmount('');
    }
  };

  return (
    <Card className={`relative overflow-hidden transition-all ${isFull ? 'border-amber-200 bg-amber-50/30' : ''}`}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              {name}
              {isFull && <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">FULL</span>}
            </CardTitle>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground bg-secondary px-2 py-1 rounded-md text-sm">
            <Users className="w-4 h-4" />
            <span className="font-semibold">{filledSeats} / {capacity}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Progress 
            value={percentage} 
            className="h-2.5" 
            indicatorColor={isFull ? 'bg-amber-500' : 'bg-primary'} 
          />
          <p className="text-xs text-muted-foreground text-right mt-1.5">
            {capacity > 0 ? `${Math.max(0, capacity - filledSeats)} seats remaining` : "No limit set"}
          </p>
        </div>

        {onAddSeats && (
          <div className="pt-4 border-t flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">Add More Seats</Label>
              <Input
                type="number"
                min="1"
                placeholder="e.g. 5"
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value)}
                className="h-8"
              />
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleAdd}
              disabled={!addAmount || parseInt(addAmount) <= 0}
            >
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
