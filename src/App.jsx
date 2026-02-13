import React, { useState, useEffect, useRef } from 'react'
import { supabase } from './lib/supabase'
import './App.css'

function App() {
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('')
    const [userName, setUserName] = useState(localStorage.getItem('chat-name') || '')
    const [isJoined, setIsJoined] = useState(!!userName)
    const messagesEndRef = useRef(null)

    useEffect(() => {
        if (!isJoined) return

        // Fetch initial messages
        const fetchMessages = async () => {
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .order('created_at', { ascending: true })
                .limit(100)

            if (data) setMessages(data)
        }

        fetchMessages()

        // Subscribe to new messages
        const channel = supabase
            .channel('public:messages')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
                setMessages((prev) => [...prev, payload.new])
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [isJoined])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const handleJoin = (e) => {
        e.preventDefault()
        if (userName.trim()) {
            localStorage.setItem('chat-name', userName)
            setIsJoined(true)
        }
    }

    const sendMessage = async (e) => {
        e.preventDefault()
        if (!input.trim()) return

        const newMessage = {
            content: input,
            sender_name: userName,
            created_at: new Date().toISOString(),
        }

        setInput('')

        const { error } = await supabase.from('messages').insert([newMessage])
        if (error) console.error('Error sending message:', error)
    }

    if (!isJoined) {
        return (
            <div className="app-container">
                <div className="chat-window" style={{ justifyContent: 'center', alignItems: 'center', padding: '40px' }}>
                    <h2>Welcome to Buddy Squad</h2>
                    <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '15px', width: '100%', maxWidth: '300px' }}>
                        <input
                            type="text"
                            placeholder="Enter your name..."
                            value={userName}
                            onChange={(e) => setUserName(e.target.value)}
                            required
                        />
                        <button type="submit">Join Chat</button>
                    </form>
                </div>
            </div>
        )
    }

    return (
        <div className="app-container">
            <header style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ fontSize: '1.2rem', margin: 0 }}>Buddy Squad</h1>
                <span style={{ fontSize: '0.8rem', color: '#888' }}>Logged in as {userName}</span>
            </header>

            <div className="chat-window">
                <div className="messages">
                    {messages.length === 0 && <p style={{ textAlign: 'center', color: '#666' }}>No messages yet. Say hello!</p>}
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`message ${msg.sender_name === userName ? 'own' : 'other'}`}>
                            <div style={{ fontSize: '0.7rem', opacity: 0.7, marginBottom: '4px' }}>
                                {msg.sender_name}
                            </div>
                            <div>{msg.content}</div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                <form className="input-area" onSubmit={sendMessage}>
                    <input
                        type="text"
                        placeholder="Type a message..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                    />
                    <button type="submit" disabled={!input.trim()}>Send</button>
                </form>
            </div>
        </div>
    )
}

export default App
