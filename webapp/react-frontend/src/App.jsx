import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import SelectPage from './pages/SelectPage';
import StudentPage from './pages/StudentPage';
import TeacherPage from './pages/TeacherPage';
import StudentResultsPage from './pages/StudentResultsPage';
import StoryPage from './pages/StoryPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/static/select.html" element={<SelectPage />} />
        <Route path="/static/student.html" element={<StudentPage />} />
        <Route path="/static/teacher.html" element={<TeacherPage />} />
        <Route path="/static/student_results.html" element={<StudentResultsPage />} />
        <Route path="/static/story.html" element={<StoryPage />} />
      </Routes>
    </BrowserRouter>
  );
}
