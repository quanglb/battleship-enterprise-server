# --- STAGE 1: Build the Application ---
# Use Maven with JDK 21
FROM maven:3.9-eclipse-temurin-21-alpine AS builder

WORKDIR /app

# 1. Copy pom.xml and download dependencies
COPY pom.xml .
RUN mvn dependency:go-offline

# 2. Copy source and build
COPY src ./src
RUN mvn clean package -DskipTests

# --- STAGE 2: Run the Application ---
# Use JRE 21 (Lightweight)
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

# Copy the JAR from the builder stage
COPY --from=builder /app/target/*.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]