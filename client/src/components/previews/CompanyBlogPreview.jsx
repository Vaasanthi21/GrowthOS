import React, { useState } from 'react';
import { Mail, ArrowUpRight, Check, Heart, MessageSquare, Share2 } from 'lucide-react';
import { renderMarkdownToHTML } from '../../utils/markdown';

export const CompanyBlogPreview = ({ title, subtitle, copy, imageUrl, companyLogo }) => {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [likes, setLikes] = useState(42);
  const [liked, setLiked] = useState(false);

  const handleSubscribe = (e) => {
    e.preventDefault();
    if (email.trim()) {
      setSubscribed(true);
      setEmail('');
      setTimeout(() => setSubscribed(false), 4000);
    }
  };

  const handleLike = () => {
    if (liked) {
      setLiked(false);
      setLikes(prev => prev - 1);
    } else {
      setLiked(true);
      setLikes(prev => prev + 1);
    }
  };

  const paragraphs = copy ? copy.split('\n').filter(Boolean) : [];

  return (
    <div className="glass-card rounded-3xl border border-border max-w-4xl mx-auto overflow-hidden bg-card text-left shadow-2xl">
      {/* Header Banner Area */}
      <div className="h-40 md:h-48 bg-gradient-to-tr from-primary/10 via-accent/5 to-secondary/15 border-b border-border relative flex items-center justify-center p-6 text-center">
        <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none" />
        <div className="space-y-2 relative z-10 max-w-2xl">
          <span className="text-[9px] font-bold uppercase tracking-widest text-primary font-mono bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
            Enterprise Resources
          </span>
          {title && (
            <h3 className="text-lg md:text-xl font-bold text-foreground leading-tight tracking-tight mt-2">
              {title}
            </h3>
          )}
          {subtitle && (
            <p className="text-xs text-muted-foreground font-medium leading-relaxed mt-1">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
        
        {/* Main Content Column */}
        <div className="lg:col-span-2 space-y-4 text-xs md:text-sm text-foreground leading-relaxed max-h-[360px] overflow-y-auto pr-2 scrollbar-glass">
          {imageUrl && (
            <div className="my-3 rounded-2xl overflow-hidden border border-border bg-slate-950 select-none relative group/image">
              <img src={imageUrl} alt="Cover" className="w-full h-auto object-contain block" />
              {companyLogo && !(imageUrl && (imageUrl.includes('creative-os-assets') || imageUrl.includes('dalle') || imageUrl.includes('amazonaws.com') || imageUrl.includes('media-proxy') || imageUrl.startsWith('data:image'))) && (
                <div className="absolute bottom-4 right-4 flex items-center justify-center h-9 w-auto animate-fade-in select-none pointer-events-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
                  <img src={companyLogo} alt="Logo" className="max-h-9 w-auto object-contain rounded-md" />
                </div>
              )}
            </div>
          )}
          {copy ? (
            <div 
              className="text-xs md:text-sm text-foreground leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderMarkdownToHTML(copy) }}
            />
          ) : (
            <p className="text-xs text-slate-500 font-mono">No blog content adapted.</p>
          )}
        </div>

        {/* Sidebar Widgets Column */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Quick Actions Card */}
          <div className="glass-card rounded-2xl p-4 border border-border flex justify-between items-center bg-muted/50">
            <button 
              onClick={handleLike}
              className={`flex items-center gap-1.5 transition-all text-xs font-semibold ${
                liked ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Heart size={14} className={liked ? 'fill-primary text-primary' : ''} />
              <span>{likes} Likes</span>
            </button>
            <button className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-xs font-semibold">
              <MessageSquare size={14} />
              <span>12 Comments</span>
            </button>
            <button className="text-muted-foreground hover:text-foreground p-1 hover:bg-muted rounded-lg transition-colors">
              <Share2 size={14} />
            </button>
          </div>

          {/* Newsletter Box */}
          <div className="glass-card rounded-2xl p-5 border border-border space-y-4 text-center bg-muted/50">
            <Mail size={24} className="text-primary mx-auto animate-pulse" />
            <div>
              <p className="text-xs font-bold text-foreground">Subscribe to Tech Updates</p>
              <p className="text-[10px] text-muted-foreground mt-1">Get technical deep dives directly to your inbox context.</p>
            </div>

            {subscribed ? (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-xl flex items-center justify-center gap-1.5 animate-pulse">
                <Check size={12} />
                <span>Subscription Confirmed!</span>
              </div>
            ) : (
              <form onSubmit={handleSubscribe} className="space-y-2">
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-xl text-foreground text-[10px] focus:outline-none focus:border-primary transition-colors text-center animate-fade-in"
                />
                
                <button 
                  type="submit"
                  className="w-full flex items-center justify-center gap-1 px-3 py-2 bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all font-bold text-white rounded-xl text-[10px] shadow-glow"
                >
                  <span>Join Newsletter</span>
                  <ArrowUpRight size={12} />
                </button>
              </form>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};

export default CompanyBlogPreview;
