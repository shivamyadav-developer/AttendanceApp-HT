// Shared rules for checklists shown under Drawer → Checklist.
// All checklists come from the API (GET /checklist/templates, see fromTemplate.js).

export const DEFAULT_POINTS = 10;
export const DEFAULT_MAX_SCORE = 5;

export const allItems = (checklist) => checklist.sections.flatMap((s) => s.items);

// 1…max buttons for a "score" item
export const scoreOptions = (item) =>
  Array.from({ length: item.points || DEFAULT_MAX_SCORE }, (_, i) => i + 1);

// The compliant answer for a yes/no item ("yes" unless the item says otherwise)
export const expectedAnswer = (item) => item.expected || "yes";

// Does this answer need a remark?
export const remarkRequired = (checklist, item, value) => {
  if (item.type !== "yesno" || value == null || value === "na") return false;
  if (checklist.remarkRule === "nonCompliant") return value !== expectedAnswer(item);
  return checklist.remarkRequiredOnNo && value === "no";
};

// What is still missing for one item, or null when it is complete.
// answer: { value: "yes" | "no" | "na" | 1..n, remark, photos: [{ uri }], text, signature }
export const itemProblem = (checklist, item, answer) => {
  switch (item.type) {
    case "photo":
      return answer?.photos?.length ? null : "Photo required";
    case "text":
      return answer?.text?.trim() ? null : "Required";
    case "signature": // drawn, or uploaded as a photo
      return answer?.signature?.length || answer?.photos?.length ? null : "Signature required";
    default: // yesno, score
      if (answer?.value == null) return "Not answered";
      if (remarkRequired(checklist, item, answer.value) && !answer.remark?.trim()) {
        return "Remark required";
      }
      if (item.imageReq && !answer.photos?.length) return "Photo required";
      return null;
  }
};

// Points earned by one item, or null when it doesn't count (N/A, photo, text…)
export const itemPoints = (item, answer) => {
  const value = answer?.value;
  if (item.type === "yesno") {
    if (value === "na") return null;
    const points = item.points ?? DEFAULT_POINTS;
    return { achieved: value === expectedAnswer(item) ? points : 0, max: points };
  }
  if (item.type === "score") {
    const max = item.points || DEFAULT_MAX_SCORE;
    return { achieved: typeof value === "number" ? Math.min(value, max) : 0, max };
  }
  return null;
};

// Section total for a scored checklist (unanswered items count towards max)
export const sectionScore = (section, answers) => {
  let achieved = 0;
  let max = 0;
  for (const item of section.items) {
    const p = itemPoints(item, answers[item.id]);
    if (!p) continue;
    achieved += p.achieved;
    max += p.max;
  }
  return { achieved, max };
};

export const checklistProgress = (checklist, answers) => {
  const items = allItems(checklist);
  const complete = items.filter((i) => !itemProblem(checklist, i, answers[i.id])).length;
  let achieved = 0;
  let max = 0;
  if (checklist.scored) {
    for (const s of checklist.sections) {
      const sc = sectionScore(s, answers);
      achieved += sc.achieved;
      max += sc.max;
    }
  }
  return { complete, total: items.length, achieved, max };
};

export const draftKey = (checklistId) => `checklistDraft:${checklistId}`;
