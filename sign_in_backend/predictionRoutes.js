const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post('/predict', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const imageBuffer = req.file.buffer;
        const mimeType = req.file.mimetype;
        const base64Image = imageBuffer.toString('base64');


        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const prompt = `Analyze this image of waste and classify it into one of the following categories: Biodegradable, Non-Biodegradable, Hazardous. Provide only the category name as the response.`;

        const imagePart = {
            inlineData: { data: base64Image, mimeType }
        };

        const result = await model.generateContent([prompt, imagePart]);
        const aiResponse = await result.response;
        let category = aiResponse.text().trim();


        if (/biodegradable/i.test(category) && !/non/i.test(category)) {
            category = 'Biodegradable';
        } else if (/non-biodegradable/i.test(category) || /nonbiodegradable/i.test(category)) {
            category = 'Non-Biodegradable';
        } else if (/hazardous/i.test(category)) {
            category = 'Hazardous';
        } else {
            category = 'Unknown';
        }


        const imgbbKey = process.env.IMGBB_API_KEY;
        let imageUrl = "";
        
        try {
            const formData = new URLSearchParams();
            formData.append('image', base64Image);
            
            const imgbbResponse = await axios.post(`https://api.imgbb.com/1/upload?key=${imgbbKey}`, formData);
            imageUrl = imgbbResponse.data.data.url;
        } catch (imgErr) {
            console.error("ImgBB Upload Failed:", imgErr.message);
            imageUrl = "Upload failed";
        }

        res.json({ category, image_url: imageUrl });

    } catch (error) {
        console.error('Prediction error:', error);
        res.status(500).json({ error: 'AI processing failed', details: error.message });
    }
});

module.exports = router;