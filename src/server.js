const express = require('express');
const sql = require('mssql');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

app.use(bodyParser.json());

// Adding CORS support
const cors = require('cors');
app.use(cors());

// Database configuration
const config = {
    user: 'emcnamee08',
    password: 'Mcnamee1502',
    server: 'eoinmcnamee.database.windows.net', 
    database: 'NeurologicalDiagnosisSystem',
    options: {
        encrypt: true, 
        trustServerCertificate: true 
    }
};

// Connect to your database
sql.connect(config, function (err) {
    if (err) {
        console.error('Error connecting to the database:', err);
        return;
    }
    console.log('Connected to the database successfully');
});

app.get('/symptoms', (req, res) => {
    //console.log("Fetching symptoms from the database...");
    const request = new sql.Request();
    request.query('SELECT * FROM Symptoms', (err, result) => {
        if (err) {
            console.error('Error fetching symptoms from database:', err);
            res.status(500).send('Error fetching symptoms');
            return;
        }
        //console.log('Symptoms fetched successfully:', result.recordset);
        res.json(result.recordset);
    });
});

app.get('/FamilyMembers', (req, res) => {
    console.log("Fetching FamilyMembers from the database...");
    const request = new sql.Request();
    request.query('SELECT * FROM FamilyMembers', (err, result) => {
        if (err) {
            console.error('Error fetching FamilyMembers from database:', err);
            res.status(500).send('Error fetching FamilyMembers');
            return;
        }
        console.log('FamilyMembers fetched successfully:', result.recordset);
        res.json(result.recordset);
    });
});

app.get('/Disorders', (req, res) => {
    console.log("Fetching Disorders from the database...");
    const request = new sql.Request();
    request.query('SELECT ID, Name FROM Neurological_Disorders', (err, result) => {
        if (err) {
            console.error('Error fetching Disorders from database:', err);
            res.status(500).send('Error fetching Disorders');
            return;
        }
        console.log('Disorders fetched successfully:', result.recordset);
        res.json(result.recordset);
    });
});

// Endpoint to handle form submission
app.post('/submit-form', async (req, res) => {
    console.log('Received form submission:', req.body);
    
    const symptomsArray = req.body.symptoms;
    let symptomsString = '';

    // Check if symptomsArray is indeed an array and not undefined or a single value
    if (Array.isArray(symptomsArray)) {
        // Join the array elements into a single string separated by commas
        symptomsString = symptomsArray.join(',');
    } else if (symptomsArray) {
        // Handle the case where only one symptom is selected
        symptomsString = symptomsArray;
    }

    const totalPatientSymptoms = symptomsArray.length;
    console.log('Concatenated Symptoms IDs:', symptomsString);
    console.log('Total Patient Symptoms:', totalPatientSymptoms);

    try {
        const request = new sql.Request();
        const { patientTitle, patientFirstName, patientLastName, streetAddress, city, state, postalCode, biologicalSex, country, familyHistory, age } = req.body;

        let formattedDateOfBirth;
        if (req.body.dateOfBirth && !isNaN(new Date(req.body.dateOfBirth).getTime())) {
            formattedDateOfBirth = new Date(req.body.dateOfBirth).toISOString().split('T')[0];
        } else {
            formattedDateOfBirth = null; 
            console.log('Invalid or missing dateOfBirth. Set to null.');
        }

        // Declare and assign all variables for the SQL query
        request.input('Title', sql.VarChar, patientTitle);
        request.input('First_Name', sql.VarChar, patientFirstName);
        request.input('Last_Name', sql.VarChar, patientLastName);
        request.input('Street_Address', sql.VarChar, streetAddress);
        request.input('City', sql.VarChar, city);
        request.input('State', sql.VarChar, state);
        request.input('Postcode', sql.VarChar, postalCode);
        request.input('Country', sql.VarChar, country);
        request.input('DOB', sql.Date, formattedDateOfBirth);
        request.input('Family_History', sql.VarChar, familyHistory);
        request.input('Symptoms', sql.VarChar, symptomsString);
        request.input('BiologicalSex', sql.VarChar, biologicalSex);
        request.input('Age', sql.Int, age);


        const patientInsertQuery = `INSERT INTO PatientData (Title, First_Name, Last_Name, Street_Address, City, State, Postcode, Country, DOB, Family_History, Symptoms, Biological_Sex, Age) VALUES (@Title, @First_Name, @Last_Name, @Street_Address, @City, @State, @Postcode, @Country, @DOB, @Family_History, @Symptoms, @BiologicalSex, @Age)`;
        await request.query(patientInsertQuery);

        // Assuming you have a SQL query ready for comparing disorders and symptoms
        const disordersQuery = `
            DECLARE @totalPatientSymptoms INT = ${totalPatientSymptoms};
            SELECT ID, Name, MatchingSymptoms
            FROM (
                SELECT ID, Name, Symptoms,
                    (
                        SELECT COUNT(*)
                        FROM STRING_SPLIT(Symptoms, ',') AS splitSymptoms
                        WHERE splitSymptoms.value IN (
                            SELECT value
                            FROM STRING_SPLIT(@symptomsString, ',')
                        )
                    ) AS MatchingSymptoms,
                    @totalPatientSymptoms AS TotalPatientSymptoms
                FROM Neurological_Disorders
            ) AS Subquery
            WHERE (CAST(MatchingSymptoms AS FLOAT) / CAST(@totalPatientSymptoms AS FLOAT)) >= 0.25
            ORDER BY MatchingSymptoms DESC`;

        const disordersResult = await request.input('symptomsString', sql.VarChar, symptomsString)
            .query(disordersQuery);

        // Aggregate results and send response
        res.json({
            patientInsertionResult: "Patient data saved successfully.",
            disordersComparisonResult: disordersResult.recordset
        });
    } catch (err) {
        console.error('Error:', err);
        res.status(500).send('Server error');
    }
});


const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
