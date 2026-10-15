// Every language runs inside its own throw-away Docker container.
// `cmd` runs in a writable copy of the program folder (/tmp/w).

const CSPROJ = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>disable</Nullable>
    <UseAppHost>false</UseAppHost>
    <InvariantGlobalization>true</InvariantGlobalization>
  </PropertyGroup>
</Project>
`

export const KOTLIN_IMAGE = 'code-runner-kotlin'

export const LANGS = {
  c: {
    image: 'gcc:14',
    files: (code) => ({ 'main.c': code }),
    // stdbuf makes printf show up immediately, before scanf waits for input
    cmd: 'gcc -o main main.c -lm && stdbuf -o0 ./main',
  },
  cpp: {
    image: 'gcc:14',
    files: (code) => ({ 'main.cpp': code }),
    cmd: 'g++ -o main main.cpp && stdbuf -o0 ./main',
  },
  java: {
    image: 'eclipse-temurin:21-jdk',
    mem: '768m',
    // source-file mode: the class can have any name
    files: (code) => ({ 'Main.java': code }),
    cmd: 'java Main.java',
  },
  csharp: {
    image: 'mcr.microsoft.com/dotnet/sdk:8.0',
    mem: '1024m',
    files: (code) => ({ 'Program.cs': code, 'Program.csproj': CSPROJ }),
    cmd: `( D=$(ls -d /usr/share/dotnet/shared/Microsoft.NETCore.App/*/ | head -n1); V=$(basename "$D"); S=$(ls -d /usr/share/dotnet/sdk/*/ | head -n1); R=$(for f in "$D"*.dll; do printf -- "-r:%s " "$f"; done); dotnet "$S"Roslyn/bincore/csc.dll -nologo -out:main.dll -target:exe $R Program.cs && printf '{"runtimeOptions":{"tfm":"net8.0","framework":{"name":"Microsoft.NETCore.App","version":"%s"}}}' "$V" > main.runtimeconfig.json && dotnet main.dll )`,
  },
  go: {
    image: 'golang:1.23',
    files: (code) => ({ 'main.go': code }),
    cmd: 'go run main.go',
  },
  rust: {
    image: 'rust:1-slim',
    files: (code) => ({ 'main.rs': code }),
    cmd: 'rustc main.rs -o main && ./main',
  },
  php: {
    image: 'php:8.3-cli',
    files: (code) => ({ 'main.php': code }),
    cmd: 'php main.php',
  },
  ruby: {
    image: 'ruby:3.3-slim',
    files: (code) => ({ 'main.rb': code }),
    cmd: `ruby -e '$stdout.sync = true; load "main.rb"'`,
  },
  kotlin: {
    image: KOTLIN_IMAGE,
    mem: '1536m',
    files: (code) => ({ 'main.kt': code }),
    cmd: 'kotlinc main.kt -nowarn -include-runtime -d main.jar && java -jar main.jar',
  },
  typescript: {
    image: 'node:24-slim',
    files: (code) => ({ 'main.ts': code }),
    cmd: 'node --no-warnings main.ts',
  },
}

export const ENV = {
  HOME: '/tmp',
  GOCACHE: '/tmp/gocache',
  GOTOOLCHAIN: 'local',
  DOTNET_CLI_HOME: '/tmp',
  DOTNET_CLI_TELEMETRY_OPTOUT: '1',
  DOTNET_NOLOGO: '1',
  DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1',
  NUGET_MIGRATIONS: 'false',
}
