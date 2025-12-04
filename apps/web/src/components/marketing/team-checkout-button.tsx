"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Loader2, Users, Minus, Plus } from "lucide-react";

interface TeamCheckoutButtonProps {
  className?: string;
}

const MIN_SEATS = 3;
const MAX_SEATS = 100;
const PRICE_PER_SEAT = 19; // Early bird price per seat

export function TeamCheckoutButton({ className }: TeamCheckoutButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [seatCount, setSeatCount] = useState(5);
  const [error, setError] = useState("");

  const totalPrice = seatCount * PRICE_PER_SEAT;

  const handleSeatChange = (delta: number) => {
    const newCount = seatCount + delta;
    if (newCount >= MIN_SEATS && newCount <= MAX_SEATS) {
      setSeatCount(newCount);
    }
  };

  const handleCheckout = async () => {
    if (!teamName.trim()) {
      setError("Please enter a team name");
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/checkout/team", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          teamName: teamName.trim(),
          seatCount,
        }),
      });

      const data = await response.json();

      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        setError(data.error || "Failed to create checkout session");
        setIsLoading(false);
      }
    } catch (err) {
      console.error("Checkout error:", err);
      setError("Something went wrong. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="lg" className={className}>
          <Users className="w-4 h-4" />
          Get Team License
          <ArrowRight className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Team License</DialogTitle>
          <DialogDescription>
            Set up your team with data-peek. Each member gets their own
            activation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="teamName">Team Name</Label>
            <Input
              id="teamName"
              placeholder="Acme Inc."
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Number of Seats</Label>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleSeatChange(-1)}
                disabled={seatCount <= MIN_SEATS}
              >
                <Minus className="w-4 h-4" />
              </Button>
              <div className="flex-1 text-center">
                <span className="text-3xl font-bold">{seatCount}</span>
                <span className="text-muted-foreground ml-2">seats</span>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleSeatChange(1)}
                disabled={seatCount >= MAX_SEATS}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              ${PRICE_PER_SEAT}/seat × {seatCount} seats
            </p>
          </div>

          <div className="rounded-lg bg-muted p-4 text-center">
            <p className="text-sm text-muted-foreground">Total (one-time)</p>
            <p className="text-3xl font-bold text-zinc-900">${totalPrice}</p>
            <p className="text-xs text-muted-foreground mt-1">
              + 1 year of updates for your whole team
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="primary"
            className="w-full"
            onClick={handleCheckout}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Continue to Checkout
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
