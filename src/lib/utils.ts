import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) {
    return `${hrs}h ${mins}m ${secs}s`;
  }
  return `${mins}m ${secs}s`;
}

export function generateUUID(): string {
  return crypto.randomUUID();
}

export function getDeviceId(): string {
  let stored = localStorage.getItem('standforge_device_id');
  if (!stored) {
    stored = generateUUID();
    localStorage.setItem('standforge_device_id', stored);
  }
  return stored;
}

export function getUserId(): string {
  let stored = localStorage.getItem('standforge_user_id');
  if (!stored) {
    stored = generateUUID();
    localStorage.setItem('standforge_user_id', stored);
  }
  return stored;
}
