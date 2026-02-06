export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("OK");
    const payload = await request.json();

    // --- [ CALLBACK QUERY BLOCK ] ---
    if (payload.callback_query) {
      return await this.handleCallback(env, payload.callback_query);
    }

    // --- [ MESSAGE BLOCK ] ---
    if (payload.message) {
      return await this.handleMessage(env, payload.message);
    }

    return new Response("OK");
  },

  // ==========================================
  // 1. MESSAGE HANDLER (စာသားတွေအတွက်)
  // ==========================================
   async handleMessage(env, msg) {
    const chatId = msg.chat.id;
    const text = msg.text || "";
    const isAdmin = chatId === parseInt(env.ADMIN_ID);
    const state = await env.DB.prepare("SELECT value FROM Settings WHERE key = ?").bind(`STATE_${chatId}`).first();

    // ၁။ State Reset Logic (Menu ခလုတ်နှိပ်ရင် အကုန်ရှင်း)
    const mainButtons = ["/start", "/contact", "/botnews", "/help", "🎮 TopUp မည်", "💰 ငွေဖြည့်သွင်းမည်", "💳 ကျွန်ုပ်၏ Wallet", "📜 Deposit History", "🛒 TopUp History", "🛠 Admin Pannel", "🔙 Back to Menu"];
    if (mainButtons.includes(text)) {
      await env.DB.prepare("DELETE FROM Settings WHERE key = ?").bind(`STATE_${chatId}`).run();
    }

    await this.registerUser(env, msg);
    //==============================
    // --- [ ADMIN AREA ] ---
    if (isAdmin) {
      // State စစ်တဲ့အပိုင်းမှာ
if (state && state.value === "WAITING_CHANNEL_ID") {
    await env.DB.prepare("INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)")
        .bind("SUCCESS_CHANNEL", text).run();
    await env.DB.prepare("DELETE FROM Settings WHERE key = ?").bind(`STATE_${chatId}`).run();
    return this.sendMessage(env, chatId, `✅ Success Channel အဖြစ် <b>${text}</b> ကို သတ်မှတ်လိုက်ပါပြီ။ (Bot ကို Admin ခန့်ထားဖို့ မမေ့ပါနဲ့)`);
}
      if (text === "🛠 Admin Pannel") return this.showAdminMenu(env, chatId);
      if (text === "🔙 Back to Menu") return this.showMainMenu(env, chatId, isAdmin);
      if (text === "👥 Total users") return this.showTotalUsers(env, chatId);
      if (text === "💳 Update Payment") return this.showUpdatePaymentMenu(env, chatId);
      if (text === "✏️ Edit Items") {
    const items = await env.DB.prepare("SELECT * FROM Items ORDER BY game_name").all();
    if (!items.results.length) return this.sendMessage(env, chatId, "📭 ပစ္စည်းစာရင်း မရှိသေးပါ။");
    
    let msg = "✏️ <b>ဖျက်လိုသော ပစ္စည်းကို ရွေးပါ</b>\n\n";
    const buttons = { inline_keyboard: [] };
    
    items.results.forEach(item => {
        buttons.inline_keyboard.push([{ 
            text: `🗑Del [${item.game_name}] ${item.item_name}`, 
            callback_data: `confirm_delete_item_${item.id}` 
        }]);
    });
    return this.sendMessage(env, chatId, msg, buttons);
}
      
      if (text === "📥 Deposit Orders") {
    // Database ထဲက PENDING ဖြစ်နေတဲ့ Order ၁၀ ခုကို ဆွဲထုတ်မယ်
    const orders = await env.DB.prepare("SELECT * FROM Deposits WHERE status = 'PENDING' LIMIT 10").all();
    
    if (!orders.results || orders.results.length === 0) {
        return this.sendMessage(env, chatId, "📭 လက်ရှိ စစ်ဆေးရန် ငွေဖြည့် Order အသစ် မရှိသေးပါ။");
    }

    let msg = "📥 <b>Pending Deposit Orders</b>\n\n";
    const inlineKeyboard = { inline_keyboard: [] };

    orders.results.forEach(order => {
        msg += `🆔 ID: ${order.id} | 👤: ${order.user_id} | 💰: ${order.amount} Ks\n`;
        // တစ်ခုချင်းစီကို View လုပ်ဖို့ ခလုတ်လေးတွေ ထည့်ပေးမယ်
        inlineKeyboard.inline_keyboard.push([
            { text: `🆔 ${order.id} - View & Action`, callback_data: `view_dep_${order.id}` }
        ]);
    });

    return this.sendMessage(env, chatId, msg, inlineKeyboard);
}
// handleMessage ရဲ့ Admin Area 
if (text === "📤 TopUp Orders") {
    const orders = await env.DB.prepare("SELECT * FROM TopUp_Orders WHERE status = 'PENDING' LIMIT 10").all();
    if (!orders.results || orders.results.length === 0) return this.sendMessage(env, chatId, "📭 TopUp Order အသစ် မရှိသေးပါ။");

    let msg = "📤 <b>Pending TopUp Orders</b>\n\n";
    const buttons = { inline_keyboard: [] };
    orders.results.forEach(o => {
        msg += `🆔 ${o.id} | ${o.game_name} | 💰 ${o.price} Ks\n`;
        buttons.inline_keyboard.push([{ text: `🔎 View Order #${o.id}`, callback_data: `view_topup_${o.id}` }]);
    });
    return this.sendMessage(env, chatId, msg, buttons);
}
// handleMessage ရဲ့ Admin Area ထဲမှာ
if (text === "📢 Noti for TopUp Done") {
    await env.DB.prepare("INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)")
        .bind(`STATE_${chatId}`, "WAITING_CHANNEL_ID").run();
    return this.sendMessage(env, chatId, "📢 <b>Success Noti ပို့မည့် Channel ကို သတ်မှတ်ရန်</b>\n\nChannel ၏ ID (သို့မဟုတ်) Username ကို ပို့ပေးပါ။\nဥပမာ- <code>@MyTopUpChannel</code>");
}
// ၁။ Payment Update လုပ်တဲ့ Logic
if (text.startsWith("SET_KBZ:") || text.startsWith("SET_WAVE:")) {
    const method = text.startsWith("SET_KBZ:") ? "KBZ" : "WAVE";
    const details = text.split(":")[1].trim();
    
    await env.DB.prepare("INSERT OR REPLACE INTO Payments (method, details) VALUES (?, ?)")
        .bind(method, details).run();
    
    return this.sendMessage(env, chatId, `✅ <b>${method} Pay</b> အချက်အလက်များကို Update လုပ်ပြီးပါပြီ။`);
}
          if (text === "➕ Add Items") {
      const games = ["MLBB", "HOK", "PUBG"];
      const inlineKeyboard = { inline_keyboard: [] };
      games.forEach(g => {
        inlineKeyboard.inline_keyboard.push([{ text: g, callback_data: `add_game_${g}` }]);
      });
      return this.smartReply(env, chatId, "➕ ပစ္စည်းထည့်လိုသော Game ကို ရွေးပါ", inlineKeyboard, null);
    }
      // ပစ္စည်းသွင်းခြင်း Logic
      if (text.includes("=") && text.includes("Ks")) {
        const parts = text.split("=");
        const price = parseInt(parts[1].replace("Ks", "").trim());
        const currentState = await env.DB.prepare("SELECT value FROM Settings WHERE key = ?").bind(`STATE_${chatId}`).first();
        if (currentState) {
          await env.DB.prepare("INSERT INTO Items (game_name, item_display, item_name, price) VALUES (?, ?, ?, ?)")
            .bind(currentState.value, text, parts[0].trim(), price).run();
          await env.DB.prepare("DELETE FROM Settings WHERE key = ?").bind(`STATE_${chatId}`).run();
          return this.sendMessage(env, chatId, `✅ [${currentState.value}] Saved: ${text}`);
        }
      }
}

    // --- [ USER AREA ] ---
    if (text === "/start") return this.showMainMenu(env, chatId, isAdmin);
   if (text === "🎮 TopUp မည်") return this.showGameList(env, chatId);
    if (text === "💰 ငွေဖြည့်သွင်းမည်") return this.showDepositMethods(env, chatId);
    if (text === "💳 ကျွန်ုပ်၏ Wallet") {
      const user = await env.DB.prepare("SELECT balance FROM Users WHERE user_id = ?").bind(chatId).first();
      return this.sendMessage(env, chatId, `💳 သင်၏လက်ကျန်ငွေ = <b>${user.balance} Ks</b>`);
    }
    
    if (state && state.value.startsWith("WAITING_AMOUNT_")) {
      const amount = parseInt(text);
      const method = state.value.split("_")[2];
      if (isNaN(amount) || amount < 100) return this.sendMessage(env, chatId, "❌ ပမာဏ မှားယွင်းနေပါသည်။ ဂဏန်းသီးသန့် (အနည်းဆုံး 100) ပြန်ပို့ပေးပါ။");
      
      await env.DB.prepare("INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)")
          .bind(`STATE_${chatId}`, `WAITING_SS_${method}_${amount}`).run();
      
      const payInfo = await env.DB.prepare("SELECT details FROM Payments WHERE method = ?").bind(method).first();
      return this.sendMessage(env, chatId, `💠 <b>${method} Pay ဖြင့် ${amount} Ks ဖြည့်သွင်းမည်</b>\n\n<code>${payInfo.details}</code>\n\nလွှဲပြီးပါက Screenshot ပို့ပေးပါ။`);
    }
    
    // handleMessage ထဲက Screenshot စစ်တဲ့အပိုင်း
if (state && state.value.startsWith("WAITING_SS_")) {
    if (!msg.photo) {
        return this.sendMessage(env, chatId, "⚠️ <b>စာသေချာဖတ်</b>\n\nငွေလွှဲပြေစာ ဓာတ်ပုံ (Image) ကိုသာ ပို့။");
    }
    
    // ဓာတ်ပုံဖြစ်ရင် အောက်က Logic (Confirm ပြတာ) ကို ဆက်သွားမယ်
    const [,, method, amount] = state.value.split("_");
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    // အခုကတည်းက Deposits ထဲမှာ PENDING_START ဆိုပြီး ယာယီသိမ်းထားမယ်
    await env.DB.prepare("INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)")
        .bind(`STATE_${chatId}`, `WAITING_CONFIRM_${method}_${amount}_${fileId}`).run();
        
    return this.showConfirmDeposit(env, chatId, method, amount);
}
// handleMessage ထဲမှာ WAITING_GAMEID_
if (state && state.value.startsWith("WAITING_GAMEID_")) {
    const itemId = state.value.split("_")[2];
    const gameInfo = text;
    // Confirm ခလုတ်လေးတွေ လုပ်မယ်
    const buttons = [
        [
            { text: "✅ ဟုတ်ကဲ့၊ ဝယ်မည်", callback_data: `confirm_buy_${itemId}_${gameInfo}` },
            {text: "📝 Game ID ပြန်ပြင်မည်",
            callback_data:
            `reenter_id_${itemId}`},
            { text: "❌ မဝယ်ချင်တော့ပါ", callback_data: "topup_menu"} 
        ]
    ];

    const confirmMsg = `📋 <b>ဝယ်ယူမှု အတည်ပြုရန်</b>\n\n📦 ပစ္စည်း: (Item ID: ${itemId})\n🆔 ID Info: <code>${gameInfo}</code>\n\nအထက်ပါ အချက်အလက်များ မှန်ကန်ပါသလား Bro?`;
    
    return this.sendMessage(env, chatId, confirmMsg, buttons);
}
// handleMessage ရဲ့ User Area
if (text === "🛒 TopUp History") {
    const history = await env.DB.prepare("SELECT * FROM TopUp_Orders WHERE user_id = ? ORDER BY id DESC LIMIT 5").bind(chatId).all();
    if (history.results.length === 0) return this.sendMessage(env, chatId, "❌ သင်သည် ပစ္စည်းဝယ်ယူထားခြင်း မရှိသေးပါ။");

    let msg = "🛒 <b>သင်၏ နောက်ဆုံး TopUp ၅ ခု</b>\n\n";
    history.results.forEach(h => {
        const statusIcon = h.status === 'DONE' ? '✅' : (h.status === 'REFUNDED' ? '💰' : '⏳');
        msg += `${statusIcon} ${h.game_name} - ${h.item_name}\n📅 ${h.created_at}\n\n`;
    });
    return this.sendMessage(env, chatId, msg);
}

if (text === "📜 Deposit History") {
    const history = await env.DB.prepare("SELECT * FROM Deposits WHERE user_id = ? ORDER BY id DESC LIMIT 5").bind(chatId).all();
    if (history.results.length === 0) return this.sendMessage(env, chatId, "❌ သင်သည် ငွေဖြည့်ထားခြင်း မရှိသေးပါ။");

    let msg = "📜 <b>သင်၏ နောက်ဆုံး ငွေဖြည့်မှု ၅ ခု</b>\n\n";
    history.results.forEach(h => {
        const statusIcon = h.status === 'APPROVED' ? '✅' : (h.status === 'REJECTED' ? '❌' : '⏳');
        msg += `${statusIcon} ${h.amount} Ks (${h.method})\n📅 ${h.created_at}\n\n`;
    });
    return this.sendMessage(env, chatId, msg);
}
if (text === "/contact") {
    const adminUsername = "Karo_vanRossum";
    
    return this.sendMessage(env, chatId, 
        `📞<b>Developer နှင့် ဆက်သွယ်ရန်</b>\n\n` +
        `ဤ Bot နှင့် ပတ်သက်၍ အခက်အခဲရှိပါက သို့မဟုတ် အသေးစိတ် သိရှိလိုပါက အောက်ပါခလုတ်ကို နှိပ်၍ ဆက်သွယ်နိုင်ပါသည်။`, 
        {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [
                        { 
                            text: "📩 Contact Developer", 
                            url: `https://t.me/${adminUsername}` 
                        }
                    ]
                ]
            }
        }
    );
}
if (text === "/help") {
    const helpBotUsername = "HelpFactory_bot";
    
    return this.sendMessage(env, chatId, 
        `❓ <b>အကူအညီနှင့် လမ်းညွှန်ချက်များ</b>\n\n` +
        `အောက်ပါခလုတ်ကို နှိပ်ပြီး ကျွန်ုပ်တို့၏ Help Bot တွင် အသေးစိတ် လေ့လာနိုင်ပါသည်။အခြားသော Bot များအကြောင်းလည်း ပါဝင်ပါသည်။`, 
        {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [
                        { 
                            text: "🆘 Go to Help Bot", 
                            url: `https://t.me/${helpBotUsername}` 
                        }
                    ]
                ]
            }
        }
    );
}
if (text === "/botnews") {
    const helpBotUsername = "Karo_BotDeveloper";
    
    return this.sendMessage(env, chatId, 
        `📢<b>Bot များ၏ နေ့စဥ် Updates များ</b>\n\n` +
        `အောက်ပါခလုတ်ကို နှိပ်ပြီး ကျွန်ုပ်တို့၏ Channel တွင်် Bot များ၏ Update များ နှင့် Bot အသစ်များအကြောင်းကို စောင့်ကြည်နိုင်ပါသည်။`, 
        {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [
                        { 
                            text: "📢 Go to Channel", 
                            url: `https://t.me/${helpBotUsername}` 
                        }
                    ]
                ]
            }
        }
    );
}
return new Response("OK");
  },//handleMessage အပိတ်
  // ==========================================
  // 2. CALLBACK HANDLER (Inline Buttons အတွက်)
  // ==========================================
  async handleCallback(env, cb) {
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;
    const data = cb.data; // Inline ခလုတ်ကနေလာတဲ့ data
    // handleCallback ထဲက add_game_ logic 
if (data.startsWith("add_game_")) {
    const game = data.split("_")[2]; // MLBB, PUBG, etc.
    // Admin ရဲ့ ID နဲ့ သူရွေးလိုက်တဲ့ Game ကို Settings table ထဲမှာ သိမ်းလိုက်မယ်
    await env.DB.prepare("INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)")
        .bind(`STATE_${chatId}`, game).run();
    
    const formatMsg = `🕹 <b>${game} အတွက် ပစ္စည်းထည့်ရန်</b>\n\nအောက်ပါ Format အတိုင်း အတိအကျ စာသားပို့ပေးပါ-\n\n<code>ItemName = Prices Ks</code>\n\nဥပမာ- <code>Weekly Pass = 6000 Ks</code>\n\nသတိပြုရန်-Ks ကိုမပြောင်းဘဲ ပြန်ထည့်ပေးပါ`;
    return this.smartReply(env, chatId, formatMsg, null, messageId);
}

// --- handleCallback ထဲမှာ ထည့်ရန် ---
if (data.startsWith("confirm_delete_item_")) {
    const itemId = data.split("_")[3];
    await env.DB.prepare("DELETE FROM Items WHERE id = ?").bind(itemId).run();
    
    return this.smartReply(env, chatId, "✅ ပစ္စည်းကို စာရင်းထဲမှ ဖျက်လိုက်ပါပြီ။", null, cb.message.message_id);
}
// handleCallback ထဲမှာ Payment ရွေးရင် စာပို့ခိုင်းဖို့
if (data.startsWith("set_pay_")) {
    const method = data.split("_")[2]; // KBZ or WAVE
    const formatMsg = `💳 <b>${method} Pay အတွက် အချက်အလက်ပြင်ဆင်ရန်</b>\n\nအောက်ပါ Format အတိုင်း စာသားပြန်ပို့ပေးပါ-\n\n<code>SET_${method}:09... & Name</code>\n\nဥပမာ- <code>SET_${method}:09752803124 & Shine Win Aung</code>`;
    return this.smartReply(env, chatId, formatMsg, null, messageId);
}

// handleCallback ထဲက dep_pay_ 
if (data.startsWith("dep_pay_")) {
    const method = data.split("_")[2];
    // Amount တန်းမတောင်းတော့ဘဲ Payment Details အရင်ပြမယ်
    return this.showPaymentDetails(env, chatId, method, messageId);
}
// "Amount & ပြေစာ ပို့မည်" ကို နှိပ်လိုက်ရင် Amount စတောင်းမယ်
if (data.startsWith("start_deposit_")) {
    const method = data.split("_")[2];
    const messageId = cb.message.message_id
    await env.DB.prepare("INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)")
        .bind(`STATE_${chatId}`, `WAITING_AMOUNT_${method}`).run();
    return this.smartReply(env, chatId, `💵 <b>${method} Pay</b> အတွက် ပမာဏရိုက်ပို့ပါ (ဥပမာ- 5000)`, null, messageId);
}
//confrim deposit
if (data.startsWith("confirm_dep_")) {
    const state = await env.DB.prepare("SELECT value FROM Settings WHERE key = ?").bind(`STATE_${chatId}`).first();
    const [,,, method, amount, fileId] = state.value.split("_");
    const messageId = cb.message.message_id;

    // Database ထဲမှာ ပုံရော အကုန်သိမ်းမယ်
    await env.DB.prepare("INSERT INTO Deposits (user_id, amount, method, ss_file_id, status) VALUES (?, ?, ?, ?, 'PENDING')")
        .bind(chatId, parseInt(amount), method, fileId).run();
    
    // Admin ဆီ Noti ပို့ (Username ပါအောင် Users table နဲ့ JOIN စစ်ရင်ရပေမဲ့ အလွယ်ပဲ ChatId ပဲ အရင်ပို့လိုက်မယ်)
    await this.sendMessage(env, env.ADMIN_ID, `📥 <b>ငွေဖြည့် Order အသစ်!</b>\n👤 User: <code>${chatId}</code>\n💰 Amount: ${amount} Ks\n\nAdmin Panel မှာ ပုံနဲ့တကွ စစ်ဆေးနိုင်ပါပြီ။`);

    await env.DB.prepare("DELETE FROM Settings WHERE key = ?").bind(`STATE_${chatId}`).run();
    return this.smartReply(env, chatId, "✅ ပို့ဆောင်ပြီးပါ စစ်ဆေးချက်ကို ခေတ္တစောင့်ပေးပါ။", null, messageId);
}
//View Depodit
if (data.startsWith("view_dep_")) {
    const orderId = data.split("_")[2];
    
    // Users table နဲ့ Join ပြီး Username ပါ တစ်ခါတည်း ဆွဲထုတ်မယ်
    const order = await env.DB.prepare(`
        SELECT d.*, u.username 
        FROM Deposits d 
        JOIN Users u ON d.user_id = u.user_id 
        WHERE d.id = ?
    `).bind(orderId).first();
    
    const text = `🧐 <b>Order Details (ID: ${orderId})</b>\n\n` +
                 `👤 User: ${order.username}\n` +
                 `🆔 ID: <code>${order.user_id}</code>\n` +
                 `💰 Amount: <b>${order.amount} Ks</b>\n` +
                 `💳 Method: ${order.method}\n` +
                 `📅 Date: ${order.created_at}`;
    
    const inlineKeyboard = {
        inline_keyboard: [
            [{ text: "✅ Approve", callback_data: `approve_dep_${order.id}` }, { text: "❌ Reject", callback_data: `reject_dep_${order.id}` }],
            [{ text: "🔙 Back", callback_data: "admin_deposit_list" }]
        ]
    };
        // ပုံပါပို့မှာမို့လို့ sendMessage အစား sendPhoto သုံးမယ်
    const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendPhoto`;
    return await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: chatId,
            photo: order.ss_file_id,
            caption: text,
            parse_mode: "HTML",
            reply_markup: inlineKeyboard
        })
    });
}
    // handleCallback ထဲမှာ
    if (data.startsWith("view_topup_")) {
    const id = data.split("_")[2];
    const o = await env.DB.prepare(`
        SELECT t.*, u.username 
        FROM TopUp_Orders t 
        JOIN Users u ON t.user_id = u.user_id 
        WHERE t.id = ?
    `).bind(id).first();
    
    const userDisp = o.username !== "No Username" ? o.username : o.user_id;
    const text = `🎮 <b>TopUp Order #${o.id}</b>\n\n` +
                 `👤 User: ${userDisp}\n` +
                 `🆔 User ID: <code>${o.user_id}</code>\n` +
                 `🕹 Game: ${o.game_name}\n` +
                 `📦 Item: ${o.item_name}\n` +
                 `🆔 ID Info: <code>${o.game_id_info}</code>\n` +
                 `💰 Price: ${o.price} Ks\n` +
                 `📅 Date: ${o.created_at}`;
      const buttons = {
        inline_keyboard: [
            [{ text: "✅ Done (ဖြည့်ပြီး)", callback_data: `done_topup_${o.id}` }],
            [{ text: "💰 Refund (ငွေပြန်အမ်း)", callback_data: `refund_topup_${o.id}` }],
            [{ text: "🔙 Back", callback_data: "admin_topup_list" }]
        ]
    };
    return this.smartReply(env, chatId, text, buttons, cb.message.message_id);
}
// Refund Logic (ငွေပြန်အမ်းမယ်)
if (data.startsWith("refund_topup_")) {
    const id = data.split("_")[2];
    const o = await env.DB.prepare("SELECT * FROM TopUp_Orders WHERE id = ?").bind(id).first();
    if (o.status !== 'PENDING') return;

    // ၁။ User ဆီ ပိုက်ဆံပြန်ထည့်
    await env.DB.prepare("UPDATE Users SET balance = balance + ? WHERE user_id = ?").bind(o.price, o.user_id).run();
    // ၂။ Order Status ပြောင်း
    await env.DB.prepare("UPDATE TopUp_Orders SET status = 'REFUNDED' WHERE id = ?").bind(id).run();
    
    await this.sendMessage(env, o.user_id, `⚠️ <b>TopUp Refund!</b>\n\n${o.game_name} (${o.item_name}) အတွက် ဖြည့်သွင်း၍မရပါသဖြင့် ${o.price} Ks ကို Wallet ထဲ ပြန်အမ်းပေးလိုက်ပါပြီ။`);
    return this.smartReply(env, chatId, `✅ Order #${id} ကို Refund လုပ်ပြီးပါပြီ။`, null, cb.message.message_id);
}
if (data.startsWith("done_topup_")) {
    const id = data.split("_")[2];
    const o = await env.DB.prepare(`
        SELECT t.*, u.username 
        FROM TopUp_Orders t 
        JOIN Users u ON t.user_id = u.user_id 
        WHERE t.id = ?
    `).bind(id).first();

    if (o.status !== 'PENDING') return;

    // ၁။ Status ကို Update လုပ်
    await env.DB.prepare("UPDATE TopUp_Orders SET status = 'DONE' WHERE id = ?").bind(id).run();

    // ၂။ User ဆီ Noti ပို့
    await this.sendMessage(env, o.user_id, `✅ <b>TopUp ဖြည့်သွင်းမှု အောင်မြင်ပါသည်!</b>\n\n${o.game_name} (${o.item_name}) ကို ဖြည့်သွင်းပေးပြီးပါပြီ။\nယုံကြည်စွာ အားပေးတဲ့အတွက် ကျေးဇူးတင်ပါတယ်ဗျာ။`);

    // ၃။ Channel ထဲကို Success Noti ပစ်မယ်
    const successChannel = await env.DB.prepare("SELECT value FROM Settings WHERE key = ?").bind("SUCCESS_CHANNEL").first();
    if (successChannel) {
        const userDisp = o.username !== "No Username" ? o.username : "User";
        const channelMsg = `🔔 <b>TopUp Success!</b>\n\n👤 Customer: ${userDisp}\n🕹 Game: ${o.game_name}\n📦 Item: ${o.item_name}\n✅ Status: Done\n\n🛒 ဤBot တွင် ယုံကြည်စိတ်ချစွာ ဝယ်ယူနိုင်ပါသည်။`;
        await this.sendMessage(env, successChannel.value, channelMsg);
    }

    // ၄။ Admin Message ကို Edit လုပ်မယ်
    return this.smartReply(env, chatId, `✅ Order #${id} ကို Done လုပ်ပြီး Channel သို့ Noti ပို့ပြီးပါပြီ။`, null, cb.message.message_id);
}

// ✅ အတည်ပြုခြင်း (Approve) Logic ထဲမှာ ထည့်ရန်
if (data.startsWith("approve_dep_")) {
    const orderId = data.split("_")[2];
    const order = await env.DB.prepare("SELECT * FROM Deposits WHERE id = ?").bind(orderId).first();
    if (!order || order.status !== 'PENDING') return new Response("OK");

    await env.DB.prepare("UPDATE Users SET balance = balance + ? WHERE user_id = ?").bind(order.amount, order.user_id).run();
    await env.DB.prepare("UPDATE Deposits SET status = 'APPROVED' WHERE id = ?").bind(orderId).run();

    const editedText = `✅ <b>Order Approved!</b>\n\n🆔 Order ID: ${orderId}\n👤 User: <code>${order.user_id}</code>\n💰 Amount: ${order.amount} Ks\n\nStatus: <b>Completed ✅</b>`;
    
    // ခလုတ်အကုန်မဖျက်ဘဲ Back ခလုတ်လေး ထည့်ထားပေးမယ်
    const backBtn = { inline_keyboard: [[{ text: "🔙 Back to List", callback_data: "admin_deposit_list" }]] };

    await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/editMessageCaption`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: chatId,
            message_id: cb.message.message_id,
            caption: editedText,
            parse_mode: "HTML",
            reply_markup: backBtn
        })
    });

    return this.sendMessage(env, order.user_id, `✅ <b>ငွေဖြည့်သွင်းမှု အောင်မြင်ပါသည်!</b>\n\n${order.amount} Ks ထည့်သွင်းပေးလိုက်ပါပြီ။`);
}
// ❌ ပယ်ဖျက်ခြင်း (Reject) Logic
if (data.startsWith("reject_dep_")) {
    const orderId = data.split("_")[2];
    
    const order = await env.DB.prepare("SELECT * FROM Deposits WHERE id = ?").bind(orderId).first();
    if (!order || order.status !== 'PENDING') return new Response("OK");

    // ၂။ Status ပြောင်းမယ်
    await env.DB.prepare("UPDATE Deposits SET status = 'REJECTED' WHERE id = ?").bind(orderId).run();

    // ၃။ Admin Message ကို ပြင်မယ် (Back Button လေး ထည့်ပေးမယ်)
    const editedText = `❌ <b>Order Rejected!</b>\n\n🆔 Order ID: ${orderId}\n👤 User ID: ${order.user_id}\n💰 Amount: ${order.amount} Ks\n\nStatus: <b>Rejected ❌</b>`;
    
    // Admin စာရင်းဆီ ပြန်သွားလို့ရအောင် ခလုတ်လေး ထားခဲ့မယ်
    const backBtn = { inline_keyboard: [[{ text: "🔙 Back to List", callback_data: "admin_deposit_list" }]] };

    await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/editMessageCaption`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: chatId,
            message_id: cb.message.message_id,
            caption: editedText,
            parse_mode: "HTML",
            reply_markup: backBtn
        })
    });

    // ၄။ User ဆီ Noti ပို့
    return this.sendMessage(env, order.user_id, `❌ <b>ငွေဖြည့်သွင်းမှု ပယ်ဖျက်ခံရပါသည်</b>\n\nသင်၏ ငွေဖြည့်မှု (ID: ${orderId}) ကို Admin မှ ငြင်းပယ်လိုက်ပါသည်။ အချက်အလက် ပြန်လည်စစ်ဆေးပါခဗျာ။`);
}

