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

app.post('/csn', async (req, res) => {
    try {
        const msg = req.body.msg;
        const sender = senderNumber(msg);
        let amount = msg.body.split(' ')[1]
        amount = Number(amount);
        const user = await db.collection('User').findOne({ participant: sender })
        if (isNaN(amount) || amount < 0) {
            return await whatsappClient.sendMessage(msg.from, `${user.username}, You entered invalid amount! Please input valid bet amount!`)
        }
        if (user.balance < amount) {
            return await whatsappClient.sendMessage(msg.from, `${user.username}, You don't have enough balance to play!`)
        }
        const findQueue = await db.collection('PlayQueue').findOne({ bet: amount, participant: { $ne: user.participant }, status: 'waiting', game: 'CSN' })
        const findMyQueue = await db.collection('PlayQueue').findOne({ participant: sender });
        // console.log(findMyQueue)
        if (findMyQueue) return await whatsappClient.sendMessage(msg.from, `${user.username}, You can't do this action! You can only queue once!`)
        const findExistingRoom = await checkOngoingPlayRoom(sender);
        if (findExistingRoom) return await whatsappClient.sendMessage(msg.from, `${user.username}, You can't do this action! Please complete your previous game!`)
        const session = client.startSession();
        if (findQueue) {
            user.balance -= amount;
            await session.withTransaction(async () => {
                await db.collection('User').updateOne(
                    { participant: user.participant },
                    { $set: { balance: user.balance } },
                    { session }
                );
                await db.collection('PlayQueue').deleteOne({ _id: new ObjectId(findQueue._id) }, { session });
                const newRoom = await db.collection('PlayRoom').insertOne({
                    participants: [{ username: findQueue.username, participant: findQueue.participant, life: 'notdefined', goStatus: 'no', sfl: 'notdefined' }, { username: user.username, participant: user.participant, life: 'notdefined', goStatus: 'no', sfl: 'notdefined' }],
                    totalAmount: +findQueue.bet + +amount,
                    status: 'Setting Up',
                    lifeStatus: 'Undecided',
                    game: 'CSN',
                    spinTemp: [],
                    rematch: 'no',
                    rematchInfo: [],
                    createdAt: newDateNow(),
                    updatedAt: newDateNow()
                }, { session });

                await db.collection('UserTransaction').insertOne({
                    queueID: findQueue._id,
                    participant: user.participant,
                    description: 'Join CSN Queue',
                    debit: 0,
                    credit: amount,
                    playRoomID: newRoom.insertedId
                }, { session });

                await db.collection('UserTransaction').updateOne(
                    { queueID: new ObjectId(findQueue._id) },
                    { $set: { playRoomID: newRoom.insertedId } },
                    { session }
                )
                const newRoomInfo = await db.collection('PlayRoom').findOne({ _id: newRoom.insertedId }, { session });
                await whatsappClient.sendMessage(msg.from, `${newRoomInfo.participants[0].participant}, ${newRoomInfo.participants[0].participant}, Both of you have been invited to the Play Room, please do not block incoming messages from unknown number, and check your personal messages to start the game!`)
                await whatsappClient.sendMessage(newRoomInfo.participants[0].participant, `You are now up against ${newRoomInfo.participants[1].username}\nPlease do /life and decide your life. For example: /life 3`)
                await whatsappClient.sendMessage(newRoomInfo.participants[1].participant, `You are now up against ${newRoomInfo.participants[0].username}\nPlease do /life and decide your life. For example: /life 3`)
            });
        } else {
            await session.withTransaction(async () => {
                const playQueueResult = await db.collection('PlayQueue').insertOne({
                    username: user.username,
                    participant: user.participant,
                    bet: amount,
                    game: 'CSN',
                    status: 'waiting',
                    createdAt: newDateNow()
                }, { session });

                user.balance -= amount;
                await db.collection('User').updateOne(
                    { participant: user.participant },
                    { $set: { balance: user.balance } },
                    { session }
                );
                await db.collection('UserTransaction').insertOne({
                    queueID: playQueueResult.insertedId,
                    participant: user.participant,
                    description: 'Create CSN Queue',
                    debit: 0,
                    credit: amount
                }, { session })
            });
            return await whatsappClient.sendMessage(msg.from, `⏳ Hello ${user.username}, You are now on waiting list ⏳\nThe game 🎯 will start immediately once you found opponent`);
        }
        session.endSession();
    } catch (error) {
        console.log(error);
    }
})

