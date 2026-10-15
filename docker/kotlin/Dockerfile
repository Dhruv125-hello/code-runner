# One-time build for Kotlin (there is no official Kotlin compiler image).
FROM eclipse-temurin:21-jdk
RUN apt-get update && apt-get install -y --no-install-recommends curl unzip ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && curl -fsSL -o /tmp/kotlin.zip https://github.com/JetBrains/kotlin/releases/download/v2.2.20/kotlin-compiler-2.2.20.zip \
 && unzip -q /tmp/kotlin.zip -d /opt && rm /tmp/kotlin.zip
ENV PATH="/opt/kotlinc/bin:${PATH}"