if (data === "admin_deposit_list") {
    await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/deleteMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, message_id: cb.message.message_id })
    }).catch(() => {}); // Error တက်ရင် ignore လုပ်မယ်

    // Username ပါ တစ်ခါတည်း ဆွဲထုတ်မယ်
    const orders = await env.DB.prepare(`
        SELECT d.id, d.amount, d.user_id, u.username 
        FROM Deposits d 
        LEFT JOIN Users u ON d.user_id = u.user_id 
        WHERE d.status = 'PENDING' 
        LIMIT 10
    `).all();
    
    let msg = "📥 <b>Pending Deposit Orders</b>\n\n";
    const inlineKeyboard = { inline_keyboard: [] };

    if (!orders.results || orders.results.length === 0) {
        msg = "📭 လက်ရှိ စစ်ဆေးရန် Order အသစ် မရှိသေးပါ။";
    } else {
        orders.results.forEach(order => {
            const userDisp = order.username !== "No Username" ? order.username : order.user_id;
            msg += `🆔 ID: ${order.id} | 👤: ${userDisp} | 💰: ${order.amount} Ks\n`;
            inlineKeyboard.inline_keyboard.push([{ text: `🆔 ${order.id} - View & Action`, callback_data: `view_dep_${order.id}` }]);
        });
    }
    // Admin Menu ကို ပြန်သွားဖို့ ခလုတ်ပါ ထည့်ပေးလိုက်မယ်
    inlineKeyboard.inline_keyboard.push([{ text: "🔙 Back to Admin Menu", callback_data: "admin_panel" }]);

    return this.sendMessage(env, chatId, msg, inlineKeyboard);
}

