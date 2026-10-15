import { useState, useRef, useEffect } from 'react'
import Editor from '@monaco-editor/react'

const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/'
const INPUT_BYTES = 65536

// kind: 'python' and 'js' run inside your browser, 'server' runs in a Docker container
const LANGUAGES = {
  python: { label: 'Python', monaco: 'python', kind: 'python', starter: 'num1 = int(input("Enter num1: "))\nnum2 = int(input("Enter num2: "))\n\ntotal = num1 + num2\nprint("Sum =", total)\n' },
  javascript: { label: 'JavaScript', monaco: 'javascript', kind: 'js', starter: 'let a = Number(prompt("Enter num1:"));\nlet b = Number(prompt("Enter num2:"));\nconsole.log("Sum = " + (a + b));\n' },
  c: { label: 'C', monaco: 'c', kind: 'server', starter: '#include <stdio.h>\n\nint main() {\n    int a, b;\n    printf("Enter num1: ");\n    scanf("%d", &a);\n    printf("Enter num2: ");\n    scanf("%d", &b);\n    printf("Sum = %d\\n", a + b);\n    return 0;\n}\n' },
  cpp: { label: 'C++', monaco: 'cpp', kind: 'server', starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    cout << "Enter num1: ";\n    cin >> a;\n    cout << "Enter num2: ";\n    cin >> b;\n    cout << "Sum = " << a + b << endl;\n    return 0;\n}\n' },
  java: { label: 'Java', monaco: 'java', kind: 'server', starter: 'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        System.out.print("Enter num1: ");\n        int a = sc.nextInt();\n        System.out.print("Enter num2: ");\n        int b = sc.nextInt();\n        System.out.println("Sum = " + (a + b));\n    }\n}\n' },
  csharp: { label: 'C#', monaco: 'csharp', kind: 'server', starter: 'using System;\n\nclass Program {\n    static void Main() {\n        Console.Write("Enter num1: ");\n        int a = int.Parse(Console.ReadLine());\n        Console.Write("Enter num2: ");\n        int b = int.Parse(Console.ReadLine());\n        Console.WriteLine($"Sum = {a + b}");\n    }\n}\n' },
  go: { label: 'Go', monaco: 'go', kind: 'server', starter: 'package main\n\nimport "fmt"\n\nfunc main() {\n    var a, b int\n    fmt.Print("Enter num1: ")\n    fmt.Scan(&a)\n    fmt.Print("Enter num2: ")\n    fmt.Scan(&b)\n    fmt.Println("Sum =", a+b)\n}\n' },
  rust: { label: 'Rust', monaco: 'rust', kind: 'server', starter: 'use std::io::{self, Write};\n\nfn read_number(prompt: &str) -> i32 {\n    print!("{}", prompt);\n    io::stdout().flush().unwrap();\n    let mut line = String::new();\n    io::stdin().read_line(&mut line).unwrap();\n    line.trim().parse().unwrap()\n}\n\nfn main() {\n    let a = read_number("Enter num1: ");\n    let b = read_number("Enter num2: ");\n    println!("Sum = {}", a + b);\n}\n' },
  php: { label: 'PHP', monaco: 'php', kind: 'server', starter: '<?php\necho "Enter num1: ";\n$a = (int) trim(fgets(STDIN));\necho "Enter num2: ";\n$b = (int) trim(fgets(STDIN));\necho "Sum = " . ($a + $b) . "\\n";\n' },
  ruby: { label: 'Ruby', monaco: 'ruby', kind: 'server', starter: 'print "Enter num1: "\na = gets.to_i\nprint "Enter num2: "\nb = gets.to_i\nputs "Sum = #{a + b}"\n' },
  kotlin: { label: 'Kotlin', monaco: 'kotlin', kind: 'server', starter: 'fun main() {\n    print("Enter num1: ")\n    val a = readln().toInt()\n    print("Enter num2: ")\n    val b = readln().toInt()\n    println("Sum = ${a + b}")\n}\n' },
  typescript: { label: 'TypeScript', monaco: 'typescript', kind: 'server', starter: 'import readline from "node:readline";\n\nconst rl = readline.createInterface({ input: process.stdin, output: process.stdout });\n\nrl.question("Enter num1: ", (x: string) => {\n  rl.question("Enter num2: ", (y: string) => {\n    console.log("Sum = " + (Number(x) + Number(y)));\n    rl.close();\n  });\n});\n' },
}

// ---------- Python / JavaScript run in a Web Worker that can pause for input ----------
const SHARED = `
let ctrl, data;
const dec = new TextDecoder();
const readLine = () => {
  Atomics.store(ctrl, 0, 0);
  postMessage({ type: 'need-input' });
  Atomics.wait(ctrl, 0, 0);
  const n = ctrl[1];
  return dec.decode(data.slice(0, n));
};
`

