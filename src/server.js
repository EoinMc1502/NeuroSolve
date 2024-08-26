const express = require('express');
const sql = require('mssql');
const bodyParser = require('body-parser');
const { exec } = require("child_process"); 
require('dotenv').config();
const { OpenAI } = require('openai');
const https = require('https');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');




const openai = new OpenAI(process.env.OPENAI_API_KEY);
// Secret key for JWT signing
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser()); // necessary to parse cookies attached to requests


const corsOptions = {
    origin: function (origin, callback) {
        //console.log("Incoming origin:", origin);
        const allowedOrigins = [
            'http://127.0.0.1:5500',
            'http://localhost:3000',
            'http://127.0.0.1:5500/src/home.html',
            'http://127.0.0.1:5500/src/SignUpLogin.html',
            'http://127.0.0.1:5500/src/Main.html'
        ]; // Add more origins as needed

        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            //console.log("Origin allowed:", origin);
            callback(null, true); // Allow CORS
        } else {
            console.log("CORS not allowed for:", origin);
            callback(new Error('CORS Not allowed')); // 
        }
    },
    credentials: true // needed for cookies with CORS requests
};



// Adding CORS support
const cors = require('cors');
app.use(cors(corsOptions));
app.use(express.static(path.join(__dirname, 'src')));



// Database configuration
const config = {
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

// email configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.NEURO_EMAIL,
        pass: process.env.NEURO_EMAIL_PASSWORD
    }
});


// Middleware to verify JWT token in HttpOnly Cookie
function authenticateToken(req, res, next) {
    //console.log("Attempting to authenticate token...");
    
    // tries to get the token from cookies
    const token = req.cookies.token;
    if (token == null) {
        console.log("No token provided, sending 401 response");
        console.log("Cookies:", req.cookies); 

        return res.sendStatus(401); // if no token, return Unauthorized to frontend
    }

    console.log("Token found, verifying:", token);
    
    jwt.verify(token, process.env.JWT_SECRET_KEY, (err, user) => {
        if (err) {
            console.log("Token verification failed:", err);
            return res.sendStatus(403); // if token is not valid, return Forbidden to frontend 
        }
        console.log("Token verified successfully. User details:", user);
        req.user = user; // Add the user to request
        next(); // goes on to the next route handler
    });
}




app.post('/send-email', authenticateToken,  async (req, res) => {
    const { email, message } = req.body;

    const mailOptions = {
        from: 'neurosolvepredictions@gmail.com',
        to: email,
        subject: 'Information from Neuro Solve',
        html: message
    };

    try {
        await transporter.sendMail(mailOptions);
        //console.log('Email sent successfully to:', email);
        res.send('Email sent successfully.');
    } catch (error) {
        //console.error('Failed to send email:', error);
        res.status(500).send('Error sending email.');
    };
});


const pool = new sql.ConnectionPool({
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER, 
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true, 
        trustServerCertificate: true // used for https local certificate
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
});

pool.connect(err => {
    if(err) {
        //console.error('Error connecting to the database:', err);
    }
});


app.get('/verify-token', authenticateToken, (req, res) => {
    // If this runs, token is valid
    res.json({ verified: true });
});


app.post('/signup', async (req, res) => {
    const { email, password } = req.body;

    try {
        //console.log(`Checking for existing user with email: ${email}`);
        
        const checkQuery = `SELECT * FROM Users WHERE Email = @Email`;
        const checkResult = await pool.request()
            .input('Email', sql.VarChar, email)
            .query(checkQuery);

        if (checkResult.recordset.length > 0) {
            //console.log(`Email already in use: ${email}`);
            return res.status(400).send('Email already in use.');
        }

        // Hash the password
        //console.log(`Hashing password for new user: ${email}`);
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Prep for the SQL query to insert the new user
        //console.log(`Inserting new user into the database: ${email}`);
        const insertQuery = `
            INSERT INTO Users (Email, PasswordHash, CreatedAt, UpdatedAt, IsActive, LastLogin, Role, FullName, MedicalFacility) 
            VALUES (@Email, @PasswordHash, @CreatedAt, @UpdatedAt, @IsActive, @LastLogin, @Role, @FullName, @MedicalFacility)
        `;
        await pool.request()
            .input('Email', sql.VarChar, email)
            .input('PasswordHash', sql.VarChar, hashedPassword)
            .input('CreatedAt', sql.DateTime, new Date())
            .input('UpdatedAt', sql.DateTime, new Date())
            .input('IsActive', sql.Bit, true)
            .input('LastLogin', sql.DateTime, null)
            .input('Role', sql.VarChar, 'user')
            .input('FullName', sql.VarChar, '')
            .input('MedicalFacility', sql.VarChar, '')
            .query(insertQuery);

        console.log(`Signup successful for: ${email}`);
        res.status(200).send('Signup successful');
    } catch (error) {
        console.error(`Signup error for ${email}:`, error);
        res.status(500).send('Error during signup');
    }
});



