require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const axios = require('axios');
const sharp = require('sharp'); // For image compression
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const app = express();

// Increase limit for JSON and URL-encoded data
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));


bot.on("polling_error", (msg) => console.log(msg));

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

// Compress image using sharp
async function compressImage(buffer) {
    return await sharp(buffer)
        .resize({ width: 1920 }) // Resize to 1920px width, maintaining aspect ratio
        .jpeg({ quality: 70 }) // Compress to JPEG with 70% quality
        .toBuffer();
}

// Compress video using ffmpeg
function compressVideo(buffer) {
    return new Promise((resolve, reject) => {
        const inputPath = path.join(__dirname, 'temp_input.mp4');
        const outputPath = path.join(__dirname, 'temp_output.mp4');
        fs.writeFileSync(inputPath, buffer);

        ffmpeg(inputPath)
            .videoCodec('libx264')
            .size('1280x720')
            .outputOptions('-crf 28') // Compression quality
            .save(outputPath)
            .on('end', () => {
                const compressedBuffer = fs.readFileSync(outputPath);
                fs.unlinkSync(inputPath);
                fs.unlinkSync(outputPath);
                resolve(compressedBuffer);
            })
            .on('error', (err) => {
                fs.unlinkSync(inputPath);
                reject(err);
            });
    });
}

app.post('/sendToGroup', async (req, res) => {
    const { author, content, attachments,channel } = req.body;

    try {
        if (attachments && attachments.length > 0) {
            const mediaAttachment = attachments.find(att => att.content_type.startsWith('image/') || att.content_type.startsWith('video/'));

            if (mediaAttachment) {
                const response = await axios.get(mediaAttachment.url, { responseType: 'arraybuffer' });
                let mediaBuffer = Buffer.from(response.data, 'binary');

                // Check if the file size exceeds 2GB
                if (mediaBuffer.length > MAX_FILE_SIZE) {
                    if (mediaAttachment.content_type.startsWith('image/')) {
                        mediaBuffer = await compressImage(mediaBuffer);
                    } else if (mediaAttachment.content_type.startsWith('video/')) {
                        mediaBuffer = await compressVideo(mediaBuffer);
                    }
                }

                const sendMethod = mediaAttachment.content_type.startsWith('image/')
                    ? bot.sendPhoto.bind(bot)
                    : bot.sendDocument.bind(bot);

                await sendMethod(process.env.GROUP_CHAT_ID, mediaBuffer, {
                    caption: `From ${author || 'unknown'}: ${content || ''}`,
                    message_thread_id: channel
                });

                return res.send({ success: true, message: "Media sent to the group" });
            }

            return res.status(400).send({ error: "No valid image or file attachment found" });
        }

        if (content) {
            await bot.sendMessage(process.env.GROUP_CHAT_ID, `${author || 'unknown'}: ${content}`,{ message_thread_id: channel});
            return res.send({ success: true, message: "Message sent to the group" });
        } else {
            return res.status(400).send({ error: "No content or attachments found" });
        }

    } catch (error) {
        console.error("Error sending message to group:", error);
        return res.status(500).send({ error: "Failed to send message to group" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
