// services/dashboard.service.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "./api";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Turn the raw /ontrack/emp-dashboard response into safe, ready-to-render values
export function normalizeDashboard(raw = {}) {
    const monthlyData = Array.isArray(raw.monthlyData)
        ? raw.monthlyData.map((d) => ({
            date: d.targetDate,
            target: num(d.targetAmount),
            achieved: num(d.achievement),
            isWeekOff: d.isWeekOff === true,
        }))
        : [];

    return {
        employeeId: raw.employeeId ?? null,
        year: raw.year ?? null,
        month: raw.month ?? null,

        monthlyTarget: num(raw.monthlyTarget),
        monthlyAchieved: num(raw.monthlyAchieved),
        // mtdTarget = sum of daily targets up to and including today
        mtdTarget: num(raw.mtdTarget),

        todayDate: raw.todayDate ?? null,
        todayTarget: num(raw.todayTarget),
        todayAchieved: num(raw.todayAchieved),
        todayWeekOff: raw.todayWeekOff === true,

        yesterdayDate: raw.yesterdayDate ?? null,
        yesterdayTarget: num(raw.yesterdayTarget),
        yesterdayAchieved: num(raw.yesterdayAchieved),
        yesterdayWeekOff: raw.yesterdayWeekOff === true,

        monthlyData,
    };
}

// Leaderboard row → only what the app shows (mobile numbers are left out)
function normalizeLeaderRow(r = {}) {
    return {
        employeeId: String(r.employeeId ?? ""),
        name: (r.employeeName || "").replace(/\s+/g, " ").trim() || "—",
        department: r.department || "",
        storeId: r.storeId ?? null,
        storeName: r.storeName || r.location || "",
        target: num(r.target),
        achieved: num(r.achieved),
        achievementPercentage: num(r.achievementPercentage),
        rank: num(r.rank),
    };
}

class DashboardService {
    // Sales leaderboard for the current period (all staff, ranked by achieved)
    async getLeaderboard() {
        const response = await api.get("/ontrack/target/staff/leaderboard");

        if (!response?.success) {
            throw new Error(response?.message || "Failed to load leaderboard");
        }

        const data = response.data || {};
        return {
            startDate: data.startDate ?? null,
            endDate: data.endDate ?? null,
            totalEmployees: num(data.totalEmployees),
            rows: Array.isArray(data.leaderboard)
                ? data.leaderboard.map(normalizeLeaderRow)
                : [],
        };
    }

    async getEmployeeDashboard() {
        const employeeNumber = await AsyncStorage.getItem("employeeNumber");

        if (!employeeNumber) {
            throw new Error("Employee number not found. Please login again.");
        }

        const response = await api.get(
            `/ontrack/emp-dashboard/${encodeURIComponent(employeeNumber)}`
        );

        if (!response?.success) {
            throw new Error(response?.message || "Failed to load dashboard data");
        }

        return normalizeDashboard(response.data);
    }
}

export default new DashboardService();
