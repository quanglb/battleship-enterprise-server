package com.frankint.battleship.api.dto;

import com.frankint.battleship.domain.model.GameState;

public record AdminGameDTO(
        String gameId,
        GameState state,
        String player1,
        String player2,
        String currentTurn,
        String winnerId,
        int p1Ships,
        int p2Ships
) {}
