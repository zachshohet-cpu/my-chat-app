import React, { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { Copy, Check, ArrowLeft, Plus, LogIn, MessageSquare } from 'lucide-react'
import './App.css'

function generateInviteCode() {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
    let code = ''
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
    return code
}

function App() {
    const [searchParams, setSearchParams] = useSearchParams()

    // User identity
    const [userName, setUserName] = useState(localStorage.getItem('chat-name') || '')
    const [senderId, setSenderId] = useState(localStorage.getItem('chat-sender-id') || '')
    const [isJoined, setIsJoined] = useState(!!userName && !!senderId)

    // Screens: 'name' | 'lobby' | 'chat'
    const [screen, setScreen] = useState(isJoined ? 'lobby' : 'name')

    // Lobby state
    const [myRooms, setMyRooms] = useState(() => {
        try { return JSON.parse(localStorage.getItem('chat-rooms') || '[]') } catch { return [] }
    })
    const [joinCode, setJoinCode] = useState(searchParams.get('invite') || '')
    const [newRoomName, setNewRoomName] = useState('')
    const [lobbyError, setLobbyError] = useState('')
    const [lobbyLoading, setLobbyLoading] = useState(false)

    // Chat state
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('')
    const [currentRoom, setCurrentRoom] = useState(null)
    const [errorStatus, setErrorStatus] = useState(null)
    const [countdown, setCountdown] = useState('')
    const [copied, setCopied] = useState(false)
    const messagesEndRef = useRef(null)

    // Generate sender ID on first visit
    useEffect(() => {
        if (!senderId) {
            const newId = crypto.randomUUID()
            localStorage.setItem('chat-sender-id', newId)
            setSenderId(newId)
        }
    }, [senderId])

    // Countdown timer to next cleanup (midnight UTC)
    useEffect(() => {
        const updateCountdown = () => {
            const now = new Date()
            const nextMidnight = new Date(now)
            nextMidnight.setUTCDate(nextMidnight.getUTCDate() + 1)
            nextMidnight.setUTCHours(0, 0, 0, 0)
            const diff = nextMidnight - now
            const hours = String(Math.floor(diff / (1000 * 60 * 60))).padStart(2, '0')
            const minutes = String(Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))).padStart(2, '0')
            const seconds = String(Math.floor((diff % (1000 * 60)) / 1000)).padStart(2, '0')
            setCountdown(`${hours}:${minutes}:${seconds}`)
        }
        updateCountdown()
        const interval = setInterval(updateCountdown, 1000)
        return () => clearInterval(interval)
    }, [])

    // Auto-join from invite link
    useEffect(() => {
        const inviteCode = searchParams.get('invite')
        if (inviteCode && isJoined) {
            setJoinCode(inviteCode)
            handleJoinRoom(null, inviteCode)
        }
    }, [isJoined]) // eslint-disable-line react-hooks/exhaustive-deps

    // Save rooms to localStorage whenever they change
    useEffect(() => {
        localStorage.setItem('chat-rooms', JSON.stringify(myRooms))
    }, [myRooms])

    // Chat: fetch messages + realtime subscription
    useEffect(() => {
        if (screen !== 'chat' || !currentRoom) return

        const fetchMessages = async () => {
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .eq('room_id', currentRoom.id)
                .order('created_at', { ascending: true })
                .limit(100)

            if (data) setMessages(data)
            if (error) {
                console.error('Error fetching messages:', error)
                setErrorStatus('Could not load messages.')
            }
        }

        fetchMessages()

        const channel = supabase
            .channel(`room:${currentRoom.id}`)
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${currentRoom.id}` },
                (payload) => {
                    setMessages((prev) => [...prev, payload.new])
                }
            )
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [screen, currentRoom])

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    // ─── Actions ─────────────────────────────────────────

    const handleNameSubmit = (e) => {
        e.preventDefault()
        if (userName.trim()) {
            localStorage.setItem('chat-name', userName)
            setIsJoined(true)
            setScreen('lobby')
        }
    }

    const handleLogout = () => {
        localStorage.removeItem('chat-name')
        setIsJoined(false)
        setUserName('')
        setScreen('name')
    }

    const handleCreateRoom = async (e) => {
        e.preventDefault()
        if (!newRoomName.trim()) return
        setLobbyLoading(true)
        setLobbyError('')

        const inviteCode = generateInviteCode()
        const { data, error } = await supabase
            .from('rooms')
            .insert([{ name: newRoomName.trim(), invite_code: inviteCode }])
            .select()
            .single()

        if (error) {
            setLobbyError('Failed to create room: ' + error.message)
            setLobbyLoading(false)
            return
        }

        // Add to room_members
        await supabase.from('room_members').insert([{
            room_id: data.id,
            sender_id: senderId,
            display_name: userName,
        }])

        const room = { id: data.id, name: data.name, invite_code: data.invite_code }
        setMyRooms(prev => [...prev.filter(r => r.id !== room.id), room])
        setNewRoomName('')
        setLobbyLoading(false)
        enterRoom(room)
    }

    const handleJoinRoom = async (e, codeOverride) => {
        if (e) e.preventDefault()
        const code = (codeOverride || joinCode).trim().toLowerCase()
        if (!code) return
        setLobbyLoading(true)
        setLobbyError('')

        const { data, error } = await supabase
            .from('rooms')
            .select('id, name, invite_code')
            .eq('invite_code', code)
            .single()

        if (error || !data) {
            setLobbyError('No room found with that invite code.')
            setLobbyLoading(false)
            return
        }

        // Add to room_members (ignore if already there)
        await supabase.from('room_members').insert([{
            room_id: data.id,
            sender_id: senderId,
            display_name: userName,
        }])

        const room = { id: data.id, name: data.name, invite_code: data.invite_code }
        setMyRooms(prev => [...prev.filter(r => r.id !== room.id), room])
        setJoinCode('')
        setLobbyLoading(false)

        // Clear the invite param from the URL
        searchParams.delete('invite')
        setSearchParams(searchParams, { replace: true })

        enterRoom(room)
    }

    const enterRoom = (room) => {
        setCurrentRoom(room)
        setMessages([])
        setErrorStatus(null)
        setScreen('chat')
    }

    const backToLobby = () => {
        setCurrentRoom(null)
        setScreen('lobby')
    }

    const sendMessage = async (e) => {
        e.preventDefault()
        if (!input.trim() || !currentRoom || !senderId) return

        const newMessage = {
            content: input,
            sender_name: userName,
            sender_id: senderId,
            room_id: currentRoom.id,
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

    const copyInviteLink = () => {
        const url = `${window.location.origin}?invite=${currentRoom.invite_code}`
        navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    // ─── Screens ─────────────────────────────────────────

    // 1. Name Screen
    if (screen === 'name') {
        return (
            <div className="app-container">
                <div className="name-screen">
                    <div className="name-card">
                        <MessageSquare size={40} className="name-icon" />
                        <h2>Buddy Squad</h2>
                        <p className="subtitle">Enter your name to get started</p>
                        <form onSubmit={handleNameSubmit}>
                            <input
                                type="text"
                                placeholder="Your display name..."
                                value={userName}
                                onChange={(e) => setUserName(e.target.value)}
                                required
                                autoFocus
                            />
                            <button type="submit" className="btn-primary">Continue</button>
                        </form>
                    </div>
                </div>
            </div>
        )
    }

    // 2. Lobby Screen
    if (screen === 'lobby') {
        return (
            <div className="app-container">
                <header className="lobby-header">
                    <h1>Buddy Squad</h1>
                    <div className="lobby-header-right">
                        <span className="user-badge">{userName}</span>
                        <button className="btn-logout" onClick={handleLogout}>Change Name</button>
                    </div>
                </header>

                {lobbyError && <div className="error-banner">⚠️ {lobbyError}</div>}

                <div className="lobby-grid">
                    {/* Create Room */}
                    <div className="lobby-card">
                        <h3><Plus size={18} /> Create a Room</h3>
                        <form onSubmit={handleCreateRoom}>
                            <input
                                type="text"
                                placeholder="Room name..."
                                value={newRoomName}
                                onChange={(e) => setNewRoomName(e.target.value)}
                                required
                            />
                            <button type="submit" className="btn-primary" disabled={lobbyLoading}>
                                {lobbyLoading ? 'Creating...' : 'Create'}
                            </button>
                        </form>
                    </div>

                    {/* Join Room */}
                    <div className="lobby-card">
                        <h3><LogIn size={18} /> Join a Room</h3>
                        <form onSubmit={handleJoinRoom}>
                            <input
                                type="text"
                                placeholder="Invite code..."
                                value={joinCode}
                                onChange={(e) => setJoinCode(e.target.value)}
                                required
                            />
                            <button type="submit" className="btn-primary" disabled={lobbyLoading}>
                                {lobbyLoading ? 'Joining...' : 'Join'}
                            </button>
                        </form>
                    </div>
                </div>

                {/* My Rooms */}
                {myRooms.length > 0 && (
                    <div className="my-rooms">
                        <h3>My Rooms</h3>
                        <div className="room-list">
                            {myRooms.map(room => (
                                <button
                                    key={room.id}
                                    className="room-item"
                                    onClick={() => enterRoom(room)}
                                >
                                    <span className="room-name">{room.name}</span>
                                    <span className="room-code">{room.invite_code}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        )
    }

    // 3. Chat Screen
    return (
        <div className="app-container">
            <header className="chat-header">
                <div className="chat-header-left">
                    <button className="btn-icon" onClick={backToLobby} title="Back to Lobby">
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <h1 className="chat-title">{currentRoom?.name || 'Chat'}</h1>
                        <span className="chat-code">Code: {currentRoom?.invite_code}</span>
                    </div>
                </div>
                <div className="chat-header-right">
                    <button className="btn-copy" onClick={copyInviteLink} title="Copy invite link">
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                        {copied ? 'Copied!' : 'Invite'}
                    </button>
                    <div className="countdown-badge">🧹 {countdown}</div>
                    <span className="user-badge-small">{userName}</span>
                </div>
            </header>

            {errorStatus && <div className="error-banner">{errorStatus}</div>}

            <div className="chat-window">
                <div className="messages">
                    {messages.length === 0 && <p style={{ textAlign: 'center', color: '#666' }}>No messages yet. Say hello!</p>}
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`message ${msg.sender_id === senderId ? 'own' : 'other'}`}>
                            <div className="message-sender">{msg.sender_name}</div>
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
                        autoFocus
                    />
                    <button type="submit" disabled={!input.trim()}>Send</button>
                </form>
            </div>
        </div>
    )
}

export default App
