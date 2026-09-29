import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

const api = {
    async request(endpoint, options = {}) {
        const token = await AsyncStorage.getItem('userToken');

        const headers = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...options.headers,
        };

        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(`${BASE_URL}${endpoint}`, {
            ...options,
            headers,
        });

        const responseText = await response.text();

        console.log('API URL:', `${BASE_URL}${endpoint}`);
        console.log('Status:', response.status);
        console.log('Response:', responseText);

        let data = {};

        try {
            data = responseText ? JSON.parse(responseText) : {};
        } catch (e) {
            console.error('JSON Parse Error:', e);
            throw new Error(
                `Invalid JSON response from server: ${responseText}`
            );
        }

        if (!response.ok) {
            throw new Error(data.message || 'Something went wrong');
        }

        return data;
    },

    async putFormData(endpoint, formData) {
        const token = await AsyncStorage.getItem('userToken');

        const headers = {
            Accept: 'application/json',
        };

        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(`${BASE_URL}${endpoint}`, {
            method: 'PUT',
            headers,
            body: formData,
        });

        const responseText = await response.text();

        console.log('API FormData URL:', `${BASE_URL}${endpoint}`);
        console.log('Status:', response.status);
        console.log('Response:', responseText);

        let data = {};

        try {
            data = responseText ? JSON.parse(responseText) : {};
        } catch (e) {
            console.error('JSON Parse Error:', e);
            throw new Error(
                `Invalid JSON response from server: ${responseText}`
            );
        }

        if (!response.ok) {
            throw new Error(data.message || 'Something went wrong');
        }

        return data;
    },

    get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    },

    post(endpoint, body) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(body),
        });
    },

    put(endpoint, body) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(body),
        });
    },

    delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    },
};

export default api;