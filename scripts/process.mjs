import { spawn, spawnSync } from 'node:child_process'

export function runProcess(
  command,
  args,
  { cwd, env = process.env, timeoutMs = 120000, capture = false, ownGroup = true } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      windowsHide: true,
      detached: process.platform !== 'win32' && ownGroup,
    })
    let stderr = ''
    let timeoutError
    child.stderr?.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-65536)
    })
    child.stdout?.on('data', (chunk) => {
      if (!capture) process.stdout.write(chunk)
    })
    const terminate = () => {
      if (!child.pid || child.exitCode !== null) return
      if (process.platform === 'win32')
        spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        })
      else {
        try {
          if (ownGroup) process.kill(-child.pid, 'SIGKILL')
          else child.kill('SIGKILL')
        } catch {}
      }
    }
    const interrupt = () => {
      timeoutError = new Error('验证被中断')
      terminate()
    }
    process.once('SIGINT', interrupt)
    process.once('SIGTERM', interrupt)
    const timeout = setTimeout(() => {
      timeoutError = new Error('本轮进程超时：' + timeoutMs + ' ms')
      terminate()
    }, timeoutMs)
    const cleanup = () => {
      clearTimeout(timeout)
      process.off('SIGINT', interrupt)
      process.off('SIGTERM', interrupt)
    }
    child.once('error', (error) => {
      cleanup()
      reject(error)
    })
    child.once('close', (code) => {
      cleanup()
      if (timeoutError) {
        if (stderr) timeoutError.message += '\n' + stderr
        reject(timeoutError)
      } else if (code !== 0) reject(new Error('进程退出码 ' + code + ': ' + stderr))
      else resolve({ code, stderr })
    })
  })
}
