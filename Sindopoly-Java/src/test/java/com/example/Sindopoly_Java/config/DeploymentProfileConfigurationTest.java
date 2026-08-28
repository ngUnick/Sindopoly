package com.example.Sindopoly_Java.config;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;

class DeploymentProfileConfigurationTest {

    @Test
    void productionRequiresExternalCredentialsOriginsAndSecureCookies() throws IOException {
        Properties production = load("application-prod.properties");

        assertThat(production.getProperty("spring.datasource.url")).isEqualTo("${SINDOPOLY_DB_URL}");
        assertThat(production.getProperty("spring.datasource.username")).isEqualTo("${SINDOPOLY_DB_USERNAME}");
        assertThat(production.getProperty("spring.datasource.password")).isEqualTo("${SINDOPOLY_DB_PASSWORD}");
        assertThat(production.getProperty("spring.data.redis.host")).isEqualTo("${SINDOPOLY_REDIS_HOST}");
        assertThat(production.getProperty("spring.data.redis.password")).isEqualTo("${SINDOPOLY_REDIS_PASSWORD}");
        assertThat(production.getProperty("sindopoly.web.allowed-origins"))
                .isEqualTo("${SINDOPOLY_ALLOWED_ORIGINS}");
        assertThat(production.getProperty("server.servlet.session.cookie.secure")).isEqualTo("true");
        assertThat(production.getProperty("springdoc.api-docs.enabled")).isEqualTo("${SINDOPOLY_OPENAPI_ENABLED:false}");
    }

    @Test
    void developmentDefaultsAreExplicitlyLocalOnly() throws IOException {
        Properties development = load("application-dev.properties");

        assertThat(development.getProperty("spring.datasource.url")).contains("localhost");
        assertThat(development.getProperty("spring.data.redis.host")).contains("127.0.0.1");
        assertThat(development.getProperty("server.servlet.session.cookie.secure")).isEqualTo("false");
        assertThat(development.getProperty("sindopoly.web.allowed-origins")).doesNotContain("*");
    }

    private Properties load(String resource) throws IOException {
        Properties properties = new Properties();
        try (InputStream input = getClass().getClassLoader().getResourceAsStream(resource)) {
            assertThat(input).as(resource).isNotNull();
            properties.load(input);
        }
        return properties;
    }
}
