const { config } = require('dotenv')
config()
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, Partials } = require('discord.js');
const SteamMarketFetcher = require('steam-market-fetcher');
const { EmbedBuilder } = require('@discordjs/builders');
const cron = require('node-cron');

const steamMarket = new SteamMarketFetcher({
	currency: 'USD'
});

const client = new Client({ intents: ['DirectMessages'], partials: [Partials.Message, Partials.Channel] });

client.commands = new Collection();
const foldersPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(foldersPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
	const filePath = path.join(foldersPath, file);
	const command = require(filePath);
	if ('data' in command && 'execute' in command) {
		client.commands.set(command.data.name, command);
	} else {
		console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
	}
}

client.once(Events.ClientReady, () => {
	console.log(`Logged in as ${client.user.tag}`)
});

client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;

	const command = client.commands.get(interaction.commandName);

	if (!command) return;

	try {
		await command.execute(interaction);
	} catch (error) {
		console.error(error);
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
		} else {
			await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
		}
	}
});

client.on(Events.MessageCreate, (message) => {
	if (message.guild) return
	if (message.content == "!sendskins") {
		fetchAndSendAllPrices()
	}
})

async function fetchAndSendAllPrices() {
	try {

		const skins = require('./skins.js')
		const fetchedSkinList = []

		let totalProfit = 0
		let totalLoss = 0

		for (const skin of skins) {
			const data = await steamMarket.getItemHistogram({
				item_nameid: skin.nameid
			})
			const singleDiff = Math.abs(data.lowest_sell_order / 100 - skin.bought)
			const totalDiff = (data.lowest_sell_order / 100 - skin.bought) * skin.amount
			if (totalDiff > 0) {
				totalProfit += totalDiff
			} else {
				totalLoss += totalDiff
			}
			const percentage = (data.lowest_sell_order / 100 / skin.bought * 100).toFixed(0)
			const prefix = (data.lowest_sell_order / 100 - skin.bought) > 0 ? '+' : '-'
			fetchedSkinList.push({
				name: skin.name,
				value: `$${skin.bought} * ${skin.amount} now **$${data.lowest_sell_order / 100}**\`\`\`diff\n${prefix}$${singleDiff.toFixed(2)} Single | ${prefix}$${Math.abs(totalDiff.toFixed(2))} Total | ${percentage}%\n\`\`\``
			})
		}

		client.users.fetch(process.env.USERID).then(u => {
			u.send({
				embeds: [new EmbedBuilder()
					.addFields(fetchedSkinList)
					.addFields({
						name: 'Total',
						value: `$${totalProfit.toFixed(2)} - $${totalLoss.toFixed(2)} = **$${(totalProfit - totalLoss).toFixed(2)}**`
					})
					.setTimestamp(new Date())
				]
			})
		})
	} catch (e) {
		console.log(e)
		client.users.fetch(process.env.USERID).then(u => {
			u.send('Cant send skins rn its borken ¯\\_(ツ)_/¯\n```' + e.message + '```')
		})

	}
}

cron.schedule(process.env.CRONJOB, () => { fetchAndSendAllPrices() })


client.login(process.env.TOKEN);
