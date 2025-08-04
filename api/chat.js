// api/chat.js - Vercel serverless function
export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Get Hugging Face API token from environment variables
        const HF_TOKEN = process.env.HUGGING_FACE_TOKEN;
        
        if (!HF_TOKEN) {
            return res.status(500).json({ error: 'API token not configured' });
        }

        // Call Hugging Face Inference API
        const hfResponse = await fetch(
            'https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${HF_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    inputs: message,
                    parameters: {
                        max_length: 100,
                        temperature: 0.7,
                        do_sample: true,
                        pad_token_id: 50256
                    }
                }),
            }
        );

        if (!hfResponse.ok) {
            const errorText = await hfResponse.text();
            console.error('Hugging Face API error:', errorText);
            
            // Handle specific error cases
            if (hfResponse.status === 503) {
                return res.status(200).json({ 
                    response: "I'm currently loading. Please try again in a moment!" 
                });
            }
            
            throw new Error(`Hugging Face API error: ${hfResponse.status}`);
        }

        const data = await hfResponse.json();
        
        // Handle different response formats
        let aiResponse;
        
        if (Array.isArray(data) && data.length > 0) {
            if (data[0].generated_text) {
                // For text generation models
                aiResponse = data[0].generated_text;
            } else if (data[0].summary_text) {
                // For summarization models
                aiResponse = data[0].summary_text;
            } else {
                // Fallback
                aiResponse = JSON.stringify(data[0]);
            }
        } else if (data.generated_text) {
            aiResponse = data.generated_text;
        } else {
            aiResponse = "I received your message but couldn't generate a proper response. Please try again!";
        }

        // Clean up the response (remove input text if it's echoed back)
        if (aiResponse.startsWith(message)) {
            aiResponse = aiResponse.slice(message.length).trim();
        }

        // Ensure we have a meaningful response
        if (!aiResponse || aiResponse.length < 2) {
            aiResponse = "I understand your message, but I'm having trouble formulating a response. Could you try rephrasing?";
        }

        return res.status(200).json({ response: aiResponse });

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ 
            error: 'Failed to process your request',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}
