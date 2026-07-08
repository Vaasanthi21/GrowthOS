import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { BlogList } from '../components/studio/BlogList';
import { BlogGenerator } from '../components/studio/BlogGenerator';
import { BlogEditor } from '../components/studio/BlogEditor';
import { BlogPreview } from '../components/studio/BlogPreview';
import {
  Building2,
  Users2,
  BookOpen,
  Compass,
  Search,
  Sparkles,
  FileText,
  Eye,
  CheckCircle2,
  ChevronDown
} from 'lucide-react';

export const BlogStudio = () => {
  const [showWorkflowHelper, setShowWorkflowHelper] = React.useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const view = searchParams.get('view') || 'list';
  const id = searchParams.get('id');

  // Fetch blogs list
  const { data: blogs = [] } = useQuery({
    queryKey: ['blogs-list'],
    queryFn: async () => {
      const response = await api.get('/blogs');
      return response.data.data || [];
    }
  });

  // Fetch company data
  const { data: companyData } = useQuery({
    queryKey: ['company'],
    queryFn: async () => {
      const response = await api.get('/company');
      return response.data.data;
    }
  });

  // Fetch personas data
  const { data: personasData = [] } = useQuery({
    queryKey: ['personas'],
    queryFn: async () => {
      const response = await api.get('/personas');
      return response.data.data || [];
    }
  });

  // Fetch knowledge base files data
  const { data: documentsData = [] } = useQuery({
    queryKey: ['knowledge'],
    queryFn: async () => {
      const response = await api.get('/knowledge');
      return response.data.data || [];
    }
  });

  const isProfileComplete = !!(
    companyData?.companyName &&
    companyData?.website &&
    companyData?.logo &&
    companyData?.productDescription &&
    companyData?.targetAudience
  );
  const hasPersonas = personasData && personasData.length > 0;
  const hasDocuments = documentsData && documentsData.length > 0;

  const workflowSteps = [
    { id: 1, name: 'Define Company', done: isProfileComplete, icon: Building2, stepNum: '01', desc: 'Define your business name, audience, and core product.' },
    { id: 2, name: 'Create Persona', done: hasPersonas, icon: Users2, stepNum: '02', desc: 'Build target customer buyer personas for grounding.' },
    { id: 3, name: 'Grounding Docs', done: hasDocuments, icon: BookOpen, optional: true, stepNum: '03', desc: 'Upload knowledge files to source accurate facts.' },
    { id: 4, name: 'Create Topic', done: false, icon: Compass, stepNum: '04', desc: 'Set up your topic keywords, outline, and target persona.' },
    { id: 5, name: 'Market Research', done: false, icon: Search, stepNum: '05', desc: 'Audit competitors search gaps and trending news.' },
    { id: 6, name: 'Generate', done: false, icon: Sparkles, stepNum: '06', desc: 'Write the first canonical draft powered by AI.' },
    { id: 7, name: 'SEO Optimize', done: false, icon: FileText, stepNum: '07', desc: 'Tune copy keywords density and quality scores.' },
    { id: 8, name: 'Platform Rendering', done: false, icon: Eye, stepNum: '08', desc: 'Generate cover art and adapt for social platforms.' }
  ];

  const setView = (newView, blogId = null) => {
    const params = new URLSearchParams();
    params.set('view', newView);
    if (blogId) {
      params.set('id', blogId);
    }
    setSearchParams(params);
  };

  const handleBack = () => {
    setView('list');
  };

  return (
    <div className="space-y-6 relative max-w-6xl mx-auto py-6 px-4">
      {/* Page Header */}
      {view === 'list' && (
        <div className="space-y-1 text-left mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-extrabold tracking-tight text-foreground">
                Blogs Studio
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed font-normal max-w-3xl">
                Generate SEO-optimized blogs grounded using your company profile and AI context.
              </p>
            </div>
            {blogs.length > 0 && (
              <button
                onClick={() => setShowWorkflowHelper(!showWorkflowHelper)}
                className={`group px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 border flex items-center gap-2 cursor-pointer ${
                  showWorkflowHelper
                    ? 'bg-primary/20 border-primary/45 text-primary shadow-[0_0_12px_rgba(242,91,24,0.12)]'
                    : 'bg-white/5 border-border text-muted-foreground hover:border-primary/40 hover:text-primary shadow-[0_0_15px_rgba(255,255,255,0.02)] animate-pulse-glow'
                }`}
              >
                <Sparkles size={14} className="text-primary group-hover:rotate-12 duration-300" />
                <span>{showWorkflowHelper ? 'Hide Generation Guide' : 'View Generation Guide'}</span>
                <ChevronDown size={14} className={`text-muted-foreground transition-transform duration-300 ${showWorkflowHelper ? 'rotate-180 text-primary' : ''}`} />
              </button>
            )}
          </div>

          {/* Collapsible Helper Guide for returning users */}
          {blogs.length > 0 && showWorkflowHelper && (
            <div className="bg-card rounded-3xl p-6 border border-border bg-card text-left space-y-6 !mt-6 animate-fade-in">
              <style>{`
                @keyframes pulseGlow {
                  0%, 100% {
                    box-shadow: 0 0 4px rgba(242, 91, 24, 0.05);
                    border-color: rgba(255, 255, 255, 0.1);
                  }
                  50% {
                    box-shadow: 0 0 12px rgba(242, 91, 24, 0.2);
                    border-color: rgba(242, 91, 24, 0.35);
                  }
                }
                .animate-pulse-glow {
                  animation: pulseGlow 2.5s infinite ease-in-out;
                }
              `}</style>
              
              {/* Brand Setup Complete Confirmation */}
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                <div>
                  <span className="font-bold">Brand Setup Complete:</span> Your target profiles and buyer personas are fully configured to ground the AI writer.
                </div>
              </div>

              <div className="flex items-center justify-between border-b border-border pb-2">
                <h3 className="font-display text-sm font-bold text-foreground flex items-center gap-2">
                  <Compass size={16} className="text-primary" />
                  <span>Grounded Blog Generation Workflow</span>
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
                {[
                  {
                    step: '01',
                    title: 'Create Blog Topic',
                    desc: 'Select "Generate New Blog", fill details, persona, and SEO keywords.',
                    icon: Compass
                  },
                  {
                    step: '02',
                    title: 'AI Market Research',
                    desc: 'AI audits competitor gaps, search volumes, and trending news.',
                    icon: Search
                  },
                  {
                    step: '03',
                    title: 'Custom Hook Angle',
                    desc: 'Pick an AI suggested copy angle or write a custom theme hook (optional).',
                    icon: Sparkles
                  },
                  {
                    step: '04',
                    title: 'Draft Grounded Blog',
                    desc: 'AI writer outlines, drafts, and runs canonical SEO quality checks.',
                    icon: FileText
                  },
                  {
                    step: '05',
                    title: 'Adapt & Render',
                    desc: 'Generate custom cover art and render customized adaptations for social platforms.',
                    icon: Eye
                  }
                ].map((item, index) => {
                  const ItemIcon = item.icon;
                  return (
                    <div 
                      key={index}
                      className="bg-white/[0.01] border border-border p-4 rounded-2xl relative flex flex-col justify-between hover:border-primary/30 hover:bg-white/[0.02] transition-all duration-300"
                    >
                      <span className="absolute top-2.5 right-3 text-[10px] font-bold font-mono text-slate-600">
                        {item.step}
                      </span>
                      <div>
                        <div className="w-8 h-8 rounded-lg bg-primary/5 border border-primary/10 flex items-center justify-center text-primary mb-3">
                          <ItemIcon size={14} />
                        </div>
                        <h4 className="font-display text-xs font-bold text-foreground mb-1.5">{item.title}</h4>
                        <p className="text-[10px] text-muted-foreground leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}


          {/* How Blog Studio Works Pipeline - only shown when blogs.length === 0 */}
          {blogs.length === 0 && (
            <div className="bg-card rounded-3xl p-6 border border-border bg-card text-left space-y-6 !mt-6">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-bold text-foreground flex items-center gap-2">
                  <Compass size={16} className="text-primary" />
                  <span>How Blog Studio Works</span>
                </h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 gap-4">
                {(() => {
                  const activeStepIndex = workflowSteps.findIndex(step => !step.done);
                  return workflowSteps.map((step, index) => {
                    const StepIcon = step.icon;
                    const isActiveStep = index === activeStepIndex;
                    return (
                      <div 
                        key={step.id} 
                        className={`group relative flex flex-col items-center justify-between p-4 rounded-2xl transition-all duration-300 border min-h-[155px] overflow-hidden hover:scale-[1.03] ${
                          step.done 
                            ? 'bg-primary/[0.02] border-primary/30 hover:border-primary/55 hover:bg-primary/[0.04]' 
                            : isActiveStep
                            ? 'bg-primary/[0.03] border-primary/45 shadow-[0_0_12px_rgba(242,91,24,0.08)] hover:border-primary/60'
                            : 'bg-white/[0.01] border-border hover:border-primary/20 hover:bg-white/[0.02]'
                        }`}
                      >
                        {/* Step Number Badge */}
                        <span className={`absolute top-2.5 right-3 text-[9px] font-bold tracking-wider font-mono ${
                          step.done ? 'text-primary/50' : isActiveStep ? 'text-primary/70' : 'text-slate-600'
                        }`}>
                          {step.stepNum}
                        </span>

                        <div className="flex flex-col items-center text-center w-full mt-2">
                          {/* Icon container */}
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 transform group-hover:scale-110 group-hover:rotate-3 ${
                            step.done 
                              ? 'bg-gradient-to-r from-primary to-accent text-background border border-transparent shadow-[0_0_12px_rgba(242,91,24,0.3)]' 
                              : isActiveStep
                              ? 'bg-primary/20 text-primary border border-primary/35 shadow-[0_0_8px_rgba(242,91,24,0.12)]'
                              : 'bg-primary/5 text-primary/60 border border-primary/10 group-hover:bg-primary/10 group-hover:text-primary'
                          }`}>
                            <StepIcon size={14} />
                          </div>

                          {/* Text details */}
                          <div className="mt-3 space-y-1">
                            <div className={`text-[11px] font-bold leading-tight transition-colors duration-300 ${
                              step.done ? 'text-white' : isActiveStep ? 'text-primary' : 'text-muted-foreground group-hover:text-white'
                            }`}>
                              {step.name}
                            </div>
                            <div className="text-[9px] text-slate-500 font-normal leading-normal select-none group-hover:text-muted-foreground transition-colors duration-300">
                              {step.desc}
                            </div>
                          </div>
                        </div>

                        {/* Bottom glowing line for completed/active steps */}
                        {step.done ? (
                          <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-gradient-to-r from-primary/10 via-primary/60 to-primary/10 rounded-t-full shadow-[0_-1px_6px_rgba(242,91,24,0.4)]" />
                        ) : isActiveStep ? (
                          <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-gradient-to-r from-primary/5 via-primary/40 to-primary/5 rounded-t-full" />
                        ) : null}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Switch Render Views */}
      <div className="animate-fade-in">
        {view === 'list' && (
          <BlogList
            onOpenEditor={(blogId) => setView('edit', blogId)}
            onOpenPreview={(blogId) => setView('preview', blogId)}
            onOpenGenerate={(options) => {
              if (options) {
                const params = new URLSearchParams();
                params.set('view', 'generate');
                if (options.topicName) params.set('suggestedTopicName', options.topicName);
                if (options.topicDetail) params.set('suggestedTopicDetail', options.topicDetail);
                if (options.topicGoal) params.set('suggestedTopicGoal', options.topicGoal);
                setSearchParams(params);
              } else {
                setView('generate');
              }
            }}
          />
        )}

        {view === 'generate' && (
          <BlogGenerator
            initialTopicId={searchParams.get('topicId')}
            initialCustomAngle={searchParams.get('customAngle')}
            onBack={handleBack}
            onGenerationComplete={(blogId) => setView('preview', blogId)}
          />
        )}

        {view === 'edit' && id && (
          <BlogEditor
            blogId={id}
            onBack={handleBack}
          />
        )}

        {view === 'preview' && id && (
          <BlogPreview
            blogId={id}
            onBack={handleBack}
            companyLogo={companyData?.logo}
          />
        )}
      </div>    </div>
  );
};

export default BlogStudio;
