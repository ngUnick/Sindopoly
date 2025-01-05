package com.example.Sindopoly_Java.repository;

import com.example.Sindopoly_Java.model.Game;
import com.example.Sindopoly_Java.model.Property;
import com.example.Sindopoly_Java.model.Square;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface SquareRepository extends JpaRepository<Square, Integer> {

    @Query("SELECT s FROM Square s WHERE s.game = :game AND s.position = :position")
    Square findByGameAndPosition(Game game, Integer position);

    @Query("SELECT s FROM Square s JOIN s.property p WHERE s.game.id = :gameId AND p.id = :propertyId")
    Square findByGameIdAndPropertyId(Integer gameId, Integer propertyId);

    @Query("SELECT s FROM Square s WHERE s.game.id = :gameId")
    List<Square> findSquaresByGameId(Integer gameId);
}
