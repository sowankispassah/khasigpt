"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DOCUMENT_UPLOADS_ACCESS_MODE_FALLBACK = exports.DOCUMENT_UPLOADS_MAX_BYTES = exports.DOCUMENT_UPLOADS_MAX_TEXT_CHARS = exports.DOCUMENT_EXTENSION_BY_MIME = exports.DOCUMENT_MIME_TYPES = exports.IMAGE_MIME_TYPES = void 0;
exports.isDocumentMimeType = isDocumentMimeType;
exports.parseDocumentUploadsEnabledSetting = parseDocumentUploadsEnabledSetting;
exports.parseDocumentUploadsAccessModeSetting = parseDocumentUploadsAccessModeSetting;
exports.getAttachmentAcceptValue = getAttachmentAcceptValue;
const feature_access_1 = require("@/lib/feature-access");
exports.IMAGE_MIME_TYPES = ["image/jpeg", "image/png"];
exports.DOCUMENT_MIME_TYPES = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
exports.DOCUMENT_EXTENSION_BY_MIME = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};
exports.DOCUMENT_UPLOADS_MAX_TEXT_CHARS = 80000;
exports.DOCUMENT_UPLOADS_MAX_BYTES = 5 * 1024 * 1024;
function isDocumentMimeType(value) {
    return exports.DOCUMENT_MIME_TYPES.includes(value);
}
function parseDocumentUploadsEnabledSetting(value) {
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "string") {
        return value.toLowerCase() === "true";
    }
    return false;
}
exports.DOCUMENT_UPLOADS_ACCESS_MODE_FALLBACK = "disabled";
function parseDocumentUploadsAccessModeSetting(value) {
    return (0, feature_access_1.parseFeatureAccessMode)(value, exports.DOCUMENT_UPLOADS_ACCESS_MODE_FALLBACK);
}
function getAttachmentAcceptValue(documentUploadsEnabled) {
    const mimeTypes = documentUploadsEnabled
        ? [...exports.IMAGE_MIME_TYPES, ...exports.DOCUMENT_MIME_TYPES]
        : [...exports.IMAGE_MIME_TYPES];
    return mimeTypes.join(",");
}
