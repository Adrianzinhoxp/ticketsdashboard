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
const path = require("path")
const fs = require("fs")

const DiscloudMonitor = require("./utils/discloud-monitor")
const AutoCleanup = require("./utils/cleanup")

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
})

// Importar configurações
const CONFIG = require("./config.js")

// Arquivos para persistência
const ACTIVE_TICKETS_FILE = "./data/active_tickets.json"
const CLOSED_TICKETS_FILE = "./data/closed_tickets.json"
const TICKET_MESSAGES_FILE = "./data/ticket_messages.json"
const SERVER_CONFIGS_FILE = "./data/server_configs.json"

// Criar pasta data se não existir
if (!fs.existsSync("./data")) {
  fs.mkdirSync("./data")
  console.log("📁 Pasta 'data' criada para persistência")
}

// Armazenamento com persistência
let activeTickets = new Map()
let closedTickets = new Map()
let ticketMessages = new Map()
let serverConfigs = new Map()

// Funções de persistência
function saveActiveTickets() {
  try {
    const data = Object.fromEntries(activeTickets)
    fs.writeFileSync(ACTIVE_TICKETS_FILE, JSON.stringify(data, null, 2))
    console.log(`💾 Tickets ativos salvos: ${activeTickets.size} tickets`)
  } catch (error) {
    console.error("❌ Erro ao salvar tickets ativos:", error)
  }
}

function loadActiveTickets() {
  try {
    if (fs.existsSync(ACTIVE_TICKETS_FILE)) {
      const data = JSON.parse(fs.readFileSync(ACTIVE_TICKETS_FILE, "utf8"))
      activeTickets = new Map(Object.entries(data))
      console.log(`📂 Tickets ativos carregados: ${activeTickets.size} tickets`)

      // Log dos tickets carregados
      for (const [userId, ticket] of activeTickets.entries()) {
        console.log(`🎫 Ticket carregado: Usuário ${userId} - Canal ${ticket.channelId}`)
      }
    }
  } catch (error) {
    console.error("❌ Erro ao carregar tickets ativos:", error)
    activeTickets = new Map()
  }
}

function saveClosedTickets() {
  try {
    const data = Object.fromEntries(closedTickets)
    fs.writeFileSync(CLOSED_TICKETS_FILE, JSON.stringify(data, null, 2))
  } catch (error) {
    console.error("❌ Erro ao salvar tickets fechados:", error)
  }
}

function loadClosedTickets() {
  try {
    if (fs.existsSync(CLOSED_TICKETS_FILE)) {
      const data = JSON.parse(fs.readFileSync(CLOSED_TICKETS_FILE, "utf8"))
      closedTickets = new Map(Object.entries(data))
      console.log(`📂 Tickets fechados carregados: ${closedTickets.size} tickets`)
    }
  } catch (error) {
    console.error("❌ Erro ao carregar tickets fechados:", error)
    closedTickets = new Map()
  }
}

function saveTicketMessages() {
  try {
    const data = Object.fromEntries(ticketMessages)
    fs.writeFileSync(TICKET_MESSAGES_FILE, JSON.stringify(data, null, 2))
  } catch (error) {
    console.error("❌ Erro ao salvar mensagens:", error)
  }
}

function loadTicketMessages() {
  try {
    if (fs.existsSync(TICKET_MESSAGES_FILE)) {
      const data = JSON.parse(fs.readFileSync(TICKET_MESSAGES_FILE, "utf8"))
      ticketMessages = new Map(Object.entries(data))
      console.log(`📂 Mensagens carregadas: ${ticketMessages.size} canais`)
    }
  } catch (error) {
    console.error("❌ Erro ao carregar mensagens:", error)
    ticketMessages = new Map()
  }
}

function saveServerConfigs() {
  try {
    const data = Object.fromEntries(serverConfigs)
    fs.writeFileSync(SERVER_CONFIGS_FILE, JSON.stringify(data, null, 2))
  } catch (error) {
    console.error("❌ Erro ao salvar configurações:", error)
  }
}

function loadServerConfigs() {
  try {
    if (fs.existsSync(SERVER_CONFIGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SERVER_CONFIGS_FILE, "utf8"))
      serverConfigs = new Map(Object.entries(data))
      console.log(`📂 Configurações carregadas: ${serverConfigs.size} servidores`)
    }
  } catch (error) {
    console.error("❌ Erro ao carregar configurações:", error)
    serverConfigs = new Map()
  }
}

// Configurar servidor Express
const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

// Função auxiliar para encontrar ticket pelo canal - MELHORADA
function findTicketByChannel(channelId) {
  console.log(`🔍 Procurando ticket para canal: ${channelId}`)
  console.log(`📊 Tickets ativos: ${activeTickets.size}`)

  for (const [userId, ticketData] of activeTickets.entries()) {
    console.log(`🎫 Verificando ticket do usuário ${userId}: canal ${ticketData.channelId}`)
    if (ticketData.channelId === channelId) {
      console.log(`✅ Ticket encontrado! Usuário: ${userId}`)
      return { userId, ticket: ticketData }
    }
  }

  console.log(`❌ Nenhum ticket encontrado para o canal ${channelId}`)
  return null
}

// Função para verificar se um canal é realmente um ticket ativo
async function verifyTicketChannel(channelId) {
  try {
    const channel = await client.channels.fetch(channelId)
    if (!channel) {
      console.log(`⚠️ Canal ${channelId} não existe mais`)
      return false
    }

    // Verificar se o canal está na categoria correta
    if (channel.parentId !== CONFIG.TICKET_CATEGORY_ID) {
      console.log(`⚠️ Canal ${channelId} não está na categoria de tickets`)
      return false
    }

    return true
  } catch (error) {
    console.log(`⚠️ Erro ao verificar canal ${channelId}:`, error.message)
    return false
  }
}

