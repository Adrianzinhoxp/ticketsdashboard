// ✅ ARQUIVO PRINCIPAL - ENVIAR PARA GIT
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require("discord.js")

const express = require("express")
const cors = require("cors")
require("dotenv").config()

// Importar configurações
const CONFIG = require("./config.js")

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
})

// Configurar Express para Railway
const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

// Health check para Railway
app.get("/", (req, res) => {
  res.json({
    status: "✅ Bot Discord Online!",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
  })
})

app.get("/health", (req, res) => {
  res.json({ status: "OK", bot: client.user?.tag || "Offline" })
})

// Armazenamento em memória (Railway)
const activeTickets = new Map()
const closedTickets = new Map()
const ticketMessages = new Map()
const serverConfigs = new Map()

// Função auxiliar para encontrar ticket
function findTicketByChannel(channelId) {
  for (const [userId, ticketData] of activeTickets.entries()) {
    if (ticketData.channelId === channelId) {
      return { userId, ticket: ticketData }
    }
  }
  return null
}

// Função para responder interações
async function safeReply(interaction, options) {
  try {
    if (interaction.replied) {
      return await interaction.followUp(options)
    }
    if (interaction.deferred) {
      return await interaction.editReply(options)
    }
    return await interaction.reply(options)
  } catch (error) {
    console.error("Erro ao responder:", error.message)
    return null
  }
}

client.once("ready", async () => {
  console.log(`✅ Bot online como ${client.user.tag}!`)
  console.log(`🌐 Servidor: ${CONFIG.GUILD_ID}`)
  console.log(`📊 Memória: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`)

  // Iniciar servidor Express
  app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`)
  })

  // Registrar comandos
  await registerSlashCommands()
})

async function registerSlashCommands() {
  const commands = [
    {
      name: "ticket-panel",
      description: "Cria o painel de tickets",
    },
    {
      name: "ticket-config",
      description: "Configura o canal de tickets",
      options: [
        {
          name: "canal",
          description: "Canal para o painel",
          type: 7,
          required: true,
        },
      ],
    },
  ]

  try {
    const guild = client.guilds.cache.get(CONFIG.GUILD_ID)
    await guild.commands.set(commands)
    console.log("✅ Comandos registrados!")
  } catch (error) {
    console.error("❌ Erro ao registrar comandos:", error)
  }
}

// Event handlers básicos
client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction

      if (commandName === "ticket-panel") {
        await createTicketPanel(interaction)
      } else if (commandName === "ticket-config") {
        await configureTicketChannel(interaction)
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "ticket_select") {
        await handleTicketSelection(interaction)
      }
    }
  } catch (error) {
    console.error("Erro na interação:", error)
  }
})

async function createTicketPanel(interaction) {
  const embed = new EmbedBuilder()
    .setTitle("🎫 SISTEMA DE TICKETS")
    .setDescription(`Selecione o tipo de atendimento:`)
    .setColor("#0099ff")

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("ticket_select")
    .setPlaceholder("🎫 Selecione uma opção...")
    .addOptions([
      {
        label: "Up de Patente",
        description: "Solicitações de promoção",
        value: "up_patente",
        emoji: "🏆",
      },
      {
        label: "Dúvidas Gerais",
        description: "Perguntas gerais",
        value: "duvidas",
        emoji: "❓",
      },
      {
        label: "Sugestões",
        description: "Ideias para o servidor",
        value: "sugestoes",
        emoji: "💡",
      },
    ])

  const row = new ActionRowBuilder().addComponents(selectMenu)

  await safeReply(interaction, {
    embeds: [embed],
    components: [row],
  })
}

async function handleTicketSelection(interaction) {
  const ticketType = interaction.values[0]
  const userId = interaction.user.id

  if (activeTickets.has(userId)) {
    return await safeReply(interaction, {
      content: "❌ Você já possui um ticket aberto!",
      flags: MessageFlags.Ephemeral,
    })
  }

  try {
    const ticketChannel = await interaction.guild.channels.create({
      name: `ticket-${interaction.user.username}`,
      type: ChannelType.GuildText,
      parent: CONFIG.TICKET_CATEGORY_ID,
      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        },
        {
          id: CONFIG.STAFF_ROLE_ID,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        },
      ],
    })

    const ticketData = {
      channelId: ticketChannel.id,
      type: ticketType,
      createdAt: new Date(),
      user: {
        id: userId,
        name: interaction.user.username,
        avatar: interaction.user.displayAvatarURL(),
      },
    }

    activeTickets.set(userId, ticketData)

    const welcomeEmbed = new EmbedBuilder()
      .setTitle("🎫 Ticket Criado!")
      .setDescription(`Olá ${interaction.user}! Descreva sua solicitação.`)
      .setColor("#00ff00")

    await ticketChannel.send({
      content: `${interaction.user} <@&${CONFIG.STAFF_ROLE_ID}>`,
      embeds: [welcomeEmbed],
    })

    await safeReply(interaction, {
      content: `✅ Ticket criado: ${ticketChannel}`,
      flags: MessageFlags.Ephemeral,
    })
  } catch (error) {
    console.error("Erro ao criar ticket:", error)
    await safeReply(interaction, {
      content: "❌ Erro ao criar ticket.",
      flags: MessageFlags.Ephemeral,
    })
  }
}

async function configureTicketChannel(interaction) {
  const channel = interaction.options.getChannel("canal")

  serverConfigs.set(interaction.guild.id, {
    ticketChannelId: channel.id,
  })

  await safeReply(interaction, {
    content: `✅ Canal configurado: ${channel}`,
    flags: MessageFlags.Ephemeral,
  })
}

// Login do bot
client.login(CONFIG.TOKEN)
