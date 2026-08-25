package com.example.Sindopoly_Java.service.transition;

import com.example.Sindopoly_Java.exception.GameTransitionConflictException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.Optional;

/**
 * The sole compare-and-commit boundary for active game mutations. The script
 * checks replay identity before version freshness and validates its complete,
 * server-built plan before the first Redis write.
 */
@Repository
public class RedisGameTransitionStore {

    private static final int MAX_COMMAND_RECORDS = 4096;
    private static final long MAX_EXPECTED_STATE_VERSION = 9_007_199_254_740_990L;
    private static final DefaultRedisScript<List> COMMIT_SCRIPT = new DefaultRedisScript<>("""
            local function keyType(key)
              local response = redis.call('TYPE', key)
              return type(response) == 'table' and response.ok or response
            end
            local function hasType(key, expectedType)
              local actual = keyType(key)
              return actual == 'none' or actual == expectedType
            end

            if #KEYS < 4 then return redis.error_reply('invalid transition key count') end
            local game = KEYS[1]
            local members = KEYS[2]
            local commands = KEYS[3]
            local deck = KEYS[4]
            local commandId = ARGV[1]
            local fingerprint = ARGV[2]
            local expectedRaw = ARGV[3]
            local replayJson = ARGV[4]
            local plan = cjson.decode(ARGV[5])
            local maxRecords = tonumber(ARGV[6])
            local maxVersion = tonumber(ARGV[7])
            local record = cjson.decode(replayJson)

            if type(commandId) ~= 'string' or type(fingerprint) ~= 'string'
               or type(plan) ~= 'table' or type(record) ~= 'table'
               or type(record.fingerprint) ~= 'string'
               or type(record.resultJson) ~= 'string'
               or type(maxRecords) ~= 'number' or maxRecords <= 0 or maxRecords % 1 ~= 0
               or type(maxVersion) ~= 'number' or maxVersion <= 0 then
              return redis.error_reply('invalid transition arguments')
            end
            local expected
            if expectedRaw == '-1' then
              expected = -1
            elseif string.match(expectedRaw, '^%d+$') then
              expected = tonumber(expectedRaw)
            end
            if expected == nil or expected > maxVersion then
              return redis.error_reply('invalid expected state version')
            end

            -- Redis scripts are not rollback transactions. Prove every key type
            -- before any HSET/SADD/RPUSH can make an earlier write observable.
            if not hasType(game, 'hash') then return redis.error_reply('game key has wrong type') end
            if not hasType(members, 'set') then return redis.error_reply('membership key has wrong type') end
            if not hasType(commands, 'hash') then return redis.error_reply('commands key has wrong type') end
            if not hasType(deck, 'list') then return redis.error_reply('deck key has wrong type') end
            for index = 5, #KEYS do
              if not hasType(KEYS[index], 'hash') then return redis.error_reply('player key has wrong type') end
            end

            local exists = redis.call('EXISTS', game) == 1
            local old = redis.call('HGET', commands, commandId)
            if old then
              local replay = cjson.decode(old)
              if type(replay) ~= 'table' or type(replay.fingerprint) ~= 'string'
                 or replay.stateVersion == nil
                 or (type(replay.resultJson) ~= 'string' and replay.result == nil) then
                return redis.error_reply('stored replay record is invalid')
              elseif replay.fingerprint ~= fingerprint then
                return {'REUSE_MISMATCH', tostring(replay.stateVersion), ''}
              elseif plan.bootstrap and not exists then
                return {'STALE', '-1', ''}
              end
              local exactResult = replay.resultJson
              if exactResult == nil then exactResult = cjson.encode(replay.result) end
              return {'REPLAY', tostring(replay.stateVersion), exactResult}
            end

            local current = -1
            if exists then
              local currentRaw = redis.call('HGET', game, 'stateVersion') or '0'
              if not string.match(currentRaw, '^%d+$') then
                return redis.error_reply('invalid stored state version')
              end
              current = tonumber(currentRaw)
              if current == nil or current > maxVersion then
                return redis.error_reply('invalid stored state version')
              end
            end
            if plan.bootstrap then
              if exists or expected ~= -1 then
                return {'STALE', tostring(current), ''}
              end
            elseif (not exists) or expected ~= current then
              return {'STALE', tostring(current), ''}
            end

            if type(plan.bootstrap) ~= 'boolean' or type(plan.stateChanging) ~= 'boolean'
               or type(plan.deleteGame) ~= 'boolean'
               or type(plan.gamePuts) ~= 'table' or type(plan.gameDeletes) ~= 'table'
               or type(plan.memberAdds) ~= 'table' or type(plan.memberRemoves) ~= 'table'
               or type(plan.playerPuts) ~= 'table' or type(plan.playerDeletes) ~= 'table'
               or type(plan.playerTtls) ~= 'table' then
              return redis.error_reply('invalid transition plan')
            end
            if plan.ttl ~= cjson.null and (type(plan.ttl) ~= 'number' or plan.ttl <= 0 or plan.ttl % 1 ~= 0) then
              return redis.error_reply('invalid lifecycle TTL')
            end
            for field, value in pairs(plan.gamePuts) do
              if type(field) ~= 'string' or type(value) ~= 'string' then
                return redis.error_reply('invalid game mutation')
              end
            end
            for index, field in ipairs(plan.gameDeletes) do
              if type(field) ~= 'string' then return redis.error_reply('invalid game field delete') end
            end
            for index, value in ipairs(plan.memberAdds) do
              if type(value) ~= 'string' then return redis.error_reply('invalid member add') end
            end
            for index, value in ipairs(plan.memberRemoves) do
              if type(value) ~= 'string' then return redis.error_reply('invalid member remove') end
            end
            for index, mutation in ipairs(plan.playerPuts) do
              if type(mutation.keyIndex) ~= 'number' or mutation.keyIndex % 1 ~= 0
                 or mutation.keyIndex < 5 or not KEYS[mutation.keyIndex]
                 or type(mutation.values) ~= 'table' then
                return redis.error_reply('invalid player mutation key')
              end
              for field, value in pairs(mutation.values) do
                if type(field) ~= 'string' or type(value) ~= 'string' then
                  return redis.error_reply('invalid player mutation')
                end
              end
            end
            for index, mutation in ipairs(plan.playerDeletes) do
              if type(mutation.keyIndex) ~= 'number' or mutation.keyIndex % 1 ~= 0
                 or mutation.keyIndex < 5 or not KEYS[mutation.keyIndex] then
                return redis.error_reply('invalid player delete key')
              end
            end
            if plan.deckReplacement ~= cjson.null then
              for index, value in ipairs(plan.deckReplacement) do
                if type(value) ~= 'string' then return redis.error_reply('invalid deck value') end
              end
            end
            for index, item in ipairs(plan.playerTtls) do
              if type(item.keyIndex) ~= 'number' or item.keyIndex % 1 ~= 0
                 or item.keyIndex < 5 or not KEYS[item.keyIndex]
                 or type(item.ttl) ~= 'number' or item.ttl <= 0 or item.ttl % 1 ~= 0 then
                return redis.error_reply('invalid player TTL')
              end
            end
            if not plan.stateChanging and (plan.deleteGame or next(plan.gamePuts) ~= nil
               or #plan.gameDeletes > 0 or #plan.memberAdds > 0 or #plan.memberRemoves > 0
               or #plan.playerPuts > 0 or #plan.playerDeletes > 0
               or plan.deckReplacement ~= cjson.null or plan.ttl ~= cjson.null
               or #plan.playerTtls > 0) then
              return redis.error_reply('no-op plan contains mutations')
            end

            -- Retaining every accepted ID for the active game lifetime preserves
            -- replay and collision guarantees. Once full, fail closed rather
            -- than evicting an ID that could still be retried at this version.
            if redis.call('HLEN', commands) >= maxRecords then
              return {'COMMAND_LIMIT', tostring(current), ''}
            end

            local nextVersion = current
            if plan.bootstrap then nextVersion = 0
            elseif plan.stateChanging then
              if current >= maxVersion then return redis.error_reply('state version exhausted') end
              nextVersion = current + 1
            end

            if plan.deleteGame then
              redis.call('DEL', game, members, deck)
            else
              for field, value in pairs(plan.gamePuts) do redis.call('HSET', game, field, value) end
              for index, field in ipairs(plan.gameDeletes) do redis.call('HDEL', game, field) end
              if plan.bootstrap or plan.stateChanging then
                redis.call('HSET', game, 'stateVersion', tostring(nextVersion))
              end
              for index, value in ipairs(plan.memberAdds) do redis.call('SADD', members, value) end
              for index, value in ipairs(plan.memberRemoves) do redis.call('SREM', members, value) end
              if plan.deckReplacement ~= cjson.null then
                redis.call('DEL', deck)
                for index, value in ipairs(plan.deckReplacement) do redis.call('RPUSH', deck, value) end
              end
            end
            for index, mutation in ipairs(plan.playerPuts) do
              local key = KEYS[mutation.keyIndex]
              for field, value in pairs(mutation.values) do redis.call('HSET', key, field, value) end
            end
            for index, mutation in ipairs(plan.playerDeletes) do redis.call('DEL', KEYS[mutation.keyIndex]) end

            record.stateVersion = nextVersion
            redis.call('HSET', commands, commandId, cjson.encode(record))
            if plan.ttl ~= cjson.null then
              if not plan.deleteGame then
                redis.call('EXPIRE', game, plan.ttl)
                redis.call('EXPIRE', members, plan.ttl)
                if redis.call('EXISTS', deck) == 1 then redis.call('EXPIRE', deck, plan.ttl) end
              end
              redis.call('EXPIRE', commands, plan.ttl)
            else
              local gameTtl = redis.call('TTL', game)
              if gameTtl > 0 then
                if redis.call('TTL', commands) < 0 then redis.call('EXPIRE', commands, gameTtl) end
                if redis.call('EXISTS', deck) == 1 and redis.call('TTL', deck) < 0 then
                  redis.call('EXPIRE', deck, gameTtl)
                end
              end
            end
            for index, item in ipairs(plan.playerTtls) do
              redis.call('EXPIRE', KEYS[item.keyIndex], item.ttl)
            end
            return {plan.stateChanging and 'APPLIED' or 'NO_OP', tostring(nextVersion), record.resultJson}
            """, List.class);

