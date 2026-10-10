const SERVER_URL = import.meta.env.PROD
  ? window.location.origin
  : (import.meta.env.VITE_SERVER_URL || `http://${window.location.hostname}:3001`);

export const apiService = {

  async getNetworkInfo() {
    const res = await fetch(`${SERVER_URL}/api/rooms/network`);
    if (!res.ok) throw new Error('Failed to fetch network info');
    return res.json();
  },

  async uploadAudio(file) {
    const formData = new FormData();
    formData.append('audio', file);

    const res = await fetch(`${SERVER_URL}/api/audio/upload`, {
      method: 'POST',
      body: formData
    });

    if (!res.ok) throw new Error('Failed to upload audio file');
    const data = await res.json();
    return {
      ...data,
      url: `${SERVER_URL}${data.url}`
    };
  },

  createUrlTrack(directUrl, title) {
    const filename = title || directUrl.split('/').pop()?.split('?')[0] || 'Direct Stream Track';
    // If it is an external URL, route through LAN proxy to bypass CORS and ensure Web Audio decoding
    const isExternal = directUrl.startsWith('http://') || directUrl.startsWith('https://');
    const proxiedUrl = isExternal
      ? `${SERVER_URL}/api/audio/proxy?url=${encodeURIComponent(directUrl)}`
      : directUrl;

    return {
      id: `url-${Date.now()}`,
      originalName: filename,
      filename,
      size: 0,
      url: proxiedUrl,
      directUrl,
      mimeType: 'audio/mpeg',
      isStream: true
    };
  }
};

