
"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { SayWithLogo } from './SayWithLogo';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { KeyRound, Loader2 } from 'lucide-react';

interface LockScreenProps {
  onUnlock: () => void;
}

export function LockScreen({ onUnlock }: LockScreenProps) {
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^\d*$/.test(value) && value.length <= 4) {
      setPin(value);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) {
      toast({
        variant: 'destructive',
        title: 'Incomplete PIN',
        description: 'Please enter a 4-digit PIN.',
      });
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast({ variant: 'success', title: 'Access Granted', description: 'Welcome to SayWith Suite.' });
        onUnlock();
      } else {
        toast({
          variant: 'destructive',
          title: 'Incorrect PIN',
          description: data.error || 'Please check your PIN and try again.',
        });
        setPin('');
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Verification failed. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background text-foreground p-4">
      <Card className="w-full max-w-sm border-border">
          <CardHeader className="text-center">
              <SayWithLogo className="h-12 w-auto mx-auto mb-4" />
              <CardTitle className="text-2xl">Enter Access PIN</CardTitle>
              <CardDescription>This area is restricted. Please enter your 4-digit PIN to continue.</CardDescription>
          </CardHeader>
          <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input
                          type="password"
                          value={pin}
                          onChange={handlePinChange}
                          maxLength={4}
                          placeholder="••••"
                          className="pl-10 text-center text-2xl tracking-[0.5em]"
                      />
                  </div>
                  <Button type="submit" disabled={isLoading || pin.length < 4} className="w-full bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {isLoading ? 'Verifying...' : 'Unlock'}
                  </Button>
              </form>
          </CardContent>
      </Card>
    </div>
  );
}
