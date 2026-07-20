import React, { useState } from 'react';
import { ThumbsUp, MessageSquare, Share2, Heart, Bookmark } from 'lucide-react';
import { renderMarkdownToHTML } from '../../utils/markdown';

export const LinkedInPreview = ({ title, copy, hashtags = [], imageUrl, companyLogo }) => {
  const [likes, setLikes] = useState(148);
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  const handleLike = () => {
    if (liked) {
      setLiked(false);
      setLikes(prev => prev - 1);
    } else {
      setLiked(true);
      setLikes(prev => prev + 1);
    }
  };

  return (
    <div className="glass-card rounded-3xl border border-border max-w-2xl mx-auto p-6 md:p-8 bg-card text-left shadow-2xl relative">
      {/* Sourced Author bar */}
      <div className="flex items-center justify-between border-b border-border pb-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-muted border border-border flex items-center justify-center font-bold text-foreground text-xs shadow-glow-sm">
            VE
          </div>
          <div>
            <h4 className="text-xs font-bold text-foreground hover:underline cursor-pointer">Veloce Enterprise</h4>
            <p className="text-[10px] text-muted-foreground mt-0.5">Published as a LinkedIn Article • 6 min read • 🗓️ June 2026</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-muted-foreground">
          <button 
            onClick={() => setBookmarked(!bookmarked)}
            className={`p-1.5 hover:bg-muted rounded-lg transition-colors ${bookmarked ? 'text-primary' : 'hover:text-foreground'}`}
            title="Save Article"
          >
            <Bookmark size={15} className={bookmarked ? 'fill-primary' : ''} />
          </button>
          <button 
            onClick={() => {
              if (copy) {
                navigator.clipboard.writeText(copy);
                alert("LinkedIn article copy copied to clipboard!");
              }
            }}
            className="p-1.5 hover:bg-muted hover:text-foreground rounded-lg transition-colors"
            title="Copy Article Text"
          >
            <Share2 size={15} />
          </button>
        </div>
      </div>

      {/* Main story content */}
      <div className="space-y-5 leading-relaxed font-sans max-h-[380px] overflow-y-auto pr-2 scrollbar-glass">
        {title && (
          <h3 className="text-xl md:text-2xl font-extrabold text-foreground leading-tight font-serif tracking-tight">
            {title}
          </h3>
        )}
        
        {imageUrl && (
          <div className="my-4 rounded-xl overflow-hidden border border-border bg-slate-950 select-none flex items-center justify-center relative group/image">
            <img src={imageUrl} alt="LinkedIn Article Banner" className="w-full h-auto object-contain block" />
            {companyLogo && !(imageUrl && (imageUrl.includes('creative-os-assets') || imageUrl.includes('dalle') || imageUrl.includes('amazonaws.com') || imageUrl.includes('media-proxy') || imageUrl.startsWith('data:image'))) && (
              <div className="absolute bottom-4 right-4 flex items-center justify-center h-9 w-auto animate-fade-in select-none pointer-events-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
                <img src={companyLogo} alt="Logo" className="max-h-9 w-auto object-contain rounded-md" />
              </div>
            )}
          </div>
        )}
        
        <div className="text-[13px] md:text-[14px] text-foreground space-y-4 leading-relaxed font-serif">
          {copy ? (
            <div 
              className="text-foreground font-serif leading-loose"
              dangerouslySetInnerHTML={{ __html: renderMarkdownToHTML(copy) }}
            />
          ) : (
            <p className="text-xs text-slate-500 font-mono">No article copy adaptations generated.</p>
          )}
        </div>

        {/* Hashtags */}
        {hashtags && hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-3">
            {hashtags.map((tag, idx) => (
              <span 
                key={idx} 
                className="text-[10px] font-bold font-mono text-primary hover:underline cursor-pointer bg-primary/5 px-2 py-0.5 rounded border border-primary/10 transition-all"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Likes and Actions */}
      <div className="pt-5 border-t border-border mt-6 flex items-center justify-between text-xs text-muted-foreground font-mono">
        <div className="flex items-center gap-4">
          <button 
            onClick={handleLike}
            className={`flex items-center gap-1.5 hover:text-foreground transition-all duration-200 ${liked ? 'text-primary' : ''}`}
          >
            <ThumbsUp size={14} className={liked ? 'fill-primary text-primary' : ''} />
            <span className="font-semibold text-foreground">{likes} Likes</span>
          </button>
          
          <button className="flex items-center gap-1.5 hover:text-foreground transition-colors">
            <MessageSquare size={13} />
            <span>24 comments</span>
          </button>
        </div>
        
        <button className="px-3.5 py-1.5 bg-primary/10 border border-primary/20 hover:bg-primary text-primary hover:text-white text-[10px] font-bold rounded-full font-mono uppercase tracking-wide transition-all">
          Follow Veloce Enterprise
        </button>
      </div>
    </div>
  );
};

export default LinkedInPreview;
