// Environment API key definition
const apiKey = "";
const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const CUSTOM_MODEL_VALUE = "__custom__";
const VALID_MODEL_IDS = [
    "gemini-3.5-flash",
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite",
    "gemini-3.1-pro-preview",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-pro"
];

const TRANSLATION_GENRE_PRESETS = {
    custom: '',
    quality: '- GENRE PRESET: Best-quality scanlation. Keep meaning, tone, subtext, and character voice. Prefer natural Vietnamese over literal wording. Preserve honorifics and xưng hô when important.',
    comedy: '- GENRE PRESET: Comedy manga. Keep timing sharp, wording natural, and punchlines intact. Preserve exaggeration and rhythm.',
    school: '- GENRE PRESET: School-life manga. Use casual, youthful Vietnamese. Keep conversations believable, light, and natural.',
    shounen: '- GENRE PRESET: Shounen/action manga. Use short, punchy, energetic Vietnamese. Keep momentum, hype, and battle intensity.',
    fantasy: '- GENRE PRESET: Fantasy/isekai manga. Keep terms consistent, worldbuilding clear, and dialogue readable. Do not over-literalize titles or skill names.',
    drama: '- GENRE PRESET: Drama manga. Keep emotions subtle, restrained, and natural. Preserve tension and character nuance.',
    horror: '- GENRE PRESET: Horror/thriller manga. Keep the wording tense, cold, and unsettling. Do not soften fear or suspense.',
    polite: '- GENRE PRESET: Polite/formal dialogue. Use respectful Vietnamese, balanced xưng hô, and avoid slang unless the original is casual.',
    romance: '- GENRE PRESET: Romance manga. Use warm, delicate Vietnamese. Keep emotional beats soft and natural.',
    slice: '- GENRE PRESET: Slice-of-life manga. Use everyday Vietnamese, relaxed pacing, and simple, believable wording.'
};

function normalizeModelId(modelId) {
    return VALID_MODEL_IDS.includes(modelId) ? modelId : DEFAULT_MODEL;
}

function isWeakTranslationModel(modelId) {
    return String(modelId || '').includes('flash-lite');
}

function isFlash31LiteModel(modelId) {
    return String(modelId || '') === 'gemini-3.1-flash-lite';
}

function getModelTranslationProfile(modelId) {
    const normalized = normalizeModelId(modelId);

    if (normalized === 'gemini-3.1-flash-lite') {
        return [
            '- MODEL PROFILE: Gemini 3.1 Flash-Lite.',
            '- MODEL RULE: You must check the provided previous page dialogues context and strictly reuse the exact same pronouns (xưng hô) and tone for the same characters.',
            '- MODEL RULE: Keep the xưng hô (pronouns) simple, conversational, and highly consistent across all bubbles on the page.',
            '- MODEL RULE: Translate to natural, everyday Vietnamese manga speech. Avoid overly formal, literal, or robotic wording.',
            '- MODEL RULE: Keep translations short and compact so they fit inside speech bubbles easily.'
        ];
    }

    if (normalized.includes('flash-lite')) {
        return [
            '- MODEL PROFILE: Flash-Lite.',
            '- MODEL RULE: Prioritize short, natural, high-confidence Vietnamese. Prefer simple xưng hô and avoid ornate wording.',
            '- MODEL RULE: If speaker relationship is unclear, use the safest neutral Vietnamese pronoun pair that still sounds natural in manga dialogue.',
            '- MODEL RULE: Preserve consistency across repeated lines, even if a later line is slightly more literal.'
        ];
    }

    if (normalized.includes('flash')) {
        return [
            '- MODEL PROFILE: Flash.',
            '- MODEL RULE: Balance naturalness, brevity, and context. Keep tone faithful and xưng hô consistent across nearby bubbles.',
            '- MODEL RULE: Prefer conversational Vietnamese that sounds like real manga dialogue instead of literal sentence-by-sentence translation.'
        ];
    }

    if (normalized.includes('pro')) {
        return [
            '- MODEL PROFILE: Pro.',
            '- MODEL RULE: Use the deepest available context to infer relationships, subtext, emotional tone, and honorific intent.',
            '- MODEL RULE: Preserve nuanced xưng hô, implied sarcasm, formality shifts, and character voice. Choose the most context-appropriate Vietnamese phrasing, not the most literal one.',
            '- MODEL RULE: When dialogue is ambiguous, keep the scene coherent and prioritize consistent character speech patterns over isolated word-level accuracy.'
        ];
    }

    return [
        '- MODEL PROFILE: Balanced.',
        '- MODEL RULE: Keep the translation natural, concise, and faithful to context. Use consistent xưng hô and tone across the page.'
    ];
}

const DEFAULT_VERTICAL_WRITING_MODE = false;
const DEFAULT_AI_BLOCK_BOX = {
    x: 37.5,
    y: 37.5,
    w: 25,
    h: 25
};

const AI_EDGE_SAFETY_MARGIN = 4;

function isSuspiciousAiBlockBox(box) {
    if (!box) return true;

    const x = Number(box.x);
    const y = Number(box.y);
    const w = Number(box.w);
    const h = Number(box.h);

    if (![x, y, w, h].every(Number.isFinite)) return true;
    if (w <= 0 || h <= 0) return true;
    if (x < 0 || y < 0 || x > 100 || y > 100 || x + w > 100 || y + h > 100) return true;

    const touchesEdge = (
        x <= AI_EDGE_SAFETY_MARGIN ||
        y <= AI_EDGE_SAFETY_MARGIN ||
        x + w >= 100 - AI_EDGE_SAFETY_MARGIN ||
        y + h >= 100 - AI_EDGE_SAFETY_MARGIN
    );

    const isSmallBubble = w <= 35 && h <= 35;

    return touchesEdge && isSmallBubble;
}

function expandAiBox(box, expandXRatio, expandYRatio) {
    const xPad = Math.max(1, box.w * expandXRatio);
    const yPad = Math.max(1, box.h * expandYRatio);
    const nextX = Math.max(0, box.x - xPad);
    const nextY = Math.max(0, box.y - yPad);
    const nextW = Math.min(100 - nextX, box.w + (xPad * 2));
    const nextH = Math.min(100 - nextY, box.h + (yPad * 2));
    return {
        x: nextX,
        y: nextY,
        w: nextW,
        h: nextH
    };
}

function refineAiBlockBox(box, imageData, modelId) {
    const normalized = normalizeAiBlockBox(box);
    if (!imageData) return normalized;

    const weakModel = isWeakTranslationModel(modelId) || isFlash31LiteModel(modelId);
    const lightExpanded = weakModel ? expandAiBox(normalized, 0.05, 0.06) : expandAiBox(normalized, 0.04, 0.05);

    // Dùng độ giãn vừa phải đối với mô hình Lite để snap không bị văng sang nét vẽ nhân vật bên ngoài
    const seedBox = weakModel ? expandAiBox(normalized, 0.06, 0.08) : expandAiBox(normalized, 0.04, 0.05);
    const refined = snapBoxToContours(seedBox, imageData, {
        searchScale: weakModel ? 1.25 : 1.05,
        sampleFractions: weakModel ? [0.3, 0.5, 0.7] : [0.35, 0.5, 0.65],
        darkThreshold: weakModel ? 132 : 130
    });

    const fallbackBox = weakModel ? (isSuspiciousAiBlockBox(lightExpanded) ? normalized : lightExpanded) : normalized;

    if (!refined || isSuspiciousAiBlockBox(refined)) {
        return fallbackBox;
    }

    const normalizedCenterX = normalized.x + (normalized.w / 2);
    const normalizedCenterY = normalized.y + (normalized.h / 2);
    const refinedCenterX = refined.x + (refined.w / 2);
    const refinedCenterY = refined.y + (refined.h / 2);
    const centerShift = Math.max(
        Math.abs(refinedCenterX - normalizedCenterX),
        Math.abs(refinedCenterY - normalizedCenterY)
    );
    const areaRatio = (refined.w * refined.h) / Math.max(1, normalized.w * normalized.h);

    if (weakModel && (centerShift > 12 || areaRatio < 0.5 || areaRatio > 2.4)) {
        return fallbackBox;
    }

    return refined;
}

function normalizeAiBlockBox(box) {
    if (!box) {
        return { ...DEFAULT_AI_BLOCK_BOX };
    }

    let x = Number(box.x);
    let y = Number(box.y);
    let w = Number(box.w);
    let h = Number(box.h);

    // Kiểm tra tính hợp lệ cơ bản
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) {
        return { ...DEFAULT_AI_BLOCK_BOX };
    }

    // Tự động nhận dạng hệ toạ độ 0.0 - 1.0 (Nếu tất cả đều <= 1.0 và chiều rộng, chiều cao > 0)
    if (x <= 1.0 && y <= 1.0 && w <= 1.0 && h <= 1.0) {
        x *= 100;
        y *= 100;
        w *= 100;
        h *= 100;
    }
    // Tự động nhận dạng hệ toạ độ 0 - 1000 (Thang đo Object Detection chuẩn của Gemini)
    else if ((x > 100 || y > 100 || w > 100 || h > 100 || (x + w > 100) || (y + h > 100)) && (x <= 1000 && y <= 1000 && w <= 1000 && h <= 1000)) {
        x /= 10;
        y /= 10;
        w /= 10;
        h /= 10;
    }

    // Giới hạn giá trị trong khoảng hợp lệ [0, 100]
    const cleanX = Math.max(0, Math.min(100, x));
    const cleanY = Math.max(0, Math.min(100, y));
    const cleanW = Math.max(1, Math.min(100 - cleanX, w));
    const cleanH = Math.max(1, Math.min(100 - cleanY, h));

    return {
        x: cleanX,
        y: cleanY,
        w: cleanW,
        h: cleanH
    };
}

// Tự động tinh chỉnh (snap) 4 cạnh của bounding box khớp sát vào đường viền đen gần nhất của bong bóng thoại
function snapBoxToContours(box, imageData, options = {}) {
    if (!imageData) return box;

    const imgW = imageData.width;
    const imgH = imageData.height;
    const brightnessMap = getImageBrightnessMap(imageData);
    const darkThreshold = options.darkThreshold || 130;
    const searchScale = options.searchScale || 1;
    const sampleFractions = options.sampleFractions || [0.35, 0.5, 0.65];

    // Chuyển sang pixel
    let bx = Math.round((box.x / 100) * imgW);
    let by = Math.round((box.y / 100) * imgH);
    let bw = Math.round((box.w / 100) * imgW);
    let bh = Math.round((box.h / 100) * imgH);

    bx = Math.max(0, Math.min(imgW - 1, bx));
    by = Math.max(0, Math.min(imgH - 1, by));
    bw = Math.max(1, Math.min(imgW - bx, bw));
    bh = Math.max(1, Math.min(imgH - by, bh));

    const isDark = (x, y) => {
        if (x < 0 || x >= imgW || y < 0 || y >= imgH) return false;
        const idx = Math.round(y) * imgW + Math.round(x);
        return brightnessMap[idx] < darkThreshold; // Ngưỡng màu tối cho nét vẽ viền đen
    };

    // Giới hạn quét tối đa (8% kích thước hoặc 50px)
    const maxScanX = Math.min(70, Math.round(imgW * 0.08 * searchScale));
    const maxScanY = Math.min(70, Math.round(imgH * 0.08 * searchScale));

    const sampleXs = sampleFractions.map(f => bx + Math.floor(bw * f));
    const sampleYs = sampleFractions.map(f => by + Math.floor(bh * f));

    const pickLineEdge = (linePositions, scanStart, scanEnd, axis) => {
        for (let d = 0; d <= scanEnd; d++) {
            let hitCount = 0;
            for (let i = 0; i < linePositions.length; i++) {
                const pos = linePositions[i];
                const x = axis === 'x' ? pos : null;
                const y = axis === 'y' ? pos : null;
                const top = scanStart === 'top' ? (axis === 'x' ? by - d : by + d) : null;
                const bottom = scanStart === 'bottom' ? (axis === 'x' ? by + bh + d : by + bh - d) : null;
                const left = scanStart === 'left' ? (axis === 'y' ? bx - d : bx + d) : null;
                const right = scanStart === 'right' ? (axis === 'y' ? bx + bw + d : bx + bw - d) : null;
                const px = axis === 'x' ? x : (scanStart === 'left' || scanStart === 'right' ? (left !== null ? left : right) : null);
                const py = axis === 'y' ? y : (scanStart === 'top' || scanStart === 'bottom' ? (top !== null ? top : bottom) : null);
                if (px !== null && py !== null && isDark(px, py)) {
                    hitCount++;
                }
            }
            if (hitCount >= Math.max(2, Math.ceil(linePositions.length / 2))) {
                return scanStart === 'top' || scanStart === 'left' ? (scanStart === 'top' ? by - d : bx - d) : (scanStart === 'bottom' ? by + bh + d : bx + bw + d);
            }
        }
        return null;
    };

    // 1. Tìm cạnh trên (Top) mới: quét tại x = bx + bw/2
    let newTop = by;
    for (let d = 0; d <= maxScanY; d++) {
        let hitCount = 0;
        for (let i = 0; i < sampleXs.length; i++) {
            if (isDark(sampleXs[i], by - d)) hitCount++;
        }
        if (hitCount >= Math.max(2, Math.ceil(sampleXs.length / 2))) {
            newTop = by - d;
            break;
        }
        hitCount = 0;
        for (let i = 0; i < sampleXs.length; i++) {
            if (isDark(sampleXs[i], by + d)) hitCount++;
        }
        if (hitCount >= Math.max(2, Math.ceil(sampleXs.length / 2)) && by + d < by + bh / 2) {
            newTop = by + d;
            break;
        }
    }

    // 2. Tìm cạnh dưới (Bottom) mới: quét tại x = bx + bw/2
    let newBottom = by + bh;
    for (let d = 0; d <= maxScanY; d++) {
        let hitCount = 0;
        for (let i = 0; i < sampleXs.length; i++) {
            if (isDark(sampleXs[i], by + bh + d)) hitCount++;
        }
        if (hitCount >= Math.max(2, Math.ceil(sampleXs.length / 2))) {
            newBottom = by + bh + d;
            break;
        }
        hitCount = 0;
        for (let i = 0; i < sampleXs.length; i++) {
            if (isDark(sampleXs[i], by + bh - d)) hitCount++;
        }
        if (hitCount >= Math.max(2, Math.ceil(sampleXs.length / 2)) && by + bh - d > by + bh / 2) {
            newBottom = by + bh - d;
            break;
        }
    }

    // 3. Tìm cạnh trái (Left) mới: quét tại y = by + bh/2
    let newLeft = bx;
    for (let d = 0; d <= maxScanX; d++) {
        let hitCount = 0;
        for (let i = 0; i < sampleYs.length; i++) {
            if (isDark(bx - d, sampleYs[i])) hitCount++;
        }
        if (hitCount >= Math.max(2, Math.ceil(sampleYs.length / 2))) {
            newLeft = bx - d;
            break;
        }
        hitCount = 0;
        for (let i = 0; i < sampleYs.length; i++) {
            if (isDark(bx + d, sampleYs[i])) hitCount++;
        }
        if (hitCount >= Math.max(2, Math.ceil(sampleYs.length / 2)) && bx + d < bx + bw / 2) {
            newLeft = bx + d;
            break;
        }
    }

    // 4. Tìm cạnh phải (Right) mới: quét tại y = by + bh/2
    let newRight = bx + bw;
    for (let d = 0; d <= maxScanX; d++) {
        let hitCount = 0;
        for (let i = 0; i < sampleYs.length; i++) {
            if (isDark(bx + bw + d, sampleYs[i])) hitCount++;
        }
        if (hitCount >= Math.max(2, Math.ceil(sampleYs.length / 2))) {
            newRight = bx + bw + d;
            break;
        }
        hitCount = 0;
        for (let i = 0; i < sampleYs.length; i++) {
            if (isDark(bx + bw - d, sampleYs[i])) hitCount++;
        }
        if (hitCount >= Math.max(2, Math.ceil(sampleYs.length / 2)) && bx + bw - d > bx + bw / 2) {
            newRight = bx + bw - d;
            break;
        }
    }

    // Tính toán kích thước mới
    let finalBx = newLeft;
    let finalBy = newTop;
    let finalBw = newRight - newLeft;
    let finalBh = newBottom - newTop;

    // Fallback nếu kết quả bất thường
    if (finalBw <= 5 || finalBh <= 5) {
        return box;
    }

    return {
        x: (finalBx / imgW) * 100,
        y: (finalBy / imgH) * 100,
        w: (finalBw / imgW) * 100,
        h: (finalBh / imgH) * 100
    };
}

function parseGeminiJsonText(rawText) {
    const text = String(rawText || '').trim();
    if (!text) {
        throw new Error('AI không trả về dữ liệu JSON.');
    }

    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const candidate = (fenceMatch ? fenceMatch[1] : text).trim();
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    const jsonText = firstBrace >= 0 && lastBrace > firstBrace ? candidate.slice(firstBrace, lastBrace + 1) : candidate;

    try {
        return JSON.parse(jsonText);
    } catch (error) {
        throw new Error(`Không thể đọc JSON từ AI: ${error.message}`);
    }
}

// System Config & Global States
let undoStack = [];
let redoStack = [];
const MAX_HISTORY_LIMIT = 30;

let globalState = {
    apiKey: '',
    selectedModel: DEFAULT_MODEL,
    pages: [],
    activePageIndex: -1,
    selectedBlockId: null,
    viewMode: 'overlay', // 'overlay' | 'split' | 'original'
    zoom: 100,
    activeTab: 'edit', // 'edit' | 'style'
    toeicSavedWords: [],
    activeBlockToeicAnalysis: null,
    toeicMode: 'learn', // 'learn' | 'recall'
    activeToeicQuestionIndex: 0,
    toolbarCollapsedMobile: false,
    autoFitEnabled: true, // Auto-scale font size to perfectly fit bubbles (Default enabled)
    preserveNames: true, // Không dịch tên riêng / nhân vật
    glossaryNames: '',   // Danh sách tên riêng cụ thể giữ nguyên
    sourceLanguage: 'ja', // Ngôn ngữ nguồn ('ja' | 'zh' | 'ko' | 'en' | 'auto')
    pronounMatrix: '',   // Ma trận xưng hô 2 chiều giữa các nhân vật
    ocrEnhanceEnabled: true, // Tiền xử lý tương phản ảnh trước khi gửi OCR
    translationGenrePresets: ['quality'], // Mẫu prompt theo thể loại
    translationContextPrompt: '', // Prompt ngữ cảnh bổ sung cho dịch thuật
    apiDelay: 8,       // Giãn cách gửi yêu cầu API (giây) tránh lỗi 429
    maxRetries: 5,     // Số lần thử lại tối đa khi gặp lỗi API tạm thời
    // Global style presets for new/default blocks
    globalStyle: {
        fontFamily: 'font-comic',
        fontSize: 13,
        textColor: '#000000',
        bgColor: '#ffffff',
        bgOpacity: 100,
        padding: 4,
        rotate: 0,
        vertical: DEFAULT_VERTICAL_WRITING_MODE,
        bold: false,
        align: 'center',
        maskShape: 'bubble-fit', // Default to bubble-fit for perfect speech bubble fitting
        maskSize: 'full',      // Default to full width to perfectly erase old text
        strokeColor: '#ffffff',
        strokeWidth: 0,
        shadowColor: '#000000',
        shadowBlur: 0
    }
};

// UI Element References
const elements = {
    autoFitRuler: document.getElementById('auto-fit-ruler'),
    pagesEmptyState: document.getElementById('pages-empty-state'),
    pagesList: document.getElementById('pages-list'),
    pageCountBadge: document.getElementById('page-count-badge'),
    sourceLangSelect: document.getElementById('source-lang-select'),
    pronounMatrixInput: document.getElementById('pronoun-matrix-input'),
    ocrEnhanceChk: document.getElementById('ocr-enhance-chk'),
    workspaceEmptyState: document.getElementById('workspace-empty-state'),
    mangaCanvasContainer: document.getElementById('manga-canvas-container'),
    mangaBgImage: document.getElementById('manga-bg-image'),
    mangaOverlaysContainer: document.getElementById('manga-overlays-container'),
    canvasFloatingToolbar: document.getElementById('canvas-floating-toolbar'),
    lblFloatingDir: document.getElementById('lbl-floating-dir'),
    workspaceViewport: document.getElementById('workspace-viewport'),
    zoomIndicator: document.getElementById('zoom-indicator'),

    // Edit Panel
    noBlockSelectedState: document.getElementById('no-block-selected-state'),
    blockEditorContainer: document.getElementById('block-editor-container'),
    editOriginalText: document.getElementById('edit-original-text'),
    editTranslatedText: document.getElementById('edit-translated-text'),
    lblBlockId: document.getElementById('lbl-block-id'),

    // Tab Containers
    tabEdit: document.getElementById('tab-edit'),
    tabStyle: document.getElementById('tab-style'),
    panelTabEdit: document.getElementById('panel-tab-edit'),
    panelTabStyle: document.getElementById('panel-tab-style'),

    // Styling Controls
    styleFont: document.getElementById('style-font'),
    styleFontSize: document.getElementById('style-font-size'),
    styleFontSizeContainer: document.getElementById('style-font-size-container'),
    lblFontSize: document.getElementById('lbl-font-size'),
    styleAlign: document.getElementById('style-align'),
    btnStyleHoriz: document.getElementById('btn-style-horiz'),
    btnStyleVert: document.getElementById('btn-style-vert'),
    styleBold: document.getElementById('style-bold'),
    styleTextColor: document.getElementById('style-text-color'),
    styleTextColorHex: document.getElementById('style-text-color-hex'),
    styleBgColor: document.getElementById('style-bg-color'),
    styleBgColorHex: document.getElementById('style-bg-color-hex'),
    styleBgOpacity: document.getElementById('style-bg-opacity'),
    lblBgOpacity: document.getElementById('lbl-bg-opacity'),
    stylePadding: document.getElementById('style-padding'),
    lblPadding: document.getElementById('lbl-padding'),
    styleRotate: document.getElementById('style-rotate'),
    lblRotate: document.getElementById('lbl-rotate'),
    styleAutoFit: document.getElementById('style-auto-fit'),
    styleMaskShape: document.getElementById('style-mask-shape'),
    styleMaskSize: document.getElementById('style-mask-size'),
    styleStrokeColor: document.getElementById('style-stroke-color'),
    styleStrokeColorHex: document.getElementById('style-stroke-color-hex'),
    styleStrokeWidth: document.getElementById('style-stroke-width'),
    lblStrokeWidth: document.getElementById('lbl-stroke-width'),
    styleShadowColor: document.getElementById('style-shadow-color'),
    styleShadowColorHex: document.getElementById('style-shadow-color-hex'),
    styleShadowBlur: document.getElementById('style-shadow-blur'),
    lblShadowBlur: document.getElementById('lbl-shadow-blur'),
    customModelInput: document.getElementById('custom-model-input'),

    // Modals & General Tools
    processingOverlay: document.getElementById('processing-overlay'),
    processingTitle: document.getElementById('processing-title'),
    processingSubtitle: document.getElementById('processing-subtitle'),
    processingBar: document.getElementById('processing-bar'),
    toastContainer: document.getElementById('toast-container'),
    exportModal: document.getElementById('export-modal'),
    settingsModal: document.getElementById('settings-modal'),
    settingsModalBody: document.getElementById('settings-modal-body'),
    exportPreviewImg: document.getElementById('export-preview-img'),
    lnkExportDirectDownload: document.getElementById('lnk-export-direct-download'),
    apiKeyInput: document.getElementById('api-key-input'),

    // Splitting Views
    workspaceSplitWrapper: document.getElementById('workspace-split-wrapper'),
    splitOriginalImg: document.getElementById('split-original-img'),
    splitEditorAnchor: document.getElementById('split-editor-anchor'),

    // Trigger Buttons
    btnActiveTranslate: document.getElementById('btn-active-translate'),
    btnBatchTranslate: document.getElementById('btn-batch-translate'),
    btnBatchExport: document.getElementById('btn-batch-export'),
    btnExportPdf: document.getElementById('btn-export-pdf'),
    btnExportProject: document.getElementById('btn-export-project'),
    btnImportProject: document.getElementById('btn-import-project'),
    btnClearMemory: document.getElementById('btn-clear-memory'),
    btnExportPage: document.getElementById('btn-export-page'),
    btnUndo: document.getElementById('btn-undo'),
    btnRedo: document.getElementById('btn-redo'),
    btnEraserMode: document.getElementById('btn-eraser-mode'),
    eraserSettingsPanel: document.getElementById('eraser-settings-panel'),
    eraserCanvas: document.getElementById('eraser-canvas'),
    eraserBrushSize: document.getElementById('eraser-brush-size'),
    lblEraserBrushSize: document.getElementById('lbl-eraser-brush-size'),
    eraserColorCustom: document.getElementById('eraser-color-custom'),
    btnExportScript: document.getElementById('btn-export-script'),
    btnImportScript: document.getElementById('btn-import-script'),
    btnPreviewMode: document.getElementById('btn-preview-mode'),
    btnCopyStyle: document.getElementById('btn-copy-style'),
    btnPasteStyle: document.getElementById('btn-paste-style'),
    previewModal: document.getElementById('preview-modal'),
    previewBody: document.getElementById('preview-body'),
    previewPageIndicator: document.getElementById('preview-page-indicator'),

    // Translation intelligence controls
    genrePresetOptions: document.querySelectorAll('.genre-preset-option'),
    consistencyCheckSummary: document.getElementById('consistency-check-summary'),
    consistencyCheckResults: document.getElementById('consistency-check-results'),

    // TOEIC Study Companion elements
    tabToeic: document.getElementById('tab-toeic'),
    panelTabToeic: document.getElementById('panel-tab-toeic'),
    toeicNoBlockSelectedState: document.getElementById('toeic-no-block-selected-state'),
    toeicAnalysisContainer: document.getElementById('toeic-analysis-container'),
    btnToeicAnalyze: document.getElementById('btn-toeic-analyze'),
    toeicLoading: document.getElementById('toeic-loading'),
    toeicResults: document.getElementById('toeic-results'),
    toeicGrammarContent: document.getElementById('toeic-grammar-content'),
    toeicVocabList: document.getElementById('toeic-vocab-list'),
    toeicQuestionSection: document.getElementById('toeic-question-section'),
    toeicQuestionText: document.getElementById('toeic-question-text'),
    toeicQuestionOptions: document.getElementById('toeic-question-options'),
    toeicQuestionFeedback: document.getElementById('toeic-question-feedback'),
    toeicSavedCount: document.getElementById('toeic-saved-count'),
    btnToeicExportAnki: document.getElementById('btn-toeic-export-anki'),
    toeicNotebookEmpty: document.getElementById('toeic-notebook-empty'),
    toeicNotebookList: document.getElementById('toeic-notebook-list'),
    toeicOriginalSentence: document.getElementById('toeic-original-sentence'),
    btnSpeakOriginal: document.getElementById('btn-speak-original'),
    btnSpeakQuestion: document.getElementById('btn-speak-question'),
    toeicQuestionType: document.getElementById('toeic-question-type'),

    // Active Recall elements
    toeicLearnModeContent: document.getElementById('toeic-learn-mode-content'),
    toeicRecallContainer: document.getElementById('toeic-recall-container'),
    toeicRecallVietnamese: document.getElementById('toeic-recall-vietnamese'),
    toeicRecallInput: document.getElementById('toeic-recall-input'),
    toeicRecallResult: document.getElementById('toeic-recall-result'),
    btnToeicModeLearn: document.getElementById('btn-toeic-mode-learn'),
    btnToeicModeRecall: document.getElementById('btn-toeic-mode-recall')
};

let cancelTranslationFlag = false;
let isBatchTranslating = false;
let overlayRenderRafId = null;
let copiedStyle = null; // Lưu trữ định dạng đã sao chép cho Copy/Paste Style
let exportPreviewObjectUrl = null;

function getGeminiApiKey() {
    return (globalState.apiKey || apiKey || "").trim();
}

function escapeHTML(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function setMultilineText(target, value) {
    target.textContent = '';
    String(value ?? '').split('\n').forEach((line) => {
        const lineDiv = document.createElement('div');
        lineDiv.style.width = '100%';
        lineDiv.style.margin = '0';
        lineDiv.style.padding = '0';
        lineDiv.style.minHeight = '1em'; // Giữ chiều cao nếu dòng trống
        lineDiv.style.wordBreak = 'keep-all';
        lineDiv.style.overflowWrap = 'normal';
        lineDiv.style.hyphens = 'none';
        lineDiv.appendChild(document.createTextNode(line || ' '));
        target.appendChild(lineDiv);
    });
}

function waitForNextPaint() {
    return new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
}

async function waitForImageReady(imgElement, targetSrc) {
    if (!imgElement) return;
    // Kiểm tra nếu ảnh đã hoàn tất tải và có nguồn khớp chính xác với ảnh đích mong muốn
    if (imgElement.dataset.loadedSrc === targetSrc && imgElement.complete && imgElement.naturalWidth > 0) {
        try {
            if (typeof imgElement.decode === 'function') {
                await imgElement.decode();
            }
        } catch (error) {
            // decode can fail for already painted images in some browsers, safe to continue
        }
        return;
    }

    await new Promise((resolve) => {
        const onLoad = () => {
            imgElement.removeEventListener('load', onLoad);
            imgElement.removeEventListener('error', onError);
            resolve();
        };
        const onError = () => {
            imgElement.removeEventListener('load', onLoad);
            imgElement.removeEventListener('error', onError);
            resolve();
        };
        imgElement.addEventListener('load', onLoad);
        imgElement.addEventListener('error', onError);
    });
}

function getMaskCacheKey(page, block) {
    return `${block.box.x}_${block.box.y}_${block.box.w}_${block.box.h}_${block.style.bgColor}_${block.style.bgOpacity}_${page.id}`;
}

const imageBrightnessCache = new WeakMap();

function getImageBrightnessMap(imageData) {
    if (!imageData) return null;
    const cached = imageBrightnessCache.get(imageData);
    if (cached) return cached;

    const { data, width, height } = imageData;
    const brightness = new Uint8Array(width * height);

    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        brightness[j] = (0.299 * data[i]) + (0.587 * data[i + 1]) + (0.114 * data[i + 2]);
    }

    imageBrightnessCache.set(imageData, brightness);
    return brightness;
}

function collectBubbleSamples(imageData, bx, by, bw, bh, brightnessMap) {
    const imgW = imageData.width;
    const step = Math.max(2, Math.floor(Math.min(bw, bh) / 18));
    const samples = [];

    for (let y = by; y < by + bh; y += step) {
        for (let x = bx; x < bx + bw; x += step) {
            samples.push({
                x: x,
                y: y,
                brightness: brightnessMap[y * imgW + x]
            });
        }
    }

    samples.sort((a, b) => a.brightness - b.brightness);
    return samples;
}

function pickBubbleSeed(samples, bx, by, bw, bh) {
    if (!samples.length) return null;

    const centerX = bx + (bw / 2);
    const centerY = by + (bh / 2);
    let best = null;
    let bestScore = -Infinity;

    const minCenterX = bx + (bw * 0.2);
    const maxCenterX = bx + (bw * 0.8);
    const minCenterY = by + (bh * 0.2);
    const maxCenterY = by + (bh * 0.8);

    samples.forEach((sample) => {
        if (sample.x < minCenterX || sample.x > maxCenterX || sample.y < minCenterY || sample.y > maxCenterY) {
            return;
        }

        const distX = Math.abs(sample.x - centerX) / Math.max(1, bw);
        const distY = Math.abs(sample.y - centerY) / Math.max(1, bh);
        const centerBias = (distX + distY) * 42;
        const score = sample.brightness - centerBias;

        if (score > bestScore) {
            bestScore = score;
            best = sample;
        }
    });

    return best || samples[samples.length - 1];
}

function requestOverlayRender() {
    if (overlayRenderRafId !== null) return;
    overlayRenderRafId = requestAnimationFrame(() => {
        overlayRenderRafId = null;
        renderOverlays();
        if (globalState.viewMode === 'split') {
            updateSplitView();
        }
    });
}

