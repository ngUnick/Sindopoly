package com.example.Sindopoly_Java.repository;

import com.example.Sindopoly_Java.model.Player;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlayerRepository extends JpaRepository<Player, Integer> {
    // Additional query methods if needed
}
