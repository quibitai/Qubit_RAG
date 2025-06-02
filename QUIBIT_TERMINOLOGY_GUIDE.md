# 🤖 Quibit RAG System - Official Terminology Guide

> **For AI Assistants**: This document defines the standard terminology for the Quibit RAG v2.8.0 hybrid system. Please use these exact terms when discussing system components to maintain consistency.

## 📋 **CORE TERMINOLOGY**

### **🤖 Quibit / Quibit Chat**
- **What it is**: The global chat pane orchestrator
- **Location**: Main chat interface (right side of screen)
- **AI Model**: `global-orchestrator`
- **Capabilities**: 
  - Routes complex queries to specialists
  - Handles general conversations directly
  - Coordinates tools (Asana, Google Calendar, etc.)
  - Provides unified chat experience
- **Code Reference**: `BrainOrchestrator` service
- **Alternative Names**: ❌ Don't use "global orchestrator", "global chat pane"

### **📱 Chat Bit**
- **What it is**: Sidebar specialist chat interface
- **Location**: Left sidebar with dropdown menu
- **UI Component**: Contains specialist selection dropdown
- **Purpose**: Access to individual AI specialists
- **Code Reference**: Specialist chat components
- **Alternative Names**: ❌ Don't use "sidebar chat", "specialist chat interface"

### **🎭 Specialists**
- **What they are**: Individual AI assistants selectable from Chat Bit dropdown
- **Examples**: 
  - "Echo Tango Specialist" (document analysis, project management)
  - "General Chat" (basic conversations)
- **Context IDs**: `echo-tango-specialist`, `chat-model`, etc.
- **Capabilities**: Each has specialized knowledge and tools
- **Alternative Names**: ❌ Don't use "assistants", "agents", "models"

## 🔄 **SYSTEM ARCHITECTURE**

```
┌─ Chat Bit (Sidebar) ──────────┐    ┌─ Quibit (Global Chat) ────────┐
│  ┌─ Specialists Dropdown ──┐  │    │                               │
│  │ • Echo Tango Specialist │  │    │  🤖 Quibit Orchestrator      │
│  │ • General Chat         │  │    │     • Routes queries          │
│  │ • [Future Specialists] │  │    │     • Tool coordination       │
│  └─────────────────────────┘  │    │     • Unified interface      │
└──────────────────────────────────┘    └─────────────────────────────┘
```

## 💡 **USAGE EXAMPLES**

### ✅ **Correct Usage**
- "The user is chatting with **Quibit**"
- "**Echo Tango Specialist** can analyze documents"
- "Select a specialist from the **Chat Bit** dropdown"
- "**Quibit** routes complex queries to appropriate **specialists**"

### ❌ **Avoid These Terms**
- "Global orchestrator" → Use **"Quibit"**
- "Global chat pane" → Use **"Quibit"** 
- "Sidebar chat" → Use **"Chat Bit"**
- "Specialist interface" → Use **"Chat Bit"**
- "Agents/Models" → Use **"Specialists"**

## 🛠️ **TECHNICAL DETAILS**

### **Code References**
- **Quibit Backend**: `BrainOrchestrator` class in `lib/services/brainOrchestrator.ts`
- **Chat Bit Frontend**: Specialist chat components
- **Specialists**: Individual context IDs (`echo-tango-specialist`, etc.)

### **Database Context**
- **Quibit chats**: `bitContextId` = `global-orchestrator` or null
- **Specialist chats**: `bitContextId` = specialist context ID
- **Client ID**: `echo-tango` for Echo Tango, `default` for others

### **API Endpoints**
- **Brain API**: `/api/brain` (powers both Quibit and specialists)
- **History API**: `/api/history` (separate queries for Quibit vs Chat Bit)

## 📚 **QUICK REFERENCE CARD**

| Component | Official Term | What It Does | Where It Lives |
|-----------|---------------|--------------|----------------|
| Global AI | **Quibit** | Main orchestrator | Right side chat pane |
| Specialist UI | **Chat Bit** | Specialist selection | Left sidebar |
| Individual AIs | **Specialists** | Specialized assistants | Chat Bit dropdown |

## 🎯 **FOR NEW AI ASSISTANTS**

When a user mentions:
- **"Quibit"** → They mean the main chat orchestrator (global chat pane)
- **"Chat Bit"** → They mean the sidebar specialist interface  
- **"Specialists"** → They mean the individual AI assistants
- **"Echo Tango"** → They mean the primary document/project specialist

---

**📅 Last Updated**: June 2025  
**🚀 System Version**: Quibit RAG v2.8.0  
**📖 Purpose**: Standardize terminology across all AI assistant interactions 