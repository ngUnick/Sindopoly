package com.example.Sindopoly_Java.service.core;

import com.example.Sindopoly_Java.model.Card;
import com.example.Sindopoly_Java.repository.CardRepository;
import org.springframework.data.redis.core.ListOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.Random;

@Service
public class CardService {

    private final CardRepository cardRepo;
    private final ListOperations<String, String> listOps;
    private final Random rnd = new Random();

    public CardService(CardRepository repo, RedisTemplate<String, String> redis) {
        this.cardRepo = repo;
        this.listOps  = redis.opsForList();
    }

    /** Draws and returns a Card for this game; shuffles when deck empty */
    public Card drawCard(int gameId) {
        String deckKey = "game:" + gameId + ":deck";

        // If deck empty, initialise & shuffle
        if (listOps.size(deckKey) == null || listOps.size(deckKey) == 0) {
            initialiseDeck(deckKey);
        }

        String cardIdStr = listOps.leftPop(deckKey);
        if (cardIdStr == null) throw new IllegalStateException("Deck unexpectedly empty");

        int cardId = Integer.parseInt(cardIdStr);
        Optional<Card> cardOpt = cardRepo.findById(cardId);
        return cardOpt.orElseThrow(() ->
                new IllegalStateException("Card " + cardId + " not found in DB"));
    }

    /* ----------------------------------------------------------- */
    private void initialiseDeck(String deckKey) {
        List<Integer> ids = cardRepo.findAll().stream()
                .map(Card::getId).toList();

        Collections.shuffle(ids, rnd);
        // store shuffled ids into Redis list
        ids.forEach(id -> listOps.rightPush(deckKey, String.valueOf(id)));
    }
}
