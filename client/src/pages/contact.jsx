import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, CheckCircle2, MessageSquare } from "lucide-react";
import { apiClient, tokenStorage } from "@/api/apiClient";

const SUBJECT_OPTIONS = [
  "Billing & Credits",
  "Bug Report",
  "Feature Request",
  "Account Issue",
  "Content Generation Help",
  "Other",
];

export default function ContactPage() {
  const [subject, setSubject] = useState("");
  const [customSubject, setCustomSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const token = tokenStorage.getUserToken();

  const resolvedSubject = subject === "Other" ? customSubject.trim() : subject;
  const isValid = resolvedSubject.length > 0 && message.trim().length > 0;
  const charCount = message.length;

  const mapSubjectToType = (subjectOption) => {
    switch (subjectOption) {
      case "Billing & Credits":
        return "credit_request";
      case "Bug Report":
        return "bug_report";
      case "Feature Request":
        return "feature_request";
      case "Account Issue":
      case "Content Generation Help":
      case "Other":
      default:
        return "general_support";
    }
  };

  const handleSubmit = async () => {
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    try {
      await apiClient.post("/support-requests", {
        type: mapSubjectToType(subject),
        subject: resolvedSubject,
        message: message.trim(),
      }, token);
      setSubmitted(true);
    } catch (err) {
      setError(err?.message || "Something went wrong. Please try again or email us directly.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex flex-col items-center justify-center rounded-3xl border border-border/70 bg-card/95 p-12 text-center shadow-[0_24px_80px_-48px_rgba(0,0,0,0.85)]">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-foreground">Message sent</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Thanks for reaching out. We typically respond within one business day.
          </p>
          <Button
            onClick={() => {
              setSubmitted(false);
              setSubject("");
              setCustomSubject("");
              setMessage("");
            }}
            className="mt-6 h-11 rounded-2xl bg-muted px-6 text-sm font-semibold text-foreground hover:bg-muted/70"
          >
            Send another message
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      {/* Header */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          <span className="inline-block h-px w-3 bg-muted-foreground" />
          Support
        </p>
        <h1 className="text-2xl font-semibold text-foreground">Contact Us</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Have a question or running into an issue? We're here to help.
        </p>
      </div>

      {/* Form Card */}
      <div className="rounded-3xl border border-border/70 bg-card/95 p-6 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.85)]">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <MessageSquare className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Send a message</p>
            <p className="text-xs text-muted-foreground">We'll get back to you by email.</p>
          </div>
        </div>

        <div className="space-y-5">
          {/* Subject selector */}
          <div className="space-y-2">
            <Label className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Subject
            </Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SUBJECT_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSubject(option)}
                  className={`rounded-2xl border px-3 py-2.5 text-left text-sm transition-all duration-200 ${
                    subject === option
                      ? "border-primary bg-primary/10 text-foreground shadow-[0_8px_20px_-12px_rgba(249,115,22,0.35)]"
                      : "border-border/70 bg-muted/20 text-muted-foreground hover:border-primary/40 hover:bg-muted/30 hover:text-foreground"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>

            {subject === "Other" && (
              <Input
                value={customSubject}
                onChange={(e) => setCustomSubject(e.target.value)}
                placeholder="Describe your subject…"
                className="h-11 rounded-2xl border-border/70 bg-muted/30 text-sm placeholder:text-muted-foreground"
              />
            )}
          </div>

          {/* Message */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Message
              </Label>
              <span
                className={`text-[10px] ${charCount > 900 ? "text-destructive" : "text-muted-foreground"}`}
              >
                {charCount}/1000
              </span>
            </div>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
              placeholder="Describe your issue or question in as much detail as possible…"
              className="min-h-36 rounded-2xl border-border/80 bg-background/70 px-4 py-3 text-sm leading-6 shadow-sm transition-all duration-200 placeholder:text-muted-foreground/70 focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/10"
            />
          </div>

          {error && (
            <p className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting}
            className="h-12 w-full rounded-2xl bg-primary text-sm font-semibold text-primary-foreground transition-all duration-200 hover:shadow-[0_10px_24px_-12px_rgba(249,115,22,0.45)]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Send Message
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Alt contact */}
      <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-center">
        <p className="text-xs text-muted-foreground">
          Prefer email?{" "}
          <a
            href="mailto:support@creativeos.app"
            className="font-medium text-primary hover:underline"
          >
            support@creativeos.app
          </a>
        </p>
      </div>
    </div>
  );
}