    private final RedisTemplate<String, String> redis;
    private final ObjectMapper mapper;

    public RedisGameTransitionStore(RedisTemplate<String, String> redis, ObjectMapper mapper) {
        this.redis = redis;
        this.mapper = mapper;
    }

    public GameSnapshot load(int gameId) {
        Map<Object, Object> rawGame = redis.opsForHash().entries(RedisGameKeys.game(gameId));
        Map<String, String> game = stringMap(rawGame);
        Set<String> members = redis.opsForSet().members(RedisGameKeys.members(gameId));
        Map<Integer, Map<String, String>> players = new LinkedHashMap<>();
        if (members != null) {
            for (String member : members) {
                int playerId = Integer.parseInt(member);
                players.put(playerId, stringMap(redis.opsForHash().entries(RedisGameKeys.player(playerId))));
            }
        }
        List<String> deck = redis.opsForList().range(RedisGameKeys.deck(gameId), 0, -1);
        return new GameSnapshot(gameId, Map.copyOf(game), members == null ? Set.of() : Set.copyOf(members),
                Map.copyOf(players), deck == null ? List.of() : List.copyOf(deck));
    }

    /** Fast replay check used before nondeterministic command calculation such as dice. */
    public Optional<TransitionExecution> replayIfPresent(int gameId, CommandMetadata metadata, String fingerprint) {
        Object raw = redis.opsForHash().get(RedisGameKeys.commands(gameId), metadata.commandId());
        if (raw == null) return Optional.empty();
        try {
            CommandReplayRecord record = mapper.readValue(raw.toString(), CommandReplayRecord.class);
            if (!fingerprint.equals(record.fingerprint())) {
                throw new GameTransitionConflictException("COMMAND_ID_REUSE",
                        "Command ID was already used for a different intent", record.stateVersion());
            }
            return Optional.of(new TransitionExecution(TransitionExecution.Status.REPLAY,
                    record.stateVersion(), record.semanticResult(mapper)));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Stored command replay record is malformed", exception);
        }
    }