app.post('/doctor-signup', async (req, res) => {
    const { email, password, fullName, medicalFacility, accessCode } = req.body;


    if (accessCode !== process.env.ACCESS_CODE) {
        return res.status(403).send('Invalid access code.');
    }

    try {
        // Check if a user with the same email already exists
        const checkQuery = `SELECT * FROM Users WHERE Email = @Email`;
        const checkResult = await pool.request()
            .input('Email', sql.VarChar, email)
            .query(checkQuery);

        if (checkResult.recordset.length > 0) {
            // User with this email already exists
            return res.status(400).send('Email already in use.');
        }

        // Hash the password
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Preps SQL query to insert the new doctor user
        const insertQuery = `
            INSERT INTO Users (Email, PasswordHash, CreatedAt, UpdatedAt, IsActive, LastLogin, Role, FullName, MedicalFacility) 
            VALUES (@Email, @PasswordHash, @CreatedAt, @UpdatedAt, @IsActive, @LastLogin, @Role, @FullName, @MedicalFacility)
        `;

        await pool.request()
            .input('Email', sql.VarChar, email)
            .input('PasswordHash', sql.VarChar, hashedPassword)
            .input('CreatedAt', sql.DateTime, new Date())
            .input('UpdatedAt', sql.DateTime, new Date())
            .input('IsActive', sql.Bit, true)
            .input('LastLogin', sql.DateTime, null)
            .input('Role', sql.VarChar, 'doctor') 
            .input('FullName', sql.VarChar, fullName)
            .input('MedicalFacility', sql.VarChar, medicalFacility)
            .query(insertQuery);

        res.status(200).send('Doctor signup successful');
    } catch (error) {
        console.error('Doctor signup error:', error);
        res.status(500).send('Error during doctor signup');
    }
});




app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    //console.log("Current NODE_ENV:", process.env.NODE_ENV);

    // Find user by email
    const userQuery = `SELECT * FROM Users WHERE Email = @Email`;
    const user = await pool.request()
        .input('Email', sql.VarChar, email)
        .query(userQuery);

    if (user.recordset.length > 0) {
        const userRecord = user.recordset[0];
        // Verify password
        const validPassword = await bcrypt.compare(password, userRecord.PasswordHash);
        if (validPassword) {
            // Generate a token including users details
            const token = jwt.sign(
                { 
                    userId: userRecord.UserID, 
                    email: userRecord.Email,
                    role: userRecord.Role 
                },
                process.env.JWT_SECRET_KEY,
                { expiresIn: '24h' } // Token expires in 24 hours
            );

            // Set the token in an HTTPOnly cookie
            res.cookie('token', token, {
                httpOnly: true,
                secure: true,
                sameSite: 'None',
                maxAge: 24 * 60 * 60 * 1000 // 24 hours
            }).json({ message: "Login successful" });
        } else {
            res.status(400).send('Invalid password.');
        }
    } else {
        res.status(404).send('User not found.');
    }
});







