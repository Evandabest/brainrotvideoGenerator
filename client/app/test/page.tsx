'use client';

import { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

type ProcessingStatus = 'idle' | 'loading' | 'processing' | 'completed' | 'error';

const voices = [
  { name: "Microsoft Server Speech Text to Speech Voice (en-US, AriaNeural)", shortName: "en-US-AriaNeural" },
  { name: "Microsoft Server Speech Text to Speech Voice (en-US, AnaNeural)", shortName: "en-US-AnaNeural" },
  { name: "Microsoft Server Speech Text to Speech Voice (en-US, ChristopherNeural)", shortName: "en-US-ChristopherNeural" },
  { name: "Microsoft Server Speech Text to Speech Voice (en-US, EricNeural)", shortName: "en-US-EricNeural" },
  { name: "Microsoft Server Speech Text to Speech Voice (en-US, GuyNeural)", shortName: "en-US-GuyNeural" },
  { name: "Microsoft Server Speech Text to Speech Voice (en-US, JennyNeural)", shortName: "en-US-JennyNeural" },
  { name: "Microsoft Server Speech Text to Speech Voice (en-US, MichelleNeural)", shortName: "en-US-MichelleNeural" },
  { name: "Microsoft Server Speech Text to Speech Voice (en-US, RogerNeural)", shortName: "en-US-RogerNeural" },
  { name: "Microsoft Server Speech Text to Speech Voice (en-US, SteffanNeural)", shortName: "en-US-SteffanNeural" },
];

const MediaCombiner: React.FC = () => {
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [selectedVoice, setSelectedVoice] = useState(voices[0].shortName);
  const [error, setError] = useState<string | null>(null);
  const [ffmpeg, setFFmpeg] = useState<FFmpeg | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [level, setLevel] = useState<number>(0);
  
  const videoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadFFmpeg = async () => {
      try {
        setStatus('loading');
        const ffmpegInstance = new FFmpeg();
        
        await ffmpegInstance.load({
          coreURL: await toBlobURL(`/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`/ffmpeg-core.wasm`, 'application/wasm'),
        });
        
        setFFmpeg(ffmpegInstance);
        setStatus('idle');
      } catch {
        setError('Failed to load FFmpeg');
        setStatus('error');
      }
    };
    
    loadFFmpeg();
  }, []);

  const getVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.src = url;
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(video.duration);
      };
      video.onerror = () => {
        reject('Failed to load video metadata');
      };
    });
  };

  type VoiceChangeEvent = React.ChangeEvent<HTMLSelectElement>;

  const handleVoiceChange = (event: VoiceChangeEvent) => {
    setSelectedVoice(event.target.value);
  };

  const handleLevelChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setLevel(Number(event.target.value));
  };

  const getScript = async () => {
    try {
        if (!ffmpeg) {
            throw new Error('FFmpeg is not loaded yet');
        }

        if (!videoRef.current?.files?.[0]) {
            throw new Error('Please select a video file');
        }

        setStatus('processing');
        setError(null);
        const videoFile = videoRef.current.files[0];
        const videoDuration = await getVideoDuration(videoFile);

        console.log(`Video Duration (before ceiling): ${videoDuration}`);

        const ceiledDuration = Math.ceil(videoDuration); // Ensure it's an integer
        console.log(`Video Duration (ceiled): ${ceiledDuration}`);

        const formData = new FormData();
        formData.append('video', videoFile);
        formData.append('duration', ceiledDuration.toString()); // Append as string
        formData.append('level', level.toString()); // Append level as string

        console.log(`FormData Duration: ${formData.get('duration')}`);
        console.log(`FormData Level: ${formData.get('level')}`);

        const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/getScript`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to generate script');
        }

        const data = await response.json();
        console.log(`Server Response:`, data);
        return data.script;
    } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        setStatus('error');
    }
};
        

  const handleCombineMedia = async (): Promise<void> => {
    try {
      if (!ffmpeg) {
        throw new Error('FFmpeg is not loaded yet');
      }

      if (!videoRef.current?.files?.[0]) {
        throw new Error('Please select a video file');
      }

      setStatus('processing');
      setError(null);

      const videoFile = videoRef.current.files[0];

      const MAX_FILE_SIZE = 100 * 1024 * 1024;
      if (videoFile.size > MAX_FILE_SIZE) {
        throw new Error('Video file size exceeds 100MB limit');
      }

        const script = await getScript();

        console.log(script);

      const formData = new FormData();
      formData.append('script', script);
      formData.append('voice', selectedVoice);

      const audioResponse = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/generate-audio`, {
        method: 'POST',
        body: formData
      });

      console.log(audioResponse);

      if (!audioResponse.ok) {
        throw new Error('Failed to generate audio');
      }

      const videoArrayBuffer = await videoFile.arrayBuffer();
      const audioArrayBuffer = await audioResponse.arrayBuffer();

      await ffmpeg.writeFile('input.mp4', new Uint8Array(videoArrayBuffer));
      await ffmpeg.writeFile('audio.mp3', new Uint8Array(audioArrayBuffer));

      await ffmpeg.exec([
        '-i', 'input.mp4',
        '-i', 'audio.mp3',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-shortest',
        'output.mp4'
      ]);

      const data = await ffmpeg.readFile('output.mp4');
      const blob = new Blob([data], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);

      setVideoUrl(url);

      await ffmpeg.deleteFile('input.mp4');
      await ffmpeg.deleteFile('audio.mp3');
      await ffmpeg.deleteFile('output.mp4');

      setStatus('completed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setStatus('error');
    }
  };

  return (
    <div className="p-4 max-w-xl mx-auto">
      {status === 'loading' && (
        <div className="text-center py-4">
          Loading FFmpeg... Please wait.
        </div>
      )}

      <div className="space-y-4">
        <select value={selectedVoice} onChange={handleVoiceChange}>
          {voices.map((voice) => (
            <option key={voice.shortName} value={voice.shortName}>
              {voice.name}
            </option>
          ))}
        </select>
        <div>
          <label className="block text-sm font-medium mb-2">
            Select Video File:
          </label>
          <input
            type="file"
            ref={videoRef}
            accept="video/mp4,video/webm"
            className="w-full border rounded p-2"
            disabled={status === 'loading' || status === 'processing'}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Brainrot Level:
          </label>
          <input
            type="range"
            min="0"
            max="5"
            value={level}
            onChange={handleLevelChange}
            className="w-full"
            disabled={status === 'loading' || status === 'processing'}
          />
          <div className="flex justify-between text-xs">
            <span>Brainrot</span>
            <span>Brainrotmaxxed</span>
          </div>
        </div>

        <button
          onClick={handleCombineMedia}
          disabled={status === 'loading' || status === 'processing'}
          className="w-full bg-blue-500 text-white py-2 px-4 rounded disabled:bg-gray-400"
        >
          {status === 'loading' ? 'Loading FFmpeg...' : 
           status === 'processing' ? 'Processing...' : 
           'Generate Video with Voiceover'}
        </button>

        {error && (
          <div className="text-red-500 mt-2">{error}</div>
        )}

        {status === 'completed' && (
          <div className="text-green-500 mt-2 text-center font-medium">
            Video with voiceover has been generated!
          </div>
        )}

        {videoUrl && (
          <div className="mt-4">
            <video controls src={videoUrl} className="w-full" />
            <a href={videoUrl} download="video-with-voiceover.mp4" className="block mt-2 text-center text-blue-500">
              Download Video
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

export default MediaCombiner;