# 1) Build stage
FROM maven:3.8.4-openjdk-17-slim AS builder
WORKDIR /app

# Copy only pom, download deps
COPY pom.xml ./
RUN mvn dependency:go-offline -B

# Copy source & compile
COPY src ./src
RUN mvn package -DskipTests -B

# 2) Run stage
FROM openjdk:17-jdk-slim
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar
ENTRYPOINT ["java","-jar","/app/app.jar"]