function getCleanFileBaseName(fileName, fallback = 'page') {
    const baseName = String(fileName || fallback)
        .replace(/\.[^/.]+$/, '')
        .replace(/[\\/:*?"<>|]+/g, '_')
        .trim();

    return baseName || fallback;
}

function mountSettingsModal() {
    if (!elements.settingsModalBody) return;

    const apiSettings = document.getElementById('api-settings-section');
    const translationSettings = document.getElementById('translation-settings-section');
    if (apiSettings && apiSettings.parentElement !== elements.settingsModalBody) {
        elements.settingsModalBody.appendChild(apiSettings);
    }
    if (translationSettings && translationSettings.parentElement !== elements.settingsModalBody) {
        elements.settingsModalBody.appendChild(translationSettings);
    }
}

function openSettingsModal() {
    mountSettingsModal();
    elements.settingsModal.classList.remove('hidden');
    setTimeout(() => elements.apiKeyInput.focus(), 0);
}

function closeSettingsModal() {
    elements.settingsModal.classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', async () => {
    mountSettingsModal();
    initEventListeners();
    syncMobileToolbarState();
    syncMobileMenuState();
    // Tải API key đã lưu nếu có
    const savedKey = localStorage.getItem('gemini_manga_api_key');
    if (savedKey) {
        globalState.apiKey = savedKey;
        if (elements.apiKeyInput) {
            elements.apiKeyInput.value = savedKey;
        }
    }

    // Load saved model if available
    const savedModel = localStorage.getItem('gemini_manga_model');
    if (savedModel) {
        const modelSelect = document.getElementById('model-select');
        if (VALID_MODEL_IDS.includes(savedModel)) {
            globalState.selectedModel = savedModel;
            localStorage.setItem('gemini_manga_model', savedModel);
            if (modelSelect) modelSelect.value = savedModel;
        } else {
            globalState.selectedModel = savedModel;
            if (modelSelect) modelSelect.value = CUSTOM_MODEL_VALUE;
            if (elements.customModelInput) {
                elements.customModelInput.value = savedModel;
            }
        }
    }

    // Kiểm tra và khóa mô hình dựa trên trạng thái API Key khi khởi chạy
    updateModelLockingUI();

    const savedAutoFit = localStorage.getItem('gemini_manga_autofit_enabled');
    if (savedAutoFit !== null) {
        globalState.autoFitEnabled = savedAutoFit === 'true';
    }
    if (elements.styleAutoFit) {
        elements.styleAutoFit.checked = globalState.autoFitEnabled;
    }



    const savedPreserve = localStorage.getItem('gemini_manga_preserve_names');
    if (savedPreserve !== null) {
        globalState.preserveNames = savedPreserve === 'true';
        const preserveChk = document.getElementById('preserve-names-chk');
        if (preserveChk) preserveChk.checked = globalState.preserveNames;
        togglePreserveNames(globalState.preserveNames);
    }
    const savedGlossary = localStorage.getItem('gemini_manga_glossary');
    if (savedGlossary !== null) {
        globalState.glossaryNames = savedGlossary;
        const glossaryInp = document.getElementById('glossary-input');
        if (glossaryInp) glossaryInp.value = savedGlossary;
    }

    const savedGenrePreset = localStorage.getItem('gemini_manga_translation_genre_preset');
    if (savedGenrePreset !== null) {
        try {
            const savedPresets = savedGenrePreset.startsWith('[')
                ? JSON.parse(savedGenrePreset)
                : savedGenrePreset.split(',').map(item => item.trim()).filter(Boolean);
            const validPresets = savedPresets.filter(item => TRANSLATION_GENRE_PRESETS[item] !== undefined);
            if (validPresets.length > 0) {
                globalState.translationGenrePresets = validPresets;
            }
        } catch (error) {
            console.warn('Không thể đọc preset thể loại đã lưu:', error);
        }
    }

    syncGenrePresetCheckboxes();
    saveTranslationGenrePresets();

    const savedTranslationContextPrompt = localStorage.getItem('gemini_manga_translation_context_prompt');
    if (savedTranslationContextPrompt !== null) {
        globalState.translationContextPrompt = savedTranslationContextPrompt;
        const contextPromptInp = document.getElementById('translation-context-prompt');
        if (contextPromptInp) contextPromptInp.value = savedTranslationContextPrompt;
    }

    // Tải cấu hình Ngôn ngữ nguồn, Ma trận xưng hô và Tăng cường OCR
    const savedSourceLang = localStorage.getItem('gemini_manga_source_lang');
    if (savedSourceLang) {
        globalState.sourceLanguage = savedSourceLang;
        if (elements.sourceLangSelect) elements.sourceLangSelect.value = savedSourceLang;
    }

    const savedPronounMatrix = localStorage.getItem('gemini_manga_pronoun_matrix');
    if (savedPronounMatrix !== null) {
        globalState.pronounMatrix = savedPronounMatrix;
        if (elements.pronounMatrixInput) elements.pronounMatrixInput.value = savedPronounMatrix;
    }

    const savedOcrEnhance = localStorage.getItem('gemini_manga_ocr_enhance');
    if (savedOcrEnhance !== null) {
        try {
            globalState.ocrEnhanceEnabled = JSON.parse(savedOcrEnhance);
        } catch (e) {
            globalState.ocrEnhanceEnabled = true;
        }
        if (elements.ocrEnhanceChk) elements.ocrEnhanceChk.checked = globalState.ocrEnhanceEnabled;
    }

    // Tải cấu hình apiDelay và maxRetries đã lưu nếu có
    const savedApiDelay = localStorage.getItem('gemini_manga_api_delay');
    if (savedApiDelay !== null) {
        globalState.apiDelay = parseInt(savedApiDelay, 10);
    } else {
        globalState.apiDelay = 8;
    }
    const apiDelayInp = document.getElementById('api-delay-input');
    if (apiDelayInp) apiDelayInp.value = globalState.apiDelay;

    const savedMaxRetries = localStorage.getItem('gemini_manga_max_retries');
    if (savedMaxRetries !== null) {
        globalState.maxRetries = parseInt(savedMaxRetries, 10);
    } else {
        globalState.maxRetries = 5;
    }
    const maxRetriesInp = document.getElementById('max-retries-input');
    if (maxRetriesInp) maxRetriesInp.value = globalState.maxRetries;

    const isLocal = window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocal) {
        document.getElementById('local-mode-indicator').classList.remove('hidden');
    }

    // Khởi tạo IndexedDB và tự động khôi phục phiên làm việc cũ
    try {
        await initDB();
        await loadAndRegisterCustomFonts();
        const project = await loadProjectFromDB();
        if (project) {
            globalState.pages = project.pages;
            globalState.activePageIndex = project.activePageIndex;

            updatePageListUI();
            if (globalState.activePageIndex !== -1 && globalState.pages.length > 0) {
                if (globalState.activePageIndex >= globalState.pages.length) {
                    globalState.activePageIndex = 0;
                }
                selectPage(globalState.activePageIndex);
            }
            // Khôi phục từ vựng TOEIC đã lưu
            globalState.toeicSavedWords = await loadToeicWordsFromDB();
            updateToeicNotebookUI();

            showToast("Đã khôi phục phiên làm việc trước đó!", "success");
        }
    } catch (dbErr) {
        console.error("Lỗi khởi tạo/khôi phục dữ liệu từ IndexedDB:", dbErr);
    }
});

window.addEventListener('resize', syncMobileMenuState);
window.addEventListener('resize', syncMobileToolbarState);

// Setup event handlers
function initEventListeners() {
    // Drag and drop events for file zone
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');

    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('border-indigo-500', 'bg-indigo-600/5');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('border-indigo-500', 'bg-indigo-600/5');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('border-indigo-500', 'bg-indigo-600/5');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleUploadedFiles(e.dataTransfer.files);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleUploadedFiles(e.target.files);
        }
    });

    if (elements.pagesList) {
        elements.pagesList.addEventListener('click', (e) => {
            const translateBtn = e.target.closest('[data-action="translate-page"]');
            if (translateBtn) {
                e.stopPropagation();
                const index = Number(translateBtn.dataset.index);
                if (Number.isInteger(index)) {
                    translateSinglePageInBatch(index);
                }
                return;
            }

            const removeBtn = e.target.closest('[data-action="remove-page"]');
            if (removeBtn) {
                e.stopPropagation();
                const index = Number(removeBtn.dataset.index);
                if (Number.isInteger(index)) {
                    removePage(index);
                }
                return;
            }

            const pageItem = e.target.closest('[data-page-index]');
            if (pageItem) {
                const index = Number(pageItem.dataset.pageIndex);
                if (Number.isInteger(index)) {
                    selectPage(index);
                }
            }
        });
    }

    // API key storage handling
    elements.apiKeyInput.addEventListener('input', (e) => {
        const key = e.target.value.trim();
        globalState.apiKey = key;
        localStorage.setItem('gemini_manga_api_key', key);
        // Cập nhật ngay lập tức giao diện khóa/mở khóa mô hình
        updateModelLockingUI();
    });

    if (elements.editOriginalText) {
        elements.editOriginalText.addEventListener('input', (e) => {
            if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;
            const page = globalState.pages[globalState.activePageIndex];
            const block = page.blocks.find(b => b.id === globalState.selectedBlockId);
            if (block) {
                block.original = e.target.value;
                // Invalidate TOEIC analysis cache since the original text changed
                globalState.activeBlockToeicAnalysis = null;
                debounceSavePage(page);
            }
        });
    }

    if (elements.customModelInput) {
        elements.customModelInput.addEventListener('input', () => {
            if (document.getElementById('model-select')?.value === CUSTOM_MODEL_VALUE && !document.getElementById('model-select')?.disabled) {
                updateSelectedModel(CUSTOM_MODEL_VALUE);
            }
        });
    }

    document.querySelectorAll('.genre-preset-option').forEach((checkbox) => {
        checkbox.addEventListener('change', () => {
            updateTranslationGenrePreset();
        });
    });

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        // Phím tắt hoàn tác (Undo) và làm lại (Redo) toàn cục
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            executeUndo();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            executeRedo();
            return;
        }

        // Ignore keypresses if typing inside input/textareas
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (globalState.selectedBlockId !== null) {
            const activePage = globalState.pages[globalState.activePageIndex];
            if (!activePage) return;
            const block = activePage.blocks.find(b => b.id === globalState.selectedBlockId);
            if (!block) return;

            // Manual Font Size key bindings: '[' decrease, ']' increase
            if (e.key === '[') {
                e.preventDefault();
                const newSize = Math.max(8, block.style.fontSize - 1);
                syncActiveBlockStyle('fontSize', newSize);
            } else if (e.key === ']') {
                e.preventDefault();
                const newSize = Math.min(100, block.style.fontSize + 1);
                syncActiveBlockStyle('fontSize', newSize);
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                deleteActiveBlock();
            }
        }

        // Phím tắt Tab / Shift+Tab: nhảy sang block kế tiếp / trước đó
        if (e.key === 'Tab') {
            e.preventDefault();
            navigateBlocks(e.shiftKey ? -1 : 1);
            return;
        }

        // Phím tắt Escape: bỏ chọn block hiện tại
        if (e.key === 'Escape') {
            e.preventDefault();
            if (globalState.selectedBlockId) {
                const prevEl = document.getElementById(globalState.selectedBlockId);
                if (prevEl) prevEl.classList.remove('active');
                globalState.selectedBlockId = null;
                if (elements.btnCopyStyle) elements.btnCopyStyle.disabled = true;
                if (elements.btnPasteStyle) elements.btnPasteStyle.disabled = true;
                updateActiveBlockEditor();
            }
            return;
        }

        // Phím tắt Page Up / Page Down: chuyển trang truyện
        if (e.key === 'PageUp') {
            e.preventDefault();
            if (globalState.activePageIndex > 0) selectPage(globalState.activePageIndex - 1);
            return;
        }
        if (e.key === 'PageDown') {
            e.preventDefault();
            if (globalState.activePageIndex < globalState.pages.length - 1) selectPage(globalState.activePageIndex + 1);
            return;
        }

        // Phím tắt Ctrl+Shift+C / V: sao chép / dán định dạng
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
            e.preventDefault();
            copyBlockStyle();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'v') {
            e.preventDefault();
            pasteBlockStyle();
            return;
        }
    });
}

// Tự động Khóa/Mở khóa Model Selector dựa trên việc điền Key cá nhân
function updateModelLockingUI() {
    const hasCustomKey = elements.apiKeyInput.value.trim() !== "";
    const hasSystemKey = apiKey.trim() !== "";
    const modelSelect = document.getElementById('model-select');
    const lockBadge = document.getElementById('model-lock-badge');
    const selectNote = document.getElementById('model-select-note');
    const customModelInput = elements.customModelInput;
    const syncCustomModelVisibility = () => {
        if (!customModelInput) return;
        const isCustomSelected = modelSelect && modelSelect.value === CUSTOM_MODEL_VALUE;
        customModelInput.classList.toggle('hidden', !isCustomSelected || modelSelect.disabled);
        customModelInput.disabled = modelSelect.disabled || !isCustomSelected;
    };

    if (!hasCustomKey && hasSystemKey) {
        // Nếu dùng key hệ thống, ép sử dụng và khóa cứng model mặc định
        modelSelect.value = DEFAULT_MODEL;
        globalState.selectedModel = DEFAULT_MODEL;
        modelSelect.disabled = true;
        modelSelect.classList.add('opacity-60', 'cursor-not-allowed', 'bg-slate-950');
        if (customModelInput) {
            customModelInput.classList.add('hidden');
            customModelInput.disabled = true;
        }

        lockBadge.innerHTML = '<i class="fa-solid fa-lock"></i> Đã Khóa';
        lockBadge.className = "text-[9px] text-indigo-400 font-bold bg-indigo-500/10 px-1.5 py-0.5 rounded flex items-center gap-1";
        selectNote.innerText = "* Mô hình được khóa cố định để đảm bảo chạy mượt mà bằng phím tự động của Sandbox Canvas.";
    } else if (!hasCustomKey) {
        modelSelect.value = DEFAULT_MODEL;
        globalState.selectedModel = DEFAULT_MODEL;
        modelSelect.disabled = true;
        modelSelect.classList.add('opacity-60', 'cursor-not-allowed', 'bg-slate-950');
        if (customModelInput) {
            customModelInput.classList.add('hidden');
            customModelInput.disabled = true;
        }

        lockBadge.innerHTML = '<i class="fa-solid fa-key text-amber-400"></i> Cần Key';
        lockBadge.className = "text-[9px] text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded flex items-center gap-1";
        selectNote.innerText = "* Vui lòng nhập Gemini API Key cá nhân trước khi dịch.";
    } else {
        // Mở khóa cho phép người dùng tự cấu hình nếu có key cá nhân
        modelSelect.disabled = false;
        modelSelect.classList.remove('opacity-60', 'cursor-not-allowed', 'bg-slate-950');

        lockBadge.innerHTML = '<i class="fa-solid fa-lock-open text-emerald-400"></i> Tự chọn';
        lockBadge.className = "text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded flex items-center gap-1";
        selectNote.innerText = "* Bạn có thể chọn model có sẵn hoặc tự nhập model khác nếu tài khoản Google của bạn hỗ trợ.";

        // Đồng bộ lại mô hình được chọn
        if (modelSelect.value === CUSTOM_MODEL_VALUE) {
            const customModel = customModelInput?.value.trim() || DEFAULT_MODEL;
            globalState.selectedModel = customModel;
        } else {
            globalState.selectedModel = modelSelect.value;
        }
    }

    syncCustomModelVisibility();
}

function toggleApiKeyVisibility() {
    const eyeBtn = document.getElementById('api-key-eye');
    if (elements.apiKeyInput.type === 'password') {
        elements.apiKeyInput.type = 'text';
        eyeBtn.innerHTML = '<i class="fa-solid fa-eye-slash text-[11px]"></i>';
    } else {
        elements.apiKeyInput.type = 'password';
        eyeBtn.innerHTML = '<i class="fa-solid fa-eye text-[11px]"></i>';
    }
}

function updateSelectedModel(val) {
    const modelSelect = document.getElementById('model-select');

    if (val === CUSTOM_MODEL_VALUE) {
        const customModel = elements.customModelInput ? elements.customModelInput.value.trim() : '';
        if (!customModel) {
            globalState.selectedModel = DEFAULT_MODEL;
            if (modelSelect) modelSelect.value = CUSTOM_MODEL_VALUE;
            if (elements.customModelInput) elements.customModelInput.classList.remove('hidden');
            showToast('Nhập model ở ô bên dưới trước khi dùng mục Tự nhập model.', 'warn');
            return;
        }
        globalState.selectedModel = customModel;
        if (modelSelect) modelSelect.value = CUSTOM_MODEL_VALUE;
        localStorage.setItem('gemini_manga_model', customModel);
        showToast(`Đã chuyển sang sử dụng mô hình: ${customModel}`, 'info');
        return;
    }

    const normalizedModel = normalizeModelId(val);
    globalState.selectedModel = normalizedModel;
    if (modelSelect) modelSelect.value = normalizedModel;
    localStorage.setItem('gemini_manga_model', normalizedModel);
    showToast(`Đã chuyển sang sử dụng mô hình: ${normalizedModel}`, 'info');
}

function toggleAutoFit(enabled) {
    globalState.autoFitEnabled = enabled;
    localStorage.setItem('gemini_manga_autofit_enabled', enabled);
    if (enabled) {
        autoFitAllBlocksOnPage();
        requestOverlayRender();
        showToast('Đã bật chế độ Tự động căn chỉnh cỡ chữ (Auto-Fit) theo khung thoại.', 'success');
    } else {
        showToast('Đã tắt Auto-Fit. Bạn có thể tự chỉnh cỡ chữ thủ công.', 'info');
    }
}

function togglePreserveNames(enabled) {
    globalState.preserveNames = enabled;
    localStorage.setItem('gemini_manga_preserve_names', enabled);
    const container = document.getElementById('glossary-container');
    if (container) {
        if (enabled) {
            container.classList.remove('opacity-40', 'pointer-events-none');
        } else {
            container.classList.add('opacity-40', 'pointer-events-none');
        }
    }
}

// Cập nhật danh sách từ khóa giữ nguyên
function updateGlossary(value) {
    globalState.glossaryNames = value;
    localStorage.setItem('gemini_manga_glossary', value);
}

function syncGenrePresetCheckboxes() {
    const selectedPresets = new Set(globalState.translationGenrePresets.length ? globalState.translationGenrePresets : ['quality']);
    const options = document.querySelectorAll('.genre-preset-option');
    options.forEach((option) => {
        option.checked = selectedPresets.has(option.value);
    });
}

function saveTranslationGenrePresets() {
    const selectedPresets = Array.from(document.querySelectorAll('.genre-preset-option:checked')).map((option) => option.value).filter((value) => TRANSLATION_GENRE_PRESETS[value] !== undefined);
    globalState.translationGenrePresets = selectedPresets.length ? selectedPresets : ['quality'];
    localStorage.setItem('gemini_manga_translation_genre_preset', JSON.stringify(globalState.translationGenrePresets));
}

function updateTranslationGenrePreset() {
    saveTranslationGenrePresets();
}

function updateTranslationContextPrompt(value) {
    globalState.translationContextPrompt = value;
    localStorage.setItem('gemini_manga_translation_context_prompt', value);
}

function updateSourceLanguage(value) {
    globalState.sourceLanguage = value || 'ja';
    localStorage.setItem('gemini_manga_source_lang', globalState.sourceLanguage);
}
window.updateSourceLanguage = updateSourceLanguage;

function updatePronounMatrix(value) {
    globalState.pronounMatrix = value || '';
    localStorage.setItem('gemini_manga_pronoun_matrix', globalState.pronounMatrix);
}
window.updatePronounMatrix = updatePronounMatrix;

function toggleOcrEnhance(checked) {
    globalState.ocrEnhanceEnabled = Boolean(checked);
    localStorage.setItem('gemini_manga_ocr_enhance', JSON.stringify(globalState.ocrEnhanceEnabled));
}
window.toggleOcrEnhance = toggleOcrEnhance;

function updateApiDelay(value) {
    let parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < 0) parsed = 8;
    globalState.apiDelay = parsed;
    localStorage.setItem('gemini_manga_api_delay', parsed);
}
window.updateApiDelay = updateApiDelay;

function updateMaxRetries(value) {
    let parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < 1) parsed = 5;
    globalState.maxRetries = parsed;
    localStorage.setItem('gemini_manga_max_retries', parsed);
}
window.updateMaxRetries = updateMaxRetries;

function getTranslationGuidancePrompt() {
    const guidanceParts = [];
    const customContextPrompt = globalState.translationContextPrompt.trim();
    const currentModelId = globalState.selectedModel || DEFAULT_MODEL;

    // 1. Source Language Rule
    const srcLang = globalState.sourceLanguage || 'ja';
    if (srcLang === 'ja') {
        guidanceParts.push('- SOURCE LANGUAGE: Japanese Manga. Pay special attention to vertical writing, reading order (right-to-left), Japanese honorifics (-san, -kun, -chan, -sama), and SFX sound effects.');
    } else if (srcLang === 'zh') {
        guidanceParts.push('- SOURCE LANGUAGE: Chinese Manhua. Translate idiom phrases (thành ngữ) naturally into Vietnamese, keep cultivation/wuxia/fantasy terms consistent.');
    } else if (srcLang === 'ko') {
        guidanceParts.push('- SOURCE LANGUAGE: Korean Manhwa. Handle Korean webtoon speech levels (jondaetmal/banmal) and sound effects smoothly in natural Vietnamese.');
    } else if (srcLang === 'en') {
        guidanceParts.push('- SOURCE LANGUAGE: English Comic/Scanlation. Translate natural conversational English into idiomatic Vietnamese, preserve comic jokes and slang.');
    } else if (srcLang === 'auto') {
        guidanceParts.push('- SOURCE LANGUAGE: Auto-detect source language from image text.');
    }

    // 2. Character Pronoun & Relationship Matrix Rule
    const matrix = globalState.pronounMatrix.trim();
    if (matrix) {
        guidanceParts.push(`- CHARACTER PRONOUN MATRIX (STRICT): Follow these exact pronoun pairs for speaker relationships: ${matrix}. Do not change pronouns between these characters.`);
    }

    const genrePresets = globalState.translationGenrePresets.length ? globalState.translationGenrePresets : ['quality'];
    genrePresets.forEach((presetKey) => {
        const presetPrompt = TRANSLATION_GENRE_PRESETS[presetKey] || '';
        if (presetPrompt) {
            guidanceParts.push(presetPrompt);
        }
    });

    if (genrePresets.length > 1) {
        guidanceParts.push(`- GENRE COMBINATION RULE: When multiple genre presets are selected, merge them naturally. Keep the strongest shared tone and do not make the translation overly long or conflicted.`);
    }
    if (customContextPrompt) {
        guidanceParts.push(`- USER CONTEXT / TRANSLATION GUIDANCE: ${customContextPrompt}`);
    }

    guidanceParts.push(
        '- TRANSLATION RULES: Keep Vietnamese natural and idiomatic. Prefer meaning over literal wording. Preserve character voice, emotions, jokes, pacing, and subtext.',
        '- DIALOGUE RULE: Choose Vietnamese xưng hô from the relationship and scene, not from the surface grammar. Keep xưng hô consistent across the page unless the relationship or mood changes.',
        '- CONTEXT RULE: Use neighboring bubbles to infer who is speaking, who is being addressed, and whether the line is polite, teasing, angry, shy, or formal.',
        '- BUBBLE RULE: If a box is uncertain, prefer the full bubble region over the exact glyph bounds so the text can be placed cleanly later.',
        '- CONSISTENCY RULE: Reuse the same Vietnamese translation for repeated names, terms, attacks, titles, and catchphrases within the same page or scene.',
        '- STYLE RULE: Keep manga-friendly phrasing short and punchy. Do not overexplain. Preserve punctuation-driven emotion and broken-line rhythm.',
        '- SAFETY RULE: If a pronoun is ambiguous, choose the most neutral natural Vietnamese option that preserves the scene and stays consistent.'
    );

    if (currentModelId === 'gemini-3.1-flash-lite') {
        guidanceParts.push(
            '- 3.1 FLASH-LITE ADDITION: You must read the dialogues of the previous page if provided. Use the exact same pronouns (xưng hô) and tone for the characters to keep the story consistent.',
            '- 3.1 FLASH-LITE ADDITION: Keep translations compact, natural, and character-faithful. Do not force literary Vietnamese.',
            '- 3.1 FLASH-LITE ADDITION: Treat bubble fit as a placement helper, not a proof of exact glyph boundaries.'
        );
    }

    if (currentModelId.includes('pro')) {
        guidanceParts.push(
            '- PRO ADDITION: Preserve subtle honorific intent, indirect speech, implied hierarchy, and sarcasm. Use richer context when selecting xưng hô.',
            '- PRO ADDITION: Narration should be polished and readable; dialogue should sound like a native comic translation, not like literary prose.'
        );
    } else if (currentModelId.includes('flash-lite')) {
        guidanceParts.push(
            '- FLASH-LITE ADDITION: Be concise but do not flatten personality. Keep the shortest natural Vietnamese that still preserves tone and xưng hô.',
            '- FLASH-LITE ADDITION: Prefer stable, low-risk pronouns when the relationship is not explicit.'
        );
    } else if (currentModelId.includes('flash')) {
        guidanceParts.push(
            '- FLASH ADDITION: Keep translations compact and natural. Maintain a good balance between speed, context, and nuance.'
        );
    }

    getModelTranslationProfile(currentModelId).forEach((rule) => guidanceParts.push(rule));

    return guidanceParts.length > 0 ? `\n${guidanceParts.join('\n')}` : '';
}

function normalizeConsistencyKey(value) {
    return String(value ?? '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, '')
        .trim();
}

function runConsistencyCheck() {
    if (!globalState.pages.length) {
        if (elements.consistencyCheckSummary) {
            elements.consistencyCheckSummary.textContent = 'Chưa có trang nào để kiểm tra.';
        }
        if (elements.consistencyCheckResults) {
            elements.consistencyCheckResults.innerHTML = '';
        }
        showToast('Chưa có dữ liệu để kiểm tra nhất quán.', 'warn');
        return;
    }

    const repeatedOriginalMap = new Map();
    const translatedBlocks = [];

    globalState.pages.forEach((page, pageIndex) => {
        (page.blocks || []).forEach((block) => {
            const original = String(block.original || '').trim();
            const translated = String(block.translated || '').trim();

            if (!translated) return;

            translatedBlocks.push({
                pageIndex,
                pageName: page.name,
                blockId: block.id,
                original,
                translated
            });

            const originalKey = normalizeConsistencyKey(original);
            if (!originalKey) return;

            if (!repeatedOriginalMap.has(originalKey)) {
                repeatedOriginalMap.set(originalKey, []);
            }
            repeatedOriginalMap.get(originalKey).push({
                pageIndex,
                pageName: page.name,
                blockId: block.id,
                original,
                translated
            });
        });
    });

    const findings = [];

    repeatedOriginalMap.forEach((entries) => {
        const uniqueTranslations = new Map();
        entries.forEach((entry) => {
            const translationKey = normalizeConsistencyKey(entry.translated);
            if (translationKey && !uniqueTranslations.has(translationKey)) {
                uniqueTranslations.set(translationKey, entry.translated);
            }
        });

        if (uniqueTranslations.size > 1) {
            findings.push({
                type: 'repeated-original',
                original: entries[0].original,
                variants: Array.from(uniqueTranslations.values()),
                samples: entries.slice(0, 4)
            });
        }
    });

    const glossaryTerms = globalState.glossaryNames
        .split(',')
        .map(term => term.trim())
        .filter(Boolean);
    const normalizedTranslatedValues = translatedBlocks.map((entry) => normalizeConsistencyKey(entry.translated));

    glossaryTerms.forEach((term) => {
        const termKey = normalizeConsistencyKey(term);
        if (!termKey) return;

        const exactCount = normalizedTranslatedValues.filter((translatedValue) => translatedValue.includes(termKey)).length;
        if (exactCount === 0) {
            findings.push({
                type: 'missing-term',
                term,
                message: `Thuật ngữ/tên "${term}" không xuất hiện trong các bản dịch hiện tại.`
            });
        }
    });

    if (elements.consistencyCheckSummary) {
        elements.consistencyCheckSummary.textContent = findings.length
            ? `Phát hiện ${findings.length} vấn đề cần xem lại.`
            : 'Không phát hiện xung đột rõ ràng trong dữ liệu hiện có.';
    }

    if (elements.consistencyCheckResults) {
        elements.consistencyCheckResults.textContent = '';
        if (!findings.length) {
            const okBox = document.createElement('div');
            okBox.className = 'rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-300';
            okBox.textContent = 'Các bản dịch lặp lại đang khá nhất quán theo dữ liệu hiện có.';
            elements.consistencyCheckResults.appendChild(okBox);
        } else {
            findings.forEach((finding) => {
                if (finding.type === 'repeated-original') {
                    const card = document.createElement('div');
                    card.className = 'rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 space-y-2';

                    const title = document.createElement('div');
                    title.className = 'text-[11px] font-semibold text-amber-300';
                    title.textContent = 'Cụm gốc lặp lại nhưng có nhiều bản dịch khác nhau';
                    card.appendChild(title);

                    const original = document.createElement('div');
                    original.className = 'text-[10px] text-slate-400';
                    original.textContent = finding.original;
                    card.appendChild(original);

                    const variants = document.createElement('div');
                    variants.className = 'space-y-1 text-[10px] text-slate-300';
                    finding.variants.forEach((variant) => {
                        const variantBox = document.createElement('div');
                        variantBox.className = 'rounded bg-slate-950/70 border border-slate-800 px-2 py-1';
                        variantBox.textContent = variant;
                        variants.appendChild(variantBox);
                    });
                    card.appendChild(variants);

                    const sampleText = document.createElement('div');
                    sampleText.className = 'text-[10px] text-slate-500';
                    sampleText.textContent = `Ví dụ trang: ${finding.samples.map((sample) => `${sample.pageName} (${sample.blockId})`).join(', ')}`;
                    card.appendChild(sampleText);

                    elements.consistencyCheckResults.appendChild(card);
                    return;
                }

                const card = document.createElement('div');
                card.className = 'rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2 space-y-1';

                const title = document.createElement('div');
                title.className = 'text-[11px] font-semibold text-sky-300';
                title.textContent = 'Thiếu thuật ngữ cần theo dõi';
                card.appendChild(title);

                const body = document.createElement('div');
                body.className = 'text-[10px] text-slate-300';
                body.textContent = finding.message;
                card.appendChild(body);

                elements.consistencyCheckResults.appendChild(card);
            });
        }
    }

    showToast(findings.length ? `Đã kiểm tra nhất quán: phát hiện ${findings.length} vấn đề.` : 'Đã kiểm tra nhất quán: chưa thấy xung đột rõ ràng.', findings.length ? 'warn' : 'success');
}

function syncTextColorHex(hex) {
    if (/^#[0-9A-F]{6}$/i.test(hex)) {
        elements.styleTextColor.value = hex;
        elements.styleTextColorHex.value = hex.toUpperCase();
        syncActiveBlockStyle('textColor', hex);
    }
}

// Sync background color
function syncBgColorHex(hex) {
    if (/^#[0-9A-F]{6}$/i.test(hex)) {
        elements.styleBgColor.value = hex;
        elements.styleBgColorHex.value = hex.toUpperCase();
        syncActiveBlockStyle('bgColor', hex);
    }
}

// Sync stroke color (Viền chữ)
function syncStrokeColorHex(hex) {
    if (/^#[0-9A-F]{6}$/i.test(hex)) {
        if (elements.styleStrokeColor) elements.styleStrokeColor.value = hex;
        if (elements.styleStrokeColorHex) elements.styleStrokeColorHex.value = hex.toUpperCase();
        syncActiveBlockStyle('strokeColor', hex);
    }
}
window.syncStrokeColorHex = syncStrokeColorHex;

// Sync shadow color (Bóng đổ)
function syncShadowColorHex(hex) {
    if (/^#[0-9A-F]{6}$/i.test(hex)) {
        if (elements.styleShadowColor) elements.styleShadowColor.value = hex;
        if (elements.styleShadowColorHex) elements.styleShadowColorHex.value = hex.toUpperCase();
        syncActiveBlockStyle('shadowColor', hex);
    }
}
window.syncShadowColorHex = syncShadowColorHex;

// Tạo ảnh thu nhỏ (thumbnail) kích thước nhỏ
async function createThumbnail(file, maxDim = 120) {
    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            if (width > maxDim || height > maxDim) {
                if (width > height) {
                    height *= maxDim / width;
                    width = maxDim;
                } else {
                    width *= maxDim / height;
                    height = maxDim;
                }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/jpeg', 0.7);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(null);
        };
        img.src = url;
    });
}

// Hàm kích hoạt tài nguyên ảnh gốc của trang
function activatePage(page) {
    if (!page) return;
    if (!page.src && page.originalFile) {
        page.src = URL.createObjectURL(page.originalFile);
    }
    if (!page.apiSrc && page.file) {
        page.apiSrc = URL.createObjectURL(page.file);
    }
}

// Hàm giải phóng tài nguyên ảnh gốc & cache của trang
function deactivatePage(page) {
    if (!page) return;
    if (page.src) {
        URL.revokeObjectURL(page.src);
        page.src = null;
    }
    if (page.apiSrc) {
        URL.revokeObjectURL(page.apiSrc);
        page.apiSrc = null;
    }
    page.imageDataCache = null;
    if (page.blocks) {
        page.blocks.forEach(b => {
            b.maskCache = null;
        });
    }
}

// Dọn dẹp rác bộ nhớ của tất cả các trang không hoạt động
function garbageCollectPageCaches() {
    const activePage = globalState.pages[globalState.activePageIndex];
    const previewPage = (elements.previewModal && !elements.previewModal.classList.contains('hidden'))
        ? globalState.pages[previewCurrentPage]
        : null;

    globalState.pages.forEach((p) => {
        if (p !== activePage && p !== previewPage) {
            deactivatePage(p);
        }
    });
}

// Tự động sinh thumbnail và lưu vào DB cho các trang cũ (Legacy DB)
async function generateAndSaveThumbnailForPage(page) {
    if (page.thumbnailBlob) return;
    try {
        const fileToUse = page.file || page.originalFile;
        if (!fileToUse) return;
        const thumbBlob = await createThumbnail(fileToUse, 120);
        if (thumbBlob) {
            page.thumbnailBlob = thumbBlob;
            if (page.thumbnailSrc && page.thumbnailSrc.startsWith('blob:')) {
                URL.revokeObjectURL(page.thumbnailSrc);
            }
            page.thumbnailSrc = URL.createObjectURL(thumbBlob);
            await savePageToDB(page);
            updatePageThumbnailInUI(page);
        }
    } catch (err) {
        console.error("Lỗi tạo ảnh nhỏ (thumbnail) cho trang:", page.id, err);
    }
}

// Cập nhật thumbnail trong giao diện danh sách trang
function updatePageThumbnailInUI(page) {
    const img = document.getElementById(`thumb-${page.id}`);
    if (img) {
        img.src = page.thumbnailSrc;
    }
}

// Tự động nén và co dãn hình ảnh (Image Compressor & Downscaler) để tránh quá tải bộ nhớ
async function compressAndResizeImage(img, originalName) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Giới hạn độ phân giải tối đa (1600px là tỷ lệ vàng giữ nguyên 99.9% độ nét và chữ sfx nhỏ nhất)
    const MAX_WIDTH = 1600;
    const MAX_HEIGHT = 1600;
    let width = img.width;
    let height = img.height;

    if (width > MAX_WIDTH || height > MAX_HEIGHT) {
        if (width > height) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
        } else {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
        }
    }

    canvas.width = width;
    canvas.height = height;

    // Vẽ lại ảnh lên canvas
    ctx.drawImage(img, 0, 0, width, height);

    // Xuất ra Blob JPEG để giảm tiêu thụ RAM (tránh base64 trung gian)
    const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((resultBlob) => {
            if (resultBlob) {
                resolve(resultBlob);
            } else {
                reject(new Error('Không thể nén ảnh sang Blob.'));
            }
        }, 'image/jpeg', 0.85);
    });

    const optimizedFile = new File([blob], originalName, { type: blob.type || 'image/jpeg' });
    const optimizedPreviewUrl = URL.createObjectURL(optimizedFile);

    return {
        src: optimizedPreviewUrl,
        file: optimizedFile,
        width: width,
        height: height
    };
}

