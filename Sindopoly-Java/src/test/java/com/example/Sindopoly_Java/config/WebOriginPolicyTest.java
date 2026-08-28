package com.example.Sindopoly_Java.config;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WebOriginPolicyTest {

    @Test
    void acceptsDistinctExplicitHttpOrigins() {
        assertThat(WebOriginPolicy.parse(
                "https://game.example, http://localhost:5173,https://game.example"))
                .containsExactly("https://game.example", "http://localhost:5173");
    }

    @Test
    void rejectsEmptyWildcardAndNonOriginValues() {
        assertThatThrownBy(() -> WebOriginPolicy.parse(" "))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> WebOriginPolicy.parse("*"))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> WebOriginPolicy.parse("https://game.example/path"))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> WebOriginPolicy.parse("https://game.example:99999"))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> WebOriginPolicy.parse("file:///tmp/client"))
                .isInstanceOf(IllegalStateException.class);
    }
}
