package com.example.Sindopoly_Java.repository;

import com.example.Sindopoly_Java.model.Player;
import com.example.Sindopoly_Java.model.Stats;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.util.Optional;

public interface StatsRepository extends JpaRepository<Stats, Integer> {
    Optional<Stats> findByPlayer(Player player);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select stats from Stats stats where stats.player = :player")
    Optional<Stats> findForUpdateByPlayer(@Param("player") Player player);

}