app.post('/spin', async (req, res) => {
    try {
        const { msg, ongoingRoom, ongoingPlayRoom } = req.body;
        // console.log(msg)
        const sender = senderNumber(msg);
        // console.log(sender);
        const session = client.startSession();
        const randomNumber = randomizeNumber();
        let updatedRoomInfo;
        await session.withTransaction(async () => {
            if (ongoingRoom.spinTemp.length === 0) {
                updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: new ObjectId(String(ongoingPlayRoom._id)), status: { $ne: 'Finished' } }, { $push: { spinTemp: { participant: sender, number: randomNumber } } }, { returnDocument: 'after', session })
                // console.log(updatedRoomInfo, '<<< updetiruminfo')
                await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `${sender} has spun the wheel and got ${randomNumber}`)
                await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `${sender} has spun the wheel and got ${randomNumber}`)
                if (updatedRoomInfo.spinTemp.length === 2) {
                    if (updatedRoomInfo.spinTemp[0]?.number > updatedRoomInfo.spinTemp[1]?.number) {
                        const loser = updatedRoomInfo.spinTemp[1].participant
                        let updatedLoser;
                        updatedRoomInfo.participants.forEach((el) => {
                            if (el.participant === loser) {
                                updatedLoser = el
                            }
                        })
                        const loserLife = updatedLoser.life
                        updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: new ObjectId(String(ongoingPlayRoom._id)), status: { $ne: 'Finished' } }, { $set: { "participants.$[element].life": Number(loserLife) - 1, spinTemp: [] } }, { arrayFilters: [{ "element.participant": loser }], returnDocument: 'after', session })
                        // await db.collection('PlayRoom').updateOne({ _id: new ObjectId(String(ongoingPlayRoom._id)) }, { $set: { spinTemp: [] } }) //testing diatas
                        await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `✅Lifes Update:\n${updatedRoomInfo.participants[0].username}: ${updatedRoomInfo.participants[0].life}🔥\n${updatedRoomInfo.participants[1].username}: ${updatedRoomInfo.participants[1].life}🔥`)
                        await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `✅Lifes Update:\n${updatedRoomInfo.participants[0].username}: ${updatedRoomInfo.participants[0].life}🔥\n${updatedRoomInfo.participants[1].username}: ${updatedRoomInfo.participants[1].life}🔥`)
                    } else if (updatedRoomInfo.spinTemp[0]?.number < updatedRoomInfo.spinTemp[1]?.number) {
                        const loser = updatedRoomInfo.spinTemp[0].participant
                        let updatedLoser;
                        updatedRoomInfo.participants.forEach((el) => {
                            if (el.participant === loser) {
                                updatedLoser = el
                            }
                        })
                        const loserLife = updatedLoser.life
                        updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: new ObjectId(String(ongoingPlayRoom._id)), status: { $ne: 'Finished' } }, { $set: { "participants.$[element].life": Number(loserLife) - 1, spinTemp: [] } }, { arrayFilters: [{ "element.participant": loser }], returnDocument: 'after', session })
                        // await db.collection('PlayRoom').updateOne({ _id: new ObjectId(String(ongoingPlayRoom._id)) }, { $set: { spinTemp: [] } }) // testing diatas
                        await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `✅Lifes Update:\n${updatedRoomInfo.participants[0].username}: ${updatedRoomInfo.participants[0].life}🔥\n${updatedRoomInfo.participants[1].username}: ${updatedRoomInfo.participants[1].life}🔥`)
                        await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `✅Lifes Update:\n${updatedRoomInfo.participants[0].username}: ${updatedRoomInfo.participants[0].life}🔥\n${updatedRoomInfo.participants[1].username}: ${updatedRoomInfo.participants[1].life}🔥`)
                    } else if (updatedRoomInfo.spinTemp[0]?.number === updatedRoomInfo.spinTemp[1]?.number) {
                        await db.collection('PlayRoom').updateOne({ _id: new ObjectId(String(ongoingPlayRoom._id)) }, { $set: { spinTemp: [] } }, { session })
                        await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `Both players tied, please /spin to continue the game`)
                        await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `Both players tied, please /spin to continue the game`)
                    }
                }
            } else if (ongoingRoom.spinTemp.length === 1) {
                ongoingRoom.spinTemp.forEach(async (el) => {
                    if (el.participant === sender) {
                        return await whatsappClient.sendMessage(msg.from, 'You already spun! Wait for your opponent to spin!')
                    } else {
                        updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: new ObjectId(String(ongoingPlayRoom._id)), status: { $ne: 'Finished' } }, { $push: { spinTemp: { participant: sender, number: randomNumber } } }, { returnDocument: 'after', session })
                        await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `${sender} has spun the wheel and got ${randomNumber}`)
                        await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `${sender} has spun the wheel and got ${randomNumber}`)
                        // if (updatedRoomInfo.spinTemp[0].number === 0 || updatedRoomInfo.spinTemp[1].number === 0) {
                        //     let loserArray = [];
                        //     updatedRoomInfo.spinTemp.forEach(el => {
                        //         if (el.number !== 0) {
                        //             loserArray.push(el);
                        //         }
                        //     })
                        //     if (loserArray.length === 2) {
                        //         // console.log('2-2nya 0')
                        //         updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: new ObjectId(String(ongoingPlayRoom._id)), status: { $ne: 'Finished' } }, { $set: { spinTemp: [] } }, { returnDocument: 'after', session })
                        //         // return whatsappClient.sendMessage(msg.from, `Both players tied, please /spin to continue the game`)
                        //         await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `Both players tied, please /spin to continue the game!`)
                        //         await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `Both players tied, please /spin to continue the game!`)
                        //     } else if (loserArray.length === 1) {
                        //         const loser = loserArray[0].participant;
                        //         let updatedLoser;
                        //         updatedRoomInfo.participants.forEach((el) => {
                        //             if (el.participant === loser) {
                        //                 updatedLoser = el;
                        //             }
                        //         })
                        //         const loserLife = updatedLoser.life;
                        //         updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: new ObjectId(String(ongoingPlayRoom._id)), status: { $ne: 'Finished' } }, { $set: { "participants.$[element].life": Number(loserLife) - 1, spinTemp: [] } }, { arrayFilters: [{ "element.participant": loser }], returnDocument: 'after', session })
                        //         await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `✅Lifes Update:\n${updatedRoomInfo.participants[0].username}: ${updatedRoomInfo.participants[0].life}🔥\n${updatedRoomInfo.participants[1].username}: ${updatedRoomInfo.participants[1].life}🔥`)
                        //         await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `✅Lifes Update:\n${updatedRoomInfo.participants[0].username}: ${updatedRoomInfo.participants[0].life}🔥\n${updatedRoomInfo.participants[1].username}: ${updatedRoomInfo.participants[1].life}🔥`)
                        //     }
                        // }
                        // if (updatedRoomInfo.spinTemp.length === 2) {
                        //     if (updatedRoomInfo.spinTemp[0]?.number > updatedRoomInfo.spinTemp[1]?.number) {
                        //         const loser = updatedRoomInfo.spinTemp[1].participant
                        //         let updatedLoser;
                        //         updatedRoomInfo.participants.forEach((el) => {
                        //             if (el.participant === loser) {
                        //                 updatedLoser = el
                        //             }
                        //         })
                        //         const loserLife = updatedLoser.life
                        //         updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: new ObjectId(String(ongoingPlayRoom._id)), status: { $ne: 'Finished' } }, { $set: { "participants.$[element].life": Number(loserLife) - 1, spinTemp: [] } }, { arrayFilters: [{ "element.participant": loser }], returnDocument: 'after', session })
                        //         // await db.collection('PlayRoom').updateOne({ _id: new ObjectId(String(ongoingPlayRoom._id)) }, { $set: { spinTemp: [] } }) //testing diatas
                        //         await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `✅Lifes Update:\n${updatedRoomInfo.participants[0].username}: ${updatedRoomInfo.participants[0].life}🔥\n${updatedRoomInfo.participants[1].username}: ${updatedRoomInfo.participants[1].life}🔥`)
                        //         await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `✅Lifes Update:\n${updatedRoomInfo.participants[0].username}: ${updatedRoomInfo.participants[0].life}🔥\n${updatedRoomInfo.participants[1].username}: ${updatedRoomInfo.participants[1].life}🔥`)
                        //     } else if (updatedRoomInfo.spinTemp[0]?.number < updatedRoomInfo.spinTemp[1]?.number) {
                        //         const loser = updatedRoomInfo.spinTemp[0].participant
                        //         let updatedLoser;
                        //         updatedRoomInfo.participants.forEach((el) => {
                        //             if (el.participant === loser) {
                        //                 updatedLoser = el
                        //             }
                        //         })
                        //         const loserLife = updatedLoser.life
                        //         updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: new ObjectId(String(ongoingPlayRoom._id)), status: { $ne: 'Finished' } }, { $set: { "participants.$[element].life": Number(loserLife) - 1, spinTemp: [] } }, { arrayFilters: [{ "element.participant": loser }], returnDocument: 'after', session })
                        //         // await db.collection('PlayRoom').updateOne({ _id: new ObjectId(String(ongoingPlayRoom._id)) }, { $set: { spinTemp: [] } }) // testing diatas
                        //         await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `✅Lifes Update:\n${updatedRoomInfo.participants[0].username}: ${updatedRoomInfo.participants[0].life}🔥\n${updatedRoomInfo.participants[1].username}: ${updatedRoomInfo.participants[1].life}🔥`)
                        //         await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `✅Lifes Update:\n${updatedRoomInfo.participants[0].username}: ${updatedRoomInfo.participants[0].life}🔥\n${updatedRoomInfo.participants[1].username}: ${updatedRoomInfo.participants[1].life}🔥`)
                        //     } else if (updatedRoomInfo.spinTemp[0]?.number === updatedRoomInfo.spinTemp[1]?.number) {
                        //         await db.collection('PlayRoom').updateOne({ _id: new ObjectId(String(ongoingPlayRoom._id)) }, { $set: { spinTemp: [] } }, { session })
                        //         await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `Both players tied, please /spin to continue the game`)
                        //         await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `Both players tied, please /spin to continue the game`)
                        //     }
                        // }
                        // const updatedData = await db.collection('PlayRoom').findOne({ _id: new ObjectId(String(ongoingPlayRoom._id)), status: { $ne: 'Finished' } }, { session })
                        // if (!stillHasLifes(updatedData.participants)) {
                        //     console.log(updatedData, ongoingPlayRoom, updatedRoomInfo)
                        //     const result = await checkWinner(updatedData, ongoingPlayRoom, updatedRoomInfo);
                        //     await db.collection('PlayRoom').updateOne({ _id: new ObjectId(String(updatedData._id)) }, { $set: { status: 'Finished' } }, { session })
                        //     await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `Congratulations ${result.username}! Your balance has been updated!\nYou can do a rematch by doing /rematch <amount>\nFor example: /rematch 500`)
                        //     await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `Congratulations ${result.username}! Your balance has been updated!\nYou can do a rematch by doing /rematch <amount>\nFor example: /rematch 500`)
                        // }

                    }
                })
            } else if (ongoingRoom.spinTemp.length === 2 && (ongoingRoom.spinTemp[0].participant === ongoingRoom.spinTemp[1].participant)) {
                let loserLife;
                ongoingRoom.participants.forEach(el => {
                    if (el.participant === ongoingRoom.spinTemp[0].participant) {
                        loserLife = el.life
                    }
                })
                await whatsappClient.sendMessage(ongoingRoom.participants[0].participant, `${ongoingRoom.spinTemp[0].participant} did double! the life will be deducted 1!`)
                await whatsappClient.sendMessage(ongoingRoom.participants[1].participant, `${ongoingRoom.spinTemp[0].participant} did double! the life will be deducted 1!`)
                updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: new ObjectId(String(ongoingPlayRoom._id)), status: { $ne: 'Finished' } }, { $set: { "participants.$[element].life": Number(loserLife) - 1, spinTemp: [] } }, { arrayFilters: [{ "element.participant": ongoingRoom.spinTemp[0].participant }], returnDocument: 'after', session })
                await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `✅Lifes Update:\n${updatedRoomInfo.participants[0].username}: ${updatedRoomInfo.participants[0].life}🔥\n${updatedRoomInfo.participants[1].username}: ${updatedRoomInfo.participants[1].life}🔥`)
                await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `✅Lifes Update:\n${updatedRoomInfo.participants[0].username}: ${updatedRoomInfo.participants[0].life}🔥\n${updatedRoomInfo.participants[1].username}: ${updatedRoomInfo.participants[1].life}🔥`)
                const updatedData = await db.collection('PlayRoom').findOne({ _id: new ObjectId(String(ongoingPlayRoom._id)), status: { $ne: 'Finished' } }, { session })
                if (!stillHasLifes(updatedData.participants)) {
                    const result = await checkWinner(updatedData, ongoingPlayRoom, updatedRoomInfo);
                    await db.collection('PlayRoom').updateOne({ _id: new ObjectId(String(updatedData._id)) }, { $set: { status: 'Finished' } }, { session })
                    await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `Congratulations ${result.username}! Your balance has been updated!\nYou can play again by type /csn <amount>, and wait until you found your opponent!`)
                    await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `Congratulations ${result.username}! Your balance has been updated!\nYou can play again by type /csn <amount>, and wait until you found your opponent!`)
                }
            }
        })
        return res.status(201).json({ message: 'Spin done!' })
    } catch (error) {
        console.log(error);
    }
})

