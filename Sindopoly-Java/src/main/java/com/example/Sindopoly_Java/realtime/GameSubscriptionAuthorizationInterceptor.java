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
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Enforces authenticated CONNECT and current membership for every game-topic subscription. */
@Component
public class GameSubscriptionAuthorizationInterceptor implements ChannelInterceptor {
    private static final Pattern GAME_TOPIC = Pattern.compile("^/topic/game/([1-9]\\d*)$");
    private final AuthenticatedPlayerResolver players;
    private final GameAuthorizationService games;

    public GameSubscriptionAuthorizationInterceptor(AuthenticatedPlayerResolver players,
                                                     GameAuthorizationService games) {
        this.players = players;
        this.games = games;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor headers = StompHeaderAccessor.wrap(message);
        StompCommand command = headers.getCommand();
        if (command == null) {
            return headers.getMessageType() == SimpMessageType.MESSAGE
                    ? authorizeOutbound(headers, message) : message;
        }
        if (command == StompCommand.CONNECT) {
            requireActor(headers.getUser());
        } else if (command == StompCommand.SUBSCRIBE) {
            Matcher match = GAME_TOPIC.matcher(String.valueOf(headers.getDestination()));
            if (!match.matches()) throw denied();
            games.requireMember(Integer.parseInt(match.group(1)), requireActor(headers.getUser()));
        } else if (command == StompCommand.SEND) {
            throw denied();
        }
        return message;
    }

    private Message<?> authorizeOutbound(StompHeaderAccessor headers, Message<?> message) {
        Matcher match = GAME_TOPIC.matcher(String.valueOf(headers.getDestination()));
        if (!match.matches()) return null;
        try {
            games.requireMember(Integer.parseInt(match.group(1)), requireActor(headers.getUser()));
            return message;
        } catch (RuntimeException exception) {
            // Membership may be revoked after SUBSCRIBE; do not leak later activity.
            return null;
        }
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
}
