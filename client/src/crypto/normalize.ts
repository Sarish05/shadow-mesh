const u8 = (x: ArrayLike<number>): Uint8Array<ArrayBuffer> => {
  const r = new Uint8Array(x.length);
  r.set(x);
  return r;
};

export async function normalizeImage(file: File): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1024;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        const ratio = Math.min(MAX / width, MAX / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('toBlob failed'));
          blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
        },
        'image/jpeg',
        0.85
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}

export async function normalizeAudio(blob: Blob): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await blob.arrayBuffer());
}

export function textToBytes(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text);
}

export function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function bytesToImageUrl(bytes: Uint8Array): string {
  return URL.createObjectURL(new Blob([u8(bytes)], { type: 'image/jpeg' }));
}

export function bytesToAudioUrl(bytes: Uint8Array): string {
  return URL.createObjectURL(new Blob([u8(bytes)], { type: 'audio/webm;codecs=opus' }));
}
