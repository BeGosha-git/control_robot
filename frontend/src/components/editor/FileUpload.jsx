import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import './FileUpload.css';

const FileUpload = ({ onFileUpload }) => {
  const onDrop = useCallback((acceptedFiles) => {
    acceptedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        onFileUpload({
          name: file.name,
          content: reader.result,
          type: file.type,
          size: file.size,
        });
      };
      reader.readAsText(file);
    });
  }, [onFileUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
  });

  return (
    <div
      {...getRootProps()}
      className={`file-upload ${isDragActive ? 'drag-active' : ''}`}
    >
      <input {...getInputProps()} />
      {isDragActive ? (
        <p>Перетащите файлы сюда...</p>
      ) : (
        <p>Перетащите файлы сюда или нажмите для выбора</p>
      )}
    </div>
  );
};

export default FileUpload; 