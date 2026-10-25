// API checklist template (GET /checklist/templates) → checklist definition
// used by ChecklistForm. Item / section ids are the API _ids, so answers can be
// submitted against them later.
//
// API item: { _id, text, answerType: "YES_NO" | "SCORE" | …, expected: "YES" | "NO",
//             maxScore, imageRequired }
// Scoring: a YES_NO answer that matches `expected` earns maxScore, otherwise 0.
//          A SCORE answer earns the chosen value (1…maxScore).
// Remarks are required for every answer that does not match `expected`.

const ANSWER_TYPES = {
  YES_NO: "yesno",
  YES_NO_NA: "yesno",
  SCORE: "score",
  RATING: "score",
  PHOTO: "photo",
  IMAGE: "photo",
  TEXT: "text",
  SIGNATURE: "signature",
};

// Section icon by name, so the API can add sections without an app change
const SECTION_ICONS = [
  [/upkeep|maintenance/i, "storefront-outline"],
  [/internal|process/i, "settings-outline"],
  [/sales/i, "trending-up-outline"],
  [/customer/i, "happy-outline"],
  [/people|training|employee/i, "people-outline"],
  [/safety|security/i, "shield-checkmark-outline"],
  [/exterior/i, "storefront-outline"],
  [/interior/i, "bulb-outline"],
  [/window|focal/i, "easel-outline"],
  [/décor|decor/i, "flower-outline"],
  [/kitchen|tableware/i, "restaurant-outline"],
  [/bedroom|fashion/i, "bed-outline"],
  [/living|dining/i, "cafe-outline"],
  [/signature/i, "create-outline"],
];

const sectionIcon = (name = "") =>
  SECTION_ICONS.find(([re]) => re.test(name))?.[1] || "list-outline";

const toItem = (apiItem) => {
  const type = ANSWER_TYPES[apiItem.answerType] || "yesno";
  return {
    id: apiItem._id,
    type,
    text: apiItem.text,
    // "yes" | "no" — the compliant answer
    expected: apiItem.expected ? String(apiItem.expected).toLowerCase() : "yes",
    points: Number(apiItem.maxScore) || 0,
    imageReq: !!apiItem.imageRequired,
    na: apiItem.answerType === "YES_NO_NA",
  };
};

// Answers (as kept by ChecklistForm) → POST /checklist/submissions body.
// imageUrl is the link returned by POST /checklist/upload (ChecklistForm
// uploads the photos first and stores the link as photos[0].url).
export const buildSubmission = ({ checklist, answers, storeName, date, user }) => ({
  templateId: checklist.templateId,
  // Login data has the store as siteId (number, e.g. 6036) / siteCode ("6036")
  storeId: user?.siteId ?? (user?.siteCode ? Number(user.siteCode) : null) ?? user?.storeId ?? null,
  storeName: storeName.trim(),
  date,
  department: "",
  filledByName: user?.name || "",
  submittedBy: {
    userId: user?._id || user?.id || user?.userId || null,
    name: user?.name || "",
    employeeId: user?.employeeNumber || user?.employeeId || "",
    role: user?.role || checklist.role, // the submitter's role, e.g. STORE_STAFF
  },
  answers: checklist.sections.flatMap((s) =>
    s.items
      .filter((item) => answers[item.id]?.value != null)
      .map((item) => {
        const a = answers[item.id];
        const out = { itemId: item.id };
        if (item.type === "score") out.score = a.value;
        else out.answer = String(a.value).toUpperCase(); // YES | NO | NA
        if (a.remark?.trim()) out.remark = a.remark.trim();
        if (a.photos?.[0]?.url) out.imageUrl = a.photos[0].url;
        return out;
      })
  ),
  submit: true,
});

// display: { title, icon, color } for the list card
export const checklistFromTemplate = (template, display = {}) => ({
  id: `api:${template._id}`,
  templateId: template._id,
  role: template.role,
  title: display.title || template.title,
  subtitle: template.title,
  description: template.description,
  icon: display.icon || "clipboard-check-outline",
  color: display.color || "#D96A17",
  scored: true,
  remarkRule: "nonCompliant",
  instructions: (template.instructions || []).join(" "),
  sections: (template.sections || []).map((s) => ({
    id: s._id,
    title: s.name,
    icon: sectionIcon(s.name),
    items: (s.items || []).map(toItem),
  })),
});
