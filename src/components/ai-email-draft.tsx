import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Send, PenLine, Loader2 } from "lucide-react";
import type { Customer, Opportunity } from "@/types/dataverse";
import { IndustryOptions } from "@/types/dataverse";
import { generateSalesEmail, sendOutlookEmail } from "@/services/ai-flow-service";

interface AiEmailDraftProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer;
  opportunities: Opportunity[];
}

// AI 入力用テキスト生成
function buildCustomerInfo(customer: Customer): string {
  const parts = [
    `顧客名: ${customer.geek_name}`,
    customer.geek_contactperson && `担当者: ${customer.geek_contactperson}`,
    customer.geek_industry != null && `業種: ${IndustryOptions[customer.geek_industry]}`,
    customer.geek_email && `メール: ${customer.geek_email}`,
  ];
  return parts.filter(Boolean).join("\n");
}

function buildOpportunityInfo(opportunities: Opportunity[]): string {
  const active = opportunities.filter(
    (o) => o.geek_stage !== 100000004 && o.geek_stage !== 100000005 && o.geek_stage !== 100000006,
  );
  if (active.length === 0) return "現在進行中の商談なし";
  return active
    .slice(0, 3)
    .map((o) => `- ${o.geek_name}${o.geek_amount ? ` (¥${o.geek_amount.toLocaleString()})` : ""}`)
    .join("\n");
}

// テンプレートフォールバック（AI呼び出し失敗時）
function fallbackDraft(customer: Customer, opportunities: Opportunity[]): { subject: string; body: string } {
  const name = customer.geek_contactperson || customer.geek_name;
  const active = opportunities.filter(
    (o) => o.geek_stage !== 100000004 && o.geek_stage !== 100000005 && o.geek_stage !== 100000006,
  );
  if (active.length > 0) {
    const top = active[0];
    return {
      subject: `【ご確認】${top.geek_name}の進捗について`,
      body: `${name} 様\n\nいつもお世話になっております。\n\n「${top.geek_name}」の件につきまして、進捗状況のご確認をさせていただきたくご連絡いたしました。\n\nご都合の良い日程をお知らせいただければ幸いです。\n\n何卒よろしくお願いいたします。`,
    };
  }
  return {
    subject: `${customer.geek_name} 様 — ご提案のご相談`,
    body: `${name} 様\n\nいつもお世話になっております。\n\n弊社サービスについて、ぜひ一度ご紹介の機会をいただければと思いご連絡いたしました。\n\nご検討のほどよろしくお願いいたします。`,
  };
}

export function AiEmailDraft({ open, onOpenChange, customer, opportunities }: AiEmailDraftProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [to, setTo] = useState("");
  const [sent, setSent] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiUsed, setAiUsed] = useState(false);

  const callAi = async (purpose = "フォローアップ") => {
    setIsGenerating(true);
    setAiUsed(false);
    try {
      const result = await generateSalesEmail(
        buildCustomerInfo(customer),
        buildOpportunityInfo(opportunities),
        purpose,
      );
      if (result) {
        setSubject(result.subject);
        setBody(result.body);
        setAiUsed(true);
      } else {
        const fb = fallbackDraft(customer, opportunities);
        setSubject(fb.subject);
        setBody(fb.body);
      }
    } catch {
      const fb = fallbackDraft(customer, opportunities);
      setSubject(fb.subject);
      setBody(fb.body);
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (open) {
      setTo(customer.geek_email ?? "");
      setSent(false);
      callAi();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleRegenerate = () => {
    setSent(false);
    callAi("フォローアップ");
  };

  const handleSend = async () => {
    if (!to || !subject) return;
    setIsSending(true);
    try {
      const success = await sendOutlookEmail(to, subject, body);
      if (success) {
        setSent(true);
      } else {
        // フォールバック: mailto リンク
        const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(mailtoUrl, "_blank");
        setSent(true);
      }
    } catch {
      const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.open(mailtoUrl, "_blank");
      setSent(true);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            AIメール作成
            {aiUsed && <Badge variant="secondary" className="text-xs">AI Builder</Badge>}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto py-2">
          {sent && (
            <Badge variant="default" className="bg-green-600">
              ✓ メールを送信しました
            </Badge>
          )}

          {isGenerating ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-3" />
              <span>AI がメールを生成中...</span>
            </div>
          ) : (
            <>
              <div>
                <Label>宛先</Label>
                <Input
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="email@example.com"
                  type="email"
                />
              </div>
              <div>
                <Label>件名</Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
              <div>
                <Label>本文</Label>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={12}
                  className="font-mono text-sm"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 gap-2">
          <Button variant="outline" onClick={handleRegenerate} disabled={isGenerating}>
            <PenLine className="h-4 w-4 mr-1" />
            再生成
          </Button>
          <Button onClick={handleSend} disabled={!to || isGenerating || isSending}>
            {isSending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-1" />
            )}
            {isSending ? "送信中..." : "メール送信"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
