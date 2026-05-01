const BINARY_MIME_PREFIXES = ['image/', 'application/pdf', 'application/octet-stream', 'audio/', 'video/'];
const IMAGE_MIME_PREFIX = 'image/';

function isBinary(contentType) {
  return BINARY_MIME_PREFIXES.some(p => contentType?.startsWith(p));
}

function isImage(contentType) {
  return contentType?.startsWith(IMAGE_MIME_PREFIX);
}

function buildBinaryResult(b64, mimeType) {
  const resource = {
    type: 'resource',
    resource: {
      uri: `data:${mimeType};base64,${b64}`,
      mimeType,
      blob: b64
    }
  };
  if (isImage(mimeType)) {
    return [{ type: 'image', data: b64, mimeType }, resource];
  }
  return [resource];
}

module.exports = { isBinary, isImage, buildBinaryResult };
