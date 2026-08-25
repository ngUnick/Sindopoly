package com.example.Sindopoly_Java.config;

import com.example.Sindopoly_Java.service.transition.FinalizationFailureProbe;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class FinalizationConfiguration {
    @Bean
    public FinalizationFailureProbe finalizationFailureProbe() {
        return ignored -> { };
    }
}
