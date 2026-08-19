package com.example.Sindopoly_Java.service.core;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MovementServiceRuleTest {

    private final MovementService movement = new MovementService();

    @Test
    void movesForwardWithoutPassingStart() {
        MovementService.MovementResult result = movement.move(7, 5);

        assertEquals(12, result.newPosition());
        assertFalse(result.passedGo());
    }

    @Test
    void wrapsAcrossBoardEndAndRecordsPassingStart() {
        MovementService.MovementResult result = movement.move(38, 4);

        assertEquals(2, result.newPosition());
        assertTrue(result.passedGo());
    }

    @Test
    void landingExactlyOnStartCountsAsPassingStart() {
        MovementService.MovementResult result = movement.move(39, 1);

        assertEquals(0, result.newPosition());
        assertTrue(result.passedGo());
    }

    @Test
    void currentImplementationNormalizesPositionsAboveBoardSize() {
        MovementService.MovementResult result = movement.move(41, 6);

        assertEquals(7, result.newPosition());
        assertTrue(result.passedGo());
    }
}
