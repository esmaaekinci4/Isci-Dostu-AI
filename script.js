// KESİN ÇÖZÜM KODU - script.js içeriğine yapıştır
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent";

async function sendMessageToGemini(userInput, apiKey) {
    const response = await fetch(`${API_URL}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts: [{ text: userInput }] }],
            systemInstruction: {
                parts: [{ text: "Sen bir iş hukuku ve İSG uzmanısın. İşçilere haklarını sade ve net anlat." }]
            }
        })
    });
    return await response.json();
}
