package com.example.Sindopoly_Java.repository;

import com.example.Sindopoly_Java.model.Card;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface CardRepository extends JpaRepository<Card, Integer> {

    // Get random card
    @Query(value = "SELECT * FROM Card ORDER BY RAND() LIMIT 1", nativeQuery = true)
    Card findRandomCard();
}
