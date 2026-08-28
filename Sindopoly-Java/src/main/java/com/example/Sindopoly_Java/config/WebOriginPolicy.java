package com.example.Sindopoly_Java.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.util.Arrays;
import java.util.List;

/**
 * Parses the single browser-origin allow-list shared by HTTP CORS and WebSocket handshakes.
 * Invalid, empty, or wildcard entries fail startup instead of widening deployment access.
 */
@Component
public final class WebOriginPolicy {

    private final List<String> allowedOrigins;

    public WebOriginPolicy(@Value("${sindopoly.web.allowed-origins}") String configuredOrigins) {
        this.allowedOrigins = parse(configuredOrigins);
    }

    public List<String> allowedOrigins() {
        return allowedOrigins;
    }

    public String[] allowedOriginsArray() {
        return allowedOrigins.toArray(String[]::new);
    }

    static List<String> parse(String configuredOrigins) {
        if (configuredOrigins == null || configuredOrigins.isBlank()) {
            throw new IllegalStateException("At least one allowed browser origin is required");
        }

        List<String> origins = Arrays.stream(configuredOrigins.split(",", -1))
                .map(String::trim)
                .map(WebOriginPolicy::validateOrigin)
                .distinct()
                .toList();
        if (origins.isEmpty()) {
            throw new IllegalStateException("At least one allowed browser origin is required");
        }
        return origins;
    }

    private static String validateOrigin(String value) {
        if (value.isEmpty() || value.contains("*")) {
            throw new IllegalStateException("Allowed browser origins must be explicit HTTP(S) origins");
        }

        URI origin;
        try {
            origin = URI.create(value);
        } catch (IllegalArgumentException exception) {
            throw new IllegalStateException("Allowed browser origin is not a valid URI", exception);
        }

        boolean validScheme = "http".equalsIgnoreCase(origin.getScheme())
                || "https".equalsIgnoreCase(origin.getScheme());
        boolean originOnly = origin.getHost() != null
                && origin.getPort() <= 65_535
                && origin.getUserInfo() == null
                && (origin.getPath() == null || origin.getPath().isEmpty())
                && origin.getQuery() == null
                && origin.getFragment() == null;
        if (!validScheme || !originOnly) {
            throw new IllegalStateException("Allowed browser origins must be explicit HTTP(S) origins");
        }
        return value;
    }
}