// Função para limpar tickets órfãos
async function cleanupOrphanedTickets() {
  console.log("🧹 Verificando tickets órfãos...")

  const ticketsToRemove = []

  for (const [userId, ticketData] of activeTickets.entries()) {
    const isValid = await verifyTicketChannel(ticketData.channelId)
    if (!isValid) {
      console.log(`🗑️ Removendo ticket órfão: usuário ${userId}, canal ${ticketData.channelId}`)
      ticketsToRemove.push(userId)
    }
  }

  for (const userId of ticketsToRemove) {
    activeTickets.delete(userId)
  }

  if (ticketsToRemove.length > 0) {
    saveActiveTickets()
    console.log(`✅ ${ticketsToRemove.length} tickets órfãos removidos`)
  } else {
    console.log("✅ Nenhum ticket órfão encontrado")
  }
}

// Função para salvar mensagem do ticket
function saveTicketMessage(channelId, message) {
  if (!ticketMessages.has(channelId)) {
    ticketMessages.set(channelId, [])
  }

  const messageData = {
    id: message.id,
    author: {
      name: message.author.username,
      avatar: message.author.displayAvatarURL(),
      isStaff: message.member?.roles.cache.has(CONFIG.STAFF_ROLE_ID) || false,
    },
    content: message.content,
    timestamp: message.createdAt.toISOString(),
    attachments: message.attachments.map((att) => ({
      name: att.name,
      url: att.url,
      type: att.contentType?.startsWith("image/") ? "image" : "file",
    })),
  }

  ticketMessages.get(channelId).push(messageData)
  saveTicketMessages() // Salvar após cada mensagem
}

// Função auxiliar para responder interações
async function safeReply(interaction, options) {
  try {
    if (!interaction || !interaction.isRepliable()) {
      console.log("⚠️ Interação não é mais válida para resposta")
      return null
    }

    // Verificar se a interação ainda é válida (não expirou)
    const now = Date.now()
    const interactionTime = interaction.createdTimestamp
    const timeDiff = now - interactionTime

    if (timeDiff > 14 * 60 * 1000) {
      // 14 minutos (limite do Discord é 15)
      console.log("⚠️ Interação expirou (mais de 14 minutos)")

      // Tentar enviar mensagem diretamente no canal
      if (interaction.channel) {
        try {
          return await interaction.channel.send({
            content: options.content || "⚠️ Interação expirou, mas a ação foi processada.",
            embeds: options.embeds || [],
            components: options.components || [],
          })
        } catch (channelError) {
          console.error("❌ Erro ao enviar mensagem no canal:", channelError.message)
        }
      }
      return null
    }

    if (interaction.replied) {
      console.log("⚠️ Interação já foi respondida, usando followUp")
      return await interaction.followUp(options)
    }

    if (interaction.deferred) {
      console.log("⚠️ Interação foi diferida, usando editReply")
      return await interaction.editReply(options)
    }

    return await interaction.reply(options)
  } catch (error) {
    console.error("❌ Erro ao responder interação:", error.message)

    if (error.code === 10062) {
      console.log("⚠️ Interação expirou ou é inválida")

      // Tentar enviar mensagem diretamente no canal como fallback
      if (interaction.channel && error.code !== 10062) {
        try {
          console.log("🔄 Tentando enviar mensagem no canal como fallback")
          return await interaction.channel.send({
            content: options.content || "⚠️ A interação expirou, mas a ação foi processada.",
            embeds: options.embeds || [],
            components: options.components || [],
          })
        } catch (channelError) {
          console.error("❌ Erro ao enviar mensagem no canal:", channelError.message)
        }
      }
      return null
    }

    // Para outros erros, tentar fallback no canal
    if (interaction.channel) {
      try {
        console.log("🔄 Tentando enviar mensagem no canal como fallback")
        return await interaction.channel.send({
          content: options.content || "❌ Erro ao processar a interação.",
          embeds: options.embeds || [],
          components: options.components || [],
        })
      } catch (channelError) {
        console.error("❌ Erro ao enviar mensagem no canal:", channelError.message)
      }
    }

    return null
  }
}

// Rotas da API
app.get("/api/tickets/stats", (req, res) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const todayTickets = Array.from(closedTickets.values()).filter((ticket) => new Date(ticket.closedAt) >= today)

  const allTickets = Array.from(closedTickets.values())
  const totalDuration = allTickets.reduce((sum, ticket) => {
    const duration = new Date(ticket.closedAt) - new Date(ticket.createdAt)
    return sum + duration
  }, 0)

  const avgDuration = allTickets.length > 0 ? totalDuration / allTickets.length : 0
  const avgHours = Math.floor(avgDuration / (1000 * 60 * 60))
  const avgMinutes = Math.floor((avgDuration % (1000 * 60 * 60)) / (1000 * 60))

  const avgSatisfaction =
    allTickets.length > 0
      ? allTickets.reduce((sum, ticket) => sum + (ticket.satisfaction || 0), 0) / allTickets.length
      : 0

  res.json({
    totalClosed: allTickets.length,
    todayClosed: todayTickets.length,
    avgResolutionTime: `${avgHours}h ${avgMinutes}m`,
    satisfactionRate: Math.round(avgSatisfaction * 10) / 10,
  })
})

app.get("/api/tickets/closed", (req, res) => {
  const tickets = Array.from(closedTickets.values())
    .sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt))
    .slice(0, 50)

  res.json(tickets)
})

app.get("/api/tickets/:ticketId/messages", (req, res) => {
  const { ticketId } = req.params
  const ticket = Array.from(closedTickets.values()).find((t) => t.id === ticketId)

  if (!ticket) {
    return res.status(404).json({ error: "Ticket não encontrado" })
  }

  const messages = ticketMessages.get(ticket.channelId) || []
  res.json(messages)
})

