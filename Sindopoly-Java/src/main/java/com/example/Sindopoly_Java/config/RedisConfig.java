// src/main/java/com/example/Sindopoly_Java/config/RedisConfig.java
package com.example.Sindopoly_Java.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.serializer.StringRedisSerializer;

@Configuration
public class RedisConfig {
  @Bean
  @Primary
  public RedisTemplate<String,String> redisTemplate(RedisConnectionFactory cf) {
    RedisTemplate<String,String> tpl = new RedisTemplate<>();
    tpl.setConnectionFactory(cf);

    // Use plain String serialization for both keys and values
    StringRedisSerializer ser = new StringRedisSerializer();
    tpl.setKeySerializer(ser);
    tpl.setHashKeySerializer(ser);
    tpl.setValueSerializer(ser);
    tpl.setHashValueSerializer(ser);

    return tpl;
  }
}
