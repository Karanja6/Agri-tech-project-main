MKULIMA SMART

Farmer-friendly web app to record crop processes, see this season’s status at a glance, and get bullet-point agronomic advice powered by a small ML model.

🔎 Evaluation grid with per-crop cards

🪟 Modal showing current season (anchored to the latest update; from last planting/sowing/transplanting to next harvest/harvesting or today)

📄 Full history page (crop-details.html)

✍️ Manual process entry (+ optional weather autofill)

🤖 ML suitability scoring + simple bullet-point advice (e.g., “Rainfall low → Add water / increase irrigation.”)

💬 (Optional) Chat & image upload endpoints if you wire them up

Tech Stack

Frontend: Vanilla HTML/CSS/JS (Evaluation.html, crop-details.html, public/script.js)

Backend: Node.js/Express (expects routes like /api/get-processes, /api/Evaluation, /api/process-eval, /api/weather)

ML: Python (scikit-learn), model saved as ml/process_eval_pipeline.joblib

Rules: JSON ranges per crop & stage (ml/all_crops_stage_guide.json)