    public TransitionExecution commit(
            int gameId,
            CommandMetadata metadata,
            String fingerprint,
            GameTransitionPlan plan,
            JsonNode semanticResult) {
        plan.validate();
        List<String> keys = new ArrayList<>(List.of(
                RedisGameKeys.game(gameId), RedisGameKeys.members(gameId),
                RedisGameKeys.commands(gameId), RedisGameKeys.deck(gameId)));
        Map<Integer, Integer> playerKeyIndexes = new LinkedHashMap<>();
        plan.playerPuts().keySet().forEach(id -> addPlayerKey(keys, playerKeyIndexes, id));
        plan.playerDeletes().forEach(id -> addPlayerKey(keys, playerKeyIndexes, id));
        plan.playerTtlSeconds().keySet().forEach(id -> addPlayerKey(keys, playerKeyIndexes, id));

        Map<String, Object> scriptPlan = scriptPlan(plan, playerKeyIndexes);
        Map<String, Object> replay;
        try {
            // Store the semantic result as exact JSON text so Redis Lua cannot turn
            // an empty JSON array into an empty object during cjson decode/encode.
            replay = Map.of("fingerprint", fingerprint, "resultJson", mapper.writeValueAsString(semanticResult));
            @SuppressWarnings("unchecked")
            List<String> response = (List<String>) redis.execute(COMMIT_SCRIPT, keys,
                    metadata.commandId(), fingerprint, String.valueOf(metadata.expectedStateVersion()),
                    mapper.writeValueAsString(replay), mapper.writeValueAsString(scriptPlan),
                    String.valueOf(MAX_COMMAND_RECORDS), String.valueOf(MAX_EXPECTED_STATE_VERSION));
            if (response == null || response.size() < 3) {
                throw new IllegalStateException("Redis transition returned no result");
            }
            long version = Long.parseLong(response.get(1));
            return switch (response.get(0)) {
                case "APPLIED" -> new TransitionExecution(TransitionExecution.Status.APPLIED, version,
                        mapper.readTree(response.get(2)));
                case "NO_OP" -> new TransitionExecution(TransitionExecution.Status.NO_OP, version,
                        mapper.readTree(response.get(2)));
                case "REPLAY" -> new TransitionExecution(TransitionExecution.Status.REPLAY, version,
                        mapper.readTree(response.get(2)));
                case "REUSE_MISMATCH" -> throw new GameTransitionConflictException("COMMAND_ID_REUSE",
                        "Command ID was already used for a different intent", version);
                case "COMMAND_LIMIT" -> throw new GameTransitionConflictException("COMMAND_CAPACITY",
                        "The active game's command retry capacity is exhausted", version);
                case "STALE" -> throw new GameTransitionConflictException("STALE_STATE",
                        version < 0 ? "Game does not exist" : "Expected state version is stale", version);
                default -> throw new IllegalStateException("Unknown Redis transition result");
            };
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not encode transition", exception);
        }
    }

