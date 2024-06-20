
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType }  = require('discord.js');
const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs');
const CronJob = require('cron').CronJob;
const { DateTime } = require('luxon');
const { channel } = require('diagnostics_channel');
const Jimp = require('jimp');



const rollJob = new CronJob(
	'*/30 * * * *', // cronTime
	function () {
		console.log('Resetting rolls for all users...');
        resetAllRolls();
	}, 
	null, 
	true, 
	"Africa/Casablanca"
);

const claimJob = new CronJob(
	'*/30 */1 * * *', // cronTime
	function () {
		console.log('Resetting rolls for all users...');
        resetAllClaims();
	}, 
	null, 
	true, 
	"Africa/Casablanca"
);

dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const query = `
query ($page: Int, $perPage: Int) {
    Page (page: $page, perPage: $perPage) {
      pageInfo {
        total
        currentPage
        lastPage
        hasNextPage
        perPage
      }
      characters (sort: [FAVOURITES_DESC]) {
        id
        gender
        name {
          full
        }
        image {
          large
        }
        favourites
        media {
          nodes {
            id
            title {
              romaji
              english
            }
            averageScore
            popularity
          }
        }
      }
    }
  }
`;

let cooldowns = {}
let characters = [];
let claimedCharacters = {};
let balances = {};
let halalGifs = [];

const currencyEmoji = '<a:4506minecraftdiamond2:1253331619326984275>'

const usersFile = './database/users.json';
const charactersFile = './database/characters.json';
const gifsFile = './database/gifs.json'

function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  }

function loadData() {
    if (fs.existsSync(usersFile)) {
        const userData = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        claimedCharacters = userData.claimedCharacters || {};
        balances = userData.balances || {};
        cooldowns = userData.cooldowns || {}; 
    }

    if (fs.existsSync(charactersFile)) {
        characters = JSON.parse(fs.readFileSync(charactersFile, 'utf8')).characters || [];
        
    }
    if (fs.existsSync(gifsFile)) {
        halalGifs = JSON.parse(fs.readFileSync(gifsFile, 'utf8')).gifs || [];
        
    }
}

// Save data to JSON files
function saveData() {
    const userData = { claimedCharacters, balances, cooldowns };
    fs.writeFileSync(usersFile, JSON.stringify(userData, null, 2));

    const characterData = { characters };
    fs.writeFileSync(charactersFile, JSON.stringify(characterData, null, 2));
}

/* -------------------------------- CRUD Coins Functions -------------------------------- */

function getBalance(userId) {
    if (!balances[userId]) {
        balances[userId] = 0;
    }
    return balances[userId];
}

// Add currency to user
function addCurrency(userId, amount) {
    if (!balances[userId]) {
        balances[userId] = 0;
    }
    balances[userId] += amount;
    saveData();
}

// Deduct currency from user
function deductCurrency(userId, amount) {
    if (!balances[userId]) {
        balances[userId] = 0;
    }
    balances[userId] -= amount;
    saveData();
}


function dailyClaim(message, userId){
    const now = DateTime.now();

    if (!cooldowns[userId].lastDailyClaimed) {
        cooldowns[userId].lastDailyClaimed = now;
    } else {
        const lastClaimedDate = DateTime.fromISO(cooldowns[userId].lastDailyClaimed);
        const nextClaimDate = lastClaimedDate.plus({ hours: 24 });

        if (now < nextClaimDate) {
            const timeLeft = calculateTimeUntilNextReset(nextClaimDate);
            message.reply(`Please wait ${timeLeft} before mining ${currencyEmoji} again.`);
            return;
        }
    }

    const reward = Math.ceil(Math.random()*1000)

    addCurrency(userId, reward);

    cooldowns[userId].lastDailyClaimed = now.toISO();
    saveData()

    message.reply(`**+${reward}** ${currencyEmoji} mined today! see you tomorrow! (**${balances[userId]}** total)`);
}

/* -------------------------------- Characters Functions -------------------------------- */

