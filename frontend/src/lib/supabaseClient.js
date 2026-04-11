import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseBucket = import.meta.env.VITE_SUPABASE_BUCKET || 'memory-lane'
export const supabaseAchievementsTable = import.meta.env.VITE_SUPABASE_ACHIEVEMENTS_TABLE || 'memory_lane_achievements'

export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null