app.post("/api/tickets/add", (req, res) => {
  try {
    const ticketData = req.body
    closedTickets.set(ticketData.id, ticketData)
    saveClosedTickets()

    if (ticketData.messages && ticketData.channelId) {
      ticketMessages.set(ticketData.channelId, ticketData.messages)
      saveTicketMessages()
    }

    res.json({ success: true, message: "Ticket adicionado com sucesso ao bot" })
  } catch (error) {
    console.error("Erro ao adicionar ticket via API:", error)
    res.status(500).json({ error: "Erro ao adicionar ticket via API" })
  }
})

client.once("ready", async () => {
  DiscloudMonitor.logStartup()
  console.log(`✅ Bot online como ${client.user.tag}!`)

  // Carregar dados persistidos
  loadActiveTickets()
  loadClosedTickets()
  loadTicketMessages()
  loadServerConfigs()

  // Limpar tickets órfãos após carregar
  await cleanupOrphanedTickets()

  // Iniciar servidor web
  app.listen(CONFIG.DASHBOARD_PORT, () => {
    console.log(`🌐 API do Bot disponível em: http://localhost:${CONFIG.DASHBOARD_PORT}`)
  })

  // Iniciar monitoramento
  DiscloudMonitor.startMemoryMonitoring()
  new AutoCleanup()

  // Registrar comandos
  registerSlashCommands()

  DiscloudMonitor.logSuccess("Bot totalmente inicializado")
})

// Capturar mensagens nos canais de ticket
client.on("messageCreate", (message) => {
  if (message.author.bot) return

  const ticketInfo = findTicketByChannel(message.channel.id)
  if (ticketInfo) {
    saveTicketMessage(message.channel.id, message)
  }
})

async function registerSlashCommands() {
  const commands = [
    {
      name: "ticket-panel",
      description: "Cria o painel principal de tickets",
    },
    {
      name: "close-ticket",
      description: "Fecha o ticket atual",
    },
    {
      name: "ticket-config",
      description: "Configura o canal onde os tickets serão abertos",
      options: [
        {
          name: "canal",
          description: "Canal onde o painel de tickets será usado",
          type: 7,
          required: true,
        },
      ],
    },
    {
      name: "dashboard",
      description: "Mostra o link do dashboard web",
    },
    {
      name: "debug-tickets",
      description: "Mostra informações de debug dos tickets ativos",
    },
    {
      name: "force-close",
      description: "Força o fechamento de um ticket (apenas staff)",
    },
  ]

  try {
    const guild = client.guilds.cache.get(CONFIG.GUILD_ID)
    await guild.commands.set(commands)
    console.log("✅ Comandos slash registrados!")
  } catch (error) {
    console.error("❌ Erro ao registrar comandos:", error)
  }
}

// Manipulador de comandos slash
client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction

      if (commandName === "ticket-panel") {
        await createTicketPanel(interaction)
      } else if (commandName === "close-ticket") {
        await closeTicket(interaction)
      } else if (commandName === "ticket-config") {
        await configureTicketChannel(interaction)
      } else if (commandName === "dashboard") {
        await showDashboard(interaction)
      } else if (commandName === "debug-tickets") {
        await debugTickets(interaction)
      } else if (commandName === "force-close") {
        await forceCloseTicket(interaction)
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "ticket_select") {
        await handleTicketSelection(interaction)
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === "close_ticket_modal") {
        await showCloseTicketModal(interaction)
      } else if (interaction.customId === "assume_ticket") {
        await assumeTicket(interaction)
      } else if (interaction.customId === "add_member_modal") {
        await showAddMemberModal(interaction)
      } else if (interaction.customId === "remove_member_modal") {
        await showRemoveMemberModal(interaction)
      } else if (interaction.customId === "warn_member") {
        await warnMember(interaction)
      } else if (interaction.customId === "rename_ticket") {
        await renameTicket(interaction)
      } else if (interaction.customId === "close_ticket_confirm") {
        await confirmCloseTicket(interaction)
      } else if (interaction.customId === "close_ticket_cancel") {
        await safeReply(interaction, {
          content: "❌ Fechamento do ticket cancelado.",
          flags: MessageFlags.Ephemeral,
        })
      } else if (interaction.customId === "move_ticket_modal") {
        await showMoveTicketModal(interaction)
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === "close_ticket_reason") {
        await handleCloseTicketModal(interaction)
      } else if (interaction.customId === "add_member_id") {
        await handleAddMemberModal(interaction)
      } else if (interaction.customId === "remove_member_id") {
        await handleRemoveMemberModal(interaction)
      } else if (interaction.customId === "move_ticket_category") {
        await handleMoveTicketModal(interaction)
      }
    }
  } catch (error) {
    console.error("Erro no manipulador de interações:", error)

    try {
      await safeReply(interaction, {
        content: "❌ Ocorreu um erro ao processar sua solicitação. Tente novamente.",
        flags: MessageFlags.Ephemeral,
      })
    } catch (replyError) {
      console.error("Erro ao enviar mensagem de erro:", replyError)
    }
  }
})

// Comando para forçar fechamento (apenas staff)
async function forceCloseTicket(interaction) {
  if (!interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) {
    return await safeReply(interaction, {
      content: "❌ Você não tem permissão para usar este comando.",
      flags: MessageFlags.Ephemeral,
    })
  }

  // Verificar se é um canal de ticket pela categoria
  if (interaction.channel.parentId !== CONFIG.TICKET_CATEGORY_ID) {
    return await safeReply(interaction, {
      content: "❌ Este não é um canal de ticket.",
      flags: MessageFlags.Ephemeral,
    })
  }

  // Criar um ticket temporário se não existir
  const ticketInfo = findTicketByChannel(interaction.channel.id)

  if (!ticketInfo) {
    // Tentar extrair informações do nome do canal
    const channelName = interaction.channel.name
    const match = channelName.match(/^[🏆❓💡](.+)-(.+)$/u)

    if (!match) {
      return await safeReply(interaction, {
        content: "❌ Não foi possível identificar o dono deste ticket. Use o formato padrão de nome.",
        flags: MessageFlags.Ephemeral,
      })
    }

    const [, type, username] = match

    // Criar ticket temporário
    const tempTicket = {
      channelId: interaction.channel.id,
      type: type.replace("-", "_"),
      createdAt: new Date(interaction.channel.createdAt),
      user: {
        id: "unknown",
        name: username,
        avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
        discriminator: "#0000",
      },
    }

    await confirmCloseTicket(interaction, { userId: "unknown", ticket: tempTicket })
  } else {
    await confirmCloseTicket(interaction, ticketInfo)
  }
}

