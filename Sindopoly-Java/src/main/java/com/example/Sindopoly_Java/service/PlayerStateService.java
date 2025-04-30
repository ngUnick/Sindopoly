package com.example.Sindopoly_Java.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import com.example.Sindopoly_Java.repository.PlayerRepository;
import com.example.Sindopoly_Java.utils.ValidationUtils;

import java.util.Map;

@Service
public class PlayerStateService {
    private static final String PLAYER_PREFIX = "player:";

    private final RedisTemplate<String, Object> redisTemplate;
    private final HashOperations<String, String, Object> hashOps;

    @Autowired
    private PlayerRepository playerRepo;
    @Autowired
    private ValidationUtils validationUtils;



    @Autowired
    public PlayerStateService(RedisTemplate<String, Object> redisTemplate) {
        this.redisTemplate = redisTemplate;
        this.hashOps = redisTemplate.opsForHash();
    }

    /**
     * Save Player State (Hash: player:PLAYER_ID)
     * Example fields: position, money, properties, jail, jailTime, bankrupt
     */
    public void savePlayerState(int playerId, Map<String, Object> playerData) {
        
        validationUtils.validatePlayerExists(playerId);

        String playerKey = PLAYER_PREFIX + playerId;
        hashOps.putAll(playerKey, playerData);
    }

    /**
     * Get Player State
     */
    public Map<String, Object> getPlayerState(int playerId) {
        String playerKey = PLAYER_PREFIX + playerId;
        Map<String, Object> result = hashOps.entries(playerKey);
        return result;
    }

    /**
     * Delete Player State
     */
    public void deletePlayer(int playerId) {
        String playerKey = PLAYER_PREFIX + playerId;
        redisTemplate.delete(playerKey);
    }

    /**
     * Pay to get out of jail
     */
    public void payToExitJail(int pid, int fee){
        Map<String,Object> p = getPlayerState(pid);
        int money = Integer.parseInt(p.get("money").toString());
        if(money < fee) throw new IllegalStateException("Insufficient funds");
    
        p.put("money", money-fee);
        p.put("jail", false);
        p.put("jailTime", 0);
        savePlayerState(pid,p);
    }
    
}
