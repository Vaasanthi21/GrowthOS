import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import VersionHistoryDrawer from '../VersionHistoryDrawer';
import { useTasks } from '../../context/TaskContext';
import {
  Sparkles,
  Zap,
  Loader2,
  AlertCircle,
  Check,
  CheckCircle2,
  FileText,
  Save,
  Globe,
  Sliders,
  FileEdit,
  RotateCw,
  Gauge,
  History,
  X,
  ArrowLeft,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

export const BlogEditor = ({ blogId, onBack }) => {
  const queryClient = useQueryClient();
  const { tasks, startTask, clearTask } = useTasks();

  // Form states
  const [title, setTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState('draft');
  const [publishDate, setPublishDate] = useState('');
  const [author, setAuthor] = useState('');
  const [keywordCategory, setKeywordCategory] = useState('');
  const [keyword, setKeyword] = useState('');

  // UI States
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showSeoDetails, setShowSeoDetails] = useState(false);

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 4000);
  };

  // Fetch blog data
  const {
    data: blogRecord,
    isLoading,
    isError,
    error
  } = useQuery({
    queryKey: ['blog-edit', blogId],
    queryFn: async () => {
      const response = await api.get(`/blogs/${blogId}`);
      return response.data.data;
    },
    enabled: !!blogId,
    retry: false
  });

  const taskId = blogId ? `blog_generate_${blogRecord?.topicId?._id || blogRecord?.topicId}` : null;
  const optimizeTaskId = blogId ? `blog_optimize_${blogId}` : null;

  // Initialize form fields
  useEffect(() => {
    if (blogRecord) {
      setTitle(blogRecord.title || '');
      setMetaDescription(blogRecord.metaDescription || '');
      setContent(blogRecord.content || '');
      setStatus(blogRecord.status || 'draft');
      setAuthor(blogRecord.author || '');
      setKeywordCategory(blogRecord.keywordCategory || '');
      setKeyword(blogRecord.keyword || '');
      if (blogRecord.publishDate) {
        const localDate = new Date(blogRecord.publishDate);
        const tzOffset = localDate.getTimezoneOffset() * 60000;
        const localISOTime = new Date(localDate - tzOffset).toISOString().slice(0, 16);
        setPublishDate(localISOTime);
      } else {
        setPublishDate('');
      }
    }
  }, [blogRecord]);

  // Sync background SEO optimization task
  useEffect(() => {
    if (!optimizeTaskId) return;
    const task = tasks[optimizeTaskId];
    if (task) {
      if (task.status === 'success') {
        const resData = task.data;
        queryClient.invalidateQueries({ queryKey: ['blog-edit', blogId] });
        queryClient.invalidateQueries({ queryKey: ['user-credit-balance'] });
        triggerToast(`SEO Auto-Optimized successfully! Score: ${resData.oldScore} -> ${resData.newScore}`);
        clearTask(optimizeTaskId);
      } else if (task.status === 'error') {
        const err = task.error;
        console.error(err);
        queryClient.invalidateQueries({ queryKey: ['user-credit-balance'] });
        triggerToast(err.response?.data?.error || 'SEO optimization failed.', 'error');
        clearTask(optimizeTaskId);
      }
    }
  }, [tasks, optimizeTaskId, blogId, queryClient, clearTask]);

  // Sync background regeneration task
  useEffect(() => {
    if (!taskId) return;
    const task = tasks[taskId];
    if (task) {
      if (task.status === 'success') {
        queryClient.invalidateQueries({ queryKey: ['blog-edit', blogId] });
        queryClient.invalidateQueries({ queryKey: ['user-credit-balance'] });
        triggerToast('AI Canonical Blog successfully regenerated!');
        clearTask(taskId);
      } else if (task.status === 'error') {
        const err = task.error;
        console.error(err);
        queryClient.invalidateQueries({ queryKey: ['user-credit-balance'] });
        triggerToast(err.response?.data?.error || 'Generation failed.', 'error');
        clearTask(taskId);
      }
    }
  }, [tasks, taskId, blogId, queryClient, clearTask]);

  // Mutation to save blog
  const updateMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await api.put(`/blogs/${blogId}`, payload);
      return response.data.data;
    },
    onSuccess: (updatedBlog) => {
      queryClient.setQueryData(['blog-edit', blogId], updatedBlog);
      queryClient.invalidateQueries({ queryKey: ['blogs-list'] });
      triggerToast('Canonical Blog modifications saved successfully.');
    }
  });

  const handleSave = (targetStatus = null) => {
    const finalStatus = targetStatus || status;
    updateMutation.mutate({
      title: title.trim(),
      metaDescription: metaDescription.trim(),
      content: content.trim(),
      status: finalStatus,
      publishDate: publishDate ? new Date(publishDate).toISOString() : null,
      author: author.trim(),
      keywordCategory: keywordCategory.trim(),
      keyword: keyword.trim()
    });
  };

  const handleOptimize = () => {
    if (!blogRecord || !optimizeTaskId) return;
    
    // Save the latest editor values first, then run optimization
    updateMutation.mutate({
      title: title.trim(),
      metaDescription: metaDescription.trim(),
      content: content.trim(),
      status,
      publishDate: publishDate ? new Date(publishDate).toISOString() : null,
      author: author.trim(),
      keywordCategory: keywordCategory.trim(),
      keyword: keyword.trim()
    }, {
      onSuccess: () => {
        const startTime = new Date().toISOString();
        startTask(optimizeTaskId, async () => {
          try {
            const response = await api.post(`/blogs/${blogRecord._id}/optimize`);
            queryClient.invalidateQueries({ queryKey: ['user-credit-balance'] });
            return response.data;
          } catch (err) {
            console.warn('Optimize request timed out or failed, starting polling...', err);
            let attempts = 0;
            const maxAttempts = 20; // 60 seconds max
            while (attempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 3000));
              try {
                const getRes = await api.get(`/blogs/${blogRecord._id}`);
                const updatedBlog = getRes.data?.data;
                if (updatedBlog && updatedBlog.updatedAt && new Date(updatedBlog.updatedAt) > new Date(startTime)) {
                  queryClient.invalidateQueries({ queryKey: ['user-credit-balance'] });
                  queryClient.invalidateQueries({ queryKey: ['blog-edit', blogId] });
                  return {
                    success: true,
                    oldScore: blogRecord.seoScore || 0,
                    newScore: updatedBlog.seoScore || 0,
                    improvements: ['SEO Auto-Optimized successfully'],
                    data: updatedBlog
                  };
                }
              } catch (getErr) {
                // Keep polling
              }
              attempts++;
            }
            throw new Error('Optimize adaptation timed out. Please try again.');
          }
        });
      }
    });
  };

  const handleGenerate = () => {
    if (!blogRecord || !taskId) return;
    const topicId = blogRecord.topicId?._id || blogRecord.topicId;
    const startTime = new Date().toISOString();
    startTask(taskId, async () => {
      try {
        const response = await api.post('/blogs/generate', {
          topicId,
          blogId: blogRecord._id
        });
        queryClient.invalidateQueries({ queryKey: ['user-credit-balance'] });
        return response.data.data;
      } catch (err) {
        console.warn('Regeneration request timed out or failed, starting polling...', err);
        let attempts = 0;
        const maxAttempts = 20; // 60 seconds max
        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          try {
            const getRes = await api.get(`/blogs/${blogRecord._id}`);
            const updatedBlog = getRes.data?.data;
            if (updatedBlog && updatedBlog.updatedAt && new Date(updatedBlog.updatedAt) > new Date(startTime)) {
              queryClient.invalidateQueries({ queryKey: ['user-credit-balance'] });
              queryClient.invalidateQueries({ queryKey: ['blog-edit', blogId] });
              return updatedBlog;
            }
          } catch (getErr) {
            // Keep polling
          }
          attempts++;
        }
        throw new Error('Regeneration timed out. Please check your dashboard or try again.');
      }
    });
  };

  if (isLoading) {
    return (
      <div className="bg-card rounded-3xl p-12 border border-border flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="animate-spin text-primary" size={32} />
        <p className="text-sm font-semibold tracking-wider text-muted-foreground">Loading editor...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-card rounded-3xl p-12 border border-red-500/20 text-center space-y-4 max-w-lg mx-auto">
        <AlertCircle size={40} className="text-red-400 mx-auto" />
        <h3 className="font-display text-xl font-bold text-red-200">Failed to Load Blog</h3>
        <p className="text-xs text-muted-foreground">{error.message || 'Unknown network error.'}</p>
      </div>
    );
  }

  // Reactive calculations
  const liveWordCount = content ? content.trim().split(/\s+/).filter(Boolean).length : 0;
  const wordCountValid = liveWordCount >= 800 && liveWordCount <= 1200;
  const h2Count = blogRecord?.seoAnalysis?.checks?.h2Count || 0;
  const h2Valid = h2Count >= 2;
  const h1Valid = blogRecord?.seoAnalysis?.checks?.keywordInH1 || false;
  const metaValid = !!metaDescription;
  const slugValid = !!blogRecord?.slug;
  const conclusionValid = blogRecord?.seoAnalysis?.checks?.conclusionPresence || false;
  const isValidationPassed = wordCountValid && h2Valid && h1Valid && metaValid && slugValid && conclusionValid;

  const latestOpt = blogRecord?.optimizationHistory && blogRecord.optimizationHistory.length > 0
    ? blogRecord.optimizationHistory[blogRecord.optimizationHistory.length - 1]
    : null;

  const isGenerating = taskId && tasks[taskId]?.status === 'running';

  return (
    <div className="space-y-6">
      {/* Floating Success Notification */}
      {showToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-card bg-white/95 border border-primary/20 text-foreground text-sm px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 whitespace-nowrap animate-slide-down-center">
          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <Check size={14} />
          </div>
          <span className="font-semibold text-slate-800">{toastMessage}</span>
        </div>
      )}

      {/* Editor Header Toolbar Controls */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <button
          onClick={onBack}
          disabled={isGenerating}
          className="px-3 py-2 border border-border hover:border-border bg-white/5 hover:bg-white/10 text-muted-foreground text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <ArrowLeft size={13} />
          <span>Back to directory</span>
        </button>
        <span className="text-xs text-slate-500 font-mono">Blogs Editor</span>
      </div>

      {isGenerating ? (
        <div className="bg-card rounded-3xl p-12 border border-border flex flex-col items-center justify-center text-center space-y-6 min-h-[450px] relative overflow-hidden bg-cardackground/80">
          <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 to-accent/5 pointer-events-none" />
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-primary to-accent flex items-center justify-center animate-spin duration-[3.5s] shadow-glow" />
            <Sparkles size={28} className="absolute inset-0 m-auto text-background animate-pulse" />
          </div>
          <div className="space-y-2">
            <h3 className="font-display text-xl font-bold tracking-tight text-foreground animate-pulse">Running AI Synthesis Engine</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Regenerating canonical drafts and tuning SEO scorecards...
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Top workspace widgets */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Metadata config form */}
            <div className="bg-card rounded-2xl p-6 border border-border space-y-4">
              <h3 className="font-display text-sm font-bold text-foreground uppercase tracking-wider mb-2 flex items-center gap-2 border-b border-border pb-3">
                <Sliders size={16} className="text-primary" />
                <span>Metadata Configurations</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground">SEO Post Title *</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-4 py-2 bg-cardackground/60 border border-border rounded-xl text-foreground text-xs font-semibold focus:outline-none focus:border-primary transition-colors"
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground">Meta Description *</label>
                  <textarea
                    rows={2}
                    required
                    value={metaDescription}
                    onChange={(e) => setMetaDescription(e.target.value)}
                    className="w-full px-4 py-2 bg-cardackground/60 border border-border rounded-xl text-foreground text-xs focus:outline-none focus:border-primary transition-colors resize-none leading-relaxed"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground">Target Keyword</label>
                  <input
                    type="text"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    className="w-full px-4 py-2 bg-background/60 border border-border rounded-xl text-foreground text-xs focus:outline-none focus:border-primary transition-colors"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground">Category</label>
                  <input
                    type="text"
                    value={keywordCategory}
                    onChange={(e) => setKeywordCategory(e.target.value)}
                    className="w-full px-4 py-2 bg-background/60 border border-border rounded-xl text-foreground text-xs focus:outline-none focus:border-primary transition-colors"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground">Author</label>
                  <input
                    type="text"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    className="w-full px-4 py-2 bg-background/60 border border-border rounded-xl text-foreground text-xs focus:outline-none focus:border-primary transition-colors"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground">Post Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full px-4 py-2 bg-background/60 border border-border rounded-xl text-foreground text-xs focus:outline-none focus:border-primary transition-colors cursor-pointer"
                  >
                    <option value="draft">Draft</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>
            </div>

            {/* SEO scorecard */}
            <div className="bg-card rounded-2xl p-6 border border-border space-y-4 flex flex-col justify-between">
              <div>
                <h3 className="font-display text-sm font-bold text-foreground uppercase tracking-wider mb-2 flex items-center gap-2 border-b border-border pb-3">
                  <Gauge size={16} className="text-primary" />
                  <span>SEO Scorecard</span>
                </h3>

                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="p-2 bg-white/5 border border-border rounded-xl">
                    <span className="text-[9px] text-slate-500 font-bold uppercase block">SEO Score</span>
                    <span className={`text-base font-extrabold font-mono mt-0.5 ${
                      blogRecord.seoScore >= 80 ? 'text-emerald-400' : blogRecord.seoScore >= 50 ? 'text-amber-400' : 'text-rose-400'
                    }`}>
                      {blogRecord.seoScore || 0}
                    </span>
                  </div>

                  <div className="p-2 bg-white/5 border border-border rounded-xl">
                    <span className="text-[9px] text-slate-500 font-bold uppercase block">Words</span>
                    <span className={`text-base font-extrabold font-mono mt-0.5 ${
                      wordCountValid ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {liveWordCount}
                    </span>
                  </div>

                  <div className="p-2 bg-white/5 border border-border rounded-xl">
                    <span className="text-[9px] text-slate-500 font-bold uppercase block">Readability</span>
                    <span className="text-base font-extrabold font-mono text-muted-foreground mt-0.5">
                      {blogRecord.seoAnalysis?.readabilityScore || 0}
                    </span>
                  </div>

                  <div className="p-2 bg-white/5 border border-border rounded-xl">
                    <span className="text-[9px] text-slate-500 font-bold uppercase block">Density</span>
                    <span className="text-base font-extrabold font-mono text-muted-foreground mt-0.5">
                      {blogRecord.seoAnalysis?.keywordDensity !== undefined ? `${blogRecord.seoAnalysis.keywordDensity}%` : '0%'}
                    </span>
                  </div>
                </div>

                {/* Audit checklist */}
                <div className="space-y-2 border-t border-border pt-3 mt-4">
                  <button
                    type="button"
                    onClick={() => setShowSeoDetails(!showSeoDetails)}
                    className="w-full flex justify-between items-center text-[10px] hover:text-foreground transition-colors group focus:outline-none"
                  >
                    <span className="font-bold text-muted-foreground uppercase tracking-widest font-mono group-hover:text-foreground">SEO checklist (13 Checks)</span>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[8px] font-bold font-mono ${
                        blogRecord?.seoScore >= 80 ? 'bg-emerald-500/10 text-emerald-400' :
                        blogRecord?.seoScore >= 50 ? 'bg-amber-500/10 text-amber-400' :
                        'bg-rose-500/10 text-rose-400'
                      }`}>
                        {blogRecord?.seoScore >= 80 ? 'EXCELLENT' : blogRecord?.seoScore >= 50 ? 'GOOD' : 'NEEDS WORK'}
                      </span>
                      {showSeoDetails ? <ChevronUp size={12} className="text-muted-foreground" /> : <ChevronDown size={12} className="text-muted-foreground" />}
                    </div>
                  </button>

                  {showSeoDetails && (
                    <div className="space-y-3 mt-3 animate-fade-in text-left">
                      <div className="grid grid-cols-1 gap-1.5 text-[11px] max-h-60 overflow-y-auto pr-1">
                        {[
                          { label: 'Word Count (800-1200)', value: wordCountValid, info: `${liveWordCount} words` },
                          { label: 'Keyword in Title', value: !!blogRecord?.seoAnalysis?.checks?.keywordInTitle },
                          { label: 'Keyword in Meta Description', value: !!blogRecord?.seoAnalysis?.checks?.keywordInMetaDescription },
                          { label: 'Keyword in First Paragraph', value: !!blogRecord?.seoAnalysis?.checks?.keywordInFirstParagraph },
                          { label: 'Keyword in H1 Heading', value: !!blogRecord?.seoAnalysis?.checks?.keywordInH1 },
                          { label: 'Keyword in URL Slug', value: !!blogRecord?.seoAnalysis?.checks?.keywordInSlug },
                          { label: 'Min 2 H2 Subheadings', value: h2Valid, info: `Found ${h2Count}` },
                          { label: 'Min 1 H3 Subheading', value: (blogRecord?.seoAnalysis?.checks?.h3Count || 0) >= 1, info: `Found ${blogRecord?.seoAnalysis?.checks?.h3Count || 0}` },
                          { label: 'FAQ Section Included', value: !!blogRecord?.seoAnalysis?.checks?.faqPresence },
                          { label: 'Conclusion Included', value: !!blogRecord?.seoAnalysis?.checks?.conclusionPresence },
                          { label: 'Internal Links', value: (blogRecord?.seoAnalysis?.checks?.internalLinks || 0) >= 1, info: `Found ${blogRecord?.seoAnalysis?.checks?.internalLinks || 0}` },
                          { label: 'External Links', value: (blogRecord?.seoAnalysis?.checks?.externalLinks || 0) >= 1, info: `Found ${blogRecord?.seoAnalysis?.checks?.externalLinks || 0}` },
                          { label: 'Image Alt Text Configured', value: !!blogRecord?.seoAnalysis?.checks?.imageAltText }
                        ].map((item, idx) => (
                          <div key={idx} className="flex justify-between items-center bg-white/[0.02] border border-border px-2.5 py-1.5 rounded-xl hover:bg-white/[0.04] transition-colors">
                            <div className="flex flex-col text-left">
                              <span className="text-muted-foreground font-semibold text-[10px]">{item.label}</span>
                              {item.info && <span className="text-[8px] text-slate-500 font-mono font-medium">{item.info}</span>}
                            </div>
                            <span className={`text-[10px] font-bold ${item.value ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {item.value ? '✓ Passed' : '✗ Improve'}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Actionable Google Recommendations */}
                      {blogRecord?.seoAnalysis?.recommendations && blogRecord.seoAnalysis.recommendations.length > 0 && (
                        <div className="border-t border-border pt-2.5 mt-2.5 space-y-1.5">
                          <span className="text-[9px] font-bold text-rose-400 uppercase tracking-wider block">Google Ranking Action Items:</span>
                          <ul className="list-disc ml-4 space-y-1 text-[10px] text-muted-foreground leading-normal max-h-32 overflow-y-auto pr-1">
                            {blogRecord.seoAnalysis.recommendations.map((rec, i) => (
                              <li key={i}>{rec}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Action optimization */}
              <div className="space-y-3 pt-3 border-t border-border mt-4">
                <button
                  type="button"
                  onClick={handleOptimize}
                  disabled={((optimizeTaskId && tasks[optimizeTaskId]?.status === 'running') || updateMutation.isPending)}
                  className="w-full py-2.5 bg-gradient-to-r from-primary to-accent text-background font-bold text-xs rounded-xl shadow-glow transition-all hover:opacity-90 flex items-center justify-center gap-1.5"
                >
                  {((optimizeTaskId && tasks[optimizeTaskId]?.status === 'running')) ? (
                    <>
                      <Loader2 size={13} className="animate-spin text-background" />
                      <span>Optimizing Content...</span>
                    </>
                  ) : (
                    <>
                      <Zap size={13} />
                      <span>Auto Optimize SEO (5 Credits)</span>
                    </>
                  )}
                </button>

                {latestOpt && (
                  <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl text-xs space-y-1">
                    <div className="flex justify-between items-center text-[9px] uppercase tracking-wider font-mono text-muted-foreground">
                      <span>Latest Optimize</span>
                      <span className="text-primary font-bold">Score: {latestOpt.oldScore} ➔ {latestOpt.newScore}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom stack (outline + version + md editor) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Outline & Versions */}
            <div className="lg:col-span-1 space-y-6 flex flex-col justify-start">
              {/* Version History */}
              <div className="bg-card rounded-2xl p-6 border border-border flex flex-col max-h-[280px]">
                <h3 className="font-display text-xs font-bold text-foreground uppercase tracking-wider mb-3 flex items-center gap-2 border-b border-border pb-2">
                  <History size={16} className="text-accent" />
                  <span>Version History</span>
                </h3>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-glass">
                  {blogRecord.versions && blogRecord.versions.length > 0 ? (
                    [...blogRecord.versions]
                      .sort((a, b) => b.version - a.version)
                      .slice(0, 5)
                      .map((ver, idx) => (
                        <div key={ver.version} className="p-2.5 bg-white/5 border border-border rounded-xl flex items-center justify-between hover:border-border transition-colors">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold font-mono text-foreground">v{ver.version}</span>
                              {idx === 0 && (
                                <span className="text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1 py-0.5 rounded font-mono uppercase font-bold">
                                  Current
                                </span>
                              )}
                            </div>
                            <span className="text-[9px] text-slate-500 block font-mono">
                              {new Date(ver.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <span className="text-xs font-bold font-mono text-muted-foreground">
                            SEO: {ver.seoScore}
                          </span>
                        </div>
                      ))
                  ) : (
                    <p className="text-[10px] text-slate-500 py-6 text-center font-semibold">No version snapshots created yet.</p>
                  )}
                </div>
              </div>

              {/* Structural Outline */}
              <div className="bg-card rounded-2xl p-6 border border-border flex flex-col max-h-[320px]">
                <h3 className="font-display text-xs font-bold text-foreground uppercase tracking-wider mb-3 flex items-center gap-2 border-b border-border pb-2">
                  <FileText size={16} className="text-accent" />
                  <span>AI Structural Outline</span>
                </h3>
                <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-glass">
                  {blogRecord.outline && blogRecord.outline.length > 0 ? (
                    blogRecord.outline.map((sec, idx) => (
                      <div key={idx} className="p-3 bg-white/5 border border-border rounded-xl space-y-1.5">
                        <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <span className="w-4 h-4 rounded bg-primary/20 text-primary flex items-center justify-center font-mono text-[9px]">
                            {idx + 1}
                          </span>
                          <span className="truncate">{typeof sec === 'string' ? sec : (sec.sectionTitle || sec.title || '')}</span>
                        </p>
                        {sec.talkingPoints && Array.isArray(sec.talkingPoints) && sec.talkingPoints.length > 0 && (
                          <ul className="list-disc ml-6 text-[10px] text-muted-foreground space-y-1">
                            {sec.talkingPoints.map((tp, i) => (
                              <li key={i}>{tp}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-[10px] text-slate-500 py-6 text-center font-semibold">No custom outline structures defined.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Markdown editor panel */}
            <div className="lg:col-span-2 flex flex-col">
              <div className="bg-card rounded-3xl border border-border overflow-hidden flex flex-col flex-grow h-full min-h-[600px]">
                <div className="px-6 py-4 border-b border-border bg-white/5 flex flex-col sm:flex-row justify-between sm:items-center gap-4 shrink-0">
                  <div className="flex items-center gap-2 text-foreground">
                    <FileEdit size={18} className="text-accent" />
                    <h3 className="font-display text-sm font-bold tracking-tight">Canonical Markdown Editor</h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setHistoryOpen(true)}
                      className="px-3 py-1.5 border border-border hover:border-border bg-white/5 hover:bg-white/10 text-muted-foreground text-xs font-semibold rounded-xl transition-all"
                    >
                      <History size={13} className="inline mr-1" />
                      <span>History</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleGenerate}
                      disabled={isGenerating || updateMutation.isPending}
                      className="px-3 py-1.5 border border-primary/20 hover:border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold rounded-xl transition-all"
                    >
                      <RotateCw size={13} className="inline mr-1" />
                      <span>Regenerate (10 Credits)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSave(status)}
                      disabled={updateMutation.isPending}
                      className="px-3 py-1.5 border border-accent/20 hover:border-accent/40 bg-accent/10 hover:bg-accent/20 text-accent text-xs font-semibold rounded-xl transition-all"
                    >
                      {updateMutation.isPending ? (
                        <Loader2 className="animate-spin text-accent" size={13} />
                      ) : (
                        <Save size={13} className="inline mr-1" />
                      )}
                      <span>Save</span>
                    </button>


                  </div>
                </div>

                {/* Markdown text area */}
                <div className="flex-1 p-6 relative flex flex-col min-h-0 bg-cardackground/25">
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Write your comprehensive canonical content in structured Markdown format..."
                    className="w-full flex-1 bg-transparent border-0 resize-none font-mono text-xs text-foreground leading-relaxed focus:outline-none focus:ring-0 overflow-y-auto pr-2 scrollbar-glass"
                  />
                  <div className="mt-4 border-t border-border pt-3 flex justify-between items-center text-[10px] text-slate-500 font-mono">
                    <span>Markdown Enabled</span>
                    <span className="font-semibold text-muted-foreground">
                      Words: ~{liveWordCount} | Characters: {content?.length || 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {blogRecord && (
        <VersionHistoryDrawer
          isOpen={historyOpen}
          onClose={() => setHistoryOpen(false)}
          blogId={blogRecord._id}
          currentTitle={title}
          currentMeta={metaDescription}
          currentContent={content}
          onRestoreSuccess={(updatedBlog) => {
            queryClient.setQueryData(['blog-edit', blogId], updatedBlog);
            setTitle(updatedBlog.title || '');
            setMetaDescription(updatedBlog.metaDescription || '');
            setContent(updatedBlog.content || '');
            setStatus(updatedBlog.status || 'draft');
            setAuthor(updatedBlog.author || '');
            setKeywordCategory(updatedBlog.keywordCategory || '');
            setKeyword(updatedBlog.keyword || '');
            triggerToast('Blog restored to previous version successfully!');
          }}
        />
      )}
    </div>
  );
};

export default BlogEditor;
