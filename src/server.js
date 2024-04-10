const express = require('express');
const sql = require('mssql');
const bodyParser = require('body-parser');
const { exec } = require("child_process"); // Step 1: Include exec module
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
const JWT_SECRET = 'your_secret_key'; // You should generate a secure secret key
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser()); // This line is necessary to parse cookies attached to requests


const corsOptions = {
    origin: function (origin, callback) {
        console.log("Incoming origin:", origin); // Log the incoming origin
        const allowedOrigins = [
            'http://127.0.0.1:5500',
            'http://localhost:3000',
            'http://127.0.0.1:5500/src/home.html',
            'http://127.0.0.1:5500/src/SignUpLogin.html',
            'http://127.0.0.1:5500/src/Main.html'
        ]; // Add more origins as needed

        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            console.log("Origin allowed:", origin);
            callback(null, true); // Allow CORS for this request
        } else {
            console.log("CORS not allowed for:", origin);
            callback(new Error('CORS Not allowed')); // Reject this request
        }
    },
    credentials: true // Important for sending cookies with CORS requests
};



// Adding CORS support
const cors = require('cors');
app.use(cors(corsOptions));
app.use(express.static(path.join(__dirname, 'src')));

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
}

// Your email configuration
const transporter = nodemailer.createTransport({
    service: 'gmail', // For example, use Gmail. Configure this with your SMTP provider.
    auth: {
        user: 'neurosolvepredictions@gmail.com',
        pass: 'uhix qrfz bnpy dhzg'
    }
});


// Middleware to verify JWT token in HttpOnly Cookie
function authenticateToken(req, res, next) {
    console.log("Attempting to authenticate token...");
    
    // Attempt to retrieve the token from cookies
    const token = req.cookies.token;
    if (token == null) {
        console.log("No token provided, sending 401 response");
        console.log("Cookies:", req.cookies); // See what cookies are available

        return res.sendStatus(401); // if no token, return Unauthorized
    }

    console.log("Token found, verifying:", token);
    
    jwt.verify(token, 'your_secret_key', (err, user) => {
        if (err) {
            console.log("Token verification failed:", err);
            return res.sendStatus(403); // if token is not valid, return Forbidden
        }
        console.log("Token verified successfully. User details:", user);
        req.user = user; // Add the user payload to the request
        next(); // Proceed to the next middleware or route handler
    });
}




app.post('/send-email', (req, res) => {
    const { email, message } = req.body;

    const mailOptions = {
        from: 'neurosolvepredictions@gmail.com',
        to: email,
        subject: 'Information from Neuro Solve',
        html: message // Sending as HTML to preserve formatting. Ensure this is safe from XSS attacks.
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log(error);
            res.status(500).send('Error sending email.');
        } else {
            console.log('Email sent: ' + info.response);
            res.send('Email sent successfully.');
        }
    });
});


