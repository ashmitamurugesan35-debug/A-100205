import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import net from 'node:net'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function getAvailablePort(startPort) {
  const tryPort = (port) =>
    new Promise((resolve) => {
      const tester = net.createServer()
      tester.unref()

      tester.on('error', () => {
        resolve(tryPort(port + 1))
      })

      tester.listen(port, () => {
        tester.close(() => resolve(port))
      })
    })

  return tryPort(startPort)
}

app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'dashboard-backend' })
})

// Members endpoints
app.get('/api/members', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .order('id', { ascending: false })

    if (error) throw error
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/members', async (req, res) => {
  try {
    const { name, role, avatar_url } = req.body

    if (!name || !role) {
      return res.status(400).json({ success: false, error: 'Name and role are required' })
    }

    const { data, error } = await supabase
      .from('members')
      .insert([{ name, role, avatar_url: avatar_url || null }])
      .select('*')
      .single()

    if (error) throw error
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// Projects endpoints
app.get('/api/projects', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('id', { ascending: false })

    if (error) throw error
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/projects', async (req, res) => {
  try {
    const { title, description, status } = req.body

    if (!title) {
      return res.status(400).json({ success: false, error: 'Title is required' })
    }

    const { data, error } = await supabase
      .from('projects')
      .insert([{ title, description: description || null, status: status || 'Active' }])
      .select('*')
      .single()

    if (error) throw error
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// Memories endpoints
app.get('/api/memories', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('memories')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/memories', async (req, res) => {
  try {
    const { image_url, caption } = req.body

    if (!image_url) {
      return res.status(400).json({ success: false, error: 'Image URL is required' })
    }

    const { data, error } = await supabase
      .from('memories')
      .insert([{ image_url, caption: caption || null }])
      .select('*')
      .single()

    if (error) throw error
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

const startServer = async () => {
  const availablePort = await getAvailablePort(Number(PORT) || 5000)

  app.listen(availablePort, () => {
    console.log(`Backend running on http://localhost:${availablePort}`)
  })
}

startServer().catch((error) => {
  console.error('Failed to start backend:', error)
  process.exit(1)
})
