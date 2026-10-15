import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

class LMSService {
  async getEmployeeId() {
    try {
      const userData = await AsyncStorage.getItem('userData');
      if (userData) {
        const user = JSON.parse(userData);
        return user.employeeNumber || "RC000447";
      }
      return "RC000447";
    } catch (error) {
      console.error('Error getting employee ID:', error);
      return "RC000447";
    }
  }

  async getAllCourses() {
    try {
      const response = await api.get('/ontrack/lms/course');
      
      return {
        success: response.success,
        data: response.data,
        message: response.message,
      };
    } catch (error) {
      console.error('Get courses error:', error);
      return {
        success: false,
        data: [],
        message: error.message || 'Failed to fetch courses',
      };
    }
  }
  
  // Employee's progress: overall summary + status/score per course
  async getEmployeeProgress(employeeId) {
    try {
      const response = await api.get(
        `/ontrack/lms/employee/${encodeURIComponent(employeeId)}/progress`
      );

      return {
        success: response.success,
        data: {
          summary: response.data?.summary || null,
          courses: Array.isArray(response.data?.courses) ? response.data.courses : [],
        },
        message: response.message,
      };
    } catch (error) {
      console.error('Get progress error:', error);
      return {
        success: false,
        data: { summary: null, courses: [] },
        message: error.message || 'Failed to fetch progress',
      };
    }
  }

  async getCourseDetails(courseId) {
    try {
      const response = await api.get(`/ontrack/lms/course/${courseId}`);
      
      return {
        success: response.success,
        data: response.data,
        message: response.message,
      };
    } catch (error) {
      console.error('Get course details error:', error);
      return {
        success: false,
        data: null,
        message: error.message || 'Failed to fetch course details',
      };
    }
  }
  
  async getCourseQuestions(courseId) {
    try {
      const response = await api.get(`/ontrack/lms/course/${courseId}/question`);
      
      return {
        success: response.success,
        data: response.data,
        message: response.message,
      };
    } catch (error) {
      console.error('Get questions error:', error);
      return {
        success: false,
        data: [],
        message: error.message || 'Failed to fetch questions',
      };
    }
  }
  
  async startAttempt(courseId, employeeId) {
    try {
      const response = await api.post('/ontrack/lms/course/attempt/start', {
        courseId,
        employeeId,
      });
      
      return {
        success: response.success,
        data: response.data,
        message: response.message,
      };
    } catch (error) {
      console.error('Start attempt error:', error);
      return {
        success: false,
        data: null,
        message: error.message || 'Failed to start attempt',
      };
    }
  }
  
  async submitAnswer(attemptId, questionId, selectedAnswer) {
    try {
      const response = await api.post('/ontrack/lms/course/attempt/answer', {
        attemptId,
        questionId,
        selectedAnswer,
      });
      
      return {
        success: response.success,
        data: response.data,
        message: response.message,
      };
    } catch (error) {
      console.error('Submit answer error:', error);
      return {
        success: false,
        data: null,
        message: error.message || 'Failed to submit answer',
      };
    }
  }
  
  async submitAttempt(attemptId) {
    try {
      const response = await api.post('/ontrack/lms/course/attempt/submit', {
        attemptId,
      });
      
      return {
        success: response.success,
        data: response.data,
        message: response.message,
      };
    } catch (error) {
      console.error('Submit attempt error:', error);
      return {
        success: false,
        data: null,
        message: error.message || 'Failed to submit attempt',
      };
    }
  }
}

export default new LMSService();