const JS_WORKER = `${SHARED}
const out = (t) => postMessage({ type: 'out', text: t });
const fmt = (a) => a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ');
console.log = (...a) => out(fmt(a) + '\\n');
console.info = console.log;
console.warn = console.log;
console.error = console.log;
self.alert = (m) => out(String(m) + '\\n');
self.prompt = (m) => { if (m !== undefined) out(String(m) + ' '); return readLine(); };
onmessage = (e) => {
  ctrl = new Int32Array(e.data.sab, 0, 2);
  data = new Uint8Array(e.data.sab, 8);
  try { (0, eval)(e.data.code); } catch (err) { out(String(err) + '\\n'); }
  postMessage({ type: 'done' });
};
`

const PY_WORKER = `${SHARED}
importScripts('${PYODIDE_URL}pyodide.js');
const out = (t) => postMessage({ type: 'out', text: t });
const outDec = new TextDecoder();
onmessage = async (e) => {
  ctrl = new Int32Array(e.data.sab, 0, 2);
  data = new Uint8Array(e.data.sab, 8);
  const py = await loadPyodide({ indexURL: '${PYODIDE_URL}' });
  postMessage({ type: 'ready' });
  const write = (b) => { out(outDec.decode(b, { stream: true })); return b.length; };
  py.setStdout({ write });
  py.setStderr({ write });
  py.setStdin({ stdin: () => readLine() + '\\n' });
  try { py.runPython(e.data.code); } catch (err) { out(String(err.message || err) + '\\n'); }
  postMessage({ type: 'done' });
};
`

const store = {
  get(key) { try { return localStorage.getItem(key) } catch { return null } },
  set(key, value) { try { localStorage.setItem(key, value) } catch { /* ignore */ } },
}

