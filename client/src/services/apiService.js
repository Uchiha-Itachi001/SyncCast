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

  async extractYoutubeAudio(youtubeUrl, socketId = null) {
    let targetUrl = `${SERVER_URL}/api/audio/youtube`;
    let res = null;
    let primaryFailed = false;

    try {
      res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: youtubeUrl, socketId })
      });
      if (res.status === 404) {
        primaryFailed = true;
      }
    } catch (netErr) {
      primaryFailed = true;
    }

    // Auto-fallback: If remote cloud server returned 404 (e.g. Render without updated route) or net error,
    // and a local backend is running (port 3001), try local backend automatically!
    const localHostUrl = `http://${window.location.hostname || 'localhost'}:3001`;
    if (primaryFailed && SERVER_URL !== localHostUrl) {
      console.warn(`[SyncCast] Primary server (${SERVER_URL}) returned 404 or failed on /api/audio/youtube. Attempting local backend (${localHostUrl})...`);
      try {
        const localRes = await fetch(`${localHostUrl}/api/audio/youtube`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: youtubeUrl, socketId })
        });
        if (localRes && localRes.ok) {
          const data = await localRes.json();
          return {
            ...data,
            url: `${localHostUrl}${data.url}`
          };
        }
      } catch (localErr) {
        console.warn('[SyncCast] Local fallback also unreachable:', localErr.message);
      }
    }

    if (!res || !res.ok) {
      const err = await res?.json().catch(() => ({}));
      if (res?.status === 404) {
        throw new Error(
          `Server returned 404. Your client is pointing to "${SERVER_URL}", which does not have the YouTube extractor deployed yet. Please clear or update VITE_SERVER_URL in client/.env to use your local server, or deploy the updated code to Render.`
        );
      }
      throw new Error(err?.error || `Failed to extract YouTube audio (${res?.status || 'Network Error'})`);
    }

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

