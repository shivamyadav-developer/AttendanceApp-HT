// app/(tabs)/LMS.jsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import lmsService from "../../services/lms.service";

// ─── Modal "screens" ───────────────────────────────────────────────
// null        → nothing open
// 'detail'    → course detail view
// 'quiz'      → active quiz
// 'result'    → quiz result
// ───────────────────────────────────────────────────────────────────

// Courses shown at a time in the list
const PAGE_SIZE = 10;

// Course status from the progress API → badge label + colours
const STATUS_META = {
  PASSED: { label: "Passed", color: "#2E7D32", bg: "#E8F5E9", icon: "checkmark-circle" },
  FAILED: { label: "Failed", color: "#C62828", bg: "#FDECEA", icon: "close-circle" },
  IN_PROGRESS: { label: "In Progress", color: "#D96A17", bg: "#FFF4EC", icon: "time" },
  NOT_STARTED: { label: "Not Started", color: "#6B7280", bg: "#F3F4F6", icon: "ellipse-outline" },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.NOT_STARTED;
  return (
    <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
      <Ionicons name={meta.icon} size={12} color={meta.color} />
      <Text style={[styles.statusBadgeText, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

export default function LMS() {
  const insets = useSafeAreaInsets();

  const [user, setUser] = useState(null);
  const [courses, setCourses] = useState([]);
  // From the progress API: overall summary + per-course progress by courseId
  const [progressSummary, setProgressSummary] = useState(null);
  const [courseProgress, setCourseProgress] = useState({});

  // How many courses are shown in the list ("Show More" adds 10 more)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [employeeNumber, setEmployeeNumber] = useState(null);

  // Modal / screen state
  const [modalScreen, setModalScreen] = useState(null); // null | 'detail' | 'quiz' | 'result'
  const [selectedCourse, setSelectedCourse] = useState(null);

  // Quiz state
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [score, setScore] = useState(0);
  const [attemptId, setAttemptId] = useState(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [answeredQuestions, setAnsweredQuestions] = useState({});

  useEffect(() => {
    loadUserAndCourses();
  }, []);

  // ─── Data loading ─────────────────────────────────────────────────

  const loadUserAndCourses = async () => {
    try {
      setLoading(true);
      const userData = await AsyncStorage.getItem("userData");
      let empNo = null;
      if (userData) {
        const parsed = JSON.parse(userData);
        setUser(parsed);
        empNo = parsed.employeeNumber || null;
        setEmployeeNumber(empNo);
      }
      await Promise.all([fetchCourses(), fetchProgress(empNo)]);
    } catch (e) {
      Alert.alert("Error", "Failed to load user data");
    } finally {
      setLoading(false);
    }
  };

  const fetchCourses = async () => {
    try {
      const res = await lmsService.getAllCourses();
      if (res.success && res.data) setCourses(res.data);
    } catch (e) {
      console.error("fetchCourses:", e);
    }
  };

  const fetchProgress = async (empNo = employeeNumber) => {
    if (!empNo) return;
    try {
      const res = await lmsService.getEmployeeProgress(empNo);
      if (!res.success) return;
      setProgressSummary(res.data.summary);
      const byId = {};
      res.data.courses.forEach((c) => {
        byId[c.courseId] = c;
      });
      setCourseProgress(byId);
    } catch (e) {
      console.error("fetchProgress:", e);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchCourses(), fetchProgress()]);
    setRefreshing(false);
  };

  // ─── Course card tap → detail screen ─────────────────────────────

  const openCourseDetail = (course) => {
    setSelectedCourse(course);
    setModalScreen("detail");
  };

  // ─── Start button on detail screen → quiz ─────────────────────────

  const startQuiz = async () => {
    if (!employeeNumber) {
      Alert.alert("Error", "Employee number not found. Please login again.");
      return;
    }
    setQuizLoading(true);
    try {
      let questionsData = selectedCourse.questions || [];

      if (questionsData.length === 0) {
        const questionsRes = await lmsService.getCourseQuestions(selectedCourse._id);
        if (!questionsRes.success || !questionsRes.data?.length) {
          Alert.alert("Info", "No questions available for this course yet.");
          setQuizLoading(false);
          return;
        }
        questionsData = questionsRes.data;
      }

      const attemptRes = await lmsService.startAttempt(selectedCourse._id, employeeNumber);
      if (!attemptRes.success || !attemptRes.data) {
        Alert.alert("Error", "Failed to start attempt. Please try again.");
        setQuizLoading(false);
        return;
      }

      setQuestions(questionsData);
      setAttemptId(attemptRes.data._id);
      setCurrentQuestionIndex(0);
      setSelectedOption(null);
      setScore(0);
      setResult(null);
      setAnsweredQuestions({});
      setModalScreen("quiz");
    } catch (e) {
      Alert.alert("Error", "Failed to load course content.");
    } finally {
      setQuizLoading(false);
    }
  };

  // ─── Quiz interactions ─────────────────────────────────────────────

  const handleOptionSelect = async (idx) => {
    if (selectedOption !== null) return;
    setSelectedOption(idx);
    const q = questions[currentQuestionIndex];
    const isCorrect = idx === q.correctAnswer;
    if (isCorrect) setScore((p) => p + 1);

    // Store answer
    setAnsweredQuestions(prev => ({
      ...prev,
      [currentQuestionIndex]: { selected: idx, correct: isCorrect }
    }));

    if (attemptId) await lmsService.submitAnswer(attemptId, q._id, idx);
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
      // Restore previously selected option for this question
      const prevAnswer = answeredQuestions[currentQuestionIndex - 1];
      setSelectedOption(prevAnswer ? prevAnswer.selected : null);
    }
  };

  const handleNext = async () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      // Restore previously selected option for the next question
      const nextAnswer = answeredQuestions[currentQuestionIndex + 1];
      setSelectedOption(nextAnswer ? nextAnswer.selected : null);
    } else {
      // Submit quiz
      setQuizLoading(true);
      const submitRes = await lmsService.submitAttempt(attemptId);
      if (submitRes.success && submitRes.data) {
        setResult(submitRes.data);
        setModalScreen("result");
        // Update progress card, counts and this course's badge
        fetchProgress();
      } else {
        Alert.alert("Error", "Failed to submit quiz.");
      }
      setQuizLoading(false);
    }
  };

  // ─── Close / reset ─────────────────────────────────────────────────

  const closeModal = () => {
    setModalScreen(null);
    setSelectedCourse(null);
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setSelectedOption(null);
    setScore(0);
    setAttemptId(null);
    setResult(null);
    setAnsweredQuestions({});
  };

  // ─── Helpers ───────────────────────────────────────────────────────

  // Overall progress from the progress API (completed ÷ total courses)
  const getCourseProgress = () => {
    if (progressSummary) return Math.round(progressSummary.overallProgress || 0);
    return 0;
  };

  const parseContentPoints = (contentText) => {
    if (!contentText) return [];

    const lines = contentText.split('\n');
    const points = [];
    let currentSection = '';

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;

      if (trimmedLine.endsWith(':') || trimmedLine === trimmedLine.toUpperCase()) {
        if (trimmedLine.length > 0) {
          currentSection = trimmedLine.replace(':', '').trim();
          points.push({
            type: 'section',
            text: currentSection,
            index: index
          });
        }
      }
      else if (/^\d+\./.test(trimmedLine)) {
        const cleanText = trimmedLine.replace(/^\d+\.\s*/, '');
        points.push({
          type: 'point',
          text: cleanText,
          isNumbered: true,
          index: index
        });
      }
      else if (trimmedLine.startsWith('•') || trimmedLine.startsWith('-')) {
        const cleanText = trimmedLine.replace(/^[•-]\s*/, '');
        points.push({
          type: 'point',
          text: cleanText,
          isBullet: true,
          index: index
        });
      }
      else if (line.startsWith('  ') || line.startsWith('\t')) {
        const cleanText = trimmedLine.replace(/^[•-]\s*/, '');
        points.push({
          type: 'subpoint',
          text: cleanText,
          index: index
        });
      }
      else {
        const lastPoint = points[points.length - 1];
        if (lastPoint && (lastPoint.type === 'point' || lastPoint.type === 'subpoint')) {
          lastPoint.text += ' ' + trimmedLine;
        } else {
          points.push({
            type: 'text',
            text: trimmedLine,
            index: index
          });
        }
      }
    });

    return points;
  };

  // ─── Render ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#D96A17" />
        <Text style={styles.loadingText}>Loading courses...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header stays fixed while the page scrolls */}
      <View style={styles.header}>
        <Text style={styles.smallTitle}>LEARNING HUB</Text>
        <Text style={styles.title}>My Learning</Text>
        <Text style={styles.subtitle}>Complete courses and grow your retail skills.</Text>

      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >

      {/* Progress card */}
      <View style={styles.progressCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.progressLabel}>Overall Progress</Text>
          <Text style={styles.progressValue}>{getCourseProgress()}%</Text>
          {!!progressSummary && (
            <>
              <Text style={styles.progressSub}>
                {progressSummary.completedCourses} of {progressSummary.totalCourses} courses completed
              </Text>
              {progressSummary.completedAttempts > 0 && (
                <Text style={styles.progressSub}>
                  Average score {Math.round(progressSummary.averagePercentage || 0)}%
                </Text>
              )}
            </>
          )}
        </View>
        <View style={styles.circle}>
          <Ionicons name="school" size={34} color="#fff" />
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        {[
          { num: progressSummary?.totalCourses ?? courses.length, label: "Courses" },
          { num: progressSummary?.inProgressCourses ?? 0, label: "In Progress" },
          { num: progressSummary?.passedCourses ?? 0, label: "Passed" },
          { num: progressSummary?.failedCourses ?? 0, label: "Failed" },
        ].map((s) => (
          <View key={s.label} style={styles.statBox}>
            <Text style={styles.statNumber}>{s.num}</Text>
            <Text style={styles.statText}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Course list */}
      <Text style={styles.sectionTitle}>Available Courses</Text>
      {courses.slice(0, visibleCount).map((course, i) => (
        <TouchableOpacity
          key={course._id || i}
          style={styles.courseCard}
          onPress={() => openCourseDetail(course)}
          activeOpacity={0.8}
        >
          <View style={styles.courseIcon}>
            <Ionicons name="book-outline" size={28} color="#ff7b00" />
          </View>
          <View style={styles.courseInfo}>
            <Text style={styles.courseTitle}>{course.title}</Text>
            <Text style={styles.courseSubtitle} numberOfLines={2}>
              {course.description}
            </Text>
            <View style={styles.courseMeta}>
              {course.department && (
                <View style={styles.departmentBadge}>
                  <Text style={styles.departmentText}>{course.department}</Text>
                </View>
              )}
              <Text style={styles.passingInfo}>Pass: {course.passingPercentage}%</Text>
              <Text style={styles.questionCount}>
                {course.questionCount || "Multiple"} Qs
              </Text>
            </View>

            {/* Employee's status + best score for this course */}
            {(() => {
              const p = courseProgress[course._id];
              if (!p) return null;
              return (
                <View style={styles.courseProgressRow}>
                  <StatusBadge status={p.status} />
                  {p.completedAttempts > 0 && (
                    <Text style={styles.bestScoreText}>
                      Best {Math.round(p.bestPercentage)}% · {p.completedAttempts}{" "}
                      {p.completedAttempts === 1 ? "attempt" : "attempts"}
                    </Text>
                  )}
                </View>
              );
            })()}
          </View>
          <View style={styles.playButton}>
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </View>
        </TouchableOpacity>
      ))}

      {/* Show More */}
      {courses.length > visibleCount && (
        <View style={styles.showMoreWrapper}>
          <Text style={styles.showMoreCount}>
            Showing {visibleCount} of {courses.length} courses
          </Text>
          <TouchableOpacity
            style={styles.showMoreButton}
            onPress={() => setVisibleCount((count) => count + PAGE_SIZE)}
          >
            <Text style={styles.showMoreText}>Show More</Text>
            <Ionicons name="chevron-down" size={16} color="#0B2D4A" />
          </TouchableOpacity>
        </View>
      )}

      <View style={{ height: 40 }} />

      {/* ── Single Modal with 3 inner screens ── */}
      <Modal
        animationType="slide"
        transparent={false}
        visible={modalScreen !== null}
        onRequestClose={closeModal}
        statusBarTranslucent
      >
        <View
          style={[
            styles.modalContainer,
            { paddingBottom: Platform.OS === "ios" ? insets.bottom : 0 },
          ]}
        >
          {/* Navy strip behind the status bar (clock, battery) */}
          <View style={{ height: insets.top, backgroundColor: "#0B2D4A" }} />
          {/* ── SCREEN 1: Course Detail ── */}
          {modalScreen === "detail" && selectedCourse && (
            <View style={{ flex: 1 }}>
              {/* Top bar */}
              <View style={styles.detailTopBar}>
                <TouchableOpacity onPress={closeModal} style={styles.backBtn}>
                  <Ionicons name="arrow-back" size={22} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.detailTopTitle} numberOfLines={1}>
                  Course Details
                </Text>
              </View>

              <ScrollView contentContainerStyle={styles.detailScroll}>
                {/* Course Title */}
                <View style={styles.detailHero}>
                  <View style={styles.detailHeroIcon}>
                    <Ionicons name="book-outline" size={24} color="#ff7b00" />
                  </View>
                  <Text style={styles.detailTitle}>{selectedCourse.title}</Text>
                  <Text style={styles.detailSubtitle}>{selectedCourse.description}</Text>
                </View>

                {/* Info Items */}
                <View style={styles.infoContainer}>
                  <View style={styles.infoTile}>
                    <Ionicons name="business-outline" size={18} color="#ff7b00" />
                    <Text style={styles.infoValue} numberOfLines={2}>
                      {selectedCourse.department || "N/A"}
                    </Text>
                    <Text style={styles.infoLabel}>Department</Text>
                  </View>
                  <View style={styles.infoTile}>
                    <Ionicons name="ribbon-outline" size={18} color="#ff7b00" />
                    <Text style={styles.infoValue}>{selectedCourse.passingPercentage}%</Text>
                    <Text style={styles.infoLabel}>To Pass</Text>
                  </View>
                  <View style={styles.infoTile}>
                    <Ionicons name="help-circle-outline" size={18} color="#ff7b00" />
                    <Text style={styles.infoValue}>{selectedCourse.questionCount || "Multiple"}</Text>
                    <Text style={styles.infoLabel}>Questions</Text>
                  </View>
                </View>

                {/* Resources Section */}
                {(selectedCourse.pdfUrl || selectedCourse.videoUrl) && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>Resources</Text>
                    {selectedCourse.pdfUrl && selectedCourse.pdfUrl.trim() !== "" && (
                      <TouchableOpacity
                        style={styles.resourceRow}
                        onPress={() => Linking.openURL(selectedCourse.pdfUrl)}
                      >
                        <View style={[styles.resourceIcon, { backgroundColor: "#FDECEC" }]}>
                          <Ionicons name="document-text-outline" size={18} color="#C62828" />
                        </View>
                        <Text style={styles.resourceText}>Course PDF Guide</Text>
                        <Ionicons name="open-outline" size={16} color="#999" />
                      </TouchableOpacity>
                    )}
                    {selectedCourse.videoUrl && selectedCourse.videoUrl.trim() !== "" && (
                      <TouchableOpacity
                        style={styles.resourceRow}
                        onPress={() => Linking.openURL(selectedCourse.videoUrl)}
                      >
                        <View style={[styles.resourceIcon, { backgroundColor: "#E8F1FB" }]}>
                          <Ionicons name="videocam-outline" size={18} color="#1565C0" />
                        </View>
                        <Text style={styles.resourceText}>Training Video</Text>
                        <Ionicons name="open-outline" size={16} color="#999" />
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* What you'll learn */}
                {selectedCourse.contentText && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>What You'll Learn</Text>
                    <View style={styles.contentPointsContainer}>
                      {parseContentPoints(selectedCourse.contentText).map((item, index) => {
                        if (item.type === 'section') {
                          return (
                            <View key={index} style={styles.sectionHeaderContainer}>
                              <View style={styles.sectionDivider} />
                              <Text style={styles.sectionHeaderText}>{item.text}</Text>
                              <View style={styles.sectionDivider} />
                            </View>
                          );
                        } else if (item.type === 'point') {
                          return (
                            <View key={index} style={styles.contentPointItem}>
                              <View style={styles.contentPointBullet}>
                                <Ionicons
                                  name={item.isNumbered ? "checkmark-circle-outline" : "checkbox-outline"}
                                  size={20}
                                  color="#ff7b00"
                                />
                              </View>
                              <Text style={styles.contentPointText}>{item.text}</Text>
                            </View>
                          );
                        } else if (item.type === 'subpoint') {
                          return (
                            <View key={index} style={[styles.contentPointItem, styles.subPointItem]}>
                              <View style={styles.contentPointBullet}>
                                <Ionicons name="remove-outline" size={16} color="#999" />
                              </View>
                              <Text style={styles.contentSubPointText}>{item.text}</Text>
                            </View>
                          );
                        } else {
                          return (
                            <View key={index} style={styles.contentTextItem}>
                              <Text style={styles.contentPlainText}>{item.text}</Text>
                            </View>
                          );
                        }
                      })}
                    </View>
                  </View>
                )}

                {/* Start button */}
                <TouchableOpacity
                  style={styles.startButton}
                  onPress={startQuiz}
                  disabled={quizLoading}
                >
                  {quizLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="play-circle-outline" size={22} color="#fff" />
                      <Text style={styles.startButtonText}>Start Assessment</Text>
                    </>
                  )}
                </TouchableOpacity>

                <View style={{ height: 30 }} />
              </ScrollView>
            </View>
          )}

          {/* ── SCREEN 2: Active Quiz ── */}
          {modalScreen === "quiz" && questions.length > 0 && (
            <View style={styles.quizContainer}>
              <View style={styles.quizHeader}>
                <TouchableOpacity onPress={closeModal} style={styles.closeButton}>
                  <Ionicons name="close" size={22} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.quizTitle} numberOfLines={1}>
                  {selectedCourse?.title}
                </Text>
                <View style={styles.progressIndicator}>
                  <Text style={styles.progressText}>
                    {currentQuestionIndex + 1}/{questions.length}
                  </Text>
                </View>
              </View>

              <ScrollView style={styles.quizContent}>
                <View style={styles.questionCard}>
                  <Text style={styles.questionNumber}>
                    Question {currentQuestionIndex + 1}
                  </Text>
                  <Text style={styles.questionText}>
                    {questions[currentQuestionIndex]?.question}
                  </Text>
                </View>

                <View style={styles.optionsGrid}>
                  {questions[currentQuestionIndex]?.options.map((option, idx) => {
                    let cardStyle = styles.optionCard;
                    let textStyle = styles.optionCardText;
                    if (selectedOption !== null) {
                      const correct = questions[currentQuestionIndex].correctAnswer;
                      if (idx === correct) {
                        cardStyle = [styles.optionCard, styles.correctOptionCard];
                        textStyle = [styles.optionCardText, styles.correctOptionCardText];
                      } else if (idx === selectedOption) {
                        cardStyle = [styles.optionCard, styles.wrongOptionCard];
                        textStyle = [styles.optionCardText, styles.wrongOptionCardText];
                      }
                    }
                    return (
                      <TouchableOpacity
                        key={idx}
                        style={cardStyle}
                        onPress={() => handleOptionSelect(idx)}
                        disabled={selectedOption !== null}
                      >
                        <View style={styles.optionLetter}>
                          <Text style={styles.optionLetterText}>
                            {String.fromCharCode(65 + idx)}
                          </Text>
                        </View>
                        <Text style={textStyle}>{option}</Text>
                        {selectedOption !== null &&
                          idx === questions[currentQuestionIndex].correctAnswer && (
                            <Ionicons name="checkmark-circle" size={24} color="#2E7D32" />
                          )}
                        {selectedOption !== null &&
                          idx === selectedOption &&
                          idx !== questions[currentQuestionIndex].correctAnswer && (
                            <Ionicons name="close-circle" size={24} color="#C62828" />
                          )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Navigation Buttons - Previous & Next */}
                <View style={styles.navigationContainer}>
                  <TouchableOpacity
                    style={[
                      styles.navButton,
                      styles.prevButton,
                      currentQuestionIndex === 0 && styles.navButtonDisabled
                    ]}
                    onPress={handlePrevious}
                    disabled={currentQuestionIndex === 0}
                  >
                    <Ionicons name="arrow-back" size={18} color={currentQuestionIndex === 0 ? "#ccc" : "#fff"} />
                    <Text style={[
                      styles.navButtonText,
                      currentQuestionIndex === 0 && styles.navButtonTextDisabled
                    ]}>
                      Previous
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.navButton,
                      styles.nextNavButton,
                      selectedOption === null && styles.navButtonDisabled
                    ]}
                    onPress={handleNext}
                    disabled={selectedOption === null}
                  >
                    <Text style={[
                      styles.navButtonText,
                      selectedOption === null && styles.navButtonTextDisabled
                    ]}>
                      {currentQuestionIndex === questions.length - 1 ? "Submit" : "Next"}
                    </Text>
                    <Ionicons
                      name={currentQuestionIndex === questions.length - 1 ? "checkmark" : "arrow-forward"}
                      size={18}
                      color={selectedOption === null ? "#ccc" : "#fff"}
                    />
                  </TouchableOpacity>
                </View>

                <View style={{ height: 40 }} />
              </ScrollView>
            </View>
          )}

          {/* ── SCREEN 3: Result ── */}
          {modalScreen === "result" && (
            <View style={{ flex: 1 }}>
              <View style={styles.quizHeader}>
                <TouchableOpacity onPress={closeModal} style={styles.closeButton}>
                  <Ionicons name="close" size={22} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.resultHeaderTitle} numberOfLines={1}>
                  Quiz Result
                </Text>
              </View>

              <View style={styles.resultContainer}>
              <View style={styles.resultCard}>
                <View style={styles.resultIcon}>
                  <Ionicons
                    name={result?.passed ? "trophy" : "school"}
                    size={48}
                    color={result?.passed ? "#FFD700" : "#ff7b00"}
                  />
                </View>
                <Text style={styles.resultTitle}>
                  {result?.passed ? "Congratulations!" : "Quiz Completed"}
                </Text>

                <View style={styles.scoreCard}>
                  <Text style={styles.scoreLabel}>Your Score</Text>
                  <Text style={styles.scoreValue}>
                    {score} / {questions.length}
                  </Text>
                  <View style={styles.scoreProgress}>
                    <View
                      style={[
                        styles.scoreProgressFill,
                        { width: `${(score / questions.length) * 100}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.scorePercentage}>
                    {Math.round((score / questions.length) * 100)}%
                  </Text>
                </View>

                <View style={styles.resultDetails}>
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>Status:</Text>
                    <Text
                      style={[
                        styles.resultValue,
                        { color: result?.passed ? "#2E7D32" : "#C62828" },
                      ]}
                    >
                      {result?.passed ? "PASSED" : "NOT PASSED"}
                    </Text>
                  </View>
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>Passing Score:</Text>
                    <Text style={styles.resultValue}>
                      {selectedCourse?.passingPercentage}%
                    </Text>
                  </View>
                </View>

                <Text style={styles.resultMessage}>
                  {result?.passed
                    ? "🎉 Great job! You've successfully completed this course."
                    : "📚 Keep learning! Review the material and try again."}
                </Text>

                <TouchableOpacity style={styles.closeQuizButton} onPress={closeModal}>
                  <Text style={styles.closeQuizButtonText}>Back to Courses</Text>
                </TouchableOpacity>
              </View>
              </View>
            </View>
          )}
        </View>
      </Modal>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F8FA" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F7F8FA" },
  loadingText: { marginTop: 10, color: "#666", fontSize: 14 },

  // Header
  header: { backgroundColor: "#0F2D52", height: 160, paddingTop: 50, paddingHorizontal: 18, justifyContent: "center", borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  smallTitle: { color: "#F5A623", fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: "#fff", fontSize: 22, fontWeight: "bold", marginTop: 3 },
  subtitle: { color: "#D5DCE5", fontSize: 12, marginTop: 3 },
  userName: { color: "#D96A17", fontSize: 12, marginTop: 8, fontWeight: "500" },

  // Progress card
  progressCard: {
    backgroundColor: "#fff",
    marginHorizontal: 20,
    marginTop: 14,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,   // Reduced from 18
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    elevation: 4,
  }, progressLabel: { color: "#777" },
  progressValue: { fontSize: 34, fontWeight: "bold", color: "#0B2D4A" },
  progressSub: { marginTop: 2, fontSize: 12, color: "#666", fontWeight: "600" },

  // Per-course status from the progress API
  courseProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusBadgeText: { fontSize: 11, fontWeight: "700" },
  bestScoreText: { fontSize: 11, color: "#555", fontWeight: "600" },
  circle: { width: 60, height: 60, borderRadius: 35, backgroundColor: "#ff7b00", justifyContent: "center", alignItems: "center" },

  // Stats
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginHorizontal: 20,
    marginTop: 16, // was 20
  },

  statBox: {
    flex: 1,
    backgroundColor: "#fff",
    paddingVertical: 14,   // was 18
    paddingHorizontal: 4,  // 4 boxes now (was 14)
    marginHorizontal: 4,
    borderRadius: 14,      // was 16
    alignItems: "center",
  },

  statNumber: {
    fontSize: 22,          // was 24
    fontWeight: "bold",
    color: "#ff7b00",
  },

  statText: {
    marginTop: 4,          // was 5
    fontSize: 12,          // 4 boxes now (was 13)
    color: "#666",
  },

  // Course list
  sectionTitle: { marginTop: 20, marginHorizontal: 20, marginBottom: 12, fontSize: 18, fontWeight: "bold", color: "#222" },
courseCard: {
  backgroundColor: "#fff",
  marginHorizontal: 20,
  marginBottom: 12,      // was 14
  borderRadius: 16,      // was 18
  paddingVertical: 10,   // was 15
  paddingHorizontal: 14,
  flexDirection: "row",
  alignItems: "center",
},

courseIcon: {
  marginRight: 12,       // was 15
},

courseInfo: {
  flex: 1,
},

courseTitle: {
  fontWeight: "bold",
  fontSize: 15,          // was 16
},

courseSubtitle: {
  color: "#777",
  marginTop: 2,          // was 4
  fontSize: 11,          // was 12
},

courseMeta: {
  flexDirection: "row",
  marginTop: 4,          // was 6
  gap: 6,                // was 8
  flexWrap: "wrap",
  alignItems: "center",
},

departmentBadge: {
  backgroundColor: "#FFF4EC",
  paddingHorizontal: 8,
  paddingVertical: 1,    // was 2
  borderRadius: 10,
},

departmentText: {
  color: "#ff7b00",
  fontSize: 9,           // was 10
  fontWeight: "600",
},

passingInfo: {
  color: "#ff7b00",
  fontSize: 10,          // was 11
  fontWeight: "500",
},

questionCount: {
  color: "#666",
  fontSize: 10,          // was 11
},

playButton: {
  backgroundColor: "#ff7b00",
  width: 40,             // was 45
  height: 40,            // was 45
  borderRadius: 20,      // was 22
  justifyContent: "center",
  alignItems: "center",
},

  // Show more
  showMoreWrapper: { alignItems: "center", marginTop: 4 },
  showMoreCount: { fontSize: 12, color: "#777", marginBottom: 8 },
  showMoreButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 20, paddingRight: 16, paddingVertical: 9, backgroundColor: "#E1E7F0", borderRadius: 20 },
  showMoreText: { color: "#0B2D4A", fontSize: 14, fontWeight: "700" },

  // Modal shared
  modalContainer: { flex: 1, backgroundColor: "#F7F8FA" },

  // Detail screen
  detailTopBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18, backgroundColor: "#0B2D4A", borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  backBtn: { width: 42, height: 42, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center", marginRight: 12 },
  detailTopTitle: { fontSize: 20, fontWeight: "bold", color: "#fff", flex: 1 },
  detailScroll: { padding: 16 },

  detailHero: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 12, elevation: 1 },
  detailHeroIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: "#FFF4EC", justifyContent: "center", alignItems: "center", marginBottom: 10 },
  detailTitle: { fontSize: 18, fontWeight: "bold", color: "#0B2D4A" },
  detailSubtitle: { fontSize: 13, color: "#777", lineHeight: 19, marginTop: 4 },

  // Info tiles
  infoContainer: { flexDirection: "row", gap: 10, marginBottom: 12 },
  infoTile: { flex: 1, backgroundColor: "#fff", borderRadius: 14, paddingVertical: 12, paddingHorizontal: 8, alignItems: "center", elevation: 1 },
  infoValue: { fontSize: 14, color: "#0B2D4A", fontWeight: "700", textAlign: "center", marginTop: 6 },
  infoLabel: { fontSize: 11, color: "#777", marginTop: 2 },

  detailSection: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 12, elevation: 1 },
  detailSectionTitle: { fontSize: 15, fontWeight: "700", color: "#0B2D4A", marginBottom: 10 },

  // Content points styles
  contentPointsContainer: { marginTop: 4 },
  sectionHeaderContainer: { flexDirection: "row", alignItems: "center", marginVertical: 12, gap: 10 },
  sectionDivider: { flex: 1, height: 1, backgroundColor: "#E5E5E5" },
  sectionHeaderText: { fontSize: 15, fontWeight: "700", color: "#0B2D4A" },
  contentPointItem: { flexDirection: "row", alignItems: "flex-start", marginBottom: 8 },
  subPointItem: { marginLeft: 20, marginBottom: 4 },
  contentPointBullet: { marginRight: 10, marginTop: 2 },
  contentPointText: { flex: 1, fontSize: 14, color: "#444", lineHeight: 20 },
  contentSubPointText: { flex: 1, fontSize: 13, color: "#666", lineHeight: 19 },
  contentTextItem: { marginBottom: 8 },
  contentPlainText: { fontSize: 14, color: "#444", lineHeight: 20 },

  resourceRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#F0F0F0" },
  resourceIcon: { width: 34, height: 34, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  resourceText: { flex: 1, fontSize: 14, color: "#333", fontWeight: "500" },
  startButton: { backgroundColor: "#ff7b00", flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, paddingVertical: 14, borderRadius: 14, marginTop: 4 },
  startButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },

  // Quiz screen
  quizContainer: { flex: 1 },
  quizHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18, backgroundColor: "#0B2D4A", borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  closeButton: { width: 42, height: 42, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center", marginRight: 12 },
  quizTitle: { fontSize: 16, fontWeight: "bold", color: "#fff", flex: 1 },
  progressIndicator: { backgroundColor: "#ff7b00", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginLeft: 10 },
  progressText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  quizContent: { flex: 1, padding: 10 },
  questionCard: { backgroundColor: "#fff", borderRadius: 16, padding: 10, marginBottom: 10, elevation: 2 },
  questionNumber: { fontSize: 12, color: "#ff7b00", fontWeight: "600", marginBottom: 10 },
  questionText: { fontSize: 18, fontWeight: "bold", color: "#0B2D4A", lineHeight: 26 },
  optionsGrid: { gap: 12 },
  optionCard: { backgroundColor: "#fff", borderRadius: 12, padding: 16, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#E5E5E5" },
  optionLetter: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#F0F0F0", justifyContent: "center", alignItems: "center", marginRight: 12 },
  optionLetterText: { fontSize: 14, fontWeight: "bold", color: "#666" },
  optionCardText: { flex: 1, fontSize: 15, color: "#333" },
  correctOptionCard: { backgroundColor: "#E8F5E9", borderColor: "#2E7D32" },
  correctOptionCardText: { color: "#2E7D32", fontWeight: "500" },
  wrongOptionCard: { backgroundColor: "#FFEBEE", borderColor: "#C62828" },
  wrongOptionCardText: { color: "#C62828", fontWeight: "500" },

  // Navigation buttons
  navigationContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
    gap: 12,
  },
  navButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  prevButton: {
    backgroundColor: "#0B2D4A",
  },
  nextNavButton: {
    backgroundColor: "#ff7b00",
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  navButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  navButtonTextDisabled: {
    color: "#ccc",
  },

  // Result screen
  resultHeaderTitle: { fontSize: 20, fontWeight: "bold", color: "#fff", flex: 1 },
  resultContainer: { flex: 1, alignItems: "center", padding: 16 },
  resultCard: { backgroundColor: "#fff", borderRadius: 18, padding: 18, width: "100%", alignItems: "center", elevation: 2 },
  resultIcon: { width: 84, height: 84, borderRadius: 42, backgroundColor: "#FFF4EC", justifyContent: "center", alignItems: "center", marginBottom: 14 },
  resultTitle: { fontSize: 22, fontWeight: "bold", color: "#0B2D4A", marginBottom: 12 },
  scoreCard: { backgroundColor: "#F7F8FA", borderRadius: 16, padding: 20, width: "100%", alignItems: "center", marginBottom: 10 },
  scoreLabel: { fontSize: 14, color: "#666", marginBottom: 8 },
  scoreValue: { fontSize: 32, fontWeight: "bold", color: "#ff7b00", marginBottom: 12 },
  scoreProgress: { width: "100%", height: 8, backgroundColor: "#E5E5E5", borderRadius: 4, overflow: "hidden", marginBottom: 8 },
  scoreProgressFill: { height: "100%", backgroundColor: "#ff7b00", borderRadius: 4 },
  scorePercentage: { fontSize: 14, fontWeight: "600", color: "#ff7b00" },
  resultDetails: { width: "100%", marginBottom: 20 },
  resultRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  resultLabel: { fontSize: 14, color: "#666" },
  resultValue: { fontSize: 14, fontWeight: "600" },
  resultMessage: { fontSize: 14, color: "#666", textAlign: "center", lineHeight: 20, marginBottom: 24 },
  closeQuizButton: { backgroundColor: "#ff7b00", paddingHorizontal: 30, paddingVertical: 14, borderRadius: 14, width: "100%", alignItems: "center" },
  closeQuizButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
});