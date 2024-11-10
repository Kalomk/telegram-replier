require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

// Create a new Telegram bot instance
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Set up an Express server to listen for incoming messages from your server
const app = express();
app.use(express.json());

bot.on("polling_error", (msg) => console.log(msg));

// Endpoint to receive messages from your server and send them to the private group
app.post('/sendToGroup', (req, res) => {
    const { author, content, channel } = req.body;

    if (!content) {  // Checking if 'content' exists
        return res.status(400).send({ error: "Message content is required" });
    }

    console.log(req.body);

    // Send the message to the private group
    bot.sendMessage(process.env.GROUP_CHAT_ID, `${author}: ${content}`, {
        message_thread_id: channel
    })
        .then(() => {
            res.send({ success: true, message: "Message sent to the group" });
        })
        .catch((error) => {
            console.error("Error sending message to group:", error);
            res.status(500).send({ error: "Failed to send message to group" });
        });
});

// Start the Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
