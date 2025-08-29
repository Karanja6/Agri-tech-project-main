// smsAlertServer.js
const express = require('express');
const bodyParser = require('body-parser');
const africastalking = require('africastalking');

// Config
const AT = africastalking({
  apiKey: 'YOUR_API_KEY', // Replace with your actual key
  username: 'sandbox',    // Use 'sandbox' or your production username
});

const sms = AT.SMS;

const app = express();
app.use(bodyParser.json());

// Endpoint to send SMS
app.post('/send-alert', async (req, res) => {
  const { phoneNumber, message } = req.body;

  try {
    const response = await sms.send({
      to: [phoneNumber],
      message,
      from: 'YOUR_SHORTCODE_OR_SENDER_ID' // Optional
    });

    res.status(200).json({ success: true, response });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(3001, () => console.log('SMS alert server running on port 3001'));
