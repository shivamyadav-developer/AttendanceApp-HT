import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

// Ticket statuses that mean the fitting is finished
export const FITTING_COMPLETED_STATUSES = [
    'FITTING_DONE',
    'RESOLVED',
    'CLOSED',
];

// The backend ignores the isFittingDone query param and often leaves
// fitting.isFittingDone=false after resolving, so status is the source of truth.
export const isFittingCompleted = (ticket) =>
    ticket?.isFittingDone === true ||
    ticket?.fitting?.isFittingDone === true ||
    FITTING_COMPLETED_STATUSES.includes(ticket?.status);

class FitterService {
    // --------------------------------------------------
    // Get logged-in fitter information
    // --------------------------------------------------
    async getCurrentFitter() {
        const userData = await AsyncStorage.getItem('userData');

        if (!userData) {
            throw new Error(
                'User session not found. Please login again.'
            );
        }

        let user;

        try {
            user = JSON.parse(userData);
        } catch (error) {
            throw new Error(
                'Invalid user session. Please login again.'
            );
        }

        const fitterId = user.id || user._id;
        const siteId = user.siteId;
        const role = user.role;

        if (!fitterId) {
            throw new Error('Fitter ID missing.');
        }

        return {
            user,
            fitterId: String(fitterId),
            employeeNumber: String(user.employeeNumber || ''),
            siteId,
            role,
        };
    }

    // --------------------------------------------------
    // Is this ticket assigned to the logged-in fitter?
    //
    // Tickets store the assignment as
    // fitting.assignedToId = <employee number>.
    // assignedToFitterId (Mongo _id) is kept as a fallback.
    // --------------------------------------------------
    isAssignedTo(ticket, employeeNumber, fitterId) {
        const assignedToId = ticket?.fitting?.assignedToId;

        if (assignedToId != null && employeeNumber) {
            return String(assignedToId) === employeeNumber;
        }

        return (
            ticket?.assignedToFitterId != null &&
            String(ticket.assignedToFitterId) === fitterId
        );
    }

    // --------------------------------------------------
    // Build common site filter
    // --------------------------------------------------
    buildSiteQuery(siteId, role) {
        if (role && role.toUpperCase() !== 'HO') {
            if (!siteId) {
                throw new Error(
                    'Site ID missing for non-HO user.'
                );
            }

            return `&siteId=${encodeURIComponent(siteId)}`;
        }

        return '';
    }

    // --------------------------------------------------
    // Validate ticket response
    // --------------------------------------------------
    validateTicketResponse(response) {
        if (
            !response?.success ||
            !response?.data ||
            !Array.isArray(response.data.tickets)
        ) {
            throw new Error(
                response?.message ||
                'Invalid response from server.'
            );
        }

        return response.data.tickets;
    }

    // --------------------------------------------------
    // Get fitter pending tasks
    //
    // Website logic:
    // isDeliveryDone = true
    // isFitting = true
    // isFittingDone = false
    // --------------------------------------------------
    async getPendingTasks() {
        const {
            fitterId,
            employeeNumber,
            siteId,
            role,
        } = await this.getCurrentFitter();

        const siteQuery =
            this.buildSiteQuery(siteId, role);

        const endpoint =
            '/tickets' +
            '?isDeliveryDone=true' +
            '&isFitting=true' +
            '&isFittingDone=false' +
            '&limit=100000' +
            siteQuery;

        const response = await api.get(endpoint);

        const tickets =
            this.validateTicketResponse(response);

        return tickets.filter(
            ticket =>
                ticket.isFitting === true &&
                !isFittingCompleted(ticket) &&
                this.isAssignedTo(ticket, employeeNumber, fitterId)
        );
    }

