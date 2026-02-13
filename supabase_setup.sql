-- ============================================
-- BUDDY SQUAD - Supabase Setup SQL
-- ============================================

-- 1. CREATE TABLES
CREATE TABLE IF NOT EXISTS rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Buddy Squad',
  invite_code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  sender_id TEXT,
  sender_name TEXT NOT NULL,
  content TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. ENABLE RLS
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 3. POLICIES (Allow anon access for this MVP)
CREATE POLICY "Allow anon select rooms" ON rooms FOR SELECT USING (true);
CREATE POLICY "Allow anon insert rooms" ON rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon select messages" ON messages FOR SELECT USING (true);
CREATE POLICY "Allow anon insert messages" ON messages FOR INSERT WITH CHECK (true);

-- 4. ROOM MEMBERS TABLE (tracks who joined which room)
CREATE TABLE IF NOT EXISTS room_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon select room_members" ON room_members FOR SELECT USING (true);
CREATE POLICY "Allow anon insert room_members" ON room_members FOR INSERT WITH CHECK (true);

-- 5. ENABLE REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- 6. INSERT DEFAULT ROOM
INSERT INTO rooms (name, invite_code) 
VALUES ('Buddy Squad', 'buddysquad')
ON CONFLICT (invite_code) DO NOTHING;