// Handle images selection & upload (đã tích hợp tự động nén thông minh chống crash RAM)
function handleUploadedFiles(filesList) {
    const incomingFiles = Array.from(filesList);
    const imageFiles = incomingFiles.filter(file => file.type.startsWith('image/'));
    const skippedCount = incomingFiles.length - imageFiles.length;

    if (imageFiles.length === 0) {
        showToast("Vui lòng chọn ít nhất một tệp hình ảnh hợp lệ.", "warn");
        return;
    }

    if (skippedCount > 0) {
        showToast(`Đã bỏ qua ${skippedCount} tệp không phải hình ảnh.`, "warn");
    }

    const addedCount = imageFiles.length;
    const firstNewPageIndex = globalState.pages.length;
    let loaded = 0;
    let successCount = 0;

    const finishOne = () => {
        loaded++;
        if (loaded === addedCount) {
            updatePageListUI();
            if (successCount > 0) {
                showToast(`Đã tải và nén tối ưu thành công ${successCount} trang truyện!`, 'success');

                // Auto select the first newly added page if nothing is currently active
                if (globalState.activePageIndex === -1) {
                    selectPage(firstNewPageIndex);
                }

                // Save meta since page order or selection changed
                const pageIds = globalState.pages.map(p => p.id);
                saveProjectMeta(pageIds, globalState.activePageIndex);
            } else {
                showToast("Không có hình ảnh nào được tải thành công.", "error");
            }
        }
    };

    for (let i = 0; i < addedCount; i++) {
        const file = imageFiles[i];
        const originalUrl = URL.createObjectURL(file);

        const img = new Image();
        img.onload = async function () {
            // Tự động tối ưu hóa dung lượng ảnh trước khi nạp vào RAM bộ nhớ lưu trữ
            let optimized = null;
            try {
                optimized = await compressAndResizeImage(img, file.name);
            } catch (error) {
                showToast(`Không thể nén ảnh ${file.name}: ${error.message}`, 'error');
                URL.revokeObjectURL(originalUrl);
                finishOne();
                return;
            }

            // Tạo thumbnailBlob và thumbnailSrc
            let thumbnailBlob = null;
            let thumbnailSrc = null;
            try {
                thumbnailBlob = await createThumbnail(file, 120);
                if (thumbnailBlob) {
                    thumbnailSrc = URL.createObjectURL(thumbnailBlob);
                }
            } catch (err) {
                console.error("Không thể tạo thumbnail cho ảnh:", file.name, err);
            }

            // Giải phóng ngay lập tức các blob URL ảnh phân giải cao tạm thời để tránh giữ RAM
            URL.revokeObjectURL(originalUrl);
            if (optimized.src) {
                URL.revokeObjectURL(optimized.src);
            }

            const newPage = {
                id: `page_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                file: optimized.file, // Optimized copy for AI/OCR requests
                originalFile: file,
                thumbnailBlob: thumbnailBlob,
                thumbnailSrc: thumbnailSrc || URL.createObjectURL(optimized.file), // Dự phòng nếu lỗi tạo thumbnail
                name: file.name,
                src: null, // Sẽ được kích hoạt động khi active
                apiSrc: null,
                width: img.width,
                height: img.height,
                apiWidth: optimized.width,
                apiHeight: optimized.height,
                status: 'draft', // 'draft' | 'queued' | 'processing' | 'done' | 'error'
                blocks: [] // array of translated text blocks
            };

            globalState.pages.push(newPage);
            savePageToDB(newPage);

            successCount++;
            finishOne();
        };
        img.onerror = function () {
            showToast(`Không thể giải mã cấu trúc ảnh: ${file.name}`, 'error');
            URL.revokeObjectURL(originalUrl);
            finishOne();
        };
        img.src = originalUrl;
    }
}

// Sắp xếp danh sách trang theo tên tệp một cách tự nhiên (1, 2, ..., 10, 18, ...)
function sortPagesByName() {
    if (globalState.pages.length === 0) return;

    // Lưu trữ đối tượng trang đang hiển thị để khôi phục chỉ số (index) chính xác
    const activePageId = globalState.activePageIndex !== -1 ? globalState.pages[globalState.activePageIndex].id : null;

    // Thuật toán đối chiếu tự nhiên (Natural numeric sort)
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    globalState.pages.sort((a, b) => collator.compare(a.name, b.name));

    // Xác định lại chỉ số trang active sau khi sắp xếp lại mảng
    if (activePageId !== null) {
        globalState.activePageIndex = globalState.pages.findIndex(p => p.id === activePageId);
    }

    updatePageListUI();
    saveProjectMeta(globalState.pages.map(p => p.id), globalState.activePageIndex);
    showToast("Đã sắp xếp danh sách trang theo số tự nhiên!", "success");
}

// Update UI of the page manager queue on the sidebar
function updatePageListUI() {
    if (globalState.pages.length === 0) {
        elements.pagesEmptyState.classList.remove('hidden');
        elements.pagesList.classList.add('hidden');
        elements.pageCountBadge.innerText = '0';
        elements.btnBatchTranslate.disabled = true;
        elements.btnBatchExport.disabled = true;
        if (elements.btnExportPdf) elements.btnExportPdf.disabled = true;
        if (elements.btnExportProject) elements.btnExportProject.disabled = true;
        if (elements.btnExportScript) elements.btnExportScript.disabled = true;
        if (elements.btnImportScript) elements.btnImportScript.disabled = true;
        if (elements.btnPreviewMode) elements.btnPreviewMode.disabled = true;
        return;
    }

    elements.pagesEmptyState.classList.add('hidden');
    elements.pagesList.classList.remove('hidden');
    elements.pageCountBadge.innerText = globalState.pages.length;
    elements.btnBatchTranslate.disabled = false;
    elements.btnBatchExport.disabled = false;
    if (elements.btnExportPdf) elements.btnExportPdf.disabled = false;
    if (elements.btnExportProject) elements.btnExportProject.disabled = false;
    if (elements.btnExportScript) elements.btnExportScript.disabled = false;
    if (elements.btnImportScript) elements.btnImportScript.disabled = false;
    if (elements.btnPreviewMode) elements.btnPreviewMode.disabled = false;

    elements.pagesList.innerHTML = '';
    globalState.pages.forEach((page, index) => {
        const isActive = index === globalState.activePageIndex;
        const safePageName = escapeHTML(page.name);

        // Get badge class representing process status
        let statusBadge = '';
        if (page.status === 'draft') {
            statusBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-800 text-slate-400">Bản nháp</span>`;
        } else if (page.status === 'queued') {
            statusBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-950 text-indigo-300 animate-pulse">Chờ dịch...</span>`;
        } else if (page.status === 'processing') {
            statusBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-950 text-amber-300 flex items-center gap-1"><i class="fa-solid fa-circle-notch animate-spin text-[8px]"></i> Đang dịch</span>`;
        } else if (page.status === 'done') {
            statusBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-950 text-emerald-300 flex items-center gap-0.5"><i class="fa-solid fa-check text-[8px]"></i> Hoàn thành</span>`;
        } else if (page.status === 'error') {
            statusBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-950 text-red-300">Lỗi</span>`;
        }

        const pageItem = document.createElement('div');
        pageItem.className = `group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all ${isActive ? 'bg-indigo-600/20 border border-indigo-500/50' : 'bg-slate-950 hover:bg-slate-900 border border-transparent'
            }`;
        pageItem.dataset.pageIndex = String(index);

        pageItem.innerHTML = `
            <div class="flex items-center space-x-2.5 min-w-0 flex-1">
                <div class="relative w-10 h-12 bg-slate-900 rounded overflow-hidden shrink-0 border border-slate-800">
                    <img id="thumb-${page.id}" src="${page.thumbnailSrc || ''}" class="w-full h-full object-cover select-none">
                    <div class="absolute bottom-0 inset-x-0 bg-slate-950/80 text-[8px] text-center text-slate-400 font-mono py-0.5">${index + 1}</div>
                </div>
                <div class="min-w-0 flex-1">
                    <p class="text-xs font-semibold text-slate-200 truncate pr-2" title="${safePageName}">${safePageName}</p>
                    <div class="flex items-center space-x-1.5 mt-1.5">${statusBadge}</div>
                </div>
            </div>
            <div class="flex items-center space-x-1 shrink-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                <button data-action="translate-page" data-index="${index}" title="Dịch trang này" class="w-6 h-6 rounded bg-slate-900 hover:bg-indigo-600 border border-slate-800 hover:border-indigo-500 text-slate-400 hover:text-white flex items-center justify-center transition-all">
                    <i class="fa-solid fa-wand-magic-sparkles text-[10px]"></i>
                </button>
                <button data-action="remove-page" data-index="${index}" title="Xóa" class="w-6 h-6 rounded bg-slate-900 hover:bg-red-600 border border-slate-800 hover:border-red-500 text-slate-400 hover:text-white flex items-center justify-center transition-all">
                    <i class="fa-solid fa-trash-can text-[10px]"></i>
                </button>
            </div>
        `;
        elements.pagesList.appendChild(pageItem);
    });
}

// Set the current focused active page
function selectPage(index) {
    if (index < 0 || index >= globalState.pages.length) return;

    globalState.activePageIndex = index;
    globalState.selectedBlockId = null;

    saveProjectMeta(globalState.pages.map(p => p.id), globalState.activePageIndex);

    // Đảm bảo trang được chọn được kích hoạt tài nguyên ảnh gốc
    const page = globalState.pages[index];
    activatePage(page);

    // Giải phóng tài nguyên các trang không hoạt động khác
    garbageCollectPageCaches();

    updatePageListUI();

    // Toggle active components state
    elements.workspaceEmptyState.classList.add('hidden');
    elements.btnActiveTranslate.disabled = false;
    elements.btnExportPage.disabled = false;
    elements.btnEraserMode.disabled = false;

    if (globalState.viewMode === 'split') {
        updateSplitView();
    } else {
        elements.workspaceSplitWrapper.classList.add('hidden');
        elements.mangaCanvasContainer.classList.remove('hidden');

        // Set page source và reset cờ trạng thái tải để tránh race condition
        elements.mangaBgImage.dataset.loadedSrc = "";
        elements.mangaBgImage.src = page.src;

        // Trigger dynamic coordinates overlays
        if (elements.mangaBgImage.complete && elements.mangaBgImage.naturalWidth > 0) {
            elements.mangaBgImage.dataset.loadedSrc = page.src;
            restorePageEraserDrawing(page);
            requestOverlayRender();
        } else {
            elements.mangaBgImage.onload = () => {
                elements.mangaBgImage.dataset.loadedSrc = page.src;
                restorePageEraserDrawing(page);
                requestOverlayRender();
            };
        }
    }

    updateActiveBlockEditor();
}

// Remove a page from local state
function removePage(index) {
    pushStateToHistory();
    const removedPage = globalState.pages[index];
    if (removedPage?.apiSrc?.startsWith('blob:')) {
        URL.revokeObjectURL(removedPage.apiSrc);
    }
    if (removedPage?.src?.startsWith('blob:')) {
        URL.revokeObjectURL(removedPage.src);
    }
    if (removedPage?.thumbnailSrc?.startsWith('blob:')) {
        URL.revokeObjectURL(removedPage.thumbnailSrc);
    }

    // Xoá khỏi database
    if (removedPage) {
        deletePageFromDB(removedPage.id);
    }

    globalState.pages.splice(index, 1);
    if (globalState.activePageIndex === index) {
        globalState.activePageIndex = -1;
        globalState.selectedBlockId = null;
        elements.mangaCanvasContainer.classList.add('hidden');
        elements.workspaceSplitWrapper.classList.add('hidden');
        elements.workspaceEmptyState.classList.remove('hidden');
        elements.btnActiveTranslate.disabled = true;
        elements.btnExportPage.disabled = true;
        elements.btnEraserMode.disabled = true;
    } else if (globalState.activePageIndex > index) {
        globalState.activePageIndex--;
    }

    // Lưu lại project meta mới
    saveProjectMeta(globalState.pages.map(p => p.id), globalState.activePageIndex);

    // Kích hoạt trang active mới nếu có
    if (globalState.activePageIndex !== -1) {
        activatePage(globalState.pages[globalState.activePageIndex]);
    }
    garbageCollectPageCaches();

    updatePageListUI();
    showToast('Đã xóa trang truyện', 'info');
}

function setViewMode(mode) {
    globalState.viewMode = mode;

    // Adjust buttons active styling
    const modes = ['overlay', 'split', 'original'];
    modes.forEach(m => {
        const btn = document.getElementById(`view-mode-${m}`);
        if (m === mode) {
            btn.className = "px-3 py-1 text-xs font-semibold rounded bg-indigo-600 text-white transition-all flex items-center gap-1";
        } else {
            btn.className = "px-3 py-1 text-xs font-semibold rounded text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1";
        }
    });

    if (globalState.activePageIndex === -1) return;

    if (mode === 'split') {
        elements.mangaCanvasContainer.classList.add('hidden');
        updateSplitView();
    } else {
        elements.workspaceSplitWrapper.classList.add('hidden');
        elements.mangaCanvasContainer.classList.remove('hidden');
        requestOverlayRender();
    }
}

function updateSplitView() {
    if (globalState.activePageIndex === -1) return;
    const page = globalState.pages[globalState.activePageIndex];

    elements.workspaceSplitWrapper.classList.remove('hidden');
    elements.splitOriginalImg.src = page.src;

    // Check if mirror image already exists to avoid recreating it
    let mirrorImg = document.getElementById('split-editor-img-clone');
    let overlaysDiv = document.getElementById('split-overlays-clone');
    let mirrorContainer = document.getElementById('split-editor-container-clone');

    if (!mirrorContainer || !mirrorImg || !overlaysDiv) {
        elements.splitEditorAnchor.innerHTML = '';

        mirrorContainer = document.createElement('div');
        mirrorContainer.className = "manga-container";
        mirrorContainer.id = "split-editor-container-clone";
        mirrorContainer.style.position = 'relative';
        mirrorContainer.style.display = 'inline-block';
        mirrorContainer.style.height = '100%';

        mirrorImg = document.createElement('img');
        mirrorImg.id = "split-editor-img-clone";
        mirrorImg.src = page.src;
        mirrorImg.className = "block h-full w-auto max-w-none border border-slate-800 rounded shadow-2xl select-none";
        mirrorImg.style.pointerEvents = 'none';

        overlaysDiv = document.createElement('div');
        overlaysDiv.id = "split-overlays-clone";
        overlaysDiv.className = "absolute inset-0 select-none overflow-hidden rounded z-20";

        mirrorContainer.appendChild(mirrorImg);
        mirrorContainer.appendChild(overlaysDiv);
        elements.splitEditorAnchor.appendChild(mirrorContainer);
    } else {
        if (mirrorImg.src !== page.src) {
            mirrorImg.src = page.src;
        }
    }

    // Populate the mirroring container with overlays
    renderOverlays(overlaysDiv);
}

// Zoom controller functionality
function changeZoom(amount) {
    globalState.zoom = Math.max(25, Math.min(250, globalState.zoom + amount));
    elements.zoomIndicator.innerText = `${globalState.zoom}%`;
    elements.mangaCanvasContainer.style.height = `${globalState.zoom}%`;
    elements.mangaCanvasContainer.style.width = 'auto';
    elements.workspaceSplitWrapper.style.transform = `scale(${globalState.zoom / 100})`;
    elements.workspaceSplitWrapper.style.transformOrigin = 'top center';
}

function resetZoom() {
    globalState.zoom = 100;
    elements.zoomIndicator.innerText = `100%`;
    elements.mangaCanvasContainer.style.height = `100%`;
    elements.mangaCanvasContainer.style.width = 'auto';
    elements.workspaceSplitWrapper.style.transform = `none`;
}

async function translateActivePage() {
    if (globalState.activePageIndex === -1) {
        showToast("Vui lòng chọn một trang trước khi dịch.", "warn");
        return;
    }

    await translatePage(globalState.activePageIndex, false);
}

async function translateSinglePageInBatch(index) {
    if (isBatchTranslating) {
        showToast("Tiến trình dịch hàng loạt đang chạy. Vui lòng dừng hoặc chờ hoàn tất trước.", "warn");
        return;
    }

    await translatePage(index, false);
}

