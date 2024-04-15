jest.mock('jsonwebtoken');
jest.mock('nodemailer');
jest.mock('bcrypt');
jest.mock('mssql', () => {
    const mssql = jest.requireActual('mssql');
    return {
        ...mssql,
        Request: jest.fn(function () {
            let inputs = {};
            return {
                input: jest.fn(function(name, type, value) {
                    inputs[name] = value;
                    return this;
                }),
                query: jest.fn(function(sql) {
                    console.log(`Executing SQL: ${sql}`);
                    console.log(`With inputs: ${JSON.stringify(inputs)}`);
                    if (sql.includes('WHERE Email = @Email')) {
                        if (inputs.Email === 'existing@example.com') {
                            console.log('Detected duplicate email check for existing@example.com');
                            return Promise.resolve({ recordset: [{ Email: 'existing@example.com' }] });
                        } else if (inputs.Email === 'user@example.com') {
                            return Promise.resolve({
                                recordset: [{
                                    UserID: '1',
                                    Email: 'user@example.com',
                                    PasswordHash: '$2b$10$examplehash', 
                                    Role: 'user'
                                }]
                            });
                        }
                    }
                    return Promise.resolve({ recordset: [] });
                })
            };
        }),
        ConnectionPool: jest.fn(() => ({
            connect: jest.fn().mockResolvedValue(),
            request: jest.fn(function() { return new (jest.requireMock('mssql').Request)(); })
        })),
    };
});

const request = require('supertest');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const sql = require('mssql');

//mock nodemailer for sending email tests
const mockSendMail = jest.fn().mockResolvedValue({ response: "Email sent" });
nodemailer.createTransport.mockReturnValue({ sendMail: mockSendMail });

const app = require('../src/server'); // Ensure this path correctly points to your exported Express app

// JWT mock to handle different scenarios
jwt.verify.mockImplementation((token, secret, callback) => {
    if (token === "valid-token") {
        callback(null, { id: 'user123' });  // Simulate a successful verification
    } else {
        callback(new Error('Invalid token'), null);  // Simulate an unsuccessful verification
    }
});

// Mock bcrypt for password checking
bcrypt.compare.mockImplementation((inputPassword, storedPassword) => {
    if (inputPassword === "password") {
        return Promise.resolve(true);
    } else {
        return Promise.resolve(false);
    }
});

let server;

beforeAll(done => {
    server = app.listen(3001, () => {
        console.log('Test server started on port 3001');
        done();
    });
});

afterAll(done => {
    if (server) {
        server.close(() => {
            console.log('Test server closed');
            done();
        });
    } else {
        done();
    }
});

describe('Authentication Middleware', () => {
    it('should authenticate a valid token', async () => {
        await request(server)
            .get('/verify-token')
            .set('Cookie', ['token=valid-token'])
            .expect(200, { verified: true });
    }, 30000);

    it('should return 401 for no token', async () => {
        await request(server)
            .get('/verify-token')
            .expect(401);
    }, 30000);
});

describe('Email Sending', () => {
    it('should send an email successfully', async () => {
        const response = await request(server)
            .post('/send-email')
            .send({ email: 'test@gmail.com', message: '<p>Hello World</p>' })
            .set('Cookie', ['token=valid-token']);
        expect(response.statusCode).toBe(200);
    }, 30000);

    it('should fail to send an email due to missing token', async () => {
        const response = await request(server)
            .post('/send-email')
            .send({ email: 'test@gmail.com', message: '<p>Hello World</p>' });
        expect(response.statusCode).toBe(401);
    }, 30000);
});

describe('User Management', () => {
    it('should handle user signup successfully', async () => {
        const response = await request(server)
            .post('/signup')
            .send({ email: 'new@example.com', password: 'password123' });
        expect(response.statusCode).toBe(200);
    }, 30000);

    it('should reject a duplicate email signup', async () => {
        const response = await request(server)
            .post('/signup')
            .send({ email: 'existing@example.com', password: 'password123' });
        expect(response.statusCode).toBe(400);
    }, 30000);
});

describe('Login', () => {
    it('should log in a user successfully', async () => {
        const response = await request(server)
            .post('/login')
            .send({ email: 'user@example.com', password: 'password' });
        expect(response.statusCode).toBe(200);
        expect(response.body.message).toBe('Login successful');
    }, 30000);

    it('should reject login with wrong password', async () => {
        const response = await request(server)
            .post('/login')
            .send({ email: 'user@example.com', password: 'wrong' });
        expect(response.statusCode).toBe(400);
    }, 30000);
});