if (data === "admin_panel") {
    const isAdmin = chatId === parseInt(env.ADMIN_ID);
    return this.showAdminMenu(env, chatId);
}

if (data === "main_menu") {
    // ၁။ အရင်ရှိနေတဲ့ Message (ငွေဖြည့်ဖို့ စာသားနဲ့ ခလုတ်တွေ) ကို ဖျက်ပစ်မယ်
    await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/deleteMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            chat_id: chatId, 
            message_id: cb.message.message_id 
        })
    }).catch(() => {});

    // ၂။ ပြီးမှ Main Menu ကို အသစ်ပြန်ပို့မယ်
    return this.showMainMenu(env, chatId, (chatId === parseInt(env.ADMIN_ID)));
}

if (data === "topup_menu") {
    // ၁။ State ကို ဖျက်မယ် (ဒါမှ ID ရိုက်တဲ့ Flow ထဲကနေ လုံးဝထွက်သွားမှာ)
    await env.DB.prepare("DELETE FROM Settings WHERE key = ?").bind(`STATE_${chatId}`).run();

    // ၂။ မင်းရဲ့ UI function ကို ပြန်ခေါ်မယ်
    return this.showGameList(env, chatId, cb.message.message_id);
}

//Users Gameရွေးမယ်
    if (data.startsWith("user_game_")) {
      const game = data.split("_")[2];
      const messageId = cb.message.message_id;
      const items = await env.DB.prepare("SELECT * FROM Items WHERE game_name = ?").bind(game).all();
      
      const inlineKeyboard = { inline_keyboard: [] };
      items.results.forEach(item => {
        inlineKeyboard.inline_keyboard.push([{ 
            text: `${item.item_display}`, 
            callback_data: `buy_item_${item.id}` 
        }]);
      });
      inlineKeyboard.inline_keyboard.push([{ text: "🔙 Back", callback_data: "topup_menu" }]);

      return this.smartReply(env, chatId, `🕹 <b>${game} Items</b>\n\nဝယ်ယူလိုသော ပစ္စည်းကို ရွေးချယ်ပါ။`, inlineKeyboard, messageId);
    }
    //Item ကိုနှိပ်ပြီး ဝယ်မယ်
    if (data.startsWith("buy_item_")) {
    const itemId = data.split("_")[2];
    const messageId = cb.message.message_id;

    const item = await env.DB.prepare("SELECT * FROM Items WHERE id = ?").bind(itemId).first();
    const user = await env.DB.prepare("SELECT balance FROM Users WHERE user_id = ?").bind(chatId).first();

    if (!item) return this.sendMessage(env, chatId, "❌ ပစ္စည်း ရှာမတွေ့တော့ပါ။");

    // ပိုက်ဆံလောက်မလောက် အရင်စစ်မယ်
    if (user.balance < item.price) {
        return this.smartReply(env, chatId, `❌ <b>လက်ကျန်ငွေ မလုံလောက်ပါ</b>\n\nလိုအပ်သောငွေ: ${item.price} Ks\nလက်ရှိငွေ: ${user.balance} Ks`, null, messageId);
    }
    // ပိုက်ဆံလောက်ရင် ID တောင်းဖို့ State မှတ်မယ်
    await env.DB.prepare("INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)")
        .bind(`STATE_${chatId}`, `WAITING_GAMEID_${itemId}`).run();

    const askMsg = `🕹 <b>${item.item_display} ဝယ်ယူရန်</b>\n\nကျေးဇူးပြု၍ Game ID နှင့် Server ID ကို ရိုက်ပို့ပေးပါ။\n(ဥပမာ - 12345678 1234) အကယ်၍ MLBBမဟုတ်ပါက Sever ID မလိုပါ`;
    return this.smartReply(env, chatId, askMsg, null, messageId);
}
//Item ဝယ်မှာကို အတည်ပြုမယ့်Logic
if (data.startsWith("confirm_buy_")) {
    const parts = data.split("_");
    const itemId = parts[2];
    const gameInfo = parts.slice(3).join("_");

    // ၁။ Item နဲ့ User ရဲ့ နောက်ဆုံးလက်ကျန်ငွေကို ဆွဲထုတ်
    const item = await env.DB.prepare("SELECT * FROM Items WHERE id = ?").bind(itemId).first();
    const user = await env.DB.prepare("SELECT balance FROM Users WHERE user_id = ?").bind(chatId).first();

    if (!item) return this.sendMessage(env, chatId, "❌ ပစ္စည်း ရှာမတွေ့တော့ပါ။");
    
    // ၂။ ပိုက်ဆံ တကယ်လောက်သေးလား ထပ်စစ်
    if (user.balance < item.price) {
        return this.sendMessage(env, chatId, "❌ လက်ကျန်ငွေ မလုံလောက်တော့ပါ။ ငွေပြန်ဖြည့်သွင်းပေးပါ။");
    }
    // ၃။ ငွေနှုတ်ပြီး Database မှာ Update လုပ်မယ်
    const newBalance = user.balance - item.price;
    await env.DB.prepare("UPDATE Users SET balance = ? WHERE user_id = ?").bind(newBalance, chatId).run();

    // ၄။ Order စာရင်းသွင်းမယ် (status ကို 'PENDING' ထားမယ်)
    const orderResult = await env.DB.prepare(
        "INSERT INTO TopUp_Orders (user_id, item_name, game_name, game_id_info, price, status) VALUES (?, ?, ?, ?, ?, 'PENDING')"
    ).bind(chatId, item.item_name, item.game_name, gameInfo, item.price).run();
    
    // Order ID ကို ပြန်ယူ (Admin Noti အတွက်)
    const orderId = orderResult.meta.last_row_id || "New";

    // ၅။ User ဆီ Noti ပို့
    const successMsg = `✅ <b>Order တင်ခြင်း အောင်မြင်ပါသည်။</b>\n\n💰 နှုတ်ယူငွေ: ${item.price} Ks\n💳 လက်ကျန်ငွေ: ${newBalance} Ks\n\nAdmin မှ ခေတ္တခဏအတွင်း ဖြည့်သွင်းပေးပါလိမ့်မည်။ထို့နောက် အကြောင်းကြားပါလိမ့်မည်။`;
    await this.smartReply(env, chatId, successMsg, null, cb.message.message_id);

    // ၆။ Admin ဆီ Noti ပို့
    const adminMsg = `🛒 <b>New TopUp Order ဗျိူ့! 📤 TopUp Orders ကိုနှိပ်၍ စစ်ဆေးပြီး အကြောင်းပြန်ပါ။ (ID: ${orderId})</b>\n\n🎮 Game: ${item.game_name}\n📦 Item: ${item.item_name}\n🆔 ID Info: <code>${gameInfo}</code>\n👤 User: <code>${chatId}</code>`;
    
       const adminBtn = { 
    inline_keyboard: [[{ text: "🔎 View Order " + orderId, callback_data: `view_topup_${orderId}` }]] 
};
    
    return this.sendMessage(env, env.ADMIN_ID, adminMsg, adminBtn);
}

    // Callback ပြီးရင် ခလုတ်နှိပ်တာ အောင်မြင်ကြောင်း Telegram ကို Noti ပြန်ပေးရတယ်
    await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: cb.id })
    });
    return new Response("OK");
  },

  // ==========================================
  // 3. UI FUNCTIONS (အလှဆင်တဲ့အပိုင်းတွေ)
  // ==========================================
  async showMainMenu(env, chatId, isAdmin) {
    const mainKeyboard = {
      keyboard: [
        [{ text: "🎮 TopUp မည်" }, { text: "💰 ငွေဖြည့်သွင်းမည်" }],
        [{ text: "💳 ကျွန်ုပ်၏ Wallet" }],
        [{ text: "📜 Deposit History" }, { text: "🛒 TopUp History" }]
      ],
      resize_keyboard: true
    };
    if (isAdmin) mainKeyboard.keyboard.splice(2, 0, [{ text: "🛠 Admin Pannel" }]);

    return this.sendMessage(env, chatId, "<b>✨ Karo TopUp Bot</b> မှ ကြိုဆိုပါသည်။အောက်ပါ Menu များကို အသုံးပြုပါ။", mainKeyboard);
  },
  
    async showUpdatePaymentMenu(env, chatId) {
    const inlineKeyboard = {
      inline_keyboard: [
        [{ text: "💳 KBZ Pay ပြင်ရန်", callback_data: "set_pay_KBZ" }],
        [{ text: "💳 Wave Pay ပြင်ရန်", callback_data: "set_pay_WAVE" }],
        [{ text: "🔙 Admin Menu", callback_data: "admin_panel" }]
      ]
    };
    return this.sendMessage(env, chatId, "💳 <b>Payment အချက်အလက် ပြင်ဆင်ရန်</b>\n\nပြင်လိုသော Method ကို ရွေးချယ်ပါ။", inlineKeyboard);
  },

  async showDepositMethods(env, chatId, messageId = null) {
    const inlineKeyboard = {
      inline_keyboard: [
        [{ text: "💳 KBZ Pay", callback_data: "dep_pay_KBZ" }, { text: "💳 Wave Pay", callback_data: "dep_pay_WAVE" }],
        [{ text: "❌ Cancel", callback_data: "main_menu" }]
      ]
    };
    const text = "💰 <b>ငွေဖြည့်သွင်းလိုသော နည်းလမ်းကို ရွေးချယ်ပါ</b>";
    
    // messageId ပါရင် Edit လုပ်မယ်၊ မပါရင် အသစ်ပို့မယ်
    return this.smartReply(env, chatId, text, inlineKeyboard, messageId);
},

  async showAdminMenu(env, chatId) {
    const adminKeyboard = {
      keyboard: [
        [{ text: "➕ Add Items" }, { text: "✏️ Edit Items" }],
        [{ text: "💳 Update Payment" }, { text: "📥 Deposit Orders" }],
        [{ text: "📤 TopUp Orders" }, { text: "📢 Noti for TopUp Done" }],
        [{ text: "👥 Total users" }, { text: "🔙 Back to Menu" }]
      ],
      resize_keyboard: true
    };
    return this.sendMessage(env, chatId, "👨‍💻 <b>Admin Control Panel</b>", adminKeyboard);
  },
  
  // ငွေဖြည့်မည်အတွက် UI
    async showPaymentDetails(env, chatId, method, messageId = null) {
    const payInfo = await env.DB.prepare("SELECT details FROM Payments WHERE method = ?").bind(method).first();
    const inlineKeyboard = {
      inline_keyboard: [
        [{ text: "✅ Amount နှင့် ပြေစာ ပို့မည်", callback_data: `start_deposit_${method}` }],
        [{ text: "❌ မလုပ်တော့ပါ", callback_data: "main_menu" }]
      ]
    };
    const text = `💠 <b>${method} Pay ဖြင့် ငွေဖြည့်သွင်းရန်</b>\n\n${payInfo.details}\n\nအထက်ပါနံပါတ်သို့ ငွေလွှဲပြီးပါက အောက်ကခလုတ်ကို နှိပ်ပါ။`;
    return this.smartReply(env, chatId, text, inlineKeyboard, messageId);
  },
