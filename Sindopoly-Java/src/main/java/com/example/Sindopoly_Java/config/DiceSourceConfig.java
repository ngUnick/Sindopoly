package com.example.Sindopoly_Java.config;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.example.Sindopoly_Java.service.random.RandomIntGenerator;


@Configuration
public class DiceSourceConfig {

    @Bean
    public RandomIntGenerator randomIntGenerator(
            @Qualifier("secureRng") RandomIntGenerator secureRng,
            @Qualifier("randomOrgRng") RandomIntGenerator randomOrgRng,
            @Value("${dice.source:secure}") String source
    ) {
        return source.equalsIgnoreCase("randomorg") ? randomOrgRng : secureRng;
    }
}

