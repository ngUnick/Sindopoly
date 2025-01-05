package com.example.Sindopoly_Java.repository;

import com.example.Sindopoly_Java.model.Property;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PropertyRepository extends JpaRepository<Property, Integer> {
}
