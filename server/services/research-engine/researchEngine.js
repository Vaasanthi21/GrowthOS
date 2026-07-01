import Company from '../../models/Company.js';
import Topic from '../../models/Topic.js';
import Persona from '../../models/Persona.js';
import KnowledgeBase from '../../models/KnowledgeBase.js';
import aiService from '../aiService.js';



class ResearchEngine {
  /**
   * Generates a market research synthesis report by delegating to the reusable AIService
   * @param {string} companyId - User's company ID context
   * @param {string} topicId - Targeted topic ID
   */
  async synthesizeResearch(companyId, topicId) {
    try {
      // 1. Fetch Topic and populate references
      const topic = await Topic.findById(topicId).populate('personaId');
      if (!topic) {
        throw new Error('Topic not found');
      }

      // Verify company ownership context
      if (topic.companyId.toString() !== companyId.toString()) {
        throw new Error('Unauthorized company context for topic');
      }

      // 2. Fetch Company details
      let companyProfile = await Company.findById(companyId);
      if (!companyProfile) {
        companyProfile = await Company.findOne({ createdBy: companyId });
      }

      const companyData = companyProfile || {
        companyName: 'Growth OS Client',
        industry: 'Technology',
        brandVoice: 'Professional, Innovative',
        competitors: [],
        targetAudience: 'Early Adopters',
        productDescription: 'Enterprise software solution',
      };

      // 3. Fetch Grounding context
      const knowledgeDocs = await KnowledgeBase.find({ companyId });
      let knowledgeContext = '';
      if (knowledgeDocs && knowledgeDocs.length > 0) {
        knowledgeContext = knowledgeDocs
          .slice(0, 3)
          .map((doc) => {
            const content = doc.summaryText || (doc.extractedText ? `${doc.extractedText.slice(0, 1000)}...` : '');
            return `[Grounding Material: ${doc.fileName}]\n${content}`;
          })
          .join('\n\n');
      }

      const persona = topic.personaId || {
        personaName: 'General Audience',
        tone: 'Informative',
        writingStyle: 'Direct',
        audienceType: 'SaaS Professionals',
      };

      // 4. Delegate to AIService
      const synthesizedData = await aiService.generateResearch(
        topic,
        companyData,
        persona,
        knowledgeContext
      );

      return {
        topic: topic.topic,
        news: synthesizedData.news,
        keywords: synthesizedData.keywords,
        competitorAnalysis: synthesizedData.competitorAnalysis,
        suggestedAngles: synthesizedData.suggestedAngles,
      };
    } catch (err) {
      console.error('[RESEARCH DELEGATION ERROR]', err);
      throw err;
    }
  }
}

const serviceInstance = new ResearchEngine();
export default serviceInstance;
