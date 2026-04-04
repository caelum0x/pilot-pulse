'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

function CopyBlock({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // clipboard unavailable — no-op
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <div className="relative">
        <pre className="scrollbar-thin max-h-64 overflow-auto rounded-md border border-border/70 bg-background/60 p-3 pr-10 font-mono text-[11px] leading-relaxed text-foreground">
          {value}
        </pre>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1"
          onClick={onCopy}
          aria-label="copy"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

export function SetupGuidePanel() {
  const [host, setHost] = useState('http://localhost:3001');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setHost(window.location.origin);
    }
  }, []);

  const webhookUrl = `${host}/api/webhooks/tv`;

  const pineScriptAlert = useMemo(
    () =>
      `// TradingView Alert JSON — paste into the "Message" field
{
  "action": "{{strategy.order.action}}",
  "symbol": "BTC",
  "amount_usd": 500,
  "strategy_id": "my_macd_v1",
  "tp_pct": 2.5,
  "sl_pct": 1.0,
  "trail_pct": 0.8,
  "breakeven_pct": 0.75,
  "time_exit_minutes": 240,
  "timestamp": {{time}}
}`,
    [],
  );

  const curlExample = useMemo(
    () =>
      `# 1. Generate HMAC over the body using your PILOT_WEBHOOK_SECRET
BODY='{"action":"buy","symbol":"BTC","amount_usd":100,"strategy_id":"test","timestamp":1742243160000}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$PILOT_WEBHOOK_SECRET" -hex | awk '{print $2}')

# 2. POST to the webhook
curl -X POST ${webhookUrl} \\
  -H "Content-Type: application/json" \\
  -H "x-pilot-signature: $SIG" \\
  -d "$BODY"`,
    [webhookUrl],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Setup Guide</CardTitle>
        <CardDescription>
          Wire a TradingView strategy into PacificaPilot in three steps.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <CopyBlock label="webhook url" value={webhookUrl} />
          <CopyBlock
            label="alert body (tradingview message field)"
            value={pineScriptAlert}
          />
        </div>
        <Separator />
        <CopyBlock label="curl test (signed)" value={curlExample} />
        <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
          Every successful fill has our builder code auto-attached — fee revenue accrues to the
          pilot operator. The Smart TP/SL manager activates automatically when the alert includes
          <span className="mx-1 rounded bg-muted/50 px-1 font-mono text-foreground">tp_pct</span>,
          <span className="mx-1 rounded bg-muted/50 px-1 font-mono text-foreground">sl_pct</span>,
          <span className="mx-1 rounded bg-muted/50 px-1 font-mono text-foreground">trail_pct</span>,
          <span className="mx-1 rounded bg-muted/50 px-1 font-mono text-foreground">breakeven_pct</span>, or
          <span className="mx-1 rounded bg-muted/50 px-1 font-mono text-foreground">time_exit_minutes</span>.
        </p>
      </CardContent>
    </Card>
  );
}
