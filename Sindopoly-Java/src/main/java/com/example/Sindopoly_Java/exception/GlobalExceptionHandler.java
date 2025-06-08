package com.example.Sindopoly_Java.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@ControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler({
        IllegalArgumentException.class,
        IllegalStateException.class
    })
    public ResponseEntity<Map<String,String>> handleBadRequest(RuntimeException ex) {
        return ResponseEntity
               .badRequest()
               .body(Map.of("error", ex.getMessage()));
    }

    // NEW: Catch any other exception and return a 500
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String,String>> handleServerError(Exception ex) {
        log.error("Unhandled exception caught by GlobalExceptionHandler", ex);
        return ResponseEntity
               .status(500)
               .body(Map.of("error", "Internal server error"));
    }
}
