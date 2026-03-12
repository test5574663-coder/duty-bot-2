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

const DEV_ROLE_ID = "1475815959616032883";
const INTERN_ROLE_ID = "1467725396433834149";

const DUTY_CHANNEL_ID = "1481300483783000236";
const WEEK_CHANNEL_ID = "1480583086797361272";


// ===== KEEP ALIVE (RENDER) =====

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

const DB_FILE="./data.json";
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


// ===== TIME =====

function nowVN(){
return new Date(
new Date().toLocaleString("en-US",{timeZone:"Asia/Ho_Chi_Minh"})
);
}

function dateKeyVN(date=nowVN()){
return date.toLocaleDateString("vi-VN");
}

function formatTime(ms){
return new Date(ms).toLocaleTimeString("vi-VN",{
hour12:false,
timeZone:"Asia/Ho_Chi_Minh"
});
}

function diffText(ms){
const m=Math.floor(ms/60000);
return `${Math.floor(m/60)} giờ ${m%60} phút`;
}


// ===== USER =====

function getUser(id){
if(!db[id]) db[id]={total:0,days:{}};
return db[id];
}


// ===== FIND OPEN SESSION =====

function findOpenSession(user){

for(const [dayKey,day] of Object.entries(user.days||{})){

const session=day.sessions?.find(s=>!s.end);

if(session){
return {dayKey,day,session};
}

}

return null;
}


// ===== EMBED =====

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
${isIntern?`\n**Tổng Thực Tập :** ${diffText(user.total)}`:""}

**Trạng Thái :** ${status}`
);
}


// ===== SEND OR UPDATE EMBED =====

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
.setName("week")
.setDescription("Xem chấm công tuần")
.addUserOption(o=>o.setName("user").setDescription("User").setRequired(true))

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


// ===== AUTO OFF WHEN LEAVE GAME =====

client.on("presenceUpdate",async(oldPresence,newPresence)=>{

try{

if(!newPresence) return;

const member=newPresence.member;
if(!member) return;

const user=getUser(member.id);

const open=findOpenSession(user);

if(!open) return;

const activities=newPresence.activities||[];

const playing=activities.some(a=>a.name?.toLowerCase().includes("gta"));

if(!playing){

open.session.end=Date.now();

user.total+=open.session.end-open.session.start;

saveDB();

const ch=await client.channels.fetch(open.day.channelId||DUTY_CHANNEL_ID);

await sendOrUpdateEmbed(ch,member,user,open.dayKey,"Auto Off (Thoát Game)");

}

}catch{}
});


// ===== AUTO OFF 23:59 =====

setInterval(async()=>{

const now=nowVN();

if(now.getHours()===23 && now.getMinutes()===59){

for(const id of Object.keys(db)){

const user=getUser(id);

const open=findOpenSession(user);

if(!open) continue;

open.session.end=Date.now();

user.total+=open.session.end-open.session.start;

const guild=client.guilds.cache.get(GUILD_ID);
if(!guild) continue;

const member=await guild.members.fetch(id).catch(()=>null);
if(!member) continue;

const ch=await client.channels.fetch(open.day.channelId||DUTY_CHANNEL_ID);

await sendOrUpdateEmbed(ch,member,user,open.dayKey,"Auto Off (Hết Ngày)");

}

saveDB();

}

},60000);


// ===== COMMAND HANDLER =====

client.on("interactionCreate",async i=>{

try{

if(!i.isChatInputCommand()) return;

const member=await i.guild.members.fetch(i.user.id);
const user=getUser(member.id);
const dayKey=dateKeyVN();


// ===== ONDUTY =====

if(i.commandName==="onduty"){

if(findOpenSession(user))
return i.reply({content:"❌ Bạn đang onduty rồi",ephemeral:true});

const activities=member.presence?.activities||[];
const playing=activities.some(a=>a.name?.toLowerCase().includes("gta"));

if(!playing)
return i.reply({content:"❌ Vào Game Đi!",ephemeral:true});

let day=user.days[dayKey];

if(!day){
day=user.days[dayKey]={
plate:"",
sessions:[],
messageId:null,
channelId:null,
extra:0
};
}

const plate=i.options.getString("bienso");

day.plate=plate;

day.sessions.push({
start:Date.now(),
end:null
});

saveDB();

await sendOrUpdateEmbed(i.channel,member,user,dayKey,"Đang trực");

return i.reply({content:"Onduty thành công",ephemeral:true});
}


// ===== OFFDUTY =====

if(i.commandName==="offduty"){

const open=findOpenSession(user);

if(!open)
return i.reply({content:"Bạn chưa onduty",ephemeral:true});

open.session.end=Date.now();

user.total+=open.session.end-open.session.start;

saveDB();

await sendOrUpdateEmbed(i.channel,member,user,open.dayKey,"Off");

return i.reply({content:"Đã offduty",ephemeral:true});
}

}catch(err){

console.error(err);

if(i.deferred||i.replied)
await i.editReply("❌ Lỗi bot");

else
await i.reply({content:"❌ Lỗi bot",ephemeral:true});

}

});

client.login(TOKEN);
