require("dotenv").config();
const fs = require("fs");
const http = require("http");
const https = require("https");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder,
  Routes,
  REST
} = require("discord.js");

const TOKEN = process.env.TOKEN;

// ===== CONFIG =====
const GUILD_ID = "1466476014908473550";
const RESET_ROLE_ID = "1475815959616032883";
const INTERN_ROLE_ID = "1467725396433834149";
const WEEK_CHANNEL_ID = "ID_KENH_CHAM_CONG";

// ===== KEEP ALIVE RENDER =====
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => res.end("OK")).listen(PORT);

setInterval(() => {
  if (process.env.RENDER_EXTERNAL_URL) {
    https.get(process.env.RENDER_EXTERNAL_URL);
  }
}, 5 * 60 * 1000);

// ===== CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences
  ]
});

// ===== DATABASE =====
const DB_FILE = "./duty.json";
let db = {};

function loadDB() {
  if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE));
}
function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}
loadDB();

// ===== TIME VN =====
function nowVN() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
}

function dateKeyVN() {
  return nowVN().toLocaleDateString("vi-VN");
}

function formatTime(ms) {
  return new Date(ms).toLocaleTimeString("vi-VN", {
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh"
  });
}

function diffText(ms) {
  const m = Math.floor(ms / 60000);
  return `${Math.floor(m / 60)} giờ ${m % 60} phút`;
}

// ===== USER DB =====
function getUser(id) {
  if (!db[id]) db[id] = { total: 0, days: {} };
  return db[id];
}

// ===== TÍNH PHÚT 1 NGÀY =====
function getDayMinutes(user, dayKey) {
  const day = user.days[dayKey];
  if (!day) return 0;

  let total = 0;

  day.sessions.forEach(s => {
    const end = s.end || Date.now();
    total += end - s.start;
  });

  if (day.extra) total += day.extra;

  return Math.floor(total / 60000);
}

// ===== EMBED =====
function buildEmbed(member, user, dayKey, status) {
  const day = user.days[dayKey];
  if (!day) return null;

  let timeline = "";
  let totalDay = 0;
  const now = Date.now();

  day.sessions.forEach(s => {
    const end = s.end || now;
    timeline += `${formatTime(s.start)} ➝ ${s.end ? formatTime(s.end) : "..."}\n`;
    totalDay += end - s.start;
  });

  if (day.extra) totalDay += day.extra;

  const isIntern = member.roles.cache.has(INTERN_ROLE_ID);

  return new EmbedBuilder()
    .setColor(status.includes("Off") ? "#ff4d4f" : "#00ff9c")
    .setAuthor({ name: "BẢNG ONDUTY" })
    .setDescription(
`**Tên Nhân Sự :** ${member}

**Biển Số :** ${day.plate || "Chưa nhập"}

**Thời Gian Onduty :**
${timeline || "Chưa có"}

**Ngày Onduty :** ${dayKey}

**Tổng Thời Gian Onduty :** ${diffText(totalDay)}
${isIntern ? `\n**Tổng Thời Gian Thực Tập :** ${diffText(user.total)}` : ""}

**Trạng Thái Hoạt Động :** ${status}`
    );
}

// ===== SEND / UPDATE =====
async function sendOrUpdateEmbed(channel, member, user, dayKey, status) {
  const day = user.days[dayKey];
  const embed = buildEmbed(member, user, dayKey, status);
  if (!embed) return;

  if (day.messageId && day.channelId) {
    try {
      const ch = await client.channels.fetch(day.channelId);
      const msg = await ch.messages.fetch(day.messageId);
      if (msg) {
        await msg.edit({ embeds: [embed] });
        return;
      }
    } catch {}
  }

  const msg = await channel.send({ embeds: [embed] });
  day.messageId = msg.id;
  day.channelId = channel.id;
  saveDB();
}

// ===== COMMANDS =====
const commands = [

  new SlashCommandBuilder()
    .setName("onduty")
    .setDescription("Bắt đầu trực")
    .addStringOption(o =>
      o.setName("bienso").setDescription("Biển số").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("offduty")
    .setDescription("Kết thúc trực"),

  new SlashCommandBuilder()
    .setName("thaybienso")
    .setDescription("Đổi biển số khi đang trực")
    .addStringOption(o =>
      o.setName("bienso").setDescription("Biển số mới").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("penalty")
    .setDescription("Cộng thời gian")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addIntegerOption(o => o.setName("minutes").setRequired(true))
    .addStringOption(o =>
      o.setName("type")
        .setRequired(true)
        .addChoices(
          { name: "Onduty ngày", value: "day" },
          { name: "Thực tập tổng", value: "total" }
        )
    ),

  new SlashCommandBuilder()
    .setName("adjust")
    .setDescription("Trừ thời gian")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addIntegerOption(o => o.setName("minutes").setRequired(true))
    .addStringOption(o =>
      o.setName("type")
        .setRequired(true)
        .addChoices(
          { name: "Onduty ngày", value: "day" },
          { name: "Thực tập tổng", value: "total" }
        )
    ),

  new SlashCommandBuilder()
    .setName("forced_duty")
    .setDescription("Cưỡng chế offduty")
    .addUserOption(o => o.setName("user").setRequired(true)),

  new SlashCommandBuilder()
    .setName("week")
    .setDescription("Xem chấm công 7 ngày")
    .addUserOption(o =>
      o.setName("user")
       .setDescription("Nhân sự")
       .setRequired(true)
    )

].map(c => c.toJSON());

// ===== READY =====
client.once("ready", async () => {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(client.user.id, GUILD_ID),
    { body: commands }
  );

  console.log("Bot ready");
});

// ===== COMMAND HANDLER =====
client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;

  const member = await i.guild.members.fetch(i.user.id);
  const user = getUser(member.id);
  const dayKey = dateKeyVN();

  // ===== WEEK REPORT =====
  if (i.commandName === "week") {

  if (i.channel.id !== WEEK_CHANNEL_ID) {
    return i.reply({
      content: "❌ Chỉ được dùng lệnh này tại kênh chấm công.",
      ephemeral: true
    });
  }

    const u = i.options.getUser("user");
    const target = getUser(u.id);

    const days = [];

    for (let x = 0; x < 7; x++) {

      const d = new Date(nowVN());
      d.setDate(d.getDate() - x);

      const key = d.toLocaleDateString("vi-VN");

      const minutes = getDayMinutes(target, key);

      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;

      const icon = minutes >= 180 ? "🟢" : "🔴";

      days.push(`${key} : ${hours}h ${mins}p ${icon}`);
    }

    const embed = new EmbedBuilder()
      .setColor("#00ff9c")
      .setTitle("📊 CHẤM CÔNG TUẦN")
      .setDescription(
`Nhân sự: ${u}

${days.reverse().join("\n")}

🟢 ≥ 3 giờ
🔴 < 3 giờ`
      );

    return i.reply({ embeds: [embed] });
  }

});
client.login(TOKEN);