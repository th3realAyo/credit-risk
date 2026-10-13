# sourcery skip: remove-redundant-fstring
from pathlib import Path

import joblib
import pandas as pd
import streamlit as st

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data" / "processed"
MODEL_PATH = BASE_DIR / "outputs" / "xgb_credit_model.pkl"

encoders = {}

for col in ["sex", "housing", "saving_accounts", "checking_account", "purpose"]:
    file_path = DATA_DIR / f"label_encoder_{col}.pkl"

    if not file_path.exists():
        raise FileNotFoundError(
            f"Missing encoder file: {file_path}\n"
            "Save the fitted encoder from your training script first."
        )

    encoders[col] = joblib.load(file_path)

# encoders = {col: joblib.load(rf"data\processed\label_encoder_{col}.pkl") for col in ["sex", "housing", "saving_accounts", "checking_accounts"]}
model = joblib.load(MODEL_PATH)

st.title("Credit Risk Prediction")
st.write("Enter applicant details to predict if the credit is good or bad")

age = st.number_input("Age", min_value = 18, max_value = 65, value = 30)
sex = st.selectbox("Sex", ["male", "female"])
job = st.number_input("Job (0-3)", min_value = 0, max_value = 3, value = 1)
housing= st.selectbox("Housing", ["own", "rent", "free"])
saving_accounts = st.selectbox("Saving Accounts", ["little", "moderate", "quite rich", "rich"])
checking_accounts = st.selectbox("Checking Accounts", ["little", "moderate", "rich"])
credit_amount = st.number_input("Credit Amount", min_value = 0, value = 1000)
purpose = st.selectbox("Purpose", encoders["purpose"].classes_)

input_df = pd.DataFrame({
    "age": [age],
    "job": [job],
    "credit_amount": [credit_amount],
    "sex": [encoders["sex"].transform([sex])[0]],
    "housing": [encoders["housing"].transform([housing])[0]],
    "saving_accounts": [encoders["saving_accounts"].transform([saving_accounts])[0]],
    "checking_account": [encoders["checking_account"].transform([checking_accounts])[0]],
    "purpose": [encoders["purpose"].transform([purpose])[0]]
})

if st.button("Predict"):
    prediction = model.predict(input_df)[0]
    prediction_proba = model.predict_proba(input_df)

    if prediction == 1:
        st.success(f"The credit is predicted to be GOOD with a probability of {prediction_proba[0][1]:.2f}")
    else:
        st.error(f"The credit is predicted to be BAD with a probability of {prediction_proba[0][0]:.2f}")