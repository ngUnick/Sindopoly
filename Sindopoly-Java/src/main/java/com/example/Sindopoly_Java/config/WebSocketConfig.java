package com.example.Sindopoly_Java.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.lang.NonNull;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.beans.factory.annotation.Value;
import com.example.Sindopoly_Java.realtime.GameSubscriptionAuthorizationInterceptor;
import org.springframework.web.socket.config.annotation.*;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final GameSubscriptionAuthorizationInterceptor authorization;
    private final String[] allowedOrigins;

    public WebSocketConfig(GameSubscriptionAuthorizationInterceptor authorization,
                           @Value("${sindopoly.web.allowed-origins}") String allowedOrigins) {
        this.authorization = authorization;
        this.allowedOrigins = java.util.Arrays.stream(allowedOrigins.split(","))
                .map(String::trim).filter(value -> !value.isEmpty()).toArray(String[]::new);
    }

    /* broker for messages FROM server → clients */
    @Override
    public void configureMessageBroker(@NonNull MessageBrokerRegistry config) {
        config.enableSimpleBroker("/topic");   // in-memory broker
        config.setApplicationDestinationPrefixes("/app"); // if clients ever send
    }

    /* STOMP handshake endpoint (SockJS fallback for browsers) */
    @Override
    public void registerStompEndpoints(@NonNull StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")            // main endpoint
                .setAllowedOrigins(allowedOrigins)
                .withSockJS();                 // SockJS fallback
    }

    @Override
    public void configureClientInboundChannel(@NonNull ChannelRegistration registration) {
        registration.interceptors(authorization);
    }

    @Override
    public void configureClientOutboundChannel(@NonNull ChannelRegistration registration) {
        registration.interceptors(authorization);
    }
}
