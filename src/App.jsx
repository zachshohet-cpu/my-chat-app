import React, { useState, useEffect, useRef } from 'react'
import { supabase } from './lib/supabase'
import './App.css'

function App() {
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('')
    const [userName, setUserName] = useState(localStorage.getItem('chat-name') || '')
    const [senderId, setSenderId] = useState(localStorage.getItem('chat-sender-id') || '')
    const [isJoined, setIsJoined] = useState(!!userName && !!senderId)
    const messagesEndRef = useRef(null)

    const [errorStatus, setErrorStatus] = useState(null)
    const [roomId, setRoomId] = useState(null)

    useEffect(() => {
        // Generate a unique ID if one doesn't exist
        if (!senderId) {
            const newId = crypto.randomUUID()
            localStorage.setItem('chat-sender-id', newId)
            setSenderId(newId)
        }
    }, [senderId])

    useEffect(() => {
        // 1. Find the default room ID
        const getRoom = async () => {
            const { data, error } = await supabase
                .from('rooms')
                .select('id')
                .eq('invite_code', 'buddysquad')
                .single()

            if (data) setRoomId(data.id)
            if (error) {
                console.error('Error finding room:', error)
                setErrorStatus('Database tables missing. Did you run the SQL setup?')
            }
        }
        getRoom()
    }, [])

    useEffect(() => {
        if (!isJoined || !roomId) return

        // 2. Fetch messages for THIS room
        const fetchMessages = async () => {
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .eq('room_id', roomId)
                .order('created_at', { ascending: true })
                .limit(100)

            if (data) setMessages(data)
            if (error) {
                console.error('Error fetching messages:', error)
                setErrorStatus('Could not load messages. Check your console!')
            }
        }

        fetchMessages()

        // 3. Listen for new messages
        const channel = supabase
            .channel('public:messages')
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
                (payload) => {
                    setMessages((prev) => [...prev, payload.new])
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [isJoined, roomId])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const handleJoin = (e) => {
        e.preventDefault()
        if (userName.trim()) {
            localStorage.setItem('chat-name', userName)
            // senderId is handled by the useEffect
            setIsJoined(true)
        }
    }

    const sendMessage = async (e) => {
        e.preventDefault()
        if (!input.trim() || !roomId || !senderId) return

        const newMessage = {
            content: input,
            sender_name: userName,
            sender_id: senderId, // Fix: Include the missing sender_id
            room_id: roomId, // Critical: associate with room
            created_at: new Date().toISOString(),
        }

        const { error } = await supabase.from('messages').insert([newMessage])
        if (error) {
            console.error('Error sending message:', error)
            alert('Failed to send: ' + error.message)
        } else {
            setInput('')
        }
    }

    if (!isJoined) {
        return (
            <div className="app-container">
                <div className="chat-window" style={{ justifyContent: 'center', alignItems: 'center', padding: '40px' }}>
                    <h2>Buddy Squad</h2>
                    {errorStatus && <p style={{ color: '#ff4d4d', fontSize: '0.9rem' }}>⚠️ {errorStatus}</p>}
                    <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '15px', width: '100%', maxWidth: '300px' }}>
                        <input
                            type="text"
                            placeholder="Your display name..."
                            value={userName}
                            onChange={(e) => setUserName(e.target.value)}
                            required
                        />
                        <button type="submit">Enter Chat</button>
                    </form>
                </div>
            </div>
        )
    }

    return (
        <div className="app-container">
            <header style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ fontSize: '1.2rem', margin: 0 }}>Buddy Squad</h1>
                <span style={{ fontSize: '0.8rem', color: '#888' }}>{userName}</span>
            </header>

            {errorStatus && <div style={{ background: '#4a1d1d', padding: '10px', borderRadius: '8px', marginBottom: '10px', textAlign: 'center' }}>{errorStatus}</div>}

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
