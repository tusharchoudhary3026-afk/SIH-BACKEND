import React, { DragEvent, ChangeEvent } from 'react';
import { Upload } from 'lucide-react';

interface UploadZoneProps {
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileSelect: (file: File) => void;
}

export const UploadZone: React.FC<UploadZoneProps> = ({ fileInputRef, onFileSelect }) => {
  const [isDragOver, setIsDragOver] = React.useState(false);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  const handleTriggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="space-y-6">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/tiff"
        className="hidden"
        onChange={handleInputChange}
      />

      <div
        onClick={handleTriggerFileInput}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`w-full bg-[#11141E] rounded-3xl p-10 sm:p-14 border-2 border-dashed transition-all duration-200 cursor-pointer flex flex-col items-center justify-center text-center shadow-xl ${
          isDragOver
            ? 'border-orange-500 bg-orange-950/30 scale-[1.01]'
            : 'border-white/15 hover:border-orange-500/60 hover:bg-[#151826]'
        }`}
      >
        <div className="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 mb-5 shadow-inner">
          <Upload className="w-8 h-8" />
        </div>

        <h3 className="text-base sm:text-lg font-semibold text-white mb-1">
          Drop your image here, or <span className="text-orange-400 hover:underline">browse files</span>
        </h3>
        <p className="text-xs text-gray-400 max-w-sm mb-4">
          Supports JPG, PNG, WEBP up to 25MB. Images are analyzed in-memory and not stored.
        </p>

        <button
          type="button"
          className="mt-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-500 px-6 py-3 rounded-full transition-all duration-300 hover:shadow-[0_0_15px_rgba(249,115,22,0.3),0_0_25px_rgba(234,88,12,0.15)] hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_20px_rgba(234,88,12,0.4)]"
        >
          Select Image from Device
        </button>
      </div>
    </div>
  );
};