async function runBatchTranslation() {
    if (globalState.pages.length === 0) return;
    if (!getGeminiApiKey()) {
        showToast("Vui lòng nhập Gemini API Key trước khi dịch.", "error");
        elements.apiKeyInput.focus();
        return;
    }

    if (isBatchTranslating) {
        showToast("Tiến trình dịch thuật đang chạy ngầm!", "warn");
        return;
    }

    cancelTranslationFlag = false;
    isBatchTranslating = true;
    showToast('Đang tiến hành dịch hàng loạt dưới nền. Bạn có thể tiếp tục chỉnh sửa các trang khác!', 'success');

    for (let i = 0; i < globalState.pages.length; i++) {
        if (globalState.pages[i].status === 'draft' || globalState.pages[i].status === 'error') {
            globalState.pages[i].status = 'queued';
            savePageToDB(globalState.pages[i]);
        }
    }
    updatePageListUI();

    const totalPages = globalState.pages.length;

    for (let i = 0; i < totalPages; i++) {
        if (cancelTranslationFlag) {
            showToast("Đã dừng hàng loạt tiến trình dịch ngầm.", "warn");
            break;
        }

        const page = globalState.pages[i];
        if (page.status !== 'queued') continue;

        try {
            // Chủ động giãn cách luồng gọi API tránh lỗi 429
            const delaySteps = (globalState.apiDelay !== undefined ? globalState.apiDelay : 8) * 10;
            if (i > 0 && delaySteps > 0) {
                let delayProgress = 0;
                for (let delay = 0; delay < delaySteps; delay++) {
                    if (cancelTranslationFlag) break;
                    delayProgress = Math.round((delay / delaySteps) * 100);
                    updateBackgroundTaskOverlay(
                        true,
                        "Đang chờ giãn cách API...",
                        `Trang ${i + 1}/${totalPages}: Tạm nghỉ bảo vệ API Key tránh quá tải... (Còn ${Math.ceil((delaySteps - delay) / 10)} giây)`,
                        delayProgress
                    );
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            if (cancelTranslationFlag) {
                showToast("Đã dừng hàng loạt tiến trình dịch ngầm.", "warn");
                break;
            }

            const progressPercent = Math.round((i / totalPages) * 100);
            updateBackgroundTaskOverlay(true, "Đang xử lý...", `Đang chuẩn bị gửi trang ${i + 1}/${totalPages}...`, progressPercent);

            const success = await translatePage(i, true); // Chế độ background
            if (!success) {
                // Nếu trang trước đó bị lỗi, tạm dừng 15 giây trước khi tiếp tục trang tiếp theo
                // để tránh dồn dập API gây lỗi dây chuyền cho các trang sau
                let errorDelayProgress = 0;
                const cooldownSeconds = 15;
                for (let delay = 0; delay < cooldownSeconds * 10; delay++) {
                    if (cancelTranslationFlag) break;
                    errorDelayProgress = Math.round((delay / (cooldownSeconds * 10)) * 100);
                    updateBackgroundTaskOverlay(
                        true,
                        "Lỗi kết nối - Đang chờ khôi phục...",
                        `Tạm nghỉ bảo vệ API sau khi lỗi... (Chờ ${Math.ceil((cooldownSeconds * 10 - delay) / 10)} giây)`,
                        errorDelayProgress
                    );
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        } catch (e) {
            console.error("Background batch translation error on page:", i, e);
        }
    }

    // Đưa toàn bộ các trang vẫn đang xếp hàng chờ về bản nháp nếu người dùng bấm dừng dịch
    for (let i = 0; i < globalState.pages.length; i++) {
        if (globalState.pages[i].status === 'queued') {
            globalState.pages[i].status = 'draft';
            savePageToDB(globalState.pages[i]);
        }
    }

    isBatchTranslating = false;
    updatePageListUI();
    updateBackgroundTaskOverlay(false);
}

// Helper: convert File -> raw Base64, tránh tạo DataURL trung gian để giảm peak memory
async function getBase64(file) {
    try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const chunkSize = 0x8000;
        let binary = '';

        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode(...chunk);
        }

        return btoa(binary);
    } catch (error) {
        throw new Error(`Không thể đọc tệp hình ảnh. Chi tiết: ${error.message}`);
    }
}

// Tự động phân bổ lại xuống dòng của văn bản tiếng Việt theo cấu trúc hình Diamond (bầu dục) ôm khít speech bubble
function balanceTextToDiamond(text, boxW, boxH) {
    const words = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim().split(' ');
    if (words.length <= 3) return words.join(' ');

    const wordCount = words.length;
    let numLines = 3;

    if (boxW && boxH && boxH > 0) {
        const aspect = boxW / boxH; // > 1 là bong bóng rộng, < 1 là bong bóng cao
        if (aspect < 0.7) {
            numLines = Math.min(wordCount, Math.max(3, Math.ceil(wordCount / 2.5)));
        } else if (aspect > 1.4) {
            numLines = Math.max(2, Math.min(4, Math.floor(wordCount / 4)));
        } else {
            numLines = wordCount <= 5 ? 3 : wordCount <= 10 ? 3 : 4;
        }
    } else {
        if (wordCount <= 5) numLines = 3;
        else if (wordCount <= 10) numLines = 3;
        else if (wordCount <= 16) numLines = 4;
        else numLines = 5;
    }
    numLines = Math.max(2, Math.min(wordCount, numLines));

    // Tính toán tỷ lệ độ rộng khả dụng từng dòng theo đường cong elip: W(y) = sqrt(1 - 4y^2)
    let weights = [];
    for (let i = 0; i < numLines; i++) {
        const y = -0.5 + (i + 0.5) / numLines;
        const widthFactor = Math.sqrt(Math.max(0.08, 1 - 4 * y * y));
        weights.push(widthFactor);
    }
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    let lineCounts = weights.map(w => Math.max(1, Math.round((w / totalWeight) * wordCount)));
    let sum = lineCounts.reduce((a, b) => a + b, 0);

    while (sum < wordCount) {
        const mid = Math.floor(numLines / 2);
        lineCounts[mid]++;
        sum++;
    }
    while (sum > wordCount) {
        const maxIdx = lineCounts.indexOf(Math.max(...lineCounts));
        if (lineCounts[maxIdx] > 1) {
            lineCounts[maxIdx]--;
            sum--;
        } else {
            break;
        }
    }

    let resultLines = [];
    let wordIdx = 0;
    lineCounts.forEach(count => {
        const lineWords = words.slice(wordIdx, wordIdx + count);
        if (lineWords.length > 0) {
            resultLines.push(lineWords.join(' '));
        }
        wordIdx += count;
    });
    return resultLines.join('\n');
}

// Áp dụng định dạng dòng kim cương cho khối thoại đang chọn
function applyDiamondFormat() {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;
    const page = globalState.pages[globalState.activePageIndex];
    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);
    if (block) {
        const formatted = balanceTextToDiamond(block.translated, block.box ? block.box.w : null, block.box ? block.box.h : null);
        block.translated = formatted;
        elements.editTranslatedText.value = formatted;
        syncActiveBlockTranslation(formatted);
        requestOverlayRender();
        showToast("Đã định dạng dòng cân đối hình kim cương bầu dục thành công!", "success");
    }
}

async function translatePage(pageIndex, isBackgroundMode = false) {
    if (pageIndex < 0 || pageIndex >= globalState.pages.length) return false;
    const page = globalState.pages[pageIndex];

    // Đảm bảo trang được dịch có đầy đủ tài nguyên ảnh gốc hoạt động
    activatePage(page);

    // Check for API key (use global or custom)
    const keyToUse = getGeminiApiKey();
    if (!keyToUse) {
        showToast("Vui lòng nhập Gemini API Key trước khi dịch.", "error");
        elements.apiKeyInput.focus();
        return false;
    }

    const totalPages = globalState.pages.length;
    const progressVal = Math.round((pageIndex / totalPages) * 100);

    // Thiết lập trạng thái trang đang dịch
    page.status = 'processing';
    updatePageListUI();
    savePageToDB(page);

    const updateProgressMsg = (title, subtitle, percent) => {
        if (isBackgroundMode) {
            updateBackgroundTaskOverlay(true, title, subtitle, percent);
        } else {
            updateProcessingOverlay(true, title, subtitle, percent);
        }
    };

    updateProgressMsg(
        "Đang nhận diện & dịch...",
        `Trang ${pageIndex + 1}/${totalPages}: Đang đọc ảnh thô...`,
        isBackgroundMode ? progressVal : 20
    );

    let attempts = globalState.maxRetries !== undefined ? globalState.maxRetries : 5; // Thử lại tối đa maxRetries lần nếu gặp lỗi 429 hoặc 503
    let retryDelay = 10000; // Khởi đầu chờ 10 giây, tăng dần theo luỳ thừa

    while (attempts > 0) {
        if (cancelTranslationFlag) {
            page.status = 'draft';
            updatePageListUI();
            savePageToDB(page);
            return false;
        }

        let timeoutId;
// OCR Image Pre-processing (High Contrast & Sharpness Boost for better OCR accuracy)
async function enhanceImageForOcr(file) {
    if (!file || !globalState.ocrEnhanceEnabled) {
        return file;
    }
    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');

            ctx.drawImage(img, 0, 0);

            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imgData.data;

            const contrast = 1.20; // 20% contrast boost
            const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));

            for (let i = 0; i < data.length; i += 4) {
                const gray = (0.299 * data[i]) + (0.587 * data[i + 1]) + (0.114 * data[i + 2]);
                const enhanced = factor * (gray - 128) + 128;
                const clamped = Math.max(0, Math.min(255, enhanced));

                data[i] = clamped;
                data[i + 1] = clamped;
                data[i + 2] = clamped;
            }

            ctx.putImageData(imgData, 0, 0);

            canvas.toBlob((blob) => {
                if (blob) {
                    const enhancedFile = new File([blob], file.name, { type: 'image/jpeg' });
                    resolve(enhancedFile);
                } else {
                    resolve(file);
                }
            }, 'image/jpeg', 0.92);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(file);
        };
        img.src = url;
    });
}
window.enhanceImageForOcr = enhanceImageForOcr;

        try {
            // Read file as base64 (with optional high-contrast OCR enhancement)
            const fileForOcr = globalState.ocrEnhanceEnabled ? await enhanceImageForOcr(page.file) : page.file;
            const rawBase64 = await getBase64(fileForOcr);
            const mimeType = fileForOcr.type || page.file.type;

            const glossaryNames = globalState.preserveNames ? globalState.glossaryNames.trim() : "";
            const weakModel = isWeakTranslationModel(globalState.selectedModel);

            // Xây dựng ngữ cảnh dịch thuật dựa trên trang dịch liền kề trước đó
            let prevPageContext = "";
            if (pageIndex > 0) {
                const prevPage = globalState.pages[pageIndex - 1];
                if (prevPage && prevPage.blocks && prevPage.blocks.length > 0) {
                    const prevDialogues = prevPage.blocks
                        .filter(b => b.translated && b.translated.trim())
                        .map((b, idx) => `Bubble #${idx + 1} (${b.type || 'dialogue'}): "${b.original || ''}" -> "${b.translated}"`)
                        .join("\n");
                    if (prevDialogues) {
                        prevPageContext = `[PREVIOUS PAGE DIALOGUE HISTORY FOR CONSISTENCY]\n${prevDialogues}\n\nStrict Rule: Use the same character pronouns (xưng hô) and names as shown in the translation list above if the speakers are the same characters.`;
                    }
                }
            }

            let systemInstruction;
            if (weakModel) {
                systemInstruction = [
                    "You are a professional manga translator and OCR/text detector.",
                    "Detect ALL text regions on the manga page: speech bubbles (dialogue), narration boxes (narration), sound effect labels (sfx), and signboards/labels (other). Return valid JSON only.",
                    "For each block, estimate bounding box coordinates (x, y, w, h) using Google Gemini's native integer scale of 0 to 1000 (where x=0, y=0 is top-left and x=1000, y=1000 is bottom-right). Example: x=200, y=150, w=300, h=250.",
                    "For speech bubbles (dialogue) and narration boxes, use a box covering the entire inner blank space of the bubble so translated text fits easily. For SFX sound effects and signs, use the tightest box covering the characters.",
                    "IMPORTANT RULE FOR CONNECTED BUBBLES: When multiple speech bubbles are attached/connected together (such as double-bubbles, stacked connected lobes, or chained bubbles), treat EACH lobe/section as a SEPARATE block with its own bounding box. Do NOT merge connected or stacked bubble sections into a single large block.",
                    "Do not split lines of text inside the SAME single bubble lobe into separate blocks. Only split when bubbles are connected/chained across separate lobes or tails.",
                    "Set positionKnown=true whenever text is visible and can be localized.",
                    "Set positionKnown=false only when text location cannot be localized.",
                    "Translate text to short, conversational, and natural Vietnamese manga dialogue. Keep narrations smooth.",
                    "Classify block.type accurately: 'dialogue' for speech bubbles, 'narration' for caption boxes, 'sfx' for sound effects, 'other' for signs/labels.",
                    "Ensure pronouns (xưng hô) are highly consistent across nearby bubbles and match the previous page history.",
                    globalState.preserveNames ? "Keep proper names unchanged unless the glossary says otherwise." : "",
                    glossaryNames ? `Keep these names exactly as written: ${glossaryNames}.` : "",
                    getTranslationGuidancePrompt().trim()
                ].filter(Boolean).join(" ");
            } else {
                systemInstruction = [
                    "Detect every manga text bubble, narration box, SFX label, and sign/label area, then return JSON only.",
                    "For each block, estimate box coordinates (x, y, w, h) on an integer scale of 0 to 1000 (where x=0, y=0 is top-left, and x=1000, y=1000 is bottom-right).",
                    "For speech bubbles (dialogue) and narration boxes, use a box that covers the entire inner blank space of the bubble or box (leaving a small 2% padding near the black outlines) rather than just the tight bounds of the original characters. This ensures there is sufficient room for the translated text. For SFX and signs, use the tightest box covering the characters.",
                    "IMPORTANT RULE FOR CONNECTED BUBBLES: When multiple speech bubbles are attached or connected together in double-bubbles or stacked lobes, treat EACH individual bubble lobe/section as a SEPARATE block with its own box coordinates. Do NOT group text from connected/chained bubble lobes into a single bounding box.",
                    "Do not split text inside the SAME bubble lobe into separate blocks, but ALWAYS separate connected/stacked bubble lobes.",
                    "Do not center by default.",
                    "Set positionKnown=true whenever the text region is visible enough to place a box.",
                    "Set positionKnown=false only when the text location is truly unreadable or cannot be localized.",
                    "Translate to short, natural Vietnamese that matches the scene, speaker relationship, and block type.",
                    "Use block.type to guide style: dialogue should sound conversational, narration should be neutral and smooth, SFX should be short and expressive, labels/signs should be clear and concise.",
                    "Preserve the same Vietnamese xưng hô and terminology within the page whenever the relationship stays the same.",
                    "Keep line breaks and pacing natural for manga dialogue. Do not over-literalize Japanese sentence order.",
                    globalState.preserveNames ? "Keep proper names unchanged unless the glossary says otherwise." : "",
                    glossaryNames ? `Keep these names exactly as written: ${glossaryNames}.` : "",
                    getTranslationGuidancePrompt().trim()
                ].filter(Boolean).join(" ");
            }

            const contentsParts = [
                { text: "Detect all speech bubbles, narration boxes, SFX sound effects, and signs/labels. Translate their contents into Vietnamese using the strict schema. Return only valid JSON that matches the schema." }
            ];
            if (prevPageContext) {
                contentsParts.push({ text: prevPageContext });
            }
            contentsParts.push({ inlineData: { mimeType: mimeType, data: rawBase64 } });

            // Cấu trúc payload chuẩn với thuộc tính required đặt chính xác bên trong responseSchema
            const payload = {
                contents: [{
                    parts: contentsParts
                }],
                generationConfig: {
                    responseMimeType: "application/json",
                    maxOutputTokens: 4096,
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            blocks: {
                                type: "ARRAY",
                                items: {
                                    type: "OBJECT",
                                    properties: {
                                        id: { type: "STRING" },
                                        type: { type: "STRING" },
                                        original: { type: "STRING" },
                                        translated: { type: "STRING" },
                                        box: {
                                            type: "OBJECT",
                                            properties: {
                                                x: { type: "NUMBER" },
                                                y: { type: "NUMBER" },
                                                w: { type: "NUMBER" },
                                                h: { type: "NUMBER" }
                                            },
                                            required: ["x", "y", "w", "h"]
                                        },
                                        positionKnown: {
                                            type: "BOOLEAN"
                                        },
                                        style: {
                                            type: "OBJECT",
                                            properties: {
                                                vertical: { type: "BOOLEAN" }
                                            }
                                        }
                                    },
                                    required: ["id", "type", "original", "translated", "box", "positionKnown"]
                                }
                            }
                        },
                        required: ["blocks"]
                    }
                },
                systemInstruction: {
                    parts: [{ text: systemInstruction }]
                }
            };

            updateProgressMsg(
                "Đang kết nối Gemini AI...",
                `Trang ${pageIndex + 1}/${totalPages}: Đang phân tích thoại bằng AI...`,
                isBackgroundMode ? progressVal : 50
            );

            // Sử dụng mô hình được cấu hình động để triệt tiêu hoàn toàn lỗi 404
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${globalState.selectedModel}:generateContent?key=${keyToUse}`;

            const controller = new AbortController();
            timeoutId = setTimeout(() => controller.abort(), 45000); // 45 giây timeout

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            // TỰ ĐỘNG XỬ LÝ RETRY CHO CÁC LỖI TẠM THỜI (429, 503, 500, 504)
            if (response.status === 429 || response.status === 503 || response.status === 500 || response.status === 504) {
                attempts--;
                if (attempts > 0) {
                    const errorTypeLabel = response.status === 429 ? "Quá tải giới hạn lượt gọi (429)" :
                        response.status === 503 ? "Server Google đang bận/quá tải (503)" :
                            `Lỗi hệ thống tạm thời (${response.status})`;

                    showToast(`API bận ở trang ${pageIndex + 1}: ${errorTypeLabel}. Tự động chờ ${retryDelay / 1000}s rồi thử lại...`, "warn");

                    // Đếm ngược thời gian chờ trực quan
                    for (let delay = 0; delay < (retryDelay / 100); delay++) {
                        if (cancelTranslationFlag) break;
                        const delayPercent = Math.round((delay / (retryDelay / 100)) * 100);
                        updateProgressMsg(
                            "Đang tự động kết nối lại...",
                            `Bị nghẽn (${response.status}). Đang dừng nghỉ ${retryDelay / 1000}s để gửi lại...`,
                            delayPercent
                        );
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }

                    retryDelay *= 2; // Tăng gấp đôi thời gian chờ cho lượt sau (Exponential Backoff)
                    continue; // Gửi lại yêu cầu trong vòng lặp while
                } else {
                    throw new Error(response.status === 503 ? "Máy chủ Google hiện đang quá tải cực nặng (Lỗi 503). Vui lòng thử lại sau vài phút." : `API tạm thời ngắt kết nối (Lỗi ${response.status}).`);
                }
            }

            if (!response.ok) {
                let errorDetail = "";
                try {
                    const errorJson = await response.json();
                    errorDetail = errorJson.error?.message || "";
                } catch (e) { }
                throw new Error(errorDetail ? `Lỗi API (${response.status}): ${errorDetail}` : `API Error: ${response.status} ${response.statusText || "Yêu cầu không hợp lệ"}`);
            }

            const result = await response.json();
            updateProgressMsg(
                "Đang dựng bản dịch...",
                `Trang ${pageIndex + 1}/${totalPages}: Đang tính toán tỷ lệ bong bóng thoại...`,
                isBackgroundMode ? progressVal : 85
            );

            const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!jsonText) throw new Error("Không nhận được dữ liệu phản hữu dụng từ AI.");

            const data = parseGeminiJsonText(jsonText);

            // Cache imageData theo trang để tránh decode và vẽ canvas lặp lại
            let pageImageData = page.imageDataCache || null;
            if (!pageImageData) {
                try {
                    const img = new Image();
                    img.src = page.src;
                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = reject;
                    });
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    pageImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    page.imageDataCache = pageImageData;
                } catch (e) {
                    console.error("Không thể lấy imageData của trang để chạy snapBoxToContours:", e);
                }
            }

            pushStateToHistory();

            // Construct internal blocks state (Sử dụng style tiêu chuẩn hệ thống cho tất cả các ô thoại)
            page.blocks = (data.blocks || []).map((b, idx) => {
                const normalisedBox = b.positionKnown === false
                    ? { ...DEFAULT_AI_BLOCK_BOX }
                    : refineAiBlockBox(b.box, pageImageData, globalState.selectedModel);

                return {
                    id: b.id || `block_${Date.now()}_${idx}`,
                    type: b.type || 'dialogue',
                    original: b.original || '',
                    translated: b.translated || '',
                    box: normalisedBox,
                    style: {
                        fontFamily: globalState.globalStyle.fontFamily,
                        fontSize: globalState.globalStyle.fontSize,
                        textColor: globalState.globalStyle.textColor,
                        bgColor: globalState.globalStyle.bgColor,
                        bgOpacity: globalState.globalStyle.bgOpacity,
                        padding: globalState.globalStyle.padding,
                        rotate: 0,
                        vertical: DEFAULT_VERTICAL_WRITING_MODE,
                        bold: globalState.globalStyle.bold,
                        align: globalState.globalStyle.align,
                        maskShape: globalState.globalStyle.maskShape,
                        maskSize: globalState.globalStyle.maskSize,
                        strokeColor: globalState.globalStyle.strokeColor || '#ffffff',
                        strokeWidth: globalState.globalStyle.strokeWidth || 0,
                        shadowColor: globalState.globalStyle.shadowColor || '#000000',
                        shadowBlur: globalState.globalStyle.shadowBlur || 0
                    }
                };
            });

            page.status = 'done';
            updatePageListUI();
            savePageToDB(page);

            if (globalState.activePageIndex === pageIndex) {
                globalState.selectedBlockId = null;
                requestOverlayRender();
                updateActiveBlockEditor();
            }

            showToast(`Đã dịch xong trang ${pageIndex + 1}!`, "success");
            return true; // Thành công thì thoát khỏi vòng lặp thử lại

        } catch (error) {
            if (timeoutId) clearTimeout(timeoutId);
            console.error("Lỗi chi tiết khi dịch trang:", error);

            const isTimeout = error.name === 'AbortError';
            const isNetworkError = error.message && (error.message.includes('Failed to fetch') || error.message.includes('network') || error.message.includes('NetworkError'));

            if (isTimeout || isNetworkError) {
                attempts--;
                if (attempts > 0) {
                    const errorLabel = isTimeout ? "Thời gian yêu cầu quá hạn (Timeout 45s)" : "Mất kết nối mạng";
                    showToast(`API bận ở trang ${pageIndex + 1}: ${errorLabel}. Tự động chờ ${retryDelay / 1000}s rồi thử lại...`, "warn");

                    // Đếm ngược thời gian chờ trực quan
                    for (let delay = 0; delay < (retryDelay / 100); delay++) {
                        if (cancelTranslationFlag) break;
                        const delayPercent = Math.round((delay / (retryDelay / 100)) * 100);
                        updateProgressMsg(
                            "Đang tự động kết nối lại...",
                            `${isTimeout ? "Quá hạn" : "Lỗi mạng"}. Đang dừng nghỉ ${retryDelay / 1000}s để gửi lại...`,
                            delayPercent
                        );
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                    retryDelay *= 2; // Tăng gấp đôi thời gian chờ cho lượt sau (Exponential Backoff)
                    continue; // Gửi lại yêu cầu trong vòng lặp while
                }
            }

            page.status = 'error';
            updatePageListUI();
            savePageToDB(page);

            // Cơ chế Unpacker xử lý lỗi an toàn không bao giờ in ra chuỗi rỗng hoặc "undefined"
            let errorMessage = "Đã xảy ra lỗi không xác định.";
            if (isTimeout) {
                errorMessage = "Kết nối API quá hạn (Timeout 45s). Vui lòng kiểm tra lại mạng hoặc chuyển đổi Model.";
            } else if (error instanceof Error) {
                errorMessage = error.message;
            } else if (typeof error === 'string') {
                errorMessage = error;
            } else if (error && typeof error === 'object') {
                errorMessage = error.message || error.statusText || JSON.stringify(error);
            }

            showToast(`Lỗi khi dịch trang ${pageIndex + 1}: ${errorMessage}`, "error");
            return false; // Gặp lỗi khác thì dừng thử lại
        } finally {
            if (!isBackgroundMode) {
                updateProcessingOverlay(false);
            }
            // Giải phóng tài nguyên trang dịch ngầm nếu không phải trang active
            if (isBackgroundMode && pageIndex !== globalState.activePageIndex) {
                deactivatePage(page);
            }
            garbageCollectPageCaches();
        }
    }
    return false;
}

// Thuật toán Flood Fill loang tìm bong bóng thoại và trả về Data URL mặt nạ nền (Có tích hợp lưu cache hiệu năng cao)
function computeBubbleMask(page, block, imageData) {
    if (!imageData) return null;

    // Khởi tạo key bộ nhớ tạm
    const cacheKey = getMaskCacheKey(page, block);
    if (block.maskCache && block.maskCache.key === cacheKey) {
        return block.maskCache.canvas;
    }

    const imgW = imageData.width;
    const imgH = imageData.height;
    const brightnessMap = getImageBrightnessMap(imageData);

    // Chuyển đổi tọa độ box (%) thành pixel thực tế
    let bx = Math.round((block.box.x / 100) * imgW);
    let by = Math.round((block.box.y / 100) * imgH);
    let bw = Math.round((block.box.w / 100) * imgW);
    let bh = Math.round((block.box.h / 100) * imgH);

    bx = Math.max(0, Math.min(imgW - 1, bx));
    by = Math.max(0, Math.min(imgH - 1, by));
    bw = Math.max(1, Math.min(imgW - bx, bw));
    bh = Math.max(1, Math.min(imgH - by, bh));

    const samples = collectBubbleSamples(imageData, bx, by, bw, bh, brightnessMap);
    if (!samples.length) {
        return null;
    }

    const sampleMedian = samples[Math.floor(samples.length / 2)].brightness;
    const sampleP75 = samples[Math.floor(samples.length * 0.75)].brightness;
    const sampleP90 = samples[Math.floor(samples.length * 0.9)].brightness;
    const threshold = Math.max(
        142,
        Math.min(236, Math.round((sampleMedian * 0.35) + (sampleP75 * 0.45) + (sampleP90 * 0.20) - 12))
    );
    const bridgeThreshold = Math.max(118, threshold - 28);
    const textBridgeMargin = Math.max(2, Math.round(Math.min(bw, bh) * 0.04));

    // Nếu vùng này quá tối (không phải bong bóng thoại), trả về null để fallback vẽ ellipse thường
    if (sampleP75 < 155) {
        return null;
    }

    const visited = new Uint8Array(bw * bh);
    const seed = pickBubbleSeed(samples, bx, by, bw, bh);
    if (!seed || seed.brightness < threshold) {
        return null;
    }

    const maxQueueSize = bw * bh;
    const queue = new Int32Array(maxQueueSize);
    let queueHead = 0;
    let queueTail = 0;

    const relSeedX = Math.max(0, Math.min(bw - 1, Math.round(seed.x - bx)));
    const relSeedY = Math.max(0, Math.min(bh - 1, Math.round(seed.y - by)));
    const seedIdx = relSeedY * bw + relSeedX;
    visited[seedIdx] = 1;
    queue[queueTail++] = (Math.round(seed.x) << 14) | (Math.round(seed.y) << 2) | 0;

    const dx = [0, 0, 1, -1];
    const dy = [1, -1, 0, 0];
    const maxDarkSteps = 1;
    let minX = relSeedX;
    let minY = relSeedY;
    let maxX = relSeedX;
    let maxY = relSeedY;

    let count = 0;
    const maxPixels = bw * bh;

    const isTextBridgePixel = (nx, ny) => {
        if (nx < bx + textBridgeMargin || nx >= bx + bw - textBridgeMargin) return false;
        if (ny < by + textBridgeMargin || ny >= by + bh - textBridgeMargin) return false;

        const centerBrightness = brightnessMap[ny * imgW + nx];
        if (centerBrightness >= bridgeThreshold) return true;
        if (centerBrightness < 28) return false;

        let brightNeighbors = 0;
        let darkNeighbors = 0;

        for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
                if (ox === 0 && oy === 0) continue;

                const px = nx + ox;
                const py = ny + oy;
                if (px < bx || px >= bx + bw || py < by || py >= by + bh) continue;

                const neighborBrightness = brightnessMap[py * imgW + px];
                if (neighborBrightness >= threshold) {
                    brightNeighbors++;
                } else if (neighborBrightness < bridgeThreshold) {
                    darkNeighbors++;
                }
            }
        }

        return brightNeighbors >= 5 && darkNeighbors <= 4;
    };

    // BFS loang vùng sáng đi ra từ lõi bầu dục (sử dụng pointer queueHead/Tail tránh shift và bitwise tránh tạo object)
    while (queueHead < queueTail) {
        const val = queue[queueHead++];
        const curX = val >> 14;
        const curY = (val >> 2) & 0xFFF;
        const darkSteps = val & 3;

        count++;
        if (count > maxPixels) break;

        const relCurX = curX - bx;
        const relCurY = curY - by;
        if (relCurX < minX) minX = relCurX;
        if (relCurY < minY) minY = relCurY;
        if (relCurX > maxX) maxX = relCurX;
        if (relCurY > maxY) maxY = relCurY;

        for (let i = 0; i < 4; i++) {
            const nx = curX + dx[i];
            const ny = curY + dy[i];

            if (nx >= bx && nx < bx + bw && ny >= by && ny < by + bh) {
                const rxVal = nx - bx;
                const ryVal = ny - by;
                const vIdx = ryVal * bw + rxVal;

                if (visited[vIdx] === 0) {
                    const brightness = brightnessMap[ny * imgW + nx];

                    if (brightness >= threshold) {
                        visited[vIdx] = 1;
                        if (queueTail < maxQueueSize) {
                            queue[queueTail++] = (nx << 14) | (ny << 2) | 0;
                        }
                    } else if (darkSteps < maxDarkSteps && (brightness >= bridgeThreshold || isTextBridgePixel(nx, ny))) {
                        // Chỉ cho phép băng qua một lớp nét mỏng để không tràn ra ngoài viền bubble
                        visited[vIdx] = 1;
                        if (queueTail < maxQueueSize) {
                            queue[queueTail++] = (nx << 14) | (ny << 2) | (darkSteps + 1);
                        }
                    }
                }
            }
        }
    }

    // Lấp các lỗ kín bên trong bubble (thường là chữ đen / khoảng hở của chữ)
    // để nền che không bị thủng qua chữ ở giữa.
    const outside = new Uint8Array(bw * bh);
    queueHead = 0;
    queueTail = 0;

    const pushOutside = (relX, relY) => {
        const idx = relY * bw + relX;
        if (idx < 0 || idx >= visited.length) return;
        if (visited[idx] === 1 || outside[idx] === 1) return;
        outside[idx] = 1;
        const absX = bx + relX;
        const absY = by + relY;
        if (queueTail < maxQueueSize) {
            queue[queueTail++] = (absX << 14) | (absY << 2) | 0;
        }
    };

    for (let x = 0; x < bw; x++) {
        pushOutside(x, 0);
        if (bh > 1) pushOutside(x, bh - 1);
    }
    for (let y = 1; y < bh - 1; y++) {
        pushOutside(0, y);
        if (bw > 1) pushOutside(bw - 1, y);
    }

    while (queueHead < queueTail) {
        const val = queue[queueHead++];
        const curX = val >> 14;
        const curY = (val >> 2) & 0xFFF;

        for (let i = 0; i < 4; i++) {
            const nx = curX + dx[i];
            const ny = curY + dy[i];

            if (nx >= bx && nx < bx + bw && ny >= by && ny < by + bh) {
                const rxVal = nx - bx;
                const ryVal = ny - by;
                const vIdx = ryVal * bw + rxVal;
                if (visited[vIdx] === 0 && outside[vIdx] === 0) {
                    outside[vIdx] = 1;
                    if (queueTail < maxQueueSize) {
                        queue[queueTail++] = (nx << 14) | (ny << 2) | 0;
                    }
                }
            }
        }
    }

    const visitedRatio = count / maxPixels;
    const boxSpanX = maxX - minX + 1;
    const boxSpanY = maxY - minY + 1;
    const touchesEdge = minX <= 1 || minY <= 1 || maxX >= bw - 2 || maxY >= bh - 2;

    if (visitedRatio < 0.04 || (touchesEdge && visitedRatio < 0.18)) {
        return null;
    }

    const trimPad = Math.max(1, Math.round(Math.min(bw, bh) * 0.03));
    const finalBx = Math.max(0, minX - trimPad);
    const finalBy = Math.max(0, minY - trimPad);
    const finalBw = Math.min(bw - finalBx, boxSpanX + trimPad * 2);
    const finalBh = Math.min(bh - finalBy, boxSpanY + trimPad * 2);

    // Tạo canvas nhỏ để vẽ mặt nạ
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = finalBw;
    maskCanvas.height = finalBh;
    const maskCtx = maskCanvas.getContext('2d');
    const maskImgData = maskCtx.createImageData(finalBw, finalBh);

    const hexBgColor = block.style.bgColor || '#ffffff';
    const bgOpacity = block.style.bgOpacity !== undefined ? block.style.bgOpacity : 100;

    // Phân tách màu hex
    const cleanHex = hexBgColor.replace('#', '');
    const br = parseInt(cleanHex.substring(0, 2), 16) || 0;
    const bg = parseInt(cleanHex.substring(2, 4), 16) || 0;
    const bb = parseInt(cleanHex.substring(4, 6), 16) || 0;
    const ba = Math.round((bgOpacity / 100) * 255);

    for (let y = 0; y < finalBh; y++) {
        for (let x = 0; x < finalBw; x++) {
            const idx = (y + finalBy) * bw + (x + finalBx);
            const isInsideBubble = visited[idx] === 1 || outside[idx] === 0; // Lấp kín lỗ chữ bên trong
            const canvasIdx = (y * finalBw + x) * 4;

            if (isInsideBubble) {
                maskImgData.data[canvasIdx] = br;
                maskImgData.data[canvasIdx + 1] = bg;
                maskImgData.data[canvasIdx + 2] = bb;
                maskImgData.data[canvasIdx + 3] = ba;
            } else {
                // Vùng ngoài bong bóng để trong suốt hoàn toàn
                maskImgData.data[canvasIdx] = 0;
                maskImgData.data[canvasIdx + 1] = 0;
                maskImgData.data[canvasIdx + 2] = 0;
                maskImgData.data[canvasIdx + 3] = 0;
            }
        }
    }

    maskCtx.putImageData(maskImgData, 0, 0);

    // Cache canvas để tránh encode base64 lặp lại (tiết kiệm RAM/Garbage Collection)
    block.maskCache = {
        key: cacheKey,
        canvas: maskCanvas
    };
    return maskCanvas;
}

// Main function to draw overlay block overlays onto active workspace canvas
function renderOverlays(targetContainer = null, customPage = null, customImgElement = null, forceExportScale = 1) {
    const isMirror = targetContainer !== null;
    const container = targetContainer || elements.mangaOverlaysContainer;

    container.innerHTML = '';

    const page = customPage || (globalState.activePageIndex !== -1 ? globalState.pages[globalState.activePageIndex] : null);
    if (!page) return;

    if (globalState.viewMode === 'original' && !isMirror) {
        // Clear any layouts on original-only view
        return;
    }

    // Run Auto-fit automatically before drawing if enabled
    if (globalState.autoFitEnabled) {
        autoFitAllBlocksOnPage(page, customImgElement, forceExportScale);
    }

    // Chuẩn bị ảnh gốc để chạy thuật toán Flood Fill nếu có block sử dụng maskShape là 'bubble-fit' (Có tích hợp cache cấp trang)
    let activeImageData = page.imageDataCache || null;
    const imgElement = customImgElement || elements.mangaBgImage;
    const hasBubbleFit = page.blocks.some(block => (block.style.maskShape || 'bubble-fit') === 'bubble-fit');

    if (hasBubbleFit && !activeImageData && imgElement.naturalWidth > 0 && imgElement.naturalHeight > 0) {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = imgElement.naturalWidth;
            canvas.height = imgElement.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(imgElement, 0, 0);
            activeImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            page.imageDataCache = activeImageData; // Cache lại trên trang để dùng cho các lượt render sau
        } catch (e) {
            console.error("Không thể lấy dữ liệu ảnh để khớp bong bóng (lỗi CORS hoặc vẽ):", e);
        }
    }

    page.blocks.forEach((block) => {
        const bubble = document.createElement('div');
        bubble.id = isMirror ? `mirror-${block.id}` : block.id;

        // Base CSS placements based on absolute coordinates percentage ratios
        bubble.style.top = `${block.box.y}%`;
        bubble.style.left = `${block.box.x}%`;
        bubble.style.width = `${block.box.w}%`;
        bubble.style.height = `${block.box.h}%`;

        // Apply rotation angle if set
        if (block.style.rotate) {
            bubble.style.transform = `rotate(${block.style.rotate}deg)`;
        } else {
            bubble.style.transform = '';
        }

        // Handle text overlay styling based on block options
        bubble.className = `bubble-overlay ${block.id === globalState.selectedBlockId && !isMirror ? 'active' : ''}`;

        // Khung Drag chữ nhật bên ngoài luôn trong suốt để không che mất viền cong của bubble
        bubble.style.backgroundColor = 'transparent';

        // Thiết lập cấu trúc Flex để căn chỉnh hộp che chữ bên trong dựa trên kiểu căn lề
        bubble.style.display = 'flex';
        bubble.style.alignItems = 'center';
        if (block.style.align === 'left') {
            bubble.style.justifyContent = 'flex-start';
        } else if (block.style.align === 'right') {
            bubble.style.justifyContent = 'flex-end';
        } else {
            bubble.style.justifyContent = 'center';
        }

        // Tạo phần tử mặt nạ nội dung che chữ snug-fit bên trong
        const maskContent = document.createElement('div');
        maskContent.style.position = 'relative';
        maskContent.style.overflow = 'hidden';
        maskContent.style.boxSizing = 'border-box';

        // Áp dụng kích cỡ mặt nạ che cũ
        const currentMaskSize = block.style.maskSize || 'full';
        if (currentMaskSize === 'full') {
            // Che phủ 100% khung drag, giúp người dùng bôi trắng đè hoàn toàn chữ Nhật cũ
            maskContent.style.width = '100%';
            maskContent.style.height = '100%';
            maskContent.style.display = 'flex';
            maskContent.style.alignItems = 'center';
            maskContent.style.justifyContent = block.style.align === 'left' ? 'flex-start' : block.style.align === 'right' ? 'flex-end' : 'center';
            maskContent.className = `${block.style.fontFamily} pointer-events-none`;
        } else {
            // Chỉ che vừa khít bao quanh chữ Việt (Snug)
            maskContent.style.display = 'flex';
            maskContent.style.alignItems = 'center';
            maskContent.style.justifyContent = 'center';
            maskContent.style.width = 'auto';
            maskContent.style.height = 'auto';
            maskContent.style.maxWidth = '100%';
            maskContent.style.maxHeight = '100%';
            maskContent.className = `${block.style.fontFamily} pointer-events-none`;
        }
        maskContent.style.wordBreak = 'keep-all';
        maskContent.style.overflowWrap = 'normal';
        maskContent.style.hyphens = 'none';

        // Áp dụng dáng mặt nạ che cũ và hình nền che khớp bong bóng thoại
        const currentMaskShape = block.style.maskShape || 'bubble-fit';
        let hasBubbleFitMask = false;

        if (currentMaskShape === 'bubble-fit' && activeImageData) {
            const maskCanvas = computeBubbleMask(page, block, activeImageData);
            if (maskCanvas) {
                if (block.maskCache && !block.maskCache.dataUrl) {
                    block.maskCache.dataUrl = maskCanvas.toDataURL();
                }
                const dataUrl = (block.maskCache && block.maskCache.dataUrl) || maskCanvas.toDataURL();
                maskContent.style.backgroundImage = `url(${dataUrl})`;
                maskContent.style.backgroundSize = '100% 100%';
                maskContent.style.backgroundRepeat = 'no-repeat';

                maskContent.style.backgroundColor = 'transparent';
                maskContent.style.borderRadius = '0px';
                hasBubbleFitMask = true;
            }
        }

        if (!hasBubbleFitMask) {
            maskContent.style.backgroundImage = 'none';
            const hexBgColor = block.style.bgColor || '#ffffff';
            const alpha = (block.style.bgOpacity !== undefined ? block.style.bgOpacity : 100) / 100;
            maskContent.style.backgroundColor = convertHexToRGBA(hexBgColor, alpha);

            if (currentMaskShape === 'ellipse') {
                maskContent.style.borderRadius = '50%'; // Tạo hình bầu dục/hình tròn mềm mại hoàn hảo cho manga bubble
            } else if (currentMaskShape === 'rounded') {
                maskContent.style.borderRadius = '12px'; // Bo tròn bốn góc hiện đại
            } else {
                maskContent.style.borderRadius = '0px'; // Khung chữ nhật sắc cạnh
            }
        }

        maskContent.style.color = block.style.textColor || '#000000';
        const padding = block.style.padding !== undefined ? block.style.padding : 4;
        const displayPadding = forceExportScale !== 1 ? padding * forceExportScale : padding;
        maskContent.style.padding = `${displayPadding}px`;
        maskContent.style.textAlign = block.style.align || 'center';

        let displayFontSize = block.style.fontSize || 16;
        if (forceExportScale !== 1 && !globalState.autoFitEnabled) {
            // Không sử dụng Math.round để tránh sai số làm tròn pixel khi co dãn layout chữ
            displayFontSize = displayFontSize * forceExportScale;
        }
        maskContent.style.fontSize = `${displayFontSize}px`;
        maskContent.style.lineHeight = block.style.vertical ? '1.12' : '1.18';
        maskContent.style.letterSpacing = '0';
        maskContent.style.fontKerning = 'normal';

        if (block.style.bold) {
            maskContent.style.fontWeight = 'bold';
        } else {
            maskContent.style.fontWeight = 'normal';
        }

        if (block.style.vertical) {
            maskContent.classList.add('text-vertical');
            maskContent.style.writingMode = 'vertical-rl';
            maskContent.style.textOrientation = 'upright';
            maskContent.style.lineHeight = '1.12';
        }

        // Apply Text Stroke (Viền chữ) & Drop Shadow (Bóng đổ)
        const strokeWidth = block.style.strokeWidth || 0;
        const strokeColor = block.style.strokeColor || '#ffffff';
        if (strokeWidth > 0) {
            const displayStroke = forceExportScale !== 1 ? strokeWidth * forceExportScale : strokeWidth;
            maskContent.style.webkitTextStroke = `${displayStroke}px ${strokeColor}`;
            maskContent.style.paintOrder = 'stroke fill';
        } else {
            maskContent.style.webkitTextStroke = '0px transparent';
        }

        const shadowBlur = block.style.shadowBlur || 0;
        const shadowColor = block.style.shadowColor || '#000000';
        if (shadowBlur > 0) {
            const displayBlur = forceExportScale !== 1 ? shadowBlur * forceExportScale : shadowBlur;
            maskContent.style.textShadow = `0px 0px ${displayBlur}px ${shadowColor}`;
        } else {
            maskContent.style.textShadow = 'none';
        }

        // Khối văn bản dịch bên trong
        const innerTextDiv = document.createElement('div');
        const isCenterAlign = !block.style.align || block.style.align === 'center';
        innerTextDiv.className = `w-full flex flex-col ${isCenterAlign ? 'items-center justify-center' : block.style.align === 'right' ? 'items-end' : 'items-start'}`;
        innerTextDiv.style.margin = '0';
        innerTextDiv.style.padding = '0';
        innerTextDiv.style.lineHeight = block.style.vertical ? '1.12' : '1.18';
        innerTextDiv.style.textAlign = block.style.align || 'center';

        setMultilineText(innerTextDiv, block.translated);

        innerTextDiv.style.position = 'relative';
        innerTextDiv.style.zIndex = '1';
        maskContent.appendChild(innerTextDiv);

        bubble.appendChild(maskContent);

        // Add Drag-and-Resize handles (only for primary non-mirrored interactive canvas)
        if (!isMirror) {
            bubble.addEventListener('mousedown', (e) => startBlockDrag(e, block));
            bubble.addEventListener('touchstart', (e) => startBlockDrag(e, block), { passive: false });
            bubble.addEventListener('dblclick', () => {
                setRightTab('edit');
                elements.editTranslatedText.focus();
            });

            // Resize corner handles
            const handleSW = document.createElement('div');
            handleSW.className = "resize-handle resize-sw";
            handleSW.addEventListener('mousedown', (e) => startBlockResize(e, block, 'sw'));
            handleSW.addEventListener('touchstart', (e) => startBlockResize(e, block, 'sw'), { passive: false });

            const handleSE = document.createElement('div');
            handleSE.className = "resize-handle resize-se";
            handleSE.addEventListener('mousedown', (e) => startBlockResize(e, block, 'se'));
            handleSE.addEventListener('touchstart', (e) => startBlockResize(e, block, 'se'), { passive: false });

            const handleNW = document.createElement('div');
            handleNW.className = "resize-handle resize-nw";
            handleNW.addEventListener('mousedown', (e) => startBlockResize(e, block, 'nw'));
            handleNW.addEventListener('touchstart', (e) => startBlockResize(e, block, 'nw'), { passive: false });

            const handleNE = document.createElement('div');
            handleNE.className = "resize-handle resize-ne";
            handleNE.addEventListener('mousedown', (e) => startBlockResize(e, block, 'ne'));
            handleNE.addEventListener('touchstart', (e) => startBlockResize(e, block, 'ne'), { passive: false });

            bubble.appendChild(handleSW);
            bubble.appendChild(handleSE);
            bubble.appendChild(handleNW);
            bubble.appendChild(handleNE);
        }

        container.appendChild(bubble);
    });
}

// Helper: Convert Hex color scheme to RGBA equivalents
function convertHexToRGBA(hex, alpha) {
    hex = hex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Sidebar Editor sync controls
function updateActiveBlockEditor() {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) {
        elements.noBlockSelectedState.classList.remove('hidden');
        elements.blockEditorContainer.classList.add('hidden');

        // Cập nhật giao diện TOEIC khi không chọn block thoại
        if (elements.toeicNoBlockSelectedState) elements.toeicNoBlockSelectedState.classList.remove('hidden');
        if (elements.toeicAnalysisContainer) elements.toeicAnalysisContainer.classList.add('hidden');
        globalState.activeBlockToeicAnalysis = null;
        return;
    }

    const page = globalState.pages[globalState.activePageIndex];
    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);

    if (!block) {
        globalState.selectedBlockId = null;
        elements.noBlockSelectedState.classList.remove('hidden');
        elements.blockEditorContainer.classList.add('hidden');

        // Cập nhật giao diện TOEIC khi không tìm thấy block thoại
        if (elements.toeicNoBlockSelectedState) elements.toeicNoBlockSelectedState.classList.remove('hidden');
        if (elements.toeicAnalysisContainer) elements.toeicAnalysisContainer.classList.add('hidden');
        globalState.activeBlockToeicAnalysis = null;
        return;
    }

    elements.noBlockSelectedState.classList.add('hidden');
    elements.blockEditorContainer.classList.remove('hidden');

    // Hiện panel phân tích TOEIC nếu đang chọn block
    if (elements.toeicNoBlockSelectedState) elements.toeicNoBlockSelectedState.classList.add('hidden');
    if (elements.toeicAnalysisContainer) {
        elements.toeicAnalysisContainer.classList.remove('hidden');

        // Khôi phục kết quả phân tích nếu block này đã được phân tích trước đó
        if (globalState.activeBlockToeicAnalysis && globalState.activeBlockToeicAnalysis.blockId === block.id) {
            displayToeicAnalysis(globalState.activeBlockToeicAnalysis.analysis);
        } else {
            resetToeicAnalysisUI();
        }
    }

    elements.editOriginalText.value = block.original;
    elements.editTranslatedText.value = block.translated;
    elements.lblBlockId.innerText = block.id;

    const btnSfxRestore = document.getElementById('btn-sfx-restore');
    if (btnSfxRestore) {
        if (block.originalBackgroundBackup) {
            btnSfxRestore.classList.remove('hidden');
        } else {
            btnSfxRestore.classList.add('hidden');
        }
    }

    // Load styling variables values onto sliders controls
    elements.styleFont.value = block.style.fontFamily;
    elements.styleFontSize.value = block.style.fontSize;
    elements.lblFontSize.innerText = `${block.style.fontSize}px`;
    elements.styleAlign.value = block.style.align;

    elements.styleBold.checked = block.style.bold;

    elements.styleTextColor.value = block.style.textColor;
    elements.styleTextColorHex.value = block.style.textColor.toUpperCase();
    elements.styleBgColor.value = block.style.bgColor;
    elements.styleBgColorHex.value = block.style.bgColor.toUpperCase();

    elements.styleBgOpacity.value = block.style.bgOpacity;
    elements.lblBgOpacity.innerText = `${block.style.bgOpacity}%`;

    elements.stylePadding.value = block.style.padding;
    elements.lblPadding.innerText = `${block.style.padding}px`;

    if (elements.styleRotate) {
        elements.styleRotate.value = block.style.rotate || 0;
    }
    if (elements.lblRotate) {
        elements.lblRotate.innerText = `${block.style.rotate || 0}°`;
    }

    // Load Stroke & Shadow values
    if (elements.styleStrokeColor) elements.styleStrokeColor.value = block.style.strokeColor || '#ffffff';
    if (elements.styleStrokeColorHex) elements.styleStrokeColorHex.value = (block.style.strokeColor || '#ffffff').toUpperCase();
    if (elements.styleStrokeWidth) elements.styleStrokeWidth.value = block.style.strokeWidth || 0;
    if (elements.lblStrokeWidth) elements.lblStrokeWidth.innerText = `${block.style.strokeWidth || 0}px`;

    if (elements.styleShadowColor) elements.styleShadowColor.value = block.style.shadowColor || '#000000';
    if (elements.styleShadowColorHex) elements.styleShadowColorHex.value = (block.style.shadowColor || '#000000').toUpperCase();
    if (elements.styleShadowBlur) elements.styleShadowBlur.value = block.style.shadowBlur || 0;
    if (elements.lblShadowBlur) elements.lblShadowBlur.innerText = `${block.style.shadowBlur || 0}px`;

    // Load masking configurations to sidebar inputs
    elements.styleMaskShape.value = block.style.maskShape || 'bubble-fit';
    elements.styleMaskSize.value = block.style.maskSize || 'full';

    // Hướng viết buttons toggles classes
    if (block.style.vertical) {
        elements.btnStyleVert.className = "py-1 text-xs rounded bg-indigo-600 text-white font-semibold";
        elements.btnStyleHoriz.className = "py-1 text-xs rounded bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800 font-semibold";
    } else {
        elements.btnStyleHoriz.className = "py-1 text-xs rounded bg-indigo-600 text-white font-semibold";
        elements.btnStyleVert.className = "py-1 text-xs rounded bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800 font-semibold";
    }
}



// Selection highlights
function selectBlock(blockId) {
    const prevSelectedBlockId = globalState.selectedBlockId;
    globalState.selectedBlockId = blockId;

    if (prevSelectedBlockId && prevSelectedBlockId !== blockId) {
        const prevEl = document.getElementById(prevSelectedBlockId);
        if (prevEl) prevEl.classList.remove('active');
    }
    const nextEl = document.getElementById(blockId);
    if (nextEl) {
        nextEl.classList.add('active');
    } else {
        requestOverlayRender();
    }

    updateActiveBlockEditor();

    // Cập nhật trạng thái nút Copy/Paste Style
    if (elements.btnCopyStyle) elements.btnCopyStyle.disabled = false;
    if (elements.btnPasteStyle) elements.btnPasteStyle.disabled = !copiedStyle;

    // Adjust sidebar clone to keep overlays clean if on split panel
    if (globalState.viewMode === 'split') {
        updateSplitView();
    }

    updateFloatingToolbarPosition();
}

// Cập nhật vị trí thanh công cụ nổi (Floating Context Bar) trên Canvas
function updateFloatingToolbarPosition() {
    if (!elements.canvasFloatingToolbar) return;

    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null || globalState.viewMode === 'original') {
        elements.canvasFloatingToolbar.classList.add('hidden');
        return;
    }

    const page = globalState.pages[globalState.activePageIndex];
    const block = page ? page.blocks.find(b => b.id === globalState.selectedBlockId) : null;
    if (!block) {
        elements.canvasFloatingToolbar.classList.add('hidden');
        return;
    }

    if (elements.lblFloatingDir) {
        elements.lblFloatingDir.textContent = block.style.vertical ? 'Ngang' : 'Dọc';
    }

    const topPos = block.box.y > 12 ? (block.box.y - 6) : (block.box.y + block.box.h + 2);
    const leftPos = Math.max(12, Math.min(88, block.box.x + (block.box.w / 2)));

    elements.canvasFloatingToolbar.style.top = `${topPos}%`;
    elements.canvasFloatingToolbar.style.left = `${leftPos}%`;
    elements.canvasFloatingToolbar.classList.remove('hidden');
}
window.updateFloatingToolbarPosition = updateFloatingToolbarPosition;

// Nhân đôi ô thoại đang chọn (Duplicate Block)
function duplicateActiveBlock() {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;

    const page = globalState.pages[globalState.activePageIndex];
    const sourceBlock = page.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!sourceBlock) return;

    pushStateToHistory();

    const newX = Math.min(85, sourceBlock.box.x + 2);
    const newY = Math.min(85, sourceBlock.box.y + 2);
    const newBlockId = `block-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const newBlock = {
        id: newBlockId,
        original: sourceBlock.original || '',
        translated: sourceBlock.translated || '',
        box: {
            x: newX,
            y: newY,
            w: sourceBlock.box.w,
            h: sourceBlock.box.h
        },
        style: JSON.parse(JSON.stringify(sourceBlock.style))
    };

    page.blocks.push(newBlock);
    selectBlock(newBlockId);
    requestOverlayRender();
    savePageToDB(page);
    showToast("Đã nhân đôi ô thoại thành công!", "success");
}
window.duplicateActiveBlock = duplicateActiveBlock;

