package com.example.Sindopoly_Java.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.*;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    /* broker for messages FROM server → clients */
    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        config.enableSimpleBroker("/topic");   // in-memory broker
        config.setApplicationDestinationPrefixes("/app"); // if clients ever send
    }

    /* STOMP handshake endpoint (SockJS fallback for browsers) */
    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")            // main endpoint
                .setAllowedOrigins("*")        // adjust for prod
                .withSockJS();                 // SockJS fallback
    }
}
