import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

// Friendly text when the server is down / not returning JSON
function messageForStatus(status) {
    if (status >= 500) {
        return 'Server is temporarily unavailable. Please try again in a few minutes.';
    }
    if (status === 404) {
        return 'Service is not available right now. Please try again later.';
    }
    if (status === 401 || status === 403) {
        return 'Your session has expired. Please login again.';
    }
    return 'Something went wrong. Please try again.';
}

function buildError(message, status) {
    const error = new Error(message);
    error.status = status;
    return error;
}

// Shared fetch + parse for JSON and form-data requests
async function send(url, init, label) {
    let response;
    try {
        response = await fetch(url, init);
    } catch (e) {
        // No internet / DNS / server unreachable
        console.warn(`[api] Network error for ${url}:`, e?.message);
        throw buildError(
            'Unable to reach the server. Check your internet connection and try again.',
            0
        );
    }

    const responseText = await response.text();

    console.log(`${label}:`, url);
    console.log('Status:', response.status);
    console.log('Response:', responseText);

    let data = {};
    try {
        data = responseText ? JSON.parse(responseText) : {};
    } catch (e) {
        // Gateway/proxy pages (e.g. "upstream connect error") are not JSON.
        // warn, not error — this is a server outage, not an app crash.
        console.warn(
            `[api] Non-JSON response (${response.status}) from ${url}:`,
            responseText.slice(0, 200)
        );
        throw buildError(
            response.ok
                ? 'Unexpected response from server. Please try again.'
                : messageForStatus(response.status),
            response.status
        );
    }

    if (!response.ok) {
        throw buildError(
            data.message || messageForStatus(response.status),
            response.status
        );
    }

    return data;
}

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

        return send(
            `${BASE_URL}${endpoint}`,
            { ...options, headers },
            'API URL'
        );
    },

    putFormData(endpoint, formData) {
        return this.sendFormData('PUT', endpoint, formData);
    },

    postFormData(endpoint, formData) {
        return this.sendFormData('POST', endpoint, formData);
    },

    // No Content-Type header: fetch sets multipart/form-data with the boundary
    async sendFormData(method, endpoint, formData) {
        const token = await AsyncStorage.getItem('userToken');

        const headers = {
            Accept: 'application/json',
        };

        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        return send(
            `${BASE_URL}${endpoint}`,
            { method, headers, body: formData },
            'API FormData URL'
        );
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

    patch(endpoint, body) {
        return this.request(endpoint, {
            method: 'PATCH',
            body: JSON.stringify(body),
        });
    },

    delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    },
};

export default api;