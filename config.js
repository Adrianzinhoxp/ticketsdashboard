// ✅ VERSÃO CORRIGIDA - com fallbacks e debug
module.exports = {
  // Token do bot Discord com debug
  TOKEN: process.env.DISCORD_TOKEN || process.env.TOKEN || null,

  // ID do servidor Discord
  GUILD_ID: process.env.GUILD_ID || null,

  // ID da categoria de tickets
  TICKET_CATEGORY_ID: process.env.TICKET_CATEGORY_ID || null,

  // ID do cargo de staff
  STAFF_ROLE_ID: process.env.STAFF_ROLE_ID || null,

  // Configurações do Railway
  DASHBOARD_PORT: process.env.PORT || 3000,
  DASHBOARD_URL: process.env.RAILWAY_STATIC_URL || `https://${process.env.RAILWAY_STATIC_URL}`,

  // URL da imagem do painel
  PANEL_IMAGE_URL:
    process.env.PANEL_IMAGE_URL || "https://media.discordapp.net/attachments/1414044312890769448/1414399292898148412/pixverse_mp4_media_web_ori_fa7658cc-7fb8-4d46-be6f-4f2b80bad4ab_seed1827978493_1.gif?ex=68caa23d&is=68c950bd&hm=255f6b4a2c9d6ea9fbeb280f728cbdd1484256867bb6a0576bb5a4424a9e8e93&=",

  // Database URL (se usar Neon)
  DATABASE_URL: process.env.DATABASE_URL,

  // Debug function
  debug: () => {
    console.log("🔍 DEBUG - Variáveis de Ambiente:")
    console.log("TOKEN:", process.env.DISCORD_TOKEN ? "✅ Definido" : "❌ Não encontrado")
    console.log("GUILD_ID:", process.env.GUILD_ID ? "✅ Definido" : "❌ Não encontrado")
    console.log("TICKET_CATEGORY_ID:", process.env.TICKET_CATEGORY_ID ? "✅ Definido" : "❌ Não encontrado")
    console.log("STAFF_ROLE_ID:", process.env.STAFF_ROLE_ID ? "✅ Definido" : "❌ Não encontrado")
    console.log("PORT:", process.env.PORT || "3000 (padrão)")
  },
}
