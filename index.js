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

const DUTY_CHANNEL_ID = "1480583086797361272";
const WEEK_CHANNEL_ID = "1480583086797361272";

// ===== KEEP ALIVE =====

const PORT = process.env.PORT || 3000;
http.createServer((req,res)=>res.end("OK")).listen(PORT);

setInterval(()=>{
if(process.env.RENDER_EXTERNAL_URL){
https.get(process.env.RENDER_EXTERNAL_URL);
}
},300000);

// ===== CLIENT =====

const client = new Client({
intents:[
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMembers,
GatewayIntentBits.GuildPresences
]
});

// ===== DATABASE =====

const DB_FILE = "./duty.json";
let db = {};

function loadDB(){
if(fs.existsSync(DB_FILE)){
db = JSON.parse(fs.readFileSync(DB_FILE));
}
}

function saveDB(){
fs.writeFileSync(DB_FILE,JSON.stringify(db,null,2));
}

loadDB();

// ===== TIME GMT+7 =====

function nowVN(){
return new Date(
new Date().toLocaleString("en-US",{timeZone:"Asia/Ho_Chi_Minh"})
);
}

function dateKey(){
return nowVN().toLocaleDateString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"});
}

function formatTime(ms){
return new Date(ms).toLocaleTimeString("vi-VN",{
hour12:false,
timeZone:"Asia/Ho_Chi_Minh"
});
}

function diffText(ms){

const m = Math.floor(ms/60000);

return `${Math.floor(m/60)} giờ ${m%60} phút`;

}

// ===== USER =====

function getUser(id){

if(!db[id]) db[id] = {total:0,days:{}};

return db[id];

}

// ===== EMBED =====

function buildEmbed(member,user,dayKey,status){

const day = user.days[dayKey];
if(!day) return null;

let timeline="";
let totalDay=0;

const now = Date.now();

day.sessions.forEach(s=>{

const end = s.end || now;

timeline += `${formatTime(s.start)} ➝ ${s.end?formatTime(s.end):"..."}\n`;

totalDay += end - s.start;

});

if(day.extra) totalDay += day.extra;

const isIntern = member.roles.cache.has(INTERN_ROLE_ID);

return new EmbedBuilder()

.setColor(status.includes("Off")?"#ff4d4f":"#00ff9c")

.setAuthor({name:"BẢNG ONDUTY"})

.setDescription(

`**Tên Nhân Sự :** ${member}

**Biển Số :** ${day.plate || "Chưa nhập"}

**Thời Gian Onduty :**
${timeline || "Chưa có"}

**Ngày Onduty :** ${dayKey}

**Tổng Thời Gian Onduty :** ${diffText(totalDay)}
${isIntern?`\n**Tổng Thời Gian Thực Tập :** ${diffText(user.total)}`:""}

**Trạng Thái Hoạt Động :** ${status}`

);

}

// ===== EMBED UPDATE =====

async function sendOrUpdateEmbed(channel,member,user,dayKey,status){

const day = user.days[dayKey];

const embed = buildEmbed(member,user,dayKey,status);

if(!embed) return;

if(day.messageId && day.channelId){

try{

const ch = await client.channels.fetch(day.channelId);
const msg = await ch.messages.fetch(day.messageId);

if(msg){

await msg.edit({embeds:[embed]});
return;

}

}catch{}

}

const msg = await channel.send({embeds:[embed]});

day.messageId = msg.id;
day.channelId = channel.id;

saveDB();

}

// ===== COMMANDS =====

const commands=[

new SlashCommandBuilder()
.setName("onduty")
.setDescription("Bắt đầu trực")
.addStringOption(o=>o.setName("bienso").setDescription("Biển số").setRequired(true)),

new SlashCommandBuilder()
.setName("offduty")
.setDescription("Kết thúc trực"),

new SlashCommandBuilder()
.setName("thaybienso")
.setDescription("Đổi biển số khi đang trực")
.addStringOption(o=>o.setName("bienso").setDescription("Biển số mới").setRequired(true)),

new SlashCommandBuilder()
.setName("penalty")
.setDescription("Cộng thời gian")
.addUserOption(o=>o.setName("user").setDescription("User").setRequired(true))
.addIntegerOption(o=>o.setName("minutes").setDescription("Phút").setRequired(true))
.addStringOption(o=>
o.setName("type")
.setDescription("Loại")
.setRequired(true)
.addChoices(
{name:"Onduty ngày",value:"day"},
{name:"Thực tập tổng",value:"total"}
)
),

new SlashCommandBuilder()
.setName("adjust")
.setDescription("Trừ thời gian")
.addUserOption(o=>o.setName("user").setDescription("User").setRequired(true))
.addIntegerOption(o=>o.setName("minutes").setDescription("Phút").setRequired(true))
.addStringOption(o=>
o.setName("type")
.setDescription("Loại")
.setRequired(true)
.addChoices(
{name:"Onduty ngày",value:"day"},
{name:"Thực tập tổng",value:"total"}
)
),

new SlashCommandBuilder()
.setName("forced_duty")
.setDescription("Cưỡng chế offduty")
.addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)),

