import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = 'https://nxvolkdathhvnwesywwz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54dm9sa2RhdGhodm53ZXN5d3d6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4MjQwNTUsImV4cCI6MjA4NzQwMDA1NX0.kFev2wfwziGLyPRaj8qA06bh16ULezltFj-ms2G_7SQ';

export const supabase = createClient(supabaseUrl, supabaseKey);
