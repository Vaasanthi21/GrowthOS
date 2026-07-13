import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Compass,
  Image,
  Video,
  BookOpen,
  Building2,
  Share2,
  Wallet,
  HelpCircle,
  ChevronRight,
  Sparkles,
  Link2,
} from "lucide-react";

const SECTIONS = [
  { id: "overview", label: "Overview", icon: Compass, color: "text-blue-500" },
  { id: "image", label: "Image Studio", icon: Image, color: "text-indigo-500" },
  { id: "video", label: "Video Studio", icon: Video, color: "text-purple-500" },
  { id: "blog", label: "Blog Studio", icon: BookOpen, color: "text-emerald-500" },
  { id: "brand", label: "Brand Setup", icon: Building2, color: "text-orange-500" },
  { id: "sharing", label: "Integrations & Sharing", icon: Share2, color: "text-pink-500" },
  { id: "wallet", label: "Wallet & Credits", icon: Wallet, color: "text-amber-500" },
];

export default function UserGuideModal({ open, onOpenChange }) {
  const [activeSection, setActiveSection] = useState("overview");

  const renderContent = () => {
    switch (activeSection) {
      case "overview":
        return (
          <div className="space-y-4 pr-3 text-left">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-primary animate-pulse" />
              <h3 className="text-lg font-bold text-foreground">Welcome to Creative Studio OS</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Creative Studio OS is a unified, AI-powered creation engine designed to help you produce, refine, and distribute high-quality marketing assets. This guide explains how to navigate and use the platform's key features.
            </p>
            <div className="border border-border/60 rounded-xl p-4 bg-secondary/30 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">General Navigation</h4>
              <ul className="space-y-2.5 text-xs text-foreground">
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
                  <span><strong>Content Studio (Generate):</strong> Note that both the <strong>Image Studio</strong> and <strong>Video Studio</strong> features are fully integrated under the single <strong>Content Studio</strong> tab in the sidebar menu.</span>
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
                  <span><strong>Sidebar Menu:</strong> Access all studios (Content, Brand, Blog), view generation history, refine drafts, check integrations, or top-up your wallet.</span>
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
                  <span><strong>Free Sign Up Credits:</strong> Every new user is automatically awarded <strong>25 Free Credits</strong> upon successful email OTP verification to start exploring immediately.</span>
                </li>
              </ul>
            </div>
          </div>
        );
      case "image":
        return (
          <div className="space-y-4 pr-3 text-left">
            <h3 className="text-lg font-bold text-foreground">📸 Image Studio Guide</h3>
            <p className="text-sm text-muted-foreground">
              Generate single high-definition images or compile batch visual assets using advanced prompt builders and custom brand overlays.
            </p>
            <div className="border border-border/60 rounded-xl p-4 bg-secondary/30 mb-3 space-y-2 text-xs">
              <div className="font-bold text-foreground">Credit Costs:</div>
              <div>• Single Image Generation: <strong className="text-primary">3 Credits</strong></div>
              <div>• Text/Prompt Refinement: <strong className="text-primary">1 Credit</strong></div>
              <div>• Batch Generation: <strong className="text-primary">3 Credits per image</strong> in the batch</div>
            </div>
            <div className="space-y-3">
              <div className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0 font-mono text-xs font-bold mt-0.5">1</div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Set Up Visual Input</h4>
                  <p className="text-xs text-muted-foreground">Enter your topic prompt, select target keywords, or choose target social platforms to let the builder optimize composition guidelines.</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0 font-mono text-xs font-bold mt-0.5">2</div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Artistic Controls & Styles</h4>
                  <p className="text-xs text-muted-foreground">Adjust aspect ratios (16:9 Landscape, 9:16 Portrait, 1:1 Square), select studio lighting profiles (Cinematic, Dramatic, Studio, Neon), and pick artistic styles (Photography, Cyberpunk, 3D Render, Vector, Anime).</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0 font-mono text-xs font-bold mt-0.5">3</div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Watermarking & Logo Placement</h4>
                  <p className="text-xs text-muted-foreground">Toggle the watermarking toggle. You can select your custom uploaded company logo or the default UDEN brand watermark, and choose the overlay corner placement (Top-Left, Top-Right, Bottom-Left, Bottom-Right).</p>
                </div>
              </div>
            </div>
          </div>
        );
      case "video":
        return (
          <div className="space-y-4 pr-3 text-left">
            <h3 className="text-lg font-bold text-foreground">🎬 Video Studio Guide</h3>
            <p className="text-sm text-muted-foreground">
              Bring prompts and scripts to life using high-fidelity Sora video models.
            </p>
            <div className="border border-border/60 rounded-xl p-4 bg-secondary/30 mb-3 space-y-2 text-xs">
              <div className="font-bold text-foreground">Credit Costs:</div>
              <div>• Video Generation: <strong className="text-primary">69 Credits</strong> per video render</div>
            </div>
            <div className="border border-border/60 rounded-xl p-4 bg-secondary/30 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Creating Premium Videos</h4>
              <ul className="space-y-2.5 text-xs text-foreground">
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
                  <span><strong>Describe the Scene:</strong> Write detailed prompt descriptions indicating motion dynamics, camera paths, and lighting configurations.</span>
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
                  <span><strong>Duration & Aspect Ratios:</strong> Choose from 4s, 8s, or 12s durations, and select optimal layout proportions (16:9 Landscape, 9:16 Portrait, 1:1 Square).</span>
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
                  <span><strong>Watermark Overlays:</strong> Toggle the system logo or custom brand logo watermark to overlay onto the video frames. Renders include inline playback and instant `.mp4` downloads.</span>
                </li>
              </ul>
            </div>
          </div>
        );
      case "blog":
        return (
          <div className="space-y-4 pr-3 text-left">
            <h3 className="text-lg font-bold text-foreground">✍️ Blog Studio Guide</h3>
            <p className="text-sm text-muted-foreground">
              Follow our structured 8-step pipeline to research search gaps, compose detailed drafts, and compile optimized blog copies.
            </p>
            <div className="border border-border/60 rounded-xl p-4 bg-secondary/30 mb-3 space-y-2 text-xs">
              <div className="font-bold text-foreground">Credit Costs:</div>
              <div className="grid grid-cols-2 gap-y-1">
                <div>• Website Grounding Crawl: <strong className="text-primary">10 Credits</strong></div>
                <div>• Blog Draft Generation: <strong className="text-primary">10 Credits</strong></div>
                <div>• Blog SEO Optimization: <strong className="text-primary">5 Credits</strong></div>
                <div>• Platform Adaptation Post: <strong className="text-primary">5 Credits</strong></div>
                <div>• Platform Render SEO Audit: <strong className="text-primary">5 Credits</strong></div>
                <div>• Blog Cover Image: <strong className="text-primary">3 Credits</strong></div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="border border-border/50 rounded-lg p-2.5 bg-secondary/20">
                <strong className="text-primary font-mono mr-1">01</strong> Define Company profile.
              </div>
              <div className="border border-border/50 rounded-lg p-2.5 bg-secondary/20">
                <strong className="text-primary font-mono mr-1">02</strong> Build customer personas.
              </div>
              <div className="border border-border/50 rounded-lg p-2.5 bg-secondary/20">
                <strong className="text-primary font-mono mr-1">03</strong> Grounding documents (upload files or crawl a URL).
              </div>
              <div className="border border-border/50 rounded-lg p-2.5 bg-secondary/20">
                <strong className="text-primary font-mono mr-1">04</strong> Create topic guidelines.
              </div>
              <div className="border border-border/50 rounded-lg p-2.5 bg-secondary/20">
                <strong className="text-primary font-mono mr-1">05</strong> Perform competitor research.
              </div>
              <div className="border border-border/50 rounded-lg p-2.5 bg-secondary/20">
                <strong className="text-primary font-mono mr-1">06</strong> Generate canonical draft.
              </div>
              <div className="border border-border/50 rounded-lg p-2.5 bg-secondary/20">
                <strong className="text-primary font-mono mr-1">07</strong> Optimize SEO score and keyword density.
              </div>
              <div className="border border-border/50 rounded-lg p-2.5 bg-secondary/20">
                <strong className="text-primary font-mono mr-1">08</strong> Generate and watermark cover images.
              </div>
            </div>
          </div>
        );
      case "brand":
        return (
          <div className="space-y-4 pr-3 text-left">
            <h3 className="text-lg font-bold text-foreground">🏷️ Brand Setup Guide</h3>
            <p className="text-sm text-muted-foreground">
              Ensure all your generations map exactly to your company's core guidelines, target audience, and color palettes.
            </p>
            <div className="border border-border/60 rounded-xl p-4 bg-secondary/30 mb-3 space-y-2 text-xs">
              <div className="font-bold text-foreground">Credit Costs:</div>
              <div>• AI Brand Persona Generator Setup: <strong className="text-primary">10 Credits</strong></div>
              <div>• Manual Brand Setup & edits: <strong className="text-emerald-500 font-semibold">FREE</strong></div>
            </div>
            <div className="border border-border/60 rounded-xl p-4 bg-secondary/30 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Setting up your brand identity</h4>
              <ul className="space-y-2.5 text-xs text-foreground">
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
                  <span><strong>AI Persona Builder:</strong> Input raw background context and let the AI generate targeted target personas automatically (<strong>10 Credits</strong>).</span>
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
                  <span><strong>Define Profile:</strong> Set up your company description, website domain link, and primary brand colors manually (<strong>FREE</strong>).</span>
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
                  <span><strong>Upload Logo:</strong> Upload your company logo. This logo is used for custom watermark overlays in both image and video studios.</span>
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
                  <span><strong>Buyer Personas:</strong> Build buyer personas specifying target buyer traits, challenges, and goals to ground all content copywriting.</span>
                </li>
              </ul>
            </div>
          </div>
        );
      case "sharing":
        return (
          <div className="space-y-4 pr-3 text-left">
            <h3 className="text-lg font-bold text-foreground">🤝 Integrations & Social Sharing</h3>
            <p className="text-sm text-muted-foreground">
              Track campaign performance and easily share generated assets to social media channels.
            </p>
            <div className="border border-border/60 rounded-xl p-4 bg-secondary/30 mb-3 space-y-2 text-xs">
              <div className="font-bold text-foreground">Credit Costs:</div>
              <div>• OAuth integrations, metric syncing, and sharing links do <strong className="text-primary">not</strong> cost any credits.</div>
            </div>
            <div className="space-y-3 text-xs">
              <div className="border border-border/60 rounded-xl p-3 bg-secondary/20">
                <h4 className="font-bold flex items-center gap-1 mb-1 text-foreground">
                  <Link2 className="w-3.5 h-3.5 text-primary" /> LinkedIn Campaign Tracker
                </h4>
                <p className="text-muted-foreground leading-relaxed">
                  Go to the Integrations page, click "Connect LinkedIn Ads" to authenticate through a secure OAuth login, and view active campaign stats. Alternatively, upload a CSV export.
                </p>
              </div>
              <div className="border border-border/60 rounded-xl p-3 bg-secondary/20">
                <h4 className="font-bold flex items-center gap-1 mb-1 text-foreground">
                  <Share2 className="w-3.5 h-3.5 text-primary" /> Social Link Sharing
                </h4>
                <p className="text-muted-foreground leading-relaxed">
                  Click the share icon on any generated image or video card to copy a masked public link. Paste this link into any social media platform (like LinkedIn or Facebook) to load a premium, rich social card preview.
                </p>
              </div>
            </div>
          </div>
        );
      case "wallet":
        return (
          <div className="space-y-4 pr-3 text-left">
            <h3 className="text-lg font-bold text-foreground">💳 Wallet & Credits</h3>
            <p className="text-sm text-muted-foreground font-normal">
              Renders and optimizations consume credits from your balance. Check pricing rules and transaction logs below.
            </p>
            <div className="border border-border rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-secondary/70 border-b border-border">
                    <th className="p-2 font-semibold">Service Type</th>
                    <th className="p-2 font-semibold text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/50">
                    <td className="p-2">Image Studio Generation (Single/Batch)</td>
                    <td className="p-2 text-right font-semibold text-primary">3 Credits / Image</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="p-2">Image Studio Prompt Refinement</td>
                    <td className="p-2 text-right font-semibold text-primary">1 Credit</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="p-2">Video Studio Generation (Sora model)</td>
                    <td className="p-2 text-right font-semibold text-primary">69 Credits</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="p-2">AI Brand Persona Setup (AI generated)</td>
                    <td className="p-2 text-right font-semibold text-primary">10 Credits</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="p-2">Manual Brand Setup & Profiles</td>
                    <td className="p-2 text-right font-semibold text-emerald-500 font-bold">FREE</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="p-2">Blog Studio Website Crawl</td>
                    <td className="p-2 text-right font-semibold text-primary">10 Credits</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="p-2">Blog Studio Draft Generation (Research + Copy)</td>
                    <td className="p-2 text-right font-semibold text-primary">10 Credits</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="p-2">Blog Studio SEO Optimization Audit</td>
                    <td className="p-2 text-right font-semibold text-primary">5 Credits</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="p-2">Blog Studio Platform Adaptation (Social adapt)</td>
                    <td className="p-2 text-right font-semibold text-primary">5 Credits</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="p-2">Blog Studio Platform Adaptation SEO Optimization</td>
                    <td className="p-2 text-right font-semibold text-primary">5 Credits</td>
                  </tr>
                  <tr>
                    <td className="p-2">Blog Studio Cover Image</td>
                    <td className="p-2 text-right font-semibold text-primary">3 Credits</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground italic">
              * Note: If any generation fails to compile, the credits are automatically refunded to your wallet balance.
            </p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden bg-background border border-border sm:rounded-2xl shadow-xl flex flex-col h-[560px]">
        <DialogHeader className="p-5 border-b border-border shrink-0 flex flex-row items-center gap-2 text-left">
          <HelpCircle className="w-5 h-5 text-primary shrink-0" />
          <div>
            <DialogTitle className="text-base font-display font-bold">Creative Studio OS User Guide</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Learn how to build brand personas, compile assets, and track campaign metrics.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex-1 flex min-h-0">
          {/* Sidebar Tabs */}
          <div className="w-[180px] sm:w-[220px] bg-secondary/40 border-r border-border shrink-0 p-3 flex flex-col gap-1 overflow-y-auto">
            {SECTIONS.map((sec) => {
              const Icon = sec.icon;
              const isActive = activeSection === sec.id;
              return (
                <button
                  key={sec.id}
                  onClick={() => setActiveSection(sec.id)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium text-left transition-all duration-200 cursor-pointer ${
                    isActive
                      ? "bg-primary/10 text-primary font-semibold shadow-[0_2px_8px_rgba(242,91,24,0.06)]"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-primary" : sec.color}`} />
                  <span>{sec.label}</span>
                </button>
              );
            })}
          </div>

          {/* Content Pane */}
          <ScrollArea className="flex-1 p-6 h-full overflow-y-auto">
            {renderContent()}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