app.get('/symptoms', (req, res) => {// gets symptoms from Symptoms amd NewSymptoms table

    const performQuery = (query) => {
        return new Promise((resolve, reject) => {
            const request = pool.request();
            request.query(query, (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result.recordset);
                }
            });
        });
    };

    Promise.all([
        performQuery('SELECT * FROM Symptoms'),
        performQuery('SELECT * FROM NewSymptoms')
    ]).then(results => {
        // Concatenate the results from both tables
        const allSymptoms = results[0].concat(results[1]);
        res.json(allSymptoms);
    }).catch(err => {
        // Handles any errors that occur during the query
        console.error('Error fetching symptoms from database:', err);
        res.status(500).send('Error fetching symptoms');
    });
});

app.get('/FamilyMembers', (req, res) => {//gets family members from database
    //console.log("Fetching FamilyMembers from the database...");
    const request = pool.request();
    request.query('SELECT * FROM FamilyMembers', (err, result) => {
        if (err) {
            console.error('Error fetching FamilyMembers from database:', err);
            res.status(500).send('Error fetching FamilyMembers');
            return;
        }
        //console.log('FamilyMembers fetched successfully:', result.recordset);
        res.json(result.recordset);
    });
});

app.get('/Disorders', (req, res) => {//gets disorders from database
    //console.log("Fetching Disorders from the database...");
    const request = pool.request();
    request.query('SELECT ID, Name FROM Neurological_Disorders', (err, result) => {
        if (err) {
            console.error('Error fetching Disorders from database:', err);
            res.status(500).send('Error fetching Disorders');
            return;
        }
        //console.log('Disorders fetched successfully:', result.recordset);
        res.json(result.recordset);
    });
});


app.get('/Doctors', (req, res) => {// gets doctors from database
    //console.log("Fetching Doctors from the database...");
    const request = pool.request();
    request.input('Role', sql.VarChar, 'doctor');
    request.query('SELECT UserID, FullName, MedicalFacility FROM Users WHERE role = @Role', (err, result) => {
        if (err) {
            console.error('Error fetching Users from database:', err);
            res.status(500).send('Error fetching Doctors');
            return;
        }
        //console.log('Doctors fetched successfully:', result.recordset);
        res.json(result.recordset);
    });
});




// Function to get symptom names from the database based on IDs
async function getSymptomNamesByIds(ids) {
    try {
        const query = `SELECT ID, Name FROM Symptoms WHERE ID IN (${ids.join(',')})`;
        const result = await pool.request().query(query);
        return result.recordset.reduce((acc, item) => {
            acc[item.ID] = item.Name;
            return acc;
        }, {});
    } catch (err) {
        console.error('Failed to execute query:', err);
        throw err;
    }
}

function callPythonScript(symptomsString, age, biologicalSex, callback) {// function to call the predictor.py file (Diagnoses Patient)
    const pythonExecutable = path.join(__dirname, '..', 'machineLearning', 'bin', 'python3');
    const scriptPath = path.join(__dirname, '..', 'machineLearning', 'predictor.py');
    const command = `${pythonExecutable} ${scriptPath} '${symptomsString}' ${age} '${biologicalSex}'`;

    exec(command, (error, stdout, stderr) => {
        if (error || stderr || !stdout.trim()) {
            console.error(`exec error: ${error}`, `stderr: ${stderr}`);
            return callback(`Error: ${error || stderr}`, null);
        }
        try {
            const result = JSON.parse(stdout.trim());
            callback(null, result);
        } catch (parseError) {
            console.error(`Error parsing Python script output: ${parseError}`);
            callback(`Error parsing output: ${parseError}`, null);
        }
    });
}


// Function to split symptom IDs into known and new symptoms
async function categorizeSymptoms(symptomIds) {
    try {
        let knownSymptomIds = [];
        let newSymptomIds = [];

        // Preps and runs the query to fetch known symptoms
        const queryKnown = `SELECT ID FROM Symptoms WHERE ID IN (${symptomIds.join(',')})`;
        const knownResults = await pool.request().query(queryKnown);
        knownSymptomIds = knownResults.recordset.map(record => record.ID);

        // Preps and runs the query to fetch new symptoms
        const queryNew = `SELECT ID FROM NewSymptoms WHERE ID IN (${symptomIds.join(',')})`;
        const newResults = await pool.request().query(queryNew);
        newSymptomIds = newResults.recordset.map(record => record.ID);

        // Convert arrays of IDs into strings
        const knownSymptoms = knownSymptomIds.join(',');
        const newSymptoms = newSymptomIds.join(',');

        return { knownSymptoms, newSymptoms };
    } catch (err) {
        console.error('Failed to categorize symptoms:', err);
        throw err;
    }
}


