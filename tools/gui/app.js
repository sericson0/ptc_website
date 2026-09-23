(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = { config: null, jobId: null, uploaded: false, draft: null, pollTimer: null };

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: options.body ? { "Content-Type": "application/json", ...(options.headers || {}) } : options.headers,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
    return body;
  }

  function showAlert(message) {
    const alert = $("#config-alert");
    alert.textContent = message;
    alert.hidden = !message;
  }

  function showPanel(name) {
    $("#setup-panel").hidden = name !== "setup";
    $("#processing-panel").hidden = name !== "processing";
    $("#review-panel").hidden = name !== "review";
    $("#complete-panel").hidden = name !== "complete";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function formatBytes(bytes) {
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  }

  function updateStartButton() {
    const button = $("#start-button");
    button.disabled = !state.uploaded || !state.config?.aiConfigured;
    button.textContent = !state.config?.aiConfigured
      ? "Local AI setup required"
      : state.uploaded ? "Create lesson draft" : "Choose a video to begin";
  }

  function createJobId() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function chooseFile(file) {
    if (!file || !file.type.startsWith("video/")) {
      showAlert("Please choose a video file.");
      return;
    }
    showAlert("");
    state.jobId = createJobId();
    state.uploaded = false;
    localStorage.setItem("ptcCurrentJob", state.jobId);
    $("#dropzone").hidden = true;
    $("#file-card").hidden = false;
    $("#file-name").textContent = file.name;
    $("#file-size").textContent = formatBytes(file.size);
    if (!$("#working-title").value) $("#working-title").value = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
    uploadFile(file);
  }

  function restoreUploadedJob(job, retry = false) {
    state.uploaded = true;
    $("#dropzone").hidden = true;
    $("#file-card").hidden = false;
    $("#file-name").textContent = job.filename;
    $("#file-size").textContent = retry ? "Ready to retry with cached work" : "Stored locally";
    if (!$("#working-title").value) {
      $("#working-title").value = job.filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
    }
    updateStartButton();
  }

  function uploadFile(file) {
    const wrap = $("#upload-wrap");
    const bar = $("#upload-bar");
    const percent = $("#upload-percent");
    wrap.hidden = false;
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `/api/uploads/${state.jobId}?filename=${encodeURIComponent(file.name)}`);
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const value = Math.round((event.loaded / event.total) * 100);
      bar.style.width = `${value}%`;
      percent.textContent = `${value}%`;
    };
    xhr.onerror = () => showAlert("The local upload failed. Is the Video Studio terminal still open?");
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        const message = JSON.parse(xhr.responseText || "{}").error || "The local upload failed.";
        showAlert(message);
        return;
      }
      state.uploaded = true;
      bar.style.width = "100%";
      percent.textContent = "100%";
      $("#upload-label").textContent = "Ready for processing";
      updateStartButton();
    };
    xhr.send(file);
  }

  function placementChanged() {
    const isNew = $("#placement").value === "__new__";
    $("#new-unit-fields").hidden = !isNew;
    $("#unit-title").required = isNew;
    $("#unit-summary").required = isNew;
  }

  async function startProcessing(event) {
    event.preventDefault();
    if (!state.uploaded) return;
    const isNew = $("#placement").value === "__new__";
    const body = {
      placementType: isNew ? "new" : "existing",
      relativeFile: isNew ? "" : $("#placement").value,
      unitTitle: $("#unit-title").value,
      unitSummary: $("#unit-summary").value,
      workingTitle: $("#working-title").value,
      extraContext: $("#extra-context").value,
      playlistUrl: $("#playlist-url").value,
      madeForKids: $("#made-for-kids").checked,
    };
    try {
      showAlert("");
      await api(`/api/jobs/${state.jobId}/process`, { method: "POST", body: JSON.stringify(body) });
      showPanel("processing");
      pollJob();
    } catch (error) {
      showAlert(error.message);
    }
  }

  function setProgress(job) {
    const value = Math.max(0, Math.min(100, Number(job.percent) || 0));
    $("#process-message").textContent = job.message || "Working…";
    $("#process-bar").style.width = `${value}%`;
    $("#process-percent").textContent = `${value}%`;
    const details = {
      transcription: "Whisper is turning the speech into timestamped text.",
      draft: "Codex is using your ChatGPT plan to create lesson notes and YouTube copy.",
      images: "Pulling representative frames for the teaching points.",
      approval: "Keep this window open. Google authorization may open in another tab.",
    };
    $("#process-detail").textContent = details[job.phase] || "You can leave this tab open while the lesson is prepared.";
  }

  async function pollJob() {
    clearTimeout(state.pollTimer);
    try {
      const job = await api(`/api/jobs/${state.jobId}`);
      setProgress(job);
      if (job.status === "review") {
        state.draft = job.draft;
        renderReview();
        showPanel("review");
        return;
      }
      if (job.status === "complete") {
        state.draft = job.draft;
        renderComplete();
        showPanel("complete");
        return;
      }
      if (job.status === "error") {
        showAlert(job.error || "The workflow stopped with an error.");
        if (job.draft) {
          state.draft = job.draft;
          renderReview();
          showPanel("review");
        } else {
          restoreUploadedJob(job, true);
          showPanel("setup");
        }
        return;
      }
      state.pollTimer = setTimeout(pollJob, 1000);
    } catch (error) {
      $("#process-detail").textContent = error.message;
      state.pollTimer = setTimeout(pollJob, 2500);
    }
  }

  function field(labelText, value, className) {
    const label = document.createElement("label");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.className = className;
    input.value = value || "";
    label.append(input);
    return label;
  }

  function renderSections() {
    const container = $("#sections-editor");
    container.replaceChildren();
    (state.draft.lesson.sections || []).forEach((section, sectionIndex) => {
      const card = document.createElement("div");
      card.className = "section-editor";
      card.dataset.section = sectionIndex;
      const top = document.createElement("div");
      top.className = "section-top";
      const title = document.createElement("input");
      title.className = "section-title-input";
      title.value = section.title || "";
      title.setAttribute("aria-label", "Section title");
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove remove-section";
      remove.title = "Remove section";
      remove.textContent = "×";
      top.append(title, remove);
      card.append(top);

      (section.points || []).forEach((point, pointIndex) => {
        const row = document.createElement("div");
        row.className = "point-editor";
        row.dataset.point = pointIndex;
        const preview = document.createElement("div");
        preview.className = "point-image";
        if (point.image || point.stagedImage) {
          const image = document.createElement("img");
          image.src = `/api/jobs/${state.jobId}/image?section=${sectionIndex}&point=${pointIndex}&v=${Date.now()}`;
          image.alt = "Proposed video still";
          preview.append(image);
        }
        const stamp = document.createElement("span");
        stamp.textContent = `${Math.round(Number(point.timeSeconds) || 0)} sec`;
        preview.append(stamp);

        const fields = document.createElement("div");
        fields.className = "point-fields";
        const text = document.createElement("textarea");
        text.className = "point-text";
        text.value = point.text || "";
        text.setAttribute("aria-label", "Teaching point");
        const meta = document.createElement("div");
        meta.className = "point-meta";
        const timeLabel = document.createElement("label");
        timeLabel.textContent = "Time (seconds)";
        const time = document.createElement("input");
        time.className = "point-time";
        time.type = "number";
        time.min = "0";
        time.step = ".1";
        time.value = Number(point.timeSeconds) || 0;
        timeLabel.append(time);
        const removePoint = document.createElement("button");
        removePoint.type = "button";
        removePoint.className = "remove remove-point";
        removePoint.title = "Remove point";
        removePoint.textContent = "×";
        const refresh = document.createElement("button");
        refresh.type = "button";
        refresh.className = "text-button refresh-still";
        refresh.textContent = "Refresh still";
        meta.append(timeLabel, refresh, removePoint);
        fields.append(text, meta);
        row.append(preview, fields);
        card.append(row);
      });
      const add = document.createElement("button");
      add.type = "button";
      add.className = "text-button add-point";
      add.textContent = "+ Add teaching point";
      card.append(add);
      container.append(card);
    });
  }

  function renderReview() {
    const draft = state.draft;
    $("#review-lesson-title").value = draft.lesson.title || "";
    $("#review-notes").value = (draft.lesson.notes || []).join("\n\n");
    $("#review-practice").value = (draft.lesson.practice || []).join("\n");
    $("#youtube-title").value = draft.youtube.title || "";
    $("#youtube-description").value = draft.youtube.description || "";
    $("#youtube-tags").value = (draft.youtube.tags || []).join(", ");
    $("#review-playlist").value = draft.youtube.playlistUrl || "";
    $("#action-youtube").disabled = !state.config.youtubeConfigured || Boolean(draft.youtube.videoId);
    $("#action-youtube").checked = false;
    renderSections();
    updateTitleCount();
    updateActionState();
    $("#save-state").textContent = "Reviewing local draft";
  }

  function collectDraft() {
    const draft = state.draft;
    draft.lesson.title = $("#review-lesson-title").value.trim();
    draft.lesson.notes = $("#review-notes").value.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
    draft.lesson.practice = $("#review-practice").value.split(/\n/).map((item) => item.trim()).filter(Boolean);
    draft.youtube.title = $("#youtube-title").value.trim();
    draft.youtube.description = $("#youtube-description").value.trim();
    draft.youtube.tags = $("#youtube-tags").value.split(",").map((item) => item.trim()).filter(Boolean);
    draft.youtube.playlistUrl = $("#review-playlist").value.trim();
    draft.lesson.sections = $$(".section-editor").map((card, sectionIndex) => {
      const previous = draft.lesson.sections[sectionIndex] || { points: [] };
      return {
        ...previous,
        title: $(".section-title-input", card).value.trim(),
        points: $$(".point-editor", card).map((row, pointIndex) => ({
          ...(previous.points?.[pointIndex] || {}),
          text: $(".point-text", row).value.trim(),
          timeSeconds: Number($(".point-time", row).value) || 0,
        })),
      };
    });
    return draft;
  }

  async function saveDraft() {
    collectDraft();
    $("#save-state").textContent = "Saving…";
    await api(`/api/jobs/${state.jobId}/draft`, { method: "PUT", body: JSON.stringify({ draft: state.draft }) });
    $("#save-state").textContent = "Draft saved locally";
  }

  function updateTitleCount() {
    $("#title-count").textContent = `${$("#youtube-title").value.length}/100`;
  }

  function updateActionState() {
    const hasPlaylist = Boolean($("#review-playlist").value.trim());
    const canHaveVideo = Boolean(state.draft?.youtube?.videoId) || $("#action-youtube").checked;
    $("#action-playlist").disabled = !hasPlaylist || !canHaveVideo;
    if (!hasPlaylist || !canHaveVideo) $("#action-playlist").checked = false;
  }

  async function approve() {
    const button = $("#approve-button");
    const body = {
      applySite: $("#action-site").checked,
      uploadYouTube: $("#action-youtube").checked,
      addPlaylist: $("#action-playlist").checked,
    };
    if (!body.applySite && !body.uploadYouTube && !body.addPlaylist) {
      showAlert("Choose at least one approved action, or use Save draft.");
      return;
    }
    try {
      button.disabled = true;
      await saveDraft();
      await api(`/api/jobs/${state.jobId}/approve`, { method: "POST", body: JSON.stringify(body) });
      showAlert("");
      showPanel("processing");
      setProgress({ phase: "approval", message: "Applying approved actions…", percent: 5 });
      pollJob();
    } catch (error) {
      button.disabled = false;
      showAlert(error.message);
    }
  }

  function renderComplete() {
    const parts = [];
    if (state.draft.siteApplied) parts.push(`Website lesson written to ${state.draft.siteApplied.relativeFile}.`);
    if (state.draft.youtube.videoId) parts.push("The YouTube video was uploaded privately.");
    $("#complete-summary").textContent = parts.join(" ") || "Your draft was saved.";
    const link = $("#youtube-link");
    link.hidden = !state.draft.youtube.url;
    if (state.draft.youtube.url) link.href = state.draft.youtube.url;
  }

  async function restoreJob() {
    const id = localStorage.getItem("ptcCurrentJob");
    if (!id) return;
    try {
      state.jobId = id;
      const job = await api(`/api/jobs/${id}`);
      if (job.status === "review" || (job.status === "error" && job.draft)) {
        state.draft = job.draft;
        renderReview();
        showPanel("review");
      } else if (job.status === "complete") {
        state.draft = job.draft;
        renderComplete();
        showPanel("complete");
      } else if (["processing", "approving"].includes(job.status)) {
        showPanel("processing");
        setProgress(job);
        pollJob();
      } else if (job.status === "uploaded" || (job.status === "error" && !job.draft)) {
        restoreUploadedJob(job, job.status === "error");
        if (job.status === "error") showAlert(`${job.error} You can retry; completed transcript and drafting work will be reused.`);
      }
    } catch {
      localStorage.removeItem("ptcCurrentJob");
    }
  }

  async function init() {
    try {
      state.config = await api("/api/config");
      const placement = $("#placement");
      placement.replaceChildren();
      for (const unit of state.config.units) {
        const option = document.createElement("option");
        option.value = unit.relativeFile;
        option.textContent = `${unit.title} · ${unit.lessonCount} ${unit.lessonCount === 1 ? "lesson" : "lessons"}${unit.hidden ? " · hidden" : ""}`;
        placement.append(option);
      }
      const create = document.createElement("option");
      create.value = "__new__";
      create.textContent = "+ Create a new unit";
      placement.append(create);
      $("#playlist-url").value = state.config.playlistUrl || "";
      if (!state.config.aiConfigured) showAlert(state.config.aiProblem || "Local AI setup is required.");
      else if (!state.config.youtubeConfigured) showAlert(state.config.youtubeProblem || "YouTube upload credentials are not configured.");
      if (!state.config.youtubeConfigured) {
        const youtubeAction = $("#action-youtube");
        youtubeAction.disabled = true;
        const explanation = youtubeAction.closest(".action-choice")?.querySelector("small");
        if (explanation) explanation.textContent = state.config.youtubeProblem || "YouTube upload credentials are not configured.";
      }
      placementChanged();
      updateStartButton();
      await restoreJob();
    } catch (error) {
      showAlert(error.message);
    }
  }

  const dropzone = $("#dropzone");
  const fileInput = $("#file-input");
  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) fileInput.click(); });
  fileInput.addEventListener("change", () => chooseFile(fileInput.files[0]));
  ["dragenter", "dragover"].forEach((name) => dropzone.addEventListener(name, (event) => { event.preventDefault(); dropzone.classList.add("dragging"); }));
  ["dragleave", "drop"].forEach((name) => dropzone.addEventListener(name, (event) => { event.preventDefault(); dropzone.classList.remove("dragging"); }));
  dropzone.addEventListener("drop", (event) => chooseFile(event.dataTransfer.files[0]));
  $("#replace-file").addEventListener("click", () => fileInput.click());
  $("#placement").addEventListener("change", placementChanged);
  $("#lesson-form").addEventListener("submit", startProcessing);
  $("#youtube-title").addEventListener("input", updateTitleCount);
  $("#review-playlist").addEventListener("input", updateActionState);
  $("#action-youtube").addEventListener("change", updateActionState);
  $("#save-button").addEventListener("click", () => saveDraft().catch((error) => showAlert(error.message)));
  $("#approve-button").addEventListener("click", approve);
  $("#add-section").addEventListener("click", () => {
    collectDraft();
    state.draft.lesson.sections.push({ title: "New section", points: [] });
    renderSections();
  });
  $("#sections-editor").addEventListener("click", (event) => {
    const sectionCard = event.target.closest(".section-editor");
    if (!sectionCard) return;
    const sectionIndex = Number(sectionCard.dataset.section);
    if (event.target.closest(".refresh-still")) {
      collectDraft();
      const pointIndex = Number(event.target.closest(".point-editor").dataset.point);
      const timeSeconds = state.draft.lesson.sections[sectionIndex].points[pointIndex].timeSeconds;
      $("#save-state").textContent = "Refreshing still…";
      api(`/api/jobs/${state.jobId}/image`, {
        method: "POST",
        body: JSON.stringify({ section: sectionIndex, point: pointIndex, timeSeconds }),
      }).then(({ draft }) => {
        state.draft = draft;
        renderSections();
        $("#save-state").textContent = "New still saved locally";
      }).catch((error) => showAlert(error.message));
      return;
    }
    collectDraft();
    if (event.target.closest(".remove-section")) state.draft.lesson.sections.splice(sectionIndex, 1);
    else if (event.target.closest(".remove-point")) {
      const pointIndex = Number(event.target.closest(".point-editor").dataset.point);
      state.draft.lesson.sections[sectionIndex].points.splice(pointIndex, 1);
    } else if (event.target.closest(".add-point")) {
      state.draft.lesson.sections[sectionIndex].points.push({ text: "New teaching point", timeSeconds: 0 });
    } else return;
    renderSections();
  });
  $("#another-button").addEventListener("click", () => { localStorage.removeItem("ptcCurrentJob"); location.reload(); });

  init();
})();
