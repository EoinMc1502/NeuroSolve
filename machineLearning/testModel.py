import unittest
import pandas as pd
import numpy as np
from joblib import load

class TestNeurologicalDisorderClassifier(unittest.TestCase):
    def test_model_prediction(self):
        # Basic test data based on specific cases from the Neurological_Disorder table
        test_data = {
            'Symptoms': ['1,2,3,4,5,6,7,8,9,10', '13,14,1,2,3,7,15,16', '18,19,20,21,22,23,4,8,9,24,25,26'],
            'Potential_Symptoms': ['11,12', '9,8,17', '27,28,14,5'],
            'Age_Distribution_Ranges_Male': ['4,5,6,7', '4,5,6,7', '1,2,3,4,9'],
            'Age_Distribution_Ranges_Female': ['4,5,6,7,8', '4,5,6,7,8', '1,2,3,4,9'],
            'Name': ['Migraines', 'Migraines with Aura', 'Epilepsy']
        }

        test_df = pd.DataFrame(test_data)

        # Load model and encoders
        mlb_symptoms = load('neurological_disorder_mlb_symptoms_1.1.joblib')
        mlb_age_female = load('neurological_disorder_mlb_age_female_1.1.joblib')
        mlb_age_male = load('neurological_disorder_mlb_age_male_1.1.joblib')
        label_encoder = load('neurological_disorder_label_encoder_1.1.joblib')
        model = load('neurological_disorder_classifier_1.1.joblib')

        # Preprocess test data and prepare features
        combined_symptoms = test_df['Symptoms'] + ',' + test_df['Potential_Symptoms']
        combined_symptoms = combined_symptoms.str.replace(',,', ',').str.strip(',')
        combined_symptoms = combined_symptoms.apply(lambda x: list(map(int, x.split(','))))

        age_distribution_male = test_df['Age_Distribution_Ranges_Male'].apply(lambda x: [int(i) for i in x.split(',') if x])
        age_distribution_female = test_df['Age_Distribution_Ranges_Female'].apply(lambda x: [int(i) for i in x.split(',') if x])

        symptoms_encoded = mlb_symptoms.transform(combined_symptoms)
        age_male_encoded = mlb_age_male.transform(age_distribution_male)
        age_female_encoded = mlb_age_female.transform(age_distribution_female)

        all_features = pd.concat([
            pd.DataFrame(symptoms_encoded, columns=[str(x) for x in mlb_symptoms.classes_]),
            pd.DataFrame(age_male_encoded, columns=['Male_Age_' + str(i+1) for i in range(len(mlb_age_male.classes_))]),  # Starting index from 1
            pd.DataFrame(age_female_encoded, columns=['Female_Age_' + str(i+1) for i in range(len(mlb_age_female.classes_))])  # Starting index from 1
        ], axis=1)

        # checks all feature names are strings to satisfy scikit-learn's requirements
        all_features.columns = [str(col) for col in all_features.columns]

        # Predict using the model
        predictions = model.predict(all_features)
        decoded_predictions = label_encoder.inverse_transform(predictions)

        # check predictions match expected labels
        expected_labels = test_df['Name'].values
        self.assertListEqual(list(decoded_predictions), list(expected_labels),
                             msg="Predictions do not match expected labels.")

if __name__ == '__main__':
    unittest.main()
