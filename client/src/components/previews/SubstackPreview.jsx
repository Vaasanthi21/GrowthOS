import React, { useState } from 'react';
import { Heart, MessageSquare, Share2, Mail, Check, ArrowUpRight } from 'lucide-react';
import { renderMarkdownToHTML } from '../../utils/markdown';

export const SubstackPreview = ({ title, subtitle, copy, imageUrl, companyLogo }) => {
  const [likes, setLikes] = useState(89);
  const [liked, setLiked] = useState(false);
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleLike = () => {
    if (liked) {
      setLiked(false);
      setLikes(prev => prev - 1);
    } else {
      setLiked(true);
      setLikes(prev => prev + 1);
    }
  };

  const handleSubscribe = (e) => {
    e.preventDefault();
    if (email.trim()) {
      setSubscribed(true);
      setEmail('');
      setTimeout(() => setSubscribed(false), 4000);
    }
  };

  return (
    <div className="glass-card rounded-3xl border border-border max-w-2xl mx-auto p-6 md:p-8 bg-card text-left shadow-2xl space-y-6">
      
      {/* Substack Newsletter Header */}
      <div className="text-center border-b border-border pb-4 mb-4">
        <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-primary font-mono">
          The Veloce Newsletter
        </h4>
        <p className="text-[9px] text-muted-foreground mt-1">Written by tech founders, for growth engineers. Substack Edition.</p>
      </div>

      {/* Story Metadata */}
      <div className="space-y-3">
        {title && (
          <h3 className="text-xl md:text-2xl font-extrabold text-foreground leading-tight font-serif tracking-tight text-center">
            {title}
          </h3>
        )}

        {subtitle && (
          <h4 className="text-xs md:text-sm font-normal text-muted-foreground italic text-center mt-1">
            {subtitle}
          </h4>
        )}

        <div className="flex flex-col items-center gap-1.5 text-[10px] text-muted-foreground font-mono text-center">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground">Veloce Team</span>
            <span>•</span>
            <span>June 11, 2026</span>
          </div>
          <span className="text-muted-foreground">Grounded SaaS Insights and Scaling Metrics</span>
        </div>
      </div>

      {imageUrl && (
        <div className="my-4 rounded-xl overflow-hidden border border-border bg-slate-950 select-none relative group/image">
          <img src={imageUrl} alt="Substack cover" className="w-full h-auto object-contain block" />
          {companyLogo && !(imageUrl && (imageUrl.includes('creative-os-assets') || imageUrl.includes('dalle') || imageUrl.includes('amazonaws.com') || imageUrl.includes('media-proxy') || imageUrl.startsWith('data:image'))) && (
            <div className="absolute bottom-4 right-4 flex items-center justify-center h-9 w-auto animate-fade-in select-none pointer-events-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
              <img src={companyLogo} alt="Logo" className="max-h-9 w-auto object-contain rounded-md" />
            </div>
          )}
        </div>
      )}

      {/* Action Toolbar Top */}
      <div className="border-t border-b border-border py-2.5 flex items-center justify-between text-xs text-muted-foreground font-mono">
        <div className="flex items-center gap-4">
          <button 
            onClick={handleLike}
            className={`flex items-center gap-1 text-[11px] font-bold ${
              liked ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Heart size={13} className={liked ? 'fill-primary text-primary' : ''} />
            <span>{likes} Likes</span>
          </button>
          
          <button className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground hover:text-foreground">
            <MessageSquare size={13} />
            <span>15 Comments</span>
          </button>
        </div>

        <button className="text-muted-foreground hover:text-foreground p-1 hover:bg-muted rounded-lg transition-colors">
          <Share2 size={14} />
        </button>
      </div>

      {/* Main Copy Area */}
      <div className="space-y-4 text-xs md:text-sm text-foreground leading-relaxed max-h-[350px] overflow-y-auto pr-2 scrollbar-glass">
        {copy ? (
          <div 
            className="text-foreground leading-relaxed font-serif text-xs md:text-sm"
            dangerouslySetInnerHTML={{ __html: renderMarkdownToHTML(copy) }}
          />
        ) : (
          <p className="text-xs text-slate-500 font-mono">No substack newsletter outline generated.</p>
        )}
      </div>

      {/* Newsletter Signup widget inside post */}
      <div className="p-5 rounded-2xl bg-muted/50 border border-border space-y-4 text-center max-w-md mx-auto">
        <Mail size={24} className="text-primary mx-auto animate-pulse" />
        <div>
          <p className="text-xs font-bold text-foreground">Subscribe to Veloce Newsletter</p>
          <p className="text-[10px] text-muted-foreground mt-1">Receive technical playbooks and scaling deep dives twice weekly.</p>
        </div>

        {subscribed ? (
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-bold rounded-xl flex items-center justify-center gap-1 animate-pulse">
            <Check size={12} />
            <span>Subscription Confirmed!</span>
          </div>
        ) : (
          <form onSubmit={handleSubscribe} className="flex gap-2">
            <input
              type="email"
              required
              placeholder="name@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-grow px-3 py-1.5 bg-background border border-border rounded-xl text-foreground text-[10px] focus:outline-none focus:border-primary transition-colors text-center"
            />
            
            <button 
              type="submit"
              className="flex items-center justify-center gap-1 px-4 py-1.5 bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all font-bold text-slate-950 rounded-xl text-[10px] shadow-glow whitespace-nowrap"
            >
              <span>Subscribe</span>
              <ArrowUpRight size={12} />
            </button>
          </form>
        )}
      </div>

      {/* Action Toolbar Bottom */}
      <div className="border-t border-border pt-4 flex items-center justify-between text-xs text-slate-500 font-mono">
        <span>© 2026 Veloce Operations</span>
        <span className="text-muted-foreground hover:text-foreground cursor-pointer hover:underline">Unsubscribe</span>
      </div>

    </div>
  );
};

export default SubstackPreview;