const pool = new sql.ConnectionPool({
    user: 'emcnamee08',
    password: 'Mcnamee1502',
    server: 'eoinmcnamee.database.windows.net', 
    database: 'NeurologicalDiagnosisSystem',
    options: {
        encrypt: true, 
        trustServerCertificate: true // Depending on your security settings, you might not need this
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
});

pool.connect(err => {
    if(err) {
        console.error('Error connecting to the database:', err);
    }
});


app.get('/verify-token', authenticateToken, (req, res) => {
    // If this point is reached, token is valid
    res.json({ verified: true });
});


app.post('/signup', async (req, res) => {
    const { email, password } = req.body;

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

        // Prepare the SQL query to insert the new user
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

        res.status(200).send('Signup successful');
    } catch (error) {
        console.error('Signup error:', error);
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

        // Prepare the SQL query to insert the new doctor user
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
            .input('Role', sql.VarChar, 'doctor') // Assigning 'doctor' role
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

    console.log("Current NODE_ENV:", process.env.NODE_ENV);

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
            // Generate a token including the user's role
            const token = jwt.sign(
                { 
                    userId: userRecord.UserID, 
                    email: userRecord.Email,
                    role: userRecord.Role // Assuming the role is fetched and available here
                },
                JWT_SECRET,
                { expiresIn: '24h' } // Token expires in 24 hours
            );

            // Set the token in an HTTPOnly cookie
            res.cookie('token', token, {
                httpOnly: true,
                //secure: process.env.NODE_ENV === 'production', // Use secure cookies in production environment
                secure: true,
                //sameSite: 'Lax', // Allows cookies to be sent with top-level navigations and will be sent along with GET request initiated by third party website.
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







app.get('/symptoms', (req, res) => {
    // Helper function to perform a query
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

    // Perform both queries in parallel
    Promise.all([
        performQuery('SELECT * FROM Symptoms'),
        performQuery('SELECT * FROM NewSymptoms')
    ]).then(results => {
        // Concatenate the results from both tables
        const allSymptoms = results[0].concat(results[1]);
        res.json(allSymptoms);
    }).catch(err => {
        // Handle any errors that occur during the query
        console.error('Error fetching symptoms from database:', err);
        res.status(500).send('Error fetching symptoms');
    });
});

app.get('/FamilyMembers', (req, res) => {
    console.log("Fetching FamilyMembers from the database...");
    const request = pool.request();
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
    const request = pool.request();
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


function callPythonScript(symptomsString, age, gender, callback) {
    const pythonExecutable = "/Users/Eoin_1/neurologydiagnosissystem/machineLearning/bin/python3";
    const scriptPath = "machineLearning/predictor.py";
    const command = `${pythonExecutable} ${scriptPath} '${symptomsString}' ${age} '${gender}'`;

    exec(command, (error, stdout, stderr) => {
        if (error || !stdout.trim()) {
            console.error(`exec error: ${error}`, `stderr: ${stderr}`);
            return callback(`Error: ${error || stderr}`, null);
        }
        callback(null, stdout.trim());
    });
}



// Endpoint to handle form submission
app.post('/submit-form', async (req, res) => {
    console.log('Received form submission:', req.body);

    const symptomsArray = req.body.symptoms;
    let symptomsString = '';
    if (Array.isArray(symptomsArray)) {
        symptomsString = symptomsArray.join(',');
    } else if (symptomsArray) {
        symptomsString = symptomsArray;
    }

    const { patientTitle, patientFirstName, patientLastName, streetAddress, city, state, postalCode, biologicalSex, country, familyHistory, age } = req.body;
    
    let formattedDateOfBirth;
    if (req.body.dateOfBirth && !isNaN(new Date(req.body.dateOfBirth).getTime())) {
        formattedDateOfBirth = new Date(req.body.dateOfBirth).toISOString().split('T')[0];
    } else {
        formattedDateOfBirth = null;
        console.log('Invalid or missing dateOfBirth. Set to null.');
    }

    try {
        const request = pool.request(); ;
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

        callPythonScript(symptomsString, age, biologicalSex, async (error, predictionResult) => {
            if (error) {
                console.error('Error in prediction:', error);
                return res.status(500).send('Error processing prediction');
            }
            console.log("Prediction Result:", predictionResult);

            const data = JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: [{
                    role: "user",
                    content: `Given a diagnosis of ${predictionResult}, what are some possible tests that can confirm this prediction and then what are possible treatments for this prediction?`
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

                apiRes.on('end', () => {
                    console.log("Raw OpenAI API response:", responseBody); // Log the raw response for debugging
                    try {
                        const responseContent = JSON.parse(responseBody);
                        if (responseContent.choices && responseContent.choices.length > 0 && responseContent.choices[0].message) {
                            const content = responseContent.choices[0].message.content.trim();
                            console.log("OpenAI API Response:", content);
                            res.json({
                                patientInsertionResult: "Patient data saved successfully.",
                                predictionResult: predictionResult,
                                openAIResponse: content
                            });
                        } else {
                            console.error("Unexpected response structure from OpenAI API", responseContent);
                            res.status(500).send('Unexpected response structure from OpenAI API');
                        }
                    } catch (parseError) {
                        console.error("Error parsing OpenAI API response:", parseError, "Raw response:", responseBody);
                        res.status(500).send('Error processing the OpenAI response');
                    }
                });
            });

            apiReq.on('error', (error) => {
                console.error("Error calling OpenAI API:", error);
                res.status(500).send('Error processing the disorder with OpenAI');
            });

            apiReq.write(data);
            apiReq.end();
        });
    } catch (err) {
        console.error('Error:', err);
        res.status(500).send('Server error');
    }
});



// Endpoint to get user details
app.get('/user-details', authenticateToken, (req, res) => {
    // Log to check if the request reaches the endpoint and if req.user is set
    console.log("Accessed /user-details endpoint");
    console.log("req.user:", req.user);

    if (!req.user) {
        console.log("No user found in request, sending 403 response");
        return res.sendStatus(403); // Forbidden
    }

    // Log to check what user details are being returned
    console.log("Responding with user details for:", req.user.email);

    // Respond with user details
    // For security reasons, limit the information sent back to the client.
    res.json({
        userID: req.user.userId,
        email: req.user.email,
        role: req.user.role // Optional, based on your application's needs
    });
});





app.post('/check-symptom', async (req, res) => {
    const newSymptom = req.body.newSymptom;
    console.log('Received request to check new symptom:', newSymptom);

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
                        resolve([]); // Resolve with an empty array to avoid crashing
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

        Reply with "Yes" if the new symptom is indeed similar or a synonym for any listed symptoms. If "Yes," please specify which symptom or symptoms from the provided list closely match the newly entered symptom. If there are no close matches, reply with "No".

        Note: Consider broad medical interpretations and patient-reported experiences when evaluating similarity or synonymy.
        `;

        console.log("Sending the following prompt to OpenAI:", prompt);

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
                console.log("OpenAI API responded with:", responseBody);
                try {
                    const responseContent = JSON.parse(responseBody);
                    console.log("Parsed OpenAI API response:", responseContent);

                    const responseText = responseContent.choices && responseContent.choices.length > 0 ? responseContent.choices[0].message.content.trim() : '';

                    if (!responseText.toLowerCase().includes('yes')) {
                        await performQuery(`INSERT INTO NewSymptoms (Name) VALUES ('${newSymptom}')`);
                        console.log("New symptom added to the database.");
                        res.json({ added: true, message: "New symptom added to the database." });
                    } else {
                        console.log("Symptom is similar to an existing symptom.", responseText);
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



// Endpoint to fetch patient data
app.post('/fetch-patient-data', async (req, res) => {
    try {
        // Connect to your database
        let pool = await sql.connect(config);

        // Extract UserID from the request, assuming it's sent in the body. Adjust as necessary.
        const { UserID } = req.body;

        // Query to retrieve patient data. Adjust table and column names as necessary.
        const patientDataQuery = `
            SELECT PatientID, DoctorID, First_Name, Last_Name, Symptoms, NewSymptoms, DOB, Biological_Sex, Diagnosis, Diagnosis_Reason, Date
            FROM PatientData
            WHERE UserID = @UserID
        `;

        const patientDataResult = await pool.request()
            .input('UserID', sql.Int, UserID)
            .query(patientDataQuery);

        // Fetching symptom names
        const symptomsNamesQuery = 'SELECT ID, Name FROM Symptoms';
        const symptomsResult = await pool.request().query(symptomsNamesQuery);
        const symptomsMap = symptomsResult.recordset.reduce((acc, current) => {
            acc[current.ID] = current.Name;
            return acc;
        }, {});

        // Fetching new symptom names
        const newSymptomsNamesQuery = 'SELECT ID, Name FROM NewSymptoms';
        const newSymptomsResult = await pool.request().query(newSymptomsNamesQuery);
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

        // Return the transformed patient data
        res.json(patientData);
    } catch (err) {
        console.error('SQL error', err);
        res.status(500).send('Error fetching patient data');
    }
});



// HTTPS setup
const keyPath = path.join(__dirname, 'localhost+2-key.pem'); // Update these paths
const certPath = path.join(__dirname, 'localhost+2.pem');
const httpsOptions = {
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath)
};

const httpsServer = https.createServer(httpsOptions, app);


// const PORT = 3000;
// app.listen(PORT, () => {
// console.log(`Server running on port ${PORT}`);
// });
httpsServer.listen(3000, () => {
    console.log('HTTPS Server running on port 3000');
});
    