// Comando de debug
async function debugTickets(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return await safeReply(interaction, {
      content: "❌ Você não tem permissão para usar este comando.",
      flags: MessageFlags.Ephemeral,
    })
  }

  const embed = new EmbedBuilder()
    .setTitle("🐛 Debug - Tickets Ativos")
    .setDescription(`**Total de tickets ativos:** ${activeTickets.size}
    
**Canal atual:** ${interaction.channel.id}
**É canal de ticket?** ${findTicketByChannel(interaction.channel.id) ? "✅ Sim" : "❌ Não"}
**Categoria do canal:** ${interaction.channel.parentId}
**Categoria esperada:** ${CONFIG.TICKET_CATEGORY_ID}

**Lista de tickets ativos:**
${
  Array.from(activeTickets.entries())
    .map(([userId, ticket]) => `• <@${userId}> - Canal: ${ticket.channelId} (${ticket.type})`)
    .join("\n") || "Nenhum ticket ativo"
}`)
    .setColor("#0099ff")
    .setTimestamp()

  await safeReply(interaction, {
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  })
}

async function showDashboard(interaction) {
  const embed = new EmbedBuilder()
    .setTitle("🌐 Dashboard de Tickets")
    .setDescription(`Acesse o dashboard web para visualizar estatísticas e histórico completo dos tickets fechados.
    
**🔗 Link do Dashboard:**
${CONFIG.DASHBOARD_URL}

**📊 Funcionalidades:**
• Estatísticas em tempo real
• Histórico completo de mensagens
• Filtros avançados
• Relatórios detalhados`)
    .setColor("#0099ff")
    .setTimestamp()

  await safeReply(interaction, {
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  })
}

async function createTicketPanel(interaction) {
  const guildConfig = serverConfigs.get(interaction.guild.id)
  if (!guildConfig || guildConfig.ticketChannelId !== interaction.channel.id) {
    return await safeReply(interaction, {
      content: "❌ Este canal não está configurado para tickets. Use `/ticket-config` primeiro.",
      flags: MessageFlags.Ephemeral,
    })
  }

  const embed = new EmbedBuilder()
    .setTitle("🎫 SISTEMA DE TICKETS")
    .setDescription(`**Bem-vindo ao nosso sistema de atendimento!**

Para abrir um ticket, selecione o tipo de atendimento que você precisa no menu abaixo:

**🏆 Up de Patente** - Solicitações de promoção
**❓ Dúvidas Gerais** - Perguntas e esclarecimentos
**💡 Sugestões** - Ideias e melhorias para o servidor

**Clique no menu abaixo para selecionar uma opção:**`)
    .setColor("#0099ff")
    .setImage(CONFIG.PANEL_IMAGE_URL)
    .setFooter({ text: "Sistema de Tickets • Desenvolvido para o servidor" })
    .setTimestamp()

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("ticket_select")
    .setPlaceholder("🎫 Selecione o tipo de atendimento...")
    .addOptions([
      {
        label: "Up de Patente",
        description: "Solicitações de promoção",
        value: "up_patente",
        emoji: "🏆",
      },
      {
        label: "Dúvidas Gerais",
        description: "Perguntas e esclarecimentos",
        value: "duvidas",
        emoji: "❓",
      },
      {
        label: "Sugestões",
        description: "Ideias e melhorias para o servidor",
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
      content: "❌ Você já possui um ticket aberto! Feche o ticket atual antes de abrir um novo.",
      flags: MessageFlags.Ephemeral,
    })
  }

  const ticketConfig = {
    up_patente: {
      name: "up-patente",
      title: "🏆 Up de Patente",
      titleMessage: "Ticket Criado - Up de Patente",
      description: "Ticket para solicitações de promoção",
      color: "#ffd93d",
      emoji: "🏆",
    },
    duvidas: {
      name: "duvidas",
      title: "❓ Dúvidas Gerais",
      titleMessage: "Ticket Criado - Dúvidas Gerais",
      description: "Ticket para perguntas e esclarecimentos",
      color: "#6bcf7f",
      emoji: "❓",
    },
    sugestoes: {
      name: "sugestoes",
      title: "💡 Sugestões",
      titleMessage: "Ticket Criado - Sugestões",
      description: "Ticket para ideias e melhorias",
      color: "#4ecdc4",
      emoji: "💡",
    },
  }

  const config = ticketConfig[ticketType]

  if (!config) {
    return await safeReply(interaction, {
      content: "❌ Tipo de ticket inválido.",
      flags: MessageFlags.Ephemeral,
    })
  }

  try {
    const ticketChannel = await interaction.guild.channels.create({
      name: `${config.emoji}${config.name}-${interaction.user.username}`,
      type: ChannelType.GuildText,
      parent: CONFIG.TICKET_CATEGORY_ID,
      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          id: CONFIG.STAFF_ROLE_ID,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageMessages,
          ],
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
        discriminator: `#${interaction.user.discriminator}`,
      },
    }

    activeTickets.set(userId, ticketData)
    saveActiveTickets() // Salvar imediatamente
    console.log(`✅ Ticket criado e salvo para usuário ${userId} no canal ${ticketChannel.id}`)

    ticketMessages.set(ticketChannel.id, [])
    saveTicketMessages()

    const welcomeEmbed = new EmbedBuilder()
      .setTitle(config.titleMessage)
      .setDescription(`Olá ${interaction.user}! 👋

Seja muito bem-vindo(a) ao seu ticket! Nossa equipe estará aqui para te ajudar da melhor forma possível.

**Por favor, descreva detalhadamente sua solicitação para que possamos te atender rapidamente.**

**📋 Informações do Ticket:**
• **Usuário:** ${interaction.user}
• **Tipo:** ${config.title}
• **Criado em:** <t:${Math.floor(Date.now() / 1000)}:F>

**📝 Instruções:**
• Descreva sua solicitação com detalhes
• Aguarde o atendimento da nossa equipe
• Para fechar o ticket, use o botão abaixo`)
      .setColor(config.color)
      .setThumbnail(interaction.user.displayAvatarURL())
      .setFooter({ text: "Sistema de Tickets • Aguardando atendimento" })
      .setTimestamp()

    const closeButton = new ButtonBuilder()
      .setCustomId("close_ticket_modal")
      .setLabel("🔒 Fechar Ticket")
      .setStyle(ButtonStyle.Danger)

    const assumeButton = new ButtonBuilder()
      .setCustomId("assume_ticket")
      .setLabel("👑 Assumir Ticket")
      .setStyle(ButtonStyle.Primary)

    const addMemberButton = new ButtonBuilder()
      .setCustomId("add_member_modal")
      .setLabel("➕ Adicionar Membro")
      .setStyle(ButtonStyle.Secondary)

    const removeMemberButton = new ButtonBuilder()
      .setCustomId("remove_member_modal")
      .setLabel("➖ Remover Membro")
      .setStyle(ButtonStyle.Secondary)

    const warnMemberButton = new ButtonBuilder()
      .setCustomId("warn_member")
      .setLabel("⚠️ Avisar Membro")
      .setStyle(ButtonStyle.Secondary)

    const moveTicketButton = new ButtonBuilder()
      .setCustomId("move_ticket_modal")
      .setLabel("📁 Mover Ticket")
      .setStyle(ButtonStyle.Secondary)

    const buttonRow1 = new ActionRowBuilder().addComponents(closeButton, assumeButton, addMemberButton)
    const buttonRow2 = new ActionRowBuilder().addComponents(removeMemberButton, warnMemberButton, moveTicketButton)

    await ticketChannel.send({
      content: `${interaction.user} <@&${CONFIG.STAFF_ROLE_ID}>`,
      embeds: [welcomeEmbed],
      components: [buttonRow1, buttonRow2],
    })

    await safeReply(interaction, {
      content: `✅ Ticket criado com sucesso! Acesse: ${ticketChannel}`,
      flags: MessageFlags.Ephemeral,
    })
  } catch (error) {
    console.error("Erro ao criar ticket:", error)
    await safeReply(interaction, {
      content: "❌ Erro ao criar o ticket. Tente novamente mais tarde.",
      flags: MessageFlags.Ephemeral,
    })
  }
}

