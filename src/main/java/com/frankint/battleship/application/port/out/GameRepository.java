package com.frankint.battleship.application.port.out;

import com.frankint.battleship.domain.model.Game;

import java.util.List;
import java.util.Optional;

public interface GameRepository {
    Game save(Game game);
    Optional<Game> findById(String gameId);
    void delete(String gameId);
    List<Game> findGamesByPlayer(String playerId);
    void hideGame(String gameId, String playerId);
    List<Game> findAll();
}
