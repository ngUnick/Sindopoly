package com.example.Sindopoly_Java.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.net.URI;

/** Fails production startup when required secrets, TLS, or HTTPS browser origins are unsafe. */
@Component
@Profile("prod")
final class ProductionDeploymentGuard {

    ProductionDeploymentGuard(
            WebOriginPolicy originPolicy,
            @Value("${spring.datasource.url}") String databaseUrl,
            @Value("${spring.datasource.username}") String databaseUsername,
            @Value("${spring.datasource.password}") String databasePassword,
            @Value("${spring.data.redis.host}") String redisHost,
            @Value("${spring.data.redis.password}") String redisPassword,
            @Value("${spring.data.redis.ssl.enabled}") boolean redisTlsEnabled) {
        requireValue(databaseUrl, "Production database URL");
        requireValue(databaseUsername, "Production database username");
        requireValue(databasePassword, "Production database password");
        requireValue(redisHost, "Production Redis host");
        requireValue(redisPassword, "Production Redis password");
        if (!redisTlsEnabled) {
            throw new IllegalStateException("Production Redis TLS must be enabled");
        }
        if (originPolicy.allowedOrigins().stream()
                .map(URI::create)
                .anyMatch(origin -> !"https".equalsIgnoreCase(origin.getScheme()))) {
            throw new IllegalStateException("Production browser origins must use HTTPS");
        }
    }

    private static void requireValue(String value, String description) {
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(description + " is required");
        }
    }
}
