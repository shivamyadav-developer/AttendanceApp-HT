// One checklist (Staff / VM / Daily Store Operation), driven by its definition
// in utils/checklists. UI only for now — no API. Answers are kept as a draft
// on the phone (one per employee per checklist per day).
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  allItems,
  checklistProgress,
  draftKey,
  expectedAnswer,
  itemPoints,
  itemProblem,
  remarkRequired,
  scoreOptions,
  sectionScore,
} from "../../utils/checklists";
import { buildSubmission } from "../../utils/checklists/fromTemplate";
import checklistService from "../../services/checklist.service";
import SignaturePad from "./SignaturePad";

const NAVY = "#0F2D52";
const ORANGE = "#D96A17";
const GREEN = "#10B981";
const RED = "#EF4444";
const GREY = "#9CA3AF";

export const localDateKey = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD

const todayLabel = () =>
  new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

// Same store fields the Profile screen shows (STORE / STORE CODE)
const profileStoreName = (u) => u?.location || u?.employeeLocationSAP || "";
const profileStoreCode = (u) => u?.siteCode || (u?.siteId != null ? String(u.siteId) : "");

// Empty answers, with e.g. "Full Name" prefilled from the logged-in user
const blankAnswers = (checklist, u) => {
  const prefill = {};
  for (const item of allItems(checklist)) {
    if (item.prefillUserName && u?.name) prefill[item.id] = { text: u.name };
  }
  return prefill;
};

const pctColor = (pct) => (pct >= 90 ? GREEN : pct >= 70 ? ORANGE : RED);

const ANSWER_OPTIONS = [
  { key: "yes", label: "Yes", icon: "checkmark-circle", color: GREEN, bg: "#D1FAE5" },
  { key: "no", label: "No", icon: "close-circle", color: RED, bg: "#FEE2E2" },
  { key: "na", label: "N/A", icon: "remove-circle", color: "#6B7280", bg: "#F3F4F6" },
];

// ─── Photos (thumbnails + add) ───────────────────────────────────────────────

const PhotoList = memo(function PhotoList({ photos = [], max, error, onAdd, onRemove }) {
  return (
    <View style={styles.photoRow}>
      {photos.map((p, i) => (
        <View key={p.uri} style={styles.thumbWrap}>
          <Image source={{ uri: p.uri }} style={styles.thumb} />
          <Pressable style={styles.thumbRemove} onPress={() => onRemove(i)} hitSlop={8}>
            <Ionicons name="close" size={14} color="#fff" />
          </Pressable>
        </View>
      ))}
      {photos.length < max && (
        <Pressable style={[styles.addPhoto, error && styles.inputError]} onPress={onAdd}>
          <Ionicons name="camera-outline" size={22} color={ORANGE} />
          <Text style={styles.addPhotoText}>
            {photos.length ? "Add more" : "Add photo"}
          </Text>
        </Pressable>
      )}
    </View>
  );
});

// ─── One item ────────────────────────────────────────────────────────────────