new SlashCommandBuilder()
.setName("reload")
.setDescription("Reload bảng duty")
.addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)),

new SlashCommandBuilder()
.setName("week")
.setDescription("Chấm công tuần")
.addUserOption(o=>o.setName("user").setDescription("Nhân sự").setRequired(true))

].map(c=>c.toJSON());

// ===== READY =====

client.once("ready",async()=>{

const rest=new REST({version:"10"}).setToken(TOKEN);

await rest.put(
Routes.applicationGuildCommands(client.user.id,GUILD_ID),
{body:commands}
);

console.log("BOT READY");

});

// ===== COMMAND HANDLER =====

client.on("interactionCreate",async i=>{

if(!i.isChatInputCommand()) return;

await i.deferReply({ephemeral:true});

const member = await i.guild.members.fetch(i.user.id);
const user = getUser(member.id);
const dayKey = dateKey();

// ===== ONDUTY =====

if(i.commandName==="onduty"){

if(i.channel.id!==DUTY_CHANNEL_ID)
return i.editReply("❌ Chỉ được onduty tại kênh duty");

const activities = member.presence?.activities || [];
const playing = activities.some(a=>a.name?.toLowerCase().includes("gta"));

if(!playing)
return i.editReply("❌ Bạn chưa vào GTA");

let day = user.days[dayKey];

if(!day){

day = user.days[dayKey]={
plate:"",
sessions:[],
extra:0,
messageId:null,
channelId:null
};

}

if(day.sessions.some(s=>!s.end))
return i.editReply("❌ Bạn đang onduty");

const plate = i.options.getString("bienso");

day.plate = plate;

day.sessions.push({start:Date.now(),end:null});

saveDB();

await sendOrUpdateEmbed(i.channel,member,user,dayKey,"Đang trực");

return i.editReply("Onduty thành công");

}

// ===== OFFDUTY =====

if(i.commandName==="offduty"){

const day = user.days[dayKey];
if(!day) return i.editReply("Bạn chưa onduty");

const last = day.sessions.find(s=>!s.end);
if(!last) return i.editReply("Bạn đã off");

last.end = Date.now();
user.total += last.end-last.start;

saveDB();

await sendOrUpdateEmbed(i.channel,member,user,dayKey,"Off");

return i.editReply("Đã offduty");

}

});

// ===== AUTO OFF KHI THOÁT GTA =====

client.on("presenceUpdate",async(oldP,newP)=>{

if(!newP?.member) return;

const id = newP.member.id;
const user = db[id];
if(!user) return;

const dayKey = dateKey();
const day = user.days[dayKey];
if(!day) return;

const activities = newP.member.presence?.activities || [];
const playing = activities.some(a=>a.name?.toLowerCase().includes("gta"));

if(!playing){

const last = day.sessions.find(s=>!s.end);
if(!last) return;

last.end = Date.now();

user.total += last.end-last.start;

saveDB();

try{

const ch = await client.channels.fetch(day.channelId);

await sendOrUpdateEmbed(ch,newP.member,user,dayKey,"Tự off (Thoát GTA)");

}catch{}

}

});

// ===== AUTO OFF 23:59 =====

setInterval(async()=>{

const now = nowVN();

if(now.getHours()!==23 || now.getMinutes()!==59) return;

const dayKey = dateKey();

for(const id in db){

const user = db[id];
const day = user.days[dayKey];

if(!day) continue;

const last = day.sessions.find(s=>!s.end);
if(!last) continue;

last.end = Date.now();

user.total += last.end-last.start;

saveDB();

try{

const member = await client.guilds.cache.get(GUILD_ID)?.members.fetch(id);
const ch = await client.channels.fetch(day.channelId);

await sendOrUpdateEmbed(ch,member,user,dayKey,"Tự off (Qua ngày)");

}catch{}

}

},60000);

client.login(TOKEN);
