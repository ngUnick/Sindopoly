package com.example.Sindopoly_Java.service.transition;

/** Test seam for proving marker and all Stats updates share one transaction. */
@FunctionalInterface
public interface FinalizationFailureProbe {
    void afterPlayerUpdate(int updatedPlayers);
}
