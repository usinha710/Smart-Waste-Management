const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const twilio = require('twilio');

const User = require('./User');
const router = express.Router();

// Initialize Twilio client
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

if (!process.env.TWILIO_PHONE_NUMBER) {
        console.warn('[DEV] TWILIO_PHONE_NUMBER is not set in .env; OTP "from" will be undefined.');
}

router.post('/send-otp', async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ msg: 'Phone number required' });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); 

    
        await User.findOneAndUpdate(
            { phone },
            { phone, otp, otpExpiry, isPhoneVerified: false },
            { upsert: true, new: true }
        );

        console.log(`[DATABASE] User record updated for ${phone}. OTP: ${otp}`);

     
        try {
            await client.messages.create({
                body: `Your SmartWasteAI code: ${otp}`,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: `+91${phone}` 
            });
            return res.json({ msg: 'OTP sent successfully' });
        } catch (twErr) {
            console.error('Twilio Error (SMS failed but DB updated):', twErr.message);
            
            return res.status(200).json({ 
                msg: 'OTP generated (Check server console, SMS failed)', 
                devMode: true 
            });
        }
    } catch (error) {
        console.error('Final Catch Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ msg: 'Internal Server Error' });
        }
    }
});

router.post('/verify-otp', async (req, res) => {
    try {
        const { phone, otp } = req.body;

        if (!phone || !otp) {
            return res.status(400).json({ msg: 'Phone and OTP required' });
        }

        const user = await User.findOne({ phone });
        
        if (!user || !user.otp) {
            return res.status(400).json({ msg: 'OTP not found. Request a new one.' });
        }

        if (new Date() > user.otpExpiry) {
            return res.status(400).json({ msg: 'OTP expired' });
        }

        if (user.otp !== otp) {
            return res.status(400).json({ msg: 'Invalid OTP' });
        }

        user.isPhoneVerified = true;
        await user.save();
        
        res.json({ msg: 'OTP verified successfully' });
    } catch (error) {
        console.error('OTP Verify Error:', error);
        res.status(500).json({ msg: 'Verification failed' });
    }
});

// REGISTER - Stage 3
router.post('/register', async (req, res) => {
    try {
        const { username, email, password, phone, age } = req.body;

        // Validate inputs
        if (!username || !email || !password || !phone || !age) {
            return res.status(400).json({ msg: "Fill all fields" });
        }

        if (password.length < 6) {
            return res.status(400).json({ msg: "Password must be at least 6 characters" });
        }

        const user = await User.findOne({ phone, isPhoneVerified: true });
        
        if (!user) {
            return res.status(400).json({ msg: "Verify phone number first" });
        }

        const exists = await User.findOne({
            _id: { $ne: user._id }, 
            $or: [{ email }, { username }]
        });
        
        if (exists) {
            return res.status(400).json({ msg: "Username or email already exists" });
        }

        user.username = username;
        user.email = email.toLowerCase();
        user.password = await bcrypt.hash(password, 10);
        user.age = parseInt(age);
        user.otp = undefined; 
        user.otpExpiry = undefined; 

        await user.save();

        res.status(201).json({ msg: "Registration successful" });

    } catch (err) {
        console.error('Registration Error:', err);
        res.status(500).json({ msg: "Server error" });
    }
});

// LOGIN
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        console.log('Login attempt with:', { email, hasPassword: !!password });

        if (!email || !password) {
            return res.status(400).json({ msg: "Please fill all fields" });
        }

     
        const user = await User.findOne({ email: email.toLowerCase() });

        console.log('User found:', user ? `Yes (${user.username})` : 'No');

        if (!user) {
            return res.status(400).json({ msg: "Enter in a valid email format (e.g., user@example.com)" });
        }

        
        if (!user.username || !user.email || !user.password) {
            return res.status(400).json({ msg: "Please complete your registration first" });
        }

        if (!user.isPhoneVerified) {
            return res.status(403).json({ msg: "Phone not verified" });
        }


        const isMatch = await bcrypt.compare(password, user.password);
        console.log('Password match:', isMatch);

        if (!isMatch) {
            return res.status(400).json({ msg: "Wrong password" });
        }

        const token = jwt.sign(
            { id: user._id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        console.log('Login successful for:', user.username);

        res.json({
            token,
            username: user.username,
            email: user.email,
            phone: user.phone
        });

    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ msg: "Server error" });
    }
});


module.exports = router;