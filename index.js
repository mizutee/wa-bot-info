const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { db, client } = require('./mongodbConnection');
const { senderNumber, allGameFinished, checkOngoingPlayRoom, checkRoomInfo, bothPlayersInputLife, randomizeNumber, bothPlayersSFL, stillHasLifes, checkUsernameRegister, isAdmin, newDateNow, checkWinner } = require('./helper');
const { ObjectId } = require('mongodb');
const { default: axios } = require('axios');

const whatsappClient = new Client({
    authStrategy: new LocalAuth,
    webVersion: "2.2412.54",
    webVersionCache: {
        type: "remote",
        remotePath:
            "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
    },
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

whatsappClient.on('qr', (qr) => {
    qrcode.generate(qr, { type: 'image' });
});

whatsappClient.on('ready', async () => {
    // await whatsappClient.sendMessage('120363305913636485@g.us', `Hello!\nWe're now online!`)
    // await whatsappClient.sendMessage('120363306085218728@g.us', `Hello!\nWe're now online!`)
    console.log('client is ready!');
});

whatsappClient.on('message', async (msg) => {
    try {
        if (msg.from !== 'status@broadcast') {
            console.log(msg.from)
            const command = msg.body.split(" ")[0].toLowerCase()
            const sender = senderNumber(msg);
            const chat = await whatsappClient.getChatById(msg.from);
            let adminList = [];
            chat.participants?.forEach(el => {
                if (el.isAdmin || el.isSuperAdmin) {
                    adminList.push({
                        participant: el.id._serialized,
                        isAdmin: true
                    })
                }
            });

            if (msg.from === '120363308367811541@g.us') {
                if (command === '/register') {
                    return await axios({
                        method: 'post',
                        url: `http://localhost:${process.env.PORT}/register`,
                        data: {
                            msg
                        }
                    })
                    // return msg.reply('User has been added to database!')
                }

                if (command === '/info') {
                    return await axios({
                        method: 'get',
                        url: `http://localhost:${process.env.PORT}/info`,
                        data: {
                            participant: sender,
                            groupId: msg.id.participant !== null ? msg.from : null
                        }
                    })
                }

                if (command === '/code50') {
                    const senderIsAdmin = isAdmin(adminList, sender)
                    if (!senderIsAdmin) {
                        return msg.reply(`You are not allowed to do this action!`)
                    }
                    const giveawayCode = msg.body.split(" ")[1].toUpperCase();
                    const limitParticipant = parseInt(msg.body.split(" ")[2])
                    await db.collection('RedeemCode').insertOne({
                        code: giveawayCode,
                        prize: 50,
                        limit: limitParticipant,
                        claimedParticipant: [],
                        createdAt: newDateNow()
                    });
                    return msg.reply(`An Admin has created new code for players to claim! do /claim ${giveawayCode} to win 50 WLS now!`)
                }

                if (command === '/code100') {
                    const senderIsAdmin = isAdmin(adminList, sender)
                    if (!senderIsAdmin) {
                        return msg.reply(`You are not allowed to do this action!`)
                    }
                    const giveawayCode = msg.body.split(" ")[1].toUpperCase();
                    const limitParticipant = parseInt(msg.body.split(" ")[2])
                    await db.collection('RedeemCode').insertOne({
                        code: giveawayCode,
                        prize: 100,
                        limit: limitParticipant,
                        claimedParticipant: [],
                        createdAt: newDateNow()
                    });
                    return msg.reply(`An Admin has created new code for players to claim! do /claim ${giveawayCode} to win 100 WLS now!`)
                }

                if (command === '/code500') {
                    const senderIsAdmin = isAdmin(adminList, sender)
                    if (!senderIsAdmin) {
                        return msg.reply(`You are not allowed to do this action!`)
                    }
                    const giveawayCode = msg.body.split(" ")[1].toUpperCase();
                    const limitParticipant = parseInt(msg.body.split(" ")[2])
                    await db.collection('RedeemCode').insertOne({
                        code: giveawayCode,
                        prize: 500,
                        limit: limitParticipant,
                        claimedParticipant: [],
                        status: 'active',
                        createdAt: newDateNow()
                    });
                    return msg.reply(`An Admin has created new code for players to claim! do /claim ${giveawayCode} to win 500 WLS now!`)
                }

                if (command === '/claim') {
                    const code = msg.body.split(" ")[1].toUpperCase();
                    return await axios({
                        method: 'post',
                        url: `http://localhost:${process.env.PORT}/claim`,
                        data: {
                            code,
                            msg,
                            adminList,
                            sender
                        }
                    })
                }

                if (command === '/help') {
                    msg.reply(`Here are lists of commands that you can use:\n1. /register <nickname>\n    - Example: /register AzureLen318\n2. /info\n    - Used to check your balance, nickname, and other personal data.\n3. /csn <amount>\n    - Example: /csn 500\n    - Commands to play csn, with amount 500WLS, or any other amount that you want.\n    - The game will start once someone input the same amount, and you will be invited to new GroupChat to play!\n4. /queue\n    - Used to check all games queue(s), yours also included!\n5. /cancel\n    - Used to cancel all of your game lists.\n    - If you cancel, the amount of WLS will be returned back to your balance, so don't worry!\n6. /claim <code>\n    - Example: /claim GIVEAWAY\n    - Used to claim code whenever admin shared a giveaway codes.\n    - Each player can only claim once!\n7. /reme <amount>\n    - Example: /reme 500\n    - Commands to play reme, with amount 500WLS, or any other amount that you want.\n    - The game will start once someone host you with same amount, and you will be invited to new GroupChat to play!\n8. /host <amount>\n    - Example: /host 500\n    - Used to host reme game.\n    - CAN ONLY BE USED FOR THOSE WHO ARE HOSTER!\n9. /go\n    - Used to start game, inside the PlayRoom.\n10. /sfl\n    - Used to do Spin For Life.\n11. /spin\n    - Used to spin when you play either CSN or REME.\n12. /wd <amount> <worldName>\n    - Example: /wd 1000 MYWORLD\n    - Used to withdraw your balance\n`)
                }

                if (command === '/gift') {
                    const senderIsAdmin = isAdmin(adminList, sender)
                    if (!senderIsAdmin) {
                        return msg.reply(`You are not allowed to do this action!`)
                    }
                    let amount = msg.body.split(" ")[1];
                    let giftedUser = msg.body.split(" ")[2];
                    amount = Number(amount);
                    if (isNaN(amount) || amount <= 0) {
                        return msg.reply(`Invalid amount gift! Please try again!`)
                    }

                    const session = client.startSession();
                    session.startTransaction();

                    try {
                        const userInfo = await db.collection('User').findOne({ username: giftedUser }, { session });
                        if (!userInfo) throw new Error(`The mentioned user ${giftedUser} does not exist!`)
                        const newBalance = +userInfo.balance + +amount;
                        const giftHistory = await db.collection('GiftHistory').insertOne({ participant: sender, amount: amount, giftedUser: giftedUser }, { session })
                        await db.collection('User').updateOne({ participant: userInfo.participant }, { $set: { balance: newBalance } }, { session })
                        await db.collection('UserTransaction').insertOne({
                            participant: userInfo.participant,
                            description: 'Gifted By Admin',
                            debit: amount,
                            credit: 0,
                            giftID: giftHistory.insertedId
                        }, { session })
                        await session.commitTransaction();
                        return msg.reply(`💸 ${userInfo.username}'s Balance has been updated to : ${newBalance} World Lock`);
                    } catch (error) {
                        await session.abortTransaction();
                        console.log(error);
                        return msg.reply(`Error updating balances: ${error.message}`);
                    }
                }
            }

            if (msg.from === `6281372390237@c.us`) {
                if (command === '/cancelgame') {
                    const session = client.startSession();
                    const gameId = msg.body.split(" ")[1];
                    const gameInfo = await db.collection('PlayRoom').findOne({ _id: new ObjectId(String(gameId)) });
                    if (gameInfo.status === 'Finished' || !gameInfo) {
                        return msg.reply(`This game is already finished or no longer exist!`);
                    }
                    await session.withTransaction(async () => {
                        gameInfo.participants.forEach(async (el) => {
                            const result = await db.collection('User').findOneAndUpdate({ participant: el.participant }, { $inc: { balance: +gameInfo.totalAmount / 2 } }, { returnDocument: 'after', session });
                            await msg.reply(`${el.username} with ${el.participant} number balance has been restored to ${result.balance}`)
                        })
                        await db.collection('PlayRoom').deleteOne({ _id: new ObjectId(String(gameId)) }, { session })
                        await msg.reply(`The game with ID ${gameId} has been deleted from database!`)
                    })
                }
            }

            if (msg.from === '120363292493581983@g.us') {
                if (command === '/cancelgame') {
                    const session = client.startSession();
                    const gameId = msg.body.split(" ")[1];
                    const gameInfo = await db.collection('PlayRoom').findOne({ _id: new ObjectId(String(gameId)) });
                    if (gameInfo.status === 'Finished' || !gameInfo) {
                        return msg.reply(`This game is already finished or no longer exist!`);
                    }
                    await session.withTransaction(async () => {
                        gameInfo.participants.forEach(async (el) => {
                            const result = await db.collection('User').findOneAndUpdate({ participant: el.participant }, { $inc: { balance: +gameInfo.totalAmount / 2 } }, { returnDocument: 'after', session });
                            await msg.reply(`${el.username} with ${el.participant} number balance has been restored to ${result.balance}`)
                        })
                        let res1 = await db.collection('User').findOneAndUpdate({ participant: gameInfo.participants[0].participant }, { $inc: { balance: +gameInfo.totalAmount / 2 } }, { returnDocument: 'after', session })
                        await msg.reply(`${gameInfo.participants[0].username} with +${gameInfo.participants[0].participant.split("@")[0]} number balance has been restored to ${res1.balance}`)
                        let res2 = await db.collection('User').findOneAndUpdate({ participant: gameInfo.participants[1].participant }, { $inc: { balance: +gameInfo.totalAmount / 2 } }, { returnDocument: 'after', session })
                        await msg.reply(`${gameInfo.participants[1].username} with +${gameInfo.participants[1].participant.split("@")[0]} number balance has been restored to ${res2.balance}`)
                        await db.collection('PlayRoom').deleteOne({ _id: new ObjectId(String(gameId)) }, { session })
                        await msg.reply(`The game with ID ${gameId} has been deleted from database!`)
                    })
                }
            }
        }
    } catch (error) {
        console.log(error);
    }
})

module.exports = whatsappClient;
