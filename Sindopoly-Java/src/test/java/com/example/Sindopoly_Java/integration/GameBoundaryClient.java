package com.example.Sindopoly_Java.integration;

import com.example.Sindopoly_Java.realtime.GameEventEnvelope;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpHeaders;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.sockjs.client.SockJsClient;
import org.springframework.web.socket.sockjs.client.WebSocketTransport;
import org.springframework.web.socket.messaging.WebSocketStompClient;

import java.lang.reflect.Type;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.HttpCookie;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;

/**
 * Drives the application through real TCP HTTP and STOMP-over-WebSocket boundaries.
 * Each instance owns an isolated cookie jar so tests cannot accidentally share identity.
 */
final class GameBoundaryClient implements AutoCloseable {
    private static final Duration HTTP_TIMEOUT = Duration.ofSeconds(10);
    private static final Duration ASYNC_TIMEOUT = Duration.ofSeconds(5);

    private final URI baseUri;
    private final ObjectMapper mapper;
    private final CookieManager cookies;
    private final HttpClient http;
    private final int playerId;
    private String csrfHeader;
    private String csrfToken;

    private GameBoundaryClient(URI baseUri, ObjectMapper mapper, CookieManager cookies,
                               HttpClient http, int playerId) {
        this.baseUri = baseUri;
        this.mapper = mapper;
        this.cookies = cookies;
        this.http = http;
        this.playerId = playerId;
    }