// ငွေဖြည့်မည် အတွက် Confrim & Cancel UI
  async showConfirmDeposit(env, chatId, method, amount, messageId = null) {
    const inlineKeyboard = {
      inline_keyboard: [
        [{ text: "✅ အတည်ပြုသည်", callback_data: `confirm_dep_${method}_${amount}` }],
        [{ text: "❌ ပယ်ဖျက်မည်", callback_data: "main_menu" }]
      ]
    };
    return this.smartReply(env, chatId, `💰 <b>Order ကို အတည်ပြုပါ</b>\n\nAmount: ${amount} Ks\nMethod: ${method}\n\nအချက်အလက် မှန်ကန်ပါက အတည်ပြုမည်ကို နှိပ်ပါ။`, inlineKeyboard, messageId);
  },
  // ==========================================
  // 4. HELPER FUNCTIONS အသုံးဝင်တဲ့ ကိရိယာများ
  // ==========================================
  async registerUser(env, msg) {
    const username = msg.from.username ? `@${msg.from.username}` : "No Username";
    await env.DB.prepare("INSERT OR IGNORE INTO Users (user_id, username, balance) VALUES (?, ?, ?)")
      .bind(msg.chat.id, username, 0).run();
  },

  async showTotalUsers(env, chatId) {
    const stats = await env.DB.prepare("SELECT COUNT(*) as count FROM Users").first();
    return this.sendMessage(env, chatId, `👥 <b>Bot users = ${stats.count} ဦး</b>`);
  },
  
  async showGameList(env, chatId, messageId = null) {
    const games = await env.DB.prepare("SELECT DISTINCT game_name FROM Items").all();

    if (!games.results || games.results.length === 0) {
      return this.sendMessage(env, chatId, "⚠️ လောလောဆယ် TopUp လုပ်ရန် ပစ္စည်းများ မရှိသေးပါ။");
    }

    const inlineKeyboard = { inline_keyboard: [] };
    games.results.forEach(g => {
      inlineKeyboard.inline_keyboard.push([{ text: `🕹 ${g.game_name}`, callback_data: `user_game_${g.game_name}` }]);
    });

    return this.smartReply(env, chatId, "🎮 <b>TopUp လုပ်လိုသော Game ကို ရွေးချယ်ပါ</b>", inlineKeyboard, messageId);
  },

  async sendMessage(env, chatId, text, keyboard = null) {
    const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
    const body = { chat_id: chatId, text: text, parse_mode: "HTML" };
    if (keyboard) body.reply_markup = keyboard;
    return await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  },
    // --- smartReply
      async smartReply(env, chatId, text, keyboard = null, messageId = null) {
    const isInline = keyboard && keyboard.inline_keyboard;
    const url = messageId 
        ? `https://api.telegram.org/bot${env.BOT_TOKEN}/editMessageText`
        : `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;

    const body = {
        chat_id: chatId,
        text: text,
        parse_mode: "HTML"
    };

    if (messageId) body.message_id = messageId;
    if (keyboard) body.reply_markup = keyboard;

    // editMessageText သုံးရင် inline keyboard ပဲ ဖြစ်ရမယ်
    if (messageId && keyboard && !isInline) {
        delete body.reply_markup; // Admin Menu က keyboard မျိုးဆိုရင် ဖျက်ပေးရတယ်
    }

    return await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
      }
},