async function updateNewSymptomsForDisorder(disorderName, newSymptomsString) {// to find which new symptoms need to be added
    try {
        // Gets current new symptoms for the disorder by its name
        const query = `SELECT New_Symptoms FROM Neurological_Disorders WHERE Name = @DisorderName`;
        const result = await pool.request()
            .input('DisorderName', sql.VarChar, disorderName)
            .query(query);

        let currentNewSymptoms = result.recordset[0]?.NewSymptoms ? result.recordset[0].NewSymptoms.split(',') : [];
        let newSymptomIds = newSymptomsString.split(',').map(Number);

        // find which new symptoms need to be added
        let symptomsToAdd = newSymptomIds.filter(id => !currentNewSymptoms.includes(id));

        // If there are new symptoms to add, update the database
        if (symptomsToAdd.length > 0) {
            let updatedNewSymptoms = [...new Set([...currentNewSymptoms, ...symptomsToAdd])].join(',');
            const updateQuery = `UPDATE Neurological_Disorders SET New_Symptoms = @NewSymptoms WHERE Name = @DisorderName`;
            await pool.request()
                .input('NewSymptoms', sql.VarChar, updatedNewSymptoms)
                .input('DisorderName', sql.VarChar, disorderName)
                .query(updateQuery);
            console.log(`Updated NewSymptoms for Disorder '${disorderName}': ${updatedNewSymptoms}`);
        } else {
            console.log(`No new symptoms to add for Disorder '${disorderName}'.`);
        }

        return symptomsToAdd; // Returns the list of newly added symptoms
    } catch (err) {
        console.error('Failed to update new symptoms for disorder:', err);
        throw err;
    }
}