    // --------------------------------------------------
    // Get fitter completed tasks
    //
    // Website logic:
    // isFitting = true
    // isFittingDone = true
    // --------------------------------------------------
    async getCompletedTasks() {
        const {
            fitterId,
            employeeNumber,
            siteId,
            role,
        } = await this.getCurrentFitter();

        const siteQuery =
            this.buildSiteQuery(siteId, role);

        const endpoint =
            '/tickets' +
            '?isFitting=true' +
            '&isFittingDone=true' +
            '&limit=100000' +
            siteQuery;

        const response = await api.get(endpoint);

        const tickets =
            this.validateTicketResponse(response);

        return tickets.filter(
            ticket =>
                ticket.isFitting === true &&
                isFittingCompleted(ticket) &&
                this.isAssignedTo(ticket, employeeNumber, fitterId)
        );
    }

    // --------------------------------------------------
    // Dashboard
    //
    // IMPORTANT:
    // Do NOT call:
    // /tickets?limit=100000
    //
    // That downloads every ticket from the site/system.
    //
    // Instead use the same two filtered datasets already
    // used by the fitter screens.
    // --------------------------------------------------
    async getDashboardTasks() {
        const [
            pendingTasks,
            completedTasks,
        ] = await Promise.all([
            this.getPendingTasks(),
            this.getCompletedTasks(),
        ]);

        const combined = [
            ...pendingTasks,
            ...completedTasks,
        ];

        // Safety against duplicate ticket IDs
        const uniqueTasks = Array.from(
            new Map(
                combined.map(ticket => [
                    String(ticket._id),
                    ticket,
                ])
            ).values()
        );

        return uniqueTasks;
    }

    // --------------------------------------------------
    // Get one fitting task
    // --------------------------------------------------
    async getTaskById(ticketId) {
        if (!ticketId) {
            throw new Error(
                'Ticket ID is required.'
            );
        }

        const response = await api.get(
            `/tickets/${encodeURIComponent(ticketId)}`
        );

        if (
            !response?.success ||
            !response?.data
        ) {
            throw new Error(
                response?.message ||
                'Ticket not found.'
            );
        }

        return response.data;
    }

    // --------------------------------------------------
    // Send customer OTP
    // --------------------------------------------------
    async sendCustomerOtp(customerMobile) {
        if (!customerMobile) {
            throw new Error(
                'Customer mobile number is required.'
            );
        }

        return await api.post(
            '/tickets/otp-send',
            {
                customerMobile,
            }
        );
    }

    // --------------------------------------------------
    // Verify customer OTP
    // --------------------------------------------------
    async verifyCustomerOtp(
        customerMobile,
        otp
    ) {
        if (!customerMobile) {
            throw new Error(
                'Customer mobile number is required.'
            );
        }

        if (!otp) {
            throw new Error(
                'OTP is required.'
            );
        }

        return await api.post(
            '/tickets/otp-verify',
            {
                customerMobile,
                otp,
            }
        );
    }

    // --------------------------------------------------
    // Update fitting status
    // --------------------------------------------------
    async updateStatus(
        ticketId,
        status
    ) {
        const {
            fitterId,
            user,
        } = await this.getCurrentFitter();

        if (!ticketId) {
            throw new Error(
                'Ticket ID is required.'
            );
        }

        if (!status) {
            throw new Error(
                'Status is required.'
            );
        }

        return await api.put(
            `/tickets/${encodeURIComponent(ticketId)}`,
            {
                status,
                performedBy: 'FITTER',
                performedById: fitterId,
                fitterId,
                fitterName:
                    user.name ||
                    user.fullName ||
                    user.employeeName ||
                    'Fitter',
            }
        );
    }

    // --------------------------------------------------
    // Complete fitting with proof image
    // --------------------------------------------------
    async completeFitting(
        ticketId,
        formData
    ) {
        if (!ticketId) {
            throw new Error(
                'Ticket ID is required.'
            );
        }

        if (!formData) {
            throw new Error(
                'Fitting proof data is required.'
            );
        }

        return await api.putFormData(
            `/tickets/${encodeURIComponent(ticketId)}`,
            formData
        );
    }
}

export default new FitterService();