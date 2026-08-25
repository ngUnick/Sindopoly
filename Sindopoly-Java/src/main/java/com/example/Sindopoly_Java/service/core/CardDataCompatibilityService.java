package com.example.Sindopoly_Java.service.core;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Applies bounded, idempotent corrections for known pre-migration card rows. */
@Component
public class CardDataCompatibilityService implements ApplicationRunner {

    static final String PAY_TWENTY_DESCRIPTION =
            "Πρέπει να αγοράσεις εξαρτήματα για εργαστήριο ηλεκτρονικής. Πλήρωσε $20.";

    private final JdbcTemplate jdbc;

    public CardDataCompatibilityService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(ApplicationArguments args) {
        correctKnownSignedAmount();
    }

    /** Corrects only the uniquely identified historical seed row; repeated runs are no-ops. */
    public int correctKnownSignedAmount() {
        return jdbc.update("""
                UPDATE card SET amount = -20
                WHERE type = 'money' AND amount = 20 AND title = 'Community Chest' AND description = ?
                """, PAY_TWENTY_DESCRIPTION);
    }
}
