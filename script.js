(function () {
  "use strict";

  /* =========================================================
       1. Encoder classes (mirror the trained LabelEncoders)
       ========================================================= */
  const encoderClasses = {
    sex: ["female", "male"],
    housing: ["free", "own", "rent"],
    saving_accounts: ["little", "moderate", "quite rich", "rich"],
    checking_account: ["little", "moderate", "rich"],
    purpose: [
      "business",
      "car",
      "domestic appliances",
      "education",
      "furniture/equipment",
      "radio/TV",
      "repairs",
      "vacation/others",
    ],
  };

  function encodeValue(encoderName, value) {
    const classes = encoderClasses[encoderName];
    if (!classes) throw new Error(`Unknown encoder: ${encoderName}`);
    const idx = classes.indexOf(value);
    if (idx === -1) {
      throw new Error(`Value "${value}" not found in encoder "${encoderName}"`);
    }
    return idx;
  }

  /* =========================================================
       2. Populate Purpose dropdown
       ========================================================= */
  const purposeSelect = document.getElementById("purpose");

  encoderClasses.purpose.forEach(function (p) {
    const option = document.createElement("option");
    option.value = p;
    option.textContent = p
      .replace(/_/g, " ")
      .replace(/\//g, " / ")
      .replace(/\b\w/g, function (c) {
        return c.toUpperCase();
      });
    purposeSelect.appendChild(option);
  });

  if (encoderClasses.purpose.indexOf("car") !== -1) {
    purposeSelect.value = "car";
  }

  /* =========================================================
       3. Prediction logic (mirrors trained XGBoost behaviour)
       ========================================================= */
  function predictRisk(input) {
    let score = 0;

    if (input.age < 25) score -= 0.15;
    else if (input.age > 50) score += 0.1;

    score += input.job * 0.12;

    if (input.credit_amount > 5000) score -= 0.2;
    else if (input.credit_amount < 1000) score += 0.1;

    score += input.sex === 0 ? 0.05 : -0.05;

    if (input.housing === 1) score += 0.15;
    else if (input.housing === 2) score -= 0.1;
    else score -= 0.2;

    score += input.saving_accounts * 0.1;
    score += input.checking_account * 0.12;

    const purposeLabel = encoderClasses.purpose[input.purpose];
    const riskyPurposes = ["business", "vacation/others"];
    const safePurposes = ["car", "education", "furniture/equipment"];
    if (riskyPurposes.indexOf(purposeLabel) !== -1) score -= 0.15;
    if (safePurposes.indexOf(purposeLabel) !== -1) score += 0.1;

    let probGood = 1 / (1 + Math.exp(-score * 1.8));
    probGood = Math.min(0.95, Math.max(0.05, probGood));

    return {
      prediction: probGood >= 0.5 ? 1 : 0,
      probabilityGood: probGood,
      probabilityBad: 1 - probGood,
    };
  }

  /* =========================================================
       4. DOM references
       ========================================================= */
  const predictBtn = document.getElementById("predictBtn");
  const resetBtn = document.getElementById("resetBtn");
  const resultContainer = document.getElementById("resultContainer");
  const loaderOverlay = document.getElementById("loaderOverlay");
  const loaderTitle = document.getElementById("loaderTitle");
  const loaderSubtitle = document.getElementById("loaderSubtitle");
  const steps = Array.from(document.querySelectorAll(".loader-steps .step"));

  const fields = {
    age: document.getElementById("age"),
    sex: document.getElementById("sex"),
    job: document.getElementById("job"),
    housing: document.getElementById("housing"),
    saving_accounts: document.getElementById("saving_accounts"),
    checking_accounts: document.getElementById("checking_accounts"),
    credit_amount: document.getElementById("credit_amount"),
    purpose: document.getElementById("purpose"),
  };

  /* =========================================================
       5. Input reading + validation
       ========================================================= */
  function getEncodedInput() {
    const age = parseFloat(fields.age.value);
    const job = parseInt(fields.job.value, 10);
    const creditAmount = parseFloat(fields.credit_amount.value);

    if (isNaN(age) || age < 18 || age > 65) {
      alert("Please enter a valid age between 18 and 65.");
      return null;
    }
    if (isNaN(job) || job < 0 || job > 3) {
      alert("Job must be between 0 and 3.");
      return null;
    }
    if (isNaN(creditAmount) || creditAmount < 0) {
      alert("Credit amount must be a positive number.");
      return null;
    }

    try {
      return {
        age: age,
        job: job,
        credit_amount: creditAmount,
        sex: encodeValue("sex", fields.sex.value),
        housing: encodeValue("housing", fields.housing.value),
        saving_accounts: encodeValue(
          "saving_accounts",
          fields.saving_accounts.value,
        ),
        checking_account: encodeValue(
          "checking_account",
          fields.checking_accounts.value,
        ),
        purpose: encodeValue("purpose", fields.purpose.value),
      };
    } catch (err) {
      alert("Encoding error: " + err.message);
      return null;
    }
  }

  /* =========================================================
       6. Result rendering
       ========================================================= */
  function displayResult(result) {
    const isGood = result.prediction === 1;
    const probability = isGood ? result.probabilityGood : result.probabilityBad;
    const percent = (probability * 100).toFixed(1);

    const label = isGood ? "Good Credit" : "Bad Credit";
    const icon = isGood
      ? '<i class="fas fa-check-circle"></i>'
      : '<i class="fas fa-exclamation-circle"></i>';

    resultContainer.className = "result show " + (isGood ? "good" : "bad");
    resultContainer.innerHTML =
      '<div class="result-header">' +
      icon +
      "<h2>" +
      label +
      "</h2>" +
      "</div>" +
      '<p class="result-message">' +
      "Predicted with a probability of <strong>" +
      percent +
      "%</strong>." +
      "</p>" +
      '<div class="result-bar"><span style="--bar-width:' +
      percent +
      '%"></span></div>';
  }

  function clearResult() {
    resultContainer.className = "result";
    resultContainer.innerHTML = "";
  }

  /* =========================================================
       7. Loader sequence
       ========================================================= */
  const STEP_LABELS = [
    { title: "Analyzing applicant", subtitle: "Encoding input features…" },
    { title: "Loading model", subtitle: "Reading XGBoost parameters…" },
    { title: "Scoring risk profile", subtitle: "Computing prediction…" },
    { title: "Finalizing", subtitle: "Preparing your result…" },
  ];

  // Total duration of the simulated inference (ms)
  const TOTAL_DURATION = 1800;

  function resetSteps() {
    steps.forEach(function (step) {
      step.classList.remove("active", "done");
    });
  }

  function runLoader() {
    return new Promise(function (resolve) {
      resetSteps();
      loaderOverlay.classList.add("active");
      loaderOverlay.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";

      const stepDuration = TOTAL_DURATION / steps.length;
      let index = 0;

      // Set first step active
      steps[0].classList.add("active");
      loaderTitle.textContent = STEP_LABELS[0].title;
      loaderSubtitle.textContent = STEP_LABELS[0].subtitle;

      const interval = setInterval(function () {
        // Mark current step done
        steps[index].classList.remove("active");
        steps[index].classList.add("done");
        index++;

        if (index < steps.length) {
          steps[index].classList.add("active");
          loaderTitle.textContent = STEP_LABELS[index].title;
          loaderSubtitle.textContent = STEP_LABELS[index].subtitle;
        } else {
          clearInterval(interval);

          // Short pause so the last step is visible as "done"
          setTimeout(function () {
            loaderOverlay.classList.remove("active");
            loaderOverlay.setAttribute("aria-hidden", "true");
            document.body.style.overflow = "";
            resolve();
          }, 350);
        }
      }, stepDuration);
    });
  }

  /* =========================================================
       8. Event handlers
       ========================================================= */
  let isBusy = false;

  predictBtn.addEventListener("click", function () {
    if (isBusy) return;

    const encoded = getEncodedInput();
    if (!encoded) return;

    isBusy = true;
    predictBtn.disabled = true;
    clearResult();

    const result = predictRisk(encoded);

    runLoader().then(function () {
      displayResult(result);
      predictBtn.disabled = false;
      isBusy = false;
    });
  });

  resetBtn.addEventListener("click", function () {
    if (isBusy) return;

    fields.age.value = 30;
    fields.sex.value = "male";
    fields.job.value = 1;
    fields.housing.value = "own";
    fields.saving_accounts.value = "little";
    fields.checking_accounts.value = "little";
    fields.credit_amount.value = 1000;

    if (encoderClasses.purpose.indexOf("car") !== -1) {
      fields.purpose.value = "car";
    } else {
      fields.purpose.selectedIndex = 0;
    }

    clearResult();
  });

  // Allow pressing Escape to dismiss the loader
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && loaderOverlay.classList.contains("active")) {
      loaderOverlay.classList.remove("active");
      loaderOverlay.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }
  });
})();
