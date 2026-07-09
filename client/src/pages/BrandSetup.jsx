import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { renderMarkdownToHTML } from '../utils/markdown';
import {
  Building2,
  Users2,
  FileArchive,
  Sparkles,
  Building,
  Globe,
  Tag,
  FileText,
  Users,
  Volume2,
  Plus,
  X,
  Check,
  AlertCircle,
  Loader2,
  Image as ImageIcon,
  UserPlus,
  Edit2,
  Trash2,
  Smile,
  Type,
  ArrowLeft,
  UploadCloud,
  Eye,
  Calendar,
  ChevronDown,
  ChevronUp,
  BookOpen,
  CheckCircle2
} from 'lucide-react';

export const BrandSetup = () => {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // ────────────────────────────────────────────────────────────────────────
  // State Management
  // ────────────────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState(null);
  const [initializedCompanyId, setInitializedCompanyId] = useState(null);
  const [hasInitializedViewMode, setHasInitializedViewMode] = useState(false);

  // Collapsible sections in Workspace
  const [isCompanyExpanded, setIsCompanyExpanded] = useState(true);
  const [isPersonasExpanded, setIsPersonasExpanded] = useState(true);
  const [isKnowledgeExpanded, setIsKnowledgeExpanded] = useState(true);
  const [isUnderstandingExpanded, setIsUnderstandingExpanded] = useState(true);

  // Manual Setup Accordion state
  const [openAccordion, setOpenAccordion] = useState('profile');

  // Company Profile form fields
  const [companyName, setCompanyName] = useState('');
  const [website, setWebsite] = useState('');
  const [industry, setIndustry] = useState('');
  const [logo, setLogo] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [brandVoice, setBrandVoice] = useState('');
  const [competitors, setCompetitors] = useState([]);
  const [brandColors, setBrandColors] = useState([]);
  const [brandColorsDescription, setBrandColorsDescription] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [newCompetitor, setNewCompetitor] = useState('');
  const [isEditingCompany, setIsEditingCompany] = useState(false);

  // Persona Modal Form fields
  const [personaModalOpen, setPersonaModalOpen] = useState(false);
  const [viewPersonaDetails, setViewPersonaDetails] = useState(null);
  const [editPersonaId, setEditPersonaId] = useState(null);
  const [personaName, setPersonaName] = useState('');
  const [tone, setTone] = useState('');
  const [writingStyle, setWritingStyle] = useState('');
  const [audienceType, setAudienceType] = useState('');
  const [description, setDescription] = useState('');

  // Knowledge Sources upload/crawl states
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [selectedText, setSelectedText] = useState(null);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [summaryTextVal, setSummaryTextVal] = useState('');

  // AI Processing Screen states
  const [processingTitle, setProcessingTitle] = useState('AI Assisted Setup');
  const [activeProgressStep, setActiveProgressStep] = useState(0);
  const [processingError, setProcessingError] = useState('');
  const [progressTimer, setProgressTimer] = useState(null);

  // Feedback notifications
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [errorAlert, setErrorAlert] = useState('');

  // Read-only Details View Overlay state
  const [isViewDetailsOpen, setIsViewDetailsOpen] = useState(false);

  // ────────────────────────────────────────────────────────────────────────
  // React Query API Operations
  // ────────────────────────────────────────────────────────────────────────
  const { data: companyData, isLoading: companyLoading, isError: companyError } = useQuery({
    queryKey: ['company'],
    queryFn: async () => {
      const response = await api.get('/company');
      return response.data.data;
    }
  });

  const { data: personasData, isLoading: personasLoading } = useQuery({
    queryKey: ['personas'],
    queryFn: async () => {
      const response = await api.get('/personas');
      return response.data.data;
    }
  });

  const { data: documentsData, isLoading: documentsLoading } = useQuery({
    queryKey: ['knowledge'],
    queryFn: async () => {
      const response = await api.get('/knowledge');
      return response.data.data;
    }
  });

  // Sync server data to local form states on load or update
  useEffect(() => {
    if (companyData) {
      if (viewMode === 'manual_setup' || isEditingCompany) {
        setLogo(companyData.logo || '');
        setBrandColors(companyData.brandColors || []);
        setBrandColorsDescription(companyData.brandColorsDescription || '');
        return;
      }
      setCompanyName(companyData.companyName || '');
      setWebsite(companyData.website || '');
      setIndustry(companyData.industry || '');
      setLogo(companyData.logo || '');
      setProductDescription(companyData.productDescription || '');
      setTargetAudience(companyData.targetAudience || '');
      setBrandVoice(companyData.brandVoice || '');
      setCompetitors(companyData.competitors || []);
      setBrandColors(companyData.brandColors || []);
      setBrandColorsDescription(companyData.brandColorsDescription || '');
    }
  }, [companyData, viewMode, isEditingCompany]);

  // Determine initial view mode
  useEffect(() => {
    if (companyLoading || personasLoading) {
      return;
    }

    if (companyData && initializedCompanyId !== companyData._id) {
      setInitializedCompanyId(companyData._id);
      setHasInitializedViewMode(false);
      return;
    }

    if (hasInitializedViewMode) {
      return;
    }

    if (['manual_setup', 'ai_setup', 'processing'].includes(viewMode)) {
      setHasInitializedViewMode(true);
      return;
    }

    if (companyError || !companyData) {
      setViewMode('choose');
      setHasInitializedViewMode(true);
      return;
    }

    const hasCompanyDetails =
      companyData.companyName &&
      companyData.website;

    setViewMode(hasCompanyDetails ? 'workspace' : 'choose');
    setHasInitializedViewMode(true);
  }, [companyData, companyLoading, personasLoading, companyError, initializedCompanyId, viewMode, hasInitializedViewMode]);

  useEffect(() => {
    return () => {
      if (progressTimer) clearInterval(progressTimer);
    };
  }, [progressTimer]);

  useEffect(() => {
    if ((viewMode === 'manual_setup' || isEditingCompany) && brandColors.length === 0) {
      setBrandColors(['#f25b18']);
    }
  }, [viewMode, isEditingCompany, brandColors.length]);

  useEffect(() => {
    if (errorAlert) {
      const timer = setTimeout(() => {
        const errorElement = document.getElementById('error-alert-banner');
        if (errorElement) {
          errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [errorAlert]);

  // Mutations
  const updateCompanyMutation = useMutation({
    mutationFn: async (updatedPayload) => {
      const companyId = companyData?._id;
      const response = companyId
        ? await api.put(`/company/${companyId}`, updatedPayload)
        : await api.post('/company', updatedPayload);
      return response.data.data;
    },
    onSuccess: (updatedData) => {
      queryClient.setQueryData(['company'], updatedData);
      triggerToast('Saved company profile successfully');
      setIsEditingCompany(false);
    },
    onError: (err) => {
      setErrorAlert(err.data?.error || err.message || 'Failed to save company profile.');
    }
  });

  const createPersonaMutation = useMutation({
    mutationFn: async (newPersona) => {
      const response = await api.post('/personas', newPersona);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personas'] });
      triggerToast('Persona created successfully!');
      closePersonaModal();
    },
    onError: (err) => {
      setErrorAlert(err.data?.error || err.message || 'Failed to create persona.');
    }
  });

  const updatePersonaMutation = useMutation({
    mutationFn: async ({ id, payload }) => {
      const response = await api.put(`/personas/${id}`, payload);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personas'] });
      triggerToast('Persona updated successfully!');
      closePersonaModal();
    },
    onError: (err) => {
      setErrorAlert(err.data?.error || err.message || 'Failed to update persona.');
    }
  });

  const deletePersonaMutation = useMutation({
    mutationFn: async (id) => {
      await api.delete(`/personas/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personas'] });
      triggerToast('Persona removed.');
    },
    onError: (err) => {
      setErrorAlert(err.data?.error || err.message || 'Failed to delete persona.');
    }
  });

  const uploadDocMutation = useMutation({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await api.post('/knowledge/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percentCompleted);
        }
      });
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
      triggerToast('Document successfully uploaded & text indexed!');
      setUploadProgress(null);
    },
    onError: (err) => {
      setErrorAlert(err.data?.error || err.message || 'Failed to upload document.');
      setUploadProgress(null);
    }
  });

  const deleteDocMutation = useMutation({
    mutationFn: async (id) => {
      await api.delete(`/knowledge/${id}`);
    },
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
      triggerToast('Reference source removed.');
      if (selectedDocId === id) {
        setSelectedText(null);
      }
    },
    onError: (err) => {
      setErrorAlert(err.data?.error || err.message || 'Failed to remove source.');
    }
  });

  const updateSummaryMutation = useMutation({
    mutationFn: async ({ id, summaryText }) => {
      const response = await api.put(`/knowledge/${id}/summary`, { summaryText });
      return response.data.data;
    },
    onSuccess: (updatedDoc) => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
      triggerToast('AI Summary updated successfully.');
      setSelectedText(updatedDoc.summaryText);
      setIsEditingSummary(false);
    },
    onError: (err) => {
      setErrorAlert(err.data?.error || err.message || 'Failed to update summary.');
    }
  });

  const startProgressSimulation = (title) => {
    setProcessingTitle(title);
    setViewMode('processing');
    setActiveProgressStep(0);
    setProcessingError('');

    const timer = setInterval(() => {
      setActiveProgressStep((prev) => {
        if (prev < 4) return prev + 1;
        return prev;
      });
    }, 2000);
    setProgressTimer(timer);
  };

  const stopProgressSimulationSuccess = () => {
    if (progressTimer) clearInterval(progressTimer);
    setActiveProgressStep(5);
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
      queryClient.invalidateQueries({ queryKey: ['company'] });
      queryClient.invalidateQueries({ queryKey: ['personas'] });
      setViewMode('workspace');
    }, 1200);
  };

  const stopProgressSimulationError = (errorMsg) => {
    if (progressTimer) clearInterval(progressTimer);
    setProcessingError(errorMsg);
  };

  const crawlMutation = useMutation({
    mutationFn: async (url) => {
      startProgressSimulation('Analyzing Website & Extracting Brand');
      try {
        const response = await api.post('/knowledge/crawl', { url });
        return response.data.data;
      } catch (err) {
        console.warn('Website crawl timed out or failed, starting polling...', err);
        
        let attempts = 0;
        const maxAttempts = 20; // 60 seconds max
        const cleanUrl = url.trim().toLowerCase();
        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          try {
            const getRes = await api.get('/knowledge');
            const list = getRes.data?.data || [];
            const matchingDoc = list.find(doc => {
              const docUrl = String(doc.fileUrl || doc.file_url || '').trim().toLowerCase();
              return docUrl === cleanUrl;
            });
            if (matchingDoc) {
              return matchingDoc;
            }
          } catch (getErr) {
            // Keep polling
          }
          attempts++;
        }
        throw new Error('Website analysis timed out. Please refresh the page to check if it completed.');
      }
    },
    onSuccess: () => {
      stopProgressSimulationSuccess();
      setWebsiteUrl('');
      queryClient.invalidateQueries({ queryKey: ['company'] });
      queryClient.invalidateQueries({ queryKey: ['personas'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
      queryClient.invalidateQueries({ queryKey: ['user-credit-balance'] });
      triggerToast('Website crawled & brand context generated successfully!');
    },
    onError: (err) => {
      stopProgressSimulationError(err.data?.error || err.message || 'Failed to crawl website.');
    }
  });

  const extractMutation = useMutation({
    mutationFn: async (id) => {
      startProgressSimulation('Re-extracting Brand Context');
      const response = await api.post(`/knowledge/${id}/extract`);
      return response.data.data;
    },
    onSuccess: () => {
      stopProgressSimulationSuccess();
      queryClient.invalidateQueries({ queryKey: ['company'] });
      queryClient.invalidateQueries({ queryKey: ['personas'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
      queryClient.invalidateQueries({ queryKey: ['user-credit-balance'] });
      triggerToast('AI Brand Context & Personas extracted successfully!');
    },
    onError: (err) => {
      stopProgressSimulationError(err.data?.error || err.message || 'Failed to extract brand details.');
    }
  });

  // Helper handlers
  const triggerToast = (msg) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 4000);
  };

  const triggerValidationError = (fieldId, errorMessage) => {
    setErrorAlert(errorMessage);
    setTimeout(() => {
      const elements = document.querySelectorAll(`#${fieldId}`);
      const element = Array.from(elements).find(el => el.getBoundingClientRect().height > 0 || el.getBoundingClientRect().width > 0);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (element.type === 'file') {
          element.parentElement?.focus();
        } else {
          element.focus();
        }
      } else {
        const errorElement = document.getElementById('error-alert-banner');
        if (errorElement) {
          errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }, 100);
  };

  const handleAddCompetitor = (e) => {
    e.preventDefault();
    if (!newCompetitor.trim()) return;
    if (competitors.includes(newCompetitor.trim())) {
      setNewCompetitor('');
      return;
    }
    setCompetitors([...competitors, newCompetitor.trim()]);
    setNewCompetitor('');
  };

  const handleRemoveCompetitor = (competitorToRemove) => {
    setCompetitors(competitors.filter(c => c !== competitorToRemove));
  };

  const openCreatePersonaModal = () => {
    setEditPersonaId(null);
    setPersonaName('');
    setTone('');
    setWritingStyle('');
    setAudienceType('');
    setDescription('');
    setPersonaModalOpen(true);
  };

  const openEditPersonaModal = (p) => {
    setEditPersonaId(p.id || p._id);
    setPersonaName(p.personaName || p.name || '');
    setTone(p.tone || p.voice || '');
    setWritingStyle(p.writingStyle || '');
    setAudienceType(p.audienceType || p.audience || '');
    setDescription(p.description || p.notes || '');
    setPersonaModalOpen(true);
  };

  const closePersonaModal = () => {
    setPersonaModalOpen(false);
    setEditPersonaId(null);
  };

  const handlePersonaSubmit = (e) => {
    e.preventDefault();
    if (!personaName.trim()) {
      setErrorAlert('Persona name is required.');
      return;
    }
    if (!tone.trim()) {
      setErrorAlert('Tone of voice is required.');
      return;
    }
    const payload = {
      name: personaName.trim(),
      personaName: personaName.trim(),
      company: companyData?.companyName || companyData?.name || '',
      tone: tone.trim(),
      voice: tone.trim(),
      writingStyle: writingStyle.trim(),
      audienceType: audienceType.trim(),
      audience: audienceType.trim(),
      description: description.trim(),
      notes: description.trim(),
      logo_url: logo.trim(),
      logo_placement: 'none',
      preserve_original_logo: true
    };

    if (editPersonaId) {
      updatePersonaMutation.mutate({ id: editPersonaId, payload });
    } else {
      createPersonaMutation.mutate(payload);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setErrorAlert('');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e) => {
    setErrorAlert('');
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file) => {
    const allowedExtensions = ['pdf', 'docx', 'txt'];
    const extension = file.name.split('.').pop().toLowerCase();
    if (!allowedExtensions.includes(extension)) {
      setErrorAlert('Supported file types are: .pdf, .docx, and .txt only.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorAlert('File size exceeds the 10MB limits boundary.');
      return;
    }
    uploadDocMutation.mutate(file);
  };

  const triggerFileSelect = () => {
    fileInputRef.current.click();
  };

  const handleSaveCompanyProfile = (e) => {
    e.preventDefault();
    if (!companyName.trim()) {
      triggerValidationError('companyName', 'Company Name is required.');
      return;
    }
    if (!website.trim()) {
      triggerValidationError('website', 'Website URL is required.');
      return;
    }
    if (!logo.trim()) {
      triggerValidationError('logoUpload', 'Company Logo is required. Please upload a logo.');
      return;
    }
    if (!productDescription.trim()) {
      triggerValidationError('productDescription', 'Product / Service Description is required.');
      return;
    }
    if (!targetAudience.trim()) {
      triggerValidationError('targetAudience', 'Target Audience is required.');
      return;
    }

    const payload = {
      companyName: companyName.trim(),
      website: website.trim(),
      industry: industry.trim(),
      logo: logo.trim(),
      productDescription: productDescription.trim(),
      targetAudience: targetAudience.trim(),
      brandVoice: brandVoice.trim(),
      competitors,
      brandColors,
      brandColorsDescription
    };

    updateCompanyMutation.mutate(payload);
  };

  const handleFinishManualSetup = () => {
    if (!companyName.trim()) {
      setOpenAccordion('profile');
      triggerValidationError('companyName', 'Company Name is required. Please fill out and save your Company Information.');
      return;
    }
    if (!website.trim()) {
      setOpenAccordion('profile');
      triggerValidationError('website', 'Website URL is required. Please fill out and save your Company Information.');
      return;
    }
    if (!logo.trim()) {
      setOpenAccordion('profile');
      triggerValidationError('logoUpload', 'Company Logo is required. Please upload a logo and save your Company Information.');
      return;
    }
    if (!productDescription.trim()) {
      setOpenAccordion('profile');
      triggerValidationError('productDescription', 'Product / Service Description is required. Please fill out and save your Company Information.');
      return;
    }
    if (!targetAudience.trim()) {
      setOpenAccordion('profile');
      triggerValidationError('targetAudience', 'Target Audience is required. Please fill out and save your Company Information.');
      return;
    }

    const isUnsaved = !companyData || 
      companyData.companyName !== companyName.trim() ||
      companyData.website !== website.trim() ||
      companyData.logo !== logo.trim() ||
      companyData.productDescription !== productDescription.trim() ||
      companyData.targetAudience !== targetAudience.trim();

    if (isUnsaved) {
      setOpenAccordion('profile');
      triggerValidationError('companyName', 'You have unsaved changes in your Company Information. Please click "Save Company Profile" first.');
      return;
    }

    if (!personasData || personasData.length === 0) {
      setErrorAlert('Please design and save at least one Audience Persona before finishing.');
      setOpenAccordion('personas');
      setTimeout(() => {
        document.getElementById('manual-setup-root')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      return;
    }

    setErrorAlert('');
    setViewMode('workspace');
  };

  const handleSetOpenAccordion = (targetName, isToggle = false) => {
    const isOpeningKnowledge = targetName === 'knowledge' && (!isToggle || openAccordion !== 'knowledge');
    
    if (isOpeningKnowledge) {
      if (!personasData || personasData.length === 0) {
        setErrorAlert('Please design and save at least one Audience Persona before proceeding to Knowledge Sources.');
        setOpenAccordion('personas');
        setTimeout(() => {
          document.getElementById('manual-setup-root')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
        return;
      }
    }
    
    setErrorAlert('');
    if (isToggle) {
      setOpenAccordion(openAccordion === targetName ? null : targetName);
    } else {
      setOpenAccordion(targetName);
    }
  };

  const handleViewText = (doc) => {
    setSelectedDocId(doc.id || doc._id);
    setSelectedFileName(doc.fileName || doc.file_name || doc.name || 'Source');
    setSelectedText(doc.summaryText || doc.summary_text || doc.summary || doc.extractedText || doc.extracted_text || doc.content);
    setSummaryTextVal(doc.summaryText || doc.summary_text || doc.summary || doc.extractedText || doc.extracted_text || doc.content || '');
    setIsEditingSummary(false);
  };

  const handleDeleteDoc = (id) => {
    if (window.confirm('Are you sure you want to remove this reference document?')) {
      deleteDocMutation.mutate(id);
    }
  };

  const handleDeletePersona = (id) => {
    if (window.confirm('Are you sure you want to delete this content persona?')) {
      deletePersonaMutation.mutate(id);
    }
  };

  const getPrimaryDoc = () => {
    if (!documentsData || documentsData.length === 0) return null;
    const urlDoc = documentsData.find(d => (d.fileType || d.file_type) === 'url');
    return urlDoc || documentsData[0];
  };

  const primaryDoc = getPrimaryDoc();

  const quickAction = (actionType) => {
    if (actionType === 'generate') {
      navigate('/blog-studio');
    } else if (actionType === 'content') {
      navigate('/generate');
    } else if (actionType === 'knowledge') {
      setIsKnowledgeExpanded(true);
      setOpenAccordion('knowledge');
      setTimeout(() => {
        document.getElementById('section-knowledge')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else if (actionType === 'persona') {
      setIsPersonasExpanded(true);
      openCreatePersonaModal();
      setTimeout(() => {
        document.getElementById('section-personas')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else if (actionType === 'company') {
      setIsCompanyExpanded(true);
      setIsEditingCompany(true);
      setTimeout(() => {
        document.getElementById('section-company')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else if (actionType === 'refresh') {
      if (primaryDoc) {
        extractMutation.mutate(primaryDoc.id || primaryDoc._id);
      } else {
        setErrorAlert('Please add a website URL or reference document first to extract information.');
      }
    }
  };

  const handleLogoUploadTrigger = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const filetypes = /png|jpg|jpeg|webp/;
    const extname = file.name.split('.').pop().toLowerCase();
    if (!filetypes.test(extname)) {
      setErrorAlert('Supported image formats are: .png, .jpg, .jpeg, and .webp only.');
      return;
    }
    setUploadingLogo(true);
    setErrorAlert('');
    try {
      const formData = new FormData();
      formData.append('logo', file);
      const response = await api.post('/company/upload-logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const logoUrl = response.data.logoUrl || response.data.data?.logo || '';

      if (!logoUrl) {
        throw new Error('Logo URL missing from upload response');
      }

      setLogo(logoUrl);

      queryClient.setQueryData(['company'], (oldCompany) => ({
        ...(oldCompany || {}),
        logo: logoUrl,
      }));

      triggerToast('Company logo uploaded successfully!');
    } catch (err) {
      console.error(err);
      setErrorAlert('Failed to upload logo.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleLogoDeleteTrigger = async () => {
    if (!window.confirm('Delete company logo? This will also clear analyzed brand colors.')) return;
    try {
      const response = await api.delete('/company/delete-logo');
      const updatedCompany = response.data.data;
      setLogo('');
      setBrandColors([]);
      setBrandColorsDescription('');
      queryClient.setQueryData(['company'], updatedCompany);
      triggerToast('Logo removed successfully.');
    } catch (err) {
      console.error(err);
      setErrorAlert('Failed to delete logo.');
    }
  };

  if (companyLoading || personasLoading || documentsLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="animate-spin text-primary" size={36} />
        <p className="font-display text-sm font-semibold tracking-wider text-muted-foreground">Initializing Brand Workspace...</p>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // RENDER: Landing Selection Page ('choose')
  // ────────────────────────────────────────────────────────────────────────
  if (viewMode === 'choose') {
    return (
      <div className="max-w-3xl mx-auto space-y-8 py-10 px-4 relative">
        {showToast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-card border border-primary/20 text-foreground text-sm px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 whitespace-nowrap animate-slide-down-center">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Check size={14} />
            </div>
            <span className="font-semibold text-foreground">{toastMessage}</span>
          </div>
        )}
        <div className="text-center space-y-3">
          <div className="inline-flex p-3 rounded-2xl bg-primary/10 border border-primary/20 text-primary">
            <Building2 size={32} />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Teach AI About Your Company
          </h1>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
            Blog Studio uses your company information to generate high-quality SEO blogs in your brand voice. Choose how you want to begin.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
          {/* Card 1: AI Setup */}
          <div className="bg-card rounded-3xl p-8 border border-border shadow-sm hover:shadow-lg hover:border-primary/40 transition-all duration-300 flex flex-col justify-between space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 px-4 py-1.5 bg-primary/10 border-b border-l border-primary/20 rounded-bl-2xl text-[10px] font-extrabold uppercase tracking-wider text-primary">
              Recommended
            </div>
            
            <div className="space-y-4">
              <div className="text-3xl">🤖</div>
              <h3 className="font-display text-xl font-bold text-foreground">
                AI Assisted Setup
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary ml-1.5">
                  10 Credits
                </span>
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Connect your website URL and upload key company docs. The AI will parse your site, generate profiles, extract audience personas, and build a tailored knowledge base automatically.
              </p>
              
              <ul className="space-y-2 pt-2 text-xs text-foreground font-medium">
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-primary" />
                  <span>Analyze Website URL</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-primary" />
                  <span>Upload Reference Documents</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-primary" />
                  <span>Automatic Company Profiles</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-primary" />
                  <span>Automatic Persona Generation</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-primary" />
                  <span>Automatic Knowledge Indexing</span>
                </li>
              </ul>
            </div>

            <button
              onClick={() => setViewMode('ai_setup')}
              className="w-full py-3 bg-gradient-to-r from-primary to-accent text-primary-foreground font-extrabold rounded-xl transition-all duration-300 shadow-sm hover:opacity-90 active:scale-[0.98] cursor-pointer"
            >
              Start AI Setup (10 Credits)
            </button>
          </div>

          {/* Card 2: Manual Setup */}
          <div className="bg-card rounded-3xl p-8 border border-border shadow-sm hover:shadow-lg hover:border-primary/30 transition-all duration-300 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="text-3xl">✍</div>
              <h3 className="font-display text-xl font-bold text-foreground">Manual Setup</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Input your company details, write descriptions, define keywords, upload logos, create target personas, and add knowledge grounding files manually.
              </p>
              
              <ul className="space-y-2 pt-2 text-xs text-foreground font-medium">
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-muted-foreground" />
                  <span>Create Brand Profile Manually</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-muted-foreground" />
                  <span>Specify voice, competitors, & audience</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-muted-foreground" />
                  <span>Design custom marketing personas</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-muted-foreground" />
                  <span>Add reference document attachments</span>
                </li>
              </ul>
            </div>

            <button
              onClick={() => setViewMode('manual_setup')}
              className="w-full py-3 bg-secondary text-secondary-foreground hover:bg-secondary/80 font-extrabold rounded-xl transition-all duration-300 cursor-pointer"
            >
              Start Manual Setup
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // RENDER: AI Assisted Setup Screen ('ai_setup')
  // ────────────────────────────────────────────────────────────────────────
  if (viewMode === 'ai_setup') {
    const hasUploadedFiles = documentsData && documentsData.length > 0;
    return (
      <div className="max-w-4xl mx-auto space-y-6 py-6 px-4 relative">
        {showToast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-card border border-primary/20 text-foreground text-sm px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 whitespace-nowrap animate-slide-down-center">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Check size={14} />
            </div>
            <span className="font-semibold text-foreground">{toastMessage}</span>
          </div>
        )}
        <button
          onClick={() => setViewMode('choose')}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft size={14} />
          <span>Back to setup choices</span>
        </button>

        <div>
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-foreground">🤖 AI Assisted Brand Setup</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Provide your website and files so the AI can automatically extract company details and create audience personas.
          </p>
        </div>

        {errorAlert && (
          <div id="error-alert-banner" className="flex items-center justify-between gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm">
            <div className="flex items-center gap-3">
              <AlertCircle size={20} className="shrink-0 text-destructive" />
              <span>{errorAlert}</span>
            </div>
            <button onClick={() => setErrorAlert('')} className="text-muted-foreground hover:text-foreground">
              <X size={16} />
            </button>
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-stretch gap-6 relative">
          {/* Section A: Crawl URL */}
          <div className="flex-1 bg-card rounded-2xl p-6 border border-border flex flex-col justify-between space-y-4">
            <div>
              <h4 className="font-display text-sm font-bold text-foreground flex items-center gap-1.5">
                <Globe size={16} className="text-primary" />
                <span>Analyze Corporate Website</span>
              </h4>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Provide your website homepage URL. AI will parse text descriptions, brand name, and identify logo assets automatically.
              </p>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Website Home URL</label>
              <input
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="e.g. https://mycompany.com"
                className="w-full px-3 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary bg-background text-foreground"
              />
              <span className="text-[10px] text-muted-foreground block">AI crawls, saves metadata, and extracts profile and target audience.</span>
            </div>
          </div>

          {/* OR Divider */}
          <div className="flex md:flex-col items-center justify-center my-2 md:my-0 relative shrink-0 min-w-[40px]">
            <div className="hidden md:block w-px h-full bg-border"></div>
            <div className="block md:hidden w-full h-px bg-border"></div>
            <span className="absolute px-3 py-1 bg-card border border-border rounded-full text-[10px] font-bold text-muted-foreground shadow-sm uppercase tracking-wider select-none">
              or
            </span>
          </div>

          {/* Section B: Document Upload */}
          <div className="flex-1 bg-card rounded-2xl p-6 border border-border flex flex-col justify-between space-y-4">
            <div>
              <h4 className="font-display text-sm font-bold text-foreground flex items-center gap-1.5">
                <FileText size={16} className="text-primary" />
                <span>Upload Reference Grounding Files</span>
              </h4>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Drop company summaries, pitch decks, product wikis, or target details to ground the blog engine.
              </p>
            </div>

            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`border border-dashed rounded-xl p-4 flex flex-col items-center justify-center text-center transition-all ${
                dragActive 
                  ? 'border-primary bg-primary/5' 
                  : 'border-border bg-muted/30 hover:border-primary/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.docx,.txt"
                onChange={handleFileSelect}
              />

              {uploadProgress !== null ? (
                <div className="space-y-2 w-full max-w-xs py-2 text-center">
                  <Loader2 className="animate-spin text-primary mx-auto" size={24} />
                  <p className="text-[11px] font-semibold text-muted-foreground">Uploading & extracting text...</p>
                  <div className="w-full h-1 bg-border rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-primary font-bold">{uploadProgress}% complete</span>
                </div>
              ) : (
                <div className="cursor-pointer py-2 space-y-2" onClick={triggerFileSelect}>
                  <UploadCloud size={24} className="text-muted-foreground mx-auto" />
                  <div>
                    <p className="text-xs font-bold text-foreground">
                      Drop files here or <span className="text-primary hover:underline">browse</span>
                    </p>
                    <span className="text-[9px] text-muted-foreground block">PDF, DOCX, TXT up to 10MB</span>
                  </div>
                </div>
              )}
            </div>

            {hasUploadedFiles && (
              <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <Check size={14} />
                <span>{documentsData.length} document(s) uploaded & ready</span>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 text-xs text-muted-foreground space-y-1">
          <p className="font-bold text-foreground">💡 Setup Source Recommendation</p>
          <p>You can proceed using: Website only, Documents only, or Website + Documents. We recommend uploading both sources to feed the AI rich context.</p>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <button
            onClick={() => setViewMode('choose')}
            className="px-5 py-2.5 bg-secondary text-secondary-foreground hover:bg-secondary/80 font-semibold rounded-xl text-xs transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (websiteUrl.trim()) {
                crawlMutation.mutate(websiteUrl);
              } else if (hasUploadedFiles) {
                const primary = getPrimaryDoc();
                if (primary) {
                  extractMutation.mutate(primary._id);
                } else {
                  setErrorAlert('No uploaded files found to analyze.');
                }
              } else {
                setErrorAlert('Please enter a Website URL or upload reference files to proceed.');
              }
            }}
            disabled={crawlMutation.isPending || extractMutation.isPending}
            className="px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-extrabold rounded-xl text-xs shadow-md transition-all cursor-pointer flex items-center gap-1.5"
          >
            {(crawlMutation.isPending || extractMutation.isPending) ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <Sparkles size={14} />
                <span>Start AI Setup</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // RENDER: AI Processing Screen ('processing')
  // ────────────────────────────────────────────────────────────────────────
  if (viewMode === 'processing') {
    const steps = [
      { id: 0, label: 'Analyzing Website & Sources' },
      { id: 1, label: 'Extracting Product details' },
      { id: 2, label: 'Analyzing Target Audience' },
      { id: 3, label: 'Generating Content Personas' },
      { id: 4, label: 'Building Grounding Knowledge Base' },
      { id: 5, label: 'Complete!' }
    ];

    return (
      <div className="max-w-md mx-auto py-16 px-4 space-y-8 text-center">
        <div className="relative w-20 h-20 mx-auto">
          {activeProgressStep < 5 ? (
            <>
              <div className="absolute inset-0 rounded-full border-4 border-primary/10 border-t-primary animate-spin" />
              <div className="absolute inset-2 bg-background rounded-full flex items-center justify-center text-primary font-bold text-xs">
                {activeProgressStep * 20}%
              </div>
            </>
          ) : (
            <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-sm animate-bounce">
              <CheckCircle2 size={36} />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="font-display text-xl font-bold text-foreground">{processingTitle}</h3>
          <p className="text-xs text-muted-foreground">
            Please wait while the AI synthesizes your website structure and documents.
          </p>
        </div>

        <div className="bg-card rounded-2xl p-6 border border-border text-left space-y-3.5 max-w-sm mx-auto">
          {steps.map((step) => {
            const isCompleted = activeProgressStep > step.id || activeProgressStep === 5;
            const isActive = activeProgressStep === step.id && activeProgressStep < 5;
            return (
              <div key={step.id} className="flex items-center justify-between text-xs">
                <span className={`font-semibold ${
                  isCompleted ? 'text-emerald-600 dark:text-emerald-400' : isActive ? 'text-primary' : 'text-muted-foreground'
                }`}>
                  {step.label}
                </span>

                {isCompleted ? (
                  <Check size={14} className="text-emerald-600 dark:text-emerald-400 font-bold" />
                ) : isActive ? (
                  <Loader2 size={12} className="animate-spin text-primary" />
                ) : (
                  <div className="w-2.5 h-2.5 rounded-full bg-muted border border-border" />
                )}
              </div>
            );
          })}
        </div>

        {processingError && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive max-w-sm mx-auto">
              {processingError}
            </div>
            <button
              onClick={() => {
                setProcessingError('');
                setViewMode('ai_setup');
              }}
              className="px-5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-lg text-xs"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // RENDER: Manual Setup Accordions ('manual_setup')
  // ────────────────────────────────────────────────────────────────────────
  if (viewMode === 'manual_setup') {
    return (
      <div id="manual-setup-root" className="max-w-4xl mx-auto space-y-6 py-6 px-4 relative">
        {showToast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-card border border-primary/20 text-foreground text-sm px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 whitespace-nowrap animate-slide-down-center">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Check size={14} />
            </div>
            <span className="font-semibold text-foreground">{toastMessage}</span>
          </div>
        )}
        <button
          onClick={() => setViewMode('choose')}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft size={14} />
          <span>Back to setup choices</span>
        </button>

        <div className="flex justify-between items-center border-b border-border pb-4">
          <div>
            <h2 className="font-display text-2xl font-extrabold tracking-tight text-foreground">✍ Manual Brand Setup</h2>
            <p className="text-xs text-muted-foreground mt-1">Configure company profiles, design audience personas, and upload sources.</p>
          </div>
          <button
            onClick={handleFinishManualSetup}
            className="px-4 py-2 border border-border bg-card hover:bg-muted/50 text-foreground font-bold rounded-xl text-xs flex items-center gap-1 cursor-pointer shadow-sm"
          >
            <span>Finish & Go to Workspace</span>
            <span>&rarr;</span>
          </button>
        </div>

        {errorAlert && (
          <div id="error-alert-banner" className="flex items-center justify-between gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs animate-fade-in">
            <div className="flex items-center gap-3">
              <AlertCircle size={18} className="shrink-0 text-destructive" />
              <span>{errorAlert}</span>
            </div>
            <button onClick={() => setErrorAlert('')} className="text-muted-foreground hover:text-foreground font-bold text-sm select-none cursor-pointer">
              &times;
            </button>
          </div>
        )}

        <div className="space-y-4">
          {/* ACCORDION 1: Company Profile */}
          <div id="accordion-profile" className="bg-card rounded-2xl border border-border overflow-hidden">
            <button
              onClick={() => handleSetOpenAccordion('profile', true)}
              className="w-full p-5 flex items-center justify-between font-bold text-foreground text-sm hover:bg-muted/20 transition-colors text-left"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 text-primary">
                  <Building size={16} />
                </div>
                <div>
                  <span>Company Information</span>
                  <span className="text-[10px] text-muted-foreground block font-normal mt-0.5">Describe company details, products, voice, logo</span>
                </div>
              </div>
              {openAccordion === 'profile' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {openAccordion === 'profile' && (
              <div className="p-6 border-t border-border bg-muted/10 space-y-6">
                <form onSubmit={handleSaveCompanyProfile} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">Company Name *</label>
                      <input
                        type="text"
                        id="companyName"
                        required
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="Enter company name"
                        className="w-full px-3 py-2 border border-border rounded-xl text-sm focus:outline-none focus:border-primary text-foreground bg-background"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">Website URL *</label>
                      <input
                        type="text"
                        id="website"
                        required
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder="e.g. https://mycompany.com"
                        className="w-full px-3 py-2 border border-border rounded-xl text-sm focus:outline-none focus:border-primary text-foreground bg-background"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">Industry</label>
                      <input
                        type="text"
                        id="industry"
                        value={industry}
                        onChange={(e) => setIndustry(e.target.value)}
                        placeholder="e.g. B2B SaaS, Finance"
                        className="w-full px-3 py-2 border border-border rounded-xl text-sm focus:outline-none focus:border-primary text-foreground bg-background"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Company Logo *</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="relative border border-dashed border-border hover:border-primary/50 rounded-xl p-4 flex flex-col items-center justify-center bg-muted/20 min-h-[100px] text-center">
                        {uploadingLogo ? (
                          <div className="flex flex-col items-center gap-1">
                            <Loader2 className="animate-spin text-primary" size={18} />
                            <span className="text-[10px] text-muted-foreground">Uploading...</span>
                          </div>
                        ) : (
                          <>
                            <input
                              type="file"
                              id="logoUpload"
                              accept=".png,.jpg,.jpeg,.webp"
                              onChange={handleLogoUploadTrigger}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <ImageIcon size={18} className="text-muted-foreground" />
                            <span className="text-xs font-bold text-foreground mt-1">Upload Logo Image</span>
                            <span className="text-[9px] text-muted-foreground">PNG, JPG, WEBP (Max 2MB)</span>
                          </>
                        )}
                      </div>

                      <div className="border border-border bg-muted/10 rounded-xl p-4 flex flex-col justify-center min-h-[100px]">
                        {logo ? (
                          <div className="flex items-start gap-3">
                            <div className="relative shrink-0">
                              <div className="w-12 h-12 rounded-lg bg-white dark:bg-slate-100 flex items-center justify-center p-1 border border-border overflow-hidden shadow-sm">
                                <img
                                  src={logo.startsWith('http') || logo.startsWith('data:') ? logo : `${import.meta.env.VITE_API_URL || 'http://localhost:4000/api'}/..${logo}`}
                                  alt="Logo Preview"
                                  className="max-w-full max-h-full object-contain"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={handleLogoDeleteTrigger}
                                className="absolute -top-1.5 -right-1.5 p-0.5 bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-full border border-border flex items-center justify-center cursor-pointer"
                              >
                                <X size={8} />
                              </button>
                            </div>

                            <div className="space-y-1 min-w-0 flex-1 text-xs">
                              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Brand Palette Colors</span>
                              {brandColors.length > 0 ? (
                                <div className="flex items-center gap-1">
                                  {brandColors.map((color, idx) => (
                                    <div
                                      key={idx}
                                      className="w-3.5 h-3.5 rounded-full border border-border"
                                      style={{ backgroundColor: color }}
                                      title={color}
                                    />
                                  ))}
                                </div>
                              ) : (
                                <p className="text-[10px] text-muted-foreground italic">No colors extracted</p>
                              )}
                              <p className="text-[10px] text-muted-foreground truncate">{brandColorsDescription || 'Logo synchronized.'}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center text-muted-foreground py-3 text-xs italic">No logo uploaded yet</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 border border-border bg-muted/20 rounded-xl p-4">
                    <div>
                      <label className="text-xs font-bold text-foreground">Brand Palette Colors</label>
                      <span className="text-[10px] text-muted-foreground block mt-0.5">Customize your brand's color theme palette. Pick from the picker or input hex codes manually.</span>
                    </div>

                    <div className="flex flex-wrap gap-3 items-end pt-1">
                      {brandColors.map((color, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-background border border-border p-1.5 rounded-xl shadow-sm">
                          <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-border shrink-0">
                            <input
                              type="color"
                              value={color.startsWith('#') && color.length === 7 ? color : '#f25b18'}
                              onChange={(e) => {
                                const newColors = [...brandColors];
                                newColors[idx] = e.target.value;
                                setBrandColors(newColors);
                              }}
                              className="absolute inset-0 w-full h-full p-0 border-0 cursor-pointer scale-150"
                            />
                          </div>
                          
                          <input
                            type="text"
                            value={color}
                            onChange={(e) => {
                              const newColors = [...brandColors];
                              newColors[idx] = e.target.value;
                              setBrandColors(newColors);
                            }}
                            placeholder="#HEX"
                            className="w-20 px-2 py-1 text-xs font-mono border border-border rounded-lg focus:outline-none text-foreground bg-muted/40"
                          />

                          <button
                            type="button"
                            onClick={() => {
                              setBrandColors(brandColors.filter((_, i) => i !== idx));
                            }}
                            className="p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-lg cursor-pointer"
                            title="Remove color"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() => {
                          setBrandColors([...brandColors, '#f25b18']);
                        }}
                        className="px-3.5 py-2 border border-border bg-card hover:bg-muted text-foreground font-semibold rounded-xl text-[10px] flex items-center gap-1 cursor-pointer h-10 shadow-sm"
                      >
                        <Plus size={12} />
                        <span>Add Another Color</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">Product / Service Description *</label>
                      <textarea
                        rows={3}
                        id="productDescription"
                        required
                        value={productDescription}
                        onChange={(e) => setProductDescription(e.target.value)}
                        placeholder="Describe what your product does, value proposition, and key features..."
                        className="w-full p-3 border border-border rounded-xl text-sm focus:outline-none focus:border-primary text-foreground bg-background resize-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">Target Audience Description *</label>
                      <textarea
                        rows={2}
                        id="targetAudience"
                        required
                        value={targetAudience}
                        onChange={(e) => setTargetAudience(e.target.value)}
                        placeholder="e.g. CMOs, Founders seeking pre-seed capital, small business owners..."
                        className="w-full p-3 border border-border rounded-xl text-sm focus:outline-none focus:border-primary text-foreground bg-background resize-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">Brand Voice / Tone</label>
                      <textarea
                        rows={2}
                        id="brandVoice"
                        value={brandVoice}
                        onChange={(e) => setBrandVoice(e.target.value)}
                        placeholder="e.g. Professional, authoritative, visionary, snappy, conversational..."
                        className="w-full p-3 border border-border rounded-xl text-sm focus:outline-none focus:border-primary text-foreground bg-background resize-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">Key Competitors</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newCompetitor}
                        onChange={(e) => setNewCompetitor(e.target.value)}
                        placeholder="Add competitor"
                        className="flex-1 px-3 py-2 border border-border rounded-xl text-xs focus:outline-none focus:border-primary text-foreground bg-background"
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddCompetitor(e); }}
                      />
                      <button
                        type="button"
                        onClick={handleAddCompetitor}
                        className="px-3 bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground border border-primary/20 transition-all rounded-xl flex items-center justify-center cursor-pointer"
                      >
                        <Plus size={16} />
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {competitors.length === 0 ? (
                        <span className="text-[10px] text-muted-foreground italic">No competitors added yet.</span>
                      ) : (
                        competitors.map((comp) => (
                          <div
                            key={comp}
                            className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 bg-secondary border border-border rounded-lg text-xs font-medium text-secondary-foreground"
                          >
                            <span>{comp}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveCompetitor(comp)}
                              className="p-0.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground cursor-pointer"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-border flex justify-between items-center">
                    <button
                      type="submit"
                      disabled={updateCompanyMutation.isPending}
                      className="px-5 py-2.5 bg-gradient-to-r from-primary to-accent hover:opacity-90 disabled:opacity-50 text-primary-foreground font-bold rounded-xl shadow-sm text-xs cursor-pointer flex items-center gap-1.5"
                    >
                      {updateCompanyMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      <span>Save Company Profile</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetOpenAccordion('personas')}
                      className="text-xs text-primary hover:underline font-semibold"
                    >
                      Next Step: Personas &rarr;
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          {/* ACCORDION 2: Audience Personas */}
          <div id="accordion-personas" className="bg-card rounded-2xl border border-border overflow-hidden">
            <button
              onClick={() => handleSetOpenAccordion('personas', true)}
              className="w-full p-5 flex items-center justify-between font-bold text-foreground text-sm hover:bg-muted/20 transition-colors text-left"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 text-primary">
                  <Users2 size={16} />
                </div>
                <div>
                  <span>Audience Personas</span>
                  <span className="text-[10px] text-muted-foreground block font-normal mt-0.5">Define target client segments, voice, tone</span>
                </div>
              </div>
              {openAccordion === 'personas' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {openAccordion === 'personas' && (
              <div className="p-6 border-t border-border bg-muted/10 space-y-6">
                <div className="flex justify-between items-center">
                  <h4 className="font-display text-xs font-bold text-foreground">Active Personas List</h4>
                  <button
                    onClick={openCreatePersonaModal}
                    className="px-3.5 py-2 bg-gradient-to-r from-primary to-accent text-primary-foreground font-bold rounded-xl text-xs flex items-center gap-1 shadow-sm cursor-pointer"
                  >
                    <UserPlus size={14} />
                    <span>Create Persona</span>
                  </button>
                </div>

                {personasData.length === 0 ? (
                  <div className="text-center p-8 bg-muted/20 border border-dashed border-border rounded-xl space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground">No Personas Yet</p>
                    <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                      Personas help Blog Studio adapt blog tone and messaging. Create one manually to begin.
                    </p>
                    <button
                      onClick={openCreatePersonaModal}
                      className="px-4 py-2 border border-border bg-card hover:bg-muted font-bold rounded-xl text-[10px] text-foreground shadow-sm cursor-pointer"
                    >
                      Create Manual Persona
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {personasData.map((p) => (
                      <div key={p.id || p._id} className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between space-y-3 shadow-sm hover:border-primary/40 transition-all">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h5 className="font-display font-bold text-foreground text-sm truncate">{p.personaName || p.name}</h5>
                            <span className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 text-[9px] font-bold uppercase tracking-wider">
                              {p.audienceType || p.audience || 'Target'}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                            {p.description || p.notes || 'No bio specified.'}
                          </p>
                          <div className="grid grid-cols-2 gap-2 text-[10px] bg-muted/30 p-2 rounded-lg border border-border">
                            <div>
                              <span className="block text-[8px] font-bold text-muted-foreground uppercase tracking-wide">Tone</span>
                              <span className="font-semibold text-primary truncate block">{p.tone || p.voice}</span>
                            </div>
                            <div>
                              <span className="block text-[8px] font-bold text-muted-foreground uppercase tracking-wide">Style</span>
                              <span className="font-semibold text-foreground truncate block">{p.writingStyle || '—'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-between items-center pt-2 border-t border-border mt-auto gap-2">
                          <button
                            onClick={() => setViewPersonaDetails(p)}
                            className="px-2.5 py-1.5 bg-muted/40 hover:bg-muted border border-border rounded-lg text-muted-foreground hover:text-foreground font-bold text-[9px] flex items-center gap-1 cursor-pointer transition-all"
                          >
                            <Eye size={10} />
                            <span>Details</span>
                          </button>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => openEditPersonaModal(p)}
                              className="p-1 bg-muted/40 hover:bg-muted border border-border rounded-lg text-muted-foreground hover:text-foreground transition-all cursor-pointer flex items-center"
                              title="Edit"
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              onClick={() => handleDeletePersona(p.id || p._id)}
                              className="p-1 bg-destructive/10 hover:bg-destructive/20 border border-destructive/20 text-destructive transition-all cursor-pointer flex items-center"
                              title="Delete"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-4 border-t border-border flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleSetOpenAccordion('knowledge')}
                    className="text-xs text-primary hover:underline font-semibold"
                  >
                    Next Step: Knowledge Base &rarr;
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ACCORDION 3: Knowledge Base */}
          <div id="accordion-knowledge" className="bg-card rounded-2xl border border-border overflow-hidden">
            <button
              onClick={() => handleSetOpenAccordion('knowledge', true)}
              className="w-full p-5 flex items-center justify-between font-bold text-foreground text-sm hover:bg-muted/20 transition-colors text-left"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 text-primary">
                  <FileArchive size={16} />
                </div>
                <div>
                  <span>Knowledge Sources (Optional)</span>
                  <span className="text-[10px] text-muted-foreground block font-normal mt-0.5">Upload reference PDFs, Word files, or TXT notes (Optional)</span>
                </div>
              </div>
              {openAccordion === 'knowledge' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {openAccordion === 'knowledge' && (
              <div className="p-6 border-t border-border bg-muted/10 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                  <div className="p-4 bg-muted/20 border border-border rounded-2xl flex flex-col justify-between space-y-4 shadow-sm">
                    <div>
                      <h5 className="font-display font-bold text-foreground text-xs flex items-center gap-1.5">
                        <Globe size={14} className="text-primary" />
                        <span>Analyze Additional Web URL</span>
                      </h5>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                        Analyze documentation guides or campaign pages to feed the semantic blog writer.
                      </p>
                    </div>

                    <div className="space-y-2 col-span-1">
                      <div className="flex gap-2">
                        <input
                          type="url"
                          value={websiteUrl}
                          onChange={(e) => setWebsiteUrl(e.target.value)}
                          placeholder="https://example.com/blog-reference"
                          className="flex-1 px-3 py-2 border border-border rounded-xl text-xs bg-background text-foreground focus:outline-none"
                          disabled={crawlMutation.isPending}
                        />
                        <button
                          onClick={() => {
                            if (!websiteUrl.trim()) {
                              setErrorAlert('Enter URL first.');
                              return;
                            }
                            crawlMutation.mutate(websiteUrl);
                          }}
                          disabled={crawlMutation.isPending}
                          className="px-3 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-extrabold rounded-xl text-[10px] flex items-center justify-center cursor-pointer shrink-0"
                        >
                          {crawlMutation.isPending ? <Loader2 size={10} className="animate-spin" /> : 'Analyze URL'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-muted/20 border border-border rounded-2xl flex flex-col justify-between space-y-4 shadow-sm">
                    <div>
                      <h5 className="font-display font-bold text-foreground text-xs flex items-center gap-1.5">
                        <FileText size={14} className="text-primary" />
                        <span>Attach Grounding PDF / DOCX</span>
                      </h5>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                        Upload wikis, whitepapers, or outlines. Maximum document size is 10MB.
                      </p>
                    </div>

                    <div
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      className={`border border-dashed rounded-xl p-4 flex flex-col items-center justify-center text-center transition-all flex-1 min-h-[80px] ${
                        dragActive ? 'border-primary bg-primary/5' : 'border-border bg-muted/10'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept=".pdf,.docx,.txt"
                        onChange={handleFileSelect}
                      />

                      {uploadProgress !== null ? (
                        <div className="w-full max-w-xs space-y-2 py-2">
                          <Loader2 size={16} className="animate-spin text-primary mx-auto" />
                          <div className="w-full h-1 bg-border rounded-full overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${uploadProgress}%` }} />
                          </div>
                        </div>
                      ) : (
                        <div className="cursor-pointer space-y-1.5" onClick={triggerFileSelect}>
                          <UploadCloud size={20} className="text-muted-foreground mx-auto" />
                          <span className="text-[10px] font-bold text-foreground block">
                            Drop file here or <span className="text-primary hover:underline">browse files</span>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-display text-xs font-bold text-foreground">AI Knowledge Sources</h4>

                  {documentsData.length === 0 ? (
                    <div className="p-6 bg-muted/20 border border-dashed border-border rounded-xl text-center text-xs text-muted-foreground italic">
                      No reference documents uploaded. This step is optional – you can proceed without uploading documents.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {documentsData.map((doc) => {
                        const docId = doc.id || doc._id;
                        const docFileName = doc.fileName || doc.file_name || doc.name || 'Source';
                        const docFileType = (doc.fileType || doc.file_type || doc.source_type || doc.type || 'file').toLowerCase();
                        const docExtractedText = doc.extractedText || doc.extracted_text || doc.content || '';
                        return (
                          <div key={docId} className="p-3 bg-card border border-border rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:border-primary/40 transition-all shadow-sm">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="p-2 rounded bg-muted text-muted-foreground shrink-0">
                                {docFileType === 'url' || docFileType === 'link' ? <Globe size={14} /> : <FileText size={14} />}
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-foreground truncate" title={docFileName}>{docFileName}</p>
                                <span className="text-[9px] text-muted-foreground block mt-0.5">
                                  {docFileType.toUpperCase()} • {docExtractedText ? `${docExtractedText.length.toLocaleString()} chars` : '0 chars'}
                                </span>
                              </div>
                            </div>

                            <div className="flex gap-1">
                              <button
                                onClick={() => handleViewText(doc)}
                                className="px-2.5 py-1 bg-muted/40 hover:bg-muted border border-border text-foreground font-bold rounded text-[10px] flex items-center gap-1 cursor-pointer"
                              >
                                <Eye size={10} />
                                <span>View Summary</span>
                              </button>
                              <button
                                onClick={() => extractMutation.mutate(docId)}
                                className="px-2.5 py-1 bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground border border-primary/20 font-bold rounded text-[10px] flex items-center gap-1 cursor-pointer"
                              >
                                <Sparkles size={10} />
                                <span>Extract Context</span>
                              </button>
                              <button
                                onClick={() => handleDeleteDoc(docId)}
                                className="p-1 hover:bg-destructive/10 hover:text-destructive rounded text-muted-foreground border border-transparent transition-all cursor-pointer"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-border flex justify-end">
                  <button
                    onClick={handleFinishManualSetup}
                    className="px-5 py-2.5 bg-gradient-to-r from-primary to-accent text-primary-foreground font-extrabold rounded-xl text-xs shadow-md transition-all cursor-pointer"
                  >
                    Finish Setup & Open Brand Workspace
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Persona CRUD Form Modal */}
        {personaModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-lg bg-card rounded-2xl border border-border shadow-2xl relative flex flex-col max-h-[90vh]">
              <div className="p-6 border-b border-border flex items-center justify-between bg-card rounded-t-2xl">
                <h3 className="font-display text-lg font-bold text-foreground">
                  {editPersonaId ? 'Modify Content Persona' : 'Design Content Persona'}
                </h3>
                <button
                  onClick={closePersonaModal}
                  className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handlePersonaSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 bg-card">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Persona Name *</label>
                  <input
                    type="text"
                    required
                    value={personaName}
                    onChange={(e) => setPersonaName(e.target.value)}
                    placeholder="e.g. Thought Leader, Technical Founder"
                    className="w-full px-3 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:border-primary text-foreground bg-background"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Tone of Voice *</label>
                  <input
                    type="text"
                    required
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    placeholder="e.g. Professional, Visionary, Snappy, Empathetic"
                    className="w-full px-3 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:border-primary text-foreground bg-background"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Writing Style</label>
                    <input
                      type="text"
                      value={writingStyle}
                      onChange={(e) => setWritingStyle(e.target.value)}
                      placeholder="e.g. Storyteller, Technical"
                      className="w-full px-3 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:border-primary text-foreground bg-background"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Target Focus</label>
                    <input
                      type="text"
                      value={audienceType}
                      onChange={(e) => setAudienceType(e.target.value)}
                      placeholder="e.g. Pre-Seed Founders"
                      className="w-full px-3 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:border-primary text-foreground bg-background"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Description / Bio</label>
                  <textarea
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe this persona's focus, background, constraints, and target topics..."
                    className="w-full p-3 border border-border rounded-xl text-sm focus:outline-none focus:border-primary text-foreground bg-background resize-none"
                  />
                </div>

                <div className="pt-4 flex justify-end gap-3 border-t border-border">
                  <button
                    type="button"
                    onClick={closePersonaModal}
                    className="px-4 py-2 border border-border text-foreground hover:bg-muted rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createPersonaMutation.isPending || updatePersonaMutation.isPending}
                    className="px-5 py-2.5 bg-gradient-to-r from-primary to-accent hover:opacity-90 disabled:opacity-50 text-primary-foreground font-bold rounded-xl shadow-sm flex items-center gap-1.5 text-xs cursor-pointer"
                  >
                    {(createPersonaMutation.isPending || updatePersonaMutation.isPending) ? (
                      <>
                        <Loader2 className="animate-spin" size={12} />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Check size={12} />
                        <span>{editPersonaId ? 'Save Changes' : 'Create Persona'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* View Document Summary / Edit Modal */}
        {selectedText !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-2xl bg-card border border-border shadow-2xl rounded-2xl relative flex flex-col max-h-[85vh]">
              <div className="p-6 border-b border-border flex items-center justify-between bg-card rounded-t-2xl">
                <div>
                  <h3 className="font-display text-lg font-bold text-foreground">AI Grounding Summary Context</h3>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5 max-w-md">{selectedFileName}</p>
                </div>
                <button
                  onClick={() => { setSelectedText(null); setIsEditingSummary(false); }}
                  className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 bg-muted/20 border-y border-border max-h-[50vh] flex flex-col">
                {isEditingSummary ? (
                  <textarea
                    value={summaryTextVal}
                    onChange={(e) => setSummaryTextVal(e.target.value)}
                    className="w-full flex-1 min-h-[25vh] p-3 text-foreground border border-border rounded-xl focus:outline-none text-sm bg-background resize-y"
                    placeholder="Type or modify summary text here..."
                  />
                ) : (
                  selectedText ? (
                    <div 
                      className="text-xs md:text-sm text-foreground/90 leading-relaxed space-y-4"
                      dangerouslySetInnerHTML={{ __html: renderMarkdownToHTML(selectedText) }}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No summary text parsed in this document.</p>
                  )
                )}
              </div>

              <div className="p-4 border-t border-border flex justify-end gap-2 bg-card rounded-b-2xl">
                {isEditingSummary ? (
                  <>
                    <button
                      onClick={() => setIsEditingSummary(false)}
                      className="px-4 py-2 border border-border hover:bg-muted text-foreground rounded-xl text-xs font-semibold cursor-pointer"
                      disabled={updateSummaryMutation.isPending}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => updateSummaryMutation.mutate({ id: selectedDocId, summaryText: summaryTextVal })}
                      className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl text-xs shadow-sm flex items-center gap-1.5 cursor-pointer"
                      disabled={updateSummaryMutation.isPending}
                    >
                      {updateSummaryMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Save Summary'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setIsEditingSummary(true)}
                      className="px-4 py-2 border border-border hover:bg-muted text-foreground rounded-xl text-xs font-semibold cursor-pointer"
                    >
                      Edit Summary
                    </button>
                    <button
                      onClick={() => setSelectedText(null)}
                      className="px-5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl text-xs shadow-sm cursor-pointer"
                    >
                      Done
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // RENDER: Brand Workspace Persistent Dashboard ('workspace')
  // ────────────────────────────────────────────────────────────────────────
  if (viewMode === 'workspace') {
    const isBrandReady = companyName && website && personasData.length > 0;
    
    return (
      <div className="space-y-6 relative max-w-6xl mx-auto py-6 px-4">
        {showToast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-card border border-primary/20 text-foreground text-sm px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 whitespace-nowrap animate-slide-down-center">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Check size={14} />
            </div>
            <span className="font-semibold text-foreground">{toastMessage}</span>
          </div>
        )}

        {errorAlert && (
          <div id="error-alert-banner" className="flex items-center justify-between gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm">
            <div className="flex items-center gap-3">
              <AlertCircle size={20} className="shrink-0 text-destructive" />
              <span>{errorAlert}</span>
            </div>
            <button onClick={() => setErrorAlert('')} className="text-muted-foreground hover:text-foreground">
              <X size={16} />
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-foreground">Brand Workspace</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Your centralized center of AI brand voice, configurations, and reference knowledge grounding materials.
            </p>
          </div>
          <button
            onClick={() => setViewMode('choose')}
            className="px-4 py-2 border border-border bg-card hover:bg-muted text-foreground font-semibold rounded-xl text-xs shadow-sm self-start sm:self-center cursor-pointer transition-colors"
          >
            Switch Setup Mode
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Completion Status Panel */}
          <div className="bg-card rounded-3xl p-6 border border-border flex flex-col justify-between space-y-4">
            <div>
              <h3 className="font-display text-sm font-bold text-foreground flex items-center gap-2">
                <CheckCircle2 className={isBrandReady ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"} size={18} />
                <span>Completion Status</span>
              </h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">How complete is the AI training progress?</p>
            </div>

            <div className="space-y-3 flex-1 flex flex-col justify-center">
              <div className={`p-4 rounded-xl text-center space-y-1 border ${
                isBrandReady 
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400" 
                  : "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400"
              }`}>
                <p className="text-xs font-bold uppercase tracking-wider">
                  {isBrandReady ? "🎉 Brand Ready" : "⚠️ Needs Training"}
                </p>
                <p className="text-[9px] text-muted-foreground leading-normal">
                  {isBrandReady 
                    ? "AI is fully trained on company values, segments and ready to write quality blogs."
                    : "Complete company profiles & generate target personas to launch the blog engine."}
                </p>
              </div>

              <div className="space-y-2 pt-2 text-xs">
                <div className="flex justify-between items-center border-b border-border pb-1.5">
                  <span className="text-muted-foreground font-medium">Company Profile</span>
                  <span className={`font-bold px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide ${
                    companyName && website ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  }`}>
                    {companyName && website ? "Completed" : "Pending"}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-border pb-1.5">
                  <span className="text-muted-foreground font-medium">Audience Personas</span>
                  <span className="font-bold text-foreground bg-muted px-1.5 py-0.5 rounded text-[9px]">
                    {personasData.length} Sourced
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-border pb-1.5">
                  <span className="text-muted-foreground font-medium">Knowledge Sources</span>
                  <span className="font-bold text-foreground bg-muted px-1.5 py-0.5 rounded text-[9px]">
                    {documentsData.length} Indexed
                  </span>
                </div>
                <div className="flex justify-between items-center pb-1">
                  <span className="text-muted-foreground font-medium">AI Summary</span>
                  <span className={`font-bold px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide ${
                    primaryDoc && (primaryDoc.summaryText || primaryDoc.summary_text || primaryDoc.summary || primaryDoc.extractedText || primaryDoc.extracted_text || primaryDoc.content) ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"
                  }`}>
                    {primaryDoc && (primaryDoc.summaryText || primaryDoc.summary_text || primaryDoc.summary || primaryDoc.extractedText || primaryDoc.extracted_text || primaryDoc.content) ? "Available" : "Pending"}
                  </span>
                </div>
              </div>
            </div>

            <div className="text-[10px] text-muted-foreground border-t border-border pt-3 flex justify-between items-center">
              <span>Last Updated:</span>
              <span className="font-bold text-foreground">
                {primaryDoc ? new Date(primaryDoc.updatedAt || primaryDoc.updated_at || companyData?.updatedAt || companyData?.updated_at || Date.now()).toLocaleDateString() : (companyData ? new Date(companyData.updatedAt || companyData.updated_at || Date.now()).toLocaleDateString() : 'Today')}
              </span>
            </div>
          </div>

          {/* Collapsible Section 1: AI Understanding */}
          <div className="lg:col-span-2 bg-card rounded-3xl border border-border flex flex-col justify-between relative overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between bg-muted/10">
              <button
                onClick={() => setIsUnderstandingExpanded(!isUnderstandingExpanded)}
                className="flex items-center gap-2.5 font-extrabold text-foreground text-sm text-left hover:opacity-80"
              >
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <Sparkles size={16} />
                </div>
                <div>
                  <span>AI Understanding Overview</span>
                  <span className="text-[9px] text-muted-foreground block font-normal mt-0.5">Sourced from Crawls, PDFs, and Edited Summary drafts</span>
                </div>
              </button>
              <button 
                onClick={() => setIsUnderstandingExpanded(!isUnderstandingExpanded)} 
                className="text-muted-foreground p-1 hover:bg-muted rounded-lg cursor-pointer"
              >
                {isUnderstandingExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>

            {isUnderstandingExpanded && (
              <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                {(() => {
                  const activeSummary = primaryDoc?.summaryText || primaryDoc?.summary_text || primaryDoc?.summary || primaryDoc?.extractedText || primaryDoc?.extracted_text || primaryDoc?.content || '';
                  if (primaryDoc && activeSummary) {
                    return (
                      <div className="space-y-4 flex-1 flex flex-col justify-between">
                        <div className="flex-1 bg-muted/30 border border-border rounded-xl p-4 min-h-[140px] text-xs leading-relaxed max-h-[220px] overflow-y-auto text-foreground">
                          {isEditingSummary ? (
                            <textarea
                              value={summaryTextVal}
                              onChange={(e) => setSummaryTextVal(e.target.value)}
                              className="w-full h-[150px] p-2 text-foreground border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-xs bg-background resize-none"
                            />
                          ) : (
                            <div 
                              className="space-y-3 prose dark:prose-invert max-w-none text-foreground/90"
                              dangerouslySetInnerHTML={{ __html: renderMarkdownToHTML(activeSummary) }}
                            />
                          )}
                        </div>

                        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-3 border-t border-border">
                          <div className="flex gap-2">
                            {isEditingSummary ? (
                              <>
                                <button
                                  onClick={() => {
                                    setIsEditingSummary(false);
                                    setSummaryTextVal(activeSummary);
                                  }}
                                  className="px-3 py-1.5 border border-border text-foreground hover:bg-muted font-bold rounded-lg text-[10px]"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => {
                                    updateSummaryMutation.mutate({ id: primaryDoc.id || primaryDoc._id, summaryText: summaryTextVal });
                                  }}
                                  disabled={updateSummaryMutation.isPending}
                                  className="px-3.5 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-lg text-[10px] flex items-center gap-1 cursor-pointer"
                                >
                                  {updateSummaryMutation.isPending && <Loader2 size={10} className="animate-spin" />}
                                  <span>Save Summary</span>
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => {
                                  setIsEditingSummary(true);
                                  setSummaryTextVal(activeSummary);
                                }}
                                className="px-4 py-2 border border-border bg-card hover:bg-muted text-foreground font-bold rounded-lg text-[10px] flex items-center gap-1 shadow-sm cursor-pointer"
                              >
                                <Edit2 size={10} />
                                <span>Edit Summary</span>
                              </button>
                            )}
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={() => extractMutation.mutate(primaryDoc.id || primaryDoc._id)}
                              disabled={extractMutation.isPending}
                              className="px-3 py-2 bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground border border-primary/20 font-bold rounded-lg text-[10px] flex items-center gap-1 cursor-pointer transition-all"
                            >
                              <Building size={10} />
                              <span>Re-extract Company</span>
                            </button>
                            <button
                              onClick={() => extractMutation.mutate(primaryDoc.id || primaryDoc._id)}
                              disabled={extractMutation.isPending}
                              className="px-3 py-2 bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground border border-primary/20 font-bold rounded-lg text-[10px] flex items-center gap-1 cursor-pointer transition-all"
                            >
                              <Users size={10} />
                              <span>Re-extract Personas</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="text-center p-8 border border-dashed border-border rounded-xl space-y-3 bg-muted/20">
                      <p className="text-xs font-semibold text-muted-foreground">No AI Summary Drafted Yet</p>
                      <p className="text-[11px] text-muted-foreground max-w-sm mx-auto leading-relaxed">
                        AI builds summaries automatically after Analyzing URLs or extracting documents.
                      </p>
                      <button
                        onClick={() => quickAction('knowledge')}
                        className="px-4 py-2 border border-border bg-card hover:bg-muted font-bold rounded-xl text-[10px] text-foreground cursor-pointer shadow-sm"
                      >
                        Connect Knowledge Source
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Workspace Sections */}
        <div className="space-y-4 pt-2">
          {/* Collapsible Section 2: Company Profile */}
          <div id="section-company" className="bg-card rounded-3xl border border-border overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between bg-muted/10">
              <button
                onClick={() => setIsCompanyExpanded(!isCompanyExpanded)}
                className="flex items-center gap-2.5 font-extrabold text-foreground text-sm text-left hover:opacity-80"
              >
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <Building size={16} />
                </div>
                <div>
                  <span>Company Profile Details</span>
                  <span className="text-[9px] text-muted-foreground block font-normal mt-0.5">Corporate metadata, logo assets, narrative keywords</span>
                </div>
              </button>
              
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                  companyName && website ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                }`}>
                  {companyName && website ? "Configured" : "Missing Info"}
                </span>
                <button 
                  onClick={() => setIsCompanyExpanded(!isCompanyExpanded)} 
                  className="text-muted-foreground p-1 hover:bg-muted rounded-lg"
                >
                  {isCompanyExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>
            </div>

            {isCompanyExpanded && (
              <div className="p-6">
                {isEditingCompany ? (
                  <form onSubmit={handleSaveCompanyProfile} className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground">Company Name *</label>
                        <input
                          type="text"
                          id="companyName"
                          required
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          className="w-full px-3 py-2 border border-border rounded-xl text-xs bg-background text-foreground focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground">Website URL *</label>
                        <input
                          type="text"
                          id="website"
                          required
                          value={website}
                          onChange={(e) => setWebsite(e.target.value)}
                          className="w-full px-3 py-2 border border-border rounded-xl text-xs bg-background text-foreground focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground">Industry</label>
                        <input
                          type="text"
                          id="industry"
                          value={industry}
                          className="w-full px-3 py-2 border border-border rounded-xl text-xs bg-background text-foreground focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="relative border border-dashed border-border hover:border-primary/50 rounded-xl p-4 flex flex-col items-center justify-center bg-muted/20 min-h-[90px] text-center">
                        {uploadingLogo ? (
                          <Loader2 className="animate-spin text-primary" size={16} />
                        ) : (
                          <>
                            <input
                              type="file"
                              id="logoUpload"
                              accept=".png,.jpg,.jpeg,.webp"
                              onChange={handleLogoUploadTrigger}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <ImageIcon size={16} className="text-muted-foreground" />
                            <span className="text-xs font-bold text-foreground mt-1">Change Logo Asset</span>
                          </>
                        )}
                      </div>

                      {logo && (
                        <div className="border border-border bg-muted/10 rounded-xl p-3 flex items-center justify-between gap-3 min-w-0">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-lg bg-white dark:bg-slate-100 flex items-center justify-center p-1 border border-border overflow-hidden shrink-0">
                              <img
                                src={logo.startsWith('http') || logo.startsWith('data:') ? logo : `${import.meta.env.VITE_API_URL || 'http://localhost:4000/api'}/..${logo}`}
                                alt="Logo"
                                className="max-w-full max-h-full object-contain"
                              />
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {brandColorsDescription || 'Logo uploaded.'}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handleLogoDeleteTrigger}
                            className="p-1.5 hover:bg-destructive/10 text-destructive rounded-lg border border-transparent transition-all cursor-pointer shrink-0"
                            title="Delete logo"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 border border-border bg-muted/20 rounded-xl p-4">
                      <div>
                        <label className="text-xs font-bold text-foreground">Brand Palette Colors</label>
                        <span className="text-[10px] text-muted-foreground block mt-0.5">Customize your brand's color theme palette.</span>
                      </div>

                      <div className="flex flex-wrap gap-3 items-end pt-1">
                        {brandColors.map((color, idx) => (
                          <div key={idx} className="flex items-center gap-2 bg-background border border-border p-1.5 rounded-xl shadow-sm">
                            <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-border shrink-0">
                              <input
                                type="color"
                                value={color.startsWith('#') && color.length === 7 ? color : '#f25b18'}
                                onChange={(e) => {
                                  const newColors = [...brandColors];
                                  newColors[idx] = e.target.value;
                                  setBrandColors(newColors);
                                }}
                                className="absolute inset-0 w-full h-full p-0 border-0 cursor-pointer scale-150"
                              />
                            </div>
                            
                            <input
                              type="text"
                              value={color}
                              onChange={(e) => {
                                const newColors = [...brandColors];
                                newColors[idx] = e.target.value;
                                setBrandColors(newColors);
                              }}
                              placeholder="#HEX"
                              className="w-20 px-2 py-1 text-xs font-mono border border-border rounded-lg focus:outline-none text-foreground bg-muted/40"
                            />

                            <button
                              type="button"
                              onClick={() => {
                                setBrandColors(brandColors.filter((_, i) => i !== idx));
                              }}
                              className="p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-lg cursor-pointer"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() => {
                            setBrandColors([...brandColors, '#f25b18']);
                          }}
                          className="px-3.5 py-2 border border-border bg-card hover:bg-muted text-foreground font-semibold rounded-xl text-[10px] flex items-center gap-1 cursor-pointer h-10 shadow-sm"
                        >
                          <Plus size={12} />
                          <span>Add Color</span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground">Product Description *</label>
                        <textarea
                          rows={3}
                          id="productDescription"
                          required
                          value={productDescription}
                          onChange={(e) => setProductDescription(e.target.value)}
                          className="w-full p-3 border border-border rounded-xl text-xs bg-background text-foreground focus:outline-none resize-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground">Target Audience Focus *</label>
                        <textarea
                          rows={2}
                          id="targetAudience"
                          required
                          value={targetAudience}
                          onChange={(e) => setTargetAudience(e.target.value)}
                          className="w-full p-3 border border-border rounded-xl text-xs bg-background text-foreground focus:outline-none resize-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground">Brand Voice & Tone</label>
                        <textarea
                          rows={2}
                          id="brandVoice"
                          value={brandVoice}
                          onChange={(e) => setBrandVoice(e.target.value)}
                          className="w-full p-3 border border-border rounded-xl text-xs bg-background text-foreground focus:outline-none resize-none"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 pt-3 border-t border-border">
                      <button
                        type="button"
                        onClick={() => setIsEditingCompany(false)}
                        className="px-4 py-2 border border-border text-foreground hover:bg-muted font-bold rounded-lg text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={updateCompanyMutation.isPending}
                        className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        {updateCompanyMutation.isPending && <Loader2 size={12} className="animate-spin" />}
                        <span>Save Profile Changes</span>
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
                      <div className="bg-muted/10 border border-border rounded-2xl p-5 text-center flex flex-col items-center space-y-4 md:col-span-1 justify-center min-h-[180px]">
                        {logo ? (
                          <div className="w-20 h-20 rounded-2xl bg-white dark:bg-slate-100 border border-border flex items-center justify-center p-2 shadow-sm overflow-hidden">
                            <img
                              src={logo.startsWith('http') || logo.startsWith('data:') ? logo : `${import.meta.env.VITE_API_URL || 'http://localhost:4000/api'}/..${logo}`}
                              alt="Company Logo"
                              className="max-w-full max-h-full object-contain"
                            />
                          </div>
                        ) : (
                          <div className="w-16 h-16 rounded-full bg-muted border border-border flex items-center justify-center text-muted-foreground">
                            <Building size={28} />
                          </div>
                        )}

                        <div className="space-y-1">
                          <h4 className="font-display font-bold text-foreground text-sm">{companyName || 'Brand Name'}</h4>
                          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{industry || 'SaaS'}</span>
                        </div>

                        {brandColors.length > 0 && (
                          <div className="flex items-center gap-1">
                            {brandColors.map((color, idx) => (
                              <div
                                key={idx}
                                className="w-3.5 h-3.5 rounded-full border border-border"
                                style={{ backgroundColor: color }}
                                title={color}
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="md:col-span-3 space-y-4 text-xs">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="p-3 bg-muted/20 border border-border rounded-xl space-y-0.5">
                            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Website Domain</span>
                            <a href={website} target="_blank" rel="noreferrer" className="text-primary hover:underline font-semibold block truncate">
                              {website || 'No URL'}
                            </a>
                          </div>
                          
                          <div className="p-3 bg-muted/20 border border-border rounded-xl space-y-0.5">
                            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Brand Voice Tone</span>
                            <p className="font-semibold text-foreground truncate">{brandVoice || 'Professional'}</p>
                          </div>
                        </div>

                        <div className="p-4 bg-muted/20 border border-border rounded-xl space-y-1.5">
                          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Product / Service Pitch</span>
                          <p className="text-foreground/90 leading-relaxed">{productDescription || 'Configure details to feed the blog writer.'}</p>
                        </div>

                        <div className="p-4 bg-muted/20 border border-border rounded-xl space-y-1.5">
                          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Target Audience Focus</span>
                          <p className="text-foreground/90 leading-relaxed">{targetAudience || 'Describe your core client segments.'}</p>
                        </div>

                        {competitors.length > 0 && (
                          <div className="space-y-1.5">
                            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Key Competitors</span>
                            <div className="flex flex-wrap gap-1">
                              {competitors.map((c) => (
                                <span key={c} className="px-2 py-0.5 bg-muted border border-border rounded text-[10px] font-medium text-foreground">{c}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4 border-t border-border">
                      <button
                        onClick={() => setIsViewDetailsOpen(true)}
                        className="px-4 py-2 border border-border bg-card hover:bg-muted text-foreground font-bold rounded-lg text-xs shadow-sm cursor-pointer"
                      >
                        View Details
                      </button>
                      <button
                        onClick={() => setIsEditingCompany(true)}
                        className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-lg text-xs shadow-md cursor-pointer"
                      >
                        Edit Profile
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Collapsible Section 3: Audience Personas */}
          <div id="section-personas" className="bg-card rounded-3xl border border-border overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between bg-muted/10">
              <button
                onClick={() => setIsPersonasExpanded(!isPersonasExpanded)}
                className="flex items-center gap-2.5 font-extrabold text-foreground text-sm text-left hover:opacity-80"
              >
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <Users2 size={16} />
                </div>
                <div>
                  <span>Target Audience Personas</span>
                  <span className="text-[9px] text-muted-foreground block font-normal mt-0.5">Demographics, style rules, tone profiles</span>
                </div>
              </button>
              
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground text-[9px] font-bold uppercase tracking-wider border border-border">
                  {personasData.length} Created
                </span>
                <button 
                  onClick={() => setIsPersonasExpanded(!isPersonasExpanded)} 
                  className="text-muted-foreground p-1 hover:bg-muted rounded-lg"
                >
                  {isPersonasExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>
            </div>

            {isPersonasExpanded && (
              <div className="p-6 space-y-6">
                <div className="flex justify-between items-center">
                  <h4 className="font-display text-xs font-bold text-foreground">Content Target Profiles</h4>
                  <div className="flex gap-2">
                    {primaryDoc && (
                      <button
                        onClick={() => extractMutation.mutate(primaryDoc.id || primaryDoc._id)}
                        disabled={extractMutation.isPending}
                        className="px-3.5 py-2 border border-border bg-card hover:bg-muted text-foreground font-bold rounded-xl text-xs flex items-center gap-1 shadow-sm cursor-pointer"
                      >
                        <Sparkles size={13} className="text-primary animate-pulse" />
                        <span>Regenerate Personas</span>
                      </button>
                    )}
                    <button
                      onClick={openCreatePersonaModal}
                      className="px-3.5 py-2 bg-gradient-to-r from-primary to-accent text-primary-foreground font-extrabold rounded-xl text-xs flex items-center gap-1 shadow-md cursor-pointer"
                    >
                      <UserPlus size={14} />
                      <span>Create Persona</span>
                    </button>
                  </div>
                </div>

                {personasData.length === 0 ? (
                  <div className="text-center p-8 border border-dashed border-border rounded-2xl bg-muted/20 space-y-4">
                    <p className="text-xs font-bold text-muted-foreground">No Personas Sourced Yet</p>
                    <p className="text-[11px] text-muted-foreground max-w-sm mx-auto leading-relaxed">
                      Personas help Blog Studio adapt blog tone and messaging. Create one manually or generate automatically from your website crawl.
                    </p>
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={openCreatePersonaModal}
                        className="px-4 py-2 border border-border bg-card hover:bg-muted font-bold rounded-xl text-[10px] text-foreground cursor-pointer shadow-sm"
                      >
                        Create Persona Manually
                      </button>
                      <button
                        onClick={() => quickAction('knowledge')}
                        className="px-4 py-2 bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground font-bold rounded-xl text-[10px] cursor-pointer"
                      >
                        Generate From Website
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {personasData.map((p) => {
                      const displayName = p.personaName || p.name || 'Persona';
                      const initials = displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'P';
                      return (
                        <div key={p._id} className="bg-card border border-border rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-sm hover:border-primary/40 transition-all">
                          <div className="space-y-3.5">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary/10 to-accent/20 border border-primary/20 flex items-center justify-center font-extrabold text-primary text-xs shadow-sm select-none">
                                {initials}
                              </div>
                              <div className="min-w-0 flex-1">
                                <h5 className="font-display font-bold text-foreground text-xs truncate leading-tight" title={displayName}>
                                  {displayName}
                                </h5>
                                <span className="text-[9px] text-accent-foreground font-bold uppercase tracking-wider truncate block mt-0.5">
                                  {p.audienceType || p.audience || 'Audience'}
                                </span>
                              </div>
                            </div>
 
                            <div className="grid grid-cols-2 gap-2 text-[10px] pt-1">
                              <div className="p-2 bg-muted/40 rounded-lg border border-border">
                                <span className="block text-[8px] font-bold text-muted-foreground uppercase tracking-wide">Tone</span>
                                <span className="font-semibold text-primary truncate block">{p.tone || p.voice}</span>
                              </div>
                              <div className="p-2 bg-muted/40 rounded-lg border border-border">
                                <span className="block text-[8px] font-bold text-muted-foreground uppercase tracking-wide">Writing Style</span>
                                <span className="font-semibold text-foreground truncate block">{p.writingStyle || '—'}</span>
                              </div>
                            </div>

                            <p className="text-[11px] text-muted-foreground line-clamp-3 leading-relaxed">
                              {p.description || 'No detailed biography specified for this persona.'}
                            </p>
                          </div>

                          <div className="flex justify-between items-center pt-3 border-t border-border mt-auto gap-2">
                            <button
                              onClick={() => setViewPersonaDetails(p)}
                              className="px-2.5 py-1.5 bg-muted/40 hover:bg-muted border border-border rounded-lg text-muted-foreground hover:text-foreground font-bold text-[10px] flex items-center gap-1 cursor-pointer transition-all"
                            >
                              <Eye size={10} />
                              <span>Details</span>
                            </button>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => openEditPersonaModal(p)}
                                className="px-2.5 py-1.5 bg-muted/40 hover:bg-muted border border-border rounded-lg text-foreground font-bold text-[10px] flex items-center gap-1 cursor-pointer"
                              >
                                <Edit2 size={10} />
                                <span>Edit</span>
                              </button>
                              <button
                                onClick={() => handleDeletePersona(p.id || p._id)}
                                className="px-2.5 py-1.5 bg-destructive/10 hover:bg-destructive/20 border border-destructive/20 text-destructive font-bold text-[10px] flex items-center gap-1 cursor-pointer transition-all"
                              >
                                <Trash2 size={10} />
                                <span>Delete</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Collapsible Section 4: Knowledge Sources */}
          <div id="section-knowledge" className="bg-card rounded-3xl border border-border overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between bg-muted/10">
              <button
                onClick={() => setIsKnowledgeExpanded(!isKnowledgeExpanded)}
                className="flex items-center gap-2.5 font-extrabold text-foreground text-sm text-left hover:opacity-80"
              >
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <FileArchive size={16} />
                </div>
                <div>
                  <span>AI Knowledge Sources</span>
                  <span className="text-[9px] text-muted-foreground block font-normal mt-0.5">Reference documents, website page crawlers</span>
                </div>
              </button>

              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground text-[9px] font-bold uppercase tracking-wider border border-border">
                  {documentsData.length} Indexed
                </span>
                <button 
                  onClick={() => setIsKnowledgeExpanded(!isKnowledgeExpanded)} 
                  className="text-muted-foreground p-1 hover:bg-muted rounded-lg"
                >
                  {isKnowledgeExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>
            </div>

            {isKnowledgeExpanded && (
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                  <div className="p-4 bg-muted/20 border border-border rounded-2xl flex flex-col justify-between space-y-4 shadow-sm">
                    <div>
                      <h5 className="font-display font-bold text-foreground text-xs flex items-center gap-1.5">
                        <Globe size={14} className="text-primary" />
                        <span>Analyze Additional Web URL</span>
                      </h5>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                        Analyze documentation guides or campaign pages to feed the semantic blog writer.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="url"
                          value={websiteUrl}
                          onChange={(e) => setWebsiteUrl(e.target.value)}
                          placeholder="https://example.com/blog-reference"
                          className="flex-1 px-3 py-2 border border-border rounded-xl text-xs bg-background text-foreground focus:outline-none"
                          disabled={crawlMutation.isPending}
                        />
                        <button
                          onClick={() => {
                            if (!websiteUrl.trim()) {
                              setErrorAlert('Enter URL first.');
                              return;
                            }
                            crawlMutation.mutate(websiteUrl);
                          }}
                          disabled={crawlMutation.isPending}
                          className="px-3 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-extrabold rounded-xl text-[10px] flex items-center justify-center cursor-pointer shrink-0"
                        >
                          {crawlMutation.isPending ? <Loader2 size={10} className="animate-spin" /> : 'Analyze URL'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-muted/20 border border-border rounded-2xl flex flex-col justify-between space-y-4 shadow-sm">
                    <div>
                      <h5 className="font-display font-bold text-foreground text-xs flex items-center gap-1.5">
                        <FileText size={14} className="text-primary" />
                        <span>Attach Grounding PDF / DOCX</span>
                      </h5>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                        Upload wikis, whitepapers, or outlines. Maximum document size is 10MB.
                      </p>
                    </div>

                    <div
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      className={`border border-dashed rounded-xl p-3 flex flex-col items-center justify-center text-center transition-all flex-1 ${
                        dragActive ? 'border-primary bg-primary/5' : 'border-border bg-muted/10'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept=".pdf,.docx,.txt"
                        onChange={handleFileSelect}
                      />

                      {uploadProgress !== null ? (
                        <div className="w-full max-w-xs space-y-1 py-1">
                          <Loader2 size={12} className="animate-spin text-primary mx-auto" />
                          <div className="w-full h-1 bg-border rounded-full overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${uploadProgress}%` }} />
                          </div>
                        </div>
                      ) : (
                        <div className="cursor-pointer space-y-1" onClick={triggerFileSelect}>
                          <UploadCloud size={16} className="text-muted-foreground mx-auto" />
                          <span className="text-[10px] font-bold text-foreground block">
                            Drop file here or <span className="text-primary hover:underline">browse</span>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-display text-xs font-bold text-foreground">Active Knowledge Repositories</h4>

                  {documentsData.length === 0 ? (
                    <div className="p-8 border border-dashed border-border rounded-2xl bg-muted/20 text-center text-xs text-muted-foreground italic">
                      No grounding files indexed. Upload key PDF, Word, or TXT assets (optional).
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {documentsData.map((doc) => {
                        const docId = doc.id || doc._id;
                        const docFileName = doc.fileName || doc.file_name || doc.name || 'Source';
                        const docFileType = (doc.fileType || doc.file_type || doc.source_type || doc.type || 'file').toLowerCase();
                        const docExtractedText = doc.extractedText || doc.extracted_text || doc.content || '';
                        const docCreatedAt = doc.createdAt || doc.created_at || doc.updatedAt || doc.updated_at;
                        return (
                          <div key={docId} className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between space-y-3 shadow-sm hover:border-primary/40 transition-all">
                            <div className="space-y-2 min-w-0">
                              <div className="flex items-start gap-2.5">
                                <div className="p-2 rounded bg-muted text-muted-foreground shrink-0">
                                  {docFileType === 'url' || docFileType === 'link' ? <Globe size={14} /> : <FileText size={14} />}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-bold text-foreground truncate text-xs" title={docFileName}>{docFileName}</p>
                                  <span className="text-[9px] font-bold text-primary uppercase block mt-0.5">{docFileType} Source</span>
                                </div>
                              </div>

                              <div className="text-[10px] text-muted-foreground space-y-1">
                                <p className="flex items-center gap-1">
                                  <BookOpen size={10} />
                                  <span>{docExtractedText ? `${docExtractedText.length.toLocaleString()} characters` : '0 characters'}</span>
                                </p>
                                <p className="flex items-center gap-1">
                                  <Calendar size={10} />
                                  <span>Indexed {docCreatedAt ? new Date(docCreatedAt).toLocaleDateString() : 'Today'}</span>
                                </p>
                              </div>
                            </div>

                            <div className="flex justify-end items-center gap-1.5 pt-2.5 border-t border-border">
                              <button
                                onClick={() => handleViewText(doc)}
                                className="px-2 py-1 bg-muted hover:bg-muted/80 border border-border rounded text-[10px] text-foreground font-bold flex items-center gap-0.5 cursor-pointer"
                              >
                                <Eye size={10} />
                                <span>View Summary</span>
                              </button>
                              {docFileType === 'url' && (
                                <button
                                  onClick={() => extractMutation.mutate(docId)}
                                  className="px-2 py-1 bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground border border-primary/20 rounded text-[10px] font-bold flex items-center gap-0.5 cursor-pointer transition-all"
                                >
                                  <Sparkles size={10} />
                                  <span>Re-extract</span>
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteDoc(docId)}
                                className="p-1 hover:bg-destructive/10 hover:text-destructive rounded text-muted-foreground border border-transparent transition-all cursor-pointer"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions Panel */}
        <div className="bg-card rounded-3xl p-6 border border-border space-y-4 mt-6">
          <div>
            <h3 className="font-display text-xs font-bold text-foreground uppercase tracking-wider">⚡ What would you like to do next?</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">Quick actions to navigate workspace settings</p>
          </div>
          
          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={() => quickAction('generate')}
              className="px-4 py-2.5 bg-gradient-to-r from-primary to-accent text-primary-foreground font-extrabold rounded-xl text-xs shadow-sm hover:opacity-90 transition-all cursor-pointer flex items-center gap-1"
            >
              <Sparkles size={12} />
              <span>Generate Blog (10 Credits)</span>
            </button>

            <button
              onClick={() => quickAction('knowledge')}
              className="px-4 py-2.5 bg-card hover:bg-gradient-to-r hover:from-primary hover:to-accent hover:text-primary-foreground border border-border text-foreground font-semibold rounded-xl text-xs shadow-sm transition-all duration-300 cursor-pointer flex items-center gap-1 group"
            >
              <Plus size={12} className="text-primary group-hover:text-primary-foreground transition-colors" />
              <span>Add Knowledge Source</span>
            </button>
            
            <button
              onClick={() => quickAction('persona')}
              className="px-4 py-2.5 bg-card hover:bg-gradient-to-r hover:from-primary hover:to-accent hover:text-primary-foreground border border-border text-foreground font-semibold rounded-xl text-xs shadow-sm transition-all duration-300 cursor-pointer flex items-center gap-1 group"
            >
              <UserPlus size={12} className="text-primary group-hover:text-primary-foreground transition-colors" />
              <span>Create Target Persona</span>
            </button>
            
            <button
              onClick={() => quickAction('company')}
              className="px-4 py-2.5 bg-card hover:bg-gradient-to-r hover:from-primary hover:to-accent hover:text-primary-foreground border border-border text-foreground font-semibold rounded-xl text-xs shadow-sm transition-all duration-300 cursor-pointer flex items-center gap-1 group"
            >
              <Building size={12} className="text-primary group-hover:text-primary-foreground transition-colors" />
              <span>Edit Company Profile</span>
            </button>
            
            <button
              onClick={() => quickAction('refresh')}
              className="px-4 py-2.5 bg-card hover:bg-gradient-to-r hover:from-primary hover:to-accent hover:text-primary-foreground border border-border text-foreground font-semibold rounded-xl text-xs shadow-sm transition-all duration-300 cursor-pointer flex items-center gap-1 group"
            >
              <Loader2 size={12} className={`text-primary group-hover:text-primary-foreground transition-colors ${extractMutation.isPending ? "animate-spin" : ""}`} />
              <span>Refresh AI</span>
            </button>

            <button
              onClick={() => quickAction('content')}
              className="px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-extrabold rounded-xl text-xs shadow-sm hover:opacity-90 transition-all cursor-pointer flex items-center gap-1"
            >
              <Sparkles size={12} />
              <span>Generate Content</span>
            </button>
          </div>
        </div>

        {/* Persona Form Modal */}
        {personaModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-lg bg-card rounded-2xl border border-border shadow-2xl relative flex flex-col max-h-[90vh]">
              <div className="p-6 border-b border-border flex items-center justify-between bg-card rounded-t-2xl">
                <h3 className="font-display text-lg font-bold text-foreground">
                  {editPersonaId ? 'Modify Content Persona' : 'Design Content Persona'}
                </h3>
                <button
                  onClick={closePersonaModal}
                  className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handlePersonaSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 bg-card">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Persona Name *</label>
                  <input
                    type="text"
                    required
                    value={personaName}
                    onChange={(e) => setPersonaName(e.target.value)}
                    placeholder="e.g. Thought Leader, Technical Founder"
                    className="w-full px-3 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:border-primary text-foreground bg-background"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Tone of Voice *</label>
                  <input
                    type="text"
                    required
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    placeholder="e.g. Professional, Visionary, Snappy, Empathetic"
                    className="w-full px-3 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:border-primary text-foreground bg-background"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Writing Style</label>
                    <input
                      type="text"
                      value={writingStyle}
                      onChange={(e) => setWritingStyle(e.target.value)}
                      placeholder="e.g. Storyteller, Technical"
                      className="w-full px-3 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:border-primary text-foreground bg-background"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Target Focus</label>
                    <input
                      type="text"
                      value={audienceType}
                      onChange={(e) => setAudienceType(e.target.value)}
                      placeholder="e.g. Pre-Seed Founders"
                      className="w-full px-3 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:border-primary text-foreground bg-background"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Description / Bio</label>
                  <textarea
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe this persona's focus, background, constraints, and target topics..."
                    className="w-full p-3 border border-border rounded-xl text-sm focus:outline-none focus:border-primary text-foreground bg-background resize-none"
                  />
                </div>

                <div className="pt-4 flex justify-end gap-3 border-t border-border">
                  <button
                    type="button"
                    onClick={closePersonaModal}
                    className="px-4 py-2 border border-border text-foreground hover:bg-muted rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createPersonaMutation.isPending || updatePersonaMutation.isPending}
                    className="px-5 py-2.5 bg-gradient-to-r from-primary to-accent hover:opacity-90 disabled:opacity-50 text-primary-foreground font-bold rounded-xl shadow-sm flex items-center gap-1.5 text-xs cursor-pointer"
                  >
                    {(createPersonaMutation.isPending || updatePersonaMutation.isPending) ? (
                      <>
                        <Loader2 className="animate-spin" size={12} />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Check size={12} />
                        <span>{editPersonaId ? 'Save Changes' : 'Create Persona'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* View Document Summary / Edit Modal */}
        {selectedText !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-2xl bg-card border border-border shadow-2xl rounded-2xl relative flex flex-col max-h-[85vh]">
              <div className="p-6 border-b border-border flex items-center justify-between bg-card rounded-t-2xl">
                <div>
                  <h3 className="font-display text-lg font-bold text-foreground">AI Grounding Summary Context</h3>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5 max-w-md">{selectedFileName}</p>
                </div>
                <button
                  onClick={() => { setSelectedText(null); setIsEditingSummary(false); }}
                  className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 bg-muted/20 border-y border-border max-h-[50vh] flex flex-col">
                {isEditingSummary ? (
                  <textarea
                    value={summaryTextVal}
                    onChange={(e) => setSummaryTextVal(e.target.value)}
                    className="w-full flex-1 min-h-[25vh] p-3 text-foreground border border-border rounded-xl focus:outline-none text-sm bg-background resize-y"
                    placeholder="Type or modify summary text here..."
                  />
                ) : (
                  selectedText ? (
                    <div 
                      className="text-xs md:text-sm text-foreground/90 leading-relaxed space-y-4"
                      dangerouslySetInnerHTML={{ __html: renderMarkdownToHTML(selectedText) }}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No summary text parsed in this document.</p>
                  )
                )}
              </div>

              <div className="p-4 border-t border-border flex justify-end gap-2 bg-card rounded-b-2xl">
                {isEditingSummary ? (
                  <>
                    <button
                      onClick={() => setIsEditingSummary(false)}
                      className="px-4 py-2 border border-border hover:bg-muted text-foreground rounded-xl text-xs font-semibold cursor-pointer"
                      disabled={updateSummaryMutation.isPending}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => updateSummaryMutation.mutate({ id: selectedDocId, summaryText: summaryTextVal })}
                      className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl text-xs shadow-sm flex items-center gap-1.5 cursor-pointer"
                      disabled={updateSummaryMutation.isPending}
                    >
                      {updateSummaryMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Save Summary'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setIsEditingSummary(true)}
                      className="px-4 py-2 border border-border hover:bg-muted text-foreground rounded-xl text-xs font-semibold cursor-pointer"
                    >
                      Edit Summary
                    </button>
                    <button
                      onClick={() => setSelectedText(null)}
                      className="px-5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl text-xs shadow-sm cursor-pointer"
                    >
                      Done
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* View Company Profile Details Read-Only Modal */}
        {isViewDetailsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-3xl bg-card rounded-2xl border border-border shadow-2xl relative flex flex-col max-h-[90vh]">
              <div className="p-6 border-b border-border flex items-center justify-between bg-card rounded-t-2xl">
                <h3 className="font-display text-lg font-bold text-foreground">Company Profile Details</h3>
                <button
                  onClick={() => setIsViewDetailsOpen(false)}
                  className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs md:text-sm bg-card">
                <div className="flex items-center gap-4 border-b border-border pb-4">
                  {logo ? (
                    <div className="w-16 h-16 rounded-xl bg-white dark:bg-slate-100 border border-border flex items-center justify-center p-1.5 overflow-hidden shadow-sm shrink-0">
                      <img
                        src={logo.startsWith('http') || logo.startsWith('data:') ? logo : `${import.meta.env.VITE_API_URL || 'http://localhost:4000/api'}/..${logo}`}
                        alt="Logo"
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-muted border border-border flex items-center justify-center text-muted-foreground">
                      <Building size={24} />
                    </div>
                  )}
                  <div>
                    <h4 className="font-display font-extrabold text-foreground text-base">{companyName}</h4>
                    <p className="text-xs text-muted-foreground">{industry || 'SaaS'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Website URL</span>
                    <p className="font-semibold text-primary">{website || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Brand Voice Tone</span>
                    <p className="font-semibold text-foreground">{brandVoice || '—'}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Product / Service Description</span>
                  <p className="text-foreground/90 bg-muted/20 p-4 rounded-xl border border-border leading-relaxed whitespace-pre-wrap">{productDescription || '—'}</p>
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Target Audience Focus</span>
                  <p className="text-foreground/90 bg-muted/20 p-4 rounded-xl border border-border leading-relaxed whitespace-pre-wrap">{targetAudience || '—'}</p>
                </div>

                {competitors.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Competitors</span>
                    <div className="flex flex-wrap gap-1.5">
                      {competitors.map((c) => (
                        <span key={c} className="px-2.5 py-1 bg-muted border border-border rounded-lg text-xs font-semibold text-foreground">{c}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-border flex justify-end bg-card rounded-b-2xl">
                <button
                  onClick={() => setIsViewDetailsOpen(false)}
                  className="px-5 py-2.5 bg-gradient-to-r from-primary to-accent text-primary-foreground font-bold rounded-xl text-xs cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Persona Details Viewer Modal */}
        {viewPersonaDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-lg bg-card rounded-2xl border border-border shadow-2xl relative flex flex-col max-h-[90vh]">
              <div className="p-6 border-b border-border flex items-center justify-between bg-card rounded-t-2xl">
                <h3 className="font-display text-lg font-bold text-foreground">Content Persona Details</h3>
                <button
                  onClick={() => setViewPersonaDetails(null)}
                  className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs md:text-sm bg-card">
                <div className="flex items-center gap-4 border-b border-border pb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-primary/10 to-accent/20 border border-primary/20 flex items-center justify-center font-extrabold text-primary text-sm shadow-sm select-none">
                    {(viewPersonaDetails.personaName || viewPersonaDetails.name) ? (viewPersonaDetails.personaName || viewPersonaDetails.name).split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'P'}
                  </div>
                  <div className="text-left">
                    <h4 className="font-display font-extrabold text-foreground text-base">{viewPersonaDetails.personaName || viewPersonaDetails.name}</h4>
                    <p className="text-xs text-accent-foreground font-bold uppercase tracking-wider">{viewPersonaDetails.audienceType || viewPersonaDetails.audience || 'Audience'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-left">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Tone of Voice</span>
                    <p className="font-semibold text-primary">{viewPersonaDetails.tone || viewPersonaDetails.voice || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Writing Style</span>
                    <p className="font-semibold text-foreground">{viewPersonaDetails.writingStyle || '—'}</p>
                  </div>
                </div>

                <div className="space-y-2 text-left">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Description & Biography</span>
                  <p className="text-foreground/90 bg-muted/20 p-4 rounded-xl border border-border leading-relaxed whitespace-pre-wrap">{viewPersonaDetails.description || viewPersonaDetails.notes || '—'}</p>
                </div>
              </div>

              <div className="p-4 border-t border-border flex justify-end bg-card rounded-b-2xl">
                <button
                  onClick={() => setViewPersonaDetails(null)}
                  className="px-5 py-2.5 bg-gradient-to-r from-primary to-accent text-primary-foreground font-bold rounded-xl text-xs cursor-pointer shadow-md hover:opacity-90"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
};

export default BrandSetup;