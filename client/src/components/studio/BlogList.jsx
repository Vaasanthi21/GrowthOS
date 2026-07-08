import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import {
  FileText,
  Loader2,
  AlertCircle,
  Search,
  Pencil,
  Calendar,
  User,
  Globe,
  Archive,
  Check,
  Plus,
  Eye,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Trash2,
  Building2,
  Users2,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  BookOpen,
  Compass
} from 'lucide-react';

const statusColors = {
  Draft: 'border-l-slate-400 bg-slate-500/[0.01]',
  Scheduled: 'border-l-amber-500 bg-amber-500/[0.01]',
  Published: 'border-l-emerald-500 bg-emerald-500/[0.01]',
  Archived: 'border-l-rose-500 bg-rose-500/[0.01]',
};

const badgeColors = {
  Draft: 'border-slate-300 bg-slate-100 text-slate-600',
  Scheduled: 'border-amber-200 bg-amber-50 text-amber-700',
  Published: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  Archived: 'border-rose-200 bg-rose-50 text-rose-700',
};

const normalizeStatus = (value) => {
  const next = `${value || 'Draft'}`.trim().toLowerCase();
  if (next === 'scheduled' || next === 'pending') return 'Scheduled';
  if (next === 'published' || next === 'live') return 'Published';
  if (next === 'archived' || next === 'closed') return 'Archived';
  return 'Draft';
};

