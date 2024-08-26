import schedule
import time
import subprocess
import os
import sqlalchemy as sa
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
from sqlalchemy import text

# Load environment variables from a .env file
load_dotenv()

def run_script():
    print("Running scheduled script...")
    try:
        # checks and update the database before running the Python script
        venv_dir = os.path.dirname(os.path.abspath(__file__))
        check_and_update_database(venv_dir)

        # path to the virtual environment's Python interpreter
        python_interpreter = os.path.join(venv_dir, "bin", "python3")
        
        # path to the decisionTree.py script
        script_path = os.path.join(venv_dir, "decisionTree.py")
        
        # Execute the decisionTree.py script within the virtual environment
        completed_process = subprocess.run(
            [python_interpreter, script_path],
            check=True,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE)
        
        # Print stdout and stderr from the subprocess
        print("Output:", completed_process.stdout)
        print("Errors:", completed_process.stderr)
    except subprocess.CalledProcessError as e:
        print(f"Failed to run script with error: {e}")
        print(f"Return code: {e.returncode}")
        print(f"Output: {e.stdout}")
        print(f"Errors: {e.stderr}")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

def check_and_update_database(venv_dir):
    import sqlalchemy as sa
    from sqlalchemy.orm import sessionmaker
    import os

    # Database connection setup
    DB_SERVER = os.getenv("DB_SERVER")
    DB_DATABASE = os.getenv("DB_DATABASE")
    DB_USERNAME = os.getenv("DB_USERNAME")
    DB_PASSWORD = os.getenv("DB_PASSWORD")
    DB_DRIVER = os.getenv("DB_DRIVER")
    
    # connection string for SQLAlchemy
    connection_string = f"mssql+pyodbc://{DB_USERNAME}:{DB_PASSWORD}@{DB_SERVER}/{DB_DATABASE}?driver={DB_DRIVER}"
    engine = sa.create_engine(connection_string)
    Session = sessionmaker(bind=engine)
    session = Session()
    print("Database connection established.\n")

    symptomsUpdatedCount = 0 

    try:
        session.begin()
        disorders = session.execute(text("""
            SELECT Name, New_Symptoms 
            FROM Neurological_Disorders 
            WHERE New_Symptoms IS NOT NULL AND New_Symptoms != ''
        """)).fetchall()

        for disorder_Name, new_symptoms in disorders:
            symptoms_ids = new_symptoms.split(',')
            for symptom_id in symptoms_ids:
                patient_data = session.execute(text("""
                    SELECT PatientID FROM PatientData
                    WHERE Diagnosis = :disorder_Name AND INSTR(NewSymptoms, :symptom_id) > 0
                """, {'disorder_Name': disorder_Name, 'symptom_id': symptom_id})).fetchall()

                if len(patient_data) >= 3:
                    result = session.execute(text("""
                        INSERT INTO Symptoms (Name)
                        SELECT Name FROM NewSymptoms WHERE ID = :symptom_id;
                        SELECT SCOPE_IDENTITY() AS NewID;
                    """, {'symptom_id': symptom_id}))
                    new_symptom_id = result.scalar()
                    session.execute(text("DELETE FROM NewSymptoms WHERE ID = :symptom_id", {'symptom_id': symptom_id}))
                    session.execute(text("""
                        UPDATE Neurological_Disorders
                        SET New_Symptoms = REPLACE(New_Symptoms, :symptom_id_str, ''),
                            Potential_Symptoms = CONCAT(Potential_Symptoms, ',', :new_symptom_id)
                        WHERE Name = :disorder_Name
                    """, {'symptom_id_str': symptom_id + ',', 'new_symptom_id': new_symptom_id, 'disorder_Name': disorder_Name}))
                    symptomsUpdatedCount += 1

                    for patient in patient_data:
                        session.execute(text("""
                            UPDATE PatientData
                            SET NewSymptoms = REPLACE(NewSymptoms, :symptom_id_str, ''),
                                Symptoms = CONCAT(Symptoms, ',', :new_symptom_id)
                            WHERE PatientID = :patient_id
                        """, {'symptom_id_str': symptom_id + ',', 'new_symptom_id': new_symptom_id, 'patient_id': patient.PatientID}))

        session.commit()
        print(f"Total updates made: {symptomsUpdatedCount}")

    except Exception as e:
        session.rollback()
        print(f"Database error: {e}")
    finally:
        session.close()

if __name__ == '__main__':
    schedule.every(5).minutes.do(run_script)

    while True:
        schedule.run_pending()
        time.sleep(1)