async function fetchCharacters() {
    let page = 201;
    const perPage = 50; 
    
    try {
      while (true) {
        const response = await axios.post('https://graphql.anilist.co', {
          query: query,
          variables: { page: page, perPage: perPage }
        });
  
        const pageInfo = response.data.data.Page.pageInfo;
        const fetchedCharacters = response.data.data.Page.characters;

        const transformedCharacters = transformCharacters(fetchedCharacters);

        characters.push(...transformedCharacters);
  
        // Check if there are more pages to fetch
        if (!pageInfo.hasNextPage) {
          break;
        }
  
        // Increment page for the next request
        page++;
        saveData()
      }
  
      console.log('Characters fetched:', characters.length);
  
    } catch (error) {
      console.error('Error fetching characters:', error);
      console.log('Next page is', page+1)
    }
  }
  
  // Function to transform characters into desired format with favourites as value
function transformCharacters(characters) {
    const transformedCharacters = [];
    const maxFavourites = 32670; // Standard maximum favourites

    // Iterate through characters fetched from AniList
    characters.forEach(character => {
        const { id, name, image, favourites, media, gender } = character;
        const { full } = name;
        const { large } = image;

        // Sort media nodes by popularity (already sorted by GraphQL query)
        const topMedia = media.nodes[0];
        
        const initialValue = (favourites * 1000) / maxFavourites

        let boost = 0

        if(initialValue >= 900){
            boost = initialValue * 10/100
        }else if(initialValue >= 700){
            boost = initialValue * 12/100
        }else if(initialValue >= 600){
            boost = initialValue * 15/100
        }else if(initialValue >= 500){
            boost = initialValue * 20/100
        }else if(initialValue >= 300){
            boost = initialValue * 22/100
        }else if(initialValue >= 200){
            boost = initialValue * 30/100
        }else if(initialValue >= 100){
            boost = initialValue * 50/100
        }else {
            boost = initialValue + Math.ceil(Math.random()*100) 
        }
        const value = Math.round(initialValue + boost);

        // Push transformed character object to array
        transformedCharacters.push({
        id,
        name: full,
        image: large,
        gender,
        anime: topMedia.title.romaji || topMedia.title.english || '',
        value
        });
    });

    return transformedCharacters;
}

function getCharacters(userId) {

    const userCharacters = Object.entries(claimedCharacters)
        .filter(([characterId, ownerId]) => ownerId === userId)
        .map(([characterId]) => characters.find(char => char.id == characterId));

    if (userCharacters.length === 0) {
        return 'No results!';
    }

    return userCharacters;
}

async function giveCharacter(message, senderId, receiver, characterName){

    if (!receiver) {
        message.reply('Syntax: **$give @someone <character(s) to gift>**');
        return;
    }

    if(receiver.id === senderId){
        message.reply('You cannot give youself your own character');
        return
    }

    const character = characters.find(ch => ch.name === characterName)

    if (!character) {
        message.reply(`This character does not exist`);
        return
    }

    console.log(character,claimedCharacters[character.id], senderId)

    if(claimedCharacters[character.id] !== senderId){
        message.reply(`You do not own **${characterName}**.`);
        return
    }

}

/* -------------------------------- Cooldown Functions -------------------------------- */


function checkRollCooldown(userId) {
    if (!cooldowns[userId]) {
        cooldowns[userId] = { rollsLeft: 8, claimed:false };
    }

    if (cooldowns[userId].rollsLeft <= 0) {
        return true; // On cooldown
    }

    return false; // Not on cooldown
}

function checkClaimCooldown(userId) {
    if (!cooldowns[userId]) {
        cooldowns[userId] = { rollsLeft: 8, claimed:false };
    }
    return cooldowns[userId].claimed
}

function resetAllRolls() {
    Object.keys(cooldowns).forEach(userId => {
        cooldowns[userId].rollsLeft = 8; 
    });

    saveData(); 
}

function resetAllClaims() {
    Object.keys(cooldowns).forEach(userId => {
        cooldowns[userId].claimed = false; 
    });

    saveData(); 
}

function calculateTimeUntilNextReset(nextDate) {
    const now = DateTime.now()
    if (nextDate) {
        
        const diff = nextDate.diff(now, ['hours', 'minutes', 'seconds']).toObject();

        const hours = Math.floor(diff.hours);
        const minutes = Math.floor(diff.minutes);
        const seconds = Math.floor(diff.seconds);
        if(hours){
            return `**${hours}** hours, **${minutes}** minutes left`;
        }else if(minutes){
            return `**${minutes}** minutes, **${seconds}** seconds left`;
        }else{
            return `**${seconds}** seconds left`;
        }
    } else {
        return 'Next run time not found';
    }
}



