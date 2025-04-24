package com.example.Sindopoly_Java.repository;

import com.example.Sindopoly_Java.model.Square;
import com.example.Sindopoly_Java.model.Square.SquareType;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SquareRepository extends JpaRepository<Square, Integer> {
    @Query("SELECT s.id FROM Square s WHERE s.type = :type")
    List<Integer> findIdsByColour(@Param("type") SquareType type);
}