async function assumeTicket(interaction) {
  try {
    const ticketInfo = findTicketByChannel(interaction.channel.id)

    if (!ticketInfo) {
      return await safeReply(interaction, {
        content: "❌ Ticket não encontrado.",
        flags: MessageFlags.Ephemeral,
      })
    }

    // Salvar quem assumiu o ticket
    const { userId, ticket } = ticketInfo
    ticket.assumedBy = {
      id: interaction.user.id,
      name: interaction.member.displayName || interaction.user.displayName || interaction.user.username,
      username: interaction.user.username,
    }

    activeTickets.set(userId, ticket)
    saveActiveTickets()

    // Enviar mensagem de boas-vindas mencionando o usuário e quem assumiu
    const welcomeMessage = `Olá <@${userId}>,

Bem-vindo ao suporte **${interaction.guild.name}**. Meu nome é <@${interaction.user.id}>. Como posso atendê-lo(a)?`

    const assumedEmbed = new EmbedBuilder()
      .setDescription(
        `${ticket.assumedBy.name} <-- Oficial que Assumiu\n\n✅ Atendimento assumido com sucesso pelo oficial!`,
      )
      .setColor("#00ff00")
      .setTimestamp()

    await interaction.channel.send({
      content: welcomeMessage,
      embeds: [assumedEmbed],
    })

    // Atualizar os botões na mensagem original
    const closeButton = new ButtonBuilder()
      .setCustomId("close_ticket_modal")
      .setLabel("🔒 Fechar Ticket")
      .setStyle(ButtonStyle.Danger)

    const assumeButton = new ButtonBuilder()
      .setCustomId("assume_ticket")
      .setLabel(`👑 Assumido por: ${ticket.assumedBy.name}`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true)

    const addMemberButton = new ButtonBuilder()
      .setCustomId("add_member_modal")
      .setLabel("➕ Adicionar Membro")
      .setStyle(ButtonStyle.Secondary)

    const removeMemberButton = new ButtonBuilder()
      .setCustomId("remove_member_modal")
      .setLabel("➖ Remover Membro")
      .setStyle(ButtonStyle.Secondary)

    const warnMemberButton = new ButtonBuilder()
      .setCustomId("warn_member")
      .setLabel("⚠️ Avisar Membro")
      .setStyle(ButtonStyle.Secondary)

    const moveTicketButton = new ButtonBuilder()
      .setCustomId("move_ticket_modal")
      .setLabel("📁 Mover Ticket")
      .setStyle(ButtonStyle.Secondary)

    const buttonRow1 = new ActionRowBuilder().addComponents(closeButton, assumeButton, addMemberButton)
    const buttonRow2 = new ActionRowBuilder().addComponents(removeMemberButton, warnMemberButton, moveTicketButton)

    // Buscar a mensagem original do ticket (primeira mensagem do bot no canal)
    const messages = await interaction.channel.messages.fetch({ limit: 50 })
    const botMessages = messages.filter((msg) => msg.author.id === client.user.id && msg.embeds.length > 0)
    const originalMessage = botMessages.last() // Pega a primeira mensagem do bot

    if (originalMessage) {
      try {
        await originalMessage.edit({
          components: [buttonRow1, buttonRow2],
        })
      } catch (editError) {
        console.error("Erro ao editar mensagem original:", editError)
      }
    }

    // Responder apenas com uma mensagem ephemeral
    await safeReply(interaction, {
      content: `✅ Você assumiu este ticket!`,
      flags: MessageFlags.Ephemeral,
    })
  } catch (error) {
    console.error("Erro ao assumir ticket:", error.message)
    await safeReply(interaction, {
      content: "❌ Erro ao assumir ticket.",
      flags: MessageFlags.Ephemeral,
    })
  }
}

