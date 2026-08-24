package com.example.Sindopoly_Java.service.transition;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CommandContractTest {

    private final CommandMetadataResolver resolver = new CommandMetadataResolver();

    @Test
    void resolverRequiresBothHeadersAndCanonicalUuid() {
        assertThatThrownBy(() -> resolver.resolve(null, "0")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> resolver.resolve("not-a-uuid", "0")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> resolver.resolve("00000000-0000-0000-0000-000000000001", null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void creationAndExistingCommandsHaveDistinctVersionPreconditions() {
        CommandMetadata create = resolver.resolve("00000000-0000-0000-0000-000000000001", "-1");
        create.requireCreate();
        assertThatThrownBy(create::requireExistingGame).isInstanceOf(IllegalArgumentException.class);

        CommandMetadata existing = resolver.resolve("00000000-0000-0000-0000-000000000002", "0");
        existing.requireExistingGame();
        assertThatThrownBy(existing::requireCreate).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> resolver.resolve("00000000-0000-0000-0000-000000000003",
                "9007199254740991")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void fingerprintBindsActorTypeVersionAndPayload() {
        CommandMetadata metadata = new CommandMetadata("00000000-0000-0000-0000-000000000001", 7);
        String baseline = CommandFingerprint.create(1, "2", "ACTION", metadata, "yes=true");
        assertThat(CommandFingerprint.create(1, "2", "ACTION", metadata, "yes=true")).isEqualTo(baseline);
        assertThat(CommandFingerprint.create(1, "3", "ACTION", metadata, "yes=true")).isNotEqualTo(baseline);
        assertThat(CommandFingerprint.create(1, "2", "PASS", metadata, "yes=true")).isNotEqualTo(baseline);
        assertThat(CommandFingerprint.create(1, "2", "ACTION", metadata, "yes=false")).isNotEqualTo(baseline);
    }

    @Test
    void executionPublishesOnlyForFirstAppliedMutation() {
        var result = new com.fasterxml.jackson.databind.ObjectMapper().createObjectNode();
        assertThat(new TransitionExecution(TransitionExecution.Status.APPLIED, 1, result).shouldPublish()).isTrue();
        assertThat(new TransitionExecution(TransitionExecution.Status.REPLAY, 1, result).shouldPublish()).isFalse();
        assertThat(new TransitionExecution(TransitionExecution.Status.NO_OP, 1, result).shouldPublish()).isFalse();
    }

    @Test
    void noOpPlanCannotHideStateOrTtlMutationWithoutVersionAdvancement() {
        assertThatThrownBy(() -> GameTransitionPlan.transition().noOp().putGame("status", "unsafe").validate())
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> GameTransitionPlan.transition().noOp().lifecycleTtl(60).validate())
                .isInstanceOf(IllegalArgumentException.class);
        GameTransitionPlan.transition().noOp().validate();
    }
}
