const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

class TemplateManager {
  constructor(configPath = null, maxCustomTemplates = 50) {
    this.configPath = configPath || path.join(__dirname, 'analysisTemplates.json');
    this.templates = null;
    this.maxCustomTemplates = maxCustomTemplates;
    this.cache = new Map(); // Cache loaded templates
    this.cacheTimestamp = 0;
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
  }

  async loadTemplates() {
    // Check cache first
    const now = Date.now();
    if (this.templates && now - this.cacheTimestamp < this.cacheTTL) {
      return this.templates;
    }

    try {
      const data = await fs.readFile(this.configPath, 'utf8');
      this.templates = JSON.parse(data);
      this.cacheTimestamp = now;
      return this.templates;
    } catch (error) {
      logger.warn('Failed to load templates, using defaults:', error.message);
      this.templates = this.getDefaultTemplates();
      this.cacheTimestamp = now;
      return this.templates;
    }
  }

  getDefaultTemplates() {
    return {
      version: '1.0',
      templates: {
        default: {
          name: 'Balanced (Default)',
          settings: {
            windowShift: 0,
            temperature: 0.1,
            transitionProb: 0.8,
            diatonicBonus: 0.1,
            nonDiatonicPenalty: 0.1,
            rootPeakBias: 0.1,
            rootOnly: true,
            mfccWeight: 0.5,
            bassWeight: 1.0,
          },
        },
      },
      customTemplates: {},
    };
  }

  async getTemplate(templateName = 'default') {
    if (!this.templates) {
      await this.loadTemplates();
    }

    // Check custom templates first
    if (this.templates.customTemplates && this.templates.customTemplates[templateName]) {
      return this.templates.customTemplates[templateName].settings;
    }

    // Fall back to built-in templates
    if (this.templates.templates && this.templates.templates[templateName]) {
      return this.templates.templates[templateName].settings;
    }

    // Return default if not found
    return this.templates.templates.default.settings;
  }

  async saveCustomTemplate(name, settings, description = '') {
    if (!this.templates) {
      await this.loadTemplates();
    }

    this.templates.customTemplates = this.templates.customTemplates || {};

    // Enforce limit on custom templates
    const customCount = Object.keys(this.templates.customTemplates).length;
    if (customCount >= this.maxCustomTemplates && !this.templates.customTemplates[name]) {
      throw new Error(
        `Maximum custom templates (${this.maxCustomTemplates}) reached. ` +
          `Please delete old templates before adding new ones.`,
      );
    }

    this.templates.customTemplates[name] = {
      name: name,
      description: description,
      settings: settings,
      created: new Date().toISOString(),
    };

    await fs.writeFile(this.configPath, JSON.stringify(this.templates, null, 2));

    // Invalidate cache
    this.cacheTimestamp = 0;

    return true;
  }

  async deleteCustomTemplate(name) {
    if (!this.templates) {
      await this.loadTemplates();
    }

    if (this.templates.customTemplates && this.templates.customTemplates[name]) {
      delete this.templates.customTemplates[name];
      await fs.writeFile(this.configPath, JSON.stringify(this.templates, null, 2));
      return true;
    }
    return false;
  }

  async listTemplates() {
    if (!this.templates) {
      await this.loadTemplates();
    }

    const builtIn = Object.keys(this.templates.templates || {}).map((key) => ({
      id: key,
      ...this.templates.templates[key],
      type: 'built-in',
    }));

    const custom = Object.keys(this.templates.customTemplates || {}).map((key) => ({
      id: key,
      ...this.templates.customTemplates[key],
      type: 'custom',
    }));

    return [...builtIn, ...custom];
  }

  getCacheStats() {
    const builtInCount = this.templates ? Object.keys(this.templates.templates || {}).length : 0;
    const customCount = this.templates
      ? Object.keys(this.templates.customTemplates || {}).length
      : 0;
    const memoryEstimate = this.templates ? JSON.stringify(this.templates).length / 1024 : 0; // KB

    return {
      builtInTemplates: builtInCount,
      customTemplates: customCount,
      maxCustomTemplates: this.maxCustomTemplates,
      memoryEstimateKB: Math.round(memoryEstimate * 100) / 100,
      cacheAge: this.cacheTimestamp ? Date.now() - this.cacheTimestamp : 0,
      cacheValid: this.cacheTimestamp && Date.now() - this.cacheTimestamp < this.cacheTTL,
    };
  }

  clearCache() {
    this.templates = null;
    this.cacheTimestamp = 0;
  }
}

module.exports = TemplateManager;
