package com.example.Sindopoly_Java.exception;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void internalStateDetailsAreNotReturnedToClients() {
        var response = handler.handleInvalidInternalState(
                new IllegalStateException("Stored command replay JSON contains internal payload details"));

        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(response.getBody()).containsEntry(
                "error", "Request cannot be completed in the current state");
        assertThat(response.getBody().toString()).doesNotContain("internal payload details");
    }

    @Test
    void unexpectedFailuresReturnOnlyTheStableGenericError() {
        var response = handler.handleServerError(
                new RuntimeException("internal infrastructure detail"));

        assertThat(response.getStatusCode().value()).isEqualTo(500);
        assertThat(response.getBody()).containsEntry("error", "Internal server error");
        assertThat(response.getBody().toString()).doesNotContain("infrastructure detail");
    }
}
