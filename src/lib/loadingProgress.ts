type LoadingTask = {
  progress: number;
  label: string;
  completed: boolean;
};

export type LoadingProgressSnapshot = {
  progress: number;
  label: string;
  active: number;
};

const tasks = new Map<string, LoadingTask>();
const listeners = new Set<() => void>();
let snapshot: LoadingProgressSnapshot = { progress: 0, label: "Menyiapkan halaman", active: 0 };
let autoProgressTimer: number | null = null;

function manageAutoProgress() {
  const values = Array.from(tasks.values());
  const active = values.filter((task) => !task.completed);
  
  if (active.length > 0 && !autoProgressTimer) {
    autoProgressTimer = window.setInterval(() => {
      let changed = false;
      tasks.forEach((task) => {
        if (!task.completed && task.progress < 99) {
          const increment = Math.max(1, Math.floor((100 - task.progress) / 25));
          task.progress += increment;
          changed = true;
        }
      });
      if (changed) publish();
    }, 400);
  } else if (active.length === 0 && autoProgressTimer) {
    window.clearInterval(autoProgressTimer);
    autoProgressTimer = null;
  }
}

function publish() {
  const values = Array.from(tasks.values());
  const active = values.filter((task) => !task.completed);
  const source = active.length ? active : values;
  const progress = source.length
    ? Math.round(source.reduce((total, task) => total + task.progress, 0) / source.length)
    : 0;
  const label = (active[active.length - 1] || values[values.length - 1])?.label || "Menyiapkan halaman";
  snapshot = { progress: Math.max(0, Math.min(100, progress)), label, active: active.length };
  listeners.forEach((listener) => listener());
  manageAutoProgress();
}

export function beginLoadingTask(id: string, label = "Mengambil data") {
  // Hasil 100% dari navigasi sebelumnya tidak ikut menghitung pekerjaan baru.
  for (const [key, task] of tasks) if (task.completed) tasks.delete(key);
  tasks.set(id, { progress: 5, label, completed: false });
  publish();
}

export function updateLoadingTask(id: string, progress: number, label?: string) {
  const current = tasks.get(id);
  if (!current) return;
  current.progress = Math.max(current.progress, Math.min(99, Math.round(progress)));
  if (label) current.label = label;
  publish();
}

export function completeLoadingTask(id: string, label = "Data siap") {
  const current = tasks.get(id);
  if (!current) return;
  current.progress = 100;
  current.label = label;
  current.completed = true;
  publish();
  window.setTimeout(() => {
    const task = tasks.get(id);
    if (task?.completed) {
      tasks.delete(id);
      publish();
    }
  }, 900);
}

export function failLoadingTask(id: string) {
  tasks.delete(id);
  publish();
}

export function subscribeLoadingProgress(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLoadingProgressSnapshot() {
  return snapshot;
}