// Chuyển hướng Ngang / Dọc của ô thoại đang chọn
function toggleActiveBlockOrientation() {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;

    const page = globalState.pages[globalState.activePageIndex];
    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!block) return;

    const nextVertical = !block.style.vertical;
    syncActiveBlockStyle('vertical', nextVertical);
    showToast(nextVertical ? "Đã chuyển sang viết chữ Dọc" : "Đã chuyển sang viết chữ Ngang", "info");
}
window.toggleActiveBlockOrientation = toggleActiveBlockOrientation;

// Áp dụng Preset mẫu định dạng nhanh cho ô thoại
function applyStylePreset(presetKey) {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) {
        showToast("Vui lòng nhấp chọn một ô thoại trước khi áp dụng preset mẫu.", "warn");
        return;
    }

    const page = globalState.pages[globalState.activePageIndex];
    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!block) return;

    pushStateToHistory();

    const presets = {
        'manga-std': {
            fontFamily: 'font-comic',
            bold: false,
            textColor: '#000000',
            bgColor: '#ffffff',
            bgOpacity: 100,
            strokeWidth: 0,
            shadowBlur: 0
        },
        'shout-sfx': {
            fontFamily: 'font-impact',
            bold: true,
            textColor: '#ffcc00',
            bgColor: '#000000',
            bgOpacity: 100,
            strokeColor: '#000000',
            strokeWidth: 2,
            shadowColor: '#000000',
            shadowBlur: 6
        },
        'horror': {
            fontFamily: 'font-marker',
            bold: true,
            textColor: '#ef4444',
            bgColor: '#000000',
            bgOpacity: 100,
            strokeColor: '#000000',
            strokeWidth: 1.5,
            shadowColor: '#dc2626',
            shadowBlur: 8
        },
        'whisper': {
            fontFamily: 'font-caveat',
            bold: false,
            textColor: '#475569',
            bgColor: '#ffffff',
            bgOpacity: 90,
            strokeWidth: 0,
            shadowBlur: 0
        }
    };

    const targetPreset = presets[presetKey];
    if (!targetPreset) return;

    Object.assign(block.style, targetPreset);
    block.maskCache = null;
    block.autoFitCache = null;
    requestOverlayRender();
    updateActiveBlockEditor();
    updateFloatingToolbarPosition();
    savePageToDB(page);
    showToast("Đã áp dụng preset định dạng mẫu!", "success");
}
window.applyStylePreset = applyStylePreset;

// Add a completely new custom manual block overlay
function addNewBlock() {
    if (globalState.activePageIndex === -1) {
        showToast("Vui lòng tải hoặc mở một trang trước khi tạo ô thoại!", "error");
        return;
    }

    const page = globalState.pages[globalState.activePageIndex];
    const newId = `manual_block_${Date.now()}`;

    const newBlock = {
        id: newId,
        type: 'dialogue',
        original: '',
        translated: 'Nhập nội dung dịch...',
        box: {
            x: 35,
            y: 40,
            w: 30,
            h: 20
        },
        style: {
            fontFamily: globalState.globalStyle.fontFamily,
            fontSize: globalState.globalStyle.fontSize,
            textColor: globalState.globalStyle.textColor,
            bgColor: globalState.globalStyle.bgColor,
            bgOpacity: globalState.globalStyle.bgOpacity,
            padding: globalState.globalStyle.padding,
            rotate: globalState.globalStyle.rotate || 0,
            vertical: DEFAULT_VERTICAL_WRITING_MODE,
            bold: globalState.globalStyle.bold,
            align: globalState.globalStyle.align,
            maskShape: globalState.globalStyle.maskShape,
            maskSize: globalState.globalStyle.maskSize
        }
    };

    pushStateToHistory();
    page.blocks.push(newBlock);
    selectBlock(newId);
    savePageToDB(page);
    showToast("Đã thêm một ô dịch mới!", "success");
}

// Delete currently selected active block overlay
async function deleteActiveBlock() {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;

    const page = globalState.pages[globalState.activePageIndex];
    const targetIdx = page.blocks.findIndex(b => b.id === globalState.selectedBlockId);

    if (targetIdx !== -1) {
        const block = page.blocks[targetIdx];
        if (block.originalBackgroundBackup) {
            await restoreBackgroundForBlock(block.id);
        }

        pushStateToHistory();
        page.blocks.splice(targetIdx, 1);
        globalState.selectedBlockId = null;
        requestOverlayRender();
        updateActiveBlockEditor();
        savePageToDB(page);
        showToast("Đã xóa ô dịch thành công.", "info");
    }
}

// Sync changes made to translated inputs onto global states
function syncActiveBlockTranslation(val) {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;
    const page = globalState.pages[globalState.activePageIndex];
    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);
    if (block) {
        block.translated = val;

        // Realtime re-fit check
        if (globalState.autoFitEnabled) {
            autoFitBlock(block);
        }

        // Optimized partial redraw
        const overlayElem = document.getElementById(block.id);
        if (overlayElem) {
            // Update text content inside the maskContent div
            const textContainer = overlayElem.querySelector('div > div');
            if (textContainer) {
                setMultilineText(textContainer, val);
            }
            if (globalState.autoFitEnabled) {
                const maskElem = overlayElem.firstElementChild;
                if (maskElem) {
                    maskElem.style.fontSize = `${block.style.fontSize}px`;
                }
                elements.lblFontSize.innerText = `${block.style.fontSize}px`;
                elements.styleFontSize.value = block.style.fontSize;
            }
        }

        if (globalState.viewMode === 'split') {
            const cloneOverlay = document.getElementById(`mirror-${block.id}`);
            if (cloneOverlay) {
                const cloneTextContainer = cloneOverlay.querySelector('div > div');
                if (cloneTextContainer) setMultilineText(cloneTextContainer, val);
                if (globalState.autoFitEnabled) {
                    const cloneMask = cloneOverlay.firstElementChild;
                    if (cloneMask) {
                        cloneMask.style.fontSize = `${block.style.fontSize}px`;
                    }
                }
            }
        }
        // Auto save translation text change (debounced)
        debounceSavePage(page);
    }
}

let isCurrentlySliding = false;

// Sync styling parameters
function syncActiveBlockStyle(property, value) {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;
    const page = globalState.pages[globalState.activePageIndex];
    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);

    if (block) {
        // Lưu trạng thái lịch sử trước khi chỉnh sửa
        const rangeProperties = ['fontSize', 'bgOpacity', 'padding', 'rotate'];
        if (rangeProperties.includes(property)) {
            if (!isCurrentlySliding) {
                isCurrentlySliding = true;
                pushStateToHistory();
                const stopSlide = () => {
                    isCurrentlySliding = false;
                    window.removeEventListener('mouseup', stopSlide);
                    window.removeEventListener('touchend', stopSlide);
                };
                window.addEventListener('mouseup', stopSlide);
                window.addEventListener('touchend', stopSlide);
            }
        } else {
            pushStateToHistory();
        }

        block.style[property] = value;

        // Update styling sliders label tags text value
        if (property === 'fontSize') {
            elements.lblFontSize.innerText = `${value}px`;
            elements.styleFontSize.value = value;
        } else if (property === 'bgOpacity') {
            elements.lblBgOpacity.innerText = `${value}%`;
        } else if (property === 'padding') {
            elements.lblPadding.innerText = `${value}px`;
        } else if (property === 'rotate') {
            if (elements.lblRotate) elements.lblRotate.innerText = `${value}°`;
            if (elements.styleRotate) elements.styleRotate.value = value;
        } else if (property === 'strokeWidth') {
            if (elements.lblStrokeWidth) elements.lblStrokeWidth.innerText = `${value}px`;
            if (elements.styleStrokeWidth) elements.styleStrokeWidth.value = value;
        } else if (property === 'shadowBlur') {
            if (elements.lblShadowBlur) elements.lblShadowBlur.innerText = `${value}px`;
            if (elements.styleShadowBlur) elements.styleShadowBlur.value = value;
        }

        block.maskCache = null;
        block.autoFitCache = null;
        requestOverlayRender();
        updateActiveBlockEditor();
        updateFloatingToolbarPosition();
        debounceSavePage(page);
    }
}

// Auto-Fit font calculator with Binary Search algorithm
function autoFitBlock(block, customImgElement = null, forceExportScale = 1) {
    if (!block.translated || block.translated.trim() === '') {
        block.style.fontSize = 12;
        return;
    }

    // Fetch actual canvas bounding pixel size to map relative percentages to exact sizes
    const imgEl = customImgElement || elements.mangaBgImage;
    const canvasWidth = imgEl.clientWidth || imgEl.naturalWidth || 800;
    const canvasHeight = imgEl.clientHeight || imgEl.naturalHeight || 1200;

    // Tạo khoá cache dựa trên tất cả các thông số có thể làm thay đổi kích thước chữ
    const maskShape = block.style.maskShape || 'bubble-fit';
    const cacheKey = `${block.translated}_${block.box.w}_${block.box.h}_${block.style.fontFamily}_${block.style.padding}_${block.style.vertical}_${block.style.bold}_${block.style.align}_${maskShape}_${canvasWidth}_${canvasHeight}_${forceExportScale}`;
    if (block.autoFitCache && block.autoFitCache.key === cacheKey) {
        block.style.fontSize = block.autoFitCache.fontSize;
        block.textWidth = block.autoFitCache.textWidth;
        block.textHeight = block.autoFitCache.textHeight;
        return;
    }

    const ruler = elements.autoFitRuler || document.getElementById('auto-fit-ruler');
    if (!ruler) {
        block.style.fontSize = 13;
        return;
    }

    // Gán các thuộc tính cần thiết lên ruler toàn cục thay vì tạo div mới
    ruler.className = `${block.style.fontFamily}`;
    const padding = block.style.padding !== undefined ? block.style.padding : 4;
    const displayPadding = forceExportScale !== 1 ? padding * forceExportScale : padding;
    ruler.style.padding = `${displayPadding}px`;
    ruler.style.textAlign = block.style.align || 'center';
    ruler.style.letterSpacing = '0';
    ruler.style.fontKerning = 'normal';
    ruler.style.wordBreak = 'keep-all';
    ruler.style.overflowWrap = 'normal';

    if (block.style.bold) {
        ruler.style.fontWeight = 'bold';
    } else {
        ruler.style.fontWeight = 'normal';
    }

    if (block.style.vertical) {
        ruler.classList.add('text-vertical');
        ruler.style.writingMode = 'vertical-rl';
        ruler.style.textOrientation = 'upright';
        ruler.style.lineHeight = '1.12';
    } else {
        ruler.classList.remove('text-vertical');
        ruler.style.writingMode = 'horizontal-tb';
        ruler.style.textOrientation = 'mixed';
        ruler.style.lineHeight = '1.18';
    }

    const targetWidth = (block.box.w / 100) * canvasWidth;
    const targetHeight = (block.box.h / 100) * canvasHeight;

    // Khung hình bầu dục/elip có diện tích 4 góc hẹp hơn hình chữ nhật.
    // Áp dụng fitMargin an toàn 0.77 đối với Ellipse/Bubble-fit và 0.93 đối với hình chữ nhật.
    const shape = block.style.maskShape || 'bubble-fit';
    const isEllipseShape = shape === 'ellipse' || shape === 'bubble-fit';
    const fitMargin = isEllipseShape ? 0.77 : 0.93;

    // Set ruler dimensions dynamically based on layout orientation
    if (block.style.vertical) {
        ruler.style.height = `${targetHeight * fitMargin}px`;
        ruler.style.width = 'auto';
    } else {
        ruler.style.width = `${targetWidth * fitMargin}px`;
        ruler.style.height = 'auto';
    }

    let minSize = 8;
    let maxSize = 72;
    let optimalSize = 8;

    while (minSize <= maxSize) {
        const mid = Math.floor((minSize + maxSize) / 2);
        ruler.style.fontSize = `${mid}px`;
        setMultilineText(ruler, block.translated);

        const contentWidth = ruler.scrollWidth;
        const contentHeight = ruler.scrollHeight;

        // Check constraints: must fit both width and height within margins (with 1px sub-pixel tolerance)
        const fits = contentWidth <= (targetWidth * fitMargin) + 1 && contentHeight <= (targetHeight * fitMargin) + 1;

        if (fits) {
            optimalSize = mid;
            minSize = mid + 1; // Try larger font
        } else {
            maxSize = mid - 1; // Try smaller font
        }
    }

    // Fine-tune downward if the binary search landed on a borderline value
    let probeSize = optimalSize;
    for (let i = 0; i < 2; i++) {
        ruler.style.fontSize = `${probeSize}px`;
        setMultilineText(ruler, block.translated);
        if (ruler.scrollWidth <= (targetWidth * fitMargin) + 1 && ruler.scrollHeight <= (targetHeight * fitMargin) + 1) break;
        probeSize = Math.max(8, probeSize - 1);
    }

    const finalSize = probeSize;
    block.style.fontSize = finalSize;

    // Đo lại kích thước chữ ở size font cuối cùng với padding 1px để làm lõi Bubble Fit cực sát chữ
    ruler.style.fontSize = `${finalSize}px`;
    ruler.style.padding = '1px'; // Ép sát chữ 1px
    setMultilineText(ruler, block.translated);
    block.textWidth = ruler.scrollWidth;
    block.textHeight = ruler.scrollHeight;

    // Lưu kết quả vào cache
    block.autoFitCache = {
        key: cacheKey,
        fontSize: finalSize,
        textWidth: block.textWidth,
        textHeight: block.textHeight
    };
}

// Auto-Fit all blocks
function autoFitAllBlocksOnPage(page = null, customImgElement = null, forceExportScale = 1) {
    const targetPage = page || (globalState.activePageIndex !== -1 ? globalState.pages[globalState.activePageIndex] : null);
    if (!targetPage) return;
    targetPage.blocks.forEach(block => autoFitBlock(block, customImgElement, forceExportScale));
}

// Drag control logic
function startBlockDrag(e, block) {
    // Cancel events if interacting directly with resizing handles
    if (e.target.classList.contains('resize-handle')) return;

    e.preventDefault();
    pushStateToHistory();
    selectBlock(block.id);

    const isTouch = e.type.startsWith('touch');
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;

    const startX = clientX;
    const startY = clientY;

    const startPercentX = block.box.x;
    const startPercentY = block.box.y;

    const containerWidth = elements.mangaCanvasContainer.clientWidth;
    const containerHeight = elements.mangaCanvasContainer.clientHeight;

    function onDragging(moveEvent) {
        const curTouch = moveEvent.type.startsWith('touch');
        const curX = curTouch ? moveEvent.touches[0].clientX : moveEvent.clientX;
        const curY = curTouch ? moveEvent.touches[0].clientY : moveEvent.clientY;

        const deltaX = curX - startX;
        const deltaY = curY - startY;

        // Map drag distances pixels to scale independent percentages
        const deltaPercentX = (deltaX / containerWidth) * 100;
        const deltaPercentY = (deltaY / containerHeight) * 100;

        block.box.x = Math.max(0, Math.min(100 - block.box.w, startPercentX + deltaPercentX));
        block.box.y = Math.max(0, Math.min(100 - block.box.h, startPercentY + deltaPercentY));

        // Optimize positioning directly without complete redraws during active dragging
        const blockElem = document.getElementById(block.id);
        if (blockElem) {
            blockElem.style.left = `${block.box.x}%`;
            blockElem.style.top = `${block.box.y}%`;
        }
    }

    function onDragEnd() {
        document.removeEventListener('mousemove', onDragging);
        document.removeEventListener('mouseup', onDragEnd);
        document.removeEventListener('touchmove', onDragging);
        document.removeEventListener('touchend', onDragEnd);

        // Final full rendering alignment checks
        block.maskCache = null;
        requestOverlayRender();

        const activePage = globalState.pages[globalState.activePageIndex];
        if (activePage) savePageToDB(activePage);
    }

    document.addEventListener('mousemove', onDragging);
    document.addEventListener('mouseup', onDragEnd);
    document.addEventListener('touchmove', onDragging, { passive: false });
    document.addEventListener('touchend', onDragEnd);
}

// Handle coordinates resizing logic
function startBlockResize(e, block, handleDir) {
    e.stopPropagation();
    e.preventDefault();
    pushStateToHistory();

    const isTouch = e.type.startsWith('touch');
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;

    const startX = clientX;
    const startY = clientY;

    const startBox = { ...block.box };

    const containerWidth = elements.mangaCanvasContainer.clientWidth;
    const containerHeight = elements.mangaCanvasContainer.clientHeight;

    function onResizing(moveEvent) {
        const curTouch = moveEvent.type.startsWith('touch');
        const curX = curTouch ? moveEvent.touches[0].clientX : moveEvent.clientX;
        const curY = curTouch ? moveEvent.touches[0].clientY : moveEvent.clientY;

        const deltaX = curX - startX;
        const deltaY = curY - startY;

        const deltaPercentX = (deltaX / containerWidth) * 100;
        const deltaPercentY = (deltaY / containerHeight) * 100;

        let nextX = startBox.x;
        let nextY = startBox.y;
        let nextW = startBox.w;
        let nextH = startBox.h;

        // Adjust geometry changes based on dragged handle position
        if (handleDir.includes('e')) {
            nextW = Math.max(2, Math.min(100 - startBox.x, startBox.w + deltaPercentX));
        }
        if (handleDir.includes('w')) {
            const computedX = startBox.x + deltaPercentX;
            if (computedX >= 0 && (startBox.w - deltaPercentX) >= 2) {
                nextX = computedX;
                nextW = startBox.w - deltaPercentX;
            }
        }
        if (handleDir.includes('s')) {
            nextH = Math.max(2, Math.min(100 - startBox.y, startBox.h + deltaPercentY));
        }
        if (handleDir.includes('n')) {
            const computedY = startBox.y + deltaPercentY;
            if (computedY >= 0 && (startBox.h - deltaPercentY) >= 2) {
                nextY = computedY;
                nextH = startBox.h - deltaPercentY;
            }
        }

        block.box = { x: nextX, y: nextY, w: nextW, h: nextH };

        // Realtime CSS modifications - cực kỳ nhanh, không Reflow DOM đo chữ
        const blockElem = document.getElementById(block.id);
        if (blockElem) {
            blockElem.style.left = `${block.box.x}%`;
            blockElem.style.top = `${block.box.y}%`;
            blockElem.style.width = `${block.box.w}%`;
            blockElem.style.height = `${block.box.h}%`;
        }
    }

    function onResizeEnd() {
        document.removeEventListener('mousemove', onResizing);
        document.removeEventListener('mouseup', onResizeEnd);
        document.removeEventListener('touchmove', onResizing);
        document.removeEventListener('touchend', onResizeEnd);

        block.maskCache = null;
        requestOverlayRender();
        updateActiveBlockEditor();

        const activePage = globalState.pages[globalState.activePageIndex];
        if (activePage) savePageToDB(activePage);
    }

    document.addEventListener('mousemove', onResizing);
    document.addEventListener('mouseup', onResizeEnd);
    document.addEventListener('touchmove', onResizing, { passive: false });
    document.addEventListener('touchend', onResizeEnd);
}

// Thuật toán tự động xuống dòng (Word Wrap) chuẩn xác cho Canvas 2D theo chiều rộng khung thoại
function wrapCanvasText(ctx, text, maxWidth) {
    if (!text) return [];
    const rawLines = text.split('\n');
    const resultLines = [];

    for (const line of rawLines) {
        if (!line.trim()) {
            resultLines.push('');
            continue;
        }

        const words = line.trim().split(/\s+/);
        let currentLine = words[0] || '';

        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const testLine = currentLine + ' ' + word;
            if (ctx.measureText(testLine).width > maxWidth && currentLine.length > 0) {
                resultLines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        if (currentLine) {
            resultLines.push(currentLine);
        }
    }
    return resultLines;
}

// High-Precision Native Canvas 2D Export Engine (Kết xuất trực tiếp siêu nét ở độ phân giải gốc 100%, không bị lệch baseline)
async function renderPageToCanvas2D(page) {
    const imgElement = elements.mangaBgImage;
    if (!imgElement || !imgElement.naturalWidth || !imgElement.naturalHeight) {
        throw new Error("Dữ liệu ảnh gốc chưa sẵn sàng.");
    }

    const W = imgElement.naturalWidth;
    const H = imgElement.naturalHeight;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // 1. Vẽ Ảnh gốc
    ctx.drawImage(imgElement, 0, 0, W, H);

    // 2. Vẽ Lớp Canvas Tẩy thô (Eraser Layer) nếu có
    if (page.eraserCanvasDataUrl) {
        await new Promise((resolve) => {
            const eraserImg = new Image();
            eraserImg.onload = () => {
                ctx.drawImage(eraserImg, 0, 0, W, H);
                resolve();
            };
            eraserImg.onerror = resolve;
            eraserImg.src = page.eraserCanvasDataUrl;
        });
    } else if (elements.eraserCanvas && elements.eraserCanvas.width > 0) {
        ctx.drawImage(elements.eraserCanvas, 0, 0, W, H);
    }

    // 3. Đảm bảo phông chữ đã nạp xong
    await document.fonts.ready;

    // 4. Vẽ từng khối chữ dịch
    if (page.blocks && page.blocks.length > 0) {
        for (const block of page.blocks) {
            if (!block.translated || !block.translated.trim()) continue;

            const bx = (block.box.x / 100) * W;
            const by = (block.box.y / 100) * H;
            const bw = (block.box.w / 100) * W;
            const bh = (block.box.h / 100) * H;

            ctx.save();

            // Áp dụng góc xoay nếu có
            if (block.style.rotate) {
                const cx = bx + bw / 2;
                const cy = by + bh / 2;
                ctx.translate(cx, cy);
                ctx.rotate((block.style.rotate * Math.PI) / 180);
                ctx.translate(-cx, -cy);
            }

            // 4a. Vẽ phông che (Background Fill Mask)
            const maskShape = block.style.maskShape || 'bubble-fit';
            const hexBgColor = block.style.bgColor || '#ffffff';
            const alpha = (block.style.bgOpacity !== undefined ? block.style.bgOpacity : 100) / 100;

            let maskDrawn = false;
            if (maskShape === 'bubble-fit' && block.maskCache && block.maskCache.dataUrl) {
                await new Promise((resolve) => {
                    const maskImg = new Image();
                    maskImg.onload = () => {
                        ctx.drawImage(maskImg, bx, by, bw, bh);
                        maskDrawn = true;
                        resolve();
                    };
                    maskImg.onerror = resolve;
                    maskImg.src = block.maskCache.dataUrl;
                });
            }

            if (!maskDrawn && alpha > 0) {
                ctx.fillStyle = convertHexToRGBA(hexBgColor, alpha);
                if (maskShape === 'ellipse') {
                    ctx.beginPath();
                    ctx.ellipse(bx + bw / 2, by + bh / 2, bw / 2, bh / 2, 0, 0, 2 * Math.PI);
                    ctx.fill();
                } else if (maskShape === 'rounded') {
                    const r = Math.min(16, bw / 4, bh / 4);
                    ctx.beginPath();
                    if (ctx.roundRect) {
                        ctx.roundRect(bx, by, bw, bh, r);
                    } else {
                        ctx.rect(bx, by, bw, bh);
                    }
                    ctx.fill();
                } else {
                    ctx.fillRect(bx, by, bw, bh);
                }
            }

            // 4b. Định dạng Font & Màu chữ
            const fontClass = block.style.fontFamily || 'font-comic';
            let fontName = "'Patrick Hand', cursive";
            if (fontClass === 'font-manga') fontName = "'Nunito', sans-serif";
            else if (fontClass === 'font-vietnamese') fontName = "'Be Vietnam Pro', 'Inter', sans-serif";
            else if (fontClass === 'font-comicneue') fontName = "'Comic Neue', cursive";
            else if (fontClass === 'font-impact') fontName = "'Bangers', cursive";
            else if (fontClass === 'font-marker') fontName = "'Permanent Marker', cursive";
            else if (fontClass === 'font-bungee') fontName = "'Bungee', cursive";
            else if (fontClass === 'font-caveat') fontName = "'Caveat', cursive";
            else if (fontClass === 'font-tech') fontName = "'Chakra Petch', sans-serif";
            else if (fontClass === 'font-condensed') fontName = "'Saira Condensed', sans-serif";

            // Tỉ lệ quy đổi font size theo độ phân giải gốc của ảnh
            const displayWidth = elements.mangaBgImage.clientWidth || 800;
            const scaleFactor = W / Math.max(1, displayWidth);
            const fontSizePx = Math.round((block.style.fontSize || 16) * scaleFactor);
            const fontWeight = block.style.bold ? 'bold' : 'normal';

            ctx.font = `${fontWeight} ${fontSizePx}px ${fontName}`;
            ctx.fillStyle = block.style.textColor || '#000000';
            ctx.textAlign = block.style.align || 'center';
            ctx.textBaseline = 'middle';

            // 4c. Phân chia dòng và vẽ chữ tự động xuống dòng (Word Wrap)
            const paddingPx = Math.round((block.style.padding !== undefined ? block.style.padding : 4) * scaleFactor);
            const maxTextWidth = Math.max(10, bw - (paddingPx * 2));
            const textLines = wrapCanvasText(ctx, block.translated, maxTextWidth);

            const lineHeight = fontSizePx * (block.style.vertical ? 1.12 : 1.18);
            const totalTextHeight = textLines.length * lineHeight;

            let startY = by + (bh / 2) - (totalTextHeight / 2) + (lineHeight / 2);
            let startX = bx + bw / 2;
            if (block.style.align === 'left') startX = bx + paddingPx;
            else if (block.style.align === 'right') startX = bx + bw - paddingPx;

            for (let i = 0; i < textLines.length; i++) {
                ctx.fillText(textLines[i], startX, startY + (i * lineHeight));
            }

            ctx.restore();
        }
    }

    return canvas;
}

// Render and download page with translation overlays
async function exportActivePage() {
    if (globalState.activePageIndex === -1) return;

    const page = globalState.pages[globalState.activePageIndex];
    updateProcessingOverlay(true, "Đang kết xuất ảnh...", "Đang xử lý từng nét vẽ ở độ phân giải gốc...", 30);

    const prevSelectedId = globalState.selectedBlockId;
    globalState.selectedBlockId = null;
    requestOverlayRender();
    await waitForNextPaint();

    const container = elements.mangaCanvasContainer;

    try {
        container.classList.add('exporting-mode');
        await waitForImageReady(elements.mangaBgImage, page.src);
        updateProcessingOverlay(true, "Đang xử lý xuất...", "Đang tạo bản vẽ ở độ phân giải gốc...", 60);

        await waitForNextPaint();
        await document.fonts.ready;

        let mimeType = 'image/png';
        let quality = undefined;
        let ext = 'png';

        if (page.originalFile && page.originalFile.type) {
            const origType = page.originalFile.type;
            if (origType === 'image/jpeg' || origType === 'image/jpg') {
                mimeType = 'image/jpeg';
                quality = 0.95;
                ext = 'jpg';
            } else if (origType === 'image/webp') {
                mimeType = 'image/webp';
                quality = 0.95;
                ext = 'webp';
            }
        } else if (page.name) {
            const nameLower = page.name.toLowerCase();
            if (nameLower.endsWith('.jpg') || nameLower.endsWith('.jpeg')) {
                mimeType = 'image/jpeg';
                quality = 0.95;
                ext = 'jpg';
            } else if (nameLower.endsWith('.webp')) {
                mimeType = 'image/webp';
                quality = 0.95;
                ext = 'webp';
            }
        }

        let canvas;
        try {
            canvas = await renderPageToCanvas2D(page);
        } catch (c2dErr) {
            console.warn("Canvas 2D Export fallback to html2canvas:", c2dErr);
            canvas = await html2canvas(container, {
                useCORS: true,
                allowTaint: true,
                scale: 2,
                backgroundColor: null,
                logging: false,
                scrollX: 0,
                scrollY: 0
            });
        }

        const pngBlob = await new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Không thể chuyển canvas sang Blob.'));
            }, mimeType, quality);
        });
        const objectUrl = URL.createObjectURL(pngBlob);
        const exportName = `translated_${getCleanFileBaseName(page.name)}.${ext}`;

        if (exportPreviewObjectUrl) URL.revokeObjectURL(exportPreviewObjectUrl);
        exportPreviewObjectUrl = objectUrl;
        elements.exportPreviewImg.src = objectUrl;
        elements.lnkExportDirectDownload.href = objectUrl;
        elements.lnkExportDirectDownload.download = exportName;

        updateProcessingOverlay(false);
        elements.exportModal.classList.remove('hidden');

        try {
            const tempDownloadLink = document.createElement('a');
            tempDownloadLink.href = objectUrl;
            tempDownloadLink.download = exportName;
            document.body.appendChild(tempDownloadLink);
            tempDownloadLink.click();
            document.body.removeChild(tempDownloadLink);
            showToast("Đã bắt đầu tải ảnh xuống máy!", "success");
        } catch (downloadErr) {
            console.warn("Direct programmatic download failed:", downloadErr);
        }

    } catch (err) {
        console.error("Export failure:", err);
        showToast(`Lỗi khi xuất ảnh: ${err.message}`, "error");
    } finally {
        container.classList.remove('exporting-mode');
        globalState.selectedBlockId = prevSelectedId;
        requestOverlayRender();
        updateProcessingOverlay(false);
    }
}

