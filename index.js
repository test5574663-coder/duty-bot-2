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

const GUILD_ID = "1466476014908473550";
const RESET_ROLE_ID = "1475815959616032883";
const INTERN_ROLE_ID = "1467725396433834149";

const DUTY_CHANNEL_ID = "1480584001608614010";
const WEEK_CHANNEL_ID = "1480583086797361272";

const PORT = process.env.PORT || 3000;

http.createServer((req,res)=>res.end("OK")).listen(PORT);

setInterval(()=>{
if(process.env.RENDER_EXTERNAL_URL){
https.get(process.env.RENDER_EXTERNAL_URL);
}
},300000);

const client = new Client({
intents:[
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMembers,
GatewayIntentBits.GuildPresences
]
});

const DB_FILE="./duty.json";
let db={};

function loadDB(){
if(fs.existsSync(DB_FILE)){
db=JSON.parse(fs.readFileSync(DB_FILE));
}
}

function saveDB(){
fs.writeFileSync(DB_FILE,JSON.stringify(db,null,2));
}

loadDB();

function nowVN(){
return new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Ho_Chi_Minh"}));
}

function dateKey(){
return nowVN().toLocaleDateString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"});
}

function formatTime(ms){
return new Date(ms).toLocaleTimeString("vi-VN",{hour12:false,timeZone:"Asia/Ho_Chi_Minh"});
}

function diffText(ms){
const m=Math.floor(ms/60000);
return `${Math.floor(m/60)} giờ ${m%60} phút`;
}

function getUser(id){
if(!db[id]) db[id]={total:0,days:{}};
return db[id];
}

function buildEmbed(member,user,dayKey,status){

const day=user.days[dayKey];
if(!day) return null;

let timeline="";
let totalDay=0;

const now=Date.now();

day.sessions.forEach(s=>{
const end=s.end||now;
timeline+=`${formatTime(s.start)} ➝ ${s.end?formatTime(s.end):"..."}\n`;
totalDay+=end-s.start;
});

if(day.extra) totalDay+=day.extra;

const isIntern=member.roles.cache.has(INTERN_ROLE_ID);

return new EmbedBuilder()
.setColor(status.includes("Off")?"#ff4d4f":"#00ff9c")
.setAuthor({name:"BẢNG ONDUTY"})
.setDescription(

`**Tên Nhân Sự :** ${member}

**Biển Số :** ${day.plate||"Chưa nhập"}

**Thời Gian Onduty :**
${timeline||"Chưa có"}

**Ngày Onduty :** ${dayKey}

**Tổng Thời Gian Onduty :** ${diffText(totalDay)}
${isIntern?`\n**Tổng Thời Gian Thực Tập :** ${diffText(user.total)}`:""}

**Trạng Thái Hoạt Động :** ${status}`

);

}

async function sendOrUpdateEmbed(channel,member,user,dayKey,status){

const day=user.days[dayKey];
const embed=buildEmbed(member,user,dayKey,status);
if(!embed) return;

if(day.messageId && day.channelId){

try{
const ch=await client.channels.fetch(day.channelId);
const msg=await ch.messages.fetch(day.messageId);

if(msg){
await msg.edit({embeds:[embed]});
return;
}

}catch{}

}

const msg=await channel.send({embeds:[embed]});

day.messageId=msg.id;
day.channelId=channel.id;

saveDB();

}

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
.addStringOption(o=>o.setName("bienso").setDescription("Biển số").setRequired(true)),

new SlashCommandBuilder()
.setName("reload")
.setDescription("Reload bảng")
.addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)),

new SlashCommandBuilder()
.setName("week")
.setDescription("Chấm công tuần")
.addUserOption(o=>o.setName("user").setDescription("User").setRequired(true))

].map(c=>c.toJSON());

client.once("ready",async()=>{

const rest=new REST({version:"10"}).setToken(TOKEN);

await rest.put(
Routes.applicationGuildCommands(client.user.id,GUILD_ID),
{body:commands}
);

console.log("BOT READY");

});