/* -------------------------------- Pagination Functions -------------------------------- */

/* ------------------------ Top Miners ------------------------ */

const calculateTopMiners = () => {
    const userTotalValues = {};

    for (const [characterId, userId] of Object.entries(claimedCharacters)) {
        const character = characters.find(ch => ch.id === parseInt(characterId));
        if (character) {
            if (!userTotalValues[userId]) {
                userTotalValues[userId] = 0;
            }
            userTotalValues[userId] += character.value;
        }
    }

    return Object.entries(userTotalValues)
        .map(([userId, totalValue]) => ({ userId, totalValue }))
        .sort((a, b) => b.totalValue - a.totalValue);
};

const generateTopMinersEmbed = (page, topMiners, itemsPerPage) => {
    const start = page * itemsPerPage;
    const end = start + itemsPerPage;
    const paginatedItems = topMiners.slice(start, end);

    const description = paginatedItems.map((user, index) => {
        const userName = `<@${user.userId}>`; 
        return `**#${start + index + 1}** - **${userName}** - **${user.totalValue}** coins`;
    }).join('\n');

    return new EmbedBuilder()
        .setTitle(`🏆 Top ${currencyEmoji} miners`)
        .setColor('#FF69B4')
        .setDescription(description)
        .setFooter({ text: `Page ${page + 1} of ${Math.ceil(topMiners.length / itemsPerPage)}` });
};


/* ------------------------ Top Characters ------------------------ */

const getTopCharactersPageContent = (page, items, itemsPerPage) => {
    const start = page * itemsPerPage;
    const end = start + itemsPerPage;
    const paginatedItems = items.slice(start, end);

    return paginatedItems.map((char, charIndex) => `**#${start + charIndex + 1}** - **${char.name}** - ${char.anime} **${char.value}**${currencyEmoji}`).join('\n');
};

const generateTopCharactersEmbed = (page, items, itemsPerPage, title) => {
    return new EmbedBuilder()
        .setTitle(title)
        .setColor('#FF69B4')
        .setThumbnail(items[0]?.image) 
        .setDescription(getTopCharactersPageContent(page, items, itemsPerPage))
        .setFooter({ text: `Page ${page + 1} of ${Math.ceil(items.length / itemsPerPage)}` });
};

/* ------------------------ Pagination ------------------------ */

async function pagination(interaction, pages, title = 'Items', itemsPerPage = 15, time = 60 * 1000) {
    let index = 0;
    const totalPages = pages.length;

    try {
        if (!interaction || !pages || pages.length === 0) throw new Error('[PAGINATION] Invalid args');

        if(pages.length === 1) return await interaction.channel.send({ embeds: [pages[index]], components: [], fetchReply: false });

        const first = new ButtonBuilder()
            .setCustomId('pagefirst')
            .setEmoji('1029435230668476476')
            .setStyle('Primary')
            .setDisabled(true);

        const previous = new ButtonBuilder()
            .setCustomId('pageprevious')
            .setEmoji('1029435199462834207')
            .setStyle('Primary')
            .setDisabled(true);

        const pageCount = new ButtonBuilder()
            .setCustomId('pagecount')
            .setLabel(`${index + 1}/${totalPages}`)
            .setStyle('Secondary')
            .setDisabled(true);

        const next = new ButtonBuilder()
            .setCustomId('pagenext')
            .setEmoji('1029435213157240892')
            .setStyle('Primary');

        const last = new ButtonBuilder()
            .setCustomId('pagelast')
            .setEmoji('1029435238948032582')
            .setStyle('Primary');

        const buttons = new ActionRowBuilder().addComponents([first, previous, pageCount, next, last]);

        const msg = await interaction.channel.send({ embeds: [pages[index]], components: [buttons], fetchReply: true });

        const collector = await msg.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time
        });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.author.id) return await i.reply({ content: `Only **${interaction.user.username}** can use these buttons!`, ephemeral: true });

            await i.deferUpdate();

            if (i.customId === 'pagefirst') {
                index = 0;
            } else if (i.customId === 'pageprevious' && index > 0) {
                index--;
            } else if (i.customId === 'pagenext' && index < totalPages - 1) {
                index++;
            } else if (i.customId === 'pagelast') {
                index = totalPages - 1;
            }

            pageCount.setLabel(`${index + 1}/${totalPages}`);

            first.setDisabled(index === 0);
            previous.setDisabled(index === 0);
            next.setDisabled(index === totalPages - 1);
            last.setDisabled(index === totalPages - 1);

            await msg.edit({ embeds: [pages[index]], components: [buttons] }).catch(err => { });

            collector.resetTimer();
        });

        collector.on('end', async () => {
            await msg.edit({ embeds: [pages[index]], components: [] }).catch(err => { });
        });

        return msg;
    } catch (error) {
        console.log(`[ERROR] ${error}`);
    }
}



