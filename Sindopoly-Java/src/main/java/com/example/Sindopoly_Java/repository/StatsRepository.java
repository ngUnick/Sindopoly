package com.example.Sindopoly_Java.repository;

import com.example.Sindopoly_Java.model.Player;
import com.example.Sindopoly_Java.model.Stats;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface StatsRepository extends JpaRepository<Stats, Integer> {
    Optional<Stats> findByPlayer(Player player);

}
