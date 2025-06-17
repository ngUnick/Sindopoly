package com.example.Sindopoly_Java.repository;

import com.example.Sindopoly_Java.model.Card;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CardRepository extends JpaRepository<Card, Integer> {}