async function showMoveTicketModal(interaction) {
  // Verificar se é staff
  if (!interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) {
    return await safeReply(interaction, {
      content: "❌ Apenas membros da staff podem mover tickets.",
      flags: MessageFlags.Ephemeral,
    })
  }

  try {
    const modal = new ModalBuilder().setCustomId("move_ticket_category").setTitle("Mover Ticket para Outra Categoria")

    const categoryInput = new TextInputBuilder()
      .setCustomId("category_id")
      .setLabel("ID da Nova Categoria:")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Cole o ID da categoria de destino...")
      .setRequired(true)
      .setMaxLength(20)

    const reasonInput = new TextInputBuilder()
      .setCustomId("move_reason")
      .setLabel("Motivo da movimentação:")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Por que este ticket está sendo movido?")
      .setRequired(false)
      .setMaxLength(500)

    const firstActionRow = new ActionRowBuilder().addComponents(categoryInput)
    const secondActionRow = new ActionRowBuilder().addComponents(reasonInput)

    modal.addComponents(firstActionRow, secondActionRow)

    await interaction.showModal(modal)
  } catch (error) {
    console.error("Erro ao mostrar modal de mover ticket:", error.message)
    await safeReply(interaction, {
      content: "❌ Erro ao abrir formulário. Tente novamente.",
      flags: MessageFlags.Ephemeral,
    })
  }
}

async function handleMoveTicketModal(interaction) {
  const categoryId = interaction.fields.getTextInputValue("category_id")
  const reason = interaction.fields.getTextInputValue("move_reason") || "Sem motivo especificado"

  try {
    // Verificar se a categoria existe
    const targetCategory = await interaction.guild.channels.fetch(categoryId)

    if (!targetCategory || targetCategory.type !== ChannelType.GuildCategory) {
      return await safeReply(interaction, {
        content: "❌ Categoria não encontrada ou ID inválido. Verifique se o ID está correto.",
        flags: MessageFlags.Ephemeral,
      })
    }

    // Mover o canal para a nova categoria
    await interaction.channel.setParent(categoryId)

    const embed = new EmbedBuilder()
      .setTitle("📁 Ticket Movido")
      .setDescription(`Este ticket foi movido por ${interaction.user}
      
**Nova Categoria:** ${targetCategory.name}
**Motivo:** ${reason}
**Data:** <t:${Math.floor(Date.now() / 1000)}:F>`)
      .setColor("#0099ff")
      .setTimestamp()

    await safeReply(interaction, {
      embeds: [embed],
    })

    console.log(
      `📁 Ticket ${interaction.channel.name} movido para categoria ${targetCategory.name} por ${interaction.user.username}`,
    )
  } catch (error) {
    console.error("Erro ao mover ticket:", error)
    await safeReply(interaction, {
      content: "❌ Erro ao mover o ticket. Verifique se o ID da categoria está correto e se o bot tem permissões.",
      flags: MessageFlags.Ephemeral,
    })
  }
}

async function showAddMemberModal(interaction) {
  try {
    const modal = new ModalBuilder().setCustomId("add_member_id").setTitle("Adicionar Membro ao Ticket")

    const userIdInput = new TextInputBuilder()
      .setCustomId("user_id")
      .setLabel("ID do Discord do usuário:")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Cole o ID do Discord aqui...")
      .setRequired(true)
      .setMaxLength(20)

    const firstActionRow = new ActionRowBuilder().addComponents(userIdInput)
    modal.addComponents(firstActionRow)

    await interaction.showModal(modal)
  } catch (error) {
    console.error("Erro ao mostrar modal:", error.message)
    await safeReply(interaction, {
      content: "❌ Erro ao abrir formulário. Tente novamente.",
      flags: MessageFlags.Ephemeral,
    })
  }
}

async function handleAddMemberModal(interaction) {
  const userId = interaction.fields.getTextInputValue("user_id")

  try {
    const member = await interaction.guild.members.fetch(userId)

    await interaction.channel.permissionOverwrites.create(member.user, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    })

    const embed = new EmbedBuilder()
      .setTitle("➕ Membro Adicionado")
      .setDescription(`${member.user} foi adicionado ao ticket por ${interaction.user}.`)
      .setColor("#00ff00")
      .setTimestamp()

    await safeReply(interaction, {
      content: `${member.user}`,
      embeds: [embed],
    })
  } catch (error) {
    await safeReply(interaction, {
      content: "❌ Usuário não encontrado. Verifique se o ID está correto.",
      flags: MessageFlags.Ephemeral,
    })
  }
}

async function warnMember(interaction) {
  const ticketInfo = findTicketByChannel(interaction.channel.id)

  if (!ticketInfo) {
    return await safeReply(interaction, {
      content: "❌ Não foi possível encontrar o dono do ticket.",
      flags: MessageFlags.Ephemeral,
    })
  }

  const { userId: ticketUserId } = ticketInfo

  const embed = new EmbedBuilder()
    .setTitle("⚠️ Aviso ao Membro")
    .setDescription(`<@${ticketUserId}>, você tem um ticket em aberto que precisa de sua atenção.
    
**Por favor:**
• Responda às perguntas da equipe
• Forneça as informações solicitadas
• Mantenha-se ativo no ticket

**Lembre-se:** Tickets inativos podem ser fechados automaticamente.`)
    .setColor("#ffaa00")
    .setTimestamp()

  await safeReply(interaction, {
    content: `<@${ticketUserId}>`,
    embeds: [embed],
  })
}

