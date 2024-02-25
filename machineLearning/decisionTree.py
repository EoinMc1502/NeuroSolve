import pyodbc
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier
from sklearn.metrics import accuracy_score

# Database connection parameters
server = 'eoinmcnamee.database.windows.net'
database = 'NeurologicalDiagnosisSystem'
username = 'emcnamee08'
password = 'Mcnamee1502'
driver= '{ODBC Driver 17 for SQL Server}'  # Adjust as necessary

# Establishing connection to the database
cnxn = pyodbc.connect('DRIVER=' + driver + ';SERVER=' + server + ';PORT=1433;DATABASE=' + database + ';UID=' + username + ';PWD=' + password)

# Fetching disorder data
disorder_query = "SELECT * FROM Neurological_Disorders"
disorders = pd.read_sql(disorder_query, cnxn)

# Fetching symptom names
symptom_query = "SELECT * FROM Symptoms"
symptoms = pd.read_sql(symptom_query, cnxn)

age_range_query = "SELECT * FROM AgeRanges"
age_range = pd.read_sql(age_range_query, cnxn)

# family_members_query = "SELECT * FROM FamilyMembers"
# family_members = pd.read_sql(family_members_query, cnxn)

cnxn.close()

# Create a dictionary to map symptom IDs to symptom names
symptom_dict = dict(zip(symptoms['ID'], symptoms['Name']))

# Initialize columns for each symptom in the disorders DataFrame
for symptom_id in symptom_dict.keys():
    disorders[symptom_dict[symptom_id]] = 0

# Update disorders DataFrame with binary symptom data
for index, row in disorders.iterrows():
    symptom_ids = str(row['Symptoms']).split(',')
    for symptom_id in symptom_ids:
        if symptom_id:  # Check if symptom_id is not empty
            symptom_name = symptom_dict.get(int(symptom_id))
            if symptom_name:  # Check if the symptom ID exists in the symptom_dict
                disorders.at[index, symptom_name] = 1

# Dropping columns not needed for the model
disorders.drop(['ID', 'Symptoms', 'Specific_Symptoms'], axis=1, inplace=True)

# Machine learning model preparation
X = disorders.drop('DisorderName', axis=1)  # Features
y = disorders['DisorderName']  # Target variable

# Splitting the dataset
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Decision tree model training
clf = DecisionTreeClassifier(random_state=42)
clf.fit(X_train, y_train)

# Predicting and evaluating the model
predictions = clf.predict(X_test)
accuracy = accuracy_score(y_test, predictions)
print(f'Accuracy: {accuracy}')
