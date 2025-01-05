package com.example.Sindopoly_Java.repository;

import com.example.Sindopoly_Java.model.PlayerProperty;
import com.example.Sindopoly_Java.model.PlayerPropertyId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface PlayerPropertyRepository extends JpaRepository<PlayerProperty, PlayerPropertyId> {

    @Query("SELECT pp FROM PlayerProperty pp WHERE pp.playerObj.id = :playerId AND pp.gameObj.id = :gameId")
    List<PlayerProperty> findByPlayerAndGame(Integer playerId, Integer gameId);

    @Query("SELECT pp FROM PlayerProperty pp WHERE pp.property = :propertyId AND pp.game = :gameId")
    PlayerProperty findByPropertyAndGame(Integer propertyId, Integer gameId);
}
