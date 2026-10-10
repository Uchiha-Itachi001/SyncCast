const SERVER_URL = import.meta.env.VITE_SERVER_URL || (import.meta.env.PROD
  ? window.location.origin
  : `http://${window.location.hostname}:3001`);

export const apiService = {


  async getNetworkInfo() {
    const res = await fetch(`${SERVER_URL}/api/rooms/network`);
    if (!res.ok) throw new Error('Failed to fetch network info');
    return res.json();
  },

  uploadAudio(file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('audio', file);

      xhr.open('POST', `${SERVER_URL}/api/audio/upload`);

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            onProgress({
              percent,
              loaded: event.loaded,
              total: event.total,
              filename: file.name
            });
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve({
              ...data,
              url: `${SERVER_URL}${data.url}`
            });
          } catch (e) {
            reject(new Error('Invalid JSON response from audio upload'));
          }
        } else {
          reject(new Error(`Failed to upload audio file (${xhr.status}): ${xhr.statusText || 'Server Error'}`));
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network error during audio upload'));
      };

      xhr.send(formData);
    });
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

