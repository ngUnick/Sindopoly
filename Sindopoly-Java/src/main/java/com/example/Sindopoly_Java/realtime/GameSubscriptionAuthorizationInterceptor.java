package com.example.Sindopoly_Java.realtime;

import com.example.Sindopoly_Java.security.AuthenticatedPlayerResolver;
import com.example.Sindopoly_Java.security.GameAuthorizationService;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;

import java.security.Principal;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Enforces authenticated CONNECT and current membership for every game-topic subscription. */
@Component
public class GameSubscriptionAuthorizationInterceptor implements ChannelInterceptor {
    private static final Pattern GAME_TOPIC = Pattern.compile("^/topic/game/([1-9]\\d*)$");
    private final AuthenticatedPlayerResolver players;
    private final GameAuthorizationService games;
    private final Map<SubscriptionKey, AuthorizedSubscription> subscriptions = new ConcurrentHashMap<>();

    public GameSubscriptionAuthorizationInterceptor(AuthenticatedPlayerResolver players,
                                                     GameAuthorizationService games) {
        this.players = players;
        this.games = games;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor headers = StompHeaderAccessor.wrap(message);
        StompCommand command = headers.getCommand();
        if (command == StompCommand.MESSAGE
                || command == null && headers.getMessageType() == SimpMessageType.MESSAGE) {
            return authorizeOutbound(headers, message);
        }
        if (command == StompCommand.CONNECT) {
            requireActor(headers.getUser());
        } else if (command == StompCommand.SUBSCRIBE) {
            SubscriptionKey key = subscriptionKey(headers);
            // A reused STOMP subscription ID must fail closed while the new request is authorized.
            subscriptions.remove(key);
            Matcher match = GAME_TOPIC.matcher(String.valueOf(headers.getDestination()));
            if (!match.matches()) throw denied();
            int gameId = Integer.parseInt(match.group(1));
            int actorId = requireActor(headers.getUser());
            games.requireMember(gameId, actorId);
            // Broker MESSAGE frames do not reliably retain the authenticated Principal.
            // Preserve only the identity already authorized for this exact STOMP subscription.
            subscriptions.put(key, new AuthorizedSubscription(gameId, actorId));
        } else if (command == StompCommand.UNSUBSCRIBE) {
            removeSubscription(headers);
        } else if (command == StompCommand.DISCONNECT) {
            removeSession(headers.getSessionId());
        } else if (command == StompCommand.SEND) {
            throw denied();
        }
        return message;
    }

    private Message<?> authorizeOutbound(StompHeaderAccessor headers, Message<?> message) {
        Matcher match = GAME_TOPIC.matcher(String.valueOf(headers.getDestination()));
        if (!match.matches()) return null;
        SubscriptionKey key = subscriptionKeyOrNull(headers);
        if (key == null) return null;
        AuthorizedSubscription subscription = subscriptions.get(key);
        if (subscription == null || subscription.gameId() != Integer.parseInt(match.group(1))) return null;
        try {
            games.requireMember(subscription.gameId(), subscription.actorId());
            return message;
        } catch (RuntimeException exception) {
            // Membership may be revoked after SUBSCRIBE; do not leak later activity.
            return null;
        }
    }

    private SubscriptionKey subscriptionKey(StompHeaderAccessor headers) {
        SubscriptionKey key = subscriptionKeyOrNull(headers);
        if (key == null) throw denied();
        return key;
    }

    private SubscriptionKey subscriptionKeyOrNull(StompHeaderAccessor headers) {
        String sessionId = headers.getSessionId();
        String subscriptionId = headers.getSubscriptionId();
        return sessionId == null || subscriptionId == null ? null : new SubscriptionKey(sessionId, subscriptionId);
    }

    private void removeSubscription(StompHeaderAccessor headers) {
        SubscriptionKey key = subscriptionKeyOrNull(headers);
        if (key != null) subscriptions.remove(key);
    }

    private void removeSession(String sessionId) {
        if (sessionId != null) subscriptions.keySet().removeIf(key -> key.sessionId().equals(sessionId));
    }

    private int requireActor(Principal principal) {
        if (!(principal instanceof org.springframework.security.core.Authentication authentication)) throw denied();
        try {
            return players.requirePlayerId(authentication);
        } catch (RuntimeException exception) {
            throw denied();
        }
    }

    private AccessDeniedException denied() {
        return new AccessDeniedException("WebSocket destination is not allowed");
    }

    private record SubscriptionKey(String sessionId, String subscriptionId) { }

    private record AuthorizedSubscription(int gameId, int actorId) { }
}
