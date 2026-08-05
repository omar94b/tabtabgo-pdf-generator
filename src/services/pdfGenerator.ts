import { config } from '../config/index.js';
import type { Browser, PDFOptions, LaunchOptions, PuppeteerNode } from 'puppeteer';

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

interface Payload {
  contentType?: string;
  content?: string;
  options?: PDFOptions;
}

const omitNullishPdfOptions = (options: PDFOptions): PDFOptions => {
  const sanitizedOptions = Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== null && value !== undefined),
  ) as PDFOptions;

  if (sanitizedOptions.margin && typeof sanitizedOptions.margin === 'object') {
    sanitizedOptions.margin = Object.fromEntries(
      Object.entries(sanitizedOptions.margin).filter(([, value]) => value !== null && value !== undefined),
    );
  }

  return sanitizedOptions;
};

/**
 * PDF Generator Service using dependency injection pattern
 * This allows for better testing and control over the Puppeteer library
 */
export class PdfGeneratorService {
  private puppeteer: PuppeteerNode | null;

  constructor(puppeteerInstance: PuppeteerNode | null = null) {
    // Dependency injection for Puppeteer library
    this.puppeteer = puppeteerInstance;
  }

  /**
   * Initialize Puppeteer if not already injected
   */
  async initializePuppeteer(): Promise<void> {
    if (!this.puppeteer) {
      const puppeteer = await import('puppeteer');
      this.puppeteer = puppeteer.default;
    }
  }

  /**
   * Generate PDF from HTML content
   * @param content - HTML content as string
   * @param options - Puppeteer PDF options
   * @returns PDF buffer
   */
  async generatePdf(content: string, options: PDFOptions = {}): Promise<Buffer> {
    await this.initializePuppeteer();

    if (!this.puppeteer) {
      throw new Error('Failed to initialize Puppeteer');
    }

    let browser: Browser | null = null;

    try {
      // Launch browser with custom executable path if configured
      const launchOptions: LaunchOptions = {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      };

      if (config.puppeteerExecutablePath) {
        launchOptions.executablePath = config.puppeteerExecutablePath;
      }

      browser = await this.puppeteer.launch(launchOptions);
      
      if (!browser) {
        throw new Error('Failed to launch browser');
      }
      
      const page = await browser.newPage();

      // Set content and wait for any network requests to complete
      await page.setContent(content, {
        waitUntil: 'networkidle0',
      });

      // Default PDF options with user overrides
      const pdfOptions: PDFOptions = {
        format: 'A4',
        printBackground: true,
        ...omitNullishPdfOptions(options),
      };

      // Generate PDF buffer
      const pdfBuffer = await page.pdf(pdfOptions);

      return Buffer.from(pdfBuffer);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`PDF generation failed: ${errorMessage}`);
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Validate PDF generation request payload
   * @param payload - Request payload
   * @returns Validation result
   */
  validatePayload(payload: Payload): ValidationResult {
    const errors: string[] = [];

    if (!payload) {
      return { valid: false, errors: ['Request payload is required'] };
    }

    // contentType validation
    const supportedContentTypes = ['html', 'docx', 'word-xml'];
    if (!payload.contentType) {
      errors.push('contentType is required');
    } else if (!supportedContentTypes.includes(payload.contentType.toLowerCase())) {
      errors.push(`contentType must be one of: ${supportedContentTypes.join(', ')}`);
    }

    // content validation
    if (!payload.content) {
      errors.push('content is required');
    } else if (typeof payload.content !== 'string') {
      errors.push('content must be a string');
    }

    // options validation (optional)
    if (payload.options && (typeof payload.options !== 'object' || Array.isArray(payload.options) || payload.options === null)) {
      errors.push('options must be an object');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// Create a singleton instance with dependency injection support
export const createPdfGeneratorService = (puppeteerInstance: PuppeteerNode | null = null): PdfGeneratorService => {
  return new PdfGeneratorService(puppeteerInstance);
};
