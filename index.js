// ✅ VERSÃO CORRIGIDA - com validação de token
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

// 🔍 DEBUG - Verificar variáveis de ambiente
console.log("🚀 Iniciando bot...")
CONFIG.debug()

// ✅ VALIDAÇÃO DO TOKEN
if (!CONFIG.TOKEN) {
  console.error("❌ ERRO CRÍTICO: Token do Discord não encontrado!")
  console.error("📋 SOLUÇÕES:")
  console.error("1. Verifique se DISCORD_TOKEN está configurado no Railway")
  console.error("2. Vá em Railway Dashboard → Variables → Add Variable")
  console.error("3. Nome: DISCORD_TOKEN")
  console.error("4. Valor: seu_token_real_aqui")
  process.exit(1)
}

if (!CONFIG.GUILD_ID) {
  console.error("❌ ERRO: GUILD_ID não encontrado!")
  console.error("Configure GUILD_ID no Railway Dashboard")
  process.exit(1)
}

if (!CONFIG.TICKET_CATEGORY_ID) {
  console.error("❌ ERRO: TICKET_CATEGORY_ID não encontrado!")
  console.error("Configure TICKET_CATEGORY_ID no Railway Dashboard")
  process.exit(1)
}

if (!CONFIG.STAFF_ROLE_ID) {
  console.error("❌ ERRO: STAFF_ROLE_ID não encontrado!")
  console.error("Configure STAFF_ROLE_ID no Railway Dashboard")
  process.exit(1)
}

console.log("✅ Todas as variáveis de ambiente estão configuradas!")

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
    bot_status: client.user?.tag || "Offline",
    guild_id: CONFIG.GUILD_ID,
    has_token: !!CONFIG.TOKEN,
  })
})

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    bot: client.user?.tag || "Offline",
    ready: client.isReady(),
  })
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
  console.log(`✅ Bot conectado com sucesso como ${client.user.tag}!`)
  console.log(`🌐 Servidor alvo: ${CONFIG.GUILD_ID}`)
  console.log(`📊 Memória: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`)
  console.log(`🚀 Ambiente: ${process.env.NODE_ENV || "development"}`)

  // Verificar se o bot está no servidor correto
  const guild = client.guilds.cache.get(CONFIG.GUILD_ID)
  if (!guild) {
    console.error(`❌ Bot não está no servidor ${CONFIG.GUILD_ID}!`)
    console.error("📋 SOLUÇÕES:")
    console.error("1. Verifique se o GUILD_ID está correto")
    console.error("2. Convide o bot para o servidor")
    console.error("3. Verifique as permissões do bot")
  } else {
    console.log(`✅ Bot encontrado no servidor: ${guild.name}`)
  }

  // Iniciar servidor Express
  app.listen(PORT, () => {
    console.log(`🚀 Servidor HTTP rodando na porta ${PORT}`)
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
    {
      name: "debug",
      description: "Mostra informações de debug do bot",
    },
  ]

  try {
    const guild = client.guilds.cache.get(CONFIG.GUILD_ID)
    if (!guild) {
      console.error("❌ Não foi possível registrar comandos - servidor não encontrado")
      return
    }

    await guild.commands.set(commands)
    console.log("✅ Comandos slash registrados com sucesso!")
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
      } else if (commandName === "debug") {
        await debugCommand(interaction)
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

async function debugCommand(interaction) {
  const embed = new EmbedBuilder()
    .setTitle("🔍 Debug do Bot")
    .setDescription(`**Status:** ✅ Online
**Servidor:** ${interaction.guild.name}
**Usuário:** ${client.user.tag}
**Ping:** ${client.ws.ping}ms
**Uptime:** ${Math.floor(process.uptime() / 60)} minutos
**Memória:** ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB

**Configurações:**
• Guild ID: ${CONFIG.GUILD_ID}
• Category ID: ${CONFIG.TICKET_CATEGORY_ID}
• Staff Role ID: ${CONFIG.STAFF_ROLE_ID}
• Tickets Ativos: ${activeTickets.size}`)
    .setColor("#0099ff")
    .setTimestamp()

  await safeReply(interaction, {
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  })
}

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

// Error handlers
client.on("error", (error) => {
  console.error("❌ Erro do cliente Discord:", error)
})

process.on("unhandledRejection", (error) => {
  console.error("❌ Promise rejeitada:", error)
})

// Login do bot com tratamento de erro
console.log("🔐 Tentando fazer login...")
client.login(CONFIG.TOKEN).catch((error) => {
  console.error("❌ ERRO AO FAZER LOGIN:")
  console.error("Erro:", error.message)
  console.error("📋 VERIFICAÇÕES:")
  console.error("1. Token está correto?")
  console.error("2. Bot está ativo no Discord Developer Portal?")
  console.error("3. Variável DISCORD_TOKEN está configurada no Railway?")
  process.exit(1)
})
