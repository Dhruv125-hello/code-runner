# Code Runner

A beginner-friendly online compiler. Pick a language, type your program, click **Run**,
and type input right in the output panel, just like a real terminal.

**Languages:** Python, JavaScript, C, C++, Java, C#, Go, Rust, PHP, Ruby, Kotlin, TypeScript

## Features
- One output panel for every language, with live typing for `input()`, `scanf`, `Scanner` and more
- Monaco editor (the engine of VS Code) with syntax colors
- Python and JavaScript run in your browser, with no server needed
- Other languages run in sealed Docker containers: no internet, limited CPU and memory, time limit
- Friendly messages when Docker or the backend is not running
- Your code is saved per language in your browser

## How it works
```
Browser (React + Monaco)
  |-- Python / JavaScript -> Web Worker (Pyodide for Python)
  `-- other languages -> WebSocket -> Node.js backend -> one Docker container per run
```

## Run it on your computer
1. Install [Node.js](https://nodejs.org) (LTS) and [Docker Desktop](https://www.docker.com/products/docker-desktop/).
2. Open Docker Desktop and wait for **Engine running**.
3. In this folder:
   ```
   npm install
   npm run setup    # one-time download of language tools (several GB)
   npm start
   ```
4. Open http://localhost:5173

`npm run setup -- c java` downloads only some languages.

## Project layout
| Path | Purpose |
|---|---|
| `src/App.jsx` | The page: editor, language picker, output panel |
| `server/index.js` | Backend: WebSocket, Docker runs, health check |
| `server/languages.js` | How each language is compiled and run |
| `server/setup.js` | One-time language download |
| `docker/kotlin/` | Dockerfile for the Kotlin image |

## Security notes
Each run uses a fresh container with `--network none`, memory and CPU limits, a read-only
file system, dropped capabilities and a time limit. See [SECURITY.md](SECURITY.md) before
running this on a public server.

## Contributing
Issues and pull requests are welcome. Ideas: more languages, saved programs, share links, dark/light theme.

## License
[MIT](LICENSE)
