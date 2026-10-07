package com.frankint.battleship.application.adapter.persistence;

import com.frankint.battleship.application.port.out.GameRepository;
import com.frankint.battleship.domain.model.Game;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Adapter for storing games in memory.
 * Useful for testing and early development phases.
 */
@Repository
public class InMemoryGameRepository implements GameRepository {

    // ConcurrentHashMap is crucial here for thread safety in a multiplayer environment
    private final Map<String, Game> store = new ConcurrentHashMap<>();

    @Override
    public Game save(Game game) {
        store.put(game.getId(), game);
        return game;
    }

    @Override
    public Optional<Game> findById(String gameId) {
        return Optional.ofNullable(store.get(gameId));
    }

    @Override
    public void delete(String gameId) {
        store.remove(gameId);
    }

    @Override
    public List<Game> findGamesByPlayer(String playerId) {
        return store.values().stream()
                .filter(game -> isPlayerInGame(game, playerId))
                .toList();
    }

    @Override
    public void hideGame(String gameId, String playerId) {

    }

    @Override
    public List<Game> findAll() {
        return List.copyOf(store.values());
    }

    private boolean isPlayerInGame(Game game, String playerId) {
        boolean isP1 = game.getPlayer1() != null && game.getPlayer1().getId().equals(playerId);
        boolean isP2 = game.getPlayer2() != null && game.getPlayer2().getId().equals(playerId);
        return isP1 || isP2;
    }
}