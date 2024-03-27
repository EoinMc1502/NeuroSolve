import sys
import pandas as pd
from joblib import load
from sklearn.preprocessing import MultiLabelBinarizer

# Load the model and necessary transformers
model = load('neurological_disorder_classifier_1.1.joblib')
mlb_symptoms = load('neurological_disorder_mlb_symptoms_1.1.joblib')
mlb_age_male = load('neurological_disorder_mlb_age_male_1.1.joblib')
mlb_age_female = load('neurological_disorder_mlb_age_female_1.1.joblib')
label_encoder = load('neurological_disorder_label_encoder_1.1.joblib')

# Example user input
# This would be replaced by actual data passed to the script
user_input_symptoms = sys.argv[1]  # Expected format: '1,2,3,4'
user_input_age = int(sys.argv[2])
user_input_gender = sys.argv[3]  # 'Male' or 'Female'

# Transform symptoms input into the format expected by the model
symptoms_list = list(map(int, user_input_symptoms.split(',')))
symptoms_binarized = mlb_symptoms.transform([symptoms_list])

# Prepare age and gender data
age_data = [[user_input_age]]
age_binarized_male = mlb_age_male.transform(age_data) if user_input_gender == 'Male' else mlb_age_male.transform([[0]])  # Dummy data for females
age_binarized_female = mlb_age_female.transform(age_data) if user_input_gender == 'Female' else mlb_age_female.transform([[0]])  # Dummy data for males

# Combine all features
features = pd.concat([pd.DataFrame(symptoms_binarized), pd.DataFrame(age_binarized_male), pd.DataFrame(age_binarized_female)], axis=1)

# Make a prediction
prediction = model.predict(features)
predicted_label = label_encoder.inverse_transform(prediction)

print(f"Predicted Disorder: {predicted_label[0]}")


