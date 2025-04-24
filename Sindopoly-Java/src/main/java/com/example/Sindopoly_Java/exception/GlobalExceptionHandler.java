package com.example.Sindopoly_Java.exception;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@ControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler({
        IllegalArgumentException.class,
        IllegalStateException.class            // NEW
    })
    public ResponseEntity<Map<String,String>> handleBadRequest(RuntimeException ex) {
        return ResponseEntity
               .badRequest()
               .body(Map.of("error", ex.getMessage()));
    }
}