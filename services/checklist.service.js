import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

// Last successful templates response — used when offline
const TEMPLATES_CACHE_KEY = 'checklistTemplatesCache';

class ChecklistService {
  // GET /checklist/templates → [{ _id, title, role, instructions, sections: [...] }]
  // Falls back to the cached copy when the API can't be reached.
  async getTemplates() {
    try {
      const response = await api.get('/checklist/templates');
      const data = Array.isArray(response.data) ? response.data : [];
      if (response.success) {
        AsyncStorage.setItem(TEMPLATES_CACHE_KEY, JSON.stringify(data)).catch(() => {});
      }
      return {
        success: response.success,
        data,
        message: response.message,
      };
    } catch (error) {
      console.error('Get checklist templates error:', error);
      try {
        const cached = JSON.parse((await AsyncStorage.getItem(TEMPLATES_CACHE_KEY)) || 'null');
        if (cached?.length) {
          return { success: true, data: cached, fromCache: true, message: error.message };
        }
      } catch { }
      return {
        success: false,
        data: [],
        message: error.message || 'Failed to fetch checklists',
      };
    }
  }

  // POST /checklist/upload — one photo in the "image" form field.
  // photo: { uri, fileName, mimeType } from the image picker.
  // Returns { success, url } — url goes into the submission's imageUrl.
  async uploadImage(photo) {
    try {
      const formData = new FormData();
      formData.append('image', {
        uri: photo.uri,
        name: photo.fileName || `checklist-${Date.now()}.jpg`,
        type: photo.mimeType || 'image/jpeg',
      });

      const response = await api.postFormData('/checklist/upload', formData);
      const data = response.data;
      // Accept the common shapes for the returned link
      const url =
        typeof data === 'string'
          ? data
          : data?.url || data?.imageUrl || data?.fileUrl || data?.location || data?.Location || null;

      if (!response.success || !url) {
        return { success: false, message: response.message || 'Upload did not return an image link' };
      }
      return { success: true, url };
    } catch (error) {
      console.error('Upload checklist image error:', error);
      return { success: false, message: error.message || 'Failed to upload image' };
    }
  }

  // POST /checklist/submissions
  // payload: { templateId, storeId, storeName, date, department, filledByName,
  //            submittedBy: { userId, name, employeeId, role },
  //            answers: [{ itemId, answer?: "YES"|"NO", score?, remark?, imageUrl? }],
  //            submit: true }
  async submit(payload) {
    try {
      const response = await api.post('/checklist/submissions', payload);
      return {
        success: response.success,
        data: response.data,
        message: response.message,
      };
    } catch (error) {
      console.error('Submit checklist error:', error);
      return {
        success: false,
        message: error.message || 'Failed to submit checklist',
      };
    }
  }
}

export default new ChecklistService();
