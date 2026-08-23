package com.example.Sindopoly_Java.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
public class WebSecurityConfig {

    @Bean
    SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    @Bean
    UserDetailsService noPasswordAuthentication() {
        // Sindopoly authenticates opaque player sessions, never generated basic credentials.
        return username -> {
            throw new UsernameNotFoundException("Password authentication is not supported");
        };
    }

    @Bean
    SecurityFilterChain apiSecurity(
            HttpSecurity http,
            SecurityContextRepository securityContextRepository) throws Exception {

        CookieCsrfTokenRepository csrfTokens = CookieCsrfTokenRepository.withHttpOnlyFalse();

        http
            .cors(Customizer.withDefaults())
            .csrf(csrf -> csrf
                    .csrfTokenRepository(csrfTokens)
                    // Identity creation cannot possess a session CSRF token yet.
                    .ignoringRequestMatchers("/api/player-state/create"))
            .securityContext(context -> context
                    .securityContextRepository(securityContextRepository)
                    .requireExplicitSave(true))
            .sessionManagement(session -> session
                    .sessionFixation(fixation -> fixation.changeSessionId()))
            .exceptionHandling(errors -> errors
                    .authenticationEntryPoint(authenticationEntryPoint())
                    .accessDeniedHandler(accessDeniedHandler()))
            .logout(logout -> logout
                    .logoutUrl("/api/session/logout")
                    .invalidateHttpSession(true)
                    .clearAuthentication(true)
                    .deleteCookies("JSESSIONID", "XSRF-TOKEN")
                    .logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT)))
            .authorizeHttpRequests(auth -> auth
                    .requestMatchers(HttpMethod.POST, "/api/player-state/create").permitAll()
                    .requestMatchers(HttpMethod.GET, "/api/game-state/public-lobby").permitAll()
                    .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                    .requestMatchers("/api/**", "/ws/**").authenticated()
                    .anyRequest().permitAll());

        return http.build();
    }

    private AuthenticationEntryPoint authenticationEntryPoint() {
        return (request, response, exception) -> {
            response.setStatus(HttpStatus.UNAUTHORIZED.value());
            response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"Authenticated player session required\"}");
        };
    }

    private AccessDeniedHandler accessDeniedHandler() {
        return (request, response, exception) -> {
            response.setStatus(HttpStatus.FORBIDDEN.value());
            response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"Request is not allowed\"}");
        };
    }

    /**
     * Global CORS rules.
     * Adjust origin(s) and paths to taste.
     */
    @Bean
    CorsConfigurationSource corsConfigurationSource(
            @Value("${sindopoly.web.allowed-origins}") List<String> allowedOrigins) {

        CorsConfiguration cfg = new CorsConfiguration();
        cfg.setAllowedOrigins(allowedOrigins);
        cfg.setAllowedMethods(List.of("GET","POST","PUT","DELETE","OPTIONS"));
        cfg.setAllowedHeaders(List.of("*"));
        cfg.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", cfg);
        return source;
    }
}
