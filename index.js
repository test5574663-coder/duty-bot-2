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
const MANAGER_ROLE = "1475815959616032883";
const INTERN_ROLE = "1467725396433834149";

const WEEK_CHANNEL = "1480583086797361272";

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

const DB = "./duty.json";
let db = {};

function loadDB(){
if(fs.existsSync(DB)){
db = JSON.parse(fs.readFileSync(DB));
}
}

function saveDB(){
fs.writeFileSync(DB,JSON.stringify(db,null,2));
}

loadDB();

// ===== TIME =====

function nowVN(){
return new Date(
new Date().toLocaleString("en-US",{timeZone:"Asia/Ho_Chi_Minh"})
);
}

function dateKey(){
return nowVN().toLocaleDateString("vi-VN");
}

function formatTime(ms){
return new Date(ms).toLocaleTimeString("vi-VN",{hour12:false});
}

function diffText(ms){

const m = Math.floor(ms/60000);

return `${Math.floor(m/60)} giờ ${m%60} phút`;

}

// ===== USER =====

function getUser(id){

if(!db[id]) db[id]={total:0,days:{}};

return db[id];

}

// ===== BUILD EMBED =====

function buildEmbed(member,user,dayKey,status){

const day = user.days[dayKey];

if(!day) return null;

let timeline="";
let total=0;

const now = Date.now();

day.sessions.forEach(s=>{

const end = s.end || now;

timeline += `${formatTime(s.start)} ➝ ${s.end?formatTime(s.end):"..."}\n`;

total += end - s.start;

});

if(day.extra) total += day.extra;

return new EmbedBuilder()

.setColor(status.includes("Off")?"#ff4d4f":"#00ff9c")

.setAuthor({name:"BẢNG ONDUTY"})

.setDescription(

`**Tên Nhân Sự :** ${member}

**Biển Số :** ${day.plate||"Chưa nhập"}

**Thời Gian Onduty :**
${timeline}

**Ngày Onduty :** ${dayKey}

**Tổng Thời Gian Onduty :** ${diffText(total)}

**Tổng Thời Gian Thực Tập :** ${diffText(user.total)}

**Trạng Thái Hoạt Động :** ${status}`

);

}

// ===== SEND EMBED =====

async function sendEmbed(channel,member,user,dayKey,status){

const day = user.days[dayKey];

const embed = buildEmbed(member,user,dayKey,status);

if(!embed) return;

if(day.messageId){

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

.setDescription("Đổi biển số")

.addStringOption(o=>o.setName("bienso").setDescription("Biển mới").setRequired(true)),

new SlashCommandBuilder()

.setName("penalty")

.setDescription("Cộng thời gian")

.addUserOption(o=>o.setName("user").setRequired(true))

.addIntegerOption(o=>o.setName("minutes").setRequired(true)),

new SlashCommandBuilder()

.setName("adjust")

.setDescription("Trừ thời gian")

.addUserOption(o=>o.setName("user").setRequired(true))

.addIntegerOption(o=>o.setName("minutes").setRequired(true)),

new SlashCommandBuilder()

.setName("forced_duty")

.setDescription("Cưỡng chế offduty")

.addUserOption(o=>o.setName("user").setRequired(true)),

new SlashCommandBuilder()

.setName("reload")

.setDescription("Reload bảng duty")

.addUserOption(o=>o.setName("user").setRequired(true)),

new SlashCommandBuilder()

.setName("week")

.setDescription("Chấm công tuần")

.addUserOption(o=>o.setName("user").setRequired(true))

].map(c=>c.toJSON());

// ===== READY =====

client.once("ready",async()=>{

const rest = new REST({version:"10"}).setToken(TOKEN);

await rest.put(

Routes.applicationGuildCommands(client.user.id,GUILD_ID),

{body:[]}

);

await rest.put(

Routes.applicationGuildCommands(client.user.id,GUILD_ID),

{body:commands}

);

console.log("BOT READY");

});

// ===== COMMAND HANDLER =====

client.on("interactionCreate",async i=>{

if(!i.isChatInputCommand()) return;

const member = await i.guild.members.fetch(i.user.id);

const user = getUser(member.id);

const dayKey = dateKey();

// ONDUTY

if(i.commandName==="onduty"){

const plate = i.options.getString("bienso");

let day = user.days[dayKey];

if(!day){

day = user.days[dayKey]={

plate,

sessions:[],

extra:0,

messageId:null,

channelId:null

};

}

if(day.sessions.some(s=>!s.end))

return i.reply({content:"Đang onduty",ephemeral:true});

day.plate=plate;

day.sessions.push({start:Date.now(),end:null});

saveDB();

await sendEmbed(i.channel,member,user,dayKey,"Đang trực");

return i.reply({content:"Onduty thành công",ephemeral:true});

}

// OFFDUTY

if(i.commandName==="offduty"){

const day = user.days[dayKey];

if(!day) return i.reply("Chưa onduty");

const last = day.sessions.find(s=>!s.end);

if(!last) return i.reply("Đã off");

last.end=Date.now();

user.total += last.end-last.start;

saveDB();

await sendEmbed(i.channel,member,user,dayKey,"Off");

return i.reply("Đã offduty");

}

});

// ===== AUTO OFF GTA =====

client.on("presenceUpdate",async(oldP,newP)=>{

if(!newP?.member) return;

const id = newP.member.id;

const user = db[id];

if(!user) return;

const dayKey = dateKey();

const day = user.days[dayKey];

if(!day) return;

const playing = newP.member.presence?.activities?.some(a=>a.name?.toLowerCase().includes("gta"));

if(!playing){

const last = day.sessions.find(s=>!s.end);

if(!last) return;

last.end = Date.now();

user.total += last.end-last.start;

saveDB();

const ch = await client.channels.fetch(day.channelId);

await sendEmbed(ch,newP.member,user,dayKey,"Tự off (Thoát GTA)");

}

});

// ===== AUTO OFF 23:59 =====

setInterval(async()=>{

const now = nowVN();

if(now.getHours()!==23 || now.getMinutes()!==59) return;

const dayKey = dateKey();

for(const id in db){

const user=db[id];

const day=user.days[dayKey];

if(!day) continue;

const last = day.sessions.find(s=>!s.end);

if(!last) continue;

last.end=Date.now();

user.total += last.end-last.start;

saveDB();

try{

const member = await client.guilds.cache.get(GUILD_ID).members.fetch(id);

const ch = await client.channels.fetch(day.channelId);

await sendEmbed(ch,member,user,dayKey,"Tự off (Qua ngày)");

}catch{}

}

},60000);

client.login(TOKEN);
