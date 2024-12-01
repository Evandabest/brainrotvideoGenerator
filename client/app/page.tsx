'use client';

import React, { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { Upload, Volume2, Loader2 } from 'lucide-react';
import Navbar from '@/components/navbar';

type ProcessingStatus = 'idle' | 'processing' | 'completed' | 'error' | 'loading';

const voices = [
  { name: "Aria", shortName: "en-US-AriaNeural" },
  { name: "Ana", shortName: "en-US-AnaNeural" },
  { name: "Christopher", shortName: "en-US-ChristopherNeural" },
  { name: "Eric", shortName: "en-US-EricNeural" },
  { name: "Guy", shortName: "en-US-GuyNeural" },
  { name: "Jenny", shortName: "en-US-JennyNeural" },
  { name: "Michelle", shortName: "en-US-MichelleNeural" },
  { name: "Roger", shortName: "en-US-RogerNeural" },
  { name: "Steffan", shortName: "en-US-SteffanNeural" },
];

const MediaCombiner: React.FC = () => {
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [selectedVoice, setSelectedVoice] = useState(voices[0].shortName);
  const [error, setError] = useState<string | null>(null);
  const [ffmpeg, setFFmpeg] = useState<FFmpeg | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [level, setLevel] = useState<number>(0);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

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

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFileSelect(files[0]);
    }
  };

  const handleFileSelect = (file: File) => {
    if (file.type.startsWith('video/')) {
      if (videoRef.current) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        videoRef.current.files = dataTransfer.files;
        setSelectedFileName(file.name);
      }
    } else {
      setError('Please select a valid video file');
    }
  };


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

        //const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/getScript`, {
        //    method: 'POST',
        //    body: formData,
        //});

        const response = await fetch(`https://brainrotvideogenerator-v8er.onrender.com/getScript`, {
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

      //const audioResponse = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/generate-audio`, {
      const audioResponse = await fetch(`https://brainrotvideogenerator-v8er.onrender.com/generate-audio`, {
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <div className="p-6">
        <div className="max-w-2xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg">
          <div className="p-6 space-y-6">
            {status === 'loading' ? (
              <div className="flex items-center justify-center py-8 space-x-2">
                <Loader2 className="animate-spin h-6 w-6 text-blue-500" />
                <span className="text-gray-600 dark:text-gray-300">Loading FFmpeg...</span>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                    Select Voice
                  </label>
                  <select 
                    value={selectedVoice} 
                    onChange={(e) => setSelectedVoice(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-gray-100"
                  >
                    {voices.map((voice) => (
                      <option key={voice.shortName} value={voice.shortName}>
                        {voice.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div 
                  ref={dropZoneRef}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => videoRef.current?.click()}
                  className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors
                    ${dragActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'}
                    ${status === 'processing' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <input
                    type="file"
                    ref={videoRef}
                    accept="video/mp4,video/webm"
                    onChange={(e) => e.target.files && handleFileSelect(e.target.files[0])}
                    className="hidden"
                  />
                  
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <Upload className="h-12 w-12 text-gray-400 dark:text-gray-500" />
                    {selectedFileName ? (
                      <>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Selected file:</p>
                        <p className="text-base font-medium text-gray-800 dark:text-gray-200">
                          {selectedFileName}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-lg font-medium text-gray-700 dark:text-gray-200">
                          Drop your video here
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          or click to choose a file
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          MP4 or WebM format, max 100MB
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                    Brainrot Level
                  </label>
                  <div className="relative pt-1">
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={level}
                      onChange={(e) => setLevel(Number(e.target.value))}
                      className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
                      disabled={status === 'processing'}
                    />
                    <div className="flex justify-between items-center text-xs text-gray-600 dark:text-gray-400 mt-1">
                      <span>Brainrot</span>
                      <span>Brainrotted</span>
                      <span>Brainrotmaxxed</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleCombineMedia}
                  disabled={status === 'processing' || !selectedFileName}
                  className="w-full flex items-center justify-center space-x-2 bg-blue-600 text-white py-3 px-4 rounded-lg font-medium
                    hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800
                    disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
                >
                  {status === 'processing' ? (
                    <>
                      <Loader2 className="animate-spin h-5 w-5" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="h-5 w-5" />
                      <span>Skibidify</span>
                    </>
                  )}
                </button>

                {error && (
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-red-600 dark:text-red-400">{error}</p>
                  </div>
                )}

                {status === 'completed' && (
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <p className="text-green-600 dark:text-green-400 text-center font-medium">
                      Your video has been Skibidified!
                    </p>
                  </div>
                )}

                {videoUrl && (
                  <div className="space-y-4">
                    <video controls src={videoUrl} className="w-full rounded-lg shadow-md" />
                    <a 
                      href={videoUrl} 
                      download="skibidified-video.mp4" 
                      className="block w-full text-center py-2 px-4 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg font-medium transition-colors"
                    >
                      Download Skibidified Video
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MediaCombiner;