function App() {
  const [langKey, setLangKey] = useState(() => (LANGUAGES[store.get('cr-lang')] ? store.get('cr-lang') : 'python'))
  const [codes, setCodes] = useState(() =>
    Object.fromEntries(Object.entries(LANGUAGES).map(([k, v]) => [k, store.get('cr-code-' + k) ?? v.starter]))
  )
  const [output, setOutput] = useState('')
  const [running, setRunning] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [typed, setTyped] = useState('')
  const [health, setHealth] = useState({ server: null, docker: null })

  const workerRef = useRef(null)
  const wsRef = useRef(null)
  const sabRef = useRef(null)
  const termRef = useRef(null)

  const lang = LANGUAGES[langKey]
  const code = codes[langKey]
  const isServer = lang.kind === 'server'
  const showInput = isServer ? running : waiting

  useEffect(() => { store.set('cr-lang', langKey) }, [langKey])

  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight
  }, [output, showInput])

  // Check every few seconds whether the backend and Docker are ready
  useEffect(() => {
    let stop = false
    const check = async () => {
      try {
        const r = await fetch('/api/health')
        const j = await r.json()
        if (!stop) setHealth({ server: true, docker: j.docker })
      } catch {
        if (!stop) setHealth({ server: false, docker: null })
      }
    }
    check()
    const id = setInterval(check, 4000)
    return () => { stop = true; clearInterval(id) }
  }, [])

  useEffect(() => () => {
    workerRef.current?.terminate()
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close() }
  }, [])

  const finish = (note) => {
    workerRef.current?.terminate()
    workerRef.current = null
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.onerror = null
      wsRef.current.close()
      wsRef.current = null
    }
    setWaiting(false)
    setRunning(false)
    if (note) setOutput((p) => p + note)
  }

  // ---------- Python / JavaScript ----------
  const runInBrowser = () => {
    if (!window.crossOriginIsolated) {
      setOutput('Python and JavaScript need a special browser mode that is not on yet.\nStop the app (Ctrl + C in the terminal), run "npm start" again, then press Ctrl + Shift + R on this page.')
      setRunning(false)
      return
    }
    sabRef.current = new SharedArrayBuffer(8 + INPUT_BYTES)
    const src = lang.kind === 'python' ? PY_WORKER : JS_WORKER
    const blob = new Blob([src], { type: 'application/javascript' })
    const worker = new Worker(URL.createObjectURL(blob))
    workerRef.current = worker

    if (lang.kind === 'python') setOutput('Loading Python (first time takes a few seconds)...\n')

    worker.onmessage = (e) => {
      const m = e.data
      if (m.type === 'ready') setOutput('')
      else if (m.type === 'out') setOutput((p) => p + m.text)
      else if (m.type === 'need-input') setWaiting(true)
      else if (m.type === 'done') finish('\n--- Program finished ---\n')
    }
    worker.onerror = (e) => finish('\nError: ' + e.message + '\n')
    worker.postMessage({ code, sab: sabRef.current })
  }

  // ---------- Everything else: Docker backend ----------
  const runOnServer = () => {
    let opened = false
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      opened = true
      ws.send(JSON.stringify({ type: 'run', lang: langKey, code }))
    }
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data)
      if (m.type === 'out') setOutput((p) => p + m.text)
      else if (m.type === 'done') finish('\n--- Program finished ---\n')
    }
    ws.onerror = () => {
      if (!opened) finish('The backend is not running.\nIn the terminal, run:  npm start\nThen click Run again.')
    }
    ws.onclose = () => {
      if (opened) finish('\n--- Connection lost ---\n')
    }
  }

  const submitInput = () => {
    if (isServer) {
      wsRef.current?.send(JSON.stringify({ type: 'input', text: typed }))
      setOutput((p) => p + typed + '\n')
      setTyped('')
      return
    }
    const ctrl = new Int32Array(sabRef.current, 0, 2)
    const data = new Uint8Array(sabRef.current, 8)
    const bytes = new TextEncoder().encode(typed).subarray(0, INPUT_BYTES)
    data.set(bytes)
    ctrl[1] = bytes.length
    setOutput((p) => p + typed + '\n')
    setTyped('')
    setWaiting(false)
    Atomics.store(ctrl, 0, 1)
    Atomics.notify(ctrl, 0)
  }

  const runCode = () => {
    setOutput('')
    setTyped('')
    setWaiting(false)
    setRunning(true)
    if (isServer) runOnServer()
    else runInBrowser()
  }

  const stopCode = () => {
    wsRef.current?.send(JSON.stringify({ type: 'stop' }))
    finish('\n--- Stopped ---\n')
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter') submitInput()
    else if (e.key === 'd' && e.ctrlKey && isServer) {
      e.preventDefault()
      wsRef.current?.send(JSON.stringify({ type: 'eof' }))
    }
  }

  // ---------- Friendly status banner (only for languages that need the backend) ----------
  let banner = null
  if (isServer && health.server === false) {
    banner = 'The backend is not running. In your terminal, run:  npm start'
  } else if (isServer && health.docker === 'stopped') {
    banner = 'Docker is not running. Open "Docker Desktop" and wait until it says "Engine running".'
  } else if (isServer && health.docker === 'missing') {
    banner = 'Docker is not installed. Run:  winget install -e --id Docker.DockerDesktop  then restart your PC.'
  }

  return (
    <div className="h-full bg-gray-900 text-white flex flex-col">
      <header className="flex items-center justify-between px-6 py-3 border-b border-gray-700">
        <h1 className="text-xl font-bold text-green-400">Code Runner</h1>
        <div className="flex items-center gap-3">
          <select
            value={langKey}
            onChange={(e) => setLangKey(e.target.value)}
            disabled={running}
            className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5"
          >
            {Object.entries(LANGUAGES).map(([key, l]) => (
              <option key={key} value={key}>{l.label}</option>
            ))}
          </select>
          {running ? (
            <button onClick={stopCode} className="bg-red-500 hover:bg-red-600 text-white font-semibold px-5 py-1.5 rounded">
              Stop
            </button>
          ) : (
            <button onClick={runCode} className="bg-green-500 hover:bg-green-600 text-black font-semibold px-5 py-1.5 rounded">
              Run
            </button>
          )}
        </div>
      </header>

      {banner && (
        <div className="px-6 py-2 text-sm bg-yellow-900/60 text-yellow-100 border-b border-yellow-700">{banner}</div>
      )}

      <main className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2">
        <Editor
          height="100%"
          language={lang.monaco}
          theme="vs-dark"
          value={code}
          onChange={(value) => {
            const v = value ?? ''
            setCodes((prev) => ({ ...prev, [langKey]: v }))
            store.set('cr-code-' + langKey, v)
          }}
          options={{ fontSize: 16, minimap: { enabled: false }, automaticLayout: true }}
        />
        <div className="flex flex-col min-h-0 border-l border-gray-700">
          <div className="flex items-center justify-between px-4 py-1 text-xs text-gray-400 bg-gray-800">
            <span>Output</span>
            <button onClick={() => setOutput('')} disabled={running} className="hover:text-white disabled:opacity-40">Clear</button>
          </div>
          <div
            ref={termRef}
            onClick={() => document.getElementById('term-input')?.focus()}
            className="flex-1 min-h-0 p-4 font-mono text-sm bg-black overflow-auto whitespace-pre-wrap break-words"
          >
            {output}
            {showInput && (
              <input
                id="term-input"
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={onKeyDown}
                className="bg-transparent outline-none text-green-300 caret-green-300 font-mono w-48"
              />
            )}
            {!output && !showInput && (
              <span className="text-gray-500">
                {running ? (isServer ? 'Compiling and starting...' : 'Starting...') : 'Click Run to start your program. Type input right here when it asks.'}
              </span>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
