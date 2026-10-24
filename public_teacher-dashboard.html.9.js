
let currentGroupReplyTo = null;

function startGroupReplyToMessage(msgId, senderName, text) {
    currentGroupReplyTo = { id: msgId, sender: senderName, text: text };
    const bar = document.getElementById('groupReplyBar');
    const toEl = document.getElementById('groupReplyBarTo');
    const textEl = document.getElementById('groupReplyBarText');
    if (bar && toEl && textEl) {
        bar.style.display = 'flex';
        toEl.textContent = `الرد على: ${senderName || 'رسالة'}`;
        textEl.textContent = text && text.length > 60 ? text.substring(0, 60) + '...' : (text || 'مرفق');
    }
    const inputEl = document.getElementById('studentChatInputMessage') || document.getElementById('chatInputMessage') || document.getElementById('groupMessageInput') || document.getElementById('groupMsgInput');
    if (inputEl) {
        inputEl.focus();
        inputEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function cancelGroupChatReply() {
    currentGroupReplyTo = null;
    const bar = document.getElementById('groupReplyBar');
    if (bar) bar.style.display = 'none';
}

function scrollToGroupMessage(msgId) {
    if (!msgId) return;
    const el = document.getElementById(`msgBubble_${msgId}`) || document.querySelector(`[data-msg-id="${msgId}"]`) || document.getElementById(`groupMsg_${msgId}`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.transition = 'all 0.3s ease';
        const originalBg = el.style.background;
        el.style.background = '#dbeafe';
        el.style.transform = 'scale(1.02)';
        setTimeout(() => {
            el.style.background = originalBg;
            el.style.transform = 'none';
        }, 1200);
    }
}

// ============================================================
// COMMUNITY CHANNELS & PROFILE AI ASSISTANT
// ============================================================

async function loadCommunityChannels() {
    const grid = document.getElementById('communityChannelsGrid');
    if (!grid) return;
    try {
        const res = await fetch('/api/settings/community_channels');
        const data = await res.json();
        const channels = (data && data.channels && Array.isArray(data.channels)) ? data.channels.filter(c => c.is_active !== false) : [];

        if (!channels.length) {
            grid.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #64748b; grid-column: 1 / -1; background: white; border-radius: 16px; border: 1px solid #e2e8f0;">
                    <i class="fas fa-bullhorn fa-2x" style="color: #94a3b8; margin-bottom: 10px;"></i>
                    <h4 style="margin: 0 0 6px 0; color: #1e293b;">لا توجد قنوات مفعلة حالياً</h4>
                    <p style="margin: 0; font-size: 0.88rem;">سيتم إضافة قنوات ومجموعات التواصل قريباً من قبل إدارة المنصة.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = channels.map(ch => {
            const iconColor = ch.type === 'telegram' || ch.type === 'telegram_group' ? '#0088cc' : (ch.type === 'facebook' ? '#1877f2' : (ch.type === 'youtube' ? '#ff0000' : (ch.type === 'instagram' ? '#e1306c' : (ch.type === 'whatsapp' ? '#25d366' : '#2563eb'))));
            const btnBg = ch.type === 'telegram' || ch.type === 'telegram_group' ? 'linear-gradient(135deg, #0284c7, #0369a1)' : (ch.type === 'facebook' ? 'linear-gradient(135deg, #1877f2, #0d5cb6)' : 'linear-gradient(135deg, #2563eb, #1d4ed8)');
            return `
                <div class="channel-card" style="background: white; border-radius: 18px; padding: 22px; border: 1.5px solid #e2e8f0; box-shadow: 0 4px 20px rgba(0,0,0,0.04); display: flex; flex-direction: column; justify-content: space-between; gap: 16px; transition: transform 0.2s, box-shadow 0.2s;" onmouseenter="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 12px 30px rgba(0,0,0,0.08)'" onmouseleave="this.style.transform='none'; this.style.boxShadow='0 4px 20px rgba(0,0,0,0.04)'">
                    <div>
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                            <div style="width: 50px; height: 50px; background: #f0f9ff; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.6rem; color: ${iconColor}; box-shadow: 0 2px 8px rgba(0,0,0,0.05); border: 1px solid #e0f2fe;">
                                <i class="${ch.icon || 'fas fa-bullhorn'}"></i>
                            </div>
                            <span style="background: #f1f5f9; color: #475569; font-size: 0.75rem; font-weight: 800; padding: 4px 10px; border-radius: 20px; border: 1px solid #e2e8f0;">
                                ${escapeHtml(ch.badge || 'رابط رسمي')}
                            </span>
                        </div>
                        <h4 style="margin: 0 0 6px 0; font-size: 1.1rem; color: #0f172a; font-weight: 800;">${escapeHtml(ch.name || 'قناة')}</h4>
                        <p style="margin: 0; font-size: 0.88rem; color: #64748b; line-height: 1.6;">${escapeHtml(ch.description || '')}</p>
                    </div>
                    <div>
                        <a href="${escapeHtml(ch.url)}" target="_blank" rel="noopener noreferrer" style="display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; box-sizing: border-box; background: ${btnBg}; color: white; padding: 12px 18px; border-radius: 12px; font-weight: 800; font-size: 0.92rem; text-decoration: none; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.25); transition: opacity 0.2s;">
                            <i class="${ch.icon || 'fas fa-external-link-alt'}"></i>
                            <span>${escapeHtml(ch.btn_text || 'انضمام الآن')}</span>
                        </a>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('Error loading community channels:', e);
        grid.innerHTML = '<div style="color: #ef4444; padding: 20px; text-align: center;">تعذر تحميل القنوات حالياً</div>';
    }
}
window.loadCommunityChannels = loadCommunityChannels;

async function sendProfileAiMessage(role) {
    const input = document.getElementById(role === 'teacher' ? 'teacherProfileAiInput' : 'studentProfileAiInput');
    const messagesBox = document.getElementById(role === 'teacher' ? 'teacherProfileAiMessages' : 'studentProfileAiMessages');
    const sendBtn = document.getElementById(role === 'teacher' ? 'teacherProfileAiSendBtn' : 'studentProfileAiSendBtn');
    if (!input || !messagesBox) return;

    const query = input.value.trim();
    if (!query) return;

    input.value = '';
    
    // Append User Message
    const userMsg = document.createElement('div');
    userMsg.style.cssText = 'background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; border-radius: 14px 14px 2px 14px; padding: 10px 16px; align-self: flex-start; max-width: 85%; font-size: 0.9rem; line-height: 1.55; box-shadow: 0 4px 12px rgba(37,99,235,0.25);';
    userMsg.textContent = query;
    messagesBox.appendChild(userMsg);
    messagesBox.scrollTop = messagesBox.scrollHeight;

    // Typing Indicator
    const typing = document.createElement('div');
    typing.style.cssText = 'background: rgba(30, 41, 59, 0.85); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 8px 14px; color: #94a3b8; font-size: 0.82rem; align-self: flex-end; display: flex; align-items: center; gap: 6px;';
    typing.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري كتابة الرد الذكي...';
    messagesBox.appendChild(typing);
    messagesBox.scrollTop = messagesBox.scrollHeight;

    if (sendBtn) sendBtn.disabled = true;

    try {
        const token = localStorage.getItem('token') || '';
        const res = await fetch('/api/ai/platform-assistant', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ message: query, role: role || 'teacher' })
        });

        typing.remove();

        let botReply = '';
        if (res.ok) {
            const data = await res.json();
            botReply = data.message || 'أهلاً بك! أنا مساعد منصة ZoomDz.';
        } else {
            botReply = 'عذراً، حدث خطأ أثناء معالجة الطلب، يرجى المحاولة لاحقاً.';
        }

        // Parse Markdown and Nav Buttons
        let formatted = botReply
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');

        formatted = formatted.replace(/\[\[NAV:([a-zA-Z0-9_\-]+):(.*?)\]\]/g, function (match, sec, label) {
            return `<br><button type="button" onclick="showSection('${sec}')" style="margin-top: 8px; background: rgba(37, 99, 235, 0.25); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4); padding: 5px 12px; border-radius: 10px; font-weight: 700; font-size: 0.8rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;"><i class="fas fa-arrow-left"></i> ${label}</button>`;
        });

        const botMsg = document.createElement('div');
        botMsg.style.cssText = 'background: rgba(30, 41, 59, 0.85); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px 14px 14px 2px; padding: 12px 16px; color: #f1f5f9; font-size: 0.88rem; line-height: 1.6; align-self: flex-end; max-width: 90%;';
        botMsg.innerHTML = formatted;
        messagesBox.appendChild(botMsg);
        messagesBox.scrollTop = messagesBox.scrollHeight;

    } catch (err) {
        typing.remove();
        const errMsg = document.createElement('div');
        errMsg.style.cssText = 'background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 12px; padding: 10px 14px; color: #fca5a5; font-size: 0.85rem; align-self: flex-end;';
        errMsg.textContent = '❌ تعذر الاتصال بالمساعد الذكي، يرجى التحقق من اتصالك بالإنترنت.';
        messagesBox.appendChild(errMsg);
    } finally {
        if (sendBtn) sendBtn.disabled = false;
        messagesBox.scrollTop = messagesBox.scrollHeight;
    }
}
window.sendProfileAiMessage = sendProfileAiMessage;

function askProfileAiQuick(query, role) {
    const input = document.getElementById(role === 'teacher' ? 'teacherProfileAiInput' : 'studentProfileAiInput');
    if (input) {
        input.value = query;
        sendProfileAiMessage(role);
    }
}
window.askProfileAiQuick = askProfileAiQuick;

function clearProfileAiChat(role) {
    const messagesBox = document.getElementById(role === 'teacher' ? 'teacherProfileAiMessages' : 'studentProfileAiMessages');
    if (messagesBox) {
        messagesBox.innerHTML = `
            <div style="background: rgba(30, 41, 59, 0.85); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 12px 16px; color: #f1f5f9; font-size: 0.9rem; line-height: 1.6;">
                👋 مرحباً بك! أنا مساعد ZoomDz الذكي المبني على نموذج <strong>Zoomy AI</strong>. يمكنك سؤالي عن أي استفسار يخص المنصة وأقسامها، كيفية إنشاء الحصص، أو سحب الأرباح.
            </div>
        `;
    }
}
window.clearProfileAiChat = clearProfileAiChat;