const ChecklistItem = memo(function ChecklistItem({
  checklist,
  item,
  number,
  answer,
  showError,
  onChange,
  onPickPhoto,
  onDrawingChange,
}) {
  const problem = showError ? itemProblem(checklist, item, answer) : null;
  const value = answer?.value;
  const isQuestion = item.type === "yesno" || item.type === "score";
  const photos = answer?.photos || [];
  const maxPhotos = item.max ?? (item.type === "photo" ? 5 : 3);
  const points = checklist.scored ? itemPoints(item, answer) : null;
  const expectsNo = item.type === "yesno" && expectedAnswer(item) === "no";

  const removePhoto = (index) =>
    onChange(item.id, { photos: photos.filter((_, i) => i !== index) });

  return (
    <View style={[styles.itemCard, problem && styles.itemCardError]}>
      <View style={styles.itemTop}>
        <Text style={styles.itemNumber}>{number}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.itemText}>{item.text}</Text>
          {!!item.hint && <Text style={styles.itemHint}>{item.hint}</Text>}
        </View>
        {checklist.scored && (item.type === "yesno" || item.type === "score") && (
          <Text
            style={[
              styles.pointsBadge,
              value != null && points?.achieved === points?.max && { color: GREEN, backgroundColor: "#D1FAE5" },
              value != null && points?.achieved === 0 && { color: RED, backgroundColor: "#FEE2E2" },
            ]}
          >
            {points ? `${value == null ? "–" : points.achieved}/${points.max}` : "N/A"}
          </Text>
        )}
      </View>

      {expectsNo && (
        <Text style={styles.expectedTag}>Correct answer: No</Text>
      )}

      {(item.imageReq || item.type === "photo") && (
        <View style={styles.photoTag}>
          <Ionicons name="camera-outline" size={12} color={ORANGE} />
          <Text style={styles.photoTagText}>
            {item.type === "photo" && maxPhotos > 1
              ? `Photo required · up to ${maxPhotos}`
              : "Photo required"}
          </Text>
        </View>
      )}

      {/* Yes / No (/ N/A) */}
      {item.type === "yesno" && (
        <View style={styles.answerRow}>
          {ANSWER_OPTIONS.filter((o) => o.key !== "na" || item.na).map((opt) => {
            const selected = value === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => onChange(item.id, { value: opt.key })}
                style={[
                  styles.answerBtn,
                  selected && { backgroundColor: opt.bg, borderColor: opt.color },
                ]}
              >
                <Ionicons
                  name={selected ? opt.icon : `${opt.icon}-outline`}
                  size={18}
                  color={selected ? opt.color : GREY}
                />
                <Text
                  style={[styles.answerText, selected && { color: opt.color, fontWeight: "700" }]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* 1–5 */}
      {item.type === "score" && (
        <View style={styles.scoreRow}>
          {scoreOptions(item).map((n) => {
            const selected = value === n;
            return (
              <Pressable
                key={n}
                onPress={() => onChange(item.id, { value: n })}
                style={[styles.scoreBtn, selected && styles.scoreBtnActive]}
              >
                <Text style={[styles.scoreText, selected && styles.scoreTextActive]}>{n}</Text>
              </Pressable>
            );
          })}
          <Text style={styles.scoreOutOf}>/ {scoreOptions(item).length}</Text>
        </View>
      )}

      {/* Remark — shown in red right away when this answer needs one */}
      {isQuestion && value != null && value !== "na" && (() => {
        const required = remarkRequired(checklist, item, value);
        const missing = required && !answer?.remark?.trim();
        return (
          <TextInput
            style={[styles.remarkInput, missing && styles.remarkInputMissing]}
            placeholder={required ? "Remark (required)" : "Remark (optional)"}
            placeholderTextColor={missing ? "#F87171" : GREY}
            value={answer?.remark || ""}
            onChangeText={(remark) => onChange(item.id, { remark })}
            multiline
          />
        );
      })()}

      {/* Photos */}
      {(item.imageReq || item.type === "photo") && (
        <PhotoList
          photos={photos}
          max={maxPhotos}
          error={problem === "Photo required"}
          onAdd={() => onPickPhoto(item.id, photos)}
          onRemove={removePhoto}
        />
      )}

      {/* Text (e.g. Full Name) */}
      {item.type === "text" && (
        <TextInput
          style={[styles.textInput, problem && styles.inputError]}
          placeholder={item.text}
          placeholderTextColor={GREY}
          value={answer?.text || ""}
          onChangeText={(t) => onChange(item.id, { text: t })}
        />
      )}

      {/* Signature — draw it, or upload a photo of it (one replaces the other) */}
      {item.type === "signature" && (
        <>
          <View style={styles.sigTabs}>
            {[
              { key: "draw", label: "Draw", icon: "create-outline" },
              { key: "upload", label: "Upload", icon: "image-outline" },
            ].map((tab) => {
              const active = (answer?.sigMode || "draw") === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => onChange(item.id, { sigMode: tab.key })}
                  style={[styles.sigTab, active && styles.sigTabActive]}
                >
                  <Ionicons name={tab.icon} size={16} color={active ? "#fff" : "#6B7280"} />
                  <Text style={[styles.sigTabText, active && { color: "#fff" }]}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {(answer?.sigMode || "draw") === "draw" ? (
            <SignaturePad
              value={answer?.signature}
              onChange={(strokes) => onChange(item.id, { signature: strokes, photos: [] })}
              onDrawingChange={onDrawingChange}
              hasError={!!problem}
            />
          ) : photos[0] ? (
            <View style={styles.sigImageWrap}>
              <Image source={{ uri: photos[0].uri }} style={styles.sigImage} resizeMode="contain" />
              <Pressable style={styles.thumbRemove} onPress={() => removePhoto(0)} hitSlop={8}>
                <Ionicons name="close" size={14} color="#fff" />
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={[styles.sigUpload, problem && styles.inputError]}
              onPress={() => onPickPhoto(item.id, [], { signature: null })}
            >
              <Ionicons name="cloud-upload-outline" size={26} color={ORANGE} />
              <Text style={styles.addPhotoText}>Upload signature image</Text>
              <Text style={styles.sigUploadHint}>Take a photo or choose from gallery</Text>
            </Pressable>
          )}
        </>
      )}

      {problem && (
        <View style={styles.errorRow}>
          <MaterialIcons name="error-outline" size={14} color={RED} />
          <Text style={styles.errorText}>{problem}</Text>
        </View>
      )}
    </View>
  );
});

// ─── Form ────────────────────────────────────────────────────────────────────

export default function ChecklistForm({ checklist, onBack }) {
  const [user, setUser] = useState(null);
  const [storeName, setStoreName] = useState("");
  const [answers, setAnswers] = useState({}); // { [itemId]: answer }
  const [expanded, setExpanded] = useState({ [checklist.sections[0].id]: true });
  const [showErrors, setShowErrors] = useState(false);
  const [submittedAt, setSubmittedAt] = useState(null);
  const [result, setResult] = useState(null); // server stats of today's submission
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState(""); // e.g. "Uploading photos 3/15…"
  // API checklists (from a template) are sent to the server; local ones are not
  const isApiChecklist = !!checklist.templateId;
  const alreadySent = isApiChecklist && !!submittedAt;
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const loadedRef = useRef(false);
  const key = draftKey(checklist.id);

  // ── Load user + today's draft ────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem("userData");
        const u = raw ? JSON.parse(raw) : null;
        setUser(u);

        const draftRaw = await AsyncStorage.getItem(key);
        const draft = draftRaw ? JSON.parse(draftRaw) : null;
        if (draft?.date === localDateKey() && draft?.employeeNumber === u?.employeeNumber) {
          setAnswers(draft.answers || {});
          setStoreName(profileStoreName(u) || draft.storeName || "");
          setSubmittedAt(draft.submittedAt || null);
          setResult(draft.result || null);
        } else {
          setStoreName(profileStoreName(u));
          setAnswers(blankAnswers(checklist, u));
        }
      } catch (e) {
        console.log("[Checklist] Load error:", e);
      } finally {
        loadedRef.current = true;
      }
    })();
  }, [checklist, key]);

  // ── Save draft (debounced) ───────────────────────────────────────────────
  useEffect(() => {
    if (!loadedRef.current) return undefined;
    const t = setTimeout(() => {
      AsyncStorage.setItem(
        key,
        JSON.stringify({
          date: localDateKey(),
          employeeNumber: user?.employeeNumber || null,
          storeName,
          answers,
          submittedAt,
          result,
        })
      ).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [answers, storeName, submittedAt, result, user, key]);

  const onChange = useCallback((id, patch) => {
    setAnswers((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const onPickPhoto = useCallback(
    // extraPatch: applied together with the new photo (e.g. clear a drawn signature)
    (id, currentPhotos, extraPatch = {}) => {
      const add = (result) => {
        if (result.canceled) return;
        const asset = result.assets?.[0];
        if (!asset?.uri) return;
        onChange(id, {
          ...extraPatch,
          photos: [
            ...currentPhotos,
            {
              uri: asset.uri,
              fileName: asset.fileName || `${checklist.id}-${id}-${Date.now()}.jpg`,
              mimeType: asset.mimeType || "image/jpeg",
            },
          ],
        });
      };
      const takePhoto = async () => {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert("Camera Permission", "Camera permission is required to take a photo.");
          return;
        }
        add(await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 }));
      };
      const choosePhoto = async () => {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert("Gallery Permission", "Gallery permission is required to choose a photo.");
          return;
        }
        add(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 }));
      };

      Alert.alert("Add photo", "", [
        { text: "Take Photo", onPress: () => takePhoto().catch(() => Alert.alert("Camera Error", "Unable to take photo.")) },
        { text: "Choose from Gallery", onPress: () => choosePhoto().catch(() => Alert.alert("Gallery Error", "Unable to choose photo.")) },
        { text: "Cancel", style: "cancel" },
      ]);
    },
    [onChange, checklist.id]
  );

  const onDrawingChange = useCallback((drawing) => setScrollEnabled(!drawing), []);

  // ── Progress ─────────────────────────────────────────────────────────────
  const progress = useMemo(() => checklistProgress(checklist, answers), [checklist, answers]);
  const completePct = Math.round((progress.complete / progress.total) * 100);
  const scorePct = progress.max ? Math.round((progress.achieved / progress.max) * 100) : 0;

  const sectionInfo = useMemo(
    () =>
      Object.fromEntries(
        checklist.sections.map((s) => [
          s.id,
          {
            done: s.items.filter((i) => !itemProblem(checklist, i, answers[i.id])).length,
            total: s.items.length,
            ...(checklist.scored ? sectionScore(s, answers) : {}),
          },
        ])
      ),
    [checklist, answers]
  );

  const toggleSection = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  // ── Submit (UI only) ─────────────────────────────────────────────────────
  const onSubmit = async () => {
    if (sending || alreadySent) return;
    const missing = allItems(checklist).filter((i) => itemProblem(checklist, i, answers[i.id]));
    if (!storeName.trim() || missing.length) {
      setShowErrors(true);
      setExpanded((prev) => {
        const next = { ...prev };
        for (const s of checklist.sections) {
          if (s.items.some((i) => itemProblem(checklist, i, answers[i.id]))) next[s.id] = true;
        }
        return next;
      });
      Alert.alert(
        "Checklist incomplete",
        [
          !storeName.trim() && "• Enter the store name",
          missing.length && `• ${missing.length} item(s) need attention (marked in red)`,
        ]
          .filter(Boolean)
          .join("\n")
      );
      return;
    }

    setShowErrors(false);

    if (isApiChecklist) {
      setSending(true);
      try {
        if (buildSubmission({ checklist, answers: {}, storeName, date: "", user }).storeId == null) {
          Alert.alert(
            "Store not found",
            "Your profile has no store (siteId). Please log out and log in again, or contact admin."
          );
          return;
        }

        // 1) Upload photos that don't have a server link yet. Only the first
        //    photo of an item is sent (the API takes one imageUrl per item).
        //    Links are saved in the draft, so a retry never uploads twice.
        let finalAnswers = answers;
        const toUpload = allItems(checklist).filter((i) => {
          const photo = answers[i.id]?.photos?.[0];
          return photo?.uri && !photo.url;
        });
        for (let n = 0; n < toUpload.length; n++) {
          const item = toUpload[n];
          setSendStatus(`Uploading photos ${n + 1}/${toUpload.length}…`);
          const [photo, ...rest] = finalAnswers[item.id].photos;
          const up = await checklistService.uploadImage(photo);
          if (!up.success) {
            Alert.alert(
              "Photo upload failed",
              `${up.message}

“${item.text}”

Check your internet and tap Submit again — photos already uploaded will not be sent again.`
            );
            return;
          }
          const photos = [{ ...photo, url: up.url }, ...rest];
          finalAnswers = { ...finalAnswers, [item.id]: { ...finalAnswers[item.id], photos } };
          setAnswers((prev) => ({ ...prev, [item.id]: { ...prev[item.id], photos } }));
        }

        // 2) Submit
        setSendStatus("Submitting…");
        const payload = buildSubmission({
          checklist,
          answers: finalAnswers,
          storeName,
          date: localDateKey(),
          user,
        });
        console.log(
          `[Checklist] Submitting template ${payload.templateId} for store ${payload.storeId} — ${payload.answers.length} answers, ${payload.answers.filter((a) => a.imageUrl).length} images`
        );
        const res = await checklistService.submit(payload);
        if (!res.success) {
          Alert.alert("Could not submit", `${res.message || "Please try again."}

Your answers are still saved on this phone.`);
          return;
        }
        setSubmittedAt(res.data?.submittedAt || new Date().toISOString());
        // Prefer the server's own numbers when it returns them
        const stats = res.data?.stats;
        // Sent — clear the answers, remarks and photos from the form and the draft
        setResult(stats || { achieved: progress.achieved, max: progress.max, scorePct });
        setAnswers(blankAnswers(checklist, user));
        setShowErrors(false);
        setExpanded({ [checklist.sections[0].id]: true });
        Alert.alert(
          "Checklist submitted ✓",
          stats
            ? `Compliance: ${stats.compliancePercentage}%\nCompliant: ${stats.compliant}  ·  Not compliant: ${stats.nonCompliant}\nPhotos: ${stats.imagesAttached}`
            : `Score: ${progress.achieved}/${progress.max} (${scorePct}%)`
        );
      } finally {
        setSending(false);
        setSendStatus("");
      }
      return;
    }

    setSubmittedAt(new Date().toISOString());
    const summary = checklist.scored
      ? `Score: ${progress.achieved}/${progress.max} (${scorePct}%)`
      : `Yes: ${Object.values(answers).filter((a) => a?.value === "yes").length}  ·  No: ${
          Object.values(answers).filter((a) => a?.value === "no").length
        }`;
    Alert.alert(
      "Checklist complete ✓",
      `${summary}\n\nSending to the server is not connected yet — your answers are saved on this phone.`
    );
  };

  const onReset = () => {
    Alert.alert("Clear checklist?", "All answers, photos and the signature for today will be removed.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: () => {
          setAnswers(blankAnswers(checklist, user));
          setSubmittedAt(null);
          setResult(null);
          setShowErrors(false);
        },
      },
    ]);
  };

  let runningNumber = 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable onPress={onBack} hitSlop={10} style={styles.headerBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTag}>{checklist.subtitle.toUpperCase()}</Text>
            <Text style={styles.headerTitle}>{checklist.title}</Text>
          </View>
          {/* Nothing to clear once today's checklist has been sent */}
          {alreadySent ? (
            <View style={styles.headerBtnSpacer} />
          ) : (
            <Pressable onPress={onReset} hitSlop={10} style={styles.headerBtn}>
              <Ionicons name="refresh" size={20} color="#fff" />
            </Pressable>
          )}
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 30 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          scrollEnabled={scrollEnabled}
        >
          {/* Person / store / date */}
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Ionicons name="person-outline" size={16} color="#6B7280" />
              <Text style={styles.infoLabel}>Name</Text>
              <Text style={styles.infoValue} numberOfLines={1}>
                {user?.name || "—"}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="storefront-outline" size={16} color="#6B7280" />
              <Text style={styles.infoLabel}>Store</Text>
              {profileStoreName(user) ? (
                // From the profile — not editable
                <Text style={styles.infoValue} numberOfLines={2}>
                  {profileStoreName(user)}
                </Text>
              ) : (
                <TextInput
                  style={[styles.storeInput, showErrors && !storeName.trim() && styles.inputError]}
                  placeholder="Enter store name"
                  placeholderTextColor={GREY}
                  value={storeName}
                  onChangeText={setStoreName}
                />
              )}
            </View>
            {!!profileStoreCode(user) && (
              <View style={styles.infoRow}>
                <Ionicons name="location-outline" size={16} color="#6B7280" />
                <Text style={styles.infoLabel}>Code</Text>
                <Text style={styles.infoValue}>
                  {profileStoreCode(user)}
                  {user?.city ? ` · ${user.city}` : ""}
                </Text>
              </View>
            )}
            <View style={[styles.infoRow, { marginBottom: 0 }]}>
              <Ionicons name="calendar-outline" size={16} color="#6B7280" />
              <Text style={styles.infoLabel}>Date</Text>
              <Text style={styles.infoValue}>{todayLabel()}</Text>
            </View>
          </View>

          {alreadySent ? (
            // Sent to the server — the form is cleared; show today's result
            <View style={[styles.card, styles.doneCard]}>
              <View style={styles.doneIcon}>
                <Ionicons name="checkmark-done" size={34} color={GREEN} />
              </View>
              <Text style={styles.doneTitle}>Checklist submitted</Text>
              <Text style={styles.doneSub}>
                Today at{" "}
                {new Date(submittedAt).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>

              {result?.compliancePercentage != null ? (
                <View style={styles.doneStats}>
                  <View style={styles.doneStat}>
                    <Text style={[styles.doneStatValue, { color: pctColor(result.compliancePercentage) }]}>
                      {result.compliancePercentage}%
                    </Text>
                    <Text style={styles.doneStatLabel}>Compliance</Text>
                  </View>
                  <View style={styles.doneStat}>
                    <Text style={[styles.doneStatValue, { color: GREEN }]}>{result.compliant}</Text>
                    <Text style={styles.doneStatLabel}>Compliant</Text>
                  </View>
                  <View style={styles.doneStat}>
                    <Text style={[styles.doneStatValue, { color: RED }]}>{result.nonCompliant}</Text>
                    <Text style={styles.doneStatLabel}>Not compliant</Text>
                  </View>
                  <View style={styles.doneStat}>
                    <Text style={styles.doneStatValue}>{result.imagesAttached}</Text>
                    <Text style={styles.doneStatLabel}>Photos</Text>
                  </View>
                </View>
              ) : result?.max ? (
                <Text style={styles.doneSub}>
                  Score {result.achieved}/{result.max} ({result.scorePct}%)
                </Text>
              ) : null}

              <Text style={styles.doneNote}>A new checklist opens tomorrow.</Text>
            </View>
          ) : (
          <>
          {/* Progress / score */}
          <View style={styles.card}>
            <View style={styles.progressTop}>
              <Text style={styles.progressTitle}>
                {progress.complete} of {progress.total} complete
              </Text>
              <Text style={[styles.progressPct, { color: ORANGE }]}>{completePct}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${completePct}%` }]} />
            </View>

            {checklist.scored && (
              <View style={styles.scoreSummary}>
                <View>
                  <Text style={styles.scoreLabel}>Score</Text>
                  <Text style={styles.scoreValue}>
                    {progress.achieved}
                    <Text style={styles.scoreMax}> / {progress.max}</Text>
                  </Text>
                </View>
                <View style={[styles.scorePctPill, { backgroundColor: `${pctColor(scorePct)}1A` }]}>
                  <Text style={[styles.scorePctText, { color: pctColor(scorePct) }]}>
                    {scorePct}%
                  </Text>
                </View>
              </View>
            )}

            {submittedAt && (
              <View style={styles.submittedRow}>
                <Ionicons name="checkmark-done" size={16} color={GREEN} />
                <Text style={styles.submittedText}>
                  Completed at{" "}
                  {new Date(submittedAt).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
            )}
          </View>

          {/* Instructions */}
          <View style={styles.instructionCard}>
            <Ionicons name="information-circle-outline" size={20} color={ORANGE} />
            <Text style={styles.instructionText}>{checklist.instructions}</Text>
          </View>

          {/* Sections */}
          {checklist.sections.map((section) => {
            const open = !!expanded[section.id];
            const info = sectionInfo[section.id];
            const done = info.done === info.total;
            const startNumber = runningNumber;
            runningNumber += section.items.length;
            const showScore = checklist.scored && info.max > 0;

            return (
              <View key={section.id} style={styles.section}>
                <Pressable style={styles.sectionHeader} onPress={() => toggleSection(section.id)}>
                  <View style={[styles.sectionIcon, done && { backgroundColor: "#D1FAE5" }]}>
                    <Ionicons
                      name={done ? "checkmark" : section.icon}
                      size={18}
                      color={done ? GREEN : NAVY}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>{section.title}</Text>
                    <Text style={styles.sectionSub}>
                      {info.done}/{info.total} complete
                    </Text>
                  </View>
                  {showScore && (
                    <Text style={styles.sectionScore}>
                      {info.achieved}/{info.max}
                    </Text>
                  )}
                  <Ionicons name={open ? "chevron-up" : "chevron-down"} size={20} color="#6B7280" />
                </Pressable>

                {open &&
                  section.items.map((item, i) => (
                    <ChecklistItem
                      key={item.id}
                      checklist={checklist}
                      item={item}
                      number={startNumber + i + 1}
                      answer={answers[item.id]}
                      showError={showErrors}
                      onChange={onChange}
                      onPickPhoto={onPickPhoto}
                      onDrawingChange={onDrawingChange}
                    />
                  ))}
              </View>
            );
          })}

          <Pressable
            style={[styles.submitBtn, (sending || alreadySent) && styles.submitBtnDisabled]}
            onPress={onSubmit}
            disabled={sending || alreadySent}
          >
            {sending ? (
              <>
                <ActivityIndicator color="#fff" />
                {!!sendStatus && <Text style={styles.submitText}>{sendStatus}</Text>}
              </>
            ) : (
              <>
                <Ionicons name="checkmark-done-outline" size={20} color="#fff" />
                <Text style={styles.submitText}>
                  {alreadySent
                    ? "Submitted for today"
                    : submittedAt
                      ? "Update Checklist"
                      : "Submit Checklist"}
                </Text>
              </>
            )}
          </Pressable>
          </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3EEE8" },
  header: {
    backgroundColor: NAVY,
    paddingTop: 50,
    paddingBottom: 22,
    paddingHorizontal: 18,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTag: { color: "#F5A623", fontWeight: "800", letterSpacing: 1.2, fontSize: 10 },
  headerTitle: { color: "#fff", fontSize: 21, fontWeight: "bold", marginTop: 3 },

  card: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    elevation: 2,
  },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  infoLabel: { width: 48, fontSize: 13, color: "#6B7280" },
  infoValue: { flex: 1, fontSize: 14, fontWeight: "600", color: "#111827" },
  storeInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === "ios" ? 8 : 4,
  },

  progressTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progressTitle: { fontSize: 14, fontWeight: "700", color: NAVY },
  progressPct: { fontSize: 18, fontWeight: "800" },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#F3F4F6",
    marginTop: 10,
    overflow: "hidden",
  },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: ORANGE },
  scoreSummary: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  scoreLabel: { fontSize: 12, color: "#6B7280", fontWeight: "600" },
  scoreValue: { fontSize: 22, fontWeight: "800", color: NAVY, marginTop: 2 },
  scoreMax: { fontSize: 15, fontWeight: "600", color: GREY },
  scorePctPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  scorePctText: { fontSize: 16, fontWeight: "800" },
  submittedRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  submittedText: { fontSize: 12, color: GREEN, fontWeight: "600" },

  instructionCard: {
    backgroundColor: "#FFF4EC",
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  instructionText: { flex: 1, fontSize: 12, color: ORANGE, lineHeight: 18 },

  section: { marginHorizontal: 16, marginTop: 12 },
  sectionHeader: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    elevation: 2,
  },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#E1E7F0",
    justifyContent: "center",
    alignItems: "center",
  },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: NAVY },
  sectionSub: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  sectionScore: {
    fontSize: 12,
    fontWeight: "700",
    color: GREEN,
    backgroundColor: "#ECFDF5",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },

  itemCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  itemCardError: { borderColor: "#FCA5A5", backgroundColor: "#FFFBFB" },
  itemTop: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  itemNumber: { fontSize: 13, fontWeight: "700", color: ORANGE, minWidth: 22 },
  itemText: { fontSize: 14, color: "#111827", lineHeight: 20 },
  itemHint: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  pointsBadge: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6B7280",
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    overflow: "hidden",
  },
  expectedTag: {
    alignSelf: "flex-start",
    marginTop: 6,
    marginLeft: 30,
    fontSize: 11,
    fontWeight: "600",
    color: "#4A6FA5",
    backgroundColor: "#ECF3FA",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: "hidden",
  },
  photoTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: "#FFF4EC",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 6,
    marginLeft: 30,
  },
  photoTagText: { fontSize: 11, color: ORANGE, fontWeight: "600" },

  answerRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  answerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  answerText: { fontSize: 14, color: "#6B7280", fontWeight: "600" },

  scoreRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  scoreBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
    justifyContent: "center",
    alignItems: "center",
  },
  scoreBtnActive: { backgroundColor: NAVY, borderColor: NAVY },
  scoreText: { fontSize: 15, fontWeight: "700", color: "#6B7280" },
  scoreTextActive: { color: "#fff" },
  scoreOutOf: { fontSize: 13, color: GREY, marginLeft: 2 },

  remarkInput: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: "#111827",
    minHeight: 40,
    textAlignVertical: "top",
  },
  textInput: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
    fontSize: 14,
    color: "#111827",
  },
  inputError: { borderColor: RED },
  remarkInputMissing: { borderColor: RED, borderWidth: 1.5, backgroundColor: "#FEF2F2" },

  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  thumbWrap: { width: 86, height: 86, borderRadius: 10, overflow: "hidden" },
  thumb: { width: "100%", height: "100%", backgroundColor: "#F3F4F6" },
  thumbRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  addPhoto: {
    width: 86,
    height: 86,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: ORANGE,
    backgroundColor: "#FFFAF5",
    justifyContent: "center",
    alignItems: "center",
    gap: 2,
  },
  addPhotoText: { fontSize: 11, color: ORANGE, fontWeight: "700" },

  sigTabs: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    padding: 3,
    marginTop: 10,
  },
  sigTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  sigTabActive: { backgroundColor: NAVY },
  sigTabText: { fontSize: 13, fontWeight: "700", color: "#6B7280" },
  sigUpload: {
    height: 170,
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: ORANGE,
    backgroundColor: "#FFFAF5",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
  },
  sigUploadHint: { fontSize: 11, color: GREY },
  sigImageWrap: {
    height: 170,
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  sigImage: { width: "100%", height: "100%" },

  errorRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  errorText: { fontSize: 12, color: RED, fontWeight: "600" },

  submitBtn: {
    marginHorizontal: 16,
    marginTop: 18,
    backgroundColor: ORANGE,
    borderRadius: 14,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    elevation: 2,
  },
  headerBtnSpacer: { width: 40, height: 40 },
  doneCard: { alignItems: "center", paddingVertical: 24 },
  doneIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#D1FAE5",
    justifyContent: "center",
    alignItems: "center",
  },
  doneTitle: { fontSize: 18, fontWeight: "800", color: NAVY, marginTop: 12 },
  doneSub: { fontSize: 13, color: "#6B7280", marginTop: 4 },
  doneStats: { flexDirection: "row", marginTop: 18, alignSelf: "stretch" },
  doneStat: { flex: 1, alignItems: "center" },
  doneStatValue: { fontSize: 20, fontWeight: "800", color: NAVY },
  doneStatLabel: { fontSize: 11, color: "#6B7280", marginTop: 2, textAlign: "center" },
  doneNote: { fontSize: 12, color: GREY, marginTop: 18 },
  submitBtnDisabled: { backgroundColor: "#9CA3AF" },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
