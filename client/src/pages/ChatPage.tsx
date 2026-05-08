import { useState } from "react";
import { AIChatBox, type Message } from "@/components/AIChatBox";

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "system",
      content: "You are a helpful assistant for CivicPulse, a civic issue reporting platform.",
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = (content: string) => {
    // Add user message
    const userMessage: Message = {
      role: "user",
      content,
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    // Simulate AI response after a delay
    setTimeout(() => {
      const assistantResponses: Record<string, string> = {
        "photo": "Great! I'm ready to analyze your photo. Please upload an image and I'll provide a detailed report about the civic issue shown.",
        "problem": "Perfect! Please describe the civic problem you observed, and I'll provide suggestions on how to report it and what category it falls under.",
        "help": "I'm here to help! What specific issue are you facing with CivicPulse? I can help with navigation, reporting issues, viewing the map, or anything else.",
      };

      let response =
        assistantResponses[content] ||
        `Thank you for your message: "${content}"\n\nHow can I assist you further with CivicPulse?`;

      const assistantMessage: Message = {
        role: "assistant",
        content: response,
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsLoading(false);
    }, 1000);
  };

  const handlePhotoUpload = (file: File) => {
    const userMessage: Message = {
      role: "user",
      content: `📷 Uploaded file: ${file.name} (${file.type})`,
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    // Simulate AI analysis
    setTimeout(() => {
      const analysisResponse: Message = {
        role: "assistant",
        content: `I've analyzed your photo "${file.name}". Based on the image, here's my report:\n\n**Issue Analysis:**\n- Category: Infrastructure\n- Severity: Moderate\n- Status: Reportable\n\n**Recommendations:**\n1. The issue appears to be related to road maintenance\n2. Consider selecting "Roads" as the category when reporting\n3. Mark it as "High Priority" if it poses a safety hazard\n4. Provide additional context in the description\n\nWould you like me to help you report this issue?`,
      };
      setMessages((prev) => [...prev, analysisResponse]);
      setIsLoading(false);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 p-4">
      <div className="max-w-2xl mx-auto pt-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">CivicPulse AI Assistant</h1>
          <p className="text-muted-foreground">
            Get help with photo analysis, problem descriptions, and website support
          </p>
        </div>

        <div className="rounded-lg border shadow-lg overflow-hidden">
          <AIChatBox
            messages={messages}
            onSendMessage={handleSendMessage}
            onPhotoUpload={handlePhotoUpload}
            isLoading={isLoading}
            placeholder="Type your message..."
            height="600px"
            emptyStateMessage="Welcome to CivicPulse AI Assistant"
          />
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-lg border p-4 bg-card">
            <h3 className="font-semibold mb-2">📷 Photo Analysis</h3>
            <p className="text-sm text-muted-foreground">
              Upload photos of civic issues and get instant analysis and recommendations.
            </p>
          </div>
          <div className="rounded-lg border p-4 bg-card">
            <h3 className="font-semibold mb-2">💬 Problem Description</h3>
            <p className="text-sm text-muted-foreground">
              Describe what you see and receive suggestions for categorizing and reporting.
            </p>
          </div>
          <div className="rounded-lg border p-4 bg-card">
            <h3 className="font-semibold mb-2">❓ Website Help</h3>
            <p className="text-sm text-muted-foreground">
              Get instant support for any issues or questions about using CivicPulse.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
