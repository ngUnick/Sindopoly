package com.example.Sindopoly_Java.security;

import java.io.Serializable;

/**
 * Server-owned identity stored in Spring Security's HTTP session context.
 */
public record PlayerPrincipal(int playerId) implements Serializable {
}
