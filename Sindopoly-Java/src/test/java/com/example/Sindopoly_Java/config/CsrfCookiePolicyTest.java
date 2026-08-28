package com.example.Sindopoly_Java.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.DefaultCsrfToken;

import static org.assertj.core.api.Assertions.assertThat;

class CsrfCookiePolicyTest {

    @Test
    void defaultCookieRepositoryProducesAnHttpOnlyTokenCookie() {
        CookieCsrfTokenRepository repository = new WebSecurityConfig().csrfTokenRepository();
        MockHttpServletResponse response = new MockHttpServletResponse();

        repository.saveToken(
                new DefaultCsrfToken("X-XSRF-TOKEN", "_csrf", "bounded-test-token"),
                new MockHttpServletRequest(),
                response);

        assertThat(response.getHeader("Set-Cookie"))
                .contains("XSRF-TOKEN=")
                .contains("HttpOnly");
    }
}
