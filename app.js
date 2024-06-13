require('dotenv').config();
const express = require('express');
const app = express()
const whatsappClient = require('./index');
const { db, client } = require('./mongodbConnection');
const cron = require('node-cron');
const { senderNumber, allGameFinished, checkOngoingPlayRoom, checkRoomInfo, bothPlayersInputLife, randomizeNumber, bothPlayersSFL, stillHasLifes, checkUsernameRegister, isAdmin, newDateNow, checkWinner, countWinRate } = require('./helper');
const cors = require('cors');
const { ObjectId } = require('mongodb');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

whatsappClient.initialize();

app.post('/informUpdate', async (req, res) => {
    try {
        await whatsappClient.sendMessage('120363305913636485@g.us', `Greetings Player!\nShortly our bot will go under maintenance for approximately ${req.body.minute} minutes for quick update!\nWe will back soon!`);
        await whatsappClient.sendMessage('120363306085218728@g.us', `Greetings Player!\nShortly our bot will go under maintenance for approximately ${req.body.minute} minutes for quick update!\nWe will back soon!`);
        return res.status(200).json({ message: `Message has been broadcasted successfully!` });
    } catch (error) {
        console.log(error);
    }
})

app.post('/informEmergency', async (req, res) => {
    try {
        await whatsappClient.sendMessage('120363305913636485@g.us', `Greetings Player!\nShortly our bot will go under critical maintenance! Please refrain doing transaction during this time!\nThankyou!`);
        await whatsappClient.sendMessage('120363306085218728@g.us', `Greetings Player!\nShortly our bot will go under critical maintenance! Please refrain doing transaction during this time!\nThankyou!`);
        return res.status(200).json({ message: `Message has been broadcasted successfully!` });
    } catch (error) {
        console.log(error);
    }
})

app.get('/info', async (req, res) => {
    try {
        const userInfo = await db.collection('User').findOne({ participant: req.body.participant });
        const playData = await countWinRate(req.body.participant);
        // await whatsappClient.sendMessage(req.body.groupId, `📓 User Information 📓\nusername : ${userInfo.username}\nbalance : ${userInfo.balance}\nstatus: ${userInfo.role}`)
        await whatsappClient.sendMessage(req.body.groupId, `
👤 User Information
*________________________________________*
👤 Name: ${userInfo.username}
💰 Current Balance: ${userInfo.balance}
🏅 Status: ${userInfo.role}
🎯 Win Rate: ${playData.winrate}
🎮 Jumlah Permainan: ${playData.totalGame}
*________________________________________*
`)
        return res.status(200).json({ userInfo })
    } catch (error) {
        console.log(error);
    }
});

app.post('/claim', async (req, res) => {
    const msg = req.body.msg;
    const sender = req.body.sender;
    const senderIsAdmin = isAdmin(req.body.adminList, sender);
    if (senderIsAdmin) {
        return await whatsappClient.sendMessage(msg.from, 'You are not allowed to do this action!');
    };
    const code = req.body.code;
    const validateCode = await db.collection('RedeemCode').findOne({ code: code, status: { $ne: 'claimed' } });
    if (!validateCode) return await whatsappClient.sendMessage(msg.from, `${sender}, You entered invalid Code!`);
    let userClaimed = false;
    validateCode.claimedParticipant.forEach(el => {
        if (el.participant === sender) {
            userClaimed = true;
        }
    })
    if (userClaimed) return await whatsappClient.sendMessage(msg.from, 'You already claimed this code before!')
    const session = client.startSession();
    try {
        await session.withTransaction(async () => {
            if (validateCode) {
                if (validateCode.claimedParticipant.length < validateCode.limit) {
                    await db.collection('User').findOneAndUpdate({ participant: sender }, { $inc: { balance: validateCode.prize } }, { session })
                    updatedCodeInfo = await db.collection('RedeemCode').findOneAndUpdate({ _id: new ObjectId(validateCode._id) }, { $push: { claimedParticipant: { participant: sender, createdAt: newDateNow() } } }, { returnDocument: 'after', session });
                    await db.collection('UserTransaction').insertOne({
                        participant: sender,
                        description: `Code Claim ${code}`,
                        redeemCodeID: updatedCodeInfo._id,
                        debit: updatedCodeInfo.prize,
                        credit: 0
                    }, { session });
                    if (updatedCodeInfo.claimedParticipant.length === updatedCodeInfo.limit) {
                        await db.collection('RedeemCode').updateOne({ _id: new ObjectId(updatedCodeInfo._id) }, { $set: { status: 'claimed' } }, { session })
                    }
                }
            }
        })
        session.endSession();
        await whatsappClient.sendMessage(msg.from, `${sender} just claimed ${updatedCodeInfo.prize}! Your balance has been updated!`)
        res.status(201).json({ message: `${sender} has claimed the code!` })
    } catch (error) {
        session.endSession();
        console.log(error);
        return await whatsappClient.sendMessage(msg.from, `Error has occured while claiming the code: ${error}`)
    }
})

app.post('/register', async (req, res) => {
    try {
        const msg = req.body.msg;
        const sender = senderNumber(msg);
        const checkExistUser = await db.collection('User').findOne({
            participant: sender
        })
        if (checkExistUser) {
            return await whatsappClient.sendMessage(msg.from, `${msg.id.participant}, You already registered!`)
        }
        const username = msg.body.split(' ')[1]
        const validUsername = checkUsernameRegister(username);
        if (!validUsername) {
            return await whatsappClient.sendMessage(msg.from, `Hello ${msg.id.participant}, Username is invalid! Please follow this criteria:\n1. Must be 8 characters\n2. Not allowed to use symbol, only A-Z and Numbers`)
        }
        const checkExistUsername = await db.collection('User').findOne({
            where: {
                username: username
            }
        })
        if (checkExistUsername) {
            return await whatsappClient.sendMessage(msg.from, `Username "${username}" is already registered!`)
        }
        const result = await db.collection('User').updateOne(
            { participant: sender },
            {
                $setOnInsert: {
                    username,
                    participant: sender,
                    balance: 0,
                    role: 'player'
                }
            },
            { upsert: true }
        );
        if (result.upsertedCount === 1) {
            await db.collection('UserTransaction').insertOne({
                userID: result.upsertedId,
                participant: sender,
                description: 'New Registration',
                debit: 0,
                credit: 0
            });

            await whatsappClient.sendMessage(msg.from, `Hello ${username}! Your data has been registered to our database!`);
            return res.status(201).json({ message: 'User has been created successfully!' });
        } else {
            await whatsappClient.sendMessage(msg.from, `${msg.id.participant}, You already registered!`);
            return res.status(200).json({ message: 'User already exists!' });
        }
    } catch (error) {
        console.log(error);
    }
})

cron.schedule('*/1 * * * *', async () => {
    await checkHoster();
})

app.listen(process.env.PORT, () => {
    console.log(`ExpressJS connected to port ${process.env.PORT}`);
})