app.post('/submit-form', authenticateToken, async (req, res) => {// main endpoint for submitting form information, calling predictor file and then OpenAI call to get more data for user like treatments and tests
    //console.log('Received form submission:', req.body);

    const symptomsArray = req.body.symptoms;
    let symptomsString = symptomsArray instanceof Array ? symptomsArray.join(',') : symptomsArray.toString();
    const { userID, patientTitle, patientFirstName, patientLastName, streetAddress, city, state, postalCode, biologicalSex, country, familyHistory, age, doctor } = req.body;
    //formats date of birth
    let formattedDateOfBirth = req.body.dateOfBirth && !isNaN(new Date(req.body.dateOfBirth).getTime()) ? new Date(req.body.dateOfBirth).toISOString().split('T')[0] : null;

    //calls function to split symptoms input to existing and new symptoms
    const { knownSymptoms, newSymptoms } = await categorizeSymptoms(symptomsArray);

    //console.log('Known Symptom names: ', knownSymptoms);
    //console.log('New Symptom names: ', newSymptoms);

    try {
        //console.log('Input into the python predictor: ', knownSymptoms, '    ',  age, '    ', biologicalSex);
        callPythonScript(symptomsString, age, biologicalSex, async (error, result) => {
            if (error) {
                console.error('Error in prediction:', error);
                return res.status(500).send('Error processing prediction');
            }

            //prepares inputted symptoms for OpenAI prompt
            const symptomsArrayNumbers = req.body.symptoms.map(Number);
            //console.log('symptom array numbers: ', symptomsArrayNumbers);
            const symptomNames = await getSymptomNamesByIds(symptomsArrayNumbers);
            //console.log('symptom names: ', symptomNames);
            const symptomsString = Object.values(symptomNames).join(', ');

            //console.log('symptom names string: ', symptomsString);


            let symptomIds = result.reasoning.map(item => parseInt(item.feature));
            const symptomNamesMap = await getSymptomNamesByIds(symptomIds);
            const reasoningWithNames = result.reasoning.map(item => ({
                feature: symptomNamesMap[item.feature] || 'Unknown Symptom',
                effect: item.effect
            }));


            const diagnosticReasoningForPrompt = reasoningWithNames.map(item => `${item.feature}: Impact of ${item.effect}`).join(', ');

            const diagnosticReasoning = reasoningWithNames.map(item => item.feature).join(', ');

            // prompt to be passed to OpenAI
            const openAiPrompt = `The model has diagnosed the patient with ${result.prediction} based on the analysis of various factors. The user reported the following symptoms: ${symptomsString}. Among these, the model identified certain symptoms as key influencing factors for this diagnosis, detailing their specific impacts: ${diagnosticReasoningForPrompt}. Please list any of these key symptoms that directly match the user's reported symptoms and explain their relevance to the diagnosis. If there are no matches, it is important to note that the absence of these key symptoms in the user's report does not invalidate the diagnosis, as the model considers multiple factors. Could you explain why these key factors are critical for this diagnosis? Additionally, could you suggest potential diagnostic tests that could confirm this diagnosis and recommend possible treatments, should the diagnosis be confirmed by a medical professional? Please note that the suggestions provided by this model are preliminary and should be followed up with professional medical advice.`;


            const data = JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: [{
                    role: "user",
                    content: openAiPrompt
                }]
            });

            const options = {
                hostname: 'api.openai.com',
                port: 443,
                path: '/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Length': Buffer.byteLength(data)
                }
            };

            const apiReq = https.request(options, async (apiRes) => {
                let responseBody = '';
                apiRes.on('data', (chunk) => responseBody += chunk);
                apiRes.on('end', async () => {
                    try {
                        const responseContent = JSON.parse(responseBody);
                        //console.log("OpenAI API Response:", responseContent);

                        const currentDate = new Date();
                        const request = new sql.Request(pool);
                        request.input('UserID', sql.Int, userID);
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
                        request.input('Symptoms', sql.VarChar, knownSymptoms);
                        request.input('BiologicalSex', sql.VarChar, biologicalSex);
                        request.input('Age', sql.Int, age);
                        request.input('CurrentDate', sql.Date, currentDate);
                        request.input('Diagnosis', sql.VarChar, result.prediction);
                        request.input('Reasoning', sql.VarChar, responseContent.choices[0].message.content.trim());
                        request.input('DoctorID', sql.Int, doctor);
                        request.input('NewSymptoms', sql.VarChar, newSymptoms);

                        const patientInsertQuery = `
                            INSERT INTO PatientData (UserID, Title, First_Name, Last_Name, Street_Address, City, State, Postcode, Country, DOB, Family_History, Symptoms, Biological_Sex, Age, Date, Diagnosis, Diagnosis_Reason, DoctorID, NewSymptoms)
                            VALUES (@UserID, @Title, @First_Name, @Last_Name, @Street_Address, @City, @State, @Postcode, @Country, @DOB, @Family_History, @Symptoms, @BiologicalSex, @Age, @CurrentDate, @Diagnosis, @Reasoning, @DoctorID, @NewSymptoms)
                        `;
                        await request.query(patientInsertQuery);// saves patient data 

                        const addedSymptoms = await updateNewSymptomsForDisorder(result.prediction, newSymptoms);

                        res.json({//returns user diagnostic information to frontend
                            patientInsertionResult: "Patient data saved successfully.",
                            predictionResult: result.prediction,
                            diagnosticReasoning: diagnosticReasoning,
                            openAIResponse: responseContent.choices[0].message.content.trim()
                        });
                    } catch (parseError) {
                        console.error("Error parsing OpenAI API response:", parseError, "Raw response:", responseBody);
                        res.status(500).send('Error processing the OpenAI response');
                    }
                });
            });

            apiReq.on('error', (e) => {
                console.error(`Problem with request: ${e.message}`);
                res.status(500).send('Error contacting OpenAI API');
            });

            apiReq.write(data);
            apiReq.end();
        });
    } catch (err) {
        console.error('Server error:', err);
        res.status(500).send('Server error during processing');
    }
});






