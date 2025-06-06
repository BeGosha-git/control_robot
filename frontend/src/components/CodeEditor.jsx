import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { 
  Box, 
  Paper, 
  Typography,
  Button,
  ThemeProvider,
  createTheme,
  CircularProgress
} from '@mui/material';
import Editor from '@monaco-editor/react';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CloseIcon from '@mui/icons-material/Close';
import * as monaco from 'monaco-editor';
import { useRobot } from '../contexts/RobotContext';

// Создаем тёмную тему
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#90caf9',
    },
    secondary: {
      main: '#f48fb1',
    },
    background: {
      default: '#1a1a1a',
      paper: '#2d2d2d',
    },
    text: {
      primary: '#ffffff',
      secondary: '#b0b0b0',
    },
  },
});

const CodeEditor = ({ 
  selectedFile, 
  fileContent, 
  onEditorChange, 
  robotButtons = [],
  readOnly = false
}) => {
  const { executeCommand } = useRobot();
  const [editorReady, setEditorReady] = useState(false);
  const [mounted, setMounted] = useState(false);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const modelRef = useRef(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const getLanguageFromPath = useCallback((path) => {
    if (!path) return 'plaintext';
    const extension = path.split('.').pop().toLowerCase();
    const languageMap = {
      'py': 'python',
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'cpp': 'cpp',
      'c': 'c',
      'h': 'cpp',
      'hpp': 'cpp',
      'txt': 'plaintext',
      'json': 'json',
      'html': 'html',
      'css': 'css',
      'md': 'markdown'
    };
    return languageMap[extension] || 'plaintext';
  }, []);

  const language = useMemo(() => getLanguageFromPath(selectedFile), [selectedFile, getLanguageFromPath]);

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    
    if (selectedFile && fileContent !== undefined) {
      const uri = monaco.Uri.parse(`file:///${selectedFile}`);
      let model = monaco.editor.getModel(uri);
      
      if (!model) {
        model = monaco.editor.createModel(fileContent, language, uri);
      } else {
          model.setValue(fileContent);
        monaco.editor.setModelLanguage(model, language);
      }
      
      modelRef.current = model;
      editor.setModel(model);
    }

    editor.updateOptions({
      minimap: { enabled: true },
      fontSize: 14,
      fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace",
      fontLigatures: true,
      wordWrap: 'on',
      automaticLayout: true,
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: true,
      lineNumbers: 'on',
      renderLineHighlight: 'all',
      scrollbar: {
        vertical: 'visible',
        horizontal: 'visible',
        useShadows: true,
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
      },
      bracketPairColorization: {
        enabled: true
      },
      guides: {
        bracketPairs: true,
        indentation: true,
        highlightActiveIndentGuide: true
      },
      suggest: {
        preview: true,
        showMethods: true,
        showFunctions: true,
        showConstructors: true,
        showFields: true,
        showVariables: true,
        showClasses: true,
        showStructs: true,
        showInterfaces: true,
        showModules: true,
        showProperties: true,
        showEvents: true,
        showOperators: true,
        showUnits: true,
        showValues: true,
        showConstants: true,
        showEnums: true,
        showEnumMembers: true,
        showKeywords: true,
        showWords: true,
        showColors: true,
        showFiles: true,
        showReferences: true,
        showFolders: true,
        showTypeParameters: true,
        showSnippets: true
      }
    });

    setEditorReady(true);
  };

  useEffect(() => {
    if (!monacoRef.current || !selectedFile || fileContent === undefined) return;
    const monaco = monacoRef.current;
    const uri = monaco.Uri.parse(`file:///${selectedFile}`);

    let model = monaco.editor.getModel(uri);

    if (!model) {
      model = monaco.editor.createModel(fileContent, language, uri);
    } else {
        model.setValue(fileContent);
      monaco.editor.setModelLanguage(model, language);
    }

    modelRef.current = model;
    if (editorRef.current && !editorRef.current._isDisposed) {
      editorRef.current.setModel(model);
    }
  }, [selectedFile, fileContent, language]);

  useEffect(() => {
    return () => {
      if (modelRef.current && typeof modelRef.current.dispose === 'function' && !modelRef.current.isDisposed) {
        modelRef.current.dispose();
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedFile) {
      if (editorRef.current) {
        editorRef.current.setModel(null);
      }
      if (modelRef.current) {
        modelRef.current.dispose();
        modelRef.current = null;
      }
      editorRef.current = null;
      monacoRef.current = null;
    }
  }, [selectedFile]);

  const handleRunButton = async (btn) => {
    if (!selectedFile) return;
    try {
      await executeCommand(btn);
    } catch (error) {
      console.error('Ошибка при выполнении команды:', error);
    }
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <Box sx={{ 
        display: 'flex', 
        height: '100%', 
        bgcolor: 'background.default',
        color: 'text.primary',
        flexDirection: 'column'
      }}>
        <Box sx={{ 
          flex: 1, 
          minHeight: 0, 
          minWidth: 0, 
          width: '100%', 
          display: 'flex', 
          flexDirection: 'column', 
          overflow: 'hidden', 
          p: 0, 
          m: 0
        }}>
          {selectedFile ? (
            <Paper 
              elevation={0} 
              sx={{ 
                flex: 1,
                minHeight: 0,
                minWidth: 0,
                width: '100%',
                height: '100%',
                overflow: 'hidden',
                p: 0,
                m: 0,
                boxShadow: 'none',
                background: 'none',
                display: 'flex',
                flexDirection: 'column',
                visibility: editorReady ? 'visible' : 'hidden'
              }}
            >
              <Box sx={{ 
                width: '100%', 
                height: '100%', 
                position: 'relative',
                '& .monaco-editor': {
                  '& .margin': {
                    bgcolor: 'rgba(26, 26, 26, 0.95) !important'
                  },
                  '& .monaco-editor-background': {
                    bgcolor: 'rgba(26, 26, 26, 0.95) !important'
                  }
                }
              }}>
                <Editor
                  height="100%"
                  defaultLanguage="plaintext"
                  language={language}
                  value={fileContent}
                  onChange={onEditorChange}
                  onMount={handleEditorDidMount}
                  options={{
                    readOnly,
                    minimap: { enabled: true },
                    fontSize: 14,
                    fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace",
                    fontLigatures: true,
                    wordWrap: 'on',
                    automaticLayout: true,
                    scrollBeyondLastLine: false,
                    smoothScrolling: true,
                    cursorBlinking: 'smooth',
                    cursorSmoothCaretAnimation: true,
                    lineNumbers: 'on',
                    renderLineHighlight: 'all',
                    scrollbar: {
                      vertical: 'visible',
                      horizontal: 'visible',
                      useShadows: true,
                      verticalScrollbarSize: 10,
                      horizontalScrollbarSize: 10,
                    },
                    bracketPairColorization: {
                      enabled: true
                    },
                    guides: {
                      bracketPairs: true,
                      indentation: true,
                      highlightActiveIndentGuide: true
                    }
                  }}
                  theme="vs-dark"
                  loading={
                    <Box sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      height: '100%',
                      bgcolor: 'rgba(26, 26, 26, 0.95)'
                    }}>
                      <CircularProgress size={40} thickness={4} />
                    </Box>
                  }
                />
              </Box>
            </Paper>
          ) : (
            <Box sx={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 2,
              color: 'text.secondary',
              bgcolor: 'rgba(26, 26, 26, 0.95)',
              backdropFilter: 'blur(10px)'
            }}>
              <InsertDriveFileIcon sx={{ fontSize: 48, opacity: 0.5 }} />
              <Typography variant="h6" sx={{ opacity: 0.7 }}>
                Выберите файл в дереве слева
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </ThemeProvider>
  );
};

export default CodeEditor; 