import sys
import pandas as pd
import numpy as np
import json
import warnings
from joblib import load
import shap
import logging

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Suppress specific warnings from pandas and sklearn
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning, message="X does not have valid feature names, but")

# Defines age bins based on the database table data for age ranges
age_bins = [(0, 2), (3, 5), (6, 12), (13, 17), (18, 24), (25, 34), (35, 49), (50, 64), (65, 120)]

def get_age_bin_index(age):
    for index, (start_age, end_age) in enumerate(age_bins):
        if start_age <= age <= end_age:
            return index
    return -1

try:
    # Load models and MLB's and label encoder 
    model = load('machineLearning/neurological_disorder_classifier_1.1.joblib')
    mlb_symptoms = load('machineLearning/neurological_disorder_mlb_symptoms_1.1.joblib')
    mlb_age_male = load('machineLearning/neurological_disorder_mlb_age_male_1.1.joblib')
    mlb_age_female = load('machineLearning/neurological_disorder_mlb_age_female_1.1.joblib')
    label_encoder = load('machineLearning/neurological_disorder_label_encoder_1.1.joblib')
except Exception as e:
    logging.error("Failed to load models or transformers: %s", e)
    sys.exit(1)

def prepare_input(symptoms_input, age_input, gender_input):# preprocessing inputs from user 
    try:
        symptoms_list = list(map(int, symptoms_input.split(',')))
        symptoms_binarized = mlb_symptoms.transform([symptoms_list])
        age_bin_index = get_age_bin_index(age_input)
        age_binarized_male = np.zeros((1, len(age_bins)))
        age_binarized_female = np.zeros((1, len(age_bins)))
        if gender_input.lower() == 'male':
            age_binarized_male[0, age_bin_index] = 1
        else:
            age_binarized_female[0, age_bin_index] = 1
        features = pd.concat([
            pd.DataFrame(symptoms_binarized, columns=mlb_symptoms.classes_.astype(str)),
            pd.DataFrame(age_binarized_male, columns=['Male_Age_' + str(i + 1) for i in range(len(age_bins))]),
            pd.DataFrame(age_binarized_female, columns=['Female_Age_' + str(i + 1) for i in range(len(age_bins))])
        ], axis=1)
        return features
    except Exception as e:
        logging.error("Error preparing input data: %s", e)
        raise

def explain_with_shap(features, model):#gives insight into feature importance fro the diagnosis the model predicted
    try:
        explainer = shap.TreeExplainer(model)
        shap_values = explainer.shap_values(features)
        mean_shap_values = np.mean([np.abs(sv) for sv in shap_values], axis=0)[0]
        shap_data = [{"feature": feature, "shap_value": float(value)} for feature, value in zip(features.columns, mean_shap_values) if float(value) > 0.0]
        shap_data_sorted = sorted(shap_data, key=lambda x: x["shap_value"], reverse=True)
        return shap_data_sorted
    except Exception as e:
        logging.error("Error explaining with SHAP: %s", e)
        raise

def predict_and_explain(symptoms_input, age_input, gender_input):#predicts the disorder for the user based on their input
    try:
        features = prepare_input(symptoms_input, age_input, gender_input)
        prediction = model.predict(features)
        predicted_label = label_encoder.inverse_transform(prediction)[0]
        shap_explanation = explain_with_shap(features, model)
        personalized_explanation = [{"feature": item["feature"], "effect": round(item["shap_value"], 2)} for item in shap_explanation]
        output = {
            'prediction': predicted_label,
            'reasoning': personalized_explanation
        }
        print(json.dumps(output, indent=2))
    except Exception as e:
        logging.error("Error in prediction or explanation: %s", e)
        print(json.dumps({"error": str(e)}, indent=2), file=sys.stderr)

if __name__ == "__main__":
    if len(sys.argv) > 3:# handles the user inputs
        symptoms_input = sys.argv[1]
        age_input = int(sys.argv[2])
        gender_input = sys.argv[3]
        predict_and_explain(symptoms_input, age_input, gender_input)
    else:
        logging.error("Insufficient arguments provided to script.")
        sys.exit(1)

