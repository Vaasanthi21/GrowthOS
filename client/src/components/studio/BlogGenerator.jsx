import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useTasks } from '../../context/TaskContext';
import { renderMarkdownToHTML } from '../../utils/markdown';
import {
  Compass,
  User,
  Building,
  FileText,
  Sparkles,
  Zap,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  Plus,
  Eye,
  BookOpen,
  Search,
  X,
  ChevronRight
} from 'lucide-react';

export const BlogGenerator = ({ initialTopicId, initialCustomAngle, onBack, onGenerationComplete }) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { tasks, startTask, clearTask } = useTasks();
  const [selectedTopicId, setSelectedTopicId] = useState(() => {
    return initialTopicId || localStorage.getItem('selected-topic-id') || '';
  });

  useEffect(() => {
    if (selectedTopicId) {
      localStorage.setItem('selected-topic-id', selectedTopicId);
    } else {
      localStorage.removeItem('selected-topic-id');
    }
  }, [selectedTopicId]);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 4000);
  };

  const [selectedAngle, setSelectedAngle] = useState('');
  const [activeProgressStep, setActiveProgressStep] = useState(0);
  const [progressTimer, setProgressTimer] = useState(null);

  // Sync selectedAngle state when topic selection changes
  useEffect(() => {
    if (selectedTopicId === initialTopicId) {
      setSelectedAngle(initialCustomAngle || '');
    } else {
      setSelectedAngle('');
    }
  }, [selectedTopicId, initialTopicId, initialCustomAngle]);


  // Fetch active content personas for selection in new topic creation
  const { data: personasData } = useQuery({
    queryKey: ['personas-select-gen'],
    queryFn: async () => {
      const response = await api.get('/personas');
      return response.data.data || [];
    }
  });
  const personas = Array.isArray(personasData) ? personasData : [];

  const [bypassKnowledgeCheck, setBypassKnowledgeCheck] = useState(false);

  // Topic creation sub-form state
  const [newTopicName, setNewTopicName] = useState(() => {
    return new URLSearchParams(window.location.search).get('suggestedTopicName') || '';
  });
  const [newTopicDetail, setNewTopicDetail] = useState(() => {
    return new URLSearchParams(window.location.search).get('suggestedTopicDetail') || '';
  });
  const [newTopicGoal, setNewTopicGoal] = useState(() => {
    return new URLSearchParams(window.location.search).get('suggestedTopicGoal') || '';
  });
  const [newTopicKeywords, setNewTopicKeywords] = useState([]);
  const [newTopicKeywordInput, setNewTopicKeywordInput] = useState('');
  const [newTopicPersonaId, setNewTopicPersonaId] = useState('');
  const [newTopicPlatforms, setNewTopicPlatforms] = useState(['linkedin', 'medium', 'company-blog']);
  const [suggestingKeywords, setSuggestingKeywords] = useState(false);
  const [topicValidationError, setTopicValidationError] = useState('');

  // Scroll to validation errors smoothly when they trigger
  useEffect(() => {
    if (topicValidationError) {
      const timer = setTimeout(() => {
        const errorElement = document.getElementById('topic-validation-error-banner');
        if (errorElement) {
          errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [topicValidationError]);

  // Research detail modal viewer state
  const [showResearchModal, setShowResearchModal] = useState(false);

  // Mutation: Create a new Topic
  const createTopicMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await api.post('/topics', payload);
      return response.data.data;
    },
    onSuccess: (createdTopic) => {
      if (createdTopic && createdTopic._id) {
        queryClient.invalidateQueries({ queryKey: ['topics-select'] });
        triggerToast('Topic created! Starting AI market research...');
        setSelectedTopicId(createdTopic._id);
        // Automatically trigger agentic research synthesis
        generateResearchMutation.mutate(createdTopic._id);
        // reset form
        setNewTopicName('');
        setNewTopicDetail('');
        setNewTopicGoal('');
        setNewTopicKeywords([]);
        setNewTopicKeywordInput('');
        setNewTopicPersonaId('');
        setNewTopicPlatforms(['linkedin', 'medium', 'company-blog']);
        setTopicValidationError('');
      } else {
        setTopicValidationError('Failed to select the created topic: Invalid server response.');
      }
    },
    onError: (err) => {
      setTopicValidationError(err.response?.data?.error || 'Failed to create topic.');
    }
  });

  // Tag & platform helper methods
  const handlePlatformChange = (platformName) => {
    if (newTopicPlatforms.includes(platformName)) {
      setNewTopicPlatforms(newTopicPlatforms.filter((p) => p !== platformName));
    } else {
      setNewTopicPlatforms([...newTopicPlatforms, platformName]);
    }
  };

  const handleAddKeyword = (e) => {
    e.preventDefault();
    if (!newTopicKeywordInput.trim()) return;
    const clean = newTopicKeywordInput.trim().toLowerCase();
    if (newTopicKeywords.includes(clean)) {
      setNewTopicKeywordInput('');
      return;
    }
    setNewTopicKeywords([...newTopicKeywords, clean]);
    setNewTopicKeywordInput('');
  };

  const handleRemoveKeyword = (keywordToRemove) => {
    setNewTopicKeywords(newTopicKeywords.filter((k) => k !== keywordToRemove));
  };

  const handleSuggestKeywords = async () => {
    if (!newTopicName.trim() || !newTopicDetail.trim()) return;
    setSuggestingKeywords(true);
    try {
      const response = await api.post('/topics/suggest-keywords', {
        topicName: newTopicName.trim(),
        topic: newTopicDetail.trim()
      });
      const suggested = response.data.data || [];
      if (suggested.length > 0) {
        const merged = [...newTopicKeywords];
        suggested.forEach((kw) => {
          const clean = kw.toLowerCase().trim();
          if (clean && !merged.includes(clean)) {
            merged.push(clean);
          }
        });
        setNewTopicKeywords(merged);
        triggerToast('AI suggested keywords added successfully!');
      } else {
        triggerToast('No keywords generated.');
      }
    } catch (err) {
      console.error(err);
      triggerToast('Failed to suggest keywords.');
    } finally {
      setSuggestingKeywords(false);
    }
  };

  // Mutation: Trigger market research agentic synthesis
  const generateResearchMutation = useMutation({
    mutationFn: async (topicId) => {
      const response = await api.post('/research/generate', { topicId });
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['research-report-angles', selectedTopicId] });
      triggerToast('Agentic SEO & Market Research synthesis complete!');
    },
    onError: (err) => {
      triggerToast(err.response?.data?.error || 'Market research synthesis failed.');
    }
  });

  // Fetch research report for the selected topic to get suggested angles
  const { data: researchData, isLoading: researchLoading, error: researchError } = useQuery({
    queryKey: ['research-report-angles', selectedTopicId],
    queryFn: async () => {
      const response = await api.get(`/research/${selectedTopicId}`);
      return response.data.data;
    },
    enabled: !!selectedTopicId,
    retry: false,
  });

  // 1. Fetch active topics
  const { data: topicsData, isLoading: topicsLoading } = useQuery({
    queryKey: ['topics-select'],
    queryFn: async () => {
      const response = await api.get('/topics');
      return response.data.data || [];
    }
  });
  const topics = Array.isArray(topicsData) ? topicsData : [];

  // 2. Fetch Company details
  const { data: company } = useQuery({
    queryKey: ['company-context'],
    queryFn: async () => {
      const response = await api.get('/company');
      return response.data.data;
    }
  });

  // 3. Fetch Knowledge Base files
  const { data: knowledgeFilesData } = useQuery({
    queryKey: ['knowledge-context'],
    queryFn: async () => {
      const response = await api.get('/knowledge');
      return response.data.data || [];
    }
  });
  const knowledgeFiles = Array.isArray(knowledgeFilesData) ? knowledgeFilesData : [];

  const activeTopic = topics && Array.isArray(topics) ? topics.find((t) => t._id === selectedTopicId) : null;
  const taskId = selectedTopicId ? `blog_generate_${selectedTopicId}` : null;
  const isGenerating = taskId && tasks[taskId]?.status === 'running';

  // Simulate active progress step for checklist loader
  useEffect(() => {
    if (isGenerating) {
      setActiveProgressStep(0);
      const timer = setInterval(() => {
        setActiveProgressStep((prev) => {
          if (prev < 4) return prev + 1;
          return prev;
        });
      }, 3500);
      setProgressTimer(timer);
      return () => {
        clearInterval(timer);
        setProgressTimer(null);
      };
    } else {
      if (progressTimer) {
        clearInterval(progressTimer);
        setProgressTimer(null);
      }
    }
  }, [isGenerating]);

  // Sync background task progress
  useEffect(() => {
    if (!taskId) return;
    const task = tasks[taskId];
    if (task) {
      if (task.status === 'success') {
        const newBlog = task.data;
        queryClient.invalidateQueries({ queryKey: ['blogs-list'] });
        queryClient.invalidateQueries({ queryKey: ['user-credit-balance'] });
        triggerToast('Grounded SEO Blog generated successfully!');
        
        // Show 100% complete briefly
        setActiveProgressStep(5);
        
        const delayTimer = setTimeout(() => {
          clearTask(taskId);
          localStorage.removeItem('selected-topic-id');
          onGenerationComplete(newBlog._id);
        }, 1200);
        return () => clearTimeout(delayTimer);
      } else if (task.status === 'error') {
        const err = task.error;
        console.error(err);
        triggerToast(err.response?.data?.error || 'Blog generation failed.');
        clearTask(taskId);
      }
    }
  }, [tasks, taskId, queryClient, clearTask, onGenerationComplete]);

  const handleSaveTopic = (e) => {
    e.preventDefault();
    setTopicValidationError('');

    if (!newTopicName.trim()) {
      setTopicValidationError('Topic Name is required.');
      return;
    }
    if (!newTopicDetail.trim()) {
      setTopicValidationError('Topic Focus/Detail is required.');
      return;
    }
    if (!newTopicPersonaId) {
      setTopicValidationError('Target Audience Persona selection is required.');
      return;
    }
    if (newTopicPlatforms.length === 0) {
      setTopicValidationError('At least one target platform must be selected.');
      return;
    }

    createTopicMutation.mutate({
      topicName: newTopicName.trim(),
      topic: newTopicDetail.trim(),
      goal: newTopicGoal.trim(),
      keywords: newTopicKeywords,
      personaId: newTopicPersonaId,
      platforms: newTopicPlatforms,
      status: 'active'
    });
  };

  const handleGenerateResearch = () => {
    if (!selectedTopicId) return;
    generateResearchMutation.mutate(selectedTopicId);
  };

  const handleGenerate = () => {
    if (!selectedTopicId || !taskId) return;
    startTask(taskId, async () => {
      try {
        const response = await api.post('/blogs/generate', { 
          topicId: selectedTopicId,
          customAngle: selectedAngle
        });
        queryClient.invalidateQueries({ queryKey: ['user-credit-balance'] });
        return response.data.data;
      } catch (err) {
        console.warn('Blog generation timed out or failed, starting polling...', err);
        
        let attempts = 0;
        const maxAttempts = 20; // 60 seconds max
        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          try {
            const getRes = await api.get('/blogs');
            const blogsList = getRes.data?.data || [];
            const matchingBlog = blogsList.find(
              b => (b.topicId?._id || b.topicId) === selectedTopicId
            );
            if (matchingBlog) {
              queryClient.invalidateQueries({ queryKey: ['user-credit-balance'] });
              queryClient.invalidateQueries({ queryKey: ['blogs-list'] });
              return matchingBlog;
            }
          } catch (getErr) {
            // Keep polling
          }
          attempts++;
        }
        throw new Error('Blog generation timed out. Please check your dashboard or try again.');
      }
    });
  };

  const isResearchInProgress = generateResearchMutation.isPending || !!(selectedTopicId && researchLoading);
  const isResearchMissing = !!(selectedTopicId && !researchData && !researchError);
  const isGenerateDisabled = !selectedTopicId || isResearchInProgress || isResearchMissing || isGenerating;

  return (
    <div className="space-y-6">
      {/* Floating Success Notification */}
      {showToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-card bg-white/95 border border-primary/20 text-foreground text-sm px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 whitespace-nowrap animate-slide-down-center">
          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <CheckCircle2 size={14} />
          </div>
          <span className="font-semibold text-slate-800">{toastMessage}</span>
        </div>
      )}

      {/* Back button and title */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <button
          onClick={() => {
            localStorage.removeItem('selected-topic-id');
            onBack();
          }}
          disabled={isGenerating}
          className="px-3 py-2 border border-border hover:border-border bg-white/5 hover:bg-white/10 text-muted-foreground text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <ArrowLeft size={13} />
          <span>Back to directory</span>
        </button>
        <span className="text-xs text-slate-500 font-mono">Blogs Generation Hub</span>
      </div>

      {isGenerating ? (
        /* Live Synthesis Loader Console */
        <div className="bg-card rounded-3xl p-12 border border-border flex flex-col items-center justify-center text-center space-y-8 min-h-[500px] relative overflow-hidden bg-card">
          <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 to-accent/5 pointer-events-none" />
          
          {/* Progress Circular Loader */}
          <div className="relative w-20 h-20 mx-auto">
            {activeProgressStep < 5 ? (
              <>
                <div className="absolute inset-0 rounded-full border-4 border-primary/10 border-t-primary animate-spin" />
                <div className="absolute inset-2 bg-card rounded-full flex items-center justify-center text-primary font-extrabold text-xs">
                  {activeProgressStep * 20}%
                </div>
              </>
            ) : (
              <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)] animate-bounce">
                <CheckCircle2 size={36} />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="font-display text-xl font-bold tracking-tight text-foreground animate-pulse">Running AI Synthesis Engine</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Grounded GPT-5.4 models are outline scripting, drafting canonical contents, tuning word count, and validating SEO scorecards...
            </p>
          </div>

          {/* Progress Steps Checklist */}
          <div className="bg-card rounded-2xl p-6 border border-border text-left space-y-3.5 max-w-sm w-full mx-auto bg-card">
            {[
              { id: 0, label: 'Analyzing Brand & Persona Context' },
              { id: 1, label: 'Mapping SEO Keywords & Trends' },
              { id: 2, label: 'Structuring Outline & Hook Strategy' },
              { id: 3, label: 'Drafting Canonical Post Content' },
              { id: 4, label: 'Validating SEO & Quality Scorecards' },
              { id: 5, label: 'Complete!' }
            ].map((step) => {
              const isCompleted = activeProgressStep > step.id || activeProgressStep === 5;
              const isActive = activeProgressStep === step.id && activeProgressStep < 5;
              return (
                <div key={step.id} className="flex items-center justify-between text-xs">
                  <span className={`font-semibold ${
                    isCompleted ? 'text-emerald-400' : isActive ? 'text-primary' : 'text-slate-500'
                  }`}>
                    {step.label}
                  </span>

                  {isCompleted ? (
                    <CheckCircle2 size={12} className="text-emerald-400 font-bold shrink-0" />
                  ) : isActive ? (
                    <Loader2 size={12} className="animate-spin text-primary shrink-0" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-slate-700/50 border border-slate-600 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Telemetry Console logs */}
          <div className="w-full max-w-md p-4 rounded-xl bg-cardlack/60 border border-border text-left font-mono text-[10px] text-primary space-y-1.5 shadow-2xl">
            <div className="flex justify-between items-center border-b border-border pb-2 mb-2" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
              <span>SYSTEM GENERATION LOGS</span>
              <span className="animate-pulse text-emerald-400">● RUNNING</span>
            </div>
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 size={10} className="shrink-0" />
              <span>[SYSTEM] Topic model: "{activeTopic?.topicName}"</span>
            </div>
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 size={10} className="shrink-0" />
              <span>[SYSTEM] Audience Persona: "{activeTopic?.personaId?.personaName || 'Technical SRE'}"</span>
            </div>
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 size={10} className="shrink-0" />
              <span>[DB] Grounded in Company Profile: "{company?.companyName || 'Axiom Tech'}"</span>
            </div>
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 size={10} className="shrink-0" />
              <span>[DB] Grounded in Knowledge Base: {knowledgeFiles.length} files active</span>
            </div>
            <div className="flex items-center gap-2 text-accent">
              <Loader2 size={10} className="animate-spin shrink-0" />
              <span>[AI] Outlining canonical drafts and tuning SEO keywords...</span>
            </div>
            <div className="flex items-center gap-2" style={{ color: 'rgba(255, 255, 255, 0.45)' }}>
              <span>[AI] Applying length trimming and scoring search engine metrics...</span>
            </div>
          </div>
        </div>
      ) : (knowledgeFiles.length === 0 && !bypassKnowledgeCheck) ? (
        /* Recommendation state when no knowledge files are uploaded */
        <div className="bg-card rounded-3xl p-12 border border-border flex flex-col items-center justify-center text-center space-y-6 min-h-[400px] relative overflow-hidden bg-card">
          <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/5 to-primary/5 pointer-events-none" />
          
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center shadow-glow-sm">
            <Sparkles size={32} />
          </div>

          <div className="space-y-2 max-w-md mx-auto">
            <h3 className="font-display text-xl font-bold tracking-tight text-foreground">AI Grounding Recommendation</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Uploading reference documents (PDFs, TXT, DOCX) to the Knowledge Base helps ground the AI generator in your actual company metrics, products, and insights. This prevents hallucinations and produces much higher-quality blogs.
            </p>
          </div>

          {/* Validation Summary */}
          <div className="w-full max-w-xs mx-auto p-4 bg-white/5 border border-border rounded-2xl text-left space-y-2 text-xs">
            <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Brand Setup Status</div>
            <div className="flex justify-between items-center text-muted-foreground">
              <span className="flex items-center gap-1.5"><CheckCircle2 size={13} className="text-emerald-400" /> Company Profile</span>
              <span className="font-semibold text-emerald-400">✓ Ready</span>
            </div>
            <div className="flex justify-between items-center text-muted-foreground">
              <span className="flex items-center gap-1.5"><CheckCircle2 size={13} className="text-emerald-400" /> Audience Personas</span>
              <span className="font-semibold text-emerald-400">✓ Ready</span>
            </div>
            <div className="flex justify-between items-center text-muted-foreground border-t border-border pt-2 mt-2">
              <span className="flex items-center gap-1.5 text-muted-foreground"><BookOpen size={13} /> Knowledge Documents</span>
              <span className="font-semibold text-amber-400">Optional (Missing)</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-sm">
            <button
              onClick={() => navigate('/personas')}
              className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-primary to-accent text-background font-extrabold rounded-xl shadow-glow transition-all hover:opacity-90 flex items-center justify-center gap-2 text-xs cursor-pointer active:scale-[0.98]"
            >
              <span>Upload Documents</span>
            </button>
            <button
              onClick={() => setBypassKnowledgeCheck(true)}
              className="w-full sm:w-auto px-5 py-2.5 border border-border hover:border-border bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground font-semibold rounded-xl transition-all flex items-center justify-center text-xs cursor-pointer"
            >
              <span>Continue Anyway</span>
            </button>
          </div>
        </div>
      ) : (
        /* Form configuration */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main selection form */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-card rounded-2xl p-6 border border-border space-y-4">
              <div className="flex justify-between items-center border-b border-border pb-3">
                <h3 className="font-display text-sm font-bold flex items-center gap-2">
                  <Compass size={16} className="text-primary" />
                  <span>{!selectedTopicId ? 'Create Blog Topic' : 'Topic Context & Research'}</span>
                </h3>
                {selectedTopicId && (
                  <button
                    type="button"
                    onClick={() => setSelectedTopicId('')}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-border hover:border-border bg-white/5 hover:bg-white/10 text-xs font-bold rounded-lg transition-all text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <ArrowLeft size={12} />
                    <span>Change Topic</span>
                  </button>
                )}
              </div>

              {!selectedTopicId ? (
                /* Topic Creation Form */
                <form onSubmit={handleSaveTopic} className="space-y-4">

                  {topicValidationError && (
                    <div id="topic-validation-error-banner" className="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-xs animate-fade-in">
                      <AlertCircle size={16} className="shrink-0 text-red-400" />
                      <span>{topicValidationError}</span>
                    </div>
                  )}

                  {/* Topic Name */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground flex items-center">
                      Topic Name <span className="text-rose-500 font-bold ml-1">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={newTopicName}
                      onChange={(e) => setNewTopicName(e.target.value)}
                      placeholder="e.g. Q3 Enterprise Expansion"
                      className="w-full px-4 py-2.5 bg-background/60 border border-border rounded-xl text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>

                  {/* Topic Detail */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground flex items-center">
                      Target Core Topic Details <span className="text-rose-500 font-bold ml-1">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={newTopicDetail}
                      onChange={(e) => setNewTopicDetail(e.target.value)}
                      placeholder="e.g. AI-driven marketing automation value propositions"
                      className="w-full px-4 py-2.5 bg-background/60 border border-border rounded-xl text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>

                  {/* Target Audience Persona selection dropdown */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground flex items-center">
                      Target Audience Persona <span className="text-rose-500 font-bold ml-1">*</span>
                    </label>
                    <select
                      required
                      value={newTopicPersonaId}
                      onChange={(e) => setNewTopicPersonaId(e.target.value)}
                      className="w-full px-4 py-2.5 bg-background/60 border border-border rounded-xl text-foreground text-sm focus:outline-none focus:border-primary transition-colors cursor-pointer"
                    >
                      <option value="" className="bg-background text-slate-500">-- Select Brand Persona --</option>
                      {personas?.map(p => (
                        <option key={p._id} value={p._id} className="bg-card text-foreground">
                          {p.personaName || p.name} ({p.tone || p.voice || ''})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Targeted Platforms Grid Checklist */}
                  <div className="space-y-2 pt-1">
                    <label className="text-xs font-semibold text-muted-foreground flex items-center">
                      Target Multi-Channel Platforms <span className="text-rose-500 font-bold ml-1">*</span>
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {['linkedin', 'medium', 'company-blog', 'dev-to', 'substack'].map((plat) => {
                        const active = newTopicPlatforms.includes(plat);
                        return (
                          <button
                            key={plat}
                            type="button"
                            onClick={() => handlePlatformChange(plat)}
                            className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all capitalize text-center ${
                              active
                                ? 'bg-primary/10 border-primary/40 text-primary shadow-glow'
                                : 'bg-background/40 border-border text-muted-foreground hover:border-border'
                            }`}
                          >
                            {plat.replace('-', ' ')}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* SEO Keywords Tag Manager */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-semibold text-muted-foreground">Target SEO Keywords</label>
                      <button
                        type="button"
                        onClick={handleSuggestKeywords}
                        disabled={suggestingKeywords || !newTopicName.trim() || !newTopicDetail.trim()}
                        className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:no-underline"
                      >
                        {suggestingKeywords ? (
                          <>
                            <Loader2 size={10} className="animate-spin" />
                            <span>Suggesting...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles size={10} />
                            <span>Suggest via AI</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newTopicKeywordInput}
                        onChange={(e) => setNewTopicKeywordInput(e.target.value)}
                        placeholder="Add keywords (press enter)"
                        className="flex-1 px-3 py-2 bg-background/60 border border-border rounded-xl text-foreground text-xs focus:outline-none focus:border-primary"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleAddKeyword(e);
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleAddKeyword}
                        className="px-3 py-2 bg-white/5 border border-border hover:border-primary hover:text-primary transition-all rounded-xl flex items-center justify-center shrink-0"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    {/* Tags chips list */}
                    <div className="flex flex-wrap gap-1.5 pt-1.5 max-h-[80px] overflow-y-auto pr-1">
                      {newTopicKeywords.map(kw => (
                        <div
                          key={kw}
                          className="flex items-center gap-1 pl-2 pr-1 py-0.5 bg-white/5 border border-border rounded-md text-[10px] text-muted-foreground"
                        >
                          <span>#{kw}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveKeyword(kw)}
                            className="p-0.5 hover:bg-white/10 rounded-md text-muted-foreground hover:text-foreground"
                          >
                            <X size={8} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Objectives Details */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Topic Objectives & Details</label>
                    <textarea
                      rows={3}
                      value={newTopicGoal}
                      onChange={(e) => setNewTopicGoal(e.target.value)}
                      placeholder="Describe your goals, messaging strategies..."
                      className="w-full px-4 py-3 bg-background/60 border border-border rounded-xl text-foreground text-sm focus:outline-none focus:border-primary resize-none placeholder:text-slate-600"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-2 flex justify-end gap-2">
                    <button
                      type="submit"
                      disabled={createTopicMutation.isPending}
                      className="px-5 py-2.5 bg-gradient-to-r from-primary to-accent hover:opacity-90 disabled:opacity-50 text-background font-extrabold rounded-xl shadow-glow flex items-center gap-1.5 text-xs cursor-pointer w-full sm:w-auto justify-center"
                    >
                      {createTopicMutation.isPending ? (
                        <>
                          <Loader2 className="animate-spin" size={12} />
                          <span>Creating Topic & Initializing...</span>
                        </>
                      ) : (
                        <span>Confirm Topic & Start Research</span>
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                /* Topic Selector View */
                <div className="space-y-4">
                  {initialCustomAngle && (
                    <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary space-y-1 animate-fade-in mb-2">
                      <p className="font-bold uppercase tracking-wider text-[9px] flex items-center gap-1.5">
                        <Sparkles size={11} className="animate-pulse" />
                        <span>Targeted AI Content Copy Angle Active:</span>
                      </p>
                      <p className="font-medium text-foreground leading-relaxed italic">"{initialCustomAngle}"</p>
                      <p className="text-[10px] text-muted-foreground mt-1">The AI content generation pipeline will prioritize this strategic angle and title structure.</p>
                    </div>
                  )}

                  {/* SEO & Market Research Generation Panel */}
                  {selectedTopicId && (
                    <div className="pt-2 animate-fade-in">
                      {researchLoading ? (
                        <div className="flex items-center justify-center p-8 bg-white/5 border border-border rounded-xl gap-2 text-xs text-muted-foreground">
                          <Loader2 className="animate-spin text-primary animate-pulse" size={16} />
                          <span>Checking topic market research records...</span>
                        </div>
                      ) : generateResearchMutation.isPending ? (
                        <div className="p-8 bg-white/5 border border-border rounded-xl text-center space-y-4">
                          <Loader2 className="animate-spin text-primary mx-auto animate-pulse" size={24} />
                          <div className="space-y-1">
                            <p className="text-xs font-bold text-foreground">Running Agentic SEO & Market Research...</p>
                            <p className="text-[10px] text-muted-foreground leading-relaxed max-w-sm mx-auto">
                              Our agents are auditing search volumes, extracting competitor voids, and synthesizing strategic blog copy angles...
                            </p>
                          </div>
                        </div>
                      ) : !researchData ? (
                        <div className="p-6 bg-amber-500/10 border border-amber-500/20 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                          <div className="space-y-0.5 text-center sm:text-left">
                            <p className="text-xs font-bold text-amber-400 flex items-center justify-center sm:justify-start gap-1">
                              <AlertCircle size={14} />
                              <span>No SEO Market Research Sourced</span>
                            </p>
                            <p className="text-[10px] text-muted-foreground">Run market research to identify SEO keywords, competitor voids, and angles.</p>
                          </div>
                          <button
                            type="button"
                            onClick={handleGenerateResearch}
                            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 transition-all font-bold text-background rounded-lg flex items-center gap-1 text-xs cursor-pointer active:scale-[0.98]"
                          >
                            <Search size={12} />
                            <span>Run Market Research</span>
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
                            <div className="space-y-0.5">
                              <p className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 size={14} />
                                <span>Agentic Market Research Active</span>
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                Keywords: {researchData.keywords?.slice(0, 3).map(k => k.keyword).join(', ')}...
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowResearchModal(true)}
                              className="px-3.5 py-2 border border-slate-700/50 hover:border-slate-600 bg-white/5 hover:bg-white/10 transition-all text-muted-foreground hover:text-foreground font-bold rounded-xl flex items-center gap-1.5 text-xs cursor-pointer active:scale-[0.97]"
                            >
                              <Eye size={13} />
                              <span>View Synthesized Research</span>
                            </button>
                          </div>

                          {/* Suggested Copy Angle Dropdown */}
                          <div className="space-y-4 pt-2">
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-muted-foreground">Suggested Copy Angle (from Market Research)</label>
                              {researchData.suggestedAngles && researchData.suggestedAngles.length > 0 ? (
                                <select
                                  value={selectedAngle}
                                  onChange={(e) => setSelectedAngle(e.target.value)}
                                  className="w-full px-4 py-3 bg-background/60 border border-border rounded-xl text-foreground text-xs focus:outline-none focus:border-primary transition-colors cursor-pointer"
                                >
                                  <option value="" className="bg-background text-muted-foreground">-- Select a suggested angle --</option>
                                  {researchData.suggestedAngles.map((angle, index) => (
                                    <option key={index} value={angle} className="bg-card text-foreground truncate">
                                      {angle}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <p className="text-[10px] text-amber-400/90 italic">
                                  No suggested copy angles resolved in research records.
                                </p>
                              )}
                            </div>

                            {/* Copy Angle Editor */}
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-muted-foreground">Active Content Angle / Theme Hook</label>
                              <textarea
                                rows={2}
                                value={selectedAngle}
                                onChange={(e) => setSelectedAngle(e.target.value)}
                                placeholder="Specify a custom strategic focus, angle, or hooks..."
                                className="w-full px-4 py-2.5 bg-background/60 border border-border rounded-xl text-foreground text-xs focus:outline-none focus:border-primary transition-colors resize-none leading-relaxed"
                              />
                              <p className="text-[9px] text-slate-500">
                                The AI content generation pipeline will prioritize this strategic angle. You can select one from the dropdown or type a custom one.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTopic && (
                    <div className="space-y-3 pt-3 animate-fade-in text-xs">
                      <div className="p-4 rounded-xl bg-white/5 border border-border space-y-2">
                        <p className="font-bold text-foreground uppercase text-[9px] tracking-wider text-primary">Topic details:</p>
                        <p className="text-muted-foreground"><span className="font-semibold text-muted-foreground">Topic focus:</span> {activeTopic.topic}</p>
                        <p className="text-muted-foreground"><span className="font-semibold text-muted-foreground">Target goal:</span> {activeTopic.goal || 'General Brand growth'}</p>
                        <p className="text-muted-foreground"><span className="font-semibold text-muted-foreground">SEO Keywords:</span> {activeTopic.keywords?.join(', ')}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Persona preview */}
            {activeTopic && (
              <div className="bg-card rounded-2xl p-6 border border-border space-y-4 animate-fade-in">
                <h3 className="font-display text-sm font-bold flex items-center gap-2 border-b border-border pb-3">
                  <User size={16} className="text-accent" />
                  <span>Target Audience Persona</span>
                </h3>

                <div className="p-4 rounded-xl bg-white/5 border border-border space-y-2 text-xs">
                  <p className="font-bold text-foreground text-sm">{activeTopic.personaId?.personaName || 'Unknown Persona'}</p>
                  <p className="text-muted-foreground"><span className="font-semibold text-muted-foreground">Writing Tone:</span> {activeTopic.personaId?.tone || 'Analytical'}</p>
                  <p className="text-muted-foreground"><span className="font-semibold text-muted-foreground">Style:</span> {activeTopic.personaId?.writingStyle || 'Technical'}</p>
                  <p className="text-muted-foreground"><span className="font-semibold text-muted-foreground">Audience:</span> {activeTopic.personaId?.audienceType || 'Cloud engineers'}</p>
                </div>
              </div>
            )}
          </div>

          {/* Grounding Context variables details */}
          <div className="space-y-6">
            <div className="bg-card rounded-2xl p-6 border border-border space-y-6">
              <h3 className="font-display text-sm font-bold border-b border-border pb-3">
                Grounding Parameters
              </h3>

              {/* Company config */}
              <div className="flex gap-3 text-xs items-start">
                <div className="p-2 rounded bg-primary/10 border border-primary/20 text-primary">
                  <Building size={16} />
                </div>
                <div>
                  <h4 className="font-display font-bold text-foreground">Company profile (active)</h4>
                  <p className="text-muted-foreground text-[10px] mt-0.5">{company?.companyName || 'Configured in Settings'}</p>
                </div>
              </div>

              {/* Grounding docs */}
              <div className="flex gap-3 text-xs items-start">
                <div className="p-2 rounded bg-accent/10 border border-accent/20 text-accent">
                  <FileText size={16} />
                </div>
                <div>
                  <h4 className="font-display font-bold text-foreground">Grounding files ({knowledgeFiles.length} loaded)</h4>
                  <p className="text-muted-foreground text-[10px] mt-0.5">Reference documents uploaded in Knowledge Base.</p>
                </div>
              </div>

              {/* Generate Trigger */}
              <button
                onClick={handleGenerate}
                disabled={isGenerateDisabled}
                className="w-full py-3 bg-gradient-to-r from-primary to-accent text-background font-extrabold rounded-xl shadow-glow transition-all hover:opacity-90 flex items-center justify-center gap-2 text-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isGenerating || isResearchInProgress ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Sparkles size={16} />
                )}
                <span>
                  {isGenerating 
                    ? 'Generating Grounded Blog...' 
                    : isResearchInProgress 
                    ? 'Running Topic Research Synthesis...' 
                    : isResearchMissing 
                    ? 'Awaiting Market Research Completion' 
                    : 'Generate Grounded SEO Blog'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Research Viewer Modal Overlay */}
      {showResearchModal && researchData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-cardlack/75 backdrop-blur-sm animate-fade-in select-text">
          <div className="w-full max-w-3xl bg-card rounded-2xl border border-border shadow-2xl relative flex flex-col max-h-[85vh]">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
                  <Search size={20} className="text-primary" />
                  <span>Synthesized Market Research Report</span>
                </h3>
                <p className="text-[10px] text-accent mt-0.5 font-semibold uppercase tracking-wider">
                  Topic: {activeTopic?.topicName}
                </p>
              </div>
              <button
                onClick={() => setShowResearchModal(false)}
                className="p-1 hover:bg-white/5 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
              
              {/* Keywords Table */}
              <div className="space-y-2">
                <h4 className="font-display text-xs font-bold text-slate-700 uppercase tracking-wider">Targeted Keywords Audited</h4>
                {researchData.keywords && researchData.keywords.length > 0 ? (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
                    <table className="min-w-full divide-y divide-slate-100 text-xs text-left">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-4 py-2.5 font-bold">Keyword</th>
                          <th className="px-4 py-2.5 font-bold">Search Volume</th>
                          <th className="px-4 py-2.5 font-bold">SEO Difficulty</th>
                          <th className="px-4 py-2.5 font-bold">Intent</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {researchData.keywords.map((k, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-2.5 font-semibold text-primary">{k.keyword}</td>
                            <td className="px-4 py-2.5">{k.volume}</td>
                            <td className="px-4 py-2.5">{k.difficulty}</td>
                            <td className="px-4 py-2.5">{k.intent}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No keyword metrics resolved.</p>
                )}
              </div>

              {/* Trending News Summary */}
              <div className="space-y-2">
                <h4 className="font-display text-xs font-bold text-slate-700 uppercase tracking-wider">Trending News & Industry Gaps</h4>
                <div 
                  className="text-xs leading-relaxed text-slate-650 space-y-3 bg-white p-4 rounded-xl border border-slate-200"
                  dangerouslySetInnerHTML={{ __html: renderMarkdownToHTML(researchData.news) }}
                />
              </div>

              {/* Competitor Analysis */}
              <div className="space-y-2">
                <h4 className="font-display text-xs font-bold text-slate-700 uppercase tracking-wider">Competitor Content Gap Audits</h4>
                <div 
                  className="text-xs leading-relaxed text-slate-650 space-y-3 bg-white p-4 rounded-xl border border-slate-200"
                  dangerouslySetInnerHTML={{ __html: renderMarkdownToHTML(researchData.competitorAnalysis) }}
                />
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-border flex justify-end">
              <button
                onClick={() => setShowResearchModal(false)}
                className="px-5 py-2.5 bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all text-background font-bold rounded-xl text-xs shadow-glow cursor-pointer"
              >
                Close Viewer
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
