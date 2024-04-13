import pandas as pd
import pyodbc
from sklearn.preprocessing import MultiLabelBinarizer, LabelEncoder
from sklearn.model_selection import GridSearchCV, LeaveOneOut, train_test_split, cross_val_score
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, f1_score, precision_score, recall_score
from sklearn.tree import export_graphviz
from imblearn.over_sampling import SMOTE
from sqlalchemy import create_engine
import os
import matplotlib.pyplot as plt
import seaborn as sns
from joblib import dump
import traceback
from dotenv import load_dotenv

try:
    # Database connection setup
    DB_SERVER = os.getenv("DB_SERVER")
    DB_DATABASE = os.getenv("DB_DATABASE")
    DB_USERNAME = os.getenv("DB_USERNAME")
    DB_PASSWORD = os.getenv("DB_PASSWORD")
    DB_DRIVER = os.getenv("DB_DRIVER")

    # Create the connection string for SQLAlchemy
    connection_string = f"mssql+pyodbc://{DB_USERNAME}:{DB_PASSWORD}@{DB_SERVER}/{DB_DATABASE}?driver={DB_DRIVER}"
    engine = create_engine(connection_string)
    print("Database connection established.\n")

    # Execute SQL queries to fetch data
    neurological_disorders_query = "SELECT ID, Name, Symptoms, Potential_Symptoms, Age_Distribution_Ranges_Male, Age_Distribution_Ranges_Female, Percentage_Of_Diagnoses_Male, Percentage_Of_Diagnoses_Female FROM Neurological_Disorders"
    neurological_disorders_df = pd.read_sql_query(neurological_disorders_query, engine)
    print("Neurological Disorders DataFrame loaded:")
    print(neurological_disorders_df.head(), "\n")

    symptoms_query = "SELECT ID, Name FROM Symptoms"
    symptoms_df = pd.read_sql_query(symptoms_query, engine)
    print("Symptoms DataFrame loaded:")
    print(symptoms_df.head(), "\n")

    # Concatenate Symptoms and Potential_Symptoms
    neurological_disorders_df['Combined_Symptoms'] = neurological_disorders_df['Symptoms'].str.cat(neurological_disorders_df['Potential_Symptoms'].fillna(''), sep=',')
    # Remove any duplicate commas and leading/trailing commas
    neurological_disorders_df['Combined_Symptoms'] = neurological_disorders_df['Combined_Symptoms'].str.replace(',,', ',').str.strip(',')

    # Print out some rows to verify concatenation
    print("Concatenated Symptoms and Potential Symptoms:")
    print(neurological_disorders_df[['Symptoms', 'Potential_Symptoms', 'Combined_Symptoms']].head(), "\n")

    # Preprocessing data
    neurological_disorders_df['Combined_Symptoms'] = neurological_disorders_df['Combined_Symptoms'].apply(lambda x: list(map(int, x.split(','))))
    print("Combine_Symptoms column in Neurological Disorders DataFrame preprocessed:")
    print(neurological_disorders_df[['ID', 'Name', 'Combined_Symptoms']].head(), "\n")

    neurological_disorders_df['Percentage_Of_Diagnoses_Male'] = neurological_disorders_df['Percentage_Of_Diagnoses_Male'].astype(float) / 100.0
    neurological_disorders_df['Percentage_Of_Diagnoses_Female'] = neurological_disorders_df['Percentage_Of_Diagnoses_Female'].astype(float) / 100.0
    print("Percentage columns in Neurological Disorders DataFrame converted to fractions:")
    print(neurological_disorders_df[['ID', 'Name', 'Percentage_Of_Diagnoses_Male', 'Percentage_Of_Diagnoses_Female']].head(), "\n")

    # Convert age distribution ranges from strings to list of integers
    neurological_disorders_df['Age_Distribution_Ranges_Male'] = neurological_disorders_df['Age_Distribution_Ranges_Male'].apply(lambda x: [int(i) for i in x.split(',')] if x else [])
    neurological_disorders_df['Age_Distribution_Ranges_Female'] = neurological_disorders_df['Age_Distribution_Ranges_Female'].apply(lambda x: [int(i) for i in x.split(',')] if x else [])
    print("Age distribution ranges preprocessed:")
    print(neurological_disorders_df[['ID', 'Name', 'Age_Distribution_Ranges_Male', 'Age_Distribution_Ranges_Female']].head(), "\n")

    # Initialize MultiLabelBinarizer and transform 'Symptoms' into a binary matrix
    mlb = MultiLabelBinarizer()
    symptom_matrix = mlb.fit_transform(neurological_disorders_df['Combined_Symptoms'])
    symptom_features_df = pd.DataFrame(symptom_matrix, columns=mlb.classes_.astype(str))
    print("Combined_Symptoms encoded into binary matrix:")
    print(symptom_features_df.head(), "\n")

    # Integrating age distribution ranges into the feature set
    mlb_age_male = MultiLabelBinarizer()
    age_distribution_male_matrix = mlb_age_male.fit_transform(neurological_disorders_df['Age_Distribution_Ranges_Male'])
    age_distribution_male_df = pd.DataFrame(age_distribution_male_matrix, columns=['Male_Age_' + str(i) for i in mlb_age_male.classes_])

    mlb_age_female = MultiLabelBinarizer()
    age_distribution_female_matrix = mlb_age_female.fit_transform(neurological_disorders_df['Age_Distribution_Ranges_Female'])
    age_distribution_female_df = pd.DataFrame(age_distribution_female_matrix, columns=['Female_Age_' + str(i) for i in mlb_age_female.classes_])

    # Combining all features
    all_features_df = pd.concat([symptom_features_df, age_distribution_male_df, age_distribution_female_df], axis=1)
    print("All feature names in the model:", all_features_df.columns.tolist())
    print("All features combined:")
    print(all_features_df.head(), "\n")

    # Label encoding for diseases
    le = LabelEncoder()
    y = le.fit_transform(neurological_disorders_df['Name'])

    # Initialize LeaveOneOut
    loo = LeaveOneOut()

    # Variable to store the aggregated classification report
    classification_reports = []

    # SMOTE to address class imbalance
    smote = SMOTE(random_state=42)
    X_resampled, y_resampled = smote.fit_resample(all_features_df, y)
    print("Applied SMOTE to address class imbalance in training data.")

    # Hyperparameter tuning setup
    param_grid = {
        'n_estimators': [50, 100, 200],
        'max_depth': [None, 10, 20],
        'min_samples_split': [2, 5],
        'min_samples_leaf': [1, 2]
    }

    # Create a RandomForestClassifier object
    rf = RandomForestClassifier(random_state=42)

    # Create a GridSearchCV object
    grid_search = GridSearchCV(estimator=rf, param_grid=param_grid, cv=loo, scoring='f1_weighted', verbose=2, n_jobs=-1)

    # Fit the GridSearchCV object to the data
    grid_search.fit(X_resampled, y_resampled)

    # Extracting the best estimator
    best_rf = grid_search.best_estimator_

    # Predicting on the entire resampled set for classification report
    y_pred = best_rf.predict(X_resampled)

    # Generating the classification report
    report = classification_report(y_resampled, y_pred, output_dict=True, zero_division=0)
    classification_reports.append(report)

    # Calculate various performance metrics.
    accuracy = accuracy_score(y_resampled, y_pred)
    precision = precision_score(y_resampled, y_pred, average='weighted', zero_division=0)
    recall = recall_score(y_resampled, y_pred, average='weighted', zero_division=0)
    f1 = f1_score(y_resampled, y_pred, average='weighted', zero_division=0)

    # Print the performance metrics.
    print("Classification Report:\n", classification_report(y_resampled, y_pred, zero_division=0))
    print("Accuracy on Resampled Set:", accuracy)
    print("Precision on Resampled Set:", precision)
    print("Recall on Resampled Set:", recall)
    print("F1 Score on Resampled Set:", f1)


    # # Export the tree to a dot file for one of the trees in the forest
    # dot_file = 'tree.dot'
    # png_file = 'tree.png'
    # estimator = best_rf.estimators_[0]  # Take the first estimator from the forest
    # export_graphviz(estimator, out_file=dot_file, 
    #                 feature_names=all_features_df.columns,
    #                 class_names=le.inverse_transform(range(len(le.classes_))),
    #                 rounded=True, proportion=False, 
    #                 precision=2, filled=True)

    # # Check if Graphviz is installed and add it to the PATH
    # # This is necessary for the 'dot' command to work
    # os.environ["PATH"] += os.pathsep + 'path/to/graphviz/bin'

    # # Convert the dot file to PNG using the system command
    # try:
    #     from subprocess import call
    #     call(['dot', '-Tpng', dot_file, '-o', png_file, '-Gdpi=600'])
    #     print(f"The decision tree has been saved as {png_file}")
    # except Exception as e:
    #     print(f"An error occurred: {e}")

    # Calculate the average performance metrics across all LOO splits
    avg_precision = sum(d['weighted avg']['precision'] for d in classification_reports) / len(classification_reports)
    avg_recall = sum(d['weighted avg']['recall'] for d in classification_reports) / len(classification_reports)
    avg_f1 = sum(d['weighted avg']['f1-score'] for d in classification_reports) / len(classification_reports)

    # Print the average performance metrics
    print(f"Average Precision: {avg_precision:.2f}")
    print(f"Average Recall: {avg_recall:.2f}")
    print(f"Average F1 Score: {avg_f1:.2f}")

    # Define the base directory for saving files
    base_directory = 'machineLearning'

    # Ensure the directory exists, create if it does not
    os.makedirs(base_directory, exist_ok=True)

    # Define the full paths for the files
    mlb_symptoms_filename = os.path.join(base_directory, 'neurological_disorder_mlb_symptoms_1.1.joblib')
    mlb_age_female_filename = os.path.join(base_directory, 'neurological_disorder_mlb_age_female_1.1.joblib')
    mlb_age_male_filename = os.path.join(base_directory, 'neurological_disorder_mlb_age_male_1.1.joblib')
    label_encoder_filename = os.path.join(base_directory, 'neurological_disorder_label_encoder_1.1.joblib')
    model_filename = os.path.join(base_directory, 'neurological_disorder_classifier_1.1.joblib')

    # Save the MultiLabelBinarizer instance
    dump(mlb, mlb_symptoms_filename)
    print("Symptoms MultiLabelBinarizer instance saved.")

    # Save the Age Female MultiLabelBinarizer instance
    dump(mlb_age_female, mlb_age_female_filename)
    print("Age Female MultiLabelBinarizer instance saved.")

    # Save the Age Male MultiLabelBinarizer instance
    dump(mlb_age_male, mlb_age_male_filename)
    print("Age Male MultiLabelBinarizer instance saved.")

    # Save the LabelEncoder instance
    dump(le, label_encoder_filename)
    print(f"LabelEncoder instance saved as {label_encoder_filename}")

    # Save the RandomForestClassifier model
    dump(best_rf, model_filename)
    print(f"Model saved as {model_filename}")

except Exception as e:
    print("An unexpected error occurred:")
    print(e)
    traceback.print_exc()  # This will print the stack trace to help identify where the error occurred.
