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
const GUILD_ID = "1386213843134578779";
const RESET_ROLE_ID = "1481107826041421874";
const INTERN_ROLE_ID = "1481107791082160260";

const DUTY_CHANNEL_ID = "1481102417272635514";
const WEEK_CHANNEL_ID = "1481104380739584060";

// ===== KEEP ALIVE =====
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => res.end("OK")).listen(PORT);

setInterval(() => {
  if (process.env.RENDER_EXTERNAL_URL) {
    https.get(process.env.RENDER_EXTERNAL_URL);
  }
}, 300000);

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

// ===== TIME =====
function nowVN() {
  return new Date(
    new Date().toLocaleString("en-US", {
      timeZone: "Asia/Ho_Chi_Minh"
    })
  );
}

function dateKeyVN(date = nowVN()) {
  return date.toLocaleDateString("vi-VN");
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

// ===== USER =====
function getUser(id) {
  if (!db[id]) db[id] = { total: 0, days: {} };
  return db[id];
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
    .setDescription(`**Tên Nhân Sự :** ${member}

**Biển Số :** ${day.plate || "Chưa nhập"}

**Thời Gian Onduty :**
${timeline || "Chưa có"}

**Ngày Onduty :** ${dayKey}

**Tổng Thời Gian Onduty :** ${diffText(totalDay)}
${isIntern ? `\n**Tổng Thời Gian Thực Tập :** ${diffText(user.total)}` : ""}

**Trạng Thái Hoạt Động :** ${status}`);
}

// ===== SEND EMBED =====
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
  o.setName("bienso")
  .setDescription("Biển số")
  .setRequired(true)
),

new SlashCommandBuilder()
.setName("offduty")
.setDescription("Kết thúc trực"),

new SlashCommandBuilder()
.setName("thaybienso")
.setDescription("Đổi biển số")
.addStringOption(o =>
  o.setName("bienso")
  .setDescription("Biển số mới")
  .setRequired(true)
),

new SlashCommandBuilder()
.setName("penalty")
.setDescription("Cộng thời gian")
.addUserOption(o =>
  o.setName("user")
  .setDescription("Người cần cộng")
  .setRequired(true)
)
.addIntegerOption(o =>
  o.setName("minutes")
  .setDescription("Số phút")
  .setRequired(true)
)
.addStringOption(o =>
  o.setName("type")
  .setDescription("Loại cộng")
  .setRequired(true)
  .addChoices(
    { name: "Onduty ngày", value: "day" },
    { name: "Thực tập tổng", value: "total" }
  )
),

new SlashCommandBuilder()
.setName("adjust")
.setDescription("Trừ thời gian")
.addUserOption(o =>
  o.setName("user")
  .setDescription("Người cần trừ")
  .setRequired(true)
)
.addIntegerOption(o =>
  o.setName("minutes")
  .setDescription("Số phút")
  .setRequired(true)
)
.addStringOption(o =>
  o.setName("type")
  .setDescription("Loại trừ")
  .setRequired(true)
  .addChoices(
    { name: "Onduty ngày", value: "day" },
    { name: "Thực tập tổng", value: "total" }
  )
),

new SlashCommandBuilder()
.setName("forced_duty")
.setDescription("Cưỡng chế offduty")
.addUserOption(o =>
  o.setName("user")
  .setDescription("User cần off")
  .setRequired(true)
),

new SlashCommandBuilder()
.setName("week")
.setDescription("Xem chấm công tuần")

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

  // ===== WEEK =====
  if (i.commandName === "week") {

    if (i.channel.id !== WEEK_CHANNEL_ID)
      return i.reply({
        content: "❌ Lệnh này chỉ dùng tại kênh chấm công",
        ephemeral: true
      });

    const monday = new Date(nowVN());
    const day = monday.getDay() || 7;

    monday.setDate(monday.getDate() - day + 1);

    let result = "";

    for (let d = 0; d < 7; d++) {

      const date = new Date(monday);
      date.setDate(monday.getDate() + d);

      const key = dateKeyVN(date);
      const data = user.days[key];

      let total = 0;

      if (data) {

        data.sessions.forEach(s => {
          const end = s.end || Date.now();
          total += end - s.start;
        });

        if (data.extra) total += data.extra;
      }

      const icon = total >= 10800000 ? "🟢" : "🔴";

      const weekday = [
        "Thứ 2","Thứ 3","Thứ 4","Thứ 5","Thứ 6","Thứ 7","Chủ Nhật"
      ][d];

      result += `${icon} **${weekday} (${key})** — ${diffText(total)}\n`;
    }

    const embed = new EmbedBuilder()
      .setColor("#0099ff")
      .setTitle("BẢNG CHẤM CÔNG TUẦN")
      .setDescription(`${member}\n\n${result}`);

    return i.reply({ embeds: [embed] });
  }

  if (i.channel.id !== DUTY_CHANNEL_ID)
    return i.reply({
      content: "❌ Lệnh duty chỉ dùng tại kênh duty",
      ephemeral: true
    });

  // ===== ONDUTY =====
  if (i.commandName === "onduty") {

    const activities = member.presence?.activities || [];

    const playing = activities.some(a =>
      a.name?.toLowerCase().includes("gta")
    );

    if (!playing)
      return i.reply({
        content: "❌ Vào Game Đi!",
        ephemeral: true
      });

    let day = user.days[dayKey];

    if (!day) {

      day = user.days[dayKey] = {
        plate: "",
        sessions: [],
        messageId: null,
        channelId: null,
        extra: 0
      };
    }

    if (day.sessions.some(s => !s.end))
      return i.reply({
        content: "❌ Bạn đang onduty rồi",
        ephemeral: true
      });

    const plate = i.options.getString("bienso");

    day.plate = plate;

    day.sessions.push({
      start: Date.now(),
      end: null
    });

    saveDB();

    await sendOrUpdateEmbed(i.channel, member, user, dayKey, "Đang trực");

    return i.reply({
      content: "Onduty thành công",
      ephemeral: true
    });
  }

  // ===== OFFDUTY =====
  if (i.commandName === "offduty") {

    const day = user.days[dayKey];

    if (!day)
      return i.reply({
        content: "Bạn chưa onduty",
        ephemeral: true
      });

    const last = day.sessions.find(s => !s.end);

    if (!last)
      return i.reply({
        content: "Bạn đã off rồi",
        ephemeral: true
      });

    last.end = Date.now();

    user.total += last.end - last.start;

    saveDB();

    await sendOrUpdateEmbed(i.channel, member, user, dayKey, "Off");

    return i.reply({
      content: "Đã offduty",
      ephemeral: true
    });
  }

});
client.login(TOKEN);