async function renameTicket(interaction) {
  const currentName = interaction.channel.name
  const newName = `${currentName}-editado-${Date.now().toString().slice(-4)}`

  try {
    await interaction.channel.setName(newName)

    const embed = new EmbedBuilder()
      .setTitle("✏️ Ticket Renomeado")
      .setDescription(`Canal renomeado por ${interaction.user}
      
**Nome anterior:** ${currentName}
**Nome atual:** ${newName}`)
      .setColor("#0099ff")
      .setTimestamp()

    await safeReply(interaction, {
      embeds: [embed],
    })
  } catch (error) {
    await safeReply(interaction, {
      content: "❌ Erro ao renomear o ticket.",
      flags: MessageFlags.Ephemeral,
    })
  }
}

async function showRemoveMemberModal(interaction) {
  try {
    const modal = new ModalBuilder().setCustomId("remove_member_id").setTitle("Remover Membro do Ticket")

    const userIdInput = new TextInputBuilder()
      .setCustomId("user_id")
      .setLabel("ID do Discord do usuário:")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Cole o ID do Discord aqui...")
      .setRequired(true)
      .setMaxLength(20)

    const firstActionRow = new ActionRowBuilder().addComponents(userIdInput)
    modal.addComponents(firstActionRow)

    await interaction.showModal(modal)
  } catch (error) {
    console.error("Erro ao mostrar modal:", error.message)
    await safeReply(interaction, {
      content: "❌ Erro ao abrir formulário. Tente novamente.",
      flags: MessageFlags.Ephemeral,
    })
  }
}

async function handleRemoveMemberModal(interaction) {
  const userId = interaction.fields.getTextInputValue("user_id")

  try {
    const member = await interaction.guild.members.fetch(userId)

    const ticketInfo = findTicketByChannel(interaction.channel.id)
    if (ticketInfo && ticketInfo.userId === userId) {
      return await safeReply(interaction, {
        content: "❌ Não é possível remover o dono do ticket.",
        flags: MessageFlags.Ephemeral,
      })
    }

    await interaction.channel.permissionOverwrites.delete(member.user)

    const embed = new EmbedBuilder()
      .setTitle("➖ Membro Removido")
      .setDescription(`${member.user} foi removido do ticket por ${interaction.user}.`)
      .setColor("#ff6b6b")
      .setTimestamp()

    await safeReply(interaction, {
      embeds: [embed],
    })
  } catch (error) {
    await safeReply(interaction, {
      content: "❌ Usuário não encontrado ou não tem acesso ao ticket.",
      flags: MessageFlags.Ephemeral,
    })
  }
}

async function showCloseTicketModal(interaction) {
  // Implementação do modal de fechar ticket
  const modal = new ModalBuilder().setCustomId("close_ticket_reason").setTitle("Fechar Ticket")

  const reasonInput = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel("Motivo do fechamento:")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Por que você está fechando este ticket?")
    .setRequired(true)
    .setMaxLength(500)

  const actionRow = new ActionRowBuilder().addComponents(reasonInput)
  modal.addComponents(actionRow)

  await interaction.showModal(modal)
}

async function handleCloseTicketModal(interaction) {
  const reason = interaction.fields.getTextInputValue("reason")

  const ticketInfo = findTicketByChannel(interaction.channel.id)
  if (!ticketInfo) {
    return await safeReply(interaction, {
      content: "❌ Ticket não encontrado.",
      flags: MessageFlags.Ephemeral,
    })
  }

  const { userId: ticketUserId, ticket } = ticketInfo

  // Remover ticket dos ativos
  activeTickets.delete(ticketUserId)
  saveActiveTickets()

  try {
    const ticketId = `TK-${Date.now().toString().slice(-6)}`

    const duration = new Date() - ticket.createdAt
    const hours = Math.floor(duration / (1000 * 60 * 60))
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60))

    const closedTicket = {
      id: ticketId,
      user: ticket.user,
      category: getCategoryName(ticket.type),
      closedAt: new Date().toISOString(),
      duration: `${hours}h ${minutes}m`,
      closedBy: interaction.user.username,
      priority: getPriorityFromType(ticket.type),
      satisfaction: Math.floor(Math.random() * 2) + 4,
      channelId: ticket.channelId,
      createdAt: ticket.createdAt.toISOString(),
      reason: reason,
    }

    closedTickets.set(ticketId, closedTicket)
    saveClosedTickets()

    const messagesForDashboard = ticketMessages.get(ticket.channelId) || []

    // Responder imediatamente para evitar timeout
    await safeReply(interaction, {
      content: "🔄 Processando fechamento do ticket...",
      flags: MessageFlags.Ephemeral,
    })

    // Processar fechamento em background
    setTimeout(async () => {
      try {
        const logEmbed = new EmbedBuilder()
          .setTitle("🔒 Ticket Fechado")
          .setDescription(`**ID:** ${ticketId}
**Usuário:** <@${ticketUserId}>
**Tipo:** ${ticket.type}
**Criado em:** <t:${Math.floor(ticket.createdAt.getTime() / 1000)}:F>
**Fechado em:** <t:${Math.floor(Date.now() / 1000)}:F>
**Fechado por:** ${interaction.user}
**Duração:** ${hours}h ${minutes}m
**Motivo:** ${reason}`)
          .setColor("#ff6b6b")
          .setTimestamp()

        // Enviar mensagem de fechamento no canal
        await interaction.channel.send({
          content: "🔒 Ticket será fechado em 5 segundos...",
          embeds: [logEmbed],
        })

        // Enviar para dashboard
        if (CONFIG.DASHBOARD_URL) {
          try {
            await fetch(`${CONFIG.DASHBOARD_URL}/api/tickets/add`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...closedTicket, messages: messagesForDashboard }),
            })
            console.log(`✅ Ticket ${ticketId} enviado para o dashboard web.`)
          } catch (dashboardError) {
            console.error(`❌ Erro ao enviar ticket ${ticketId} para o dashboard web:`, dashboardError)
          }
        }

        // Deletar canal após 5 segundos
        setTimeout(async () => {
          try {
            const channelToDelete = await client.channels.fetch(ticket.channelId).catch(() => null)
            if (channelToDelete) {
              await channelToDelete.delete()
              console.log(`✅ Canal ${ticket.channelId} deletado com sucesso`)
            } else {
              console.log(`⚠️ Canal ${ticket.channelId} já foi deletado ou não existe`)
            }
          } catch (deleteError) {
            console.error("❌ Erro ao deletar canal:", deleteError.message)
          }
        }, 5000)
      } catch (processError) {
        console.error("❌ Erro ao processar fechamento:", processError)
        try {
          await interaction.channel.send({
            content: "❌ Erro ao processar fechamento do ticket. Contate um administrador.",
          })
        } catch (sendError) {
          console.error("❌ Erro ao enviar mensagem de erro:", sendError)
        }
      }
    }, 100) // Pequeno delay para garantir que a resposta foi enviada
  } catch (error) {
    console.error("Erro ao fechar ticket:", error)
    await safeReply(interaction, {
      content: "❌ Erro ao fechar o ticket.",
      flags: MessageFlags.Ephemeral,
    })
  }
}

