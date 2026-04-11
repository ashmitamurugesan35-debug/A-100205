import { useEffect, useMemo, useState } from 'react'
import { jsPDF } from 'jspdf'
import {
  Activity,
  ArrowLeft,
  BrainCircuit,
  ChevronRight,
  Download,
  FolderKanban,
  LayoutDashboard,
  Link2,
  Plus,
  ShieldAlert,
  Timer,
  Trophy,
  Users,
  X,
} from 'lucide-react'
import { supabase, supabaseBucket } from './lib/supabaseClient'
import { domainMatrix, hackathonVault, projects, teamMembers } from './teamData'

const sidebarTabs = [
  { key: 'Overview', icon: LayoutDashboard },
  { key: 'Members', icon: Users },
  { key: 'Domains', icon: BrainCircuit },
  { key: 'Projects', icon: FolderKanban },
  { key: 'PS Points Wallet', icon: Trophy },
  { key: 'Memory Lane', icon: ShieldAlert },
]

const countdownTarget = new Date('2026-04-16T09:00:00+05:30').getTime()

function getTimeLeft() {
  const gap = countdownTarget - Date.now()
  if (gap <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0 }
  }

  return {
    days: Math.floor(gap / (1000 * 60 * 60 * 24)),
    hours: Math.floor((gap / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((gap / (1000 * 60)) % 60),
    seconds: Math.floor((gap / 1000) % 60),
  }
}

function getInitials(name) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
}

function memberSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function truncateText(text, maxLen) {
  if (!text) {
    return '-'
  }

  if (text.length <= maxLen) {
    return text
  }

  return `${text.slice(0, maxLen - 3)}...`
}

function compressImageFile(file, maxWidth = 1400, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const source = reader.result
      const img = new Image()

      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(file)
          return
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((blob) => {
          resolve(blob || file)
        }, 'image/jpeg', quality)
      }

      img.onerror = () => resolve(file)
      img.src = source
    }

    reader.onerror = () => reject(new Error('Unable to read image file'))
    reader.readAsDataURL(file)
  })
}

function isDataPhoto(src) {
  return typeof src === 'string' && src.startsWith('data:image/')
}

function dataUrlToBlob(dataUrl) {
  return fetch(dataUrl).then((response) => response.blob())
}

