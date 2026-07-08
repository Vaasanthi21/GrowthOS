import React, { useState } from "react";
import { HelpCircle, Send, ShieldCheck, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { submitSupportRequest } from "@/services/aiService";

const requestTypes = [
  { label: "Credit Request", value: "credit_request" },
  { label: "Persona Request", value: "persona_request" },
  { label: "Bug Report", value: "bug_report" },
  { label: "Feature Request", value: "feature_request" },
  { label: "General Support / Contact Us", value: "general_support" },
];

export default function Support() {
  const [type, setType] = useState("credit_request");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!subject.trim()) {
      toast({
        title: "Subject required",
        description: "Please enter a short subject for your request.",
        variant: "destructive",
      });
      return;
    }

    if (!message.trim()) {
      toast({
        title: "Message required",
        description: "Please describe your request before submitting.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Passes parameters to handle unified ticket assignment and ClickUp automation mapping
      await submitSupportRequest({
        type,
        subject: subject.trim(),
        message: message.trim(),
        isContactUsFallback: type === "general_support", 
      });

      toast({
        title: "Request submitted",
        description: "Your request has been successfully captured and routed to the team.",
        duration: 3000,
      });

      setSubject("");
      setMessage("");
      setType("credit_request");
    } catch (error) {
      toast({
        title: "Unable to submit request",
        description: error?.message || "Please try again after some time.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm md:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <ShieldCheck className="h-3.5 w-3.5" />
              Support & Requests
            </div>
            <h1 className="text-2xl font-display font-bold text-foreground md:text-3xl">
              Support Center
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Need more credits, a new persona, or want to contact our team? Submit a
              request below and we will process it right away.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground md:max-w-xs">
            <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
              <HelpCircle className="h-4 w-4 text-primary" />
              What happens next?
            </div>
            Your submission automatically syncs to our administration workspace. You can use
            this unified form for credit updates, bugs, feature suggestions, or direct inquiries.
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-3xl border border-border bg-card p-5 shadow-sm md:p-7"
      >
        <div className="grid gap-5">
          <div className="grid gap-2">
            <Label>Request Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="bg-muted/40">
                <SelectValue placeholder="Select request type" />
              </SelectTrigger>
              <SelectContent>
                {requestTypes.map((requestType) => (
                  <SelectItem key={requestType.value} value={requestType.value}>
                    {requestType.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Subject</Label>
            <Input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Briefly describe your request"
              className="bg-muted/40"
            />
          </div>

          <div className="grid gap-2">
            <Label>Message</Label>
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Add details that will help the team review your request"
              className="min-h-36 bg-muted/40"
            />
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              You will receive confirmation after submitting the request.
            </p>
            <Button type="submit" disabled={isSubmitting} className="sm:w-auto">
              <Send className="mr-2 h-4 w-4" />
              {isSubmitting ? "Submitting..." : "Submit Request"}
            </Button>
          </div>
        </div>
      </form>
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
          <Phone className="h-4 w-4 text-primary" />
          Need immediate assistance?
        </div>
        <p className="text-base font-medium text-foreground">
          +91 6361 143 518
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Call us directly for urgent support or quick help.
        </p>
      </div>
    </div>
  );
}