    static GameBoundaryClient create(URI baseUri, ObjectMapper mapper, String nickname) throws Exception {
        CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        HttpClient http = HttpClient.newBuilder().cookieHandler(cookies)
                .connectTimeout(HTTP_TIMEOUT).build();
        String body = mapper.writeValueAsString(java.util.Map.of("nickname", nickname));
        HttpResponse<String> response = http.send(HttpRequest.newBuilder(baseUri.resolve("/api/player-state/create"))
                        .timeout(HTTP_TIMEOUT).header(HttpHeaders.CONTENT_TYPE, "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(body)).build(),
                HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            throw new IllegalStateException("Player creation failed: " + response.statusCode() + " " + response.body());
        }
        GameBoundaryClient client = new GameBoundaryClient(
                baseUri, mapper, cookies, http, Integer.parseInt(response.body()));
        client.refreshCsrf();
        return client;
    }

    int playerId() {
        return playerId;
    }

    ApiResponse get(String path) throws Exception {
        return send("GET", path, null, null, null);
    }

    ApiResponse post(String path, String body, UUID commandId, long expectedVersion) throws Exception {
        return send("POST", path, body, commandId, expectedVersion);
    }

    RealtimeConnection connect() throws Exception {
        return connect("http://localhost:5173");
    }

    RealtimeConnection connect(String origin) throws Exception {
        SockJsClient sockJs = new SockJsClient(List.of(
                new WebSocketTransport(new StandardWebSocketClient())));
        WebSocketStompClient stomp = new WebSocketStompClient(sockJs);
        var converter = new org.springframework.messaging.converter.MappingJackson2MessageConverter();
        converter.setObjectMapper(mapper);
        stomp.setMessageConverter(converter);
        WebSocketHttpHeaders headers = new WebSocketHttpHeaders();
        headers.add(HttpHeaders.COOKIE, cookieHeader());
        headers.setOrigin(origin);
        CompletableFuture<StompSession> connected = new CompletableFuture<>();
        CompletableFuture<Throwable> failed = new CompletableFuture<>();
        StompSessionHandlerAdapter handler = new StompSessionHandlerAdapter() {
            @Override
            public void afterConnected(StompSession session, StompHeaders connectedHeaders) {
                connected.complete(session);
            }

            @Override
            public void handleException(StompSession session, StompCommand command, StompHeaders stompHeaders,
                                        byte[] payload, Throwable exception) {
                failed.complete(exception);
                connected.completeExceptionally(exception);
            }

            @Override
            public void handleTransportError(StompSession session, Throwable exception) {
                failed.complete(exception);
                connected.completeExceptionally(exception);
            }
        };
        stomp.connectAsync(baseUri.resolve("/ws"), headers, new StompHeaders(), handler);
        StompSession session = connected.get(ASYNC_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
        return new RealtimeConnection(stomp, session, failed);
    }

    private ApiResponse send(String method, String path, String body, UUID commandId,
                             Long expectedVersion) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(baseUri.resolve(path)).timeout(HTTP_TIMEOUT);
        if (commandId != null) {
            request.header("X-Sindopoly-Command-Id", commandId.toString());
            request.header("X-Sindopoly-Expected-Version", String.valueOf(expectedVersion));
        }
        if ("POST".equals(method)) {
            request.header(csrfHeader, csrfToken);
            if (body != null) request.header(HttpHeaders.CONTENT_TYPE, "application/json");
            request.POST(body == null ? HttpRequest.BodyPublishers.noBody()
                    : HttpRequest.BodyPublishers.ofString(body));
        } else {
            request.GET();
        }
        HttpResponse<String> response = http.send(request.build(), HttpResponse.BodyHandlers.ofString());
        JsonNode json = response.body().isBlank() ? mapper.nullNode() : mapper.readTree(response.body());
        return new ApiResponse(response.statusCode(), json, response.body());
    }

    private void refreshCsrf() throws Exception {
        ApiResponse response = get("/api/session/csrf");
        if (response.status() != 200) throw new IllegalStateException("CSRF bootstrap failed: " + response.raw());
        csrfHeader = response.json().path("headerName").asText();
        csrfToken = response.json().path("token").asText();
    }

    private String cookieHeader() {
        List<HttpCookie> available = cookies.getCookieStore().get(baseUri);
        return available.stream().map(cookie -> cookie.getName() + "=" + cookie.getValue())
                .collect(java.util.stream.Collectors.joining("; "));
    }

    @Override
    public void close() {
        // HttpClient has no closeable resources; WebSocket connections are owned by their wrappers.
    }

    record ApiResponse(int status, JsonNode json, String raw) { }

    static final class RealtimeConnection implements AutoCloseable {
        private final WebSocketStompClient client;
        private final StompSession session;
        private final CompletableFuture<Throwable> failure;
        private final BlockingQueue<GameEventEnvelope> events = new LinkedBlockingQueue<>();

        private RealtimeConnection(WebSocketStompClient client, StompSession session,
                                   CompletableFuture<Throwable> failure) {
            this.client = client;
            this.session = session;
            this.failure = failure;
        }

        void subscribe(String destination) {
            session.subscribe(destination, new StompFrameHandler() {
                @Override
                public Type getPayloadType(StompHeaders headers) {
                    return GameEventEnvelope.class;
                }

                @Override
                public void handleFrame(StompHeaders headers, Object payload) {
                    events.add((GameEventEnvelope) payload);
                }
            });
        }

        void subscribeUnchecked(String destination) {
            session.subscribe(destination, new StompFrameHandler() {
                @Override
                public Type getPayloadType(StompHeaders headers) {
                    return byte[].class;
                }

                @Override
                public void handleFrame(StompHeaders headers, Object payload) { }
            });
        }

        void send(String destination) {
            session.send(destination, new byte[0]);
        }

        GameEventEnvelope await(Predicate<GameEventEnvelope> expected) throws Exception {
            long deadline = System.nanoTime() + ASYNC_TIMEOUT.toNanos();
            while (System.nanoTime() < deadline) {
                if (failure.isDone()) {
                    throw new AssertionError("STOMP connection failed before the expected event", failure.getNow(null));
                }
                GameEventEnvelope event = events.poll(100, TimeUnit.MILLISECONDS);
                if (event != null && expected.test(event)) return event;
            }
            throw new AssertionError("Expected STOMP event was not received; queued=" + events);
        }

        boolean receivesAny(Duration duration) throws InterruptedException {
            return events.poll(duration.toMillis(), TimeUnit.MILLISECONDS) != null;
        }

        void clearEvents() {
            events.clear();
        }

        Throwable awaitFailure() throws Exception {
            return failure.get(ASYNC_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
        }

        boolean isConnected() {
            return session.isConnected();
        }

        @Override
        public void close() {
            if (session.isConnected()) session.disconnect();
            client.stop();
        }
    }
}