app.get('/user-details', authenticateToken, (req, res) => {// gets user details from cookies
    //console.log("Accessed /user-details endpoint");
    //console.log("req.user:", req.user);

    if (!req.user) {
        console.log("No user found in request, sending 403 response");
        return res.sendStatus(403); // Forbidden
    }

    //console.log("Responding with user details for:", req.user.email);

    res.json({
        userID: req.user.userId,
        email: req.user.email,
        role: req.user.role
    });
});





app.post('/check-symptom', authenticateToken, async (req, res) => {// to check if new symptoms should be added 
    const newSymptom = req.body.newSymptom;
    //console.log('Received request to check new symptom:', newSymptom);

    const performQuery = async (query) => {
        return new Promise((resolve, reject) => {
            const request = pool.request();
            request.query(query, (err, result) => {
                if (err) {
                    console.error('Query error:', err);
                    reject(err);
                } else {
                    if (result.recordset && Array.isArray(result.recordset)) {
                        resolve(result.recordset.map(record => record.Name));
                    } else {
                        console.log('Unexpected result structure:', result);
                        resolve([]); 
                    }
                }
            });
        });
    };

    try {
        const [existingSymptoms, newSymptoms] = await Promise.all([
            performQuery('SELECT Name FROM Symptoms'),
            performQuery('SELECT Name FROM NewSymptoms')
        ]);

        const allSymptoms = existingSymptoms.concat(newSymptoms);
        const existingSymptomsString = allSymptoms.join(', ');

        const prompt = `
        Symptom Analysis Request:
        A user has entered a new symptom: "${newSymptom}". Based on medical knowledge and understanding of symptomatology, determine if this symptom is a synonym or closely related to any of the following existing symptoms: ${existingSymptomsString}. Consider similarities in clinical presentation, patient descriptions, and known medical correlations. 

        Reply with "Yes" if the new symptom is indeed similar or a synonym for any listed symptoms. If "Yes," please specify which symptom or symptoms from the provided list closely match the newly entered symptom and state them. If there are no close matches, reply with "No".

        Note: Consider broad medical interpretations and patient-reported experiences when evaluating similarity or synonymy.
        `;

        //console.log("Sending the following prompt to OpenAI:", prompt);

        const data = JSON.stringify({
            model: "gpt-3.5-turbo",
            messages: [{
                role: "user",
                content: prompt
            }]
        });

        const options = {
            hostname: 'api.openai.com',
            port: 443,
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const apiReq = https.request(options, (apiRes) => {
            let responseBody = '';

            apiRes.on('data', (chunk) => responseBody += chunk);

            apiRes.on('end', async () => {
                //console.log("OpenAI API responded with:", responseBody);
                try {
                    const responseContent = JSON.parse(responseBody);
                    //console.log("Parsed OpenAI API response:", responseContent);

                    const responseText = responseContent.choices && responseContent.choices.length > 0 ? responseContent.choices[0].message.content.trim() : '';

                    if (!responseText.toLowerCase().includes('yes')) {// checks AI response for 'yes' and if so runs first condition 
                        await performQuery(`INSERT INTO NewSymptoms (Name) VALUES ('${newSymptom}')`);
                        //console.log("New symptom added to the database.");
                        res.json({ added: true, message: "New symptom added to the database." });
                    } else {
                        //console.log("Symptom is similar to an existing symptom.", responseText);
                        res.json({ added: false, message: "Symptom is similar to an existing symptom.", similarTo: responseText });
                    }
                } catch (parseError) {
                    console.error('Error parsing OpenAI API response:', parseError);
                    res.status(500).send('Error processing the OpenAI response');
                }
            });
        });

        apiReq.on('error', (error) => {
            console.error('Error calling OpenAI API:', error);
            res.status(500).send('Error processing the symptom with OpenAI');
        });

        apiReq.write(data);
        apiReq.end();
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).send('Internal server error');
    }
});




