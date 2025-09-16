// ✅ VERSÃO PARA RAILWAY (usando variáveis de ambiente)
module.exports = {
  // Token do bot Discord (será definido no Railway)
  TOKEN: process.env.DISCORD_TOKEN,

  // ID do servidor Discord
  GUILD_ID: process.env.GUILD_ID,

  // ID da categoria de tickets
  TICKET_CATEGORY_ID: process.env.TICKET_CATEGORY_ID,

  // ID do cargo de staff
  STAFF_ROLE_ID: process.env.STAFF_ROLE_ID,

  // Configurações do Railway
  DASHBOARD_PORT: process.env.PORT || 3000,
  DASHBOARD_URL: process.env.RAILWAY_STATIC_URL || `https://${process.env.RAILWAY_STATIC_URL}`,

  // URL da imagem do painel
  PANEL_IMAGE_URL:
    process.env.PANEL_IMAGE_URL || "https://via.placeholder.com/800x200/5865F2/FFFFFF?text=Sistema+de+Tickets",

  // Database URL (se usar Neon)
  DATABASE_URL: process.env.DATABASE_URL,
}
