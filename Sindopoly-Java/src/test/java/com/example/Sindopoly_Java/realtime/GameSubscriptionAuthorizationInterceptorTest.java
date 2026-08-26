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
import static org.junit.jupiter.api.Assertions.assertSame;
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
        interceptor.preSend(subscriptionMessage(StompCommand.SUBSCRIBE, "/topic/game/7", authentication, "session-1", "sub-1"),
                mock(org.springframework.messaging.MessageChannel.class));
        verify(games).requireMember(7, 8);
    }

    @Test
    void anonymousConnectAndUnboundedDestinationsAreRejected() {
        assertThrows(AccessDeniedException.class, () -> interceptor.preSend(
                message(StompCommand.CONNECT, null, null), mock(org.springframework.messaging.MessageChannel.class)));
        for (String destination : new String[] {null, "/topic/game/0", "/topic/game/-1", "/topic/game/not-a-number",
                "/topic/game/7/private", "/topic/game-private/7"}) {
            assertThrows(AccessDeniedException.class, () -> interceptor.preSend(
                    subscriptionMessage(StompCommand.SUBSCRIBE, destination, authentication, "session-1", "sub-1"),
                    mock(org.springframework.messaging.MessageChannel.class)));
        }
    }

    @Test
    void inboundApplicationSendIsRejected() {
        assertThrows(AccessDeniedException.class, () -> interceptor.preSend(
                message(StompCommand.SEND, "/app/game/7", authentication), mock(org.springframework.messaging.MessageChannel.class)));
    }

    @Test
    void notificationUsesAuthorizedSubscriptionWhenBrokerOmitsPrincipal() {
        interceptor.preSend(subscriptionMessage(StompCommand.SUBSCRIBE, "/topic/game/7", authentication,
                "session-1", "sub-1"), mock(org.springframework.messaging.MessageChannel.class));
        Message<byte[]> outbound = outboundMessage("/topic/game/7", "session-1", "sub-1");

        assertSame(outbound, interceptor.preSend(outbound, mock(org.springframework.messaging.MessageChannel.class)));
        verify(games, org.mockito.Mockito.times(2)).requireMember(7, 8);
    }

    @Test
    void notificationIsDroppedWhenMembershipWasRevokedAfterSubscribe() {
        interceptor.preSend(subscriptionMessage(StompCommand.SUBSCRIBE, "/topic/game/7", authentication,
                "session-1", "sub-1"), mock(org.springframework.messaging.MessageChannel.class));
        when(games.requireMember(7, 8)).thenThrow(new AccessDeniedException("revoked"));
        assertNull(interceptor.preSend(outboundMessage("/topic/game/7", "session-1", "sub-1"),
                mock(org.springframework.messaging.MessageChannel.class)));
    }

    @Test
    void notificationIsDroppedAfterUnsubscribeOrForAnotherGame() {
        interceptor.preSend(subscriptionMessage(StompCommand.SUBSCRIBE, "/topic/game/7", authentication,
                "session-1", "sub-1"), mock(org.springframework.messaging.MessageChannel.class));
        assertNull(interceptor.preSend(outboundMessage("/topic/game/9", "session-1", "sub-1"),
                mock(org.springframework.messaging.MessageChannel.class)));

        interceptor.preSend(subscriptionMessage(StompCommand.UNSUBSCRIBE, null, authentication,
                "session-1", "sub-1"), mock(org.springframework.messaging.MessageChannel.class));
        assertNull(interceptor.preSend(outboundMessage("/topic/game/7", "session-1", "sub-1"),
                mock(org.springframework.messaging.MessageChannel.class)));
    }

    @Test
    void missingHeadersAndRejectedDuplicateSubscriptionFailClosed() {
        interceptor.preSend(subscriptionMessage(StompCommand.SUBSCRIBE, "/topic/game/7", authentication,
                "session-1", "sub-1"), mock(org.springframework.messaging.MessageChannel.class));

        assertNull(interceptor.preSend(outboundMessage("/topic/game/7", null, null),
                mock(org.springframework.messaging.MessageChannel.class)));
        assertThrows(AccessDeniedException.class, () -> interceptor.preSend(
                subscriptionMessage(StompCommand.SUBSCRIBE, "/topic/game/not-a-number", authentication,
                        "session-1", "sub-1"), mock(org.springframework.messaging.MessageChannel.class)));
        assertNull(interceptor.preSend(outboundMessage("/topic/game/7", "session-1", "sub-1"),
                mock(org.springframework.messaging.MessageChannel.class)));
    }

    @Test
    void unsubscribeAndDisconnectPreserveOtherSubscriptionsAndSessions() {
        Message<?> sessionOneGameSeven = subscribe("session-1", "sub-1", 7);
        Message<?> sessionOneGameNine = subscribe("session-1", "sub-2", 9);
        Message<?> sessionTwoGameSeven = subscribe("session-2", "sub-1", 7);

        interceptor.preSend(subscriptionMessage(StompCommand.UNSUBSCRIBE, null, authentication,
                "session-1", "sub-1"), mock(org.springframework.messaging.MessageChannel.class));
        assertNull(interceptor.preSend(sessionOneGameSeven, mock(org.springframework.messaging.MessageChannel.class)));
        assertSame(sessionOneGameNine,
                interceptor.preSend(sessionOneGameNine, mock(org.springframework.messaging.MessageChannel.class)));
        assertSame(sessionTwoGameSeven,
                interceptor.preSend(sessionTwoGameSeven, mock(org.springframework.messaging.MessageChannel.class)));

        interceptor.preSend(subscriptionMessage(StompCommand.DISCONNECT, null, authentication,
                "session-1", null), mock(org.springframework.messaging.MessageChannel.class));
        assertNull(interceptor.preSend(sessionOneGameNine, mock(org.springframework.messaging.MessageChannel.class)));
        assertSame(sessionTwoGameSeven,
                interceptor.preSend(sessionTwoGameSeven, mock(org.springframework.messaging.MessageChannel.class)));
    }

    private Message<?> subscribe(String sessionId, String subscriptionId, int gameId) {
        interceptor.preSend(subscriptionMessage(StompCommand.SUBSCRIBE, "/topic/game/" + gameId, authentication,
                sessionId, subscriptionId), mock(org.springframework.messaging.MessageChannel.class));
        return outboundMessage("/topic/game/" + gameId, sessionId, subscriptionId);
    }

    private Message<byte[]> message(StompCommand command, String destination, Authentication actor) {
        return subscriptionMessage(command, destination, actor, null, null);
    }

    private Message<byte[]> subscriptionMessage(StompCommand command, String destination, Authentication actor,
                                                String sessionId, String subscriptionId) {
        StompHeaderAccessor headers = StompHeaderAccessor.create(command);
        if (destination != null) headers.setDestination(destination);
        if (actor != null) headers.setUser(actor);
        if (sessionId != null) headers.setSessionId(sessionId);
        if (subscriptionId != null) headers.setSubscriptionId(subscriptionId);
        headers.setLeaveMutable(true);
        return MessageBuilder.createMessage(new byte[0], headers.getMessageHeaders());
    }

    private Message<byte[]> outboundMessage(String destination, String sessionId, String subscriptionId) {
        SimpMessageHeaderAccessor headers = SimpMessageHeaderAccessor.create(SimpMessageType.MESSAGE);
        headers.setDestination(destination);
        headers.setSessionId(sessionId);
        headers.setSubscriptionId(subscriptionId);
        headers.setLeaveMutable(true);
        return MessageBuilder.createMessage(new byte[0], headers.getMessageHeaders());
    }
}
