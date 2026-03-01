import { useState, useRef, useEffect } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";

const T = {
    bg: "#080c14", surface: "#0e1420", card: "#131b2e", cardHover: "#1a2440",
    border: "#1e2d4a", text: "#e8edf5", muted: "#5a7090", dim: "#3a5070",
    accent: "#3b82f6", green: "#22c55e", red: "#ef4444", yellow: "#eab308"
};

export default function AIChat({ assets, transactions, netWorth, settings }) {
    const [messages, setMessages] = useState(() => {
        // Check if we have a key first to show a welcome or warning message
        if (!settings?.geminiApiKey) {
            return [{ role: "assistant", content: "⚠️ Please go to the **Settings** tab and enter your Gemini API Key to start chatting." }];
        }
        return [{ role: "assistant", content: "Hi! I'm your AI Portfolio Assistant. I can analyze your assets, transactions, and overall net worth. What would you like to know?" }];
    });
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const bottomRef = useRef(null);

    // Auto-scroll to bottom of chat
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim()) return;
        if (!settings?.geminiApiKey) {
            alert("Please add your Gemini API Key in the Settings tab first.");
            return;
        }

        const userMsg = input.trim();
        setInput("");
        setMessages(prev => [...prev, { role: "user", content: userMsg }]);
        setIsLoading(true);

        try {
            const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

            // Build context
            const contextPrompt = `
You are an expert financial advisor and portfolio analyst.
The user has provided you with their current portfolio data. 
Use this data to answer their questions accurately and helpfully. Do NOT hallucinate data.
When referring to money, format it nicely (e.g. ฿1,000.00 or $1,000.00).

--- PORTFOLIO CONTEXT ---
Total Net Worth: ฿${netWorth}
Total Assets: ${JSON.stringify(assets.map(a => ({ name: a.name, value: a.currentValue, type: a.type, currency: a.currency, invested: a.invested })), null, 2)}
Settings: ${JSON.stringify(settings, null, 2)}
-------------------------

Please keep your answer concise, extremely helpful, and formatted using Markdown for readability.
`;

            const history = messages.filter(m => !m.content.startsWith("⚠️")).map(m => ({
                role: m.role === "assistant" ? "model" : "user",
                parts: [{ text: m.content }]
            }));

            // Prepend the system context to the first message sent to the API, 
            // or start a new chat history if this is the first real message.
            const chat = model.startChat({
                history: history.length > 0 ? history : [],
            });

            // Send the user's message, but if it's the very first message in the conversation, inject the context.
            const promptToSend = history.length === 0 ? `${contextPrompt}\n\nUser Question: ${userMsg}` : userMsg;

            const result = await chat.sendMessage(promptToSend);
            const responseText = result.response.text();

            setMessages(prev => [...prev, { role: "assistant", content: responseText }]);
        } catch (error) {
            console.error("Gemini API Error:", error);
            setMessages(prev => [...prev, { role: "assistant", content: `❌ **Error:** ${error.message || "Failed to communicate with AI."}` }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 160px)", background: T.surface, borderRadius: 16, border: `1px solid ${T.border}`, overflow: "hidden" }}>
            {/* Chat History */}
            <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
                {messages.map((m, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                        <div style={{
                            maxWidth: "85%",
                            padding: "12px 16px",
                            borderRadius: 16,
                            borderBottomRightRadius: m.role === "user" ? 4 : 16,
                            borderBottomLeftRadius: m.role === "assistant" ? 4 : 16,
                            background: m.role === "user" ? T.accent : T.card,
                            border: m.role === "assistant" ? `1px solid ${T.borderLight}` : "none",
                            color: m.role === "user" ? "#fff" : T.text,
                            fontSize: 14,
                            lineHeight: 1.5,
                            whiteSpace: "pre-wrap",
                        }}>
                            {m.content}
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div style={{ display: "flex", justifyContent: "flex-start" }}>
                        <div style={{ padding: "12px 16px", borderRadius: 16, background: T.card, border: `1px solid ${T.borderLight}`, color: T.muted, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                            <span className="typing-dot" style={{ animation: "pulse 1.5s infinite" }}>●</span>
                            <span className="typing-dot" style={{ animation: "pulse 1.5s infinite 0.2s" }}>●</span>
                            <span className="typing-dot" style={{ animation: "pulse 1.5s infinite 0.4s" }}>●</span>
                        </div>
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            {/* Input Area */}
            <div style={{ padding: 16, background: T.card, borderTop: `1px solid ${T.border}`, display: "flex", gap: 10 }}>
                <input
                    style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 24, padding: "12px 20px", color: T.text, fontSize: 15, outline: "none", fontFamily: "inherit" }}
                    placeholder="Ask about your portfolio..."
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSend()}
                    disabled={isLoading}
                />
                <button
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading}
                    style={{ width: 44, height: 44, borderRadius: "50%", background: input.trim() && !isLoading ? T.accent : T.borderLight, color: "#fff", border: "none", cursor: input.trim() && !isLoading ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                </button>
            </div>
            <style dangerouslySetInnerHTML={{
                __html: `
        @keyframes pulse { 0% { opacity: 0.3; } 50% { opacity: 1; } 100% { opacity: 0.3; } }
      `}} />
        </div>
    );
}
