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
            const contact = await msg.getContact();
            const sender = senderNumber(msg);
            const command = msg.body.split(" ")[0].toLowerCase()
            const chat = await whatsappClient.getChatById(msg.from);
            const ongoingPlayRoom = await checkOngoingPlayRoom(sender);
            const finishedPlayRoom = await allGameFinished(msg.from);
            // console.log(ongoingPlayRoom)
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
                        url: 'http://localhost:80/register',
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
        }
    } catch (error) {
        console.log(error);
    }
})

module.exports = whatsappClient;
