package com.example.Sindopoly_Java.realtime;

import com.example.Sindopoly_Java.security.AuthenticatedPlayerResolver;
import com.example.Sindopoly_Java.security.GameAuthorizationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.junit.jupiter.api.Assertions.assertNull;

class GameSubscriptionAuthorizationInterceptorTest {
    private final AuthenticatedPlayerResolver players = mock(AuthenticatedPlayerResolver.class);
    private final GameAuthorizationService games = mock(GameAuthorizationService.class);
    private final Authentication authentication = mock(Authentication.class);
    private GameSubscriptionAuthorizationInterceptor interceptor;

    @BeforeEach
    void setUp() {
        interceptor = new GameSubscriptionAuthorizationInterceptor(players, games);
        when(players.requirePlayerId(authentication)).thenReturn(8);
    }

    @Test
    void authenticatedConnectAndMemberSubscriptionAreAllowed() {
        interceptor.preSend(message(StompCommand.CONNECT, null, authentication), mock(org.springframework.messaging.MessageChannel.class));
        interceptor.preSend(message(StompCommand.SUBSCRIBE, "/topic/game/7", authentication), mock(org.springframework.messaging.MessageChannel.class));
        verify(games).requireMember(7, 8);
    }

    @Test
    void anonymousConnectAndUnboundedDestinationsAreRejected() {
        assertThrows(AccessDeniedException.class, () -> interceptor.preSend(
                message(StompCommand.CONNECT, null, null), mock(org.springframework.messaging.MessageChannel.class)));
        for (String destination : new String[] {null, "/topic/game/0", "/topic/game/-1", "/topic/game/not-a-number",
                "/topic/game/7/private", "/topic/game-private/7"}) {
            assertThrows(AccessDeniedException.class, () -> interceptor.preSend(
                    message(StompCommand.SUBSCRIBE, destination, authentication),
                    mock(org.springframework.messaging.MessageChannel.class)));
        }
    }

    @Test
    void inboundApplicationSendIsRejected() {
        assertThrows(AccessDeniedException.class, () -> interceptor.preSend(
                message(StompCommand.SEND, "/app/game/7", authentication), mock(org.springframework.messaging.MessageChannel.class)));
    }

    @Test
    void notificationIsDroppedWhenMembershipWasRevokedAfterSubscribe() {
        when(games.requireMember(7, 8)).thenThrow(new AccessDeniedException("revoked"));
        assertNull(interceptor.preSend(outboundMessage("/topic/game/7", authentication),
                mock(org.springframework.messaging.MessageChannel.class)));
    }

    private Message<byte[]> message(StompCommand command, String destination, Authentication actor) {
        StompHeaderAccessor headers = StompHeaderAccessor.create(command);
        if (destination != null) headers.setDestination(destination);
        if (actor != null) headers.setUser(actor);
        headers.setLeaveMutable(true);
        return MessageBuilder.createMessage(new byte[0], headers.getMessageHeaders());
    }

    private Message<byte[]> outboundMessage(String destination, Authentication actor) {
        SimpMessageHeaderAccessor headers = SimpMessageHeaderAccessor.create(SimpMessageType.MESSAGE);
        headers.setDestination(destination);
        headers.setUser(actor);
        headers.setLeaveMutable(true);
        return MessageBuilder.createMessage(new byte[0], headers.getMessageHeaders());
    }
}
