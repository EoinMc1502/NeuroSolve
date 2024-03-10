import pyodbc
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier, plot_tree
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, confusion_matrix
from imblearn.over_sampling import SMOTE  # Handle imbalanced data
from sklearn.preprocessing import StandardScaler  # Feature scaling
# Visualization imports
import matplotlib.pyplot as plt
from sklearn.tree import export_graphviz
import graphviz

# Database connection parameters
server = 'eoinmcnamee.database.windows.net'
database = 'NeurologicalDiagnosisSystem'
username = 'emcnamee08'
password = 'Mcnamee1502'
driver= '{ODBC Driver 17 for SQL Server}'

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
        if symptom_id:
            symptom_name = symptom_dict.get(int(symptom_id))
            if symptom_name:
                disorders.at[index, symptom_name] = 1

# Dropping columns not needed for the model and assuming age is already a part of the DataFrame
disorders.drop(['ID', 'Symptoms', 'Specific_Symptoms'], axis=1, inplace=True)

# Assuming 'Age' is a column in your DataFrame, applying feature scaling
scaler = StandardScaler()
disorders['Age_Scaled'] = scaler.fit_transform(disorders[['Age']])  # Ensure 'Age' is in your DataFrame

# Machine learning model preparation
X = disorders.drop('DisorderName', axis=1)  # Features, now including 'Age_Scaled'
y = disorders['DisorderName']  # Target variable

# Handling imbalanced data with SMOTE
smote = SMOTE(random_state=42)
X_resampled, y_resampled = smote.fit_resample(X, y)

# Splitting the dataset
X_train, X_test, y_train, y_test = train_test_split(X_resampled, y_resampled, test_size=0.2, random_state=42)

# Decision tree model training
clf = DecisionTreeClassifier(random_state=42)
clf.fit(X_train, y_train)

# Predicting and evaluating the model with additional metrics
predictions = clf.predict(X_test)
accuracy = accuracy_score(y_test, predictions)
precision, recall, fscore, _ = precision_recall_fscore_support(y_test, predictions, average='weighted')
conf_matrix = confusion_matrix(y_test, predictions)

print(f'Accuracy: {accuracy}')
print(f'Precision: {precision}')
print(f'Recall: {recall}')
print(f'F-Score: {fscore}')
print(f'Confusion Matrix:\n{conf_matrix}')

# Decision tree visualization with plot_tree (simple method)
plt.figure(figsize=(20,10))  # Set the figure size (optional)
plot_tree(clf, filled=True, rounded=True, class_names=y.unique(), feature_names=X.columns)
plt.show()

# Alternatively, for a more detailed visualization using Graphviz
dot_data = export_graphviz(clf, out_file=None, 
                           feature_names=X.columns,  
                           class_names=y.unique(),  
                           filled=True, rounded=True, 
                           special_characters=True)  
graph = graphviz.Source(dot_data)  
graph.render("decision_tree")  # This saves the tree visualization to a file
