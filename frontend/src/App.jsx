import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Box, AppBar } from '@mui/material';
import CommandPanel from './components/CommandPanel';
import EditorPage from './components/EditorPage';
import ConfigPage from './components/ConfigPage';
import MotionCreator from './pages/MotionCreator';

const App = () => {
  return (
    <Router>
      <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: 0, minWidth: 0, p: 0, m: 0 }}>
        <AppBar position="fixed">
          {/* ... existing code ... */}
        </AppBar>
        <Box component="main" sx={{ flexGrow: 1, width: '100%', height: '100%', minHeight: 0, minWidth: 0, p: 0, m: 0 }}>
          <Routes>
            <Route path="/" element={<CommandPanel />} />
            <Route path="/editor" element={<EditorPage />} />
            <Route path="/config" element={<ConfigPage />} />
            <Route path="/motion" element={<MotionCreator />} />
          </Routes>
        </Box>
      </Box>
    </Router>
  );
};

export default App; 