app.post('/validatespin', async (req, res) => {
    try {
        const { msg, ongoingRoom, ongoingPlayRoom } = req.body;
        const sender = senderNumber(msg);
        const session = client.startSession();
        const randomNumber = randomizeNumber();
        let updatedRoomInfo = await db.collection('PlayRoom').findOne({ _id: new ObjectId(String(ongoingPlayRoom._id)) })
        if (updatedRoomInfo.spinTemp.length === 2) {
            if (updatedRoomInfo.spinTemp[0].number === 0 || updatedRoomInfo.spinTemp[1].number === 0) {
                let loserArray = [];
                updatedRoomInfo.spinTemp.forEach(el => {
                    if (el.number !== 0) {
                        loserArray.push(el);
                    }
                })
                if (loserArray.length === 2) {
                    // console.log('2-2nya 0')
                    updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: new ObjectId(String(ongoingPlayRoom._id)), status: { $ne: 'Finished' } }, { $set: { spinTemp: [] } }, { returnDocument: 'after', session })
                    // return whatsappClient.sendMessage(msg.from, `Both players tied, please /spin to continue the game`)
                    await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `Both players tied, please /spin to continue the game!`)
                    return await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `Both players tied, please /spin to continue the game!`)
                } else if (loserArray.length === 1) {
                    const loser = loserArray[0].participant;
                    let updatedLoser;
                    updatedRoomInfo.participants.forEach((el) => {
                        if (el.participant === loser) {
                            updatedLoser = el;
                        }
                    })
                    const loserLife = updatedLoser.life;
                    updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: new ObjectId(String(ongoingPlayRoom._id)), status: { $ne: 'Finished' } }, { $set: { "participants.$[element].life": Number(loserLife) - 1, spinTemp: [] } }, { arrayFilters: [{ "element.participant": loser }], returnDocument: 'after', session })
                    await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `✅Lifes Update:\n${updatedRoomInfo.participants[0].username}: ${updatedRoomInfo.participants[0].life}🔥\n${updatedRoomInfo.participants[1].username}: ${updatedRoomInfo.participants[1].life}🔥`)
                    await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `✅Lifes Update:\n${updatedRoomInfo.participants[0].username}: ${updatedRoomInfo.participants[0].life}🔥\n${updatedRoomInfo.participants[1].username}: ${updatedRoomInfo.participants[1].life}🔥`)
                }
            }
            if (updatedRoomInfo.spinTemp[0]?.number > updatedRoomInfo.spinTemp[1]?.number) {
                const loser = updatedRoomInfo.spinTemp[1].participant
                let updatedLoser;
                updatedRoomInfo.participants.forEach((el) => {
                    if (el.participant === loser) {
                        updatedLoser = el
                    }
                })
                const loserLife = updatedLoser.life
                updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: new ObjectId(String(ongoingPlayRoom._id)), status: { $ne: 'Finished' } }, { $set: { "participants.$[element].life": Number(loserLife) - 1, spinTemp: [] } }, { arrayFilters: [{ "element.participant": loser }], returnDocument: 'after', session })
                // await db.collection('PlayRoom').updateOne({ _id: new ObjectId(String(ongoingPlayRoom._id)) }, { $set: { spinTemp: [] } }) //testing diatas
                await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `✅Lifes Update:\n${updatedRoomInfo.participants[0].username}: ${updatedRoomInfo.participants[0].life}🔥\n${updatedRoomInfo.participants[1].username}: ${updatedRoomInfo.participants[1].life}🔥`)
                await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `✅Lifes Update:\n${updatedRoomInfo.participants[0].username}: ${updatedRoomInfo.participants[0].life}🔥\n${updatedRoomInfo.participants[1].username}: ${updatedRoomInfo.participants[1].life}🔥`)
            } else if (updatedRoomInfo.spinTemp[0]?.number < updatedRoomInfo.spinTemp[1]?.number) {
                const loser = updatedRoomInfo.spinTemp[0].participant
                let updatedLoser;
                updatedRoomInfo.participants.forEach((el) => {
                    if (el.participant === loser) {
                        updatedLoser = el
                    }
                })
                const loserLife = updatedLoser.life
                updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: new ObjectId(String(ongoingPlayRoom._id)), status: { $ne: 'Finished' } }, { $set: { "participants.$[element].life": Number(loserLife) - 1, spinTemp: [] } }, { arrayFilters: [{ "element.participant": loser }], returnDocument: 'after', session })
                // await db.collection('PlayRoom').updateOne({ _id: new ObjectId(String(ongoingPlayRoom._id)) }, { $set: { spinTemp: [] } }) // testing diatas
                await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `✅Lifes Update:\n${updatedRoomInfo.participants[0].username}: ${updatedRoomInfo.participants[0].life}🔥\n${updatedRoomInfo.participants[1].username}: ${updatedRoomInfo.participants[1].life}🔥`)
                await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `✅Lifes Update:\n${updatedRoomInfo.participants[0].username}: ${updatedRoomInfo.participants[0].life}🔥\n${updatedRoomInfo.participants[1].username}: ${updatedRoomInfo.participants[1].life}🔥`)
            } else if (updatedRoomInfo.spinTemp[0]?.number === updatedRoomInfo.spinTemp[1]?.number) {
                await db.collection('PlayRoom').updateOne({ _id: new ObjectId(String(ongoingPlayRoom._id)) }, { $set: { spinTemp: [] } }, { session })
                await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `Both players tied, please /spin to continue the game`)
                await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `Both players tied, please /spin to continue the game`)
            }
        } else if (updatedRoomInfo.spinTemp.length === 2 && (updatedRoomInfo.spinTemp[0].participant === updatedRoomInfo.spinTemp[1].participant)) {
            let loserLife;
            updatedRoomInfo.participants.forEach(el => {
                if (el.participant === updatedRoomInfo.spinTemp[0].participant) {
                    loserLife = el.life
                }
            })
            await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `${updatedRoomInfo.spinTemp[0].participant} did double! the life will be deducted 1!`)
            await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `${updatedRoomInfo.spinTemp[0].participant} did double! the life will be deducted 1!`)
            updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: new ObjectId(String(ongoingPlayRoom._id)), status: { $ne: 'Finished' } }, { $set: { "participants.$[element].life": Number(loserLife) - 1, spinTemp: [] } }, { arrayFilters: [{ "element.participant": updatedRoomInfo.spinTemp[0].participant }], returnDocument: 'after', session })
            await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `✅Lifes Update:\n${updatedRoomInfo.participants[0].username}: ${updatedRoomInfo.participants[0].life}🔥\n${updatedRoomInfo.participants[1].username}: ${updatedRoomInfo.participants[1].life}🔥`)
            await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `✅Lifes Update:\n${updatedRoomInfo.participants[0].username}: ${updatedRoomInfo.participants[0].life}🔥\n${updatedRoomInfo.participants[1].username}: ${updatedRoomInfo.participants[1].life}🔥`)
            const updatedData = await db.collection('PlayRoom').findOne({ _id: new ObjectId(String(ongoingPlayRoom._id)), status: { $ne: 'Finished' } }, { session })
            if (!stillHasLifes(updatedData.participants)) {
                const result = await checkWinner(updatedData, ongoingPlayRoom, updatedRoomInfo);
                await db.collection('PlayRoom').updateOne({ _id: new ObjectId(String(updatedData._id)) }, { $set: { status: 'Finished' } }, { session })
                await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `Congratulations ${result.username}! Your balance has been updated!\nYou can play again by type /csn <amount>, and wait until you found your opponent!`)
                await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `Congratulations ${result.username}! Your balance has been updated!\nYou can play again by type /csn <amount>, and wait until you found your opponent!`)
            }
        }
        const updatedData = await db.collection('PlayRoom').findOne({ _id: new ObjectId(String(ongoingPlayRoom._id)), status: { $ne: 'Finished' } }, { session })
        if (!stillHasLifes(updatedData.participants)) {
            const result = await checkWinner(updatedData, ongoingPlayRoom, updatedRoomInfo);
            await db.collection('PlayRoom').updateOne({ _id: new ObjectId(String(updatedData._id)) }, { $set: { status: 'Finished' } }, { session })
            await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `Congratulations ${result.username}! Your balance has been updated!\nYou can play again by type /csn <amount>, and wait until you found your opponent!`)
            await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `Congratulations ${result.username}! Your balance has been updated!\nYou can play again by type /csn <amount>, and wait until you found your opponent!`)
            return res.status(200).json({ message: 'Spin has been validated' })
        } else if (updatedRoomInfo.spinTemp.length < 0 && updatedRoomInfo.spinTemp.length > 2) {
            await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `Error occured! Please contact admin!`)
            await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `Error occured! Please contact admin!`)
            await db.collection('RoomProblem').updateOne(
                { _id: new ObjectId(String(updatedRoomInfo._id)) },
                {
                    $setOnInsert: {
                        roomId: updatedRoomInfo._id,
                        description: `SpinTemp less than 0 or more than 2`
                    },
                    $set: {
                        updatedAt: newDateNow()
                    }
                },
                {
                    upsert: true
                }
            )
            return res.status(400).json({ message: 'Error occured!' })
        }
        return res.status(200).json({ message: 'No Error Found! Good to go!' })
    } catch (error) {
        console.log(error);
    }
})