    private void addPlayerKey(List<String> keys, Map<Integer, Integer> indexes, int playerId) {
        indexes.computeIfAbsent(playerId, ignored -> {
            keys.add(RedisGameKeys.player(playerId));
            return keys.size(); // Lua KEYS uses one-based indexes.
        });
    }

    private Map<String, Object> scriptPlan(GameTransitionPlan plan, Map<Integer, Integer> indexes) {
        List<Map<String, Object>> puts = plan.playerPuts().entrySet().stream()
                .map(entry -> Map.<String, Object>of("keyIndex", indexes.get(entry.getKey()), "values", entry.getValue()))
                .toList();
        List<Map<String, Object>> deletes = plan.playerDeletes().stream()
                .map(id -> Map.<String, Object>of("keyIndex", indexes.get(id))).toList();
        List<Map<String, Object>> ttls = plan.playerTtlSeconds().entrySet().stream()
                .map(entry -> Map.<String, Object>of("keyIndex", indexes.get(entry.getKey()), "ttl", entry.getValue()))
                .toList();
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("bootstrap", plan.bootstrapFlag());
        value.put("stateChanging", plan.stateChanging());
        value.put("deleteGame", plan.deleteGame());
        value.put("gamePuts", plan.gamePuts());
        value.put("gameDeletes", plan.gameDeletes());
        value.put("memberAdds", plan.memberAdds().stream().map(String::valueOf).toList());
        value.put("memberRemoves", plan.memberRemoves().stream().map(String::valueOf).toList());
        value.put("playerPuts", puts);
        value.put("playerDeletes", deletes);
        value.put("deckReplacement", plan.deckReplacement());
        value.put("ttl", plan.lifecycleTtlSeconds());
        value.put("playerTtls", ttls);
        return value;
    }

    private Map<String, String> stringMap(Map<Object, Object> source) {
        Map<String, String> result = new LinkedHashMap<>();
        source.forEach((key, value) -> result.put(String.valueOf(key), String.valueOf(value)));
        return result;
    }
}