/* -------------------------------- Interaction Functions -------------------------------- */

async function blurImage(imageUrl) {
    const image = await Jimp.read(imageUrl);
    image.blur(7);  

    const blurredImageBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);
    return blurredImageBuffer;
}

async function rollCommand(message, userId) {
    const emojis = [
        '💕',
        '❤️',
        '💖',
        '💓',
        '💞'
    ] 
    const randomEmoji = emojis[Math.floor(Math.random()*5)]
    if (checkRollCooldown(userId)) {
        
        const timeLeft = calculateTimeUntilNextReset(rollJob.nextDates(1)[0]);
        await message.reply(`Please wait ${timeLeft} before rolling again.`);
        return;
    }

    const availableCharacters = characters.filter(char => !claimedCharacters[char.id]);

    if (availableCharacters.length === 0) {
        await message.reply('No more characters available to roll!');
        return;
    }

    const character = availableCharacters[Math.floor(Math.random() * availableCharacters.length)];

    const cooldownTime = 30 * 1000;

    
    let imageBuffer = null;
    if (character.gender !== 'Male') {
        imageBuffer = await blurImage(character.image);
    }

    const embed = new EmbedBuilder()
        .setTitle(character.name)
        .setImage(character.gender !== 'Male' ? 'attachment://blurred_image.jpg' : character.image)
        .setDescription(`${character.anime}\n **${character.value}**${currencyEmoji}`)
        .setColor(getRandomColor());

    const button = new ButtonBuilder()
        .setCustomId(`claim_${character.id}`)
        .setEmoji(randomEmoji)
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(button);
    const options = {
        embeds: [embed],
        components: [row],
    };

    if (imageBuffer) {
        options.files = [{ attachment: imageBuffer, name: 'blurred_image.jpg' }];
    }

    const msg = await message.channel.send(options).catch(console.error);

    const collector = msg.createMessageComponentCollector({ 
        componentType: ComponentType.Button, 
        time: cooldownTime 
    });

    collector.on('collect', async (interaction) => {
        const [action, charId] = interaction.customId.split('_');
        const username = interaction.user.username;
        const userId = interaction.user.id;
    
        if (action === 'claim') {
            if (claimedCharacters[charId]) {
                await interaction.reply({ content: 'This character has already been claimed!', ephemeral: false });
                return;
            }

            if (checkClaimCooldown(userId)) {
                const timeLeft = calculateTimeUntilNextReset(claimJob.nextDates(1)[0]);
                await interaction.reply({ content: `Please **${username}** wait ${timeLeft} before claiming another character`, ephemeral: false });
                return;
            }

            const character = characters.find(char => char.id == charId);

            if (!character) {
                await interaction.reply({ content: 'Character not found!', ephemeral: false });
                return;
            }

            claimedCharacters[charId] = userId;
            cooldowns[userId].claimed = true;

            await interaction.update({
                content: `💖  **${username}** claimed **${character.name}** from ${character.anime}  💖`,
                components: [row],
                embeds: [embed]
            });
            
        }
    });

    collector.on('end', async () => {
        const disabledButton = new ButtonBuilder()
            .setCustomId(`claim_${character.id}`)
            .setEmoji(randomEmoji)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true);

        const disabledRow = new ActionRowBuilder().addComponents(disabledButton);

        await msg.edit({ 
            components: [disabledRow] 
        });
    });

    cooldowns[userId].rollsLeft--;
    saveData();
}