// Batch export all pages and package into a single zip file
async function runBatchExport() {
    if (globalState.pages.length === 0) return;

    showToast('Đang khởi động tiến trình đóng gói toàn bộ trang...', 'info');
    const prevPageIndex = globalState.activePageIndex;
    const prevSelectedId = globalState.selectedBlockId;

    updateProcessingOverlay(true, "Đang khởi tạo...", "Đang thiết lập hệ thống nén dữ liệu ZIP...", 5);

    globalState.selectedBlockId = null;

    const prevViewMode = globalState.viewMode;
    setViewMode('overlay');

    const container = elements.mangaCanvasContainer;

    const zip = new JSZip();
    let successCount = 0;

    try {
        container.classList.add('exporting-mode');
        for (let i = 0; i < globalState.pages.length; i++) {
            const page = globalState.pages[i];
            updateProcessingOverlay(true, `Kết xuất trang ${i + 1}/${globalState.pages.length}`, `Trang: ${page.name}`, Math.round((i / globalState.pages.length) * 100));

            selectPage(i);
            await waitForImageReady(elements.mangaBgImage, page.src);

            restorePageEraserDrawing(page);
            renderOverlays();

            await waitForNextPaint();
            await document.fonts.ready;

            try {
                let mimeType = 'image/png';
                let quality = undefined;
                let ext = 'png';

                if (page.originalFile && page.originalFile.type) {
                    const origType = page.originalFile.type;
                    if (origType === 'image/jpeg' || origType === 'image/jpg') {
                        mimeType = 'image/jpeg';
                        quality = 0.95;
                        ext = 'jpg';
                    } else if (origType === 'image/webp') {
                        mimeType = 'image/webp';
                        quality = 0.95;
                        ext = 'webp';
                    }
                } else if (page.name) {
                    const nameLower = page.name.toLowerCase();
                    if (nameLower.endsWith('.jpg') || nameLower.endsWith('.jpeg')) {
                        mimeType = 'image/jpeg';
                        quality = 0.95;
                        ext = 'jpg';
                    } else if (nameLower.endsWith('.webp')) {
                        mimeType = 'image/webp';
                        quality = 0.95;
                        ext = 'webp';
                    }
                }

                let canvas;
                try {
                    canvas = await renderPageToCanvas2D(page);
                } catch (c2dErr) {
                    canvas = await html2canvas(container, {
                        useCORS: true,
                        allowTaint: true,
                        scale: 2,
                        backgroundColor: null,
                        logging: false
                    });
                }

                const pngBlob = await new Promise((resolve, reject) => {
                    canvas.toBlob((blob) => {
                        if (blob) resolve(blob);
                        else reject(new Error('Không thể chuyển canvas sang Blob.'));
                    }, mimeType, quality);
                });

                const finalExportName = `translated_${getCleanFileBaseName(page.name, `page_${i + 1}`)}.${ext}`;
                zip.file(finalExportName, pngBlob);
                successCount++;
            } catch (err) {
                console.error(`Lỗi kết xuất tại trang ${i + 1}:`, err);
                showToast(`Lỗi kết xuất trang ${i + 1}: ${err.message}`, "error");
            }
        }

        if (successCount > 0) {
            updateProcessingOverlay(true, "Đang nén dữ liệu...", "Đang tạo file .zip tải về...", 95);
            try {
                const zipContent = await zip.generateAsync({ type: "blob" });
                const zipDownloadUrl = URL.createObjectURL(zipContent);

                const tempDownloadLink = document.createElement('a');
                tempDownloadLink.href = zipDownloadUrl;
                tempDownloadLink.download = `manga_studio_translated_${Date.now()}.zip`;
                document.body.appendChild(tempDownloadLink);
                tempDownloadLink.click();
                document.body.removeChild(tempDownloadLink);
                setTimeout(() => URL.revokeObjectURL(zipDownloadUrl), 1000);

                showToast(`Tải xuống tệp ZIP thành công! Đã nén ${successCount} trang.`, "success");
            } catch (zipErr) {
                console.error("Lỗi khi đóng gói file ZIP:", zipErr);
                showToast(`Lỗi khi đóng gói file ZIP: ${zipErr.message}`, "error");
            }
        } else {
            showToast("Không có trang nào được xuất thành công.", "error");
        }
    } finally {
        // Khôi phục hoàn toàn cấu hình
        container.classList.remove('exporting-mode');



        setViewMode(prevViewMode);
        if (prevPageIndex !== -1) {
            selectPage(prevPageIndex);
            globalState.selectedBlockId = prevSelectedId;
            requestOverlayRender();
        }
        updateProcessingOverlay(false);
    }
}

function closeExportModal() {
    elements.exportModal.classList.add('hidden');
    if (exportPreviewObjectUrl) {
        URL.revokeObjectURL(exportPreviewObjectUrl);
        exportPreviewObjectUrl = null;
    }
    elements.exportPreviewImg.src = '';
    elements.lnkExportDirectDownload.removeAttribute('href');
}

// Sidebar tab selector
function setRightTab(tab) {
    globalState.activeTab = tab;

    if (tab === 'edit') {
        elements.tabEdit.className = "flex-1 py-3 text-xs font-bold text-indigo-400 border-b-2 border-indigo-500 uppercase tracking-wider";
        elements.tabStyle.className = "flex-1 py-3 text-xs font-bold text-slate-400 hover:text-slate-200 uppercase tracking-wider";
        if (elements.tabToeic) elements.tabToeic.className = "flex-1 py-3 text-xs font-bold text-slate-400 hover:text-slate-200 uppercase tracking-wider";
        elements.panelTabEdit.classList.remove('hidden');
        elements.panelTabStyle.classList.add('hidden');
        if (elements.panelTabToeic) elements.panelTabToeic.classList.add('hidden');
    } else if (tab === 'style') {
        elements.tabStyle.className = "flex-1 py-3 text-xs font-bold text-indigo-400 border-b-2 border-indigo-500 uppercase tracking-wider";
        elements.tabEdit.className = "flex-1 py-3 text-xs font-bold text-slate-400 hover:text-slate-200 uppercase tracking-wider";
        if (elements.tabToeic) elements.tabToeic.className = "flex-1 py-3 text-xs font-bold text-slate-400 hover:text-slate-200 uppercase tracking-wider";
        elements.panelTabStyle.classList.remove('hidden');
        elements.panelTabEdit.classList.add('hidden');
        if (elements.panelTabToeic) elements.panelTabToeic.classList.add('hidden');
    } else if (tab === 'toeic') {
        if (elements.tabToeic) elements.tabToeic.className = "flex-1 py-3 text-xs font-bold text-indigo-400 border-b-2 border-indigo-500 uppercase tracking-wider";
        elements.tabEdit.className = "flex-1 py-3 text-xs font-bold text-slate-400 hover:text-slate-200 uppercase tracking-wider";
        elements.tabStyle.className = "flex-1 py-3 text-xs font-bold text-slate-400 hover:text-slate-200 uppercase tracking-wider";
        if (elements.panelTabToeic) elements.panelTabToeic.classList.remove('hidden');
        elements.panelTabEdit.classList.add('hidden');
        elements.panelTabStyle.classList.add('hidden');

        // Cập nhật giao diện TOEIC khi chuyển tab
        updateToeicTabUI();
    }
}

function closeMobileMenus() {
    document.body.classList.remove('mobile-menu-left-open', 'mobile-menu-right-open');
}

function applyWorkspaceToolbarState() {
    const toolbarBtn = document.getElementById('toolbar-collapse-btn');
    const collapsed = document.body.classList.contains('mobile-toolbar-collapsed');

    if (toolbarBtn) {
        const icon = toolbarBtn.querySelector('i');
        const label = toolbarBtn.querySelector('span');
        if (icon) {
            icon.className = collapsed
                ? 'fa-solid fa-chevron-down text-[11px]'
                : 'fa-solid fa-chevron-up text-[11px]';
        }
        if (label) {
            label.textContent = collapsed ? 'Mở' : 'Thu gọn';
        }
    }
}

function toggleWorkspaceToolbarCollapse(forceState) {
    const shouldCollapse = typeof forceState === 'boolean'
        ? forceState
        : !document.body.classList.contains('mobile-toolbar-collapsed');

    if (shouldCollapse) {
        document.body.classList.add('mobile-toolbar-collapsed');
        globalState.toolbarCollapsedMobile = true;
        localStorage.setItem('gemini_manga_mobile_toolbar_collapsed', 'true');
    } else {
        document.body.classList.remove('mobile-toolbar-collapsed');
        globalState.toolbarCollapsedMobile = false;
        localStorage.setItem('gemini_manga_mobile_toolbar_collapsed', 'false');
    }

    applyWorkspaceToolbarState();
}

function syncMobileToolbarState() {
    const savedCollapsed = localStorage.getItem('gemini_manga_mobile_toolbar_collapsed');
    const isMobile = window.innerWidth <= 1024;

    if (!isMobile) {
        document.body.classList.remove('mobile-toolbar-collapsed');
        applyWorkspaceToolbarState();
        return;
    }

    const collapsed = savedCollapsed === null ? false : savedCollapsed === 'true';
    document.body.classList.toggle('mobile-toolbar-collapsed', collapsed);
    globalState.toolbarCollapsedMobile = collapsed;
    applyWorkspaceToolbarState();
}

function toggleMobilePanel(panel) {
    const isLeftOpen = document.body.classList.contains('mobile-menu-left-open');
    const isRightOpen = document.body.classList.contains('mobile-menu-right-open');

    if (panel === 'left') {
        if (isLeftOpen) {
            closeMobileMenus();
        } else {
            document.body.classList.add('mobile-menu-left-open');
            document.body.classList.remove('mobile-menu-right-open');
        }
    } else if (panel === 'right') {
        if (isRightOpen) {
            closeMobileMenus();
        } else {
            document.body.classList.add('mobile-menu-right-open');
            document.body.classList.remove('mobile-menu-left-open');
        }
    }
}

function syncMobileMenuState() {
    if (window.innerWidth > 1024) {
        closeMobileMenus();
    }
}

// Progress loading modal control (Strictly used for blocking export actions)
function updateProcessingOverlay(show, title = "Đang xử lý...", subtitle = "Vui lòng đợi...", progress = 0) {
    if (show) {
        elements.processingOverlay.classList.remove('hidden');
        elements.processingTitle.innerText = title;
        elements.processingSubtitle.innerText = subtitle;
        elements.processingBar.style.width = `${progress}%`;
    } else {
        elements.processingOverlay.classList.add('hidden');
    }
}

// Cập nhật giao diện thanh tiến trình chạy ngầm (Non-blocking background progress overlay)
function updateBackgroundTaskOverlay(show, title = "", subtitle = "", progress = 0) {
    const panel = document.getElementById('bg-task-panel');
    if (!panel) return;
    if (show) {
        panel.classList.remove('hidden');
        document.getElementById('bg-task-title').innerText = title;
        document.getElementById('bg-task-subtitle').innerText = subtitle;
        document.getElementById('bg-task-bar').style.width = `${progress}%`;
    } else {
        panel.classList.add('hidden');
    }
}

// Dừng tiến trình dịch thuật ngầm chủ động
function cancelBatchTranslation() {
    cancelTranslationFlag = true;
    showToast("Đang dừng tiến trình dịch thuật ngầm theo yêu cầu...", "warn");
}

// Toast notifications display helper
function showToast(message, type = 'info') {
    const toast = document.createElement('div');

    let colorClasses = 'bg-slate-900 border-slate-800 text-slate-300';
    let icon = '<i class="fa-solid fa-circle-info text-blue-400"></i>';

    if (type === 'success') {
        colorClasses = 'bg-emerald-950/90 border-emerald-500/30 text-emerald-200';
        icon = '<i class="fa-solid fa-circle-check text-emerald-400"></i>';
    } else if (type === 'error') {
        colorClasses = 'bg-red-950/90 border-red-500/30 text-red-200';
        icon = '<i class="fa-solid fa-circle-exclamation text-red-400"></i>';
    } else if (type === 'warn') {
        colorClasses = 'bg-amber-950/90 border-amber-500/30 text-amber-200';
        icon = '<i class="fa-solid fa-triangle-exclamation text-amber-400"></i>';
    }

    toast.className = `flex items-center space-x-3 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md pointer-events-auto transition-all duration-300 translate-y-2 opacity-0 ${colorClasses}`;
    const iconWrapper = document.createElement('span');
    iconWrapper.innerHTML = icon;
    const messageText = document.createElement('span');
    messageText.className = "text-xs font-semibold leading-normal";
    messageText.textContent = message;

    toast.appendChild(iconWrapper);
    toast.appendChild(messageText);

    elements.toastContainer.appendChild(toast);

    // Trigger transition layout frame
    setTimeout(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    // Automatically clean toast
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => {
            elements.toastContainer.removeChild(toast);
        }, 300);
    }, 4000);
}

window.addEventListener('beforeunload', () => {
    globalState.pages.forEach((page) => {
        if (page?.apiSrc?.startsWith('blob:')) {
            URL.revokeObjectURL(page.apiSrc);
        }
        if (page?.src?.startsWith('blob:')) {
            URL.revokeObjectURL(page.src);
        }
        if (page?.thumbnailSrc?.startsWith('blob:')) {
            URL.revokeObjectURL(page.thumbnailSrc);
        }
    });
    if (exportPreviewObjectUrl) {
        URL.revokeObjectURL(exportPreviewObjectUrl);
        exportPreviewObjectUrl = null;
    }
});

// --- INDEXEDDB PERSISTENCE MANAGER FOR AUTO-SAVE & RESTORE ---
const DB_NAME = 'MangaTranslatorDB';
const DB_VERSION = 2; // Nâng cấp lên v2 để hỗ trợ lưu phông chữ cá nhân
const STORE_PAGES = 'pages';
const STORE_META = 'meta';
const STORE_FONTS = 'fonts'; // Bảng lưu phông chữ nhị phân
let dbInstance = null;
let savePageDebounceTimer = null;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const database = e.target.result;
            if (!database.objectStoreNames.contains(STORE_PAGES)) {
                database.createObjectStore(STORE_PAGES, { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains(STORE_META)) {
                database.createObjectStore(STORE_META);
            }
            if (!database.objectStoreNames.contains(STORE_FONTS)) {
                database.createObjectStore(STORE_FONTS, { keyPath: 'family' });
            }
        };
        request.onsuccess = (e) => {
            dbInstance = e.target.result;
            resolve(dbInstance);
        };
        request.onerror = (e) => {
            reject(e.target.error);
        };
    });
}

function savePageToDB(page) {
    if (!dbInstance) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([STORE_PAGES], 'readwrite');
        const store = transaction.objectStore(STORE_PAGES);

        // Dọn dẹp các khối blocks để loại bỏ các thuộc tính DOM không thể clone (như HTMLCanvasElement trong maskCache)
        const cleanBlocks = (page.blocks || []).map(block => {
            const cleanBlock = {
                id: block.id,
                type: block.type,
                original: block.original,
                translated: block.translated,
                box: { ...block.box },
                style: { ...block.style }
            };
            if (block.textWidth !== undefined) cleanBlock.textWidth = block.textWidth;
            if (block.textHeight !== undefined) cleanBlock.textHeight = block.textHeight;
            cleanBlock.maskCache = null;
            cleanBlock.autoFitCache = null;
            return cleanBlock;
        });

        // Clone dữ liệu trang nhưng bỏ qua các blob URL tạm thời sẽ bị hỏng khi reload
        const pageToSave = {
            id: page.id,
            name: page.name,
            width: page.width,
            height: page.height,
            apiWidth: page.apiWidth,
            apiHeight: page.apiHeight,
            status: page.status,
            blocks: cleanBlocks,
            file: page.file,
            originalFile: page.originalFile,
            eraserLayerBlob: page.eraserLayerBlob,
            thumbnailBlob: page.thumbnailBlob
        };

        const request = store.put(pageToSave);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

function debounceSavePage(page) {
    clearTimeout(savePageDebounceTimer);
    savePageDebounceTimer = setTimeout(() => {
        pushStateToHistory(); // Lưu trạng thái văn bản sau khi gõ xong
        savePageToDB(page);
    }, 1000);
}

function deletePageFromDB(pageId) {
    if (!dbInstance) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([STORE_PAGES], 'readwrite');
        const store = transaction.objectStore(STORE_PAGES);
        const request = store.delete(pageId);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

function saveProjectMeta(pageIds, activePageIndex) {
    if (!dbInstance) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([STORE_META], 'readwrite');
        const store = transaction.objectStore(STORE_META);
        const request = store.put({ pageIds, activePageIndex }, 'project_meta');
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

function loadProjectFromDB() {
    if (!dbInstance) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([STORE_PAGES, STORE_META], 'readonly');
        const metaStore = transaction.objectStore(STORE_META);
        const pagesStore = transaction.objectStore(STORE_PAGES);

        let metaRequest = metaStore.get('project_meta');
        metaRequest.onsuccess = (e) => {
            const meta = e.target.result;
            if (!meta || !meta.pageIds || meta.pageIds.length === 0) {
                resolve(null);
                return;
            }

            let pagesRequest = pagesStore.getAll();
            pagesRequest.onsuccess = (ev) => {
                const rawPages = ev.target.result;
                const pagesMap = new Map(rawPages.map(p => [p.id, p]));

                const pages = [];
                meta.pageIds.forEach(id => {
                    const p = pagesMap.get(id);
                    if (p) {
                        // Thiết lập null ban đầu để tiết kiệm RAM, sẽ kích hoạt động khi hiển thị
                        p.src = null;
                        p.apiSrc = null;

                        // Tạo thumbnailSrc từ thumbnailBlob đã lưu trữ
                        if (p.thumbnailBlob) {
                            p.thumbnailSrc = URL.createObjectURL(p.thumbnailBlob);
                        } else {
                            // Tương thích ngược: sử dụng tạm ảnh file và chạy nền tạo thumbnail cho lần sau
                            p.thumbnailSrc = URL.createObjectURL(p.file || p.originalFile);
                            setTimeout(() => generateAndSaveThumbnailForPage(p), 100);
                        }
                        pages.push(p);
                    }
                });

                resolve({
                    pages,
                    activePageIndex: meta.activePageIndex
                });
            };
            pagesRequest.onerror = (ev) => reject(ev.target.error);
        };
        metaRequest.onerror = (e) => reject(e.target.error);
    });
}

function clearProjectDB() {
    if (!dbInstance) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([STORE_PAGES, STORE_META], 'readwrite');
        transaction.objectStore(STORE_PAGES).clear();
        transaction.objectStore(STORE_META).clear();
        transaction.oncomplete = () => resolve();
        transaction.onerror = (e) => reject(e.target.error);
    });
}

// Clear project action called from HTML button
function clearCurrentProject() {
    if (globalState.pages.length === 0) {
        showToast("Không có dự án nào đang mở để xoá.", "info");
        return;
    }
    if (!confirm("Bạn có chắc chắn muốn xóa toàn bộ dự án hiện tại không? Tất cả các trang và bản dịch sẽ bị xóa vĩnh viễn.")) {
        return;
    }

    // Revoke all existing blob URLs to prevent memory leak
    globalState.pages.forEach(page => {
        if (page.src?.startsWith('blob:')) URL.revokeObjectURL(page.src);
        if (page.apiSrc?.startsWith('blob:')) URL.revokeObjectURL(page.apiSrc);
        if (page.thumbnailSrc?.startsWith('blob:')) URL.revokeObjectURL(page.thumbnailSrc);
    });

    globalState.pages = [];
    globalState.activePageIndex = -1;
    globalState.selectedBlockId = null;

    clearProjectDB().then(() => {
        undoStack = [];
        redoStack = [];
        updateUndoRedoUI();
        elements.mangaCanvasContainer.classList.add('hidden');
        elements.workspaceSplitWrapper.classList.add('hidden');
        elements.workspaceEmptyState.classList.remove('hidden');
        elements.btnActiveTranslate.disabled = true;
        elements.btnExportPage.disabled = true;
        elements.btnEraserMode.disabled = true;
        updatePageListUI();
        updateActiveBlockEditor();
        showToast("Đã xóa sạch dự án hiện tại.", "info");
    }).catch(err => {
        console.error("Lỗi khi xoá dữ liệu database:", err);
        showToast("Lỗi khi xoá cơ sở dữ liệu.", "error");
    });
}

// --- CUSTOM FONTS MANAGER ---
async function loadAndRegisterCustomFonts() {
    if (!dbInstance) return;
    try {
        const fonts = await getAllFontsFromDB();
        for (const font of fonts) {
            await registerCustomFont(font.family, font.blob);
        }
    } catch (err) {
        console.error("Lỗi khi tải phông chữ tùy chỉnh từ DB:", err);
    }
}

function getAllFontsFromDB() {
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([STORE_FONTS], 'readonly');
        const store = transaction.objectStore(STORE_FONTS);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = (e) => reject(e.target.error);
    });
}

function saveFontToDB(family, blob) {
    if (!dbInstance) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([STORE_FONTS], 'readwrite');
        const store = transaction.objectStore(STORE_FONTS);
        const request = store.put({ family, blob });
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

async function registerCustomFont(family, blob) {
    let fontUrl = null;
    try {
        fontUrl = URL.createObjectURL(blob);
        const fontFace = new FontFace(family, `url(${fontUrl})`);
        const loadedFace = await fontFace.load();
        document.fonts.add(loadedFace);

        // Thêm option vào thẻ select style-font
        const fontSelect = document.getElementById('style-font');
        if (fontSelect) {
            let exists = false;
            for (let i = 0; i < fontSelect.options.length; i++) {
                if (fontSelect.options[i].value === family) {
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                const opt = document.createElement('option');
                opt.value = family;
                opt.textContent = `${family} (Custom)`;
                fontSelect.appendChild(opt);
            }
        }
    } catch (err) {
        console.error(`Không thể tải và đăng ký phông chữ ${family}:`, err);
    } finally {
        if (fontUrl) {
            URL.revokeObjectURL(fontUrl);
        }
    }
}

async function uploadCustomFonts(files) {
    if (!files || files.length === 0) return;
    showToast("Đang nạp phông chữ tùy chỉnh...", "info");

    let loadedCount = 0;
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const family = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').trim();
        if (!family) continue;

        try {
            await saveFontToDB(family, file);
            await registerCustomFont(family, file);
            loadedCount++;
        } catch (err) {
            console.error(`Lỗi lưu font ${file.name}:`, err);
        }
    }

    if (loadedCount > 0) {
        showToast(`Đã nạp thành công ${loadedCount} phông chữ mới!`, "success");
        requestOverlayRender();
    }
}

window.uploadCustomFonts = uploadCustomFonts;

// --- UNDO / REDO CONTROLLERS ---
function pushStateToHistory() {
    const currentState = globalState.pages.map(page => ({
        id: page.id,
        status: page.status,
        blocks: page.blocks.map(block => ({
            id: block.id,
            type: block.type,
            original: block.original,
            translated: block.translated,
            box: { ...block.box },
            style: { ...block.style }
        }))
    }));

    undoStack.push({
        pagesState: currentState,
        activePageIndex: globalState.activePageIndex,
        selectedBlockId: globalState.selectedBlockId
    });

    if (undoStack.length > MAX_HISTORY_LIMIT) {
        undoStack.shift();
    }

    redoStack.length = 0;
    updateUndoRedoUI();
}

function restoreHistoryState(historyItem) {
    if (!historyItem) return;

    globalState.pages.forEach((page) => {
        const histPage = historyItem.pagesState.find(p => p.id === page.id);
        if (histPage) {
            page.status = histPage.status;
            page.blocks = histPage.blocks.map(block => ({
                id: block.id,
                type: block.type,
                original: block.original,
                translated: block.translated,
                box: { ...block.box },
                style: { ...block.style }
            }));
        }
    });

    globalState.activePageIndex = historyItem.activePageIndex;
    globalState.selectedBlockId = historyItem.selectedBlockId;

    globalState.pages.forEach(page => {
        savePageToDB(page);
    });

    updatePageListUI();
    if (globalState.activePageIndex !== -1) {
        selectPage(globalState.activePageIndex);
    } else {
        elements.mangaCanvasContainer.classList.add('hidden');
        elements.workspaceSplitWrapper.classList.add('hidden');
        elements.workspaceEmptyState.classList.remove('hidden');
    }
    requestOverlayRender();
    updateActiveBlockEditor();
}

function executeUndo() {
    if (undoStack.length === 0) return;

    const currentState = globalState.pages.map(page => ({
        id: page.id,
        status: page.status,
        blocks: page.blocks.map(block => ({
            id: block.id,
            type: block.type,
            original: block.original,
            translated: block.translated,
            box: { ...block.box },
            style: { ...block.style }
        }))
    }));

    redoStack.push({
        pagesState: currentState,
        activePageIndex: globalState.activePageIndex,
        selectedBlockId: globalState.selectedBlockId
    });

    const previous = undoStack.pop();
    restoreHistoryState(previous);
    updateUndoRedoUI();
    showToast("Đã Hoàn tác (Undo)!", "info");
}

function executeRedo() {
    if (redoStack.length === 0) return;

    const currentState = globalState.pages.map(page => ({
        id: page.id,
        status: page.status,
        blocks: page.blocks.map(block => ({
            id: block.id,
            type: block.type,
            original: block.original,
            translated: block.translated,
            box: { ...block.box },
            style: { ...block.style }
        }))
    }));

    undoStack.push({
        pagesState: currentState,
        activePageIndex: globalState.activePageIndex,
        selectedBlockId: globalState.selectedBlockId
    });

    const nextState = redoStack.pop();
    restoreHistoryState(nextState);
    updateUndoRedoUI();
    showToast("Đã Làm lại (Redo)!", "info");
}

function updateUndoRedoUI() {
    if (elements.btnUndo) {
        elements.btnUndo.disabled = undoStack.length === 0;
    }
    if (elements.btnRedo) {
        elements.btnRedo.disabled = redoStack.length === 0;
    }
}

window.executeUndo = executeUndo;
window.executeRedo = executeRedo;

// --- MANUAL ERASER BRUSH CONTROLLER ---
let isEraserModeActive = false;
let isDrawingOnEraser = false;
let eraserBrushSize = 15;
let eraserColor = '#ffffff';
let lastX = 0;
let lastY = 0;

// Các biến phục vụ chế độ Sao chép (Clone Stamp)
let eraserToolMode = 'paint'; // 'paint' hoặc 'clone'
let cloneSourceX = null;
let cloneSourceY = null;
let isSelectingCloneSource = false;
let startTargetX = 0;
let startTargetY = 0;

function toggleEraserMode() {
    if (globalState.activePageIndex === -1) return;

    isEraserModeActive = !isEraserModeActive;

    if (isEraserModeActive) {
        // Reset về chế độ cọ vẽ thường mỗi khi bật cọ tẩy
        eraserToolMode = 'paint';
        cloneSourceX = null;
        cloneSourceY = null;
        isSelectingCloneSource = false;
        setEraserTool('paint');

        elements.eraserSettingsPanel.classList.remove('hidden');
        elements.btnEraserMode.classList.add('bg-indigo-600', 'text-white');
        elements.btnEraserMode.classList.remove('bg-slate-800', 'text-slate-300');

        elements.eraserCanvas.classList.add('drawing-active');
        elements.mangaOverlaysContainer.classList.add('pointer-events-none');

        initEraserDrawingEvents();
        showToast("Đã bật chế độ cọ tẩy. Dùng chuột/bút vẽ trực tiếp lên ảnh để xóa.", "info");
    } else {
        elements.eraserSettingsPanel.classList.add('hidden');
        elements.btnEraserMode.classList.remove('bg-indigo-600', 'text-white');
        elements.btnEraserMode.classList.add('bg-slate-800', 'text-slate-300');

        elements.eraserCanvas.classList.remove('drawing-active');
        elements.mangaOverlaysContainer.classList.remove('pointer-events-none');

        // Ẩn marker tâm sao chép
        updateCloneMarkerVisibility();

        saveEraserDrawingToPage();
    }
}

function updateEraserBrushSize(val) {
    eraserBrushSize = parseInt(val);
    if (elements.lblEraserBrushSize) {
        elements.lblEraserBrushSize.innerText = `${val}px`;
    }
    updateCloneMarkerVisibility();
}

function setEraserColor(color) {
    eraserColor = color;
    if (elements.eraserColorCustom) {
        elements.eraserColorCustom.value = color;
    }
}

// Hàm chọn công cụ vẽ/sao chép
function setEraserTool(tool) {
    eraserToolMode = tool;
    const btnPaint = document.getElementById('btn-eraser-tool-paint');
    const btnClone = document.getElementById('btn-eraser-tool-clone');
    const cloneSettings = document.getElementById('clone-stamp-settings');
    const marker = document.getElementById('clone-source-marker');

    if (tool === 'paint') {
        if (btnPaint) btnPaint.className = "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-600 text-white transition-all";
        if (btnClone) btnClone.className = "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-all";
        if (cloneSettings) cloneSettings.classList.add('hidden');
        if (marker) marker.classList.add('hidden');
        isSelectingCloneSource = false;
        elements.eraserCanvas.style.cursor = 'crosshair';
    } else {
        if (btnPaint) btnPaint.className = "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-all";
        if (btnClone) btnClone.className = "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-600 text-white transition-all";
        if (cloneSettings) cloneSettings.classList.remove('hidden');
        updateCloneMarkerVisibility();
        elements.eraserCanvas.style.cursor = isSelectingCloneSource ? 'cell' : 'crosshair';
        if (cloneSourceX === null) {
            activateCloneSourceSelector();
        }
    }
}

// Bật chế độ nhấp chọn tâm mẫu sao chép
function activateCloneSourceSelector() {
    isSelectingCloneSource = true;
    elements.eraserCanvas.style.cursor = 'cell';
    const status = document.getElementById('lbl-clone-source-status');
    if (status) {
        status.innerText = "Click chọn mẫu...";
        status.className = "text-[10px] text-amber-400 font-bold uppercase tracking-wider animate-pulse";
    }
    showToast("Nhấp chuột lên ảnh để chọn điểm nguồn muốn sao chép.", "info");
}

// Cập nhật hiển thị vòng tròn tâm mẫu sao chép
function updateCloneMarkerVisibility() {
    const marker = document.getElementById('clone-source-marker');
    if (!marker) return;
    if (isEraserModeActive && eraserToolMode === 'clone' && cloneSourceX !== null && cloneSourceY !== null) {
        marker.classList.remove('hidden');
        updateCloneMarkerPosition(lastX, lastY);
    } else {
        marker.classList.add('hidden');
    }
}

// Cập nhật vị trí và kích thước vòng tròn tâm mẫu sao chép trên màn hình
function updateCloneMarkerPosition(tx, ty) {
    const marker = document.getElementById('clone-source-marker');
    const canvas = elements.eraserCanvas;
    if (!marker || !canvas || cloneSourceX === null || cloneSourceY === null) return;

    // Tính toán tọa độ nguồn hiện tại dựa trên khoảng cách di chuột từ điểm nhấp vẽ đầu tiên
    let sx = cloneSourceX;
    let sy = cloneSourceY;
    if (isDrawingOnEraser) {
        const dx = tx - startTargetX;
        const dy = ty - startTargetY;
        sx += dx;
        sy += dy;
    }

    // Đổi tọa độ thực tế trên canvas thành phần trăm hiển thị
    const pctX = (sx / canvas.width) * 100;
    const pctY = (sy / canvas.height) * 100;

    marker.style.left = `${pctX}%`;
    marker.style.top = `${pctY}%`;

    // Tính kích thước hiển thị (scale theo kích thước thực tế hiển thị trên trình duyệt)
    const scaleRatio = canvas.clientWidth / canvas.width;
    const displaySize = Math.max(8, eraserBrushSize * scaleRatio);
    marker.style.width = `${displaySize}px`;
    marker.style.height = `${displaySize}px`;
}

function initEraserDrawingEvents() {
    const canvas = elements.eraserCanvas;
    const ctx = canvas.getContext('2d');

    canvas.onmousedown = null;
    canvas.onmousemove = null;
    canvas.onmouseup = null;
    canvas.onmouseleave = null;
    canvas.ontouchstart = null;
    canvas.ontouchmove = null;
    canvas.ontouchend = null;

    const getMousePos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const x = ((clientX - rect.left) / rect.width) * canvas.width;
        const y = ((clientY - rect.top) / rect.height) * canvas.height;
        return { x, y };
    };

    // Vẽ mẫu thử copy đè lên vị trí đích
    const drawStamp = (tx, ty) => {
        const dx = tx - startTargetX;
        const dy = ty - startTargetY;
        const sx = cloneSourceX + dx;
        const sy = cloneSourceY + dy;

        ctx.save();
        ctx.beginPath();
        ctx.arc(tx, ty, eraserBrushSize / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(
            elements.mangaBgImage,
            sx - eraserBrushSize / 2, sy - eraserBrushSize / 2, eraserBrushSize, eraserBrushSize,
            tx - eraserBrushSize / 2, ty - eraserBrushSize / 2, eraserBrushSize, eraserBrushSize
        );
        ctx.restore();
    };

    const startDraw = (e) => {
        e.preventDefault();
        const pos = getMousePos(e);

        if (isSelectingCloneSource) {
            cloneSourceX = pos.x;
            cloneSourceY = pos.y;
            isSelectingCloneSource = false;
            canvas.style.cursor = 'crosshair';

            const status = document.getElementById('lbl-clone-source-status');
            if (status) {
                status.innerText = `Tâm: ${Math.round(pos.x)},${Math.round(pos.y)}`;
                status.className = "text-[10px] text-emerald-400 font-bold uppercase tracking-wider";
            }
            updateCloneMarkerVisibility();
            showToast("Đã chọn tâm mẫu thành công! Bắt đầu vẽ để sao chép.", "success");
            return;
        }

        if (eraserToolMode === 'clone' && (cloneSourceX === null || cloneSourceY === null)) {
            showToast("Vui lòng click nút 'Chọn tâm mẫu' trước!", "warn");
            return;
        }

        isDrawingOnEraser = true;
        lastX = pos.x;
        lastY = pos.y;
        startTargetX = pos.x;
        startTargetY = pos.y;

        if (eraserToolMode === 'paint') {
            ctx.beginPath();
            ctx.arc(lastX, lastY, eraserBrushSize / 2, 0, Math.PI * 2);
            ctx.fillStyle = eraserColor;
            ctx.fill();
        } else if (eraserToolMode === 'clone') {
            drawStamp(lastX, lastY);
        }

        pushStateToHistory();
    };

    const draw = (e) => {
        const pos = getMousePos(e);

        // Cập nhật marker tâm sao chép khi di chuột
        if (eraserToolMode === 'clone') {
            updateCloneMarkerPosition(pos.x, pos.y);
        }

        if (!isDrawingOnEraser) return;
        e.preventDefault();

        if (eraserToolMode === 'paint') {
            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(pos.x, pos.y);
            ctx.strokeStyle = eraserColor;
            ctx.lineWidth = eraserBrushSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
        } else if (eraserToolMode === 'clone') {
            if (cloneSourceX === null || cloneSourceY === null) return;
            // Vẽ lấp đầy kẽ hở giữa các vị trí di chuột để nét vẽ liền mạch
            const dist = Math.hypot(pos.x - lastX, pos.y - lastY);
            const steps = Math.ceil(dist / (eraserBrushSize / 4)) || 1;
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const tx = lastX + (pos.x - lastX) * t;
                const ty = lastY + (pos.y - lastY) * t;
                drawStamp(tx, ty);
            }
        }

        lastX = pos.x;
        lastY = pos.y;
    };

    const stopDraw = () => {
        isDrawingOnEraser = false;
    };

    canvas.onmousedown = startDraw;
    canvas.onmousemove = draw;
    canvas.onmouseup = stopDraw;
    canvas.onmouseleave = stopDraw;

    canvas.ontouchstart = startDraw;
    canvas.ontouchmove = draw;
    canvas.ontouchend = stopDraw;
}

function clearEraserDrawing() {
    if (globalState.activePageIndex === -1) return;
    const canvas = elements.eraserCanvas;
    const ctx = canvas.getContext('2d');
    pushStateToHistory();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    saveEraserDrawingToPage();
    showToast("Đã xóa nét vẽ trên trang.", "info");
}



