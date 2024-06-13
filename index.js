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
            console.log(msg);
            const contact = await msg.getContact();
            // console.log(msg)
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
            if (ongoingPlayRoom && ongoingPlayRoom.game === 'CSN' && (msg.from !== '120363305913636485@g.us' && msg.from !== '120363306085218728@g.us')) {
                const roomInfo = ongoingPlayRoom;
                // const ongoingRoom = await db.collection('PlayRoom').findOne({ "participants.participant": sender, status: { $ne: 'Finished' } })
                const ongoingRoom = roomInfo;
                if (!roomInfo) {
                    return whatsappClient.sendMessage(msg.from, 'The game is no longer valid or finished!')
                }
                if (ongoingRoom.lifeStatus === "Undecided") {
                    if (command === '/life') {
                        let bothPlayerDecide = 0
                        let life = msg.body.split(" ")[1];
                        life = Number(life)
                        let updatedRoomInfo;
                        ongoingRoom.participants.forEach(el => {
                            if (el.life !== 'notdefined') {
                                bothPlayerDecide++
                            }
                        })
                        if (life === '' || typeof life !== 'number' || !life) {
                            return msg.reply('Please input valid number! For example:\n/life 3')
                        }
                        if (life < 1 || life > 4) {
                            return await whatsappClient.sendMessage(sender, "Invalid life amount! Please choose on a 1-4 range only!")
                        }
                        ongoingRoom.participants.forEach(async (el) => {
                            if (el.participant === sender && el.life === 'notdefined' && !bothPlayerDecide) {
                                updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { "participants.$[element].life": life } }, { arrayFilters: [{ "element.participant": sender }], returnDocument: 'after' })
                                return msg.reply('Your life has been saved ✅ ! Please wait ⌛ for other players to decide theirs.')
                            } else if (el.participant === sender && el.life === 'notdefined' && bothPlayerDecide) {
                                updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { "participants.$[element].life": life } }, { arrayFilters: [{ "element.participant": sender }], returnDocument: 'after' })
                                if (updatedRoomInfo.participants[0].life === updatedRoomInfo.participants[1].life && bothPlayersInputLife(updatedRoomInfo.participants)) {
                                    await db.collection('PlayRoom').updateOne({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { lifeStatus: 'Fixed', status: 'Ongoing' } })
                                    await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `Life is saved! We will now begin the game shortly! Type /go to start the game!`)
                                    await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `Life is saved! We will now begin the game shortly! Type /go to start the game!`)
                                } else if (bothPlayersInputLife(updatedRoomInfo.participants) && (updatedRoomInfo.participants[0].life !== updatedRoomInfo.participants[1].life)) {
                                    await db.collection('PlayRoom').updateOne({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { lifeStatus: "SFL" } })
                                    await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `Since both players desired different life, 🏁 we will now begin Spin For Life!\n✍🏻 Type /sfl to spin for life!`)
                                    await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `Since both players desired different life, 🏁 we will now begin Spin For Life!\n✍🏻 Type /sfl to spin for life!`)
                                } else if (!bothPlayersInputLife(ongoingRoom.participants)) {
                                    msg.reply(`Your life has been saved ✅ ! Please wait ⌛ for other players to decide theirs.`)
                                }
                            } else if (el.participant === sender && el.life !== 'notdefined') {
                                return whatsappClient.sendMessage(sender, "You can't change your life again!")
                            }
                        })
                        if (bothPlayerDecide === 2) {
                            if (ongoingRoom.participants[0].life === ongoingRoom.participants[1].life && bothPlayersInputLife(ongoingRoom.participants)) {
                                await db.collection('PlayRoom').updateOne({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { lifeStatus: 'Fixed', status: 'Ongoing' } })
                                await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `Life is saved! We will now begin the game shortly! Type /go to start the game!`)
                                await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `Life is saved! We will now begin the game shortly! Type /go to start the game!`)
                            } else if (bothPlayersInputLife(ongoingRoom.participants) && (ongoingRoom.participants[0].life !== ongoingRoom.participants[1].life)) {
                                await db.collection('PlayRoom').updateOne({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { lifeStatus: "SFL" } })
                                await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `Since both players desired different life, 🏁 we will now begin Spin For Life!\n✍🏻 Type /sfl to spin for life!`)
                                await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `Since both players desired different life, 🏁 we will now begin Spin For Life!\n✍🏻 Type /sfl to spin for life!`)
                            } else if (!bothPlayersInputLife(ongoingRoom.participants)) {
                                msg.reply(`Your life has been saved ✅ ! Please wait ⌛ for other players to decide theirs.`)
                            }
                        }
                    }
                }
                if (ongoingRoom.lifeStatus === "SFL") {
                    if (command === '/sfl') {
                        let bothPlayerSpin = false
                        const randomNumber = randomizeNumber()
                        let updatedRoomInfo;
                        ongoingRoom.participants.forEach(el => {
                            if (el.sfl !== 'notdefined' && el.sfl !== 'tie') {
                                bothPlayerSpin = true
                            }
                        })
                        // console.log(bothPlayerSpin, "<<< udh spin 2-2ny blm nih")
                        ongoingRoom.participants.forEach(async (el) => {
                            if (el.participant === sender && (el.sfl === 'notdefined' || el.sfl === 'tie') && !bothPlayerSpin) {
                                // console.log('cuma 1 yang baru spin, baru yang ini doang')
                                updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { "participants.$[element].sfl": randomNumber } }, { arrayFilters: [{ "element.participant": sender }], returnDocument: 'after' })
                                await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `${sender} has spun the wheel and got ${randomNumber}`)
                                await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `${sender} has spun the wheel and got ${randomNumber}`)
                            } else if (el.participant === sender && (el.sfl === 'notdefined' || el.sfl === 'tie') && bothPlayerSpin) {
                                // msg.reply(`${sender} has spun the wheel and got ${randomNumber}!🎯`)
                                updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { "participants.$[element].sfl": randomNumber } }, { arrayFilters: [{ "element.participant": sender }], returnDocument: 'after' })
                                await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `${sender} has spun the wheel and got ${randomNumber}`)
                                await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `${sender} has spun the wheel and got ${randomNumber}`)
                                if (updatedRoomInfo.participants[0].sfl === 0 || updatedRoomInfo.participants[1].sfl === 0) {
                                    if (updatedRoomInfo.participants[0].sfl === 0 && updatedRoomInfo.participants[1].sfl !== 0) {
                                        const winningLife = updatedRoomInfo.participants[0].life;
                                        await db.collection('PlayRoom').updateOne({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { "participants.$[].life": winningLife, status: 'Ongoing', lifeStatus: 'Fixed' } })
                                        await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `${updatedRoomInfo.participants[0].username} won the SFL 🎯! life will be set to ${winningLife}🔥\nThe game will be started, please both players type /go to start the game!🎮`)
                                        return await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `${updatedRoomInfo.participants[0].username} won the SFL 🎯! life will be set to ${winningLife}🔥\nThe game will be started, please both players type /go to start the game!🎮`)
                                    } else if (updatedRoomInfo.participants[0].sfl !== 0 && updatedRoomInfo.participants[1].sfl === 0) {
                                        const winningLife = updatedRoomInfo.participants[1].life;
                                        await db.collection('PlayRoom').updateMany({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { "participants.$[].life": winningLife, status: 'Ongoing', lifeStatus: 'Fixed' } })
                                        await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `${updatedRoomInfo.participants[1].username} won the SFL 🎯! life will be set to ${winningLife}🔥\nThe game will be started, please both players type /go to start the game!🎮`)
                                        return await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `${updatedRoomInfo.participants[1].username} won the SFL 🎯! life will be set to ${winningLife}🔥\nThe game will be started, please both players type /go to start the game!🎮`)
                                    } else if (updatedRoomInfo.participants[0].sfl === 0 && updatedRoomInfo.participants[1].sfl === 0) {
                                        await db.collection('PlayRoom').updateMany({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { "participants.$[].sfl": 'tie' } })
                                        // return msg.reply(`Both player tied, please re-spin by type /sfl again!`)
                                        await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `${sender} has spun the wheel and got ${randomNumber}`)
                                        return await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `Both player tied, please re-spin by type /sfl again!`)
                                    }
                                }
                                if (updatedRoomInfo.participants[0].sfl === updatedRoomInfo.participants[1].sfl && bothPlayersSFL(updatedRoomInfo.participants)) {
                                    await db.collection('PlayRoom').updateMany({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { "participants.$[].sfl": 'tie' } })
                                    msg.reply(`Both player tied, please re-spin by type /sfl again!`)
                                } else if (updatedRoomInfo.participants[0].sfl > updatedRoomInfo.participants[1].sfl && bothPlayersSFL(updatedRoomInfo.participants)) {
                                    const winningLife = updatedRoomInfo.participants[0].life;
                                    await db.collection('PlayRoom').updateMany({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { "participants.$[].life": winningLife, status: 'Ongoing', lifeStatus: 'Fixed' } })
                                    // await db.collection('PlayRoom').updateOne({ _id: ongoingPlayRoom._id }, { $set: { status: 'Ongoing', lifeStatus: 'Fixed' } }) // testing
                                    await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `${updatedRoomInfo.participants[0].username} won the SFL 🎯! life will be set to ${winningLife}🔥\nThe game will be started, please both players type /go to start the game!🎮`)
                                    await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `${updatedRoomInfo.participants[0].username} won the SFL 🎯! life will be set to ${winningLife}🔥\nThe game will be started, please both players type /go to start the game!🎮`)
                                } else if (updatedRoomInfo.participants[0].sfl < updatedRoomInfo.participants[1].sfl && bothPlayersSFL(updatedRoomInfo.participants)) {
                                    const winningLife = updatedRoomInfo.participants[1].life;
                                    await db.collection('PlayRoom').updateMany({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { "participants.$[].life": winningLife, status: 'Ongoing', lifeStatus: 'Fixed' } })
                                    // await db.collection('PlayRoom').updateOne({ groupId: msg.from }, { $set: { status: 'Ongoing', lifeStatus: 'Fixed' } }) // testing
                                    await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `${updatedRoomInfo.participants[1].username} won the SFL 🎯! life will be set to ${winningLife}🔥\nThe game will be started, please both players type /go to start the game!🎮`)
                                    await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `${updatedRoomInfo.participants[1].username} won the SFL 🎯! life will be set to ${winningLife}🔥\nThe game will be started, please both players type /go to start the game!🎮`)
                                } else if (!bothPlayersSFL(updatedRoomInfo.participants)) {
                                    await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, 'Please do /sfl to spin for life!')
                                    await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, 'Please do /sfl to spin for life!')
                                }
                            } else if (el.participant === sender && (el.sfl !== 'notdefined' || el.sfl !== 'tie')) {
                                msg.reply("You can't spin yet!")
                            }
                        })
                    }
                }
                if (ongoingRoom.status === 'Ongoing') {
                    if (command === '/go') {
                        let bothPlayerReady = false
                        let updatedRoomInfo;
                        ongoingRoom.participants.forEach(el => {
                            if (el.goStatus !== 'no') {
                                bothPlayerReady = true
                            }
                        })
                        ongoingRoom.participants.forEach(async (el) => {
                            if (el.participant === sender && el.goStatus === 'no' && !bothPlayerReady) {
                                updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { "participants.$[element].goStatus": 'ready' } }, { arrayFilters: [{ "element.participant": sender }], returnDocument: 'after' })
                                msg.reply(`✅ Your status has been set to ready! Please wait for other players ⏳`)
                            } else if (el.participant === sender && el.goStatus === 'no' && bothPlayerReady) {
                                updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { "participants.$[element].goStatus": 'ready', status: 'Playing' } }, { arrayFilters: [{ "element.participant": sender }], returnDocument: 'after' })
                                await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `🏁 Now we will start the game. To spin 🎯, ✍🏻 type /spin!`)
                                await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `🏁 Now we will start the game. To spin 🎯, ✍🏻 type /spin!`)
                            } else if (el.participant === sender && el.goStatus === 'ready' && !bothPlayerReady) {
                                whatsappClient.sendMessage(msg.from, 'Please wait for other player to /go!')
                            }
                        })
                        if (bothPlayerReady) {
                            if (ongoingRoom.participants[0].goStatus === 'ready' && ongoingRoom.participants[1].goStatus === 'ready') {
                                await db.collection('PlayRoom').updateOne({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { status: 'Playing' } })
                                whatsappClient.sendMessage(msg.from, `🏁 Now we will start the game. To spin 🎯, ✍🏻 type /spin!`)
                            }
                        }
                    }
                }
                if (ongoingRoom.status === 'Playing') {
                    if (command === '/spin') {
                        try {
                            await axios({
                                method: 'post',
                                url: `http://localhost:${process.env.PORT}/spin`,
                                data: {
                                    msg,
                                    ongoingRoom,
                                    ongoingPlayRoom
                                },
                            })
                            await axios({
                                method: 'post',
                                url: `http://localhost:${process.env.PORT}/validatespin`,
                                data: {
                                    msg,
                                    ongoingRoom,
                                    ongoingPlayRoom
                                },
                            })
                        } catch (error) {
                            console.log(error);
                        }
                        // const session = client.startSession();
                        // let bothPlayerSpin = false;
                        // const randomNumber = randomizeNumber();
                        // let updatedRoomInfo;
                        // await session.withTransaction(async () => {
                        //     if (ongoingRoom.spinTemp.length === 0) {
                        //         updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $push: { spinTemp: { participant: sender, number: randomNumber } } }, { returnDocument: 'after', session })
                        //         // msg.reply(`${sender} has spun the wheel and got ${randomNumber}!🎯`)
                        //         await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `${sender} has spun the wheel and got ${randomNumber}`)
                        //         await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `${sender} has spun the wheel and got ${randomNumber}`)
                        //     } else if (ongoingRoom.spinTemp.length === 1) {
                        //         ongoingRoom.spinTemp.forEach(async (el) => {
                        //             if (el.participant === sender) {
                        //                 return msg.reply('You already spun! Wait for your opponent to spin!')
                        //             } else {
                        //                 updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $push: { spinTemp: { participant: sender, number: randomNumber } } }, { returnDocument: 'after', session })
                        //                 await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `${sender} has spun the wheel and got ${randomNumber}`)
                        //                 await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `${sender} has spun the wheel and got ${randomNumber}`)
                        //                 if (updatedRoomInfo.spinTemp[0].number === 0 || updatedRoomInfo.spinTemp[1].number === 0) {
                        //                     let loserArray = [];
                        //                     updatedRoomInfo.spinTemp.forEach(el => {
                        //                         if (el.number !== 0) {
                        //                             loserArray.push(el);
                        //                         }
                        //                     })
                        //                     if (loserArray.length === 2) {
                        //                         // console.log('2-2nya 0')
                        //                         updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { spinTemp: [] } }, { returnDocument: 'after', session })
                        //                         // return whatsappClient.sendMessage(msg.from, `Both players tied, please /spin to continue the game`)
                        //                         await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `Both players tied, please /spin to continue the game!`)
                        //                         await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `Both players tied, please /spin to continue the game!`)
                        //                     } else if (loserArray.length === 1) {
                        //                         const loser = loserArray[0].participant;
                        //                         let updatedLoser;
                        //                         updatedRoomInfo.participants.forEach((el) => {
                        //                             if (el.participant === loser) {
                        //                                 updatedLoser = el;
                        //                             }
                        //                         })
                        //                         const loserLife = updatedLoser.life;
                        //                         updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { "participants.$[element].life": Number(loserLife) - 1, spinTemp: [] } }, { arrayFilters: [{ "element.participant": loser }], returnDocument: 'after', session })
                        //                         await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `✅Lifes Update:\n${updatedRoomInfo.participants[0].username}: ${updatedRoomInfo.participants[0].life}🔥\n${updatedRoomInfo.participants[1].username}: ${updatedRoomInfo.participants[1].life}🔥`)
                        //                         await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `✅Lifes Update:\n${updatedRoomInfo.participants[0].username}: ${updatedRoomInfo.participants[0].life}🔥\n${updatedRoomInfo.participants[1].username}: ${updatedRoomInfo.participants[1].life}🔥`)
                        //                     }
                        //                 }
                        //                 if (updatedRoomInfo.spinTemp.length === 2) {
                        //                     if (updatedRoomInfo.spinTemp[0]?.number > updatedRoomInfo.spinTemp[1]?.number) {
                        //                         const loser = updatedRoomInfo.spinTemp[1].participant
                        //                         let updatedLoser;
                        //                         updatedRoomInfo.participants.forEach((el) => {
                        //                             if (el.participant === loser) {
                        //                                 updatedLoser = el
                        //                             }
                        //                         })
                        //                         const loserLife = updatedLoser.life
                        //                         updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { "participants.$[element].life": Number(loserLife) - 1, spinTemp: [] } }, { arrayFilters: [{ "element.participant": loser }], returnDocument: 'after', session })
                        //                         // await db.collection('PlayRoom').updateOne({ _id: ongoingPlayRoom._id }, { $set: { spinTemp: [] } }) //testing diatas
                        //                         await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `✅Lifes Update:\n${updatedRoomInfo.participants[0].username}: ${updatedRoomInfo.participants[0].life}🔥\n${updatedRoomInfo.participants[1].username}: ${updatedRoomInfo.participants[1].life}🔥`)
                        //                         await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `✅Lifes Update:\n${updatedRoomInfo.participants[0].username}: ${updatedRoomInfo.participants[0].life}🔥\n${updatedRoomInfo.participants[1].username}: ${updatedRoomInfo.participants[1].life}🔥`)
                        //                     } else if (updatedRoomInfo.spinTemp[0]?.number < updatedRoomInfo.spinTemp[1]?.number) {
                        //                         const loser = updatedRoomInfo.spinTemp[0].participant
                        //                         let updatedLoser;
                        //                         updatedRoomInfo.participants.forEach((el) => {
                        //                             if (el.participant === loser) {
                        //                                 updatedLoser = el
                        //                             }
                        //                         })
                        //                         const loserLife = updatedLoser.life
                        //                         updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { "participants.$[element].life": Number(loserLife) - 1, spinTemp: [] } }, { arrayFilters: [{ "element.participant": loser }], returnDocument: 'after', session })
                        //                         // await db.collection('PlayRoom').updateOne({ _id: ongoingPlayRoom._id }, { $set: { spinTemp: [] } }) // testing diatas
                        //                         await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `✅Lifes Update:\n${updatedRoomInfo.participants[0].username}: ${updatedRoomInfo.participants[0].life}🔥\n${updatedRoomInfo.participants[1].username}: ${updatedRoomInfo.participants[1].life}🔥`)
                        //                         await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `✅Lifes Update:\n${updatedRoomInfo.participants[0].username}: ${updatedRoomInfo.participants[0].life}🔥\n${updatedRoomInfo.participants[1].username}: ${updatedRoomInfo.participants[1].life}🔥`)
                        //                     } else if (updatedRoomInfo.spinTemp[0]?.number === updatedRoomInfo.spinTemp[1]?.number) {
                        //                         await db.collection('PlayRoom').updateOne({ _id: ongoingPlayRoom._id }, { $set: { spinTemp: [] } }, { session })
                        //                         await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `Both players tied, please /spin to continue the game`)
                        //                         await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `Both players tied, please /spin to continue the game`)
                        //                     }
                        //                 }
                        //                 const updatedData = await db.collection('PlayRoom').findOne({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { session })
                        //                 if (!stillHasLifes(updatedData.participants)) {
                        //                     // const session = client.startSession();
                        //                     // let winner;
                        //                     // updatedData.participants.forEach(el => {
                        //                     //     if (el.life > 0) {
                        //                     //         winner = el
                        //                     //     }
                        //                     // })
                        //                     // // session.startTransaction();
                        //                     // const winningData = await db.collection('User').findOne({ participant: winner.participant }, { session })
                        //                     // let winningAmount = Math.floor(updatedData.totalAmount * 95 / 100);
                        //                     // // console.log(winningAmount, "<<< ini hasil menang")
                        //                     // await db.collection('User').updateOne({ participant: winner.participant }, { $set: { balance: winningAmount + winningData.balance } }, { session })
                        //                     // await db.collection('UserTransaction').insertOne({
                        //                     //     playRoomID: updatedRoomInfo._id,
                        //                     //     participant: winner.participant,
                        //                     //     description: 'Winner CSN',
                        //                     //     debit: parseInt(winningAmount),
                        //                     //     credit: 0
                        //                     // }, { session })
                        //                     // await db.collection('PlayRoom').updateOne({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { status: 'Finished', finishedTime: newDateNow() } }, { session })
                        //                     // await db.collection('IncomeTeam').insertOne({
                        //                     //     playRoomID: updatedRoomInfo._id,
                        //                     //     debit: updatedData.totalAmount - winningAmount,
                        //                     //     credit: 0,
                        //                     //     createdAt: newDateNow()
                        //                     // }, { session })
                        //                     const result = await checkWinner(updatedData, ongoingPlayRoom, updatedRoomInfo);
                        //                     // await session.commitTransaction();
                        //                     // await session.endSession();
                        //                     await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `Congratulations ${result.username}! Your balance has been updated!\nYou can do a rematch by doing /rematch <amount>\nFor example: /rematch 500`)
                        //                     await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `Congratulations ${result.username}! Your balance has been updated!\nYou can do a rematch by doing /rematch <amount>\nFor example: /rematch 500`)
                        //                 }
                        //             }
                        //         })
                        //     } else if (ongoingRoom.spinTemp.length === 2 && (ongoingRoom.spinTemp[0].participant === ongoingRoom.spinTemp[1].participant)) {
                        //         let loserLife;
                        //         ongoingRoom.participants.forEach(el => {
                        //             if (el.participant === ongoingRoom.spinTemp[0].participant) {
                        //                 loserLife = el.life
                        //             }
                        //         })
                        //         await whatsappClient.sendMessage(ongoingRoom.participants[0].participant, `${ongoingRoom.spinTemp[0].participant} did double! the life will be deducted 1!`)
                        //         await whatsappClient.sendMessage(ongoingRoom.participants[1].participant, `${ongoingRoom.spinTemp[0].participant} did double! the life will be deducted 1!`)
                        //         updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { "participants.$[element].life": Number(loserLife) - 1, spinTemp: [] } }, { arrayFilters: [{ "element.participant": ongoingRoom.spinTemp[0].participant }], returnDocument: 'after', session })
                        //         await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `✅Lifes Update:\n${updatedRoomInfo.participants[0].username}: ${updatedRoomInfo.participants[0].life}🔥\n${updatedRoomInfo.participants[1].username}: ${updatedRoomInfo.participants[1].life}🔥`)
                        //         await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `✅Lifes Update:\n${updatedRoomInfo.participants[0].username}: ${updatedRoomInfo.participants[0].life}🔥\n${updatedRoomInfo.participants[1].username}: ${updatedRoomInfo.participants[1].life}🔥`)
                        //         const updatedData = await db.collection('PlayRoom').findOne({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { session })
                        //         if (!stillHasLifes(updatedData.participants)) {
                        //             const result = await checkWinner(updatedData, ongoingPlayRoom, updatedRoomInfo);
                        //             await whatsappClient.sendMessage(updatedRoomInfo.participants[0].participant, `Congratulations ${result.username}! Your balance has been updated!\nYou can do a rematch by doing /rematch <amount>\nFor example: /rematch 500`)
                        //             await whatsappClient.sendMessage(updatedRoomInfo.participants[1].participant, `Congratulations ${result.username}! Your balance has been updated!\nYou can do a rematch by doing /rematch <amount>\nFor example: /rematch 500`)
                        //         }
                        //     }
                        // })
                    }
                }
                // if (command === '/report') {
                //     let inviteAdmin = adminList.map(el => el.participant)
                //     await chat.addParticipants(inviteAdmin);
                //     return msg.reply('Admins has been added, please kindly explain your problem once they replied to this group!')
                // }
            };


            if (ongoingPlayRoom === 'REME') {
                // console.log('masuk ke bagian reme')
                const roomInfo = await checkRoomInfo(sender);
                const ongoingRoom = await db.collection('PlayRoom').findOne({ groupId: msg.from, status: { $ne: 'Finished' } })

                // if (command === '/report') {
                //     let inviteAdmin = adminList.map(el => el.participant)
                //     await chat.addParticipants(inviteAdmin);
                //     return msg.reply('Admins has been added, please kindly explain your problem once they replied to this group!')
                // }

                if (ongoingRoom.status === 'Ongoing') {
                    if (command === '/go') {
                        // console.log('kebaca command /go')
                        let bothPlayerReady = false
                        let updatedRoomInfo;
                        ongoingRoom.participants.forEach(el => {
                            if (el.goStatus !== 'no') {
                                bothPlayerReady = true
                            }
                        })
                        ongoingRoom.participants.forEach(async (el) => {
                            if (el.participant === sender && el.goStatus === 'no' && !bothPlayerReady) {
                                // console.log('baru prtama x, belum ada yang ready')
                                updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { "participants.$[element].goStatus": 'ready' } }, { arrayFilters: [{ "element.participant": sender }], returnDocument: 'after' })
                                msg.reply(`✅ Your status has been set to ready! Please wait for other players ⏳`)
                            } else if (el.participant === sender && el.goStatus === 'no' && bothPlayerReady) {
                                // console.log('udah ada yang ready kok')
                                updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { "participants.$[element].goStatus": 'ready', status: 'Playing' } }, { arrayFilters: [{ "element.participant": sender }], returnDocument: 'after' })
                                return whatsappClient.sendMessage(msg.from, `🏁 Now we will start the game. To spin 🎯, ✍🏻 type /spin!`)
                            } else if (el.participant === sender && el.goStatus === 'ready' && !bothPlayerReady) {
                                // console.log('yang ngirim saama brjit')
                                whatsappClient.sendMessage(msg.from, 'Please wait for other player to /go!')
                            }
                        })
                        if (bothPlayerReady) {
                            if (ongoingRoom.participants[0].goStatus === 'ready' && ongoingRoom.participants[1].goStatus === 'ready') {
                                await db.collection('PlayRoom').updateOne({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { status: 'Playing' } })
                                whatsappClient.sendMessage(msg.from, `🏁 Now we will start the game. To spin 🎯, ✍🏻 type /spin!`)
                            }
                        }
                    }
                }

                if (ongoingRoom.status === 'Playing') {
                    if (command === '/spin') {
                        const session = client.startSession();
                        let randomNumber = randomizeNumber();
                        let updatedRoomInfo;
                        let resultNumber;
                        if (randomNumber >= 10) {
                            resultNumber = String(randomNumber);
                            resultNumber = parseInt(resultNumber[0]) + parseInt(resultNumber[1])
                            if (resultNumber >= 10) {
                                resultNumber = String(resultNumber);
                                resultNumber = parseInt(resultNumber[1])
                            }
                        } else {
                            resultNumber = randomNumber;
                        }
                        const user = await db.collection('User').findOne({ participant: sender });
                        await session.withTransaction(async () => {
                            if (ongoingRoom.spinTemp.length === 0) {
                                await db.collection('PlayRoom').updateOne({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $push: { spinTemp: { participant: sender, number: randomNumber, remeNumber: resultNumber, role: user.role, username: user.username } } }, { session });
                                msg.reply(`${sender} has spun the wheel and got ${randomNumber}!🎯`)
                                // console.log(session.hasEnded, "<<< didalam ===0")
                            } else if (ongoingRoom.spinTemp.length === 1) {
                                // console.log(session.hasEnded, "<<< didalam else if")
                                ongoingRoom.spinTemp.forEach(async (el) => {
                                    // console.log(session.hasEnded), "<<< didalam loop"
                                    if (el.participant === sender) {
                                        // console.log(session.hasEnded, "<<< didalam if pertama loop")
                                        return msg.reply('You already spun! Wait for your opponent to spin!')
                                    } else {
                                        // console.log(session.hasEnded, "<< tempat masalah")
                                        updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $push: { spinTemp: { participant: sender, number: randomNumber, role: user.role, remeNumber: resultNumber, username: user.username } } }, { returnDocument: 'after', session })
                                        msg.reply(`${sender} has spun the wheel and got ${randomNumber}!🎯`)
                                        const winningPrizeAdmin = parseInt(updatedRoomInfo.totalAmount) + parseInt(updatedRoomInfo.hosterHold); //
                                        const winningPrizePlayerJP = parseInt(updatedRoomInfo.totalAmount) + parseInt(updatedRoomInfo.hosterHold); //
                                        const winningPrizePlayer = parseInt(updatedRoomInfo.totalAmount)
                                        const refundAdmin = parseInt(updatedRoomInfo.totalAmount) / 2
                                        // console.log(winningPrizeAdmin, winningPrizePlayerJP, winningPrizePlayer, refundAdmin)
                                        if (updatedRoomInfo.spinTemp.length === 2) {
                                            if (updatedRoomInfo.spinTemp[0].remeNumber === 0 || updatedRoomInfo.spinTemp[1].remeNumber === 0) {
                                                let bothZero = true;
                                                updatedRoomInfo.spinTemp.forEach(el => {
                                                    if (el.remeNumber !== 0) {
                                                        bothZero = false;
                                                    }
                                                })
                                                if (bothZero) {
                                                    let winnerUser;
                                                    updatedRoomInfo.spinTemp.forEach(el => {
                                                        if (el.role === 'hoster') {
                                                            winnerUser = el;
                                                        }
                                                    });
                                                    await db.collection('User').updateOne({ participant: winnerUser.participant }, { $inc: { balance: winningPrizeAdmin } }, { session });
                                                    await db.collection('PlayRoom').updateOne({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { status: 'Finished', finishedTime: newDateNow() } }, { session });
                                                    return whatsappClient.sendMessage(msg.from, `Congratulations Hoster! Your balance has been updated!`)
                                                } else {
                                                    if (updatedRoomInfo.spinTemp[0].remeNumber === 0) {
                                                        await db.collection('User').updateOne({ participant: updatedRoomInfo.spinTemp[0].participant }, { $inc: { balance: winningPrizeAdmin } }, { session });
                                                        await db.collection('PlayRoom').updateOne({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { status: 'Finished', finishedTime: newDateNow() } }, { session });
                                                        return whatsappClient.sendMessage(msg.from, `Congratulations ${updatedRoomInfo.spinTemp[0].username}! Your balance has been updated!`)
                                                    } else if (updatedRoomInfo.spinTemp[1].remeNumber === 0) {
                                                        await db.collection('User').updateOne({ participant: updatedRoomInfo.spinTemp[1].participant }, { $inc: { balance: winningPrizeAdmin } }, { session });
                                                        await db.collection('PlayRoom').updateOne({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { status: 'Finished', finishedTime: newDateNow() } }, { session });
                                                        return whatsappClient.sendMessage(msg.from, `Congratulations ${updatedRoomInfo.spinTemp[1].username}! Your balance has been updated!`)
                                                    }
                                                }
                                            }
                                            if (updatedRoomInfo.spinTemp[0].remeNumber > updatedRoomInfo.spinTemp[1].remeNumber) {
                                                if (updatedRoomInfo.spinTemp[0].role === 'hoster') {
                                                    await db.collection('User').updateOne({ participant: updatedRoomInfo.spinTemp[0].participant }, { $inc: { balance: winningPrizeAdmin } }, { session });
                                                    await db.collection('UserTransaction').insertOne({
                                                        playRoomID: updatedRoomInfo._id,
                                                        participant: updatedRoomInfo.spinTemp[0].participant,
                                                        description: 'Winner REME',
                                                        debit: winningPrizeAdmin,
                                                        credit: 0
                                                    }, { session })
                                                    await db.collection('PlayRoom').updateOne({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { status: 'Finished', finishedTime: newDateNow() } }, { session })
                                                    return whatsappClient.sendMessage(msg.from, `Congratulations Hoster! Your balance has been updated!`)
                                                } else {
                                                    // const user = await db.collection('User').findOne({participant: updatedRoomInfo.spinTemp[0].participant})
                                                    await db.collection('User').updateOne({ participant: updatedRoomInfo.spinTemp[0].participant }, { $inc: { balance: winningPrizePlayer } }, { session });
                                                    await db.collection('UserTransaction').insertOne({
                                                        playRoomID: updatedRoomInfo._id,
                                                        participant: updatedRoomInfo.spinTemp[0].participant,
                                                        description: 'Winner REME',
                                                        debit: winningPrizePlayer,
                                                        credit: 0
                                                    }, { session })
                                                    await db.collection('User').updateOne({ participant: updatedRoomInfo.spinTemp[1].participant }, { $inc: { balance: refundAdmin } }, { session });
                                                    await db.collection('UserTransaction').insertOne({
                                                        playRoomID: updatedRoomInfo._id,
                                                        participant: updatedRoomInfo.spinTemp[1].participant,
                                                        description: `Refund hoster's WLS (REME)`,
                                                        debit: refundAdmin,
                                                        credit: 0
                                                    }, { session })
                                                    await db.collection('PlayRoom').updateOne({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { status: 'Finished', finishedTime: newDateNow() } }, { session })
                                                    return whatsappClient.sendMessage(msg.from, `Congratulations ${updatedRoomInfo.spinTemp[0].username}! Your balance has been updated!`);
                                                }
                                            } else if (updatedRoomInfo.spinTemp[0].remeNumber < updatedRoomInfo.spinTemp[1].remeNumber) {
                                                if (updatedRoomInfo.spinTemp[1].role === 'hoster') {
                                                    await db.collection('User').updateOne({ participant: updatedRoomInfo.spinTemp[1].participant }, { $inc: { balance: winningPrizeAdmin } }, { session });
                                                    await db.collection('UserTransaction').insertOne({
                                                        playRoomID: updatedRoomInfo._id,
                                                        participant: updatedRoomInfo.spinTemp[1].participant,
                                                        description: 'Winner REME',
                                                        debit: winningPrizeAdmin,
                                                        credit: 0
                                                    }, { session })
                                                    await db.collection('PlayRoom').updateOne({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { status: 'Finished', finishedTime: newDateNow() } }, { session })
                                                    return whatsappClient.sendMessage(msg.from, `Congratulations Hoster! Your balance has been updated!`)
                                                } else {
                                                    // const user = await db.collection('User').findOne({participant: updatedRoomInfo.spinTemp[1].participant})
                                                    await db.collection('User').updateOne({ participant: updatedRoomInfo.spinTemp[1].participant }, { $inc: { balance: winningPrizePlayer } }, { session });
                                                    await db.collection('UserTransaction').insertOne({
                                                        playRoomID: updatedRoomInfo._id,
                                                        participant: updatedRoomInfo.spinTemp[1].participant,
                                                        description: 'Winner REME',
                                                        debit: winningPrizePlayer,
                                                        credit: 0
                                                    }, { session })
                                                    await db.collection('User').updateOne({ participant: updatedRoomInfo.spinTemp[0].participant }, { $inc: { balance: refundAdmin } }, { session });
                                                    await db.collection('UserTransaction').insertOne({
                                                        playRoomID: updatedRoomInfo._id,
                                                        participant: updatedRoomInfo.spinTemp[0].participant,
                                                        description: `Refund hoster's WLS (REME)`,
                                                        debit: refundAdmin,
                                                        credit: 0
                                                    }, { session })
                                                    await db.collection('PlayRoom').updateOne({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { status: 'Finished', finishedTime: newDateNow() } }, { session })
                                                    return whatsappClient.sendMessage(msg.from, `Congratulations ${updatedRoomInfo.spinTemp[1].username}! Your balance has been updated!`);
                                                }
                                            } else if (updatedRoomInfo.spinTemp[0].remeNumber === updatedRoomInfo.spinTemp[1].remeNumber) {
                                                if (updatedRoomInfo.spinTemp[1].role === 'hoster') {
                                                    await db.collection('User').updateOne({ participant: updatedRoomInfo.spinTemp[1].participant }, { $inc: { balance: winningPrizeAdmin } }, { session });
                                                    await db.collection('UserTransaction').insertOne({
                                                        playRoomID: updatedRoomInfo._id,
                                                        participant: updatedRoomInfo.spinTemp[1].participant,
                                                        description: `Winner REME`,
                                                        debit: winningPrizeAdmin,
                                                        credit: 0
                                                    }, { session })
                                                    await db.collection('PlayRoom').updateOne({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { status: 'Finished', finishedTime: newDateNow() } }, { session })
                                                    return whatsappClient.sendMessage(msg.from, `Congratulations Hoster! Your balance has been updated!`)
                                                } else if (updatedRoomInfo.spinTemp[0].role === 'hoster') {
                                                    await db.collection('User').updateOne({ participant: updatedRoomInfo.spinTemp[0].participant }, { $inc: { balance: winningPrizeAdmin } }, { session });
                                                    await db.collection('UserTransaction').insertOne({
                                                        playRoomID: updatedRoomInfo._id,
                                                        participant: updatedRoomInfo.spinTemp[0].participant,
                                                        description: `Winner REME`,
                                                        debit: winningPrizeAdmin,
                                                        credit: 0
                                                    }, { session })
                                                    await db.collection('PlayRoom').updateOne({ _id: ongoingPlayRoom._id, status: { $ne: 'Finished' } }, { $set: { status: 'Finished', finishedTime: newDateNow() } }, { session })
                                                    return whatsappClient.sendMessage(msg.from, `Congratulations Hoster! Your balance has been updated!`)
                                                }
                                            }
                                        }
                                    }
                                })
                            }
                        })
                    }
                } // done usertransaction
            }

            // if (finishedPlayRoom) {
            //     if (command === '/rematch') {
            //         const roomInfo = await db.collection('PlayRoom').findOne({ groupId: msg.from, status: 'Finished', rematch: 'no' })
            //         const session = client.startSession();
            //         const amount = parseInt(msg.body.split(" ")[1]);
            //         let updatedRoomInfo;
            //         if (!allGameFinished(msg.from)) return msg.reply(`You can't start new game if the previous game is not finished!`);
            //         const user = await db.collection('User').findOne({ participant: sender });
            //         if (roomInfo.game === 'CSN') {
            //             if (user.balance < amount) return msg.reply(`You don't have enough balance to start new game!`);
            //             session.startTransaction();
            //             if (roomInfo.rematchInfo.length === 0) {
            //                 await db.collection('PlayRoom').updateOne({ _id: new ObjectId(roomInfo._id) }, { $push: { rematchInfo: { participant: sender, amount: amount, username: user.username } } }, { session });
            //                 await db.collection('RematchQueue').insertOne({
            //                     participant: sender,
            //                     amount: amount,
            //                     groupId: msg.from,
            //                     game: 'CSN',
            //                     status: 'waiting',
            //                     createdAt: newDateNow()
            //                 }, { session })
            //                 await db.collection('User').updateOne({ participant: sender }, { $inc: { balance: -amount } }, { session })
            //                 await session.commitTransaction();
            //                 return msg.reply(`${user.username} just asked for a rematch ${amount} WLS!`)
            //             } else if (roomInfo.rematchInfo.length === 1) {
            //                 if (roomInfo.rematchInfo[0].participant === sender) {
            //                     return msg.reply(`Please wait for other players to do /rematch!`)
            //                 } else {
            //                     updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: new ObjectId(roomInfo._id) }, { $push: { rematchInfo: { participant: sender, amount: amount, username: user.username } } }, { session, returnDocument: 'after' });
            //                     await db.collection('User').updateOne({ participant: sender }, { $inc: { balance: -amount } }, { session })
            //                     if (updatedRoomInfo.rematchInfo[0].amount !== updatedRoomInfo.rematchInfo[1].amount) {
            //                         // console.log('kalo /rematch nya gasama')
            //                         await db.collection('User').updateOne({ participant: roomInfo.rematchInfo[0].participant }, { $inc: { balance: roomInfo.rematchInfo[0].amount } }, { session });
            //                         await db.collection('RematchQueue').deleteOne({ participant: roomInfo.rematchInfo[0].participant, groupId: msg.from, status: 'waiting' }, { session });
            //                         await db.collection('User').updateOne({ participant: sender }, { $inc: { balance: amount } }, { session });
            //                         await db.collection('PlayRoom').updateOne({ _id: new ObjectId(roomInfo._id) }, { $set: { rematchInfo: [] } }, { session })
            //                         await session.commitTransaction();
            //                         return msg.reply(`The rematch amount that you input against the other player is mismatched! Please input same amount!`)
            //                     } else {
            //                         await db.collection('PlayRoom').insertOne({
            //                             participants: [
            //                                 {
            //                                     participant: updatedRoomInfo.rematchInfo[0].participant,
            //                                     username: updatedRoomInfo.rematchInfo[0].username,
            //                                     life: 'notdefined',
            //                                     goStatus: 'no',
            //                                     sfl: 'notdefined'
            //                                 },
            //                                 {
            //                                     participant: updatedRoomInfo.rematchInfo[1].participant,
            //                                     username: updatedRoomInfo.rematchInfo[1].username,
            //                                     life: 'notdefined',
            //                                     goStatus: 'no',
            //                                     sfl: 'notdefined'
            //                                 }
            //                             ],
            //                             status: 'Setting Up',
            //                             lifeStatus: 'Undecided',
            //                             totalAmount: amount * 2,
            //                             game: 'CSN',
            //                             spinTemp: [],
            //                             rematch: 'no',
            //                             rematchInfo: [],
            //                             createdAt: newDateNow(),
            //                             groupId: msg.from
            //                         }, { session })
            //                         await db.collection('RematchQueue').deleteOne({ groupId: msg.from, status: 'waiting' }, { session })
            //                         await db.collection('PlayRoom').updateOne({ _id: new ObjectId(roomInfo._id) }, { $set: { rematch: 'yes' } }, { session })
            //                         await session.commitTransaction();
            //                         return await whatsappClient.sendMessage(msg.from, `The rematch will be started! Please /life to decide your lifes!`);
            //                     }
            //                 }
            //             }
            //         } else if (roomInfo.game === 'REME') {
            //             if (user.balance < amount * 2 && user.role === 'hoster') return msg.reply(`You don't have enough balance to host this game!`)
            //             if (user.balance < amount && user.role !== 'hoster') return msg.reply(`You don't have enough balance to rematch!`)
            //             session.startTransaction();
            //             if (roomInfo.rematchInfo.length === 0) {
            //                 await db.collection('PlayRoom').updateOne({ _id: new ObjectId(roomInfo._id) }, { $push: { rematchInfo: { participant: sender, amount: amount, username: user.username, role: user.role } } }, { session });
            //                 await db.collection('RematchQueue').insertOne({
            //                     participant: sender,
            //                     amount: amount,
            //                     holdAmount: user.role === 'hoster' ? amount : 0,
            //                     groupId: msg.from,
            //                     game: 'REME',
            //                     status: 'waiting',
            //                     createdAt: newDateNow(),
            //                     role: user.role
            //                 }, { session })
            //                 if (user.role === 'player') {
            //                     await db.collection('User').updateOne({ participant: sender }, { $inc: { balance: -amount } }, { session })
            //                     await session.commitTransaction();
            //                 } else if (user.role === 'hoster') {
            //                     await db.collection('User').updateOne({ participant: sender }, { $inc: { balance: -(amount * 2) } }, { session })
            //                     await session.commitTransaction();
            //                 }
            //                 return msg.reply(`${user.username} just asked for a rematch ${amount} WLS!`)
            //             } else if (roomInfo.rematchInfo.length === 1) {
            //                 if (roomInfo.rematchInfo[0].participant === sender) {
            //                     return msg.reply(`Please wait for other players to do /rematch!`)
            //                 } else {
            //                     updatedRoomInfo = await db.collection('PlayRoom').findOneAndUpdate({ _id: new ObjectId(roomInfo._id) }, { $push: { rematchInfo: { participant: sender, amount: amount, username: user.username, role: user.role } } }, { session, returnDocument: 'after' });
            //                     await db.collection('User').updateOne({ participant: sender }, { $inc: { balance: user.role === 'hoster' ? -(amount * 2) : -amount } }, { session })
            //                     if (updatedRoomInfo.rematchInfo[0].amount !== updatedRoomInfo.rematchInfo[1].amount) {
            //                         await db.collection('User').updateOne({ participant: roomInfo.rematchInfo[0].participant }, { $inc: { balance: roomInfo.rematchInfo[0].amount + roomInfo.rematchInfo[0].holdAmount } }, { session });
            //                         await db.collection('RematchQueue').deleteOne({ participant: roomInfo.rematchInfo[0].participant, groupId: msg.from, status: 'waiting' }, { session });
            //                         await db.collection('User').updateOne({ participant: sender }, { $inc: { balance: user.role === 'hoster' ? amount * 2 : amount } }, { session });
            //                         await db.collection('PlayRoom').updateOne({ _id: new ObjectId(roomInfo._id) }, { $set: { rematchInfo: [] } }, { session })
            //                         await session.commitTransaction();
            //                         return msg.reply(`The rematch amount that you input against the other player is mismatched! Please input same amount!`)
            //                     } else {
            //                         let tempParticipants = [];
            //                         roomInfo.participants.forEach(el => {
            //                             el.life = 1;
            //                             el.goStatus = 'no'
            //                             tempParticipants.push(el)
            //                         })
            //                         await db.collection('PlayRoom').insertOne({
            //                             participants: tempParticipants,
            //                             totalAmount: +updatedRoomInfo.rematchInfo[0].amount * 2,
            //                             hosterHold: +updatedRoomInfo.rematchInfo[0].amount,
            //                             status: 'Ongoing',
            //                             game: 'REME',
            //                             spinTemp: [],
            //                             rematch: 'no',
            //                             rematchInfo: [],
            //                             createdAt: newDateNow(),
            //                             groupId: msg.from
            //                         }, { session });
            //                         await db.collection('RematchQueue').deleteOne({ groupId: msg.from, status: 'waiting' }, { session })
            //                         await db.collection('PlayRoom').updateOne({ _id: new ObjectId(roomInfo._id) }, { $set: { rematch: 'yes' } }, { session })
            //                         await session.commitTransaction();
            //                         return await whatsappClient.sendMessage(msg.from, `The rematch will be started! Please /go to start the game!`);
            //                     }
            //                 }
            //             }
            //         }
            //         await session.endSession()
            //     }
            // }

            if (msg.from === '120363305913636485@g.us' || msg.from === '120363306085218728@g.us') {

                if (command === '/csn') {
                    await axios({
                        method: 'post',
                        url: `http://localhost:${process.env.PORT}/csn`,
                        data: {
                            msg
                        }
                    })
                }

                if (command === '/reme') {
                    await axios({
                        method: 'post',
                        url: `http://localhost:${process.env.PORT}/reme`,
                        data: {
                            msg
                        }
                    })
                }

                if (command === '/host') {
                    let amount = msg.body.split(" ")[1];
                    amount = Number(amount);

                    if (isNaN(amount) || amount < 1) {
                        return msg.reply(`Invalid Amount! Please input valid amount!`)
                    };
                    const user = await db.collection('User').findOne({ participant: sender });
                    if (user.role !== 'hoster') return msg.reply(`You are not allowed to do this action!`);
                    if (user.balance < (amount * 2)) return msg.reply(`You don't have enough balance to host the game!`)
                    const findQueue = await db.collection('PlayQueue').findOne({
                        bet: amount, participant: { $ne: user.participant }, status: 'waiting', game: 'REME'
                    })
                    const session = client.startSession();
                    try {
                        if (findQueue) {
                            user.balance -= (amount * 2);
                            await session.withTransaction(async () => {
                                await db.collection('User').updateOne(
                                    { participant: user.participant },
                                    { $set: { balance: user.balance } },
                                    { session }
                                );
                                await db.collection('PlayQueue').deleteOne({ _id: new ObjectId(findQueue._id) }, { session });
                                const newRoom = await db.collection('PlayRoom').insertOne({
                                    participants: [
                                        {
                                            username: findQueue.username,
                                            participant: findQueue.participant,
                                            life: 1,
                                            goStatus: 'no'
                                        },
                                        {
                                            username: user.username,
                                            participant: user.participant,
                                            life: 1,
                                            goStatus: 'no',
                                            role: 'hoster'
                                        }
                                    ],
                                    totalAmount: +findQueue.bet * 2,
                                    hosterHold: +findQueue.bet,
                                    status: 'Ongoing',
                                    game: 'REME',
                                    spinTemp: [],
                                    rematch: 'no',
                                    rematchInfo: [],
                                    createdAt: newDateNow()
                                }, { session });
                                await db.collection('UserTransaction').insertOne({
                                    participant: user.participant,
                                    description: 'Host REME Queue',
                                    queueID: findQueue._id,
                                    playRoomID: newRoom.insertedId,
                                    debit: 0,
                                    credit: (amount * 2)
                                }, { session })
                                await db.collection('UserTransaction').updateOne(
                                    { queueID: new ObjectId(findQueue._id) },
                                    { $set: { playRoomID: newRoom.insertedId } },
                                    { session }
                                );
                                msg.reply('You have been invited to the Play Room, if you disabled invitation from unknown number, please check your WhatsApp message for invitation links!')
                                // await db.collection('PlayRoom').updateOne({ _id: newRoom.insertedId }, { $set: { groupId: groupId.gid._serialized } }, { session })
                                await whatsappClient.sendMessage(groupId.gid._serialized, `The game will be started, please both players type /go to start the game!🎮`)
                            })
                        }
                        session.endSession();
                    } catch (error) {
                        console.log(error);
                        await session.abortTransaction();
                        session.endSession();
                        msg.reply(`Error while creating game: ${error}`)
                    }
                }

                if (command === '/queue') {
                    const fetchList = db.collection('PlayQueue').find()
                    let queueList = "Here is the queue's lists: "
                    for await (const doc of fetchList) {
                        if (doc.status === 'waiting') {
                            queueList += `\n\nusername: ${doc.username}\ngame: ${doc.game}\nbet amount: ${doc.bet}`
                        }
                    }
                    return msg.reply(queueList)
                }

                if (command === '/cancel') {
                    const session = client.startSession();
                    session.startTransaction();
                    try {
                        const fetchList = db.collection('PlayQueue').find({ participant: sender, status: 'waiting' });
                        const playerQueueList = await fetchList.toArray();
                        if (playerQueueList.length === 0) return msg.reply('You do not have any queues!')
                        let totalRefund = 0;

                        for (const el of playerQueueList) {
                            totalRefund += +el.bet;
                        }

                        await Promise.all(playerQueueList.map((el) => db.collection('PlayQueue').deleteOne({ _id: el._id }, { session })));
                        await db.collection('User').updateOne({ participant: sender }, { $inc: { balance: totalRefund } }, { session });
                        await db.collection('UserTransaction').insertOne({
                            participant: sender,
                            description: 'Cancel Queues',
                            debit: totalRefund,
                            credit: 0,
                            cancelledQueueList: playerQueueList
                        }, { session })
                        await session.commitTransaction();
                        msg.reply(`All of your queues has been deleted! Please check your balance!`)
                    } catch (err) {
                        await session.abortTransaction();
                        console.error(err);
                    } finally {
                        session.endSession();
                    }
                }

                if (command === '/help') {
                    msg.reply(`Here are lists of commands that you can use:\n1. /register <nickname>\n    - Example: /register AzureLen318\n2. /info\n    - Used to check your balance, nickname, and other personal data.\n3. /csn <amount>\n    - Example: /csn 500\n    - Commands to play csn, with amount 500WLS, or any other amount that you want.\n    - The game will start once someone input the same amount, and you will be invited to new GroupChat to play!\n4. /queue\n    - Used to check all games queue(s), yours also included!\n5. /cancel\n    - Used to cancel all of your game lists.\n    - If you cancel, the amount of WLS will be returned back to your balance, so don't worry!\n6. /claim <code>\n    - Example: /claim GIVEAWAY\n    - Used to claim code whenever admin shared a giveaway codes.\n    - Each player can only claim once!\n7. /reme <amount>\n    - Example: /reme 500\n    - Commands to play reme, with amount 500WLS, or any other amount that you want.\n    - The game will start once someone host you with same amount, and you will be invited to new GroupChat to play!\n8. /host <amount>\n    - Example: /host 500\n    - Used to host reme game.\n    - CAN ONLY BE USED FOR THOSE WHO ARE HOSTER!\n9. /go\n    - Used to start game, inside the PlayRoom.\n10. /sfl\n    - Used to do Spin For Life.\n11. /spin\n    - Used to spin when you play either CSN or REME.\n12. /wd <amount> <worldName>\n    - Example: /wd 1000 MYWORLD\n    - Used to withdraw your balance\n`)
                }

                if (command === '/giveaccess') {
                    const session = client.startSession();
                    const senderIsAdmin = isAdmin(adminList, sender)
                    if (!senderIsAdmin) return msg.reply(`You can't do this action!`)
                    const username = msg.body.split(" ")[1];
                    const time = parseInt(msg.body.split(" ")[2]);
                    if (!time) return msg.reply(`Please input valid time!`)
                    const userInfo = await db.collection('User').findOne({ username: username });
                    if (!userInfo) return msg.reply(`Username not found! Please check again!`)
                    const dateNow = newDateNow();
                    await session.withTransaction(async () => {
                        if (userInfo.expiredDate) {
                            let newExpire;
                            if (userInfo.expiredDate < dateNow) {
                                newExpire = new Date(dateNow.getTime() + (1000 * 60 * 60 * time));
                                await db.collection('User').updateOne({ username: username }, { $set: { expiredDate: newExpire, role: 'hoster' } }, { session });
                                return msg.reply(`User with nickname ${username} has given 'hoster' role for ${time} Hours!`)
                            } else if (userInfo.expiredDate > dateNow) {
                                newExpire = new Date(userInfo.expiredDate.getTime() + (1000 * 60 * 60 * time));
                                await db.collection('User').updateOne({ username: username }, { $set: { expiredDate: newExpire, role: 'hoster' } }, { session });
                                return msg.reply(`User with nickname ${username} has given 'hoster' role for ${time} Hours!`)
                            }
                        } else {
                            newExpire = new Date(dateNow.getTime() + (1000 * 60 * 60 * time));
                            await db.collection('User').updateOne({ username: username }, { $set: { expiredDate: newExpire, role: 'hoster' } }, { session });
                            return msg.reply(`User with nickname ${username} has given 'hoster' role for ${time} Hours!`)
                        }
                    })
                    await session.endSession();
                }
            }

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
                        url: 'http://localhost:80/info',
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
                        url: 'http://localhost:80/claim',
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

            if (msg.from === '120363310970299021@g.us') {
                if (command === '/wd') {
                    const session = client.startSession();
                    let amount = msg.body.split(" ")[1];
                    if (!amount) return msg.reply(`Please input valid amount to withdraw!\nFor example: /wd 500 MYWORLD`)
                    amount = parseInt(amount);
                    if (amount < 100 || !amount) return msg.reply(`The minimum amount to withdraw is 100 World Locks!`)
                    const worldName = msg.body.split(" ")[2];
                    if (!worldName || worldName === "") return msg.reply(`Please input valid world name!\nFor example: /wd 500 MYWORLD`)
                    const userInfo = await db.collection('User').findOne({ participant: sender });
                    if (userInfo.balance < amount || isNaN(userInfo.balance)) {
                        return msg.reply(`You do not have enough balance!`)
                    }
                    await session.withTransaction(async () => {
                        await db.collection('User').updateOne({ participant: userInfo.participant }, { $inc: { balance: -amount } }, { session });
                        await db.collection('Withdrawal').insertOne({
                            participant: userInfo.participant,
                            amount: amount,
                            worldName: worldName,
                            status: 'active',
                            createdAt: newDateNow(),
                            updatedAt: newDateNow()
                        }, { session });
                        msg.reply('Your withdrawal is accepted! We will process it shortly!');
                    });
                };
            }
        }
    } catch (error) {
        console.log(error);
    }
})

module.exports = whatsappClient;
