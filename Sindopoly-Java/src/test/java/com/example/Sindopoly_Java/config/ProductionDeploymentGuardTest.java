package com.example.Sindopoly_Java.config;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ProductionDeploymentGuardTest {

    @Test
    void acceptsExternalSecretsTlsAndHttpsOrigins() {
        WebOriginPolicy origins = new WebOriginPolicy("https://game.example");

        assertThatCode(() -> new ProductionDeploymentGuard(
                origins, "jdbc:mariadb://db/sindopoly", "db-user", "db-password",
                "redis.internal", "redis-password", true))
                .doesNotThrowAnyException();
    }

    @Test
    void rejectsMissingSecretsDisabledRedisTlsAndHttpOrigins() {
        WebOriginPolicy https = new WebOriginPolicy("https://game.example");
        WebOriginPolicy http = new WebOriginPolicy("http://game.example");

        assertThatThrownBy(() -> new ProductionDeploymentGuard(
                https, "jdbc:mariadb://db/sindopoly", "db-user", " ",
                "redis.internal", "redis-password", true))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new ProductionDeploymentGuard(
                https, "jdbc:mariadb://db/sindopoly", "db-user", "db-password",
                "redis.internal", "redis-password", false))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new ProductionDeploymentGuard(
                http, "jdbc:mariadb://db/sindopoly", "db-user", "db-password",
                "redis.internal", "redis-password", true))
                .isInstanceOf(IllegalStateException.class);
    }
}