async function saveEraserDrawingToPage() {
    if (globalState.activePageIndex === -1) return;
    const page = globalState.pages[globalState.activePageIndex];
    const canvas = elements.eraserCanvas;

    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hasDrawings = imgData.data.some(val => val !== 0);

    if (hasDrawings) {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        page.eraserLayerBlob = blob;
    } else {
        page.eraserLayerBlob = null;
    }

    savePageToDB(page);
}

function restorePageEraserDrawing(page) {
    const canvas = elements.eraserCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    canvas.width = elements.mangaBgImage.naturalWidth || page.width || 1200;
    canvas.height = elements.mangaBgImage.naturalHeight || page.height || 1600;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (page.eraserLayerBlob) {
        const img = new Image();
        const url = URL.createObjectURL(page.eraserLayerBlob);
        img.onload = () => {
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
        };
        img.src = url;
    }
}

window.isEraserModeActive = isEraserModeActive;
window.toggleEraserMode = toggleEraserMode;
window.updateEraserBrushSize = updateEraserBrushSize;
window.setEraserColor = setEraserColor;
window.setEraserTool = setEraserTool;
window.activateCloneSourceSelector = activateCloneSourceSelector;
window.clearEraserDrawing = clearEraserDrawing;



// --- EXPORT TRANSLATION SCRIPT ---
function promptExportScript() {
    if (globalState.pages.length === 0) return;

    const choice = confirm("Bấm OK để tải kịch bản dạng Văn Bản (.txt) trình bày rõ ràng.\nBấm CANCEL để tải dữ liệu Cấu Trúc (.json) cho lập trình.");
    if (choice) {
        exportTranslationScript('txt');
    } else {
        exportTranslationScript('json');
    }
}

function exportTranslationScript(format) {
    if (globalState.pages.length === 0) {
        showToast("Không có trang truyện nào để xuất kịch bản.", "error");
        return;
    }

    let fileContent = "";
    let mimeType = "text/plain";
    let fileName = `translation_script_${Date.now()}`;

    if (format === 'txt') {
        fileName += ".txt";
        fileContent += `==================================================\n`;
        fileContent += `  KỊCH BẢN DỊCH THUẬT MANGA - MANGA TRANSLATOR STUDIO\n`;
        fileContent += `  Thời gian xuất: ${new Date().toLocaleString()}\n`;
        fileContent += `==================================================\n\n`;

        globalState.pages.forEach((page, index) => {
            fileContent += `[TRANG ${index + 1}: ${page.name || 'Không rõ tên'}]\n`;
            fileContent += `--------------------------------------------------\n`;

            const dialogueBlocks = (page.blocks || []).filter(b => b.type === 'dialogue');
            const otherBlocks = (page.blocks || []).filter(b => b.type !== 'dialogue');

            fileContent += `* Ô THOẠI (Dialogues):\n`;
            if (dialogueBlocks.length === 0) {
                fileContent += `  (Không có ô thoại nào)\n`;
            } else {
                dialogueBlocks.forEach((block, bIdx) => {
                    fileContent += `  ${bIdx + 1}. [Gốc]: "${block.original || '(Rỗng)'}"\n`;
                    fileContent += `     [Dịch]: "${block.translated || ''}"\n\n`;
                });
            }

            if (otherBlocks.length > 0) {
                fileContent += `* DẪN CHUYỆN & SFX:\n`;
                otherBlocks.forEach((block, bIdx) => {
                    const typeLabel = block.type === 'narration' ? 'Dẫn truyện' : (block.type === 'sfx' ? 'SFX' : 'Khác');
                    fileContent += `  ${bIdx + 1}. [${typeLabel}] [Gốc]: "${block.original || '(Rỗng)'}"\n`;
                    fileContent += `     [Dịch]: "${block.translated || ''}"\n\n`;
                });
            }
            fileContent += `\n`;
        });
    } else if (format === 'json') {
        fileName += ".json";
        mimeType = "application/json";

        const scriptData = globalState.pages.map((page, index) => ({
            pageIndex: index,
            pageName: page.name,
            blocks: (page.blocks || []).map(b => ({
                id: b.id,
                type: b.type,
                original: b.original,
                translated: b.translated,
                positionPercent: {
                    x: b.box.x,
                    y: b.box.y,
                    w: b.box.w,
                    h: b.box.h
                }
            }))
        }));
        fileContent = JSON.stringify(scriptData, null, 2);
    }

    // Trigger file download
    const blob = new Blob([fileContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();

    // Cleanup
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Đã xuất kịch bản thành công dưới định dạng ${format.toUpperCase()}!`, "success");
}

window.promptExportScript = promptExportScript;
window.exportTranslationScript = exportTranslationScript;

// --- FEATURE: COPY / PASTE STYLE ---
function copyBlockStyle() {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) {
        showToast("Chưa chọn ô thoại nào để sao chép định dạng!", "warn");
        return;
    }
    const page = globalState.pages[globalState.activePageIndex];
    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!block) return;

    copiedStyle = {
        fontFamily: block.style.fontFamily,
        fontSize: block.style.fontSize,
        textColor: block.style.textColor,
        bgColor: block.style.bgColor,
        bgOpacity: block.style.bgOpacity,
        padding: block.style.padding,
        rotate: block.style.rotate || 0,
        vertical: block.style.vertical,
        bold: block.style.bold,
        align: block.style.align,
        maskShape: block.style.maskShape,
        maskSize: block.style.maskSize
    };

    if (elements.btnPasteStyle) elements.btnPasteStyle.disabled = false;
    showToast("Đã sao chép định dạng ô thoại!", "success");
}

function pasteBlockStyle() {
    if (!copiedStyle) {
        showToast("Chưa có định dạng nào được sao chép!", "warn");
        return;
    }
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) {
        showToast("Chưa chọn ô thoại đích để dán định dạng!", "warn");
        return;
    }
    const page = globalState.pages[globalState.activePageIndex];
    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!block) return;

    pushStateToHistory();

    // Áp dụng tất cả thuộc tính style đã sao chép
    Object.keys(copiedStyle).forEach(key => {
        block.style[key] = copiedStyle[key];
    });

    // Nếu bật Auto-fit, tái tính cỡ chữ cho block đích
    if (globalState.autoFitEnabled) {
        autoFitBlock(block);
    }

    requestOverlayRender();
    updateActiveBlockEditor();
    savePageToDB(page);
    showToast("Đã dán định dạng thành công!", "success");
}

window.copyBlockStyle = copyBlockStyle;
window.pasteBlockStyle = pasteBlockStyle;

// --- FEATURE: KEYBOARD BLOCK NAVIGATION ---
function navigateBlocks(direction) {
    if (globalState.activePageIndex === -1) return;
    const page = globalState.pages[globalState.activePageIndex];
    if (!page || page.blocks.length === 0) return;

    const currentIndex = page.blocks.findIndex(b => b.id === globalState.selectedBlockId);

    let nextIndex;
    if (currentIndex === -1) {
        // Không có block nào đang chọn, chọn block đầu tiên hoặc cuối cùng
        nextIndex = direction > 0 ? 0 : page.blocks.length - 1;
    } else {
        nextIndex = currentIndex + direction;
        // Wrap-around: vòng lặp đầu cuối
        if (nextIndex < 0) nextIndex = page.blocks.length - 1;
        if (nextIndex >= page.blocks.length) nextIndex = 0;
    }

    selectBlock(page.blocks[nextIndex].id);

    // Cuộn ô thoại được chọn vào tầm nhìn trên workspace
    const selectedEl = document.getElementById(page.blocks[nextIndex].id);
    if (selectedEl) {
        selectedEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// --- FEATURE: IMPORT TRANSLATION SCRIPT ---
async function importTranslationScript(fileList) {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];

    if (!file.name.toLowerCase().endsWith('.json')) {
        showToast("Chỉ hỗ trợ nhập kịch bản định dạng JSON!", "error");
        return;
    }

    try {
        const text = await file.text();
        const scriptData = JSON.parse(text);

        if (!Array.isArray(scriptData)) {
            showToast("Dữ liệu kịch bản JSON không hợp lệ (thiếu mảng trang)!", "error");
            return;
        }

        pushStateToHistory();

        let matchedPages = 0;
        let matchedBlocks = 0;

        scriptData.forEach(scriptPage => {
            if (!scriptPage.blocks || !Array.isArray(scriptPage.blocks)) return;

            // Tìm trang tương ứng theo tên hoặc thứ tự trang
            let targetPage = null;

            if (scriptPage.page) {
                // Thử khớp theo tên file gốc
                targetPage = globalState.pages.find(p => p.name === scriptPage.page);
            }

            if (!targetPage && scriptPage.pageIndex !== undefined) {
                // Fallback: khớp theo chỉ số trang
                if (scriptPage.pageIndex >= 0 && scriptPage.pageIndex < globalState.pages.length) {
                    targetPage = globalState.pages[scriptPage.pageIndex];
                }
            }

            if (!targetPage) return;
            matchedPages++;

            scriptPage.blocks.forEach((scriptBlock, blockIdx) => {
                // Tìm block tương ứng theo id, hoặc theo thứ tự
                let targetBlock = null;

                if (scriptBlock.id) {
                    targetBlock = targetPage.blocks.find(b => b.id === scriptBlock.id);
                }

                if (!targetBlock && blockIdx < targetPage.blocks.length) {
                    targetBlock = targetPage.blocks[blockIdx];
                }

                if (!targetBlock) return;

                // Cập nhật bản dịch
                if (scriptBlock.translated !== undefined && scriptBlock.translated !== null) {
                    targetBlock.translated = scriptBlock.translated;
                    matchedBlocks++;
                }
            });

            savePageToDB(targetPage);
        });

        // Re-render trang hiện tại
        requestOverlayRender();
        updateActiveBlockEditor();

        showToast(`Đã nhập kịch bản thành công! Khớp ${matchedPages} trang, cập nhật ${matchedBlocks} ô thoại.`, "success");

    } catch (err) {
        console.error("Lỗi nhập kịch bản:", err);
        showToast(`Lỗi khi đọc/phân tích tệp JSON: ${err.message}`, "error");
    }

    // Reset input để cho phép nhập lại cùng file
    document.getElementById('import-script-input').value = '';
}

window.importTranslationScript = importTranslationScript;

// --- FEATURE: PREVIEW / READER MODE ---
let previewCurrentPage = 0;

function openPreviewMode() {
    if (globalState.pages.length === 0) {
        showToast("Chưa có trang truyện nào để xem trước!", "warn");
        return;
    }

    previewCurrentPage = Math.max(0, globalState.activePageIndex);
    elements.previewModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    renderPreviewPage();

    // Phím tắt điều hướng trong chế độ xem trước
    document.addEventListener('keydown', previewKeyHandler);
}

function closePreviewMode() {
    elements.previewModal.classList.add('hidden');
    document.body.style.overflow = '';
    elements.previewBody.innerHTML = '';
    document.removeEventListener('keydown', previewKeyHandler);
    garbageCollectPageCaches();
}

function previewKeyHandler(e) {
    if (e.key === 'Escape') {
        e.preventDefault();
        closePreviewMode();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        previewPrevPage();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        previewNextPage();
    }
}

function previewPrevPage() {
    if (previewCurrentPage > 0) {
        previewCurrentPage--;
        renderPreviewPage();
    }
}

function previewNextPage() {
    if (previewCurrentPage < globalState.pages.length - 1) {
        previewCurrentPage++;
        renderPreviewPage();
    }
}

function renderPreviewPage() {
    const page = globalState.pages[previewCurrentPage];
    if (!page) return;

    // Kích hoạt ảnh gốc cho trang preview
    activatePage(page);

    // Dọn dẹp rác các trang khác
    garbageCollectPageCaches();

    elements.previewPageIndicator.textContent = `Trang ${previewCurrentPage + 1}/${globalState.pages.length}`;
    elements.previewBody.innerHTML = '';

    // Tạo container cho trang (tương tự manga-canvas-container)
    const pageContainer = document.createElement('div');
    pageContainer.style.position = 'relative';
    pageContainer.style.display = 'inline-block';
    pageContainer.style.maxWidth = '100%';
    pageContainer.style.maxHeight = 'calc(100vh - 80px)';

    // Ảnh gốc
    const bgImg = document.createElement('img');
    bgImg.style.maxWidth = '100%';
    bgImg.style.maxHeight = 'calc(100vh - 80px)';
    bgImg.style.display = 'block';
    bgImg.draggable = false;
    bgImg.style.userSelect = 'none';
    pageContainer.appendChild(bgImg);

    // Tạo overlays container riêng (tương tự manga-overlays-container)
    const overlaysContainer = document.createElement('div');
    overlaysContainer.className = "absolute inset-0 select-none overflow-hidden rounded z-20";
    pageContainer.appendChild(overlaysContainer);

    // Đưa container vào DOM
    elements.previewBody.appendChild(pageContainer);

    bgImg.onload = async () => {
        // Đợi 2 khung hình để trình duyệt hoàn tất Reflow Layout và cập nhật clientWidth/clientHeight
        await waitForNextPaint();

        let displayW = bgImg.clientWidth;
        let displayH = bgImg.clientHeight;

        if (displayW === 0 || displayH === 0) {
            console.warn("Client dimension is 0 in preview, retrying after delay...");
            // Thử lại lần nữa nếu vẫn bằng 0 (phòng hờ thiết bị rất chậm)
            await new Promise(r => setTimeout(r, 50));
            displayW = bgImg.clientWidth;
            displayH = bgImg.clientHeight;
        }

        const finalW = displayW || 800;
        const finalH = displayH || 600;

        // Khóa cứng chiều rộng & chiều cao của pageContainer để khớp tọa độ các block thoại
        pageContainer.style.width = `${finalW}px`;
        pageContainer.style.height = `${finalH}px`;

        // Lớp cọ tẩy (nếu có)
        if (page.eraserLayerBlob) {
            const eraserImg = document.createElement('img');
            const eraserUrl = URL.createObjectURL(page.eraserLayerBlob);
            eraserImg.src = eraserUrl;
            eraserImg.style.position = 'absolute';
            eraserImg.style.top = '0';
            eraserImg.style.left = '0';
            eraserImg.style.width = '100%';
            eraserImg.style.height = '100%';
            eraserImg.style.pointerEvents = 'none';
            eraserImg.style.zIndex = '10';
            eraserImg.onload = () => URL.revokeObjectURL(eraserUrl);
            pageContainer.appendChild(eraserImg);
        }

        // Render các block dịch lên overlaysContainer thay vì pageContainer!
        // Như vậy renderOverlays chỉ clear overlaysContainer mà không xóa mất ảnh nền bgImg!
        renderOverlays(overlaysContainer, page, bgImg);
    };

    // Thiết lập src cuối cùng để kích hoạt onload
    bgImg.src = page.src;

    // Cuộn lên đầu
    elements.previewBody.scrollTop = 0;
}

window.openPreviewMode = openPreviewMode;
window.closePreviewMode = closePreviewMode;
window.previewPrevPage = previewPrevPage;
window.previewNextPage = previewNextPage;

function toggleSidebarToolsMenu() {
    const menu = document.getElementById('sidebar-tools-menu');
    const btn = document.getElementById('sidebar-tools-toggle');
    if (menu) {
        const isHidden = menu.classList.contains('hidden');
        if (isHidden) {
            menu.classList.remove('hidden');
            if (btn) {
                btn.classList.add('bg-indigo-600', 'text-white');
                btn.classList.remove('bg-slate-950', 'text-slate-300');
            }
        } else {
            menu.classList.add('hidden');
            if (btn) {
                btn.classList.remove('bg-indigo-600', 'text-white');
                btn.classList.add('bg-slate-950', 'text-slate-300');
            }
        }
    }
}
window.toggleSidebarToolsMenu = toggleSidebarToolsMenu;

function toggleLeftSidebar() {
    const leftPanel = document.getElementById('left-panel');
    const handle = document.getElementById('left-sidebar-toggle-handle');
    const icon = handle ? handle.querySelector('i') : null;

    const isMobile = window.innerWidth <= 1024;
    if (isMobile) {
        const isOpen = document.body.classList.contains('mobile-menu-left-open');
        if (isOpen) {
            closeMobileMenus();
        } else {
            document.body.classList.add('mobile-menu-left-open');
            document.body.classList.remove('mobile-menu-right-open');
        }
    } else {
        if (leftPanel) {
            const isHidden = leftPanel.classList.toggle('collapsed-sidebar');
            if (icon) {
                if (isHidden) {
                    icon.className = 'fa-solid fa-chevron-right text-[10px] group-hover:scale-110 transition-transform';
                } else {
                    icon.className = 'fa-solid fa-chevron-left text-[10px] group-hover:scale-110 transition-transform';
                }
            }
        }
    }
}

function toggleRightSidebar() {
    const rightPanel = document.getElementById('right-panel');
    const handle = document.getElementById('right-sidebar-toggle-handle');
    const icon = handle ? handle.querySelector('i') : null;

    const isMobile = window.innerWidth <= 1024;
    if (isMobile) {
        const isOpen = document.body.classList.contains('mobile-menu-right-open');
        if (isOpen) {
            closeMobileMenus();
        } else {
            document.body.classList.add('mobile-menu-right-open');
            document.body.classList.remove('mobile-menu-left-open');
        }
    } else {
        if (rightPanel) {
            const isHidden = rightPanel.classList.toggle('collapsed-sidebar');
            if (icon) {
                if (isHidden) {
                    icon.className = 'fa-solid fa-chevron-left text-[10px] group-hover:scale-110 transition-transform';
                } else {
                    icon.className = 'fa-solid fa-chevron-right text-[10px] group-hover:scale-110 transition-transform';
                }
            }
        }
    }
}

window.toggleLeftSidebar = toggleLeftSidebar;
window.toggleRightSidebar = toggleRightSidebar;

// --- TOEIC STUDY COMPANION MODULE ---

// 1. Giao diện mở nhanh tab TOEIC
function quickOpenToeicAnalysis() {
    setRightTab('toeic');
}
window.quickOpenToeicAnalysis = quickOpenToeicAnalysis;

// 2. Cập nhật giao diện tab TOEIC
function updateToeicTabUI() {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) {
        if (elements.toeicNoBlockSelectedState) elements.toeicNoBlockSelectedState.classList.remove('hidden');
        if (elements.toeicAnalysisContainer) elements.toeicAnalysisContainer.classList.add('hidden');
        return;
    }

    const page = globalState.pages[globalState.activePageIndex];
    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!block) return;

    if (elements.toeicNoBlockSelectedState) elements.toeicNoBlockSelectedState.classList.add('hidden');
    if (elements.toeicAnalysisContainer) {
        elements.toeicAnalysisContainer.classList.remove('hidden');

        // Cập nhật chế độ hiển thị hiện tại (learn hoặc recall)
        setToeicMode(globalState.toeicMode || 'learn');

        // Kiểm tra xem đã có kết quả phân tích cho block này chưa
        if (globalState.activeBlockToeicAnalysis && globalState.activeBlockToeicAnalysis.blockId === block.id) {
            displayToeicAnalysis(globalState.activeBlockToeicAnalysis.analysis);
        } else {
            resetToeicAnalysisUI();
        }
    }

    updateToeicNotebookUI();
}
window.updateToeicTabUI = updateToeicTabUI;

// 3. Reset giao diện kết quả phân tích
function resetToeicAnalysisUI() {
    if (elements.btnToeicAnalyze) elements.btnToeicAnalyze.classList.remove('hidden');
    if (elements.toeicLoading) elements.toeicLoading.classList.add('hidden');
    if (elements.toeicResults) elements.toeicResults.classList.add('hidden');

    if (elements.toeicOriginalSentence) elements.toeicOriginalSentence.textContent = '';
    if (elements.toeicGrammarContent) elements.toeicGrammarContent.textContent = '';
    if (elements.toeicVocabList) elements.toeicVocabList.innerHTML = '';
    if (elements.toeicQuestionText) elements.toeicQuestionText.textContent = '';
    if (elements.toeicQuestionOptions) elements.toeicQuestionOptions.innerHTML = '';
    if (elements.toeicQuestionFeedback) {
        elements.toeicQuestionFeedback.classList.add('hidden');
        elements.toeicQuestionFeedback.innerHTML = '';
    }
}
window.resetToeicAnalysisUI = resetToeicAnalysisUI;

// 4. Hiển thị kết quả phân tích TOEIC từ dữ liệu JSON
function displayToeicAnalysis(analysis) {
    if (!analysis) return;

    if (elements.btnToeicAnalyze) elements.btnToeicAnalyze.classList.add('hidden');
    if (elements.toeicLoading) elements.toeicLoading.classList.add('hidden');
    if (elements.toeicResults) elements.toeicResults.classList.remove('hidden');

    // Hiển thị câu tiếng Anh gốc và gán sự kiện phát âm
    if (elements.toeicOriginalSentence) {
        const page = globalState.pages[globalState.activePageIndex];
        const block = page ? page.blocks.find(b => b.id === globalState.selectedBlockId) : null;
        const originalText = block ? (block.original || '').trim() : '';
        elements.toeicOriginalSentence.textContent = originalText;

        if (elements.btnSpeakOriginal) {
            elements.btnSpeakOriginal.onclick = () => speakText(originalText);
        }
    }

    // Cấu trúc & Ngữ pháp
    if (elements.toeicGrammarContent) {
        elements.toeicGrammarContent.textContent = analysis.grammar || 'Không có phân tích ngữ pháp.';
    }

    // Từ vựng
    if (elements.toeicVocabList) {
        elements.toeicVocabList.innerHTML = '';
        const vocabData = analysis.vocabulary || [];
        if (vocabData.length === 0) {
            elements.toeicVocabList.innerHTML = '<div class="text-[11px] text-slate-500 italic">Không phát hiện từ vựng TOEIC 450+ đặc trưng.</div>';
        } else {
            vocabData.forEach((item, index) => {
                const isSaved = globalState.toeicSavedWords.some(w => w.word.toLowerCase() === item.word.toLowerCase());

                const card = document.createElement('div');
                card.className = 'p-2.5 rounded bg-slate-900 border border-slate-800 space-y-1.5 text-xs';

                card.innerHTML = `
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-1.5 min-w-0 flex-1">
                            <span class="font-bold text-indigo-300 text-sm truncate">${escapeHTML(item.word)}</span>
                            <span class="text-[9px] text-slate-400 italic shrink-0">(${escapeHTML(item.pos)})</span>
                            <span class="text-[10px] text-slate-500 font-mono shrink-0">${escapeHTML(item.phonetic || '')}</span>
                            <button onclick="speakText('${escapeHTML(item.word).replace(/'/g, "\\'")}')" class="text-slate-500 hover:text-indigo-400 shrink-0" title="Nghe từ vựng">
                                <i class="fa-solid fa-volume-high text-[10px]"></i>
                            </button>
                        </div>
                        <button id="btn-save-vocab-${index}" onclick="toggleSaveToeicWordByIndex(${index})"
                            class="text-[10px] px-2 py-0.5 rounded border transition-all shrink-0 ${isSaved
                        ? 'bg-emerald-600/10 border-emerald-500/30 text-emerald-400 hover:bg-red-950/30 hover:border-red-500/30 hover:text-red-400'
                        : 'bg-indigo-600/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-600 hover:text-white'
                    }">
                            ${isSaved ? '<i class="fa-solid fa-check"></i> Đã lưu' : '<i class="fa-solid fa-plus"></i> Lưu'}
                        </button>
                    </div>
                    <div class="text-[11px] text-slate-300"><span class="font-semibold text-slate-400">Nghĩa:</span> ${escapeHTML(item.vietnamese)}</div>
                    <div class="text-[10px] text-slate-400 italic leading-relaxed flex items-center justify-between gap-1.5">
                        <div class="flex-1 min-w-0"><span class="font-semibold text-slate-500">Ví dụ:</span> "${escapeHTML(item.toeic_example)}"</div>
                        <button onclick="speakText('${escapeHTML(item.toeic_example).replace(/'/g, "\\'")}')" class="text-slate-500 hover:text-indigo-400 shrink-0" title="Nghe câu ví dụ">
                            <i class="fa-solid fa-volume-high text-[9px]"></i>
                        </button>
                    </div>
                `;
                elements.toeicVocabList.appendChild(card);
            });
        }
    }

    // Câu hỏi trắc nghiệm Part 5 / 7
    const pqs = analysis.practice_questions || (analysis.practice_question ? [analysis.practice_question] : []);
    const tabsContainer = document.getElementById('toeic-question-tabs');

    if (elements.toeicQuestionSection && pqs.length > 0) {
        elements.toeicQuestionSection.classList.remove('hidden');

        // Hiện / ẩn các tab câu hỏi
        if (tabsContainer) {
            if (pqs.length > 1) {
                tabsContainer.classList.remove('hidden');
            } else {
                tabsContainer.classList.add('hidden');
            }
        }

        // Chọn câu hỏi hiện tại và hiển thị
        if (globalState.activeToeicQuestionIndex >= pqs.length) {
            globalState.activeToeicQuestionIndex = 0;
        }

        // Cập nhật lại màu tab được chọn hoạt động
        for (let i = 0; i < 3; i++) {
            const btn = document.getElementById(`btn-question-tab-${i}`);
            if (btn) {
                if (i === globalState.activeToeicQuestionIndex) {
                    btn.className = "flex-1 py-1 text-[9px] font-bold rounded bg-indigo-600 text-white transition-all text-center";
                } else {
                    btn.className = "flex-1 py-1 text-[9px] font-bold rounded text-slate-400 hover:text-slate-200 transition-all text-center bg-slate-950 border border-slate-800";
                }
            }
        }

        renderActiveToeicQuestion(pqs, globalState.activeToeicQuestionIndex);
    } else {
        if (elements.toeicQuestionSection) elements.toeicQuestionSection.classList.add('hidden');
    }
}
window.displayToeicAnalysis = displayToeicAnalysis;

// 5. Kiểm tra đáp án trắc nghiệm
function checkToeicAnswer(selectedLetter, correctLetter, explanation) {
    if (!elements.toeicQuestionFeedback) return;

    elements.toeicQuestionFeedback.classList.remove('hidden', 'bg-emerald-950/80', 'border-emerald-500/30', 'text-emerald-200', 'bg-red-950/80', 'border-red-500/30', 'text-red-200');

    const isCorrect = selectedLetter.toUpperCase() === correctLetter.toUpperCase();

    if (isCorrect) {
        elements.toeicQuestionFeedback.classList.add('bg-emerald-950/80', 'border', 'border-emerald-500/30', 'text-emerald-200');
        elements.toeicQuestionFeedback.innerHTML = `
            <div class="font-bold flex items-center gap-1.5 mb-1"><i class="fa-solid fa-circle-check text-emerald-400"></i> Chính xác! Đáp án đúng là ${correctLetter}</div>
            <div>${escapeHTML(explanation)}</div>
        `;
        showToast("Bạn đã trả lời chính xác câu hỏi TOEIC!", "success");
    } else {
        elements.toeicQuestionFeedback.classList.add('bg-red-950/80', 'border', 'border-red-500/30', 'text-red-200');
        elements.toeicQuestionFeedback.innerHTML = `
            <div class="font-bold flex items-center gap-1.5 mb-1"><i class="fa-solid fa-circle-xmark text-red-400"></i> Chưa đúng! Đáp án đúng là ${correctLetter}</div>
            <div>${escapeHTML(explanation)}</div>
        `;
        showToast("Đáp án chưa chính xác, hãy xem phần giải thích.", "warn");
    }
}
window.checkToeicAnswer = checkToeicAnswer;

// 6. Gọi Gemini API phân tích TOEIC
async function analyzeBlockForToeic() {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;

    const page = globalState.pages[globalState.activePageIndex];
    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!block) return;

    const originalText = (block.original || "").trim();
    if (!originalText) {
        showToast("Khung thoại này chưa có chữ gốc (Original Text) để phân tích ngữ pháp.", "warn");
        return;
    }

    const keyToUse = getGeminiApiKey();
    if (!keyToUse) {
        showToast("Vui lòng nhập Gemini API Key trong phần Cài đặt trước khi phân tích.", "error");
        openSettingsModal();
        return;
    }

    // Giao diện loading
    if (elements.btnToeicAnalyze) elements.btnToeicAnalyze.classList.add('hidden');
    if (elements.toeicLoading) elements.toeicLoading.classList.remove('hidden');
    if (elements.toeicResults) elements.toeicResults.classList.add('hidden');

    try {
        const modelToUse = globalState.selectedModel || DEFAULT_MODEL;
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${keyToUse}`;

        const promptText = `You are a TOEIC 450 preparation tutor. Analyze the following English sentence from a comic dialogue.
Sentence: "${originalText}"

Provide a JSON response with the following keys:
1. "grammar": Explain the grammar structure of the sentence in Vietnamese, highlighting key grammatical points (tenses, word forms, passive voice, conjunctions, relative clauses, prepositions, etc.) relevant to TOEIC Part 5 & 6. Keep it concise.
2. "vocabulary": An array of TOEIC-relevant words (from the sentence) that are useful for TOEIC 450. For each word, include:
   - "word": The word itself (base form).
   - "pos": Part of speech (e.g. noun, verb, adjective, adverb).
   - "phonetic": IPA pronunciation.
   - "vietnamese": Vietnamese translation.
   - "toeic_example": A clear example sentence in business/office context using this word.
3. "practice_questions": An array of exactly 3 multiple-choice questions (one for each type: "Part 5 - Ngữ pháp", "Part 5 - Từ vựng", and "Part 7 - Đọc hiểu").
   Each question object in the array must contain these keys:
   - "type": The type name (exactly "Part 5 - Ngữ pháp", "Part 5 - Từ vựng", or "Part 7 - Đọc hiểu").
   - "question": The question text.
     * For "Part 5 - Ngữ pháp": create a fill-in-the-blank question from the sentence or a closely related sentence testing grammar/word form, with a blank space "______".
     * For "Part 5 - Từ vựng": create a fill-in-the-blank question testing vocabulary in a business/office context, with a blank space "______".
     * For "Part 7 - Đọc hiểu": ask a direct reading comprehension question about the meaning, speaker's intent, or implication of the sentence.
   - "options": An array of 4 options (e.g. ["(A) ...", "(B) ...", "(C) ...", "(D) ..."]).
   - "correct_answer": The letter of the correct answer (e.g., "A", "B", "C", "D").
   - "explanation": Brief explanation in Vietnamese explaining why this option is correct.
   
Return ONLY the JSON. Do not wrap it in markdown code fences or anything else. Just return raw JSON.`;

        const payload = {
            contents: [{
                parts: [{ text: promptText }]
            }],
            generationConfig: {
                responseMimeType: "application/json",
                maxOutputTokens: 2048
            }
        };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const result = await response.json();
        const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!jsonText) throw new Error("Không nhận được phản hồi từ AI.");

        const parsedData = parseGeminiJsonText(jsonText);

        // Cache kết quả phân tích cho block hiện tại
        globalState.activeBlockToeicAnalysis = {
            blockId: block.id,
            analysis: parsedData
        };

        displayToeicAnalysis(parsedData);
        showToast("Đã phân tích cấu trúc TOEIC thành công!", "success");

    } catch (error) {
        console.error("Lỗi phân tích TOEIC:", error);
        showToast("Không thể phân tích bằng AI: " + (error.message || "Lỗi mạng"), "error");
        resetToeicAnalysisUI();
    }
}
window.analyzeBlockForToeic = analyzeBlockForToeic;

// 7. Lưu / Bỏ lưu từ vựng TOEIC bằng chỉ số index
async function toggleSaveToeicWordByIndex(index) {
    if (!globalState.activeBlockToeicAnalysis || !globalState.activeBlockToeicAnalysis.analysis) return;
    const item = globalState.activeBlockToeicAnalysis.analysis.vocabulary[index];
    if (!item) return;

    try {
        const wordIndex = globalState.toeicSavedWords.findIndex(w => w.word.toLowerCase() === item.word.toLowerCase());

        if (wordIndex !== -1) {
            // Đã có -> Xóa bỏ
            globalState.toeicSavedWords.splice(wordIndex, 1);
            showToast(`Đã xóa từ "${item.word}" khỏi sổ tay.`, "info");
        } else {
            // Chưa có -> Thêm vào đầu danh sách
            globalState.toeicSavedWords.unshift({
                word: item.word,
                pos: item.pos,
                phonetic: item.phonetic || '',
                vietnamese: item.vietnamese,
                toeic_example: item.toeic_example || '',
                savedAt: Date.now()
            });
            showToast(`Đã lưu từ "${item.word}" vào sổ tay!`, "success");
        }

        // Lưu vào database
        await saveToeicWordsToDB(globalState.toeicSavedWords);

        // Cập nhật giao diện
        updateToeicNotebookUI();

        // Đồng bộ lại nút Lưu trong phần kết quả phân tích hiện tại
        if (globalState.activeBlockToeicAnalysis) {
            displayToeicAnalysis(globalState.activeBlockToeicAnalysis.analysis);
        }
    } catch (e) {
        console.error("Lỗi khi lưu từ vựng:", e);
    }
}
window.toggleSaveToeicWordByIndex = toggleSaveToeicWordByIndex;

// --- SPACED REPETITION SYSTEM (SRS - SUPERMEMO SM-2 ALGORITHM) ---
let srsReviewQueue = [];
let srsCurrentIndex = 0;
let isSrsCardFlipped = false;

// 1. Tính toán từ vựng SRS cần ôn tập hôm nay
function getDueSrsWords() {
    const now = Date.now();
    return (globalState.toeicSavedWords || []).filter(item => {
        if (!item.nextReviewDate) return true; // Chưa bao giờ ôn
        return item.nextReviewDate <= now;
    });
}