app.post('/reme', async (req, res) => {
    try {
        const { msg } = req.body;
        const sender = senderNumber(msg);
        let amount = msg.body.split(" ")[1];
        amount = Number(amount);
        if (isNaN(amount)) return await whatsappClient.sendMessage(msg.from, `Please input valid number, for example: /reme 100`, { mentions: [sender] })
        const user = await db.collection('User').findOne({ participant: sender })
        if (user.balance < amount) {
            return msg.reply("You don't have enough balance to play!")
        }
        if (user.role === 'hoster') return await whatsappClient.sendMessage(msg.from, `You can't play REME because you are still hoster! Please wait until the role wears off!`, { mentions: [sender] })
        const session = client.startSession();
        await session.withTransaction(async () => {
            const playQueueResult = await db.collection('PlayQueue').insertOne({
                username: user.username,
                participant: user.participant,
                bet: amount,
                game: 'REME',
                status: 'waiting',
                createdAt: newDateNow()
            }, { session })
            user.balance -= amount;
            await db.collection('User').updateOne(
                { participant: user.participant },
                { $set: { balance: user.balance } },
                { session }
            );

            await db.collection('UserTransaction').insertOne({
                queueID: playQueueResult.insertedId,
                participant: user.participant,
                description: 'Create REME Queue',
                debit: 0,
                credit: amount
            }, { session })
        });
        session.endSession();
        await whatsappClient.sendMessage(msg.from, '⏳ You are now on waiting list ⏳\nThe game 🎯 will start immediately once someone hosted you.', { mentions: [sender] });
        return res.status(201).json({message: 'PlayQueue has been created!'})
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