/* -------------------------------- Interaction Listeners -------------------------------- */

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    loadData();
    // await fetchCharacters();
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.channelId !== CHANNEL_ID) return;

    const userId = message.author.id;
    const args = message.content.trim().split(/ +/);
    const command = args[0].toLowerCase();



    switch (command) {
        case '$roll':
            await rollCommand(message,userId)
            break;

        case '$diamonds':
            const balance = getBalance(userId);
            message.reply(`You have **${balance}**${currencyEmoji}`);
            break;

        case '$characters':
            
            const mentioned = message.mentions.users.first();
            let id = userId
            if(mentioned) id = mentioned.id
            const user = client.users.cache.get(id)

            const userCharacters = getCharacters(id);
            if (userCharacters === 'No results!') {
                message.reply('You have not claimed any characters yet.');
            } else {
                const characterLines = userCharacters.map(char => `${char.name} - **${char.value}** ${currencyEmoji}`);
                const description = `${characterLines.join('\n')}`;
                const totalValue =  userCharacters.reduce((total, currentValue) => {
                    return total + currentValue.value;
                }, 0);
                const embedCharacters = new EmbedBuilder()
                    .setAuthor({ name: `${user.username}'s subordinates`, iconURL: user.avatarURL() })
                    .setThumbnail(userCharacters[0].image)
                    .setColor('#FF69B4')
                    .addFields(
                        { name: '\u200B', value: `Total Value : **${totalValue}**${currencyEmoji}` },
                        { name: '\n', value: '\n' },
                        { name: '\n', value: description, inline: true }
                    );

                await message.channel.send({ embeds: [embedCharacters] }).catch(console.error);
            }
            break;
        case '$top':

            const topCharacters = characters.slice(0, 1000).sort((a, b) => b.value - a.value); 
            const itemsPerPageTopCharacters = 15;
            const totalPagesTopCharacters = Math.ceil(topCharacters.length / itemsPerPageTopCharacters);

            const topCharactersPages = [];
                for (let i = 0; i < totalPagesTopCharacters; i++) {
                    topCharactersPages.push(generateTopCharactersEmbed(i, topCharacters, itemsPerPageTopCharacters,`🏆  Top 1000`));
                }
            
            await pagination(message, topCharactersPages, '🏆 Top 1000', 15);
            break;

        case '$daily':
            dailyClaim(message,userId)
            break;

        case '$give':
            message.reply('In Progress')
            return;
            const selectedCharacter = args.slice(2).join(' ')
            const mention = message.mentions.users.first();

            await giveCharacter(message, userId, mention, selectedCharacter)
            
            break;

        case '$topminers':
            
            const topMiners = calculateTopMiners();
            const itemsPerPage = 10;
            const totalPages = Math.ceil(topMiners.length / itemsPerPage);

            const pages = [];
            for (let i = 0; i < totalPages; i++) {
                pages.push(generateTopMinersEmbed(i, topMiners, itemsPerPage));
            }
        
            await pagination(message, pages, `🏆 Top ${currencyEmoji} miners`, itemsPerPage);
            break;
            
        case '$show':
            
            const showCharacter = characters.find(char => {if(args.slice(1).join(' ') in char.name)return true})

            let imageBuffer = null;
            if (showCharacter.gender !== 'Male') {
                imageBuffer = await blurImage(showCharacter.image);
            }

            const embed = new EmbedBuilder()
                .setTitle(showCharacter .name)
                .setImage(showCharacter.gender !== 'Male' ? 'attachment://blurred_image.jpg' : showCharacter.image)
                .setDescription(`${showCharacter.anime}\n **${showCharacter.value}**${currencyEmoji}`)
                .setColor(getRandomColor());

            const options = {
                embeds: [embed],
                components: [],
            };
        
            if (imageBuffer) {
                options.files = [{ attachment: imageBuffer, name: 'blurred_image.jpg' }];
            }
        
            await message.channel.send(options).catch(console.error);
            break;
        default:
            break;
    }
});


client.login(TOKEN).catch(console.error);