// 8. Cập nhật Sổ tay từ vựng hiển thị & SRS Badge
function updateToeicNotebookUI() {
    const listContainer = elements.toeicNotebookList;
    const emptyState = elements.toeicNotebookEmpty;
    const countBadge = elements.toeicSavedCount;
    const exportBtn = elements.btnToeicExportAnki;
    const srsBtn = document.getElementById('btn-open-srs-review');
    const srsDueBadge = document.getElementById('srs-due-badge');

    if (!listContainer) return;

    const savedWords = globalState.toeicSavedWords || [];
    const dueWords = getDueSrsWords();

    if (countBadge) countBadge.textContent = savedWords.length;
    if (exportBtn) exportBtn.disabled = savedWords.length === 0;

    if (srsBtn) {
        srsBtn.disabled = savedWords.length === 0;
    }
    if (srsDueBadge) {
        if (dueWords.length > 0) {
            srsDueBadge.textContent = `${dueWords.length} cần ôn`;
            srsDueBadge.className = 'px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-extrabold animate-pulse';
        } else {
            srsDueBadge.textContent = 'Đã thuộc hết';
            srsDueBadge.className = 'px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold border border-emerald-500/30';
        }
    }

    if (savedWords.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        listContainer.innerHTML = '';
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    listContainer.innerHTML = '';

    savedWords.forEach((item, idx) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'p-2.5 rounded bg-slate-950 border border-slate-800 flex items-center justify-between text-xs group';

        const srsLevel = item.srsLevel || 0;
        let srsTag = '<span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">🌱 Mới lưu</span>';
        if (srsLevel >= 5) {
            srsTag = '<span class="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30">🌳 Thuộc lòng</span>';
        } else if (srsLevel >= 2) {
            srsTag = '<span class="text-[9px] px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-500/30">🌿 Đang nhớ</span>';
        }

        itemEl.innerHTML = `
            <div class="min-w-0 flex-1 pr-2">
                <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="font-bold text-slate-200">${escapeHTML(item.word)}</span>
                    <span class="text-[9px] text-slate-500 italic">(${escapeHTML(item.pos)})</span>
                    ${srsTag}
                </div>
                <div class="text-[11px] text-indigo-300 truncate">${escapeHTML(item.vietnamese)}</div>
            </div>
            <button onclick="deleteSavedToeicWord(${idx})" title="Xóa"
                class="w-6 h-6 rounded bg-slate-900 border border-slate-800 text-slate-500 hover:bg-red-950/40 hover:border-red-500/30 hover:text-red-400 flex items-center justify-center transition-all opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
                <i class="fa-solid fa-trash-can text-[10px]"></i>
            </button>
        `;
        listContainer.appendChild(itemEl);
    });
}
window.updateToeicNotebookUI = updateToeicNotebookUI;

// --- SRS FLASHCARD REVIEW CONTROLLER ---

// 3. Mở phiên ôn tập SRS Flashcard
function openSrsReviewModal() {
    const dueWords = getDueSrsWords();
    const allWords = globalState.toeicSavedWords || [];

    if (allWords.length === 0) {
        showToast("Bạn chưa lưu từ vựng nào để ôn tập.", "warn");
        return;
    }

    // Nếu không có từ nào đến hạn, lấy toàn bộ sổ tay để ôn tập ngẫu nhiên
    srsReviewQueue = dueWords.length > 0 ? dueWords : [...allWords].sort(() => Math.random() - 0.5);
    srsCurrentIndex = 0;
    isSrsCardFlipped = false;

    const modal = document.getElementById('srs-review-modal');
    if (modal) {
        modal.classList.remove('hidden');
        renderSrsCurrentCard();
    }
}
window.openSrsReviewModal = openSrsReviewModal;

function closeSrsReviewModal() {
    const modal = document.getElementById('srs-review-modal');
    if (modal) modal.classList.add('hidden');
    updateToeicNotebookUI();
}
window.closeSrsReviewModal = closeSrsReviewModal;

// 4. Render thẻ Flashcard SRS hiện tại
function renderSrsCurrentCard() {
    if (srsCurrentIndex >= srsReviewQueue.length) {
        showToast("Chúc mừng! Bạn đã hoàn thành tất cả từ vựng cần ôn hôm nay 🎉", "success");
        closeSrsReviewModal();
        return;
    }

    const item = srsReviewQueue[srsCurrentIndex];
    const total = srsReviewQueue.length;

    const counterEl = document.getElementById('srs-progress-counter');
    const posEl = document.getElementById('srs-card-pos');
    const wordEl = document.getElementById('srs-card-word');
    const phoneticEl = document.getElementById('srs-card-phonetic');
    const meaningEl = document.getElementById('srs-card-meaning');
    const exampleEl = document.getElementById('srs-card-example');

    if (counterEl) counterEl.textContent = `${srsCurrentIndex + 1} / ${total}`;
    if (posEl) posEl.textContent = item.pos || 'word';
    if (wordEl) wordEl.textContent = item.word || '';
    if (phoneticEl) phoneticEl.textContent = item.phonetic || '';
    if (meaningEl) meaningEl.textContent = item.vietnamese || '';
    if (exampleEl) exampleEl.textContent = item.toeic_example ? `"${item.toeic_example}"` : 'Không có ví dụ.';

    // Reset lật thẻ về mặt trước
    isSrsCardFlipped = false;
    const cardInner = document.getElementById('srs-card-inner');
    const cardFront = document.getElementById('srs-card-front');
    const cardBack = document.getElementById('srs-card-back');
    const ratingActions = document.getElementById('srs-rating-actions');
    const flipPrompt = document.getElementById('srs-flip-prompt');

    if (cardInner) cardInner.classList.remove('srs-card-flipped');
    if (cardFront) cardFront.classList.remove('hidden');
    if (cardBack) cardBack.classList.add('hidden');
    if (ratingActions) ratingActions.classList.add('hidden');
    if (flipPrompt) flipPrompt.classList.remove('hidden');

    // Cập nhật khoảng thời gian dự kiến trên các nút rating (SuperMemo SM-2)
    const currentInterval = item.intervalDays || 1;
    const ease = item.easeFactor || 2.5;
    const nextGood = Math.round(currentInterval * ease);
    const nextEasy = Math.round(currentInterval * ease * 1.5);

    const lblGood = document.getElementById('srs-lbl-good-interval');
    const lblEasy = document.getElementById('srs-lbl-easy-interval');
    if (lblGood) lblGood.textContent = `Ôn lại ${nextGood} ngày`;
    if (lblEasy) lblEasy.textContent = `Ôn lại ${nextEasy} ngày`;
}

// 5. Lật mặt Flashcard
function flipSrsCard() {
    isSrsCardFlipped = !isSrsCardFlipped;
    const cardFront = document.getElementById('srs-card-front');
    const cardBack = document.getElementById('srs-card-back');
    const ratingActions = document.getElementById('srs-rating-actions');
    const flipPrompt = document.getElementById('srs-flip-prompt');

    if (isSrsCardFlipped) {
        if (cardFront) cardFront.classList.add('hidden');
        if (cardBack) cardBack.classList.remove('hidden');
        if (ratingActions) ratingActions.classList.remove('hidden');
        if (flipPrompt) flipPrompt.classList.add('hidden');
    } else {
        if (cardFront) cardFront.classList.remove('hidden');
        if (cardBack) cardBack.classList.add('hidden');
        if (ratingActions) ratingActions.classList.add('hidden');
        if (flipPrompt) flipPrompt.classList.remove('hidden');
    }
}
window.flipSrsCard = flipSrsCard;

// 6. Phát âm từ vựng SRS hiện tại
function speakSrsCurrentWord() {
    if (srsCurrentIndex < srsReviewQueue.length) {
        const item = srsReviewQueue[srsCurrentIndex];
        if (item && item.word) {
            speakText(item.word);
        }
    }
}
window.speakSrsCurrentWord = speakSrsCurrentWord;

// 7. Thuật toán SuperMemo SM-2 đánh giá từ vựng
async function submitSrsReview(quality) {
    if (srsCurrentIndex >= srsReviewQueue.length) return;

    const item = srsReviewQueue[srsCurrentIndex];
    let ease = item.easeFactor || 2.5;
    let interval = item.intervalDays || 1;
    let level = item.srsLevel || 0;
    let reviewCount = (item.reviewCount || 0) + 1;

    if (quality < 3) {
        // Quên (Again) -> Đặt lại về 1 ngày
        level = 1;
        interval = 1;
    } else {
        // Nhớ (Good = 3, Easy = 5)
        level += (quality === 5 ? 2 : 1);
        if (interval === 1) {
            interval = 3;
        } else if (interval === 3) {
            interval = 6;
        } else {
            interval = Math.round(interval * ease * (quality === 5 ? 1.4 : 1.0));
        }

        // Cập nhật Ease Factor (SuperMemo Formula)
        ease = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
        if (ease < 1.3) ease = 1.3;
    }

    // Gán thông số SRS mới
    item.srsLevel = level;
    item.easeFactor = ease;
    item.intervalDays = interval;
    item.nextReviewDate = Date.now() + (interval * 24 * 60 * 60 * 1000);
    item.reviewCount = reviewCount;

    // Cập nhật từ vựng trong mảng globalState
    const targetIdx = globalState.toeicSavedWords.findIndex(w => w.word.toLowerCase() === item.word.toLowerCase());
    if (targetIdx !== -1) {
        globalState.toeicSavedWords[targetIdx] = item;
    }

    // Lưu vào IndexedDB
    await saveToeicWordsToDB(globalState.toeicSavedWords);

    // Chuyển sang thẻ tiếp theo
    srsCurrentIndex++;
    renderSrsCurrentCard();
}
window.submitSrsReview = submitSrsReview;

// 9. Xóa nhanh từ vựng khỏi sổ tay hiển thị
async function deleteSavedToeicWord(index) {
    if (index < 0 || index >= globalState.toeicSavedWords.length) return;
    const word = globalState.toeicSavedWords[index].word;
    globalState.toeicSavedWords.splice(index, 1);

    await saveToeicWordsToDB(globalState.toeicSavedWords);
    updateToeicNotebookUI();

    // Đồng bộ lại nút Lưu trong phần kết quả phân tích hiện tại
    if (globalState.activeBlockToeicAnalysis) {
        displayToeicAnalysis(globalState.activeBlockToeicAnalysis.analysis);
    }

    showToast(`Đã xóa từ "${word}" khỏi sổ tay.`, "info");
}
window.deleteSavedToeicWord = deleteSavedToeicWord;

// 10. Xuất file Anki CSV
function exportToeicWordsToAnki() {
    const savedWords = globalState.toeicSavedWords || [];
    if (savedWords.length === 0) {
        showToast("Không có từ vựng nào trong sổ tay để xuất.", "warn");
        return;
    }

    // Tiêu đề CSV chuẩn của Anki (Front, Back)
    let csvContent = "Front\tBack\n";

    savedWords.forEach(item => {
        // Mặt trước: Từ vựng + từ loại + phát âm
        const front = `${item.word} (${item.pos}) ${item.phonetic ? `[${item.phonetic}]` : ''}`;

        // Mặt sau: Nghĩa tiếng Việt + Ví dụ ngữ cảnh
        const back = `<b>Nghĩa:</b> ${item.vietnamese}<br><br><i>Ví dụ:</i> ${item.toeic_example || 'N/A'}`;

        // Thoát dấu ngoặc kép để chuẩn định dạng CSV ngăn cách bằng tab (\t)
        const cleanFront = front.replace(/"/g, '""');
        const cleanBack = back.replace(/"/g, '""');

        csvContent += `"${cleanFront}"\t"${cleanBack}"\n`;
    });

    // Tạo file tải về dạng CSV UTF-8 với BOM
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `anki_toeic_words_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Đã tải xuống tệp Anki CSV thành công!", "success");
}
window.exportToeicWordsToAnki = exportToeicWordsToAnki;

// --- INDEXEDDB EXTENSION FOR TOEIC WORDS ---
function loadToeicWordsFromDB() {
    if (!dbInstance) return Promise.resolve([]);
    return new Promise((resolve) => {
        const transaction = dbInstance.transaction([STORE_META], 'readonly');
        const store = transaction.objectStore(STORE_META);
        const request = store.get('saved_toeic_words');
        request.onsuccess = (e) => {
            const data = e.target.result;
            resolve(data || []);
        };
        request.onerror = () => {
            resolve([]);
        };
    });
}
window.loadToeicWordsFromDB = loadToeicWordsFromDB;

function saveToeicWordsToDB(words) {
    if (!dbInstance) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([STORE_META], 'readwrite');
        const store = transaction.objectStore(STORE_META);
        const request = store.put(words, 'saved_toeic_words');
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}
window.saveToeicWordsToDB = saveToeicWordsToDB;

// 11. Phát âm văn bản (Text-to-Speech)
function speakText(text, lang = 'en-US') {
    if (!window.speechSynthesis) {
        showToast("Trình duyệt không hỗ trợ phát âm (Text-to-Speech).", "error");
        return;
    }
    // Cancel currently speaking audio
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.85; // Slightly slower speed for learning listening comprehension

    utterance.onerror = (e) => {
        console.error("Lỗi phát âm:", e);
    };

    window.speechSynthesis.speak(utterance);
}
window.speakText = speakText;

// --- ACTIVE RECALL (LUYỆN DỊCH NGƯỢC) MODULE ---

// 12. Chuyển đổi chế độ học tập trong tab TOEIC
function setToeicMode(mode) {
    globalState.toeicMode = mode;

    if (mode === 'learn') {
        // Cập nhật nút bấm chuyển chế độ
        if (elements.btnToeicModeLearn) elements.btnToeicModeLearn.className = "flex-1 py-1.5 text-[11px] font-bold rounded bg-indigo-600 text-white transition-all";
        if (elements.btnToeicModeRecall) elements.btnToeicModeRecall.className = "flex-1 py-1.5 text-[11px] font-bold rounded text-slate-400 hover:text-slate-200 transition-all";

        // Hiện nội dung phân tích AI & trắc nghiệm
        if (elements.toeicLearnModeContent) elements.toeicLearnModeContent.classList.remove('hidden');
        if (elements.toeicRecallContainer) elements.toeicRecallContainer.classList.add('hidden');
    } else if (mode === 'recall') {
        // Cập nhật nút bấm chuyển chế độ
        if (elements.btnToeicModeLearn) elements.btnToeicModeLearn.className = "flex-1 py-1.5 text-[11px] font-bold rounded text-slate-400 hover:text-slate-200 transition-all";
        if (elements.btnToeicModeRecall) elements.btnToeicModeRecall.className = "flex-1 py-1.5 text-[11px] font-bold rounded bg-indigo-600 text-white transition-all";

        // Hiện nội dung luyện dịch ngược
        if (elements.toeicLearnModeContent) elements.toeicLearnModeContent.classList.add('hidden');
        if (elements.toeicRecallContainer) elements.toeicRecallContainer.classList.remove('hidden');

        // Nạp câu dịch tiếng Việt từ block hiện tại làm gợi ý
        if (globalState.activePageIndex !== -1 && globalState.selectedBlockId !== null) {
            const page = globalState.pages[globalState.activePageIndex];
            const block = page.blocks.find(b => b.id === globalState.selectedBlockId);
            if (block && elements.toeicRecallVietnamese) {
                elements.toeicRecallVietnamese.textContent = (block.translated || "").trim() || "(Khung thoại chưa được dịch sang tiếng Việt)";
            }
        }

        // Reset các trường nhập
        if (elements.toeicRecallInput) elements.toeicRecallInput.value = '';
        if (elements.toeicRecallResult) elements.toeicRecallResult.classList.add('hidden');
    }
}
window.setToeicMode = setToeicMode;

// 13. Hiển thị gợi ý dạng câu đố ký tự
function showToeicRecallHint() {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;

    const page = globalState.pages[globalState.activePageIndex];
    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!block || !block.original) {
        showToast("Không tìm thấy câu tiếng Anh gốc để gợi ý.", "warn");
        return;
    }

    const words = block.original.trim().split(/\s+/);
    if (words.length === 0) return;

    // Tạo chuỗi gợi ý: giữ nguyên từ đầu tiên, các từ sau chỉ giữ lại chữ cái đầu kèm theo gạch dưới
    const hintWords = words.map((word, idx) => {
        if (idx === 0) return word;

        // Lọc bỏ ký tự đặc biệt ở đầu/cuối từ để tìm chữ cái đầu
        const cleanWord = word.replace(/^[.,\/#!$%\^&\*;:{}=\-_`~()?"]+|[.,\/#!$%\^&\*;:{}=\-_`~()?"]+$/g, "");
        if (cleanWord.length <= 1) return word;

        // Tạo gạch dưới và giữ lại dấu câu ở cuối nếu có
        const charStart = word.indexOf(cleanWord[0]);
        const prefix = word.substring(0, charStart);
        const suffix = word.substring(charStart + cleanWord.length);
        const underscored = cleanWord[0] + '_'.repeat(cleanWord.length - 1);

        return prefix + underscored + suffix;
    });

    showToast(`Gợi ý: "${hintWords.join(' ')}" (${words.length} từ)`, "info", 6000);
}
window.showToeicRecallHint = showToeicRecallHint;

// 14. Đối chiếu và hiển thị kết quả dịch ngược
function checkToeicRecall() {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;

    const page = globalState.pages[globalState.activePageIndex];
    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!block) return;

    const correctText = (block.original || "").trim();
    if (!correctText) {
        showToast("Không tìm thấy câu gốc tiếng Anh để đối chiếu.", "warn");
        return;
    }

    const userInput = (elements.toeicRecallInput.value || "").trim();
    if (!userInput) {
        showToast("Vui lòng nhập câu dịch tiếng Anh của bạn trước khi kiểm tra.", "warn");
        return;
    }

    const resultContainer = elements.toeicRecallResult;
    const statusAlert = document.getElementById('toeic-recall-status-alert');
    const userPhrase = document.getElementById('toeic-recall-user-phrase');
    const correctPhrase = document.getElementById('toeic-recall-correct-phrase');
    const comparisonDiff = document.getElementById('toeic-recall-comparison-diff');

    if (!resultContainer) return;

    resultContainer.classList.remove('hidden');
    if (userPhrase) userPhrase.textContent = userInput;
    if (correctPhrase) correctPhrase.textContent = correctText;

    const diffResult = getSimpleWordDiff(userInput, correctText);
    if (comparisonDiff) comparisonDiff.innerHTML = diffResult.html;

    if (statusAlert) {
        statusAlert.className = 'text-xs font-bold flex items-center gap-1.5';

        if (diffResult.accuracy === 100) {
            statusAlert.classList.add('text-emerald-400');
            statusAlert.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-400 animate-bounce"></i> Hoàn hảo! Bạn đã gõ chính xác 100% câu thoại gốc.';
            showToast("Chính xác 100%! Bạn làm rất tốt.", "success");
        } else if (diffResult.accuracy >= 75) {
            statusAlert.classList.add('text-indigo-400');
            statusAlert.innerHTML = `<i class="fa-solid fa-circle-info text-indigo-400"></i> Gần chính xác! Độ khớp đạt ${diffResult.accuracy}%.`;
            showToast(`Khớp ${diffResult.accuracy}%. Hãy xem lại các từ gạch đỏ.`, "info");
        } else {
            statusAlert.classList.add('text-red-400');
            statusAlert.innerHTML = `<i class="fa-solid fa-circle-xmark text-red-400"></i> Chưa chính xác. Độ khớp đạt ${diffResult.accuracy}%.`;
            showToast("Độ khớp thấp, hãy xem đáp án đúng bên dưới.", "warn");
        }
    }
}
window.checkToeicRecall = checkToeicRecall;

// 15. So sánh từ vựng đơn giản và tạo mã màu HTML
function getSimpleWordDiff(userText, correctText) {
    const clean = (str) => str.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"]/g, "").split(/\s+/).filter(Boolean);
    const userWords = clean(userText);
    const correctWords = clean(correctText);

    let html = '<span class="text-slate-400 block text-[9px] uppercase font-bold tracking-wider mb-1.5">So sánh chi tiết các từ:</span>';
    const rawCorrectWords = correctText.split(/\s+/);
    let matchedCount = 0;

    const comparisonHTML = rawCorrectWords.map(rawWord => {
        const cleanWord = rawWord.toLowerCase().replace(/^[.,\/#!$%\^&\*;:{}=\-_`~()?"]+|[.,\/#!$%\^&\*;:{}=\-_`~()?"]+$/g, "");
        if (!cleanWord) return rawWord;

        const index = userWords.indexOf(cleanWord);
        if (index !== -1) {
            // Loại bỏ từ đã khớp để tránh trùng lặp
            userWords.splice(index, 1);
            matchedCount++;
            return `<span class="text-emerald-400">${escapeHTML(rawWord)}</span>`;
        } else {
            return `<span class="text-red-400 line-through decoration-red-500/50">${escapeHTML(rawWord)}</span>`;
        }
    }).join(' ');

    const accuracy = correctWords.length > 0 ? Math.round((matchedCount / correctWords.length) * 100) : 0;
    return {
        html: html + `<div class="p-2.5 rounded bg-slate-900 leading-relaxed font-semibold font-mono">${comparisonHTML}</div>`,
        accuracy
    };
}

// 16. Phát âm câu trả lời đúng của dịch ngược
function speakCorrectRecallSentence() {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;
    const page = globalState.pages[globalState.activePageIndex];
    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);
    if (block && block.original) {
        speakText(block.original);
    }
}
window.speakCorrectRecallSentence = speakCorrectRecallSentence;

// 17. Lựa chọn câu hỏi TOEIC (Q1, Q2, Q3) qua Tab
function selectToeicQuestion(index) {
    globalState.activeToeicQuestionIndex = index;

    // Cập nhật lại màu sắc cho các nút tab câu hỏi
    for (let i = 0; i < 3; i++) {
        const btn = document.getElementById(`btn-question-tab-${i}`);
        if (btn) {
            if (i === index) {
                btn.className = "flex-1 py-1 text-[9px] font-bold rounded bg-indigo-600 text-white transition-all text-center";
            } else {
                btn.className = "flex-1 py-1 text-[9px] font-bold rounded text-slate-400 hover:text-slate-200 transition-all text-center bg-slate-950 border border-slate-800";
            }
        }
    }

    if (globalState.activeBlockToeicAnalysis && globalState.activeBlockToeicAnalysis.analysis) {
        const pqs = globalState.activeBlockToeicAnalysis.analysis.practice_questions ||
            (globalState.activeBlockToeicAnalysis.analysis.practice_question ? [globalState.activeBlockToeicAnalysis.analysis.practice_question] : []);
        renderActiveToeicQuestion(pqs, index);
    }
}
window.selectToeicQuestion = selectToeicQuestion;

// 18. Vẽ câu hỏi TOEIC đang hoạt động ra giao diện
function renderActiveToeicQuestion(pqs, index) {
    const pq = pqs[index];
    if (!pq) return;

    elements.toeicQuestionText.textContent = pq.question || '';
    elements.toeicQuestionOptions.innerHTML = '';

    // Ẩn feedback cũ
    elements.toeicQuestionFeedback.classList.add('hidden');
    elements.toeicQuestionFeedback.innerHTML = '';

    // Cập nhật huy hiệu
    if (elements.toeicQuestionType) {
        elements.toeicQuestionType.textContent = pq.type || 'Part 5';
        if (pq.type && pq.type.includes('Part 7')) {
            elements.toeicQuestionType.className = "px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[9px] font-bold uppercase tracking-wider";
        } else if (pq.type && pq.type.includes('Từ vựng')) {
            elements.toeicQuestionType.className = "px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-bold uppercase tracking-wider";
        } else {
            elements.toeicQuestionType.className = "px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[9px] font-bold uppercase tracking-wider";
        }
    }

    if (elements.btnSpeakQuestion) {
        elements.btnSpeakQuestion.onclick = () => speakText(pq.question);
    }

    const options = pq.options || [];
    options.forEach((opt) => {
        const match = opt.match(/^\(?([A-D])\)?/);
        const letter = match ? match[1] : '';

        const btn = document.createElement('button');
        btn.className = 'w-full text-left p-2 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:border-slate-700 transition-all block';
        btn.textContent = opt;

        const safeCorrectAnswer = String(pq.correct_answer).replace(/'/g, "\\'");
        const safeExplanation = String(pq.explanation).replace(/'/g, "\\'").replace(/"/g, "&quot;");
        const safeLetter = letter.replace(/'/g, "\\'");

        btn.setAttribute('onclick', `checkToeicAnswer('${safeLetter}', '${safeCorrectAnswer}', '${safeExplanation}')`);
        elements.toeicQuestionOptions.appendChild(btn);
    });
}
window.renderActiveToeicQuestion = renderActiveToeicQuestion;

// --- HOTKEY MASTER SYSTEM ---
function initHotkeyMaster() {
    window.addEventListener('keydown', (e) => {
        const activeTag = document.activeElement ? document.activeElement.tagName.toUpperCase() : '';
        const isEditable = document.activeElement && (document.activeElement.isContentEditable || activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT');

        // Tab / Shift+Tab: Next/Previous block overlay
        if (e.key === 'Tab') {
            if (globalState.activePageIndex !== -1) {
                const page = globalState.pages[globalState.activePageIndex];
                if (page && page.blocks && page.blocks.length > 0) {
                    e.preventDefault();
                    let currentIdx = page.blocks.findIndex(b => b.id === globalState.selectedBlockId);
                    if (e.shiftKey) {
                        currentIdx = (currentIdx - 1 + page.blocks.length) % page.blocks.length;
                    } else {
                        currentIdx = (currentIdx + 1) % page.blocks.length;
                    }
                    selectBlock(page.blocks[currentIdx].id);
                }
            }
            return;
        }

        if (isEditable) return;

        // Ctrl+D / Cmd+D: Duplicate block
        if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
            e.preventDefault();
            duplicateActiveBlock();
            return;
        }

        // Delete / Backspace: Delete active block
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (globalState.selectedBlockId !== null) {
                e.preventDefault();
                deleteActiveBlock();
                return;
            }
        }

        // N / P: Next page / Previous page
        if (e.key === 'n' || e.key === 'N') {
            if (globalState.pages.length > 0 && globalState.activePageIndex < globalState.pages.length - 1) {
                e.preventDefault();
                selectPage(globalState.activePageIndex + 1);
            }
            return;
        }
        if (e.key === 'p' || e.key === 'P') {
            if (globalState.pages.length > 0 && globalState.activePageIndex > 0) {
                e.preventDefault();
                selectPage(globalState.activePageIndex - 1);
            }
            return;
        }

        // [ and ]: Decrease / Increase font size
        if (e.key === '[' || e.key === ']') {
            if (globalState.activePageIndex !== -1 && globalState.selectedBlockId !== null) {
                e.preventDefault();
                const page = globalState.pages[globalState.activePageIndex];
                const block = page ? page.blocks.find(b => b.id === globalState.selectedBlockId) : null;
                if (block) {
                    const delta = e.key === ']' ? 1 : -1;
                    const nextSize = Math.max(8, Math.min(72, (block.style.fontSize || 13) + delta));
                    syncActiveBlockStyle('fontSize', nextSize);
                }
            }
            return;
        }

        // Arrow keys: Move active block position
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            if (globalState.activePageIndex !== -1 && globalState.selectedBlockId !== null) {
                const page = globalState.pages[globalState.activePageIndex];
                const block = page ? page.blocks.find(b => b.id === globalState.selectedBlockId) : null;
                if (block) {
                    e.preventDefault();
                    pushStateToHistory();
                    const step = e.shiftKey ? 2.0 : 0.5;
                    if (e.key === 'ArrowLeft') block.box.x = Math.max(0, block.box.x - step);
                    if (e.key === 'ArrowRight') block.box.x = Math.min(100 - block.box.w, block.box.x + step);
                    if (e.key === 'ArrowUp') block.box.y = Math.max(0, block.box.y - step);
                    if (e.key === 'ArrowDown') block.box.y = Math.min(100 - block.box.h, block.box.y + step);

                    block.maskCache = null;
                    block.autoFitCache = null;
                    requestOverlayRender();
                    updateFloatingToolbarPosition();
                    debounceSavePage(page);
                }
            }
            return;
        }
    });
}
initHotkeyMaster();

// --- PRODUCTIVITY & EXPORT WORKFLOW TOOLS ---

// 1. Xuất file PDF chất lượng cao toàn bộ chương truyện (High-Definition PDF Export)
async function runPdfExport() {
    if (globalState.pages.length === 0) {
        showToast("Không có trang truyện nào để xuất PDF.", "warn");
        return;
    }

    const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!jsPDFClass) {
        showToast("Thư viện jsPDF chưa sẵn sàng. Vui lòng tải lại trang.", "error");
        return;
    }

    const prevPageIndex = globalState.activePageIndex;
    const prevSelectedId = globalState.selectedBlockId;
    globalState.selectedBlockId = null;

    updateProcessingOverlay(true, "Đang khởi tạo PDF...", "Đang thiết lập trang truyện...", 5);

    try {
        let pdf = null;
        const totalPages = globalState.pages.length;

        for (let i = 0; i < totalPages; i++) {
            const page = globalState.pages[i];
            const progressVal = Math.round(((i + 1) / totalPages) * 90);
            updateProcessingOverlay(true, `Đang ghép PDF (${i + 1}/${totalPages})`, `Trang: ${escapeHTML(page.name)}`, progressVal);

            selectPage(i);
            await waitForImageReady(elements.mangaBgImage, page.src);
            restorePageEraserDrawing(page);
            renderOverlays();

            await waitForNextPaint();
            await document.fonts.ready;

            let canvas;
            try {
                canvas = await renderPageToCanvas2D(page);
            } catch (c2dErr) {
                canvas = await html2canvas(elements.mangaCanvasContainer, {
                    useCORS: true,
                    allowTaint: true,
                    scale: 1.5,
                    backgroundColor: null,
                    logging: false
                });
            }

            const imgData = canvas.toDataURL('image/jpeg', 0.90);
            const naturalW = canvas.width || 800;
            const naturalH = canvas.height || 1200;
            const orientation = naturalW > naturalH ? 'landscape' : 'portrait';

            if (!pdf) {
                pdf = new jsPDFClass({
                    orientation: orientation,
                    unit: 'px',
                    format: [naturalW, naturalH]
                });
                pdf.addImage(imgData, 'JPEG', 0, 0, naturalW, naturalH);
            } else {
                pdf.addPage([naturalW, naturalH], orientation);
                pdf.addImage(imgData, 'JPEG', 0, 0, naturalW, naturalH);
            }
        }

        updateProcessingOverlay(true, "Đang hoàn tất PDF...", "Đang lưu file về máy...", 98);
        pdf.save(`Manga_Chapter_${Date.now()}.pdf`);
        showToast("Đã xuất thành công toàn bộ chương truyện ra file PDF!", "success");
    } catch (err) {
        console.error("Lỗi xuất PDF:", err);
        showToast(`Lỗi khi xuất PDF: ${err.message}`, "error");
    } finally {
        globalState.selectedBlockId = prevSelectedId;
        if (prevPageIndex !== -1 && prevPageIndex < globalState.pages.length) {
            selectPage(prevPageIndex);
        }
        updateProcessingOverlay(false);
    }
}
window.runPdfExport = runPdfExport;

// 2. Sao lưu toàn bộ dự án ra file .manga (Project Backup)
async function exportProjectBackup() {
    if (globalState.pages.length === 0) {
        showToast("Không có dự án nào để sao lưu.", "warn");
        return;
    }
    try {
        showToast("Đang đóng gói file dự án (.manga)...", "info");
        const backupData = {
            version: '2.0',
            exportedAt: new Date().toISOString(),
            sourceLanguage: globalState.sourceLanguage,
            pronounMatrix: globalState.pronounMatrix,
            preserveNames: globalState.preserveNames,
            glossaryNames: globalState.glossaryNames,
            pages: globalState.pages.map(page => ({
                id: page.id,
                name: page.name,
                status: page.status,
                src: page.src,
                blocks: page.blocks.map(b => ({
                    id: b.id,
                    type: b.type,
                    original: b.original,
                    translated: b.translated,
                    box: { ...b.box },
                    style: { ...b.style }
                }))
            }))
        };

        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Manga_Project_Backup_${Date.now()}.manga`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("Đã xuất file sao lưu dự án (.manga) thành công!", "success");
    } catch (e) {
        console.error("Lỗi sao lưu dự án:", e);
        showToast("Không thể xuất file sao lưu dự án.", "error");
    }
}
window.exportProjectBackup = exportProjectBackup;

// 3. Khôi phục toàn bộ dự án từ file .manga / .json (Project Restore)
async function importProjectBackup(files) {
    if (!files || files.length === 0) return;
    const file = files[0];
    try {
        showToast("Đang đọc file sao lưu dự án...", "info");
        const text = await file.text();
        const data = JSON.parse(text);

        if (!data || !Array.isArray(data.pages)) {
            throw new Error("File sao lưu không đúng định dạng .manga chuẩn.");
        }

        if (confirm(`Khôi phục dự án chứa ${data.pages.length} trang truyện? Thao tác này sẽ thay thế dự án hiện tại.`)) {
            pushStateToHistory();
            globalState.pages = data.pages;
            globalState.activePageIndex = data.pages.length > 0 ? 0 : -1;
            if (data.sourceLanguage) updateSourceLanguage(data.sourceLanguage);
            if (data.pronounMatrix) updatePronounMatrix(data.pronounMatrix);
            if (data.glossaryNames) updateGlossary(data.glossaryNames);

            for (const page of globalState.pages) {
                await savePageToDB(page);
            }
            await saveProjectMeta(globalState.pages.map(p => p.id), globalState.activePageIndex);

            updatePageListUI();
            if (globalState.activePageIndex !== -1) {
                selectPage(globalState.activePageIndex);
            }
            showToast(`Đã khôi phục thành công ${data.pages.length} trang truyện!`, "success");
        }
    } catch (e) {
        console.error("Lỗi khôi phục dự án:", e);
        showToast(`Không thể đọc file dự án: ${e.message}`, "error");
    } finally {
        const inp = document.getElementById('import-project-input');
        if (inp) inp.value = '';
    }
}
window.importProjectBackup = importProjectBackup;

// 4. Giải phóng đệm Canvas & RAM Cache (Clear Memory Cache)
function clearMemoryCache() {
    let count = 0;
    globalState.pages.forEach(page => {
        page.imageDataCache = null;
        if (page.blocks) {
            page.blocks.forEach(b => {
                b.maskCache = null;
                b.autoFitCache = null;
                count++;
            });
        }
    });
    showToast(`Đã giải phóng đệm Canvas của ${globalState.pages.length} trang (${count} ô thoại). RAM mượt mà 60 FPS!`, "success");
}
window.clearMemoryCache = clearMemoryCache;
