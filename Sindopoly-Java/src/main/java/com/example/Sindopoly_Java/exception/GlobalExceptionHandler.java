package com.example.Sindopoly_Java.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.Map;

@ControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<Map<String, String>> handleUnauthenticated(AuthenticationException ex) {
        return ResponseEntity
                .status(401)
                .body(Map.of("error", "Authenticated player session required"));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Map<String, String>> handleForbidden(AccessDeniedException ex) {
        return ResponseEntity
                .status(403)
                .body(Map.of("error", "Request is not allowed"));
    }

    @ExceptionHandler(GameNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleNotFound(GameNotFoundException ex) {
        return ResponseEntity
                .status(404)
                .body(Map.of("error", "Game not found"));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Map<String, String>> handleUnknownRoute(NoResourceFoundException ex) {
        return ResponseEntity
                .status(404)
                .body(Map.of("error", "Resource not found"));
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<Map<String, String>> handleMethodNotAllowed(
            HttpRequestMethodNotSupportedException ex) {
        return ResponseEntity
                .status(405)
                .body(Map.of("error", "Method not allowed"));
    }

    @ExceptionHandler(GameStateConflictException.class)
    public ResponseEntity<Map<String, String>> handleConflict(GameStateConflictException ex) {
        return ResponseEntity
                .status(409)
                .body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(GameTransitionConflictException.class)
    public ResponseEntity<Map<String, Object>> handleTransitionConflict(GameTransitionConflictException ex) {
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("error", ex.getMessage());
        body.put("reason", ex.getReason());
        if (ex.getCurrentStateVersion() != null && ex.getCurrentStateVersion() >= 0) {
            body.put("stateVersion", ex.getCurrentStateVersion());
        }
        return ResponseEntity.status(409).body(body);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String,String>> handleBadRequest(IllegalArgumentException ex) {
        return ResponseEntity
               .badRequest()
               .body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String,String>> handleInvalidInternalState(IllegalStateException ex) {
        // IllegalStateException also represents corrupt Redis/database data; never echo that detail.
        log.warn("Request reached an invalid application state ({})", ex.getClass().getSimpleName());
        return ResponseEntity
                .badRequest()
                .body(Map.of("error", "Request cannot be completed in the current state"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String,String>> handleServerError(Exception ex) {
        // Exception messages can contain connection details or payload fragments; log only bounded type context.
        log.error("Unhandled exception caught by GlobalExceptionHandler (type={})", ex.getClass().getName());
        return ResponseEntity
               .status(500)
               .body(Map.of("error", "Internal server error"));
    }
}