client.on("interactionCreate",async i=>{

if(!i.isChatInputCommand()) return;

await i.deferReply({ ephemeral:false });

const member=await i.guild.members.fetch(i.user.id);
const user=getUser(member.id);
const dayKey=dateKey();

if(i.commandName==="onduty"){

if(i.channel.id!==DUTY_CHANNEL_ID)
return i.editReply("❌ Sai kênh onduty");

const activities=member.presence?.activities||[];
const playing=activities.some(a=>a.name?.toLowerCase().includes("gta"));

if(!playing) return i.editReply("❌ Bạn chưa vào GTA");

let day=user.days[dayKey];

if(!day){
day=user.days[dayKey]={
plate:"",
sessions:[],
extra:0,
messageId:null,
channelId:null
};
}

if(day.sessions.some(s=>!s.end))
return i.editReply("❌ Bạn đang onduty");

const plate=i.options.getString("bienso");

day.plate=plate;
day.sessions.push({start:Date.now(),end:null});

saveDB();

await sendOrUpdateEmbed(i.channel,member,user,dayKey,"Đang trực");

return i.editReply("Onduty thành công");

}

if(i.commandName==="offduty"){

const day=user.days[dayKey];
if(!day) return i.editReply("Bạn chưa onduty");

const last=day.sessions.find(s=>!s.end);
if(!last) return i.editReply("Bạn đã off");

last.end=Date.now();
user.total+=last.end-last.start;

saveDB();

await sendOrUpdateEmbed(i.channel,member,user,dayKey,"Off");

return i.editReply("Đã offduty");

}

if(i.commandName==="thaybienso"){

const day=user.days[dayKey];
if(!day) return i.editReply("Bạn chưa onduty");

const newPlate=i.options.getString("bienso");
day.plate=newPlate;

saveDB();

await sendOrUpdateEmbed(i.channel,member,user,dayKey,"Đang trực");

return i.editReply("Đã đổi biển số");

}

if(i.commandName==="reload"){

if(!member.roles.cache.has(RESET_ROLE_ID))
return i.editReply("Không có quyền");

const u=i.options.getUser("user");
const target=getUser(u.id);

const day=target.days[dayKey];
if(!day) return i.editReply("User chưa onduty");

const m=await i.guild.members.fetch(u.id);

await sendOrUpdateEmbed(i.channel,m,target,dayKey,"Reload");

return i.editReply("Đã reload bảng");

}

if(i.commandName==="week"){

if(i.channel.id!==WEEK_CHANNEL_ID)
return i.editReply("Sai kênh chấm công");

const u=i.options.getUser("user");
const target=getUser(u.id);

let text="";

const today=nowVN();

for(let d=6;d>=0;d--){

const date=new Date(today);
date.setDate(today.getDate()-d);

const key=date.toLocaleDateString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"});

let total=0;

if(target.days[key]){

target.days[key].sessions.forEach(s=>{
if(s.end) total+=s.end-s.start;
});

if(target.days[key].extra) total+=target.days[key].extra;

}

const hours=total/3600000;
const icon=hours>=3?"🟢":"🔴";

text+=`${icon} ${key} : ${diffText(total)}\n`;

}

const embed=new EmbedBuilder()
.setTitle(`📊 Chấm công tuần — ${u.username}`)
.setColor("#00ff9c")
.setDescription(text||"Không có dữ liệu");

return i.editReply({embeds:[embed]});

}

});

client.on("presenceUpdate",async(oldP,newP)=>{

if(!newP?.member) return;

const id=newP.member.id;
const user=db[id];
if(!user) return;

const dayKey=dateKey();
const day=user.days[dayKey];
if(!day) return;

const activities=newP.member.presence?.activities||[];
const playing=activities.some(a=>a.name?.toLowerCase().includes("gta"));

if(!playing){

const last=day.sessions.find(s=>!s.end);
if(!last) return;

last.end=Date.now();
user.total+=last.end-last.start;

saveDB();

try{

const ch=await client.channels.fetch(day.channelId);

await sendOrUpdateEmbed(ch,newP.member,user,dayKey,"Tự off GTA");

}catch{}

}

});

setInterval(async()=>{

const now=nowVN();

if(now.getHours()!==23 || now.getMinutes()!==59) return;

const dayKey=dateKey();

for(const id in db){

const user=db[id];
const day=user.days[dayKey];
if(!day) continue;

const last=day.sessions.find(s=>!s.end);
if(!last) continue;

last.end=Date.now();
user.total+=last.end-last.start;

saveDB();

}

},60000);

client.login(TOKEN);