export const BlogList = ({ onOpenEditor, onOpenPreview, onOpenGenerate }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch blogs
  const { data: blogs = [], isLoading, isError, error } = useQuery({
    queryKey: ['blogs-list'],
    queryFn: async () => {
      const response = await api.get('/blogs');
      return response.data.data || [];
    }
  });

  // Fetch company data
  const { data: companyData, isLoading: companyLoading } = useQuery({
    queryKey: ['company'],
    queryFn: async () => {
      const response = await api.get('/company');
      return response.data.data;
    }
  });

  // Fetch personas data
  const { data: personasData = [], isLoading: personasLoading } = useQuery({
    queryKey: ['personas'],
    queryFn: async () => {
      const response = await api.get('/personas');
      return response.data.data || [];
    }
  });

  // Fetch knowledge base files data
  const { data: documentsData = [], isLoading: documentsLoading } = useQuery({
    queryKey: ['knowledge'],
    queryFn: async () => {
      const response = await api.get('/knowledge');
      return response.data.data || [];
    }
  });

  // Archive / Delete Mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, payload }) => {
      const response = await api.put(`/blogs/${id}`, payload);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blogs-list'] });
    }
  });

  const handleArchive = (blogId) => {
    if (window.confirm('Are you sure you want to archive this blog post?')) {
      updateStatusMutation.mutate({
        id: blogId,
        payload: { status: 'archived' }
      });
    }
  };

  // Filter logic
  const filteredBlogs = useMemo(() => {
    return blogs.filter((blog) => {
      const statusLabel = normalizeStatus(blog.status);
      let matchesTab = true;
      if (activeTab === 'Drafts') {
        matchesTab = statusLabel !== 'Archived';
      } else if (activeTab === 'Archived') {
        matchesTab = statusLabel === 'Archived';
      }
      
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !query ||
        blog.title?.toLowerCase().includes(query) ||
        blog.author?.toLowerCase().includes(query) ||
        blog.keywordCategory?.toLowerCase().includes(query) ||
        blog.topicId?.topicName?.toLowerCase().includes(query);

      return matchesTab && matchesSearch;
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [blogs, activeTab, searchQuery]);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  // Reset pagination when activeTab or searchQuery changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery]);

  const totalPages = Math.ceil(filteredBlogs.length / itemsPerPage);
  const paginatedBlogs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredBlogs.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredBlogs, currentPage, itemsPerPage]);

  const isProfileComplete = !!(
    companyData?.companyName &&
    companyData?.website &&
    companyData?.logo &&
    companyData?.productDescription &&
    companyData?.targetAudience
  );
  const hasPersonas = personasData && personasData.length > 0;
  const isReadyToGenerate = isProfileComplete && hasPersonas;
  const hasDocuments = documentsData && documentsData.length > 0;
  const isListLoading = isLoading || (blogs.length === 0 && (companyLoading || personasLoading || documentsLoading));

  if (isListLoading) {
    return (
      <div className="bg-card rounded-3xl p-12 border border-border flex flex-col items-center justify-center min-h-[300px] gap-3">
        <Loader2 className="animate-spin text-primary" size={32} />
        <p className="text-sm font-semibold tracking-wider text-muted-foreground">Loading blogs directory...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-card rounded-3xl p-12 border border-red-500/20 text-center space-y-4 max-w-lg mx-auto">
        <AlertCircle size={40} className="text-red-400 mx-auto" />
        <h3 className="font-display text-xl font-bold text-red-200">Failed to Load Blogs</h3>
        <p className="text-xs text-muted-foreground">{error.message || 'Unknown network error.'}</p>
      </div>
    );
  }

  if (blogs.length === 0) {
    // AI Quality Estimate properties
    let qualityBadgeBg = 'bg-red-500/10 text-red-400 border border-red-500/20';
    let qualityText = 'Incomplete';
    let qualityDesc = 'Provide company details and personas to enable blog generation.';
    
    if (isReadyToGenerate) {
      if (hasDocuments) {
        qualityBadgeBg = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
        qualityText = 'Excellent';
        qualityDesc = 'Factual grounding base is active.';
      } else {
        qualityBadgeBg = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
        qualityText = 'Good';
        qualityDesc = 'Upload company documents to improve blog accuracy and grounding.';
      }
    }

    return (
      <div className="space-y-8 animate-fade-in max-w-5xl mx-auto">
        <style>{`
          @keyframes glowingBreathe {
            0%, 100% {
              box-shadow: 0 0 10px rgba(242, 91, 24, 0.4), 0 0 4px rgba(242, 91, 24, 0.2);
            }
            50% {
              box-shadow: 0 0 22px rgba(242, 91, 24, 0.8), 0 0 8px rgba(242, 91, 24, 0.4);
            }
          }
          @keyframes shimmerSweep {
            0% {
              background-position: -200% 0;
            }
            100% {
              background-position: 200% 0;
            }
          }
          .animate-premium-btn {
            background: linear-gradient(90deg, #f25b18, #ff8c42, #e0480a, #f25b18) !important;
            background-size: 300% 100% !important;
            animation: glowingBreathe 2s infinite ease-in-out, shimmerSweep 4.5s infinite linear !important;
            border: 1px solid rgba(255, 255, 255, 0.2) !important;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
            color: #ffffff !important;
          }
          .animate-premium-btn:hover {
            transform: scale(1.06) translateY(-2px) !important;
            box-shadow: 0 0 28px rgba(242, 91, 24, 0.95), 0 0 12px rgba(255, 255, 255, 0.25) !important;
            border-color: rgba(255, 255, 255, 0.4) !important;
          }
          .animate-premium-btn:active {
            transform: scale(0.97) translateY(0) !important;
          }
        `}</style>
        {/* Welcome Section */}
        <div className="bg-card rounded-3xl p-8 border border-border bg-card relative overflow-hidden flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-accent/5 pointer-events-none" />
          <div className="space-y-3 max-w-xl text-left">
            <h1 className="font-display text-2xl md:text-3xl font-extrabold tracking-tight text-foreground leading-tight">
              Create SEO-Optimized Blogs Guided by Your Brand Context
            </h1>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Generate factually accurate, brand-aligned blog posts using advanced AI models grounded in your company's profile, personas, and custom knowledge documents.
            </p>
          </div>
          
          {/* Main CTA */}
          <div className="shrink-0 w-full md:w-auto">
            {isReadyToGenerate ? (
              <button
                onClick={() => onOpenGenerate()}
                className="w-full md:w-auto px-6 py-3.5 hover:opacity-90 font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer animate-premium-btn"
              >
                <span>Generate First Blog (10 Credits)</span>
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                onClick={() => navigate('/personas')}
                className="w-full md:w-auto px-6 py-3.5 bg-amber-500 hover:bg-amber-600 font-bold text-background rounded-xl transition-all active:scale-[0.98] text-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Complete Brand Setup</span>
                <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Brand Checklist & AI Quality Panel */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* AI Readiness Card */}
          <div className="md:col-span-2 bg-card rounded-3xl p-6 border border-border bg-card flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-bold text-foreground flex items-center gap-2">
                  <Building2 size={16} className="text-primary" />
                  <span>AI Readiness Checklist</span>
                </h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Align your AI assistant with your brand details and target demographics to ensure high-fidelity outputs.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                {/* Company details status */}
                <div 
                  onClick={() => navigate('/personas')}
                  className={`p-4 border rounded-2xl text-left cursor-pointer transition-all ${
                    isProfileComplete 
                      ? 'bg-emerald-500/[0.02] border-emerald-500/20 hover:border-emerald-500/30' 
                      : 'bg-red-500/[0.02] border-red-500/20 hover:border-red-500/30'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Company Profile</span>
                    {isProfileComplete ? (
                      <CheckCircle2 size={14} className="text-emerald-400" />
                    ) : (
                      <AlertCircle size={14} className="text-red-400 animate-pulse" />
                    )}
                  </div>
                  <div className="font-semibold text-xs text-foreground mb-1">
                    {isProfileComplete ? '✓ Configured' : 'Missing Details'}
                  </div>
                  <div className="text-[10px] text-slate-500 leading-normal">
                    {isProfileComplete ? 'Company details and audience info loaded.' : 'Complete your basic brand profile details.'}
                  </div>
                </div>

                {/* Persona status */}
                <div 
                  onClick={() => navigate('/personas')}
                  className={`p-4 border rounded-2xl text-left cursor-pointer transition-all ${
                    hasPersonas 
                      ? 'bg-emerald-500/[0.02] border-emerald-500/20 hover:border-emerald-500/30' 
                      : 'bg-red-500/[0.02] border-red-500/20 hover:border-red-500/30'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Audience Personas</span>
                    {hasPersonas ? (
                      <CheckCircle2 size={14} className="text-emerald-400" />
                    ) : (
                      <AlertCircle size={14} className="text-red-400 animate-pulse" />
                    )}
                  </div>
                  <div className="font-semibold text-xs text-foreground mb-1">
                    {hasPersonas ? `✓ ${personasData.length} Persona${personasData.length > 1 ? 's' : ''}` : 'Missing Personas'}
                  </div>
                  <div className="text-[10px] text-slate-500 leading-normal">
                    {hasPersonas ? 'Demographics and brand voice aligned.' : 'Create at least one buyer persona.'}
                  </div>
                </div>

                {/* Knowledge Documents status */}
                <div 
                  onClick={() => navigate('/personas')}
                  className={`p-4 border rounded-2xl text-left cursor-pointer transition-all ${
                    hasDocuments 
                      ? 'bg-emerald-500/[0.02] border-emerald-500/20 hover:border-emerald-500/30' 
                      : 'bg-white/[0.02] border-border hover:border-border'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Knowledge Base</span>
                    {hasDocuments ? (
                      <CheckCircle2 size={14} className="text-emerald-400" />
                    ) : (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-muted-foreground font-bold uppercase tracking-wider">Optional</span>
                    )}
                  </div>
                  <div className="font-semibold text-xs text-foreground mb-1">
                    {hasDocuments ? `${documentsData.length} Documents` : 'No Documents'}
                  </div>
                  <div className="text-[10px] text-slate-500 leading-normal">
                    {hasDocuments ? 'Fact sheets and references grounding active.' : 'Optionally upload source PDFs / DOCXs.'}
                  </div>
                </div>
              </div>
            </div>

            {/* Optional Knowledge Base Info Box */}
            {!hasDocuments && (
              <div className="p-4 bg-amber-500/[0.02] border border-amber-500/20 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-left">
                <div className="space-y-1">
                  <h4 className="font-display text-xs font-bold text-amber-300">Grounding Documents are Optional</h4>
                  <p className="text-[10px] text-muted-foreground leading-normal">
                    You can generate blogs without uploading documents, but uploading company case studies, whitepapers, or APIs keeps references accurate and factual.
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => navigate('/personas')}
                    className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 hover:border-amber-500/40 rounded-xl text-[10px] font-bold transition-all cursor-pointer"
                  >
                    Upload Documents
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* AI Quality Estimate Card */}
          <div className="bg-card rounded-3xl p-6 border border-border bg-card flex flex-col justify-between text-left relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.01] to-transparent pointer-events-none" />
            <div className="space-y-4">
              <h3 className="font-display text-sm font-bold text-foreground flex items-center gap-2">
                <Sparkles size={16} className="text-accent" />
                <span>AI Output Estimate</span>
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Evaluates predicted content accuracy, context alignment, and hallucination safety based on current brand state.
              </p>
            </div>

            <div className="space-y-4 pt-4 border-t border-border mt-4">
              <div className="flex items-center gap-3">
                <div className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase ${qualityBadgeBg}`}>
                  {qualityText}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground font-semibold leading-relaxed">
                {qualityDesc}
              </p>
            </div>
          </div>
        </div>


      </div>
    );
  }

  const getGridClass = (count) => {
    if (count === 1) {
      return "flex justify-center w-full py-4";
    }
    if (count === 2) {
      return "grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto w-full";
    }
    return "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full animate-fade-in";
  };

  return (
    <div className="space-y-6">
      <style>{`
        @keyframes glowingBreathe {
          0%, 100% {
            box-shadow: 0 0 10px rgba(242, 91, 24, 0.4), 0 0 4px rgba(242, 91, 24, 0.2);
          }
          50% {
            box-shadow: 0 0 22px rgba(242, 91, 24, 0.8), 0 0 8px rgba(242, 91, 24, 0.4);
          }
        }
        @keyframes shimmerSweep {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
        .animate-premium-btn {
          background: linear-gradient(90deg, #f25b18, #ff8c42, #e0480a, #f25b18) !important;
          background-size: 300% 100% !important;
          animation: glowingBreathe 2s infinite ease-in-out, shimmerSweep 4.5s infinite linear !important;
          border: 1px solid rgba(255, 255, 255, 0.25) !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          color: #ffffff !important;
        }
        .animate-premium-btn:hover {
          transform: scale(1.06) translateY(-2px) !important;
          box-shadow: 0 0 28px rgba(242, 91, 24, 0.95), 0 0 12px rgba(255, 255, 255, 0.25) !important;
          border-color: rgba(255, 255, 255, 0.4) !important;
        }
        .animate-premium-btn:active {
          transform: scale(0.97) translateY(0) !important;
        }
      `}</style>


      {/* Header with Search and Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        {/* Search */}
        <div className="relative w-full sm:max-w-md">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
            <Search size={16} />
          </span>
          <input
            type="text"
            placeholder="Search by title, category, author, or topic..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-cardackground/60 border border-border hover:border-border focus:border-primary rounded-xl text-foreground placeholder:text-slate-500 focus:outline-none text-xs transition-colors"
          />
        </div>

        {/* Generate Button */}
        <button
          onClick={onOpenGenerate}
          className="shrink-0 flex items-center gap-2 px-5 py-2.5 hover:opacity-90 font-extrabold rounded-xl text-xs cursor-pointer animate-premium-btn"
        >
          <Plus size={16} />
          <span>{blogs.length === 0 ? 'Generate First Blog (10 Credits)' : 'Generate New Blog (10 Credits)'}</span>
        </button>
      </div>

      {/* Tabs Filter */}
      <div className="flex border-b border-border gap-1 pb-px overflow-x-auto scrollbar-none">
        {['All', 'Drafts', 'Archived'].map((tab) => {
          const isActive = activeTab === tab;
          const count = tab === 'All' 
            ? blogs.length 
            : tab === 'Drafts'
              ? blogs.filter(b => normalizeStatus(b.status) !== 'Archived').length
              : blogs.filter(b => normalizeStatus(b.status) === 'Archived').length;

          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 text-xs font-semibold transition-all shrink-0 ${
                isActive
                  ? 'border-primary text-primary bg-primary/5 font-bold'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-white/5'
              }`}
            >
              <span>{tab}</span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                isActive ? 'bg-primary/20 text-primary' : 'bg-white/5 text-muted-foreground'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Grid List */}
      {filteredBlogs.length === 0 ? (
        <div className="bg-card rounded-3xl p-12 border border-border text-center py-20 space-y-4 animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto text-slate-500">
            <Search size={32} />
          </div>
          <h3 className="font-display text-lg font-bold text-muted-foreground">No matching blogs found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
            We couldn't find any blogs matching "{searchQuery}" under the tab "{activeTab}". Try clearing your filters or search query.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setActiveTab('All');
            }}
            className="px-4 py-2 border border-border hover:border-border bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground text-xs font-semibold rounded-xl transition-all cursor-pointer inline-flex items-center gap-1.5"
          >
            Clear Search & Filters
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className={getGridClass(paginatedBlogs.length)}>
            {paginatedBlogs.map((blog) => {
              const statusLabel = normalizeStatus(blog.status);
              const topicName = blog.topicId?.topicName;
              
              return (
                <div
                  key={blog._id}
                  className={`relative group p-5 bg-surface border-t border-b border-r border-border/40 border-l-4 ${statusColors[statusLabel] || statusColors.Draft} hover:border-border/80 rounded-2xl flex flex-col justify-between gap-5 transition-all duration-300 shadow-sm ${
                    paginatedBlogs.length === 1 ? 'w-full max-w-xl mx-auto' : ''
                  }`}
                >
                  <div className="space-y-3">
                    {/* Status & Date */}
                    <div className="flex justify-between items-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-bold tracking-wide uppercase border ${badgeColors[statusLabel] || badgeColors.Draft}`}>
                        {statusLabel}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                        <Calendar size={11} className="text-muted-foreground" />
                        {new Date(blog.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Topic Label & Title */}
                    <div className="space-y-1.5">
                      {topicName && (
                        <span className="text-[9px] text-accent font-bold uppercase tracking-wider font-mono">
                          {topicName}
                        </span>
                      )}
                      <h3 className="font-display text-sm font-bold text-foreground line-clamp-2 min-h-[2.5rem]" title={blog.title}>
                        {blog.title || 'Untitled Blog Post'}
                      </h3>
                    </div>

                    {/* Author / Category details */}
                    <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 pt-1 border-t border-border/40">
                      <div>
                        <span className="text-muted-foreground block text-[9px] uppercase font-semibold">Author</span>
                        <span className="text-slate-600 truncate block">{blog.author || 'Unassigned'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[9px] uppercase font-semibold">Category</span>
                        <span className="text-slate-600 truncate block">{blog.keywordCategory || 'General'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Grid Footer Actions */}
                  <div className="border-t border-border/40 pt-4 flex items-center justify-between mt-auto">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-500 font-semibold">SEO Score:</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        blog.seoScore >= 80 ? 'bg-emerald-500/10 text-emerald-600' :
                        blog.seoScore >= 50 ? 'bg-amber-500/10 text-amber-600' :
                        'bg-rose-500/10 text-rose-600'
                      }`}>
                        {blog.seoScore || 0}/100
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Open Editor Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenEditor(blog._id);
                        }}
                        className="px-3 py-1.5 bg-primary/10 hover:bg-primary text-primary hover:text-background border border-primary/20 hover:border-primary rounded-xl text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                        title="Edit blog post"
                      >
                        <Pencil size={12} />
                        <span>Edit</span>
                      </button>

                      {/* Open Preview Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenPreview(blog._id);
                        }}
                        className="px-3 py-1.5 border border-border hover:border-border bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground rounded-xl text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                        title="Open Adaptations & Simulator Previews"
                      >
                        <Eye size={12} />
                        <span>Preview</span>
                      </button>

                      {/* Archive / Delete Button */}
                      {statusLabel !== 'Archived' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleArchive(blog._id);
                          }}
                          className="p-1.5 bg-red-500/10 hover:bg-red-500/25 text-red-400 hover:text-red-200 border border-red-500/20 hover:border-red-500/40 rounded-xl transition-all cursor-pointer"
                          title="Archive post"
                        >
                          <Trash2 size={12} className="text-red-400" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex flex-col items-center justify-center border-t border-border pt-6 gap-3">
              <div className="flex items-center gap-1.5 justify-center">
                {/* First Page */}
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="p-2 border border-border hover:border-border bg-white/5 hover:bg-white/10 text-muted-foreground rounded-xl transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                  title="First Page"
                >
                  <ChevronsLeft size={14} />
                </button>

                {/* Previous Page */}
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="p-2 border border-border hover:border-border bg-white/5 hover:bg-white/10 text-muted-foreground rounded-xl transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                  title="Previous Page"
                >
                  <ChevronLeft size={14} />
                </button>

                {Array.from({ length: totalPages }, (_, idx) => {
                  const pageNum = idx + 1;
                  const active = currentPage === pageNum;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                        active
                          ? "bg-gradient-to-r from-primary to-accent text-background border-transparent shadow-glow-sm font-bold"
                          : "border-border hover:border-border bg-white/5 hover:bg-white/10 text-muted-foreground"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                {/* Next Page */}
                <button
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="p-2 border border-border hover:border-border bg-white/5 hover:bg-white/10 text-muted-foreground rounded-xl transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                  title="Next Page"
                >
                  <ChevronRight size={14} />
                </button>

                {/* Last Page */}
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="p-2 border border-border hover:border-border bg-white/5 hover:bg-white/10 text-muted-foreground rounded-xl transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                  title="Last Page"
                >
                  <ChevronsRight size={14} />
                </button>
              </div>

              <span className="text-xs text-muted-foreground">
                Showing <strong className="text-foreground">{(currentPage - 1) * itemsPerPage + 1}</strong> to{" "}
                <strong className="text-foreground">
                  {Math.min(currentPage * itemsPerPage, filteredBlogs.length)}
                </strong>{" "}
                of <strong className="text-white">{filteredBlogs.length}</strong> posts
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