function App() {
  const [activeTab, setActiveTab] = useState('Overview')
  const [timeLeft, setTimeLeft] = useState(getTimeLeft)
  const [showPrivate, setShowPrivate] = useState({})
  const [brokenPhotos, setBrokenPhotos] = useState({})
  const [brokenMemoryImages, setBrokenMemoryImages] = useState({})
  const [toast, setToast] = useState('')
  const [uploadedMemories, setUploadedMemories] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('uploadedMemories')) || {}
    } catch {
      return {}
    }
  })
  const [customEvents, setCustomEvents] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('customHackathonEvents')) || []
    } catch {
      return []
    }
  })
  const [showAddEventForm, setShowAddEventForm] = useState(false)
  const [newEvent, setNewEvent] = useState({
    title: '',
    date: '',
    description: '',
    award: '',
  })
  const [migrationStatus, setMigrationStatus] = useState('')

  useEffect(() => {
    const timer = setInterval(() => setTimeLeft(getTimeLeft()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!toast) {
      return undefined
    }

    const timer = setTimeout(() => setToast(''), 1800)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    try {
      localStorage.setItem('customHackathonEvents', JSON.stringify(customEvents))
    } catch {
      setToast('Unable to save new events in browser storage')
    }
  }, [customEvents])

  useEffect(() => {
    const migrateOldMemoryPhotos = async () => {
      if (!supabase) {
        return
      }

      if (localStorage.getItem('memoryLaneMigrationDone') === 'true') {
        return
      }

      const storedMemories = (() => {
        try {
          return JSON.parse(localStorage.getItem('uploadedMemories')) || {}
        } catch {
          return {}
        }
      })()

      let changed = false
      const migratedMemories = { ...storedMemories }

      for (const [eventTitle, memory] of Object.entries(storedMemories)) {
        const nextMemory = { ...memory }
        const nextPhotos = []

        const legacyPhotoSources = [memory?.teamPhoto, memory?.teamPhoto2].filter(isDataPhoto)
        const arrayPhotos = Array.isArray(memory?.photos) ? memory.photos : []

        const normalizedPhotos = []
        for (const entry of arrayPhotos) {
          if (typeof entry === 'string') {
            normalizedPhotos.push({ src: entry, storagePath: null })
          } else if (entry && typeof entry === 'object' && entry.src) {
            normalizedPhotos.push({ src: entry.src, storagePath: entry.storagePath || null })
          }
        }

        const combined = [
          ...legacyPhotoSources.map((src) => ({ src, storagePath: null })),
          ...normalizedPhotos,
        ]

        for (const photo of combined) {
          if (!isDataPhoto(photo.src)) {
            nextPhotos.push(photo)
            continue
          }

          try {
            const blob = await dataUrlToBlob(photo.src)
            const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
            const storagePath = `${memberSlug(eventTitle)}/${fileName}`

            const { error: uploadError } = await supabase.storage.from(supabaseBucket).upload(storagePath, blob, {
              contentType: 'image/jpeg',
              upsert: false,
            })

            if (uploadError) {
              nextPhotos.push(photo)
              continue
            }

            const { data } = supabase.storage.from(supabaseBucket).getPublicUrl(storagePath)
            nextPhotos.push({ src: data.publicUrl, storagePath })
            changed = true
          } catch {
            nextPhotos.push(photo)
          }
        }

        delete nextMemory.teamPhoto
        delete nextMemory.teamPhoto2
        nextMemory.photos = nextPhotos
        migratedMemories[eventTitle] = nextMemory
      }

      if (changed) {
        localStorage.setItem('uploadedMemories', JSON.stringify(migratedMemories))
        localStorage.setItem('memoryLaneMigrationDone', 'true')
        setUploadedMemories(migratedMemories)
        setMigrationStatus('Old photos migrated to Supabase')
        setToast('Old photos migrated to Supabase')
      } else {
        localStorage.setItem('memoryLaneMigrationDone', 'true')
      }
    }

    migrateOldMemoryPhotos()
  }, [])

  const walletProfiles = useMemo(() => teamMembers.filter((member) => member.psWallet), [])

  const onlineCount = teamMembers.filter((member) => member.status !== 'Offline').length
  const activeProjects = projects.slice(0, 4)
  const activeHackathons = hackathonVault.slice(0, 3)
  const portfolioSlug = useMemo(() => {
    if (typeof window === 'undefined') {
      return null
    }

    return new URLSearchParams(window.location.search).get('portfolio')
  }, [])

  const portfolioMember = useMemo(() => {
    if (!portfolioSlug) {
      return null
    }

    return teamMembers.find((member) => memberSlug(member.name) === portfolioSlug) || null
  }, [portfolioSlug])

  const getPortfolioLink = (member) => {
    if (typeof window === 'undefined') {
      return `?portfolio=${memberSlug(member.name)}`
    }

    return `${window.location.origin}${window.location.pathname}?portfolio=${memberSlug(member.name)}`
  }

  const copyPortfolioLink = (member) => {
    if (!navigator.clipboard) {
      setToast('Clipboard is unavailable')
      return
    }

    navigator.clipboard
      .writeText(getPortfolioLink(member))
      .then(() => setToast('Public portfolio link copied'))
      .catch(() => setToast('Unable to copy link'))
  }

  const downloadResumePdf = (member) => {
    const doc = new jsPDF()

    doc.setFontSize(18)
    doc.text(`${member.name} - Resume Snapshot`, 14, 20)

    doc.setFontSize(12)
    doc.text(`Role: ${member.role}`, 14, 32)
    doc.text(`Register No: ${member.registerNo}`, 14, 40)
    doc.text(`College Email: ${member.collegeEmail}`, 14, 48)
    doc.text(`GitHub: ${member.github}`, 14, 56)
    doc.text(`LinkedIn: ${member.linkedin}`, 14, 64)

    const skillsLine = `Skills: ${member.skills.join(', ')}`
    const skillsText = doc.splitTextToSize(skillsLine, 180)
    doc.text(skillsText, 14, 74)

    doc.save(`${memberSlug(member.name)}-resume.pdf`)
    setToast('Resume PDF downloaded')
  }

  const downloadTeamPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

    doc.setFontSize(16)
    doc.text('TenX CODERS - Leaders and Members Directory', 10, 12)
    doc.setFontSize(10)
    doc.text('Team ID: A#100205', 10, 18)

    const headers = ['Name', 'Role', 'Register No', 'College Email', 'Personal Email', 'GitHub']
    const colWidths = [44, 30, 30, 58, 58, 58]
    const startX = 10
    let y = 24

    doc.setFontSize(9)
    doc.setFillColor(28, 32, 45)
    doc.setTextColor(235, 235, 235)

    let x = startX
    headers.forEach((header, idx) => {
      doc.rect(x, y - 5, colWidths[idx], 7, 'F')
      doc.text(header, x + 2, y)
      x += colWidths[idx]
    })

    y += 8
    doc.setTextColor(20, 20, 20)

    teamMembers.forEach((member, rowIndex) => {
      const row = [
        truncateText(member.name, 24),
        truncateText(member.role, 16),
        truncateText(member.registerNo, 16),
        truncateText(member.collegeEmail, 34),
        truncateText(member.personalEmail, 34),
        truncateText(member.github, 34),
      ]

      let colX = startX
      row.forEach((value, idx) => {
        if (rowIndex % 2 === 0) {
          doc.setFillColor(245, 248, 255)
          doc.rect(colX, y - 5, colWidths[idx], 7, 'F')
        }
        doc.text(String(value), colX + 2, y)
        colX += colWidths[idx]
      })

      y += 7
    })

    doc.save('team-nexus-directory.pdf')
    setToast('Team PDF downloaded')
  }

  const renderPublicPortfolio = (member) => (
    <div className="min-h-screen bg-[#0a0a0c] p-4 text-zinc-100 md:p-8">
      <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-[#16161ab8] p-6 backdrop-blur-xl">
        <button
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.location.href = `${window.location.origin}${window.location.pathname}`
            }
          }}
          className="mb-4 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-1.5 text-xs text-zinc-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
        </button>
        <h1 className="font-heading text-2xl text-white">{member.name}</h1>
        <p className="mt-1 text-sm text-zinc-300">{member.role}</p>

        <div className="mt-5 space-y-2 text-sm text-zinc-200">
          <p>Register No: {member.registerNo}</p>
          <p>College Email: {member.collegeEmail}</p>
          <p>
            GitHub: <a className="text-cyan-200" href={member.github}>{member.github}</a>
          </p>
          <p>
            LinkedIn: <a className="text-cyan-200" href={member.linkedin}>{member.linkedin}</a>
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {member.skills.map((skill) => (
            <span key={`${member.name}-${skill}`} className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2 py-1 text-xs text-cyan-200">
              {skill}
            </span>
          ))}
        </div>
      </div>
    </div>
  )

  const handleAddMemoryPhoto = async (eventTitle, file) => {
    if (!file) return

    try {
      const processedFile = await compressImageFile(file)
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
      const storagePath = `${memberSlug(eventTitle)}/${fileName}`

      let src = null
      let uploadedPhoto = null

      if (supabase) {
        const { error: uploadError } = await supabase.storage
          .from(supabaseBucket)
          .upload(storagePath, processedFile, {
            contentType: 'image/jpeg',
            upsert: false,
          })

        if (uploadError) {
          throw uploadError
        }

        const { data } = supabase.storage.from(supabaseBucket).getPublicUrl(storagePath)
        src = data.publicUrl
        uploadedPhoto = { src, storagePath }
      } else {
        const reader = new FileReader()
        src = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result)
          reader.onerror = () => reject(new Error('Unable to read image file'))
          reader.readAsDataURL(processedFile)
        })
        uploadedPhoto = { src, storagePath: null }
      }

      const existingPhotos = uploadedMemories[eventTitle]?.photos || []
      const updated = {
        ...uploadedMemories,
        [eventTitle]: {
          ...uploadedMemories[eventTitle],
          photos: [...existingPhotos, uploadedPhoto],
        },
      }

      setUploadedMemories(updated)
      try {
        localStorage.setItem('uploadedMemories', JSON.stringify(updated))
      } catch {
        setToast('Photo shown now, but storage full. Use smaller image or clear old photos.')
        return
      }
      setToast(`✅ Photo added for ${eventTitle}`)
    } catch {
      setToast('Unable to process image. Try another file.')
    }
  }

  const getEventPhotos = (event) => {
    const eventMemory = uploadedMemories[event.title] || {}
    const defaultPhotos = [event.teamPhoto, event.teamPhoto2]
      .filter(Boolean)
      .map((src, index) => ({ src, kind: 'default', index }))

    const legacyPhotos = ['teamPhoto', 'teamPhoto2']
      .map((key) => eventMemory[key])
      .filter(Boolean)
      .map((src, index) => ({ src, kind: 'legacy', index }))

    const uploadedPhotos = (eventMemory.photos || []).map((photo, index) => ({
      src: typeof photo === 'string' ? photo : photo?.src,
      kind: 'uploaded',
      storagePath: typeof photo === 'string' ? null : photo?.storagePath || null,
      index,
    }))

    return [...defaultPhotos, ...legacyPhotos, ...uploadedPhotos]
  }

  const handleDeleteMemoryPhoto = (eventTitle, photoMeta) => {
    const current = uploadedMemories[eventTitle] || {}
    const updatedEvent = { ...current }

    if (photoMeta.kind === 'uploaded') {
      const photos = [...(updatedEvent.photos || [])]
      photos.splice(photoMeta.index, 1)
      updatedEvent.photos = photos

      if (supabase && photoMeta.storagePath) {
        supabase.storage.from(supabaseBucket).remove([photoMeta.storagePath]).catch(() => null)
      }
    }

    if (photoMeta.kind === 'legacy') {
      if (photoMeta.index === 0) {
        delete updatedEvent.teamPhoto
      }
      if (photoMeta.index === 1) {
        delete updatedEvent.teamPhoto2
      }
    }

    const nextMemories = {
      ...uploadedMemories,
      [eventTitle]: updatedEvent,
    }

    setUploadedMemories(nextMemories)
    try {
      localStorage.setItem('uploadedMemories', JSON.stringify(nextMemories))
    } catch {
      setToast('Unable to update browser storage')
    }
    setToast('Photo deleted')
  }

  const memoryLaneEvents = useMemo(() => [...customEvents, ...hackathonVault], [customEvents])

  const handleAddEvent = () => {
    if (!newEvent.title.trim() || !newEvent.date.trim()) {
      setToast('Event title and date are required')
      return
    }

    const event = {
      title: newEvent.title.trim(),
      date: newEvent.date.trim(),
      description: newEvent.description.trim() || 'Event details will be updated soon.',
      award: newEvent.award.trim() || 'Participation',
    }

    setCustomEvents((prev) => [event, ...prev])
    setNewEvent({ title: '', date: '', description: '', award: '' })
    setShowAddEventForm(false)
    setToast('New event added to Memory Lane')
  }

  const renderOverview = () => (
    <section className="grid gap-4 xl:grid-cols-4">
      <article className="rounded-2xl border border-white/10 bg-[#16161ab8] p-5 backdrop-blur-xl xl:col-span-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-lg text-white">Ongoing Command Snapshot</h2>
          <span className="rounded-full border border-emerald-300/40 bg-emerald-400/15 px-3 py-1 text-xs text-emerald-200">
            Live
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-xs text-zinc-400">Members Online</p>
            <p className="mt-1 text-2xl font-semibold text-cyan-200">{onlineCount}/10</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-xs text-zinc-400">Active Projects</p>
            <p className="mt-1 text-2xl font-semibold text-violet-200">{activeProjects.length}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-xs text-zinc-400">Upcoming Event</p>
            <p className="mt-1 text-lg font-semibold text-emerald-200">TENSOR '26</p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-cyan-300/30 bg-cyan-400/10 p-3">
          <p className="mb-2 inline-flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-cyan-200">
            <Timer className="h-3.5 w-3.5" /> Hackathon Countdown
          </p>
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            {['days', 'hours', 'minutes', 'seconds'].map((key) => (
              <div key={key} className="rounded-lg border border-white/10 bg-black/30 p-2">
                <p className="font-heading text-lg text-white">{timeLeft[key]}</p>
                <p className="uppercase text-[10px] text-zinc-400">{key}</p>
              </div>
            ))}
          </div>
        </div>
      </article>

      <article className="rounded-2xl border border-cyan-300/50 bg-gradient-to-br from-[#16161a] to-[#1a1a1f] p-5 backdrop-blur-xl">
        <p className="text-xs uppercase tracking-widest text-cyan-300">Average CGPA</p>
        <p className="mt-3 text-5xl font-bold text-transparent bg-gradient-to-r from-cyan-300 via-violet-300 to-cyan-300 bg-clip-text">
          8.06
        </p>
        <p className="mt-2 text-sm text-zinc-400">Team Performance Metric</p>
      </article>

      <article className="rounded-2xl border border-white/10 bg-[#16161ab8] p-5 backdrop-blur-xl">
        <h3 className="font-heading text-base text-white">Recent Hackathon Notes</h3>
        <div className="mt-3 space-y-2">
          {activeHackathons.map((item) => (
            <div key={item.title} className="rounded-lg border border-white/10 bg-black/25 p-3">
              <p className="text-sm text-white">{item.title}</p>
              <p className="text-xs text-zinc-400">{item.award}</p>
            </div>
          ))}
        </div>
      </article>
    </section>
  )

  const renderMembers = () => (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {teamMembers.map((member) => (
        <article key={member.name} className="rounded-2xl border border-white/10 bg-[#16161ab8] p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {member.photo && !brokenPhotos[member.name] ? (
                <img
                  src={member.photo}
                  alt={`${member.name} profile`}
                  className="h-9 w-9 rounded-full border border-cyan-300/40 object-cover"
                  onError={() =>
                    setBrokenPhotos((prev) => ({
                      ...prev,
                      [member.name]: true,
                    }))
                  }
                />
              ) : (
                <div className="grid h-9 w-9 place-items-center rounded-full border border-cyan-300/40 bg-cyan-400/10 text-[11px] font-semibold text-cyan-200">
                  {getInitials(member.name)}
                </div>
              )}
              <h3 className="font-heading text-sm text-white">{member.name}</h3>
            </div>
            <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-200">
              {member.status}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-400">{member.role}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {member.skills.slice(0, 2).map((skill) => (
              <span
                key={`${member.name}-${skill}`}
                className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2 py-1 text-[10px] text-cyan-200"
              >
                {skill}
              </span>
            ))}
          </div>

          <div className="mt-3 space-y-2 text-[11px] text-zinc-300">
            <a
              href={`mailto:${member.collegeEmail}`}
              className="block rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 hover:border-cyan-300/40"
            >
              College: {member.collegeEmail}
            </a>
            <div className="grid grid-cols-2 gap-2">
              <a
                href={member.github}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-center hover:border-cyan-300/40"
              >
                GitHub
              </a>
              <a
                href={member.linkedin}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-center hover:border-violet-300/40"
              >
                LinkedIn
              </a>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => downloadResumePdf(member)}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-cyan-300/30 bg-cyan-400/10 px-2.5 py-1.5 text-cyan-200"
              >
                <Download className="h-3.5 w-3.5" /> Resume PDF
              </button>
              <button
                onClick={() => copyPortfolioLink(member)}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-violet-300/30 bg-violet-400/10 px-2.5 py-1.5 text-violet-200"
              >
                <Link2 className="h-3.5 w-3.5" /> Portfolio Link
              </button>
            </div>
            <button
              onClick={() =>
                setShowPrivate((prev) => ({
                  ...prev,
                  [member.name]: !prev[member.name],
                }))
              }
              className="rounded-lg border border-violet-300/30 bg-violet-400/10 px-2.5 py-1.5 text-violet-200"
            >
              {showPrivate[member.name] ? 'Hide Personal Mail' : 'Show Personal Mail'}
            </button>
            {showPrivate[member.name] && (
              <a
                href={`mailto:${member.personalEmail}`}
                className="block rounded-lg border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1.5 text-emerald-200"
              >
                Personal: {member.personalEmail}
              </a>
            )}
          </div>
        </article>
      ))}
    </section>
  )

  const renderDomains = () => (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {domainMatrix.map((domain) => (
        <article key={domain.domain} className="rounded-2xl border border-white/10 bg-[#16161ab8] p-4 backdrop-blur-xl">
          <p className="font-heading text-sm text-white">{domain.domain}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {domain.members.map((member) => (
              <span
                key={`${domain.domain}-${member}`}
                className="rounded-full border border-violet-300/30 bg-violet-400/10 px-2 py-1 text-[10px] text-violet-200"
              >
                {member}
              </span>
            ))}
          </div>
        </article>
      ))}
    </section>
  )

  const renderProjects = () => (
    <section className="rounded-2xl border border-white/10 bg-[#16161ab8] p-5 backdrop-blur-xl">
      <h2 className="font-heading text-lg text-white">Ongoing Projects</h2>
      <div className="mt-3 space-y-3">
        {projects.map((project, index) => (
          <div key={project.title} className="rounded-lg border border-white/10 bg-black/25 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-white">{project.title}</p>
              <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] text-cyan-200">
                Sprint {index + 1}
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-400">{project.tag}</p>
            <p className="mt-1 text-[11px] text-zinc-500">
              {project.stage || 'Roadmap'}
            </p>
          </div>
        ))}
      </div>
    </section>
  )

  const renderPsPointsWallet = () => (
    <section className="space-y-4">
      {walletProfiles.map((member) => {
        const wallet = member.psWallet
        return (
          <article key={member.name} className="rounded-2xl border border-violet-300/30 bg-[#16161ab8] p-5 backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-heading text-lg text-white">{member.name} PS Points Wallet</h2>
              <span className="rounded-full border border-violet-300/40 bg-violet-400/15 px-3 py-1 text-xs text-violet-200">
                {wallet.mode} {wallet.isActive ? '(Active)' : ''}
              </span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/25 p-4">
                <p className="text-xs text-zinc-400">Wallet Points</p>
                <p className="mt-1 text-3xl font-semibold text-violet-200">{wallet.points}</p>
                <p className="mt-2 text-xs text-zinc-400">Mode: {wallet.mode}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 p-4">
                <p className="text-xs text-zinc-400">Group ID</p>
                <p className="mt-1 text-2xl font-semibold text-cyan-200">{wallet.groupId}</p>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-zinc-300">
                  <p>Total Group Points: {wallet.totalGroupPoints}</p>
                  <p>My Contribution: {wallet.myContribution}</p>
                </div>
                <div className="mt-3 h-2 rounded-full bg-zinc-800">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-violet-300 to-cyan-300"
                    style={{ width: `${wallet.contributionShare}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">Contribution Share: {wallet.contributionShare}%</p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-4">
              <p className="text-xs text-zinc-400">Rankings Overview</p>
              <p className="mt-1 text-2xl font-semibold text-white">
                Rank {wallet.overallRank}
                <span className="ml-2 text-sm text-zinc-400">/ {wallet.totalParticipants}</span>
              </p>
              <p className="mt-1 text-xs text-zinc-400">Points: {wallet.points}</p>
            </div>
          </article>
        )
      })}
    </section>
  )

  const renderMemoryLane = () => (
    <section className="space-y-4">
      <div className="mb-6 rounded-2xl border border-cyan-300/50 bg-gradient-to-br from-[#16161a] to-[#1a1a1f] p-6 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-2xl text-transparent bg-gradient-to-r from-cyan-300 via-violet-300 to-cyan-300 bg-clip-text">Memory Lane</h2>
            <p className="mt-2 text-sm text-zinc-400">Hackathon Gallery - Celebrating Team Achievements & Events 📸</p>
            {migrationStatus && <p className="mt-2 text-xs text-emerald-300">{migrationStatus}</p>}
          </div>
          <button
            onClick={() => setShowAddEventForm((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-lg border border-cyan-300/40 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-200"
          >
            <Plus className="h-4 w-4" /> Add Event
          </button>
        </div>

        {showAddEventForm && (
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            <input
              value={newEvent.title}
              onChange={(e) => setNewEvent((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Event Name"
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
            />
            <input
              value={newEvent.date}
              onChange={(e) => setNewEvent((prev) => ({ ...prev, date: e.target.value }))}
              placeholder="Date (e.g., Apr 2026)"
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
            />
            <input
              value={newEvent.description}
              onChange={(e) => setNewEvent((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Description"
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none md:col-span-2"
            />
            <input
              value={newEvent.award}
              onChange={(e) => setNewEvent((prev) => ({ ...prev, award: e.target.value }))}
              placeholder="Achievement / Award"
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none md:col-span-2"
            />
            <button
              onClick={handleAddEvent}
              className="rounded-lg border border-emerald-300/40 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200 md:col-span-2"
            >
              Save Event
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-4">
        {memoryLaneEvents.map((event, index) => {
          const eventPhotos = getEventPhotos(event)
          const photoEntries = eventPhotos
            .map((photo, photoIndex) => ({
              ...photo,
              key: `${event.title}-photo-${photoIndex}`,
              order: photoIndex,
            }))
            .filter((photo) => photo.src && !brokenMemoryImages[photo.key])

          const galleryColsClass =
            photoEntries.length <= 1
              ? 'grid-cols-1'
              : photoEntries.length === 2
                ? 'grid-cols-1 md:grid-cols-2'
                : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
          
          return (
            <article key={event.title} className="rounded-2xl border border-violet-300/30 bg-[#16161ab8] p-5 backdrop-blur-xl overflow-hidden hover:border-violet-300/60 transition-all">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="font-heading text-lg text-white">{event.title}</h3>
                <div className="flex items-center gap-2">
                  <label
                    htmlFor={`add-photo-${memberSlug(event.title)}-${index}`}
                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-cyan-300/40 bg-black/70 text-cyan-200"
                    title="Add Photo"
                  >
                    <Plus className="h-4 w-4" />
                  </label>
                  <input
                    id={`add-photo-${memberSlug(event.title)}-${index}`}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      handleAddMemoryPhoto(event.title, e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                  <span className="rounded-full border border-violet-300/40 bg-violet-400/15 px-2 py-1 text-xs text-violet-200">{event.date}</span>
                </div>
              </div>

              <p className="text-sm text-zinc-300 mb-3">{event.description}</p>

              {photoEntries.length === 0 ? (
                <div className="rounded-lg border border-white/10 bg-black/25 p-8 text-center text-sm text-zinc-500">
                  No photos yet. Add one using +
                </div>
              ) : (
                <div className={`grid gap-3 ${galleryColsClass}`}>
                  {photoEntries.map((photo, photoIndex) => {
                    const key = photo.key
                    const photoMeta = { ...photo, index: photo.index }

                    return (
                      <div key={key} className="relative overflow-hidden rounded-lg border border-white/10 bg-black/25 aspect-[4/3]">
                        {photo.src && !brokenMemoryImages[key] ? (
                          <img
                            src={photo.src}
                            alt={`${event.title} photo ${photoIndex + 1}`}
                            className="h-full w-full object-contain"
                            onError={() => setBrokenMemoryImages((prev) => ({ ...prev, [key]: true }))}
                          />
                        ) : null}
                        {photo.kind !== 'default' && (
                          <button
                            onClick={() => handleDeleteMemoryPhoto(event.title, photoMeta)}
                            className="absolute left-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-rose-300/40 bg-black/70 text-rose-200"
                            title="Delete this photo"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="mt-4 rounded-lg border border-white/10 bg-black/25 p-3">
                <p className="text-xs text-zinc-400">Achievement</p>
                <p className="mt-1 text-sm font-semibold text-yellow-200">{event.award}</p>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )

  const activePanel = {
    Overview: renderOverview(),
    Members: renderMembers(),
    Domains: renderDomains(),
    Projects: renderProjects(),
    'PS Points Wallet': renderPsPointsWallet(),
    'Memory Lane': renderMemoryLane(),
  }[activeTab]

  if (portfolioMember) {
    return renderPublicPortfolio(portfolioMember)
  }

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-zinc-100">
      <div className="mx-auto flex w-full max-w-[1400px] gap-4 p-4 md:p-6">
        <aside className="hidden w-64 shrink-0 rounded-2xl border border-white/10 bg-[#16161ab8] p-4 backdrop-blur-xl md:block">
          <p className="font-heading text-base text-white">TenX CODERS</p>
          <p className="mt-1 text-[11px] tracking-[0.12em] text-zinc-400">A#100205 COMMAND CENTER</p>

          <nav className="mt-5 space-y-2">
            {sidebarTabs.map((tab) => {
              const TabIcon = tab.icon
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition ${
                    activeTab === tab.key
                      ? 'border-cyan-300/40 bg-cyan-400/15 text-cyan-200'
                      : 'border-white/10 bg-black/20 text-zinc-300 hover:border-white/30'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <TabIcon className="h-4 w-4" /> {tab.key}
                  </span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              )
            })}
          </nav>
        </aside>

        <main className="flex-1">
          <header className="mb-4 rounded-2xl border border-white/10 bg-[#16161ab8] p-4 backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="font-heading text-lg text-white md:text-2xl">TenX Coders Live Dashboard</h1>
                <p className="mt-1 text-xs text-zinc-400">Important ongoing team information only</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadTeamPdf}
                  className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200"
                >
                  <Download className="h-3.5 w-3.5" /> Download Team PDF
                </button>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
                  <Activity className="h-3.5 w-3.5" /> Real-time Team View
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 md:hidden">
              {sidebarTabs.map((tab) => {
                const TabIcon = tab.icon
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`rounded-lg border px-2 py-2 text-xs ${
                      activeTab === tab.key
                        ? 'border-cyan-300/40 bg-cyan-400/15 text-cyan-200'
                        : 'border-white/10 bg-black/20 text-zinc-300'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      <TabIcon className="h-3.5 w-3.5" /> {tab.key}
                    </span>
                  </button>
                )
              })}
            </div>
          </header>

          {activePanel}
        </main>
      </div>
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg border border-emerald-300/40 bg-emerald-400/15 px-4 py-2 text-xs text-emerald-100 backdrop-blur-xl">
          {toast}
        </div>
      )}
    </div>
  )
}

export default App