// Funções adicionais declaradas antes de serem usadas
async function closeTicket(interaction) {
  // Implementação do fechamento de ticket
  const ticketInfo = findTicketByChannel(interaction.channel.id)
  if (!ticketInfo) {
    return await safeReply(interaction, {
      content: "❌ Ticket não encontrado.",
      flags: MessageFlags.Ephemeral,
    })
  }

  const { userId, ticket } = ticketInfo

  const modal = new ModalBuilder().setCustomId("close_ticket_reason").setTitle("Fechar Ticket")

  const reasonInput = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel("Motivo do fechamento:")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Por que você está fechando este ticket?")
    .setRequired(true)
    .setMaxLength(500)

  const actionRow = new ActionRowBuilder().addComponents(reasonInput)
  modal.addComponents(actionRow)

  await interaction.showModal(modal)
}

async function configureTicketChannel(interaction) {
  // Implementação da configuração de canal de ticket
  const channel = interaction.options.getChannel("canal")

  if (!channel) {
    return await safeReply(interaction, {
      content: "❌ Canal não encontrado.",
      flags: MessageFlags.Ephemeral,
    })
  }

  const guildConfig = serverConfigs.get(interaction.guild.id) || {}
  guildConfig.ticketChannelId = channel.id

  serverConfigs.set(interaction.guild.id, guildConfig)
  saveServerConfigs()

  await safeReply(interaction, {
    content: `✅ Canal de tickets configurado para: ${channel}`,
    flags: MessageFlags.Ephemeral,
  })
}

async function confirmCloseTicket(interaction, ticketInfo) {
  // Implementação da confirmação de fechamento de ticket
  const { userId, ticket } = ticketInfo

  const embed = new EmbedBuilder()
    .setTitle("🔒 Confirmar Fechamento do Ticket")
    .setDescription(`Você está prestes a fechar o ticket do usuário <@${userId}>.
    
**Motivo:** ${interaction.fields.getTextInputValue("reason")}
**Tipo:** ${ticket.type}
**Criado em:** <t:${Math.floor(ticket.createdAt.getTime() / 1000)}:F>

**Tem certeza que deseja fechar este ticket?**`)
    .setColor("#ff6b6b")
    .setTimestamp()

  const confirmButton = new ButtonBuilder()
    .setCustomId("close_ticket_confirm")
    .setLabel("Confirmar")
    .setStyle(ButtonStyle.Success)

  const cancelButton = new ButtonBuilder()
    .setCustomId("close_ticket_cancel")
    .setLabel("Cancelar")
    .setStyle(ButtonStyle.Danger)

  const buttonRow = new ActionRowBuilder().addComponents(confirmButton, cancelButton)

  await safeReply(interaction, {
    embeds: [embed],
    components: [buttonRow],
    flags: MessageFlags.Ephemeral,
  })
}

// Salvar dados antes de desligar
process.on("SIGINT", () => {
  console.log("💾 Salvando dados antes de desligar...")
  saveActiveTickets()
  saveClosedTickets()
  saveTicketMessages()
  saveServerConfigs()
  process.exit(0)
})

process.on("SIGTERM", () => {
  console.log("💾 Salvando dados antes de desligar...")
  saveActiveTickets()
  saveClosedTickets()
  saveTicketMessages()
  saveServerConfigs()
  process.exit(0)
})

// Manipulador de erros
client.on("error", (error) => {
  DiscloudMonitor.logError(error, "Erro do cliente Discord")
})

process.on("unhandledRejection", (error) => {
  DiscloudMonitor.logError(error, "Promise rejeitada não tratada")
})

process.on("uncaughtException", (error) => {
  DiscloudMonitor.logError(error, "Exceção não capturada")

  // Salvar dados antes de sair
  saveActiveTickets()
  saveClosedTickets()
  saveTicketMessages()
  saveServerConfigs()

  process.exit(1)
})

// Login do bot
client.login(CONFIG.TOKEN)

function getCategoryName(type) {
  const categories = {
    up_patente: "Up de Patente",
    duvidas: "Dúvidas Gerais",
    sugestoes: "Sugestões",
  }
  return categories[type] || "Outros"
}

function getPriorityFromType(type) {
  const priorities = {
    up_patente: "Média",
    duvidas: "Baixa",
    sugestoes: "Baixa",
  }
  return priorities[type] || "Média"
}

