from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier
from sklearn.metrics import accuracy_score
import pandas as pd

# Assuming `data` is your DataFrame with the variables and diagnosis
X = data[['age', 'gender_encoded', 'symptoms_encoded', 'family_history_encoded']]  # Input features
y = data['disorder']  # Target variable

# Splitting the dataset into training and testing set
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Creating the decision tree classifier and fitting it to the training data
clf = DecisionTreeClassifier()
clf.fit(X_train, y_train)

# Making predictions and evaluating the model
predictions = clf.predict(X_test)
print("Accuracy:", accuracy_score(y_test, predictions))