app.post('/fetch-patient-data', authenticateToken, async (req, res) => {//gets patient data for viewing patients records page
    try {
        //console.log("Fetching patient data...");
        
        // Connect to your database
        let pool = await sql.connect(config);
        //console.log("Connected to the database.");

        const { UserID } = req.body;
        //console.log("UserID:", UserID);

        const patientDataQuery = `
        SELECT pd.PatientID, pd.DoctorID, pd.First_Name, pd.Last_Name, pd.Symptoms, pd.NewSymptoms, pd.DOB, pd.Biological_Sex, pd.Diagnosis, pd.Diagnosis_Reason, pd.Date
        FROM PatientData pd
        INNER JOIN Users u ON pd.UserID = u.UserID
        WHERE pd.UserID = @UserID OR (u.Role = 'doctor' AND pd.DoctorID = @UserID)
        
        `;

        const patientDataResult = await pool.request()
            .input('UserID', sql.Int, UserID)
            .query(patientDataQuery);
        //console.log("Patient data fetched:", patientDataResult);

        const symptomsNamesQuery = 'SELECT ID, Name FROM Symptoms';
        const symptomsResult = await pool.request().query(symptomsNamesQuery);
        //console.log("Symptoms result:", symptomsResult);
        const symptomsMap = symptomsResult.recordset.reduce((acc, current) => {
            acc[current.ID] = current.Name;
            return acc;
        }, {});

        const newSymptomsNamesQuery = 'SELECT ID, Name FROM NewSymptoms';
        const newSymptomsResult = await pool.request().query(newSymptomsNamesQuery);
        //console.log("New symptoms result:", newSymptomsResult);
        const newSymptomsMap = newSymptomsResult.recordset.reduce((acc, current) => {
            acc[current.ID] = current.Name;
            return acc;
        }, {});

        const patientData = patientDataResult.recordset.map(patient => {
            // Convert Symptoms and NewSymptoms from ID strings to name strings
            const symptomsNames = patient.Symptoms.split(',').map(id => symptomsMap[id] || 'Unknown').join(', ');
            const newSymptomsNames = patient.NewSymptoms ? patient.NewSymptoms.split(',').map(id => newSymptomsMap[id] || 'Unknown').join(', ') : '';

            return {
                ...patient,
                Symptoms: symptomsNames,
                NewSymptoms: newSymptomsNames
            };
        });
        
        //console.log("Transformed patient data:", patientData);

        // Return data back 
        res.json(patientData);
    } catch (err) {
        console.error('SQL error', err);
        res.status(500).send('Error fetching patient data');
    }
});

app.post('/user-feedback', authenticateToken, async (req, res) => {//allows user to send feedback thats stored in UserFeedback table
    //console.log('Received user feedback:', req.body);

    const { userID, feedback } = req.body;
    
    if (!feedback) {
        return res.status(400).send("Feedback cannot be empty.");
    }

    try {
        const request = new sql.Request(pool);
        request.input('UserID', sql.Int, userID);
        request.input('Feedback', sql.VarChar, feedback);
        request.input('Date', sql.DateTime, new Date());

        const insertQuery = `
            INSERT INTO UserFeedback (UserID, Feedback, Date)
            VALUES (@UserID, @Feedback, @Date)
        `;

        await request.query(insertQuery);

        res.status(200).send("Feedback submitted successfully.");
    } catch (error) {
        console.error('Error submitting feedback:', error);
        res.status(500).send('Failed to submit feedback due to server error.');
    }
});





// HTTPS setup (needed locally for cookie usage)
const keyPath = path.join(__dirname, 'localhost+2-key.pem'); 
const certPath = path.join(__dirname, 'localhost+2.pem');
const httpsOptions = {
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath)
};

const httpsServer = https.createServer(httpsOptions, app);



app.use(express.json()); 

// Export the app for use in tests
module.exports = app;

if (require.main === module) {
    const httpsOptions = {
        key: fs.readFileSync(path.join(__dirname, 'localhost+2-key.pem')),
        cert: fs.readFileSync(path.join(__dirname, 'localhost+2.pem'))
    };
    https.createServer(httpsOptions, app).listen(3000, () => {
        console.log('HTTPS Server running on port 3000');
    });
}


// httpsServer.listen(3000, () => {
//     console.log('HTTPS Server running on port 3000');
// });
    