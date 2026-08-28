package com.example.Sindopoly_Java.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.lang.NonNull;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.simp.config.ChannelRegistration;
import com.example.Sindopoly_Java.realtime.GameSubscriptionAuthorizationInterceptor;
import org.springframework.web.socket.config.annotation.*;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final GameSubscriptionAuthorizationInterceptor authorization;
    private final WebOriginPolicy originPolicy;

    public WebSocketConfig(GameSubscriptionAuthorizationInterceptor authorization,
                           WebOriginPolicy originPolicy) {
        this.authorization = authorization;
        this.originPolicy = originPolicy;
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
                .setAllowedOrigins(originPolicy.allowedOriginsArray())
                .withSockJS();                 // SockJS fallback
    }

    @Override
    public void configureWebSocketTransport(@NonNull WebSocketTransportRegistration registration) {
        // Bound unauthenticated handshake/message resource use without changing the event contract.
        registration.setMessageSizeLimit(64 * 1024);
        registration.setSendBufferSizeLimit(512 * 1024);
        registration.setSendTimeLimit(10_000);
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
