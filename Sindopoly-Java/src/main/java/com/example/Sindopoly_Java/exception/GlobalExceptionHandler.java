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

    @ExceptionHandler({
        IllegalArgumentException.class,
        IllegalStateException.class
    })
    public ResponseEntity<Map<String,String>> handleBadRequest(RuntimeException ex) {
        return ResponseEntity
               .badRequest()
               .body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String,String>> handleServerError(Exception ex) {
        log.error("Unhandled exception caught by GlobalExceptionHandler", ex);
        return ResponseEntity
               .status(500)
               .body(Map.of("error", "Internal server error"));
    }
}
